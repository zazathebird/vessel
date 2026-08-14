/**
 * The account API: signup, sign-in, the second factor, and the session.
 *
 * The order things happen in here follows SPEC-ACCOUNTS.md §4 exactly, and the
 * one property worth restating before reading any of it:
 *
 * **No password reaches this file.** What arrives is an `authSecret` — 32 bytes
 * of PBKDF2-then-HKDF output the browser produced (`src/auth/derive.ts`) — and
 * what is stored is an HMAC of that under a pepper held in the Worker's secrets
 * rather than in D1. The *other* half of the browser's derivation, the one that
 * opens the account's key slot, is never sent and cannot be computed from this
 * one. That is what makes operator reset safe and what makes a database leak
 * yield nothing that opens a grant key.
 *
 * A consequence worth naming because it looks like an omission: **this file
 * cannot enforce a password policy.** Length and composition rules live in the
 * browser, because by the time a request arrives the password is already a
 * uniform 256-bit value and every password looks identical. Moving the rule here
 * would mean sending the password, which is the one thing the design refuses.
 */

import { authHash, clientKey, hmac, newId, timingSafeEqual, toHex } from "./crypto";
import type { Env } from "./env";
import {
  BadRequest,
  expectBytes,
  fromBase64Url,
  fromBlob,
  toBase64Url,
  toBlob,
} from "./encoding";
import type { RateVerdict } from "./rate-limit";
import * as session from "./session";
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp";

// Shapes and limits -----------------------------------------------------------

/**
 * The one field a user picks that could carry their real name, and §9's
 * inventory says so plainly: it is personal "only if they choose their own name
 * — their call, and it is the one field where that is true." So the rules here
 * are about being addressable and unambiguous, not about identity.
 *
 * Restricted to DNS label characters on 2026-08-12, while the account count was
 * still zero and the change was therefore free. `.` and `_` were both permitted
 * before and neither survives a hostname: a dot makes `ada.smith.mcclevarty.ca`
 * a two-level name that Universal SSL does not cover, and an underscore is
 * invalid in the hostname position outright. Keeping handles DNS-safe leaves
 * per-account subdomains possible later (`design/GUIDE-SUBDOMAINS.md`) instead
 * of foreclosing them for whichever accounts happened to use those characters.
 * After the first real signup this would have been a breaking migration.
 */
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{2,23}$/i;

/**
 * Reserved so that nobody can sign up as the operator and be believed. The
 * operator door is theatre (SPEC.md §Security) but the operator *account* is
 * not, and a user called `operator` in a shared-with list would be a lie the
 * interface tells for free.
 */
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "operator",
  "vessel",
  "mcclevarty",
  "root",
  "system",
  "support",
  "help",
  "api",
  "me",
  "account",
  "machines",
  "share",
  "null",
  "undefined",
  // Names that already have jobs in the DNS zone or in mail conventions —
  // recommended by design/GUIDE-SUBDOMAINS.md on 2026-08-12, actioned in the
  // 2026-08-13 security review. Handles are DNS-safe precisely so per-account
  // subdomains stay possible; these are the labels such a subdomain must never
  // be allowed to claim. `mailroot8` is where the MX record actually points.
  "www",
  "mail",
  "mailroot8",
  "mailadmin",
  "webmail",
  "smtp",
  "imap",
  "pop",
  "ftp",
  "mx",
  "dns",
  "ns1",
  "ns2",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "security",
  "noreply",
  "no-reply",
  "dev",
  "staging",
  "test",
  "status",
]);

/** §4 and §5 fix these; they are asserted on the wire so a handler can assume them. */
const AUTH_SECRET_BYTES = 32;
const KDF_SALT_BYTES = 16;
const GRANT_PUBKEY_BYTES = 65; // uncompressed P-256 point: 0x04 ‖ x ‖ y
const WRAPPED_KEY_BYTES = 40; // AES-KW of a 32-byte scalar adds one block
const RECOVERY_CODE_COUNT = 10;
const TOTP_BACKUP_CODE_COUNT = 10;

/**
 * The browser is trusted to pick its own iteration count — it is the one that
 * pays for it, and §4 wants it raised over time — but not to pick an absurd one.
 * The floor stops a hostile or broken client registering an account that is
 * cheap to attack offline; the ceiling stops one registering an account that
 * takes a minute to sign in to and is therefore lost.
 */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

/**
 * Mirrors `RECOVERY_ITERATIONS` in `src/auth/derive.ts`.
 *
 * **Both branches of `challenge` must fall back to this one constant**, real and
 * decoy alike. The real branch used `MIN_ITERATIONS`, which is the same number
 * today and means something else entirely — a validation floor, which §4 wants
 * raised over time. Raising it would move the real fallback and leave the decoy
 * behind, and the gap between them is a handle oracle of exactly the kind the
 * iteration-count decoy was just fixed to close.
 */
const RECOVERY_ITERATIONS_DEFAULT = 100_000;

/**
 * Mirrors `DEFAULT_ITERATIONS` in `src/auth/derive.ts`. Reported by `challenge`
 * for an account that has a salt but no password credential — one whose password
 * the operator reset — where there is no stored count to report and the browser
 * is about to choose its own anyway.
 */
const DEFAULT_ITERATIONS = 600_000;

/** Nothing legitimate here is large. A signup with ten slots is a few kilobytes. */
const MAX_BODY_BYTES = 64 * 1024;

export interface AccountRow {
  id: string;
  handle: string;
  is_operator: number;
  created_at: number;
  reset_at: number | null;
}

// Request plumbing ------------------------------------------------------------

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

/**
 * Keep a response out of every cache between here and the browser.
 *
 * Applied to anything carrying account state or key material. A wrapped grant
 * key is ciphertext the server cannot open, which is not a reason to let a proxy
 * keep a copy of it, and `Response.json` sets no cache headers of its own.
 */
export function noStore(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  // Measured after reading rather than trusted from `content-length`, which is
  // absent on a chunked request and arbitrary on a hostile one — either way the
  // header check passes and the whole body is read regardless. Reading the text
  // first costs one buffer and makes the limit real.
  const text = await request.text();
  // `text.length` counts UTF-16 code units, not bytes — a body of three-byte
  // UTF-8 characters would pass a "64KB" check at ~192KB of wire bytes. The
  // cheap check first short-circuits the encode for the common oversized case;
  // the encode makes the limit true.
  if (text.length > MAX_BODY_BYTES || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BadRequest("That request was too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequest("That request was not valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequest("That request was not valid JSON.");
  }
  return body as Record<string, unknown>;
}

function expectHandle(value: unknown): string {
  if (typeof value !== "string") throw new BadRequest("Choose a handle.");
  const handle = value.trim();
  if (!HANDLE_PATTERN.test(handle)) {
    // Describes `HANDLE_PATTERN` and must keep describing it. It used to promise
    // `.` and `_`, which the DNS-safe tightening removed — so the rule the person
    // was told and the rule they were held to disagreed, and the refusal read as
    // a bug in the site.
    throw new BadRequest(
      "A handle is 3 to 24 characters: letters, numbers, and hyphens after the first.",
    );
  }
  if (RESERVED_HANDLES.has(handle.toLowerCase())) {
    throw new BadRequest("That handle is reserved. Pick another.");
  }
  return handle;
}

/**
 * The handle on a sign-in path, validated for *shape* before it is used to name
 * a rate-limit bucket.
 *
 * Shape is not existence, so this discloses nothing. What it prevents is a
 * namespace collision: the synthetic bucket names used elsewhere contain a `:`,
 * which `HANDLE_PATTERN` forbids. Without this check an attacker who learned an
 * account id could send failed sign-ins for the handle `second-factor:<id>` and
 * block that victim's second-factor bucket for an hour — so the victim's correct
 * password would earn them a ticket they could not spend.
 */
function expectSignInHandle(value: unknown): string {
  const handle = typeof value === "string" ? value.trim() : "";
  if (!handle || !HANDLE_PATTERN.test(handle)) throw new BadRequest("Enter your handle.");
  return handle;
}

function expectIterations(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BadRequest("Missing key-derivation parameters.");
  }
  if (value < MIN_ITERATIONS || value > MAX_ITERATIONS) {
    throw new BadRequest("Those key-derivation parameters are out of range.");
  }
  return value;
}

// Rate limiting ---------------------------------------------------------------

/**
 * Two buckets guard every credential check, and they answer different questions.
 *
 * The **client** bucket asks "is one place trying many accounts?" — credential
 * stuffing, which §3 lists as new with passwords and absent with passkeys. The
 * **account** bucket asks "are many places trying one account?" — a targeted
 * guess. Either alone leaves the other wide open, and neither ever sees an IP
 * address: the client bucket is named by `clientKey`, an HMAC under a salt that
 * rotates daily (§9, and `crypto.ts`).
 */
async function buckets(request: Request, env: Env, handleLower: string | null): Promise<string[]> {
  // Absent in local development, where there is no edge in front of us. The
  // literal is a bucket name and not an address, so nothing is written down
  // either way.
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const names = [`client:${await clientKey(ip, env.RATE_SALT_SEED)}`];
  if (handleLower) names.push(`account:${toHex(await hmac(env.RATE_SALT_SEED, handleLower))}`);
  return names;
}

/**
 * How many attempts each kind of bucket allows before backoff.
 *
 * The account bucket is tight because it watches one person's credential. The
 * client bucket is an order of magnitude looser because one address is a
 * household or an office behind NAT, and five would mean one person's typo
 * locking out everyone sharing their connection. Loose is still bounded: fifty
 * failures in fifteen minutes from one address is nobody's honest afternoon.
 */
const CLIENT_FREE_ATTEMPTS = 50;
const ACCOUNT_FREE_ATTEMPTS = 5;
/**
 * Account creations from one address before backoff (2026-08-13 audit). Signup
 * used to lean on the client bucket alone, whose allowance of fifty is sized
 * for a household's sign-in typos — as a creation quota it let one script mint
 * fifty accounts per window, while the comment beside it believed the answer
 * was five. Twelve is sized just above the e2e harness, which legitimately
 * creates eight accounts per run from one fictional address, and it is still
 * nobody's honest afternoon at a keyboard.
 */
const SIGNUP_FREE_ATTEMPTS = 12;

function freeFor(name: string): number {
  if (name.startsWith("client:")) return CLIENT_FREE_ATTEMPTS;
  if (name.startsWith("signup:")) return SIGNUP_FREE_ATTEMPTS;
  return ACCOUNT_FREE_ATTEMPTS;
}

async function limiterFetch(env: Env, name: string, path: string): Promise<RateVerdict> {
  const stub = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(name));
  return stub
    .fetch(`https://rate-limit${path}?free=${freeFor(name)}`)
    .then((r) => r.json<RateVerdict>());
}

/**
 * Refuse early if any bucket is blocked.
 *
 * The message states when to come back rather than saying "too many attempts",
 * because §10 requires a failure to say what to do next and "try again later" is
 * the version of that which tells a locked-out owner nothing.
 */
async function assertAllowed(env: Env, names: string[]): Promise<void> {
  await gate(env, names, "/check");
}

/**
 * Reserve an attempt in the same round-trip that checks it.
 *
 * `/check` then `/fail` is two round-trips, and between them the bucket says
 * nothing is happening. Fire five hundred concurrent sign-ins for one handle and
 * every one of them reads the bucket, sees fewer than five failures and
 * proceeds — five hundred password guesses against an allowance of five. The
 * Durable Object serialises the *writes* faithfully; it simply has nothing to
 * refuse, because every caller already passed.
 *
 * `/attempt` counts the attempt as a failure up front, so the object's
 * single-threaded execution actually decides: the Nth concurrent caller sees
 * N-1 already recorded. `recordSuccess` refunds it, which is why the honest path
 * is unchanged — a correct password still carries nothing forward.
 *
 * **Every credential check should use this, and `challenge` must not.** Asking
 * for a salt is not a failable attempt, and counting it would let anyone lock an
 * owner out of their own account by requesting theirs in a loop.
 */
async function assertAttempt(env: Env, names: string[]): Promise<void> {
  await gate(env, names, "/attempt");
}

async function gate(env: Env, names: string[], path: string): Promise<void> {
  for (const name of names) {
    const verdict = await limiterFetch(env, name, path);
    if (!verdict.allowed) {
      const seconds = Math.max(1, Math.ceil((verdict.retryAt - Date.now()) / 1000));
      throw new BadRequest(
        seconds > 90
          ? `Too many attempts. Try again in about ${Math.ceil(seconds / 60)} minutes.`
          : `Too many attempts. Try again in about ${seconds} seconds.`,
        429,
      );
    }
  }
}

/**
 * Count a failure that `assertAttempt` did not already reserve.
 *
 * Still needed for the paths that are not credential checks — signup's handle
 * collision and its creation quota — and harmless after `assertAttempt`, which
 * is why the credential paths drop their trailing call rather than keeping both.
 */
async function recordFailure(env: Env, names: string[]): Promise<void> {
  await Promise.all(names.map((name) => limiterFetch(env, name, "/fail")));
}

/**
 * A success clears the slate for the **account**, so an ordinary user who
 * mistypes twice and then succeeds carries nothing forward.
 *
 * It deliberately does **not** clear the client bucket, and that asymmetry is
 * the whole point. `/reset` is a wipe rather than a decrement, so resetting the
 * shared client bucket on success would hand an attacker a free one: sign in
 * correctly to an account they own, and the counter recording their failures
 * against *everybody else's* accounts goes back to zero. They could then test
 * passwords against a stuffing list indefinitely from one address, which is
 * precisely the attack §3 lists as new with passwords and the reason this
 * bucket exists at all.
 *
 * The client bucket is not left untouched either, though — that would mean an
 * address slowly accumulating every mistyped password its users ever make until
 * it blocks for reasons nobody can see. It *decays* by one instead, so honest
 * traffic drains it about as fast as it fills it while a run of failures still
 * accumulates. Index 0 is the client bucket by construction — see `buckets`.
 */
async function recordSuccess(env: Env, names: string[]): Promise<void> {
  await Promise.all([
    limiterFetch(env, names[0], "/succeed"),
    ...names.slice(1).map((name) => limiterFetch(env, name, "/reset")),
  ]);
}

// Audit -----------------------------------------------------------------------

/**
 * Actor, action, target, time. **Never origin** — no IP, no user agent (§9).
 * This is the record §3 relies on to catch a compromised frontend, so it is
 * written on the same code path as the thing it records rather than best-effort
 * afterwards.
 */
export function auditStatement(env: Env, actorId: string | null, action: string, target: string | null) {
  return env.DB.prepare("INSERT INTO audit (id, actor_id, action, target, at) VALUES (?, ?, ?, ?, ?)").bind(
    newId(),
    actorId,
    action,
    target,
    Date.now(),
  );
}

// Sessions --------------------------------------------------------------------

async function accountById(env: Env, id: string): Promise<AccountRow | null> {
  return env.DB.prepare(
    "SELECT id, handle, is_operator, created_at, reset_at FROM accounts WHERE id = ?",
  )
    .bind(id)
    .first<AccountRow>();
}

/**
 * The signed-in account, or a 401 the client is expected to act on by showing a
 * sign-in prompt.
 *
 * The account is re-read from D1 on every request rather than trusted from the
 * token. A token is only a claim about *who*; whether that account still exists,
 * and whether it is the operator, are facts that can change inside a session's
 * thirty minutes and must not be carried in a bearer credential.
 */
export async function requireAccount(request: Request, env: Env): Promise<AccountRow> {
  const token = await session.verify(
    env.SESSION_SECRET,
    "session",
    session.readCookie(request, session.SESSION_COOKIE),
  );
  if (!token) throw new BadRequest("Sign in to do that.", 401);

  const account = await accountById(env, token.subject);
  if (!account) throw new BadRequest("Sign in to do that.", 401);
  return account;
}

/**
 * Attach a fresh session cookie to a response.
 *
 * `issuedAt` is passed through on a refresh so the absolute ceiling in
 * `session.ts` survives it. Omitting it starts a new session, which is what a
 * sign-in wants and what a refresh must never do.
 */
export async function withSession(
  env: Env,
  accountId: string,
  response: Response,
  issuedAt?: number,
): Promise<Response> {
  const now = Date.now();
  const token = await session.mint(env.SESSION_SECRET, "session", accountId, now, issuedAt ?? now);
  response.headers.append("set-cookie", session.sessionCookie(token));
  return response;
}

/**
 * Re-prove the password before changing what credentials the account has.
 *
 * A session cookie says "somebody is signed in as this account", which is not
 * enough to *add a factor*. Without this, anyone holding a stolen cookie enrols
 * their own authenticator, and from that moment the real owner's correct
 * password buys them a ticket they cannot spend: they hold no TOTP secret and no
 * backup codes. Their only ways out are an operator reset or a recovery code,
 * both of which cost them a key slot — so a stolen cookie becomes permanent
 * lockout plus lost grant authority.
 *
 * Adding a credential is a credential change, and a credential change should
 * demand a credential. This is the same shape §3 requires around signing a
 * grant, for the same reason.
 */
async function requirePassword(request: Request, env: Env, account: AccountRow): Promise<void> {
  const body = await readJson(request);
  await assertPassword(request, env, account, body.authSecret);
}

/**
 * **The rate limiting lives in here, not in the callers.**
 *
 * This is a password check, and every other password check on the site counts
 * against the limiter. These two did not: `totpEnrol` called this with no bucket
 * at all, and `totpConfirm` called it *above* the bucket it later set up for the
 * TOTP code, so a wrong password there was never recorded either. That left one
 * unthrottled online password oracle — and the caller who benefits from it is
 * precisely the one who should not exist: somebody holding a session obtained
 * *without* the password, via a recovery code or a stolen cookie. The password
 * is what opens the key slot, so grinding it there is an escalation from session
 * access to grant authority, which §5 exists to prevent.
 *
 * Putting the counting inside the check means a future caller cannot forget it.
 */
export async function assertPassword(
  request: Request,
  env: Env,
  account: AccountRow,
  supplied: unknown,
): Promise<void> {
  const refused = new BadRequest("Enter your password to change how you sign in.", 401);
  if (typeof supplied !== "string") throw refused;

  const names = await buckets(request, env, account.handle.toLowerCase());
  await assertAttempt(env, names);

  const authSecret = expectBytes(supplied, AUTH_SECRET_BYTES, "Authentication secret");
  const row = await env.DB.prepare(
    "SELECT auth_hash FROM credentials WHERE account_id = ? AND kind = 'password'",
  )
    .bind(account.id)
    .first<{ auth_hash: unknown }>();
  if (!row) throw refused;

  const presented = new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(authSecret)));
  if (!timingSafeEqual(presented, fromBlob(row.auth_hash))) throw refused;
  await recordSuccess(env, names);
}

export function publicAccount(account: AccountRow) {
  return {
    id: account.id,
    handle: account.handle,
    isOperator: account.is_operator === 1,
    createdAt: account.created_at,
  };
}

// Signup ----------------------------------------------------------------------

/**
 * Create an account, its password credential, its ten recovery credentials, and
 * one key slot for each of the eleven.
 *
 * Everything is written in a single `batch`, which D1 runs as one transaction.
 * That matters more than it looks: an account that got its credential but not
 * its key slot would sign in perfectly and be unable to ever open its grant key,
 * and the failure would surface months later in someone's recovery path.
 */
export async function signup(request: Request, env: Env): Promise<Response> {
  const names = await buckets(request, env, null);
  // The creation quota gets its own bucket beside the shared client one: same
  // daily-rotating client key, different namespace, so `freeFor` can hold it to
  // SIGNUP_FREE_ATTEMPTS while sign-in traffic keeps its fifty. Index 0 is the
  // client bucket by construction — see `buckets`.
  names.push(`signup:${names[0].slice("client:".length)}`);
  // `assertAttempt`, not `assertAllowed` — reserve and check in one round trip.
  //
  // This was the non-consuming `/check` until 2026-08-14, with the consume
  // happening after the account had already been written. That is exactly the
  // race the 2026-08-13 audit closed for sign-in, missed here: 500 concurrent
  // signups from one address all called `/check` before any of them counted,
  // all saw zero failures, and all 500 accounts were created against an
  // allowance of twelve — about 23 D1 rows each. The bucket only shut *after*
  // the burst, so a quota of "12 per window" was really "one unbounded burst
  // per hour". Every other credential path already reserved; `challenge` is the
  // one deliberate exception (asking for a salt is not a failable attempt).
  //
  // The rate is unchanged at one unit per signup, so the harness's eight-per-run
  // still sits under SIGNUP_FREE_ATTEMPTS — the reservation replaces the
  // trailing `recordFailure` rather than adding to it, which is the same trade
  // the credential paths made when they moved.
  await assertAttempt(env, names);

  const body = await readJson(request);
  const handle = expectHandle(body.handle);
  const kdf = (body.kdf ?? {}) as Record<string, unknown>;
  const salt = expectBytes(kdf.salt, KDF_SALT_BYTES, "Key-derivation salt");
  const iterations = expectIterations(kdf.iterations);
  const recoveryIterations = expectIterations(kdf.recoveryIterations);
  const authSecret = expectBytes(body.authSecret, AUTH_SECRET_BYTES, "Authentication secret");
  const grantPubkey = expectBytes(body.grantPubkey, GRANT_PUBKEY_BYTES, "Grant public key");
  const passwordSlot = expectBytes(body.passwordSlot, WRAPPED_KEY_BYTES, "Key slot");
  const slotAlg = typeof body.slotAlg === "string" ? body.slotAlg : "AES-KW/HKDF-SHA-256";
  // Stored and echoed back on every sign-in that returns a slot, so bounded
  // like every other free-text field.
  if (slotAlg.length > 64) throw new BadRequest("That key slot algorithm is not valid.");

  // An uncompressed point that is genuinely *on* P-256, not merely 65 bytes
  // beginning 0x04. This is the account's grant root: in phase 3 an agent will
  // trust it to verify every grant, and a value that cannot be imported is one
  // that turns into an unexplainable failure long after signup. Importing it is
  // the cheapest complete check available, and it happens once per account.
  if (grantPubkey[0] !== 0x04) throw new BadRequest("That grant public key is malformed.");
  try {
    await crypto.subtle.importKey(
      "raw",
      grantPubkey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new BadRequest("That grant public key is not a valid P-256 point.");
  }

  if (!Array.isArray(body.recovery) || body.recovery.length !== RECOVERY_CODE_COUNT) {
    throw new BadRequest(`Expected ${RECOVERY_CODE_COUNT} recovery codes.`);
  }
  const recovery = body.recovery.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      authSecret: expectBytes(item.authSecret, AUTH_SECRET_BYTES, `Recovery secret ${index + 1}`),
      slot: expectBytes(item.slot, WRAPPED_KEY_BYTES, `Recovery key slot ${index + 1}`),
    };
  });

  const handleLower = handle.toLowerCase();
  const taken = await env.DB.prepare("SELECT 1 FROM accounts WHERE handle_lower = ?")
    .bind(handleLower)
    .first();
  if (taken) {
    // Handle availability is public by nature — anyone can probe it by trying to
    // sign up — so saying so plainly costs nothing and saves a confusing failure.
    await recordFailure(env, names);
    throw new BadRequest("That handle is taken. Pick another.", 409);
  }

  const now = Date.now();
  const accountId = newId();
  const passwordCredentialId = newId();

  const statements = [
    env.DB.prepare(
      "INSERT INTO accounts (id, handle, handle_lower, created_at, grant_pubkey, is_operator) VALUES (?, ?, ?, ?, ?, 0)",
    ).bind(accountId, handle, handleLower, now, toBlob(grantPubkey)),

    env.DB.prepare(
      "INSERT INTO credentials (id, account_id, kind, label, created_at, auth_hash, kdf_salt, kdf_iterations) VALUES (?, ?, 'password', 'password', ?, ?, ?, ?)",
    ).bind(
      passwordCredentialId,
      accountId,
      now,
      toBlob(new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(authSecret)))),
      toBlob(salt),
      iterations,
    ),

    env.DB.prepare(
      "INSERT INTO key_slots (id, account_id, credential_id, wrapped_grant_key, alg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(newId(), accountId, passwordCredentialId, toBlob(passwordSlot), slotAlg, now),
  ];

  for (const [index, entry] of recovery.entries()) {
    const credentialId = newId();
    statements.push(
      env.DB.prepare(
        "INSERT INTO credentials (id, account_id, kind, label, created_at, code_hash, kdf_salt, kdf_iterations) VALUES (?, ?, 'recovery', ?, ?, ?, ?, ?)",
      ).bind(
        credentialId,
        accountId,
        `recovery ${index + 1}`,
        now,
        toBlob(new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(entry.authSecret)))),
        toBlob(salt),
        recoveryIterations,
      ),
      env.DB.prepare(
        "INSERT INTO key_slots (id, account_id, credential_id, wrapped_grant_key, alg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(newId(), accountId, credentialId, toBlob(entry.slot), slotAlg, now),
    );
  }

  statements.push(auditStatement(env, accountId, "account.created", handleLower));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    // The availability check above and this insert are not atomic, so two
    // signups for the same handle can both pass the check. The unique index on
    // `handle_lower` is what actually prevents the duplicate — this turns its
    // refusal back into the answer the caller was already expecting, rather than
    // the generic 500 an unrecognised throw would become.
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      // No `recordFailure` here: `assertAttempt` above already reserved this
      // attempt, and counting it twice would halve the real allowance.
      throw new BadRequest("That handle is taken. Pick another.", 409);
    }
    throw error;
  }

  // Signup consumes attempts the way a failure does — the Durable Object counts
  // failures only, so this is a mild repurposing of it, and the intent is a
  // quota on account creation from one place, held by the `signup:` bucket at
  // SIGNUP_FREE_ATTEMPTS before backoff. **The consume now happens in
  // `assertAttempt` above, before any work**, which is what makes the quota
  // hold under concurrency; there is deliberately no trailing `recordFailure`
  // here any more, or every signup would cost two.
  const account = await accountById(env, accountId);
  // Carries the fresh session cookie — account state, so `no-store` like every
  // other response under the convention.
  return withSession(
    env,
    accountId,
    noStore(json({ account: publicAccount(account!) }, { status: 201 })),
  );
}

// Sign-in ---------------------------------------------------------------------

/**
 * Hand back the KDF parameters for a handle so the browser can derive.
 *
 * **This endpoint must not disclose whether an account exists.** It is
 * unauthenticated and it is the obvious place to enumerate handles, so an
 * unknown handle gets parameters that are stable, plausible, and derived from
 * the handle itself under the pepper — the same handle always yields the same
 * fake salt, so probing twice cannot distinguish "made up on the spot" from
 * "stored at signup". The eventual sign-in failure is where a wrong handle is
 * discovered, and it is indistinguishable there from a wrong password.
 */
export async function challenge(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const handleLower = expectSignInHandle(body.handle).toLowerCase();

  // Checked but not consumed: asking for a salt is not a failable attempt, and
  // counting it would let anyone lock an owner out by requesting theirs.
  await assertAllowed(env, await buckets(request, env, handleLower));

  // **The salt comes from any credential that has one, not only the password.**
  //
  // An account whose password was reset by the operator has no password
  // credential at all, and the person holding a recovery code needs this exact
  // salt to derive against — theirs was issued under it. Keying this query on
  // `kind = 'password'` would drop such an account through to the decoy below,
  // hand the browser a fabricated salt, and turn a working recovery code into a
  // wrong one. The failure would look like a bad code and be blamed on the user.
  //
  // Every credential on an account shares one salt (see signup, where the
  // recovery codes are derived with the password's `params.salt`), so preferring
  // the password row is about the iteration count travelling with it, not about
  // the salts differing.
  const row = await env.DB.prepare(
    `SELECT
       (SELECT c.kdf_salt FROM credentials c
         WHERE c.account_id = a.id AND c.kdf_salt IS NOT NULL
         ORDER BY CASE c.kind WHEN 'password' THEN 0 ELSE 1 END LIMIT 1) AS salt,
       (SELECT p.kdf_iterations FROM credentials p
         WHERE p.account_id = a.id AND p.kind = 'password') AS iterations,
       (SELECT r.kdf_iterations FROM credentials r
         WHERE r.account_id = a.id AND r.kind = 'recovery' LIMIT 1) AS recovery_iterations
     FROM accounts a
     WHERE a.handle_lower = ?`,
  )
    .bind(handleLower)
    .first<{ salt: unknown; iterations: number | null; recovery_iterations: number | null }>();

  if (row?.salt) {
    // no-store on both branches: per-account KDF parameters are account state,
    // and a cached decoy that outlives a real signup is a tell all of its own.
    return noStore(json({
      kdf: {
        salt: toBase64Url(fromBlob(row.salt)),
        // Null when the password credential is gone. The count only governs a
        // password derivation, and the only one left to do is setting a new one,
        // which picks its own — so the default is the honest answer rather than
        // a placeholder.
        iterations: row.iterations ?? DEFAULT_ITERATIONS,
        recoveryIterations: row.recovery_iterations ?? RECOVERY_ITERATIONS_DEFAULT,
      },
    }));
  }

  // **The decoy must report exactly what a real account reports.**
  //
  // An earlier version varied the count — `600000 + (hmac(handle) % 200) * 1000`
  // — reasoning that a constant would betray every existing account the moment
  // the browser started scaling iterations to the device. That reasoning is
  // right about the future and backwards about the present: `DEFAULT_ITERATIONS`
  // is a constant in `src/auth/derive.ts`, so every real account reports 600000
  // exactly and nothing else can. The spread was therefore the tell — one
  // unauthenticated request classified any handle, `> 600000` meaning "certainly
  // does not exist" and `== 600000` meaning "exists" at 199/200 — which is the
  // handle oracle this whole endpoint exists to deny, and `challenge` never
  // records a failure, so probing it is unthrottled.
  //
  // When real counts do start varying, sample this from the same distribution.
  // Until then the only safe decoy is the real value.
  const decoy = new Uint8Array(await hmac(env.AUTH_PEPPER, `decoy-salt:${handleLower}`));
  return noStore(json({
    kdf: {
      salt: toBase64Url(decoy.slice(0, KDF_SALT_BYTES)),
      iterations: DEFAULT_ITERATIONS,
      recoveryIterations: RECOVERY_ITERATIONS_DEFAULT,
    },
  }));
}

/**
 * Verify a credential and either sign the caller in or ask for the second
 * factor.
 *
 * Every failure returns the same sentence. A different message for "no such
 * handle" and "wrong password" is a handle oracle, and one for "wrong password
 * but this account has 2FA" is worse.
 */
export async function signin(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const kind = body.kind === "recovery" ? "recovery" : "password";
  const handleLower = expectSignInHandle(body.handle).toLowerCase();
  const authSecret = expectBytes(body.authSecret, AUTH_SECRET_BYTES, "Authentication secret");

  const names = await buckets(request, env, handleLower);
  await assertAttempt(env, names);

  const wrong = new BadRequest("That handle and password do not match.", 401);

  const account = await env.DB.prepare(
    "SELECT id, handle, is_operator, created_at, reset_at FROM accounts WHERE handle_lower = ?",
  )
    .bind(handleLower)
    .first<AccountRow>();

  // The HMAC runs whether or not the account exists, so an unknown handle costs
  // the same time as a wrong password.
  const presented = new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(authSecret)));

  if (!account) {
    // The same number of database round trips as the found path, not merely the
    // same HMAC. An HMAC over 43 bytes is microseconds; a D1 query is
    // milliseconds. Equalising only the cheap half leaves the expensive half as
    // a handle oracle — time thirty requests for a real handle and thirty for a
    // made-up one and the medians separate cleanly, whatever the response body
    // says. The sentinel id matches nothing and the query plan is identical.
    await lookupCredentials(env, "no-such-account", kind);
    throw wrong;
  }

  const candidates = await lookupCredentials(env, account.id, kind);

  // No short circuit. `find` stops at the first match, which on the recovery
  // path discloses through timing roughly how far down the list of ten the
  // presented code sat.
  let credential: CredentialRow | null = null;
  for (const row of candidates) {
    if (timingSafeEqual(presented, fromBlob(row.secret))) credential = row;
  }

  if (!credential) {
    throw wrong;
  }

  const totp = await env.DB.prepare(
    "SELECT confirmed_at FROM totp WHERE account_id = ? AND confirmed_at IS NOT NULL",
  )
    .bind(account.id)
    .first<{ confirmed_at: number }>();

  // The first factor passed, so the attempt counters are cleared here rather
  // than after the second. Otherwise someone who knows their password but
  // fumbles the code three times locks themselves out of an account they can
  // demonstrably open.
  await recordSuccess(env, names);

  if (totp) {
    // **Nothing is spent yet.** A recovery code must not be marked used until
    // the sign-in it belongs to actually completes: the person holding the codes
    // but not the phone is exactly who recovery exists for, and burning one per
    // abandoned attempt would empty the account's last resort in ten tries. The
    // ticket carries which credential is pending so the second factor can finish
    // the job.
    //
    // no-store: the ticket is a bearer capability for the second-factor stage,
    // and five minutes is plenty of life for a cached copy to be worth having.
    return noStore(json({
      status: "totp-required",
      ticket: await session.mint(
        env.SESSION_SECRET,
        "totp-ticket",
        kind === "recovery" ? `${account.id}:rec:${credential.id}` : account.id,
      ),
    }));
  }

  return completeSignIn(env, account, kind, credential.id);
}

interface CredentialRow {
  id: string;
  secret: unknown;
}

/**
 * The candidate credentials a presented secret could match.
 *
 * One function for both the found and not-found paths so the two cannot drift
 * apart in cost — see the timing note in `signin`. An account has at most one
 * password and up to ten unspent recovery codes, so both queries are small.
 */
async function lookupCredentials(
  env: Env,
  accountId: string,
  kind: "password" | "recovery",
): Promise<CredentialRow[]> {
  const { results } = await env.DB.prepare(
    kind === "password"
      ? "SELECT id, auth_hash AS secret FROM credentials WHERE account_id = ? AND kind = 'password'"
      : "SELECT id, code_hash AS secret FROM credentials WHERE account_id = ? AND kind = 'recovery' AND used_at IS NULL",
  )
    .bind(accountId)
    .all<CredentialRow>();
  return results;
}

/**
 * Finish a sign-in that has passed every factor it needs.
 *
 * **The recovery path is the interesting one, and §5 is why.** A recovery code
 * "holds its own grant-key slot, so redeeming one preserves grant authority in
 * full" — which only holds if the browser is actually handed that slot. So the
 * wrapped key comes back in this response, and the slot row is **kept**, not
 * deleted. Destroying it here would leave the user signed in with their grant
 * key sealed inside ciphertext nobody can ever open again, which is exactly the
 * degradation §4 says operator reset has and recovery codes do not.
 *
 * The code itself is spent — `used_at` is set, so it cannot sign in again — and
 * the slot it leaves behind is unreachable without another credential. Clearing
 * spent slots belongs to `setPassword`, which is the only thing that can replace
 * one, and which this response hands the ticket for.
 */
async function completeSignIn(
  env: Env,
  account: AccountRow,
  kind: "password" | "recovery",
  credentialId: string,
): Promise<Response> {
  const now = Date.now();
  const statements = [
    env.DB.prepare("UPDATE credentials SET last_used_at = ? WHERE id = ?").bind(now, credentialId),
    auditStatement(env, account.id, "auth.signin", kind),
  ];

  let keySlot: { wrappedGrantKey: string; grantPubkey: string; alg: string } | undefined;
  let setPasswordTicket: string | undefined;

  if (kind === "recovery") {
    const slot = await env.DB.prepare(
      `SELECT s.wrapped_grant_key AS wrapped, s.alg AS alg, a.grant_pubkey AS pubkey
         FROM key_slots s JOIN accounts a ON a.id = s.account_id
        WHERE s.credential_id = ?`,
    )
      .bind(credentialId)
      .first<{ wrapped: unknown; alg: string; pubkey: unknown }>();

    if (slot?.pubkey) {
      keySlot = {
        wrappedGrantKey: toBase64Url(fromBlob(slot.wrapped)),
        grantPubkey: toBase64Url(fromBlob(slot.pubkey)),
        alg: slot.alg,
      };
    }

    statements.push(
      env.DB.prepare("UPDATE credentials SET used_at = ? WHERE id = ?").bind(now, credentialId),
      auditStatement(env, account.id, "auth.recovery.redeemed", credentialId),
    );

    // The capability to set a password without presenting the current one, given
    // only to the one caller who by definition cannot present it. Minted here
    // rather than at `signin` so that an account with a second factor gets it
    // after TOTP rather than before — this function is the single point both
    // paths converge on.
    //
    // **The subject carries the redeemed credential, not just the account**, and
    // that is what makes the ticket single-use. A token is a bearer capability
    // with no memory: verifying it proves it was minted, never that it has not
    // already been spent. `setPassword` deletes this credential's key slot as
    // part of the same batch that writes the new password, so requiring the slot
    // to still exist turns "already used" into a refusal without a table to
    // track spent tickets in.
    setPasswordTicket = await session.mint(
      env.SESSION_SECRET,
      "set-password",
      `${account.id}:${credentialId}`,
    );
  }

  await env.DB.batch(statements);

  return withSession(
    env,
    account.id,
    noStore(
      json({
        status: "signed-in",
        account: publicAccount(account),
        resetAt: account.reset_at,
        ...(keySlot ? { keySlot } : {}),
        ...(setPasswordTicket ? { setPasswordTicket } : {}),
      }),
    ),
  );
}

/**
 * The second factor: a TOTP code, or one of the ten backup codes issued at
 * enrolment.
 *
 * The ticket proves the first factor was already passed and expires in five
 * minutes. It is a different token `purpose` from a session, so presenting one
 * as the other fails the MAC rather than being caught by a check somebody could
 * forget to write.
 */
export async function signinTotp(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const ticket = await session.verify(
    env.SESSION_SECRET,
    "totp-ticket",
    typeof body.ticket === "string" ? body.ticket : null,
  );
  if (!ticket) throw new BadRequest("That sign-in timed out. Start again.", 401);

  const code = typeof body.code === "string" ? body.code : "";

  // The ticket's subject is the account, optionally carrying the recovery
  // credential whose redemption is still pending — see `signin`.
  const [accountId, pendingRecoveryId] = ticket.subject.split(":rec:");

  const names = await buckets(request, env, null);
  names.push(`second-factor:${accountId}`);
  await assertAttempt(env, names);

  // One sentence for every way the second factor can fail. Distinguishing "that
  // code has already been used" from "that code is wrong" tells an attacker
  // guessing six digits when they have hit a real one, which is an oracle for
  // exactly the thing the replay guard exists to stop.
  const wrong = new BadRequest(
    "That code is not right. Check your authenticator and try again.",
    401,
  );

  const row = await env.DB.prepare(
    "SELECT secret_enc, backup_codes_hash, last_step FROM totp WHERE account_id = ? AND confirmed_at IS NOT NULL",
  )
    .bind(accountId)
    .first<{ secret_enc: unknown; backup_codes_hash: string; last_step: number | null }>();
  if (!row) throw new BadRequest("That sign-in timed out. Start again.", 401);

  const account = await accountById(env, accountId);
  if (!account) throw new BadRequest("That sign-in timed out. Start again.", 401);

  const secret = await decryptSecret(env.TOTP_ENC_KEY, fromBlob(row.secret_enc));
  const step = await verifyTotp(secret, code);

  if (step !== null) {
    // RFC 6238 §5.2: a code is valid for its step and for the drift window after
    // it, which is ample time for someone who read it over a shoulder to spend
    // it again. Accepting only a strictly newer step is what makes it one-time
    // in fact rather than in name.
    //
    // The check and the write are **one conditional UPDATE**, not a read
    // followed by a write. Two requests carrying the same code arrive
    // concurrently, both read `last_step`, both find it older, and both proceed
    // — the race is small but it is exactly the window an attacker replaying a
    // captured code would aim at. `changes === 0` means another request won.
    const claimed = await env.DB.prepare(
      "UPDATE totp SET last_step = ? WHERE account_id = ? AND (last_step IS NULL OR last_step < ?)",
    )
      .bind(step, accountId, step)
      .run();
    if (claimed.meta.changes !== 1) throw wrong;
  } else {
    const spent = await spendBackupCode(env, row.backup_codes_hash, code);
    if (!spent) throw wrong;
    // Same reasoning, and here the race is worse: two concurrent redemptions of
    // *different* codes both read the full list and both write their own copy
    // back, so the loser's strike-off is lost and an already-accepted code goes
    // live again. Making the write conditional on the list we read turns that
    // into a refusal.
    const claimed = await env.DB.prepare(
      "UPDATE totp SET backup_codes_hash = ? WHERE account_id = ? AND backup_codes_hash = ?",
    )
      .bind(spent, accountId, row.backup_codes_hash)
      .run();
    if (claimed.meta.changes !== 1) throw wrong;
    await env.DB.batch([auditStatement(env, accountId, "auth.totp.backup-used", null)]);
  }

  await recordSuccess(env, names);

  // Only now is a pending recovery code actually spent (§4: the person holding
  // the codes but not the phone is who recovery is for).
  return pendingRecoveryId
    ? completeSignIn(env, account, "recovery", pendingRecoveryId)
    : completeSignIn(env, account, "password", await passwordCredentialId(env, accountId));
}

/** The account's password credential, for stamping `last_used_at` after a two-factor sign-in. */
async function passwordCredentialId(env: Env, accountId: string): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT id FROM credentials WHERE account_id = ? AND kind = 'password'",
  )
    .bind(accountId)
    .first<{ id: string }>();
  return row?.id ?? "";
}

/**
 * Strike a backup code off the stored list, returning the new list or null.
 *
 * Every stored hash is compared even after one matches, so the time taken does
 * not narrow down which code was presented.
 */
async function spendBackupCode(env: Env, stored: string, code: string): Promise<string | null> {
  const normalised = code.replace(/[\s-]/g, "").toUpperCase();
  if (normalised.length < 8) return null;

  const presented = new Uint8Array(await authHash(env.AUTH_PEPPER, normalised));
  const hashes: string[] = JSON.parse(stored);

  let matched = -1;
  for (const [index, hash] of hashes.entries()) {
    if (timingSafeEqual(presented, fromBase64Url(hash))) matched = index;
  }
  if (matched < 0) return null;

  return JSON.stringify(hashes.filter((_, index) => index !== matched));
}

export async function signout(request: Request, env: Env): Promise<Response> {
  const token = await session.verify(
    env.SESSION_SECRET,
    "session",
    session.readCookie(request, session.SESSION_COOKIE),
  );
  if (token) await env.DB.batch([auditStatement(env, token.subject, "auth.signout", null)]);

  // no-store like every other response that changes account state: the body is
  // inert, but the Set-Cookie clearing the session should never sit in a cache.
  const response = noStore(json({ status: "signed-out" }));
  response.headers.append("set-cookie", session.clearedCookie());
  return response;
}

// The signed-in account -------------------------------------------------------

/**
 * Who am I, and what does my account currently hold?
 *
 * `resetAt` is here because §4 requires an operator reset to be *shown* to the
 * user rather than merely logged: "an administrative power that leaves no trace
 * is fine right up until the once it is not."
 */
export async function me(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);

  const credentials = await env.DB.prepare(
    "SELECT kind, count(*) AS n FROM credentials WHERE account_id = ? AND used_at IS NULL GROUP BY kind",
  )
    .bind(account.id)
    .all<{ kind: string; n: number }>();

  const totp = await env.DB.prepare("SELECT confirmed_at FROM totp WHERE account_id = ?")
    .bind(account.id)
    .first<{ confirmed_at: number | null }>();

  const counts = Object.fromEntries(credentials.results.map((row) => [row.kind, row.n]));

  const response = noStore(json({
    account: publicAccount(account),
    resetAt: account.reset_at,
    credentials: {
      password: (counts.password ?? 0) > 0,
      passkeys: counts.passkey ?? 0,
      recoveryCodesRemaining: counts.recovery ?? 0,
    },
    totp: { enrolled: !!totp, confirmed: !!totp?.confirmed_at },
  }));

  // Slide the session forward for an active user, without a Set-Cookie on every
  // single request.
  const token = await session.verify(
    env.SESSION_SECRET,
    "session",
    session.readCookie(request, session.SESSION_COOKIE),
  );
  if (token && session.needsRefresh(token)) {
    return withSession(env, account.id, response, token.issuedAt);
  }
  return response;
}

/**
 * The caller's own key slot, so the browser can open its grant key.
 *
 * This is ciphertext the server cannot read, handed to the one account it
 * belongs to, and it is how §5 is meant to work — the slot has to come back from
 * somewhere. Note what is **not** here: no route anywhere returns another
 * account's slot, wrapped or otherwise, to anybody including the operator. §4's
 * third condition on password reset is "it is a reset, never a read", and §5
 * rejects escrow permanently.
 *
 * Phase 3 is what calls this in anger, for the one signing operation §3 requires
 * a fresh gesture for. It exists now because a slot that has never been reopened
 * is a slot nobody has really tested.
 *
 * **The request proves the password, not just the session** (`assertPassword`,
 * which carries the rate limiting inside it). A session says who you are, never
 * how you proved it — and this ciphertext is the input to an offline password
 * grind that ends in grant authority, so handing it to a stolen cookie was the
 * escalation §5 exists to prevent. The TOTP half of the old TODO deliberately
 * does *not* live here: the response is the same bytes whatever the caller
 * intends, so a code requirement on this endpoint could not distinguish §12 K's
 * password-only connect ceremony from §3's sign gesture — an attacker would
 * simply claim the weaker purpose. The fresh-TOTP check belongs to the phase-3
 * grant-submission endpoint, where the guarded *action* is visible to the
 * server. `docs/DECISIONS.md` 2026-08-14.
 */
export async function keySlot(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  await requirePassword(request, env, account);

  const row = await env.DB.prepare(
    `SELECT s.wrapped_grant_key AS wrapped, s.alg AS alg, a.grant_pubkey AS pubkey
       FROM key_slots s
       JOIN credentials c ON c.id = s.credential_id
       JOIN accounts a ON a.id = s.account_id
      WHERE s.account_id = ? AND c.kind = 'password'`,
  )
    .bind(account.id)
    .first<{ wrapped: unknown; alg: string; pubkey: unknown }>();

  if (!row) throw new BadRequest("This account has no password key slot.", 404);

  return noStore(
    json({
      wrappedGrantKey: toBase64Url(fromBlob(row.wrapped)),
      grantPubkey: toBase64Url(fromBlob(row.pubkey)),
      alg: row.alg,
    }),
  );
}

/**
 * Change the password: replace the credential and re-seal its key slot.
 *
 * The old password is presented as its derived `authSecret` and checked here as
 * well as in the browser — the browser's check is real (a wrong password cannot
 * open the slot to re-wrap it) but it is the *browser's*, and an endpoint that
 * trusts the caller to have already verified itself is not an endpoint that
 * verifies anything.
 *
 * **Both writes are one batch.** The credential and its slot must move together
 * or the account becomes unopenable: a new auth hash beside an old slot means a
 * password that signs in and then cannot decrypt its own grant key, and the
 * reverse means a slot nothing can open. D1 batches are transactional, which is
 * the only reason this is safe to do at all.
 *
 * The salt is not touched, and that is load-bearing rather than lazy — the
 * recovery codes derive against it too. See `changePassword` in
 * `src/auth/flows.ts` for the full reasoning.
 *
 * `reset_at` is cleared: the operator reset that set it has now been answered by
 * the account's owner choosing a new password, so the notice on their account
 * page should stop.
 */
export async function changePassword(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);

  const presented = expectBytes(body.currentAuthSecret, AUTH_SECRET_BYTES, "Current password");
  const nextSecret = expectBytes(body.authSecret, AUTH_SECRET_BYTES, "New password");
  const slot = expectBytes(body.passwordSlot, WRAPPED_KEY_BYTES, "Key slot");
  const iterations = expectIterations(body.iterations);
  const alg = typeof body.slotAlg === "string" ? body.slotAlg : "";
  if (!alg) throw new BadRequest("Missing key slot algorithm.");
  if (alg.length > 64) throw new BadRequest("That key slot algorithm is not valid.");

  // A wrong current password is a failed authentication and is counted as one.
  const names = await buckets(request, env, account.handle.toLowerCase());
  await assertAttempt(env, names);

  const credential = await env.DB.prepare(
    "SELECT id, auth_hash FROM credentials WHERE account_id = ? AND kind = 'password'",
  )
    .bind(account.id)
    .first<{ id: string; auth_hash: unknown }>();
  if (!credential) throw new BadRequest("This account has no password to change.", 409);

  const hash = new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(presented)));
  if (!timingSafeEqual(hash, fromBlob(credential.auth_hash))) {
    throw new BadRequest("That is not your current password.", 401);
  }
  await recordSuccess(env, names);

  const nextHash = new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(nextSecret)));

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE credentials SET auth_hash = ?, kdf_iterations = ?, last_used_at = ? WHERE id = ?",
    ).bind(toBlob(nextHash), iterations, Date.now(), credential.id),
    env.DB.prepare(
      "UPDATE key_slots SET wrapped_grant_key = ?, alg = ? WHERE credential_id = ?",
    ).bind(toBlob(slot), alg, credential.id),
    env.DB.prepare("UPDATE accounts SET reset_at = NULL WHERE id = ?").bind(account.id),
    auditStatement(env, account.id, "auth.password.changed", null),
  ]);

  return json({ status: "changed" });
}

/**
 * Set a password **without presenting the current one** — the other half of
 * redeeming a recovery code, and the reason recovery is worth having at all.
 *
 * `changePassword` above cannot serve this: it demands the current password,
 * which is the one thing a person arriving by recovery code definitionally does
 * not have. Without this endpoint a redeemed code buys thirty minutes of session
 * and then the account is as locked as it was, one code poorer — which is why
 * the sign-in screen refused to offer recovery until this existed.
 *
 * **Authorisation is the ticket, not the session.** See `TokenPurpose` in
 * `./session`: a session says who you are, never how you proved it, so gating
 * here on the session alone would let a stolen cookie set a password and convert
 * this design's bounded thirty-minute exposure into permanent takeover. The
 * ticket is minted only inside `completeSignIn`, only on the recovery path, and
 * only once the last factor has passed.
 *
 * **The salt is reused, exactly as in `changePassword`,** and for the same
 * reason: the account's remaining recovery codes were derived against it, and
 * rolling it would silently kill every one of them at the moment their owner has
 * just proved they need them. The iteration count is free to move.
 *
 * The insert branch is not speculative. An operator password reset (§4) deletes
 * the password credential outright, so the account that most needs this endpoint
 * is precisely the one with no password row to update.
 */
export async function setPassword(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);

  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const claim = await session.verify(env.SESSION_SECRET, "set-password", ticket);
  const [ticketAccountId, redeemedCredentialId] = (claim?.subject ?? "").split(":");

  const closed = new BadRequest(
    "The window for setting a password has closed. Sign in with another recovery code to start again.",
    401,
  );

  // Bound to the account as well as verified, so a ticket cannot be carried from
  // one account's recovery into another's session.
  if (!claim || !redeemedCredentialId || ticketAccountId !== account.id) throw closed;

  // **And spent, not merely valid.** Verification proves the ticket was minted;
  // it cannot prove it has not already been used, because a signed token has no
  // memory. The key slot belonging to the recovery code that bought this ticket
  // is deleted by the batch below, so its continued existence *is* the unspent
  // marker — and checking it costs one query instead of a table.
  //
  // Without this the ticket replays for its full fifteen minutes: a caller who
  // holds the session could set the password repeatedly, which is the property
  // `TokenPurpose` in `./session` already claims ("a one-shot capability for the
  // next request") and did not have.
  const unspent = await env.DB.prepare(
    "SELECT 1 AS ok FROM key_slots WHERE credential_id = ? AND account_id = ?",
  )
    .bind(redeemedCredentialId, account.id)
    .first<{ ok: number }>();
  if (!unspent) throw closed;

  const nextSecret = expectBytes(body.authSecret, AUTH_SECRET_BYTES, "New password");
  const slot = expectBytes(body.passwordSlot, WRAPPED_KEY_BYTES, "Key slot");
  const iterations = expectIterations(body.iterations);
  const alg = typeof body.slotAlg === "string" ? body.slotAlg : "";
  if (!alg) throw new BadRequest("Missing key slot algorithm.");
  if (alg.length > 64) throw new BadRequest("That key slot algorithm is not valid.");

  const nextHash = new Uint8Array(await authHash(env.AUTH_PEPPER, toBase64Url(nextSecret)));
  const now = Date.now();

  const existing = await env.DB.prepare(
    "SELECT id FROM credentials WHERE account_id = ? AND kind = 'password'",
  )
    .bind(account.id)
    .first<{ id: string }>();

  // As in `changePassword`, the credential and its slot move together or not at
  // all: a new auth hash beside an old slot is a password that signs in and then
  // cannot open its own grant key.
  const statements = [];

  if (existing) {
    statements.push(
      env.DB.prepare(
        "UPDATE credentials SET auth_hash = ?, kdf_iterations = ?, last_used_at = ? WHERE id = ?",
      ).bind(toBlob(nextHash), iterations, now, existing.id),
      env.DB.prepare("UPDATE key_slots SET wrapped_grant_key = ?, alg = ? WHERE credential_id = ?")
        .bind(toBlob(slot), alg, existing.id),
    );
  } else {
    const saltRow = await env.DB.prepare(
      "SELECT kdf_salt AS salt FROM credentials WHERE account_id = ? AND kdf_salt IS NOT NULL LIMIT 1",
    )
      .bind(account.id)
      .first<{ salt: unknown }>();
    if (!saltRow?.salt) {
      throw new BadRequest("This account has no key-derivation salt to reuse.", 409);
    }

    const credentialId = newId();
    statements.push(
      env.DB.prepare(
        "INSERT INTO credentials (id, account_id, kind, label, created_at, last_used_at, auth_hash, kdf_salt, kdf_iterations) VALUES (?, ?, 'password', 'password', ?, ?, ?, ?, ?)",
      ).bind(
        credentialId,
        account.id,
        now,
        now,
        toBlob(nextHash),
        toBlob(fromBlob(saltRow.salt)),
        iterations,
      ),
      env.DB.prepare(
        "INSERT INTO key_slots (id, account_id, credential_id, wrapped_grant_key, alg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(newId(), account.id, credentialId, toBlob(slot), alg, now),
    );
  }

  statements.push(
    // A spent recovery code cannot sign in — `findCredentials` filters on
    // `used_at IS NULL` — so the slot it left behind is ciphertext nothing can
    // ever reach. `completeSignIn` keeps it deliberately, because until this
    // moment it was the only copy of the grant key the browser could still open.
    // That copy has now been re-sealed under the new password, so the dead one
    // goes.
    env.DB.prepare(
      "DELETE FROM key_slots WHERE credential_id IN (SELECT id FROM credentials WHERE account_id = ? AND kind = 'recovery' AND used_at IS NOT NULL)",
    ).bind(account.id),
    // The operator reset that set this, if any, has now been answered by the
    // owner choosing their own password. The notice on their account stops.
    env.DB.prepare("UPDATE accounts SET reset_at = NULL WHERE id = ?").bind(account.id),
    auditStatement(env, account.id, "auth.password.set", null),
  );

  /**
   * The UNIQUE violation is caught, because losing this race must not look like
   * a failure (2026-08-14 review).
   *
   * Two concurrent set-passwords on one ticket both find no existing password
   * row and both build an INSERT. A commits; B violates
   * `idx_credentials_one_password`, which is not a `BadRequest`, so `index.ts`
   * turns it into a generic 500 — on the screen that says "do not close this
   * page until it succeeds", for the person whose recovery code is already
   * spent. Retrying then fails differently: A's batch has already deleted the
   * redeemed credential's key slot, so the ticket check refuses and tells them
   * to burn a second of their ten codes. For an operation that *succeeded*.
   *
   * `signup` and `passkeys.register` already catch their own UNIQUE this way.
   * No privilege is involved — both requests are the same legitimate ticket
   * holder — so the honest answer is the one the winner got.
   */
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      return json({ status: "set" });
    }
    throw error;
  }

  return json({ status: "set" });
}

// Two-factor enrolment --------------------------------------------------------

/**
 * Begin enrolment: mint a secret, store it encrypted, and hand back the two
 * forms §4 requires — "the secret as a manual string and as an `otpauth://`
 * URI".
 *
 * Unconfirmed by design. `confirmed_at` stays null until a correct code proves
 * the user's app actually holds the same secret, so a mistyped enrolment locks
 * nobody out: an unconfirmed row is not consulted at sign-in.
 */
export async function totpEnrol(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  await requirePassword(request, env, account);

  const existing = await env.DB.prepare(
    "SELECT confirmed_at FROM totp WHERE account_id = ? AND confirmed_at IS NOT NULL",
  )
    .bind(account.id)
    .first();
  if (existing) throw new BadRequest("Two-factor is already set up on this account.", 409);

  const secret = newTotpSecret();
  const now = Date.now();

  // The upsert refuses to touch a *confirmed* row (the trailing WHERE): the
  // pre-check above races a concurrent `totpConfirm`, and without the guard
  // this could replace a confirmed enrolment's secret and wipe its backup
  // codes while `confirmed_at` stayed set — a silently broken second factor.
  // Zero changes means the conflict row was confirmed, which is the same 409.
  const wrote = await env.DB.prepare(
    "INSERT INTO totp (account_id, secret_enc, confirmed_at, backup_codes_hash, created_at, last_step) VALUES (?, ?, NULL, '[]', ?, NULL) ON CONFLICT (account_id) DO UPDATE SET secret_enc = excluded.secret_enc, created_at = excluded.created_at, backup_codes_hash = '[]', last_step = NULL WHERE totp.confirmed_at IS NULL",
  )
    .bind(account.id, toBlob(await encryptSecret(env.TOTP_ENC_KEY, secret)), now)
    .run();
  if ((wrote.meta?.changes ?? 0) === 0) {
    throw new BadRequest("Two-factor is already set up on this account.", 409);
  }

  // no-store: this response IS the shared secret — the one §9 says never
  // leaves the server except here, once, to be enrolled.
  return noStore(json({
    secret: base32Encode(secret),
    uri: otpauthUri(secret, account.handle, "mcclevarty.ca"),
  }));
}

/**
 * Confirm enrolment with a live code, and issue the ten single-use backup codes
 * §4 requires.
 *
 * The codes are returned exactly once, in plaintext, here. Only their hashes are
 * stored, so a user who loses them regenerates rather than recovers — which is
 * the correct behaviour and needs to be said on the screen that shows them.
 */
export async function totpConfirm(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  await assertPassword(request, env, account, body.authSecret);
  const code = typeof body.code === "string" ? body.code : "";

  const row = await env.DB.prepare("SELECT secret_enc, confirmed_at FROM totp WHERE account_id = ?")
    .bind(account.id)
    .first<{ secret_enc: unknown; confirmed_at: number | null }>();
  if (!row) throw new BadRequest("Start two-factor setup first.", 409);
  if (row.confirmed_at) throw new BadRequest("Two-factor is already set up on this account.", 409);

  const names = await buckets(request, env, `totp-enrol:${account.id}`);
  await assertAttempt(env, names);

  const secret = await decryptSecret(env.TOTP_ENC_KEY, fromBlob(row.secret_enc));
  const step = await verifyTotp(secret, code);
  if (step === null) {
    throw new BadRequest("That code is not right. Check your authenticator and try again.", 401);
  }
  await recordSuccess(env, names);

  const codes = Array.from({ length: TOTP_BACKUP_CODE_COUNT }, backupCode);
  const hashes = await Promise.all(
    codes.map(async (code) =>
      toBase64Url(await authHash(env.AUTH_PEPPER, code.replace(/-/g, ""))),
    ),
  );

  /**
   * `AND confirmed_at IS NULL`, and the zero-`changes` refusal, are the guard —
   * not the `row.confirmed_at` read above (2026-08-14 review).
   *
   * `totpEnrol` moved its guard into the write's WHERE in the 2026-08-13 pass;
   * its counterpart here was missed and stayed check-then-act. Two concurrent
   * confirms with the same valid code — a retried request, or any non-browser
   * client — both read `confirmed_at IS NULL`, both pass `verifyTotp` (this
   * route has no replay guard, unlike `signinTotp`), both generate **ten
   * distinct backup codes**, and both commit. The caller is shown request A's
   * ten; request B's hashes are what is stored. Every code the user writes down
   * is dead, and nothing anywhere reports it.
   *
   * The audit row is inside the same batch and therefore cannot record an
   * enrolment the guard declined.
   */
  const written = await env.DB.batch([
    env.DB.prepare(
      "UPDATE totp SET confirmed_at = ?, backup_codes_hash = ?, last_step = ? WHERE account_id = ? AND confirmed_at IS NULL",
    ).bind(Date.now(), JSON.stringify(hashes), step, account.id),
    auditStatement(env, account.id, "auth.totp.enrolled", null),
  ]);
  if (!written[0]?.meta?.changes) {
    throw new BadRequest("Two-factor is already set up on this account.", 409);
  }

  // no-store: the only plaintext appearance the backup codes ever make.
  return noStore(json({ backupCodes: codes }));
}

/**
 * A backup code: ten symbols in two groups, from an alphabet with no character
 * pair that can be misread. Distinct from the account recovery codes in
 * `src/auth/recoveryCodes.ts` — these get past the second factor, those unlock
 * the account and carry a key slot — so they are deliberately shorter, and a
 * user cannot mistake a long one for a short one.
 */
function backupCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let code = "";
  for (let i = 0; i < bytes.length; i += 1) {
    if (i === 5) code += "-";
    code += alphabet[bytes[i] & 31];
  }
  return code;
}
