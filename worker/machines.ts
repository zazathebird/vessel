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
  expectDisplayName,
  json,
  noStore,
  readJson,
  requireAccount,
} from "./accounts";
import { newId } from "./crypto";
import { BadRequest, expectBytes, fromBlob, toBase64Url, toBlob } from "./encoding";
import type { Env } from "./env";
import { AGENT_KEY_HEADER } from "./signal";

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

/**
 * A machine name or a drive label.
 *
 * **Both fields arrive by two routes and only one of them was filtered**
 * (2026-09-14). `decodeSetupCode` refuses bidi overrides, zero-widths, lone
 * surrogates, private-use and unassigned code points, and every space that is
 * not U+0020, in exactly these two fields — because a person reads them while
 * deciding which folder to hand to the picker, and two rows that render
 * identically is the attack. The *other* route is somebody typing into the form
 * on `/share` or `/machines`, and it reached a trim and a length check. So the
 * machine-generated path was the strict one and the hand-typed path was the lax
 * one, and the two sets of names then render side by side in one list on
 * `MachinesPage`. `expectDisplayName` is the decoder's filter, on this side of
 * the wire; the decoder stays the authority and must never be the looser of the
 * two.
 */
function expectName(value: unknown, what: string): string {
  return expectDisplayName(value, what, NAME_MAX);
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
    // `as BufferSource`: the scripts project sees DOM's stricter definition
    // (tsconfig.scripts.json), since `npm run check` drives this module.
    await crypto.subtle.importKey("raw", bytes as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, [
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
    /*
     * **A re-key hangs up on the old key** (2026-09-24). It replaced the row's
     * `agent_pubkey` and told the signalling object nothing, so the agent
     * holding the old key stayed "online" in every machine list — answering
     * offers every browsing tab would then refuse as a failed identity check,
     * with nothing to say that the owner had re-keyed it themselves. The object
     * closes every agent socket admitted under any other key, pending ones
     * included (a socket opened before this write would otherwise still be
     * proved against the key it was admitted with), and says `rekeyed`.
     */
    await signalShutdown(env, machine.id, toBase64Url(agentPubkey));
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

  // Case-insensitive like setups: two machines whose names differ by case is a
  // list that looks like a bug. The unique index backstops the race, and since
  // migration 0009 it collates `NOCASE` too — it was binary, so it backstopped
  // a *different* race than this check describes and `Study` beside `study`
  // went through both.
  const dup = await env.DB.prepare(
    "SELECT 1 FROM machines WHERE owner_id = ? AND name = ? COLLATE NOCASE",
  )
    .bind(account.id, name)
    .first();
  if (dup) throw new BadRequest("A machine already has that name. Pick another.", 409);

  /*
   * **The cap rides in the INSERT's own WHERE** (2026-09-24). It was a count and
   * then an insert, so concurrent pairings each counted the others' absence and
   * all landed — a bound on a user-writable table that held only against a
   * caller polite enough to go one at a time. `INSERT … SELECT … WHERE (count) <
   * max` is one statement, which SQLite runs whole; zero changes is the refusal,
   * and the audit row is written only after it — the last-way-in shape
   * (`docs/INVARIANTS.md`). The name pre-check above is for the message; the
   * NOCASE unique index is what closes the name race.
   */
  const id = newId();
  let inserted = 0;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO machines (id, owner_id, name, agent_pubkey, paired_at)
       SELECT ?, ?, ?, ?, ?
        WHERE (SELECT count(*) FROM machines WHERE owner_id = ?) < ?`,
    )
      .bind(id, account.id, name, toBlob(agentPubkey), now, account.id, MACHINES_MAX)
      .run();
    inserted = result.meta.changes;
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      throw new BadRequest("A machine already has that name. Pick another.", 409);
    }
    throw error;
  }
  if (inserted !== 1) {
    throw new BadRequest(
      `That is ${MACHINES_MAX} machines paired. Remove one you no longer use first.`,
    );
  }
  await env.DB.batch([auditStatement(env, account.id, "machine.paired", id)]);

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

  /*
   * **The same `try`/`catch` its sibling `pair()` has, seventy lines up**
   * (2026-09-14). The `SELECT` above is a check-then-act: two renames racing
   * each other each see no duplicate and both write. `pair()` answers that with
   * the unique index and turns the violation into this same friendly 409;
   * `rename()` had the pre-check and not the catch, so the identical race —
   * and an exact-string collision, which the index catches even when the
   * `COLLATE NOCASE` pre-check is raced — surfaced as an unhandled exception
   * and a generic 500 on the owner's own screen.
   *
   * The index this leans on is `idx_machines_owner_name`, and **migration 0009
   * recollated it `NOCASE`** — it was binary while the check above was
   * `COLLATE NOCASE`, so it refused an exact-string collision and let `Study`
   * race `study` through. The catch was right either way; now the thing it
   * catches is the whole of what the pre-check promises.
   */
  try {
    await env.DB.prepare("UPDATE machines SET name = ? WHERE id = ?").bind(name, machine.id).run();
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      throw new BadRequest("A machine already has that name. Pick another.", 409);
    }
    throw error;
  }
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

  await signalShutdown(env, machine.id, null);

  return json({ status: "removed" });
}

/**
 * Tell a machine's signalling object to hang up — on everyone when the machine
 * is removed, or (with the new key) on every agent socket admitted under any
 * other key when it is re-keyed. One helper so the two routes cannot drift.
 */
async function signalShutdown(env: Env, machineId: string, newKey: string | null): Promise<void> {
  try {
    const stub = env.SIGNAL.get(env.SIGNAL.idFromName(machineId));
    await stub.fetch(
      newKey === null ? "https://signal/shutdown" : "https://signal/shutdown?reason=rekeyed",
      {
        method: "POST",
        headers: newKey === null ? {} : { [AGENT_KEY_HEADER]: newKey },
      },
    );
  } catch {
    // Best-effort. After a removal no new socket can be authorised; after a
    // re-key no socket can prove the old key's successor, and the old key's
    // proof is checked against the key it was admitted with — so a socket this
    // missed stays until it drops, and the next one cannot prove the old key.
  }
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

  /*
   * **Unique per machine, case-insensitively, and capped — both in the write**
   * (2026-09-24). Two drives called `Invoices` and `invoices` on one machine
   * render as one name twice in the explorer, which is exactly what
   * `expectDisplayName` refuses invisible characters to prevent; nothing
   * refused the visible version. And the cap was a count then an insert, so
   * concurrent adds all passed the count. Migration 0011's NOCASE unique index
   * is the guard on the label; the count rides in the INSERT's own WHERE, so
   * zero changes is the refusal and the audit row follows it — never a
   * pre-check the write then trusts.
   */
  const id = newId();
  const now = Date.now();
  let inserted = 0;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO drives (id, machine_id, label, created_at)
       SELECT ?, ?, ?, ?
        WHERE (SELECT count(*) FROM drives WHERE machine_id = ?) < ?`,
    )
      .bind(id, machine.id, label, now, machine.id, DRIVES_MAX)
      .run();
    inserted = result.meta.changes;
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      throw new BadRequest("A drive on this machine already has that name. Pick another.", 409);
    }
    throw error;
  }
  if (inserted !== 1) {
    throw new BadRequest(
      `That is ${DRIVES_MAX} drives on this machine. Remove one you no longer share first.`,
    );
  }
  await env.DB.batch([auditStatement(env, account.id, "drive.added", id)]);

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
