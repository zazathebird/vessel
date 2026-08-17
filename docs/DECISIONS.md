# Decisions

Dated history. `CLAUDE.md` says what is true *now*; this file says what was decided, when, and
why — including the bugs that produced the decisions, because a bug nobody wrote down is a bug
somebody re-introduces.

Newest first. Nothing here is deleted when it is superseded; the superseding entry is added above
it and says so.

`design/SPEC-ACCOUNTS.md` §12 is the *other* decision log, and it stays where it is: it records
what was chosen over what for the accounts design, with a "revisit if" on every rejection. This
file records what happened to the codebase.

---


## 2026-08-17 (later) — the signup form was 210px wide on the layout production publishes

Client: *"there is an issue with creating a profile… the current view does not
give a large enough field for passwords. please fix this for each and every
single layout and theme."*

**Measured before touching anything**, across all fourteen layouts at four
viewport widths, via `sitelab.html` (the `_f=1` single-frame mode, one iframe
resized per band — `resize_window` does not work in this environment):

| | `.v-account` width | usable field | characters visible |
|---|---|---|---|
| desk, thirteen layouts | 472px | 391px | ~24 |
| **desk, side-scroll** | **210px** | **129px** | **~8** |
| tablet 600, side-scroll | 248px | 167px | ~10 |
| phone, all layouts | 369px | 288px | 29 |

Side-scroll is what the live site publishes, so the bottom-left cell was
production. **Eight characters of a twelve-character minimum password**, on the
one form in the site that cannot recover from a typo — §9 collects no email, so
a password mistyped at creation is an account nobody can ever open, which is the
exact failure `PasswordField`'s reveal toggle was written for two days earlier.
A field that cannot show eight characters defeats a reveal toggle completely.

**The cause was a container, not the field.** `.v-account` is a direct child of
`.v-stage`, not of `.v-grid` — and `.layout-sidescroll .v-stage` is
`display: flex; overflow-x: auto`, the filmstrip track. So the section became a
flex item and was sized by the track, and `overflow-y: hidden` clipped whatever
did not fit the track's height. `grid-column: 1 / -1` on `.v-account` does
nothing in a flex container, and `max-width: 46ch` cannot help: **a flex item
with only a maximum is still free to shrink to its content.**

Three changes:

1. **The stage opts out of the track when it holds an account form** —
   `.layout-sidescroll .v-stage:has(.v-account)` returns to a block column.
   Terminal already establishes that a layout may opt out of the stage's rules;
   an account form is a task, not content, and nothing about it reads better as
   a filmstrip cell. Keyed on `:has(.v-account)` rather than on a list of page
   ids so a new account page inherits it instead of having to remember to join.
   Verified that `/work`, `/gallery` and `/` keep the track (`scrollWidth` 3049
   against a 1180 client width) while `/signup` and `/signin` do not.
2. **`.v-account` sets an explicit `width: min(100%, 34rem)`**, not a maximum.
   The percentage resolves against whatever container the layout provides, so
   nothing overflows a narrow one; measured horizontal overflow is 0 at every
   band.
3. **`.v-account .v-input` goes to 15px / 13px padding.** 13px mono is where
   `l`/`1` and `0`/`O` stop being separable, and these are the fields whose
   contents have to be proof-read. The small bands already sit at 16px for the
   iOS focus-zoom threshold, so this closes a gap rather than adding a third
   size. Scoped to `.v-account` deliberately: the command palette shares the
   class, has its own rhythm, and holds a command rather than a secret.

After, measured across all fourteen layouts: **51 characters** at desk, 47 at the
top of the tablet band, 46 at its bottom, 29 on the phone, zero horizontal
overflow anywhere. Identical across all five typesets and in calm — the widths
are in `rem` and `%`, so no palette or typeface moves them.

**The phone did not improve and is not a failure.** 29 characters is the
physical ceiling of a 420px viewport once the stage's 18px gutters and the
reveal button's 68px reserve are paid, and it already clears the 12-character
minimum comfortably. Said out loud rather than folded into the improvement.

`scripts/check.ts` gains *the account form owns its width*. The real test needs
a browser and this suite has none, so it is a tripwire on the two declarations
that were missing — an explicit `width` on `.v-account`, and the side-scroll
opt-out — and it was verified by deleting each in turn and confirming the
suite fails with the right message.


## 2026-08-15 (later) — the plain-English pass, and one addition declined

Client: *"make this whole site's text content understandable by the non
tech-savvy. I understand it all but my mum said what the fuck does this all
mean. and my grandma would know even less."*

**Measuring first changed what the job was.** Across all 86 body blocks the mean
Flesch–Kincaid grade is **5.0** and there is not one dictionary jargon word on
the site. It was never a reading-level problem, so "use simpler words" would
have been work with no effect. The copy was *allusive* — short, plain-worded,
and pointing at something it never named. "Built like a flight simulator, used
like a business card." "Assembled in your browser so the scrapers don't get it."
"Two cold joints." "Array resilvering." "/var/www/whatever_you_wanted → exists =
false." The rule that came out of it: **name the thing, then make the joke about
it**, and never sand off the voice — the self-deprecation is the point, so the
flight-simulator line became "This website is far more elaborate than the job
actually needs, which should tell you where the spare time goes." Same joke,
same register, now it lands.

Rewritten: home, about, work, gallery, contact, now, guestbook, the 404 and the
greeting dialog. The pricing block is the load-bearing one — see `CLAUDE.md`.

**The scams page was assessed and deliberately left almost alone**, which is
worth recording so the next session does not churn it. It looked like the worst
page by the numbers (grade 7.6, the highest on the site) and is in fact the best
written for its audience: **zero sentences over thirty words**, and every
technical term explained in place at the moment it is used — "Event Viewer —
every Windows PC on earth is permanently full of red and yellow warnings", "The
netstat command, presented as *look at all these foreign connections*". The
terms cannot be removed because recognising them *is* the defence. Its register
was already set flatter than the house voice on purpose. Two words changed:
`CRA` spelled out to Canada Revenue Agency in both places.

**`/setup`: the warning moved above the software, not merely nearer it** (client:
"list software closer to the disclaimer"). It was the last of seven blocks,
three below the tools it is about. It is now the second, directly above Quick
Assist. The distinction matters: this page teaches somebody to install
remote-access software and hand control of their screen to a voice on the
telephone, which is exactly what a scammer spends a call trying to achieve. A
person being talked through it by a criminal is following steps, not browsing —
so the warning has to be in front of the steps. Anyone who reads to the bottom
of the page was never the one at risk. Also `no drive` → `no driving` in the
lede: on a computer repair site "no drive" reads first as *hard* drive.

**Declined: naming the nationalities of scam callers.** The client offered it
with "if bad idea dont add", so this is the reasoning rather than a refusal.

- **It hands the reader a false test.** The page's whole defence is *who started
  the call*, which is a fact the reader always has. Accent is not: domestic
  call centres and spoofed local numbers exist, voice cloning is cheap, and a
  scammer who sounds local would sail straight through a filter built on
  accent. It would also aim suspicion at the large number of legitimate support
  staff who work from those same countries. A test that produces both false
  passes and false failures is worse than no test, on the one page where being
  wrong costs somebody their savings.
- **The claim is partly wrong as stated.** Jamaica's association is with
  lottery and advance-fee fraud rather than tech support; Chinese-language
  operations targeting diaspora communities are substantial rather than rare.
  Publishing it as fact on a commercial site invites the correction.
- **It changes how everything else on the page reads.** The page works because
  it is specific, calm and practical, and it is the client's own reason for
  building it — "if it helps even one grandparent not get scammed". One line of
  ethnic profiling is the line that gets screenshotted, and it would be
  screenshotted next to their real domain name.

The intent behind it is real and is worth keeping, so it is served in the way
that actually helps: the page already says the tell is who rang whom, and the
*"they will lose their temper"* block gives a behavioural signal that works
regardless of who is on the phone. If the client still wants the overseas
element stated, the useful and true version is that it is a call-centre
industry, frequently overseas, **and that the accent tells you nothing either
way** — which inoculates against the false test rather than teaching it.


## 2026-08-15 — two fights at once, and the guardrail that could not have caught it

Client: *"when in landscape mode on mobile, there are two fights going at the
same time."* Correct, reproducible, and the cause is one missing argument.

**`randomiser.ts` rolled the ornament and never submitted it to the
guardrails.** `roll()` builds a candidate with six dimensions in it and then
called `isAllowed` with five — `palette, layout, fx, type, grain`. The ornament
was absent from the `Combination` type too, so nothing failed to compile and
nothing said so. The consequence is not that a rule was wrong; it is that **no
guardrail constraining an ornament could work however it was written**, so the
one pairing that genuinely does not work had nothing standing in front of it.

The live site publishes `mode: "visit"` with `fx` and `ornament` both in scope,
so every visit re-rolls both. Two of sixteen effects are duels and two of seven
ornaments are, giving 2/16 × 2/7 ≈ **3.6% of visits** — about one in
twenty-eight — showing two independent matches, with different fighters,
different health and different winners, a few inches apart.

**Landscape is where it collides, not where it starts.** Measured in a
same-origin iframe (`resize_window` silently fails here): at 844×420 the phone
is in the *tablet* band — `PHONE_MAX` is 560 — the stage is 269px tall, the
ornament is a 240px slot beginning 55px down, and the background fight's feet
land at 215px, so both occupy the same band of the screen at comparable size.
At 400×700 the ornament ends at 197px, the background fight's feet are at 398px
and its figures are 31px against the ornament's 57px, so it reads as texture and
nobody looks twice. The DOM probe confirms two live canvases in *both*
orientations: same bug, one visible.

**Fixed in two places, deliberately.** `Combination` gains a *required*
`ornament`, `roll` passes it, and a rule blocks any duel effect against any duel
ornament (cross-pairings included — `duel` behind `duelholy` is still two
fights). Verified over 200,000 rolls: **zero two-fight results**, down from
~4,900 expected, with **zero roll failures**, so no visit falls back to leaving
the config alone; duel effects still appear in 9.4% of rolls and duel ornaments
in 25.9%, so both homes remain fully available.

That fixes the roll, which is one of four ways config arrives — publish, share
code and storage are the others, and a share code encodes the effect and the
ornament as independent fields. So `Ornament.tsx` also refuses to render the
second fight, verified in the live DOM in both orientations (two canvases → one)
and confirmed not to touch the ordinary case (a duel ornament over a non-duel
effect still renders).

**The substitution is `DEFAULT_ORNAMENT`, never `null`.** Emptying the slot is
the tidier-looking answer and quietly breaks something else: the five taps that
reveal the footer's sign-in link live on this element, and on the phone band
that is the only findable route to an account. The ornament yields rather than
the background because a missing ornament is already ordinary — five layouts
hide the slot outright — while a missing background effect is not.

**Not changed, and worth knowing:** guardrails still constrain only the
randomiser, so an operator can publish other blocked combinations (Magazine +
rain, say) by hand. That predates this and is what "randomiser guardrails"
means; the duel pair is now the one combination also enforced at render time,
because two fights is incoherent rather than merely ugly.


## 2026-08-14 (later) — the duel, watched at last: four bugs, and the press

**The fight had never been looked at**, and `TODO.md` A said so honestly: it was
tuned through the step-through bench and a statistical run, and what no harness
had judged was whether it *looks* like a duel. Looking at it found four defects,
three of which no amount of reading the choreography would have surfaced,
because in each case the code says what it means and does something else.

**Verification method, since the environment still cannot show animation.** The
tab reports `document.hidden`, `requestAnimationFrame` parks (zero frames in
700ms) — and, measured this session, **timers are throttled to ~1Hz as well**
(two `setInterval(…, 16)` ticks in 1,064ms), so *no* form of live playback is
available here, not just rAF. What works is stepping: a harness driving the real
`src/fx/duel.ts` through the dev server renders N consecutive frames into a grid
of cells, each captioned with the frame number, the live sequence and both
fighters' moves. A filmstrip is not a substitute for watching it, but it answers
"what is the geometry doing on frame 47" exactly, which is what these bugs were.

**1. The anti-stall rail had become the normal mode.** `dir.pressure` counts
sequences and `chooseSequence` strips the pool down to sequences containing a
`hit` above 22 of them. Nothing ever reset it — `createDuel` set it to 0 and the
match reset rebuilt both fighters without touching it — so it was monotonic for
the life of the page. Measured over 55 simulated minutes: **1,504 of 1,526
sequence picks (98.6%) were made under the rail.** The comment above it read "a
normal match never reaches it". About forty seconds after page load, every match
did, permanently. The visible cost: four sequences fired twice an hour between
them, `standoff` never fired again after the opening match, `disengage` — the
only `any`-range entry, so the only one in all three shrunken pools — took
**30.5%** of every exchange, and matches ran ~28s instead of ~50s because
all-hit sequences drain health faster. The declared weights described a fight
nobody had seen since the first match. One line: reset it on match reset. After:
all 23 sequences fire, the rail is 13.6% of picks, the distribution tracks the
weights.

**2. `bladeGap` was solving the wrong equation.** The re-solve of the second
segment against a clamped `s` used `uw` where it needs `vw` — `((w + s·u)·v)/v·v`
is `(vw + uv·s)/vv`. Two segments that provably cross at (42.5, 193.2), checked
against an independent parametric intersection, came back **16 units apart with
the nearest point pinned to a hilt**; every configuration tested returned `r = 0`,
which is the tell. This is the routine behind "the sparks when swords meet"
(client, earlier the same day): the shower tests `near.d < 9`, so overstated
distances meant crossed blades often threw **no sparks at all**, and the bursts
that did fire were placed toward a fist rather than at the crossing. A geometry
bug that presents as an art problem, and unfindable by reading the spark code.

**3. There was no body-to-body constraint** — only the arena walls. The two
30-unit bodies overlapped on **3.9% of live frames**, closing to a minimum
separation of 0.1 units: one frame in twenty-six drew two figures inside each
other. Now a soft positional resolve, a third of the overlap per frame, applied
to **grounded pairs only** — the exemption is what keeps `flip_over` working,
since the somersault's whole job is to pass over the opponent and swap the
sides. Grounded overlap 3.48% → 0.72%, minimum separation 0.1 → 4.8.

**4. The blade lock had no blade contact.** `the-lock` is a `close` sequence and
`close` is anything under 132 units — nowhere near close enough for two 58-unit
blades held a forearm out from the shoulder to meet. Measured over 51 locks the
blades averaged **30.8 units apart** and the worst spent the whole press 61
apart. So the most iconic image in the genre was two people standing a metre
apart holding sticks, and the `TODO.md` B description of it — "just two blades
near each other" — was generous. `stepLock` now closes the pair to `LOCK_SEP`
with a signed exponential ease (signed because arriving from a parry could land
them *inside* the distance, which crosses the blades at the hilts). Settled
blade gap is now **0** in every lock, binding at about the middle of the loser's
blade.

**The press itself** (TODO B's first bullet) is built on top of those: a
sustained 2–3 sparks a frame at the true crossing, spawned with a short life so
they stay small and fall instead of accumulating; the whole X rotating as the
winner drives down and the loser is levered up, which walks the contact point
into the loser and makes the outcome readable about a second before the break;
a two-frequency judder that the loser shakes harder; a grind that moves both
fighters the same way so the lock travels without the separation changing; and
a burst plus two frames of hit-stop as it fails.

**Who wins the press is `beatPower`, set by the beat.** `the-lock`'s two `lock`
beats carry `power: 1` and `power: 0`, so the outcome is fixed at frame 22 by
the same role coin that assigns every other sequence, and the renderer never
reaches into the director to find it. Nothing added here consults a condition or
can extend the move, so the match-reset loop — which has no timeout — is exactly
as safe as before. Cost measured after: **0.02–0.05 ms/frame, not growing with
time**; the shower is free.

**And the ornament got a camera**, approved by the client immediately after the
report above. It drew at `scale = w / WORLD_W` — the whole 700-unit arena across
a square slot that is 340px on desk, 240 tablet, **190 on a phone**, 180 in
Magazine — so a fighter rendered about 42px tall on desk and **~20px on a
phone**, in a box that was overwhelmingly empty air. A fixed crop was not
available: the pair genuinely use the arena's full width (5th–95th percentile of
their centres is 110–571 of 700), so any crop tight enough to help cuts them off
at the walls.

`duelCamera` tracks the midpoint and fits the pair, clamped to 1.45–2.9 and
eased. Median figure height is now **61px at 190px and 109px at 340px**, against
~20px and ~42px before. Three things were needed beyond "track and zoom", and
each was found by measuring rather than by reasoning:

- **Zoom to where a jumper is going.** Fitting the current height looks right
  and fails: the somersault rises ~145 units in ~22 frames and an eased zoom
  cannot cover that from a standing start, so the jumper left through the top of
  the slot on 0.48% of frames — visible as a headless figure hanging from the
  frame edge for 14 frames, 50 times an hour. A jump is a projectile under
  constant gravity, so the apex is `v²/2g` above the current height and known on
  the frame the impulse fires. With that, measured clipping is **zero**.
- **Asymmetric zoom** — out at 0.13, in at 0.03. Pulling back is a correction and
  has to arrive before the thing it corrects for; pushing in is a choice and a
  fast choice reads as a mistake. This is what makes the high cap safe.
- **A match reset is a cut.** Both fighters teleport back to their marks, and
  eased that whipped the camera 43px in a single frame and then coasted for most
  of a second. Nulling the camera on `st.matches` changing makes the next frame
  snap — a scene change gets a cut. In-fight pan now peaks at 44px/frame once,
  during a knockback, and normally sits far below that.

`duelCamera` is exported and pure specifically so the bench drives *it* rather
than a copy of it. That is not tidiness: animation cannot be observed in this
environment at all, so a camera can only be checked by stepping it over
thousands of frames, and a re-implementation in the bench would only ever
confirm the bench.

**Noticed and deliberately not fixed:** `flip_over` does not rotate the figure.
The move's own comment describes "a still blade under a tumbling body", and the
body does not tumble — it floats over upright with its legs tucked. The only
`ctx.rotate` in the renderer is the death tip-over. It reads acceptably and
changing it is animation work rather than a bug fix, so it goes on the backlog.


## 2026-08-14 — the animation audit, the duel's director, and the phone scroll bug

**Every canvas effect was stepped through 1s / 6s / 15s / 30s and judged on what
it looks like *after* thirty seconds**, which is a different question from what
it looks like on arrival and the one nobody had asked. `fxlab.html` gained a
contact-sheet mode to make it possible at all — a backgrounded automation tab
parks `requestAnimationFrame` (measured: zero frames in 700ms), so no amount of
waiting shows you frame 1800.

**Measuring it properly changed the conclusions twice, and both mistakes were
mine.** Averaging a whole run makes every effect look like it gets more
expensive with time, because the longer panel absorbs more garbage collection —
that artefact reads exactly like an unbounded buffer, and I went looking for
growth in effects that hold no state at all. And a quarter-width panel measures
a fraction of the work a real viewport asks for. The bench now reports the
*minimum* of three short windows at full width: frame cost has a hard floor and
everything above it is interference.

On honest numbers the lag was **`rain`** at 3.0ms a frame, three to six times
any other effect — not `scan`, which was what got reported and had already been
fixed that morning. That exposed the more valuable finding: **the adaptive
resolution tier cannot reach a draw-call-bound effect.** It shrinks the buffer,
and `rain`'s cell and `plasma`'s grid are measured in CSS pixels, so the half
tier quartered their fill and left every draw call in place. The tier is now
handed to effects as `quality`.

**The duel's problem was never the artwork.** `decide()` ran once per fighter,
independently, and two independent randomisers cannot produce action and
reaction. Nothing was ever blocked; nothing ever bounced off anything. A
director now owns the exchange. The roles are also the fairness proof — no
sequence names a side — and one real bias was found and removed: `st.a` always
stepped first, so when both fighters were due to land a lethal blow on the same
frame, the left one always won.

Three bugs here were only findable by measurement. The x50 speed and the
"random lag" were one cause: the duel derived its frame count from the effect
clock, which has `boost` folded in, so it ran at ~2× for exactly as long as the
screensaver was up — and stepping in whole frames from a fractional accumulator
at a rate of 1.9 alternates 2,2,1 steps per frame, which is judder on a fixed
cadence. And starting 370 units apart with travel halved meant nothing ever
closed: 34 exchanges drawn from five sequences, all long-range, with the entire
swordplay half of the pool unreachable.

**The phone scroll bug was `scroll-snap-type: y mandatory`.** Reported as "as
soon as you let go it jumps back to the top… only way to scroll is to keep a
finger on the screen to save your place" — and that last detail is what
identified it, because holding a finger down suppresses snapping. Measured at a
real 417×857 viewport: the scrollport is 654px and `.v-hero`, the first snap
area, is 684px. Mandatory snap must come to rest *on* a snap point, and every
position inside an oversized area has that area's own start as its nearest one.
`proximity` was not enough on this band either, so phones get `none`.

A process note worth keeping, because the client made it explicitly: **I called
this fixed after testing the home page only.** It needed all nine content pages
at four scroll positions each. Verifying the case you happened to look at is not
verifying the bug.


## 2026-08-14 — The visual audit begins, finds a real bug, and the fix breaks Terminal

The client asked for "a complete audit of all graphic things … then a gameplan". The blanket version
was argued against and not taken: `design/SPEC.md` is authoritative, its oddities are deliberate —
palettes that fail WCAG AA, copy that mocks its own site, a Guestbook with no form — and a
sweep-and-improve pass sands those off while writing no *why* for any of it. What was taken instead
is a **targeted audit**: look at the rendered site, report only what is genuinely broken, leave what
is deliberate. That distinction earned itself twice inside an hour.

### The technique

The browser's window-resize is unreliable in this environment, so bands were forced from code — a
temporary `localStorage` override inside `bandForWidth`, plus a pinned `DEFAULT_CONFIG.layout`,
both reverted before commit. That gives any band at any window size, deterministically. **It has one
limit worth knowing**: it forces the *band* without narrowing the *window*, so anything that depends
on real width (a nav row overflowing) cannot be reproduced with it — only observed at a genuinely
small size.

### Two real defects

**The phone scrolled two things at once.** `stageHeight: "calc(100dvh - 132px)"` was a hardcoded
guess at the header's height; the real phone header is **147px**, because it wraps to two rows. The
chrome came out 15px taller than the viewport, so the *document* scrolled behind the
already-scrolling `.v-stage` — two nested vertical scroll containers on the band least able to
afford them.

The interesting part is that **the number was correct when it was written and drifted afterwards**:
the header grows whenever a chip is added to it, and one was added the same morning (`sound`). So
the fix is not a better number. `.v-chrome` became a flex column and `.v-stage` `flex: 1` with
`min-height: 0` — which measures instead of guessing. `--stage-height` is deleted from `BandTokens`,
`theme.ts` and the CSS, with a note on `BandTokens` saying why it must not come back.

**The nav hid a page.** The phone pill row overflows by a measured 66px with its scrollbar
deliberately hidden, and the last pill was sliced mid-word — "GUE" — with nothing to say there was
more. Guestbook was, in practice, invisible on a phone. A trailing `mask-image` fixes it: a cut
letter reads as broken, a fading one reads as continuing.

### …and the fix broke Terminal, in production

`height: 100dvh` is right for every layout whose stage scrolls internally and **wrong for the one
whose document scrolls**. Terminal's stage is deliberately `height: auto; overflow: hidden`; clamped
inside a one-viewport column it stopped scrolling and started **clipping** — a measured 1677px of
content in a 531px box, with the document unable to take over. Most of every page became unreachable
by wheel, keyboard or touch, on desk and tablet both. It was live for about an hour.

It was caught by an agent sweep pointed at *the same class of bug* — "find every other place a
hardcoded length guesses another element's measured size" — which is the strongest argument in this
entry for auditing by class rather than by page.

**The first attempt at the fix was worse than the bug**, and that is the part worth keeping.
Softening the clamp to `min-height` let `.v-stage` (flex-basis `auto`) size to its content
*everywhere*, so no layout scrolled internally any more and the document scrolled on all fourteen —
silently discarding the fixed-header/scrolling-stage design, Stack's snap sections and the
scroll-velocity boost. Measured before shipping: phone went from `docOverflow: 0` to `1371`. One
layout needed an exception, so one layout gets one: `.layout-terminal .v-chrome { height: auto;
min-height: 100dvh }` and `flex: 0 0 auto` on its stage.

### Two more the sweep found

- **`.vessel` was `min-height: 100vh` while `.v-chrome` is `100dvh`.** `vh` resolves against the
  *large* viewport, so on any mobile browser showing its URL bar the wrapper stood 60–90px taller
  than the window while the chrome fitted exactly — the same nested-scroll bug by a second route,
  live on every phone visit. The two must use the same unit.
- **The nav fade went on tablet too**, on the reasoning that the row always overflows. True of a
  phone, false of a tablet, where 900px fits the six public pills with room to spare — so every
  tablet visitor got a permanently faded "Guestbook" with nothing behind it. An affordance pointing
  at nothing is worse than none.

### Two process notes, both cheap and both nearly missed

**A scripted edit left an orphaned comment fragment**, and its stray `*/` swallowed the selector
underneath, so the nav rule was silently dead. Nothing in the file *looked* wrong. It surfaced only
because the verification read the **computed style** rather than the source — check what the browser
did, not what the file says.

**An early "16px still overflowing" reading was a broken dev server**, serving without `base.css` at
all (`box-sizing` was `content-box` and the `html, body { margin: 0 }` reset was absent). Confirming
*why* before fixing is the only reason a non-bug did not receive a fix — and a fix to a non-bug is
how the next real regression gets introduced.

---

## 2026-08-14 — The line-by-line review, run six ways at once; eight fixes

`docs/HANDOFF.md` has carried this as "open for a future session, at the client's request — *look over
every single line of code made by the other models*", parked because it wanted fresh context. The
client authorised parallel agents, which is fresh context by construction: six reviewers, one per
area — `worker/`, `src/auth`+`src/share`, `src/config`+hooks, `src/components`, `src/fx`+`src/data`+
`src/styles`, and one on **this session's own new code**, because nobody should review their own.

Each was told to read `CLAUDE.md` in full first and to drop any finding it could not attach a
concrete failure scenario to. That mattered: this codebase is dense with things that look like bugs
and are recorded decisions, and every reviewer returned a "checked and deliberately not reported"
list naming them — the blade literals, `recordSuccess`'s asymmetry, the prf-less slotless passkey,
`dist` as the sole damage authority, the stateless WebAuthn challenges. **Everything below was
verified by hand before it was touched.**

### The one that matters most: an SDP could carry two fingerprints

`src/share/handshake.ts` matched `/^a=fingerprint:(.+)$/m` with `.exec` — the *first* line, with no
constraint on the rest — and the whole unmodified SDP then went to `setRemoteDescription`. RFC 8122
§5 lets a media-level fingerprint override a session-level one.

A hostile signalling service is explicitly in scope (§3, §12 R: the DO relays opaque payloads and is
not trusted). It relays both the SDP and its signature, so it could take a genuine pair, prepend the
owner's real fingerprint at session level to **its own** SDP, and leave its own fingerprint in the
`m=application` section. Verification passes against a value DTLS then ignores; both legs terminate
at the relay; it reads every byte — **without forging a signature**. That is §3's first row ("the
operator cannot read any user's files") made false.

Now: match all of them, normalise, and refuse unless exactly one distinct value remains. Identical
repeats are fine — a bundled SDP legitimately restates the same fingerprint per m-section, and
normalising before comparing is what makes that a repeat rather than a disagreement. Refuse, never
repair, the same rule as `paths.ts`. Three harness checks pin it.

### The signup quota was bypassable by concurrency

`worker/accounts.ts` used `assertAllowed` — the **non-consuming** `/check` — and recorded the
attempt only after the account had been written. That is the exact race the 2026-08-13 audit closed
for sign-in, missed on this one route: 500 concurrent signups from one address all check before any
counts, all see zero, and all 500 accounts are created against an allowance of twelve, at ~23 D1
rows each. A quota of "12 per window" was really "one unbounded burst per hour".

Now `assertAttempt`, which reserves and checks in one round trip. The two trailing `recordFailure`
calls are gone with it, so the cost stays one unit per signup and the harness's eight-per-run still
sits under the allowance — the same trade the credential paths made when they moved. The harness's
rate-limit section passes unchanged, which is the check that mattered.

### The toast was never centred, on any screen, ever

`.v-toast` set `transform: translateX(-50%)` and `animation: v-rise … both`. `v-rise` animates
`transform`, an animated declaration outranks a normal one, and a **forwards** fill outranks it
permanently — so the centring never applied at any point in the toast's life. Its left edge sat on
the viewport's centre line; on a 390px phone a 359px toast ran most of the way off the right edge.
The tell is that calm *fixed* it, because calm kills `animation` with `!important`.

This is the trap `CLAUDE.md` already documents for `.v-block`, in a second place. Fixed with the
rule `interaction.css` already states: **`translate`, not `transform`** — they are separate
properties that compose, so the keyframe keeps `transform` and the rule keeps its centring.

### `constellation` stranded half its field on any window shrink

The note on the `vessels` regression says particle fields "wrap back in within seconds". True of
`stars` (teleports to centre) and `bokeh` (reassigns `x` on wrap) — and not of `constellation`,
which bounced by flipping velocity without repositioning. At the edge that is correct; far outside
the box it flips every frame and oscillates about its old position for ever. Shrink a 1600px window
to 800 and roughly half of the ninety nodes freeze off-canvas for the rest of the visit. Now it
clamps back inside as it flips, which costs nothing at the edge.

### Four defects in this session's own code, found by the sixth reviewer

The reason to run one: all four were mine, from today.

1. **A timer could fire a voice.** The hourly time-of-day palette change called `say`, which chimed
   — so with `mode: "tod"` and `sound` both published, a page nobody had touched would build an
   `AudioContext` and queue a blip into a suspended clock, which then fired late and attached to
   nothing when the visitor finally clicked. That falsifies the engine's headline promise. `say`
   gains `{ silent: true }` for the callers that are not a gesture.
2. **That same call sat inside a `setConfig` updater**, which must be pure — the rule four
   neighbouring call sites carry a comment about. Hoisted out.
3. **The gate read stale config.** `chime` reads `live.current`, which the post-render effect writes,
   so inside one handler it held the *previous* render's values: the sound toggle's "switching off
   stays silent" was false, and turning calm **on** played a tick that the release effect then cut
   off mid-envelope — the click `blip` exists to avoid. `update` now freshens the ref in the same
   tick, which fixes the whole class.
4. **The panel's Sound chip bypassed the gate**, calling `play` directly. The header's chip is
   hidden in calm so its direct call was safe; the panel's is visible in calm, so it made a noise in
   the one mode that promises none. Both now go through `chime`, which is what `CLAUDE.md` already
   claimed was the single gate.

### Two more, from the same reviewers, fixed

**Arrow paging had no modifier guard.** `useAccountRoutes` has always had one; this hook did not, so
**Alt+← / ⌘+← — the browser's Back — also paged the site**. The browser navigated, then the dive's
`commit` ran 300ms later, saw the URL was not the page it had started moving to, and `pushState`d a
third on top. Back landed somewhere nobody chose, and Back again only returned to the start. The
keyboard Back shortcut was unusable on all six NAV pages.

**The door's drag route never got the phone touch guard** its mirror was given on 2026-08-14. A
mostly-horizontal swipe over non-scrollable page produces no `pointercancel`, so ordinary reading
read as a 260px drag — the account side was yanking visitors to `/signin`, and this side opened the
operator door over the page. It survived the audit only because `openDoor` refuses everyone else.
The two directions are one gesture with two meanings, so they now carry the same guards.

### Confirmed and deliberately deferred

Real, verified, and not fixed in this pass — each is a bigger change than the ones above and none is
a security issue:

- **The `/machines` explorer re-lists every minute.** `onStale` is an inline arrow, so it changes
  identity on every parent render; `list`/`listColumns` carry it in their deps and the effect
  re-fires. The parent re-renders once a minute because the context value carries `clock`. Reading a
  large folder, the table blanks to "Listing…" and returns scrolled to the top, once a minute.
- **The explorer's Retry cannot succeed after the channel folds** — `onStale` drops the connection
  from the parent's map, but the Explorer's own prop still points at the dead object, so every
  Retry sends on a closed channel. Each attempt also leaks a pending-map entry.
- **Tablet-band Stack gets neither the shade pool nor a card** — `.band-desk.layout-stack` and
  `.band-phone.layout-stack` between them miss `tablet`, and `adaptLayout` leaves Stack alone there,
  so body copy can sit straight on a live canvas. `:not(.band-phone)` would cover both.
- **Phone Stack restores the card background but not its `backdrop-filter`**, which is the half that
  makes 58% translucency readable over a sharp canvas.
- **`totpConfirm` and `setPassword` are check-then-act** where their siblings moved the guard into
  the write's `WHERE`. Both need concurrent identical requests, and both UIs gate on `busy`, so
  neither is reachable through the browser today.
- **The signalling upgrade has no `Origin` check** — `crossOrigin` returns false for GET and the
  upgrade is special-cased ahead of it anyway. `SameSite=Lax` covers it today; it would stop
  covering it the moment per-account subdomains exist, so it belongs with that decision.
- **The two "pure, before any wire" harness sections run last**, after the reachability gate that
  exits the process — so a developer who appends to a catalogue and runs the harness without
  `dev:worker` gets none of the wire-format checks. The section titles and `CLAUDE.md` both claim
  otherwise; moving them above the health check would make the claim true.

---

## 2026-08-14 — `/setup`, the first new page since the spec

`TODO.md` 9, open since 2026-08-12 as one line — "a setup guide page/download (Tailscale et al.)"
— which did not say who reads it. Asked, and the answer was **remote access before a callout**: the
page the operator sends someone so a fix does not need a drive.

**A page, not a download.** It needs no file asset, works on anything, and a visitor who wants it on
paper can still print it. The brief allowed either.

### What the copy does, and why in that order

**Quick Assist leads, not Tailscale.** For a one-off look, "already on your machine, nothing to
install, nothing to sign up for, and it stops existing when you close the window" beats an account
signup, and it is the honest first recommendation even though it is the least impressive one.
Tailscale is the *standing* option — worth ten minutes only if the operator is in that machine more
than once — and it is described as what it actually is: a private link between two machines, with
screen sharing running **inside** it. Tailscale is not screen sharing, and a guide that implied it
was would send people round in circles.

Then three blocks that exist because of what the page is asking people to do: what the operator can
see (the screen, while you watch, never unattended), how to turn it off (uninstall takes his way in
with it, and you do not have to tell him), and **the scam warning**, which was not in the brief. A
page telling people to install remote-access software is precisely the page a scammer would like
them to have read first, so it says so — *"the difference is that you rang me"* — and ends on gift
cards, which is the tell that costs people the most.

macOS gets a deliberately short block: screen sharing exists but has moved between versions, and
"tell me which one you're on and I'll send the three right steps" is more honest than four wrong
ones written in advance.

### Placement, and the one word it cost

A **footer** page beside Now and Changelog rather than a seventh nav pill. The six pills are a
settled design, and there is a mechanical reason too: `NAV` is what `useOperatorRoutes` cycles with
the arrow keys and what Radial's orbit renders, so a seventh entry there changes two unrelated
behaviours as a side effect. `FOOTER_NAV` changes neither.

**It moved a line of protected copy.** The 404 says "There are eight other pages and all of them are
more interesting than this one" — and `setup` made eight wrong. The counts on the 404 are jokes that
depend on being true, which is *why* the client kept them verbatim, so preserving the word would
have been the change rather than correcting it. One word; the four-item example list beneath it was
not touched. Recorded in `CLAUDE.md` under *Copy changes*, with the note that another content page
moves it again.

Tailscale is named in prose and not linked. The site has no outbound links anywhere and this page
was not the place to start.

---

## 2026-08-14 — Share codes get harness coverage; 263 → 301

The share code is the site's most dangerous wire format and had **no automated coverage at all**,
which is exactly backwards: it is the format whose failures are silent. A code pointing at the wrong
palette still *works*. An entry appended to a catalogue repoints every code in circulation without an
error anywhere. A base-36 slip reads `12` as 38, falls through `FX[38] ?? FX[0]` and applies the
default effect, which looks precisely like a failed deploy — a trap `CLAUDE.md`, `HANDOFF.md` and
`DUEL.md` all warn about, having paid for it once.

Every one of those was caught by a person reading carefully. That is not a control.

Thirty-eight checks, in the pure section beside the path rule (§12 S) so they run before any network
call. They cover: full round-trip field by field; **each toggle bit asserted individually** — a
swapped pair round-trips perfectly and is still wrong for everyone holding an older code; the
bitfield still fitting one base-36 character at maximum; five- and six-field legacy codes still
decoding, still leaving the ornament alone, and still meaning sound-off; effect index 12 encoding as
`C`; the decimal-looking `0-0-12-0-7-0` falling back rather than throwing; hidden effects still
decoding while `PICKABLE_FX` stays a subset of `FX`; out-of-range indices clamping to real catalogue
entries in all five positions; and five distinct malformed inputs refused.

Plus the presets' own guarantee, asserted rather than assumed: each `PRESETS` entry decodes to **real
catalogue entries**, not to a literal string. That is the whole point of deriving the code
structurally — a hardcoded `"N-7-5-3-5-3"` stays correct until something is appended and then becomes
a working code pointing at the wrong palette. And each preset is checked not to switch sound on for
anybody.

The hidden-effect loop is a no-op today, because nothing carries `hidden` since the duels were
re-listed this morning. It is deliberately written as a loop over `FX.filter(e => e.hidden)` so that
it starts asserting the moment something is withdrawn again, which is when the rule matters.

---

## 2026-08-14 — The CSP measured against production; the blocker list goes from four to one

`TODO.md` 12's remaining half was "flip to enforcing once production runs quiet through the surfaces
the harness cannot drive: a passkey ceremony, a phase-2 browse, TOTP enrolment, each canvas effect."
That was written as four things to *wait for*. Measured, it is one, and three of them were never
observable in the first place.

### The reporting pipeline works, and it is slow enough to look broken

Never actually seen working before today. Driven under `wrangler tail`: the browser fires
`securitypolicyviolation`, the Reporting API batches it, `POST /api/csp-report` arrives, and
`worker/index.ts` logs it. End to end, confirmed.

**The report arrived with `age: 55218` — fifty-five seconds late.** The first check, six seconds
after the violation, saw nothing and looked exactly like a broken endpoint. Anyone testing this
needs to wait a minute, and unloading the document helps flush the queue. Worth recording because
"the tail is quiet" is the evidence the whole report-only stage rests on, and quiet-because-nobody-
is-listening and quiet-because-nothing-is-wrong look identical.

`Reporting-Endpoints: csp-endpoint="/api/csp-report"` is present and correct on page responses, which
matters: Chrome prefers `report-to` over `report-uri` when both are named, so a missing
`Reporting-Endpoints` header would have made the whole stage silently collect nothing.

### The public site is quiet, and that part is now measured rather than assumed

Zero violations across all nine content pages plus `/signin`, `/signup`, `/machines`, `/share` and a
genuine unknown URL — with **calm off** so the canvas actually renders, and **sound on** so the
`AudioContext` is constructed. Zero Worker exceptions across the whole run.

### Three of the four surfaces close by inspection

They were on the list as things to observe. They are not observable, because they cannot produce a
violation:

- **Passkeys** — `navigator.credentials.create/get` is not a CSP-governed fetch. There is nothing
  for the policy to have an opinion about.
- **TOTP enrolment** — there is no QR code. §4 is satisfied with the secret as text and an
  `otpauth://` URI, precisely because a QR would have needed a library. No image, no `data:` URI, no
  external request.
- **Every canvas effect** — 2D canvas drawing calls, which fetch nothing. Backed by a sweep of
  `src/`: no `eval`, no `new Function`, no `dangerouslySetInnerHTML`, and **no external origin
  anywhere in the source**.

The phase-2 browse is two-thirds closed the same way: the signalling socket is `wss://mcclevarty.ca`
and is explicitly in `connect-src`, and STUN through `RTCPeerConnection` is not covered by any
fetch directive Chrome has shipped.

### What is actually left is one line, and it is a real unknown

`saveBlob` in `src/components/MachinesPage.tsx` — `URL.createObjectURL`, then
`<a href="blob:…" download>`, then a programmatic click. A deliberate probe confirmed **`blob:` is
not permitted by the current policy**: fetching one reported against `connect-src` and loading one
into an `<img>` reported against `img-src`, both saved only by report-only mode.

A `download` anchor is not governed by fetch directives, so this is *probably* fine. Probably is the
wrong standard here — being wrong means the operator silently loses the ability to download their
own files, which is the entire point of phase 2. **So the flip waits for one real download in the
two-tab test**, which is already owed, rather than for a week of watching.

**`blob:` was deliberately not added to the policy.** It would not protect the anchor path — that
path is not fetch-governed — so adding it buys nothing against the actual risk while widening a
security policy for a feature that does not exist. It *will* be needed in `img-src` when the
deferred "image thumbnails from actual bytes" lands (`TODO.md` 5b); that is the moment to add it,
with something real behind it.

---

## 2026-08-14 — The site gets a voice, and a stored preference stops falling through

`TODO.md` 7 — asked for twice, never built, and correctly flagged as a spec change rather than a
patch: it needs a control, a persisted toggle and a share-code field.

### Synthesised, because the Assets rule already decided it

`SPEC.md`'s *Assets* rule is no third-party libraries, no webfonts, no images. Audio was never named
but the reasoning covers it, so `src/audio/engine.ts` is oscillators and envelopes — there is no
`.mp3` here and the whole feature costs nothing over the wire.

**The pitch comes from the palette.** `src/theme.ts` exists so that no component contains a literal
colour; this is the audible half — no voice contains a literal frequency, they are intervals above a
root the palette picks, from a pentatonic set so no two palettes can land on a tritone mid-bleed.
Changing palette retunes the site, which is worth the twenty lines it costs.

Seven voices, all under 200ms: `nav`, `toggle`, `open`, `close`, `toast`, `shuffle`, `deny`. A site
that chimes at every opportunity is a site people mute.

### Autoplay is satisfied by construction, not by asking

**There is no ambient bed, no loop and no timer.** Every voice is fired by a gesture the visitor
made, so there is nothing that *could* play uninvited, and the `AudioContext` is not constructed
until the first `play()` — a visitor who never turns sound on never allocates one. `releaseAudio()`
gives the device back when sound goes off or calm comes on, because a live context marks the tab as
playing audio and can hold a Bluetooth headset in its high-latency profile.

**Calm silences everything.** Calm is the quiet mode in every other sense — no motion, no shadow, no
canvas — and it would be a strange one that still chimed. The header chip is *hidden* in calm rather
than disabled: a switch that visibly does nothing is worse than no switch.

### The bitfield had a spare bit, so there is no seventh field

Share codes carry sound as **bit 16** of the existing toggle bitfield rather than a new field. Every
code in circulation has that bit clear, which decodes as sound off — the correct default and the one
a visitor would want. The field count does not change, so nothing that counts hyphens breaks, and
base-36 still renders the full bitfield (max 31, `V`) in one character. Verified: legacy five- and
six-field codes decode `sound: false`, both directions round-trip, garbage still returns null.

### It is publishable, and the asymmetry is written down

`sound` joins `PUBLISHED_KEYS` in both halves — the client's `src/config/siteConfig.ts` and the
Worker's `worker/site-config.ts`, which are separate lists and silently drop anything missing from
either. It belongs there because the share code already carries it, and a pasted code being able to
do something publishing cannot would be the odd asymmetry.

But `calm` and `sound` are not equivalent: publishing calm makes the site gentler for everyone and
publishing sound makes it louder for everyone. Two guarantees hold that in check and both must stay
true — nothing plays without a gesture, and **a visitor's stored preference always beats the
published value**, permanently and in both directions. Recommendation to the client: leave it off
when publishing, and let people opt in.

### The stored-preference rule, restated — and the bug that was hiding under it

`CLAUDE.md` said calm was "the one stored field" and warned against extending the carve-out. Sound
extends it, deliberately, and the rule is better stated than the exception was: **the stored fields
are the ones a visitor can set for themselves.** Everything else is appearance and belongs to the
operator. Today exactly two controls are public — the two header chips — and they are these two. The
test for adding a third is not "is this useful to remember" but "can a visitor set it at all".

Calm must survive because a visitor turned it *on*; sound must survive because a visitor turned it
*off*. Being told to be quiet is an instruction, not a session preference.

**Adding the second one exposed a real bug in the first.** `loadConfig` opened with
`if (published is not an object) return { ...DEFAULT_CONFIG }` — an early return that never reached
the stored-calm lookup. So calm silently stopped persisting whenever nothing was injected: before
the first publish, and, the case that matters, **whenever D1 is unreachable and
`worker/site-config.ts` correctly injects nothing.** The accessibility escape hatch switched itself
off in exactly the degraded state where someone is least able to go hunting for it. Production hid
it because a config *is* published, so the early return was never taken there.

That branch now applies both stored preferences before returning. Verified with nothing published:
stored-on gives on, stored-off gives off, and no preference still falls through to the defaults.

---

## 2026-08-14 — The duel gets an attract mode, and the screensaver turns out to be older than the idea

The client asked whether the screensaver should run the lightsword fight, and the matrix rain when
the theme is matrix rain — *"or is that dumb?"*

**It is not dumb, and it is what the screensaver has always done.** `Screensaver.tsx`: sixty seconds
without a click fades the whole interface to `opacity: 0` and leaves only the canvas, which speeds
up (`FxCanvas` adds `0.9` to the boost while sleeping). The screensaver has never had a rendering of
its own — it *is* the configured effect, alone, faster. So with the duels re-listed earlier today
the client's idea was already live; picking either duel gives a full-screen lightsword fight after a
minute idle, and picking rain gives rain. Worth writing down because the question will be asked
again: the screensaver has no content of its own to give it.

### What was actually missing, and is now built

The duel was still drawn with **background** settings while asleep — `0.62` of the viewport width,
bodies at `dim: 0.55`, health bars off — all three of which exist to keep it out of the way of body
copy that, once the chrome has faded, is not there. It was being polite to nobody.

`Frame` gains a `sleeping` flag and `duelling` an attract blend:

- **Its own flag, not something read back out of `boost`.** Scroll velocity is folded into the same
  number, so a hard scroll is indistinguishable from a sleeping interface there.
- **Eased, never switched.** The chrome takes 1.6s to fade, and a figure that doubled in size on one
  frame would beat it there and read as a glitch. The blend closes 1.6% of the remaining distance
  per fight frame, which lands with the fade at the boost the screensaver runs at. Measured on the
  bench: `0.34 → 0.56 → 0.71 → 0.80 → 0.87 → 0.91 → 0.94 → 0.96` going to sleep and a clean
  exponential decay back, no discontinuity at either end.
- **The rate is expressed in fight frames**, which run boosted asleep and unboosted awake, so the
  settle back takes roughly twice as long as the growth. That asymmetry is deliberate: waking is the
  moment you want the page back, not a second animation competing with it.
- **`approach()` raises the retained fraction to the frame count** rather than doing a naive
  `x += (target - x) * rate`. `frames` here is delta-corrected and clamped to 4, never 1, so the
  naive form would travel a different distance per unit time on every display.
- **Health bars needed a numeric fade.** `DuelView.bars` is a boolean and can only pop, so `barAlpha`
  joins it — optional, defaulting to 1, which leaves the ornament untouched. The judgement that made
  bars ornament-only is unchanged: they are wrong behind body copy and right once the copy has gone.

At full attract the pair runs about 1.4× linear with feet 4% lower, and `dim` reaches 1.

**Only the duel reads `sleeping`.** Every other effect is a field that already fills the viewport and
gains nothing from the extra room; adding the flag to the frame does not oblige anyone to use it.

### Verified on the bench, not on the site, and that is a real limit

`fxlab.html` gained a **screensaver** checkbox and drove the whole ease. What could not be checked
here is the sixty-second path on the real site: the screensaver timer runs in a hidden tab but the
render loop correctly parks, so the blend would advance one or two frames per screenshot and never
visibly grow. The effect logic is the same code either way and the wiring is a one-line pass-through
that typechecks — but the sentence "it looks right easing in on the live site" is the client's to
say, not this session's.

### The placement question, answered rather than acted on

Attract mode does **not** fix the fighters standing behind the hero's CTA, because that is the
non-attract state. Recommendation: **leave it.** The effect is operator-opt-in, the screensaver is
now the showcase so the in-page state can afford to stay recessive, and the collision is a function
of viewport height *and* where the fighters happen to be in the match — a fixed offset would trade
Cinematic's collision for another layout's. It wants the client's eye in motion rather than more
stills.

---

## 2026-08-14 — The four open design calls, decided

The client handed over the four judgement calls the HUD pass and the duel rebuild had left
open — *"I'll let you make them, do what is graphically the best"*. Each was looked at in a
browser before it was decided, and one of the four turned out to be resting on a fact nobody
had measured.

### 1. The contact sheet's duotone in calm — kept, and raised to full strength

Shipped as a halved `0.1` on the grounds that a photograph is not body copy but calm should
still be quieter. Measured on the real page: **at 10% the tint is indistinguishable from no
tint at all.** The tile image is itself `opacity: 0.8` over a dark card, so the backdrop the
`color` blend has to work against is already dark and low-luma; the isolated swatch that made
22% look strong was a full-opacity image at four times the size. Set the blend to `1` on the
live page and the teal is unmistakable, so the mechanism is fine — 10% is simply below the
threshold of visibility.

That made the shipped position the worst of the three: a special case in CSS and a paragraph
of documentation defending an effect nobody can see. So the `.is-calm` override is **deleted**
and calm tints at the same 22% as every other mode.

The reasoning that ruled out stripping it is unchanged and is what rules out stripping it now:
calm exists so body copy holds up on the low-contrast palettes, the caption sits above the
blend so no text is ever blended, and calm is not a colour mode — it changes no palette value
anywhere else, so a photograph that changed colour on toggling it would be the one thing that
did. Checked at 22% against all twenty-five palettes' `--a1`: every one reads as a deliberate
duotone, including Datamosh's hot pink and Toxic Bloom's acid yellow-green.

### 2. Presets stay operator-only — reaffirmed, and a lying comment removed

Kept as they are, and the reasoning is stronger than the proposal's rather than weaker.

The check that decided it: **what appearance control does a visitor actually have today?**
Exactly one — the calm toggle. The shuffle is reachable only from the panel and the command
palette's operator block; every palette, layout, background, type and ornament entry sits
behind the same gate; `.v-paste` is in the operator-only panel. "Show me something weird" on
the home page is not a shuffle at all — it navigates to the gallery. So making presets public
would not be loosening one control among many, it would be the site's **first** public
appearance control, and the site shows one published look on purpose. A preset switcher does
not make that look better, only negotiable.

What *was* wrong is now fixed: the comment above the loop claimed the block was "the route a
visitor has to them, since the siteconfig panel is operator-only and the palette is not" —
while sitting inside `if (isOperator)`. It was leftover proposal wording, and a comment that
contradicts its own gate is an invitation to resolve the contradiction by moving the loop out
of the gate.

### 3. The two duel backgrounds are re-listed

`hidden: true` deleted from `FX` 12 and 13, which was the whole of "re-list them" exactly as
promised. They render correctly and read as intended — the hooded/blue vs domed-helmet/red
pairing and the haloed/green vs horned-and-tailed/red pairing are both unmistakable at
background scale.

The reason this is a small change and not a product risk: **every surface that reads
`PICKABLE_FX` is operator-gated** — the panel, the palette's appearance block, the shuffle.
No visitor gains an effect. The operator gains two entries in their own menu, and a visitor
sees a duel only if the operator publishes one. (An earlier read of this note assumed the home
page's "something weird" button rolled the dice and would therefore hand visitors a duel; it
does not, and that was checked rather than assumed.)

One honest observation recorded against the effect rather than acted on: the fighters are
centred with their feet at 80% height, which on Cinematic at a short viewport puts them
directly behind the hero's CTA row. Nothing becomes unreadable — `dim: 0.55` holds and the
button stays crisp — but it is the one thing that reads as placement rather than design.
Moving it is a composition change to a tuned effect, not part of this decision, so it is
flagged in `src/fx/effects.ts` for the client's eye.

`PICKABLE_FX` now equals `FX`, and both stay. Collapsing them into one array is the tidy-up
that would force the next withdrawal to delete an index instead of flagging one.

### 4. `fxlab.html` is kept; the `?site=` override is not

Split, because the two temporary tools were not the same kind of thing.

**`fxlab.html` is committed at the project root.** Three sessions in a row failed to verify the
canvas by eye, and this session spent a fourth round rebuilding an ad-hoc version of the same
bench from the browser console before it could judge decision 3. The obstacle is structural and
correct on both sides: an automated or occluded browser reports `document.hidden`, so
`requestAnimationFrame` parks, *and* `prefers-reduced-motion: reduce`, which becomes calm, which
hides the canvas. The bench sidesteps both by advancing the clock from an explicit Step button
rather than from rAF, so it renders identical frames in a buried tab — verified: all sixteen
effects, 400 frames each, with `document.hidden === true`.

It is safe to commit because it **cannot ship**: `vite.config.ts` declares no
`rollupOptions.input`, so the build has exactly one entry, `index.html`. Confirmed by building
— `dist/` contains no `fxlab.html`. The file's own header says so, and says that anyone adding
a multi-page input map must leave it out.

**The `?site=<base64>` parameter is not kept.** A URL that overrides the operator's published
appearance is a public surface and a product decision, it bypasses the published-only
discipline `loadConfig` exists to enforce, and — unlike the bench — nothing needed it: the same
verification is reachable by editing `DEFAULT_CONFIG` in dev, which is a local edit rather than
a permanent route.

---

## 2026-08-14 — The canvas effects, finally looked at; and the duel gets a skeleton

Two things, both downstream of the same fact: the HUD pass shipped with its canvas work
**unverified by eye**, because the verification browser reported `document.hidden` and the render
loop correctly parks. `TODO.md` 2d recorded that honestly. This entry closes it.

### Why nothing was visible last time, and it was two things, not one

`document.hidden` was the half that got written down. The other half only showed up on the real
site: the verification browser also reports **`prefers-reduced-motion: reduce`**, which
`ConfigContext` turns into calm, and **calm hides the canvas**. So even with a visible tab, the
front page renders no effect at all until calm is toggled off. Anyone repeating this check needs
both: a visible tab *and* calm off. It is not a bug — both behaviours are correct — but it is the
reason two sessions in a row could not see a canvas.

All sixteen effects were then rendered at 1568×778 and at 1026×832, against Nebula Drift and Cold
Open, plus `hud`+`scan`, `hud`+`telemetry` and `terminal`+`rain` on the real site. The circles are
round, `plasma`'s grid comes out at ~58 columns across 1526 CSS pixels (i.e. the 26px cell is
receiving CSS pixels, not device pixels — the load-bearing `setTransform` is doing its job), and
`scan` and `telemetry` read as intended.

### `vessels` was stranded by the buffer resize — a real regression

**The one bug the pass introduced, and it was in the default effect.** `buildTree` grows the tree
against `w`/`h` once and `FxCanvas` drops the effect cache only when the *effect id* changes, on the
documented grounds that a resize is absorbed by the effects themselves. Every particle field wraps
back in and `rain` compares its column count, but the tree does neither — so after a window resize
the trunk, rooted at `w * 0.5`, sits off-centre and the two side branches, rooted at `-10` and
`w + 10`, **detach from the edges and float in the middle of the page**.

This could not happen before the HUD pass: `w` and `h` were the constant 1600×1000 and CSS did the
stretching, so there was nothing for the tree to go stale against. Widening the window from 1050 to
1600 on the live site reproduces it every time.

The fix is `rain`'s own pattern — the cache carries the box it was built for — plus one addition:
it also carries the **pool of random numbers** the tree was grown from. Rebuilding from the pool
re-fits *the same tree*. Without it the two options are both visibly wrong: keep the old geometry
and the branches stay detached, or re-roll and the whole tree reshuffles on every frame of a
drag-resize. Depth can still shift with the box because the `len < 14` floor bites at a different
level on a short canvas; the pool keeps that to a local difference instead of a new tree.

### The duel gets a skeleton, at the client's request

"Make the characters look better, and the fight sequences more realistic." What was actually there:
a fighter was **two rectangles and a line** — one `fillRect` torso, one `fillRect` head, no arms, no
legs, no hands. The sword hand was a pair of constants welded to the torso, so a swing could only
*pivot*; the blade never travelled through space. There was no wind-up (the blade jumped 0.95rad in
a single frame on the opening frame of an attack), no follow-through, and `force`, `kicking` and the
victory pose were bare constants that snapped in and out. The only thing on the whole figure with
idle motion was the horned fighter's tail.

What changed:

- **A local transform.** `drawFighter` now works in body-local units with `scale(facing, 1)`, which
  deletes every mirror term. This is why limbs became affordable at all — the old version inlined
  `cx` and `facing` into every coordinate, so every part had to be written twice in the author's
  head.
- **Articulated limbs**, two arms and two legs, from one ~10-line law-of-cosines `joint()` helper.
  Bone lengths are deliberately only slightly longer than the reach they cover: a chain much longer
  than its target distance puts the slack in a joint sticking out sideways, which is exactly what
  the first attempt looked like.
- **The sword hand orbits its shoulder on a shorter, phase-shifted arc than the blade**, so the arm
  does not collapse into a straight line with it and the tip travels rather than pivots.
- **Anticipation and follow-through.** `SLASH_FRAMES` 15 → 20, split three ways, damage moved from
  frame 5 to frame 11 so the hit lands at the bottom of the swing. `KICK_FRAMES` 20 → 16 pays the
  frames back. Measured over ten simulated minutes, the average match went 9.6s → 10.5s.
- **A damped spring on the blade angle**, in the fixed step so it cannot depend on frame rate. Every
  action now sets a *target*; the spring is what removes all four snaps at once.
- **A blade smear**, keyed to how fast the blade is *turning*, not how fast it is moving — the
  samples are world positions, so a fighter sliding sideways with a still blade first swept out a
  clean filled rectangle. Correct, and it read as a slab of colour. It also starts halfway down the
  blade, because a fan drawn all the way to the fist reads as a cape.
- **Ground contact**: both shadows drawn before either body (or the second fighter's shadow paints
  over the first one's legs), shrinking and fading with height, plus a landing squash about the feet.
- **Sparks come off the blade's actual tip**, clamped into the body it struck, biased along the
  swing, and drawn as streaks rather than discs. They used to spawn at the midpoint between the two
  fighters, which had nothing to do with where the visible blade was — that is why a clash never
  looked like contact. **`dist` remains the sole authority on whether damage lands**: gate that on
  the tip actually reaching and misses become routine, health stops draining, and the match-reset
  loop has no timeout.
- **Death keeps its identity.** The death branch ran its own transform and re-drew only the two
  rectangles, so the halo, horns, cape and tail vanished on the frame of death — for the two seconds
  anyone actually looks at the loser, the two pairings were indistinguishable.
- **Idle motion for all four costumes**: the cape trails against travel, the aura breathes, the halo
  bobs clear of the head, the chest panel's cells blink out of phase, the bat wing flares on a leap.

The blocking/parry state from the same review was **not** taken. It is the only proposed change that
can alter match outcomes — a mutual block lock would leave `over` never firing — and it is not worth
that risk for a background ornament. Recorded here so it is a decision rather than an oversight.

### One thing deliberately not left behind

The verification used a temporary `fxlab.html` (all sixteen effects on one page, driven through
`FxCanvas`'s exact frame maths) and a temporary `?site=<base64>` parameter in `index.html` standing
in for the Worker's injection. Both were removed. Committing either is a product decision — a
permanent dev-only page and a URL that overrides published config — not a tidy-up, so neither was
taken unilaterally. They are three minutes to rebuild if the client wants them.

---

## 2026-08-14 — The HUD pass: thirteen layouts upgraded, a fourteenth added

From a written proposal the client approved in full ("I'll trust you for everything"). Two halves:
an upgrade pass over the existing layouts, and three named presets, one of which needed new
machinery. The proposal itself is an artifact; what follows is what actually shipped and the
places where building it changed the plan.

### The canvas was drawing ellipses

`FxCanvas` rendered into a fixed 1600×1000 buffer that CSS stretched to fill. The stretch is
anisotropic, so **every circle in `orbits`, `constellation`, `bokeh` and the tunnel's spokes
rendered as an ellipse** whose eccentricity was whatever the viewport's aspect happened to be, and
anything wider than 1600px was an upscale of a smaller image. The buffer now follows the element
via `ResizeObserver`, capped at `min(devicePixelRatio, 2)` and a 2600px long edge.

The context carries a base `setTransform(scale, …)` so every effect keeps working in **CSS pixels**.
That part is load-bearing and easy to undo: `rain` sizes its columns off `w` at a 16px cell and
`plasma` its grid at 26px, so handing them device pixels would silently double their density on a
retina display. The per-frame `setTransform` also means a missed `ctx.restore()` — `rain` flips the
world with `scale(-1, 1)` inside a save/restore pair — can no longer mirror the site permanently.

### Two theme tokens, and one that is not a palette token

`--panel` (translucency) and `--elev` (a unitless shadow multiplier) join `--radius` in `theme.ts`.
Panel translucency was a literal `70%` inside `.v-block`, so every layout wanting something else
restated the whole background.

**Nothing in this pass needed a tenth colour on the palettes.** Every glass tint, lit edge and glow
derives from `--surface`, `--line` and `--a1` through `color-mix`, which kept `palettes.ts` a pure
data file and left share codes alone.

Two floors on `--panel`, both deliberate:

- **Calm goes to 92%.** Calm also hides the canvas, so there is nothing left to see through the
  glass and a translucent panel with no backdrop is just a weaker edge — on exactly the palettes
  calm exists for.
- **`LOW_CONTRAST` palettes go to 80%.** On Peat, `--surface` and `--bg` are about four points of
  luminance apart; halving that difference deletes the panel edge.

Mosaic and the HUD therefore shift translucency with `--panel-shift` rather than setting `--panel`
outright — an absolute value would drive straight through both floors. `.v-block` clamps the sum.

### Glass turned out to be calm-safe by construction

The expected accessibility problem — a translucent panel over a moving canvas — does not exist
here, because calm sets `.v-canvas { opacity: 0 }`. A blur over a flat field is a flat field. Calm
also strips `box-shadow` and `animation` globally with `!important`, so every glow added in this
pass dies there on its own, and the parallax rigs are disabled in JS by the existing `config.calm`
checks. The whole calm bill for Part A came to two decisions: the `--panel` floor above, and the
contact sheet's duotone (below).

### Three things that only showed up in a browser

1. **A floated `::first-letter` is invisible inside a multi-column container.** Magazine's drop cap
   reserved its box — the text wrapped around a two-line notch — and never painted the glyph.
   Verified with the identical rule: visible at `columns: auto`, invisible at `columns: 3`. Since
   Magazine is the only layout with columns, the obvious implementation could not work in the one
   place it was wanted. It uses `initial-letter: 3 3` behind `@supports`, which does work there.
2. **`.v-stage` scrolls vertically, which forces its `overflow-x` from `visible` to `auto`.** The
   hero's stage-wash pseudo-element bled 14% past the hero on each side and gave the whole stage a
   horizontal scrollbar — measured at exactly 91px. Every ambient-light pseudo-element in this pass
   is now pinned to `0` horizontally and widened instead of moved outward.
3. **The verification tab was `document.hidden`,** so the render loop was correctly parked and the
   canvas never drew. The new effects were checked instead by running all fifteen against a
   recording 2D context at three viewport shapes over forty frames — no NaN or Infinity
   coordinates, no out-of-range alpha.

### Guardrails

Terminal's window gained a `backdrop-filter`, which is the change the layout was waiting for: a
55%-opaque box over a *sharp* canvas is why its allowlist was only `rain`, `tunnel`, `off`. Blurred,
the background arrives as diffused light, so `constellation`, `stars`, `aurora` and `scan` joined
it. Two new blocks were added with the translucency drop — `plasma` on Deck, `plasma` and `rain` on
Mosaic — because at 54–58% those fields read *through* body copy where at 70% they did not.

Note what a guardrail is and is not: `isAllowed` is consulted by the randomiser only, and a
hand-picked config or an applied share code goes straight past it. So anything that could make copy
genuinely unreadable is handled in CSS — the translucency floors, Stack's shade pool — and never by
adding a row to the table.

### `hud`, and why it needed to be a new archetype

Appended at index 13. Blocks sit on three z-planes and physically overlap, and the near plane's
`backdrop-filter` blurs the plane behind it. That is genuine occlusion, and none of the thirteen
existing layouts can express it — every one is a grid, a column or a track.

The chamfered corners are a `clip-path`, and **`clip-path` clips `box-shadow` away**, so elevation
here is a `drop-shadow` filter instead: a filter follows the clipped silhouette. `filter` makes an
element a containing block for `position: fixed` descendants, which is safe on a content block and
would not be on the grid or the stage.

`TABLET_LAYOUTS` maps `hud → cinematic`, not `→ mosaic`. `adaptLayout` is a single lookup and does
not chain, so mapping to a layout that itself collapses on that band would have rendered real
six-column Mosaic at 700px — the thing the mapping exists to prevent. Phones fall through to Stack
already.

### The duels keep indices 12 and 13, as a hidden entry

`FX` gained a `hidden?: boolean` and the two lightsword duels are back in the array at the two
indices `catalog.ts` had promised them, flagged hidden. The decision that withdrew them is
unchanged — they return to the picker when the client's eye has passed the ornament, and lifting
the flag is the whole of "re-list them".

They are in the array because **the array is a wire format**. Appending `scan` and `telemetry` to an
eleven-entry list would have taken 12 and 13 and broken that promise, or worse, been "fixed" later
by inserting the duels ahead of them and silently repointing every share code minted in between.
`PICKABLE_FX` is what the panel, the command palette and the shuffle read; `FX` is what persistence
and `decodeShareCode` read, because a hidden effect is unlisted, not invalid.

**The 404's "12 background modes" line does not exist.** Two code comments claimed a copy
correction would be needed here; the string is in neither `pages.ts` nor anywhere else, having gone
with the vitals strip. No copy changed in this pass.

### The contact sheet's duotone — the one judgement call left open

Full greyscale plus an `--a1` field at `mix-blend-mode: color`, capped at 22%. The placeholder
photographs were the one element on the site that did not recolour with the palette.

`mix-blend-mode` is not something calm strips, so its behaviour there is a decision rather than a
default: **it stays, at 10%.** Calm exists so body copy stays readable on the low-contrast palettes,
and a photograph is not body copy; removing the tint outright would make calm the one mode where the
images visibly disagree with the palette around them. Reversible in one line if the client disagrees.

### Presets are operator-gated, which is a smaller claim than the proposal made

`PRESETS` (`src/data/presets.ts`) defines each preset **structurally and derives its share code**,
never as a typed string — a hardcoded `"N-7-5-3-5-3"` would be correct until something is appended
to a catalogue and then silently wrong, and the wrongness would be a *working* code pointing at the
wrong palette.

They appear in the siteconfig panel and in the command palette's operator block. The proposal
described them as something "a visitor can select or reach via share code"; that is not true of this
codebase as it stands, and was not made true here. Every appearance control in the command palette
is already behind `isOperator`, and `.v-paste` — the only place a share code can be applied — lives
in the operator-only panel. Making presets public would be a product decision about who controls the
site's look, not an implementation detail. Flagged, not taken.

---

## 2026-08-14 — Deployed to production; TODO 2 proven in a real browser

The overnight commits (`bf292e1` slot-endpoint password gate, `db9cb43` report-only CSP) went
live once wrangler was re-authenticated (OAuth, approved by the client in-session). Full
`HANDOFF.md` verification block passed: bundle hashes match, one HTTPS redirect, six headers,
the report-only CSP riding pages, www→apex 301, `/api/health` 8 tables, SPA routes 200, assets
`nosniff`.

**TODO 2 — recovery-code redemption — is done**, driven end to end in a real Chromium against
production with a throwaway non-operator account (`fable-check`), so the operator's ten codes
are untouched: signup showed the codes once; sign-out; redeem code #1; the set-password ticket
screen; signed in with `9 of 10` left; sign-out; sign-in with the new password succeeded. The
account row is left in D1 deliberately (removing it is an `/admin` or break-glass write the
client may prefer to do, or ask for); its password is known only from this session.

`wrangler tail` ran through the entire browse — signup, redemption, set-password, two
sign-ins, sign-outs — and logged **zero CSP reports**, the first production evidence toward
the flip to enforcing. Still unexercised: passkey ceremony, phase-2 browse, TOTP enrolment,
the other canvas effects.

GitHub remote `https://github.com/zazathebird/vessel.git` is configured, but pushing needs
credentials this machine does not have (no PAT, no SSH key, no `gh`); `git push` also needs
`GIT_EXEC_PATH=/home/user/.local/git-root/usr/lib/git-core` because the local git's default
exec-path is an empty directory.

---

## 2026-08-14 — TODO 12 lands as far as it safely can: a nonced CSP, report-only

The blocker was always the inlined site-config script; the nonce now exists (`cspNonce` per
request in `worker/index.ts`, stamped by `withSiteConfig`, named by `cspPolicy`). The policy
ships **report-only**: it cannot blank anything — the documented failure mode of doing this
badly — while every violation it would have blocked posts to `/api/csp-report`, which logs a
truncated line for `wrangler tail` and stores nothing (§9's inventory deliberately gains no
field; do not add a report table). `style-src` keeps `'unsafe-inline'` because the theming is
style attributes and `style-src-attr` would blank pre-15.4 Safari; `connect-src` names
`ws(s)://<host>` beside `'self'` for old WebKit's sake; `frame-ancestors 'none'` restates
`x-frame-options` on purpose. Verified: harness 260 → **263** (header present, injected script
carries the header's own nonce, report endpoint answers 204), and a six-page browse in a real
Chromium produced zero violation reports. **The flip to enforcing is one header rename in
`harden`**, once production has run quiet through a passkey ceremony, a phase-2 browse, TOTP
enrolment and the effects — the surfaces the harness cannot drive.

## 2026-08-14 — TODO 15 lands: `/api/account/slot` demands the password, and the TOTP half moves

The slot endpoint was the last place a session cookie alone bought the wrapped grant key — the
input to an offline password grind that ends in grant authority, which is the escalation §5
exists to prevent. It is now `POST` and the body carries the derived `authSecret`, checked by
`assertPassword` — so the rate limiting lives inside the check, per the invariant, and a wrong
password at any slot-fetching flow now counts against the buckets instead of failing silently at
AES-KW. Callers updated: `changePassword` and `openGrantKey` (`src/auth/flows.ts`),
`unlockForConnect` (`src/share/unlock.ts`, which maps the endpoint's credential-change 401
wording back to the ceremony's own "That is not your password." while letting §4's rate-limit
wording through), and `addPasskey` (`src/auth/passkeys.ts`), where the slot fetch **moved before
the authenticator ceremony** — the server's password check now fires before the user is asked to
touch anything, keeping "wrong password fails before the registration is sent" true.

**The TODO's TOTP half deliberately did not land on this endpoint, and should not.** The
response is the same ciphertext whatever the caller intends, so a TOTP requirement here could
not distinguish §12 K's password-only connect ceremony from §3's password-plus-TOTP sign
gesture — an attacker would simply claim the weaker purpose, and honest §12 K users would pay a
per-connect TOTP prompt §12 K explicitly decided against. The enforceable home for the fresh-TOTP
check is the **phase-3 grant-submission endpoint**, which sees the guarded action (the signed
grant) rather than an intention. `openGrantKey`'s comment now says so; build that check before
anything accepts a real grant. Harness 258 → **260** (session-only fetch refused; wrong proof
refused).

## 2026-08-14 — The §10 explorer completes: Grid and Column modes

List shipped with phase 2 as the floor; the other two §10 view modes now exist
(`src/components/MachinesPage.tsx`). What §10 fixed, built as fixed: a toolbar switcher
remembered **per drive** (`vessel.explorer.v1`, validated on read like all storage); **Grid** as
tiles over drawn file-type icons — `src/components/FileIcon.tsx`, ~14 categories, a stroked page
in `--line` with a type-coloured fold and glyph in `--a1`/`--a2` via CSS class, never a literal,
so icons recolour with the bleed; **Column** as Miller columns, pane *d* listing
`path.slice(0, d)`, panes cached against their path prefix and guarded by a token so a superseded
load cannot paint over a live one, sliding in on the house 0.34s easing (`translate`, never
`transform`); the **progress wash** in `--a1` as a `background-image` gradient so it cannot fight
the 0.9s `background-color` bleed; **List gained sortable headers** (`aria-sort`, directories
always first) and its Kind column now names the drawn category. Calm collapses everything to List
and drops the wash — §10 calls that the correct behaviour, not a degradation. The explorer is
keyed by drive id so state cannot leak between drives. **Deliberately deferred from §10: image
thumbnails from actual bytes** — decorating a grid by reading whole files belongs after the
phase-3 read-cap conversation (`TODO.md` 5b). Unseen by any eye, like the rest of phase 2.

## 2026-08-14 — SPEC-ACCOUNTS phase 2: machines, signalling, brokered browsing; docs condensed

**Spec first, per §7.** `design/SPEC-ACCOUNTS.md` gained §13 (the concrete pairing, signalling,
connect-ceremony and file-protocol design) and §12 K–S — nine logged decisions, each with what it
was chosen over and a "revisit if". All five of §12's formerly-blocking open questions are
answered in place. The load-bearing ones: **K** (the browsing peer authenticates with the grant
key — the agent never trusts the introduction, in either phase), **L** (pairing is a password
ceremony), **M** (a "machine" is a browser profile; one agent socket, newest wins), **P** (STUN
only; TURN specified but a client spend decision), **S** (paths are arrays of components — no
string parser exists to have a traversal bug).

**Then plumbing, harness before interface.** Migration `0004` (machines + drives; grants and
invites stay absent — phase 3). `worker/machines.ts` (pair/re-key password-gated via
`assertPassword`, so the route rate-limits and cannot be a password oracle; CRUD session-gated;
caps 10 machines / 16 drives). `worker/signal.ts` — the `MachineSignal` DO, hibernation API, one
per machine, authenticated entirely in `worker/index.ts`'s `signalUpgrade` gate (which bypasses
`harden()` deliberately: copying a 101 drops its `webSocket`). `src/share/` — `handshake.ts`
(context-bound signed DTLS fingerprints, `vessel/p2p/<role>-fp/v1`), `paths.ts`, `protocol.ts`
(v1: list/stat/read, 64 KiB chunks, `bufferedAmount` pacing), `agent.ts`, `browse.ts`,
`store.ts`, `unlock.ts`. Health check now expects 8 tables.

**Harness: 178 → 258.** Three new sections drive the path rule, every machine/drive route
(negatives: no session, wrong password, malformed key, duplicate names, foreign-account 404s),
and the signalling DO end to end over real WebSockets — including both directions of the
ceremony's crypto with the real `src/share` modules, tampered/wrong-machine/wrong-role signature
refusals, presence, replacement, frame hygiene and removal hangup. `ws` joined the
devDependencies (Node's WebSocket cannot send a cookie); it is `--external` in the esbuild step.
**One local-dev quirk recorded:** workerd delivers a server-initiated close on a hibernated
socket lazily, so the harness asserts the `replaced` *frame* and the relay behaviour, not the
close code reaching the replaced client.

**Interface last**, account-form conventions throughout: `/share` (pair/re-key/take-over forms,
drive pick/re-attach/allow-access, glanceable status with peers + bytes served, beforeunload only
while a peer is connected) and `/machines` (presence-aware list, §12 K unlock form, List-mode
explorer with breadcrumbs, folder descent, per-file fetch with progress and Blob download). Both
unlinked pages: typed routes `machines` / `share`, linked from the `/signin` summary. The
signed-in summary's "still being built behind it" note retired with the pages it promised.

**Docs condensed at the client's request.** `FABLE-FINDINGS.md` (the 2026-08-13 full review's
64 KB session-survival file) is deleted: every finding in it was fixed and recorded here at the
time; its adversarially-verified "safe — do not re-litigate" list moved to
`docs/SECURITY-AUDIT.md`'s appendix, and its three still-unanswered client questions (the
Contact-page mailbox, per-account subdomains, Pages retirement) moved onto `TODO.md`'s sign-off
list. `TODO.md`'s done items compressed to one-liners, numbering kept for cross-references.
`docs/pi-sharing-host.md` updated: its final step now has a real `/share` to point at.

Four client requests landed in one session, plus the review that
`docs/REVIEW-CONTINUATION.md` had been holding open (that file is now deleted,
per its own instruction — this entry is the durable record).

**Client requests, all shipped:**

- **"Remove the word vessel from the site."** Every user-visible occurrence is
  gone: wordmark, `<title>`/document titles, Terminal's termbar, the TOTP
  issuer, the passkey rp name — all now `mcclevarty.ca` — and the "Vessels"
  effect label is "Branches". Internal identifiers (`.vessel` class, storage
  keys, session cookie, HKDF info strings, Worker/D1 names, effect id) keep
  the old name deliberately: renaming them breaks live sessions, stored
  config, key derivation or share codes for zero visible change. CLAUDE.md
  deviation 10. `mcclevarty` joined the reserved handles.
- **The favicon** is no longer the empty `data:` icon: an inline SVG (still no
  file) of the client's chosen drawing — the finger, offered to a small
  four-pane window. No trademarked mark anywhere near it.
- **Duel likeness + alignment colours.** The four silhouettes now carry their
  characters (haloed: hair, floating halo, aura, fuller robe; horned: curved
  horns, scalloped bat wing, swaying spade tail; hooded: deeper hood, belt,
  tunic skirt; caped: domed helmet, lit chest panel, floor-length cape), and
  the blades hold fixed colours in every palette — blue/green for good, red
  for evil (`BLADE_COLORS`, the site's one literal-colour carve-out, CLAUDE.md
  deviation 9). Motion and likeness still need the client's eye.
- **Placeholder photos** fill all eight photo-slot tiles: Wikimedia Commons
  PD/CC0 only, re-encoded to strip EXIF (the gallery copy promises it),
  desaturated under the tile chrome so the palettes keep authority
  (`.v-tile-img`). `docs/PHOTOS.md` is the source/license ledger. CLAUDE.md
  deviation 11.

**The app-shell/UI review** (the slice the second round's third agent never
returned) ran over App/theme/config/hooks/components/data/fx/styles. Eight
findings, all verified and fixed:

1. Radial's orbit rendered six pills on seven enumerated positions — a
   regression from the 404 pill leaving `NAV` — leaving a visible hole in the
   ring. Recomputed for six.
2. "Leave operator mode" never reset `leaving`, so the button stayed disabled
   as "leaving…" for the next sign-in (the panel stays mounted while closed).
   Now reset in a `finally`.
3. `shuffle`, `setMode("visit")` and the boot roll ran `roll()`/`say()`
   *inside* `setConfig` updaters — the exact impurity `go()` was fixed for;
   StrictMode double-invokes updaters, so the toast could announce a different
   combination than the one applied. Rolls moved out, updaters pure.
4. The three deliberate calm toggles disagreed, and the header/panel pair
   overwrote the *published* grain/breathe values on every calm round-trip
   (`update({ calm, breathe: !calm, grain: !calm })`). `themeClasses` already
   suppresses both under calm, so all three toggles now flip `calm` alone.
5. Two clipboard writes still toasted success unconditionally (`copyCode`,
   `revealMail`) against the honest-clipboard convention; both now await the
   write and say what actually happened.
6. Scroll velocity was dead in Terminal — the listener bound to `.v-stage`,
   but Terminal scrolls the document. A `window` scroll listener joins it.
7. `.v-setup-row` was referenced and styled nowhere; the saved-setups row now
   has its flex rule.
8. The logo's five-tap countdown toasted "2 more"/"1 more" at visitors whose
   fifth tap would be refused (`openDoor` is operator-gated). The countdown is
   now gated on `isOperator` too.

A ninth, product-level finding — the findable sign-in affordance does not
exist on phones (the ornament is `null` there) — went to TODO's *Awaiting
client sign-off* rather than being "fixed" unasked.

Also closed from the continuation file: the three raw-fetch signup fixtures
now send `slotAlg`, so signup recording the algorithm is proven on the raw
path too. Harness after all of the above: **178/178**.

**Mobile parity (same session, client request: "add all the features of the
desktop site to the mobile site").** The phone band's two real feature gaps
closed; everything else phones "lack" is deliberate adaptation (layout
collapse) or input modality (hover, keyboard idioms) and was left alone:

- **The ornament renders on phones** — it was hidden three ways (band token
  `0px`, `display: none`, a component `null`), which also hid the duels and
  the five-tap sign-in reveal there. Phone `valveSize` is `min(44vw, 190px)`;
  only Stack can show the slot on phones (console/sheet hide it by layout),
  where the column hero puts it above the title.
- **The command palette gets a touch route in**: a `cmd` chip in the header on
  non-desk bands, raising an event the palette listens for. Desk keeps the
  typed idiom — a standing button everywhere would advertise what §10 shipped
  as a shortcut. The door needed nothing: five taps on the logo and the
  footer `·` are already taps, and both drags are PointerEvents.

---

## 2026-08-13 — Second review round: 14 findings fixed, guards move into the writes

Two fresh end-to-end review agents (Worker + client auth) ran after the morning audits; every
confirmed finding is fixed and `npm run test:auth` passes 178/178 (two new checks — see below).
Highlights, newest lessons first:

- **`checkIterations`** (`src/auth/derive.ts`): the browser now refuses a `challenge` response
  whose iteration count is below the credential kind's constant or above 10M. Closes an active
  KDF-downgrade path (`iterations: 1` from a forged response silently stripped the stretch).
- **NFKC before PBKDF2**: composed/decomposed non-ASCII passwords now derive identically. Caveat
  flagged to the client: a pre-existing non-ASCII password could stop matching (recovery codes
  are the way back; the operator's is believed ASCII).
- **The last-way-in guards moved into the writes' `WHERE` clauses** — passkey removal, operator
  password reset, operator demotion, TOTP re-enrolment. Check-then-act let two concurrent
  requests each count the other as "another way in": two removals could seal a grant key, two
  demotions could leave zero operators, an enrol racing a confirm could replace a confirmed
  secret. Zero `meta.changes` is now the refusal, and audit rows write only after it.
- **The harness proves the UV refusal** instead of trusting it: `webauthn-sim` grew
  `userVerification` and `rpIdOverride` knobs, and two new negative checks (UV-less assertion,
  wrong RP ID hash) — the no-TOTP/no-rate-limit passkey decisions rest on exactly that refusal.
- **`crossOrigin` now compares scheme as well as host**; `SessionContext.refresh` discards stale
  settlements by serial; `api.ts` refuses a 200 with a non-JSON body instead of returning `{}`
  (signup could otherwise succeed server-side and never show the recovery codes); `addPasskey`
  no longer reports a corrupt slot as a wrong password; signup's 201 and the admin roster joined
  `no-store`; `slotAlg` is capped at 64; the body limit measures real bytes; two overclaiming
  comments (`openGrantKey` revocation, passkey sign-in prf) were made honest.

Still open from the round, deliberately: the app-shell/UI review never completed (session limit)
and is queued for the next session; the raw signup fixtures still omit `slotAlg`
(`docs/REVIEW-CONTINUATION.md`).

## 2026-08-13 — Operator chrome: tabs in the header, and a way to leave

Client request, same day as the ornament unlock: the operator surfaces should be *visible tabs*
once signed in — and closeable when done.

- **`OPERATOR_NAV`** (404 / Account / Admin) plus a Config tab (toggles the panel) render in the
  header for a signed-in operator and for nobody else. Not part of `NAV`, so arrow-key cycling
  and Radial's orbit are unchanged for everyone.
- **The 404 pill left the public nav.** "404 genuinely in the nav" was the spec's joke; the
  client pulled it behind sign-in. The page itself still serves every unknown URL — the joke
  copy survives for whoever lands there; only the pill is operator-only now. Public arrow-key
  cycling no longer visits it, which is the unlisting doing its job.
- **Leave operator mode** sits at the bottom of the siteconfig panel, after Publish: it signs
  out (`api.signout` + session refresh), which collapses tabs, panel and door through the
  existing `isOperator` effect, and clears `unlocked` so the header button retires too. The ✕
  closes the drawer and leaves you operator; this ends the session. Offline, it refuses loudly
  rather than pretending.

## 2026-08-13 — Sign-in gets a findable link: five taps on the ornament

The client asked for a way in to sign-in/sign-up that could be told to someone — hidden or not,
their call, creativity requested. Chosen over an always-visible footer link (least on-brand for a
site built on hidden doors) and a custom pass-phrase (typing `login` already is one): **five taps
on the hero ornament reveal a quiet `sign in` link in the footer for the rest of the visit.**

- The shape follows the house precedent twice over: the logo's five taps open the door, the
  ornament's five taps reveal the account link — the same mirror as the rightward/leftward drag.
  Same count, same 1400ms rhythm, same ">2 taps" countdown toasts.
- `revealSignin`/`signinShown` live in `ConfigContext`'s ephemeral block beside `mailShown`, but
  unlike the mail reveal it does **not** reset on navigation — found is found, until reload.
- The footer link renders for non-operators only (operators already have `account`/`admin`),
  labels itself `sign in` signed out and `account` signed in, and rises in with `v-rise` using
  fill-mode `backwards` — the `.v-block` trap applies verbatim.
- The ornament stays a decorative element, not a button: keyboard users already have the typed
  routes, and a tab stop would advertise what is meant to be found. Radial's orbit pills share
  the slot, so pill clicks (`closest("button")`) are excluded from the count.
- Nothing here touches `openDoor`; the two five-tap gestures target different elements and
  different worlds, per SPEC-ACCOUNTS.md's rule that real auth never reuses the theatre.

Same day, the client also decided: **the 404 page stays** (it is a designed page, not a default),
and **per-account subdomains stay parked** per `design/GUIDE-SUBDOMAINS.md`'s recommendation —
the enumeration decision it requires remains untaken.

## 2026-08-13 — Frontend review: nine findings fixed, overlays learn to stack

A full review pass over `src/` (the counterpart to the same day's Worker audit) surfaced nine
findings; all are fixed. The three worth remembering:

- **The calm/404 `filter` moved off the `.vessel` wrapper and onto its children** (`base.css`).
  A non-none filter makes an element the containing block for every `position: fixed`
  descendant — and all six overlays are fixed children of the wrapper. In Terminal, the one
  layout where the document scrolls, calm or the 404 page re-anchored them to the *document*:
  toasts rendered off-screen, the door centred at document mid-height. The look is identical
  with the filter applied per child; the cursor glow keeps its own blur combined in.
- **Overlays now layer instead of fighting.** `useFocusTrap` keeps a stack — only the top trap
  handles Tab, so a dialog over the panel no longer snaps focus back to its first control on
  every press. Dialogs and the palette register as *modal* (`isModalOpen()`), which stands the
  global key routes down while one is open: no arrow-paging under a confirmation, no `sudo`/
  `cmd`/`⌘K` opening things beneath a scrim, and Escape closes exactly one layer (the modal's
  own `document`-level handler stops propagation before the routes' `window` handler runs).
  The panel and door are deliberately not modal — typing `sudo` with the panel open has always
  opened the door and still does.
- **Calm survives reload, for everyone.** `loadConfig` reads published config only, on the
  stated ground that a visitor "has no way to set these" — but calm is visitor-settable from
  the header and is the accessibility escape hatch for the low-contrast palettes. It now has
  its own storage key (`vessel.calm.v1`), written **only** by the three deliberate toggles
  (header, panel, palette) — not read back from the full-config echo `saveConfig` writes,
  which would freeze whatever was published on the first visit. Absent key means no
  preference; OS-level reduced-motion still forces calm on top. Everything else stays
  published-only, so "the operator sees exactly what a visitor sees" still holds for the
  published look.

The rest, briefly: `TotpEnrol`'s backup-codes screen now takes the same `holdSaver` hold as
signup's (ten codes, transcribed by hand, screensaver at sixty seconds); the palette's sign-out
gained the `.catch` + honest toast `SignIn` already had; and the dead `.v-admin .chip.is-danger`
rule (pre-dialog armed-delete) is deleted.

---

## 2026-08-13 — Full security audit: six fixes shipped, four dashboard items logged

Client-requested audit of the Worker, both halves of the auth stack, headers, cookies, the client
bundle and live DNS. `docs/SECURITY-AUDIT.md` is the full log — findings, fixes, the
dashboard-only DNS work (DNSSEC, CAA, DMARC/SPF), and the list of deliberate decisions the audit
checked and left standing so the next one does not re-litigate them.

Shipped: `harden()` now covers the API error path and adds `Permissions-Policy` + COOP; the four
responses carrying secrets that lacked `no-store` (TOTP secret, backup codes, sign-in ticket, KDF
challenge) have it; the session cookie is `__Host-`-prefixed (subdomain cookie-planting defence —
everyone signed in at deploy is signed out once); `www.mcclevarty.ca` — previously a proxied DNS
record with nothing behind it, serving a bare Cloudflare 522 — is now routed to the Worker and
301s to the apex; and GUIDE-SUBDOMAINS' 2026-08-12 reserved-handles recommendation (`mail`,
`mailroot8`, `www`, plus the standard infrastructure and mail-convention names) is finally
actioned. TODO #16 carries the DNS work.

## 2026-08-13 — The command palette, opened by typing `cmd` — `⌘K` stays unbound

`TODO.md` item 5's last piece (`src/components/CommandPalette.tsx`, z-index 85 in §11's
ladder). **`⌘K` is not bound**, and that is the point of this note: the shortcut is
claimed twice — `SPEC.md` gives it to the door, §10 gives it to the palette — and the
contradiction sits on the client's sign-off list. Binding it would have settled the
question by accident. Until the client picks, the palette opens by typing `cmd` anywhere,
the same idiom as `whoami`/`login`, with the same `isEditable` and modifier guards;
when the decision lands the binding is two lines in the palette's key listener.

The command set is deliberately **what the caller could already do, gated as it already
is**: navigation and the account pages for everyone; saved setups and sign-out signed in;
the full siteconfig vocabulary — 24 palettes, 13 layouts, 12 backgrounds, 5 type systems,
7 ornaments, 4 toggles, the dice, the panel — for the operator only, mirroring the
panel's gate. Calm mode is *not* offered to visitors even though it is the accessibility
remedy, because today it is panel-only and widening it is a product decision, not a
shortcut. If the client wants visitor-facing calm, that is one line here plus the
conversation it deserves.

**Unverified by eye**, entrance motion included, like the rest of this session's UI.

## 2026-08-13 — The dialog primitive, and /admin's destructive actions moved onto it

`TODO.md` item 5's third piece, to §10's letter: `src/components/Dialog.tsx` exports
`Dialog` (focus-trapped via the existing `useFocusTrap`, Escape to dismiss, focus returned
by the trap's cleanup, 22px backdrop blur, 340ms entrance on the standard curve, z-index
**75** in §11's ladder, palette-driven throughout) and `ConfirmDialog` (the destructive
shape: consequence in specific terms, optional type-to-confirm, one `<form>` per the form
convention). It does not reuse the operator door, which stays theatre.

**Dialogs portal into the themed wrapper, not `document.body`** — every colour is a custom
property on that wrapper, so a body portal renders in no palette at all. The portal also
delivers §11's "one more sibling at the overlay level" for a dialog owned by a component
deep in `.v-stage`, whose entrance animation holds a `transform` — and a transformed
ancestor becomes the containing block for `position: fixed`, which would pin a
"fullscreen" scrim to the stage. The wrapper element travels by React context
(`OverlayHostContext`), set once in `App`.

First consumer: `/admin`. Reset-password and delete-account now confirm through the
dialog — reset states the consequence with the account's live recovery-code count (§4's
second requirement on reset), delete requires typing the handle (§10's rule). The
ask-twice chip pattern they used is retired *there*; `Setups` keeps it deliberately, a
saved setup being two clicks to recreate. `reset 2FA` stays one click, as before.

**Unverified by eye**, like every account surface — and the dialog's entrance motion is
in the category nothing on this side can check.

## 2026-08-13 — Saved setups, on the signed-in summary

`TODO.md` item 5's second piece, and §11's "nearly free" half delivered as such:
`worker/setups.ts` (list/save/delete, session-gated — saving a look is not a credential
change), `src/components/Setups.tsx` on the `/signin` summary. A setup is a name and
`encodeShareCode(config)`; applying goes through `decodeShareCode`, so it behaves exactly
like pasting a code, randomiser pinned to Static included. The Worker validates the code's
*shape* only — the catalogue lives in the browser and `decodeShareCode` already clamps
out-of-range fields, so a server-side copy would be a second thing to keep in step with no
second opinion. Saving over an existing name replaces it, **case-insensitively** (the
unique index collates binary, so the handler resolves the name first; two rows differing
by case would be a list that looks like a bug). Fifty setups per account, bounded because
an unbounded user-writable table invites a script. Deletion asks twice on the button, the
`/admin` convention — the dialog primitive is the next backlog item, and a setup is the
mildest destruction on the site.

Two things deliberately *not* done, so they are chosen rather than drifted into:

- **`/account` stays reserved and the summary stays on `/signin`** — §10's shipped-routes
  note calls the split "a change worth making deliberately rather than incidentally", and
  nothing in setups forces it.
- **The signed-in *current* config still does not sync** — §11's "server copy wins on
  conflict" sentence describes a mechanism phase 1's definition (§7: "named setups saved
  and applied") does not include. Building it means conflict rules and another write path
  through `ConfigContext`; if wanted, it is its own item, not a rider on this one.

**Unverified by eye:** the Setups section, like every account screen.

## 2026-08-13 — Passkeys, as another key slot on the same grant key

`TODO.md` item 5's first piece, built exactly as SPEC-ACCOUNTS §4/§5 specify: hand-rolled
WebAuthn (`worker/webauthn.ts` — the ~120-line CBOR subset §1 budgeted, ES256 only,
attestation `none`), a `passkey` credential row per registration, and — when the
authenticator supports the `prf` extension — one more key slot wrapping the **same** grant
key, re-wrapped in the browser ciphertext-to-ciphertext through `rewrapSlot`. No `prf`
means **no slot**, said honestly on the screen (§5: "the fallback is a missing slot rather
than a different design"). The e2e harness drives the real `src/auth/passkeys.ts` flows
through an `Authenticator` seam, with a software authenticator
(`scripts/webauthn-sim.ts`) that *encodes* the CBOR/DER the Worker *decodes* — a second
opinion, like the harness's RFC 6238 TOTP.

Two decisions made here, neither a spec change but both worth a record:

- **A passkey sign-in has no TOTP stage.** §3's stolen-laptop row makes user verification
  the passkey's second factor ("passkeys require user verification on every sign-in" — and
  `verifyAssertion` refuses an assertion without the UV flag, so this is enforced, not
  assumed). TOTP is §4's answer to a problem passkeys do not have ("new with passwords,
  absent with passkeys"), and the original approved design was passkey-only with no TOTP at
  all. Requiring a phone code after a biometric would be the site asking for a weaker
  factor to back a stronger one.
- **No rate limiting on the assertion path**, per §4's "passkeys needed none": a failed
  attempt requires forging a P-256 signature, which attempts do not help with. The
  challenge routes mint stateless five-minute HMAC tokens (two new `TokenPurpose`s), so
  the Worker keeps no challenge table; a replayed registration is refused by the
  credential-id uniqueness index instead of by session state.

Also settled: register and remove both demand the password (`assertPassword`, which owns
the rate limiting — adding a credential is a credential change), and removing a passkey is
refused when its slot is the account's last openable one, the same line
`adminResetPassword` refuses to cross. Sign-count monotonicity is checked but not
enforced; synced passkeys commonly report 0 for ever.

**Unverified by eye, like every account screen**: the Passkeys section of the summary and
the "sign in with a passkey" link — and a passkey against the *live* site needs a real
authenticator, which only the client has. The harness proves the bytes; the browser
ceremony (platform prompt, `prf` support on real authenticators) is the client's walk.

## 2026-08-13 — The lightsword duel returns, as little matches in the ornament slot

`TODO.md` item 6, built to `docs/DUEL.md`. The engine is new (`src/fx/duel.ts`): blocky
30×70 fighters, the reference's frame-count timers, physics and damage table kept in its own
700×350 world units behind a fixed 60Hz timestep, and — the idea the stick-figure version
missed — **discrete matches with winners**. Attacks land at a specific frame of their
animation so the damage, the sparks and the visible strike are one instant; a death tips the
loser over, the winner holds a raised blade for two seconds, and both reset with re-rolled
powers. A headless 90-second simulation showed nine completed matches using the full move
vocabulary (slash, kick, force push, leap, retreat).

**It ships in the hero-ornament slot only** — the client's original request — as ornaments
6 and 7, `Lightswords: light & dark` and `Lightswords: saint & serpent`, appended after
"None" because the ornament share-code field is an index, the same wire rule as `FX`. The
ornament is the first that is a canvas (`src/components/DuelOrnament.tsx`), run the way
`FxCanvas` runs: fixed internal resolution, palette read live each frame, delta clamped.
Calm freezes the simulation but keeps drawing, so the palette bleed still recolours the
stilled scene.

**The background `FX` entries stay withdrawn.** Two background versions have been rejected
from this side, motion cannot be verified in this environment, and re-listing would date the
404's "12 background modes" line — a copy correction needing sign-off. When the client's eye
passes the ornament, re-adding is three lines (append at `FX` 12/13; `EFFECTS.duel` /
`EFFECTS.duelholy` already point at the new engine).

**No winner text and no match counter**, in either home: the vitals strip was removed for
captioning state instead of showing it, and the same reasoning applies harder in a 180px
slot. The fallen fighter, the spark burst and the raised blade are the announcement. Health
bars are ornament-only (`DuelView.bars`), per the split `docs/DUEL.md` flags.

## 2026-08-13 — The second factor can finally be turned on

`TODO.md` item 4. The endpoints existed and were tested; nobody could reach them. The screen is
`src/components/TotpEnrol.tsx`, inside the signed-in summary, and the sequence is
`beginTotpEnrolment` in `flows.ts` — an object with a `confirm` method, the `RecoverySignIn`
shape, because the derived auth secret must live between the enrol and confirm calls (both demand
the password; a credential change demands the credential) and a closure is where it lives without
sitting in component state. The password is asked for once.

No QR code, deliberately: §4 requires the secret as a manual string and as an `otpauth://` URI,
both come back from the Worker, and both render as selectable text (`user-select: all`).
Rendering a QR needs a library and the no-third-party rule outranks the convenience. Backup codes
render above every other state in the component — they are shown once, the server keeps hashes,
and a re-render that swapped them for a summary would eat the only copy. The copy button reuses
SignUp's honest-clipboard shape: it never says "copied" unless the write settled.

`api.totpEnrol`/`api.totpConfirm` had hardcoded bodies that could only 401 (fixed with the
harness work, same day); the harness now drives `beginTotpEnrolment` itself, wrong password and
wrong code included.

## 2026-08-13 — Operator password reset ships, with two refusals

`TODO.md` item 3, unblocked since `setPassword` grew its insert branch and `challenge` its salt
fallback. `POST /api/admin/reset-password` deletes the password credential and its key slot,
stamps `reset_at`, and returns `{status, handle}` — **never key material**, which is the §5 line
`worker/admin.ts` exists to hold: reset deletes a slot and cannot open one, so grant authority
never passes through the operator.

The two refusals are against permanence, not malice:

- **Self-reset is refused.** An operator with a working session has change-password; a reset of
  their own row can only be a slip, and it deletes their own key slot.
- **An account with no unspent recovery codes cannot be reset**, only deleted. Its password slot
  is the last openable copy of its grant key, so "reset" there is deletion under a milder name —
  refusing makes the operator choose the honest button. The count includes `passkey` rows so the
  guard stays correct when passkeys arrive.

The `/admin` button uses the same two-press confirm as delete, hides for self, and disables at
zero codes — mirrors of the Worker's refusals, not the enforcement. The harness drives the whole
loop: reset → old password 401s → recovery code signs in (leaning on the challenge salt fallback)
→ insert branch → the original grant key reopens under the new password.

## 2026-08-13 — The harness now drives the real browser modules

`TODO.md` item 1, closed. The suite grew from 89 to 131 checks, and the growth is in kind, not
just count.

### `flows.ts` and `api.ts` are imported, not re-implemented

The harness's whole argument is "it fails when browser and Worker disagree about a byte" — and it
was re-implementing every flow with raw `fetch`, which reopens exactly that gap. It now imports
`signUp`, `signIn`, `signInWithRecoveryCode`, `changePassword` and `openGrantKey` from
`src/auth/flows.ts` and the `api` object itself, driven through a **fetch shim** that maps
relative URLs onto the local Worker and plays cookie jar. The shim intercepts *only* relative
URLs, so the raw `Client` (absolute URLs) keeps its own cookie isolation; `asBrowser()` swaps
jars between scenarios.

### Recovery-with-2FA finally has coverage

The stranded-wrapping-key bug lived in `flows.ts` on exactly one path: an account **with** TOTP,
where the key slot arrives only after the second factor, by which time an earlier version had let
the wrapping key go out of scope. Both existing recovery fixtures had no TOTP, so that regression
had zero coverage. There is now a fixture that goes signup → change-password → TOTP enrolment
(through `api.totpEnrol`/`api.totpConfirm`) → recovery redemption → `completeSecondFactor` →
`setPassword`, asserting `canSetPassword()` flips true only after the second factor and that the
original grant key survives the whole chain.

### The untested endpoints are tested

Change-password, `GET`/`POST /api/site-config` (including HTML injection of
`window.__VESSEL_SITE__` and key-stripping), and all four `/api/admin/*` routes, including both
guards. The operator fixture is made by flipping `is_operator` in local D1 — `docs/BREAK-GLASS.md`
step 1, locally — because no API can do it, by design. Each run also deletes previous runs'
`harness-*` fixtures through the delete route, so local D1 stops accumulating a fixture set per
run (35 had built up) and the last-operator guard stays deterministic. The guard check skips,
loudly, if a non-`harness-` operator exists locally; `signintest` — pre-`/admin` dev debris — was
holding an operator flag and was demoted locally for exactly that reason.

### Two things learned the hard way

- **`execSync` kills the harness's own connections.** Shelling out to `wrangler d1 execute`
  synchronously blocks the event loop for seconds; undici cannot service the dev server closing
  its idle keep-alive socket, and the next fetch dies with "could not reach the server" while the
  Worker is fine. The `d1()` helper is async and its comment says why.
- **`api.totpEnrol`/`api.totpConfirm` hardcoded empty-ish bodies** and could never have worked —
  the Worker demands the password's `authSecret` on both (a credential change demands a
  credential). They now pass a caller-supplied body through, which is the transport half of
  `TODO.md` item 4; the enrolment screen still owes the derivation.

## 2026-08-13 — CSRF, asset headers, and the recovery dead end

`561e067`, closing three items the review had left open.

### An `Origin` that is present and wrong now refuses a state-changing request

**Defence in depth, not the defence.** `SameSite=Lax` on the session cookie is still what stops a
cross-site POST — the cookie is simply not sent, so the handler 401s. `crossOrigin` in
`worker/index.ts` covers the two places Lax does not reach:

1. **The Lax+POST grace window.** Chromium sends a freshly set cookie on a top-level cross-site
   POST for its first two minutes — the two minutes right after signing in.
2. **Same-site subdomains.** SameSite is *site*, not *origin*. If per-account subdomains
   (`design/GUIDE-SUBDOMAINS.md`) are ever built, `anything.mcclevarty.ca` becomes same-site with
   the apex and its POSTs carry the cookie. This check is what stops that silently becoming account
   takeover through `/api/admin/*`.

**A missing `Origin` is allowed**, deliberately: same-origin GETs and non-browser clients omit it,
and `scripts/auth-e2e.ts` is one of those. Refusing only a *present and wrong* origin is the
standard shape and costs nothing. The comparison is against the request's own host rather than a
literal, so it stays correct on loopback and on `workers.dev` without a list to maintain.

Verified four ways: absent, matching, foreign, and foreign-on-GET.

### `public/_headers` gives `/assets/*` the headers the Worker never applies

`run_worker_first = ["/*", "!/assets/*"]` keeps the hashed bundles on the asset server's fast path,
deliberately — they are immutable, never HTML, and there is nothing to inject into them. The cost
was that they also skipped `harden()`, so `nosniff` was absent from exactly the JavaScript and CSS
where it matters most.

**Unlike `_redirects`, this file is valid for both hosts and needs no stripping at deploy.** Pages
applies it too, and Pages is still the rollback. It carries `immutable` caching, which is safe only
because the filenames contain a content hash: a changed file is a changed URL.

### The recovery second factor no longer dead-ends

A non-`signed-in` result was silently ignored and an expired ticket left the user typing correct
codes into a wall — on the one path where the code that got them there is **already spent**, so
escaping costs another of ten.

### The handle-rule error message matches the pattern again

It promised `.` and `_`, which the DNS-safe tightening removed, so the rule the person was told and
the rule they were held to disagreed and the refusal read as a bug in the site. It now says
"letters, numbers, and hyphens after the first".

---

## 2026-08-13 — Five auth weaknesses closed, and a drag that ate recovery codes

`1729dfd`. Found by two independent adversarial passes over `worker/` and `src/auth/`, plus a
frontend pass. No critical or high finding: the cryptographic design, authorisation gating and
injection handling held up.

### `challenge`'s decoy iteration count is now the real constant

`challenge` exists so an unknown handle gets parameters indistinguishable from a real account's.
The *salt* decoy did that. The *iterations* decoy did the opposite: it returned
`600000 + (hmac(handle) % 200) * 1000`, uniformly spread over `{600000 … 799000}`, while every
real account returns exactly `DEFAULT_ITERATIONS` — 600000, hardcoded in `src/auth/derive.ts`,
written by signup, `changePassword` and `setPassword` alike, and the fallback for an
operator-reset account with no password row. No code path produces any other value.

So one unauthenticated POST classified any handle: above 600000 meant "certainly does not exist",
exactly 600000 meant "exists" at 199/200. Zero false negatives, ~99.5% confidence, one request —
and `challenge` deliberately never records a failure, so probing it was unthrottled.

The old comment reasoned about a future where the browser scales iterations to the device. That
reasoning is right about the future and backwards about the present: while the real distribution
is a point mass, the only safe decoy is that constant. **When real counts start varying, sample
the decoy from the same distribution** — the comment in `worker/accounts.ts` says so at the site.

`recoveryIterations` was left alone; real and decoy both report 100000, so it is not an oracle.
The salt decoy was left alone; it was already correct.

### Rate limiting is atomic

`/check` (non-consuming) then `/fail` was two Durable Object round-trips. N concurrent sign-ins
all read the bucket and all saw `allowed: true` before any failure landed — 500 concurrent POSTs
to `/api/auth/signin` ran 500 password guesses against an allowance of 5. The object serialises
its writes but cannot retroactively reject a request that already passed.

`RateLimiter` gained `/attempt`, which reads, decides and increments in one handler invocation:
the attempt is counted as a failure up front and `/succeed` refunds it, so the Nth concurrent
attempt sees N-1 already recorded. `worker/accounts.ts` gained `assertAttempt` alongside
`assertAllowed`, and every call site guarding a credential check uses it.

**`challenge` deliberately stays on `/check`.** Asking for a salt is not a failable attempt, and
counting it would let anyone lock an owner out of their own account by requesting it repeatedly.

### The password check counts itself

Rate limiting moved *inside* `assertPassword`. `totpEnrol` called it with no bucket at all, and
`totpConfirm` called it *above* the bucket it later set up for the TOTP code, so a wrong password
in either place was never recorded. `signin` and `changePassword` were the only ones that counted.

That left an unthrottled online password oracle, and the caller who benefits from it is precisely
the one who should not exist: somebody holding a session obtained *without* the password, via a
recovery code or a stolen cookie. The password opens the key slot, so grinding it there is an
escalation from session access to grant authority — the thing §5 exists to prevent.

Putting the counting inside the check means a future caller cannot forget it.

### The set-password ticket is single-use in fact, not only in comment

`worker/session.ts` called the ticket "a one-shot capability for the next request" and
`src/auth/flows.ts` cleared it — **client-side only**. Nothing on the server enforced it, so the
same ticket set the password repeatedly for its full fifteen minutes.

The ticket's subject now carries the redeemed recovery credential, and `setPassword` requires that
credential's key slot to still exist; the write batch deletes it. Presenting the ticket a second
time finds no slot and is refused. The harness already tested this property and had been failing.

### `wrangler dev` needed `upstream_protocol = "https"`

The `routes` entry makes `wrangler dev` simulate the request as arriving at
`http://mcclevarty.ca/…`. The loopback exemption in `httpsRedirect` checks `url.hostname`, which
is `mcclevarty.ca` and not `127.0.0.1`, so the exemption never matched and the Worker 301'd every
local request to itself. `npm run test:auth` could not run at all.

`[dev] upstream_protocol = "https"` in `wrangler.toml` makes the simulated request https, which is
also what the Worker sees in production after edge TLS termination.

### Frontend, in the same pass

- **A leftward drag no longer navigates while the user is selecting text.** The pointer routes had
  no equivalent of the `isEditable` guard the keyboard routes got, so any 260px horizontal drag
  fired — including ordinary text selection. On `/signup`'s recovery-codes screen, which renders
  **once** because the server keeps only hashes, selecting the codes right-to-left unmounted the
  screen and lost all ten. The same guard is on the operator's drag-right route.
- **`.v-code` was declared for two different components** and the later import won, so recovery
  codes rendered at the share row's 12px accent size rather than the size chosen to survive being
  photographed.
- **`go()` no longer runs effects inside a `setState` updater.** React requires updaters to be
  pure; under StrictMode they are double-invoked, so calm navigation ran `commit` twice per click
  and the iris A/B alternation never alternated in dev.
- The Konami code no longer pages the site four times mid-entry; `Ctrl+K` is only intercepted when
  the door will actually open; `.v-btn`, `.v-shuffle` and `.v-panel-close` got the interaction
  states `interaction.css` exists to provide; the 404 mutes `--a3` along with the other accents; a
  denied clipboard write no longer reports success.
- **A `data:` favicon.** Without one, `/favicon.ico` fell through `run_worker_first` to the Worker
  and was answered with the app shell — a Worker invocation and a D1-cache hit per visitor, for
  nothing. `href="data:,"` keeps the no-assets rule intact.
- **`unlocked` is a session-only field.** `loadConfig` sources the published config, which does not
  carry it, so it is false after every reload. Nothing is gated on it — the door and the panel check
  `is_operator`. The comments claiming "sticky once true" and "per-browser" were false from the
  published-config migration onward and are corrected.

### Tooling

**`predeploy` now typechecks.** `wrangler deploy` bundles `worker/index.ts` with esbuild, which
strips types without checking them, so a type error in `worker/` could reach production while
`npm run build` — which only compiles the app tsconfig — passed.

---

## 2026-08-13 — Documentation restructured

`CLAUDE.md` had grown by accretion into ten places where an older paragraph argued with a newer
one — "there is no sign-in UI" three sections above "sign-in exists", and so on. It is now cut to
currently-true invariants, and this file exists to hold the dated narrative that was removed. No
decision was dropped in the move; the entries below are that narrative.

`TODO.md` and `docs/HANDOFF.md` are the only two files that say "do X next".

---

## 2026-08-12 — `piratelife` is the operator, and `/admin` got its first real test

Created through `/signup` by the client and promoted with step 1 of `docs/BREAK-GLASS.md` — one
`UPDATE accounts SET is_operator = 1`. That made `/admin` reachable on the live site for the first
time.

The old test account `erwerwerwer` was then deleted **through `/admin`**, which is how that page
got its first end-to-end test. `piratelife` is the only account.

**This closed the window on schema and handle changes being free.** Notes written before this
saying "the account count is zero, so `HANDLE_PATTERN` and the schema are still free to change
without a migration" are obsolete from this point on.

### The footer carries `account` and `admin`, but only for a signed-in operator

The account pages stay unlinked for visitors, which is what the client asked for. But an operator
having to remember a typed word to reach their own administration is a trapdoor that locks from
the inside, not privacy. Signed out, `useSession().isOperator` is false and the links do not
render.

---

## 2026-08-12 — Recovery-code sign-in, and setting a password afterwards

`8669ed3`. The whole path, browser and Worker: `/api/account/set-password`,
`signInWithRecoveryCode` returning a `RecoverySignIn`, and three new stages in `SignIn.tsx`.

Three latent bugs were fixed on the way, and all three are the kind that typecheck.

**`signInWithRecoveryCode` returns an object with methods, not a result.** The old shape returned
`{ result, grantKey }`, so on an account **with a second factor** the wrapping key derived from
the code went out of scope at the `return` — and the key slot that arrives after TOTP could never
be opened. Recovery worked for accounts without 2FA and stranded the grant key of every account
with it. The closure now holds the key and `completeSecondFactor` finishes the sign-in through it.

**Set-password re-wraps, it does not unwrap.** `unwrapSlot` returns a deliberately
**non-extractable** key, which cannot then be wrapped into a new slot, so the flow goes
ciphertext-to-ciphertext through `rewrapSlot` exactly as `changePassword` does. Calling
`unwrapSlot` here typechecks and fails at runtime.

**`challenge` now takes the salt from any credential that has one**, preferring the password row
for its iteration count. Keyed on `kind = 'password'` it dropped an account whose password the
operator had reset through to the decoy branch and handed back a *fabricated* salt — turning a
working recovery code into a wrong one, and looking exactly like user error. This is what makes
operator password reset safe to build.

**Authorisation for set-password is a ticket, not the session.** A session says who you are, never
how you proved it. Gated on the session alone, a stolen cookie — a bounded thirty-minute exposure
today — would become permanent takeover. `TokenPurpose` gained `set-password`, minted only inside
`completeSignIn`, only on the recovery path, only after the last factor.

Verified live after deploy: `/api/health` returned six tables, `challenge` returned the real salt
for `piratelife`, `/signin` and `/admin` both 200.

**Still not verified by a human**: no recovery code has actually been redeemed on the live site.
Doing so spends one of ten, which is why it was not done casually. `TODO.md` item 2.

---

## 2026-08-12 — Sign-in, operator-published config, and administration

`92a9f5c`, `d305f98`, `200c887`. All deployed and verified live.

- **Sign-in** (`src/components/SignIn.tsx`, `/signin`). Handle + password, the TOTP second factor,
  the account summary, sign-out and change-password. One page for both states — `api.me()` on
  mount decides form or summary.
- **Change password** (`changePassword` in `flows.ts` + `worker/accounts.ts`). Re-wraps the key
  slot rather than regenerating the grant key, via `rewrapSlot`, where the scalar never becomes
  bytes in JS. **The salt is reused deliberately** — recovery codes derive against the password's
  salt, so rolling it would silently kill all ten. Verified: old password rejected, new one works.
- **The operator's config is now the site's** (`worker/site-config.ts`, migration `0003`).
  Published to D1 and **inlined into the app shell by the Worker** rather than fetched, so there is
  no palette flash and no network dependency on boot. This is what needed `run_worker_first` in
  `wrangler.toml`: by default a request matching a real file never invokes the Worker, so `/`
  (which *is* index.html) silently got no injection while `/contact` did. The site looked right on
  every URL except the front page.
- **The panel and door became operator-only.** Gated once at `openDoor` / `togglePanel` in
  `ConfigContext`, not at each of the six unlock routes. `loadConfig` no longer reads visitor
  localStorage.
- **`/admin`** (`src/components/Admin.tsx`, `worker/admin.ts`): list accounts, grant/revoke
  operator, reset 2FA, delete. Guards against removing your own last operator flag and against
  deleting yourself.
- **The account pages are unlinked**, at the client's request. Reached by typing `whoami`, `login`
  or `admin`, or by dragging **left** — mirroring the door's rightward drag. These never call
  `openDoor`; the door stays theatre.

This superseded the note that opened the same day: *"Not built, and asked for on 2026-08-12: an
operator-only siteconfig whose saved settings apply to every visitor."* The precedence question it
raised — whether a visitor's own choices override the operator's defaults or are replaced by them —
was answered by **replaced**: `loadConfig` sources the published config and no longer reads
visitor localStorage at all.

**Two real bugs fixed with it**: the screensaver faded out the recovery-codes screen mid-
transcription (`holdSaver`, reference-counted), and `useOperatorRoutes` paged the site on arrow
keys and opened the door on `sudo` from inside the new text inputs (`isEditable` guard).

---

## 2026-08-12 — Email recovery proposed, and rejected

Rejected on three counts, in favour of `docs/BREAK-GLASS.md`:

- it would put personal data into a design whose central claim (§9) is that it holds none;
- it would add an outbound mail dependency the site otherwise does not have;
- it would make a mailbox the master key to the account that administers every other account, so a
  compromised inbox would silently become full operator control.

The break-glass procedure is strictly stronger: it needs no third party, cannot be phished, and
already exists — the operator holds `wrangler` and the production D1 database, and operator status
is one integer in one row.

`SPEC-ACCOUNTS.md` §12 C carries the standing "revisit if": user numbers making manual operator
resets a burden. Read `docs/BREAK-GLASS.md` before re-proposing it.

---

## 2026-08-12 — The lightsword duel, withdrawn from the picker

`06dcb86`, `758d094`. The client saw the shipped stick-figure version and rejected it: *"that is
terrible"*, *"WAY too slow"*. They want a fast, obviously readable 8/32-bit pixel fight with
discrete matches and winners, and supplied a working reference implementation that is the
authoritative statement of it.

The code survives in `src/fx/effects.ts` (`EFFECTS.duel`, `EFFECTS.duelholy`) and in `FxId`; only
the two `FX` catalogue entries were removed, so nothing else had to change and putting them back
is two lines. The blade rendering and clash sparks are worth keeping; the stance machine is not.

`docs/DUEL.md` is the full spec — the reference's design table, why the first version failed, the
four changes needed to port it here, and the base-36 share-code trap. Read that rather than
re-deriving any of it.

---

## 2026-08-12 — Security headers, and the redirect that would have taken the site down

`758d094`. `http://mcclevarty.ca/` used to answer **200 over cleartext** — the browser's "not
secure" warning — because a Workers route matches both schemes.

**The first fix would have taken the site down**, and the failure is not obvious from reading it:

```js
const secure = new URL(url.toString());
secure.protocol = "https:";      // silently does nothing in workerd
```

The setter did not take, so `Location` came back equal to the request URL — an infinite redirect
loop, caught locally as `redirect count exceeded`. **The URL is now built by concatenation and
compared against the request before being sent**, so the worst case is "no redirect happens"
rather than "site down". Keep that guard. Loopback is exempt or `wrangler dev` and
`npm run test:auth` break.

Verified live: `http://` → exactly one 301 → `https://` → 200, with `Strict-Transport-Security`,
`x-content-type-options`, `referrer-policy` and `x-frame-options` on page responses.

Cloudflare's **SSL/TLS → Edge Certificates → Always Use HTTPS** does the same redirect at the edge
without costing a Worker invocation. Turning it on as well is free and is recommended — `TODO.md`
item 13.

---

## 2026-08-12 — The hero vitals strip removed

`fa95fba`, at the client's request. The palette name, layout name, effect name and pulse were a
readout of state nobody asked to see. The client's point, in their framing: **show the layout, do
not caption it.**

The `· adapted` suffix went with it. The stored layout is still never overwritten when a small
screen collapses it, so nothing is wrong in the data — but **that state is now surfaced nowhere**,
and that is deliberate rather than an oversight. If it needs to return it wants its own affordance
rather than the whole readout coming back.

The dead `.v-vitals` rule and the then-unused catalog imports went with it. This is a deviation
from `SPEC.md`, which specifies the strip in *Hero* and its `pressure lost` variant on the 404
page; it is recorded in `CLAUDE.md` under *Known deviations from the prototype*.

---

## 2026-08-12 — Handles restricted to DNS-safe characters

`e65cbe5`. `HANDLE_PATTERN` went from `/^[a-z0-9][a-z0-9._-]{2,23}$/i` to
`/^[a-z0-9][a-z0-9-]{2,23}$/i`.

Done **while the account count was still zero and the change was therefore free.** Neither `.` nor
`_` survives a hostname: a dot makes `ada.smith.mcclevarty.ca` a two-level name that Cloudflare
Universal SSL does not cover, and an underscore is invalid in the hostname position outright.
Keeping handles DNS-safe leaves per-account subdomains possible later
(`design/GUIDE-SUBDOMAINS.md`) instead of foreclosing them for whichever accounts happened to use
those characters. After the first real signup this would have been a breaking migration.

This is the decision `GUIDE-SUBDOMAINS.md` asks to "be made now", and it was made the same day the
guide was written — but the guide was not updated, so it went on describing the old pattern as a
live blocker. Corrected 2026-08-13.

**Still not actioned from that guide**: its recommendation that a handle named `mail` be blocked,
because the zone's MX records live there. `mail` is not in `RESERVED_HANDLES`. `account`,
`machines` and `share` are.

**The user-facing error message was not updated with the pattern** and went on promising `. _ -`
for a day, so the rule the person was told and the rule they were held to disagreed. Corrected
2026-08-13 (`561e067`).

---

## 2026-08-12 — Signup shipped, and the test account was deleted

`18aaa8d`, `d20eb99`. `src/components/SignUp.tsx` at `/signup`, the first real-auth surface.
Verified in a browser against production: an account was created end to end and ten recovery codes
rendered.

The test account was deleted afterwards — `accounts`, `credentials` and `key_slots` all cascade to
zero — because its password had been written down in a transcript.

The note that followed, *"the account count is zero again, so `HANDLE_PATTERN` and the schema are
still free to change without a migration"*, was true when written and is **superseded by the
`piratelife` entry above**.

The same commit left `/signup` linked from `FOOTER_NAV` as "Account". That was reversed later the
same day when the client asked for the account pages to be unlinked; `FOOTER_NAV` now holds only
Now and Changelog, and the operator's links are rendered separately in `Footer.tsx`.

---

## 2026-08-12 — Cutover: `mcclevarty.ca` is served by the Worker

`29b8f89`. The site moved from Cloudflare Pages to a Worker with static assets, because **Pages
cannot define Durable Object classes** and this stack needs them twice — rate limiting now, one
signalling object per paired machine in phase 2.

It was done by **adding a `routes` entry to `wrangler.toml` rather than deleting the Pages custom
domain**, because a Workers route is evaluated ahead of a Pages custom domain. `wrangler pages
domain` is not a command in wrangler 4.122, so removing it via CLI was not available anyway — but
the route approach is better regardless: the Pages project is untouched and still holds the domain
underneath, so **rollback is deleting the `routes` block and running `npm run deploy`**, not
rebuilding infrastructure under pressure.

Verified live: `/api/health` returned `{"ok":true,"tables":6}` — decisive, because Pages has no
`/api` and could not answer it at all. `/`, `/contact`, `/work`, `/404` and an unrouted path all
200, the served bundle hash matched a local build, and `mcclevarty.com` still 301s to `.ca`.

**Adding `routes` silently disabled the `workers.dev` URL**, since `workers_dev` defaults to false
once a route exists. `vessel.patrickmcclevarty.workers.dev` — which earlier notes cite as the
verification target — no longer resolves. That is wanted here, because it closes the public signup
endpoint that was reachable before cutover, but it means there is no non-production URL to test
against. Set `workers_dev = true` if you want one back, knowing it reopens that endpoint.

### The infrastructure it landed on

- `npx wrangler login` — done by the client. Account `760b80a637d2ffe755b09da3f4a339ff`.
- **The real D1 database.** `vessel`, region ENAM, id in `wrangler.toml`. Migrations applied
  `--remote`; `d1 list` was empty beforehand, so nothing was overwritten.
- **All four secrets set**, by the client. `AUTH_PEPPER` is backed up in their password manager.
  That backup matters: Cloudflare secrets are write-only and cannot be read back, so losing the
  pepper invalidates every stored auth hash — every password on the site — unrecoverably. It was
  free to regenerate while the account count was zero and is a data-loss event now. The other
  three are cheaper: `SESSION_SECRET` only signs everyone out, `RATE_SALT_SEED` only resets
  counters, `TOTP_ENC_KEY` breaks enrolled second factors.

---

## 2026-08-12 — `public/_redirects` breaks the Worker deploy, and stays anyway

`22fbc79`. An earlier note called the file "dead under Workers". That was wrong.

Workers static assets treats `_redirects` as **configuration, not as an asset**: it parses and
validates the file, and rejects `/*  /index.html  200` with
`Invalid _redirects configuration — Line 3: Infinite loop detected` (the rule strips `/index` and
re-triggers itself). The deploy fails outright at the API call.

Because it is configuration rather than an asset, **`.assetsignore` does not help** — that only
filters the upload list, and validation has already happened. This was tried and does not work.

It cannot simply be deleted either: `main` still auto-deploys to Pages, which is the rollback, and
removing it would break client-side routing there on the next push. So the file stays in `public/`
and is stripped from `dist/` at deploy time only:

```
"predeploy": "npm run build && node -e \"...rmSync('dist/_redirects')...\"",
"deploy": "wrangler deploy"
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — the bare command fails on a fresh
build. Pages is unaffected: Cloudflare runs its own `npm run build` and never sees the removal.

The original plan said *"at cutover, delete `public/_redirects` and both scripts together."*
**That is superseded.** The cutover happened and the file is deliberately kept, because Pages
continues to auto-deploy from `main` and is the rollback. Delete both when the Pages project is
deliberately retired, not before.

The SPA fallback for the Worker is `not_found_handling = "single-page-application"` in
`wrangler.toml`, not `_redirects`. `SPEC-ACCOUNTS.md` §11 predates this.

**It breaks local development too.** `dist/_redirects` is copied in by a bare `npm run build`, and
`npm run dev:worker` then hits the same validation. Run `npm run predeploy` instead, or delete
`dist/_redirects` first.

---

## 2026-08-12 — `design/SPEC-ACCOUNTS.md` approved

Approved by the client and no longer a proposal. §12 is its decision log and is kept deliberately:
every rejected option keeps its reasoning and carries a *"revisit if"* condition, so an idea that
comes back starts from "here is why we didn't" rather than being re-derived. Add to it rather than
relitigating.

Phase 1 grew roughly threefold with the second round of decisions (§12 H) and stays one phase,
with one non-negotiable internal order: **authentication works end to end before any interface
work starts.**
