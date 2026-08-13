/**
 * Hand-rolled WebAuthn verification (SPEC-ACCOUNTS.md §4, Passkeys).
 *
 * §1 budgets this file: "a small hand-rolled CBOR reader (~120 lines, one
 * narrow subset) and nothing else." The subset is what a `none`-attestation
 * registration actually contains — unsigned and negative integers, byte
 * strings, text strings, arrays and maps. No floats, no tags, no indefinite
 * lengths, no 64-bit lengths: nothing legitimate here is that large, and a
 * reader that accepts less has less to get wrong.
 *
 * Only ES256 (`alg: -7`) is accepted, which §4 chose precisely because it
 * "narrows the CBOR shapes that must be handled to a small, testable set."
 * Registration reads the credential id and COSE key out of `authData`;
 * authentication verifies the signature over
 * `authData || SHA-256(clientDataJSON)` and checks challenge, origin, RP ID
 * hash and the user-verified flag. Sign-count monotonicity is checked but not
 * enforced, because synced passkeys commonly return 0.
 */

import { BadRequest } from "./encoding";

// CBOR, the narrow subset ------------------------------------------------------

type CborValue = number | string | Uint8Array | CborValue[] | Map<number | string, CborValue>;

class CborReader {
  private offset = 0;
  constructor(private bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  read(depth = 0): CborValue {
    // WebAuthn's structures are two levels deep; eight refuses a hostile
    // payload built purely to recurse.
    if (depth > 8) throw new BadRequest("That passkey data is malformed.");

    const initial = this.byte();
    const major = initial >> 5;
    const length = this.length(initial & 0x1f);

    switch (major) {
      case 0: // unsigned int
        return length;
      case 1: // negative int, encoded as -1 - n
        return -1 - length;
      case 2: // byte string
        return this.take(length);
      case 3: // text string
        return new TextDecoder().decode(this.take(length));
      case 4: {
        const array: CborValue[] = [];
        for (let i = 0; i < length; i += 1) array.push(this.read(depth + 1));
        return array;
      }
      case 5: {
        const map = new Map<number | string, CborValue>();
        for (let i = 0; i < length; i += 1) {
          const key = this.read(depth + 1);
          if (typeof key !== "number" && typeof key !== "string") {
            throw new BadRequest("That passkey data is malformed.");
          }
          map.set(key, this.read(depth + 1));
        }
        return map;
      }
      default:
        // Major 6 (tags) and 7 (floats/simple) never appear in a
        // none-attestation object; refusing them keeps the subset honest.
        throw new BadRequest("That passkey data is malformed.");
    }
  }

  private byte(): number {
    if (this.offset >= this.bytes.length) throw new BadRequest("That passkey data is malformed.");
    return this.bytes[this.offset++];
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new BadRequest("That passkey data is malformed.");
    }
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  private length(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) return (this.byte() << 8) | this.byte();
    if (info === 26) {
      return this.byte() * 0x1000000 + ((this.byte() << 16) | (this.byte() << 8) | this.byte());
    }
    // 27 is a 64-bit length and 28–31 are reserved/indefinite. Nothing in a
    // registration is gigabytes long.
    throw new BadRequest("That passkey data is malformed.");
  }
}

// Authenticator data -----------------------------------------------------------

const FLAG_UP = 0x01; // user present
const FLAG_UV = 0x04; // user verified
const FLAG_AT = 0x40; // attested credential data follows

interface ParsedAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  credentialId?: Uint8Array;
  publicKeyRaw?: Uint8Array;
}

function parseAuthData(bytes: Uint8Array): ParsedAuthData {
  if (bytes.length < 37) throw new BadRequest("That passkey data is malformed.");

  const rpIdHash = bytes.slice(0, 32);
  const flags = bytes[32];
  const signCount =
    bytes[33] * 0x1000000 + ((bytes[34] << 16) | (bytes[35] << 8) | bytes[36]);

  const parsed: ParsedAuthData = { rpIdHash, flags, signCount };

  if (flags & FLAG_AT) {
    // aaguid (16, ignored — attestation is `none` and the vendor is nobody's
    // business), credential id length (2, big-endian), credential id, COSE key.
    if (bytes.length < 55) throw new BadRequest("That passkey data is malformed.");
    const idLength = (bytes[53] << 8) | bytes[54];
    if (bytes.length < 55 + idLength) throw new BadRequest("That passkey data is malformed.");
    parsed.credentialId = bytes.slice(55, 55 + idLength);
    parsed.publicKeyRaw = coseToRaw(new CborReader(bytes.slice(55 + idLength)).read());
  }

  return parsed;
}

/**
 * A COSE_Key map to the uncompressed SEC1 point the rest of the system speaks —
 * the same 65-byte `0x04 ‖ x ‖ y` shape `accounts.grant_pubkey` uses. Refuses
 * anything that is not exactly EC2 / P-256 / ES256.
 */
function coseToRaw(cose: CborValue): Uint8Array {
  if (!(cose instanceof Map)) throw new BadRequest("That passkey data is malformed.");
  const kty = cose.get(1);
  const alg = cose.get(3);
  const crv = cose.get(-1);
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (kty !== 2 || alg !== -7 || crv !== 1) {
    throw new BadRequest("Only ES256 passkeys are accepted here.");
  }
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
    throw new BadRequest("That passkey data is malformed.");
  }
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);
  return raw;
}

// Signature format -------------------------------------------------------------

/**
 * WebAuthn signatures arrive ASN.1 DER-encoded; `crypto.subtle.verify` wants
 * raw P-1363 (`r ‖ s`, 32 bytes each). DER integers drop leading zeroes and
 * add one back when the high bit is set, so each half is 1–33 bytes and must
 * be re-padded to exactly 32.
 */
function derToP1363(der: Uint8Array): Uint8Array {
  const malformed = new BadRequest("That passkey data is malformed.");
  let offset = 0;
  const expect = (value: number) => {
    if (der[offset++] !== value) throw malformed;
  };

  expect(0x30); // SEQUENCE
  let sequenceLength = der[offset++];
  if (sequenceLength === 0x81) sequenceLength = der[offset++];
  if (offset + sequenceLength !== der.length) throw malformed;

  const integer = (): Uint8Array => {
    expect(0x02);
    const length = der[offset++];
    if (length < 1 || length > 33 || offset + length > der.length) throw malformed;
    let bytes = der.slice(offset, offset + length);
    offset += length;
    while (bytes.length > 32) {
      if (bytes[0] !== 0x00) throw malformed;
      bytes = bytes.slice(1);
    }
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  };

  const r = integer();
  const s = integer();
  if (offset !== der.length) throw malformed;

  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

// Client data ------------------------------------------------------------------

/**
 * `clientDataJSON` is plain JSON written by the browser, and these three fields
 * are the whole contract: the ceremony type stops a registration being replayed
 * as a sign-in, the challenge binds the response to the token that asked for
 * it, and the origin is what makes a phishing page's assertion — signed for
 * *its* origin — worthless here.
 */
function checkClientData(
  clientDataJSON: Uint8Array,
  expectedType: "webauthn.create" | "webauthn.get",
  expectedChallenge: string,
  expectedOrigin: string,
): void {
  let data: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    data = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    throw new BadRequest("That passkey data is malformed.");
  }
  if (data.type !== expectedType) throw new BadRequest("That passkey response is the wrong kind.");
  if (data.challenge !== expectedChallenge) {
    throw new BadRequest("That passkey response answers a different challenge. Start again.");
  }
  if (data.origin !== expectedOrigin) {
    throw new BadRequest("That passkey response came from somewhere we do not serve.");
  }
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Both ceremonies require the user-verified flag, not just user-present. §3's
 * stolen-laptop row leans on it — "passkeys require user verification
 * (biometric or PIN) on every sign-in" — and it is also what lets a passkey
 * sign-in stand without a TOTP step: the verification gesture *is* the second
 * factor. Accepting a UP-only assertion would quietly demote that to
 * one-factor.
 */
function requireVerifiedUser(flags: number): void {
  if (!(flags & FLAG_UP) || !(flags & FLAG_UV)) {
    throw new BadRequest("That passkey did not verify you. Use one that asks for a PIN or biometric.");
  }
}

// The two verifications --------------------------------------------------------

export interface RegistrationResult {
  credentialId: Uint8Array;
  publicKeyRaw: Uint8Array;
  signCount: number;
}

export async function verifyRegistration(input: {
  clientDataJSON: Uint8Array;
  attestationObject: Uint8Array;
  challenge: string;
  origin: string;
  rpId: string;
}): Promise<RegistrationResult> {
  checkClientData(input.clientDataJSON, "webauthn.create", input.challenge, input.origin);

  const attestation = new CborReader(input.attestationObject).read();
  if (!(attestation instanceof Map)) throw new BadRequest("That passkey data is malformed.");
  const authDataBytes = attestation.get("authData");
  if (!(authDataBytes instanceof Uint8Array)) {
    throw new BadRequest("That passkey data is malformed.");
  }

  const authData = parseAuthData(authDataBytes);
  if (!equalBytes(authData.rpIdHash, await sha256(input.rpId))) {
    throw new BadRequest("That passkey belongs to a different site.");
  }
  requireVerifiedUser(authData.flags);
  if (!authData.credentialId || !authData.publicKeyRaw) {
    throw new BadRequest("That passkey data is malformed.");
  }

  // The cheapest complete check that the point is genuinely on P-256 — the same
  // one signup runs on the grant public key, for the same reason: a key that
  // cannot be imported is a sign-in that fails unexplainably later.
  try {
    await importVerifyKey(authData.publicKeyRaw);
  } catch {
    throw new BadRequest("That passkey's public key is not a valid P-256 point.");
  }

  return {
    credentialId: authData.credentialId,
    publicKeyRaw: authData.publicKeyRaw,
    signCount: authData.signCount,
  };
}

export async function verifyAssertion(input: {
  clientDataJSON: Uint8Array;
  authenticatorData: Uint8Array;
  signature: Uint8Array;
  publicKeyRaw: Uint8Array;
  challenge: string;
  origin: string;
  rpId: string;
}): Promise<{ signCount: number }> {
  checkClientData(input.clientDataJSON, "webauthn.get", input.challenge, input.origin);

  const authData = parseAuthData(input.authenticatorData);
  if (!equalBytes(authData.rpIdHash, await sha256(input.rpId))) {
    throw new BadRequest("That passkey belongs to a different site.");
  }
  requireVerifiedUser(authData.flags);

  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", input.clientDataJSON as BufferSource),
  );
  const signed = new Uint8Array(input.authenticatorData.length + clientDataHash.length);
  signed.set(input.authenticatorData, 0);
  signed.set(clientDataHash, input.authenticatorData.length);

  const key = await importVerifyKey(input.publicKeyRaw);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    derToP1363(input.signature) as BufferSource,
    signed as BufferSource,
  );
  if (!valid) throw new BadRequest("That passkey signature does not verify.");

  return { signCount: authData.signCount };
}

async function importVerifyKey(publicKeyRaw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    publicKeyRaw as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}
