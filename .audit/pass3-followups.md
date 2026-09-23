# Pass 3 — following up the loose threads Pass 2 left open

Read-only. No files changed except this one. Pass 3's job (per `AUDIT-FINDINGS.md`'s plan) is a
gate-coverage / cross-cutting pass: resolve the "not independently verified" / "flag for whoever
audits X" items the four Pass 2 files left dangling, and sweep for siblings of confirmed bug
classes rather than treating each finding as isolated.

## 1. `worker/machines.ts` has the identical case-collision race `pass2-worker-css.md` Finding 2
flagged for `worker/setups.ts`, plus a second, worse gap of its own

`pass2-worker-css.md`'s Finding 2 explicitly deferred this: *"The identical shape exists in the
out-of-scope `worker/machines.ts`... Whoever covers `machines.ts` should check `rename`'s handler
for the same gap."* Confirmed by reading `worker/machines.ts` and `migrations/0004_phase2_machines.sql`
directly.

**Same root cause.** `idx_machines_owner_name` (`migrations/0004_phase2_machines.sql:37`) is
declared with no `COLLATE NOCASE`, so it is SQLite's default `BINARY` collation — exactly the
`idx_setups_name` shape. Both `pair()` (worker/machines.ts:172-176) and `rename()`
(worker/machines.ts:260-264) check for a duplicate with `... AND name = ? COLLATE NOCASE`, then
fall through to a write that only the binary index actually enforces. Two concurrent `pair()`
calls (or a `pair()` racing a `rename()`) naming case-variant strings — `"Laptop"` and `"laptop"`
— both pass the NOCASE duplicate check (neither sees the other yet) and both succeed, leaving two
rows the application's own list/lookup logic treats as one name having been silently duplicated.
The migration's own comment (`migrations/0004_phase2_machines.sql:35-36`) makes the same
overstated claim `pass2-worker-css.md` found in `setups`' migration: *"the handler checks
case-insensitively (like setups) and this backstops the race."* It does not, for the same reason:
`COLLATE NOCASE` in the query does not change the collation the index itself was built with.

**A second, worse gap unique to `machines.ts`**: `pair()` at least wraps its `INSERT` in a
`try/catch` that converts a `UNIQUE`/`constraint` error into the friendly `"A machine already has
that name. Pick another."` 409 (worker/machines.ts:180-192) — so an exact-string race (two
concurrent pairs of the literal same name) is handled gracefully even though the index itself is
what catches it. `rename()` has **no such guard**:

```ts
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
```

The final `UPDATE` is bare — no `try/catch`, no `ON CONFLICT`. So even the *exact-string* race
`pair()` handles gracefully is, in `rename()`, an unhandled D1 constraint-violation exception: two
concurrent renames of two different machines to the identical literal name (not just a case
variant) will have one succeed and the other throw past this function with no catch, surfacing as
an unhandled error (a raw 500, per this codebase's general error-handling shape) rather than the
same 409 `pair()` gives for the identical scenario. `rename()` is strictly worse than `pair()` for
the same input, in the same file, immediately below it.

**Severity**: Low–Medium — same data-integrity class as `pass2-worker-css.md` Finding 2 (a
cosmetic duplicate-name row, not a security or cross-account issue, bounded by `MACHINES_MAX`),
plus a Low code-quality gap (an unhandled exception path where a sibling function three lines
above shows the correct pattern).

**Suggested check** (not implemented, per instructions not to fix): the same shape Pass 2 already
suggested for `setups.ts` — two genuinely concurrent calls (`Promise.all`) differing only by case,
asserting exactly one row survives — run against both `pair()` and `rename()`; separately, a test
that races two `rename()` calls to the exact same literal string and asserts a 409 rather than an
unhandled exception.

## 2. `pass2-fx-setup.md` Finding 2 (label-truncation unit mismatch) is confirmed against the real decoder, not just the scripts' own comment

`pass2-fx-setup.md` flagged this as "not independently verified" because the decoder was outside
its file list: *"Whether the site's decoder... actually enforces a 40-UTF-16-unit label cap... is
not in this pass's file list and was not independently read to confirm."*

Read `src/share/setupCode.ts` directly. `MAX_LABEL = 40` (line 31), and the bound is applied in
`str()`:

```ts
function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  ...
}
```

`value.length` on a JS/TS string is genuinely UTF-16 code units (a non-BMP character counts as 2),
confirming the setup scripts' own comment was correct about what it was worried about, and
confirming Pass 2's finding is a real, reachable gap rather than a hypothetical: `decodeSetupCode`
really does refuse (returns `null`, refuse-never-repair) a label over 40 UTF-16 units, and the
macOS/Linux setup scripts really do let a label with 21+ non-BMP characters through their own
40-**codepoint** check untouched. No new finding — this upgrades Pass 2 Finding 23 (the numbering
in `AUDIT-FINDINGS.md`) from "plausible, unverified assumption" to "confirmed against the actual
consuming code."

## 3. Sweep for siblings of the `COLLATE NOCASE`-over-binary-index bug class

Grepped every `COLLATE NOCASE` use in `worker/` (6 hits, all in `setups.ts`/`machines.ts`) against
every `CREATE UNIQUE INDEX` in `migrations/` (6 hits total). Two are the confirmed bug
(`idx_setups_name`, `idx_machines_owner_name` — both bare, no collation). The other four are clean
by construction rather than by a runtime `COLLATE NOCASE` check: `idx_accounts_handle_lower` is
built on a **precomputed** lowercase column (`handle_lower`), so the index itself is
case-normalising and there is no NOCASE/BINARY mismatch to have; `idx_credentials_passkey`,
`idx_credentials_one_password` and `idx_key_slots_credential` are all keyed on
opaque ids/foreign keys, not human-typed names, so case sensitivity is a non-question for them.
`worker/machines.ts`'s `driveAdd` has no uniqueness check or unique index on drive labels at all
(confirmed by reading it in full) — not a version of this bug, just no uniqueness guarantee
exists there in either direction. **The bug class is exactly two instances, both now identified;
no third sibling exists in the current schema.**

## 4. Gate-coverage confirmation for the highest-severity Pass 1/2 findings

Re-grepped `scripts/check.ts` directly (not trusting the individual pass files' own "no gate"
claims) for the five most severe confirmed findings across both passes:

| Finding | Grep | Result |
|---|---|---|
| Pass 2 sharing #1 (pin-before-verify) | `savePin`, `keyChanged`, `pinVerdict` | Zero hits — no gate touches `MachinesPage.tsx`'s pin logic at all. |
| Pass 2 downloads #1 (unfinished-upload code redemption) | `uploaded_at`, `opened(` | `uploaded_at` appears only in application code, never in `check.ts`. No gate. |
| Pass 2 downloads #3 (sortFiles free-vs-unpriced) | `sortFiles` | One hit — the existing gate `pass2-downloads.md` already identified as not constructing a `free: true` case. Confirmed: it builds a fixture list with a `price: 0` file named `"free-ish"` and never sets `free: true` anywhere in the fixture. |
| Pass 1 duel #1 (`duel-bench.template.html` 0.2 floor) | `duel-bench` | Zero hits, confirming Pass 1's own claim. |
| Pass 1 config #1 (`DEFAULT_DUEL_SETTINGS.tuning` shallow freeze) | `isFrozen`, `Object.freeze` | `check.ts` never calls `Object.isFrozen` on the nested `tuning` object — only asserts the top-level object throws on mutation (confirmed by reading the existing gate: it tries `DEFAULT_DUEL_SETTINGS.rim = ...` and expects a throw, never touches `.tuning.circling`). |

All five are confirmed ungated, independently of the originating pass's own claim — none of them
would be caught by `npm run check` today.

## 5. Baseline re-confirmation

Re-ran `npm run check` after all of Pass 2's file additions (`.audit/pass2-*.md` are untracked
Markdown, outside anything the suite reads): **80 checks passed**, same as the count noted at the
top of `AUDIT-FINDINGS.md`, with the same six-item "still needs a person" list. No regression from
having four more read-only audit files sitting in `.audit/`.

One thing worth recording rather than treating as a finding: a first run of `npm run check` earlier
in this session (before Pass 2's agents were launched) reported the `LOOK_FILES` parity and
closed-set gates as genuinely run (`"8 files, identical in both repositories"`,
`"18 looks, 17 accents, 17 photographed, all agree"`), because `~/Downloads/claude/debian/` existed
and was checked out at commit `61d33b7` at that time (this is `vessel-main-bf`'s sibling repo, being
actively worked on in parallel — see the cross-session coordination earlier in this transcript). A
second run just now, minutes later, reports both as **"NOT RUN — no ../debian"** — the directory is
currently absent from the filesystem entirely. This is exactly the behaviour CLAUDE.md documents as
correct (*"when this repository is not checked out beside it, it names itself under 'could not be
run' rather than passing quietly"*) — the gate did not silently pass, it correctly noticed the
sibling's absence and said so. **Not filed as a bug**: the other session doing this work is a
different, independent repository under active development by a peer session, not something this
audit's scope covers, and its transient absence (a rename, a worktree operation, a rebuild in
progress) is expected mid-edit. Flagged here only so a later re-run of `npm run check` that shows a
different LOOK_FILES result than this file states is understood, not mistaken for a regression in
`vessel-main` itself.

## Summary

One new finding (§1: `machines.ts` shares `setups.ts`'s case-collision race, plus a worse
unhandled-exception gap unique to `rename()`), one existing finding upgraded from
unverified-assumption to confirmed-against-source (§2), a completed sweep proving the
`COLLATE NOCASE`/binary-index bug class has exactly two instances and no undiscovered third (§3),
and gate-coverage confirmed by direct grep (not trusted from the originating passes' own claims)
for the five most severe findings so far — all five are genuinely ungated (§4). Baseline
`npm run check` unaffected at 80/80 (§5).
