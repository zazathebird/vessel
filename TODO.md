# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are, and `docs/DECISIONS.md` records what was decided when; this file is only
what is left to do.

---

## 2026-08-31 — the rest of the defect list

`npm run check` is **66 green**, up from 62. Yesterday's pass fixed what was reported and
reproduced; this one clears everything the three audits found and nobody had acted on.
`docs/DECISIONS.md` has the account. **Still not deployed.**

Ten more, and the two that matter: **the four pacing sliders did not move the editor's own preview
when a page was selected** (the surface item 2 below is meant to be done on), and **a display faster
than 300Hz ran the whole site's motion fast** — an undocumented `Math.max(0.2, …)` floor that
reintroduced the exact fault its own neighbouring comment says the clamp prevents. Also: a pinned
pairing was never checked for alignment, so a published pin could put good against good;
`circling: 0` picked deterministically; `buildSequence` dropped `b.quick`; the shared default config
object was mutable; a dead `DuelState.prev`; and the published-key gate asked about two keys by name
instead of comparing the two lists.

**Two more gates passed while the fix was reverted** and had to be rewritten — that is four across
the two days. The tell in both cases was a gate measuring the general case and calling it the corner.
`CLAUDE.md`'s checks section now says this out loud: if a new gate does not fail when you break the
fix, it is not a gate yet.

### Next, in order

1. **Get the client's numbers off the four sliders.** The only item that needs him, and the sliders
   are worth more than they were two days ago: **Size works**, `rest` is a real multiplier rather
   than one that was being clamped away, and **the preview now responds when a page is selected**,
   which it did not.
2. ~~**Deploy.**~~ **Done 2026-09-02** — commit `05b9f34`, Worker version `90e3cbce`, the full
   66-check gate as predeploy. Verified in the shipped bundle (not the repo): the live
   `/assets/index-07sgLn1h.js` carries the guardrail notice strings. The three native binaries
   note still applies to any machine that has never installed.
3. ~~**Look at the panel's guardrail notice.**~~ **Done 2026-09-02** — driven signed in (fresh
   local operator), judged tripped (Peat+grain resolved, Ledger+Plasma warning), untripped, and in
   calm. The structure, ordering, copy and count all hold; the one change made is the resolved
   marker, `·` → `✓` — a middot opening a paragraph read as stray punctuation, not as "already
   handled". The ▲ is quiet on Peat because Peat is one of the three known-weak danger palettes
   (4.25:1), which is the recorded position, not a defect. `effectiveGrain` confirmed in the live
   DOM: grain chip on + Peat = no `has-grain` on the wrapper.
4. ~~`c.lean` and `c.speed` on `CostumeCtx`~~ **Deleted 2026-09-02**, the three-file edit as
   documented. One finding: `speed` was only dead *as a field* — the local in `drawFighter` drives
   the stride swing and stays (the first delete took it and the health-bar gate caught it, which is
   that gate earning its keep). `c.hx` **is** a trap and is still documented loudly.
5. **The Nosferatu is the tightest costume on the roster at exactly 34 units sideways**, against a
   limit of 34 — zero margin. It measured 21 until the costume gate started sweeping the off hand on
   2026-08-31; the reach was always there, in the `force` and `thrown` poses the gate had never
   driven. It is inside its rule, so it was left alone rather than churned, but it is the one costume
   where widening anything at all fails the gate. (The Viking was 36.9 in the same sweep — over — and
   was fixed to 32.)
6. The director's clock advances before it dispatches, so beats at `at: 0` and `at: 1` fire together.
   Unreachable today and deliberately not "fixed" — moving the increment re-bases every beat in the
   pool against the move table. **If a module ever needs that offset, give it `at: 2`.**

## 2026-08-30 — the fights, gone over end to end

`npm run check` is **62 green**, up from 52. Eleven defects, four of them the same shape: **a control
that appears to work while the thing it names does not move.** `docs/DECISIONS.md` has the full
account with the measurements; `CLAUDE.md` has the invariants that came out of it. Nothing is
deployed — see *Next* below.

**Items 0, 1 and 6 below are closed.** Item 2 still needs the client and nothing else does.

### The environment could not run its own tooling, which is why item 1 had never been done

`node_modules` had three **empty** native-binary directories — `@cloudflare/workerd-linux-64`,
wrangler's nested `@esbuild/linux-x64`, and the top-level `@esbuild/linux-x64`. So `npm run dev:worker`
could not start and `npm run build` could not run, and therefore **no operator surface had ever been
driven in a browser here**: `/admin` needs a session, a session needs the Worker, the Worker needs
`workerd`. `npm run check` never noticed, because it runs under esbuild's JS API rather than the
binary. Restored by fetching the three tarballs directly. **If a fresh clone cannot start the Worker,
check for empty `bin/` directories before anything else.**

### What was wrong

- **`rest: 1` was not arithmetic identity** and had not been since the knobs landed. Four modules roll
  a length shorter than their last move's end; the floor threw that roll away, undoing `disengage`'s
  and `pushed`'s subtraction *entirely* on 100% of builds. Now 0 differences in 700,000 builds.
- **The health bar was drawn through the costumes** — through the ringmaster's top hat and across the
  prophet's halo — and had been drawn partly *outside the camera's frame* for six of them since
  `headroom` was introduced.
- **The published Size slider moved nothing.** It was multiplied only in the operator's own preview.
- **A per-page override was not partial to the knob**: touching Patience on `/work` froze the other
  three. Reproduced and re-verified signed in, which is the only place it is visible.
- **`validDuelPages` repaired where the file promises it refuses**, turning rubbish into a working
  override pinned to the default.
- **The operator's shuffle button and mode picker could never roll him a duel** — a stale closure over
  `isOperator`, which is false until the session probe settles.
- **The crouch ran on another move's clock**, so `sweep_low` stood upright while its blade was still
  down.
- **Five fields showed through a match reset**, `clash` visibly.
- **A non-finite delta killed the fight permanently and silently.**
- **The duel was bigger on a phone than on a tablet**, and 190px at the bottom of the tablet band.
- **The guardrail layer's 2026-08-28 entry was not true**: `resolve()` and `matched()` had no callers
  in `src/`, so grain still rendered on the four lowest-contrast palettes and no guardrail note was
  ever shown.

### Item 0 answered: two fighters did read as one, and not the pair that was predicted

Rendered the roster at the *corrected* phone size, then the candidates in a real 281px slot. The guess
here was executioner/sentinel; the worst is **gunslinger / ringmaster** — both a brim, a boxy crown
and a long coat, `back` hooks node-for-node the same path, separated only by crown height. The client
chose `NEVER_MEET` over redrawing. Three pairs are in it: gunslinger/ringmaster,
sentinel/executioner, executioner/viking.

Four costume faults were fixed while the roster was open: the **viking's shield** covered 60% of the
torso box at 60% alpha and reached 36.9 units sideways (both invisible to a gate that pinned the off
hand — now swept), the **devil's** and **anubis's** paired head marks were drawn far-bright-last so
the depth was inverted, the **anubis's** ears sat 1.04 units apart and flooded with `paper`, and the
**valkyrie's** wings still overlapped by 8 units.

### Next, in order

0. ~~**Look at the twenty-four fighters on a phone.**~~ **Done 2026-08-30** — see above.
1. ~~**Drive the duel settings editor in a real signed-in browser.**~~ **Done 2026-08-30.** It found
   the partial-override bug, and the per-page check it asked for (*"set one page, load another, and
   confirm it did not follow"*) now passes: `/work` keeps its own Patience while tracking the site's
   Circling and Rest, and `/about` follows the site.
2. **Get the client's numbers off the sliders.** Unchanged, and now the only item that needs him. The
   pacing fix is the same work whatever the fighters look like, and his eye is the one thing that
   cannot be substituted for. Note the sliders are worth more than they were: **Size actually works
   now**, and `rest` is a real multiplier rather than one that was being clamped away.
3. **Deploy.** Nothing from 2026-08-30 is deployed. `npm run deploy` runs the full gate as
   `predeploy`; the three restored binaries are `node_modules` and are not committed, so a machine
   that has never installed will need them.
4. **The panel's guardrail notice** is built — it prints every matched note above Publish, with the
   two resolved rules marked as already handled. It has **not been looked at by eye**; it is an
   operator surface and this session verified it only by gate.
5. `c.lean` and `c.speed` on `CostumeCtx` are read by no costume and cannot be deleted from
   `fighters.ts` alone — they are written by typed literals in `duel.ts` and `check.ts`, so it is a
   three-file edit. Documented in place, no trap, no hurry. `c.hx` **is** a trap and is now documented
   loudly: the `head` hook runs inside `translate(neckX, 0)` and `hx` *is* `neckX`, so the first head
   costume to use it as documented gets double the lean.

---

## 2026-08-28 — guardrails reach the page, and the duel becomes reviewable

`npm run check` is **52 green**, up from 46. Deployed today: `75ef788` (the carve, and the roster
down to twenty-four), `c5e9899` (a stale header here), `c5c72f3` (the duel becomes a published
per-page setting), and the share-code decision below — on top of yesterday's `7a39870` and `5bbc7cc`.
Every one verified by pulling the live bundle and grepping it, not by trusting the repo.
**The operator-only duel lock and everything after it landed later and is in none of that list** —
the 51st gate is the duel lock's and the 52nd is the phone menu's; `docs/DECISIONS.md` has both
entries.

### Every page is reachable on a phone now, and the fix was one word

Reported as *"the downloads page isnt showing in the menu in mobile"*. Confirmed with him that the
real complaint was the footer links being unfindable on a phone, not Downloads missing from the
header. Measured at 390×844: `.v-footer` sits at **y = 2873 in an 844px viewport**, so all five
`FOOTER_NAV` pages and the sign-in link are ~2,000px below the fold. The non-desk palette chip said
`cmd` and says **`menu`** now — the palette already offered `[...NAV, ...FOOTER_NAV]` and already
listed everything on an empty query, so what was missing was a reason to tap. **An eighth header
pill was refused**: `NAV` drives arrow-key paging and Radial's orbit, and the pill would have landed
in the hidden tail of a scroller. Gated (*"every page is reachable off the desk"*, the 52nd) and
verified by breaking it twice.

### What can be seen now that could not be

Plasma and Pressure were measured near-invisible and are brighter — peak **22 → 42** and **16 → 27**.
The duels get a **281px** phone slot instead of ~60px, which is what makes item 0 below answerable at
all. Sonar's contact blips have a 7px floor instead of 5px, the floor being the whole of the
small-screen behaviour. `duelholy` is withdrawn as an effect, matching the ornament a day late.
**None of this is gateable** — `npm run check` has no rasteriser, so visibility is measured offline
with `scripts/fx-shot.mjs`, and the numbers in `docs/DECISIONS.md` are the baseline to compare
against.

### The duels are operator-only now, and they roll for him

Client: *"lets make it so that the lightsaber duels are off by default, until unlocked by me. and
once i log in, they are random."* Both duels are locked in both catalogues — the hero ornament **and**
the full-screen background effect — and a visitor gets `DEFAULT_ORNAMENT` / `FALLBACK_FX` instead.
**The lock is enforced where the thing is drawn, never at the storage end**, so his published config
keeps saying `duel` while he is signed out rather than rewriting itself. Signed in, the ornament
rolls fresh every page load from his own pool (the duel and sonar), as **component state that is
never patched into `config`** — and it yields the moment he picks an ornament himself.
`docs/DECISIONS.md` carries the picker-versus-page distinction, the gate and the browser numbers.

### First, the thing to say out loud: the 2026-08-27 duel fixes ARE live

The client re-reported all three faults verbatim. They are fixed and shipped — verified in
production, not in the repo. The published config still reads `layout: "split"`,
`station: "roam"`, `mode: "page"`, and the page rendered `layout-cinematic … station-opposite`:
the roll fired on load and `effectiveStation` bit. Both pools are the full roster in the shipped bundle —
**twenty-four since `75ef788`**, verified by pulling the live bundle and grepping it for all eight new
ids and all twenty-four deleted ones. **If he still sees it, he is on a cached bundle** — the answer is a hard reload,
not a fix. Check production before re-fixing anything he re-reports.

### Guardrails now reach the page, not only the dice

`isAllowed` had two callers, the randomiser and the check suite. Publishing from the panel,
pasting a share code and restoring stored config walked past all seventeen rules. Two are now
resolved at render and fifteen are surfaced to the operator instead; the split is in `CLAUDE.md`
deviation 1 and the short version is **a rule is resolved when it is an accessibility floor with
an obvious direction of yield, and otherwise it is the client's taste and his to overrule — but
never unknowingly.**

- `effectiveGrain` joins `effectiveStation`. Grain is a 14% `--fg` overlay across every word on
  the page and was publishable by hand onto the four low-contrast palettes.
- The grain rule moved **into** `GUARDRAILS`; as a special case inside `isAllowed` it could not be
  named, so no enumeration of the rules could include it.
- Every guardrail now carries a required `note`, and `combinationOf` is the one constructor.
- Two gates, both driving `resolve()` rather than the predicate.

**Still open, and it is a judgement call rather than a bug:** the fifteen taste rules are only
surfaced in `matched()`. **The panel does not yet print them** — the plumbing is there and the
rendering is not. That is the next small piece of this thread.

### The duel can be watched now, and it has been measured

`scripts/duel-bench.mjs` builds a self-contained page (real `duel.ts`, real `duelCamera`, no
external requests). `src/components/DuelBench.tsx` puts the same thing on `/admin`, operator-gated,
for **+18KB** — the engine was already bundled for the hero ornament.

**Measured over 200 complete matches, at the shipped defaults:**

| | |
|---|---|
| median match | **50.8s** (26.5–72s) |
| frames doing nothing | **62%** — guard 44.6%, advance 9.7%, circle 4.5%, backstep 3.0% |
| frames striking | 12% |
| frames in hit-stop | **1.9%** |
| module picks containing no blow | **30.6%** — and the heaviest module in the pool, `close-in` at weight 22, is *pure walking* |

All 35 modules do run. **The problem is density, not variety**, and that is a different fix.

`DUEL_TUNING` exposes four multipliers for it — `circling`, `rest`, `impact`, `patience` — all
defaulting to 1, with 1 as arithmetic identity so every duel gate passes unchanged. **They are in
`Config` and published as of later the same day** — the rule that said they never could be was
reversed at the client's request; `docs/DECISIONS.md` carries the reversal and his words for it.

### Next, in order

0. ~~**Look at the twenty-four fighters on a phone.**~~ **CLOSED 2026-08-30 — see the section above.**
   The answer was yes, and the pair was not the one this entry predicted. Kept for its reasoning.
   Top of the list because it is cheap and it is the
   only unanswered question left about them — everything else about the roster is gated.
   **Do any two read as the same fighter?** Open the duel on `/admin`, or watch the hero ornament
   **signed in** — since today a signed-out visitor cannot be shown a duel by any route, so a logged-out
   phone shows sonar and answers nothing. **The hero ornament is a real place to answer this as of
   today**: the duels alone get a 281px phone slot (~98px figures) against the ~60px that made the
   question unanswerable there before.
   **Watch executioner against sentinel first** — flat/soft/square against tall/hard/square, the
   nearest pair on the contact sheet. They are on opposite sides, so they *can* be drawn together. If
   two do read alike, the fix is one line in `NEVER_MEET`; the gate expects entries in it.

   **The pale-palette question is closed, and it was closed by measurement rather than by looking.**
   The carve draws each mark's edge in the palette's *background* role, so the handoff warned it would
   invert to a light gap on a pale palette and wanted that looked at. **There is no pale palette on
   this site**: all 25 are dark-on-light-text, the brightest `bg` is Clay at a relative luminance of
   **0.0104** and every `fg` sits between 0.88 and 0.94. So the carve reads as a dark rim on all 25 by
   construction and the contrast behind it barely varies. **This becomes a live question again the day
   a light palette is added** — that is the condition to watch, not a browser pass. `rim: 0` turns the
   carve off and is the rollback either way.

1. ~~**Drive the duel settings editor in a real signed-in browser.**~~ **CLOSED 2026-08-30.** Nobody
   had clicked it because the Worker could not start here; it can now. Nobody has clicked it. It is an
   operator surface behind a session, which is one of the things `npm run check` says out loud it
   cannot verify, and it is now the surface the next item is done *on* — the four knobs moved off the
   bench onto it when they became a published field. Check a per-page override in particular: set one
   page, load another, and confirm it did not follow.
2. **Get the client's numbers off the four sliders.** The pacing fix is the same work whatever the
   fighters look like, and his eye is the one thing that cannot be substituted for. Then type the
   winning values in as constants and delete nothing — the knobs stay for the next argument.
3. ~~**The roster: 8 → 20 a side.**~~ ~~**Forty costumes, twenty a side.**~~ **Done 2026-08-28 —
   twenty-four costumes, twelve a side, and the bodies are carved.** It went to forty first and came
   back down the same day, and the reason is the useful part: **the roster read flat because the
   renderer drew wire, not because there were too few costumes.** Bones are tapered capsules now, the
   torso is a mass, draw order is the depth, and every mark is laid down in the palette's background
   role before it is drawn in ink — so a helmet stops where the skull starts. Once that landed,
   twenty-four of the forty were plainly a second copy of a stronger silhouette or a costume whose
   whole read was interior detail, which is the first thing to go at 61px. Eight new archetypes in,
   sixteen kept: 144 pairs per pool, 288 rolled orderings. Archetypes throughout, per his own rule.
   Gated at 24 and at a 12/12 split, verified by breaking it. **What is left needs eyes and is item 0
   above.**
4. **The panel's guardrail notice**, above.
5. ~~**Ask him whether the duel settings should travel in a share code.**~~ **Closed 2026-08-28 —
   they do not, and it is a decision now rather than a question.** He handed the call back
   (*"your call on what to do then if there is a conflict"*), and it turned out not to be his kind
   of question at all: it is about a wire format, not about the business.

   A share code is *a picture of the look* — every field an index into a fixed catalogue or a bit in
   one integer. `duelPages` is *a document*: a sparse per-page map, partial entries, two
   variable-length fighter lists, ~6.8KB fully specified. **The compromise is the thing to refuse** —
   encoding the site-level settings and dropping the per-page map gives a code that parses cleanly,
   reads as complete and silently omits part of what the sender was looking at, which is precisely
   what `decodeSetupCode` refuses to do. Site config already distributes these, per page, validated,
   with a publish button. Gated (`a share code carries the look and never the duel`) and verified by
   widening `SharedConfig` to see it fail. **Reopen only if he asks for a look he can hand somebody
   that carries the duel with it** — and the answer then is a second format, not a widened first one.
6. ~~**`effectiveStation` reads `config.ornament`, not the resolved one.**~~ **CLOSED 2026-08-30, and
   it was not cosmetic** — both directions were live, including the operator's rolled duel being
   stationed `roam` and fading out twice a revolution. The decision this asked for: **the station
   follows what is drawn.** Small, cosmetic, and
   recorded so it is not re-discovered as a bug: publish a duel with station `roam` and a signed-out
   visitor gets station `hold` on the sonar he is actually shown, where `roam` would have been
   allowed. Conservative rather than wrong. The fix is `theme.ts` taking the resolved ornament, and
   it wants a decision about whether the station should follow what is *drawn* or what is *stored*.
7. ~~**The sine-band family is three effects doing one job.**~~ **Done 2026-08-29 — `telemetry` is an
   instrument now, and it is no longer the weakest effect in the set.** He said to go ahead and fix
   it, so it stopped being a question of taste. **The finding is the useful part: frequency is not
   character.** All five of telemetry's lanes carried the same two-term sine at five different
   frequencies, and five smooth sines is one thing shown five times — which is exactly what `flow`
   and `aurora` already are, and is what kept the three of them in a family. Each lane now carries a
   different signal *character*: analogue sine, sample-and-hold steps, a noisy sensor, a sawtooth
   with a hard reset, and a pulse train whose duty cycle drifts. **No other effect on the site has a
   square wave or a staircase.** It was separately too dim — the trace body sat at 0.063 alpha, so
   only the writing head was ever visible — so the levels moved and the lane baselines went from
   `--line` (about 1.2:1) to `--faint`; **the gradient's shape is untouched**, because that shape is
   the whole visual signature of an oscilloscope. Measured on Xerox: peak **16 → 23**, coverage
   **1.7% → 4.3%**. `docs/DECISIONS.md` carries the two rules that came out of building it — noise
   hashed from the sample index rather than `Math.random`, and the positive modulo a negative trace
   time needs. **Still not gateable**, like the rest of the visibility work: no rasteriser, so those
   numbers are the baseline rather than an assertion.

8. ~~**`orbits` is the dimmest thing that is not deliberately sparse.**~~ **Done 2026-08-29 — and the
   reported fault was not the real one.** It was noted as using ~30% of the canvas; it does better
   than that, and what was actually wrong is that **the outer four rings were not drawn at all**.
   They were stroked in `--line` at 0.32 alpha and below, and `--line` is the hairline border token
   at 1.22–1.61:1 — on canvas that is *absent*, not faint. Most of the ellipse area in the frame was
   missing, so the effect read as dots and arcs floating rather than as an orrery. Recession is now
   carried by alpha over one token; tilt 0.34 → 0.42 and base radius 0.062 → 0.070 so it fills the
   frame it is the background of. Peak 14 → 17 on Xerox, 24 on Nebula.

   **This was the third time `--line` has been the bug** (sonar's channels 2026-08-17, telemetry's
   baselines and these rings today), so it is a rule in `CLAUDE.md` now rather than three separate
   fixes. A sweep of `src/fx/effects.ts` found no fourth instance.

### Not started, unchanged from yesterday

Per-page appearance (see the 2026-08-27 section below), and publishing the setup scripts.

---

## 2026-08-27 — the sharing build (phase S), the duel fixes, and a security pass

Two pieces of work in one session. `design/SPEC-SHARING.md` is the design for the first and is a
**DRAFT awaiting sign-off**; `docs/SHARING-SETUP.md` is its runbook. `npm run check` finished at
**46 green**, up from 43.

### Phase S — setup scripts. Built, hardened, not yet published.

`scripts/windows-share-setup.ps1` + `launch.bat`, `macos-share-setup.sh`, `linux-share-setup.sh`,
`setup-bundle.sh`; `src/share/setupCode.ts`; the paste box and checklist on `/share`.

**The design turns on one constraint:** a script cannot hand a browser a folder, because
`showDirectoryPicker()` needs a human gesture — and that sandbox boundary is *why* this needs no
installer and no code-signing certificate. So the scripts do everything around the click, and the
target is one click, once, forever. The setup code is carried on the clipboard and decoded in the
browser, so **phase S adds no server route, table or credential.**

**Still to do before it ships:**

1. **Publish it.** `bash scripts/setup-bundle.sh` builds the bundle; `docs/DOWNLOADS.md` is the
   upload runbook; `docs/setup-downloads-copy.md` is the page copy, already claim-audited. Nothing is
   uploaded yet, so nothing about phase S is live.
2. ~~**The `.ps1` must ship as UTF-8 with a BOM.**~~ **Done 2026-09-02** — and both halves were
   live regressions when checked: the repo `.ps1` had no BOM and `launch.bat` carried two em dashes
   over LF-only endings. The `.ps1` has its BOM, the `.bat` is ASCII + CRLF, and `setup-bundle.sh`
   refuses to build on any of the three faults (assert, never repair — a silent fix would make the
   published copy differ from the one the check suite greps). All three refusals break-verified.
3. **Run it on real Windows and a real Mac.** Neither has been. See `docs/SHARING-SETUP.md` for
   exactly what *was* exercised — the Windows script has been parsed and partly executed under
   PowerShell 7, which is not the 5.1 target.
4. **The junction fast path stays unpromised.** Chrome does traverse a junction or symlink out of a
   picked folder — read out of the Chromium source, where directory entries are exempt from the
   sensitive-path check by construction and Chromium's own unit test says so — but **nobody has
   watched it happen** and Chromium tests junctions nowhere. The scripts offer it as "worth a try";
   the checklist does not depend on it; the download page must not promise it.
5. ~~`--undo` does not restore the sleep settings it changed, and leaves `setup-code.txt` behind.~~
   **Done 2026-09-02.** Both scripts record the pre-setup value on the *first* change only (a
   re-run must not overwrite the real value with our own), keep it outside `$SHARE_ROOT` (undo
   empties that), and restore it on `--undo` — macOS re-asks for the password and keeps the saved
   value for a retry if refused; a corrupted saved value is refused, never passed to `pmset`.
   `setup-code.txt` is removed with the links. Linux undo exercised end to end in a scratch root.
6. ~~The shell `json_string` should **strip** control characters rather than escape them~~ — **done
   2026-09-02**, both shell scripts. The PowerShell escaper deliberately keeps escaping: Win32
   forbids control characters in file and computer names, so its branch is unreachable there, and
   the check suite greps that script's exact template.

### The duel — three faults, all found and fixed

Reported as: fighters "grey out and then come back to full white and in focus"; "only a couple
characters get chosen ever"; and the randomiser "always stays stuck on one".

1. **Greying was `station: roam` on a duel ornament** — a pairing `guardrails.ts` has forbidden since
   2026-08-18 ("a roaming duel is a duel you cannot follow"). Roam fades the slot 1 → 0.12 and back
   three times per 14.4s cycle and shifts it ±84px during the hold. **It was publishable because
   `isAllowed` had only two callers, the randomiser and the check suite** — publish, share codes and
   stored config all walked past it. Fixed with `effectiveStation()` in `src/data/stations.ts`, read
   by `theme.ts` where the wrapper class is built, following the doctrine `Ornament.tsx` already
   records for this rule's sibling. **The station yields, never the ornament.**
2. **Only four of eight fighters were reachable.** Each ornament was locked to two good and two evil
   and the ornament id *is* the pool key, so which half a visitor could see was fixed for everyone.
   Measured: 4 of 28 pairs, 72.7% of resets returning a fighter from the last match, 23.9% identical.
   Pools merged; measured after: **8 of 8 fighters, 16 pairs, back-to-back repeats 5.9%.** The old
   split kept lookalikes apart — that is now `NEVER_MEET`, an exclusion list, rather than a cost of
   four costumes.
3. **`mode: "page"` never rolled on a page load** — only inside `go()`, an in-app click. Reload, typed
   URL, bookmark and back/forward all rendered the published look verbatim. And the palette swatch was
   the only look control that wrote `mode`, silently setting `static`. Both fixed; the swatch now says
   "the randomiser will roll over this" instead of quietly disabling it.

**Open, and worth your attention:** `isAllowed` still constrains only the dice. One rule is now
enforced at render; the other sixteen remain violable by hand from the panel — including `grain` on a
`LOW_CONTRAST` palette, which is a WCAG regression publishable to every visitor at once.

**Not done, and offered:** whether the fights *read* well is on the "needs a person" list by
construction — rAF parks in an automated browser. Judge it once the three fixes are live; if it is
still flat, the useful next step is a director pass against `handoff_duel_engine/duel-cycle-v2.html`,
not a design tool.

### The security pass on phase S

Three reviews (PowerShell, shell, and a security review with a child audit). Everything below was an
exploit demonstrated by execution, not a reading, and each is now closed **and gated**:

- **The blocklist was bypassable on all three platforms.** Exact string equality on the raw path let
  `//home/user`, `/home/./user`, `/home/user//` and `/home/user/../user` through; symlink targets were
  never resolved; the parent of home (`/home`, `/Users`, `C:\Users`) was on no list at all; and
  `$HOME` was blocked while `~/.ssh`, `~/.gnupg`, `~/.config` and `~/Library` were not — the exact
  directories Chrome blocks with block-all-children semantics. Windows additionally fell to 8.3 short
  names, device paths and unresolved junctions. Now: canonicalise-then-compare, **fail closed**,
  prefix matching, case folding on Darwin, and a recursion guard.
- **Choosing exactly one folder crashed the Windows script** — a one-element array unrolls on return
  and StrictMode 2.0 kills the scalar `.Count` shim. It worked with two.
- **The PowerShell JSON escaper corrupted emoji and zero-width characters**, because `switch` compares
  linguistically and every zero-collation-weight character matched the backspace clause. A folder
  called "Photos ❤️" produced a code the site refused *after* the links were made.
- **The shell scripts printed their UI to stdout while the caller captured stdout as the folder
  list**, so every interactive run reported the chosen folders as non-existent, and a headless Linux
  box shared nothing at all.
- **The decoder now refuses bidi overrides, zero-width characters and duplicate labels** — a label is
  written to the account and shown to everyone you later share with, so one that renders as something
  other than what it stores is the whole attack.

**The honest note on the `/scams` tension**, from the security review and worth keeping: of the three
mitigations, only *"hang up and ring back on a number you looked up yourself"* engages a phone scam.
Published source helps someone who can read 750 lines of PowerShell, who is not the person at risk;
and the SHA-256 is served from the same page over the same TLS connection as the file it describes,
so against the stated threat it does close to nothing. Every one of those signals is free for a
scammer to clone.

### Per-page appearance — agreed, not started

Client wants **every dial on all seventeen pages**, set from the admin panel. Transition decided:
**bleed the colour, snap the structure** — the 0.9s palette bleed is the site's signature, but a
layout or typeface changing mid-fade reflows text and collides with the `.v-block` entrance stagger.
The randomiser stays on ("keep it rolling, and ill change whenever i feel like it"), so overrides must
compose with `mode: "visit"` rather than assume a static base. **`ConfigContext` builds its initial
state synchronously**, so a landing-page override has to arrive through the Worker's injection or
every cold load bleeds from the wrong look — and **both `PUBLISHED_KEYS` arrays must learn the new
shape**, or it is dropped silently on publish.

### Not a bug: the white page

Chased and recorded so it is not re-investigated. It was an unstyled probe fixture on a local port,
not any route on the site: all 25 palettes are dark, `base.css:19` paints `#0b0a1f` before the tokens
mount, and the stylesheet is render-blocking.

---

## 2026-08-26 (evening) — rounds 4 and 5 of the copy review, run and applied

The copy overhaul ran three rounds and stopped at the session limit. **Round 4 (voice
consistency across all seventeen pages) and round 5 (a cold read of the two safety pages)**
were the two that never ran. They have now, and **everything they found that could be fixed
without the client has been fixed.** `npm run check` is 43 green.

Round 5 was run as two cold readers given the page text and nothing else — no `CLAUDE.md`,
no repo — reading as the people the pages are actually for: somebody on the phone to a
scammer now, the adult child deciding whether to forward the link, somebody who has already
paid, and a non-technical customer about to install remote-access software because a
stranger told them to. **That framing is what found the two big ones, and it is worth
reusing.** Both cold readers also produced claims that were wrong; each was checked before
being acted on, and one is recorded below as a false alarm.

### Still needs the client — nothing else on this list does

1. ~~**Which Tailscale flow?**~~ **Answered by deleting it.** Told to decide, and the
   decision is that **Tailscale comes off the page** — reversing 2026-08-14. The steps did
   not work, and the capability they bought is one the operator had already decided not to
   use: `docs/DECISIONS.md` records his model as *"the screen, while you watch, **never
   unattended**."* Unattended reach is all a mesh VPN is for. What it saved a repeat customer
   was one code exchange on a call they placed anyway, against an account signup, a second
   program the page never named, and a permanent way into their machine. `/setup` is Quick
   Assist and macOS screen sharing now, both attended, both ephemeral.
2. **If unattended access is ever actually wanted, do not reach for Tailscale again.** The
   right shape is a purpose-built remote-support tool **hosted on his own machine** —
   **RustDesk** (simplest: one program, does attended *and* unattended, self-hostable relay)
   or **MeshCentral** (a small operator's console: remote desktop, file transfer, per-device
   consent prompts that match what `/setup` promises). One install for the customer, one
   thing to explain, one uninstall, and no third party's relay in the middle — the same
   reasoning that made the downloads bucket private and the fonts self-hosted. **Blocked on
   the ThinkCentre existing**: `scripts/thinkcentre-setup.sh` has still never run on real
   hardware. Ask him whether he ever actually needs to get into a machine nobody is sitting
   at; if the answer is no, this never needs building.
3. **Was the first machine he took apart really a 486?** It is `/about`'s origin story, it
   was rewritten (not removed) this session, and this file recorded it under *Answered
   already* as "gone with `/now`" — it went from `/now` only. Same provenance question as
   item 8 below. Cannot be fixed by anyone but him.
4. **The years number.** All six surfaces now read **"over twenty years"** — his own
   correction from 2026-08-14, applied consistently, replacing four different wordings. The
   *number* is still item 6 below. It is now one phrase to change instead of four.

### Applied — `/setup`

- **Tailscale is gone from the page** — see item 1 above and `docs/DECISIONS.md`. Its steps
  did not work, it was a connection rather than a screen and the page never named the program
  that would have shared one, and unattended reach is a capability the operator had already
  ruled out. The block that replaces it says nothing persists between visits, and says it as
  the advantage it is: *"a permanent way into your machine is worth something to me about
  twice a year, and worth a great deal to whoever finds it."*
- **"Screen sharing across it still asks you first" went with it** — a promise Tailscale does
  not make, since Remote Desktop or an unattended VNC over the same link asks nobody. So is the
  same claim in "[what i can see]", where a claim about *software* was welded to an honest
  personal promise; the promise is what survived, and it now carries a test the reader can
  apply: *"if a screen ever gets shared without you agreeing to it right then, it was not
  me."*
- **"it stops existing the moment you close the window" was false** — the session ends, the
  app stays installed. A reassurance built on a wrong fact, and the true version is nearly as
  reassuring.
- **Quick Assist is not on every machine.** True of Windows 11, often not of Windows 10,
  where it comes from the Store. The commonest stall on the page now has an answer.
- **The page's own scam rule fired on its own workflow.** The customer emails, then *he*
  rings *them* and reads out a code — which is the scam script, and the page's one memorable
  rule said so. The callback settles it: unsure, hang up and ring back on the number he gave
  you. It appears twice more, at the two moments it will be tested.
- **"I will never ask you for a password"** — the page had the gift-card equivalent and not
  this one, while telling somebody to sign in to a Google or Microsoft account.
- **Added:** the code expiring; the Windows prompt the customer must click themselves; a
  warning before the mouse is taken; and a whole **"when we're done"** block, which did not exist —
  including *don't type a password or open your banking while I am looking*, the single most
  valuable line that was missing.
- **The Mac block** now says where to find the version rather than assuming they know.

### Applied — `/scams`

- **"None of that survives a reload. Not one pixel of it." is fixed.** Right about the
  screen-editing refund scam, wrong about the variant where they move the victim's *own*
  money between their *own* accounts — which survives a reload **and** a second device. A
  reader who tested it concluded the overpayment was real. The technique stays; the absolute
  is gone, the variant is named, and the block now lands on the rule that holds either way:
  *you do not send money to somebody who rang you, whatever the screen says.*
- **Everything actionable-right-now is now first.** The emergency block moved ahead of the
  thesis, and the pop-up close sequence and the refresh counter-move came up beside it from
  blocks 20 and 19 — both are live defences that were filed with the reference material,
  and the eyebrow ("read this before you call anyone") is addressed to the person staring at
  a pop-up. Block count unchanged at 33.
- **The bank call is second, not sixth.** It was below "shut the computer down", on the one
  list a panicking reader finishes, and the page itself says money can be stopped in the
  first hours and almost never after.
- **Also added to that list:** 911 if somebody is at the door for cash (it was in block 31,
  seventeen blocks after cash-by-courier is first named), and changing the email password
  from a different device, which was not there at all.
- **"Switch off the Wi-Fi" pointed at a setting inside the machine the attacker is driving.**
  It names the router now, and says what a router is.
- **The site said no legitimate company ever asks for an e-transfer, then asked for one.**
  `/downloads` takes e-transfers and so, presumably, does the $150. The bullet is split: gift
  cards, crypto and courier cash stay absolute, because that absolute earns its keep; wire
  and e-transfer get the same "to somebody who contacted you first" scoping the
  remote-access bullet above them already had.
- **A password change does not evict anyone from an email account.** Forwarding rules,
  added recovery addresses and added recovery phones all survive it and are the standard
  persistence trick after a screen share. Now covered, with signing out other devices and
  turning on two-step. **A credit-file fraud alert with Equifax and TransUnion** was missing
  from the page entirely.
- **The shame surface.** The lede sorted the reader into a demographic ("older people")
  before helping them; the block meant to absolve opened with *"People assume victims are
  gullible"*, which is the accusation arriving in the reassurance, and a scanner reads
  headings and first lines. And *"if you have **actually** lost money"* divided readers into
  real victims and fussers. All three changed.
- **The recovery trio ran least-bad → worst**, so the reader in the most trouble travelled
  furthest. Reversed to triage order, and the one cross-reference that pointed the wrong way
  afterwards was fixed with it.
- **Ctrl+W throws a "Leave site?" box** on these pages, so the reader pressed the keys, saw a
  dialog and concluded it had failed. Named now, with the blunt fallback the emergency block
  already uses (hold the power button in) offered after Task Manager rather than leaving a
  panicking person in a process list.
- **"Twenty minutes that make you a hard target"** was followed by seven items including a
  trip to the bank in person. It is an afternoon, and it says which two take a minute.
- **The recorded-line paragraph** spent fifty-five words on a one-directional inference that
  its own bullet contradicted nine lines later. The bullet states it flatly and is enough.

### Applied — round 4, voice consistency

The voice is holding, and the reversal held with it: **there is no self-deprecation left to
find.** Its mechanics are consistent page to page — short declaratives, concrete numbers over
categories, first-person singular, the negative-construction pitch, and a block's last
sentence carrying a turn that points **outward**, never at the operator. `contact` and the
pricing block are deliberately the plainest copy on the site, which reads as judgment being
exercised rather than as drift.

- **`/downloads` still carried the promise this file recorded as cut** — *"pay once"*
  survived the audit rewrite, verified as written this session. `expires_at` / `max_uses` /
  `revoked_at` all exist, so it was a commitment the schema can take back, and item 1 below
  asks a question the live copy had already answered on his behalf. The anti-subscription
  joke is the true half, so the joke stayed and the promise went.
- **`guestbook` was the last content page whose eyebrow named nothing** — "1999 revival" over
  "Sign nothing.", both halves flavour. Now "guestbook · 1999 revival", which is the pattern
  `notfound` is exempt under: flavour beside its own translation.
- **"the bench" is gone from home and the `about` snippet.** Both replacements are more
  concrete than what they replaced.
- **`changelog`'s snippet was its own lede reworded.** A lede is read after an eyebrow and a
  headline; a snippet arrives cold. Rewritten — and the gate caught the first attempt at 159
  characters, which is the gate doing its job.
- **`/gallery`'s drive-shelf alt** said "Five PATA hard drives" beside a heading claiming
  forty, so a screen-reader user got two counts. It says "five of them" now. The photograph
  really does show five.
- **The empty video slot** was captioned "video · muted loop" — a muted loop of a *noise*,
  for a clip that does not exist. The caption is operator-only and now says so.
- **Two sentence-level defects:** `gallery`'s capacitor block was a three-turn run-on with a
  dashed aside inside a dashed aside, the third clause a comma splice hiding behind an
  em-dash; and `changelog` v2.4's "same as a new laptop" was an allusion that parses
  backwards on first pass.
- **`/now`'s snippet** promised "what came off it this week", which the page has no section
  for, and said "on the bench".

### One false alarm, checked rather than relayed

A cold reader doubted **`reportcyberandfraud.canada.ca`**. It answers **HTTP 200**. The CAFC
number (1-888-495-8501) and the OPP lines (1-888-310-1122, TTY 1-888-310-1133) all check out
too. **The hours and that URL still want a re-check date on them**, since either can move
without anything on the site looking wrong.

### Accepted, not fixed

- **The `/scams` CTAs still sit above the emergency block**, and the first is
  "Get my machine checked →". They are in the hero, so no block reordering reaches them, and
  the page does need a route to him. Worth knowing that a sceptical reader notices it.

---

## 2026-08-26 — the copy overhaul, and eight questions only the client can answer

The whole site's text was rewritten this session (see `docs/DECISIONS.md` for
what and why). `npm run check` is 43 green. **What is left is not work — it is
eight facts nobody but the client can supply.** Each one is currently rendering
the *safe* reading, so the site is publishable as it stands; every answer either
confirms what is there or replaces it with something better.

**Answered already:** the bench (there isn't one yet — a bin of parts and two
laptops, so `/now` and `about` were rewritten to that), the privacy line (his own
wording, now on home and in the search rotation), and the 486 — **but the 486 went from
`/now` only and is still `/about`'s origin story**; see round 4 item 2 above.

1. **Downloads: "pay once, nothing renews."** **Now genuinely cut** — it had been
   reworded rather than cut, and "pay once" survived until this session. The
   anti-subscription joke stays because it is true. `download_codes` carries
   `expires_at`, `max_uses` and `revoked_at`, so the page was promising something
   the software can take back. **Does he want that promise on permanently?**
2. **Contact: "you will usually hear back within a day."** Inherited, and a
   service level he has to honour on his worst week. Home dropped its equivalent
   in this session; contact kept it. **Keep, soften, or drop?**
3. **Guestbook numbers** — "a five-year-old laptop that now starts up in nine
   seconds" and "the sand laptop, six months on". Both predate this session and
   neither traces to anything. **Real, or handoff placeholders?**
4. **`work`: "It has run for two years since."** Changed to "ever since", which
   cannot go stale. **If two years is true it is the better line** — and it will
   need re-checking every year it stays.
5. **"The same record I keep of what was done to your machine."** Cut from the
   changelog lede: it advertised a per-machine record-keeping service nothing
   else on the site mentions. **Does he keep written notes per machine?** If so
   it is worth having, and not only on the changelog.
6. **How many years?** All six surfaces now read **"over twenty years"** — his own
   2026-08-14 correction, applied consistently in place of four different wordings.
   One block still implies paying Microsoft since the nineties, which is nearer
   thirty. **The number is still his to give; it is now one phrase to change.**
7. **The Kevin joke** — "no chat window operated by a man named Kevin who is not
   named Kevin", on home and in a search snippet. It trades on offshore support
   staff using anglicised names, which is adjacent to the accent framing the
   client **already declined** for `/scams` ("accent is not who started the
   call"). One agent retired that joke on the safety page in the same session
   another put a version of it on the front page. **His call, made once already
   in the other direction.**
8. **Are `/work`'s six case studies his, and are the five guestbook quotes real?**
   The flooded drive at 94%, the cracked solder joints, three routers, the
   ransomware backup, the sand laptop, twelve office machines. **This is the most
   important one on the list.** The bench turned out to be aspirational, so the
   provenance of the page that tells a stranger *he can actually do this* can no
   longer be assumed. If any of it came from the design handoff rather than from
   real jobs, it is fabricated evidence of capability and has to go or be
   replaced with real ones.

### Also outstanding from this session, and not blocked on anybody

- **`/now` has an owner's job attached to it now.** It lists two real machines. A
  `now` page goes stale by sitting still, and a stale one is worse than none.
- **The gallery describes a video that does not exist** — there is no clip
  anywhere in `public/`. The copy was reworded to describe the sound rather than
  a recording, but eight seconds of a dying fan bearing would earn its place.
- **`/gallery`'s drive-shelf block says "Forty hard drives"; its `imgAlt` describes
  five.** (Recorded here against `/work`; the block is on `/gallery`, `pages.ts:241`. The
  photograph really does show five, so the alt text is right.) Pre-existing and
  defensible — the alt describes the placeholder photograph, not the claim — but a
  screen-reader user gets two different counts.
- ~~**Deploy.**~~ **Done.** Deployed, Search Console property verified, sitemap submitted
  (11 pages), home page in the priority crawl queue. Live copy confirmed serving one
  description tag. Google re-crawls on its own schedule from here.

## 2026-08-23 — the sharing host has a setup script

**Client:** *"i have the pc ready for the linux install that will run my file
sharing. pls make me the setup script. make sure EVERYTHING is included. then
check for errors 10 times. make sure you leave no security holes open."*

**`scripts/thinkcentre-setup.sh`** — the x86/Debian sibling of `pi-setup.sh`,
which hard-refuses on anything that is not a Raspberry Pi. Run it as your
ordinary user on the ThinkCentre once Debian is installed; it refuses if you run
it with sudo, because the Chromium profile that holds the folder handle belongs
to your account and in root's home the desktop would never see it. Re-running it
is safe and is the point: every step says `(already done)` when there is nothing
to do.

`docs/thinkcentre-sharing-host.md` now has a **"The script"** section listing
what it covers and what it still refuses to touch. The short version of the
refusals: it does not format or mount a disk, does not write `/etc/fstab`, does
not install Samba, does not open a port beyond SSH, does not add you to the
`docker` group (that group is root-equivalent and this box autologins), does not
pair the machine — §6 cannot be scripted on any hardware — and does not phone
home.

**Three things it does that the guide never did, and that matter most:**

1. **The browser is locked to your site.** This machine boots into a browser
   signed in as you, so it can now reach `mcclevarty.ca` and nothing else, with
   no password manager, no Google sign-in, no profile sync and no DevTools.
2. **Chromium gets its own upgrade window**, Sundays at 04:00, which restarts the
   tab afterwards and only if the version actually moved. It is excluded from the
   automatic security updates because those would replace the binary under a
   running browser at an hour nobody chose. Change the hour to one you would be
   happy for sharing to blink out in.
3. **The clock is disciplined**, because sign-in here is password + TOTP and a
   drifted clock fails with "wrong code" — which sends you looking at your phone
   rather than at the machine.

**Ten verification passes were run against a mocked Debian** — the script runs
end to end there, and every refusal, option and failure path was exercised. Six
real bugs were found and fixed; two of them mattered:

- **The firewall was never actually enabled.** The test for "is ufw already on?"
  was a substring match, and `inactive` contains `active` — so on a fresh machine
  the script would report a closed firewall in its own summary and have none.
- **`--verify` always exited 0**, including when a check failed. The cleanup
  handler's own exit status was replacing the script's, so the one command whose
  job is to report a bad state always reported a good one.

**Wants your eye, because I cannot run it from here:** it has never been run on
real hardware. Run it, read the summary it prints, then reboot and run
`./scripts/thinkcentre-setup.sh --verify` having touched nothing — that is the
state the machine spends its life in and the only test of it that means
anything.

---

## 2026-08-20 — a review of the recent work, and sixteen more bugs

**Client:** *"yes, have prices as a toggle. and whatever else you can think of
for a downloads page. also please review all recent work for bugs."*

**Prices were already a per-page toggle**, off by default, so nothing changed
there.

**Added:** picking a file now fills in its id, name and platform from the
filename; the editor has the page's link with a Copy button and a QR for
somebody standing next to you; a search box appears on pages of eight files or
more; anything added in the last thirty days is marked **new**; and each card on
`/downloads` says how many files are on it.

**Reviewed the last week of commits and found sixteen bugs**, twelve in the
downloads Worker and four in the duel. All fixed, all gated. The ones worth
knowing about as the person who runs this:

- A file with an accent or a non-Latin character in its name — `Réparation.exe` —
  **saved fine and then failed to download, for ever.** It now works properly.
- Resuming a big download was broken for the tools that do it (`HEAD` answered
  "no such endpoint"), and an already-finished download could get a malformed
  reply. Both fixed — these matter for the 300MB files going to people on poor
  connections.
- **Deleting a page did not delete the codes minted for it.** Since a page
  address can be reused, an old customer's code could come back to life on a new
  page at the same address and open somebody else's files. Deleting now means it.
- Minting a code for a page set to *Only people I've named* used to succeed and
  then open nothing. It is refused, with a message saying what to do instead.
- The revoke handle was short enough that two codes could collide, which would
  have revoked the wrong one silently. It is wider now and checked.

**Nothing here changes anything you have already set up**, and migration `0007`
is still the only one that needs applying.

**One thing I left alone and want you to know about:** the duel's fairness check
fails at random about once in every 370 runs, on correct code, because it samples
a fresh fight each time. `npm run check` runs before every deploy, so a deploy can
fail for no reason. The fix that looks obvious — loosening the threshold — would
weaken the check that guarantees neither fighter is favoured, so I have not
touched it. Say the word if you would rather it were made deterministic.

---

## 2026-08-20 — downloads: categories, prices, filters, sort, and eight bugs

**Client:** *"review the downloads page. make sure there are no bugs. I need
complete control of everything about this page from my admin panel/page.
descriptions/prices, categories, filters, sort by, with an icon for each
category. anticipate all types of software… or just have an upload portal."*

**Built.** Twenty-one categories with a drawn icon each, a price per file, a
filter row and a sort control, and — the gap the review turned up — the ability
to **edit a file after uploading it**, reorder files and pages, and mint a code
for one file. `docs/DOWNLOADS.md` is the runbook and has the whole loop.

**Migration `0007` must be applied to production D1 before or with the deploy.**
Additive only, and every default is the behaviour the page already had:
`npm run db:migrate:remote`.

**Two things want your decision, not mine:**

1. **Prices are off by default, per page.** This reverses the "no prices on the
   page" rule, deliberately and on your word — but only as far as giving you the
   switch. Nothing shows a figure until you tick *Show prices* on a page. There
   is still no Buy button and nothing takes money; a price is a fact in the same
   mono line as the file's size.
2. **A `code`-gated page is now listed on `/downloads`** as locked, showing its
   title and one-line summary to a stranger. It was silently invisible before,
   which made it a second *unlisted* — and somebody holding a code has to be told
   where to type it. If you would rather a paid page be invisible, that setting
   already exists and is *Only people I've named*.

**Still wants your eye**, because I cannot judge it for you: whether the
twenty-one categories are the right twenty-one for what is actually on your
memory stick, and whether any of the icons is ambiguous to somebody who did not
draw it. Ask for more categories if something does not fit — adding one is
cheap; renaming one is not, because the names are stored against your files.

---

## 2026-08-20 — downloads sub-pages, built

**Client:** *"i am going to have a few subpages in it… i want to be able to
design and name them as i want… each page will be able to host files… even more
granular options that i can set, for each user on what they can see."*

**Built and proven end to end** — the harness drives it against a real Worker,
real D1 and real R2, comparing the served bytes against the uploaded ones and
checking every one of the four visibilities from the outside, as a stranger with
no session (336 checks, `npm run test:auth`).

What it does: pages you name and address yourself, four switchable looks (one of
them free-form blocks), files uploaded from the browser in chunks with no size
ceiling, draft/publish, and access by **either** an anonymous code **or** a named
account — the two answer different questions and both are there.

**Migration `0006` must be applied to production D1 before or with the deploy.**
It is additive only.

**Still wants your eye**, because it is an operator surface and I cannot sign in:
whether the four looks are actually distinct enough to be worth four, and whether
the editor is laid out the way you want to work.

---

## 2026-08-19 — open, and waiting on the client

Two things on `/downloads`, one now closed.

1. ~~**The catalogue is empty and needs his files.**~~ — **it is no longer a
   deploy step** (2026-08-20). Pages, files and uploads are all in the admin
   panel now, so this is the client's to do whenever he likes, with no session
   of mine involved: Admin → *Downloads pages* → New page → add files.
   `docs/DOWNLOADS.md` is the runbook and has been rewritten for it. The
   `author` field is still deliberately awkward — fill it in when the program is
   not his, and check that its licence permits redistribution, which nothing
   here can check for him.

2. **The page is being redesigned outside this repo.**
   `design/claude-design-downloads.html` is the handoff: the page as it stands
   today, self-contained, four boards (desk locked, desk unlocked, phone, empty),
   real class names, stylesheet rules lifted verbatim, both fonts embedded. The
   client is taking it into Claude Design and bringing back a direction to
   implement. **The constraints that cannot be designed away are written out in
   the comment at the top of that file** — the safety notice's position above the
   list, **a price that is a fact and never a Buy button**, palette tokens only,
   an unlock that moves nothing, a plain anchor for the download, and no design
   that implies an account. Implementing means `src/components/DownloadsPage.tsx`
   and the `.v-dl-*` block of `src/styles/chrome.css`; the handoff keeps the
   class names so it is a translation rather than a rewrite. The file is a design
   artefact and ships nowhere: Vite builds one entry, so `dist/` never sees it.

   **Constraint 2 changed on 2026-08-20 and was rewritten rather than deleted.**
   It read *"NO PRICES, ANYWHERE"*; the client has since asked for prices they
   control, so a figure may now appear on a page whose operator has ticked *Show
   prices* — off by default. The half that still holds absolutely is that there
   is **no Buy button**, because nothing on this page takes money.

   **The handoff now predates categories, the drawn icons, the filter row and the
   price**, so it is a picture of a slightly older page. Every class name in it is
   still correct; the four it does not know about are `.v-caticon`,
   `.v-dl-filters`, `.v-dl-chip` and `.v-dl-price`.

   **Regenerate it rather than hand-editing it if the page changes first** — it
   was built by lifting the real rules out of `src/styles/*.css`, and a
   hand-patched copy is one that has quietly stopped matching the site.

---

Last updated 2026-08-18: **the animation audit, the duel rebuild, the
phone scroll fix and the low-end performance work are all shipped.** New open
items are in *This session's leftovers* immediately below. Previously:
**SPEC-ACCOUNTS phase 2 is built and harness-proven**
— machines, drives, the per-machine signalling Durable Object, the connect
ceremony, the file protocol, and the `/share` + `/machines` pages. The spec
grew §13 and §12 K–S; the harness **prints its own check count** (304 on 2026-08-18) —
read the run, not this line. Done items below are kept as
one-liners because their numbers are cross-referenced from `docs/DECISIONS.md`.

---

## 2026-08-16 — "nothing on the site is live", root-caused and fixed

**Reported for the second time, and the first fix genuinely did not reach it.**
Reproduced in a browser, not reasoned about: a visitor whose machine sets
`prefers-reduced-motion` lands in calm, and calm is total — `is-calm`, canvas at
`opacity: 0`, **zero** animated elements. Correct as a default; the bug was that
nothing on the page accounted for it, and the greeting actively contradicted the
screen ("The background moves… press **plain**" — to stop motion that was not
happening, with no way back).

Shipped and verified against production: `calmBySystem` on `ConfigContext`, and
a second `Greeting` branch that names the setting and settles it. Both buttons
write the preference, so it is asked once. It asks **regardless of the greeting
flag** — which is the part that matters for anyone already stuck, because they
have "seen the introduction" recorded and "answered the motion question" not.

**One thing for the client, and it decides whether this was the whole bug:**
this fix assumes the machine reports `prefers-reduced-motion: reduce` (Windows:
*Settings → Accessibility → Visual effects → Animation effects*, off). If motion
is still dead on a machine where that setting is **on**, the cause is something
else and this is the wrong tree — say so and it gets re-opened with fresh
measurements rather than another guess.

Two smaller things surfaced while measuring, neither fixed, neither urgent:

- ~~**The published site rolls `fx` on every visit**~~ — **fixed 2026-08-16**
  (`29f5aed`), client approved. `off` was one of the sixteen in the pool, so
  roughly one visit in sixteen arrived with no canvas effect at all — the same
  symptom as the bug above, from an unrelated cause. `ROLLABLE_FX` and
  `ROLLABLE_ORNAMENTS` are new *lists*, not new flags: `off` is a fine thing to
  choose and a terrible thing to be given, so `FX` (the wire format) and
  `PICKABLE_FX` (the menu) are untouched and no share code moves. The empty
  ornament went the same way, and for a second reason — five taps on it reveal
  the footer sign-in link, which on the phone band is the only findable route to
  an account. Simulated 200,000 rolls: zero exhaustions, every layout and all
  fifteen remaining effects still reachable.
- ~~**`vessel.tier.v1` was absent**~~ — **not a bug; the key does not exist**
  (resolved 2026-08-16). The performance tier is stored under **`vessel.perf.v1`**
  (`src/fx/perf.ts`), and `vessel.tier.v1` has never appeared anywhere in the
  codebase, so the check was looking for a key nothing writes. Verified live: on
  a cleared profile the key is absent before the greeting and reads `0.5`
  immediately after its button, which is `calibrateOnce` running on the way out
  exactly as designed.

  Two things worth keeping from checking it. The probe returned **`0.5` — the
  lowest tier it is allowed to return** — on this machine, which is the floor
  doing its job on a browser that is slow for reasons unrelated to the GPU. And
  before the 2026-08-16 `FxCanvas` fix that would have been *permanent*:
  promotion required a frame interval under 11ms, i.e. above 90fps, which a
  60Hz display cannot produce, so nothing could ever climb back. A wrongly-low
  probe now self-corrects within seconds.

## 2026-08-17 — audit round two, and a gate so this stops recurring

**`npm run check` is now the gate** (19 gates and growing, ~5s; `check:fast` runs after every edit
via the `PostToolUse` hook; the full pass is `predeploy`). Each gate exists because that exact
failure shipped, and each was verified by deliberately breaking it. **When something gets past it,
add a check** — that is the whole discipline.

**The lesson of the session, recorded because it kept repeating:** almost every real defect was
found by *someone other than the author*. A code review found seven canvas bugs; two duel audits
found fourteen; an accessibility audit found eight and disproved two claims in `CLAUDE.md`; an
adversarial re-review of my own commits found four of my own measured-sounding claims were wrong.
The one time I skipped review, I shipped a QR encoder with three scanner-fatal bugs — and my own
test could not have caught one of them, because it shared the encoder's map.

**Still needing a person, and the check suite says so out loud:** whether the fight *reads* well
(rAF parks here), whether any layout is beautiful or the copy sounds right, whether a QR actually
scans on a phone, and the operator surfaces — which have still never been seen, because they need a
signed-in session.

**Known and deliberate:** three palettes (oxide, xerox, peat) still fail AA on danger text, down
from all 25. `close-in` is the only `far` sequence and the leash makes that band rare, so it is
exempt from the reachability check.

## This session's leftovers (2026-08-14)

Everything here is *additive*. The site is shipped and working; none of these
are known breakage.

### A. See the duel run on a real machine — **still wants the client's eye**

**Reviewed frame by frame 2026-08-14 (later), and it was worth doing: four
defects, all shipping.** `docs/DECISIONS.md` has the full write-up. In short —
the anti-stall rail never reset, so 98.6% of sequence picks were made under it
and four sequences fired twice an hour; `bladeGap` solved the wrong equation and
reported crossing blades as 16 units apart, which is why blade-on-blade sparks
often did not fire; nothing stopped the two bodies overlapping, and they did on
3.9% of frames; and the blade lock's blades were never within 30 units of each
other. All four are fixed.

The environment limit is worse than recorded and worth knowing: the tab reports
`document.hidden`, rAF parks (zero frames in 700ms) **and timers throttle to
~1Hz** (two `setInterval(…,16)` ticks in 1,064ms). There is no live playback
here in any form. What does work is a filmstrip — step the real module N frames
into a grid of captioned cells — which is how the four above were found.

What a filmstrip still cannot judge is *tempo*: whether the stillness between
exchanges reads as poise or as a hang, and whether ~50s per match is right. That
needs eyes on a real screen. Watch it and say.

**Reviewed again 2026-08-16, after the client said it "seems a little off" with
no further detail — ten more defects, all shipping, all fixed.** The method moved
on from the filmstrip: bundle the real module with esbuild and step
`advanceDuel` in Node over 90,000–400,000 frames, plus a recording mock 2D
context for the drawn ones. `CLAUDE.md` deviation 9 has the list and the numbers;
`docs/DUEL.md`'s *Verification note* has the method. The headline: `impulse:
{ at: 0 }` could never fire, so **no fighter had ever been knocked down** across
13,591 frames of `knockdown`; blocked strikes never drew their downstroke, which
is ~40% of the pool; and the ornament camera showed both fighters on only 31% of
frames at the phone slot.

**The tempo question above is now partly answered and partly changed.** Matches
run ~45s rather than ~50s, because blows land where they are aimed. Stillness
measures at a median of 0.9s between exchanges with bursts of 0.45s, which is the
intended contrast. Whether that *reads* as poise or as a hang is still a
question only an eye can settle — and it is now the main open one, because the
correctness questions have been answered. **One trade is deliberately left
live**: pulling the pair into sword range (`LEASH`) means their resting blades
overlap more than they used to, 41.5% of frames against 21.7%. The spurious
sparks that came off that are gone; the visual crossing is not. Undoing it costs
the contact quality, so it wants a look before anyone trades it back.

### B. ~~Duel choreography — the moves designed but not yet built~~ — **done 2026-08-18**

**Everything on the sheet is built. 28 sequences, 31 moves, all reachable and
gated.** `CLAUDE.md` deviation 9 has the four load-bearing rules;
`docs/DECISIONS.md` 2026-08-18 (last) has the measurements.

Three defects surfaced while building it, none of them visible by reading the
code: a somersaulting fighter **mirrored the entire figure** on the frame it
crossed the opponent (147/147/157 events against ~169 flips, on three seeded
runs — i.e. every one); **`retreat` had never been used by any sequence** and had
been dead for the life of the director; and `overrun`'s sparks were authored
against a blade crossing that does not happen, because the two guards already
overlap before the charge starts. The first two now have gates.

**What still wants an eye** — no bench can settle these: whether the tumble reads
at ornament scale, whether one spark burst per charge is enough for the overrun,
and whether the thrown blade is legible or merely brief.

The original list, for the record:

- ~~**The blade lock's visuals.**~~ **Built 2026-08-14 (later).** The press has
  the sustained shower at the true crossing, the two-frequency judder that the
  loser shakes harder, the whole X rotating so the contact point walks into the
  loser a second before the break, a grind that carries the lock downfield, and
  a burst plus hit-stop as it fails. Who wins is `beatPower` on the beat, so it
  is fixed by the same role coin as everything else and the renderer never reads
  the director. Two prerequisites had to be fixed first and are the reason it
  looked like nothing: the blades were never touching, and `bladeGap` could not
  have told you where they touched if they were.
- ~~**`duck` and `overrun`.**~~ **Built 2026-08-18.** The duck needed something
  to duck under first — every other attack in the table finishes in the floor,
  and crouching under a descending blade puts your head where it is going — so
  `strike_level` came with it, holding its blade level for seven frames while
  the body carries it forward. `overrun` is a mutual charge on the ground, and
  it needed the body separation to stand down: that is a **ground pass**, a pass
  with no vertical impulse, and *not* "any pass move", which measured worse
  because it also licensed the nine frames after a somersault lands.
- ~~**Riposte with the wind-up skipped.**~~ **Built 2026-08-18** as
  `Move.windup` + a `quick` beat, and it is a property of the **beat**, never
  the runtime test the note here proposed. "Enter quick if a parry ended within
  8 frames" is a condition, and a condition moves the contact frame — so the
  reaction beat authored against it would be right on some runs and early on
  others, which is the one thing the director refuses to do. Lands four frames
  after its beat instead of sixteen.
- ~~**`blade_throw`.**~~ **Built 2026-08-18**, and it cost almost nothing
  because it is routed through `bladeWorld`: while the blade is out of the hand
  that function returns the flying segment, so the smear, the blade-on-blade
  spark test and the burst placement all follow it with no code that knows a
  throw exists. Reach is sized to the gap at release — `gap - 40`, because
  `duelFocus` ignores blade tips and an overshooting throw spends its apex
  outside the ornament's frame.
- ~~**`spin_attack`'s body flatten.**~~ **Built 2026-08-16.** Squared rather
  than signed, because the blade is drawn inside the same transform and a signed
  cosine would mirror the sword to the fighter's other side halfway through and
  fight the arc its own keyframes are drawing; and it turns once rather than
  twice, because this move's blade goes up, holds and comes down rather than
  sweeping a revolution.
- ~~**Converging rings on `force_pull`.**~~ **Built 2026-08-16**, and it mattered
  more than it looked: `force_pull` was also *pushing* its victim away (the knock
  was unsigned), so the expanding rings were arguing with a fixed physics bug
  rather than merely duplicating the push's look.

### B2. Absorb the duel-cycle engine — **planned 2026-08-18, `docs/DUEL-ABSORB.md`**

The client had a second duel engine built (`handoff_duel_engine/`) to make the fights
**procedurally generated rather than a fixed pool of sequences**, plus a VFX/audio reimagining.
Three audits ran against it: the generator is sound (3.5M stepped beats, no deadlock, no invalid
beat, no off-stage fighter, all modules reachable) and everything around it is not adoptable — no
exports, not steppable in Node, unframeable under `frame-ancestors 'none'`, a global CSS reset, a
document keydown with no `isEditable` guard, Google Fonts against the CSP, 125 literal colours, six
free-running oscillators, and a rAF loop that keeps animating in calm.

**Decided: absorb the ideas into `src/fx/duel.ts`.** Five phases — the procedural generator,
character identity, new moves, VFX, audio. Names are operator-only; silhouettes stay instantly
identifiable. The plan, the measurements and the *not taking* list are in `docs/DUEL-ABSORB.md`.

**Phase 1 is shipped (2026-08-18).** The 28 hand-authored `SEQUENCES` are 28 `MODULES` — builders
that roll their arcs, counts and timing and derive every reaction frame from the move table — and
the director chains one to three of them under a single role coin, re-measuring the band before
each. An exact exchange now repeats within its own match on **0.03%** of exchanges, against
everything past the twenty-eighth before. Tempo unchanged (51.8s median vs 50.4s, benched
identically). The static gate is replaced by a generator gate: **224,000 sequences** built from a
fixed seed and asserted on, all five new assertions verified by breaking them.

**Phase 2 is shipped (2026-08-18).** The four silhouettes are a roster of eight in
`src/fx/fighters.ts` — four good, four evil, two pools of four pairings — with `back`/`head`/
`overlay` costume hooks and render-only proportion multipliers, and **each duel rolls its pairing
again on every match reset**, so the fighters change every ~52s. Costumes are stroked and never
filled (the rule behind *"they are holding shields"*, now gated), and each declares its reach so
`duelFocus` can frame it: measured over 320,000 frames, a flat clearance cropped the tall costumes
on 0.07% of frames and the per-costume one on 0.00%, for no loss of figure size. Three of the eight
were rebuilt after being *looked at* — stills rendered through headless Chrome, which is the method
worth reusing. Nametags were declined (deviation 8: a label over a 61px figure captions a fight).

**Phase 3 is shipped (2026-08-20).** Five moves and seven modules — a low sweep and the jump that
answers it, a ground roll, a back handspring, a turning parry, and a thrown blade knocked out of the
air. 36 moves, 35 modules, all reachable and gated. It also closed a defect that had been live since
the somersault landed: the ornament camera reported a standing width for a *rotating* body, so it
cut fighters out of frame on 8.61% of turning frames — now **zero, death holds included**, which
also retires the 10.8% death-hold clipping the 2026-08-17 pass left open.

*Thrown props* and *blasters* were **not** taken and that is a scope decision, not a deferral: both
need a new entity in an arena that has nothing in it, and none of the eight fighters carries a gun.
Say if you want either and it becomes a character conversation rather than an engine one.

**Phase 4 is shipped (2026-08-20).** Directional sparks off the contact, a silhouette flash on the
struck fighter lasting exactly the hit-stop, a directional kick to the frame, scorch marks on the
ground, and per-bone blade lighting. Three gates came with it and each was verified by breaking it;
one of them — that `drawDuel` hands the canvas back with a balanced save stack and `source-over`
restored — is worth more than the feature that prompted it, because the file now has five additive
passes where it had one. `docs/DECISIONS.md` has the measurements.

**Two things in it are the client's, and both are in `docs/DUEL-ABSORB.md`:** the blade light washes
bodies in the blade's colour, which widens the literal-colour carve-out that was granted for blades
specifically; and whether the kick's 4.5 world units and the light's 0.5 strength are right, which is
a still-image judgement made on contact sheets.

**One remains.** Phase 5 (audio) — and it still needs the call below on duel audio being fired by
animation rather than by a gesture.

**One thing for the client before phase 5 starts**, flagged rather than assumed: the site's rule is
*"every voice is fired by a gesture."* A duel clash is fired by the *animation*. The rule's purpose
— nothing plays uninvited, no `AudioContext` until a deliberate toggle — is satisfied as long as
duel audio only sounds when `sound` is explicitly on. Its letter is not. That is the client's call,
not this side's.

**Phase 2's naming residue closed itself and needs nothing.** The worry was that real names would
sit in the public JS bundle even when only rendered behind `isOperator`. No real name is used
anywhere — the roster is archetypes — so there is nothing in the bundle to worry about.

**What no bench can settle, and is the same open question as before:** whether a chained phrase
reads as one fighter pressing an advantage or as two exchanges glued together, and whether the
rolled rests land as poise or as a hang. It wants an eye on a real screen.

### C. Severing / dismemberment — **deferred by the client**

Asked for ("cutting in half, dismembering"), then deprioritised ("if the
severing is a pain and causes lag, dont do it" / "but yes, make the fights good
pls"). The fights got the time instead. If it comes back: draw the figure twice
under two clip rectangles split at the cut height, each with its own falling
transform, plus a bright cauterised edge. It is not expensive — it is fiddly,
and at a body ~100px tall behind copy at `dim: 0.55` it may not read at all.
Judge it on screen before building it.

### D. Prove the low-end path on actual low-end hardware

The tier system is measured and self-correcting (six tiers, demote in ~0.33s,
promote slowly, plus the probe on the greeting's OK). What has *not* happened
is running it on a genuinely old machine. If stutter survives even the 0.28
tier, the next lever is halving the canvas's update rate — 30fps for an ambient
background is barely perceptible and exactly halves its cost — but that should
be added only if measurement says it is needed.

### E. ~~The duel ornament wastes its slot~~ — **camera built 2026-08-14 (later)**

The ornament drew the whole 700-unit arena across a square slot, so a fighter
was ~20px tall on a phone in a mostly-empty box. `duelCamera` now tracks the
pair: median figure **61px at 190px, 109px at 340px**. It anticipates a jumper's
apex (so nothing clips), zooms out fast and in slow, and cuts rather than pans
at a match reset. `docs/DECISIONS.md` has the measurements; the background home
is untouched. Left for the client's eye: whether the health bars still feel
right now the figures are three times bigger.

Two follow-ons it surfaced, neither urgent:

- ~~**`flip_over` does not flip.**~~ **Fixed 2026-08-18.** One linear revolution
  about the body's middle, over a window derived from the move's own impulse —
  `2·vy/g` — so the feet arrive on the frame the turn completes: measured over
  171 landings at a median offset of **0 frames, range 0 to 0**. Adding it
  exposed the mid-air mirror described in section B, which had to be fixed
  first: without that, the figure turns inside out at the top of the arc.
- The camera is the only place on the site where the frame moves on its own. If
  that ever reads as too much, `CAM_PAN` / `CAM_ZOOM_*` are the dials, and
  clamping `CAM_MIN` and `CAM_MAX` together makes it a static crop again.

### F. Go over the whole site, page by page, desktop and mobile — **client request**

Client, 2026-08-14: *"go over the entire website, page by page, point by point,
feature by feature. review it, log bugs, errors, improvements, etc. then we fix
it all… fix both versions — desktop and mobile site. if possible, make
everything run faster."*

Standing permissions given with it: open and drive the live site in both bands,
test, change. **Removals and tone-downs for performance need sign-off first, and
the reason has to come with them** — the client's words: "if you must remove
stuff, or tone it down for faster performance, thats fine, just run that by me
first and why."

Scope, so it is not re-litigated later: all fifteen routes including the four
unlinked account pages and the footer pages, both bands, every layout archetype
(fourteen) rather than only the default, calm on and off, and the operator
surfaces. The two environment traps that have already cost sessions apply
throughout — `resize_window` silently fails, so the phone band is tested via a
same-origin iframe at 420×860; and strings are verified in the live DOM, not in
a green build, because a find-and-replace has already no-opped silently while
everything still built and rendered.

Worth deciding before starting: whether the output is one findings document the
client reads and prioritises, or a fix-as-found pass. The audit is large enough
that fixing as found makes it impossible to review what changed and why.

**Decided fix-as-found, with one commit per finding** (2026-08-16, client: "your
call for everything"). That answers the reviewability worry — the commit message
is the findings document, and each one carries its own measurement.

**Coverage so far.** All sixteen routes at the desk band, at both ends of the
tablet band (600px and 760px — the historic nav regression lived at 600 while
760 was fine), and at 420px. All fourteen layout archetypes at desk and phone.
Calm on and off across all fourteen. A full copy read-through. Measured on every
route: horizontal overflow, `h1` count, images without `alt`, controls without
an accessible name, unlabelled inputs, and tap-target size. **Result: zero
horizontal overflow anywhere, one `h1` per route, every control named, every
input labelled.** One finding, fixed: `.v-mail` on Contact was the smallest tap
target on the site at 30.7px.

**Still uncovered, and why:**

- **The operator surfaces** — the panel, the door, the command palette, the
  admin screens. Reaching them means signing in, which means entering a password
  into a form, which is something I will not do even against a throwaway local
  account. The wiring was verified statically instead and is sound: the panel
  maps over the live `PALETTES` / `PRESETS` / `LAYOUTS` / `PICKABLE_FX` /
  `ORNAMENTS` arrays with no hardcoded list, so every catalogue entry is
  necessarily present and pickable. What has *not* been seen is how any of it
  looks. Sign in and it can be reviewed from there.
- **"If possible, make everything run faster."** Partly done and not as a
  removal: the adaptive resolution tier could only ever fall, never rise, on a
  60Hz display, so one bad second pinned a machine to a soft canvas permanently
  (`FxCanvas`, 2026-08-16). Nothing has been toned down or removed, so the
  sign-off condition attached to this request has not been triggered.

  **All sixteen effects were then measured, and there is no fruit left on this
  tree** (2026-08-16, `fxlab.html`'s own steady-state readout, 654×368 device
  pixels at dpr 2). Steady cost per frame, worst first: `rain` 0.11ms, `plasma`
  0.12, `constellation` 0.07, `bokeh` 0.06, `flow` 0.05, and everything else at
  or under 0.04 — against a 16.7ms frame. `rain`'s first second is 0.54ms
  because that is when its glyph atlas is built, which is what the atlas is for.
  Scaled to a full-bleed retina canvas the worst effect is still around a tenth
  of the frame budget.

  So the honest answer to "make everything faster" is that the canvas is not
  what would be slow — the one real defect was the tier being unable to climb,
  and it is fixed. If a machine still struggles, the next place to look is
  outside the effects: the 369KB bundle, the 178KB of webfonts, or the layout
  cost of the 0.9s palette bleed. **Do not go tuning effect internals on
  suspicion; measure first, the bench prints the number.**

### G. ~~Docs that are now behind the code~~ — **done 2026-08-16**

- `docs/DUEL.md` had gone further wrong than "behind": it said the parry state
  was declined (it exists), that sound was not built (it is), that attract mode
  was live (it was removed), and left the health-bar question open (answered:
  ornament-only). All corrected in place rather than deleted, and its
  *Verification note* now carries the measurement method that found this
  session's ten defects — which is the part worth reusing on any other effect.
- `CLAUDE.md`'s deviation 9 now covers both the choreography and the rendering
  passes with their measurements.

## Do this first

### 1. ~~Close the harness's three coverage gaps~~ — done 2026-08-13

Harness snags, still true when running it: kill stray `wrangler dev` first (a
second instance silently takes 8788); delete `dist/_redirects` or run
`npm run predeploy`, never bare `npm run build`, before `dev:worker`; the
last-operator guard check skips if a non-`harness-` operator exists in local D1.

### 2. ~~Redeem one recovery code on the live site~~ — done 2026-08-14

Driven in a real Chromium against production with a throwaway account
(`fable-check` — non-operator, left in D1; remove via `/admin` if unwanted)
so the operator's own ten codes are untouched: signup → codes shown once →
sign out → redeem code → set-password ticket → signed in, `9 of 10` left →
sign out → sign in again with the new password. `wrangler tail` ran through
the whole browse: zero CSP reports.

### 2b. ~~App-shell/UI review~~ — done 2026-08-13 (eight findings fixed)

### 2c. By eye, in a real browser (needs the client)

Everything listed under *Unverified by eye* at the bottom.

### 2d. ~~The HUD pass~~ — built 2026-08-14; its four open calls decided the same day

The layout upgrade and the three presets are in and the build is clean.
The client handed over the four judgement calls ("do what is graphically the
best"); all four are decided and `docs/DECISIONS.md` 2026-08-14 has the
reasoning and the measurements. In short:

- **The contact sheet's duotone stays in calm — at the full 22%**, not the
  halved 10% it shipped with. Measured: over a tile image that is itself
  `opacity: 0.8` on a dark card, a 10% colour blend is invisible, so the
  half-measure was defending an effect nobody could see. The `.is-calm`
  override in `layouts.css` is deleted rather than retuned.
- **Presets stay operator-only.** A visitor's only appearance control today is
  the calm toggle — the shuffle, every picker and `.v-paste` are all gated, and
  "Show me something weird" navigates to the gallery rather than rolling. Public
  presets would be the site's first public appearance control.
- **The two duel backgrounds are re-listed** (see 6b).
- **`fxlab.html` is kept, `?site=` is not** (see the bench note below).

**The effects bench**: `fxlab.html` at the project root, opened at
`http://localhost:5173/fxlab.html` with `npm run dev` running. All sixteen
effects on one page, driven through `FxCanvas`'s exact frame maths from an
explicit **Step** button rather than rAF — which is why it works in a hidden or
occluded tab, the thing that blocked three sessions. It cannot reach production:
Vite's only build entry is `index.html`, verified by building. Do not add it to
a multi-page `rollupOptions.input`.

~~**Cannot be verified from this side**: the canvas effects.~~ **Done
2026-08-14.** All sixteen were rendered and looked at, at two viewport sizes and
two palettes, plus `hud`+`scan`, `hud`+`telemetry` and `terminal`+`rain` on the
real site. Circles are round; `plasma`'s grid arrives at ~58 columns across 1526
CSS pixels, so the per-frame `setTransform` is handing effects CSS pixels and not
device pixels. `scan` and `telemetry` read as intended.

Two things worth knowing for the next person who tries: nothing is visible unless
the tab is visible **and** calm is off. The verification browser reports both
`document.hidden` *and* `prefers-reduced-motion: reduce`, and calm hides the
canvas — that second half is why this looked unverifiable twice.

It found one real bug, in the default effect: `vessels` never rebuilt its tree on
a resize, so after a window resize the trunk sat off-centre and the side branches
floated detached in mid-page. A regression from the buffer change (before it,
`w`/`h` were constant). Fixed — `docs/DECISIONS.md` 2026-08-14 has the reasoning.

---

## Accounts

### 3b. Operator locked out — **runbook written 2026-08-16, `docs/ACCOUNT-RECOVERY.md`**

The client forgot the password to the only operator account and asked for a password-reset feature
"only for me". **Declined, with reasoning recorded in that document** — one already exists (ten
recovery codes, which restore grant authority in full rather than merely letting you back in), and a
second could not be scoped to one person, would require the escrow §5 rejects permanently, and has
no email to send to because §9 collects none.

The runbook is verified against the live schema: how to read the surviving credentials from the D1
console, the recovery-code and passkey paths, and — if both are gone — signing up a fresh account and
promoting it with one `UPDATE`. Two facts that make that last path cheap and are easy to get wrong:
a brand-new account signs in on the password alone, because the Worker only demands a TOTP stage when
a `confirmed_at` row exists; and the old account's sealed grant key costs nothing today, because
grants do not exist yet — the table is deliberately absent from `migrations/`.

**Known gap, deliberate:** a sole operator who loses password, recovery codes *and* passkey has no
in-product way back. The same property that makes operator reset safe makes self-rescue impossible.
The mitigation is the ten codes.

**Note for whoever holds the token:** `wrangler d1 execute --remote` fails with *"not authorized to
access this service [code: 7403]"* — this repo's token can deploy but not query D1. Use the
dashboard console.


### 3. ~~Operator password reset~~ — done 2026-08-13
### 4. ~~TOTP enrolment screen~~ — done 2026-08-13
### 5. ~~Passkeys, saved setups, dialog primitive, command palette~~ — done 2026-08-13

`⌘K` stays unbound (claimed twice — sign-off list); the palette opens by
typing `cmd`.

### 5b. Phase 2 — ~~plumbing and interface~~ — built 2026-08-14

Spec §13 and §12 K–S; migration `0004`; `worker/machines.ts` + the
`MachineSignal` DO; `src/share/*`; `/share` and `/machines` pages (typed
routes `share` / `machines`, linked from the `/signin` summary). Harness
drives every route, the ceremony crypto, and the path validator — the WebRTC
hop itself needs two real Chromium tabs, which is the client's walk-through.
Remaining inside phase 2:

- ~~**Grid and Column explorer modes**~~ — done 2026-08-14 (view switcher
  remembered per drive under `vessel.explorer.v1`, palette-drawn SVG file-type
  icons, Miller columns with cached panes, §10 progress wash, sortable List
  headers; calm collapses to List). Still inside §10 and deliberately
  deferred: **image thumbnails from actual bytes** — reading whole files over
  the channel to decorate a grid wants the phase-3 read-cap conversation
  first, so tiles use the drawn icons for now.
- **TURN** — mechanics specified (§12 P), enablement is a client spend
  decision; without it a hard-NAT pair fails with an honest message.
- **The Pi sharing host** (`docs/pi-sharing-host.md`) can now point its final
  step at `/share`.

### 6. ~~Lightsword duel rebuild~~ — ornament home done 2026-08-13

- **6b. ~~Un-hide the background `FX` entries~~ — done 2026-08-14**, on the
  client's handover of the four design calls. It was deleting two `hidden: true`
  flags, exactly as promised; indices 12 and 13 never moved. Both render and
  read correctly at background scale (checked in `fxlab.html`). Low risk because
  every surface reading `PICKABLE_FX` is operator-gated: no visitor gains an
  effect, and one only ever sees a duel if the operator publishes it.
  `PICKABLE_FX` now equals `FX` — keep both anyway; the flag is the mechanism
  for withdrawing an effect without moving anyone's share code.

- **6c. ~~Screensaver attract mode~~ — done 2026-08-14** (client request). The
  screensaver was already "the configured effect, alone, boosted" — it has no
  rendering of its own, so the client's "make the screensaver do the lightsword
  fight / the matrix rain" was live the moment the duels were re-listed. What
  was missing is that the duel stayed at *background* settings while asleep.
  It now eases to ~1.4× scale, `dim` 1 and health bars over the same 1.6s the
  chrome takes to fade, via `Frame.sleeping` and `DuelView.barAlpha`.

  **Unverified on the live site, deliberately said so**: the sixty-second path
  cannot be driven from here — the timer runs in a hidden tab but the render
  loop correctly parks, so the blend advances a frame or two per screenshot and
  never visibly grows. The ease itself was driven end to end on `fxlab.html`
  (its **screensaver** checkbox), which runs the identical code.

  **Still wants the client's eye**: the fighters are centred with their feet at
  80% height, which on Cinematic at a short viewport sits them behind the hero's
  CTA row. Attract mode does *not* address this — that is the non-attract state.
  Recommendation on 2026-08-14 was **leave it**: the effect is operator-opt-in,
  the screensaver is now the showcase so the in-page state can afford to stay
  recessive, and the collision depends on viewport height *and* where the
  fighters are in the match, so a fixed offset trades one layout's collision for
  another's. Flagged in `src/fx/effects.ts`.

### 7. ~~Sound~~ — built 2026-08-14. All three parts it was flagged as needing:

- **Control**: a `sound` chip in the header beside `calm` (hidden in calm, which
  silences audio anyway), plus the siteconfig panel and the command palette.
- **Persisted toggle**: its own key `vessel.sound.v1`, written only by the three
  deliberate toggles — calm's exact pattern, and now calm's exact rule. See
  `loadConfig`: the stored fields are the ones a visitor can set for themselves,
  and there are exactly two.
- **Share-code field**: **bit 16 of the existing toggle bitfield**, not a seventh
  field. Every code already minted has it clear, which decodes as sound off.

Synthesised in `src/audio/engine.ts` — oscillators and envelopes, no files, so
`SPEC.md`'s *Assets* rule holds. Pitch comes from the palette, so changing
palette retunes the site. Nothing plays without a gesture: no ambient bed, no
loop, no timer, and no `AudioContext` until the first voice.

**One thing for the client**: `sound` is publishable, so you *can* ship the site
with it on. Recommendation is don't — publishing calm makes the site gentler for
everyone and publishing sound makes it louder for everyone. A visitor's stored
preference always beats the published value, in both directions, so nobody is
ever stuck with it.

Not built, and a deliberate stopping point: **no ambient/generative bed**. That
is a different feature with different autoplay and taste problems, and this one
is interface feedback.

---

## Content and copy

### 8. Edit mode — operator-editable copy/images. **Architecture designed
2026-08-14; copy is unblocked, images are not.**

Copy follows the published-site-config pattern exactly: a **sparse overlay** in
D1 (new migration `0005`), injected into the shell by the Worker with its own
nonced script, validated field-by-field on the client with `pages.ts` as the
floor. That satisfies §11 literally — `ConfigContext` gains no fetch and the
first render stays synchronous.

Editable: `eyebrow`, `title`, `lede`, and per block `kicker`/`title`/`body`/
`items[]`, plus CTA labels. Not editable: block count and order (layouts are
tuned to them), CTA targets (a wrong `PageId` is a dead button), `img`, and
`hasMail`. **The five account pages are excluded** — their ledes make security
claims an operator must not be able to falsify from a text box.

**Images remain blocked** on the storage decision (R2 or similar).

Client decisions still needed before building: whether a block may be *blanked*
as well as rewritten; whether there is a draft/preview state (appearance has
none); and an acknowledgement that this makes the 404's joke counts
operator-overridable, quietly ending the verbatim-copy rule.
### 9. ~~A setup guide page~~ — built 2026-08-14 as `/setup`, "Let me look from here."

Scope agreed with the client: **remote access before a callout** — the page you
send someone so the fix does not need a drive. A page, not a download: a page
needs no file asset, works everywhere, and the visitor can still print it.

Order is deliberate. **Windows Quick Assist leads** because for a one-off look
"already on your machine, nothing to install, gone when you close it" beats an
account signup. **Tailscale is the standing option** for machines the operator
is in repeatedly, and is described honestly as what it is — a private link, with
screen sharing running *inside* it, not screen sharing on its own. **[SUPERSEDED
2026-08-26: Tailscale was removed. Its steps did not work and the unattended
reach it bought was never used. See the top of this file.]** Then what the
operator can see, how to turn it off, and a **scam-awareness block**, which was
not in the brief: a page telling people to install remote-access software is
exactly the page a scammer wants them to have read.

A **footer** page beside Now and Changelog, not a seventh nav pill — the six are
a settled design, and `NAV` is what `useOperatorRoutes` cycles and Radial's orbit
renders. Tailscale is named in prose, not linked; the site has no outbound links.

**It moved one word of protected copy**: the 404's "eight other pages" → "nine".
Those counts are jokes that depend on being true. Recorded in `CLAUDE.md` under
*Copy changes*. **Adding another content page moves it again.**
### 10. Photo slots hold Wikimedia placeholders (`docs/PHOTOS.md`); swap for
the operator's own when they exist, same treatment (EXIF stripped, lazy,
desaturated).

---

## Polish

### 11. Richer transitions/slide-overs/typewriter — **approach confirmed
2026-08-14, planned, not yet built.**

**Entrance-per-archetype**, chosen over two alternatives: each of the 14 layouts
enters in a way derived from its own structure, so the motion says *which
archetype you are in* rather than decorating. Typewriter confined to Terminal's
termbar path — not body copy, which is the scramble trap in another costume.
One shared slide-over primitive replaces the three separate keyframes the panel,
door and dialogs use today.

**A boot/page-load sequence was considered and cut.** The site already runs five
motion systems; a front-door sequence delays first paint for every visitor to
buy a moment only first-timers see, and it competes with the title scramble that
already owns that instant.

Full plan (14 entrances, six shared families, the primitive set, the cut list)
is in the session notes. Key constraints when building:

- Compositor-only properties. The client's requirement is literally "as long as
  the site doesn't lag."
- Ships behind an **Entrances** toggle in the Life signs row, defaulting on.
- **The share-code bit must be stored inverted** — bit 32 meaning *entrances
  off*. The default is on and every code in circulation has that bit clear, so a
  clear bit has to decode to *on*. `sound` got away with the plain reading only
  because its default was off.
- Bit 32 takes the toggle bitfield past one base-36 character (max 63 → `"1R"`).
  Harmless, but the comment in `shareCode.ts` and CLAUDE.md both say one
  character and would become wrong.
### 12. ~~CSP~~ — nonce plumbed and shipped **report-only** 2026-08-14
(`cspPolicy` in `worker/index.ts`; reports to `/api/csp-report`, logged in
`wrangler tail`, stored nowhere). Remaining half: **flip to enforcing** — one
header rename in `harden`.

**Measured against production 2026-08-14, and the blocker list is now one item,
not four.** Session notes in `docs/DECISIONS.md`; in short:

- **The reporting pipeline is proven end to end** — browser → Reporting API →
  `POST /api/csp-report` → a log line in `wrangler tail`. It had never actually
  been seen working. **Reports arrive ~55s late** (the `age` field said 55218ms):
  "nothing in the tail after ten seconds" is not evidence of anything, and that
  is almost certainly why this looked untestable.
- **The public site runs quiet.** Zero violations across all nine content pages
  plus `/signin`, `/signup`, `/machines`, `/share` and a genuine 404, with calm
  **off** so the canvas renders and sound **on** so the AudioContext is built.
  Zero Worker exceptions.
- **Three of the four surfaces close by inspection rather than observation.**
  Passkeys: `navigator.credentials.*` is not a CSP-governed fetch. TOTP
  enrolment: there is no QR code at all, just text and an `otpauth://` link — no
  image, no library, no external fetch. Canvas effects: pure 2D canvas, and
  `src/` contains no `eval`, no `new Function`, no `dangerouslySetInnerHTML` and
  **no external origin at all**. The phase-2 signalling socket is
  `wss://mcclevarty.ca`, explicitly allowed, and STUN via `RTCPeerConnection` is
  not covered by any shipped fetch directive.
- **What is left is one line**: `saveBlob` in `MachinesPage.tsx` builds
  `<a href="blob:…" download>`. A probe confirmed **`blob:` is not in the policy**
  — `connect-src` and `img-src` both reject it — but a `download` anchor is not
  governed by fetch directives, so it is *probably* fine. Probably is not good
  enough when being wrong means the operator silently loses file downloads.

**So: flip after one real download in the two-tab test**, and not before. That
test is already owed. `blob:` was deliberately **not** added to the policy —
it would not protect the anchor path anyway, and widening a security policy for
an unbuilt feature is backwards. It *will* be needed in `img-src` when the
deferred "thumbnails from actual bytes" lands (5b).
### 13. Cloudflare "Always Use HTTPS" — dashboard toggle, belt and braces.

---

## Security — found, reviewed, deliberately open

### 14. Password change is not a session-revocation event. Bounded by the
30-minute TTL / 12-hour ceiling; closing it needs a session table (design
change, not a patch).
### 15. ~~`/api/account/slot` authorises on the session alone~~ — password-proof
gate done 2026-08-14 (`assertPassword`, rate-limited; harness 258 → 260). The
TOTP half deliberately did **not** land there: the slot bytes are identical
whatever the caller intends, so a code requirement on that endpoint cannot
tell §12 K's password-only connect from §3's sign gesture — an attacker would
claim the weaker purpose. **The fresh-TOTP check moves to the phase-3
grant-submission endpoint**, which sees the signed grant itself; build it
before anything accepts a real grant. `docs/DECISIONS.md` 2026-08-14.
### 16. DNS hardening, in the dashboards (2026-08-13 audit; records in
`docs/SECURITY-AUDIT.md`). **Live state re-checked 2026-08-14, and
`mcclevarty.com` hardened the same day (§9b) — it had two SPF records, which is
a `permerror`, not a lenient policy.**

- ~~**DMARC**~~ — **done 2026-08-14, `p=reject`.** The two-week observation this
  item prescribed was made unnecessary by a fact, not skipped: the client
  confirmed neither domain has mail set up or needed, and a domain that sends
  nothing has no legitimate mail for a strict policy to break. Live:
  `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=…`. SPF is `-all`.
- **CAA: still none** (confirmed by query). The one item here that is a pure
  addition. `docs/SECURITY-AUDIT.md` §8 has Cloudflare's documented set verbatim.
  **Risk if done carelessly**: a CAA set that omits a CA Cloudflare actually uses
  makes certificate *renewal* fail silently, weeks later. The dashboard validates
  the set against its own issuance; the API does not.
- **DNSSEC: half done, and the ticket is now written and ready to send** —
  `docs/DNSSEC-TICKET.md` (2026-08-16). Cloudflare's half is enabled and the zone
  is signed; the DS is **not** published, so it is inert and safe to leave. The
  document carries a straight answer to *is this required* (no — but worth doing,
  because it is the only thing on the list that closes certificate mis-issuance
  via DNS, which CAA and HSTS both fail to), the paste-ready ticket, the
  verification commands, and the rollback.

  **The DS was re-derived from the live DNSKEY on 2026-08-16** rather than
  trusted: the derivation script was validated first against `cloudflare.com`,
  `ietf.org` and `cira.ca`, reproducing all three published digests exactly, and
  then agreed with both §7's recorded figure and Cloudflare's own. Key tag 2371,
  algorithm 13, digest type 2.

  **It could not be submitted from this side, and neither blocker is fixable
  here**: Namespro's ticket form carries a reCAPTCHA v2 checkbox, and the ticket
  wants to be filed from the signed-in account (their own form warns an anonymous
  ticket is untracked) — which needs the account password. Both are things this
  side must not do. The client sends it; everything else is prepared.

  **The bigger risk on this domain is not DNSSEC**: auto-renew is disabled
  (expiry 2027-Aug-09), and every protection in the audit is worth nothing the
  day the domain lapses.
- **Auto-renew is disabled on `mcclevarty.ca`** (expiry 2027-Aug-09). Noticed
  while in the registrar; not changed, because it is a billing choice. But every
  other protection here is worth nothing the day the domain lapses.

**Nothing here is reachable from this machine**: the wrangler OAuth token carries
`account (read)` and `zone (read)` only, no `dns_records (write)`. Doing any of
it needs either the dashboard or a scoped API token.

---

## Unverified / unresolved

- **All of phase 2 by eye**: pairing, drive picking, the agent tab's states,
  a real two-tab WebRTC browse and download, offline/re-attach/take-over
  flows, the `/machines` explorer — now including the Grid and Column modes,
  the icons, the wash, and the column slide (2026-08-14, unseen). The harness proves every route and the
  ceremony's bytes; it cannot run `RTCPeerConnection`.
- **Matrix rain fall speed** — rebuilt, never confirmed by eye.
- **Several palettes fail WCAG AA** — deliberate; calm mode is the remedy.
- **Animation cannot be verified from screenshots here** — occluded windows
  freeze rAF; motion needs the client's eye.

---

## Awaiting client sign-off

Found while building; none blocking. Reasoning in `CLAUDE.md` unless noted.

1. **`totp.last_step`** — a field §9's inventory does not list. Without it a
   TOTP code replays for up to 90s. **Recommend approving.**
2. **§3's operator row is stronger than the design supports** — the wording,
   not the cryptography.
3. **`⌘K` is claimed twice** — door (SPEC.md) vs command palette
   (SPEC-ACCOUNTS §10).
4. **Signup discloses handle availability (409)** while `challenge` hides it.
5. **TURN**: enable Cloudflare TURN (per-byte spend, short-lived credentials
   already specified) or leave hard-NAT pairs with the honest failure (§12 P).
6. ~~**Contact-page email**~~ — **closed 2026-08-16, no change needed.** The site
   assembles `patrickmcclevarty@outlook.com` while the address on file here is
   `…@hotmail.ca`, and the discrepancy was real but not a bug: the client keeps
   both. *"Hotmail.ca is my main email for personal stuff. Outlook.com is for
   business. I use both. keep outlook on the website."* The business address is
   the correct one for the one page with a job. **Do not "fix" this to the
   hotmail address** — it has now been queried twice and answered.
7. **Per-account subdomains: wanted at all?** If yes, an Origin allowlist must
   land first (`design/GUIDE-SUBDOMAINS.md`); if no, the guide can be closed.
10. ~~**Rolled visits are now two-thirds lightsword duels**~~ — **signed off
   2026-08-18, no change.** Hiding the four circles leaves the dice choosing
   among duel/duelholy/sonar, and the live site publishes `mode: "visit"`, so
   sonar is the *minority* outcome of a roll. Put to the client with the lever
   named (weighting or trimming `ROLLABLE_ORNAMENTS`, never un-hiding the
   circles); their answer was *"your call. I want random, but I do like the
   lightsabre fight"*. Both halves of that are satisfied by the current
   behaviour — the roll stays random and the outcome they like is the common
   one — so the weighting stands as it is. **Do not "correct" the distribution
   toward sonar on the strength of the 08-17 note above**: it read the split as
   a possible defect, and the client has since read it as the feature.
   **Re-read this as being about the operator alone (2026-08-28):** the duels are
   operator-only now, so a visitor's dice contain no duel at all and this split
   describes what *he* sees signed in. The distribution is unchanged for him and
   still stands as signed off.
11. **A republish may be needed for the withdrawn circles to fully go**
   (2026-08-17). Hidden means unlisted, not invalid: if the currently published
   config names Lens/Valve/Aperture/Orrery, first-time visitors keep getting it
   until the operator republishes. Check the published row after deploying.
8. **When to retire the Pages project** — it is the rollback; retiring it
   deletes the `_redirects` trap class.
9. ~~**Free-diagnostic copy rewrite**~~ — done 2026-08-14. The client's words:
   *"i dont do free diag. a mechanic will still charge you to diagnose your cars
   issues."* Home's "the rate" block ("Free diagnosis, always" / "you pay
   nothing") and Contact's step three ("Fixed, or you pay nothing") both carried
   a promise the business does not make, on the two blocks whose job is sending
   people to Contact. Both replaced; neither names a fee.
   **No figure on the site, by decision.** The client offered either an invented
   number or "discussed on contact" and left the choice to this side. No number:
   the site already refuses to be a quote machine, Contact's three steps already
   put a price in step two, and one flat fee cannot honestly cover both a laptop
   that will not boot and a drive that has stopped spinning. The copy describes
   the flow that already exists and stays true whatever the client charges, so
   setting a rate is a business decision that needs no further copy change.

   **No credentials named either**, though the client has them (senior analyst
   and sysadmin, college credits, vendor certs). `about` is built on "No name,
   no face, no city … the work speaks"; a list of MSP vendor logos would
   contradict that page and means nothing to someone with a slow laptop. The
   client's own instinct — "less is more for this part" — is the right one.

---

**Starting a session?** `docs/HANDOFF.md` has a paste-ready prompt, the deploy
verification block, and the list of things that cannot be verified from this side.
