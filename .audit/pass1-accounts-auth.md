# Pass 1 — Accounts & Authentication Audit

Scope reviewed in full: `worker/accounts.ts`, `worker/session.ts`, `worker/totp.ts`,
`worker/crypto.ts`, `worker/admin.ts`, `worker/rate-limit.ts`, `worker/webauthn.ts`,
`worker/passkeys.ts` (read in addition to the named slice because it is the route file
that actually implements most of the WebAuthn invariants the brief asks about — `webauthn.ts`
alone is only the CBOR/crypto verifier), `worker/encoding.ts` (read because `accounts.ts`/
`admin.ts` depend on its bounds-checking), `src/auth/*` (derive.ts, grantKey.ts, flows.ts,
recoveryCodes.ts, api.ts, passkeys.ts, encoding.ts, SessionContext.tsx), `src/hooks/useAccountRoutes.ts`,
`src/hooks/useOperatorRoutes.ts`, `design/SPEC-ACCOUNTS.md` (§3–§12), and `migrations/0001,
0002, 0008` (accounts/credentials/audit + both replay-guard migrations). Skimmed `worker/index.ts`'s
routing table and `crossOrigin`/`foreignOrigin`/CSP logic to confirm the account/admin routes are
wired the way the file-level comments claim, since a misrouted handler would silently defeat
everything reviewed below.

**Out of scope for this pass, not audited**: `worker/signal.ts`, `worker/machines.ts`,
`src/share/*` (the SDP-fingerprint check, agent-key pinning, and password-derived trust-root
logic the brief also names). Those aren't in the declared file list for this slice and belong
to the phase-2 sharing surface; flag for whichever pass covers `worker/machines.ts` /
`worker/signal.ts` if they aren't already assigned.

## Verified correct (mechanism-by-mechanism against the brief)

- **Admin write routes require `proven()` (password re-check), `listAccounts` exempt.**
  `worker/admin.ts` — `setOperator`, `resetTotp`, `resetPassword`, `deleteAccount` all start
  with `const { caller, body } = await proven(request, env)`, which calls `operator()` then
  `assertPassword`. `listAccounts` calls only `operator()`. Confirmed by reading every handler.
- **Downloads/publish password-on-release pattern** — not reviewed in depth (file out of my
  slice; `pages.ts`/`downloads.ts` weren't in the file list) but `src/auth/api.ts`'s comments
  and required-argument shapes (`adminDownloadMint`, `adminGrantAdd`, `adminFileDelete`, etc. all
  take `authSecret` as a required, non-optional parameter) are consistent with the described
  design. Recommend the downloads-slice pass verify `savePage`/`saveFile`'s transition-gated
  logic directly.
- **Rate-limit bucket keyed on IPv6 /64** — `worker/crypto.ts` `normaliseIp`/`expandIpv6`.
  Read the full implementation; the /64 truncation, the IPv4-mapped exclusion, and the
  unparseable-address fallback (key whole) are all correct as documented. No bug found.
- **`recordSuccess` resets account bucket, decays client bucket by 1** —
  `worker/accounts.ts` `recordSuccess`: `/succeed` on `names[0]` (client), `/reset` on the rest
  (account buckets). `RateLimiter.succeed` decrements `failures` by 1 without touching
  `blockedUntil`; `/reset` calls `storage.deleteAll()`. Matches spec exactly.
- **Check-and-reserve as one round trip; `challenge` exempt** — `assertAttempt` (`/attempt`)
  vs `assertAllowed` (`/check`). `signin`, `signinTotp`, `signup`, `changePassword`,
  `assertPassword` (and therefore every credential check) all use `assertAttempt`. Only
  `challenge` uses `assertAllowed`. `RateLimiter.attempt` reserves inside the Durable Object's
  single-threaded execution, closing the burst-bypass race. Confirmed correct.
- **`challenge`'s decoy** — reports `DEFAULT_ITERATIONS` (600,000) unconditionally on the
  no-such-account branch, matching the real branch's fallback when a password credential is
  gone. Salt-selecting subquery orders `password` first but falls back to any credential with
  a `kdf_salt` (i.e. a live recovery credential), exactly as documented — an operator-reset
  account without a password row still gets its real salt. Confirmed correct.
- **Recovery-code slot handed back and kept, not marked used until sign-in completes** —
  `completeSignIn`: `used_at` is set on the credential (spent) but the `key_slots` row for that
  credential is *not* deleted; it is only ever deleted later inside `setPassword`'s batch, after
  it has been re-wrapped. `signin`'s TOTP-required branch does **not** touch `used_at` at all —
  it is only stamped in `completeSignIn`, which only runs after `signinTotp` succeeds. Confirmed
  correct: a recovery code is not spent by an abandoned first-factor-only attempt.
- **Set-password ticket single-use, subject carries redeemed credential** —
  `setPassword` checks `SELECT 1 FROM key_slots WHERE credential_id = ? AND account_id = ?`
  where `credential_id` is the *redeemed recovery credential's* id (not the account). Since the
  same batch that succeeds deletes that credential's key slot (`DELETE FROM key_slots WHERE
  credential_id IN (SELECT id FROM credentials WHERE kind='recovery' AND used_at IS NOT NULL)`),
  a second call with the same ticket finds no matching `key_slots` row and is refused. Confirmed
  correct, and the UNIQUE-violation race (two concurrent `setPassword` calls on one ticket) is
  handled sanely (loser gets `{status:"set"}` rather than a 500, documented and correct).
- **Passkey sign-in has no TOTP stage; UV flag is the second factor** — `webauthn.ts`
  `requireVerifiedUser` refuses any assertion/registration missing `FLAG_UP` or `FLAG_UV`, called
  in both `verifyRegistration` and `verifyAssertion`. `passkeys.signIn` never touches
  `signinTotp`. Confirmed correct.
- **`prf`-less passkey gets no key slot** — `passkeys.register`: `hasSlot = body.slot !==
  undefined && body.slot !== null`; no `key_slots` row is inserted when absent. Confirmed.
- **Last-openable-slot refusal for passkey removal and admin password reset** —
  `passkeys.remove`'s `DELETE ... WHERE (NOT EXISTS slot) OR (EXISTS another openable slot)`
  and `admin.resetPassword`'s three-statement guard (`EXISTS (passkey OR unspent recovery)`)
  both live in the write's own WHERE clause, both exclude spent recovery credentials, and both
  are TOCTOU-safe (checked at the point of the conditional write, not pre-checked then acted on).
  Confirmed correct on inspection; matches migration/commentary.
- **WebAuthn challenge spent via conditional UPDATE, monotonic guard** —
  `passkeys.ts` `register` and `signIn` both do
  `WHERE (last_challenge_at IS NULL OR last_challenge_at < ?) AND (last_challenge IS NULL OR
  last_challenge <> ?)` bound to `claim.issuedAt` (from the signed token, not caller-supplied) and
  the challenge digest. This is genuinely monotonic (not an equality check), matching migration
  0008's stated fix for the alternating-replay bypass. Confirmed correct by re-deriving the logic
  independently rather than trusting the comment.
- **`MAX_PASSKEYS` bound** — `passkeys.register` refuses at `>= 20`, pre-read count (documented,
  accepted race that can overshoot by one row under concurrency — explicitly called out as the
  one acceptable race in the file, not a new finding).
- **Set-password re-wraps, never unwraps** — `src/auth/flows.ts` `setPassword` (inside
  `signInWithRecoveryCode`) calls `rewrapSlot(fromBase64Url(slot.wrappedGrantKey),
  derived.wrappingKey, next.wrappingKey)`. No `unwrapSlot` call anywhere in that path. Confirmed.
- **KDF iteration floor/cap refuse, never clamp** — `src/auth/derive.ts` `checkIterations` and
  `checkSalt` both `throw`, never adjust the value. Confirmed, and the accompanying salt-length
  check (`checkSalt`) is a good defense-in-depth addition beyond what the brief asked about.
- **NFKC normalization before PBKDF2** — `derive.ts` `pbkdf2`: `secret.normalize("NFKC")`
  before encoding. Applies to both password and recovery-code derivation (`deriveFromRecoveryCode`
  routes through the same `pbkdf2`). Confirmed.
- **`signout` resolves actor via subselect** — `accounts.ts` `signout`:
  `INSERT INTO audit (... actor_id ...) VALUES (?, (SELECT id FROM accounts WHERE id = ?), ...)`.
  Confirmed — a cookie naming a deleted account no longer 500s on sign-out.
- **Last-way-in guards live in the write's WHERE, not a pre-check** — verified for
  `passkeys.remove`, `admin.resetPassword`, `admin.setOperator`'s demotion (the `EXISTS` inside
  the conditional `UPDATE`), and `totpEnrol`'s upsert (`... WHERE totp.confirmed_at IS NULL`) and
  `totpConfirm`'s confirm (`UPDATE ... WHERE account_id = ? AND confirmed_at IS NULL`, with the
  zero-`changes` refusal actually enforced — I re-read this specifically because the comment flags
  it as a prior real bug, and the current code does have the guard in the WHERE, not just the
  pre-read). Confirmed correct on all four.
- **SQL injection** — every single query across all seven `.ts` files in this slice binds
  parameters via `.bind(...)`; I found no string-concatenated SQL anywhere in the reviewed files
  (including the dynamically-built guard clauses in `admin.ts`/`passkeys.ts`, which interpolate
  only static SQL fragments — the guard text itself, never a value — with all actual values still
  going through `.bind`). Clean.
- **Unbounded queries** — `listAccounts` is a single grouped query over the whole `accounts`
  table with no pagination; on the "no personal data, tiny operator-facing table" theory this is
  fine at any realistic scale for a single-operator site, but worth naming: it has no LIMIT and
  will eventually be O(n) per admin page load. Not a security bug, noting for completeness.

## Finding 1 — Signup's "handle taken" path double-counts against the signup rate-limit bucket

**File/line**: `worker/accounts.ts`, the `signup` function, specifically the block at
(original file) lines ~656–666:

```ts
const taken = await env.DB.prepare("SELECT 1 FROM accounts WHERE handle_lower = ?")
  .bind(handleLower)
  .first();
if (taken) {
  await recordFailure(env, names);
  throw new BadRequest("That handle is taken. Pick another.", 409);
}
```

**Mechanism**: `signup` begins with `await assertAttempt(env, names)` (line ~611), which
*reserves* one failure unit up front against both the `client:` bucket (50 free) and the
`signup:` bucket (12 free) — this is the whole point of `assertAttempt` over
`assertAllowed`+`recordFailure`, as the function's own comments explain at length, and as the
`catch` block around `env.DB.batch(statements)` further down gets right: that catch block
explicitly does **not** call `recordFailure` on the concurrent-duplicate-insert path, with the
comment *"No `recordFailure` here: `assertAttempt` above already reserved this attempt, and
counting it twice would halve the real allowance."*

The `if (taken)` branch — the ordinary, non-racy path that fires on every normal "that handle is
already registered" rejection — does not follow that same rule. It calls `recordFailure(env,
names)` in addition to the reservation `assertAttempt` already made, so a single "pick another
handle" rejection consumes **two** units of the `signup:` bucket's 12-attempt allowance (and two
of the `client:` bucket's 50) instead of one.

**Concrete impact**: `SIGNUP_FREE_ATTEMPTS` is deliberately sized to 12 "just above the e2e
harness, which legitimately creates eight accounts per run" and is explicitly described as
"nobody's honest afternoon at a keyboard." With this bug, an ordinary user who tries two or three
already-taken handles while picking a name burns 4–6 units instead of 2–3, and someone who tries
six taken handles in a row (plausible for a common first name on a site with existing accounts)
hits the 12-unit backoff and is locked out of creating an account from that address for 15+
minutes — exactly the "one honest afternoon" scenario the sizing comment says should not happen.
It also affects everyone sharing the same client bucket (the same household/NAT, per the
documented `CLIENT_FREE_ATTEMPTS` reasoning), so one person's handle-picking indecision can
degrade signups for others behind the same address twice as fast as intended.

This is not an attacker-exploitable escalation (it makes the bucket *stricter*, not looser — an
attacker trying to enumerate handles or mass-create accounts is only rate-limited *faster*), but
it is a genuine, demonstrable violation of the stated invariant ("assertAttempt already reserved
this attempt, counting it twice would halve the real allowance") in the one place that invariant
was not applied, sitting right next to the place where it explicitly was. It reads like a
regression left behind when the `assertAttempt`-based reservation was introduced for the
concurrent-duplicate case but the pre-existing `if (taken)` branch's `recordFailure` call was not
removed.

**Severity**: Low–Medium (availability/self-DoS bug affecting legitimate signups; not a
confidentiality or integrity issue, not privilege-escalating).

**Suggested check** (not implemented, per instructions not to fix): a gate that signs up with an
intentionally-taken handle N times from one synthetic client key and asserts the `signup:`
bucket's `remaining` count drops by exactly 1 per attempt, not 2, would have caught this the same
way the codebase's existing "counting it twice would halve the allowance" reasoning already
anticipates.

## Other observations, not rising to findings

- `worker/webauthn.ts`'s hand-rolled CBOR reader was checked for the classic "attacker declares
  a huge length, server loops/allocates" DoS shape. It is safe in practice only because every
  caller in `passkeys.ts` bounds the input via `expectBytesRange` (attestation object capped at
  8192 bytes, client data at 4096) before the reader ever sees it — the reader itself has no
  independent bound on array/map element counts beyond what `this.byte()`/`this.take()` throwing
  on buffer exhaustion provides. This is fine today because every call site bounds its input
  first, but the CBOR reader is not self-defending; if a future caller ever fed it an unbounded
  buffer, a length-26 (4-byte) array/map header could still only fail cheaply (first out-of-bytes
  read throws), so this is not currently exploitable — noting it only so a future change to the
  call sites doesn't quietly rely on the reader being safe on its own.
- `worker/accounts.ts` `expectIterations` bounds (100,000–5,000,000) and `src/auth/derive.ts`
  `checkIterations`'s hard cap (10,000,000) are inconsistent with each other in absolute terms,
  but every call site passes an appropriate floor (`DEFAULT_ITERATIONS` or `RECOVERY_ITERATIONS`)
  and the server independently enforces its own tighter bound at signup/changePassword/setPassword,
  so this is latent rather than live — worth tightening the client constant to match the server's
  5,000,000 ceiling only if someone is auditing for defense-in-depth consistency, not a bug today.
- `admin.ts`'s `target()` selects a narrower column set than the `AdminAccountRow` interface it
  returns claims to have (`passwords`, `passkeys`, `recovery_left`, `totp_confirmed` are
  undefined on the object it actually returns). None of the four admin write handlers read those
  fields, so this has no runtime effect — it's a type-accuracy nit, not a security issue.
- Timing side-channel review: `signin`'s no-such-account path deliberately performs an equal
  number of DB round trips and the same HMAC computation as the found path (confirmed by reading
  `lookupCredentials(env, "no-such-account", kind)`); `assertPassword`'s early return when there
  is no password credential row is not timing-matched against the "found but wrong" path, but
  every caller of `assertPassword` is already `requireAccount`-gated to the caller's own session,
  so this cannot be used as a cross-account oracle (the caller already knows their own
  credential state via `/api/me`). Not a finding.
- Confirmed no route anywhere in this slice returns another account's key material — `admin.ts`'s
  header comment claim was checked against all four handlers and holds.

## Summary

One verified, reproducible-by-inspection bug (Finding 1: double rate-limit counting on signup's
taken-handle path). Every other named mechanism in the brief's checklist was independently
re-derived from the current code (not merely matched against its own comments) and found to be
correctly implemented: admin `proven()` gating, IPv6 /64 bucketing, asymmetric
success/decay rate-limit handling, atomic check-and-reserve with `challenge` correctly exempted,
the iteration-count decoy, recovery-code slot handling and single-use ticket, TOTP/passkey
two-factor boundaries, `prf`-less passkey slot omission, last-openable-slot refusals (TOCTOU-safe),
the monotonic WebAuthn challenge-spend guard, `MAX_PASSKEYS`, re-wrap-never-unwrap, KDF
refuse-never-clamp, NFKC normalization, and the `signout` actor subselect. No SQL injection, no
unbounded queries of consequence, and no other TOCTOU pattern found beyond what the codebase's
own history already fixed and gated. SDP-fingerprint and agent-key-pinning mechanisms
(`worker/signal.ts`, `worker/machines.ts`, `src/share/*`) were not in this pass's file list and
were not audited — flag for the pass that owns phase-2 sharing.
