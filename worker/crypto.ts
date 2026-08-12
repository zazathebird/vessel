/**
 * Server-side crypto helpers.
 *
 * Everything here is native `WebCrypto`. The project's constraint is no
 * third-party runtime libraries, and the account system was designed around
 * primitives the platform already has (SPEC-ACCOUNTS.md §1).
 *
 * Note what is *not* here: password hashing. The password never reaches the
 * server. The browser runs PBKDF2 and sends a derived auth secret; the server
 * only ever HMACs that secret with a pepper (§4). `authHash` below is that
 * HMAC, and its input is already a 256-bit KDF output, which is why a slow hash
 * on this side would buy nothing.
 */

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message));
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The stored form of a password credential: HMAC of the browser-derived auth
 * secret under the server pepper. A database leak therefore yields neither the
 * password nor anything replayable without the pepper, which lives in the
 * Worker's secrets rather than in D1.
 */
export async function authHash(pepper: string, authSecret: string): Promise<ArrayBuffer> {
  return hmac(pepper, authSecret);
}

/**
 * Constant-time comparison.
 *
 * `===` on hex strings leaks the length of the matching prefix through timing,
 * which is a real attack against session tokens and TOTP codes even over a
 * network. Every secret comparison in this Worker goes through here.
 */
export function timingSafeEqual(a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array): boolean {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

/**
 * Identify a client for rate limiting **without storing their IP address.**
 *
 * An IP is personal data, and §9's inventory lists it as never collected. The
 * address is HMAC'd under a salt that changes every day, so the resulting key
 * groups one client's attempts inside a window and becomes meaningless once the
 * day rolls over. Nothing recoverable is written down: this value names a
 * Durable Object and is never persisted to D1.
 *
 * The daily rotation is what makes it non-reversible in practice. An IPv4 space
 * is small enough to enumerate against a fixed salt, so a fixed salt would be
 * pseudonymisation in name only.
 */
export async function clientKey(ip: string, seed: string, now = Date.now()): Promise<string> {
  const day = Math.floor(now / 86_400_000);
  return toHex(await hmac(seed, `${day}:${ip}`));
}

/** A random identifier for a database row. */
export function newId(): string {
  return crypto.randomUUID();
}
