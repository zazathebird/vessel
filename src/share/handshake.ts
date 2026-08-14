/**
 * The connect ceremony's cryptography (SPEC-ACCOUNTS.md §12 R, §13).
 *
 * Each side of a WebRTC connection signs its own DTLS fingerprint — the agent
 * with its machine key, the browsing tab with the account's grant key — and
 * verifies the peer's before proceeding. The signalling service relays these
 * signatures inside payloads it never reads and could not forge, which is what
 * reduces it to an introducer that cannot listen (§3's MITM row).
 *
 * Everything here is plain WebCrypto over plain bytes: no DOM, no WebRTC
 * types, so the e2e harness drives both directions in Node exactly as the two
 * tabs run them in Chromium.
 *
 * The context strings namespace the two roles — an agent's signature can never
 * be replayed as an owner's or vice versa — and bind the machine id, so a
 * signature for one machine's ceremony is noise in another's. The `vessel/`
 * prefix is deliberate (CLAUDE.md deviation 10): wire formats keep the
 * internal name.
 */

export type HandshakeRole = "agent" | "owner";

const CONTEXT: Record<HandshakeRole, string> = {
  agent: "vessel/p2p/agent-fp/v1",
  owner: "vessel/p2p/owner-fp/v1",
};

const ECDSA_P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;

/**
 * The agent tab's machine keypair. The private key is non-extractable and
 * lives only in that tab's IndexedDB — there is no slot for it and no recovery
 * of it, because re-pairing (§12 O) is the recovery.
 */
export async function generateMachineKeypair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyBytes: Uint8Array;
}> {
  const keyPair = (await crypto.subtle.generateKey(ECDSA_P256, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  return { keyPair, publicKeyBytes };
}

/**
 * One canonical spelling of a DTLS fingerprint, so the signer and the verifier
 * cannot disagree over case or spacing: lowercase hash name, uppercase
 * colon-separated hex, single space between.
 */
export function normalizeFingerprint(fingerprint: string): string {
  const parts = fingerprint.trim().split(/\s+/);
  if (parts.length !== 2) return fingerprint.trim();
  return `${parts[0].toLowerCase()} ${parts[1].toUpperCase()}`;
}

/**
 * The `a=fingerprint` attribute of an SDP, or null when it has none — **or when
 * it has more than one distinct value**.
 *
 * The plural matters, and it is the whole of this function's security value.
 * This used to be `/^a=fingerprint:(.+)$/m` with `.exec`, which returns the
 * *first* match and says nothing about the rest of the document. An SDP may
 * carry a session-level fingerprint and a different media-level one, and RFC
 * 8122 §5 says the media-level value wins for that m-section — so the value
 * this function returned, which is the value both peers sign and verify against
 * the trust root, need not have been the value DTLS actually enforced.
 *
 * A hostile signalling service is explicitly in scope (§3, §12 R: the DO relays
 * opaque payloads and is not trusted). It relays both the SDP and the signature,
 * so it can take a genuine `{sdp, signature}` pair, prepend the owner's real
 * fingerprint at session level to *its own* SDP, and leave its own fingerprint
 * in the `m=application` section. Verification passes against a value DTLS then
 * ignores, both legs terminate at the relay, and it reads every byte — without
 * forging a signature. That would make §3's first row ("the operator cannot read
 * any user's files") false.
 *
 * **Refuse, never repair** — the same rule as `src/share/paths.ts`. An SDP whose
 * fingerprints disagree is not something to pick a winner from; there is no
 * honest reason for a peer to offer two, so the connection does not happen.
 * Identical repeats are allowed: a multi-bundle SDP legitimately restates the
 * same fingerprint per m-section, and normalising before comparing is what makes
 * that a repeat rather than a disagreement.
 */
export function fingerprintFromSdp(sdp: string): string | null {
  const found = new Set<string>();
  for (const match of sdp.matchAll(/^a=fingerprint:(.+)$/gm)) {
    found.add(normalizeFingerprint(match[1]));
  }
  if (found.size !== 1) return null;
  return [...found][0];
}

/** The exact bytes both sides sign and verify. Exported for the harness. */
export function fingerprintMessage(
  role: HandshakeRole,
  machineId: string,
  fingerprint: string,
): Uint8Array {
  return new TextEncoder().encode(
    `${CONTEXT[role]}\n${machineId}\n${normalizeFingerprint(fingerprint)}`,
  );
}

/** A raw 64-byte P-256 signature over the fingerprint message. */
export async function signFingerprint(
  privateKey: CryptoKey,
  role: HandshakeRole,
  machineId: string,
  fingerprint: string,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    SIGN_PARAMS,
    privateKey,
    fingerprintMessage(role, machineId, fingerprint) as BufferSource,
  );
  return new Uint8Array(signature);
}

/**
 * Verify a peer's signed fingerprint against the key we already trust — the
 * stored trust root for an owner's signature, `machines.agent_pubkey` for an
 * agent's. False is a refusal: no answer is sent and no channel opens.
 */
export async function verifyFingerprint(
  publicKeyBytes: Uint8Array,
  role: HandshakeRole,
  machineId: string,
  fingerprint: string,
  signature: Uint8Array,
): Promise<boolean> {
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes as BufferSource,
      ECDSA_P256,
      false,
      ["verify"],
    );
  } catch {
    return false;
  }
  return crypto.subtle.verify(
    SIGN_PARAMS,
    publicKey,
    signature as BufferSource,
    fingerprintMessage(role, machineId, fingerprint) as BufferSource,
  );
}
