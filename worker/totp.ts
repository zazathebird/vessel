/**
 * Time-based one-time passwords, per RFC 6238.
 *
 * Six digits, a 30-second step and `HMAC-SHA-1` — the parameters every
 * authenticator app assumes when a URI omits them, and the ones SPEC-ACCOUNTS.md
 * §4 fixes. The spec's claim is that this is "roughly forty lines over
 * `WebCrypto`: no library, no SMS, no third-party service, and nothing that needs
 * a phone number", and honouring that claim is the whole reason this file exists
 * rather than a dependency.
 *
 * SHA-1 is not a mistake here. It is what RFC 6238 specifies and what the
 * installed base of authenticator apps implements; the security of a TOTP does
 * not rest on collision resistance. `worker/crypto.ts` deliberately hardcodes
 * SHA-256 for everything else, so this module imports a SHA-1 key of its own
 * rather than widening the shared helper and inviting SHA-1 into places that
 * have no business with it.
 */

import { timingSafeEqual } from "./crypto";

const encoder = new TextEncoder();

/** RFC 6238 §4: a 30-second step, and six digits displayed. */
const STEP_SECONDS = 30;
const DIGITS = 6;

/**
 * One step either side of now is accepted, so the window a code is live for is
 * at most 90 seconds. That is the usual allowance for a phone whose clock has
 * drifted and for a person typing the last digit as the step rolls over.
 */
const DRIFT_STEPS = 1;

/** RFC 4226 §4 recommends 160 bits; that is also one clean 32-character base32 string. */
const SECRET_BYTES = 20;

/** AES-GCM's standard nonce length. Anything else costs an extra GHASH pass for nothing. */
const IV_BYTES = 12;

/** A fresh 20-byte TOTP secret, returned raw. */
export function newTotpSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

// Base32 ---------------------------------------------------------------------
//
// Base32 rather than the base64url used everywhere else in the account layer,
// because §4 requires enrolment to show the secret "as a manual string": this is
// the alphabet authenticator apps accept when someone types a secret in by hand
// instead of scanning the QR code. It has no case sensitivity and no character
// pair that can be misread on a screen.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — how authenticator apps take a secret by hand. */
export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }

  // A 20-byte secret is 160 bits, an exact multiple of five, so this tail never
  // runs for our own secrets. It is here because the function is general and a
  // silently truncated final character would be a miserable bug to find.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function base32Decode(text: string): Uint8Array {
  // Tolerant on input by design. What comes back is whatever the user retyped
  // from a screen or pasted out of a password manager: lowercase, grouped into
  // readable runs with spaces, and sometimes padded because some encoders pad.
  const cleaned = text.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();

  const out = new Uint8Array(Math.floor((cleaned.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let written = 0;

  for (let i = 0; i < cleaned.length; i += 1) {
    const index = ALPHABET.indexOf(cleaned[i]);
    // Throwing rather than skipping the character: a secret that decodes to
    // *something* after dropping a typo produces an enrolment that silently
    // never matches, and the user has no way to tell that from a broken clock.
    if (index < 0) throw new Error(`not base32: ${JSON.stringify(cleaned[i])}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[written] = (value >>> bits) & 255;
      written += 1;
    }
  }

  return out.subarray(0, written);
}

/** The otpauth:// URI an authenticator app scans or accepts pasted. */
export function otpauthUri(secret: Uint8Array, handle: string, issuer: string): string {
  // The label is `issuer:handle` and the `issuer` parameter repeats it. The
  // duplication is the de-facto convention: older apps read only the label
  // prefix, newer ones only the parameter, and disagreeing between the two is
  // how an account ends up filed under the wrong name in someone's app.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(handle)}`;
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

async function sha1Key(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
}

/**
 * RFC 6238's counter: the step number as a 64-bit big-endian integer.
 *
 * Built with division rather than shifts on purpose. JavaScript's bitwise
 * operators coerce to 32 bits, so `step >>> 32` is `step >>> 0` and the high
 * word silently comes out equal to the low one. It costs nothing today — step
 * numbers stay under 2^32 until the year 6053 — but it is the classic bug in
 * every hand-rolled TOTP, and it fails in a way no test written against a
 * present-day clock can catch.
 */
function counterBytes(step: number): Uint8Array {
  const buffer = new Uint8Array(8);
  let high = Math.floor(step / 0x1_0000_0000);
  let low = step >>> 0;
  for (let i = 7; i >= 4; i -= 1) {
    buffer[i] = low & 255;
    low = Math.floor(low / 256);
  }
  for (let i = 3; i >= 0; i -= 1) {
    buffer[i] = high & 255;
    high = Math.floor(high / 256);
  }
  return buffer;
}

async function codeForStep(secret: Uint8Array, step: number): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await sha1Key(secret), counterBytes(step)));

  // Dynamic truncation, RFC 4226 §5.3. The low nibble of the last byte picks
  // where in the digest to read from, so which four bytes decide the code varies
  // per code; the high bit of the first of them is masked off so the result is
  // read the same way by implementations with and without signed 32-bit ints.
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The 6-digit code for a given time. Exported for tests as well as for verify. */
export function totpCode(secret: Uint8Array, atMs: number): Promise<string> {
  return codeForStep(secret, Math.floor(atMs / 1000 / STEP_SECONDS));
}

/**
 * Verify a user-supplied code, allowing one step either side of now for clock
 * drift. Returns the matched step index (for replay rejection by the caller),
 * or null.
 *
 * The step index rather than a boolean, because a code stays valid for its whole
 * step and then for the drift window after it — long enough for someone who
 * reads it over a shoulder or off a shared screen to spend it a second time. The
 * caller stores the step it last accepted for an account and refuses anything
 * that is not strictly newer, which turns a one-time password into one that is
 * actually used once.
 */
export async function verifyTotp(
  secret: Uint8Array,
  code: string,
  nowMs: number = Date.now(),
): Promise<number | null> {
  // Apps display "123 456", and people copy what they see. Strip whitespace
  // first, then insist on exactly six digits — this rejects the empty field, a
  // pasted otpauth URI and a backup code before any crypto runs, so a malformed
  // submission cannot be told apart from a wrong one by how long it took.
  const normalised = code.replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(normalised)) return null;

  const supplied = encoder.encode(normalised);
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);

  let matched: number | null = null;
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const step = current + offset;
    const expected = encoder.encode(await codeForStep(secret, step));
    // `timingSafeEqual` over the bytes rather than `===` on the strings: string
    // comparison stops at the first differing digit, and the digits are the
    // secret here. Every candidate is checked even after one matches, so the
    // response time does not disclose which step in the window was accepted.
    if (timingSafeEqual(supplied, expected)) matched = step;
  }

  return matched;
}

// Encryption at rest ---------------------------------------------------------
//
// `totp.secret_enc` is a shared secret: unlike a password hash or a wrapped key
// slot, whatever is in that column is enough to generate codes. §9 lists it as
// second-factor material that never leaves the server, so it is encrypted under
// a Worker secret rather than stored raw, and a D1 leak on its own then yields
// nothing that produces a code.

/**
 * `TOTP_ENC_KEY` is a generated high-entropy secret, not a password — nobody
 * types it and it has no dictionary to be attacked with. So it is hashed once to
 * get 256 bits of key material rather than stretched: a KDF's iteration count
 * exists to price guessing attempts, and there is nothing here to guess.
 */
async function aesKey(key: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** AES-GCM wrap of the secret at rest, under the TOTP_ENC_KEY worker secret. */
export async function encryptSecret(key: string, secret: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key), secret),
  );

  // The IV is prepended rather than stored in a second column. It is not secret,
  // it is only ever meaningful alongside this exact ciphertext, and one BLOB
  // cannot be half-restored from a backup the way two columns can.
  const blob = new Uint8Array(iv.length + cipher.length);
  blob.set(iv, 0);
  blob.set(cipher, iv.length);
  return blob;
}

export async function decryptSecret(key: string, blob: Uint8Array): Promise<Uint8Array> {
  const iv = blob.subarray(0, IV_BYTES);
  const cipher = blob.subarray(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(key), cipher);
  return new Uint8Array(plain);
}
