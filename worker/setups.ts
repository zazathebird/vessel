/**
 * Saved setups — the genuinely small half of phase 1 (SPEC-ACCOUNTS.md §11).
 *
 * The site already encodes an entire look as a six-field share code, so a
 * setup is a row holding a name and that string. The Worker stores the code
 * **as text and validates only its shape**: the catalogue the fields index
 * lives in the browser, and `decodeShareCode` there already clamps every
 * out-of-range field on the way back in — a server-side copy of the catalogue
 * would be one more thing to keep in step for no second opinion.
 *
 * Session-gated, not password-gated: saving a look is not a credential change.
 * Saving over an existing name replaces it — that is what "save" means to the
 * person doing it — and the unique index on (account_id, name) is what the
 * upsert leans on.
 */

// Setups are deliberately unaudited: the audit table records what §3 needs to
// catch a compromised frontend, and burying credential events under wallpaper
// changes would cost it that job.
import { expectDisplayName, json, noStore, readJson, requireAccount } from "./accounts";
import { newId } from "./crypto";
import { BadRequest } from "./encoding";
import type { Env } from "./env";

const NAME_MAX = 40;
/**
 * Five to **seven** base-36 fields, hyphen-joined — `shareCode.ts`'s shape,
 * nothing more.
 *
 * It said five or six until 2026-09-05, and `encodeShareCode` has emitted seven
 * since the station field landed — so every save from the account page's
 * Setups panel, which sends `encodeShareCode(config)` verbatim, was refused
 * with "That is not a setup code." The harness stayed green because it saved
 * hand-typed five- and six-field codes rather than the encoder's output. The
 * lower bound stays at five: legacy codes still decode, and refusing one here
 * would refuse a setup somebody saved before a field existed. **When
 * `encodeShareCode` gains a field, this gains one too** — `npm run check` now
 * drives the pattern with the encoder's actual output, so forgetting fails.
 */
const CODE_PATTERN = /^[0-9A-Za-z]{1,3}(-[0-9A-Za-z]{1,3}){4,6}$/;
/**
 * Enough for anyone naming looks by hand; a bound because an unbounded
 * user-writable table is an invitation to fill it by script.
 */
const SETUPS_MAX = 50;

interface SetupRow {
  id: string;
  name: string;
  share_code: string;
  created_at: number;
}

function publicSetup(row: SetupRow) {
  return { id: row.id, name: row.name, shareCode: row.share_code, createdAt: row.created_at };
}

export async function list(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, share_code, created_at FROM setups WHERE account_id = ? ORDER BY name COLLATE NOCASE",
  )
    .bind(account.id)
    .all<SetupRow>();
  return noStore(json({ setups: results.map(publicSetup) }));
}

export async function save(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);

  // The same filter the machine names and drive labels get, for the same reason
  // one surface along: this name is typed by a person, stored verbatim, and
  // rendered back in a list where two rows reading identically means picking the
  // wrong one. See `expectDisplayName` in `accounts.ts` — it is
  // `decodeSetupCode`'s refusals, on this side of the wire.
  const name = expectDisplayName(body.name, "setup", NAME_MAX);
  const shareCode = typeof body.shareCode === "string" ? body.shareCode.trim().toUpperCase() : "";
  if (!CODE_PATTERN.test(shareCode)) {
    throw new BadRequest("That is not a setup code.");
  }

  // Case-insensitive: a person saving "workshop mode" over "Workshop Mode"
  // means the same setup, and two rows differing by case would be a list that
  // looks like a bug. The new casing wins — renaming the capitalisation is what
  // they just typed.
  //
  // The unique index agrees with this check since migration 0009. It collated
  // **binary** before, which meant it backstopped a different race than the one
  // this pre-check describes: two concurrent saves of the identical string were
  // refused and `Study` racing `study` both landed, producing exactly the list
  // this branch exists to prevent.
  const existing = await env.DB.prepare(
    "SELECT id, created_at FROM setups WHERE account_id = ? AND name = ? COLLATE NOCASE",
  )
    .bind(account.id, name)
    .first<{ id: string; created_at: number }>();

  if (existing) {
    await env.DB.prepare("UPDATE setups SET name = ?, share_code = ? WHERE id = ?")
      .bind(name, shareCode, existing.id)
      .run();
    return json({
      status: "replaced",
      setup: { id: existing.id, name, shareCode, createdAt: existing.created_at },
    });
  }

  const count = await env.DB.prepare("SELECT count(*) AS n FROM setups WHERE account_id = ?")
    .bind(account.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= SETUPS_MAX) {
    throw new BadRequest(`That is ${SETUPS_MAX} setups saved. Delete one you no longer use first.`);
  }

  const now = Date.now();
  const id = newId();
  await env.DB.prepare(
    // The ON CONFLICT covers the race this check-then-insert leaves open: two
    // concurrent saves of a genuinely new name both pass the SELECT above.
    //
    // **The `COLLATE NOCASE` names what migration 0009 made the index, and it
    // is documentation rather than repair.** Measured: SQLite matches a
    // conflict target that omits a collation to an index that has one, so the
    // bare `(account_id, name)` this replaced kept working. Spelling it out
    // means the clause says what the index is instead of leaning on a matching
    // rule that ignores part of the index definition — a target naming a column
    // the index does not have throws, and that throw is a 500 on the one race
    // this upsert exists to absorb. The two must stay in step.
    `INSERT INTO setups (id, account_id, name, share_code, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (account_id, name COLLATE NOCASE) DO UPDATE SET share_code = excluded.share_code`,
  )
    .bind(id, account.id, name, shareCode, now)
    .run();

  return json({ status: "saved", setup: { id, name, shareCode, createdAt: now } }, { status: 201 });
}

export async function remove(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const id = typeof body.id === "string" ? body.id : "";

  const gone = await env.DB.prepare("DELETE FROM setups WHERE id = ? AND account_id = ?")
    .bind(id, account.id)
    .run();
  if (gone.meta.changes !== 1) throw new BadRequest("No such setup on this account.", 404);

  return json({ status: "deleted" });
}
