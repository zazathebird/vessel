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
import * as passkeys from "./passkeys";
import * as setups from "./setups";
import { clientKey } from "./crypto";
import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { RateLimiter } from "./rate-limit";
import { MachineSignal } from "./signal";
import { publishSiteConfig, readSiteConfig, withSiteConfig } from "./site-config";
import { withPageMeta } from "./page-meta";

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
 * Receive a CSP violation report: log it, store nothing, say 204.
 *
 * The log line is the whole product — `wrangler tail` during a browse session
 * is how the report-only policy gets read before it is enforced. Reports carry
 * page and blocked URLs, which is why they are truncated and never written to
 * D1: §9's inventory gains nothing, deliberately.
 */
async function cspReport(request: Request): Promise<Response> {
  try {
    console.warn("csp-report", (await request.text()).slice(0, 2_048));
  } catch {
    // A report that cannot be read still deserves its 204 — the browser is
    // fire-and-forgetting and there is nobody to complain to.
  }
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Before anything else, including the API: a request that arrived in
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
        withPageMeta(await withSiteConfig(await env.ASSETS.fetch(request), env, nonce), url),
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
    case "GET /api/downloads/file":
      return downloads.file(request, env, url);

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
  return stub.fetch(new Request(`https://signal/connect?role=${role}`, request));
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
