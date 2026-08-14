/**
 * Passkeys, browser side (SPEC-ACCOUNTS.md §4, Passkeys; §5, key slots).
 *
 * A passkey is another credential wrapping the **same** grant key: the WebAuthn
 * `prf` extension yields 32 deterministic bytes per credential, HKDF turns them
 * into an AES-KW wrapping key, and the account's grant key is re-wrapped under
 * it — ciphertext to ciphertext through `rewrapSlot`, exactly as a password
 * change works. The Worker stores one more slot it cannot open. When the
 * authenticator has no `prf`, the passkey registers with **no slot** (§5: "the
 * fallback is a missing slot rather than a different design") — it signs in,
 * and that is all it can do.
 *
 * **The `Authenticator` seam is what makes this testable.** `navigator.
 * credentials` does not exist under Node, and a harness that skipped these
 * flows would leave the wire format proven only against itself. Every flow
 * takes an authenticator and defaults to the platform one; the e2e harness
 * passes a software authenticator (`scripts/webauthn-sim.ts`) that produces
 * the same CBOR and DER shapes a real one does.
 */

import { api, type PasskeySignInResult } from "./api";
import { DEFAULT_ITERATIONS, checkIterations, deriveFromPassword } from "./derive";
import { fromBase64Url, randomBytes, toBase64Url } from "./encoding";
import { SLOT_ALG, rewrapSlot } from "./grantKey";

/**
 * The `prf` evaluation input. Fixed and public — the secrecy is entirely in the
 * authenticator, which HMACs this with a per-credential key that never leaves
 * it. Versioned like the HKDF info strings in `derive.ts`, and for the same
 * reason: changing it changes every derived wrapping key.
 */
export const PRF_INPUT = new TextEncoder().encode("vessel/prf/v1");

export interface AuthenticatorAttestation {
  id: Uint8Array;
  clientDataJSON: Uint8Array;
  attestationObject: Uint8Array;
  /** The evaluated `prf` bytes, or null when the authenticator cannot. */
  prfOutput: Uint8Array | null;
}

export interface AuthenticatorAssertion {
  id: Uint8Array;
  clientDataJSON: Uint8Array;
  authenticatorData: Uint8Array;
  signature: Uint8Array;
  prfOutput: Uint8Array | null;
}

export interface Authenticator {
  create(options: {
    challenge: Uint8Array;
    accountId: string;
    handle: string;
  }): Promise<AuthenticatorAttestation>;
  get(options: { challenge: Uint8Array; allowId?: Uint8Array }): Promise<AuthenticatorAssertion>;
}

export function webAuthnSupported(): boolean {
  return typeof PublicKeyCredential !== "undefined";
}

/**
 * A dismissed prompt arrives as a `NotAllowedError` DOMException whose message
 * was written for developers. §10 requires words a person can act on.
 */
function humanise(cause: unknown): never {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    throw new Error("The passkey prompt was dismissed or timed out. Try again when you are ready.");
  }
  throw cause;
}

/** The real one: `navigator.credentials`, with `prf` requested both ways. */
export const platformAuthenticator: Authenticator = {
  async create({ challenge, accountId, handle }) {
    let created: Credential | null;
    try {
      created = await navigator.credentials.create({
        publicKey: {
          challenge: challenge as BufferSource,
          rp: { name: "mcclevarty.ca" },
          // The user id is the account id: stable, so re-registering on the
          // same authenticator replaces rather than multiplies, and §9-clean —
          // it is the same opaque id the server already holds.
          user: {
            id: new TextEncoder().encode(accountId),
            name: handle,
            displayName: handle,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
          attestation: "none",
          extensions: { prf: { eval: { first: PRF_INPUT } } } as AuthenticationExtensionsClientInputs,
        },
      });
    } catch (cause) {
      humanise(cause);
    }
    if (!(created instanceof PublicKeyCredential)) {
      throw new Error("No passkey was created.");
    }

    const response = created.response as AuthenticatorAttestationResponse;
    const extensions = created.getClientExtensionResults() as {
      prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
    };

    let prfOutput: Uint8Array | null = extensions.prf?.results?.first
      ? new Uint8Array(extensions.prf.results.first)
      : null;
    if (!prfOutput && extensions.prf?.enabled) {
      // Some browsers evaluate `prf` only at assertion time. The immediate
      // `get` costs one more verification gesture, once, at registration.
      const assertion = await this.get({
        challenge: randomBytes(32),
        allowId: new Uint8Array(created.rawId),
      });
      prfOutput = assertion.prfOutput;
    }

    return {
      id: new Uint8Array(created.rawId),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      attestationObject: new Uint8Array(response.attestationObject),
      prfOutput,
    };
  },

  async get({ challenge, allowId }) {
    let asserted: Credential | null;
    try {
      asserted = await navigator.credentials.get({
        publicKey: {
          challenge: challenge as BufferSource,
          userVerification: "required",
          ...(allowId
            ? { allowCredentials: [{ type: "public-key", id: allowId as BufferSource }] }
            : {}),
          extensions: { prf: { eval: { first: PRF_INPUT } } } as AuthenticationExtensionsClientInputs,
        },
      });
    } catch (cause) {
      humanise(cause);
    }
    if (!(asserted instanceof PublicKeyCredential)) {
      throw new Error("No passkey answered.");
    }

    const response = asserted.response as AuthenticatorAssertionResponse;
    const extensions = asserted.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };

    return {
      id: new Uint8Array(asserted.rawId),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      authenticatorData: new Uint8Array(response.authenticatorData),
      signature: new Uint8Array(response.signature),
      prfOutput: extensions.prf?.results?.first
        ? new Uint8Array(extensions.prf.results.first)
        : null,
    };
  },
};

/**
 * `prf` bytes → AES-KW wrapping key, non-extractable like every wrapping key in
 * this system. Exported for the harness, which proves the slot it wraps opens
 * the account's original grant key.
 */
export async function prfWrappingKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("vessel/prf/v1"),
      info: encoder.encode("vessel/wrap/passkey/v1"),
    },
    key,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export interface AddPasskeyResult {
  /**
   * Whether the passkey carries a key slot. False means the authenticator has
   * no `prf`: the passkey signs in but can never open the grant key, which the
   * screen should say rather than leave to be discovered.
   */
  slotWrapped: boolean;
}

/**
 * Add a passkey to the signed-in account.
 *
 * The password is asked for because adding a credential is a credential change
 * (§4, and `assertPassword` on the Worker refuses without it) — and because it
 * is what opens the password slot so the grant key can be re-wrapped for the
 * new credential without ever existing as bytes here. A wrong password fails
 * locally at the re-wrap, before the registration is sent.
 */
export async function addPasskey(
  password: string,
  label: string,
  authenticator: Authenticator = platformAuthenticator,
): Promise<AddPasskeyResult> {
  const { account } = await api.me();
  const { kdf } = await api.challenge(account.handle);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });

  const { token, challenge } = await api.passkeyChallenge();
  const created = await authenticator.create({
    challenge: fromBase64Url(challenge),
    accountId: account.id,
    handle: account.handle,
  });

  let slot: string | undefined;
  if (created.prfOutput) {
    const source = await api.keySlot();
    // Decoding and the prf key derivation happen *outside* the try: a slot that
    // will not even parse is corrupt data from the server, and reporting it as
    // "wrong password" points the user at exactly the wrong remedy (a reset —
    // which deletes this slot). Only the AES-KW re-wrap itself means that.
    const sourceBytes = fromBase64Url(source.wrappedGrantKey);
    const prfKey = await prfWrappingKey(created.prfOutput);
    let rewrapped: Uint8Array;
    try {
      rewrapped = await rewrapSlot(sourceBytes, derived.wrappingKey, prfKey);
    } catch {
      // AES-KW fails closed on a wrong key, which here means a wrong password —
      // the same local refusal `changePassword` relies on.
      throw new Error("That is not your password.");
    }
    slot = toBase64Url(rewrapped);
  }

  const { slotWrapped } = await api.passkeyRegister({
    authSecret: derived.authSecret,
    token,
    label,
    credential: {
      id: toBase64Url(created.id),
      clientDataJSON: toBase64Url(created.clientDataJSON),
      attestationObject: toBase64Url(created.attestationObject),
    },
    ...(slot ? { slot, slotAlg: SLOT_ALG } : {}),
  });
  return { slotWrapped };
}

/**
 * Remove a passkey. Same password rule as adding one; the Worker refuses when
 * the slot being deleted is the account's last openable copy of the grant key.
 */
export async function removePasskey(password: string, id: string): Promise<void> {
  const { account } = await api.me();
  const { kdf } = await api.challenge(account.handle);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
  await api.passkeyRemove({ authSecret: derived.authSecret, id });
}

/**
 * Sign in with a passkey — one step, no TOTP stage. The verification gesture
 * the authenticator demanded is the second factor; see `worker/passkeys.ts`
 * and `docs/DECISIONS.md` (2026-08-13).
 */
export async function signInWithPasskey(
  authenticator: Authenticator = platformAuthenticator,
): Promise<PasskeySignInResult> {
  const { token, challenge } = await api.passkeySignInChallenge();
  const assertion = await authenticator.get({ challenge: fromBase64Url(challenge) });
  return api.passkeySignIn({
    token,
    credential: {
      id: toBase64Url(assertion.id),
      clientDataJSON: toBase64Url(assertion.clientDataJSON),
      authenticatorData: toBase64Url(assertion.authenticatorData),
      signature: toBase64Url(assertion.signature),
    },
  });
}
