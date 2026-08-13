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
import { json, noStore, readJson, requireAccount } from "./accounts";
import { newId } from "./crypto";
import { BadRequest } from "./encoding";
import type { Env } from "./env";

const NAME_MAX = 40;
/** Five or six base-36 fields, hyphen-joined — `shareCode.ts`'s shape, nothing more. */
const CODE_PATTERN = /^[0-9A-Za-z]{1,3}(-[0-9A-Za-z]{1,3}){4,5}$/;
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > NAME_MAX) {
    throw new BadRequest(`Give the setup a name, up to ${NAME_MAX} characters.`);
  }
  const shareCode = typeof body.shareCode === "string" ? body.shareCode.trim().toUpperCase() : "";
  if (!CODE_PATTERN.test(shareCode)) {
    throw new BadRequest("That is not a setup code.");
  }

  // Case-insensitive, unlike the unique index, which collates binary: a person
  // saving "workshop mode" over "Workshop Mode" means the same setup, and two
  // rows differing by case would be a list that looks like a bug. The new
  // casing wins — renaming the capitalisation is what they just typed.
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
    `INSERT INTO setups (id, account_id, name, share_code, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (account_id, name) DO UPDATE SET share_code = excluded.share_code`,
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
