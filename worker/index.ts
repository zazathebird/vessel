/**
 * The Vessel Worker.
 *
 * Two jobs, in this order of importance:
 *
 * 1. **Serve the site.** Everything that is not `/api/*` goes to the static
 *    assets binding, which serves `dist/` and falls back to the app shell so
 *    the nine client-routed URLs work. If every route below were deleted, the
 *    site would serve exactly as it does today. That is deliberate — accounts
 *    are strictly additive and nothing that works now may acquire a dependency
 *    on a network call (SPEC-ACCOUNTS.md §11).
 *
 * 2. **Serve the account API**, under `/api/`. Signed-out visitors never touch
 *    it.
 */

import * as accounts from "./accounts";
import * as admin from "./admin";
import * as machines from "./machines";
import * as downloads from "./downloads";
import * as pages from "./downloadPages";
import * as passkeys from "./passkeys";
import * as setups from "./setups";
import { clientKey } from "./crypto";
import { BadRequest, readBounded } from "./encoding";
import type { Env } from "./env";
import { RateLimiter } from "./rate-limit";
import { MachineSignal } from "./signal";
import { publishSiteConfig, readSiteConfig, withSiteConfig } from "./site-config";
import { crawlerFile, withPageMeta } from "./page-meta";

export { MachineSignal, RateLimiter };
export type { Env };

/**
 * **The http→https redirect belongs in Cloudflare, not here, and this note is
 * why.**
 *
 * A Workers route matches *both* schemes, so `http://mcclevarty.ca/` answers
 * with a plain 200 over cleartext — which is what a browser means by "Not
 * secure". The obvious fix is to redirect in this file. It was written, and it
 * was wrong in a way worth recording rather than rediscovering:
 *
 *     const secure = new URL(url.toString());
 *     secure.protocol = "https:";      // silently does nothing in workerd
 *
 * The `URL.protocol` setter did not take. The redirect therefore returned
 * `Location:` equal to the request URL, which is an infinite redirect loop —
 * observed locally as `redirect count exceeded`. Deployed, that would have taken
 * the **entire site** down for every cleartext visitor, and if the Worker ever
 * sees `http:` for a request that actually arrived over TLS, for everyone.
 *
 * So the URL is built by concatenation, and — because being wrong here costs the
 * whole site rather than one page — the result is **compared against the request
 * URL and only sent if it actually differs**. That guard is what makes a loop
 * structurally impossible rather than merely unlikely: whatever a future runtime
 * does to URL parsing, a redirect to oneself is never emitted.
 *
 * Cloudflare's zone setting (SSL/TLS → Edge Certificates → **Always Use HTTPS**)
 * does the same job at the edge without costing a Worker invocation, and turning
 * it on as well is worth doing. This is here so the guarantee lives in the
 * repository too.
 *
 * **The session cookie is already `Secure`** (`worker/session.ts`), so signing in
 * over http never worked — the cookie would be set and never sent back. The bug
 * was that the *site* loaded at all, which trains people onto a URL that cannot
 * sign in and shows a browser warning on a page asking for a password.
 */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Null when no redirect should happen — wrong scheme, loopback, or a target that
 * would equal the request. The caller treats null as "carry on".
 */
function httpsRedirect(request: Request, url: URL): Response | null {
  if (url.protocol !== "http:") return null;
  // `wrangler dev` serves plain http on loopback, and `npm run test:auth` drives
  // it. Browsers already treat localhost as a secure context.
  if (isLoopback(url.hostname)) return null;

  const target = `https://${url.host}${url.pathname}${url.search}`;
  if (target === request.url) return null;

  return new Response(null, {
    status: 301,
    headers: { location: target, "strict-transport-security": HSTS },
  });
}

/**
 * Two years, subdomains included. Not preloaded — preload is a one-way door that
 * needs a deliberate submission, and the apex is what matters here.
 */
const HSTS = "max-age=63072000; includeSubDomains";

/**
 * Refuse a state-changing request whose `Origin` is not ours.
 *
 * **This is defence in depth, not the defence.** `SameSite=Lax` on the session
 * cookie (`session.ts`) is what actually stops cross-site POSTs: the cookie is
 * simply not sent, so the handler 401s. Two things it does not cover:
 *
 * 1. **The Lax+POST grace window.** Chromium sends a freshly set cookie on a
 *    top-level cross-site POST for its first two minutes — which is the two
 *    minutes right after signing in, when the user is most likely to be
 *    somewhere else in another tab.
 * 2. **Same-site subdomains.** SameSite is *site*, not *origin*. Per-account
 *    subdomains are analysed in `design/GUIDE-SUBDOMAINS.md`, and if they are
 *    ever built, `anything.mcclevarty.ca` becomes same-site with the apex and
 *    its POSTs carry the cookie. This check is what keeps that from silently
 *    turning into account takeover through `/api/admin/*`.
 *
 * A **missing** `Origin` is allowed: same-origin GETs and some non-browser
 * clients omit it, and the harness is one of them. Refusing only a *present and
 * wrong* origin is the standard shape and costs nothing.
 */
function crossOrigin(request: Request, url: URL): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;

  // Fetch metadata, beside the Origin check rather than instead of it
  // (2026-09-06, second pass). Every current browser stamps `Sec-Fetch-Site` on
  // every request and a page cannot alter it, so `cross-site` on a
  // state-changing request is a refusal whatever the Origin header says —
  // including the case where there is none. A missing header is allowed for
  // the same reason a missing Origin is: non-browser clients, and the harness.
  // `same-site` is deliberately NOT refused here; a sibling subdomain is the
  // Origin check's job, which compares the host exactly.
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const sent = new URL(origin);
    // The Worker's own host, whatever it is — apex in production, loopback under
    // `wrangler dev`. Comparing against the request's host rather than a literal
    // keeps this correct on the `workers.dev` URL and in tests without a list to
    // maintain.
    if (sent.host !== url.host) return true;
    // The scheme counts too: SameSite=Lax is not schemeful in every browser, so
    // before the first HSTS visit an on-path `http://<apex>` page could POST
    // with a passing Origin *and* the cookie. Loopback is exempt, same as the
    // https redirect — `wrangler dev` can report the upstream protocol while
    // the browser genuinely loads over http.
    return !isLoopback(url.hostname) && sent.protocol !== url.protocol;
  } catch {
    return true;
  }
}

/**
 * The CSP, **report-only** (TODO 12, 2026-08-14). The nonce is minted per
 * request and plumbed through `withSiteConfig`, which stamps it on the inlined
 * site-config script — the injection that made an unnonced `script-src`
 * impossible. Report-only is the deliberate first stage, not caution theatre:
 * this policy cannot blank anything, and every violation it *would* have
 * blocked arrives at `/api/csp-report` (visible in `wrangler tail`, stored
 * nowhere — §9). **Flip to enforcing** by renaming the header in `harden` once
 * production has run quiet: passkey ceremonies, a phase-2 browse (the
 * signalling WebSocket under `connect-src`), TOTP enrolment and every effect
 * are the surfaces worth seeing reports from first.
 *
 * Shape notes, each deliberate:
 * - `style-src 'unsafe-inline'` — the theming *is* style attributes
 *   (`theme.ts` writes custom properties to the wrapper; `useMotionSystems`
 *   writes the cursor-lean). `style-src-attr` would be the precise directive,
 *   but pre-15.4 Safari ignores it and would then enforce `style-src` against
 *   every attribute — a blanked site by accident. Inline `<style>` elements do
 *   not exist here, so the practical exposure is attribute-sized.
 * - `img-src data:` — the favicon is a data: URI by design (deviation 10).
 * - explicit `ws(s)://<host>` beside `'self'` in `connect-src` — CSP3 makes
 *   `'self'` cover same-host WebSockets, but older WebKit did not, and the
 *   signalling socket must not be the thing an old browser silently drops.
 * - `frame-ancestors 'none'` restates `x-frame-options: DENY`; both stay, one
 *   is for browsers that only read the other.
 */
function cspPolicy(nonce: string, url: URL): string {
  const ws = `${isLoopback(url.hostname) ? "ws" : "wss"}://${url.host}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${ws}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

/** 128 bits of nonce, fresh per request — a reused nonce is no nonce. */
function cspNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * The most a violation report may weigh. A real one is a few hundred bytes of
 * JSON naming a document URL, a directive and a blocked URI.
 */
const MAX_REPORT_BYTES = 8 * 1024;

/**
 * Receive a CSP violation report: log it, store nothing, say 204.
 *
 * The log line is the whole product — `wrangler tail` during a browse session
 * is how the report-only policy gets read before it is enforced. Reports carry
 * page and blocked URLs, which is why they are truncated and never written to
 * D1: §9's inventory gains nothing, deliberately.
 *
 * Two bounds, both because this route is unauthenticated and stands in front of
 * every other check. **The size** — refused on the declared `content-length`
 * where there is one, and again on what actually arrives, since a chunked or
 * hostile request's header is not evidence. **The shape of what is logged** —
 * control characters become spaces, because a newline in an attacker-supplied
 * string is a forged line in `wrangler tail`, and the log line being the product
 * is exactly what makes forging one worth something.
 */
async function cspReport(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) {
    return problem(413, "That report was too large.");
  }

  const text = await readBounded(request, MAX_REPORT_BYTES);
  if (text === null) return problem(413, "That report was too large.");
  // A report that could not be read still deserves its 204 — the browser is
  // fire-and-forgetting and there is nobody to complain to.
  if (text) console.warn("csp-report", text.slice(0, 2_048).replace(/[\u0000-\u001f\u007f]/g, " "));

  return new Response(null, { status: 204 });
}

/**
 * Headers every response carries; the CSP only where there is a document for it
 * to govern. API responses are JSON to a fetch — a policy there is noise the
 * report endpoint would faithfully relay.
 */
function harden(response: Response, csp?: string): Response {
  const out = new Response(response.body, response);
  out.headers.set("strict-transport-security", HSTS);
  out.headers.set("x-content-type-options", "nosniff");
  out.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // The site is never legitimately framed, and this is the cheap half of the
  // clickjacking defence a CSP `frame-ancestors` would otherwise carry.
  out.headers.set("x-frame-options", "DENY");
  // Features the site will never use, refused site-wide so a compromised or
  // injected script cannot quietly ask for them. WebAuthn is deliberately not
  // listed: `publickey-credentials-get`/`create` keep their default
  // self-allowlist, which is exactly what the passkey ceremonies need.
  out.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  );
  // The site opens no popups and is opened by none it wants a handle on;
  // severing any opener relationship costs nothing and keeps a hostile page
  // that window.open'd us from scripting against the window.
  out.headers.set("cross-origin-opener-policy", "same-origin");
  if (csp) {
    // Report-only until production has run quiet — see `cspPolicy`. This line
    // is the flip: drop the `-report-only` suffix to enforce.
    out.headers.set("content-security-policy-report-only", csp);
    out.headers.set("reporting-endpoints", 'csp-endpoint="/api/csp-report"');
  }
  return out;
}

/** The four Worker secrets, named once so nothing can check three of them. */
const SECRETS = ["AUTH_PEPPER", "SESSION_SECRET", "TOTP_ENC_KEY", "RATE_SALT_SEED"] as const;

/** Logged at most once per isolate; a missing secret is a deploy, not a request. */
let secretsLogged = false;

/**
 * Refuse to serve at all if a secret is missing — in production (2026-09-03
 * audit).
 *
 * **An unset secret currently fails open, silently.** `hmacKey` does
 * `encoder.encode(secret)`, and `TextEncoder.encode(undefined)` is the nine
 * bytes of the string `"undefined"` — so a deploy with no `AUTH_PEPPER` keys
 * every stored auth hash on a constant that any reader of this repository
 * knows, and nothing anywhere says so. The site would look completely healthy.
 * `docs/BREAK-GLASS.md` treats *losing* the pepper as an emergency; *never
 * setting* it was quieter than a typo.
 *
 * **How production is told from development, and why not by hostname.** The
 * obvious tests are both wrong here: `isLoopback` is false under `wrangler dev`
 * — measured, the local server reports the routed hostname `mcclevarty.ca`
 * rather than `127.0.0.1`, which is what the `[dev] upstream_protocol` note in
 * `wrangler.toml` is about — and `request.cf` is populated locally too, with a
 * real colo. What is *not* present locally is **`cf-ray`**: the Cloudflare edge
 * stamps it on every request that reaches a Worker, and `wrangler dev` does not
 * (the local request carries `cf-connecting-ip` and miniflare's
 * `mf-original-hostname`, and no `cf-ray`).
 *
 * The spoofing direction is the part that makes it sound: a client in
 * production **cannot remove** `cf-ray`, because the edge adds it — so nobody
 * can talk their way out of the check. Sending one *to* the dev server only
 * makes local development stricter, which is nobody's attack. And if a future
 * runtime stopped sending it, the check would quietly stop running rather than
 * take a correctly-configured site down, which is the right way round for a
 * guard whose failure mode is the whole site.
 *
 * So `npm run dev:worker` and `npm run test:auth` still run on a fresh clone
 * with no `.dev.vars` (it is gitignored), and `health`'s `?? "dev-seed"` stays
 * reachable, exactly where it was always meant to be reachable.
 *
 * **Presence, not plausibility.** No length floor: a floor is a judgement about
 * somebody else's secret, and being wrong about it takes the entire site down.
 * Absent or empty is not a judgement.
 */
function assertSecrets(request: Request, env: Env): Response | null {
  const missing = SECRETS.filter((name) => {
    const value = env[name] as unknown;
    return typeof value !== "string" || value.trim() === "";
  });
  if (missing.length === 0) return null;

  // Local development, where `.dev.vars` may legitimately not exist yet.
  if (!request.headers.has("cf-ray")) return null;

  if (!secretsLogged) {
    secretsLogged = true;
    // The names go to `wrangler tail`, never to the visitor: which secret is
    // missing is configuration, and the person who needs it is reading the log.
    console.error("missing secrets", missing.join(", "));
  }
  return problem(503, "The site is not configured. Try again shortly.");
}

/**
 * Fetch from the assets binding, **guaranteeing a body for anything this Worker
 * is going to rewrite** (2026-09-03 audit).
 *
 * The shell is not served as it is stored: `withSiteConfig` stamps the published
 * look and a fresh CSP nonce into it, and `withPageMeta` stamps this route's
 * title, description and canonical. A **304 has no body to stamp**, and the
 * headers still get a nonce — measured, a 200 carried header nonce A and body
 * nonce A, and the same URL with `If-None-Match` returned a 304 carrying header
 * nonce B against the body the browser had cached with nonce A. RFC 9111 §4.3.4
 * says a 304's headers *update* the stored response, so the browser then
 * enforces B against A. Today that is invisible because the CSP is report-only.
 * **After the one-header flip in `harden` it blocks `window.__VESSEL_SITE__` on
 * every revalidated load** — that is, every returning visitor — and the site
 * silently falls back to its built-in defaults.
 *
 * The same 304 is why **publishing never reached anyone holding a cached page**.
 * The ETag belongs to the raw asset, computed before any injection, so it is
 * byte-identical for every SPA-fallback route: `/`, `/contact` and
 * `/nonexistent-abc` all answered `"6ed85f21…"`. A returning visitor
 * revalidated, got a 304, and kept whatever `__VESSEL_SITE__`, description and
 * canonical they were served on their first visit until `index.html` itself
 * changed at the next deploy. `site-config.ts` documents publish latency as "up
 * to ten seconds"; for that visitor it was "until the next build", which
 * defeats the publish button — the whole feature.
 *
 * So a 304 that could be a document is re-fetched with the conditional headers
 * removed. **Only a document**: `run_worker_first` sends `/fonts/*` and
 * `/photos/*` through here too, they are not rewritten, and they are the
 * responses whose 304s are worth real bandwidth (six webfonts at ~21KB each,
 * revalidated on every navigation because only `/assets/*` is immutable). A 304
 * that does not say what it is gets re-fetched as well: guessing "not HTML"
 * would fail open into exactly the bug above.
 */
async function asset(request: Request, env: Env): Promise<Response> {
  const first = await env.ASSETS.fetch(request);
  if (first.status !== 304) return first;

  const type = first.headers.get("content-type") ?? "";
  if (type && !type.includes("text/html")) return first;

  const headers = new Headers(request.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  return env.ASSETS.fetch(new Request(request, { headers }));
}

/**
 * Drop the validators from a document we rewrote.
 *
 * They describe the file on disk, and what leaves here is that file plus a
 * per-request nonce, this route's meta and the published look — so the ETag is
 * a validator for a body nobody was served, and it is the *same* validator for
 * every SPA-fallback route. Removing it costs nothing that
 * `cache-control: max-age=0, must-revalidate` was not already costing (the
 * client contacts the server on every navigation either way; the body is
 * ~2.5KB) and it takes the re-fetch above off the common path, since a client
 * with no validator sends no conditional request.
 *
 * Non-documents keep theirs untouched — that is where 304s are worth having.
 */
function unvalidatable(response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;

  // A header copy; the body is passed through by reference, not buffered.
  const out = new Response(response.body, response);
  out.headers.delete("etag");
  out.headers.delete("last-modified");
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Before anything else: a Worker missing a secret cannot answer anything
    // honestly, and answering anyway is what makes it invisible.
    const unconfigured = assertSecrets(request, env);
    if (unconfigured) return harden(unconfigured);

    // Then, before the API: a request that arrived in
    // cleartext gets a redirect and nothing else, or the response would ship
    // over http regardless of what it contains.
    const upgrade = httpsRedirect(request, url);
    if (upgrade) return upgrade;

    // `www.` is a routed hostname (wrangler.toml) whose only job is to reach
    // this line: before it was routed, the proxied DNS record had nothing
    // behind it and served every visitor a bare Cloudflare 522. One canonical
    // host, same shape as the https redirect above — host-generic, so loopback
    // and `wrangler dev` (which never see a `www.`) are untouched.
    if (url.hostname.startsWith("www.")) {
      return new Response(null, {
        status: 301,
        headers: {
          location: `https://${url.hostname.slice(4)}${url.pathname}${url.search}`,
          "strict-transport-security": HSTS,
        },
      });
    }

    // `/robots.txt` and `/sitemap.xml`, generated from `PATHS` so a new page
    // cannot be left out of the index by being forgotten. Ahead of the asset
    // fetch because neither file exists in `public/` and the SPA fallback would
    // otherwise answer both with the app shell, 200 — a crawler reading an HTML
    // page where a sitemap should be treats the sitemap as broken.
    const crawler = crawlerFile(url);
    if (crawler) return harden(crawler);

    if (!url.pathname.startsWith("/api/")) {
      // The app shell gets the published look inlined into it, so the first
      // render is already the right colour and there is no fetch on the boot
      // path. Non-HTML assets pass straight through untouched, and a failure
      // to read the published row serves the site's built-in defaults rather
      // than serving nothing. The nonce ties the injected script to the CSP:
      // minted here, stamped on the script by `withSiteConfig`, named by the
      // policy `harden` attaches.
      // `withPageMeta` wraps the outside because it must run whether or not a
      // config is published — `withSiteConfig` returns the response untouched
      // when there is no row, and the head still needs a title either way.
      const nonce = cspNonce();
      return harden(
        unvalidatable(
          withPageMeta(await withSiteConfig(await asset(request, env), env, nonce), url),
        ),
        cspPolicy(nonce, url),
      );
    }

    // CSP violation reports, ahead of the cross-origin refusal: browsers send
    // them without an Origin or with the literal string "null", the endpoint is
    // unauthenticated and stores nothing, so there is nothing for that refusal
    // to protect and a lost report is the only possible cost.
    if (url.pathname === "/api/csp-report" && request.method === "POST") {
      return harden(await cspReport(request));
    }

    if (crossOrigin(request, url)) {
      return harden(problem(403, "That request came from somewhere we do not serve."));
    }

    // The signalling WebSocket, special-cased ahead of `route`: a 101 carries a
    // `webSocket` that `harden`'s response copy would silently drop, leaving
    // every upgrade hanging. Refusals still flow through the catch below and
    // get hardened like any other response.
    if (url.pathname.startsWith("/api/signal/")) {
      try {
        return await signalUpgrade(request, env, url);
      } catch (error) {
        if (error instanceof BadRequest) return harden(problem(error.status, error.message));
        console.error("unhandled", error);
        return harden(problem(500, "Something went wrong at our end. Try again shortly."));
      }
    }

    try {
      return harden(await route(request, env, ctx, url));
    } catch (error) {
      // A `BadRequest` carries wording that was written to be shown to a user;
      // anything else carries wording that was not, so it becomes a generic 500.
      // §10 requires that failures say what to do next, and "something went
      // wrong" is the honest version of that when we genuinely do not know.
      // Hardened like every success path: an error response is still a
      // response, and a 4xx without HSTS/nosniff is the inconsistency an
      // audit flags first.
      if (error instanceof BadRequest) return harden(problem(error.status, error.message));
      console.error("unhandled", error);
      return harden(problem(500, "Something went wrong at our end. Try again shortly."));
    }
  },
} satisfies ExportedHandler<Env>;

async function route(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  switch (`${request.method} ${url.pathname}`) {
    case "GET /api/health":
      return health(env);

    // Identity (§4). The order here is the order a person meets them.
    case "POST /api/auth/signup":
      return accounts.signup(request, env);
    case "POST /api/auth/challenge":
      return accounts.challenge(request, env);
    case "POST /api/auth/signin":
      return accounts.signin(request, env);
    case "POST /api/auth/totp":
      return accounts.signinTotp(request, env);
    case "POST /api/auth/signout":
      return accounts.signout(request, env);

    // Passkey sign-in (§4). Anonymous, like the password routes above; the
    // register/list/remove routes live with the signed-in account below.
    case "POST /api/auth/passkey/challenge":
      return passkeys.signInChallenge(request, env);
    case "POST /api/auth/passkey":
      return passkeys.signIn(request, env);

    // The published site appearance. The read is public — it is the look every
    // visitor is already being served — and the write is operator-only.
    case "GET /api/site-config":
      return readSiteConfig(request, env);
    case "POST /api/site-config":
      return publishSiteConfig(request, env);

    // The downloads page (2026-08-19). `claim` and `file` are the only two
    // unauthenticated routes added since signup: the whole point is that a
    // buyer needs no account, because an account would mean collecting the
    // identity this design exists not to hold. `claim` is rate-limited on the
    // same Durable Object as sign-in; `file` is gated by the ticket `claim`
    // mints, or is open when the catalogue marks an item free.
    case "POST /api/downloads/claim":
      return downloads.claim(request, env);
    /*
     * `HEAD` as well as `GET`, and it is not cosmetic. `curl -C -`, `wget -c`,
     * aria2 and most download managers probe with a `HEAD` first to learn the
     * size and whether ranges are supported — and this route advertises
     * `accept-ranges: bytes` precisely so that resuming works, on 300MB files
     * going to people whose connection is the reason they rang. Without this
     * case they got `404 No such endpoint.` and either gave up or fell back to a
     * transfer that cannot resume. The runtime strips the body from a `HEAD`
     * response itself, so the same handler is correct for both.
     */
    case "GET /api/downloads/file":
    case "HEAD /api/downloads/file":
      return downloads.file(request, env, url);

    /*
     * The operator's own sub-pages (2026-08-20). The two reads are public in
     * the same sense `/api/site-config`'s is — they serve whatever the caller is
     * allowed to see and nothing else, which for a signed-out visitor is the
     * live public pages. Every decision about *what that is* lives in
     * `resolveAccess`; none of it is repeated here.
     */
    case "GET /api/downloads/pages":
      return pages.listPages(request, env, url);
    case "GET /api/downloads/page":
      return pages.readPage(request, env, url);

    // Authoring. Operator only, every one of them.
    case "POST /api/admin/downloads/page":
      return pages.savePage(request, env);
    case "POST /api/admin/downloads/page/delete":
      return pages.deletePage(request, env);
    case "POST /api/admin/downloads/page/order":
      return pages.reorderPages(request, env);
    case "POST /api/admin/downloads/blocks":
      return pages.saveBlocks(request, env);
    case "POST /api/admin/downloads/file":
      return pages.saveFile(request, env);
    case "POST /api/admin/downloads/file/delete":
      return pages.deleteFile(request, env);
    case "POST /api/admin/downloads/file/order":
      return pages.reorderFiles(request, env);

    // The upload, in parts. See `downloadPages.beginUpload` for why it is
    // multipart even for a small file.
    case "POST /api/admin/downloads/upload/begin":
      return pages.beginUpload(request, env);
    case "PUT /api/admin/downloads/upload/part":
      return pages.uploadPart(request, env, url);
    case "POST /api/admin/downloads/upload/finish":
      return pages.finishUpload(request, env);
    case "POST /api/admin/downloads/upload/abort":
      return pages.abortUpload(request, env);

    // Per-account access.
    case "GET /api/admin/downloads/grants":
      return pages.listGrants(request, env);
    case "POST /api/admin/downloads/grant":
      return pages.addGrant(request, env);
    case "POST /api/admin/downloads/grant/delete":
      return pages.removeGrant(request, env);

    // Minting, listing and revoking access codes. Operator only.
    case "POST /api/admin/downloads/mint":
      return downloads.mintCode(request, env);
    case "GET /api/admin/downloads":
      return downloads.listCodes(request, env);
    case "POST /api/admin/downloads/revoke":
      return downloads.revokeCode(request, env);

    // Operator administration of accounts. Every one of these refuses a caller
    // who is not a signed-in operator; none of them can read key material.
    case "GET /api/admin/accounts":
      return admin.listAccounts(request, env);
    case "POST /api/admin/operator":
      return admin.setOperator(request, env);
    case "POST /api/admin/reset-totp":
      return admin.resetTotp(request, env);
    case "POST /api/admin/reset-password":
      return admin.resetPassword(request, env);
    case "POST /api/admin/delete-account":
      return admin.deleteAccount(request, env);

    // The signed-in account.
    case "GET /api/me":
      return accounts.me(request, env);
    case "POST /api/account/password":
      return accounts.changePassword(request, env);
    // Separate from the route above because it authorises differently: that one
    // takes the current password, this one takes a ticket minted by redeeming a
    // recovery code. Folding them into one handler with an `if` is how the
    // no-current-password branch eventually becomes reachable without a ticket.
    case "POST /api/account/set-password":
      return accounts.setPassword(request, env);
    // POST, not GET: the body carries the password proof (`assertPassword` in
    // the handler) — the slot is never handed to a session cookie alone.
    case "POST /api/account/slot":
      return accounts.keySlot(request, env);
    case "POST /api/totp/enrol":
      return accounts.totpEnrol(request, env);
    case "POST /api/totp/confirm":
      return accounts.totpConfirm(request, env);
    case "GET /api/passkeys":
      return passkeys.list(request, env);
    case "POST /api/passkey/challenge":
      return passkeys.registerChallenge(request, env);
    case "POST /api/passkey/register":
      return passkeys.register(request, env);
    case "POST /api/passkey/remove":
      return passkeys.remove(request, env);

    // Saved setups (§11) — a name and a share code, per signed-in account.
    case "GET /api/setups":
      return setups.list(request, env);
    case "POST /api/setups":
      return setups.save(request, env);
    case "POST /api/setups/delete":
      return setups.remove(request, env);

    // Machines and drives (§13). Pairing is a password ceremony (§12 L); the
    // rest are session-gated rows that carry labels, not authority.
    case "POST /api/machines/pair":
      return machines.pair(request, env);
    case "GET /api/machines":
      return machines.list(request, env);
    case "POST /api/machines/rename":
      return machines.rename(request, env);
    case "POST /api/machines/remove":
      return machines.remove(request, env);
    case "POST /api/drives":
      return machines.driveAdd(request, env);
    case "POST /api/drives/remove":
      return machines.driveRemove(request, env);

    default:
      return problem(404, "No such endpoint.");
  }
}

/**
 * Authenticate a signalling upgrade and hand it to the machine's Durable
 * Object (§13). Everything that decides *whether* this caller may reach the
 * object happens here, in front of it: the session, the ownership check, and
 * the role. The object itself trusts what arrives, which is what keeps it an
 * introducer with no knowledge of accounts. Phase 3 widens exactly this gate
 * to grantees; the object does not change.
 */
async function signalUpgrade(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw new BadRequest("That endpoint speaks WebSocket.", 426);
  }

  /**
   * The origin check `crossOrigin` structurally cannot make (2026-08-14 review).
   *
   * This route is special-cased ahead of `crossOrigin` so the 101 survives
   * `harden`, and `crossOrigin` returns false for GET anyway — which every
   * WebSocket handshake is. So the one endpoint that opens a **long-lived
   * authenticated channel** was the one endpoint with no origin check at all.
   *
   * `SameSite=Lax` covers it today. It stops covering it the moment
   * `design/GUIDE-SUBDOMAINS.md` is acted on: a page on `alice.mcclevarty.ca`
   * could open `wss://mcclevarty.ca/api/signal/<id>` with the victim's cookie
   * attached, and nothing here would refuse. §12 K bounds the damage — the agent
   * verifies the peer's grant-key signature and would refuse the browse — so the
   * prize is signalling relay and agent-presence disclosure, not files. Small,
   * and not worth leaving for a future subdomain decision to remember.
   *
   * **A missing `Origin` is still allowed**, the same deliberate carve-out
   * `crossOrigin` documents: non-browser clients omit it and `scripts/auth-e2e.ts`
   * is one of those. This refuses a *present and foreign* origin only.
   */
  const origin = request.headers.get("origin");
  if (origin) {
    let foreign = true;
    try {
      foreign = new URL(origin).host !== url.host;
    } catch {
      foreign = true;
    }
    if (foreign) throw new BadRequest("That request came from somewhere else.", 403);
  }

  const account = await accounts.requireAccount(request, env);

  const machineId = url.pathname.slice("/api/signal/".length);
  const machine = await env.DB.prepare("SELECT id FROM machines WHERE id = ? AND owner_id = ?")
    .bind(machineId, account.id)
    .first<{ id: string }>();
  if (!machine) throw new BadRequest("No such machine on this account.", 404);

  const role = url.searchParams.get("role");
  if (role !== "agent" && role !== "browser") {
    throw new BadRequest("Connect as ?role=agent or ?role=browser.");
  }

  // Connection events, not liveness (§12 N) — liveness is the object's socket
  // state, asked for by the machine list, persisted nowhere.
  if (role === "agent") {
    await env.DB.prepare("UPDATE machines SET last_seen = ? WHERE id = ?")
      .bind(Date.now(), machineId)
      .run();
  }

  const stub = env.SIGNAL.get(env.SIGNAL.idFromName(machineId));
  const response = await stub.fetch(new Request(`https://signal/connect?role=${role}`, request));

  // **The 101 is the only response that may skip `harden`**, because copying a
  // response drops its `webSocket` and every upgrade would hang. Everything else
  // `MachineSignal.fetch` can answer with — its 426, 400 and 404 — is an
  // ordinary response, and those were leaving without the site's headers on
  // them. They are unreachable today only because the two checks above duplicate
  // the object's own; this makes the rule structural rather than a coincidence
  // that holds while the duplication does.
  return response.status === 101 ? response : harden(response);
}

/**
 * Liveness, and specifically the two things that can be misconfigured in a way
 * the site would otherwise hide: D1 reachable with the migration applied, and
 * the Durable Object namespace answering.
 */
async function health(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','credentials','key_slots','totp','setups','audit','machines','drives')",
  ).first<{ n: number }>();

  const key = await clientKey("0.0.0.0", env.RATE_SALT_SEED ?? "dev-seed");
  const limiter = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(key));
  const verdict = await limiter.fetch("https://rate-limit/check").then((r) => r.json());

  return Response.json({
    ok: row?.n === 8,
    tables: row?.n ?? 0,
    rateLimit: verdict,
  });
}

/** A failure the client is expected to act on. */
function problem(status: number, detail: string): Response {
  return Response.json({ error: detail }, { status });
}
