/**
 * The grant key, and the slots that hold it.
 *
 * This is the load-bearing idea in the whole account design (SPEC-ACCOUNTS.md
 * §5), so it is worth restating here rather than only in the spec:
 *
 * There is **one** grant keypair per account — a P-256 pair generated in this
 * browser, whose private half the server never sees. It is wrapped **once per
 * credential**, and each wrapped copy is a *slot*. The password opens the
 * password slot; a recovery code opens its own; a passkey opens its own. Every
 * slot yields the same key, so losing one costs nothing while another survives.
 * This is the arrangement LUKS uses, and it is precisely what makes operator
 * password reset safe to offer: a reset **deletes** the password slot, and
 * deleting is not opening.
 *
 * Two consequences fall out that are easy to undo by accident:
 *
 * - **No slot is ever wrapped to an operator-held key.** §5 calls this the
 *   sharpest line in the document and §12 D marks it "revisit if never". Such a
 *   slot would let the operator sign grants in a user's name, which is the exact
 *   capability the design exists to deny them. If you find yourself adding an
 *   escrow slot, the threat model has become false, not merely weaker.
 * - **The public key is an availability dependency, not a security one.**
 *   `unwrapSlot` needs `accounts.grant_pubkey` to rebuild a usable private key,
 *   because WebCrypto will not import a bare scalar. It is tempting to read that
 *   as a second factor protecting the slot. It is not: the unwrap yields the raw
 *   32-byte scalar before the public key is consulted at all, and the public
 *   point is a single scalar multiplication away from it in any case. Both
 *   values also live in the same database. What the dependency *does* mean is
 *   that a corrupted `grant_pubkey` renders an intact slot permanently
 *   unopenable — see the check in `unwrapSlot`.
 */

/**
 * Recorded in `key_slots.alg`. A string rather than an assumption, because the
 * day a slot format changes, old slots must still open.
 */
export const SLOT_ALG = "AES-KW/HKDF-SHA-256";

/**
 * A freshly generated grant identity, in the only two forms that matter: the
 * public key the server stores and agents trust as a root, and the raw private
 * scalar that goes into every slot.
 */
export interface GrantKeyMaterial {
  /** Uncompressed SEC1 point, 65 bytes: 0x04 ‖ x ‖ y. What `accounts.grant_pubkey` holds. */
  publicKeyRaw: Uint8Array;
  /** The private scalar, 32 bytes. Wrap it, then drop it. */
  scalar: Uint8Array;
}

/**
 * Generate the account's grant keypair.
 *
 * The key is generated extractable, which is the one place this design touches
 * a rule §3 otherwise holds to. It is unavoidable and it is narrow: a key that
 * cannot be exported cannot be wrapped into a slot, so there would be nothing to
 * store and no recovery at all. What keeps it narrow is that the extractable
 * `CryptoKey` never escapes this function — the caller receives bytes, wraps
 * them, and is expected to `destroy()` them immediately. Every *later* handle on
 * this key, produced by `unwrapSlot`, is non-extractable.
 */
export async function generateGrantKey(): Promise<GrantKeyMaterial> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);

  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("grant key export produced no private scalar");

  return { publicKeyRaw, scalar: fromBase64UrlStrict(jwk.d, 32) };
}

/**
 * Wrap the scalar for one credential. The result is what the server stores, and
 * it is ciphertext the server cannot open.
 *
 * **Why the raw scalar and not PKCS#8.** AES-KW takes input in 8-byte blocks; a
 * PKCS#8-encoded P-256 private key is 138 bytes, which is not a multiple of
 * eight, so `wrapKey("pkcs8", …)` fails outright. The 32-byte scalar is exactly
 * four blocks. Getting there needs one detour — AES-KW is reachable only through
 * `wrapKey`, which takes a `CryptoKey` rather than bytes — so the scalar is
 * briefly imported as a raw AES key purely to give `wrapKey` something of the
 * right shape to chew on. It is never used as an AES key and never encrypts
 * anything.
 */
export async function wrapSlot(scalar: Uint8Array, wrappingKey: CryptoKey): Promise<Uint8Array> {
  const carrier = await crypto.subtle.importKey("raw", scalar as BufferSource, "AES-GCM", true, [
    "encrypt",
  ]);
  return new Uint8Array(await crypto.subtle.wrapKey("raw", carrier, wrappingKey, "AES-KW"));
}

/**
 * Open a slot and return a signing key.
 *
 * The returned key is **non-extractable**: from here on the private half exists
 * only as a handle the browser will sign with and will not read out. §3's first
 * mitigation against a compromised frontend depends on this, together with the
 * caller's discipline of unwrapping for one signing operation rather than
 * holding the key open for a session.
 *
 * The public key is a parameter because reconstructing an EC private key needs
 * the full JWK — a scalar alone is not importable. The server holds the public
 * half, so this costs nothing.
 */
export async function unwrapSlot(
  wrapped: Uint8Array,
  wrappingKey: CryptoKey,
  publicKeyRaw: Uint8Array,
): Promise<CryptoKey> {
  const carrier = await crypto.subtle.unwrapKey(
    "raw",
    wrapped as BufferSource,
    wrappingKey,
    "AES-KW",
    "AES-GCM",
    true,
    ["encrypt"],
  );
  const scalar = new Uint8Array(await crypto.subtle.exportKey("raw", carrier));

  try {
    return await importPrivateKey(scalar, publicKeyRaw);
  } catch {
    // The AES-KW step already succeeded, so the credential was right and the
    // ciphertext is intact — which means the only thing that can have failed is
    // the public key not matching the scalar. Browsers check `Q = d·G` on import
    // and throw a bare `DataError`, which would otherwise surface to a user as
    // an unexplained failure in the one flow they cannot afford one in.
    throw new Error(
      "This account's stored public key does not match its grant key. The key slot is intact; the public key is wrong.",
    );
  } finally {
    destroy(scalar);
  }
}

/**
 * Move a slot from one credential's wrapping key to another's, without the
 * scalar ever existing as bytes in this program.
 *
 * This is what a password change is: the grant key does not change — it must
 * not, or every grant ever signed by it stops verifying — only the lock on the
 * copy that the password opens. So the old slot is opened and its contents
 * re-sealed under the new key.
 *
 * `unwrapKey` and `wrapKey` hand the material between each other as a
 * `CryptoKey`, so unlike `unwrapSlot` there is no `exportKey` here and nothing
 * to `destroy` afterwards. The scalar goes from ciphertext to ciphertext inside
 * WebCrypto. That is strictly better than the signup path can manage, and it is
 * why this is its own function rather than unwrap-then-wrap at the call site.
 *
 * A wrong current password fails here, in the browser, with an integrity error
 * from AES-KW — before anything is sent. The server checks the old credential
 * too, because a check only the browser makes is not a check.
 */
export async function rewrapSlot(
  wrapped: Uint8Array,
  oldWrappingKey: CryptoKey,
  newWrappingKey: CryptoKey,
): Promise<Uint8Array> {
  const carrier = await crypto.subtle.unwrapKey(
    "raw",
    wrapped as BufferSource,
    oldWrappingKey,
    "AES-KW",
    "AES-GCM",
    true,
    ["encrypt"],
  );
  return new Uint8Array(await crypto.subtle.wrapKey("raw", carrier, newWrappingKey, "AES-KW"));
}

async function importPrivateKey(scalar: Uint8Array, publicKeyRaw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: toBase64UrlStrict(scalar),
      x: toBase64UrlStrict(publicKeyRaw.slice(1, 33)),
      y: toBase64UrlStrict(publicKeyRaw.slice(33, 65)),
      ext: false,
      key_ops: ["sign"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Sign a grant document. Phase 3 is what actually calls this; it exists now
 * because a key slot that has never been proven to reopen into a *working* key
 * is a slot nobody has really tested.
 *
 * The signature is P-1363 (r ‖ s), which is what `crypto.subtle.verify` expects
 * on the other side and what a small verifier reads most easily.
 */
export async function signWithGrantKey(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    payload as BufferSource,
  );
  return new Uint8Array(signature);
}

/**
 * Overwrite key material once it is no longer needed.
 *
 * This is best-effort and the honesty matters: a garbage-collected runtime makes
 * no promise that this was the only copy, and JS strings are worse still since
 * they cannot be overwritten at all — which is a further reason the scalar is
 * carried as bytes rather than as its base64 form. It shortens the window rather
 * than closing it.
 */
export function destroy(bytes: Uint8Array): void {
  bytes.fill(0);
}

/** Base64url without the `atob` round trip, so a wrong length is caught rather than padded over. */
function fromBase64UrlStrict(text: string, expectedLength: number): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  if (binary.length !== expectedLength) {
    throw new Error(`expected ${expectedLength} bytes, got ${binary.length}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64UrlStrict(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
