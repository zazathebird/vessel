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
 * gate. Phase 3 widens the gate to grantees; nothing in this file changes.
 *
 * Uses the WebSocket hibernation API so an idle agent tab costs nothing: all
 * state is derivable from `getWebSockets()` tags and attachments.
 */

import type { Env } from "./env";

/** Nothing legitimate here is large — an SDP with candidates is a few KB. */
const MAX_FRAME_BYTES = 64 * 1024;

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
    if (typeof message !== "string" || message.length > MAX_FRAME_BYTES) {
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
      if (!AGENT_TYPES.has(type) || typeof frame.to !== "string") {
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
