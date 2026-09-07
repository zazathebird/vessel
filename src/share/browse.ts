/**
 * The browsing side of the connect ceremony (SPEC-ACCOUNTS.md §13): offer,
 * signed fingerprint out; verified answer in; then the file protocol over the
 * data channel.
 *
 * The grant key is handed in by the caller — unwrapped for this connection
 * (§12 K) and never stored — and the agent's answer is verified against
 * `machines.agent_pubkey` from the machine list before the description is even
 * accepted. A failed check closes everything: no channel, no retry, and the
 * error says what happened.
 */

import type { MachineInfo } from "../auth/api";
import { fromBase64Url, toBase64Url } from "../auth/encoding";
import { fingerprintFromSdp, signFingerprint, verifyFingerprint } from "./handshake";
import { shareStore } from "./store";
import {
  CHANNEL_LABEL,
  ICE_SERVERS,
  unpackChunk,
  type FileReply,
  type ListEntry,
} from "./protocol";

const CONNECT_TIMEOUT_MS = 20_000;

interface PendingRead {
  kind: "read";
  chunks: Uint8Array[];
  received: number;
  size: number;
  onProgress?: (received: number, size: number) => void;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

interface PendingCall {
  kind: "call";
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * What a pinned agent key says about the key the server is offering now.
 * Pure, so `npm run check` can drive it; `DriveConnection.open` is the only
 * caller and acts on it before a socket is opened.
 */
export function pinVerdict(pinned: string | null, offered: string): "first" | "same" | "changed" {
  if (pinned === null) return "first";
  return pinned === offered ? "same" : "changed";
}

/**
 * The server offered a different agent key than the one this browser last
 * connected to (2026-09-07, audit item 43). Thrown before any socket opens.
 * The page asks the owner: a re-key they did themselves is the one honest
 * reason, and anything else is an impostor agent.
 */
export class AgentKeyChanged extends Error {
  constructor(
    readonly machine: MachineInfo,
    readonly offered: string,
  ) {
    super(
      `${machine.name}'s key is not the one this browser connected to before. If you re-paired or re-keyed it yourself, accept the new key; if not, refuse — something else is answering as that machine.`,
    );
    this.name = "AgentKeyChanged";
  }
}

export class DriveConnection {
  /** True once the channel folded — callers drop the connection and reconnect. */
  closed = false;

  private nextId = 1;
  private readonly pending = new Map<number, PendingRead | PendingCall>();

  private constructor(
    private readonly ws: WebSocket,
    private readonly pc: RTCPeerConnection,
    private readonly channel: RTCDataChannel,
  ) {
    channel.onmessage = (event) => this.onChannelMessage(event.data);
    const fold = () => this.close(new Error("The connection to that machine closed."));
    channel.onclose = fold;
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) fold();
    };
  }

  /**
   * Open a verified peer connection to a machine's agent. Throws with §10-shaped
   * wording on every way it can fail: offline, refused, identity mismatch, or
   * a NAT pair that will not traverse (§12 P — no relay is enabled).
   */
  static async open(machine: MachineInfo, grantKey: CryptoKey): Promise<DriveConnection> {
    // The pin is consulted BEFORE the socket, so a changed key never gets as
    // far as signalling — the agent that is answering learns nothing.
    const verdict = pinVerdict(await shareStore.pin(machine.id), machine.agentPubkey);
    if (verdict === "changed") throw new AgentKeyChanged(machine, machine.agentPubkey);
    const conn = await DriveConnection.dial(machine, grantKey);
    // Trust on first use, taken only once the agent has proven the key by
    // signature — a pin on an unverified key would pin the impostor.
    if (verdict === "first") await shareStore.savePin(machine.id, machine.agentPubkey);
    return conn;
  }

  private static dial(machine: MachineInfo, grantKey: CryptoKey): Promise<DriveConnection> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/signal/${machine.id}?role=browser`);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const channel = pc.createDataChannel(CHANNEL_LABEL);
      channel.binaryType = "arraybuffer";

      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        ws.close();
        pc.close();
        reject(new Error(message));
      };
      const timer = setTimeout(() => {
        fail(
          "Could not reach that machine directly. This network pair may need a relay, which is not enabled yet.",
        );
      }, CONNECT_TIMEOUT_MS);

      channel.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new DriveConnection(ws, pc, channel));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ice", payload: { candidate: event.candidate.toJSON() } }));
        }
      };

      ws.onerror = () => fail("Could not reach the signalling service. Try again shortly.");
      ws.onmessage = async (event) => {
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (frame.type === "hello") {
          if (!frame.agentOnline) {
            return fail("That machine is offline — open its sharing tab to bring it back.");
          }
          // The ceremony, steps 1–3 (§13): offer out, signed.
          await pc.setLocalDescription(await pc.createOffer());
          const sdp = pc.localDescription?.sdp ?? "";
          const fingerprint = fingerprintFromSdp(sdp);
          if (!fingerprint) return fail("This browser did not produce a usable connection offer.");
          const signature = await signFingerprint(grantKey, "owner", machine.id, fingerprint);
          ws.send(
            JSON.stringify({
              type: "offer",
              payload: { sdp, fingerprint, signature: toBase64Url(signature) },
            }),
          );
          return;
        }

        if (frame.type === "answer") {
          const payload = (frame.payload ?? {}) as Record<string, unknown>;
          const sdp = typeof payload.sdp === "string" ? payload.sdp : "";
          const fingerprint = fingerprintFromSdp(sdp);
          let verified = false;
          if (fingerprint && typeof payload.signature === "string") {
            try {
              verified = await verifyFingerprint(
                fromBase64Url(machine.agentPubkey),
                "agent",
                machine.id,
                fingerprint,
                fromBase64Url(payload.signature),
              );
            } catch {
              verified = false;
            }
          }
          if (!verified) {
            // §3's MITM row: a substituted fingerprint fails here and nothing opens.
            return fail("That machine failed its identity check. Refusing to connect.");
          }
          await pc.setRemoteDescription({ type: "answer", sdp });
          return;
        }

        if (frame.type === "ice") {
          const candidate = (frame.payload as { candidate?: RTCIceCandidateInit } | undefined)
            ?.candidate;
          if (candidate) await pc.addIceCandidate(candidate).catch(() => undefined);
          return;
        }

        if (frame.type === "refused") {
          const reason = (frame.payload as { reason?: string } | undefined)?.reason;
          return fail(reason ?? "That machine refused the connection.");
        }

        if (frame.type === "agent-status" && frame.online === false && !settled) {
          return fail("That machine went offline — open its sharing tab to bring it back.");
        }
      };
    });
  }

  close(reason?: Error): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(reason ?? new Error("The connection closed."));
    }
    this.pending.clear();
    try {
      this.channel.close();
    } catch {
      /* already closed */
    }
    this.pc.close();
    this.ws.close();
  }

  private onChannelMessage(data: unknown): void {
    if (typeof data === "string") {
      let reply: FileReply;
      try {
        reply = JSON.parse(data);
      } catch {
        return;
      }
      const pending = this.pending.get(reply.id);
      if (!pending) return;

      if (!reply.ok) {
        this.pending.delete(reply.id);
        pending.reject(new Error(reply.error));
        return;
      }
      if (pending.kind === "read") {
        if ("size" in reply) {
          pending.size = reply.size;
          return;
        }
        if ("done" in reply) {
          this.pending.delete(reply.id);
          pending.resolve(new Blob(pending.chunks as BlobPart[]));
          return;
        }
        return;
      }
      this.pending.delete(reply.id);
      pending.resolve(reply);
      return;
    }

    if (data instanceof ArrayBuffer) {
      const { id, data: bytes } = unpackChunk(data);
      const pending = this.pending.get(id);
      if (pending?.kind !== "read") return;
      pending.chunks.push(bytes);
      pending.received += bytes.length;
      pending.onProgress?.(pending.received, pending.size);
    }
  }

  private call<T>(request: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        kind: "call",
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.channel.send(JSON.stringify({ v: 1, id, ...request }));
    });
  }

  list(drive: string, path: string[]): Promise<{ entries: ListEntry[]; truncated: boolean }> {
    return this.call({ op: "list", drive, path });
  }

  read(
    drive: string,
    path: string[],
    onProgress?: (received: number, size: number) => void,
  ): Promise<Blob> {
    const id = this.nextId++;
    return new Promise<Blob>((resolve, reject) => {
      this.pending.set(id, {
        kind: "read",
        chunks: [],
        received: 0,
        size: 0,
        onProgress,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.channel.send(JSON.stringify({ v: 1, id, op: "read", drive, path }));
    });
  }
}
