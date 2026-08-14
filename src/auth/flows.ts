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
  checkIterations,
  deriveFromPassword,
  deriveFromRecoveryCode,
  newKdfParams,
  type KdfParams,
} from "./derive";
import { fromBase64Url, toBase64Url } from "./encoding";
import { SLOT_ALG, destroy, generateGrantKey, rewrapSlot, unwrapSlot, wrapSlot } from "./grantKey";
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
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
  return api.signin({ handle, authSecret: derived.authSecret });
}

/**
 * A recovery sign-in in progress, and the two things that can still be done with
 * it. Returned rather than a bare result because both of them need the wrapping
 * key derived from the code, and that key must not escape into caller-held state.
 */
export interface RecoverySignIn {
  result: SignInResult;
  /**
   * Finish the second factor, when `result.status` asked for one. Returns the
   * updated result and makes `setPassword` usable.
   */
  completeSecondFactor(code: string): Promise<SignInResult>;
  /** Whether the key slot and its ticket are in hand — false until sign-in completes. */
  canSetPassword(): boolean;
  /** Re-seal the account's grant key under a new password, and write it. */
  setPassword(newPassword: string): Promise<void>;
}

/**
 * Sign in by redeeming a recovery code — §4's second recovery path, and the only
 * one besides a second credential that keeps grant authority intact.
 *
 * The code is spent by this call. What comes back with the sign-in is the code's
 * own key slot, and the caller is expected to walk the user straight to
 * `setPassword`, which re-seals that same grant key under a password they choose.
 * Until that happens the account has one fewer way in than it started with, which
 * is worth saying on the screen rather than only here.
 *
 * **Why this returns an object with methods rather than a result and a key.**
 * Two things are needed to finish recovery and neither may be handed to the
 * caller:
 *
 * 1. *The wrapping key derived from the code.* It exists only here, because the
 *    code is now spent and cannot be re-derived from. An earlier version of this
 *    function returned only the result and an unwrapped key — which meant that on
 *    an account **with a second factor** the wrapping key went out of scope at the
 *    `return`, and the key slot that arrived after TOTP could never be opened.
 *    Recovery silently worked for accounts without 2FA and stranded the grant key
 *    of every account with it. Holding the key in this closure, and finishing TOTP
 *    through `completeSecondFactor`, is what closes that hole.
 * 2. *The slot as ciphertext.* Not as an opened `CryptoKey` — `unwrapSlot`
 *    deliberately returns a **non-extractable** key, which cannot be re-wrapped
 *    into a new slot. Setting a password therefore goes ciphertext-to-ciphertext
 *    through `rewrapSlot`, exactly as `changePassword` does, and the scalar never
 *    exists as bytes in this program.
 */
export async function signInWithRecoveryCode(
  handle: string,
  code: string,
): Promise<RecoverySignIn> {
  const { kdf } = await api.challenge(handle);
  const salt = fromBase64Url(kdf.salt);
  const derived = await deriveFromRecoveryCode(code, {
    salt,
    iterations: checkIterations(kdf.recoveryIterations, RECOVERY_ITERATIONS),
  });
  const result = await api.signin({ handle, authSecret: derived.authSecret, kind: "recovery" });

  // Filled by whichever call actually completes the sign-in — this one, or
  // `completeSecondFactor` below.
  let slot = result.status === "signed-in" ? result.keySlot : undefined;
  let ticket = result.status === "signed-in" ? result.setPasswordTicket : undefined;

  return {
    result,

    async completeSecondFactor(secondFactor: string): Promise<SignInResult> {
      if (result.status !== "totp-required") {
        throw new Error("This sign-in is not waiting for a second factor.");
      }
      const finished = await api.totp(result.ticket, secondFactor.replace(/\s/g, ""));
      if (finished.status === "signed-in") {
        slot = finished.keySlot;
        ticket = finished.setPasswordTicket;
      }
      return finished;
    },

    canSetPassword(): boolean {
      return Boolean(slot && ticket);
    },

    async setPassword(newPassword: string): Promise<void> {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      if (!slot || !ticket) {
        throw new Error("Finish signing in before setting a password.");
      }

      // **The same salt the recovery code used**, and for the reason spelled out
      // on `changePassword`: the account's other nine codes were derived against
      // it, and rolling it here would kill all nine at the exact moment their
      // owner has just proved they depend on them.
      const next = await deriveFromPassword(newPassword, { salt, iterations: DEFAULT_ITERATIONS });

      const rewrapped = await rewrapSlot(
        fromBase64Url(slot.wrappedGrantKey),
        derived.wrappingKey,
        next.wrappingKey,
      );

      await api.setPassword({
        ticket,
        authSecret: next.authSecret,
        iterations: DEFAULT_ITERATIONS,
        passwordSlot: toBase64Url(rewrapped),
        slotAlg: SLOT_ALG,
      });

      // Single-use on the server, and single-use here too, so a screen that
      // somehow submits twice gets a clear local error rather than a 401.
      ticket = undefined;
    },
  };
}

/**
 * A two-factor enrolment in progress. Like `RecoverySignIn`, it is an object
 * with a method because something derived must stay in a closure: both halves
 * of enrolment demand the password's auth secret — a credential change demands
 * the credential (§4) — and holding the derived secret here means the password
 * is asked for once, lives as long as this object, and never sits in a
 * component's state between the two requests.
 */
export interface TotpEnrolment {
  /** Base32, for typing into an authenticator by hand. */
  secret: string;
  /** The same secret as an `otpauth://` URI, for apps that accept a pasted URI. */
  uri: string;
  /**
   * Prove the authenticator holds the secret. Returns the ten backup codes,
   * which the server keeps only hashes of — show them once and say so.
   */
  confirm(code: string): Promise<string[]>;
}

/**
 * Begin two-factor enrolment on the signed-in account.
 *
 * §4 requires the secret be shown both as a manual string and as an
 * `otpauth://` URI, and both come back from the enrol call. There is no QR
 * code and there will not be one — rendering one needs a library, and the
 * no-third-party rule outranks the convenience. The strings are the spec.
 *
 * A wrong password fails at the enrol call with the Worker's wording. An
 * unconfirmed earlier attempt is replaced by beginning again, which is why
 * this can be called freely; a *confirmed* enrolment is refused server-side,
 * and clearing it is the operator's `reset 2FA`, not a route.
 */
export async function beginTotpEnrolment(password: string): Promise<TotpEnrolment> {
  const { account } = await api.me();
  const { kdf } = await api.challenge(account.handle);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
  const { secret, uri } = await api.totpEnrol({ authSecret: derived.authSecret });

  return {
    secret,
    uri,
    async confirm(code: string): Promise<string[]> {
      const { backupCodes } = await api.totpConfirm({
        code: code.replace(/\s/g, ""),
        authSecret: derived.authSecret,
      });
      return backupCodes;
    },
  };
}

/**
 * Change the password on a signed-in account.
 *
 * The grant key does not change and must not: every slot holds the same key, and
 * replacing it would orphan the recovery codes and invalidate anything it has
 * ever signed. What changes is the lock on the password's copy of it, which is
 * why this is a re-wrap rather than a fresh generation.
 *
 * **The salt is deliberately reused.** At signup the recovery codes are derived
 * with the *password's* salt (`recoveryParams` above) and `challenge` hands that
 * one salt back for both derivations. Rolling a new salt here would therefore
 * leave every recovery code deriving against a salt nothing uses any more — ten
 * codes silently dead, discovered by the person who needed one. The iteration
 * count is free to rise, because recovery carries its own count.
 *
 * A wrong current password fails in `rewrapSlot`, locally, before anything is
 * sent anywhere.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword === currentPassword) {
    throw new Error("That is the password you already have.");
  }

  const { account } = await api.me();
  const { kdf } = await api.challenge(account.handle);
  const salt = fromBase64Url(kdf.salt);

  const current = await deriveFromPassword(currentPassword, {
    salt,
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
  const next = await deriveFromPassword(newPassword, { salt, iterations: DEFAULT_ITERATIONS });

  const slot = await api.keySlot(current.authSecret);
  const rewrapped = await rewrapSlot(
    fromBase64Url(slot.wrappedGrantKey),
    current.wrappingKey,
    next.wrappingKey,
  );

  await api.changePassword({
    currentAuthSecret: current.authSecret,
    authSecret: next.authSecret,
    iterations: DEFAULT_ITERATIONS,
    passwordSlot: toBase64Url(rewrapped),
    slotAlg: SLOT_ALG,
  });
}

/**
 * Open the account's grant key for exactly one operation.
 *
 * §3's first mitigation against a compromised frontend: the key is unwrapped for
 * a single signature and not held unwrapped for the session, and the password is
 * re-entered to do it. Hostile code in this origin therefore cannot sign a grant
 * at a moment of its own choosing — it has to wait for the user to decide to.
 * Be honest about the scope of that: WebCrypto has no revocation, so what it
 * captures at that moment is a live `CryptoKey` that signs for as long as the
 * tab does. The mitigation is *timing* (no standing unwrapped key to steal
 * between gestures), not containment. If phase 3 wants containment, the shape
 * is a `signOnce(password, code, payload)` that never returns the key at all.
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
  // The password half is now server-checked: `/api/account/slot` demands the
  // derived `authSecret` (rate-limited via `assertPassword`). The TOTP half
  // deliberately is not — the slot bytes are the same whatever the caller
  // intends, so a code requirement there could not tell this gesture from
  // §12 K's password-only connect. The server-side TOTP check belongs to the
  // phase-3 grant-*submission* endpoint, which sees the signed grant itself;
  // build it before anything accepts a real grant.
  if (!/^[0-9]{6}$/.test(totpCode.replace(/\s/g, ""))) {
    throw new Error("Enter the six-digit code from your authenticator.");
  }

  const { kdf } = await api.challenge(await currentHandle());
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
  const slot = await api.keySlot(derived.authSecret);
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
