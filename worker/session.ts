/**
 * Sessions, and the short-lived tickets that look like them.
 *
 * §4 fixes the shape: "an HttpOnly, Secure, SameSite=Lax cookie carrying an
 * HMAC-signed token, short-lived with refresh. No JWT library, no third-party
 * identity provider." What follows is that sentence and nothing more.
 *
 * **Why no session table.** §9's data model has none, and that is a decision
 * rather than an omission: a stateless token means signing in writes nothing
 * about a person to the database. The cost is that a token cannot be revoked
 * before it expires, which is why the lifetime is thirty minutes rather than a
 * fortnight — sign-out clears the cookie, and the window in which a stolen token
 * outlives that is bounded and short. If revocation ever needs to be immediate,
 * that is a new table and a spec change, not a tweak here.
 *
 * The same primitive issues the **TOTP ticket**: the thing a caller holds
 * between passing the first factor and passing the second. It is a different
 * `purpose`, so a ticket can never be presented as a session — the HMAC covers
 * the purpose string, so swapping one for the other does not verify.
 */

import { hmac, timingSafeEqual } from "./crypto";
import { fromBase64Url, toBase64Url } from "./encoding";

/**
 * `__Host-` prefixed (2026-08-13 security review). The prefix makes the browser
 * refuse to store this name unless the cookie is Secure, has `Path=/`, and sets
 * no `Domain` — all of which `sessionCookie` below already does — which means no
 * other host can plant it: a compromised or future sibling subdomain
 * (`design/GUIDE-SUBDOMAINS.md`) could otherwise set `vessel_session` with
 * `Domain=mcclevarty.ca` and fix a victim's session to one it controls. Browsers
 * honour the prefix on localhost/127.0.0.1 (trustworthy origins), so `wrangler
 * dev` and the harness — whose cookie jar is name-agnostic — are unaffected.
 */
export const SESSION_COOKIE = "__Host-vessel_session";

/** Short, because these tokens cannot be revoked. Refreshed on use. */
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Reissue once a session is more than half spent. A user who is active never
 * sees an expiry; one who walks away is signed out within the window. Doing it
 * on the half rather than on every request keeps `Set-Cookie` off most
 * responses.
 */
const REFRESH_AFTER_MS = SESSION_TTL_MS / 2;

/**
 * Long enough to read a code off a phone, short enough that a ticket left in a
 * log or a back button is worthless. It is a first factor already spent — not
 * nothing, so it expires quickly.
 */
const TICKET_TTL_MS = 5 * 60 * 1000;

/**
 * The ceiling on refreshing, and the reason it exists.
 *
 * Without it, "short-lived with refresh" is a contradiction: a token that
 * reissues itself whenever it is used has no lifetime at all, and a stolen
 * cookie polled once every fifteen minutes is permanent access that sign-out
 * cannot touch — because sign-out clears a cookie and this design deliberately
 * holds no server-side session state to revoke (§9 has no session table).
 *
 * So the token carries the moment it was *first* issued, inside the MAC, and no
 * amount of refreshing moves it. Twelve hours after signing in, the user signs
 * in again. That is the honest bound the no-table decision costs, and it is
 * cheap: the alternative is a table, which is a spec change.
 */
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Long enough to choose a password without being rushed, short enough that a
 * ticket left in a closed tab is not a standing capability. Fifteen minutes
 * rather than the five a TOTP ticket gets: reading a code off a phone is a
 * transcription, choosing a password is a decision.
 */
const SET_PASSWORD_TTL_MS = 15 * 60 * 1000;

/**
 * `set-password` is the capability to replace a password *without presenting the
 * current one*, and it exists for exactly one person: someone who just redeemed
 * a recovery code and therefore has no current password to present.
 *
 * It is a separate token rather than a flag on the session because a session is
 * not evidence of how it was obtained. If `/api/account/set-password` authorised
 * on the session alone, a stolen cookie — thirty minutes of access this design
 * already accepts as bounded — would become permanent account takeover, since
 * the thief could set a password and lock the owner out. Requiring a token that
 * is minted only at the moment a recovery code is spent keeps the blast radius
 * of a stolen session exactly where it is today.
 *
 * It rides in the response body, never in a cookie: it is a one-shot capability
 * for the next request, not ambient authority attached to the browser.
 */
export type TokenPurpose =
  | "session"
  | "totp-ticket"
  | "set-password"
  // The WebAuthn challenge tokens (worker/passkeys.ts). Same shape as the TOTP
  // ticket — a stateless, five-minute claim whose subject carries the challenge
  // — so the Worker keeps no challenge table and a replayed registration is
  // caught by the credential-id uniqueness index rather than by session state.
  | "webauthn-register"
  | "webauthn-signin";

export interface Token {
  subject: string;
  expiresAt: number;
  /** When this session first began — carried across refreshes, never moved. */
  issuedAt: number;
}

/**
 * `purpose.subject.expiry.issuedAt.nonce.mac`, all base64url, dot-separated.
 *
 * The nonce is not needed for security — the MAC covers everything before it —
 * but it makes two tokens minted in the same millisecond for the same account
 * distinguishable, which matters the day anything wants to tell them apart.
 *
 * `issuedAt` defaults to now, so a fresh sign-in starts the clock. A refresh
 * passes the *original* value through, which is what makes the ceiling above
 * unmovable rather than advisory.
 */
export async function mint(
  secret: string,
  purpose: TokenPurpose,
  subject: string,
  now = Date.now(),
  issuedAt = now,
): Promise<string> {
  const ttl =
    purpose === "session"
      ? SESSION_TTL_MS
      : purpose === "set-password"
        ? SET_PASSWORD_TTL_MS
        : TICKET_TTL_MS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(9)));
  const body = `${purpose}.${toBase64Url(new TextEncoder().encode(subject))}.${now + ttl}.${issuedAt}.${nonce}`;
  return `${body}.${toBase64Url(await hmac(secret, body))}`;
}

/**
 * Verify and unpack, or return null. Never throws and never explains itself to
 * the caller: an expired token, a forged one and a truncated one are the same
 * answer, because distinguishing them is only useful to somebody probing.
 */
export async function verify(
  secret: string,
  purpose: TokenPurpose,
  token: string | null | undefined,
  now = Date.now(),
): Promise<Token | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 6) return null;

  const [tokenPurpose, encodedSubject, expiry, issued, , mac] = parts;
  if (tokenPurpose !== purpose) return null;

  const body = parts.slice(0, 5).join(".");
  const expected = await hmac(secret, body);

  // Constant-time, and before the expiry check rather than after. Checking
  // expiry first would answer "was this ever a valid token?" fractionally faster
  // for a forgery than for a stale real one.
  let signature: Uint8Array;
  try {
    signature = fromBase64Url(mac);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, signature)) return null;

  const expiresAt = Number(expiry);
  const issuedAt = Number(issued);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if (!Number.isFinite(issuedAt)) return null;

  // The absolute ceiling, checked here rather than only at refresh time, so a
  // token cannot outlive it even if some future caller forgets to ask.
  if (purpose === "session" && now - issuedAt > MAX_SESSION_AGE_MS) return null;

  try {
    return {
      subject: new TextDecoder().decode(fromBase64Url(encodedSubject)),
      expiresAt,
      issuedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Whether a still-valid session is far enough through its life to be reissued —
 * and young enough overall to deserve it. Past the ceiling it simply expires.
 */
export function needsRefresh(token: Token, now = Date.now()): boolean {
  if (now - token.issuedAt > MAX_SESSION_AGE_MS - REFRESH_AFTER_MS) return false;
  return token.expiresAt - now < REFRESH_AFTER_MS;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * `SameSite=Lax` rather than `Strict`: the site has nine client-routed URLs a
 * user may well arrive at from a link, and `Strict` would show them signed out
 * on that first paint and signed in after any navigation, which reads as a bug.
 * Lax withholds the cookie from exactly the cross-site *POST* that would be a
 * CSRF, which is the case that matters.
 *
 * `Secure` is unconditional. Wrangler's dev server is http on localhost, and
 * browsers make an explicit exception for localhost precisely so this flag does
 * not have to be conditional on an environment check that could ship wrong.
 */
export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ].join("; ");
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
