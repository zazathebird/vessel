/**
 * Signup and sign-in, as sequences.
 *
 * These are the functions the eventual account screens call. Everything
 * cryptographic lives in the three modules below this one; everything network
 * lives in `./api`. This file is the order the two happen in, and that order is
 * the part worth getting right — it is where a password could accidentally be
 * sent, or a key slot accidentally not written.
 *
 * There is no UI here on purpose. SPEC-ACCOUNTS.md §7 and §12 H fix phase 1's
 * internal order: **authentication works end to end before any interface work
 * starts**, because "building a command palette on top of a sign-in that does
 * not yet work is how the interesting part gets finished and the load-bearing
 * part does not."
 */

import { api, type PublicAccount, type SignInResult } from "./api";
import {
  DEFAULT_ITERATIONS,
  RECOVERY_ITERATIONS,
  deriveFromPassword,
  deriveFromRecoveryCode,
  newKdfParams,
  type KdfParams,
} from "./derive";
import { fromBase64Url, toBase64Url } from "./encoding";
import { SLOT_ALG, destroy, generateGrantKey, unwrapSlot, wrapSlot } from "./grantKey";
import { newRecoveryCodes } from "./recoveryCodes";

/**
 * The one password rule, and the only place it can live.
 *
 * The Worker cannot enforce this — by the time a request reaches it the password
 * is a uniform 256-bit derived value and every password looks the same — so a
 * check here is not defence in depth, it is the whole defence. That is a fair
 * trade for never sending the password (§4), but it means this constant is
 * load-bearing rather than cosmetic.
 *
 * Twelve rather than eight because there is no email-based reset behind it: §4's
 * fourth recovery path is "nothing", and a guessed password on an account with
 * no second factor yet is not recoverable by anyone.
 */
export const MIN_PASSWORD_LENGTH = 12;

export interface SignupResult {
  account: PublicAccount;
  /** Shown once, never again — only hashes and wrapped slots are stored (§4). */
  recoveryCodes: string[];
}

/**
 * Create an account.
 *
 * The sequence matters and reads top to bottom: derive, generate the grant
 * keypair, wrap it once per credential, send **only** the auth secrets, the
 * public key and the wrapped slots. The password and the wrapping keys never
 * appear in the payload, and the grant private scalar is overwritten as soon as
 * the last slot is sealed.
 */
export async function signUp(handle: string, password: string): Promise<SignupResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const params = newKdfParams();
  const passwordCredential = await deriveFromPassword(password, params);

  const grant = await generateGrantKey();
  const recoveryCodes = newRecoveryCodes();
  const recoveryParams: KdfParams = { salt: params.salt, iterations: RECOVERY_ITERATIONS };

  try {
    const passwordSlot = await wrapSlot(grant.scalar, passwordCredential.wrappingKey);

    // One slot per code, so any single code recovers the same grant key (§5).
    // Sequential rather than concurrent: ten PBKDF2 runs in parallel is ten
    // threads of work on a phone, and the wall-clock saving is not worth a
    // browser that stops painting mid-signup.
    const recovery = [];
    for (const code of recoveryCodes) {
      const derived = await deriveFromRecoveryCode(code, recoveryParams);
      recovery.push({
        authSecret: derived.authSecret,
        slot: toBase64Url(await wrapSlot(grant.scalar, derived.wrappingKey)),
      });
    }

    const { account } = await api.signup({
      handle,
      kdf: {
        salt: toBase64Url(params.salt),
        iterations: params.iterations,
        recoveryIterations: RECOVERY_ITERATIONS,
      },
      authSecret: passwordCredential.authSecret,
      grantPubkey: toBase64Url(grant.publicKeyRaw),
      passwordSlot: toBase64Url(passwordSlot),
      slotAlg: SLOT_ALG,
      recovery,
    });

    return { account, recoveryCodes };
  } finally {
    // Whether the request succeeded or threw, the scalar has no further use in
    // this tab. Best-effort — see the note on `destroy`.
    destroy(grant.scalar);
  }
}

/**
 * Sign in with a password.
 *
 * Two round trips, because the browser cannot derive without the account's salt
 * and iteration count. The first is `challenge`, which answers for handles that
 * do not exist as readily as for ones that do — so a wrong handle is discovered
 * at the same moment, and with the same message, as a wrong password.
 */
export async function signIn(handle: string, password: string): Promise<SignInResult> {
  const { kdf } = await api.challenge(handle);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: kdf.iterations,
  });
  return api.signin({ handle, authSecret: derived.authSecret });
}

/**
 * Sign in by redeeming a recovery code — §4's second recovery path, and the only
 * one besides a second credential that keeps grant authority intact.
 *
 * The code is spent by this call: the server marks it used and deletes its key
 * slot. The caller is expected to send the user straight to setting a new
 * password, which writes a fresh password slot from the grant key this code just
 * opened. Until that happens the account has one fewer way in than it started
 * with, which is worth saying on the screen rather than only here.
 */
export async function signInWithRecoveryCode(
  handle: string,
  code: string,
): Promise<{ result: SignInResult; grantKey: CryptoKey | null }> {
  const { kdf } = await api.challenge(handle);
  const derived = await deriveFromRecoveryCode(code, {
    salt: fromBase64Url(kdf.salt),
    iterations: kdf.recoveryIterations,
  });
  const result = await api.signin({ handle, authSecret: derived.authSecret, kind: "recovery" });

  // **Open the slot here or lose it.** The wrapping key exists only in this
  // function's scope: it came from the code the user just typed, and that code
  // is now spent. If this returns without unwrapping, the account's grant key is
  // sealed in ciphertext that nothing can ever open again — and §5's claim that
  // a recovery code "preserves grant authority in full" quietly becomes false.
  //
  // Null when the sign-in still needs a second factor; the caller finishes that
  // step and the slot comes back with it.
  const grantKey =
    result.status === "signed-in" && result.keySlot
      ? await unwrapSlot(
          fromBase64Url(result.keySlot.wrappedGrantKey),
          derived.wrappingKey,
          fromBase64Url(result.keySlot.grantPubkey),
        )
      : null;

  return { result, grantKey };
}

/**
 * Open the account's grant key for exactly one operation.
 *
 * §3's first mitigation against a compromised frontend: the key is unwrapped for
 * a single signature and not held unwrapped for the session, and the password is
 * re-entered to do it. Hostile code in this origin therefore cannot sign a grant
 * at a moment of its own choosing — it has to wait for the user to decide to,
 * and what it gets is a handle that stops working the moment this promise
 * settles.
 *
 * Phase 3 is what calls this. It is here now because a key slot that has never
 * been reopened is a slot nobody has really tested.
 */
export async function openGrantKey(password: string, totpCode: string): Promise<CryptoKey> {
  // §3 is explicit that on a password account the gesture is "a re-entered
  // password **plus a TOTP code**", and the code is required here rather than
  // optional so this function cannot be adopted in phase 3 as a
  // password-only path by someone reading its signature instead of the spec.
  //
  // The server-side half is not built: `/api/account/slot` today authorises on
  // the session alone. Before anything signs a real grant, that endpoint must
  // require this code too — a check the browser makes and the server does not is
  // not a check.
  if (!/^[0-9]{6}$/.test(totpCode.replace(/\s/g, ""))) {
    throw new Error("Enter the six-digit code from your authenticator.");
  }

  const [{ kdf }, slot] = await Promise.all([
    api.challenge(await currentHandle()),
    api.keySlot(),
  ]);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: kdf.iterations,
  });
  return unwrapSlot(
    fromBase64Url(slot.wrappedGrantKey),
    derived.wrappingKey,
    fromBase64Url(slot.grantPubkey),
  );
}

async function currentHandle(): Promise<string> {
  const { account } = await api.me();
  return account.handle;
}

/** Re-exported so a screen can show the count without importing the KDF module. */
export { DEFAULT_ITERATIONS };
