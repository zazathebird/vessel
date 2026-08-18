# Audit brief — mcclevarty.ca

Paste this whole file as the opening prompt. It is written to be handed to a fresh agent with no
memory of what came before.

---

You are auditing **mcclevarty.ca**, a live personal site for an independent computer-repair
operator. Repo: `/home/user/Downloads/claude/vessel-main`, branch `hud-pass`, which is what
production serves — **not `main`**, which is the Pages rollback and is far behind. React 18 + Vite +
TypeScript behind a Cloudflare Worker.

**Establish the ground rather than trusting this paragraph**: run `git status` (work is often in
flight), `git log origin/hud-pass..HEAD` for unpushed commits, and compare the served bundle hash
against a local build. An earlier version of this file asserted "everything is committed, pushed and
deployed" as a standing fact; it was a snapshot, and it was false the next time somebody read it.

**Use as many subagents and skills as the work needs — that is explicitly authorised, and it is the
single most important instruction here.** See *Why* below.

## Read first

1. **`CLAUDE.md`** — the invariants file. Binding. Many rules there look arbitrary and are load-bearing.
2. **`TODO.md`** — the ordered backlog and what was last done.
3. **`.claude/skills/verify-site/SKILL.md`** — six environment traps that will otherwise make you
   report the wrong thing. Read this before touching a browser. It is not optional and each trap has
   cost a session.
4. Run **`npm run check`** (~5s). It prints its own gate count and its own caveats. If it
   fails, that is your first finding.

## Why you should not trust what you read

On 2026-08-17 a long session fixed a great deal and also **shipped several confident, wrong
claims**. Every one was caught by an independent reviewer, never by the author:

- A QR encoder with three scanner-fatal bugs, one of which the author's own round-trip test could
  not detect **because the test shared the encoder's map**.
- A camera "fix" measured against `w = 190` when the real call site passes a fixed 700.
- An accessibility fix scoped so widely it silently overrode two commented decisions and left a
  layout *worse* protected than before.
- Claims in `CLAUDE.md` about contrast that were measurably wrong in both directions.
- An error message that could never have been announced, with a comment asserting that it was.

So: **treat assertive comments as claims to test, not as documentation.** Where a comment states a
measurement, re-measure it. The code is heavily annotated and the annotations are often the bug.

## What has already been audited — do not simply redo

- Security review of the branch: clean, no findings. The branch touches one Worker file by two lines.
- Correctness review of the canvas/effects layer: seven bugs, fixed.
- Two duel audits: fourteen bugs, fixed. The shipped gate re-checks fairness on every run and
  prints the figure it measured — read that rather than a number quoted here.
- WCAG 2.2 AA audit, then an independent verification of its fixes: three were incomplete and are now
  corrected.
- Copy read-through of every content page.
- All sixteen routes at 320/420/600/760/1280, zero overflow, zero console errors.

Extending or falsifying any of these is welcome. Repeating them verbatim is not the best use of you.

## What has never been verified — this is the valuable work

1. **The operator surfaces have never been seen by anyone.** The siteconfig panel, the door, the
   command palette, `/admin`, `/machines`, `/share`. They need a signed-in operator session. Their
   *wiring* was checked statically (the panel maps over live catalogue arrays), but nobody has looked
   at them. This is the largest hole.
2. **Whether the QR actually scans.** `src/auth/qr.ts` is a hand-written encoder — no library, by
   design. It has been validated against the ISO Reed-Solomon worked example, the published format
   constants, a capacity assertion and a round trip. It has never been read by a phone.
3. **Whether the duel *reads* well.** `requestAnimationFrame` is parked in this environment, so
   animation cannot be observed at all. Its correctness is measured by stepping it in Node; its
   quality is unknown.
4. **Whether any of it is beautiful.** No agent has judged the visual design as design.

## Live account state

`piratelife` is the operator: signed in, 9 recovery codes remaining, **no password currently set** —
recovery succeeded but the set-password step was never completed. The `set-password` ticket lives in
page memory and does not survive a reload or navigation, so it must be redeem → type → submit in one
go. TOTP enrolment (and therefore the QR) is gated behind having a password. A second operator
account was agreed and not yet created. Accounts can only be made through the website: key material
is derived in the browser, so a SQL-inserted row is unsignable.

## Rules that are decisions, not oversights

`CLAUDE.md` has the full list. The ones most often "fixed" by mistake: no city is ever named; the
email never appears in static markup; the guestbook has no form; the operator door is theatre; the
self-deprecating copy is the point; calm mode is a second full aesthetic, not a degraded one; no
third-party libraries; no image assets. Several palettes deliberately fail AA and calm is *not* the
remedy for that — see the corrected Accessibility section.

## How to work

- Delegate. Parallel agents with fresh contexts found nearly everything worth finding.
- Verify by running, not by reading. `./node_modules/.bin/esbuild --bundle X.ts --platform=node
  --outfile=/tmp/x.js && node /tmp/x.js` (`npx tsx` misbehaves here).
- Where a published constant or reference implementation exists, test against it rather than against
  your own re-derivation.
- **Ask whether your test can even detect the bug you are looking for.** That question is what the QR
  session failed to ask.
- If you fix something the checks missed, **add a check**. `scripts/check.ts`.
- Say plainly what you could not verify. "Verified" and "could not be observed here" are different
  claims and the client has called out the difference.
