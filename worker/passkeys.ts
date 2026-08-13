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

  const hasSlot = await env.DB.prepare("SELECT 1 AS ok FROM key_slots WHERE credential_id = ?")
    .bind(row.id)
    .first();
  if (hasSlot) {
    const others = await env.DB.prepare(
      `SELECT count(*) AS n
         FROM key_slots s JOIN credentials c ON c.id = s.credential_id
        WHERE s.account_id = ? AND s.credential_id <> ?
          AND (c.kind = 'password' OR c.kind = 'passkey'
               OR (c.kind = 'recovery' AND c.used_at IS NULL))`,
    )
      .bind(account.id, row.id)
      .first<{ n: number }>();
    if ((others?.n ?? 0) === 0) {
      throw new BadRequest(
        "Removing this passkey would seal this account's key for good. Add another way in first.",
      );
    }
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM credentials WHERE id = ?").bind(row.id),
    auditStatement(env, account.id, "auth.passkey.removed", row.label),
  ]);

  return json({ status: "removed" });
}

// Sign-in ----------------------------------------------------------------------

/** Mint the challenge a sign-in assertion must answer. Anonymous, discloses nothing. */
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

  // §4: monotonicity checked but not enforced — synced passkeys commonly
  // report 0 for ever. The stored value only ever moves forward.
  const nextCount = Math.max(signCount, stored.sign_count ?? 0);

  await env.DB.batch([
    env.DB.prepare("UPDATE credentials SET last_used_at = ?, sign_count = ? WHERE id = ?").bind(
      Date.now(),
      nextCount,
      stored.id,
    ),
    auditStatement(env, account.id, "auth.signin", "passkey"),
  ]);

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
