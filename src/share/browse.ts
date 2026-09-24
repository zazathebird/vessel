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
import { PEER_ID, fingerprintFromSdp, signFingerprint, verifyFingerprint } from "./handshake";
import { shareStore } from "./store";
import {
  CHANNEL_LABEL,
  ICE_SERVERS,
  MAX_QUEUED_ICE,
  unpackChunk,
  type FileReply,
  type ListEntry,
} from "./protocol";

const CONNECT_TIMEOUT_MS = 20_000;

/**
 * How long a request may go without a word before it is given up on.
 *
 * Nothing in the file protocol waits on a condition and nothing retries, so
 * before this every way a reply could fail to arrive — a listing the agent
 * could not send, a frame it refused, an agent that folded without closing the
 * channel — left a promise pending for the life of the tab, holding whatever
 * chunks it had accumulated, with the explorer showing "Listing…" for ever.
 *
 * IDLE time, not total: a read's timer is reset by every chunk, so a slow
 * legitimate transfer of a large file cannot trip it however long it takes.
 */
const REQUEST_IDLE_MS = 60_000;

interface PendingRead {
  kind: "read";
  chunks: Uint8Array[];
  received: number;
  size: number;
  timer: ReturnType<typeof setTimeout> | null;
  onProgress?: (received: number, size: number) => void;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

interface PendingCall {
  kind: "call";
  timer: ReturnType<typeof setTimeout> | null;
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
  static async open(
    machine: MachineInfo,
    grantKey: CryptoKey,
    /*
     * The owner answered the `AgentKeyChanged` question with "I re-keyed it"
     * (2026-09-14). It suppresses the refusal and NOTHING else: the new key is
     * still dialled, still verified by signature, and still pinned only after
     * `dial()` resolves.
     *
     * It is a parameter rather than a pin the page writes itself because the
     * page used to do exactly that — `savePin` before `connect()` — which pinned
     * a key that had proven nothing and, with no rollback, left it pinned when
     * the connection then failed, silencing this warning for whatever answered
     * next. Clearing the pin instead only moved the hole: a connect that failed
     * after an accept left the machine un-pinned indefinitely, so the next
     * successful connect silently trusted whatever the server named by then.
     * Routing the decision through here means the pin is never absent and never
     * written ahead of verification.
     */
    acceptNewKey = false,
  ): Promise<DriveConnection> {
    // The pin is consulted BEFORE the socket, so a changed key never gets as
    // far as signalling — the agent that is answering learns nothing.
    //
    // A read that throws is a refusal, not a "first" verdict: IndexedDB has no
    // fallback here, and treating an unreadable store as "nothing pinned" would
    // turn every blocked-site-data browser into one that trusts whatever the
    // server names. Nothing is dialled, and the message says which it is.
    let pinned: string | null;
    try {
      pinned = await shareStore.pin(machine.id);
    } catch {
      throw new Error(
        "This browser could not read what it remembers about that machine's key, so it cannot tell whether the key has changed. Check that site data is allowed for this site, then try again.",
      );
    }
    const verdict = pinVerdict(pinned, machine.agentPubkey);
    if (verdict === "changed" && !acceptNewKey) throw new AgentKeyChanged(machine, machine.agentPubkey);
    const conn = await DriveConnection.dial(machine, grantKey);
    /*
     * Trust on first use, and the accepted re-key, both taken only once the
     * agent has proven the key by signature — a pin on an unverified key would
     * pin the impostor. `same` needs no write.
     *
     * The write can fail on its own, and IndexedDB has no fallback here: a full
     * quota, evicted site data, a private window. Failing out of `open()` with
     * the connection already established leaked it — WebSocket, peer connection
     * and data channel open for the life of the tab, still counted in the
     * agent's `peers`, while the owner read "Could not connect" over a raw
     * IndexedDB error. Close it first, then say what actually went wrong. The
     * ordering above is untouched: nothing is pinned before `dial()` verifies.
     */
    try {
      if (verdict !== "same") await shareStore.savePin(machine.id, machine.agentPubkey);
    } catch {
      conn.close(new Error("This browser could not remember that machine's key."));
      throw new Error(
        "Connected, but this browser could not remember that machine's key — so it cannot warn you if the key changes. Check that site data is allowed for this site, then try again.",
      );
    }
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

      /*
       * The agent's candidates arrive before its answer does — it emits them
       * the moment it sets its local description, and then `await`s a WebCrypto
       * signature before the answer is sent. `addIceCandidate` with no remote
       * description rejects, and that rejection went into a `.catch(() =>
       * undefined)`, so every early candidate was lost silently and the 20s
       * timer above blamed NAT for it. `remoteReady` is set only once
       * `setRemoteDescription` has RESOLVED, because `ws.onmessage` is async and
       * nothing serialises frames: an `ice` frame can be handled while the
       * answer is still being applied.
       */
      const queuedIce: RTCIceCandidateInit[] = [];
      let remoteReady = false;
      const flushIce = async () => {
        while (queuedIce.length > 0) {
          const candidate = queuedIce.shift();
          if (candidate) await pc.addIceCandidate(candidate).catch(() => undefined);
        }
      };

      /** This socket's id, from the object's `hello` — what both signatures bind. */
      let peerId: string | null = null;

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
          // The signature binds this socket's peer id (handshake v2), so the
          // offer is good on this socket and nowhere else.
          if (typeof frame.peer !== "string" || !PEER_ID.test(frame.peer)) {
            return fail("The signalling service sent a greeting this browser cannot use.");
          }
          peerId = frame.peer;
          // The ceremony, steps 1–3 (§13): offer out, signed.
          await pc.setLocalDescription(await pc.createOffer());
          const sdp = pc.localDescription?.sdp ?? "";
          const fingerprint = fingerprintFromSdp(sdp);
          if (!fingerprint) return fail("This browser did not produce a usable connection offer.");
          const signature = await signFingerprint(grantKey, "owner", machine.id, peerId, fingerprint);
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
          if (fingerprint && peerId && typeof payload.signature === "string") {
            try {
              verified = await verifyFingerprint(
                fromBase64Url(machine.agentPubkey),
                "agent",
                machine.id,
                peerId,
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
          remoteReady = true;
          await flushIce();
          return;
        }

        if (frame.type === "ice") {
          const candidate = (frame.payload as { candidate?: RTCIceCandidateInit } | undefined)
            ?.candidate;
          if (!candidate) return;
          if (!remoteReady) {
            if (queuedIce.length < MAX_QUEUED_ICE) queuedIce.push(candidate);
            return;
          }
          await pc.addIceCandidate(candidate).catch(() => undefined);
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
      if (pending.timer !== null) clearTimeout(pending.timer);
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

  /**
   * Start, or restart, a request's idle timer. Every word from the agent about
   * a request resets it, so the clock measures silence and not the size of the
   * job — a listing of a slow spinning disk and a gigabyte read are both fine
   * as long as something keeps arriving.
   */
  private arm(id: number): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this.pending.delete(id);
      pending.reject(new Error("That machine stopped answering. Try again, or reconnect to it."));
    }, REQUEST_IDLE_MS);
  }

  /** Take a request off the board: its timer stops with it. */
  private settle(id: number): void {
    const pending = this.pending.get(id);
    if (pending && pending.timer !== null) clearTimeout(pending.timer);
    this.pending.delete(id);
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
        this.settle(reply.id);
        pending.reject(new Error(reply.error));
        return;
      }
      if (pending.kind === "read") {
        if ("size" in reply) {
          pending.size = reply.size;
          this.arm(reply.id);
          return;
        }
        if ("done" in reply) {
          this.settle(reply.id);
          pending.resolve(new Blob(pending.chunks as BlobPart[]));
          return;
        }
        return;
      }
      this.settle(reply.id);
      pending.resolve(reply);
      return;
    }

    if (data instanceof ArrayBuffer) {
      /*
       * `unpackChunk` refuses a frame too short to carry its own header, and
       * this handler used to call it bare: the `RangeError` came straight out
       * of the event handler, the pending read was never rejected, and with no
       * request timeout its promise and its accumulated chunks stayed resident
       * for the life of the tab. The frame names no request — there is no id in
       * it to reject — and a data channel is reliable and message-oriented, so
       * a frame this shape is not truncation but a peer sending something this
       * protocol does not contain. Fold the connection: every pending request
       * is rejected with a reason the page can show.
       */
      let id: number;
      let bytes: Uint8Array;
      try {
        ({ id, data: bytes } = unpackChunk(data));
      } catch {
        this.close(new Error("That machine sent something this protocol does not contain."));
        return;
      }
      const pending = this.pending.get(id);
      if (pending?.kind !== "read") return;
      pending.chunks.push(bytes);
      pending.received += bytes.length;
      this.arm(id);
      pending.onProgress?.(pending.received, pending.size);
    }
  }

  private call<T>(request: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        kind: "call",
        timer: null,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.arm(id);
      this.ask(id, { v: 1, id, ...request }, reject);
    });
  }

  /**
   * Send a request, or settle it now. A `send()` that throws — the channel
   * closed between the check and the call — would otherwise reject the promise
   * from inside the executor while leaving the entry on the board with its
   * timer running, and the timer would then reject an already-settled promise
   * a minute later.
   */
  private ask(id: number, request: Record<string, unknown>, reject: (reason: Error) => void): void {
    try {
      this.channel.send(JSON.stringify(request));
    } catch {
      this.settle(id);
      reject(new Error("That machine could not be asked — the connection has closed."));
    }
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
        timer: null,
        onProgress,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.arm(id);
      this.ask(id, { v: 1, id, op: "read", drive, path }, reject);
    });
  }
}
