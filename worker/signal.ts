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
 * **Authentication happens in the Worker, not here.** By the time a request
 * reaches this object it has passed `requireAccount` and the machine-ownership
 * check (`worker/index.ts`); the object is unreachable except through that
 * gate.
 *
 * **What phase 3 may widen is the BROWSER role, and not the agent role** — this
 * comment used to say the gate widens to grantees and "nothing in this file
 * changes", which is false of `?role=agent` and would have been read as
 * permission (2026-09-14). `/connect?role=agent` below **evicts the incumbent
 * agent unconditionally** and makes the newcomer the one socket every browsing
 * tab's offers are routed to. A grantee who passed a widened ownership check
 * could therefore take over the machine's agent position, and then what a
 * browsing tab is introduced to is the grantee. It is not reachable today —
 * `signalUpgrade` refuses `role=agent` to anybody who is not the owner, in its
 * own statement, separate from the ownership query precisely so that widening
 * the query cannot inherit it — and the agent's own grant-key verification
 * bounds what a takeover would yield. But a comment is what the next person
 * trusts when they widen the gate, and this one was telling them the object had
 * no opinion about who connects as what.
 *
 * Uses the WebSocket hibernation API so an idle agent tab costs nothing: all
 * state is derivable from `getWebSockets()` tags and attachments.
 */

import type { Env } from "./env";

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
 * the newest tab is authoritative for the machine, whereas evicting a browsing
 * tab would turn the bound into a way to knock somebody off a browse they were
 * in the middle of.
 */
const MAX_BROWSER_SOCKETS = 8;

/** Measures the frame the way the wire does — see `webSocketMessage`. */
const encoder = new TextEncoder();

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
/** What the agent may send. `refused` is the fingerprint-check failure (§13). */
const AGENT_TYPES = new Set(["answer", "ice", "refused"]);

interface Attachment {
  role: "agent" | "browser";
  peer: string;
}

export class MachineSignal {
  constructor(private readonly ctx: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/presence") {
      return Response.json({ agentOnline: this.agent() !== null });
    }

    if (url.pathname === "/shutdown") {
      // The machine was removed. Hang up on everyone; future upgrades fail the
      // ownership check in the Worker and never reach here.
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

      // Counted before the pair is minted, and counted as an ordinary response
      // rather than an accepted-then-closed socket: the client cannot read a
      // close code off a handshake it never completed either way, and refusing
      // at the upgrade keeps the object from having to hold a socket it has
      // already decided against. `signalUpgrade` hardens every non-101 the
      // object returns.
      if (role === "browser" && this.browsers().length >= MAX_BROWSER_SOCKETS) {
        return new Response("Too many open connections to this machine.", { status: 429 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const peer = crypto.randomUUID();

      if (role === "agent") {
        // One agent per machine; the newest tab is authoritative (§12 M). The
        // incumbent is told, so it can render "another tab took over" instead
        // of a dead socket.
        for (const ws of this.ctx.getWebSockets("agent")) {
          this.send(ws, { type: "replaced" });
          ws.close(4001, "replaced");
        }
        this.ctx.acceptWebSocket(server, ["agent"]);
        server.serializeAttachment({ role, peer } satisfies Attachment);
        this.broadcastToBrowsers({ type: "agent-status", online: true });
      } else {
        this.ctx.acceptWebSocket(server, ["browser", `peer:${peer}`]);
        server.serializeAttachment({ role, peer } satisfies Attachment);
        this.send(server, { type: "hello", peer, agentOnline: this.agent() !== null });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found.", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // `message.length` counts UTF-16 code units, not bytes — a frame of
    // three-byte UTF-8 characters passes a "64KB" check at ~192KB on the wire
    // (2026-09-03 audit; `readJson` in `accounts.ts` records the same lesson).
    // The cheap check first short-circuits the encode for the common oversized
    // case; the encode is what makes the limit true. This socket is
    // owner-authenticated, so it is a bound rather than a boundary — but a bound
    // that is 3× what it says is not a bound.
    if (
      typeof message !== "string" ||
      message.length > MAX_FRAME_BYTES ||
      encoder.encode(message).byteLength > MAX_FRAME_BYTES
    ) {
      ws.close(1009, "frame too large");
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

    const who = ws.deserializeAttachment() as Attachment | null;
    const type = typeof frame.type === "string" ? frame.type : "";

    if (who?.role === "browser") {
      if (!BROWSER_TYPES.has(type)) {
        ws.close(1003, "unknown frame");
        return;
      }
      const agent = this.agent();
      if (!agent) {
        // The honest answer, not a generic failure (§12 N).
        this.send(ws, { type: "agent-status", online: false });
        return;
      }
      // Tagged with the sender so the agent can address its reply.
      this.send(agent, { type, from: who.peer, payload: frame.payload });
      return;
    }

    if (who?.role === "agent") {
      // `frame.to` is validated for *shape* in the same place as the frame
      // type, and before it is used: it is about to be interpolated into a
      // hibernation tag, and a tag is not a string the runtime accepts at any
      // length. Refuse, never repair — a truncated id would address the wrong
      // peer, or none, and say nothing.
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

  async webSocketClose(ws: WebSocket): Promise<void> {
    const who = ws.deserializeAttachment() as Attachment | null;
    if (who?.role === "agent" && this.agent(ws) === null) {
      this.broadcastToBrowsers({ type: "agent-status", online: false });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** The live agent socket, if any — excluding one that is mid-close. */
  private agent(closing?: WebSocket): WebSocket | null {
    for (const ws of this.ctx.getWebSockets("agent")) {
      if (ws !== closing && ws.readyState === WebSocket.READY_STATE_OPEN) return ws;
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
      .filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private broadcastToBrowsers(frame: Record<string, unknown>): void {
    for (const ws of this.ctx.getWebSockets("browser")) this.send(ws, frame);
  }

  /** Send, tolerating a socket that closed between enumeration and write. */
  private send(ws: WebSocket, frame: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // A closing socket's loss is its own; the frame was best-effort.
    }
  }
}
