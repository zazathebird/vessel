/**
 * Byte encodings for the Worker.
 *
 * A near-copy of `src/auth/encoding.ts`, deliberately. The two sides compile
 * under separate tsconfigs against different libs — the browser has the DOM,
 * this has `@cloudflare/workers-types` — so a shared module would drag one
 * environment's globals into the other. The duplication is fifteen lines and the
 * coupling would be permanent.
 *
 * This file additionally owns the D1 BLOB round trip, which the browser has no
 * equivalent of.
 */

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode a client-supplied base64url value, refusing anything that is not the
 * length we expect.
 *
 * Every one of these arrives over the network from an untrusted caller, and a
 * wrapped key of the wrong length is either a bug or an attempt. Checking here
 * means the handlers below can treat sizes as given.
 */
export function expectBytes(text: unknown, length: number, field: string): Uint8Array {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new BadRequest(`${field} is missing or malformed.`);
  }
  const bytes = fromBase64Url(text);
  if (bytes.length !== length) {
    throw new BadRequest(`${field} should be ${length} bytes, not ${bytes.length}.`);
  }
  return bytes;
}

/**
 * The same, for fields whose length is a range rather than a constant — a
 * WebAuthn credential id is 16 bytes from some authenticators and up to 1023
 * from others, and `clientDataJSON` is whatever the browser wrote.
 */
export function expectBytesRange(
  text: unknown,
  min: number,
  max: number,
  field: string,
): Uint8Array {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new BadRequest(`${field} is missing or malformed.`);
  }
  const bytes = fromBase64Url(text);
  if (bytes.length < min || bytes.length > max) {
    throw new BadRequest(`${field} should be ${min} to ${max} bytes, not ${bytes.length}.`);
  }
  return bytes;
}

/**
 * A client error carrying wording the client can show as-is.
 *
 * §10 requires that every failure says what to do next, so these messages are
 * user-facing sentences rather than error codes. Anything thrown that is *not*
 * one of these becomes a generic 500, because an unexpected error's message is
 * not something we have vetted for disclosure.
 */
export class BadRequest extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * D1 binds a BLOB from an `ArrayBuffer`. The copy is deliberate: a `Uint8Array`
 * that is a view onto a larger buffer would otherwise bind the whole buffer,
 * which silently stores the wrong bytes rather than failing.
 */
export function toBlob(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/**
 * Read a BLOB back.
 *
 * Tolerant of shape because D1 has returned BLOBs as both `ArrayBuffer` and a
 * plain number array across versions, and a stored key that decodes to garbage
 * is a failure that would only surface much later, in a user's recovery path.
 */
export function fromBlob(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  throw new Error("expected a BLOB");
}
