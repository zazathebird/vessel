/**
 * Password ceremonies for the phase-2 pages (SPEC-ACCOUNTS.md §12 K, §12 L).
 *
 * `unlockForConnect` is deliberately not `flows.openGrantKey`: that function
 * guards the phase-3 *grant-signing* gesture and therefore demands a TOTP code
 * by §3. Connecting to your own machine is the §12 K ceremony — the password
 * unwraps the grant key for this connection, the key is non-extractable, and
 * nothing is stored.
 */

import { api } from "../auth/api";
import { DEFAULT_ITERATIONS, checkIterations, deriveFromPassword } from "../auth/derive";
import { fromBase64Url } from "../auth/encoding";
import { unwrapSlot } from "../auth/grantKey";

/** Derive the password's auth secret for the signed-in account's handle. */
export async function derivePassword(handle: string, password: string) {
  const { kdf } = await api.challenge(handle);
  return deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: checkIterations(kdf.iterations, DEFAULT_ITERATIONS),
  });
}

/** Unwrap the account's grant key for one browsing connection (§12 K). */
export async function unlockForConnect(handle: string, password: string): Promise<CryptoKey> {
  const derived = await derivePassword(handle, password);
  const slot = await api.keySlot();
  try {
    return await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      derived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );
  } catch {
    // AES-KW fails closed on a wrong key, which here means a wrong password.
    throw new Error("That is not your password.");
  }
}
