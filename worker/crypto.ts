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
 * Expand an IPv6 literal to its eight groups, or null if it is not one.
 *
 * Hand-rolled because there is no address parser in the platform and the
 * project takes no third-party runtime libraries. It accepts the forms that
 * actually arrive in `cf-connecting-ip` — compressed (`::`), full, a zone id,
 * and a trailing dotted quad (`::ffff:192.0.2.1`) — and refuses everything
 * else rather than guessing.
 */
function expandIpv6(address: string): number[] | null {
  // A zone id (`%eth0`) is link-local scope, never routable to us, but strip it
  // rather than fail on it: a refusal here would key the raw string instead.
  let text = address.split("%")[0];
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);

  // `::ffff:192.0.2.1` — the last two groups are written as an IPv4 address.
  // Rewritten to hex here so the group walk below has one shape to handle.
  const lastColon = text.lastIndexOf(":");
  if (lastColon >= 0 && text.slice(lastColon + 1).includes(".")) {
    const quad = text.slice(lastColon + 1);
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(quad)) return null;
    const bytes = quad.split(".").map(Number);
    if (bytes.some((b) => b > 255)) return null;
    const hi = ((bytes[0] << 8) | bytes[1]).toString(16);
    const lo = ((bytes[2] << 8) | bytes[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let parts: string[];
  if (halves.length === 1) {
    parts = head;
  } else {
    const fill = 8 - head.length - tail.length;
    // `::` stands for *at least* one group of zeros, so a run that leaves none
    // to fill is malformed rather than merely redundant.
    if (fill < 1) return null;
    parts = [...head, ...Array<string>(fill).fill("0"), ...tail];
  }
  if (parts.length !== 8) return null;

  const groups: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

/**
 * Collapse an address to the unit that identifies a *client*, before it is
 * hashed into a bucket name (2026-09-03 audit).
 *
 * **Keying on the whole address is a limiter with no floor on IPv6.** Measured
 * against the local Worker: 72 sign-in attempts from one IPv4 address hit the
 * backoff at attempt 52, exactly as `CLIENT_FREE_ATTEMPTS` says; 72 attempts
 * rotating source addresses inside a single `2001:db8:aa:bb::/64` produced
 * **zero** refusals, because every address was a fresh Durable Object with a
 * fresh allowance. Rotating inside a /64 needs no infrastructure at all — a /64
 * is the smallest thing any residential or VPS allocation hands out, and every
 * address in it is yours. That defeats `SIGNUP_FREE_ATTEMPTS` (unlimited
 * account creation) and `CLIENT_FREE_ATTEMPTS` (horizontal credential
 * stuffing, which the per-handle account bucket cannot see by construction).
 *
 * **The cut is /64, and /48 was the alternative.** /64 is the smallest unit
 * guaranteed to be one customer's subnet, so it closes the attack that costs an
 * attacker nothing. /48 would additionally cover an attacker whose ISP delegates
 * them a /56 or /48 — but where an ISP hands out /56s, one /48 spans up to 256
 * unrelated households, and the client bucket is deliberately loose *because*
 * one address is already a household behind NAT (`accounts.ts`). At /48 a
 * stuffing run would lock out the attacker's neighbours, which converts an
 * attack on the site into an outage for real visitors. The right answer for a
 * determined attacker is two tiers — a /64 bucket at the current allowance and a
 * wider /48 bucket at a much higher one — and that needs `buckets()` in
 * `accounts.ts`, not this helper.
 *
 * **No raw address is stored either way**, here or downstream: the return value
 * is HMAC'd immediately and names a Durable Object. §9's inventory is unchanged
 * and this is not a spec change.
 *
 * **`cf-connecting-ip` is not spoofable in production** — Cloudflare sets and
 * overwrites it at the edge on every request that reaches a Worker, and
 * `workers_dev` is false, so there is no un-proxied hostname on which the header
 * arrives as the client wrote it. **`X-Forwarded-For` is correctly never read
 * anywhere in this Worker, and must not start being read**: it is client-supplied
 * and appending to it would hand every attacker a rate-limit bypass.
 */
export function normaliseIp(ip: string): string {
  const raw = ip.trim().toLowerCase();
  // No colon: IPv4, or the `local` literal `buckets()` uses when there is no
  // edge in front of us. Either way it is already the whole client.
  if (!raw.includes(":")) return raw;

  const groups = expandIpv6(raw);
  // Unparseable: key it whole. That is the old behaviour, and it is the narrow
  // direction — a wider guess would let a malformed string share a bucket with
  // real clients.
  if (!groups) return raw;

  // `::ffff:x.x.x.x` and `::x.x.x.x` carry a single IPv4 client in their low
  // groups. Truncating those to /64 would collapse **every** IPv4 visitor into
  // one bucket, which is a self-inflicted outage rather than a limit.
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return raw;
  }

  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
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
 *
 * **The address is normalised first** — see `normaliseIp`. Hashing the raw
 * string gave every IPv6 client an unlimited supply of fresh buckets.
 */
export async function clientKey(ip: string, seed: string, now = Date.now()): Promise<string> {
  const day = Math.floor(now / 86_400_000);
  return toHex(await hmac(seed, `${day}:${normaliseIp(ip)}`));
}

/** A random identifier for a database row. */
export function newId(): string {
  return crypto.randomUUID();
}
