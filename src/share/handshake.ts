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
 * signature for one machine's ceremony is noise in another's, and (since v2,
 * 2026-09-24) the signalling peer id, so a signature for one socket is noise on
 * another. The agent's connect proof has a third context of its own. The `vessel/`
 * prefix is deliberate (CLAUDE.md deviation 10): wire formats keep the
 * internal name.
 */

export type HandshakeRole = "agent" | "owner";

/**
 * **v2 binds the signalling peer id** (2026-09-24). v1 signed role, machine and
 * fingerprint and nothing else, so a signed offer was valid for ever and from
 * anywhere: anybody holding the owner's session cookie who had once captured an
 * offer could replay it from a socket of their own, and the agent — whose
 * verification it passed — answered with its SDP and then trickled its ICE
 * candidates, which are the host's addresses. The replayer holds no DTLS key and
 * so could never complete the call; what it bought was the machine's IPs on
 * demand. The peer id is minted by the Durable Object per socket
 * (`crypto.randomUUID()` in `worker/signal.ts`), told to the browsing tab in its
 * `hello`, and stamped by the object on every frame it relays to the agent as
 * `from` — so the agent verifies against the id of the socket the offer actually
 * arrived on, and a captured offer replayed from any other socket fails. No extra
 * round trip: the freshness is a value both ends already had.
 *
 * The agent's answer carries the same binding, so an answer is only good for the
 * one browsing socket it was made for.
 */
const CONTEXT: Record<HandshakeRole, string> = {
  agent: "vessel/p2p/agent-fp/v2",
  owner: "vessel/p2p/owner-fp/v2",
};

/**
 * The agent's proof that it holds the machine key, answered to a challenge the
 * signalling object mints per socket (2026-09-24). Its own context string, so a
 * proof can never be presented as a fingerprint signature or the other way
 * round: the messages differ from their first byte.
 */
const CONNECT_CONTEXT = "vessel/p2p/agent-connect/v1";

/**
 * A signalling peer id: the shape `crypto.randomUUID()` produces and the only
 * shape the object mints. Refused, never repaired — a peer id that is not one
 * cannot have come from the object, and there is nothing to sign it into.
 */
export const PEER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 32 random bytes, base64url without padding — what `mintConnectNonce` returns. */
export const CONNECT_NONCE = /^[A-Za-z0-9_-]{43}$/;

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
  // `as ArrayBuffer`: the Workers typings (this module is also compiled into
  // the signalling object, for the connect proof) widen a raw export's type.
  const publicKeyBytes = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );
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

/**
 * The exact bytes both sides sign and verify. Exported for the harness.
 *
 * Throws on a peer id that is not one (above): the signer goes through here, so
 * it cannot be talked into signing a message bound to something other than a
 * socket id the object could have minted.
 */
export function fingerprintMessage(
  role: HandshakeRole,
  machineId: string,
  peerId: string,
  fingerprint: string,
): Uint8Array {
  if (!PEER_ID.test(peerId)) throw new Error("That is not a signalling peer id.");
  return new TextEncoder().encode(
    `${CONTEXT[role]}\n${machineId}\n${peerId}\n${normalizeFingerprint(fingerprint)}`,
  );
}

/** A raw 64-byte P-256 signature over the fingerprint message. */
export async function signFingerprint(
  privateKey: CryptoKey,
  role: HandshakeRole,
  machineId: string,
  peerId: string,
  fingerprint: string,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    SIGN_PARAMS,
    privateKey,
    fingerprintMessage(role, machineId, peerId, fingerprint) as BufferSource,
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
  peerId: string,
  fingerprint: string,
  signature: Uint8Array,
): Promise<boolean> {
  if (!PEER_ID.test(peerId)) return false;
  return verifyRaw(publicKeyBytes, signature, fingerprintMessage(role, machineId, peerId, fingerprint));
}

/**
 * A fresh challenge for an agent socket — 32 random bytes. Minted by the
 * signalling object, never by the agent: the whole value of the proof is that
 * the party checking it chose what was signed.
 */
export function mintConnectNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The bytes an agent signs to prove it holds the machine key. Exported for the harness. */
export function connectProofMessage(machineId: string, nonce: string): Uint8Array {
  if (!CONNECT_NONCE.test(nonce)) throw new Error("That is not a connect challenge.");
  return new TextEncoder().encode(`${CONNECT_CONTEXT}\n${machineId}\n${nonce}`);
}

/**
 * The agent's answer to its socket's challenge (2026-09-24). Refuses a nonce of
 * any other shape — a hostile signalling service is in scope (§3), and an agent
 * that signed whatever it was handed would be a signing oracle for its own
 * machine key. The context string already keeps a proof from ever validating as
 * a fingerprint signature; the shape check keeps the input to what the object
 * mints.
 */
export async function signConnectProof(
  privateKey: CryptoKey,
  machineId: string,
  nonce: string,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    SIGN_PARAMS,
    privateKey,
    connectProofMessage(machineId, nonce) as BufferSource,
  );
  return new Uint8Array(signature);
}

/** Verify a connect proof against `machines.agent_pubkey`. False is a refusal. */
export async function verifyConnectProof(
  publicKeyBytes: Uint8Array,
  machineId: string,
  nonce: string,
  signature: Uint8Array,
): Promise<boolean> {
  if (!CONNECT_NONCE.test(nonce)) return false;
  return verifyRaw(publicKeyBytes, signature, connectProofMessage(machineId, nonce));
}

async function verifyRaw(
  publicKeyBytes: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes as BufferSource,
      ECDSA_P256,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      SIGN_PARAMS,
      publicKey,
      signature as BufferSource,
      message as BufferSource,
    );
  } catch {
    return false;
  }
}
