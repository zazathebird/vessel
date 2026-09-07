/**
 * Password ceremonies for the phase-2 pages (SPEC-ACCOUNTS.md §12 K, §12 L).
 *
 * `unlockForConnect` is deliberately not `flows.openGrantKey`: that function
 * guards the phase-3 *grant-signing* gesture and therefore demands a TOTP code
 * by §3. Connecting to your own machine is the §12 K ceremony — the password
 * unwraps the grant key for this connection, the key is non-extractable, and
 * nothing is stored.
 */

import { ApiError, api } from "../auth/api";
import { DEFAULT_ITERATIONS, checkIterations, deriveFromPassword } from "../auth/derive";
import { fromBase64Url, toBase64Url } from "../auth/encoding";
import { provePublicKey, unwrapSlot } from "../auth/grantKey";

/** Derive the password's auth secret for the signed-in account's handle. */
export async function derivePassword(handle: string, password: string) {
  const { kdf } = await api.challenge(handle);
  return deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
}

import type { StoredMachine } from "./store";
import { generateMachineKeypair } from "./handshake";

/** The proven key slot: the server's copy, opened locally, so the public key is bound to the password. */
interface ProvenSlot {
  grantKey: CryptoKey;
  /** Base64url, as the server sent it — the only trust root a tab may store. */
  grantPubkey: string;
}

/**
 * Fetch the account's key slot with the password proof and OPEN it here.
 *
 * Opening is the point, not a courtesy: `api.keySlot` proves the password to
 * the server, and `unwrapSlot` proves the slot to the browser — AES-KW fails
 * closed on any byte of the ciphertext, and the P-256 import checks `Q = d·G`,
 * so a `grantPubkey` that survives this call is the public half of the key the
 * password unwraps and nothing else. A server that lies about the public key
 * fails here, locally, before anything is trusted or stored.
 */
async function provenSlot(derived: Awaited<ReturnType<typeof derivePassword>>): Promise<ProvenSlot> {
  // The slot endpoint demands the password proof — a wrong password now fails
  // here, server-side and rate-limited, before AES-KW would have caught it.
  let slot;
  try {
    slot = await api.keySlot(derived.authSecret);
  } catch (error) {
    // The endpoint's 401 wording belongs to credential changes; the honest
    // message here is the ceremony's own. A rate-limit refusal keeps its
    // wording — it says when to come back (§4).
    if (error instanceof ApiError && error.status === 401) {
      throw new Error("That is not your password.");
    }
    throw error;
  }
  let grantKey: CryptoKey;
  try {
    grantKey = await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      derived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );
  } catch (error) {
    // `unwrapSlot` names the one failure that is not the password — a public
    // key that does not match the unwrapped scalar — and that wording stays,
    // because it is the same refusal `provePublicKey` makes below.
    if (error instanceof Error && /public key/.test(error.message)) throw error;
    // AES-KW fails closed on a wrong key. The server just verified the
    // password, so reaching this means the slot bytes are damaged — but the
    // password wording stays: it is the only action the person can take.
    throw new Error("That is not your password.");
  }
  // The import above rejects a mismatched point in Chromium; this rejects it
  // everywhere, by arithmetic rather than by browser. See `provePublicKey`.
  if (!(await provePublicKey(grantKey, fromBase64Url(slot.grantPubkey)))) {
    throw new Error("This account's stored public key does not match its grant key.");
  }
  return { grantKey, grantPubkey: slot.grantPubkey };
}

/** Unwrap the account's grant key for one browsing connection (§12 K). */
export async function unlockForConnect(handle: string, password: string): Promise<CryptoKey> {
  const derived = await derivePassword(handle, password);
  return (await provenSlot(derived)).grantKey;
}

/** What a pair or re-key names: a new machine, or an existing one's row. */
export type PairTarget = { name: string } | { machineId: string };

/**
 * Pair (or re-key, or take over) a machine, and establish this tab's trust root
 * from the password rather than from the pair response (§12 K, 2026-09-07).
 *
 * The agent tab's trust root is the public key it will accept browse
 * signatures from — it is stored at pair time and never re-fetched, precisely
 * so that a later server compromise cannot re-root a paired agent. Until this
 * function existed the root was `grantPubkey` from `POST /api/machines/pair`,
 * taken on faith: a lying Worker or database could answer with its own key at
 * the one moment the tab was listening, and the agent would then serve that
 * key's holder every file it had a handle to. The password proves the root the
 * same way it does for a browsing connection — `provenSlot` unwraps the slot
 * locally and signs with the result against the public key, which binds the
 * public key to the password by arithmetic — and the pair response is
 * *checked against* it, never used as it.
 *
 * Ordering is load-bearing: the slot is proven before the pair call, so a
 * wrong password is refused with nothing registered, and a disagreeing
 * response is refused with nothing stored — the machine row exists on the
 * account and the tab holds no key for it, which is the orphan state the
 * share page already knows how to show.
 */
export async function pairMachine(
  handle: string,
  password: string,
  target: PairTarget,
): Promise<StoredMachine> {
  const derived = await derivePassword(handle, password);
  const proven = await provenSlot(derived);
  const keys = await generateMachineKeypair();
  const result = await api.machinePair({
    ...target,
    agentPubkey: toBase64Url(keys.publicKeyBytes),
    authSecret: derived.authSecret,
  });
  if (result.grantPubkey !== proven.grantPubkey) {
    throw new Error(
      "The server answered with a trust root your password does not open. Nothing was saved on this tab.",
    );
  }
  return {
    machineId: result.machine.id,
    name: result.machine.name,
    keyPair: keys.keyPair,
    trustRoot: fromBase64Url(proven.grantPubkey),
    publicKeyBytes: keys.publicKeyBytes,
  };
}
