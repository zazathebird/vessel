/**
 * Passkey routes: register, list, remove, and the passkey sign-in
 * (SPEC-ACCOUNTS.md §4, Passkeys; §5, key slots).
 *
 * A passkey here is exactly what §5 says it is: **another credential row, with
 * its own key slot wrapping the same grant key.** The wrapping key comes from
 * the WebAuthn `prf` extension in the browser; the Worker never sees it, only
 * the 40-byte ciphertext, exactly as with the password slot. An authenticator
 * without `prf` support registers with **no** slot — §5 fixes that fallback as
 * "a missing slot rather than a different design" — and such a passkey signs
 * in without ever being able to open the grant key.
 *
 * Two decisions made here rather than in the spec, both recorded in
 * `docs/DECISIONS.md` (2026-08-13):
 *
 * - **Passkey sign-in does not ask for the TOTP second factor.** §3's
 *   stolen-laptop row makes user verification the passkey's second factor
 *   ("passkeys require user verification on every sign-in"), TOTP is §4's
 *   answer to a problem passkeys do not have ("new with passwords, absent with
 *   passkeys"), and the original design was passkey-only with no TOTP at all.
 *   `verifyAssertion` refuses an assertion without the UV flag, which is what
 *   makes this two-factor in fact.
 * - **No rate limiting on the assertion path.** §4 again: "passkeys needed
 *   none." A failed attempt requires forging a P-256 signature, which no
 *   number of attempts helps with; the challenge route mints a stateless token
 *   and discloses nothing.
 *
 * That second decision rests entirely on "a failed attempt requires forging a
 * signature", and until migration 0008 it was not true: **a challenge was
 * bound but never spent**, so a captured request body replayed verbatim minted
 * a fresh session every time its five-minute token was still alive, forging
 * nothing. Both ceremonies now consume their challenge in a conditional UPDATE
 * whose guard rides in the write's own WHERE clause — zero `meta.changes` is
 * the refusal. No challenge table: the stateless token is the design and a
 * table of live challenges is the option this codebase rejected.
 *
 * **The guard is monotonic in the token's issue time**, `totp.last_step`'s
 * shape rather than a near-miss of it. Storing the last challenge and refusing
 * a repeat of that one closes the naive double-post and leaves the interleaved
 * replay open: two captured bodies alternated indefinitely, each differing from
 * the one stored just before it. A challenge minted no later than the last one
 * spent is refused instead, so every old body is dead for ever. See migration
 * 0008 for what that costs — an out-of-order ceremony is refused and answered
 * by starting again.
 */

import {
  type AccountRow,
  assertPassword,
  auditStatement,
  json,
  noStore,
  publicAccount,
  readJson,
  requireAccount,
  withSession,
} from "./accounts";
import { newId } from "./crypto";
import {
  BadRequest,
  expectBytes,
  expectBytesRange,
  fromBlob,
  toBase64Url,
  toBlob,
} from "./encoding";
import type { Env } from "./env";
import * as session from "./session";
import { verifyAssertion, verifyRegistration } from "./webauthn";

const CHALLENGE_BYTES = 32;
const WRAPPED_KEY_BYTES = 40;
/** WebAuthn credential ids run 16 bytes to 1023 depending on the authenticator. */
const CREDENTIAL_ID_MIN = 16;
const CREDENTIAL_ID_MAX = 1023;
const LABEL_MAX = 40;
/**
 * A bound, because `credentials` is a user-writable table (the setups lesson):
 * generous for a person, hostile to a script. Twenty is a phone, a laptop, a
 * desktop and a drawer of security keys, several times over.
 *
 * It is the only bound there is. `assertPassword` rate-limits a *failing*
 * caller, and `recordSuccess` resets the account bucket on every success — so
 * a loop that keeps succeeding is unthrottled by design, and without a cap one
 * password and one session grow this table until D1 says stop.
 */
const MAX_PASSKEYS = 20;

/**
 * `rpId` and `origin` are derived from the request rather than configured, so
 * the same code is correct on the apex and under `wrangler dev` — which
 * simulates the production host, see `docs/HANDOFF.md`. They are included in
 * the challenge responses because the e2e harness's software authenticator has
 * no browser to learn them from; a real browser ignores them and writes its
 * own, which is the entire security model.
 */
function relyingParty(request: Request): { rpId: string; origin: string } {
  const url = new URL(request.url);
  return { rpId: url.hostname, origin: url.origin };
}

function newChallenge(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES)));
}

/**
 * What is written when a challenge is spent (migration 0008). The digest rather
 * than the challenge itself, for the reason `code_hash` is a hash: it is only
 * ever compared for equality, and a fixed 32 bytes is a smaller thing to leave
 * in a row than the value a still-live token is carrying.
 */
async function challengeDigest(challenge: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(challenge));
}

// Registration -----------------------------------------------------------------

/** Mint the challenge a registration must answer. Signed-in callers only. */
export async function registerChallenge(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const challenge = newChallenge();
  const token = await session.mint(
    env.SESSION_SECRET,
    "webauthn-register",
    `${account.id}:${challenge}`,
  );
  return noStore(json({ token, challenge, ...relyingParty(request) }));
}

/**
 * Register a passkey as a new credential, with its key slot when the browser
 * could derive one.
 *
 * The password is re-proved (`assertPassword`, which owns the rate limiting):
 * adding a credential is a credential change, and a stolen session enrolling
 * its own passkey would otherwise be the same lockout `requirePassword`
 * documents for TOTP. It also means an operator-reset account cannot add a
 * passkey until its owner has set a password again, which is the right order —
 * the reset path forces exactly that first.
 */
export async function register(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);

  const claim = await session.verify(
    env.SESSION_SECRET,
    "webauthn-register",
    typeof body.token === "string" ? body.token : null,
  );
  const [tokenAccountId, challenge] = (claim?.subject ?? "").split(":");
  if (!claim || !challenge || tokenAccountId !== account.id) {
    throw new BadRequest("That passkey attempt timed out. Start again.", 401);
  }

  await assertPassword(request, env, account, body.authSecret);

  // Asked after the password, so the row count is not something an unproven
  // caller can measure. A pre-read rather than a guard inside the INSERT, and
  // that is the one place this file allows one: losing this race overshoots the
  // cap by a row, which costs nothing, whereas losing the race `remove` guards
  // seals an account's grant key for good.
  const count = await env.DB.prepare(
    "SELECT count(*) AS n FROM credentials WHERE account_id = ? AND kind = 'passkey'",
  )
    .bind(account.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PASSKEYS) {
    throw new BadRequest(
      `That is ${MAX_PASSKEYS} passkeys on this account. Remove one you no longer use first.`,
    );
  }

  const credential = (body.credential ?? {}) as Record<string, unknown>;
  const presentedId = expectBytesRange(
    credential.id,
    CREDENTIAL_ID_MIN,
    CREDENTIAL_ID_MAX,
    "Credential id",
  );
  const clientDataJSON = expectBytesRange(credential.clientDataJSON, 1, 4096, "Client data");
  const attestationObject = expectBytesRange(
    credential.attestationObject,
    1,
    8192,
    "Attestation object",
  );

  const { rpId, origin } = relyingParty(request);
  const verified = await verifyRegistration({
    clientDataJSON,
    attestationObject,
    challenge,
    origin,
    rpId,
  });

  // The attested id inside authData is the authoritative one; the outer id the
  // client also sends must be the same bytes or the row would index one
  // credential and verify another.
  if (toBase64Url(verified.credentialId) !== toBase64Url(presentedId)) {
    throw new BadRequest("That passkey data is malformed.");
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, LABEL_MAX)
      : "passkey";

  // Optional, absent when the authenticator has no `prf` — §5's missing-slot
  // fallback. When present it is the account's grant key re-wrapped in the
  // browser, ciphertext here as everywhere.
  const hasSlot = body.slot !== undefined && body.slot !== null;
  const slot = hasSlot ? expectBytes(body.slot, WRAPPED_KEY_BYTES, "Key slot") : null;
  const slotAlg = typeof body.slotAlg === "string" ? body.slotAlg : "";
  if (slot && !slotAlg) throw new BadRequest("Missing key slot algorithm.");
  if (slotAlg.length > 64) throw new BadRequest("That key slot algorithm is not valid.");

  // One token, one authenticator. Spent here rather than at the top of the
  // route so that a malformed or foreign-origin attempt does not burn the
  // caller's own challenge, and in the UPDATE's own WHERE clause rather than a
  // read followed by a write, which would let two requests carrying the same
  // token both find it unspent and both register. The credential-id uniqueness
  // index only ever refused an *identical* replay; a second, different
  // authenticator under the same still-valid token walked straight past it.
  //
  // Monotonic in the token's issue time, for the reason the header gives: an
  // equality test on the challenge alone refuses only the challenge stored
  // last, so two live tokens alternated would each look unspent to the other's
  // row. The digest test stays beside it and can only refuse more.
  //
  // It is the password credential's row because the passkey's own row does not
  // exist yet — the challenge is spent on the credential that authorised it,
  // and `assertPassword` above has just proved that row is there.
  //
  // 409, and named plainly, unlike the sign-in route's single sentence: this
  // caller holds a session and has just re-proved the password, so it is the
  // account's owner and there is nothing to withhold. It is also the same
  // refusal an identical replay used to get from the credential-id index one
  // step further down, which is now unreachable for a replay because this fires
  // first.
  const digest = await challengeDigest(challenge);
  const spent = await env.DB.prepare(
    `UPDATE credentials SET last_challenge = ?, last_challenge_at = ?
       WHERE account_id = ? AND kind = 'password'
         AND (last_challenge_at IS NULL OR last_challenge_at < ?)
         AND (last_challenge IS NULL OR last_challenge <> ?)`,
  )
    .bind(digest, claim.issuedAt, account.id, claim.issuedAt, digest)
    .run();
  if ((spent.meta?.changes ?? 0) === 0) {
    throw new BadRequest("That passkey attempt has already been used. Start again.", 409);
  }

  const now = Date.now();
  const credentialRowId = newId();
  const statements = [
    env.DB.prepare(
      "INSERT INTO credentials (id, account_id, kind, label, created_at, credential_id, public_key, sign_count) VALUES (?, ?, 'passkey', ?, ?, ?, ?, ?)",
    ).bind(
      credentialRowId,
      account.id,
      label,
      now,
      toBlob(verified.credentialId),
      toBlob(verified.publicKeyRaw),
      verified.signCount,
    ),
  ];
  if (slot) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO key_slots (id, account_id, credential_id, wrapped_grant_key, alg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(newId(), account.id, credentialRowId, toBlob(slot), slotAlg, now),
    );
  }
  statements.push(auditStatement(env, account.id, "auth.passkey.added", label));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    // The unique index on credential_id. A replayed registration lands here,
    // which is what lets the challenge token stay stateless.
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      throw new BadRequest("That passkey is already registered.", 409);
    }
    throw error;
  }

  return json({ status: "added", slotWrapped: !!slot }, { status: 201 });
}

// The signed-in account's passkeys ---------------------------------------------

export async function list(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.label, c.created_at, c.last_used_at,
            EXISTS (SELECT 1 FROM key_slots s WHERE s.credential_id = c.id) AS has_slot
       FROM credentials c
      WHERE c.account_id = ? AND c.kind = 'passkey'
      ORDER BY c.created_at`,
  )
    .bind(account.id)
    .all<{ id: string; label: string | null; created_at: number; last_used_at: number | null; has_slot: number }>();

  return noStore(
    json({
      passkeys: results.map((row) => ({
        id: row.id,
        label: row.label ?? "passkey",
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        hasSlot: row.has_slot === 1,
      })),
    }),
  );
}

/**
 * Remove a passkey. Removing a credential deletes only its slot (§5) — the
 * cascade on `key_slots.credential_id` does that — with one refusal: when this
 * passkey's slot is the account's **last openable one**, deleting it would seal
 * the grant key for good, which is the same line `adminResetPassword` refuses
 * to cross. Spent recovery codes' slots do not count as openable; their codes
 * cannot sign in again.
 */
export async function remove(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  await assertPassword(request, env, account, body.authSecret);

  const id = typeof body.id === "string" ? body.id : "";
  const row = await env.DB.prepare(
    "SELECT id, label FROM credentials WHERE id = ? AND account_id = ? AND kind = 'passkey'",
  )
    .bind(id, account.id)
    .first<{ id: string; label: string | null }>();
  if (!row) throw new BadRequest("No such passkey on this account.", 404);

  // The guard rides in the DELETE's own WHERE clause so the check and the act
  // are one statement. Checked first and deleted after, two concurrent removals
  // of an account's last two openable slots would each count the other as
  // "another way in", both pass, and the grant key would be sealed for good —
  // the exact outcome the refusal exists to make impossible. A slotless passkey
  // (no `prf`) is always removable; one with a slot goes only while some other
  // openable slot still exists at the moment of deletion.
  const deleted = await env.DB.prepare(
    `DELETE FROM credentials WHERE id = ?
       AND (NOT EXISTS (SELECT 1 FROM key_slots WHERE credential_id = credentials.id)
            OR EXISTS (SELECT 1
                         FROM key_slots s JOIN credentials c ON c.id = s.credential_id
                        WHERE s.account_id = ? AND s.credential_id <> credentials.id
                          AND (c.kind = 'password' OR c.kind = 'passkey'
                               OR (c.kind = 'recovery' AND c.used_at IS NULL))))`,
  )
    .bind(row.id, account.id)
    .run();
  if ((deleted.meta?.changes ?? 0) === 0) {
    throw new BadRequest(
      "Removing this passkey would seal this account's key for good. Add another way in first.",
    );
  }

  // After, not batched with it: an audit row must not claim a removal the
  // conditional DELETE refused.
  await env.DB.batch([auditStatement(env, account.id, "auth.passkey.removed", row.label)]);

  return json({ status: "removed" });
}

// Sign-in ----------------------------------------------------------------------

/**
 * Mint the challenge a sign-in assertion must answer. Anonymous, discloses
 * nothing. The token is stateless and lives five minutes, but the challenge
 * inside it is single-use: `signIn` spends it on the credential that answers it.
 */
export async function signInChallenge(request: Request, env: Env): Promise<Response> {
  const challenge = newChallenge();
  const token = await session.mint(env.SESSION_SECRET, "webauthn-signin", challenge);
  return noStore(json({ token, challenge, ...relyingParty(request) }));
}

/**
 * Sign in with a passkey. One step — see the header note for why there is no
 * TOTP stage and no rate limiting here.
 *
 * The response carries the credential's key slot when it has one, mirroring the
 * recovery path: the browser has just evaluated `prf` and holds the only key
 * that opens this ciphertext, so handing the slot back now saves a later
 * round-trip and keeps `/api/account/slot` a password-slot route.
 */
export async function signIn(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);

  const claim = await session.verify(
    env.SESSION_SECRET,
    "webauthn-signin",
    typeof body.token === "string" ? body.token : null,
  );
  if (!claim) throw new BadRequest("That sign-in timed out. Start again.", 401);
  const challenge = claim.subject;

  const credential = (body.credential ?? {}) as Record<string, unknown>;
  const rawId = expectBytesRange(credential.id, CREDENTIAL_ID_MIN, CREDENTIAL_ID_MAX, "Credential id");
  const clientDataJSON = expectBytesRange(credential.clientDataJSON, 1, 4096, "Client data");
  const authenticatorData = expectBytesRange(
    credential.authenticatorData,
    37,
    4096,
    "Authenticator data",
  );
  const signature = expectBytesRange(credential.signature, 8, 256, "Signature");

  // One sentence for every failure past this point. Which check failed —
  // unknown credential, wrong signature, stale challenge — is only useful to
  // somebody probing.
  const wrong = new BadRequest("That passkey is not recognised here.", 401);

  const stored = await env.DB.prepare(
    "SELECT id, account_id, public_key, sign_count FROM credentials WHERE credential_id = ? AND kind = 'passkey'",
  )
    .bind(toBlob(rawId))
    .first<{ id: string; account_id: string; public_key: unknown; sign_count: number | null }>();
  if (!stored) throw wrong;

  const { rpId, origin } = relyingParty(request);
  let signCount: number;
  try {
    ({ signCount } = await verifyAssertion({
      clientDataJSON,
      authenticatorData,
      signature,
      publicKeyRaw: fromBlob(stored.public_key),
      challenge,
      origin,
      rpId,
    }));
  } catch {
    throw wrong;
  }

  const account = await env.DB.prepare(
    "SELECT id, handle, is_operator, created_at, reset_at FROM accounts WHERE id = ?",
  )
    .bind(stored.account_id)
    .first<AccountRow>();
  if (!account) throw wrong;

  // §4 says the sign counter is checked; nothing checks it, here or in
  // `verifyAssertion`, and that is deliberate — a synced passkey commonly
  // reports 0 for ever, so refusing a counter that failed to advance would
  // refuse the commonest authenticator on the market. The stored value is a
  // high-water mark and **not** a clone detector: nothing in this system will
  // notice a duplicated authenticator. Do not read it as though it does.
  const nextCount = Math.max(signCount, stored.sign_count ?? 0);

  // The challenge is spent in the same statement that records the use, and the
  // guard rides in the WHERE clause — the `remove` doctrine above, for a
  // sharper reason. `verifyAssertion` binds the response to this challenge; it
  // cannot make it single-use, because the same signed bytes answer the same
  // challenge for ever. So without this, a captured request body replayed
  // verbatim minted a session every time for the five minutes the stateless
  // token stayed valid, and §4's case for no TOTP stage and no rate limiting
  // here — "a failed attempt requires forging a P-256 signature" — was simply
  // untrue. Check-then-act would not close it either: two copies of the same
  // body would both read the challenge unspent, which is the attack itself.
  //
  // `last_challenge_at < ?` is the guard that does the work, and it is
  // `totp.last_step`'s monotonicity rather than an equality test: refusing only
  // the challenge stored last leaves two captured bodies alternating for ever,
  // each of them unequal to the one before it, and one captured body live again
  // the moment any other sign-in on this credential lands in between. The issue
  // time comes out of the token, under the MAC, so it is not the caller's to
  // choose. The digest test beside it depends on no clock and can only refuse
  // more.
  const digest = await challengeDigest(challenge);
  const used = await env.DB.prepare(
    `UPDATE credentials
        SET last_used_at = ?, sign_count = ?, last_challenge = ?, last_challenge_at = ?
       WHERE id = ?
         AND (last_challenge_at IS NULL OR last_challenge_at < ?)
         AND (last_challenge IS NULL OR last_challenge <> ?)`,
  )
    .bind(Date.now(), nextCount, digest, claim.issuedAt, stored.id, claim.issuedAt, digest)
    .run();
  // The same one sentence as every other refusal on this route: a replay learns
  // nothing from being told it is a replay.
  if ((used.meta?.changes ?? 0) === 0) throw wrong;

  // After, not batched with it: an audit row must not claim a sign-in the
  // conditional UPDATE refused.
  await env.DB.batch([auditStatement(env, account.id, "auth.signin", "passkey")]);

  const slot = await env.DB.prepare(
    `SELECT s.wrapped_grant_key AS wrapped, s.alg AS alg, a.grant_pubkey AS pubkey
       FROM key_slots s JOIN accounts a ON a.id = s.account_id
      WHERE s.credential_id = ?`,
  )
    .bind(stored.id)
    .first<{ wrapped: unknown; alg: string; pubkey: unknown }>();

  return withSession(
    env,
    account.id,
    noStore(
      json({
        status: "signed-in",
        account: publicAccount(account),
        resetAt: account.reset_at,
        ...(slot?.pubkey
          ? {
              keySlot: {
                wrappedGrantKey: toBase64Url(fromBlob(slot.wrapped)),
                grantPubkey: toBase64Url(fromBlob(slot.pubkey)),
                alg: slot.alg,
              },
            }
          : {}),
      }),
    ),
  );
}
