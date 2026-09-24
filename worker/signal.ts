/**
 * The signalling Durable Object — one per paired machine (SPEC-ACCOUNTS.md §8,
 * §13).
 *
 * **An introducer, not a pipe.** It relays SDP offers, answers and ICE
 * candidates — kilobytes — between the machine's agent tab and the owner's
 * browsing tabs, and then the WebRTC data channel runs directly between the
 * peers. It never reads a payload: the signed DTLS fingerprints that
 * authenticate the call ride inside them, so the one party positioned to
 * man-in-the-middle the handshake (§3) is structurally unable to alter the
 * material that would let it. It persists nothing, ever — who-talked-to-whom
 * exists only as open sockets, and a restart forgets it.
 *
 * **Who may reach it is decided in the Worker; who may BE the agent is decided
 * here** (2026-09-24). By the time a request reaches this object it has passed
 * `requireAccount` and the machine-ownership check (`worker/index.ts`), and the
 * object is unreachable except through that gate. That used to be the whole of
 * it, and it made the agent role a thing a session cookie could claim: a stolen
 * thirty-minute cookie opening `?role=agent` once evicted the real agent — which
 * went quiescent on `replaced` and stayed down until somebody physically clicked
 * "Take over here" on an unattended host — and then received every owner offer,
 * ICE candidates and all, which are the owner's addresses.
 *
 * So an agent socket is now **pending until it proves the machine key.** The
 * object mints a challenge per socket, the agent signs it with the
 * non-extractable key whose public half is `machines.agent_pubkey` (handed in by
 * the Worker, never by the client), and only a verified socket evicts the
 * incumbent, counts as presence, or is relayed a single frame. A session alone
 * can still open a pending socket; it can no longer do anything with one.
 *
 * **What phase 3 may widen is the BROWSER role, and not the agent role.** A
 * grantee who passed a widened reach check still cannot answer the challenge,
 * because the machine key is in one browser profile and nowhere else — the
 * proof makes that structural rather than a property of the Worker's role gate,
 * which stays as well.
 *
 * Uses the WebSocket hibernation API so an idle agent tab costs nothing: all
 * state is derivable from `getWebSockets()` tags and attachments.
 */

import type { Env } from "./env";
import { fromBase64Url } from "./encoding";
import { mintConnectNonce, verifyConnectProof } from "../src/share/handshake";

/** Nothing legitimate here is large — an SDP with candidates is a few KB. */
const MAX_FRAME_BYTES = 64 * 1024;

/**
 * How many browsing tabs may hold a socket to one machine at once.
 *
 * The agent role is capped at one by replacement; the browser role was capped
 * by nothing (2026-09-14), while every other user-writable quantity on the site
 * is bounded on principle — `MAX_PASSKEYS`, `MACHINES_MAX`, `DRIVES_MAX`,
 * `SETUPS_MAX`, `MAX_FRAME_BYTES`, `MAX_CONFIG_BYTES`. A socket is cheap under
 * hibernation and this is an owner-authenticated channel, so it is a bound
 * rather than a boundary; a bound that is absent is still absent.
 *
 * Eight is a person with a laptop, a phone and some forgotten tabs, and it is
 * nobody's script. **The newcomer is refused rather than the incumbent evicted**
 * — the opposite of the agent rule, deliberately: the agent is replaced because
 * the newest proven tab is authoritative for the machine, whereas evicting a
 * browsing tab would turn the bound into a way to knock somebody off a browse
 * they were in the middle of. `src/share/agent.ts` caps its peer connections at
 * the same number.
 */
export const MAX_BROWSER_SOCKETS = 8;

/**
 * An agent socket must answer its challenge inside this window. The honest
 * agent answers in one round trip plus one ECDSA signature — milliseconds.
 */
export const PROOF_WINDOW_MS = 10_000;

/**
 * How many unproven agent sockets may wait at once. **The OLDEST is evicted to
 * make room, never the newcomer refused** — refusing would let anybody holding a
 * session keep four stale pending sockets open and lock the real agent out of
 * reconnecting at all, while evicting only costs the real agent a retry if it
 * was the oldest, and its proof takes one round trip where a flood has to keep
 * pace for ever. Pending sockets are relayed nothing and count for nothing, so
 * this is a bound on memory, not a gate.
 */
export const MAX_PENDING_AGENTS = 4;

/**
 * Per-socket frame budgets, as token buckets (2026-09-24). The 64 KiB frame
 * cap bounded the size of one frame and nothing bounded how many, so any
 * session holder could make the object relay without limit. A browsing tab
 * sends one offer and a trickle of candidates per connection; an agent answers
 * up to eight peers at once with an answer and its own trickle each. Both
 * budgets are several connections' worth of burst and a comfortable sustained
 * rate — nobody's honest tab comes near them, and exhaustion is a close with
 * 1008, not a dropped frame, because a dropped frame is a connection that fails
 * later for a reason nobody can see.
 */
export const FRAME_BUDGET = {
  browser: { burst: 64, perSecond: 16 },
  agent: { burst: 256, perSecond: 64 },
} as const;

/**
 * Headers the Worker sets on the internal `/connect` request. The Worker
 * deletes any client-supplied copy before setting its own, so what arrives here
 * is the Worker's statement and never the caller's (`signalUpgrade`).
 */
export const AGENT_KEY_HEADER = "x-vessel-agent-key";
export const MACHINE_HEADER = "x-vessel-machine";

/** Measures the frame the way the wire does — see `webSocketMessage`. */
const encoder = new TextEncoder();

/**
 * `WebSocket.READY_STATE_OPEN` in workerd, which is the standard `OPEN` (1).
 * Named here rather than read off the runtime's class so `npm run check` can
 * drive this object in Node, whose `WebSocket` has no such property.
 */
const OPEN = 1;

/**
 * A peer id is a `crypto.randomUUID()` minted by this object and nothing else
 * (`/connect`, below). `frame.to` arrives from the agent as free text, and it
 * becomes a **hibernation tag** — which the runtime caps at 256 characters, so
 * an over-long one can throw inside `webSocketMessage`, where an unhandled
 * rejection is not a refusal anybody sees. Matching the shape it is supposed to
 * have costs nothing and makes the tag lookup unreachable with anything else.
 */
const PEER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What a browser tab may send; everything else closes the socket. */
const BROWSER_TYPES = new Set(["offer", "ice"]);
/** What a proven agent may send. `refused` is the fingerprint-check failure (§13). */
const AGENT_TYPES = new Set(["answer", "ice", "refused"]);

interface Attachment {
  role: "agent" | "browser";
  peer: string;
  /** Agent only: false until the socket has answered its challenge. */
  proven?: boolean;
  /** Agent only: the challenge this socket must sign. */
  nonce?: string;
  /** Agent only: `machines.agent_pubkey` as the Worker read it at the upgrade. */
  key?: string;
  /** Agent only: the machine id, which the proof binds. */
  machine?: string;
  /** When the socket was accepted. */
  since: number;
  /** The frame budget — see `FRAME_BUDGET`. */
  tokens: number;
  at: number;
}

export class MachineSignal {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/presence") {
      return Response.json({ agentOnline: this.agent() !== null });
    }

    if (url.pathname === "/shutdown") {
      /*
       * Re-keying (2026-09-24) hangs up on every agent socket that holds a key
       * other than the new one — proven or still pending, since a pending socket
       * opened before the re-key would otherwise be checked against the OLD key
       * it was admitted with. Browsing tabs stay: nothing about their
       * connection's authority changed, and they are told the agent left.
       */
      if (url.searchParams.get("reason") === "rekeyed") {
        const current = request.headers.get(AGENT_KEY_HEADER);
        for (const ws of this.ctx.getWebSockets("agent")) {
          const who = attachment(ws);
          if (!who || who.key === current) continue;
          // Demoted before the close, so its eventual `webSocketClose` does not
          // announce a second departure after the one broadcast below.
          ws.serializeAttachment({ ...who, proven: false } satisfies Attachment);
          this.send(ws, { type: "rekeyed" });
          ws.close(4005, "machine re-keyed");
        }
        if (this.agent() === null) this.broadcastToBrowsers({ type: "agent-status", online: false });
        return Response.json({ status: "closed" });
      }
      /*
       * Sessions ended (2026-09-24 pre-deploy review): a password change, a
       * reset or a TOTP reset hangs up every socket, but the machine is still
       * paired. Saying `machine-removed` here put "This machine was removed"
       * and a Forget button on the kiosk, and stopped it for good. A plain
       * close reads as a drop: the agent retries quietly, and is admitted again
       * once somebody signs that browser back in.
       */
      if (url.searchParams.get("reason") === "signed-out") {
        for (const ws of this.ctx.getWebSockets()) ws.close(4006, "sessions ended");
        return Response.json({ status: "closed" });
      }
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { type: "machine-removed" });
        ws.close(4004, "machine removed");
      }
      return Response.json({ status: "closed" });
    }

    if (url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade.", { status: 426 });
      }
      const role = url.searchParams.get("role");
      if (role !== "agent" && role !== "browser") {
        return new Response("Unknown role.", { status: 400 });
      }

      if (role === "browser" && this.browsers().length >= MAX_BROWSER_SOCKETS) {
        return new Response("Too many open connections to this machine.", { status: 429 });
      }

      const key = request.headers.get(AGENT_KEY_HEADER);
      const machine = request.headers.get(MACHINE_HEADER);
      if (role === "agent" && (!key || !machine)) {
        // Only the Worker's gate can produce these; their absence is a bug there,
        // and an agent socket with nothing to prove against is refused outright.
        return new Response("An agent connection needs the machine's key.", { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const peer = crypto.randomUUID();
      const now = Date.now();

      if (role === "agent") {
        this.sweepPending(now);
        const nonce = mintConnectNonce();
        this.ctx.acceptWebSocket(server, ["agent"]);
        server.serializeAttachment({
          role,
          peer,
          proven: false,
          nonce,
          key: key!,
          machine: machine!,
          since: now,
          tokens: FRAME_BUDGET.agent.burst,
          at: now,
        } satisfies Attachment);
        this.send(server, { type: "challenge", nonce });
      } else {
        this.ctx.acceptWebSocket(server, ["browser", `peer:${peer}`]);
        server.serializeAttachment({
          role,
          peer,
          since: now,
          tokens: FRAME_BUDGET.browser.burst,
          at: now,
        } satisfies Attachment);
        this.send(server, { type: "hello", peer, agentOnline: this.agent() !== null });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found.", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (
      typeof message !== "string" ||
      message.length > MAX_FRAME_BYTES ||
      encoder.encode(message).byteLength > MAX_FRAME_BYTES
    ) {
      ws.close(1009, "frame too large");
      return;
    }

    const who = attachment(ws);
    if (!who) {
      ws.close(1011, "no attachment");
      return;
    }
    // Before parsing: an unparseable frame still spent the relay's attention.
    if (!this.spend(ws, who)) {
      ws.close(1008, "too many frames");
      return;
    }

    let frame: Record<string, unknown>;
    try {
      const parsed = JSON.parse(message);
      if (typeof parsed !== "object" || parsed === null) throw new Error("shape");
      frame = parsed as Record<string, unknown>;
    } catch {
      ws.close(1003, "malformed frame");
      return;
    }

    const type = typeof frame.type === "string" ? frame.type : "";

    if (who.role === "browser") {
      if (!BROWSER_TYPES.has(type)) {
        ws.close(1003, "unknown frame");
        return;
      }
      const agent = this.agent();
      if (!agent) {
        this.send(ws, { type: "agent-status", online: false });
        return;
      }
      this.send(agent, { type, from: who.peer, payload: frame.payload });
      return;
    }

    if (who.role === "agent" && !who.proven) {
      await this.prove(ws, who, type, frame);
      return;
    }

    if (who.role === "agent") {
      if (!AGENT_TYPES.has(type) || typeof frame.to !== "string" || !PEER_ID.test(frame.to)) {
        ws.close(1003, "unknown frame");
        return;
      }
      const target = this.ctx.getWebSockets(`peer:${frame.to}`)[0];
      if (target) this.send(target, { type, payload: frame.payload });
      return;
    }

    ws.close(1011, "no attachment");
  }

  /**
   * A pending agent socket's one permitted frame. Anything else — any other
   * type, a late answer, a signature that does not verify — ends the socket,
   * and nothing about the incumbent changes until a proof succeeds.
   */
  private async prove(
    ws: WebSocket,
    who: Attachment,
    type: string,
    frame: Record<string, unknown>,
  ): Promise<void> {
    if (type !== "prove" || typeof frame.signature !== "string") {
      ws.close(1008, "prove the machine key first");
      return;
    }
    if (Date.now() - who.since > PROOF_WINDOW_MS) {
      ws.close(1008, "proof timed out");
      return;
    }
    let ok = false;
    try {
      ok = await verifyConnectProof(
        fromBase64Url(who.key ?? ""),
        who.machine ?? "",
        who.nonce ?? "",
        fromBase64Url(frame.signature),
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      this.send(ws, { type: "proof-refused" });
      ws.close(4003, "machine key not proven");
      return;
    }

    // Proven: this socket is the machine's agent now, and only now.
    for (const other of this.ctx.getWebSockets("agent")) {
      if (other === ws || !attachment(other)?.proven) continue;
      this.send(other, { type: "replaced" });
      other.close(4001, "replaced");
    }
    ws.serializeAttachment({ ...who, proven: true, nonce: undefined } satisfies Attachment);
    this.send(ws, { type: "accepted" });
    this.broadcastToBrowsers({ type: "agent-status", online: true });

    // Connection events, not liveness (§12 N) — and stamped only for a proven
    // agent, so a cookie alone cannot make a machine look recently seen.
    try {
      await this.env.DB.prepare("UPDATE machines SET last_seen = ? WHERE id = ?")
        .bind(Date.now(), who.machine ?? "")
        .run();
    } catch {
      // Presence is the socket; the stamp is a courtesy.
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const who = attachment(ws);
    if (who?.role === "agent" && who.proven && this.agent(ws) === null) {
      this.broadcastToBrowsers({ type: "agent-status", online: false });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /**
   * Take one frame from the socket's budget, refilling at its rate. The bucket
   * lives in the attachment because hibernation discards everything else.
   */
  private spend(ws: WebSocket, who: Attachment): boolean {
    const budget = FRAME_BUDGET[who.role];
    const now = Date.now();
    const elapsed = Math.max(0, now - who.at);
    const tokens = Math.min(budget.burst, who.tokens + (elapsed * budget.perSecond) / 1000);
    if (tokens < 1) return false;
    who.tokens = tokens - 1;
    who.at = now;
    ws.serializeAttachment(who);
    return true;
  }

  /** Close pending agents past their window, then the oldest while over the cap. */
  private sweepPending(now: number): void {
    const pending: { ws: WebSocket; since: number }[] = [];
    for (const ws of this.ctx.getWebSockets("agent")) {
      const who = attachment(ws);
      if (!who || who.proven || ws.readyState !== OPEN) continue;
      if (now - who.since > PROOF_WINDOW_MS) ws.close(1008, "proof timed out");
      else pending.push({ ws, since: who.since });
    }
    pending.sort((a, b) => a.since - b.since);
    // Room for the newcomer about to be accepted.
    while (pending.length >= MAX_PENDING_AGENTS) {
      pending.shift()!.ws.close(1008, "superseded before proving");
    }
  }

  /**
   * The live, PROVEN agent socket, if any — excluding one that is mid-close. A
   * pending socket is never the agent: it is not presence, it evicts nobody,
   * and it is relayed nothing.
   */
  private agent(closing?: WebSocket): WebSocket | null {
    for (const ws of this.ctx.getWebSockets("agent")) {
      if (ws === closing || ws.readyState !== OPEN) continue;
      if (attachment(ws)?.proven) return ws;
    }
    return null;
  }

  /**
   * The live browsing sockets — `readyState` filtered like `agent()`, because
   * `getWebSockets` also returns one that is mid-close, and a cap that counted
   * those would refuse an honest reconnect after a tab was shut.
   */
  private browsers(): WebSocket[] {
    return this.ctx
      .getWebSockets("browser")
      .filter((ws) => ws.readyState === OPEN);
  }

  private broadcastToBrowsers(frame: Record<string, unknown>): void {
    for (const ws of this.ctx.getWebSockets("browser")) this.send(ws, frame);
  }

  /** Send, tolerating a socket that closed between enumeration and write. */
  private send(ws: WebSocket, frame: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
    }
  }
}

function attachment(ws: WebSocket): Attachment | null {
  try {
    return ws.deserializeAttachment() as Attachment | null;
  } catch {
    return null;
  }
}
