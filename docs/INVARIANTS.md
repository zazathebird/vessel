# Invariants by subsystem

Companion to `CLAUDE.md`, which holds the rules that bite in any session. This file holds the deep
per-subsystem detail: read the section before touching that subsystem. Same doctrine as `CLAUDE.md` —
each entry is a rule and the shortest reason it exists, not the history of how it was found. History
is in `docs/DECISIONS.md`.

**Contents:** [FX and canvas](#fx-and-canvas-internals) · [Known deviations](#known-deviations-from-the-prototype) · [The duel](#the-duel) · [Accounts](#accounts--the-invariants) ·
[The sharing host](#the-sharing-host--the-invariants) ·
[The setup scripts](#the-setup-scripts--the-invariants) · [Downloads](#downloads--the-invariants)

## The duel

Design and phase history in `docs/DUEL.md` / `docs/DUEL-ABSORB.md`; the reference engine is
`handoff_duel_engine/duel-cycle-v2.html`. Costume work has its own skill (`duel-costumes`), which
also covers how to *see* any of this — rAF parks in an automated browser, so use
`scripts/duel-shot.mjs`.

**Fighters and costume** (`src/fx/fighters.ts`, **a roster of twenty-four — twelve a side**):

- **The body is a mass and every mark carries its own edge — "the carve", and it is not optional.**
  Each shape is laid down in the palette's **background role** at a wider line before it is drawn in
  ink, so a helmet stops where the skull starts and the near leg crosses in front of the far one;
  each bone is a tapered capsule, two per limb, so the elbow and the knee are joints you can see.
  `paper` is a **role, not a literal** — it cross-fades with the 0.9s bleed and holds on all 25
  palettes. It would read as a light *gap* rather than a dark rim on a pale palette; **there is no
  pale palette here**, so today it is always a rim. **Adding a light palette makes that a live
  question again.** **`rim: 0` disables it and is the rollback**, also the right value for any
  surface drawing the duel over an image rather than a palette. **Do not revert this to strokes** —
  the flat, wire look it replaced is the thing the client rejected by name.
- **The carve reaches every costume through `solid()` and `strokeInk()`.** A hook that ends in a bare
  `ctx.stroke()` is uncarved and back to being a wire. **Two are deliberately bare**: the prophet's
  halo rings, drawn in the blade colour, because a background-coloured rim around a glow is a hole
  punched in the thing that is meant to glow.
- **`solid()`'s inner shadow is clipped to its own mark** — a second value *inside* one shape, never
  across the body. Nothing else on the body gets a second interior tone, and cloth alpha must not be
  raised to compensate for the new edges: the carve already separates a cape from the legs, and alpha
  is what stops it becoming a shield.
- **Mass is allowed; a slab is not** — the rule is not "never fill", but a filled shape covering the
  torso must be faint enough to read the body through.
- **Two shapes on one head need a gap between them, or they merge into a third shape neither of them
  is.** Three costumes were built and lost this way. Each was fixed by *moving* a shape, never by
  enlarging it. **The carve weakens this and does not retire it.**
- **A proportion has to be pushed past what looks right in the source.** At ~61px two rig units is
  one pixel.
- **Interior detail is not a costume — the outline is.** A costume can obey every rule and still read
  as an undressed rig; what fixes it is a change to the *silhouette*. The count turned out to be the
  wrong lever — what fixed the flatness was the carve, one level down. **The exhibits for these rules
  were among the sixteen costumes cut, so the lessons are older than anything you can look at. They
  are still true.**
- **Judge costumes on the contact sheet, never in a single duel** — `duel-shot.mjs sheet` takes
  `--only a,b,c` and `--px N`. **Add costumes in tranches and look at the sheet between them**; the
  question is whether they are telling apart in a row, which cannot be asked of one fighter.
- **The pools are derived from `side`, never hand-written** (`ROSTER_GOOD` / `ROSTER_EVIL`). Two
  lists that must agree with the roster is precisely how four of the original eight became
  unreachable.
- **`NEVER_MEET` answers two costumes that read alike, and it is not empty.** Three pairs are in it:
  gunslinger/ringmaster (the worst, and not the pair that was predicted), sentinel/executioner and
  executioner/viking. **The costumes were kept and the pairings withdrawn** — the client's call, and
  what the mechanism was built for.
- **The duels' slot is widened on the phone *and* the tablet** — `band-phone` is `min(72vw, 300px)`,
  tablet `min(52vw, 340px)`. The tablet band starts at 561px, where the shared `34vw` is 190px, below
  what the costumes were authored for. No visitor can be shown a duel, so a wider hero costs only the
  person who gets the benefit. **`scripts/duel-shot.mjs` renders the real slot widths** — hard-coding
  an old value makes the tool that answers *"do any two read alike on a phone"* answer it at the
  wrong size.
- **A fighter has a `stance`, and it moves the hips and the feet only.** Identical bodies in one
  identical guard is what made the roster read as one fighter — which matters more at twenty-four.
- **`prop` carries `head` and `build`; `proportion` is `shoulder` / `weight` / `hunch`, with
  deliberately no height multiplier** — the blade is drawn inside the same transform as the body, so
  scaling height scales reach.
- **Every costume declares its own `headroom` and `duelFocus`** — a flat clearance was right for
  marks that sit on a skull and wrong for horns and haloes. **`headroom` has two consumers**: the
  camera frames to `max(26, headroom + 16)`, and the health bar sits at
  `min(max(34, headroom + 8), max(26, headroom + 16))` — clear of the costume, inside the box the
  camera fits. **The gate drives `drawDuel` and reads the emitted rectangle**; re-deriving the
  formula leaves it green against a reverted renderer.
- **The costume gate sweeps the off hand.** Pinning it to one guard pose measures every mark hanging
  off a *hand* in exactly one position, which is how a slab shipped. It drives the renderer's three
  hard-coded off-hand positions plus both ends of the holding arc.
- **`back` hooks draw before the legs** — a cape drawn last swallows the limbs it hangs off.
- **No real names, anywhere** — the *client's* rule, in his words at the top of `src/fx/fighters.ts`:
  *"do not name them on pages that are not accessible only by me, to avoid any copyright or legal
  bullshit."* They are **not used at all**, not even on operator-gated surfaces, because a name sits
  in the public bundle even when nothing renders it. He asks for named characters periodically and
  has proposed "similar but not identical" — that is not a way round it; substantial similarity is
  the test. **The argument that actually lands is technical**: this engine draws a silhouette plus
  one signature shape at ~200px and cannot draw face detail at all, and those characters are
  recognised by *face*. Folklore was designed as silhouette and is free.

**Visual legibility — measured, and the measurement cannot be gated:**

- **`npm run check` has no rasteriser**, so *"is this effect actually visible"* is measured offline
  with `scripts/fx-shot.mjs` plus a peak/coverage script, never asserted. The effect gates drive a
  recording-context stub, which can say a path was built and never that anything can be seen.
- **Score effects on peak *and* coverage, never on mean difference from the background.** The mean
  conflates a large area slightly different with a small area very bright, and it ranked
  `constellation` least visible of the sixteen when its lit points are among the brightest — it is
  *sparse*, not dim. Peak (99th percentile channel distance from `bg`) plus % coverage separates the
  two. **An effect must stay short of the loud end deliberately**: it sits behind body copy on
  palettes already near the contrast floor. The baseline is in `docs/DECISIONS.md`.
- **A sub-pixel line loses twice** — it is antialiased into a fraction of the alpha it asked for, so
  a hairline at low alpha is dimmer than its numbers say.
- **Frequency is not character.** `flow`, `telemetry` and `aurora` were three effects whose whole
  read was *horizontal wavy lines*. Each `telemetry` lane now carries a different **shape** —
  analogue sine, sample-and-hold steps, a noisy sensor, a sawtooth with a hard reset, a pulse train.
  Shape is what distinguishes one channel of a real instrument from the next. **Reach for a different
  shape before a different frequency.**
- **Noise in a trace is hashed from the sample index, never `Math.random`.** Random per frame makes
  the lane *boil*, which undoes the one thing the playhead exists for: the trace must hold still
  between sweeps.
- **`--line` is never a canvas stroke somebody needs to see.** It is the hairline *border* token at
  1.22–1.61:1, and on canvas that reads as *absent*, not faint. It has been the bug three separate
  times, once meaning **the orbits were missing from Orbits**. Use `--faint` and let **alpha** carry
  recession. The one legitimate canvas use left is the duel's ground line.
- **A phase used as `x % 1` needs a positive modulo.** `%` keeps the sign of its left operand, and
  `telemetry`'s trace time is genuinely negative for the first few seconds of a page load — then
  corrects itself, which is the kind of fault nobody reproduces because by the time you look it has
  stopped happening.

**The choreographer** — fighters decide nothing:

- **No sequence names a side.** Every beat is `ATT` or `DEF`, and the role coin consults nothing —
  not health, not position, not who won last.

  **The fairness gate measures that coin, and it counts THROWS rather than sequence starts.**
  `chooseSequence` throws the coin only when `st.dir.chain` has reached 0, because a chained phrase
  deliberately reuses its aggressor; **entering those repeats as independent samples is a modelling
  error.** It also counts the opening throw of each new match. **Both halves sit at 4σ, and the round
  count is what pays for that** — twelve rounds, ~478 matches and ~6,690 coins a pass. **A threshold
  may only rise when the evidence does**; raising the *win* bar to quiet a failure, on the same ~119
  matches, is the "raise the threshold until it stops failing" this file warns against. **The win
  count is not a formality** — a fair coin does not prove fair outcomes, since damage, reach or the
  reaction table could be asymmetric under a perfectly fair director.
- **Nothing waits on a condition** — sequences have fixed lengths and the director advances
  unconditionally.
- **`dist` is the sole authority on whether a blow lands.** Sparks come off the true blade-to-blade
  crossing, but gating *damage* on blade geometry is what made blocked strikes drop damage.
- **Every reaction frame is derived from the move table, never typed.**
- **Modules chain; they do not concatenate** — one to three run under a single role coin, which is
  what a run of pressure by one fighter looks like.
- **`Module.hits` must hold on every roll**, because the anti-stall rail filters on it.
- **`buildSequence` sorts the beats and the gate still asserts builders emit them sorted** —
  `runDirector` walks the array in order and stops at the first future beat.
- **`st.dir.pressure` resets on match reset**, which is what makes the anti-stall rail per-match.

**Tuning, and where it may live:**

- **The duels are operator-only, and that is a lock rather than a default** (client: *"lets keep it
  as a feature for just me unless i otherwise say so"*). `operatorOnly` on the `duel` and `duelholy`
  entries in **both** catalogues — `src/data/ornaments.ts` and `FxEntry` in `src/data/catalog.ts` —
  covers the hero ornament *and* the two full-screen background effects. **It is a different axis
  from `hidden`**: `hidden` is about *the picker*, `operatorOnly` about *the page*.
- **Enforced where the thing is drawn, never at the storage end.** A published config or a share code
  naming a duel still resolves to one; it renders as `DEFAULT_ORNAMENT` / `FALLBACK_FX` for anybody
  not signed in. Enforcing it on the way in would mean the operator's own published config silently
  rewriting itself. `ConfigContext` resolves it once and exposes `ornament` and `fx` beside the
  adapted `layout`; `Ornament.tsx` and `FxCanvas.tsx` read those, never `config`.
- **A roll site reads `live.current.isOperator`, never the closed-over one.** `shuffle` and `setMode`
  have stable dependency lists, so both callbacks are built once — on the first render, where
  `isOperator` is still false because the session probe has not settled. It fails safe, which is why
  nothing reported that the operator's own shuffle button could never roll him a duel.
- **`roll()` takes `isOperator` and it defaults to `false`, which is the point.** Four routes deliver
  a config — published, share code, storage, dice — and **the dice are the one nobody checks**. A
  caller that has not thought about who is looking gets the pool that is safe to show anybody.
- **The operator's per-load ornament roll is component state and never a patch to `config`.** A roll
  written into config gets published the next time he presses Publish for an unrelated reason — the
  dice would quietly become the site. It **cannot live in the mount-only boot roll** (`isOperator` is
  false until the session probe settles), the pick happens **outside the updater** (StrictMode
  double-invokes them), and it **yields the moment he picks an ornament himself**.
- **The four withdrawn circles are deliberately not in the operator's roll pool.** He called them
  lame and had them withdrawn; putting them back into his own dice restores rejected work by the back
  door.
- **The duel is configuration, and it publishes** (client: *"i want complete options for the duels
  for everyone n djust for mysef."*). The settings publish to every visitor, and the operator drives
  them live without publishing. **Do not restore the old "never published" rule from an earlier
  reading of this file.** The risk has moved rather than gone: it is now "a bad value reaches every
  visitor at once", which is the exposure every published appearance field has, and it is what
  `validDuelSettings` answers — **refusing rather than repairing**, field by field.

  Four multipliers — `circling` (the pick weight of the seven modules containing no blow), `rest`
  (the slack past the last move's *end*), `impact` (hit-stop frames), `patience` (the anti-stall
  threshold) — plus the pinned pairing, the per-side roster allow-lists, `rim`, `zoom`, `bars` and
  `kick`. `src/data/duelSettings.ts` owns the type, the bands and the validation.
- **`Config.duel` is the site default and `Config.duelPages` is a *sparse map of partial
  overrides*.** Partial is load-bearing: a full copy per page means sixteen of the seventeen silently
  going stale the next time the site default moves. **Partial reaches inside `tuning` too, which is
  why it is `DuelOverride` rather than `Partial<DuelSettings>`** — the latter's `tuning` is the whole
  four-knob object, so the editor could not express "this page disagrees about Patience" and wrote
  all four at their *resolved* values: the same failure one level down. Gated with a knob-level
  override.
- **`validDuelPages` walks OWN keys, never `key in`.** `"constructor" in full` is true, so a
  published `{ tuning: { constructor: 1 } }` threw inside `loadConfig` on every visitor's first
  render. Gated with `constructor` and `__proto__` at both levels.
- **`validDuelPages` drops a refused key; it does not keep it at the default.** Leaving it at the
  global default is right for the site object and precisely wrong for an override — the refusal
  becomes a *working* override pinned to the default, shadowing whatever the site said. **The test is
  identity with what came in**, since from outside a refused field and one that legitimately equals
  the default are indistinguishable. A partly-salvaged list counts as refused.
- **A null allow-list means "the whole side" and is not the same as listing all twelve** — a null
  keeps up with the roster, a written-out list stops including anything added after it. **A
  restriction that would empty a side is refused** and falls back to the whole side: a hero slot
  drawing no fighter is indistinguishable from a broken page.
- **The restriction rides on `DuelState.allow`, not on the call that rolls the pair** — the re-roll
  happens inside `advanceDuel` on a match boundary, where the caller is a rAF loop that has long
  since forgotten what it was configured with. Honoured only on the opening match, it comes back as
  *"it ignores my settings after a minute"*.
- **The knobs ride on `DuelState.tuning`, defaulting to the `DUEL_TUNING` global by reference.** They
  cannot be a global alone: **`/admin` renders three duels at once** — hero ornament, bench, and the
  settings editor's preview, whose whole job is previewing a *different page's* settings. Each host
  assigns `st.tuning` in its own frame loop; a fight that says nothing still tracks the global.
  Gated, including a source check that all three hosts hand it over.
- **A frame delta is floored at 0, never above it.** Every host clamps with
  `Math.min(3, Math.max(0, …))`. The `min` stops a stall teleporting the world; a floor of 0.2 is a
  300Hz frame, so a faster display had its real delta rounded *up* and a 500Hz panel ran 1.67× fast.
  Nothing needs a floor: `advanceDuel` accumulates fractional frames.
- **A pinned pairing must be one alignment against the other.** `pin` bypasses `rollPairing`, so it
  is the one route into the engine `ROSTER_GOOD` / `ROSTER_EVIL` do not guard. Refused whole;
  swapping in a legal opponent would be a repair. Gated over all 576 orderings.
- **A pool that weighs nothing is picked from evenly.** At `circling: 0` every blowless module weighs
  zero, and a `|| TOTAL_WEIGHT` fallback summed over the *whole* list is larger than any filtered
  pool can subtract, so the pick was `pool[0]` every time. **The gate asserts at the source rather
  than pretending to drive it** — a behavioural test that can only pass is not a test.
- **`DEFAULT_DUEL_SETTINGS` and `DEFAULT_DUEL_TUNING` are frozen.** `DEFAULT_CONFIG.duel` hands out
  that exact object and `persistence.ts` spreads it shallowly, so it is what every un-published
  visitor's config points at.
- **The two `PUBLISHED_KEYS` lists are compared whole, in both directions** — looking up fields by
  name gates the one being added that day and leaves every later one uncovered. **`MAX_CONFIG_BYTES`
  is 12,000, it throws, nothing truncates to it, and the ceiling is measured in BYTES** —
  `JSON.stringify(...).length` counts UTF-16 code units, so 11,921 CJK characters passed as "under
  12,000" at 35,721 actual bytes. Truncating would inject a half-object that `loadConfig` then
  correctly refuses field by field, leaving the operator watching settings silently not apply.
- **Size goes *through* `duelCamera`, never over it.** `zoom` is a **request bounded by the fit** —
  capped at the largest scale that still holds the focus box, so a wide pose stops getting bigger
  rather than losing a head, and always free to pull out, deliberately under `CAM_MIN`. Applying it
  after the fit voids the guarantee the camera gate exists to prove. One clamp; all three hosts go
  through it. **The gate reads the three call sites as well as driving the camera** — driving the
  camera alone stays green when a host drops the argument, which is the bug.
- **`DuelSettingsEditor` publishes and `DuelBench` does not, and no control appears on both.** A knob
  that publishes cannot also be a knob that does not. **There is one publish button for the whole
  appearance**, in the site-config panel; a second here would be two routes that can disagree about
  what is live.
- **Share codes carry none of this, and that is decided rather than pending.** A share code is *a
  picture of the look*; `duel` and `duelPages` are *a document* — a sparse per-page map whose entries
  are partial and two of whose fields are variable-length fighter lists, about 6.8KB fully specified.
  **The compromise is the thing to refuse**: encoding the site-level settings and dropping the
  per-page map yields a code that reads as complete and silently omits part of what the sender was
  looking at. **`SharedConfig` being a `Pick` is what makes it safe** — a decoded code is applied as
  a patch, so pasting a setup keeps the duel settings you already had. Widening it breaks that
  silently.
- **Every default is 1 and 1 must stay arithmetic identity.** Each knob is a multiplier on a value
  the fight already rolls, never a replacement, so 360,000 stepped frames and 280,000 generated
  sequences pass unchanged. A default that merely *looked* neutral would move every duel gate at once
  — and they are the gates that cannot be eyeballed.
- **`rest` scales the slack, never the moves.** A move's frame count is what every reaction frame is
  derived from; scaling moves would slide contacts out from under the beats that answer them.
  **The slack is signed, and clamping it at zero costs `rest: 1` its identity** — four modules
  deliberately roll a length shorter than their last move's own end, because a trailing drift may be
  cut short and nobody sees it. **Positive slack is rest and scales; negative slack is a deliberate
  cut and is not rest at all.** Gated by comparing `buildSequence`'s length against the module's own
  roll.
- **The measurements the knobs exist to move**, at the defaults, over 200 complete matches: median
  match **50.8s**, **62% of frames neutral**, 12% striking, **1.9% in hit-stop**, and **30.6% of
  module picks contain no blow at all**.

**Physics and rendering:**

- **`advanceDuel` drops a non-finite delta rather than clamping it.** `Math.max(0, NaN)` is `NaN`, so
  one bad frame count makes `st.acc` `NaN` for ever and every later call is a silent no-op with no
  way back short of a remount. **The hosts' own clamps do not catch it.**
- **A match reset is a cut, and nothing may show through it.** `clash`, `hitStop`, `shake`, `sparks`
  and `scorch` clear with the fighters. `clash` is the one with a symptom: a cooldown of up to 30
  frames, so a match ending just after a blade cross opened the next one unable to spark. **`dir.pressure`
  is deliberately not asserted at zero on the turnover frame** — the reset sets it to 0 and
  `runDirector` runs later in the same `step`, so 1 there is the rail working.
- **The duel integrates against `dt` (real elapsed frames), never `boost`.** Every other effect is an
  ambient field and should surge when the page is scrolled or asleep; a duel is a performance and
  keeps its own tempo. Deriving from the effect clock ran it at ~2× under the screensaver.
- **A move that crosses the opponent declares `pass`, and facing is frozen for its duration** —
  `stepFighter` re-derives `facing` every frame otherwise.
- **The body-separation exemption is a *ground* pass** — a pass with no vertical impulse, not any.
- **A `quick` beat is a riposte, and it is a property of the beat, never a runtime test.**
- **`Move.carry` names what the *body* does, and the renderer branches on it rather than on move
  ids** (`flatten` / `tumble` / `roll` / `crouch`) — **including for its timing**. Two moves declare
  `carry: "crouch"` at different lengths, and dividing by one move's frame count stood the longer one
  upright with its blade still down. Gated as the general form — no carry branch in `drawFighter` may
  name a move — because the fault is the shape, and `flatten` and `tumble` are also shared.
- **A low sweep cannot descend** — a blade coming down travels through everything between the guard
  and the floor. Geometry, not taste.
- **The somersault's tumble is derived from its own impulse, never typed** (flight time `2·vy/g`).
- **`the-lock` closes the pair to `LOCK_SEP` itself** — `close` range is nowhere near close enough
  for two 58-unit blades to meet.
- **The hit flash decays in `step`, above the fairness coin — never inside `stepFighter`**, which
  does not run while `hitStop` counts down. The flash *is* the hit-stop made visible.
- **`runDirector` runs below the hit-stop early return**, so the exchange clock freezes with the
  fighters it is scripting.
- **`spawnSparks` scales the contact bias with one draw, not two** — two independent
  `1 + random()*2` multipliers do not scale a vector, they shear it.
- **One function decides where sparks go, and it is the grinder model** (`contactSpray`).
- **A hand that is not holding anything cannot bounce** — the deferred recoil off a block would
  otherwise end a throw mid-flight and snap the sword back.
- **The scorch ramp is the palette's** — white → orange → dark as `core` → `spark` → `line`.

**The camera:**

- **`duelFocus` reports where a rising fighter is *going*, not where it is** (apex is `v²/2g` above).
- **A rotating or fallen fighter is wider than a standing one** — 51 units rotating, ~87 lying down,
  against `BODY_W` of 30 — and the camera must be told, or it frames a corpse as though it stood.
- **The zoom is asymmetric — out fast (0.13), in slow (0.03)** — pulling back is a correction that
  must arrive before the thing it is correcting for.
- **A match reset is a cut, not a pan.** The fighters teleport back to their marks; easing whipped
  the camera 43px in one frame.
- **The kick is ornament-only, bounded, and the camera knows about it** — kicks take the larger
  displacement rather than summing.

## Accounts — the invariants

`design/SPEC-ACCOUNTS.md` is approved and authoritative. **Read it before touching any of this.** §12
is a decision log where every rejected option keeps its reasoning and a *"revisit if"* condition —
add to it rather than relitigating.

- **Sign-in is password + TOTP, with passkeys retained** as an alternative credential. **No email is
  collected**, and the operator can reset any password — which is what makes email unnecessary.
- **Key slots (§5) are the load-bearing idea** — one grant keypair per account, wrapped once per
  credential, LUKS-style, so any credential opens the same key. This is why operator reset is safe:
  it deletes the password slot and cannot open it. **Operator escrow is rejected permanently**: a
  slot wrapped to an operator key would let the operator sign grants in a user's name, the exact
  thing the design exists to prevent.
- **The password never reaches the server** — the browser runs PBKDF2 and sends a derived auth
  secret, of which the Worker stores only an HMAC under a pepper. Do not "simplify" into a
  server-side hash; it also dodges the Worker CPU cap.
- **No personal data, and §9 has the full inventory** so the claim can be checked. **Adding anything
  to that inventory is a spec change, not an implementation detail.**
- **Phases 1/2/3 must not be collapsed** — phase 2 fails as "my files don't load", phase 3 as "a
  stranger read my files."
- **Authentication works end to end before any interface work starts.**

**Where the code is.** `worker/index.ts` serves the static site via the assets binding with `/api/*`
the exception — **delete every route and the site serves as it does today**, which is what "accounts
are strictly additive" has to mean. Server halves: `accounts.ts` over `session.ts` / `totp.ts` /
`crypto.ts`, plus `admin.ts`, `site-config.ts`, `rate-limit.ts`, `machines.ts`, `signal.ts`,
`webauthn.ts`. Browser halves: `src/auth/` and `src/share/`. **Grants and invites remain deliberately
absent from `migrations/`** — an empty `grants` table is an invitation to fill it before the phase
that hardens it.

`scripts/auth-e2e.ts` imports the **real** `src/auth` modules, through a fetch shim intercepting
**only relative URLs** so the raw `Client`'s cookie isolation survives, and computes TOTP codes
independently from RFC 6238 — so it fails if browser and Worker ever disagree about a byte. Its
`d1()` helper shells out **asynchronously on purpose**: a blocking `execSync` stops undici noticing
closed keep-alive sockets and the next fetch dies with a phantom "could not reach the server".
`scripts/webauthn-sim.ts` *encodes* the CBOR/DER the Worker *decodes*, independently, as a second
opinion. **It imports `ws`** because Node's built-in WebSocket cannot send a cookie header — the
no-third-party-libraries rule is about the site, and the site gained nothing.

**Known wart:** the two pure wire-format sections in `auth-e2e.ts` sit *after* the reachability gate
that `process.exit(1)`s when the Worker is not answering, so running `npm run test:auth` without
`npm run dev:worker` runs **none** of them and exits looking like an environment problem. Until they
move above the health check, start the Worker.

### Decisions that are easy to "fix" back into bugs

- **Every admin route that WRITES demands the caller's password, not just their session**
  (`proven()` in `worker/admin.ts`). A session says who you are, never how you proved it. Gated on
  the flag alone, a stolen operator cookie POSTed to `/api/admin/operator` and granted itself the
  operator flag *permanently*. **`listAccounts` deliberately does not ask** — it is a read, and a
  password prompt in front of a list is a password typed carelessly. One helper rather than four
  inline calls, so the fifth admin write inherits the proof.

  **The downloads editor and the site publish follow the same rule, drawn at RELEASES — what
  somebody else can get *or is told* — not at writes** (the client's decision, 2026-09-06; moved to
  include "is told" and withdrawals on 2026-09-24, review item 18). Eight routes ask: `mintCode`,
  `addGrant`, `finishUpload`, `deletePage`, `deleteFile`, `publishSiteConfig`, and the two
  withdrawals `revokeCode` and `removeGrant` — `finishUpload` is the worst write on the site, since a
  stolen cookie could put replacement bytes under a program's existing link. Drafts, reorders, new
  file rows, upload begin and parts stay session-only. **Gated in both directions** — so do not
  "harden" a draft save into a prompt, and do not "simplify" `finishUpload` out of one.

  **And three of the saves ask when — and only when — they WIDEN or the page is LIVE NOW**:
  `savePage` when a page goes `live`, a live page's visibility opens (`granted` < `code` <
  `unlisted` < `public`), or the page is already live (so a retitle, a narrowing and an unpublish of
  a live page ask too — that text is what customers read); `saveBlocks` when the page is live;
  `saveFile` when an existing row flips `free` on, changes page, or sits on a live page. The
  question is asked of the *state and transition*, never the route — `proven()` asks
  unconditionally and must not be used there — so a draft's edits and a new row stay silent.
  `RELEASE_WORDING` in `src/data/downloads.ts` (`page`, `file`, `live`) is read by both the Worker
  and the editor, which recognises the prompt by its prefix and retries with proof.
- **The rate-limit bucket is keyed on a NORMALISED address, IPv6 cut to the /64** (`crypto.ts`).
  Keyed on the whole string, rotating inside one /64 — which every residential and VPS allocation
  hands you for free — produced **zero** 429s over 72 attempts. **/64 and not /48 deliberately**:
  one /48 can span hundreds of unrelated households, so cutting there turns a stuffing run into an
  outage for real visitors. **The one exception is the per-handle `pair:` bucket, keyed on the /48**
  (2026-09-24, audit item 56): at the /64 one free tunnel-broker /48 was 65,536 pairs and refilled
  the handle ceiling; a `pair:` bucket is per handle, so the only people sharing one at /48 are
  strangers guessing at the same account. **Do not "harmonise" either cut into the other.**
  `X-Forwarded-For` is still never read — do not start.
- **`recordSuccess` resets the per-handle buckets and only *decays* the client bucket** by one —
  wiping it on success hands an attacker a free reset. Client allowance 50, because one address is a
  household behind NAT. **Signup has its own bucket** (allowance 12), sized just above the harness's
  eight signups per run: shrink it and the harness locks itself out.
- **The anonymous per-handle limit is two buckets, and the tight one is per (address, handle)**
  (2026-09-24, review item 10). `pair:` (client + handle) allows 5; `account:` (handle alone)
  allows 30. **Do not collapse them back into one per-handle bucket at 5**: that bucket is reachable
  by anybody who knows a handle, and six wrong guesses from anywhere locked the owner out. `gate`
  refunds the buckets that said yes when one says no, so one address feeds `account:` at most six
  times — that refund is load-bearing here too. `proof:` (signed-in re-proof) and
  `second-factor:` (only reachable with the password) stay single buckets at 5, deliberately.
  Gated by driving the real `RateLimiter` through `signin`. **Say the cost honestly**: six IPv4
  addresses or six /48s in one window still lock password *and recovery* sign-in for a handle —
  a few free tunnels or cloud VMs, not a botnet. **Passkey sign-in is the mitigation**, since no
  bucket touches it; `challenge` checks the same buckets as `signin` so both screens give one
  retry time, and recovery is deliberately not an exit around the ceiling.
- **Rate limiting reserves and checks in one round-trip** — `/check` then `/fail` let N concurrent
  sign-ins all pass before any failure landed. **`challenge` deliberately stays on `/check`**: asking
  for a salt is not a failable attempt, and counting it would let anyone lock an owner out. It is the
  only exception; **any route that consumes an allowance reserves.**
- **The rate limiting lives inside `assertPassword`, not in its callers**, so a future caller cannot
  forget it and leave an unthrottled online password oracle.
- **`challenge`'s decoy reports `DEFAULT_ITERATIONS`, the real constant** — a varied decoy was the
  tell, not the disguise. **`challenge` takes the salt from any credential that has one**, preferring
  the password row for its iteration count; keyed on `kind = 'password'` it dropped an
  operator-reset account to the decoy branch and turned a working recovery code into a wrong one.
- **A redeemed recovery code returns its key slot in the sign-in response, and the slot row is
  *kept*.** The wrapping key exists only for that request, so a slot not handed back is a grant key
  sealed for ever.
- **A recovery code is not marked used until the sign-in completes** — spending it earlier burns one
  of ten per abandoned attempt, for the person recovery exists for.
- **Authorisation for set-password is a ticket, not the session.** **The ticket is single-use on the
  server, not just in the client** — its subject carries the redeemed credential and `setPassword`
  requires that credential's key slot to still exist, **inside every write's own WHERE** (audit
  item 57), with the statement that deletes the slot last. The read ahead of the batch is only the
  friendly early answer. Clearing it in `flows.ts` is a courtesy, not the enforcement.
- **A session that began before `accounts.sessions_after` is refused** (migration 0010, audit item
  58). A password change, a recovery set-password, an operator password reset and an operator TOTP
  reset stamp it inside their own batches, then hang up the account's signalling sockets
  (`hangUpSignalling`, after the commit, so a re-dial presents a refused session). The request that
  changed the password is re-issued a **fresh** session — never a refresh, which carries the old
  `issuedAt` the epoch just refused. The comparison is strictly less-than so that re-issue stands.
  **Still no session table**: the token already carries when its session first began.
- **Change-password reuses the salt** — recovery codes derive against the password's salt, so
  rolling it would silently kill all ten.
- **A passkey sign-in has no TOTP stage and no rate limiting.** User verification is the passkey's
  second factor (`verifyAssertion` refuses an assertion without the UV flag) and a failed attempt
  means forging a P-256 signature. Adding a TOTP stage backs a stronger factor with a weaker one.
- **A `prf`-less authenticator registers a passkey with no key slot**, deliberately — it signs in and
  can never open the grant key, and the screen says so. "Fixing" this by wrapping the slot to
  something the server holds is escrow.
- **Removing a passkey is refused when its slot is the account's last openable one.** Spent recovery
  codes' slots do not count as openable.
- **The WebAuthn challenge tokens are stateless, and a challenge is BOUND at verification but SPENT
  in the write.** **Still no challenge table — do not add one**; that remains the rejected option.
  The credential-id uniqueness index only ever refused a *duplicate credential*, so it said nothing
  about assertions, and a captured sign-in body replayed verbatim minted a fresh session for the five
  minutes its token lived. Both ceremonies now spend the challenge in a conditional UPDATE whose
  guard rides in the write's own `WHERE`, zero `meta.changes` being the refusal.
- **That guard is monotonic in the token's issue time, and an equality test is not good enough.**
  `last_challenge <> ?` refuses only the *most recent* challenge, so two captured bodies can be
  alternated indefinitely. `last_challenge_at <` refuses every older challenge rather than one. The
  cost is that an out-of-order ceremony is refused; the answer to that is to start again.
- **`credentials` is bounded like every other user-writable table** — `MAX_PASSKEYS`. `assertPassword`
  throttles a *failing* caller and `recordSuccess` resets the account bucket on every success, so a
  loop that keeps succeeding is unthrottled by design and the cap is the only bound there is.
- **Set-password re-wraps; it does not unwrap.** `unwrapSlot` returns a deliberately
  **non-extractable** key, so the flow goes ciphertext-to-ciphertext through `rewrapSlot`.
- **The browser refuses implausible KDF parameters** (`checkIterations`) — floor at the constant the
  credential kind has always used, cap at 10M. **Refuse, never clamp**: a "corrected" count derives a
  secret the server does not hold. If the default rises, the floor stays at the oldest count ever
  deployed.
- **Passwords are NFKC-normalised before PBKDF2** (NIST 800-63B) — composed and decomposed non-ASCII
  must derive identically across platforms, and there is no email reset behind a mismatch.
- **`signout` resolves its audit actor through the table** — a cookie outlives a deleted account,
  `audit.actor_id` is a foreign key, and a plain insert made the one request whose job is to clear
  that cookie answer 500. The subselect yields NULL, as the cascade would.
- **The last-way-in guards live in the writes' own `WHERE` clauses**, not in a check before them
  (`passkeys.remove`, `admin.resetPassword`, `admin.setOperator`'s demotion, `totpEnrol`'s upsert) —
  check-then-act lets two concurrent requests each count the other as "another way in". Zero
  `meta.changes` is the refusal, and the audit row is written only after it. **Do not "simplify"
  these back into a pre-check plus an unconditional write.**
- **An SDP must carry exactly one distinct DTLS fingerprint, and `fingerprintFromSdp` refuses
  otherwise.** RFC 8122 §5 lets a media-level fingerprint override a session-level one, so matching
  only the first line let a hostile signalling service prepend the owner's genuine fingerprint to its
  own SDP. **Do not simplify it back to a single match, and do not make it pick a winner** —
  identical repeats are allowed; disagreement is refused.
- **The browsing tab pins the agent key, SSH-style.** `shareStore.pin` per machine, taken at the
  first *verified* connect and consulted in `DriveConnection.open` before the signalling socket is
  dialled. A changed key throws `AgentKeyChanged` and the machines page asks the owner whether they
  re-keyed it themselves. **Pin after verification, never before** — a pin on an unverified key pins
  the impostor.
- **The agent verifies peers itself; it never trusts the signalling introduction.** The trust root is
  **stored at pair time in IndexedDB and never re-fetched** — re-fetching would let a later server
  compromise quietly re-root a paired agent. **And it comes from the password, never from the pair
  response**: `pairMachine` in `src/share/unlock.ts` opens the key slot locally first (AES-KW plus
  the `Q = d·G` import check bind the public key to the password), stores *that*, and refuses a pair
  response that disagrees. Storing the response's `grantPubkey` is the server saying "trust this".
  `worker/signal.ts` is **an introducer, not a pipe**: it relays SDP/ICE without reading payloads,
  persists nothing, and the session and ownership checks happen in `signalUpgrade` *before* the
  object is reached. The one check the object makes itself is the agent's key proof, below.
  **The upgrade path bypasses `harden()` deliberately** — copying a 101 response drops its
  `webSocket` and hangs every connection.
- **Pairing and re-keying demand the password**; rename, remove and the drive routes are
  session-gated because those rows carry labels, not authority.
- **File paths travel as arrays of components, never strings** (`src/share/paths.ts`) — the agent
  walks handles component by component, so there is no parser to have a traversal bug in. **Refuse,
  never repair.**
- **A session opens an agent socket; only the machine key makes it the agent** (2026-09-24). The
  object challenges every agent socket and admits it on a signature over its own nonce by the key
  whose public half is `agent_pubkey`, which **the Worker hands over after deleting any
  client-supplied copy of the header**. Until then the socket is not presence, is relayed nothing,
  evicts nobody and stamps no `last_seen`. **Do not "simplify" admission back to the upgrade** — a
  stolen cookie then evicts an unattended host for good and hears every owner offer.
- **One proven agent socket per machine; a newly proven one replaces the incumbent**, which is sent
  `replaced`. The frame is the contract — local workerd delivers the server-side close lazily, so
  nothing may depend on the close code reaching the replaced tab. **`replaced` is not terminal**:
  only a tab of the same profile can prove the key, so the replaced tab asks that profile's tabs
  (`BroadcastChannel`) and takes back over once none claims to be the agent. Only an *active* tab
  answers, which is what stops two tabs ping-ponging. `rekeyed` / `proof-refused` **are** terminal.
- **The handshake binds the signalling peer id** (v2): the offer's signature covers the id the
  object minted for that socket, and the agent verifies against the `from` the object stamped, so a
  captured offer fails from any other socket. **A second offer from one peer replaces its first
  connection**; live peers are capped at `MAX_PEERS`, which must equal `MAX_BROWSER_SOCKETS` (gated).
- **Every signalling socket has a frame budget** (`FRAME_BUDGET`), kept in the hibernation
  attachment; exhaustion closes 1008. **A re-key hangs up on the old key** (`/shutdown?reason=rekeyed`
  with the new key), pending sockets included.
- **The machine and drive caps live in the INSERT's own WHERE**, and drive labels are unique per
  machine case-insensitively in the index (migration 0011) — the last-way-in shape again.
- **STUN only; no TURN** until the client approves the spend. A hard-NAT pair fails with an honest
  message, not silently.

**Three things the client has not yet signed off** (in `TODO.md`; none blocking). **1.** §3's
operator row is stronger than the design supports: the Worker sees the raw `authSecret` on every
sign-in and holds the salt and iteration count, so an operator who logged one sign-in could grind
offline. The cryptography is fine; the *unconditional* wording is not. **2.** `⌘K` is claimed twice —
the door's sixth unlock route in `SPEC.md`, the command palette in §10. **3.** Signup discloses
handle availability (409) while `challenge` goes to trouble to hide it.

**The replay-guard fields are settled**: `totp.last_step`, `credentials.last_challenge` and
`last_challenge_at` are **in §9's inventory**. Each stores a clock window or a digest of a value the
server minted itself, none is derived from the person, and each exists because without it a
credential is replayable. **Do not re-flag them as pending** — the alternative to storing them is not
storing less, it is accepting replay.

## The sharing host — the invariants

**That machine's DESKTOP is a separate repository, `../debian-desktop`, and the boundary is not
"website versus desktop".** It is one question: **can this take the file host offline?** Every
privileged script stays here in `scripts/` — `plasma-dark-setup.sh` above all, which builds the
eighteen desktop looks *and* pins the X11 session that the kiosk's `xset` and `unclutter` silently
require. The switcher, the screenshots and the looks' documentation, none of which touch anything
outside `$HOME`, live over there.

**`plasma-dark-setup.sh` must never move into that repository.** It will look like it belongs there —
it is the look builder and the looks are there — and moving it takes the X11 pin out of the only
gated repository in the estate, to somewhere a change made for looks can take file sharing down.
`../debian-desktop/BLUEPRINT.md` §3 carries the argument and the revisit-if: only when the kiosk
launcher stops depending on X11.

**Two gates here span both repositories**, on this side deliberately, because what breaks them is an
edit to the builder — which lives here and fires the check hook on every change to `scripts/`:
`LOOK_FILES` parity between the builder and `../debian-desktop/look-switcher.sh`, and the eighteen
look names agreeing across both validator arms, the error message, the accent table and the preview
filenames. **When `../debian-desktop` is not checked out beside this repo they name themselves under
"could not be run"** rather than passing quietly. A third gate, `bash -n` over the five host scripts,
closed a gap where three of them had no gate of any kind.

**The machine's identity is in neither repository.** This one is public; the scripts and the
procedure are meant to be read, and the LAN address, the Tailscale address, the host alias and the
account details are not. They live in `../debian-desktop/LOCAL.md`, git-ignored and gated there.

Two setup scripts, and **each hard-refuses on the other's hardware**: `scripts/pi-setup.sh` on
anything that is not a Raspberry Pi, `scripts/thinkcentre-setup.sh` on a Pi. Half-working on the
wrong machine is worse than not running.

- **The desktop half of the host is X11, and that is load-bearing rather than taste.** The kiosk
  launcher blanks the screen with `xset` and hides the cursor with `unclutter`; both are X11-only and
  **fail silently under Wayland**, so a Wayland session gives you a kiosk that blanks itself — the
  one thing an always-on host must not do. Remote viewing is the second reason: `krfb` shares the
  *running* session on X11, while Wayland routes it through a portal prompt that has to be clicked on
  the machine nobody is standing at. The real host runs Plasma, so `scripts/plasma-dark-setup.sh`
  pins the X11 session and writes the SDDM autologin `thinkcentre-setup.sh` cannot — that script only
  knows LightDM, and **its warning about autologin is expected on this box, not a failure**.
- **On Plasma, PowerDevil — not `xset` — decides whether the screen blanks, and its keys live in
  NESTED groups.** `powerdevilrc` is `[AC][Display]` (`TurnOffDisplayWhenIdle`,
  `DimDisplayWhenIdle`) and `[AC][SuspendAndShutdown]` (`AutoSuspendAction`), upper-camel, per
  PowerDevil's own `PowerDevilProfileSettings.kcfg`. A flat `[AC]` is read by nothing, silently —
  that shipped once. `--verify` reads them back through `kreadconfig6` and an unset key FAILS,
  since PowerDevil's default is to blank. Gated by executing the builder's writes into a
  throwaway config and reading them back.
- **`--verify`'s "graphical session" is filtered on `Type` (x11/wayland), not `Class` alone** — an
  SSH login is `Class=user` too, and `--verify` is usually run over SSH. **SDDM's autologin is read
  the way SDDM reads it**: packaged drop-ins, `/etc/sddm.conf.d` sorted, then `/etc/sddm.conf`,
  later wins, `[Autologin]` only. Both driven by the gate.
- **`rdp-separate-user.sh` makes a password login on 3389, so sudo and loosening `/home/user` are
  opt-in** (`--with-sudo`, `--share-home`), and **no filename ever reaches a shell string** — the
  old `xargs -I{} sh -c` ran a crafted filename as root. `--undo` follows the `--undo` rule: it
  reverses only what its record says, restores modes without following links, and never deletes
  the RDP user's home.
- **Nothing that script does as root acts on a NAME under `/home/user`** (2026-09-24). uid 1000
  can swap any of it mid-run: `chmod -R` follows a command-line symlink, and an undo that tested
  only the leaf for a link chmod'd a file outside the home through a swapped ancestor. Every
  change goes through `fs_tool` (python3): paths opened one component at a time with
  `O_NOFOLLOW`, changes made on the opened inode via `/proc/self/fd`, and the undo also demands
  the recorded dev:inode — a hardlink swapped in at a recorded name is left alone. **Without
  python3 it changes nothing**; the shell cannot hold a directory open. Files made after the
  snapshot are swept out of the share group before `groupdel`. Every `mv` is `mv -T` (a plain
  `mv` as root into a user-owned directory moves the file INTO any directory link planted at the
  destination). All gated, break-verified.
- **The Chromium profile IS the pairing** — the persisted directory handle from
  `showDirectoryPicker()` lives in its IndexedDB. That is why the kiosk is a systemd *user* service
  and never a system one, and why the launcher must never gain `--user-data-dir` or `--incognito`: a
  fresh profile per launch drops the handle on every restart.
- **Never `--no-sandbox`, and never systemd-harden the kiosk unit.** `NoNewPrivileges`,
  `PrivateUsers` and a `SystemCallFilter` break Chromium's own sandbox, and the fix people reach for
  next is `--no-sandbox` — strictly worse, on the one machine holding a handle to real files. The
  unit file carries this as a comment addressed to whoever hardens it later.
- **Chromium is excluded from unattended-upgrades and given its own timer, and the second half is
  what makes the first half safe.** On Debian its security updates arrive through the same
  `-security` origin as everything else, so without the exclusion the binary is replaced under a
  running browser at an hour nobody chose; without the timer an un-patched browser holds a handle to
  somebody's files. The timer is `Persistent=false` deliberately — a missed week waits for the next
  one rather than firing at an arbitrary moment after a boot.
- **The Chromium managed policy is the answer to autologin**, which is not optional: a host that
  stops sharing when the power flickers is not a host. **Both scripts write it.** On the
  ThinkCentre it has ONE definition, `chromium_policy_json`, and `--verify` rebuilds it from the
  kiosk URL and compares **every** key on disk — it used to read three, so a policy with
  `URLBlocklist` or `DeveloperToolsAvailability` deleted verified green. **Do not restate the key
  list in `--verify`.**
- **`--verify` judges the kiosk by what it shows, not by `is-active`** (`kiosk_liveness`). The
  launcher is active while it polls for a display, so a box whose autologin failed verified green.
  Ten minutes after a boot, an active unit with no graphical session, or no browser, FAILS; a box
  set up since its last boot (unit file newer than `btime`) is still a note. **And the autologin
  user must be `$USER`** — the account whose profile holds the pairing — in every display-manager
  branch.
  `DefaultFileSystemReadGuardSetting` stays at "ask" (3) because that prompt *is* the folder picker
  the machine exists to answer; write is blocked, since §8 shares read-only.
- **`sudo docker`, never the `docker` group** — group membership is root-equivalent and this box
  autologins to a desktop. And **every published container port names an address**, because Docker
  writes its own iptables rules and they are evaluated ahead of ufw's.
- **The firewall reads the SSH port from `sshd -T`** and refuses to enable ufw at all if it cannot
  work it out. **In `sshd_config` the first value wins**, so a drop-in below an earlier setting is
  written, reloaded and silently ignored — the script asks `sshd -T` whether its settings actually
  took rather than trusting that writing the file was enough.
- **`canon_store` resolves the LONGEST EXISTING PREFIX, not the whole path.** `--store` reaches
  `sudo chown` and `sudo chmod 0750` and is remembered in a user-writable file later runs re-read, so
  one accepted value is permanent. Resolving only when the *full* target already exists is false on
  exactly the normal first run: `--store /srv/data/vessel` with `/srv/data` a symlink to `/etc` was
  compared as typed, matched no blocked prefix, and `prepare_store` then followed the link and handed
  `/etc/vessel` to the autologin desktop user. **Nobody's home, not the home itself, no dot-folder,
  nothing under `/opt` or `/snap`** (2026-09-24) — `/home/other`, `$HOME` and `/opt/google/chrome`
  were all accepted and chowned. **A remembered value is judged like a typed one and a refusal
  names the file**, which must be a plain file, not a link. **A component that exists but is not a directory is
  refused, never carried into the tail** — a dangling symlink names a target that is not there yet
  and `mkdir -p` follows it, so `-L` is tested beside `-e`. **The gate drives `parse_args`, not
  `canon_store`**: driving the resolver alone stays green when the caller stops consulting it, and
  the caller is the barrier. **A barrier that compares something other than what the next command
  acts on is not a barrier.**

## The setup scripts — the invariants

`design/SPEC-SHARING.md` §4 is the design and `docs/SHARING-SETUP.md` is the runbook. Three scripts —
`windows-share-setup.ps1` (with `launch.bat`), `macos-share-setup.sh`, `linux-share-setup.sh` — plus
`setup-bundle.sh`, which builds what gets published.

- **A script cannot hand a browser a folder, and that is the feature, not the obstacle.**
  `showDirectoryPicker()` needs a human gesture; that sandbox boundary is why this needs no installer
  and no code-signing certificate, and why a path bug here cannot reach the whole disk. **The target
  is one click, once, forever — never zero.** Anything promising zero is a native agent, which is a
  certificate and a second copy of the trust model.
- **The setup code carries no authority and must never become an API call.** It is a list of names
  that grants nothing; the worst a hostile one does is *suggest* a folder the person still has to
  pick themselves. Making it a POST would put a credential in a downloaded script and add a write
  route to defend. **Phase S adds no table, no route and no credential** — that is what let it ship
  without a security review, and it is worth keeping.
- **The code is a two-language wire format**: PowerShell and shell encoders, a TypeScript decoder.
  `npm run check` asserts the round trip, refuses twenty-one malformed shapes, **and greps the
  PowerShell script for its exact JSON template and base64url transformation**, so editing one side
  alone fails. **Bump to `VS2.` rather than changing the shape of `VS1.`.**
- **`ConvertTo-Json` is not used, and neither shell script uses `jq`.** PowerShell 5.1 collapses a
  one-element array into a bare object, so somebody sharing exactly one folder would produce a code
  the site refuses — while everyone testing with two saw it work.
- **`decodeSetupCode` refuses; it never repairs.** A half-decoded plan renders as a complete
  checklist, the person ticks every row, and a folder they asked to share is silently absent. **It
  refuses more than malformed structure**: a label or path carrying a bidi override or a zero-width
  character is rejected, because both fields are read by a person deciding which folder to hand over,
  and a label that *renders* as something other than what it stores is the whole attack — as are two
  rows that render identically, one of which ticks off and one of which does not. **Duplicate labels
  are refused too.**
- **The filter refuses what cannot belong in a label; the FOLD refuses what merely reads like another
  label — and the split is the decision.** The filter refuses
  `\p{Default_Ignorable_Code_Point}`/`\p{Variation_Selector}`, a **strict superset** of the old
  hand-list, swept over all 0x110000 code points to prove it. **U+FE0E and U+FE0F are carved out on
  purpose**: they are the emoji presentation selectors, `Photos ❤️` is a folder somebody has, and the
  code is *machine-generated from names that already exist* — so refusing them would refuse the whole
  code over one honest folder, on the happy path, which is a security fix turned into an outage.
  `foldLabel` pays for the carve-out by stripping every default-ignorable and collapsing whitespace
  runs before the duplicate test. **Labels are still stored as sent**; folding only the comparison is
  what keeps refuse-never-repair intact. The whitespace collapse lives in `foldLabel` and not in
  `.v-setup-name`'s `white-space: normal`, because **a refusal must not depend on a CSS declaration
  in another file.**
- **The fold also folds VISIBLE look-alikes, and still only in the fold.** `Invoiсes` with a Cyrillic
  es, `FiIes` with a capital i, `0ct 2O2O`, `PHOTOS` are twin rows by the same test as the invisible
  ones, and NFKC folds none of them. `CONFUSABLES` maps the Cyrillic, Greek and small-capital letters
  whose glyph *is* the Latin one, then case, `l/I/1/|` and `O/0` collapse. **Refusing those scripts in
  the filter is the outage again** — `Документы` is an honest folder.
- **The PowerShell JSON escaper branches on the integer code point, never on `switch`.**
  PowerShell's `switch` compares linguistically, so every zero-collation-weight character compared
  equal to the first zero-weight clause and was written out as `\b`. `-CaseSensitive` does not fix
  it; `-eq` does not have it.
- **`-BrowserProfile` is matched against a closed charset before anything consumes it.** It is
  interpolated into the logon task's argument string, which runs the browser at every logon, so a
  quote in the value became browser flags — `--no-sandbox`, `--load-extension=` — by "type this in
  the box". A profile directory is `Default` or `Profile N`; anything else is a sentence and
  `exit 1`.
- **`@()` around the folder collection is load-bearing.** A one-element array unrolls on return and
  `Set-StrictMode -Version 2.0` suppresses the scalar `.Count` shim, so choosing exactly one folder
  crashed the script. It worked with two, which is why it would have survived every test but the
  first real one.
- **The scripts' chrome goes to stderr; stdout is a data channel.** `choose_folders` returns the
  chosen paths on stdout and the caller reads it with `while read < <(...)`. While `note`/`good`
  wrote to stdout, the instructions were read back as folder paths — every interactive run told the
  customer their folders did not exist.
- **The blocked-folder lists are bash ARRAYS, and that is a security property, not a style choice.**
  Space-delimited strings consumed unquoted (`for bad in $BLOCK_EXACT`) meant a home directory with a
  space in it — an ordinary macOS account name — split every `$HOME`-derived entry into fragments, and
  `~/.ssh`, `~/.gnupg`, `~/.config` and the whole of `~/.local` became shareable. Every entry the
  text gate required was present the entire time. The `# shellcheck disable=SC2086` above the
  definitions is what suppressed the warning; it is gone, and it must not come back.
- **The blocked-folder lists in all three scripts are a security control, and they are the ONLY
  barrier.** A link to a blocked directory inside a picked folder is read normally by Chrome — it
  blocks those as "do not pick", never "do not read" (crbug 40061477), Chrome's own position is that
  evading its blocklist is not a security bug, and the scripts recommend picking the share root as
  one folder. So nothing downstream catches a miss. **Never relax an entry to be helpful, and never
  describe this as an echo of what Chrome refuses**; that framing is what left it with working
  bypasses.

  **All three blocklists are DRIVEN, not read.** A gate that parses the entry arrays as text checks
  them for *membership* and checks the code consuming them not at all — which is how a
  `.ssh`-blocks-its-children-but-not-itself finding sat green. The gates slice the real functions out
  and run them against throwaway home directories, one named with a space, and they fail against the
  pre-fix scripts. Six rules, each of which had a working exploit:
  - **Canonicalise first, and fail closed.** Exact equality on the raw path let `/home/user//`,
    `/home/./user`, `//home/user` and `/home/user/../user` straight through. `cd -P` + `pwd -P` on
    Unix (`readlink -f` is absent on BSD, and failing silently there re-opens the hole);
    `GetFullPath` plus a bounded `.Target` walk on Windows (`ResolveLinkTarget` is .NET 6+ and absent
    from PowerShell 5.1). **A path that cannot be resolved is refused, never compared raw.**
  - **EVERY component, not just the leaf.** `GetFullPath` does not follow a junction and `Get-Item`
    reports the `ReparsePoint` attribute of the **leaf**, so the Windows walk compared every ancestor
    as typed — and **Windows ships the junctions that exploit that**, with ACLs that deny listing but
    not traversal. `C:\Documents and Settings\<user>` handed over the whole profile while matching
    neither `%USERPROFILE%` nor the parent-of-home entry. **The Unix scripts never had this**, because
    `cd -P`/`pwd -P` resolves every component by construction — which is exactly why the PowerShell
    copy has to do it by hand, restarting the walk after each substitution since a target may itself
    sit under another junction.
  - **Collapse a leading `//`.** Bash's `pwd -P` preserves it, so `//home/user` canonicalised to
    itself and compared unequal to `/home/user`. Measured, not theorised.
  - **Block the parent of home** — `/home`, `/Users`, `C:\Users`. The cheapest exploit of the lot:
    "type `C:\Users` in the box" hands over every account on the machine.
  - **And block what sits BETWEEN the parent and your own home.** Blocking `/home` and `$HOME` looks
    complete and is not: `/home/somebody-else` is neither. `/home/other/.ssh` is the sharp one,
    because every dot-directory in the prefix list is written `$HOME/.ssh`, **keyed to YOUR home, so
    the list refuses your own SSH keys and hands over your housemate's** — and on Debian a home
    directory is mode 0755 by default. The test is **containment, not "is it a direct child"**, and
    it is written as the *containers* (`/home`, `/Users`, `/export/home`, `/var/home`, plus
    `dirname $HOME`, never `/`) because a root account's home is `/root` and refusing everything under
    `/` would refuse `/mnt` and `/media`. `$HOME` is canonicalised before the comparison, or a
    symlinked ancestor makes it refuse the user's *own* files.
  - **No dot-component, anywhere on the canonical path** (2026-09-24) — and on Windows no
    `AppData`, on the Mac no `Library`, anywhere. Every dot-directory entry was a finite list keyed
    to THIS home: `~/.claude`, `~/.wine`, `~/.azure`, `%USERPROFILE%\.config` passed, and so did a
    copied home on a backup disk (`/media/backup/home/bob/.ssh`), which no `$HOME` entry can name.
    The explicit entries stay; the structural rule only refuses more. `%USERPROFILE%\AppData`
    itself was shareable while Local and Roaming were blocked — the blocked-leaf shape again.
  - **A drive letter is resolved or refused** (Windows, 2026-09-24). `subst X: ...\.ssh` and
    `net use Y: \\localhost\C$` are letters that are not reparse points, so the walk never saw
    them. `Get-DriveMapping` carries a SUBST across and walks again, and THROWS for a network
    letter or anything it cannot classify, which the walk refuses. Driven with stubs;
    **`subst.exe`'s output format is assumed, not yet seen on a real Windows box.**
  - **Prefix-match, not exact-match**, and **a blocked directory must have no shareable ancestor.**
    `$HOME` blocked with no children blocked left `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config` and
    `~/Library` shareable — precisely the paths Chrome blocks with block-all-children semantics.
    `%APPDATA%`, `%LOCALAPPDATA%` and `%ProgramData%` are block-all-children too; as exact entries
    with three vendors named beneath them they left Thunderbird's saved passwords, Telegram's session
    keys and every Store app's state shareable. Windows also refuses UNC/device paths and 8.3 short
    names (`C:\PROGRA~1` is stable on every install).

  **The rule covering the whole family:** *a blocked thing must have no shareable neighbour holding
  the same secrets* — not a shareable ancestor, not a shareable self, not a shareable sibling.
- **`launch.bat` names `powershell.exe` by full path** — `cmd.exe` searches the current directory
  first, and from Explorer that is Downloads.
- **`choose_folders` must exist in every script that calls it.** `macos-share-setup.sh` called it and
  never defined it, so on a stock Mac every interactive run printed `command not found` and exited
  with "No folders chosen" — the path the runbook tells people to use had never worked. It is written
  now with `osascript`'s own `choose folder`. **It has not been run on a Mac**, so it wants a real
  run before the next bundle is published.
- **`--undo` removes links, never their targets, and refuses a share folder without its marker
  file.** Deleting through a symlink is how somebody's photographs get deleted.
- **The scripts leave the lid alone.** They stop idle sleep on mains when asked and warn when they
  see a battery. A laptop taught not to sleep in a bag gets hot, and somebody who shuts a lid expects
  sleep.
- **Junctions need no administrator; symbolic links do.** That is why Windows uses a junction. **A
  script that demands administrator for its safe half teaches people to give administrator to
  scripts.**
- **`CHECKSUMS.txt` and the readable `.txt` copies are generated, never typed** — and `dist-setup/`
  is gated byte for byte against a fresh run of `setup-bundle.sh`, so a script fixed here and not
  re-bundled fails the check rather than shipping the old hole under a matching checksum. A checksum in a
  document is wrong the first time a script changes, and the person who suffers is the one who checks
  properly, sees a mismatch, and concludes they were handed something tampered with. **The `.txt`
  downloads rather than opening** — `worker/downloads.ts` forces `attachment` and `octet-stream`
  unconditionally.
- **The scam warning goes above the download.** This page asks for exactly the behaviour `/scams`
  teaches people to refuse, so it earns the trust rather than assuming it: published source,
  checksum, and "if somebody rang you and asked you to run this, hang up."
- **A browser directory listing may be incomplete and will not say so.** Since Chrome M132,
  `entries()` silently drops files whose resolved path is blocked and still reports success. **The
  phase-2 explorer inherits this**, so nothing may present a listing as provably complete.
- **Which browser profile is the most bug-prone line in phase S.** The folder handles live in one
  profile, not in the browser; a login task opening another gets a page that has never heard of the
  machine. Windows takes `-BrowserProfile`; the others say so in their manual notes.

## Downloads — the invariants

`docs/DOWNLOADS.md` is the runbook. **The catalogue is a database table, not TypeScript** — the old
"content is a deploy step" reasoning was right about a single flat list and wrong about what was
asked for: operator-named pages, laid out by them, published while they are on the phone to somebody,
with per-person access.

- **The bucket is private and the bytes only ever leave through `worker/downloads.ts`.** Put a
  program in `public/` and the code box in front of it becomes decoration. No public bucket URL, no
  custom domain on it, deliberately.
- **`id` is a wire format** — the R2 object key *and* the URL value, so it appears in links people
  keep. **Add ids, never rename one.** **And every route that takes one normalises it through
  `fileId`** — `saveFile` lowercases before writing, so an upload route reading `str(b.id, 64)`
  directly looks for an id that was never stored.
- **`resolveAccess` is the only thing that decides who may see what, and every read goes through
  it.** Listing pages, reading one, and serving bytes ask the same function the same question;
  `canDownload` starts by calling `canRead` on the page, so **bytes cannot escape through a page the
  caller was refused**. **Do not give any route a second opinion** — two checks that agree today are
  two checks that disagree after the next change.
- **A ticket's subject carries three kinds of thing, and the difference between two is a security
  boundary.** `@slug` opens a page and everything on it; **`~slug` makes a page merely *readable***;
  a bare string is one file. A code scoped to one file must open the page that file is on — the
  download button lives there — but "you may look at this" is not "you may take everything on it".
  **`canDownload` reads `ticketPages` and must never read `ticketVisible`.**
- **Grants are evaluated as rows, never as two sets.** A grant is a `(page, file)` pair in which
  either may be null, meaning "any"; shredding those into a set of pages and a set of files loses the
  pairing, and a null in one row then attaches its wildcard to *every other row's* scope.
  `grantedFile` tests both halves of one row.
- **A draft and a `granted` page both 404; a `code` page says it exists.** Somebody holding a code
  has to be told where to type it, whereas the existence of a page named after a customer is itself
  the thing being kept quiet.
- **A download ticket names the code that bought it and dies with it** (audit item 60). The subject
  is `REF|list` inside the MAC; `resolveAccess` re-reads the code on every use (`ticketStillOpens`:
  present, not revoked, and `opened` still naming it) and grants only the intersection. Revoke and
  delete end tickets at once, a slug or id recreated inside the thirty minutes is not opened by an
  old ticket, and a ref-less ticket is refused. **Uses and expiry are not re-checked** — the use was
  the redemption, and expiry bounds redemption — so do not "tighten" that into a mid-download
  refusal.
- **Every refusal from the byte route is the same refusal, including "no such id"** — one `denied`
  object thrown from all three places. Distinguishing 404 from 403 makes the status code an existence
  oracle over the whole table, unauthenticated and unthrottled, and ids are lowercase-kebab named
  after what a file is and who it is for, so walking them is cheap.
- **A code can never open a `granted` page, so `mintCode` refuses to make one** — `canRead`'s
  `granted` branch consults the account's grants alone and never looks at a ticket, so such a code is
  not weak, it is *inert*. Drafts stay allowed; minting before publishing is normal.
- **An unscoped code opens every live page except the `granted` ones.** `unlisted` stays in
  deliberately: an unscoped code is the operator's "everything paid" code, and withholding those
  would make the widest scope narrower than a page-scoped one.
- **Deleting a page deletes the codes minted for its FILES as well as for its slug.** A file-scoped
  code stores `slug = NULL, item_id = <id>`, so a `WHERE slug = ?` delete never matched one and left
  it dormant rather than revoked — and `opened()` re-resolves `item_id` at every redemption, so the
  moment any row took that id again the old code pointed at it. Ids **are** re-usable in practice,
  because `suggestFromFilename` derives one from the filename and the editor auto-fills it. A code
  also carries the page its file was on at mint, so *moving* a file cannot re-point it.
- **The pin is compared UNCONDITIONALLY, and a row without one is refused.** `download_files.slug` is
  `NOT NULL` and `mintCode` always copies it, so a NULL here means a row this code did not mint — a
  restored backup, a hand-written INSERT — which is exactly what the pin exists to refuse.
- **Deleting a page deletes the codes minted for it**, and `opened` re-reads the page anyway. A slug
  is a re-usable `TEXT PRIMARY KEY` and `download_codes.slug` carries no foreign key, so without this
  a reused address hands an old customer's code to whoever gets the slug next. Deleting is the only
  "withdraw" control this feature has, so it has to mean it.
- **The revoke handle is 16 hex characters and is checked for collisions at mint** — at 8, unchecked,
  with an unbounded `UPDATE` behind it, two codes sharing a prefix meant revoking one silently
  revoked the other.
- **A download answers `206` only when it is genuinely partial, and the request header decides that**
  (`rangePlan`). R2 reports an `object.range` even for a request that carried no `Range`, and it may
  also *decline* a range and send everything — announcing that as partial makes a resuming client
  write bytes at the wrong offset. **A zero-length range is `416`, never `206`.** Gated as a truth
  table.
- **`HEAD` is routed alongside `GET` on the byte route** — download managers probe with `HEAD`.
- **`content-disposition` carries both `filename` and `filename*`.** `headers.set` performs a WebIDL
  `ByteString` conversion, so one character above U+00FF throws — not a 400 on upload but a **500 on
  every click, for ever**, on a row that saved cleanly. `Réparation.exe` is an ordinary name here, so
  it is encoded (RFC 5987); what `saveFile` refuses is control characters, quotes and backslashes.
- **An upload writes the row before the bytes and marks it usable after** — for a NEW file
  `uploaded_at` is null in between and a page hides those rows, so a half-dead upload leaves an
  invisible draft rather than a link that 404s at a customer. **A REPLACEMENT keeps the old file
  live until the finish** (audit item 55): `beginUpload` writes nothing to the row, the multipart
  upload is invisible until `complete()` swaps the object, and `finishUpload` — password-proved —
  then sets size, type and `uploaded_at` in one statement. **Do not null `uploaded_at` at begin**:
  begin is session-only, so that line let a stolen cookie take every download offline. **The size
  is read from the object with `head`, never from the browser.**
- **The upload is multipart even for a small file** — one path that always works beats two where the
  second is discovered by a 413 on the day a file gets big.
- **A replacement upload writes its bytes before its metadata; a new file is the other way round.** A
  new file needs its row first because `beginUpload` refuses an unknown id; a replacement must not,
  because saving the new filename and then failing to upload leaves the old bytes under the new name.
- **The table holds no personal data, and the free-text `label` is the one field that could change
  that.** No name, no email, no payment reference, no IP — which is what keeps §9's inventory
  unchanged by this whole feature, and why payment stays out of band.
- **Validation moved from `npm run check` to the Worker, because the data moved** — the id and
  filename rules are 400s in `saveFile` now. What the check suite gates instead is that **every
  layout offered in the editor has a CSS rule**, the new way this feature can fail silently.

**Categories, prices, filters and sort:**

- **"No prices on the page" is reversed, and only halfway.** A price is stored per file and rendered
  **only** when its page has `show_prices` set, which is **off by default**. **Do not flip that
  default** — the decision is the operator's and the switch is how it stays theirs.
- **`free` and `price_cents` are independent in the table and resolved in `shapeFile`** — a free file
  is sent `price: 0` whatever is stored, because "free" and "$12.50" on one row is a contradiction.
  Resolved in the Worker rather than the renderer **because the same response feeds the sort**. The
  stored figure survives, so unticking free brings it back.
- **Zero is "no price", never "free".** `sortFiles` sorts unpriced files **last** — letting 0 lead
  puts every unpriced file at the top of a price-sorted list.
- **`CATEGORIES` is an append-only wire format and `PICKABLE_CATEGORIES` is the menu**, the same
  split as `FX`/`PICKABLE_FX`. **`categoryOf` never returns undefined** — an unknown id resolves to
  `other`, where falling to index 0 would silently claim every stray row is a diagnostic tool.
- **Every category is drawn, and `npm run check` fails if one is not.** `CategoryIcon.tsx` is the
  third answer to the no-images rule (after the favicon and `FileIcon`). One ink per mark, and the
  ink is an accent — a category has no container, so a second colour would be decoration. They render
  at 18–20px, so **every mark is one silhouette with no interior detail**: the duel-costume lesson at
  a much smaller size.
- **The filter row is chips for categories and native selects for the rest — except on a phone, where
  the chips become a select too.** Measured: at 420px, eight categories at the 44px touch minimum
  wrap to five rows and take 260px, opening the page on its own filter. **One control or the other,
  never both hidden by CSS** — two controls for one setting is two things in the accessibility tree.
- **The controls sit below the operator's prose and directly above the files** — they are a control
  for the list, not a header for the page. The free-form look is the exception.
- **The unsigned-Windows notice and the code box are asked of *every* file, never of the filtered
  view** — a safety notice that disappears under a filter is a notice with a hole in it.
- **A visitor's filter and sort live in the tab and are never stored.** A sort order is a view.
- **`price` and `priceCents` are two fields answering two questions** — `price` is what the page
  *renders* (zeroed for a free file), `priceCents` what is *stored*. **The editor must read the
  second**; reading the first blanked the box for every free file and wrote that blank back on save.
- **The downloads editor's children reset on `[slug]`; they are deliberately not keyed.**
  `key={slug}` fixes the fiber tree and **leaves the outgoing `<div>` in the document** — two file
  managers, the stale one still offering to save, reproduced in a production build. **Do not
  "simplify" it back to a key.**
- **`--type-display-weight`, not `--display-weight`; `--font-mono`, not `--mono`.** A `var()` with a
  fallback never fails and never logs, so four headings rendered at a hardcoded 600 in the browser's
  default mono. `npm run check` now refuses **any** custom property a stylesheet reads that nothing
  writes — the general form, which found a third instance the day it was added.


## Known deviations from the prototype

All deliberate. Add to this list rather than silently diverging.

1. **Guardrail evaluation** (`src/data/guardrails.ts`) — a rule matches only when **all** its clauses
   match; the prototype's `ok()` tests each independently, which would reject every Editorial config
   rather than the Editorial+Datamosh pairing. **`Combination` must carry every dimension a roll can
   change, and each field is deliberately required** — the ornament was rolled for months and never
   passed to `isAllowed`, so no guardrail could constrain it *however it was written*. **Add a knob
   to the roll, add it to `Combination`.**

   **A guardrail must reach the page, not only the dice.** Two of the seventeen are resolved at
   render, and the split is deliberate: **a rule is resolved when it is an accessibility floor and
   the direction of yield is obvious; every other rule is the client's taste, and taste is his to
   overrule.** The two are `effectiveStation` (the station yields, never the ornament) and
   `effectiveGrain` (the grain yields, never the palette — grain is a 14% `--fg` overlay across every
   word on the page). So the operator can overrule *knowingly*, **every guardrail carries a required
   `note`** and the panel prints it. `resolve()` applies both halves and the gates drive it, never
   the predicate. **The grain rule lives in `GUARDRAILS` like the rest** — as a special case inside
   `isAllowed` it could not be named. `combinationOf` is the one constructor. **A gate for "does this
   reach the page" must drive the thing that builds the page** — `themeClasses`, not
   `effectiveGrain`; `resolve()` once had zero callers in `src/` with the suite green.

   **`effectiveStation` is fed the *resolved* ornament, not the stored one** — **the station follows
   what is DRAWN**, because a station is *where the ornament is*. Both directions were live.
2. **Focus-visible styles exist** in `base.css` — the spec lists their absence as a gap.
3. **Magazine's h1 minimum is `46px`** — the spec's value, not the prototype's `40px`.
4. **Matrix rain is rebuilt** (client request) — each column owns its speed, trail length and glyphs,
   and the trail is drawn explicitly so the leading glyph can be near-white. Colour still entirely
   from the palette (`fg` lead, `a1` body).
5. **"Breathing" does something** — the prototype defines a `v-breathe` keyframe and never attaches
   it. It drives the vignette at the valve's 4.6s rhythm: no reflow, no text resampling, no
   scrollbar.
6. **Contact's primary CTA reveals the address** instead of navigating to the page it is already on.
7. **The hero ornament is a setting, not a fixture** (`src/data/ornaments.ts`) — **eight, five
   withdrawn**. Lens, Valve, Aperture, Orrery and `duelholy` carry `hidden`: they resolve from stored
   config and share codes but appear in no menu (`PICKABLE_ORNAMENTS`, and `ROLLABLE_ORNAMENTS` =
   pickable minus "None", because a rolled empty hero slot is indistinguishable from a broken page).
   Offered: None, **Lightswords** (index 5) and **Sonar** (index 7, `DEFAULT_ORNAMENT`). `duelholy`
   was **withdrawn, not deleted** — every stored config and share code naming it still resolves,
   which is the case `hidden` exists for. **An out-of-range share-code ornament field resolves to
   `DEFAULT_ORNAMENT`, not index 0**, which is withdrawn. Sonar's contact flares are
   `animation-delay`-matched to the beam's arrival at their bearing, arithmetic written out in
   `chrome.css`: **retime the beam and every delay is wrong.** All eight sit in one square slot.
   `SCOPES` has six entries, not five.

   **The slot also has a *station*** (`src/data/stations.ts`) — `hold` (index 0), `opposite`, `roam`.
   It rides the **ornament** scope rather than gaining a seventh, because a station is *where the
   ornament is*. Five rules: **every station rule is `:not(.layout-radial)`** (Radial's slot is the
   dial — a *look* may not move or fade the site's navigation; gated); **placement is `order`, never
   a translate and never an auto margin** (`.v-stage` overflows sideways, and auto margins are a
   measured no-op); **`opposite` is not a side** (row heroes move left→right, Magazine and
   Marginalia's column heroes top→bottom); **`roam` never fades to zero and never sets
   `pointer-events`** — the floor is 0.12, because at zero it reads as one element disappearing and a
   different one appearing, and its 14.4s cycle is three revolutions of the sonar beam, so **retiming
   the beam wants retiming here**; and **calm strips the motion and keeps the placement**, because
   calm strips animation, not layout. A guardrail refuses `roam` with either duel — a duel is the one
   ornament with a subject, and fading it out twice a revolution loses the exchange.

   **Radial's dial lives in this slot and is the only navigation on that layout.** Pills are placed
   from `--i`/`--n` set inline from `NAV` — one circle at any count, bearings 360/n apart. The
   header's nav links stand down **in React, not only CSS**, so the landmark count stays honest;
   operator tabs are excluded; Radial is desk-band only; the slot survives at ornament "None"; and
   **calm must not dim it** (a same-element `.is-calm.layout-radial` rule excepts it).
8. **The hero vitals strip is removed** (client request) — *show the layout, do not caption it.*
9. **The duel blades are literal colours** (client request).
10. **All visible "vessel" branding is gone** (client request) — wordmark, page titles, termbar, TOTP
    issuer and passkey rp name read `mcclevarty.ca`; the "Vessels" effect *label* is "Branches"; the
    favicon is an inline SVG data: URI. **Internal identifiers deliberately keep the old name** — the
    `.vessel` class, `vessel.*` storage keys, the `__Host-vessel_session` cookie, the `vessel/…` HKDF
    info strings, the Worker/D1 names and the effect id `vessels` — because renaming breaks live
    sessions, stored config, key derivation or share codes for zero visible change. **Do not "finish
    the job".**
11. **The photo slots hold placeholder photographs** — Wikimedia public-domain/CC0, re-encoded to
    strip EXIF so the gallery's "EXIF stripped" line stays true, rendered desaturated under the tile
    chrome so the palettes stay in charge. Ledger in `docs/PHOTOS.md`. The *no images* rule still
    holds for design assets.
12. **The contact sheet duotones its photographs, in every mode including calm** — greyscale plus an
    `--a1` field at `mix-blend-mode: color` at 22%, because the placeholders were the one element
    that did not recolour with the palette. **There is deliberately no `.is-calm` override**: calm
    exists so body copy holds up on low-contrast palettes, and a photograph is not body copy.
13. **Fourteen layouts, twenty-five palettes, sixteen effects** — `hud` at layout index 13, Cold Open
    at palette 24, `scan` / `telemetry` at effects 14 and 15. **All appended, never inserted.** `hud`
    is the only archetype that is not a grid, a column or a track: blocks sit on three z-planes and
    physically overlap, and the near plane's `backdrop-filter` blurs the one behind it — that
    occlusion is the point. **`TABLET_LAYOUTS` maps it to Cinematic, not Mosaic**: `adaptLayout` is a
    single lookup and does not chain, so mapping to a layout that itself collapses would render real
    six-column Mosaic at 700px.
14. **Six self-hosted webfonts** (client request) — a deliberate, explicitly granted exception to
    *Assets*. On Windows `grotesk`, `mixed`'s body and `condensed` all fell through to **Arial**:
    three of five typesets rendering identically. `public/fonts/` holds six latin-subset **variable**
    woff2 files, **178KB**, all SIL OFL 1.1. **Self-hosted, not from a CDN** — the live CSP is
    `default-src 'self'` with no `font-src`, so a gstatic URL is refused in production. Weight axes
    are clipped to the ranges used; `docs/FONTS.md` is the ledger so a re-download does not silently
    re-fatten them. **Each typeset pairs its webfont with a platform-picked system fallback** rather
    than one macOS-first list, because that tail renders during `swap` and permanently if a file
    404s. `TypeSet` also gained `displayWeight`, `bodyWeight` and `tracking`.
15. **The cursor-lean card tilt is deleted** (client, 2026-09-22: "this page jiggle/jitter/twitch
    needs to be killed and nuked immediately"). SPEC § Motion systems had every `.v-block` lean toward
    the pointer — `perspective(1100px) rotateX/Y(±3.4°) translateZ` from `useMotionSystems` on every
    pointermove — and on the desk it read as the whole page twitching. **Removed, not switched off**:
    no setting, no flag, `SUPPORTS_TILT` gone. The pointer light (`--mx` / `--my`), the cursor glow
    and the scroll-velocity boost are untouched. **`transform` on `.v-block` stays reserved** — the
    CSS rules that keep entrances and layouts off it cost nothing and keep the property free. Gated:
    no script under `src/` outside the canvas effects may write a perspective or rotate.
16. **The screensaver waits ten minutes, not sixty seconds** (client, 2026-09-24: "make the
    Screensaver timeout like 10 minutes"). SPEC § Screensaver says sixty seconds without a click; the
    timer in `ConfigContext`'s `poke` is `600_000`. Nothing else about it changed: clicks and keys
    reset it, movement does not, calm disables it, the panel, door and `holdSaver` hold it off.

## FX and canvas internals

Rules for writing or editing a canvas effect. `CLAUDE.md` carries the rest of the implementation traps.

- **The FX canvas renders in CSS pixels, into a buffer sized to its own box** —
  `min(devicePixelRatio, 2)` capped to a 2600px long edge, with a base `setTransform` each frame so
  effects keep receiving CSS pixels. **That last part is load-bearing**: `rain` sizes columns at a
  16px cell and `plasma` its grid at 26px, so device pixels would silently double their density on a
  retina display. It also means a missed `ctx.restore()` can no longer mirror the site permanently.
- **The screensaver has no rendering of its own** — it *is* the configured effect, alone and boosted,
  so "make the screensaver do X" is already answered: pick X. The duel alone needed an attract mode
  because it alone has a *subject*. **`Frame.sleeping` drives it, deliberately its own flag** rather
  than something recovered from `boost`, into which scroll velocity folds — a hard scroll would
  otherwise be indistinguishable from a sleeping interface. The blend is **eased, never switched**.
- **A resize is absorbed by each effect, never by the cache** — `FxCanvas` drops the cache only when
  the effect *id* changes, so **an effect that caches absolute coordinates and does not check the box
  strands itself on the first resize.** `vessels` rebuilds from a **stored pool of random numbers**,
  not `Math.random()`, so a rebuild re-fits *the same* tree rather than rolling a new one every frame
  of a drag.
- **The adaptive resolution tier cannot reach a draw-call-bound effect, so effects also receive it as
  `quality`.** `TIERS` is `1 / 0.8 / 0.62 / 0.5 / 0.38 / 0.28`; that fixes fill rate and does nothing
  for `rain` (~1,900 blits a frame) or `plasma`, so those two coarsen their own grid and every other
  effect ignores it. **The two directions are measured against different quantities.** Falling is
  judged on the frame *interval*, which is the complaint itself. Rising cannot be — "under 11ms" is
  above 90fps, which a vsync-locked 60Hz display never produces — so **rising is judged on
  headroom**: time inside `drawFx`, scaled by the square of the tier ratio, against the frame budget.
  **There is exactly one promotion attempt per load** (`mayPromote`), spent whether taken or never
  earned, and the first demotion spends it too. That rule is what stops the detector oscillating. The
  sampler runs *after* the draw, so calm frames are not evidence.
- **Particle counts scale with area, and the reseed guard is the box, not the count** (`field()`).
  Fixed counts gave a phone ~4× the density of a desktop at ~4× the cost on weaker hardware; scaling
  the count breaks a `length !== n` guard, hence the stored box and the 35%-area threshold.
- **`--line` is never a canvas stroke somebody needs to see.** It is the hairline *border* token at
  1.22–1.61:1, and on canvas that reads as *absent*, not faint. It has been the bug three times, once
  meaning **the orbits were missing from Orbits**. Use `--faint` and let **alpha** carry recession.
  The one legitimate canvas use left is the duel's ground line.
- **Noise in a trace is hashed from the sample index, never `Math.random`** — random per frame makes
  a lane *boil*, undoing the one thing a playhead exists for.
- **Reach for a different shape before a different frequency.** `flow`, `telemetry` and `aurora` were
  three effects whose whole read was *horizontal wavy lines*; each `telemetry` lane now carries a
  different shape, which is what distinguishes one channel of a real instrument from the next.
- **A phase used as `x % 1` needs a positive modulo.** `%` keeps the sign of its left operand, and
  `telemetry`'s trace time is genuinely negative for the first seconds of a page load — then corrects
  itself, which is the kind of fault nobody reproduces because by the time you look it has stopped.
