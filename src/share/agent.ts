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
  LIST_MAX_BYTES,
  MAX_QUEUED_ICE,
  listEntryBytes,
  packChunk,
  type FileReply,
  type ListEntry,
} from "./protocol";

/**
 * Candidates that arrive before their offer does, per peer.
 *
 * The browsing tab sets its local description and then `await`s a WebCrypto
 * signature before it sends the offer, so its first candidates are relayed
 * while this side has no `RTCPeerConnection` for that peer at all — and frames
 * are not serialised here either, so an `ice` frame can be handled while
 * `handleOffer` is still inside `setRemoteDescription`. Dropped candidates do
 * not announce themselves: ICE simply limps, and the browsing tab's 20-second
 * timer then blames NAT for a lost message.
 *
 * `MAX_QUEUED_ICE` bounds one peer's queue; this side needs a second bound the
 * browsing side does not, because the signalling service is an introducer this
 * code does not trust (§12 K) and may relay `ice` frames naming peers that
 * never send an offer at all. Past either bound the surplus is dropped.
 */
const MAX_ICE_QUEUES = 8;

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
  /** Early candidates, held until this side has a remote description (above). */
  private readonly earlyIce = new Map<string, RTCIceCandidateInit[]>();
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
    this.earlyIce.clear();
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
        const from = typeof frame.from === "string" ? frame.from : null;
        const candidate = (frame.payload as { candidate?: RTCIceCandidateInit } | undefined)
          ?.candidate;
        if (!from || !candidate) return;
        const pc = this.peers.get(from);
        // `addIceCandidate` before a remote description rejects, and the peer's
        // candidates all arrive before its offer — hold them instead.
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
          return;
        }
        this.queueIce(from, candidate);
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

  private queueIce(from: string, candidate: RTCIceCandidateInit): void {
    const queued = this.earlyIce.get(from);
    if (queued) {
      if (queued.length < MAX_QUEUED_ICE) queued.push(candidate);
      return;
    }
    if (this.earlyIce.size >= MAX_ICE_QUEUES) return;
    this.earlyIce.set(from, [candidate]);
  }

  /** Called once a peer's remote description is set, and only then. */
  private async flushIce(from: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.earlyIce.get(from);
    this.earlyIce.delete(from);
    if (!queued) return;
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
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
      // §12 K: the introduction is not the authentication. No answer is sent,
      // and anything held for that peer is dropped rather than left to expire.
      this.earlyIce.delete(from);
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
        this.earlyIce.delete(from);
        this.emit();
      }
    };

    await pc.setRemoteDescription({ type: "offer", sdp });
    // The peer's candidates were relayed before its offer was; they are
    // addable from here and not one moment earlier.
    await this.flushIce(from, pc);
    await pc.setLocalDescription(await pc.createAnswer());

    const mySdp = pc.localDescription?.sdp ?? "";
    const myFingerprint = fingerprintFromSdp(mySdp);
    if (!myFingerprint) {
      pc.close();
      this.peers.delete(from);
      this.earlyIce.delete(from);
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

  /**
   * False when the channel would not take it — closed mid-answer, or a message
   * over the peer's maximum. The caller decides which of those it is: for most
   * replies the peer is simply gone and so is the errand, but a listing that is
   * too large has a requester still waiting, and no request in this protocol
   * waits on a condition. A swallowed throw there is the explorer sitting on
   * "Listing…" for ever.
   */
  private reply(channel: RTCDataChannel, reply: FileReply): boolean {
    try {
      channel.send(JSON.stringify(reply));
      return true;
    } catch {
      return false;
    }
  }

  private async handleRequest(
    channel: RTCDataChannel,
    request: Record<string, unknown>,
  ): Promise<void> {
    const id = typeof request.id === "number" ? request.id : -1;
    const fail = (error: string): void => {
      this.reply(channel, { v: 1, id, ok: false, error });
    };

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
        // Two bounds, because the count is not the size: `LIST_MAX` keeps a
        // directory of a million files answering at all, and `LIST_MAX_BYTES`
        // keeps the answer inside one data-channel message. Long names blow the
        // second one at a quarter of the first, which is an ordinary photo
        // folder. Truncating is the same refusal the count bound already makes,
        // and the explorer renders the flag.
        let bytes = 0;
        for await (const [name, handle] of dir.entries()) {
          if (entries.length >= LIST_MAX) {
            truncated = true;
            break;
          }
          let entry: ListEntry;
          if (handle.kind === "file") {
            const file = await (handle as FileSystemFileHandle).getFile();
            entry = { name, kind: "file", size: file.size, modified: file.lastModified };
          } else {
            entry = { name, kind: "directory" };
          }
          bytes += listEntryBytes(entry);
          if (bytes > LIST_MAX_BYTES) {
            truncated = true;
            break;
          }
          entries.push(entry);
        }
        if (!this.reply(channel, { v: 1, id, ok: true, entries, truncated })) {
          // Within both bounds and still refused: the peer's maximum message is
          // smaller than this one assumes. Say so — the requester is waiting.
          fail("That folder's listing was too large to send. Open a folder inside it.");
        }
        return;
      }

      if (op === "stat") {
        const entry = await this.stat(root, path);
        this.reply(channel, { v: 1, id, ok: true, entry });
        return;
      }

      // read
      if (path.length === 0) return fail("That names the folder, not a file in it.");
      const dir = await this.walk(root, path.slice(0, -1));
      const fileHandle = await dir.getFileHandle(path[path.length - 1]);
      const file = await fileHandle.getFile();

      // Refuse, never repair. Both fields were clamped, so `offset: 2000` on a
      // 1,000-byte file answered `size: -1000`, `length: NaN` answered
      // `size: null` and `length: 1.5` answered `size: 1.5` — each of which the
      // browsing tab assigns straight into its progress reading. The shipped
      // browser sends neither field, but the protocol declares both and
      // `isValidPath` beside this is exhaustive; a clamp is an answer to a
      // question nobody asked.
      const offset = byteCount(request.offset, 0);
      if (offset === null) return fail("That read names an offset this protocol does not carry.");
      if (offset > file.size) return fail("That read starts past the end of the file.");
      const length = byteCount(request.length, file.size - offset);
      if (length === null) return fail("That read names a length this protocol does not carry.");
      if (offset + length > file.size) return fail("That read runs past the end of the file.");
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
      this.reply(channel, { v: 1, id, ok: true, done: true });
      return;
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

/**
 * A byte count off the wire, or `null` for one this protocol does not carry.
 * Absent is the caller's default — a `read` naming neither field is the whole
 * file — but present and nonsense is refused rather than corrected: finite,
 * whole and not negative, with the file's own end checked at the call site.
 */
function byteCount(value: unknown, whenAbsent: number): number | null {
  if (value === undefined) return whenAbsent;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
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
