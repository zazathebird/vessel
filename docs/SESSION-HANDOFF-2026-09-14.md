# Session handoff — 2026-09-14, the find-and-fix audit

**Read this first if you are a new session picking this up.** It exists because a long
find-and-fix sweep was paused mid-flight and the work must not live only in one session's
scrollback.

**The companion document is `docs/AUDIT-2026-09-14.md`** — that is the *what and why* (every finding,
what was fixed, what was deliberately not). **This file is the *state*: what is finished, what is
half-finished, and what to do next.** Read that one for reasoning, this one for position.

---

## The single most important thing to know

**The five subagents that did most of this work are GONE.** In-process agents do not survive a
session reset. Their edits are on disk and committed; their context is not recoverable. Nothing
below can be "resumed" by messaging an agent — it has to be picked up from this file.

Where an agent's work is incomplete, the "next step" line is the whole inheritance. Treat those
lines as the spec.

## State at the pause

- `npm run typecheck` — **clean**, app and worker, verified at the moment of the pause.
- `npm run check` — **86** green as of the last full run before the final round of edits.
  **Re-run it before trusting it**; five agents edited after that, including `scripts/check.ts`.
- `npm run test:auth` — **409** green, same caveat, and see the rate-limit note below.
- Working tree: ~65 files changed, all committed at the pause. Nothing is stashed.

### Two gotchas that will waste your time if you do not know them

1. **`wrangler dev` serves `/` as 404 after a rebuild.** The asset manifest goes stale. Kill it,
   `npm run build`, start it again. This cost this session twice.
2. **The rate-limit tests 429 from accumulated state.** Driving the auth routes repeatedly fills
   the Durable Object buckets, and the signup allowance (12) is sized only just above one harness
   run. Symptom: `a fabricated code is refused — status 429`. Cure: stop wrangler,
   `rm -rf .wrangler/state/v3/do`, restart, re-run. This is **not** a regression, and this session
   briefly mistook it for one.
3. There is a **second, pre-existing flaky gate**: `duel: fairness, reachability, stability`
   (`check.ts` ~1486) fails on side bias at ~3σ on roughly 2 runs in 5. **It will fail
   `predeploy` at random.** It is not caused by any of this work — see "In flight" below.

## What is finished and verified

All of this is committed, and `docs/AUDIT-2026-09-14.md` carries the full reasoning for each.
The security-shaped ones were **break-verified** — the test was watched failing against the old
code before the new code was believed.

- **The lockout** — an anonymous stranger could block the operator out of every password-proven
  route (publish, all admin writes, the six release-gated downloads routes, TOTP, passkeys,
  pairing) at ~6 requests/hour, *while signed in, including with a passkey*. `signin` and
  `assertPassword` shared a bucket name; they no longer do. Break-verified both directions.
- **The rate limiter's refund** did not lift the block it was refunding, so a correct password
  right at the allowance locked the caller out for the rest of the window.
- **`opened()`** returned an entry that could never open, which satisfied `claim`'s emptiness
  guard — so a code redeemed, burned a use, and handed back a ticket that 403s. The same fix
  closed `AUDIT-FINDINGS.md` #13 (never-uploaded files). Two new e2e assertions cover it, and the
  existing fixture was made realistic — it had been asserting the bug.
- **A lone-surrogate filename** saved cleanly then 500'd on every click, for ever.
- **`REACH`** was indexed without an own-property guard, silently skipping the release password.
- **Trailing slashes** minted an unbounded family of self-canonicalising indexable pages.
- **Live download codes and grants** could become permanently unrevokable past 200 rows.
- **Three HIGH script bugs**: a Windows prefix blocklist entry left `~/.ssh`, `.aws`, `.gnupg`,
  `.docker`, `.kube` *themselves* shareable; a symlinked `$HOME` defeated every `$HOME`-derived
  entry on Linux and macOS; and the kiosk URL allowlist could be turned into `["*"]` via a
  multi-line host that produced **valid** JSON.
- **The flaky health-bar gate** — the *gate* was wrong, not the renderer. Misattribution by
  coordinate when both fighters clamp to the same arena wall. 2.5% of runs → 0/400. Fixed by
  draw-order attribution, explicitly **not** by exempting airborne fighters.
- Plus the browser half: the operator's hero ornament never changing for a whole session, the
  downloads index not resetting scroll, back/forward playing no transition and destroying the
  forward entry, share codes repairing instead of refusing, Shift+Arrow paging the site, focus
  return not gated on the top trap, the agent-key prompt having no accessible name, a live region
  wrapping a 2,000-row table, and the blob download racing its own revoke.

## In flight when paused — per agent

> Each agent was asked for a completion report before stopping. **Their reports are appended at the
> bottom of this file.** Read those before touching the corresponding files; they carry the
> "exact next step" lines.

1. **Duel / gates** — was on three things: (a) the **second flaky gate**
   (`duel: fairness, reachability, stability`), (b) the **pin half** of the background duel (a pin
   change still never reaches a running fight; needs a `pin` field on `DuelState` so
   `advanceDuel`'s match-boundary re-roll can honour it), (c) retiring the stale `TODO.md` entry
   that still calls the health-bar gate unchased. **This agent owns `scripts/check.ts`.**
   *On (a), the standing instruction was: do not fix it by raising the threshold until it stops
   failing. Establish whether the director is genuinely side-biased or whether the gate's
   statistic assumes an independence that ~120 correlated matches do not have. Those are
   different bugs.*
2. **Worker hardening round 2** — 14 items including migration `0009` (case-insensitive unique
   indexes for machines/setups), `deleteAccount` not hanging up signalling sockets, an uncapped
   browser-socket role, the `role=agent` comment that will be trusted when phase 3 widens the
   gate, a re-completable recovery ticket, a 6× iteration-floor mismatch, and `gate()` debiting
   earlier buckets for attempts a later bucket refuses. **Check migration 0009's state carefully —
   a half-applied migration is the worst thing in this handoff.**
3. **Bundle split** — ~29% of the 512KB bundle is code an anonymous visitor can never run.
   Introduced `src/components/Lazy.tsx`. **Verify the site actually works before trusting this**:
   a partially-applied code-split builds fine and throws at runtime. It was explicitly permitted
   to skip the duel half if it could not be done safely.
4. **Assets & hygiene** — photo re-encode (measured 64% available), wrangler bump to clear
   `npm audit`, and two comments that state things the code does not do. **Confirm the photo
   originals were preserved and that `docs/PHOTOS.md` matches what is on disk.**
5. **Setup-code lookalikes** — combining marks (`\p{Mn}`) and the 40-codepoints-vs-40-UTF-16-units
   truncation mismatch. *On the first: the instruction was to MEASURE in a browser before acting,
   because folding a mark that renders visibly would refuse honest codes — the outage this
   pipeline's carve-out reasoning exists to prevent.*

## The biggest thing NOT started

**The gates.** The fix crews wrote roughly **forty gate specs** and only four were implemented
(82 → 86). They are in `docs/AUDIT-2026-09-14.md` and in the agents' reports. This is the highest
-value remaining work, because this codebase's own rule is *when you fix a bug that got past the
checks, add a check* — and today three of the worst bugs sat behind gates that were **green
throughout**:

1. The **Windows blocklist gate reads the entry arrays as text** and never calls
   `Test-ShareableFolder`. That is why a prefix entry that did not block its own directory sat
   there with two gates passing.
2. **Nothing gates the deploy shape** — no check mentions `_redirects`, `_headers`,
   `rollupOptions`, `fxlab`, `sitelab` or `run_worker_first`. Audit item 39's fix exists only as a
   comment in `wrangler.toml`; re-adding a negation passes every check.
3. **Nothing gates `src/hooks` at all** — and three of today's findings were in there.

A gate that reads the source tests the source's *shape*, not its behaviour. Where a gate can
execute the thing, it must, and it has to be break-verified: if it does not fail when you revert
the fix, it is not a gate yet.

## Deliberately left for the client — do NOT decide these

- **`beginUpload` can dark a live download without the password** (`TODO.md` *Needs the client* 3).
- **Sessions survive a password change and an operator reset** (item 2) — a §9 inventory change.
- The **four duel sliders**, the **eight copy facts**, and whether `/work`'s case studies and the
  guestbook quotes are real. That last one matters most: a fabricated case study is evidence of
  capability that has to go.

## Not deployed

Live is Worker `38ceae8d` (rollback `df6dba2a`). `main` is **ahead of production** and none of
today's work is deployed. **Do not deploy from this state** — `predeploy` runs the full check, and
the fairness gate above will fail it at random. Settle that first.

---

## Agent reports

*(Appended verbatim as each agent reported at the pause. If a section is missing, that agent did
not report before the session ended — treat its files as unverified and read the diff.)*
