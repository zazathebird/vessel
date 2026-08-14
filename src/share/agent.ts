/**
 * The agent runtime — what makes the `/share` tab a file server
 * (SPEC-ACCOUNTS.md §13).
 *
 * It holds one WebSocket to the machine's signalling object and answers offers
 * from the owner's browsing tabs. Every offer is verified against the trust
 * root before any answer is sent (§12 K) — the signalling service is an
 * introducer this code deliberately does not trust — and every file request is
 * validated by `isValidPath` before a handle is touched (§12 S). File bytes
 * flow only over the DTLS data channel, peer to peer.
 *
 * Reads only. There is no write op in protocol v1, so nothing here can modify
 * a file, and the File System Access permission is requested as `read`.
 */

import { fromBase64Url, toBase64Url } from "../auth/encoding";
import { fingerprintFromSdp, signFingerprint, verifyFingerprint } from "./handshake";
import { isValidPath } from "./paths";
import {
  BUFFERED_HIGH,
  CHUNK_SIZE,
  ICE_SERVERS,
  LIST_MAX,
  packChunk,
  type FileReply,
  type ListEntry,
} from "./protocol";

export interface AgentSnapshot {
  state: "connecting" | "online" | "offline" | "replaced" | "removed" | "stopped";
  /** Live peer connections — what the beforeunload guard reads (§12 N). */
  peers: number;
  /** Served this session, shown on the tab (§12 Q's hook). */
  bytesServed: number;
  note: string | null;
}

export class VesselAgent {
  private ws: WebSocket | null = null;
  private readonly peers = new Map<string, RTCPeerConnection>();
  private bytesServed = 0;
  private state: AgentSnapshot["state"] = "connecting";
  private note: string | null = null;
  private stopped = false;
  private retryTimer: number | null = null;

  constructor(
    private readonly machineId: string,
    private readonly keyPair: CryptoKeyPair,
    private readonly trustRoot: Uint8Array,
    private readonly resolveDrive: (driveId: string) => Promise<FileSystemDirectoryHandle | null>,
    private readonly onChange: (snapshot: AgentSnapshot) => void,
  ) {}

  snapshot(): AgentSnapshot {
    return {
      state: this.state,
      peers: this.peers.size,
      bytesServed: this.bytesServed,
      note: this.note,
    };
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }

  start(): void {
    if (this.stopped) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/signal/${this.machineId}?role=agent`);
    this.ws = ws;
    this.state = "connecting";
    this.emit();

    ws.onopen = () => {
      this.state = "online";
      this.note = null;
      this.emit();
    };
    ws.onmessage = (event) => {
      void this.handleFrame(String(event.data));
    };
    ws.onclose = () => {
      if (this.stopped || this.state === "replaced" || this.state === "removed") return;
      // The socket dropped — sleep, network blip, Worker redeploy. Sharing is
      // only real while this tab can be introduced, so keep trying quietly.
      this.state = "offline";
      this.emit();
      this.retryTimer = window.setTimeout(() => this.start(), 5000);
    };
  }

  /** Stop for good — leaving the page, or told to stand down. */
  stop(finalState: AgentSnapshot["state"] = "stopped"): void {
    this.stopped = true;
    this.state = finalState;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close();
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.emit();
  }

  private send(frame: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private async handleFrame(raw: string): Promise<void> {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    switch (frame.type) {
      case "offer":
        if (typeof frame.from === "string" && frame.payload && typeof frame.payload === "object") {
          await this.handleOffer(frame.from, frame.payload as Record<string, unknown>);
        }
        return;
      case "ice": {
        const pc = typeof frame.from === "string" ? this.peers.get(frame.from) : undefined;
        const candidate = (frame.payload as { candidate?: RTCIceCandidateInit } | undefined)
          ?.candidate;
        if (pc && candidate) await pc.addIceCandidate(candidate).catch(() => undefined);
        return;
      }
      case "replaced":
        // Another tab took over (§12 M). Quiescent, said plainly, no retry.
        this.note = "Another sharing tab took over for this machine.";
        this.stop("replaced");
        return;
      case "machine-removed":
        this.note = "This machine was removed from the account.";
        this.stop("removed");
        return;
      default:
        return;
    }
  }

  private async handleOffer(from: string, payload: Record<string, unknown>): Promise<void> {
    const sdp = typeof payload.sdp === "string" ? payload.sdp : "";
    const fingerprint = fingerprintFromSdp(sdp);
    let verified = false;
    if (fingerprint && typeof payload.signature === "string") {
      try {
        verified = await verifyFingerprint(
          this.trustRoot,
          "owner",
          this.machineId,
          fingerprint,
          fromBase64Url(payload.signature),
        );
      } catch {
        verified = false;
      }
    }
    if (!verified) {
      // §12 K: the introduction is not the authentication. No answer is sent.
      this.send({
        type: "refused",
        to: from,
        payload: { reason: "That connection did not prove it belongs to this account." },
      });
      return;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(from, pc);
    this.emit();

    pc.ondatachannel = ({ channel }) => this.serve(channel);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({ type: "ice", to: from, payload: { candidate: event.candidate.toJSON() } });
      }
    };
    pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(pc.connectionState)) {
        pc.close();
        if (this.peers.get(from) === pc) this.peers.delete(from);
        this.emit();
      }
    };

    await pc.setRemoteDescription({ type: "offer", sdp });
    await pc.setLocalDescription(await pc.createAnswer());

    const mySdp = pc.localDescription?.sdp ?? "";
    const myFingerprint = fingerprintFromSdp(mySdp);
    if (!myFingerprint) {
      pc.close();
      this.peers.delete(from);
      this.emit();
      return;
    }
    const signature = await signFingerprint(
      this.keyPair.privateKey,
      "agent",
      this.machineId,
      myFingerprint,
    );
    this.send({
      type: "answer",
      to: from,
      payload: { sdp: mySdp, fingerprint: myFingerprint, signature: toBase64Url(signature) },
    });
  }

  // The file server ------------------------------------------------------------

  private serve(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let request: Record<string, unknown>;
      try {
        request = JSON.parse(event.data);
      } catch {
        return;
      }
      void this.handleRequest(channel, request);
    };
  }

  private reply(channel: RTCDataChannel, reply: FileReply): void {
    try {
      channel.send(JSON.stringify(reply));
    } catch {
      // The channel closed mid-answer; the peer is gone and so is the errand.
    }
  }

  private async handleRequest(
    channel: RTCDataChannel,
    request: Record<string, unknown>,
  ): Promise<void> {
    const id = typeof request.id === "number" ? request.id : -1;
    const fail = (error: string) => this.reply(channel, { v: 1, id, ok: false, error });

    if (request.v !== 1 || id < 0) return fail("That request is not protocol v1.");
    const op = request.op;
    if (op !== "list" && op !== "stat" && op !== "read") {
      // Reads only — a write op does not exist rather than being refused (§13).
      return fail("This drive is read-only, and that is not a read.");
    }
    if (!isValidPath(request.path)) return fail("That path is not one this drive serves.");
    const path = request.path as string[];

    const root = await this.resolveDrive(String(request.drive ?? ""));
    if (!root) return fail("That drive is not attached on this machine right now.");

    try {
      if (op === "list") {
        const dir = await this.walk(root, path);
        const entries: ListEntry[] = [];
        let truncated = false;
        for await (const [name, handle] of dir.entries()) {
          if (entries.length >= LIST_MAX) {
            truncated = true;
            break;
          }
          if (handle.kind === "file") {
            const file = await (handle as FileSystemFileHandle).getFile();
            entries.push({ name, kind: "file", size: file.size, modified: file.lastModified });
          } else {
            entries.push({ name, kind: "directory" });
          }
        }
        return this.reply(channel, { v: 1, id, ok: true, entries, truncated });
      }

      if (op === "stat") {
        const entry = await this.stat(root, path);
        return this.reply(channel, { v: 1, id, ok: true, entry });
      }

      // read
      if (path.length === 0) return fail("That names the folder, not a file in it.");
      const dir = await this.walk(root, path.slice(0, -1));
      const fileHandle = await dir.getFileHandle(path[path.length - 1]);
      const file = await fileHandle.getFile();

      const offset = typeof request.offset === "number" ? Math.max(0, request.offset) : 0;
      const length =
        typeof request.length === "number"
          ? Math.min(Math.max(0, request.length), file.size - offset)
          : file.size - offset;
      const slice = file.slice(offset, offset + length);

      this.reply(channel, { v: 1, id, ok: true, size: length });

      let seq = 0;
      for (let sent = 0; sent < length; sent += CHUNK_SIZE) {
        const chunk = new Uint8Array(
          await slice.slice(sent, Math.min(sent + CHUNK_SIZE, length)).arrayBuffer(),
        );
        if (channel.bufferedAmount > BUFFERED_HIGH) await drained(channel);
        if (channel.readyState !== "open") return;
        channel.send(packChunk(id, seq, chunk));
        seq += 1;
        this.bytesServed += chunk.length;
      }
      this.emit();
      return this.reply(channel, { v: 1, id, ok: true, done: true });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NotFoundError") return fail("No such file or folder on this drive.");
      if (name === "NotAllowedError") {
        return fail("Permission to this folder was lost — re-allow it on the sharing tab.");
      }
      return fail("That could not be read. Try again, or re-attach the drive.");
    }
  }

  private async walk(
    root: FileSystemDirectoryHandle,
    components: string[],
  ): Promise<FileSystemDirectoryHandle> {
    let dir = root;
    for (const component of components) dir = await dir.getDirectoryHandle(component);
    return dir;
  }

  private async stat(root: FileSystemDirectoryHandle, path: string[]): Promise<ListEntry> {
    if (path.length === 0) return { name: "", kind: "directory" };
    const dir = await this.walk(root, path.slice(0, -1));
    const name = path[path.length - 1];
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      return { name, kind: "file", size: file.size, modified: file.lastModified };
    } catch {
      await dir.getDirectoryHandle(name);
      return { name, kind: "directory" };
    }
  }
}

/** Wait for the channel to drain below its low-water mark before sending more. */
function drained(channel: RTCDataChannel): Promise<void> {
  channel.bufferedAmountLowThreshold = BUFFERED_HIGH / 2;
  return new Promise((resolve) => {
    const done = () => {
      channel.removeEventListener("bufferedamountlow", done);
      channel.removeEventListener("close", done);
      resolve();
    };
    channel.addEventListener("bufferedamountlow", done);
    channel.addEventListener("close", done);
  });
}
