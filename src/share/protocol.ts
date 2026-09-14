/**
 * The file protocol, v1 (SPEC-ACCOUNTS.md §13): JSON control messages and
 * length-prefixed binary chunks over one WebRTC data channel. Reads only — no
 * write op exists, so a future write is a protocol version, not a flag.
 */

export const PROTOCOL_VERSION = 1;
export const CHANNEL_LABEL = "vessel-files";

/** 64 KiB chunks, paced by `bufferedAmount` so a large file cannot balloon the channel. */
export const CHUNK_SIZE = 64 * 1024;
export const BUFFERED_HIGH = 1 << 20;

/** STUN only in phase 2 (§12 P); TURN is specified but a client spend decision. */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

/**
 * Both ends of the ceremony emit their candidates before they send the
 * description that lets the other end accept them — there is a WebCrypto
 * signature awaited in between — so both ends hold the early ones and flush
 * them once `setRemoteDescription` has resolved. Bounded because the
 * signalling service is an introducer neither end trusts (§12 K) and an honest
 * peer on STUN produces well under a dozen candidates; past the bound the
 * surplus is dropped, since a queue is a courtesy to a peer mid-ceremony
 * rather than a buffer anyone may fill.
 */
export const MAX_QUEUED_ICE = 64;

/** Listings are capped so a directory of a million files answers, bounded. */
export const LIST_MAX = 2000;

/**
 * And capped again in BYTES, because the count is not the size. A reply is one
 * `RTCDataChannel.send()` and Chrome advertises a 256 KiB maximum message: a
 * full 2,000-entry listing measures ~152KB at 12-character names but ~285KB at
 * 80 and ~627KB at 255, so an ordinary photo folder made `send()` throw and —
 * the throw being swallowed, and no request in this protocol having a timeout —
 * left the explorer on "Listing…" for ever. The budget is `CHUNK_SIZE` because
 * that is the frame size this protocol already assumes will send; the envelope
 * around the entries is ~60 bytes, and the rest of the 256 KiB is headroom for
 * a peer that advertises less than Chrome does.
 */
export const LIST_MAX_BYTES = CHUNK_SIZE;

/**
 * The encoded size of one entry inside the reply's JSON array, its separating
 * comma included. BYTES, not `String.length`: a name in a script outside the
 * BMP costs four bytes per two UTF-16 units, and a budget counting units is
 * the `MAX_CONFIG_BYTES` trap one directory over.
 */
export function listEntryBytes(entry: ListEntry): number {
  return new TextEncoder().encode(JSON.stringify(entry)).length + 1;
}

export interface ListEntry {
  name: string;
  kind: "file" | "directory";
  size?: number;
  modified?: number;
}

export interface FileRequest {
  v: number;
  id: number;
  op: "list" | "stat" | "read";
  drive: string;
  path: unknown;
  offset?: number;
  length?: number;
}

export type FileReply =
  | { v: 1; id: number; ok: true; entries: ListEntry[]; truncated: boolean }
  | { v: 1; id: number; ok: true; entry: ListEntry }
  | { v: 1; id: number; ok: true; size: number }
  | { v: 1; id: number; ok: true; done: true }
  | { v: 1; id: number; ok: false; error: string };

/**
 * Binary chunk framing: u32 LE request id, u32 LE sequence, then the bytes.
 *
 * The header is the minimum: `packChunk` never emits fewer than
 * `CHUNK_HEADER` bytes (a zero-length chunk is a legal frame, a shorter one is
 * not a frame at all), and `unpackChunk` refuses anything shorter rather than
 * letting `DataView` throw a bare `RangeError` out of an event handler.
 */
export const CHUNK_HEADER = 8;

export function packChunk(id: number, seq: number, data: Uint8Array): ArrayBuffer {
  const frame = new Uint8Array(CHUNK_HEADER + data.length);
  new DataView(frame.buffer).setUint32(0, id, true);
  new DataView(frame.buffer).setUint32(4, seq, true);
  frame.set(data, CHUNK_HEADER);
  return frame.buffer;
}

export function unpackChunk(buffer: ArrayBuffer): { id: number; seq: number; data: Uint8Array } {
  // A frame too short to carry its own header names no request, so there is
  // nothing to answer and nothing to accumulate. Refused here so the caller
  // sees one named error rather than a `RangeError` from `getUint32`.
  if (buffer.byteLength < CHUNK_HEADER) {
    throw new RangeError(
      `A chunk frame carries ${CHUNK_HEADER} bytes of header; this one was ${buffer.byteLength}.`,
    );
  }
  const view = new DataView(buffer);
  return {
    id: view.getUint32(0, true),
    seq: view.getUint32(4, true),
    data: new Uint8Array(buffer, CHUNK_HEADER),
  };
}
