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

/** Listings are capped so a directory of a million files answers, bounded. */
export const LIST_MAX = 2000;

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

/** Binary chunk framing: u32 LE request id, u32 LE sequence, then the bytes. */
export function packChunk(id: number, seq: number, data: Uint8Array): ArrayBuffer {
  const frame = new Uint8Array(8 + data.length);
  new DataView(frame.buffer).setUint32(0, id, true);
  new DataView(frame.buffer).setUint32(4, seq, true);
  frame.set(data, 8);
  return frame.buffer;
}

export function unpackChunk(buffer: ArrayBuffer): { id: number; seq: number; data: Uint8Array } {
  const view = new DataView(buffer);
  return {
    id: view.getUint32(0, true),
    seq: view.getUint32(4, true),
    data: new Uint8Array(buffer, 8),
  };
}
