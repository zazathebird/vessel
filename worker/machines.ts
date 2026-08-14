/**
 * Machines and drives — phase 2's server half (SPEC-ACCOUNTS.md §13).
 *
 * Note how little authority lives here. The server stores a machine's *public*
 * key and a drive's *label*; the machine keypair's private half, the directory
 * handles and the absolute paths they resolve to all live in the sharing tab's
 * own storage and never arrive in any request (§9). Deleting every row in both
 * tables would break nobody's files — it would only forget the introductions.
 *
 * Pairing — first pairing and re-keying alike — is a password ceremony
 * (§12 L): registering an agent public key adds a trust anchor, and the
 * phase-1 convention is that a credential change demands a credential. Rename,
 * remove and the drive routes are session-gated: those rows carry labels, not
 * authority.
 */

import {
  type AccountRow,
  assertPassword,
  auditStatement,
  json,
  noStore,
  readJson,
  requireAccount,
} from "./accounts";
import { newId } from "./crypto";
import { BadRequest, expectBytes, fromBlob, toBase64Url, toBlob } from "./encoding";
import type { Env } from "./env";

const NAME_MAX = 40;
/** Uncompressed P-256 point: 0x04 ‖ x ‖ y — same shape as the grant public key. */
const AGENT_PUBKEY_BYTES = 65;
/**
 * Bounds, because machines and drives are user-writable tables (the setups
 * lesson): generous for a person, hostile to a script. Ten machines is a
 * household of browser profiles; sixteen folders per machine is a power user.
 */
const MACHINES_MAX = 10;
const DRIVES_MAX = 16;

interface MachineRow {
  id: string;
  name: string;
  agent_pubkey: unknown;
  paired_at: number;
  last_seen: number | null;
}

interface DriveRow {
  id: string;
  machine_id: string;
  label: string;
  created_at: number;
}

function expectName(value: unknown, what: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > NAME_MAX) {
    throw new BadRequest(`Give the ${what} a name, up to ${NAME_MAX} characters.`);
  }
  return name;
}

/**
 * A real P-256 point, not merely 65 bytes starting 0x04 — the same check signup
 * applies to the grant public key, for the same reason: this key is what the
 * browsing tab will verify the agent's signed DTLS fingerprint against, and a
 * value that cannot be imported is a connection that fails unexplainably later.
 */
async function expectAgentPubkey(value: unknown): Promise<Uint8Array> {
  const bytes = expectBytes(value, AGENT_PUBKEY_BYTES, "Agent public key");
  if (bytes[0] !== 0x04) throw new BadRequest("That agent public key is malformed.");
  try {
    await crypto.subtle.importKey("raw", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
  } catch {
    throw new BadRequest("That agent public key is not a valid P-256 point.");
  }
  return bytes;
}

/** The machine, owned by this account, or a 404 that does not confirm other people's ids. */
async function ownMachine(env: Env, account: AccountRow, id: unknown): Promise<MachineRow> {
  const machineId = typeof id === "string" ? id : "";
  const row = await env.DB.prepare(
    "SELECT id, name, agent_pubkey, paired_at, last_seen FROM machines WHERE id = ? AND owner_id = ?",
  )
    .bind(machineId, account.id)
    .first<MachineRow>();
  if (!row) throw new BadRequest("No such machine on this account.", 404);
  return row;
}

function publicMachine(row: MachineRow, online: boolean, drives: DriveRow[]) {
  return {
    id: row.id,
    name: row.name,
    agentPubkey: toBase64Url(fromBlob(row.agent_pubkey)),
    pairedAt: row.paired_at,
    lastSeen: row.last_seen,
    online,
    drives: drives.map((d) => ({ id: d.id, label: d.label, createdAt: d.created_at })),
  };
}

/**
 * Pair a machine, or re-key one that already exists (§13).
 *
 * Both demand the password through `assertPassword` — which also rate-limits,
 * so this route cannot be used as a password oracle. The response carries the
 * account's grant public key: the agent tab stores it at pair time as its
 * trust root (§6) and deliberately never re-fetches it, so a later server
 * compromise cannot quietly re-root an already-paired agent.
 */
export async function pair(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  await assertPassword(request, env, account, body.authSecret);

  const agentPubkey = await expectAgentPubkey(body.agentPubkey);
  const now = Date.now();

  const root = await env.DB.prepare("SELECT grant_pubkey FROM accounts WHERE id = ?")
    .bind(account.id)
    .first<{ grant_pubkey: unknown }>();
  if (!root?.grant_pubkey) {
    // Cannot happen for a signed-up account, but a machine paired without a
    // trust root would be an agent that trusts nothing and serves nobody.
    throw new BadRequest("This account has no grant key to pair against.", 409);
  }
  const grantPubkey = toBase64Url(fromBlob(root.grant_pubkey));

  // Re-key: same ceremony, existing row, drives survive (§12 O).
  if (typeof body.machineId === "string" && body.machineId) {
    const machine = await ownMachine(env, account, body.machineId);
    await env.DB.batch([
      env.DB.prepare("UPDATE machines SET agent_pubkey = ?, paired_at = ? WHERE id = ?").bind(
        toBlob(agentPubkey),
        now,
        machine.id,
      ),
      auditStatement(env, account.id, "machine.rekeyed", machine.id),
    ]);
    const drives = await machineDrives(env, machine.id);
    return noStore(
      json({
        status: "rekeyed",
        machine: publicMachine(
          { ...machine, agent_pubkey: toBlob(agentPubkey), paired_at: now },
          false,
          drives,
        ),
        grantPubkey,
      }),
    );
  }

  const name = expectName(body.name, "machine");

  const count = await env.DB.prepare("SELECT count(*) AS n FROM machines WHERE owner_id = ?")
    .bind(account.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MACHINES_MAX) {
    throw new BadRequest(
      `That is ${MACHINES_MAX} machines paired. Remove one you no longer use first.`,
    );
  }

  // Case-insensitive like setups: two machines whose names differ by case is a
  // list that looks like a bug. The unique index backstops the race, binary.
  const dup = await env.DB.prepare(
    "SELECT 1 FROM machines WHERE owner_id = ? AND name = ? COLLATE NOCASE",
  )
    .bind(account.id, name)
    .first();
  if (dup) throw new BadRequest("A machine already has that name. Pick another.", 409);

  const id = newId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO machines (id, owner_id, name, agent_pubkey, paired_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(id, account.id, name, toBlob(agentPubkey), now),
      auditStatement(env, account.id, "machine.paired", id),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      throw new BadRequest("A machine already has that name. Pick another.", 409);
    }
    throw error;
  }

  return noStore(
    json(
      {
        status: "paired",
        machine: publicMachine(
          { id, name, agent_pubkey: toBlob(agentPubkey), paired_at: now, last_seen: null },
          false,
          [],
        ),
        grantPubkey,
      },
      { status: 201 },
    ),
  );
}

async function machineDrives(env: Env, machineId: string): Promise<DriveRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, machine_id, label, created_at FROM drives WHERE machine_id = ? ORDER BY label COLLATE NOCASE",
  )
    .bind(machineId)
    .all<DriveRow>();
  return results;
}

/** Ask a machine's Durable Object whether its agent socket is open (§12 N). */
async function presence(env: Env, machineId: string): Promise<boolean> {
  try {
    const stub = env.SIGNAL.get(env.SIGNAL.idFromName(machineId));
    const verdict = await stub.fetch("https://signal/presence").then((r) => r.json<{ agentOnline: boolean }>());
    return verdict.agentOnline;
  } catch {
    // Presence is a nicety; a DO hiccup must not take the machine list with it.
    return false;
  }
}

/**
 * The caller's machines, each with its drives and its live presence. The
 * browsing tab reads `agentPubkey` from here to verify the agent's signed
 * fingerprint (§13, the connect ceremony).
 */
export async function list(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);

  const { results } = await env.DB.prepare(
    "SELECT id, name, agent_pubkey, paired_at, last_seen FROM machines WHERE owner_id = ? ORDER BY name COLLATE NOCASE",
  )
    .bind(account.id)
    .all<MachineRow>();

  const machines = await Promise.all(
    results.map(async (row) =>
      publicMachine(row, await presence(env, row.id), await machineDrives(env, row.id)),
    ),
  );

  return noStore(json({ machines }));
}

export async function rename(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const machine = await ownMachine(env, account, body.machineId);
  const name = expectName(body.name, "machine");

  const dup = await env.DB.prepare(
    "SELECT 1 FROM machines WHERE owner_id = ? AND name = ? COLLATE NOCASE AND id <> ?",
  )
    .bind(account.id, name, machine.id)
    .first();
  if (dup) throw new BadRequest("A machine already has that name. Pick another.", 409);

  await env.DB.prepare("UPDATE machines SET name = ? WHERE id = ?").bind(name, machine.id).run();
  return json({ status: "renamed" });
}

/**
 * Remove a machine and its drives. The DO is told to hang up so a live agent
 * tab learns immediately rather than at its next message; its sockets close
 * and any future upgrade fails ownership.
 */
export async function remove(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const machine = await ownMachine(env, account, body.machineId);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM machines WHERE id = ?").bind(machine.id),
    auditStatement(env, account.id, "machine.removed", machine.id),
  ]);

  try {
    const stub = env.SIGNAL.get(env.SIGNAL.idFromName(machine.id));
    await stub.fetch("https://signal/shutdown", { method: "POST" });
  } catch {
    // Best-effort: with the row gone, no new socket can be authorised anyway.
  }

  return json({ status: "removed" });
}

/**
 * Add a drive: a label for a folder the agent tab just picked. The handle
 * stays in that tab's IndexedDB, keyed by the id this returns; the server
 * learns a display name and nothing else (§9).
 */
export async function driveAdd(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const machine = await ownMachine(env, account, body.machineId);
  const label = expectName(body.label, "drive");

  const count = await env.DB.prepare("SELECT count(*) AS n FROM drives WHERE machine_id = ?")
    .bind(machine.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= DRIVES_MAX) {
    throw new BadRequest(
      `That is ${DRIVES_MAX} drives on this machine. Remove one you no longer share first.`,
    );
  }

  const id = newId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO drives (id, machine_id, label, created_at) VALUES (?, ?, ?, ?)",
    ).bind(id, machine.id, label, now),
    auditStatement(env, account.id, "drive.added", id),
  ]);

  return json({ status: "added", drive: { id, label, createdAt: now } }, { status: 201 });
}

export async function driveRemove(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const driveId = typeof body.driveId === "string" ? body.driveId : "";

  const gone = await env.DB.prepare(
    "DELETE FROM drives WHERE id = ? AND machine_id IN (SELECT id FROM machines WHERE owner_id = ?)",
  )
    .bind(driveId, account.id)
    .run();
  if (gone.meta.changes !== 1) throw new BadRequest("No such drive on this account.", 404);

  await env.DB.batch([auditStatement(env, account.id, "drive.removed", driveId)]);
  return json({ status: "removed" });
}
