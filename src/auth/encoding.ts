/**
 * Byte encodings for the account layer.
 *
 * Everything the browser sends the Worker is bytes — derived secrets, wrapped
 * keys, public keys — and JSON has no way to carry them. Base64url is the
 * choice rather than plain base64 because these values also appear in
 * `otpauth://` URIs and, later, in invite links, and `+` and `/` do not survive
 * a URL intact.
 *
 * The Worker has its own copy of these three functions (`worker/encoding.ts`).
 * They are duplicated deliberately: the two sides compile under separate
 * tsconfigs with different libs — `src` has the DOM, `worker` has the Workers
 * types — and sharing a module would drag one environment's globals into the
 * other. Fifteen lines is a smaller cost than that coupling.
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

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
