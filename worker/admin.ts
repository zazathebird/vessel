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
 * and cannot open it — `resetPassword` below is exactly that shape, and it must
 * stay it: the route returns handles and status, never key material.
 */

import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { auditStatement, json, noStore, readJson, requireAccount } from "./accounts";

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

  // Account state, so `no-store` — the same convention every other roster-ish
  // response (`me`, `passkeys.list`, `setups.list`) already follows.
  return noStore(
    json({
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
    }),
  );
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

  // The pre-check above gives the self-demotion its friendly message; this is
  // the enforcement, and it covers every demotion. Two operators demoting each
  // other concurrently would each pass a pre-check that still counted the
  // other — the EXISTS in the WHERE clause makes "another operator remains"
  // true at write time or the write does not happen.
  const flip = wanted
    ? env.DB.prepare("UPDATE accounts SET is_operator = 1 WHERE id = ?").bind(account.id)
    : env.DB.prepare(
        "UPDATE accounts SET is_operator = 0 WHERE id = ? AND EXISTS (SELECT 1 FROM accounts WHERE is_operator = 1 AND id <> ?)",
      ).bind(account.id, account.id);
  const flipped = await flip.run();
  if (!wanted && (flipped.meta?.changes ?? 0) === 0) {
    throw new BadRequest(
      "That would leave the site with no operator. Make someone else an operator first.",
    );
  }

  await env.DB.batch([
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
 * Reset an account's password — §4's operator recovery path, shippable only now
 * that the way back exists end to end (`setPassword`'s insert branch, and the
 * `challenge` salt fallback that keeps recovery codes derivable afterwards).
 *
 * What it does is delete: the password credential and its key slot go, and
 * `reset_at` is stamped so the owner's next sign-in says so. What it must
 * **never** do is return a slot or mint a credential — §5 rejects operator
 * escrow permanently, and this route staying deletion-only is what makes reset
 * safe at all. The owner gets back in with a recovery code, which carries its
 * own copy of the grant key; `setPassword` re-seals that same key under the
 * password they choose. Grant authority never passes through the operator.
 *
 * Two refusals, both against permanence rather than malice:
 *
 * - **Not the caller.** An operator with a working session has `changePassword`;
 *   a reset of their own row can only be a slip, and it is a slip that deletes
 *   their own key slot.
 * - **Not an account with no other way in.** The password slot being deleted may
 *   be the last openable copy of the grant key. If no other openable slot
 *   remains, reset does not put the account into recovery — it seals the grant
 *   key for ever, quietly, which is deletion wearing a milder name. Refusing
 *   makes the operator choose the honest button.
 *
 *   **Counted in key slots, not credentials** — the same query shape as passkey
 *   removal's refusal, for the same reason. A `prf`-less passkey is a credential
 *   with no slot (§5's missing-slot fallback): it signs the account in and can
 *   never open the grant key, so counting it as a way back would let a reset
 *   seal the key while claiming not to. Spent recovery codes' slots are excluded
 *   because their codes cannot sign in again.
 */
export async function resetPassword(request: Request, env: Env): Promise<Response> {
  const caller = await operator(request, env);
  const body = await readJson(request);
  const account = await target(env, body);

  if (account.id === caller.id) {
    throw new BadRequest("Change your own password from your account instead.");
  }

  // "Another way back exists" is checked inside each write's WHERE clause, not
  // ahead of it: a pre-check could pass and then the owner spends their last
  // recovery code (whose spent slot `setPassword` deletes) before the batch
  // lands — a reset that then proceeded would seal the grant key while
  // promising it could not. The guard names only passkey and unspent-recovery
  // slots, none of which these statements touch, so it is stable across the
  // batch. The batch is a transaction; if the guard is false all three
  // statements no-op and the stamp below reports it.
  const guard = `EXISTS (SELECT 1
                   FROM key_slots s JOIN credentials c ON c.id = s.credential_id
                  WHERE s.account_id = ?
                    AND (c.kind = 'passkey' OR (c.kind = 'recovery' AND c.used_at IS NULL)))`;
  const results = await env.DB.batch([
    // Slots before credentials: the subquery needs the rows it names.
    env.DB.prepare(
      `DELETE FROM key_slots WHERE credential_id IN (SELECT id FROM credentials WHERE account_id = ? AND kind = 'password') AND ${guard}`,
    ).bind(account.id, account.id),
    env.DB.prepare(
      `DELETE FROM credentials WHERE account_id = ? AND kind = 'password' AND ${guard}`,
    ).bind(account.id, account.id),
    env.DB.prepare(`UPDATE accounts SET reset_at = ? WHERE id = ? AND ${guard}`).bind(
      Date.now(),
      account.id,
      account.id,
    ),
  ]);
  if ((results[2]?.meta?.changes ?? 0) === 0) {
    throw new BadRequest(
      "That account has no other credential that can open its key, so a reset would seal it for good. Delete it instead, or leave it be.",
    );
  }

  // After the verdict, so the audit never records a reset the guard refused.
  await env.DB.batch([auditStatement(env, caller.id, "admin.password.reset", account.handle)]);

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
