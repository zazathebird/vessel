/**
 * Operator administration of accounts.
 *
 * Every route here requires a signed-in operator, checked once in `operator()`
 * rather than repeated per handler — a check that has to be remembered five
 * times is a check that will eventually be forgotten once.
 *
 * **What is deliberately absent is the point of the file.** There is no route
 * that reads another account's key slot, wrapped or otherwise, and there is no
 * route that sets somebody's password. SPEC-ACCOUNTS.md §4 allows the operator
 * to *reset* a password and §5 rejects escrow permanently: an operator who could
 * hand themselves a working credential could sign grants in a user's name, which
 * is the exact thing the key-slot design exists to prevent. Reset deletes a slot
 * and cannot open it.
 *
 * Password reset is not here either, and that is a timing decision rather than a
 * principle — see `resetTotp` for the reasoning, which applies doubly to
 * passwords while there is still no way to set a new one.
 */

import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { auditStatement, json, readJson, requireAccount } from "./accounts";

interface AdminAccountRow {
  id: string;
  handle: string;
  is_operator: number;
  created_at: number;
  reset_at: number | null;
  passwords: number;
  passkeys: number;
  recovery_left: number;
  totp_confirmed: number | null;
}

/** The caller, if they are a signed-in operator. Throws otherwise. */
async function operator(request: Request, env: Env) {
  const account = await requireAccount(request, env);
  if (account.is_operator !== 1) throw new BadRequest("Only the operator can do that.", 403);
  return account;
}

/** The target account named by the request body, which must exist. */
async function target(env: Env, body: Record<string, unknown>): Promise<AdminAccountRow> {
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) throw new BadRequest("Which account?");
  const row = await env.DB.prepare(
    "SELECT id, handle, is_operator, created_at, reset_at FROM accounts WHERE id = ?",
  )
    .bind(id)
    .first<AdminAccountRow>();
  if (!row) throw new BadRequest("No such account.", 404);
  return row;
}

/**
 * Every account, with enough about each to act on it.
 *
 * The counts come from one grouped query rather than a query per account, so
 * this stays a fixed cost as accounts accumulate. No secrets, no hashes, no key
 * material — handles, flags and counts, which is all an administration screen
 * has any business seeing.
 */
export async function listAccounts(request: Request, env: Env): Promise<Response> {
  await operator(request, env);

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.handle, a.is_operator, a.created_at, a.reset_at,
            COALESCE(SUM(CASE WHEN c.kind = 'password' AND c.used_at IS NULL THEN 1 END), 0) AS passwords,
            COALESCE(SUM(CASE WHEN c.kind = 'passkey'  AND c.used_at IS NULL THEN 1 END), 0) AS passkeys,
            COALESCE(SUM(CASE WHEN c.kind = 'recovery' AND c.used_at IS NULL THEN 1 END), 0) AS recovery_left,
            (SELECT t.confirmed_at FROM totp t WHERE t.account_id = a.id) AS totp_confirmed
       FROM accounts a
       LEFT JOIN credentials c ON c.account_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at`,
  ).all<AdminAccountRow>();

  return json({
    accounts: results.map((row) => ({
      id: row.id,
      handle: row.handle,
      isOperator: row.is_operator === 1,
      createdAt: row.created_at,
      resetAt: row.reset_at,
      credentials: {
        password: row.passwords > 0,
        passkeys: row.passkeys,
        recoveryCodesRemaining: row.recovery_left,
      },
      totp: { confirmed: row.totp_confirmed !== null },
    })),
  });
}

/**
 * Grant or revoke operator.
 *
 * The guard is against lockout, not against malice: an operator who removes
 * their own flag while being the only one leaves a site whose config panel
 * nobody can ever open again, recoverable only by someone with `wrangler` and
 * the production database. Refusing costs one click and saves that.
 */
export async function setOperator(request: Request, env: Env): Promise<Response> {
  const caller = await operator(request, env);
  const body = await readJson(request);
  const account = await target(env, body);
  const wanted = body.isOperator === true;

  if (!wanted && account.id === caller.id) {
    const others = await env.DB.prepare(
      "SELECT count(*) AS n FROM accounts WHERE is_operator = 1 AND id != ?",
    )
      .bind(caller.id)
      .first<{ n: number }>();
    if ((others?.n ?? 0) === 0) {
      throw new BadRequest(
        "You are the only operator. Make someone else an operator before removing your own.",
      );
    }
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET is_operator = ? WHERE id = ?").bind(
      wanted ? 1 : 0,
      account.id,
    ),
    auditStatement(env, caller.id, wanted ? "admin.operator.granted" : "admin.operator.revoked", account.handle),
  ]);

  return json({ status: "ok", handle: account.handle, isOperator: wanted });
}

/**
 * Clear an account's second factor.
 *
 * This is the recovery path for the ordinary disaster — a lost or wiped phone —
 * and it is safe in a way password reset is not: TOTP is a second factor, it
 * holds no key slot, and removing it opens nothing. The account's password still
 * has to be presented afterwards.
 *
 * The account is left able to sign in with one factor until they enrol again,
 * which is worth showing on the screen rather than only knowing here.
 */
export async function resetTotp(request: Request, env: Env): Promise<Response> {
  const caller = await operator(request, env);
  const body = await readJson(request);
  const account = await target(env, body);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM totp WHERE account_id = ?").bind(account.id),
    auditStatement(env, caller.id, "admin.totp.reset", account.handle),
  ]);

  return json({ status: "ok", handle: account.handle });
}

/**
 * Delete an account and everything hanging off it.
 *
 * Refuses to delete the caller. Not paternalism: an operator deleting themselves
 * mid-session leaves a live session cookie pointing at a row that no longer
 * exists, and if they were the last operator it leaves nobody who can undo it.
 *
 * Credentials, key slots and TOTP go with it by foreign key. The account's grant
 * key dies with its slots, which is the intended and irreversible meaning of
 * deleting an account.
 */
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const caller = await operator(request, env);
  const body = await readJson(request);
  const account = await target(env, body);

  if (account.id === caller.id) {
    throw new BadRequest("You cannot delete the account you are signed in with.");
  }

  await env.DB.batch([
    auditStatement(env, caller.id, "admin.account.deleted", account.handle),
    env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(account.id),
  ]);

  return json({ status: "ok", handle: account.handle });
}
