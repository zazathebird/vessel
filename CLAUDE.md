# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file holds invariants — things that are true now and that a future reader could plausibly
"fix" back into a bug.** Dated history lives in `docs/DECISIONS.md`; the ordered backlog lives in
`TODO.md`; how to start a session and verify a deploy lives in `docs/HANDOFF.md`. If this file and
`TODO.md` disagree, `TODO.md` is newer.

## The project

"Vessel" — a personal site for an independent computer repair operator, built from a complete
design handoff. React 18 + Vite + TypeScript, served by a Cloudflare Worker.

```sh
npm run dev          # Vite dev server on http://localhost:5173 — no API
npm run dev:worker   # full stack: Worker + API + local D1, on http://127.0.0.1:8787
npm run build        # typecheck + production build
npm run typecheck    # types only, app and worker
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run deploy       # build, strip dist/_redirects, publish the Worker
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — see *Deployment*.

The only tests are `scripts/auth-e2e.ts`, which drives the real `src/auth` modules against a live
Worker and local D1 and prints its own check count on completion. There is still no test suite for
the site's *rendering* — but two of the site's own pure modules are covered there because both are
**wire formats whose failures are silent**: `src/share/paths.ts` (§12 S) and, since 2026-08-14,
`src/config/shareCode.ts`. A wrong share code is a *working* code pointing at the wrong palette, so
nothing ever throws and nothing ever logs. If you append to `FX`, `LAYOUTS`, `PALETTES`, `TYPESETS`
or `ORNAMENTS`, the harness is what tells you whether every code already in circulation still means
what it meant.

**Both sections are pure but neither runs first, and that is a known wart** (2026-08-14). Their
titles say "before any wire" and they are self-contained — but they sit ~1300 lines down, *after*
the reachability gate that `process.exit(1)`s when the Worker is not answering. So appending to a
catalogue and running `npm run test:auth` without `npm run dev:worker` runs **none** of the
wire-format checks and exits looking like an environment problem. Moving both blocks above the
health check would make the titles true; until then, start the Worker.

**`fxlab.html` (project root) is the canvas bench** — open `http://localhost:5173/fxlab.html` with
`npm run dev` running. All sixteen effects on one page through `FxCanvas`'s exact frame maths,
advanced by an explicit **Step** button instead of `requestAnimationFrame`, which is the whole
point: an automated or occluded browser reports `document.hidden` (so rAF correctly parks) *and*
`prefers-reduced-motion: reduce` (which becomes calm, which hides the canvas), and that pair
blocked three sessions from ever seeing an effect. **It is dev-only by construction** — Vite
declares no `rollupOptions.input`, so the build has one entry, `index.html`, and `dist/` gets no
`fxlab.html`. If a multi-page input map is ever added, leave this file out of it.

No runtime dependencies beyond React — the routing, state, styling **and authentication** are all
hand-rolled, deliberately (see *Assets* in the spec: no third-party libraries, no webfonts, no
images). **The webfont half of that rule was lifted by the client on 2026-08-14** — see deviation
14 below; the no-third-party-libraries rule is untouched and still absolute.

## The spec is authoritative

- `design/SPEC.md` — final copy, tokens, layouts, motion timings, product decisions
- `design/SPEC-ACCOUNTS.md` — accounts and brokered drive access. **Approved 2026-08-12**, not a
  proposal. §12 is its decision log
- `design/prototype.html` — an **executable** spec. It genuinely runs; every feature described in
  SPEC.md works in it. Open it in a browser and use it rather than guessing at behaviour. It pulls
  React and Babel from unpkg at load, so it needs network access
- `design/support.js` — the prototype's own renderer. **Do not port it and do not read it for design
  intent.** It is scaffolding
- `design/rejected-kaleidos.html` — an earlier direction that was rejected. Context only
- `design/GUIDE-SUBDOMAINS.md` — how to add a page, and what per-account subdomains would break

Fidelity is high: every hex value, duration, and easing curve in the spec is intended, not
approximate. The deliberate exceptions are photo slots (placeholders, real images don't exist yet),
operator authentication (theatre — see below), and the items under *Known deviations* below.

### Finding things in the prototype

`design/prototype.html` is one file: a `{{ binding }}` template inside `<x-dc>`, then a
`class Component extends DCLogic` (a React class component) inside `<script type="text/x-dc">`.
That format is prototype scaffolding — recreate the *behaviour*, not the shape.

Copy these verbatim rather than retyping or paraphrasing:

| Line | What |
|---|---|
| 288 | `PALETTES` — 24 palettes × 9 roles → already ported to `src/data/palettes.ts` |
| 315–348 | `LAYOUTS`, `FX`, `TYPESETS`, `MODES`, `SCOPES` → `src/data/catalog.ts` |
| 351 | `BAD` + `LOWCONTRAST` guardrails → `src/data/guardrails.ts` |
| 366 | `PAGES` — the nine content pages' final copy → ported to `src/data/pages.ts` (with the one approved copy correction below) |
| 710 | `scramble()` — the title assembly, and its timing trap |
| 823 | `startFx()` — all twelve canvas effects |
| 1029 | `renderVals()` — where layout, band, and calm collapse into concrete styles |

## Architecture

State lives in one place. `src/config/ConfigContext.tsx` owns the persisted `Config` and exposes
`update`, `go` (navigation), `shuffle`, the current `band`, the adapted `layout`, and `say` for
toasts. Components read tokens, not props.

`src/theme.ts` is the seam: it collapses palette + typeface + layout + band + calm into CSS custom
properties on one wrapper element, plus class names (`layout-*`, `band-*`, `is-calm`) that CSS
branches on. **No component should contain a literal colour** — a palette change has to be a
variable swap, which is what makes the 0.9s palette bleed work.

Three of those tokens carry rules rather than values:

- **`--panel`** is how much of `--surface` survives in a card's background, and it has two floors
  that are accessibility decisions, not tuning. Calm raises it to 92% (calm also hides the canvas,
  so translucency buys nothing there and costs the panel its edge) and the `LOW_CONTRAST` palettes
  to 80% (on Peat, `--surface` and `--bg` are four points of luminance apart to begin with).
- **`--panel-shift`** is how a layout adjusts translucency per block — Mosaic by span area, the HUD
  by plane. **Never set `--panel` directly on a block**: an absolute value drives through both
  floors above. `.v-block` clamps the sum.
- **`--elev`** is a unitless multiplier on the drop shadow, so a layout can say "nearer" without
  knowing the shadow's geometry.

`--mx` / `--my` are the shared pointer light: normalised coordinates written to the wrapper by
`useMotionSystems` on every pointermove and registered with `@property` so they are typed and
interpolate. Split, Mosaic and the HUD all hang their light and parallax off these two numbers, so
every layout's light agrees with every other's instead of each growing its own listener. They stop
being written in calm, and nothing reads them there.

Per-frame values (mouse position, scroll velocity, card element list, keystroke buffer, drag origin,
scramble token) belong in refs, outside React state. The spec is explicit about this.

`src/App.tsx` is the real shell. The three overlays (panel, door, screensaver) are siblings of
`.v-chrome` rather than children, because the screensaver fades the chrome to `opacity: 0` with
`pointer-events: none` and must not take the panel or the door with it.

**The panel and the door are operator-only**, gated once at `openDoor` / `togglePanel` in
`ConfigContext` rather than at each of the six unlock routes — a route added later inherits the
gate instead of needing to remember it. `isOperator` is false until the session probe settles, so
the door cannot flash open on load. Losing `isOperator` force-closes both. `SPEC.md` describes
`authenticate` making the `siteconfig` button appear permanently for anyone; that is the
prototype's behaviour and no longer the site's. **The door itself is still theatre** — it guards a
settings drawer and nothing else.

### The two halves of published site config

- `worker/site-config.ts` writes `window.__VESSEL_SITE__` into the app shell's `<head>` with
  HTMLRewriter, before the bundle loads.
- `src/config/siteConfig.ts` is the client half: `publishedConfig()` reads that global
  **synchronously during the first render**, which is the whole reason it is not a fetch —
  `ConfigContext` builds its initial state in that render so there is no flash of the default
  palette, and a fetch would put a 0.9s bleed from Nebula Drift to the real palette on every cold
  load. Absent or malformed, it returns null and the built-in defaults render.

`loadConfig` validates the published payload field by field, exactly as it always validated stored
config. A published layout id that no longer exists would otherwise render an unstyled page for
every visitor at once.

### Session and account routing

- `src/auth/SessionContext.tsx` — who is signed in. **Deliberately separate from `ConfigContext`**,
  which §11 requires stay synchronous and gain no fetching. Everything gated on it starts hidden
  and appears when the answer arrives.
- `src/hooks/useAccountRoutes.ts` — the unlinked routes to the account pages: type `whoami`,
  `login` or `admin`, or drag the page **left** past 260px, mirroring the door's rightward drag.
  **These never call `openDoor`.** Since 2026-08-13 there is also one *findable* affordance
  (client request): five taps on the hero ornament (`Ornament.tsx`) reveal a sign-in link in the
  footer for the rest of the visit (`signinShown` in `ConfigContext`) — the account side's mirror
  of the logo's five taps, and like every account route it navigates rather than unlocking
  anything. Radial's orbit pills share the ornament's slot; their clicks are excluded from the
  count. Since the mobile-parity pass (2026-08-13, client request) the ornament renders on the
  phone band too — do not re-hide it there — and non-desk bands get a header `cmd` chip because
  the command palette's only other route in is typing `cmd` on a hardware keyboard.
- `src/hooks/useOperatorRoutes.ts` — the door's six routes, and arrow-key page cycling over `NAV`.

Both keystroke hooks carry an `isEditable` guard: without it, typing in an account form pages the
site on arrow keys and opens the door on `sudo`.

### The interaction stylesheet

`src/styles/interaction.css` is the fifth stylesheet and owns **every** hover, press and disabled
state. It exists because the site had two requirements fighting over the same CSS properties: the
palette bleed needs colour to cross-fade over 0.9s, and pointer feedback needs to land in ~140ms.
Before it, all sixteen transitions in the codebase ran at 0.9s and there was not one `:hover`,
`:active` or `:disabled` rule anywhere — which was the direct consequence, not a coincidence.

The split is **by property, not by selector**: colour properties belong to the palette at 0.9s,
`translate` and `scale` belong to interaction at 140ms/90ms. Nothing in the interaction layer animates
a colour and the palette never animates a position. Two things follow that are easy to undo by
accident:

- **Use `translate` / `scale`, never `transform`.** They compose independently, and `transform` is
  reserved for the cursor-lean that `useMotionSystems` writes to `.v-block`'s style attribute.
- **Selectors are prefixed `.vessel` to reach 0-2-0**, so they beat the 0-1-0 rules in `chrome.css`
  and `overlays.css` on specificity rather than on import order. Dropping the prefix silently
  reinstates the 0.9s hover.

`box-shadow` is the one property both systems want and it is given the fast timing deliberately; the
cost is documented at the top of the file.

Five CSS gotchas that have already bitten once each, all worth knowing before editing styles:

- **`band-*` and `layout-*` are on the same element.** `.band-phone .layout-stack` matches nothing;
  it has to be `.band-phone.layout-stack`. Every phone override was silently dead until this was
  found — and phones collapse almost everything to Stack, so it was the main phone path.
- **An animated `transform` beats a declared one — so centre with `translate`.** `.v-toast` set
  `transform: translateX(-50%)` next to `animation: v-rise … both`, and `v-rise` animates
  `transform`; with a forwards fill the centring never applied *at any point*, so every toast the
  site has ever shown sat with its left edge on the viewport's centre line. Calm hid it, by killing
  `animation`. Fixed 2026-08-14 by centring with the `translate` property, which composes with
  `transform` instead of fighting it — the same rule interaction.css states for hover. This is the
  next bullet's trap in a second place; check for it whenever a rule declares a transform and an
  animation together.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`.** An animated declaration outranks
  the style attribute, so a forwards fill would leave `v-rise`'s `transform: translateY(0)` owning
  the card for ever and the cursor-lean tilt — which is written to `el.style.transform` — would
  never render. The stagger only needs the from-state held during the delay.
- **The chrome is a flex column, and Terminal is the one layout that opts out.** `.v-chrome` is
  `height: 100dvh` with `.v-stage` at `flex: 1; min-height: 0`, so the stage takes whatever the
  header actually leaves — it used to subtract a hardcoded `132px`, which drifted the moment a chip
  was added to the header (the real phone header is 147px) and left the *document* scrolling behind
  the already-scrolling stage. **`min-height: 0` is load-bearing**: a flex child defaults to
  `min-height: auto` and refuses to shrink below its content. **Terminal overrides to
  `height: auto; min-height: 100dvh` with `flex: 0 0 auto` on its stage**, because its stage is
  `height: auto; overflow: hidden` and expects the *document* to scroll; clamped, it clips instead —
  which shipped for an hour and made most of every page unreachable. Do not "simplify" the clamp to
  `min-height` for everyone: that makes every stage size to its content and nothing scrolls
  internally at all. **`.vessel` and `.v-chrome` must use the same viewport unit** (`dvh`); `vh`
  resolves against the large viewport and reintroduces the nested scroll on any mobile browser
  showing its URL bar
- **`scroll-snap-type: mandatory` is unsafe the moment a snap area outgrows the
  scrollport, and on the phone the hero does.** Stack's snap sections were
  `y mandatory`; measured at a real 417×857 viewport the scrollport is 654px and
  `.v-hero` is 684px. Mandatory snap must come to rest *on* a snap point, and
  every position inside that oversized hero has the hero's own start as its
  nearest one — so releasing anywhere in the first screenful went back to the
  top, and holding a finger down (which suppresses snapping) appeared to "save
  your place". That symptom is the tell. `proximity` was not enough on this band
  either — 120px still snapped to 0 and 1400px was pulled back 198px — so
  **phones get `scroll-snap-type: none`** and larger bands keep `proximity`.
  Snap sections are a reading aid while a block is comfortably sub-viewport;
  on a phone the hero is larger than the whole scrollport. The rule is
  `.band-phone.layout-stack .v-stage` — same-element classes, per the first
  bullet in this list.
- **`.v-stage` scrolls vertically, so its `overflow-x` computes to `auto`, not `visible`** — one
  axis cannot be visible while the other is not. Anything hanging off the side of a child, a
  pseudo-element included, gives the whole stage a horizontal scrollbar. The hero's stage wash did
  exactly that at `left: -14%`, for a measured 91px. Every ambient-light pseudo-element is pinned to
  `0` horizontally and widened instead of bled outward.
- **A floated `::first-letter` is invisible inside a multi-column container.** Chrome reserves the
  float's box — the text wraps around a notch — and never paints the glyph. Magazine is the only
  layout with `columns`, so it is the only place a drop cap was wanted and the only place the usual
  implementation cannot work. It uses `initial-letter: 3 3` behind `@supports`, which does.
- **`clip-path` clips `box-shadow` away.** The HUD's chamfered corners are a `clip-path`, so its
  elevation is a `drop-shadow` *filter*, which follows the clipped silhouette. Note the second
  consequence: `filter` makes an element a containing block for `position: fixed` descendants — safe
  on a content block, not safe if it ever moves to the grid or the stage.

## Constraints that are decisions, not oversights

The spec's *Product decisions already made* table is binding — do not revisit without asking. The
ones most likely to be "fixed" by accident:

- **No city is ever named.** Service area is deliberately vague. No client names on Work
- **The email never appears in static markup.** Assembled at runtime from parts, click-to-reveal,
  copies to clipboard on reveal, resets to unrevealed on page change
- **Guestbook has no form.** "A form is a database is a liability"
- **The operator door and its `authenticate` button are theatre** — no backend, no real auth. Keep
  it guarding nothing but a settings panel, and never present an unlock route as security
- **The self-deprecating copy is the point.** The site openly admits it is unnecessary. Do not
  rewrite it to sound more professional
- **Calm mode is a second full aesthetic**, not a degraded first one, and it is the accessibility
  escape hatch for the deliberately low-contrast palettes
- **Contact is the only page with a job.** It must work correctly at every stage of the build

## Implementation traps

- **Title scramble**: the resolved h1 is the default state and the scramble decorates it. Drive it
  from `requestAnimationFrame` against a `performance.now()` deadline (550ms) — never a frame
  counter or `setInterval`, or a throttled background tab strands the headline in garbage
  permanently. Each run carries a token so a superseded run cannot clear the live one's timer
- **Time-of-day randomiser** must not fire on a first visit; Nebula Drift wins on load. Handled in
  `ConfigContext` via `hasVisited()`
- **Persistence** is validated field by field in `src/config/persistence.ts`, not trusted. A stored
  layout id that no longer exists would otherwise render an unstyled page forever
- **Two fields are stored and read back, and the rule is what they share: they are the settings a
  visitor can set for themselves.** `calm` (2026-08-13) and `sound` (2026-08-14), each under its own
  key (`vessel.calm.v1`, `vessel.sound.v1`), written only by their three deliberate toggles — the
  header chip, the panel, the command palette. Everything else is *appearance*, which belongs to the
  operator and stays published-only. Calm must survive because a visitor turned it on; sound must
  survive because a visitor turned it off. Do not read either from the full-config echo `saveConfig`
  writes — that would freeze whatever was published on the first visit. **The test for adding a
  third is not "is this useful to remember" but "can a visitor set it at all"**: today exactly two
  controls are public, and they are these two.
- **`loadConfig`'s no-published-config branch must still apply those two.** It used to return the
  bare defaults, so calm silently stopped persisting whenever nothing was injected — including when
  D1 is unreachable and `worker/site-config.ts` correctly injects nothing, i.e. the accessibility
  escape hatch switching itself off in exactly the degraded case. Production hid it because a config
  *is* published. Fixed 2026-08-14; do not "simplify" that branch back to `{ ...DEFAULT_CONFIG }`
- **The first visit gets one dialog, and it is not a cookie banner** (`Greeting.tsx`, client
  request). The site is full of motion and the controls that stop it are two small chips nobody
  reads, so a first-time visitor gets one sentence and one button. It waits 1.2s so it lands *after*
  the headline scramble rather than on top of the one moment the site introduces itself, and it
  stores a single "seen it" flag — no choice is extracted and the site works identically either way.
  Returning visitors get the two chips flashing three times instead (`is-nudge`), and only while
  neither has been touched: a control advertising the off switch for motion must not become the most
  restless thing on the page.
- **That button is also the capability probe, and says nothing about it** (`src/fx/perf.ts`, client:
  "just have it linked to clicking ok", "dont say the site is going to do it"). `FxCanvas` adapts
  continuously but cannot know anything on the first frame, so a slow machine spent its opening
  seconds at full resolution discovering it could not afford full resolution. The probe times a short
  burst of the work the effects actually do, at the real pixel ratio — **not** `hardwareConcurrency`,
  which counts cores, says nothing about the GPU, and is wrong in both directions. Two details are
  load-bearing: an **untimed warm-up round**, because the first touch of a fresh context pays an
  allocation the real effects pay once at mount, and a **pixel read-back**, because without it the
  timer measures how fast commands were *enqueued* — the one number that looks healthy on a slow GPU.
  **It can only ever start things two tiers down**: demotion now takes ~0.33s, so guessing too high
  is cheap and guessing too low strands a fast machine soft for seconds.
- **The site's sound is synthesised and cannot play uninvited** (`src/audio/engine.ts`). No files, so
  `SPEC.md`'s *Assets* rule holds; the pitch is derived from the palette exactly as every colour is,
  so no voice contains a literal frequency. **There is no ambient bed, no loop and no timer** — every
  voice is fired by a gesture, which is how autoplay policy is satisfied here, and the `AudioContext`
  is not constructed until the first voice. Adding anything self-starting breaks that guarantee and
  is a product decision, not a feature. Calm silences it entirely and `releaseAudio()` hands the
  device back. `chime` in `ConfigContext` is the single gate; `play` never reads config, so the
  audio layer cannot become a second opinion about a setting the user can see a checkbox for
- **The calm/404 `filter` lives on `.vessel`'s children, never on `.vessel`** (`base.css`). A
  filter on the wrapper makes it the containing block for every fixed-position overlay, which in
  Terminal (document scrolls) re-anchors toasts and scrims to the document instead of the viewport
- **Focus traps stack, and dialogs + the command palette are *modal*** (`useFocusTrap`'s
  `isModalOpen`): the global key and drag routes stand down under an open modal, its Escape
  handler stops propagation so one press closes one layer, and only the top trap handles Tab. The
  panel and door are deliberately **not** modal — `sudo` with the panel open opens the door
- **Adapted layouts**: the operator's stored layout is **never overwritten** when a small screen
  collapses it — it re-emerges when the window widens. That state is now surfaced **nowhere**:
  `SPEC.md` puts a ` · adapted` suffix on the hero metadata strip, and the strip was removed
  (deviation 8 below). Deliberate. If it needs to return it wants its own affordance rather than
  the whole readout coming back
- **Routing**: the prototype swaps pages in place with no URL change. That is a prototype
  limitation, not a design decision — **fifteen** real URLs are wired in `src/data/pageIds.ts`:
  the spec's nine content pages plus `/setup` (2026-08-14, a footer page), `/signup`, `/signin`,
  `/admin`, and (phase 2) `/machines` and `/share`. The phase-2 pair follow the account pages'
  unlinked convention — typed routes (`machines`, `share`) and links from the `/signin` summary,
  nothing in the public nav. **Adding a content page moves the 404's page count** — see *Copy
  changes* below
- **The 404 pill left the public nav on 2026-08-13, by client decision.** "404 genuinely in the
  nav" was the spec's joke; the client pulled it behind sign-in. It now leads `OPERATOR_NAV`
  (404 / Account / Admin), the operator-only tabs the header appends for a signed-in operator,
  plus a Config tab that toggles the panel. `OPERATOR_NAV` is deliberately not part of `NAV`:
  `useOperatorRoutes` cycles `NAV` and Radial's orbit renders `NAV`, so the tabs change neither.
  The 404 *page* still renders for anyone at an unknown URL — only its advertisement moved. The
  panel's **Leave operator mode** button (same day) is the counterpart: it signs the session out,
  which collapses the tabs, the panel and the door in one motion, and clears `unlocked` so the
  header's siteconfig button retires with them
- **The FX canvas renders in CSS pixels, into a buffer sized to its own box.** It used to render
  into a fixed 1600×1000 and let CSS stretch it, which drew every circle in `orbits`,
  `constellation`, `bokeh` and the tunnel's spokes as an ellipse. `FxCanvas` now sizes the buffer
  from a `ResizeObserver` at `min(devicePixelRatio, 2)` capped to a 2600px long edge, and sets a
  base `setTransform` each frame so effects keep receiving CSS pixels. **That last part is
  load-bearing**: `rain` sizes its columns off `w` at a 16px cell and `plasma` its grid at 26px, so
  handing them device pixels silently doubles their density on a retina display. The per-frame
  `setTransform` also means a missed `ctx.restore()` — `rain` flips the world inside a save/restore
  pair — can no longer mirror the site permanently.
- **The screensaver has no rendering of its own** — it *is* the configured effect, alone and
  boosted. Sixty seconds without a click fades `.v-chrome` to `opacity: 0` over 1.6s and `FxCanvas`
  adds `0.9` to the boost. So "make the screensaver do X" is already answered for every effect:
  pick X. The only thing that needed building was **the duel's attract mode** — it alone has a
  *subject*, and it was still drawn at background scale, `dim: 0.55` and bars-off while asleep, i.e.
  being polite to copy that had faded out. `Frame.sleeping` drives it, deliberately as its own flag
  rather than something recovered from `boost` (scroll velocity is folded into that same number, so
  a hard scroll would be indistinguishable from a sleeping interface). The blend is **eased, never
  switched** — a figure that doubled in size on one frame would beat the 1.6s chrome fade and read
  as a glitch — and `approach()` raises the retained fraction to the frame count because `frames` is
  delta-corrected and clamped to 4, never 1. `DuelView.barAlpha` exists because `bars` is a boolean
  and can only pop; it defaults to 1, so the ornament is untouched. No other effect reads `sleeping`
  and none needs to.
- **A resize is absorbed by each effect, never by the cache.** `FxCanvas` drops the effect cache
  only when the effect *id* changes, so anything holding geometry has to notice a new box itself:
  `rain` compares its column and row counts, and `vessels` compares the box its tree was grown for.
  Particle fields need nothing — they wrap back in within seconds. **An effect that caches absolute
  coordinates and does not check the box will strand itself on the first resize**, which `vessels`
  did (2026-08-14): the trunk is rooted at `w * 0.5` and the side branches at `-10` and `w + 10`,
  so a widened window left the trunk off-centre and the side branches floating detached in
  mid-page. It could not happen before the buffer change, when `w`/`h` were a constant 1600×1000.
  `vessels` rebuilds from a **stored pool of random numbers**, not from `Math.random()` — that is
  what makes a rebuild re-fit *the same* tree instead of rolling a new one on every frame of a
  drag-resize.
- **The adaptive resolution tier cannot reach a draw-call-bound effect, so
  effects also receive it as `quality`.** `FxCanvas` samples its own frame time
  and steps the render buffer through 1 / 0.75 / 0.5 — it measures the machine
  it is on rather than reading `hardwareConcurrency`, which is wrong in both
  directions and says nothing about the GPU. That fixes fill rate and does
  nothing for `rain` (~1,900 blits a frame) or `plasma` (a grid measured in CSS
  pixels): the half tier quartered their fill and left every draw call in place.
  Those two coarsen their own grid by `quality`; every other effect ignores it,
  because for a particle field the buffer really is the whole fix.
- **The duel integrates against `dt` (real elapsed frames), never `boost`.**
  Every other effect is an ambient field and should surge when the page is
  scrolled or asleep. A duel is a performance and keeps its own tempo. It used
  to derive its frame count from the effect clock, which has `boost` folded in,
  so it ran at ~2× for exactly as long as the screensaver was up. That also
  caused the reported "random lag", which was never dropped frames: the
  simulation steps in whole frames from a fractional accumulator, so a rate of
  1.9 alternates 2,2,1 steps per rendered frame — judder on a fixed cadence.
- **Particle counts scale with area, and the reseed guard is the box, not the
  count** (`field()` in `src/fx/effects.ts`). Fixed counts meant a phone got
  ~4× the density of a desktop at ~4× the cost on weaker hardware — 90
  constellation nodes over 390×844 is a solid accent-coloured blanket behind the
  copy. Scaling the count breaks a `length !== n` guard (the target now changes
  with the box, so it would re-roll the field every frame of a drag), hence the
  stored box and the 35%-area threshold.
- **`FX` is the wire format; `PICKABLE_FX` is the menu.** Anything offering a choice to a human
  (the panel, the command palette, the shuffle) reads `PICKABLE_FX`; anything *resolving* a stored
  or shared value reads `FX`, because a hidden effect is unlisted, not invalid. Entries carry an
  optional `hidden`; the two lightsword duels spent a day flagged with it at their reserved indices
  12 and 13 and were **re-listed 2026-08-14**, which was deleting the two flags exactly as promised.
  `scan` and `telemetry` are appended at 14 and 15. **No entry carries `hidden` today, so
  `PICKABLE_FX` equals `FX` — keep both lists and the flag anyway.** This is the mechanism for
  withdrawing an effect without moving anyone's share code; collapsing them into one array is the
  tidy-up that forces the next withdrawal to delete an index instead of flagging one.
- **Every surface that reads `PICKABLE_FX` is operator-gated**, which is why re-listing the duels
  was a small change. A visitor's only appearance control is the calm toggle — the shuffle lives in
  the panel and the command palette's operator block, `.v-paste` is in the operator-only panel, and
  the home page's "Show me something weird" **navigates to the gallery, it does not roll the dice**.
  Presets are operator-only for the same reason (2026-08-14): making them public would be the
  site's first public appearance control, which is a product decision about who controls the look.
- **Presets define themselves structurally and derive their share code** (`src/data/presets.ts`). A
  hardcoded `"N-7-5-3-5-3"` stays correct until something is appended to a catalogue and then goes
  silently wrong — and the wrongness is a *working* code pointing at the wrong palette, which is the
  exact failure the wire-format discipline exists to prevent. `encodeShareCode` reads the same
  indices the decoder will, so the two cannot disagree. They are operator-gated, like every other
  appearance control in the command palette; `.v-paste` is in the operator-only panel, so share
  codes are in practice operator-only too. Making them public is a product decision, not a fix.
- **The toggle bitfield is where a new boolean goes, while bits remain.** `sound` took bit 16
  (2026-08-14) rather than a seventh share-code field: every code already in circulation has it
  clear, which decodes as off — the correct default — the field count does not change, so nothing
  counting hyphens breaks, and base-36 still renders the whole bitfield (max 31) in one character.
  Bits 32 and up are free. **Both `PUBLISHED_KEYS` lists must gain the field too** — the client's in
  `src/config/siteConfig.ts` and the Worker's in `worker/site-config.ts` are separate arrays and
  either one missing it silently drops the value on publish, so the operator sees a setting that
  never reached anybody else
- **Share codes are base-36 and `FX` order is a wire format.** Effect index 12 is `C`, not `12`;
  `0-0-12-0-7-0` parses `12` as 38, falls through `FX[38] ?? FX[0]` and applies the default effect (id `vessels`,
  labelled "Branches" since the de-branding), which looks exactly like a failed deploy. Append to
  `FX`, never insert

## Known deviations from the prototype

All deliberate. Add to this list rather than silently diverging.

1. **Guardrail evaluation** (`src/data/guardrails.ts`). The prototype's `ok()` tests each clause
   independently, so `{ type:["editorial"], pal:["datamosh"] }` rejects *every* Editorial config
   rather than only the Editorial+Datamosh pairing — Editorial can never be rolled. The spec says
   "Editorial type may not pair with the Datamosh palette", so a rule here matches only when all its
   clauses match. Every other rule behaves identically under both readings.

   **`Combination` must carry every dimension a roll can change, and each field is deliberately
   required.** The ornament was rolled by `randomiser.ts` for months and never passed to
   `isAllowed`, so no guardrail could constrain it *however it was written* — the one pairing that
   genuinely does not work (two duels, below) shipped and reached ~3.6% of visits. Nothing failed to
   compile, because the field was simply absent from the type. Required fields mean the next
   dimension added to `RollResult` and forgotten here is a type error at the call site rather than a
   rule that silently never matches. If you add a knob to the roll, add it to `Combination`.
2. **Focus-visible styles** exist in `base.css`. The spec lists their absence as a gap to close, not
   a design decision.
3. **Magazine's h1 minimum is `46px`**, the spec's value, not the prototype's `40px`. The spec is
   authoritative on every other measurement, so it is here too.
4. **Matrix rain is rebuilt, at the client's request** (`src/fx/effects.ts`). The prototype moves a
   whole 16px cell per frame — about 960px/s — and fakes trails by overdrawing the background, so
   every stream shares one speed and one endless tail. Each column now owns its speed, trail length
   and glyphs; the trail is drawn explicitly so the leading glyph can be near-white with the body
   falling away behind it; glyphs are mirrored half-width katakana and mutate in place. Colour is
   still entirely from the palette (`fg` lead, `a1` body), so it recolours like everything else.
5. **"Breathing" does something.** The prototype stores the toggle and defines a `v-breathe`
   keyframe, but never attaches it, so the control is inert. It now drives the vignette at the
   valve's 4.6s rhythm — no reflow, no text resampling, no scrollbar from a scaled column.
6. **Contact's primary CTA reveals the address** instead of navigating to the page it is already on,
   where the prototype leaves it doing nothing. Contact is the one page with a job.
7. **The hero ornament is a setting, not a fixture** (`src/data/ornaments.ts`). The spec ships only
   the valve, and the client's objection to it was specific and right: `v-dilate` scales the rings
   as well as brightening them, so the whole assembly physically pumps and reads as a speaker cone.
   There are now seven — **Lens** (the default: a recessed eye where the geometry is dead still and
   only the light moves), Valve (unchanged), Aperture, Orrery, None, and (2026-08-13) the two
   **lightsword duels** from `docs/DUEL.md`, the only canvas ornament
   (`src/components/DuelOrnament.tsx`) — pickable in siteconfig, rollable under a sixth `ornament`
   scope, and carried as a sixth share-code field. All seven sit in one square slot (`.v-ornament`),
   so the layouts that resize it and the ones that hide it need no knowledge of which is showing,
   and Radial's orbiting nav pills work over any of them. The duels' `FX` background entries were
   re-listed on 2026-08-14, so the fight now has both homes the client asked for.

   Two consequences worth knowing: `SCOPES` now has six entries, not the spec's five; and share
   codes are six fields, with five-field codes still decoding and simply leaving the ornament alone.
   The siteconfig panel therefore has an **Ornament** section the spec's list does not mention.
8. **The hero vitals strip is removed**, at the client's request (`fa95fba`, 2026-08-12). The
   palette name, layout name, effect name and `pulse 47 bpm` were a readout of state nobody asked
   to see — *show the layout, do not caption it.* The 404's `pressure lost` variant and the
   ` · adapted` suffix went with it; see the adapted-layouts trap above for what that costs.
   `docs/DECISIONS.md` has the full note.
9. **The duel blades are literal colours** (client request, 2026-08-13): the good side fights in
   blue/green (`hooded` blue, `haloed` green) and the evil side in red, in **every** palette —
   `BLADE_COLORS` in `src/fx/duel.ts`. This is the one deliberate exception to "no component
   should contain a literal colour"; everything else in the duel scene (bodies, sparks, ground,
   blade cores, health-bar tracks) still reads the live palette and recolours with the bleed. The
   same day the four silhouettes were upgraded to read unmistakably — hair/halo/aura/robe,
   curved horns/bat wing/spade tail, hood/belt/tunic, dome helmet/chest panel/floor cape — with
   every non-blade colour still palette-supplied.

   **The figures are stick figures, and the fight has a choreographer**
   (2026-08-14, after the client saw the skeleton version: "looks like a
   one-handed sword fight… this is pathetic", "they are holding shields. you
   ever see a jedi with a shield?", and then the decisive one — "im fine with
   stick figures as long as the fights are decent").

   **The shields were the costumes.** A 30px filled torso quad, a filled head
   block and a filled robe/cape/tunic/aura behind it composited into one pale
   slab about as wide as the figure was tall, and every style added *more*
   filled geometry to the same place. The body is a stroked stick figure now
   and the whole costume is one mark on the head — at the size these render,
   the head is the only place a silhouette difference survives. **Both hands
   are on the grip** unless an arm is pushing or balancing a kick; that single
   change is most of what makes a silhouette read as a swordsman rather than as
   a figure carrying a stick.

   **Fighters decide nothing.** `decide()` used to run once per fighter,
   independently — and two independent randomisers cannot produce action and
   reaction, which is what a fight *is*. Nothing was ever blocked and nothing
   ever bounced off anything. A director now picks a `Sequence` (a script of
   beats), assigns the two roles by a coin flip, and hands each fighter a move
   on a scripted frame; blade motion comes from keyframe tables rather than
   hand-written easing per action. Three rules here are load-bearing:

   - **No sequence names a side.** Every beat is `ATT` or `DEF`, and the role
     coin consults nothing — not health, not position, not who won last. That
     is the fairness guarantee, and it is why an early lucky roll cannot
     compound. Step order is also a coin: `st.a` always stepping first meant
     that when both were due to land a lethal blow on the same frame, the left
     fighter always won, because `damage()` sets `st.over` and a dead fighter's
     step returns immediately.
   - **Nothing waits on a condition.** Sequences have fixed lengths and the
     director advances unconditionally; the blade lock's duration is rolled
     when it *starts*. The match-reset loop has no timeout, so a beat that
     could block would hang the effect — the same hazard that got a reactive
     block declined here originally.
   - **`dist` is still the sole authority on whether a blow lands.** Sparks
     come off the true blade-to-blade crossing, but gating *damage* on blade
     geometry would make misses routine, stop health draining, and hang that
     same loop.

   Tempo is the opposite of what "slow it down" sounds like: strikes got
   *faster* (4–6 frames for a whole arc) and moves got *longer*, with a dead
   hold at the top of every wind-up and 20–40 frames of stillness between
   exchanges. A fight reads through the contrast between stillness and
   explosion, and the old one had no frame in which nothing happened.

   **Four things in the fight are load-bearing and were each a shipped bug
   until 2026-08-14 (later)** — the session that watched it frame by frame.
   `docs/DECISIONS.md` has the measurements.

   - **`st.dir.pressure` resets on match reset, and that is what makes the
     anti-stall rail per-match.** It counts sequences; above 22 `chooseSequence`
     strips the pool to sequences containing a `hit`. Nothing cleared it, so it
     was monotonic for the life of the page and **98.6% of all sequence picks
     were made under the rail** — the emergency mode was the normal mode about
     forty seconds after load. Four sequences fired twice an hour, `standoff`
     never fired again after the opening match, and `disengage` took 30% of
     every exchange because `any` range puts it in all three shrunken pools.
     The rail's own comment says "a normal match never reaches it"; that is only
     true with the reset.
   - **`bladeGap`'s second solve uses `vw`, not `uw`.** Re-solving segment `b`
     against a clamped `s` is `((w + s·u)·v)/(v·v)`. With `uw` it reported
     segments that provably cross as 16 units apart and returned `r = 0` for
     every configuration. It is the routine behind the blade-on-blade shower,
     which tests `near.d < 9` — so crossing blades often threw no sparks at all.
     A geometry bug that presents as an art problem.
   - **The body separation is grounded-only, and the exemption is `flip_over`.**
     Two 30-unit bodies overlapped on 3.9% of frames with no constraint but the
     arena walls. The resolve is soft and positional (a third of the overlap per
     frame, velocity untouched, because velocity is the choreography's) and it
     must never apply in the air: the somersault's whole job is to pass over the
     opponent and swap the sides.
   - **`the-lock` closes the pair to `LOCK_SEP` itself.** `close` range is under
     132 units, which is nowhere near close enough for two 58-unit blades to
     meet — measured over 51 locks they averaged 30.8 apart. The ease is
     *signed*, because arriving from a parry can land them inside the distance,
     which crosses the blades at the hilts. The press's winner is `beatPower`
     from the beat (1 drives, 0 gives ground), so the outcome is fixed by the
     same role coin as everything else and the renderer never reads `dir`.
     Nothing in `stepLock` consults a condition or can extend the move, which is
     what keeps the timeout-free match-reset loop safe.

   **One fight at a time, enforced in two places on purpose** (2026-08-15, client: "when in
   landscape mode on mobile, there are two fights going at the same time"). The duel has two homes
   and both are wanted; both *at once* runs two independent matches with different fighters and
   different winners a few inches apart. A guardrail stops the randomiser choosing the pair — which
   is what fixed the live site, since it publishes `mode: "visit"` and re-rolls every visit — and
   `Ornament.tsx` refuses to render the second one, because a roll is only one of four ways config
   arrives (publish, share code and storage are the others, and a share code carries the effect and
   the ornament as independent fields). **The ornament yields, and it yields to `DEFAULT_ORNAMENT`
   rather than to `null`**: five taps on this element reveal the footer's sign-in link, which on the
   phone band is the only findable route to an account, so emptying the slot would remove it for a
   reason the visitor could not see. Landscape is where it was noticed, not where it started —
   measured at 844×420 the stage is 269px tall, the ornament a 240px slot 55px down, and the
   background fight's feet land at 215px, so the two collide; at 400×700 they are 200px apart and
   the background one is half the size.

   **The ornament has a camera; the background does not** (2026-08-14, later,
   client-approved). `DuelOrnament` used to draw at `scale = w / WORLD_W`, so
   the whole 700-unit arena was mapped across a square slot that is 340px on
   desk and **190 on a phone** — a fighter rendered ~20px tall in a box that was
   mostly empty air. A fixed crop cannot fix it, because the pair genuinely use
   the arena's full width. `duelCamera` tracks the midpoint and fits the pair,
   clamped to 1.45–2.9 and eased; the median figure is now ~61px at 190px and
   ~109px at 340px. Three parts of it are load-bearing:

   - **`duelFocus` reports where a rising fighter is *going*, not where it is.**
     A jump is a projectile under constant gravity, so the apex is `v²/2g` above
     the current height and known on the frame the impulse fires. Reporting the
     current height instead looks correct and is not: the somersault rises ~145
     units in ~22 frames, no eased zoom covers that from a standing start, and
     the jumper left through the top of the slot on ~1 frame in 200. With the
     prediction, measured clipping is **zero**.
   - **The zoom is asymmetric** — out fast (0.13), in slow (0.03). Pulling back
     is a correction that must arrive before the thing it is correcting for;
     pushing in is a choice, and a fast choice reads as a mistake. The high
     `CAM_MAX` is only safe because of it.
   - **A match reset is a cut, not a pan.** The fighters teleport back to their
     marks, and eased that whipped the camera 43px in one frame. The component
     nulls `cam` on `st.matches` changing, which makes the next frame snap.

   `duelCamera` is **exported and pure** for a reason that is about this
   environment rather than about design: animation cannot be observed here, so
   the only way to check a camera is to step it over thousands of frames in a
   bench. Re-implemented in the bench, the bench would only confirm the bench.

   **Attract mode is gone** (client: "make sure the screensaver battles are the
   same graphics as the nonscreensaver ones"), kept at the *background*
   presentation because that is the direction with a hard constraint — body
   copy has to read through it. **Health bars are ornament-only**: in the
   ornament the fight is the subject and a HUD frame belongs; full-bleed behind
   copy they are a readout the reader must look past.

10. **All visible "vessel" branding is gone** (client request, 2026-08-13). The wordmark, page
   titles, termbar, TOTP issuer and passkey rp name now read `mcclevarty.ca`; the "Vessels"
   effect *label* is "Branches"; the favicon is an inline SVG data: URI (the finger, offered to
   a small four-pane window — the client's choice, and still no image file). **Internal
   identifiers deliberately keep the old name** — the `.vessel` CSS class, `vessel.*` storage
   keys, the `__Host-vessel_session` cookie, the `vessel/…` HKDF info strings, the Worker/D1
   names and the effect id `vessels` — because renaming them breaks live sessions, stored
   config, key derivation or share codes for zero visible change. Do not "finish the job".
11. **The photo slots hold placeholder photographs** (client request, 2026-08-13):
   `public/photos/*.jpg`, all Wikimedia Commons public-domain/CC0 (ledger with sources in
   `docs/PHOTOS.md` — keep it in sync if any are swapped), re-encoded to strip EXIF so the
   gallery's "EXIF stripped" line stays true, and rendered desaturated under the tile chrome
   (`.v-tile-img`, `chrome.css`) so the palettes stay in charge. Temporary until the operator's
   own photos exist; the spec's *no images* rule still holds for design assets — these fill
   slots that were always destined for photographs.
12. **The contact sheet duotones its photographs, in every mode including calm** (2026-08-14). Full
   greyscale plus an `--a1` field at `mix-blend-mode: color` at 22% — the placeholder photographs
   were the one element on the site that did not recolour with the palette. `calm` does not strip
   `mix-blend-mode`, so its behaviour there is a decision, and the decision is that **calm tints
   identically: there is deliberately no `.is-calm` override.** Calm exists so body copy holds up on
   the low-contrast palettes; a photograph is not body copy, the caption sits above the blend so no
   text is ever blended, and calm changes no other palette value — so a photograph that changed
   colour on toggling it would be the odd one out. It shipped at a halved `0.1` for one day; that
   was measured and deleted, because over a tile image already at `opacity: 0.8` on a dark card a
   10% blend is indistinguishable from none, which made it a special case defending nothing.
   Checked at 22% against all twenty-five palettes' `--a1`.
13. **There are fourteen layouts, twenty-five palettes and sixteen effects** (2026-08-14, from the
   approved HUD proposal). The additions: the `hud` archetype at layout index 13, the Cold Open
   palette at index 24, and `scan` / `telemetry` at effect indices 14 and 15. All appended, never
   inserted.

   `hud` is the only archetype that is not a grid, a column or a track: blocks sit on three z-planes
   and physically overlap, and the near plane's `backdrop-filter` blurs the plane behind it. That
   occlusion is the point — scale and shadow only imply depth. `TABLET_LAYOUTS` maps it to
   **Cinematic, not Mosaic**: `adaptLayout` is a single lookup and does not chain, so mapping to a
   layout that itself collapses on that band would render real six-column Mosaic at 700px.

   Cold Open is the first palette not from the prototype, and the only one designed against a
   *role*: `a3` is already the site's danger token (`.v-btn-danger`, the account error border), so
   there it is the alarm colour and the only warm thing on screen.

14. **Six self-hosted webfonts, at the client's request** (2026-08-14: "pls have the fanciest,
   coolest, futuristic, yet all readable fonts you can. download them if needed. permission granted
   for that"). This is a deliberate exception to `SPEC.md` § *Assets*, granted explicitly.

   The problem was real and measurable: the five typesets were the prototype's macOS-first stacks,
   and on Windows `grotesk`, `mixed`'s body and `condensed` all fell through to **Arial** — three of
   five typesets rendering identically, which is exactly what the client reported ("a lot of the
   fonts are the same. the typical, basic font").

   `public/fonts/` holds six latin-subset **variable** woff2 files (Space Grotesk, Playfair Display,
   Literata, Sora, JetBrains Mono, Oswald), declared in `src/styles/fonts.css`, **178KB total**.
   Self-hosted, not from a CDN: the live CSP is `default-src 'self'` with no `font-src`, so a
   gstatic URL would simply be refused in production. Weight axes are clipped to the ranges actually
   used, which saved 37KB — `docs/FONTS.md` records the ledger so a re-download does not silently
   re-fatten them. All six are SIL OFL 1.1.

   Each typeset pairs the webfont with a **platform-picked** system fallback (Segoe UI Variable /
   SF Pro / Cantarell, and so on) rather than one macOS-first list, because that tail is what renders
   during `swap` and permanently if a file ever 404s — fixing the Windows collapse in the fallback
   too, not just papering over it with downloads. `TypeSet` also gained `displayWeight`, `bodyWeight`
   and `tracking`: there were **two** `font-weight` declarations in the entire stylesheet set before
   this, so every heading was the user-agent's `bold` in all five typesets, which was a large part of
   why they read as one. Verified live 2026-08-14: all six serve 200 and `document.fonts` reports the
   used faces loaded.

## Copy changes, approved by the client

The home page's third block (`kicker: "the site"` in `src/data/pages.ts`) is **no longer the
prototype's**. It was corrected from v1's stale counts on 2026-08-13, then **replaced outright
the same day at the client's request**: the option-count list ("24 colour palettes", "13 layout
archetypes"…) was a spec sheet for switches visitors cannot flip. It is now jokes in the site's
voice ("Dangerously over-engineered" / "No AI, just a guy"). Do not restore the counts.

The two palette *gags* stay: changelog v2.4 ("Added six palettes nobody will pick") and the
404's "consolation" block ("Have a palette instead") are jokes, not spec sheets, and the client
kept them.

**`/setup` is a whole new page of new copy** (2026-08-14, TODO 9, client-approved scope and text):
remote access *before a callout* — Windows Quick Assist first because it needs no install and ends
when the window closes, Tailscale as the standing option for machines the operator is in
repeatedly, and a scam-awareness block, because a page telling people to install remote-access
software is exactly the page a scammer wants them to have read. It is a **footer** page beside Now
and Changelog, deliberately not a seventh nav pill: the six are a settled design, and `NAV` is what
`useOperatorRoutes` cycles and Radial's orbit renders. Tailscale is named in prose, not linked —
the site has no outbound links anywhere.

**The 404's count moved with it: "eight other pages" → "nine".** The counts on that page are jokes
that depend on being true, which is why the client kept them, so leaving the old number would have
been the change rather than correcting it. **If another content page is ever added, this number
moves again.** The 404's other counts — "six ways into a panel", "5 type systems" — remain correct
and verbatim, and its four-item example list was not touched.

**The home page's "the rate" block was replaced 2026-08-14**, at the client's word: *"i dont do
free diag. a mechanic will still charge you to diagnose your cars issues."* It read "Free diagnosis,
always" and promised "you pay nothing", neither of which was true of the business — a false promise
on the block that sends people to Contact. It now says diagnosis is not free and names no fee,
because none was given. Contact's "Three steps" lost the same promise the same day: step three was
*"Fixed, or you pay nothing"* and is now *"You say go, and I get on with it"* — the step that
actually happens, rather than a replacement guarantee. **Nothing in either block promises anything
the client has not said**, and neither names a fee. *"Rough quote back, free"* is deliberately
untouched and still true: a rough estimate from an emailed description is not a diagnosis, and it is
the one thing in the flow that genuinely costs nothing. **A diagnostic fee is still unnamed on the
site by choice** — the copy is written to stay true at any price, so setting one is a client
decision and not a copy change (`TODO.md` sign-off 9).

**Nothing on the site advertises the site** (2026-08-14, client: "get rid of anything to do with
color palettes, features about my site like different layouts, or hidden sections, or ANYTHING that
isnt relevant to everyone but me… i want people to find it out by being ON the site", clarified as
"panels that say about palettes, and about features, and about pages they cant see"). Gone with
that: home's whole `kicker: "the site"` block (its best line folded into "the honesty"), the 404's
"Have a palette instead" consolation, the changelog's palette inventory, and its shuffle,
calm-mode and screensaver entries. **The two palette gags are no longer protected** — the earlier
note here defended them as jokes rather than spec sheets, which was defensible and is not the
client's reading: a joke that works by reciting an inventory is still reciting the inventory. The
404's page list stays, because those are page *names* — navigation, not a spec sheet.

**Tile slot captions are off by default** and behind an operator toggle (`Config.slots`, bit 32).
"4:5 · photo slot" and "video · muted loop" are production notes: an aspect ratio and a slot type,
printed for a visitor who did not commission the layout and cannot change it. Kept as a setting
rather than deleted because they say what each slot is *for*, which is useful while the real
photographs are still going in.

**"Calm" is labelled "Plain" in the interface, and only in the interface** (2026-08-14, client:
"people won't know what that means"). `config.calm`, `.is-calm`, `vessel.calm.v1` and share-code
bit 8 all keep the old name — renaming them breaks stored preferences and codes in circulation for
zero visible gain, exactly as the de-branding decided for `.vessel` and the storage keys.

**The verbatim-only rule is retired (2026-08-15).** The client's instruction: *"make this whole
site's text content understandable by the non tech-savvy… my mum said what the fuck does this all
mean, and my grandma would know even less."* Home, About, Work, Gallery, Contact, Now, Guestbook,
the 404 and the greeting dialog were rewritten for comprehension. `scams` and `setup` are still
pending that pass.

**What the rewrite was and was not.** It was not a reading-level problem — measured across all 86
body blocks the mean Flesch–Kincaid grade was **5.0** and there was not one dictionary jargon word.
The copy was *allusive*: it said things sideways and left the reader to land them. "Built like a
flight simulator, used like a business card", "assembled in your browser so the scrapers don't get
it", "Two cold joints", "array resilvering", "/var/www/whatever_you_wanted → exists = false". Every
one of those is short, plain-worded and meaningless to the person the site is for. So the fix is
never "use simpler words" — it is **name the thing, then make the joke about it**.

**The voice is not the problem and must survive.** *The self-deprecating copy is still the point*
— "This website is far more elaborate than the job actually needs, which should tell you where the
spare time goes" is the rewritten version of the flight-simulator line, and it is doing the same
work in the same register. Rewriting toward "professional" would be the actual failure. Every
product rule above still holds: no city named, no form anywhere, the email still assembled at
runtime, nothing advertising the site.

**The pricing block states which way the $150 goes, and that is the load-bearing part.** "$150
before anything starts, then $120 an hour from there" is truthful and can be read as either a
deposit against the hourly or a charge on top of it — and the wrong reading becomes an argument
when the invoice arrives. It now says *"it is not a deposit and it does not come off the hourly
rate"* in as many words. The two numbers are the client's own and must not be changed here; the
plumber/electrician comparison is theirs too and does the explaining a paragraph would otherwise
have to.

## Accounts — the invariants

`design/SPEC-ACCOUNTS.md` is approved and authoritative. Read it before touching any of this. §12
is a decision log: every rejected option keeps its reasoning and carries a *"revisit if"*
condition. Add to it rather than relitigating.

The design decisions most likely to be broken by someone who has not read it:

- **Sign-in is password + TOTP, with passkeys retained** as an alternative credential. **No email
  is collected**, and the operator can reset any password — which is what makes email unnecessary.
- **Key slots (§5) are the load-bearing idea.** One grant keypair per account, wrapped once per
  credential, LUKS-style. Any credential opens the same key. This is why operator reset is safe: it
  deletes the password slot and cannot open it. **Operator escrow is rejected permanently** — a slot
  wrapped to an operator key would let the operator sign grants in a user's name, which is the exact
  thing the design exists to prevent.
- **The password never reaches the server.** The browser runs PBKDF2 and sends a derived auth secret;
  the Worker stores only an HMAC of that under a pepper. Do not "simplify" this into a server-side
  hash — it also dodges the Worker CPU cap, and the browser must derive a password key anyway to open
  its key slot.
- **No personal data, and §9 has the full inventory** so the claim can be checked. Three fields were
  removed on 2026-08-12 for carrying personal data nobody chose to collect: `drives.root_path` (held
  `C:\Users\Patrick\Documents`), hostnames as machine names, and raw IPs in rate limiting. Absolute
  paths now live only in the sharing tab; grants scope by relative subpath. **Adding anything to that
  inventory is a spec change, not an implementation detail.**
- **Phases 1/2/3 must not be collapsed** — phase 2 fails as "my files don't load", phase 3 as "a
  stranger read my files."
- **Authentication works end to end before any interface work starts.** Building the command palette
  on a sign-in that does not work is how the fun part ships and the load-bearing part does not.
- Real auth **must not reuse the operator door's UI** (`SPEC.md` §Security). The door stays theatre.

### Where the code is

- `migrations/` — `0001` phase 1 tables, `0002` TOTP replay, `0003` site config, `0004` phase-2
  machines and drives. **Grants and invites remain deliberately absent**: an empty `grants` table
  is an invitation to fill it before the phase that hardens it (phase 3).
- `worker/index.ts` — serves the static site via the assets binding; `/api/*` is the exception.
  Delete every route and the site serves as it does today, which is what "accounts are strictly
  additive" has to mean.
- `worker/accounts.ts` — signup, challenge, sign-in, the TOTP second factor, sessions, key slots,
  change/set password. `worker/session.ts`, `worker/totp.ts`, `worker/crypto.ts` are its primitives;
  `worker/admin.ts` is the operator surface; `worker/site-config.ts` the published appearance.
- `worker/rate-limit.ts` — the `RateLimiter` Durable Object. Counts failures only, resets on
  success, exponential backoff to a **one-hour ceiling**; the ceiling stops an attack on a known
  handle from becoming an indefinite lockout of its owner. Never sees an IP.
- `worker/machines.ts` — phase 2's server half: pairing (a **password ceremony** via
  `assertPassword` — §12 L), machine/drive CRUD. The server stores public keys and labels only;
  no path, no hostname (§9).
- `worker/signal.ts` — the `MachineSignal` Durable Object, one per paired machine. **An
  introducer, not a pipe**: relays SDP/ICE without reading payloads, persists nothing, and all
  authentication happens in `signalUpgrade` (`worker/index.ts`) *before* the object is reached.
  The upgrade path bypasses `harden()` deliberately — copying a 101 response drops its
  `webSocket` and hangs every connection.
- `src/share/` — the browser half of phase 2: `handshake.ts` (signed DTLS fingerprints, both
  roles), `paths.ts` (the §12 S array-of-components validator — the one place worth a dedicated
  test suite, and the harness drives it), `agent.ts` (the `/share` tab's file server),
  `browse.ts` (the verified connector), `store.ts` (IndexedDB: machine key, trust root,
  directory handles — all treated as evictable, §12 O), `unlock.ts` (the §12 K
  password-unwrap-per-connect; deliberately not `flows.openGrantKey`, which guards the phase-3
  signing gesture and demands TOTP).
- `src/auth/` — the browser half: `derive.ts` (PBKDF2 → HKDF split into an auth secret and a
  wrapping key), `grantKey.ts` (the P-256 grant key and its AES-KW slots), `recoveryCodes.ts`,
  `api.ts`, `flows.ts`, `passkeys.ts` (WebAuthn flows behind an injectable `Authenticator` seam),
  `SessionContext.tsx`.
- `worker/webauthn.ts` — the hand-rolled CBOR subset and ES256 verification §1 budgeted;
  `worker/passkeys.ts` — the passkey routes. `scripts/webauthn-sim.ts` is the harness's software
  authenticator: it *encodes* the CBOR/DER the Worker *decodes*, independently, as a second
  opinion.
- `scripts/auth-e2e.ts` — the harness. It imports the real `src/auth` modules — including
  `flows.ts` and `api.ts`, driven through a fetch shim that intercepts **only relative URLs**, so
  the raw `Client`'s cookie isolation survives — so it fails if browser and Worker ever disagree
  about a byte, and it computes TOTP codes independently from RFC 6238 rather than calling
  `worker/totp.ts`. Its `d1()` helper shells out to wrangler **asynchronously on purpose**: a
  blocking `execSync` stops undici noticing closed keep-alive sockets and the next fetch dies with
  a phantom "could not reach the server". Its last section exercises the `RateLimiter`'s backoff
  path.

### Things that are decisions, and are easy to "fix" back into bugs

- **`recordSuccess` resets the account bucket and only *decays* the client bucket** by one
  (`rate-limit.ts` `/succeed`). Wiping the client bucket on success hands an attacker a free reset:
  sign in to an account you own, and the counter recording your failures against everyone else's
  goes to zero. Client allowance is 50 and account allowance 5 because one address is a household
  behind NAT and five would lock out a café over one typo. **Signup has a third bucket**
  (`signup:`, allowance 12 — 2026-08-13 audit): the client bucket alone let one address mint fifty
  accounts per window. Twelve is sized just above the e2e harness's eight signups per run — shrink
  it and the harness locks itself out.
- **Rate limiting reserves and checks in one round-trip** (`assertAttempt` → `/attempt`). `/check`
  then `/fail` was two, so N concurrent sign-ins all passed the check before any failure landed.
  **`challenge` deliberately stays on `/check`**: asking for a salt is not a failable attempt, and
  counting it would let anyone lock an owner out. **`signup` was still on `/check` until 2026-08-14**
  — the same race, on the one route that *creates* rows: 500 concurrent signups all passed against
  an allowance of twelve. It reserves now, and its two trailing `recordFailure` calls went with the
  move, so the cost stays one unit per signup. `challenge` is the only exception left; if you add a
  route that consumes an allowance, it reserves.
- **The rate limiting lives inside `assertPassword`, not in its callers.** Two callers had none and
  left an unthrottled online password oracle usable by anyone holding a session obtained *without*
  the password. Putting the counting inside the check means a future caller cannot forget it.
- **`challenge`'s decoy reports `DEFAULT_ITERATIONS`, the real constant.** A varied decoy was the
  tell, not the disguise — see `docs/DECISIONS.md`. When real iteration counts start varying,
  sample the decoy from the same distribution.
- **`challenge` takes the salt from any credential that has one**, preferring the password row for
  its iteration count. Keyed on `kind = 'password'` it dropped an operator-reset account through to
  the decoy branch and handed back a fabricated salt, turning a working recovery code into a wrong
  one. This is what makes operator password reset safe to build.
- **A redeemed recovery code returns its key slot in the sign-in response**, and the slot row is
  *kept*, not deleted. The wrapping key exists only for that request — the code is spent — so a slot
  not handed back is a grant key sealed for ever, which would quietly make §5's "preserves grant
  authority in full" false. `signInWithRecoveryCode` unwraps it before returning.
- **A recovery code is not marked used until the sign-in completes.** With two-factor on, the ticket
  carries the pending credential id. Spending it earlier would burn one of ten codes per abandoned
  attempt, for the person recovery exists for.
- **Authorisation for set-password is a ticket, not the session.** A session says who you are, never
  how you proved it. Gated on the session alone, a stolen cookie would become permanent takeover.
  `set-password` is minted only inside `completeSignIn`, only on the recovery path, only after the
  last factor.
- **That ticket is single-use on the server, not just in the client.** Its subject carries the
  redeemed recovery credential and `setPassword` requires that credential's key slot to still
  exist; the write batch deletes it. Clearing the ticket in `flows.ts` is a courtesy, not the
  enforcement — for fifteen minutes it was the only thing standing there.
- **Change-password reuses the salt.** Recovery codes derive against the password's salt, so rolling
  it would silently kill all ten.
- **A passkey sign-in has no TOTP stage, and no rate limiting.** User verification is the
  passkey's second factor (§3's stolen-laptop row; `verifyAssertion` refuses an assertion without
  the UV flag, so it is enforced) and §4 says passkeys need no rate limiting — a failed attempt
  means forging a P-256 signature. Adding a TOTP stage here would back a stronger factor with a
  weaker one. `docs/DECISIONS.md` 2026-08-13.
- **A `prf`-less authenticator registers a passkey with no key slot**, deliberately (§5: "the
  fallback is a missing slot rather than a different design"). It signs in and can never open the
  grant key, and the screen says so. Do not "fix" this by wrapping the slot to something the
  server holds — that is escrow.
- **Removing a passkey is refused when its slot is the account's last openable one** — same line
  as reset's second refusal: deleting the last openable slot is account destruction under a
  milder name. Spent recovery codes' slots do not count as openable.
- **The WebAuthn challenge tokens are stateless** (two `TokenPurpose`s in `worker/session.ts`);
  a replayed registration is refused by the credential-id uniqueness index, not by a challenge
  table. Do not add one.
- **Set-password re-wraps; it does not unwrap.** `unwrapSlot` returns a deliberately
  **non-extractable** key, which cannot be wrapped into a new slot, so the flow goes
  ciphertext-to-ciphertext through `rewrapSlot`. Calling `unwrapSlot` here typechecks and fails at
  runtime.
- **The browser refuses implausible KDF parameters** (`checkIterations` in `src/auth/derive.ts`,
  2026-08-13 review). Every consumer of `challenge`'s response floors the iteration count at the
  constant its credential kind has always used and caps it at 10M — otherwise anything that could
  forge that one response could say `iterations: 1` and silently strip the whole stretch. Refuse,
  never clamp: a "corrected" count derives a secret the server does not hold. If the default ever
  rises, the floor stays at the oldest count ever deployed.
- **Passwords are NFKC-normalised before PBKDF2** (same review; NIST 800-63B). Composed and
  decomposed non-ASCII must derive identically across platforms — there is no email reset behind
  a mismatch. A no-op for ASCII, so recovery codes are untouched.
- **The last-way-in guards live in the writes' own `WHERE` clauses**, not in a check before them
  (`passkeys.remove`, `admin.resetPassword`, `admin.setOperator`'s demotion, `totpEnrol`'s
  upsert; 2026-08-13 review). Check-then-act versions let two concurrent requests each count the
  other as "another way in" and destroy the invariant the refusal promises — sealed grant key,
  zero operators, a confirmed TOTP's secret replaced under it. Zero `meta.changes` is the refusal;
  the audit row is written only after it, so it can never record an act the guard declined. Do
  not "simplify" these back into a pre-check plus an unconditional write.
- **An SDP must carry exactly one distinct DTLS fingerprint, and `fingerprintFromSdp` refuses
  otherwise** (2026-08-14). It matched only the *first* `a=fingerprint` line and said nothing about
  the rest, while the whole unmodified SDP went to `setRemoteDescription` — and RFC 8122 §5 lets a
  media-level fingerprint override a session-level one. A hostile signalling service, which is in
  scope, could prepend the owner's genuine fingerprint to its own SDP, pass verification against a
  value DTLS then ignored, and read every byte without forging a signature. **Do not "simplify" it
  back to a single match, and do not make it pick a winner** — identical repeats are allowed because
  a bundled SDP restates the same fingerprint per m-section; disagreement is refused.
- **The agent verifies peers itself; it never trusts the signalling introduction** (§12 K,
  phase 2). A browsing tab proves possession of the grant key by signing its DTLS fingerprint;
  the agent checks it against the trust root **stored at pair time in IndexedDB and never
  re-fetched** — re-fetching would let a later server compromise quietly re-root a paired agent.
  Symmetrically the browser verifies the agent's signed fingerprint against
  `machines.agent_pubkey`. "Simplify" either check away and §3's first row (the operator cannot
  read files) becomes false.
- **Pairing and re-keying demand the password** (`assertPassword` — §12 L); rename, remove and
  the drive routes are session-gated because those rows carry labels, not authority.
- **File paths travel as arrays of components, never strings** (§12 S, `src/share/paths.ts`).
  The agent walks handles component by component; there is no parser to have a traversal bug in.
  Refuse, never repair.
- **One agent socket per machine; a newcomer replaces the incumbent**, which is sent `replaced`
  (§12 M). The frame is the contract — local workerd delivers the server-side close lazily, so
  nothing may depend on the close code reaching the replaced tab.
- **STUN only; no TURN** until the client approves the spend (§12 P). A hard-NAT pair fails with
  an honest message, not silently.
- **The harness imports `ws`** (a devDependency, marked `--external` in the `test:auth` esbuild
  step) because Node's built-in WebSocket cannot send a cookie header and the signalling socket
  authenticates by cookie. The runtime constraint — no third-party libraries — is about the
  site, and the site gained nothing.

### Four things the client has not yet signed off

Found while building; none are blocking. Listed in `TODO.md`; the reasoning is here.

1. **`totp.last_step`** (`migrations/0002_totp_replay.sql`) is a field §9's inventory does not list,
   and §9 says adding one is a spec change. It stores the 30-second window of the last successful
   second factor — coarser than `credentials.last_used_at`, which the inventory already covers. It
   exists because without it a TOTP code is replayable for up to 90 seconds. Recommend approving.
2. **§3's operator row is stronger than the design supports.** The Worker sees the raw `authSecret`
   on every sign-in and holds the account's salt and iteration count, so an operator who logged one
   sign-in could grind candidate passwords offline, re-derive the wrapping key, and open the key
   slot from their own D1. The cryptography is fine — the *unconditional* wording is not.
3. **`⌘K` is claimed twice.** `SPEC.md` makes it the operator door's sixth unlock route;
   `SPEC-ACCOUNTS.md` §10 makes it the command palette. Both cannot be true.
4. **Signup discloses handle availability** (409) while `challenge` goes to real trouble to hide it.
   Defensible — availability is inherently public — but the two should not disagree.

## Deployment

Served by a **Cloudflare Worker with static assets** (`wrangler.toml`), not Pages. Pages cannot
define Durable Object classes and this stack needs them twice — rate limiting now, one signalling
object per paired machine in phase 2. The cutover completed 2026-08-12; `docs/DECISIONS.md` has
the story and the rollback.

Rules, each of which cost something to learn:

- **Deploy with `npm run deploy`, never bare `wrangler deploy`.** `predeploy` typechecks *and*
  strips `dist/_redirects`, which Workers static assets otherwise parses as *configuration* and
  rejects as an infinite loop; the deploy fails outright at the API call. The typecheck is not
  redundant with `npm run build`: `wrangler deploy` bundles `worker/` with esbuild, which strips
  types without checking them, so a Worker type error could otherwise reach production.
- **`public/_redirects` stays** until the Pages project is deliberately retired. Pages still
  auto-deploys from `main` and is the rollback. `.assetsignore` does not help — validation happens
  before the upload list is filtered.
- **`public/_headers` stays and is *not* stripped.** Unlike `_redirects` it is valid for both hosts,
  and it is the only thing giving `/assets/*` its `nosniff` — see the next bullet. Do not
  generalise "strip the config files at deploy" from `_redirects` to this one.
- **The Worker's SPA fallback is `not_found_handling`**, not `_redirects`.
- **`run_worker_first = ["/*", "!/assets/*"]`** is what lets the Worker inline the published site
  config into HTML. By default a request matching a real file never invokes the Worker, so `/`
  (which *is* index.html) silently got no injection while `/contact` did. The negation keeps the
  hashed bundles on the fast path — and means `/assets/*` responses never pass through `harden()`,
  which is why their headers come from `public/_headers` instead.
- **`workers.dev` is disabled**, since `workers_dev` defaults to false once a route exists. Wanted:
  it closes the signup endpoint that was publicly reachable before cutover. Set `workers_dev = true`
  if you need a non-production URL back, knowing that reopens it.
- **`[dev] upstream_protocol = "https"`** is load-bearing for local development, not cosmetic. See
  `docs/HANDOFF.md`.
- **Give a fresh deploy a few seconds** before testing routes; asset manifests propagate.

### HTTPS and headers

HTTPS is forced in `worker/index.ts` and `Strict-Transport-Security`, `x-content-type-options`,
`referrer-policy` and `x-frame-options` are set on page responses.

**`URL.protocol = "https:"` silently does nothing in workerd.** The redirect URL is built by
concatenation **and** compared against the request before being sent, so the worst case is "no
redirect happens" rather than an infinite loop. Keep that guard. Loopback is exempt or
`wrangler dev` and `npm run test:auth` break.

**A state-changing request whose `Origin` is present and is not ours is refused** (`crossOrigin` in
`worker/index.ts`). This is defence in depth — `SameSite=Lax` is what actually stops a cross-site
POST — covering the two places Lax does not reach: Chromium's two-minute grace on a freshly set
cookie, and same-site subdomains, which `design/GUIDE-SUBDOMAINS.md` would create. **A missing
`Origin` is allowed deliberately**: same-origin GETs and non-browser clients omit it, and
`scripts/auth-e2e.ts` is one of those. Do not tighten that to "require an Origin" without fixing
the harness first.

**The CSP is report-only, deliberately** (2026-08-14). The nonce is minted per request in
`worker/index.ts`, stamped on the inlined site-config script by `withSiteConfig`, and named by
`cspPolicy` — the plumbing that made a real `script-src` possible. Report-only is stage one, not
cowardice: the policy cannot blank anything, and violations arrive at `/api/csp-report` (visible
in `wrangler tail`, written nowhere — §9 gains no field). **Flipping to enforcing is one header
rename in `harden`**, after production runs quiet through what the harness cannot drive: a passkey
ceremony, a phase-2 browse, TOTP enrolment, each effect. `style-src 'unsafe-inline'` is deliberate
— the theming *is* style attributes, and `style-src-attr` would blank old Safari (the comment on
`cspPolicy` has the full reasoning). Do not add a report *store*; the log line is the product.

**`blob:` is deliberately absent from the policy**, and one line depends on that staying understood:
`saveBlob` in `MachinesPage.tsx` downloads a file through `<a href="blob:…" download>`. A download
anchor is not governed by fetch directives, so it should survive the flip — but it is the single
surface that has not been proven, and it is what the two-tab test exercises. **Do not flip to
enforcing until one real file has been downloaded from a phase-2 browse.** Adding `blob:`
pre-emptively does not help: it would not cover the anchor path. It *will* be needed in `img-src`
when the deferred "thumbnails from actual bytes" lands. Measured 2026-08-14 — `docs/DECISIONS.md`.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and
focus return for both overlays (`src/hooks/useFocusTrap.ts`), a live region for toasts, focus-visible
styles and CSS-level `prefers-reduced-motion`. The sleeping chrome also takes `inert`, so a faded-out
interface cannot be reached by Tab.

**The form convention.** `.v-paste` — the share-code field in the siteconfig panel — used to submit
on Enter only with no button, so a code could not be applied by mouse or touch at all. It is now a
real `<form>` with an `apply` submit button, disabled while the field is blank.

Account forms follow that shape: **one `<form>` with an `onSubmit` that calls `preventDefault()`,
and a `type="submit"` button.** Enter and the button are then the same code path instead of two that
can drift apart, and neither has to be special-cased. The disabled convention it uses was already
waiting in `interaction.css`. The row reuses `.v-share-row`, so the paste field lines up with the
copy field above it.

**The focus-indicator half of that note was wrong and is retracted.** `.v-paste` does set
`outline: none` in `overlays.css`, but `.vessel :focus-visible` in `base.css` has specificity 0-2-0
against that rule's 0-1-0, so it wins on specificity regardless of file order and the input focuses
with the normal 2px `--a1` ring. Verified in a browser 2026-08-12: real click, `:focus-visible`
matches, computed outline `solid 2px` at 3px offset. Do not "fix" this.

Still open, and genuinely unresolved rather than overlooked: several palettes fail WCAG AA on body
text. That is deliberate — Peat especially — and calm mode is the intended remedy.
