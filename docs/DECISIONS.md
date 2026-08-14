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
