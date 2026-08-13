/**
 * A software authenticator for the e2e harness.
 *
 * Implements the `Authenticator` seam from `src/auth/passkeys.ts` with plain
 * WebCrypto: a P-256 keypair per credential, CBOR and DER encoded by hand, and
 * a deterministic HMAC standing in for the `prf` extension — which is faithful
 * to the real thing, since `hmac-secret` is an HMAC over the evaluation input
 * under a key that never leaves the authenticator.
 *
 * Like the harness's TOTP implementation, this is a second opinion, not a
 * shortcut: it *encodes* the formats the Worker *decodes*, so a wrong shared
 * assumption cannot agree with itself. The Worker's CBOR reader and DER
 * converter are exercised against bytes this file built independently from the
 * WebAuthn spec.
 */

import type {
  Authenticator,
  AuthenticatorAssertion,
  AuthenticatorAttestation,
} from "../src/auth/passkeys";
import { PRF_INPUT } from "../src/auth/passkeys";
import { toBase64Url } from "../src/auth/encoding";

const encoder = new TextEncoder();

// CBOR encoding, the same narrow subset the Worker reads --------------------------

type CborValue = number | string | Uint8Array | Map<number | string, CborValue>;

function cborEncode(value: CborValue): Uint8Array {
  const parts: number[] = [];
  write(value, parts);
  return new Uint8Array(parts);
}

function write(value: CborValue, out: number[]): void {
  if (typeof value === "number") {
    if (value >= 0) head(0, value, out);
    else head(1, -1 - value, out);
  } else if (typeof value === "string") {
    const bytes = encoder.encode(value);
    head(3, bytes.length, out);
    out.push(...bytes);
  } else if (value instanceof Uint8Array) {
    head(2, value.length, out);
    out.push(...value);
  } else {
    head(5, value.size, out);
    for (const [key, entry] of value) {
      write(key, out);
      write(entry, out);
    }
  }
}

function head(major: number, length: number, out: number[]): void {
  if (length < 24) out.push((major << 5) | length);
  else if (length < 256) out.push((major << 5) | 24, length);
  else out.push((major << 5) | 25, length >> 8, length & 0xff);
}

// Byte plumbing -------------------------------------------------------------------

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/**
 * P-1363 (`r ‖ s`) → ASN.1 DER, because real authenticators emit DER and the
 * Worker converts it back. Round-tripping through both encoders is the point.
 */
function p1363ToDer(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array): number[] => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
    let body = [...bytes.slice(start)];
    if (body[0] & 0x80) body = [0, ...body];
    return [0x02, body.length, ...body];
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32, 64));
  const sequence = [...r, ...s];
  const lengthBytes = sequence.length < 128 ? [sequence.length] : [0x81, sequence.length];
  return new Uint8Array([0x30, ...lengthBytes, ...sequence]);
}

// The authenticator ---------------------------------------------------------------

interface StoredCredential {
  id: Uint8Array;
  keys: CryptoKeyPair;
  prfSeed: Uint8Array;
  signCount: number;
}

const FLAGS_CREATE = 0x45; // UP | UV | AT
const FLAGS_GET = 0x05; // UP | UV

export class SoftwareAuthenticator implements Authenticator {
  /** Flip off to simulate an authenticator without `prf` — §5's missing-slot path. */
  supportsPrf = true;
  /**
   * Flip off to emit assertions/attestations without the UV flag. The Worker
   * must refuse these: UV is the passkey's second factor, and the no-TOTP,
   * no-rate-limit decisions on passkey sign-in rest on that refusal. This knob
   * exists so the harness proves the refusal instead of trusting it.
   */
  userVerification = true;
  /** Override the RP ID hashed into authData, to prove a wrong hash is refused. */
  rpIdOverride: string | null = null;
  private credentials: StoredCredential[] = [];

  constructor(
    private origin: string,
    private rpId: string,
  ) {}

  async create({ challenge }: { challenge: Uint8Array }): Promise<AuthenticatorAttestation> {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ]);
    const credential: StoredCredential = {
      id: crypto.getRandomValues(new Uint8Array(16)),
      keys,
      prfSeed: crypto.getRandomValues(new Uint8Array(32)),
      signCount: 0,
    };
    this.credentials.push(credential);

    const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const cose = cborEncode(
      new Map<number | string, CborValue>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, publicKeyRaw.slice(1, 33)],
        [-3, publicKeyRaw.slice(33, 65)],
      ]),
    );
    const authData = concat(
      await sha256(encoder.encode(this.rpIdOverride ?? this.rpId)),
      new Uint8Array([this.userVerification ? FLAGS_CREATE : FLAGS_CREATE & ~0x04]),
      u32be(0),
      new Uint8Array(16), // aaguid, zero for attestation `none`
      new Uint8Array([credential.id.length >> 8, credential.id.length & 0xff]),
      credential.id,
      cose,
    );
    const attestationObject = cborEncode(
      new Map<number | string, CborValue>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]),
    );
    const clientDataJSON = encoder.encode(
      JSON.stringify({
        type: "webauthn.create",
        challenge: toBase64Url(challenge),
        origin: this.origin,
        crossOrigin: false,
      }),
    );

    return {
      id: credential.id,
      clientDataJSON,
      attestationObject,
      prfOutput: this.supportsPrf ? await this.prf(credential.prfSeed) : null,
    };
  }

  async get({
    challenge,
    allowId,
  }: {
    challenge: Uint8Array;
    allowId?: Uint8Array;
  }): Promise<AuthenticatorAssertion> {
    const wanted = allowId ? toBase64Url(allowId) : null;
    const credential = wanted
      ? this.credentials.find((entry) => toBase64Url(entry.id) === wanted)
      : this.credentials[this.credentials.length - 1];
    if (!credential) throw new Error("software authenticator holds no matching credential");

    credential.signCount += 1;
    const authenticatorData = concat(
      await sha256(encoder.encode(this.rpIdOverride ?? this.rpId)),
      new Uint8Array([this.userVerification ? FLAGS_GET : FLAGS_GET & ~0x04]),
      u32be(credential.signCount),
    );
    const clientDataJSON = encoder.encode(
      JSON.stringify({
        type: "webauthn.get",
        challenge: toBase64Url(challenge),
        origin: this.origin,
        crossOrigin: false,
      }),
    );

    const signed = concat(authenticatorData, await sha256(clientDataJSON));
    const p1363 = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        credential.keys.privateKey,
        signed as BufferSource,
      ),
    );

    return {
      id: credential.id,
      clientDataJSON,
      authenticatorData,
      signature: p1363ToDer(p1363),
      prfOutput: this.supportsPrf ? await this.prf(credential.prfSeed) : null,
    };
  }

  /** `hmac-secret` in miniature: HMAC(per-credential seed, evaluation input). */
  private async prf(seed: Uint8Array): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
      "raw",
      seed as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, PRF_INPUT as BufferSource));
  }
}
