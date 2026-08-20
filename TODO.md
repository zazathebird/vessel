# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are, and `docs/DECISIONS.md` records what was decided when; this file is only
what is left to do.

---

## 2026-08-19 — open, and waiting on the client

Two things on `/downloads`, both blocked on something only the client has.

1. **The catalogue is empty and needs his files.** The bucket exists, the
   migration is applied, the gate is proven end to end (`docs/DECISIONS.md`
   2026-08-19), and `docs/DOWNLOADS.md` is the runbook. Per program: the file,
   a name, one plain sentence, platform, version, and free or code-only. The
   `author` field is deliberately awkward — fill it in when the program is not
   his, and check that its licence permits redistribution, which nothing here
   can check for him.

2. **The page is being redesigned outside this repo.**
   `design/claude-design-downloads.html` is the handoff: the page as it stands
   today, self-contained, four boards (desk locked, desk unlocked, phone, empty),
   real class names, stylesheet rules lifted verbatim, both fonts embedded. The
   client is taking it into Claude Design and bringing back a direction to
   implement. **The constraints that cannot be designed away are written out in
   the comment at the top of that file** — the safety notice's position above the
   list, no prices, palette tokens only, an unlock that moves nothing, a plain
   anchor for the download, and no design that implies an account. Implementing
   means `src/components/DownloadsPage.tsx` and the `.v-dl-*` block of
   `src/styles/chrome.css`; the handoff keeps the class names so it is a
   translation rather than a rewrite. The file is a design artefact and ships
   nowhere: Vite builds one entry, so `dist/` never sees it.

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

**Two remain.** Phase 4 (VFX — directional sparks, scorch decals, real blade lighting; **no
shadow-blur glow**, see the render-cost measurement), phase 5 (audio).

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
screen sharing running *inside* it, not screen sharing on its own. Then what the
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
