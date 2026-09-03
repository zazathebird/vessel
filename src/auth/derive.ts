/**
 * Password stretching, in the browser, where it belongs.
 *
 * **The password never reaches the server** (SPEC-ACCOUNTS.md §4). The browser
 * runs PBKDF2 over the password and a per-account salt, then splits the result
 * with HKDF into two independent values:
 *
 *   - an **auth secret**, sent to the Worker, which stores only an HMAC of it
 *     under a pepper;
 *   - a **wrapping key**, which never leaves this machine and opens the
 *     account's key slot (§5).
 *
 * The split is the whole point. The server holds one half and cannot compute
 * the other, so a full database leak yields no way to open a single grant key.
 * HKDF gives that property honestly: the two outputs are independent given
 * different `info` strings, and knowing one reveals nothing about the other.
 *
 * Three reasons this shape beats a conventional server-side hash, all from §4:
 * the plaintext never touches the operator's infrastructure at all; it sidesteps
 * the Worker CPU ceiling, since the browser is doing the work for exactly one
 * user and has no such cap; and the browser has to derive a wrapping key anyway
 * to open its key slot, so this is one derivation with two outputs rather than
 * two unrelated ones.
 *
 * The honest cost, also from §4: the auth secret is password-equivalent **in
 * transit**. It rides TLS, it is never logged, and it never appears in a URL.
 */

import { randomBytes, toBase64Url } from "./encoding";
import { normaliseRecoveryCode } from "./recoveryCodes";

/**
 * OWASP's floor for PBKDF2-HMAC-SHA-256, and about a second of work on a
 * mid-range phone. The count is stored per account rather than assumed, so
 * raising it later is a re-derivation on next sign-in rather than a flag day —
 * and so an account created today keeps working when the default moves.
 */
export const DEFAULT_ITERATIONS = 600_000;

/**
 * Recovery codes are stretched far less, and the difference is not a compromise.
 * A password is human-chosen and might hold thirty bits; a recovery code is 100
 * bits straight from the CSPRNG (see ./recoveryCodes.ts). Stretching defends
 * against guessing, and there is nothing here to guess — an attacker who cannot
 * search 2^100 is not helped by our making each attempt slower. What this count
 * does buy is that signup wraps ten of them, and 600k each would cost ten
 * seconds of a user's first impression for no security at all.
 */
export const RECOVERY_ITERATIONS = 100_000;

const SALT_BYTES = 16;

/**
 * The browser derives with whatever iteration count `challenge` hands back, so
 * anything that can forge that one response could otherwise say `iterations: 1`
 * and quietly strip the whole stretch — an *active* downgrade, strictly worse
 * than the logged-authSecret grinding already flagged for client sign-off
 * (CLAUDE.md item 2). Refuse rather than clamp: a count we silently "corrected"
 * would derive a secret the server does not hold and fail as a wrong password,
 * and this failure should say what it actually is.
 *
 * The floor is the constant each credential kind has always used; if a default
 * ever rises, the floor stays at the oldest count ever deployed, or existing
 * accounts stop signing in. The ceiling stops a hostile `iterations: 1e9` from
 * hanging the tab.
 */
const MAX_ITERATIONS = 10_000_000;

export function checkIterations(iterations: number, floor: number): number {
  if (!Number.isInteger(iterations) || iterations < floor || iterations > MAX_ITERATIONS) {
    throw new Error("The server sent implausible key-derivation parameters. Refusing.");
  }
  return iterations;
}

/**
 * The *other* half of the same response, which was unguarded.
 *
 * `challenge` hands back two KDF parameters and only one of them was checked.
 * The salt went into PBKDF2 with no length, type or shape test at any call
 * site, so anything that could forge that response — the threat `checkIterations`
 * above is written against — could send `salt: ""` (legal in WebCrypto) or one
 * constant salt to every account, and the whole point of a salt is gone: a
 * single precomputation, reusable across every account and, with a constant,
 * across every deployment. That converts the offline-grinding risk already
 * flagged for client sign-off (CLAUDE.md item 2) from per-account work into one
 * table — and the same table yields the *wrapping* key, which is the half this
 * file's header promises the server cannot compute.
 *
 * The salt is generated in the browser at signup (`newKdfParams`), so
 * `challenge` is the only place a client ever accepts a server-chosen one, and
 * the Worker itself already refuses anything but 16 bytes on the way in
 * (`worker/accounts.ts`, `KDF_SALT_BYTES`). This is the browser declining to
 * take the server's word for a value it can check for itself.
 *
 * Refuse, never clamp or pad, for exactly `checkIterations`' reason: a
 * "corrected" salt derives a secret the server does not hold, and the failure
 * would present as a wrong password. Same wording, deliberately — from where the
 * person is standing it is the same fault.
 *
 * **What this does not close, so nobody later reads it as complete:** a forged
 * `challenge` returning a *plausible* 16 random bytes — one attacker-chosen
 * salt per account, or the same 16 bytes to everybody — passes this check and
 * always will. The client has nothing to compare against; the salt is stored
 * only on the server, and there is no second channel to confirm it over. What
 * the length check buys is that the degenerate cases, which are the ones worth
 * a precomputed table, are refused. The residual belongs to the protocol.
 */
export function checkSalt(salt: Uint8Array): Uint8Array {
  if (!(salt instanceof Uint8Array) || salt.length !== SALT_BYTES) {
    throw new Error("The server sent implausible key-derivation parameters. Refusing.");
  }
  return salt;
}

/** The stored, per-account KDF parameters. Sent to the browser before sign-in. */
export interface KdfParams {
  salt: Uint8Array;
  iterations: number;
}

export function newKdfParams(): KdfParams {
  return { salt: randomBytes(SALT_BYTES), iterations: DEFAULT_ITERATIONS };
}

/**
 * The two halves. `authSecret` is base64url and goes on the wire; `wrappingKey`
 * is an AES-KW key that is deliberately **not extractable**, so nothing — not
 * even our own later code, and not hostile code injected into this origin — can
 * read it back out of the browser once derived.
 */
export interface DerivedCredential {
  authSecret: string;
  wrappingKey: CryptoKey;
}

async function pbkdf2(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  // NFKC before encoding (NIST 800-63B §5.1.1.2): é typed composed on one
  // platform and decomposed on another is the same password to its owner and
  // must be the same bytes here — there is no email reset behind a mismatch.
  // A no-op for ASCII, so recovery codes are unaffected. Added 2026-08-13; a
  // pre-existing password containing *non-normalised* non-ASCII would derive
  // differently from that day — recovery codes are the way back in.
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    256,
  );
}

/**
 * Split one KDF output into the two independent halves.
 *
 * `info` is what separates them, so the strings are versioned: if the scheme
 * ever changes, `v2` derives different bytes from the same password rather than
 * colliding with what is already stored.
 */
async function split(
  ikm: ArrayBuffer,
  salt: Uint8Array,
): Promise<DerivedCredential> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits", "deriveKey"]);

  const authBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: encoder.encode("vessel/auth/v1"),
    },
    key,
    256,
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: encoder.encode("vessel/wrap/v1"),
    },
    key,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );

  return { authSecret: toBase64Url(authBits), wrappingKey };
}

/*
 * Both entry points check the salt here rather than leaving it to their callers,
 * and that is the difference between this guard and `checkIterations`.
 *
 * There are eight places a server-supplied salt enters the browser
 * (`flows.ts` ×5, `passkeys.ts` ×2, `share/unlock.ts` ×1), every one of them
 * `salt: fromBase64Url(kdf.salt)` inside a `KdfParams` literal, and every one of
 * them ends up in one of these two functions. A guard the caller has to
 * remember is a guard the ninth caller forgets — the same reasoning
 * `worker/accounts.ts` records for keeping rate limiting inside `assertPassword`
 * rather than in its callers. Checked before `pbkdf2`, so a bad parameter costs
 * nothing and fails where it can still be explained.
 */
export async function deriveFromPassword(
  password: string,
  params: KdfParams,
): Promise<DerivedCredential> {
  const salt = checkSalt(params.salt);
  return split(await pbkdf2(password, salt, params.iterations), salt);
}

/**
 * The same two-part derivation for a recovery code, so a redeemed code proves
 * itself to the server *and* opens its own key slot — which is what lets §4's
 * second recovery path preserve grant authority in full rather than merely
 * restoring account access.
 */
export async function deriveFromRecoveryCode(
  code: string,
  params: KdfParams,
): Promise<DerivedCredential> {
  const salt = checkSalt(params.salt);
  return split(await pbkdf2(normaliseRecoveryCode(code), salt, params.iterations), salt);
}
