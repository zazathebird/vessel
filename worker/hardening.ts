/**
 * The headers every response leaves with, and the liveness probe.
 *
 * Split out of `index.ts` on 2026-09-24 so `scripts/check.ts` can drive both
 * (review item 21): importing `index.ts` into the scripts project drags in
 * `signal.ts` and `machines.ts`, which only typecheck against workers-types'
 * own `WebSocket` and `BufferSource`. Nothing else moved — `index.ts` calls
 * these exactly where it called them before, and "flip the CSP by renaming one
 * header in `harden`" still means this file's `harden`.
 */

import { clientKey } from "./crypto";
import type { Env } from "./env";

/**
 * Two years, subdomains included. Not preloaded — preload is a one-way door that
 * needs a deliberate submission, and the apex is what matters here.
 */
export const HSTS = "max-age=63072000; includeSubDomains";

/**
 * Headers every response carries; the CSP only where there is a document for it
 * to govern. API responses are JSON to a fetch — a policy there is noise the
 * report endpoint would faithfully relay.
 */
export function harden(response: Response, csp?: string): Response {
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
  // Nothing here is meant to be embedded by another site (2026-09-24, review
  // item 21): the bundles, the six webfonts and every API answer are loaded by
  // this origin's own pages, which CORP does not govern. `same-origin` stops a
  // foreign page pulling any of them into its process as a no-cors load — the
  // Spectre-shaped read COOP above cannot cover on its own. `same-site` would
  // be the looser choice and is not needed: `www.` and the `.com` only ever
  // redirect here, they never embed. Unfurlers and crawlers fetch server-side,
  // where CORP is not enforced, so link previews are unaffected.
  out.headers.set("cross-origin-resource-policy", "same-origin");
  if (csp) {
    // Report-only until production has run quiet — see `cspPolicy`. This line
    // is the flip: drop the `-report-only` suffix to enforce.
    out.headers.set("content-security-policy-report-only", csp);
    out.headers.set("reporting-endpoints", 'csp-endpoint="/api/csp-report"');
  }
  return out;
}

/**
 * How long one isolate re-serves its last health answer (2026-09-24, review
 * item 21). Anonymous, and every hit was a D1 query plus a Durable Object round
 * trip, so a loop against it was a loop against both.
 */
const HEALTH_TTL_MS = 30_000;
let healthMemo: { at: number; body: unknown } | null = null;

/**
 * Liveness, and specifically the two things that can be misconfigured in a way
 * the site would otherwise hide: D1 reachable with the migration applied, and
 * the Durable Object namespace answering.
 *
 * **Memoised per isolate for thirty seconds**, and what that keeps is exactly
 * what deploy verification needs (`docs/HANDOFF.md`): a fresh deploy is a fresh
 * isolate with no memo, so the first answer after `npm run deploy` is always a
 * real probe, and "the Worker is serving this domain" is true of a memoised
 * answer too — it still came from this Worker. What it gives up is a
 * migration applied *between* deploys showing within the second rather than
 * the half-minute. A probe that throws is not memoised; the next hit tries
 * again. No `cache-control` either: a browser holding an answer from the
 * previous deploy is the one staleness this must not have.
 */
export async function health(env: Env): Promise<Response> {
  const now = Date.now();
  if (healthMemo && now - healthMemo.at < HEALTH_TTL_MS) return Response.json(healthMemo.body);

  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','credentials','key_slots','totp','setups','audit','machines','drives')",
  ).first<{ n: number }>();

  const key = await clientKey("0.0.0.0", env.RATE_SALT_SEED ?? "dev-seed");
  const limiter = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(key));
  const verdict = await limiter.fetch("https://rate-limit/check").then((r) => r.json());

  const body = {
    ok: row?.n === 8,
    tables: row?.n ?? 0,
    rateLimit: verdict,
  };
  healthMemo = { at: now, body };
  return Response.json(body);
}
