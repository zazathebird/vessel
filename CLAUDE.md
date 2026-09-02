# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file holds invariants — rules that are true now and that a future reader could plausibly
"fix" back into a bug.** It states the rule and the shortest reason it exists. It does not retell how
each was found; that is history, and history lives in `docs/DECISIONS.md`.

| Where the rest lives | |
|---|---|
| `TODO.md` | The ordered backlog. **If this file and `TODO.md` disagree, `TODO.md` is newer.** |
| `docs/HANDOFF.md` | Starting a session, verifying a deploy, what cannot be verified from here |
| `docs/DECISIONS.md` | Dated history: what was decided, when, why, with the measurements |
| `design/SPEC.md` | Authoritative on copy, tokens, layouts, motion, product decisions |
| `design/SPEC-ACCOUNTS.md` | Accounts + brokered drive access. Approved; §12 is its decision log |
| `docs/DUEL.md`, `docs/DUEL-ABSORB.md` | The duel's design and its five build phases |
| `docs/DOWNLOADS.md` | The downloads runbook — upload a program, mint a code, give one away |
| `docs/SECURITY-AUDIT.md`, `docs/BREAK-GLASS.md` | Standing security notes; operator recovery of last resort |
| `docs/FONTS.md`, `docs/PHOTOS.md` | Asset ledgers — keep in sync when either changes |
| `design/SPEC-SHARING.md` | Sharing, hosted storage and setup. **DRAFT, awaiting sign-off**; §2 is its decision log |
| `docs/SHARING-SETUP.md` | The setup-script runbook — publish them, and what is known not to work |
| `docs/pi-sharing-host.md`, `docs/thinkcentre-sharing-host.md` | Phase 2's always-on host |
| `design/GUIDE-SUBDOMAINS.md` | How to add a page; what per-account subdomains would break |

**Load every skill that applies before starting, and say which ones** — a skill used silently is
indistinguishable from a skill skipped. `verify-site` for anything that must be *seen*;
`duel-costumes` for fighter work; `frontend-design` for visual work; `code-review` /
`security-review` before a deploy touching `worker/` or `src/auth`.

## Commands

```sh
npm run dev          # Vite dev server on http://localhost:5173 — no API
npm run dev:worker   # full stack: Worker + API + local D1, on http://127.0.0.1:8787
npm run check        # THE GATE — every automatable invariant. Also runs as predeploy
npm run check:fast   # the same without the duel simulation (~4s); runs after every edit via hook
npm run build        # typecheck + production build to dist/
npm run typecheck    # types only, app and worker
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run db:migrate   # apply migrations to local D1  (:remote for production)
npm run deploy       # check, build, strip dist/_redirects, publish the Worker
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — see *Deployment*.

**Five dev-only benches, all excluded from the build by construction.** Vite declares no
`rollupOptions.input`, so the build has one entry (`index.html`) and `dist/` gets none of them —
**if a multi-page input map is ever added, leave them out of it.** `fxlab.html` runs all sixteen
effects through `FxCanvas`'s exact frame maths, advanced by an explicit **Step** button, because an
automated or occluded browser reports `document.hidden` (so rAF parks) *and*
`prefers-reduced-motion: reduce` (which becomes calm, which hides the canvas) — that pair has
blocked whole sessions from seeing an effect. `sitelab.html` is the same idea for the site.
`scripts/duel-shot.mjs` is the equivalent for the duel, and **`scripts/duel-bench.mjs` is the one
that answers the other question**: `duel-shot` renders stills, so it can say what a frame looks like
and can never say whether the fight *reads*, which is about tempo and is the only thing anyone
actually asks. `duel-bench` builds a single self-contained HTML file — the real `duel.ts`, the real
`duelCamera`, no external requests — for somebody whose browser is not headless. Same exclusion rule
as the other three. **`scripts/fx-bench.mjs` and `scripts/fx-shot.mjs` are the same pair for the
sixteen backgrounds** (2026-08-28): the bench builds one self-contained HTML running all sixteen
live with palette, quality and Step controls, and the shot script captures them as stills.
`fxlab.html` already renders the sixteen and is the right tool while the dev server is up, because it
imports from `/src` and reloads — **what it cannot do is be handed to anybody**, which is the whole
reason the bench exists. `scripts/ornament-shot.mjs` does the same for the eight hero ornaments,
which unlike the effects are React and CSS rather than canvas and so need the real app running. `handoff_duel_engine/` holds the reference engine (`duel-cycle-v2.html`, with
`BRIEF.md` / `IMPLEMENTED.md`) the duel absorbed ideas from — **all 29 of its named costumes are
still in it and none has ever been deleted**, which is worth knowing because it is asked about.

## The project

A personal site for an independent computer repair operator, built from a complete design handoff.
React 18 + Vite + TypeScript, served by a Cloudflare Worker. Live at `mcclevarty.ca`;
`mcclevarty.com` redirects to it.

**No runtime dependencies beyond React** — routing, state, styling and authentication are all
hand-rolled. That rule is absolute. Two parts of the original "no assets" rule were lifted by the
client and are deviations 11 and 14: placeholder photographs and six self-hosted webfonts. Every
other graphic is CSS or canvas.

## The spec is authoritative

Every hex value, duration and easing curve in the spec is intended, not approximate. The deliberate
exceptions are photo slots, operator authentication (theatre), and *Known deviations* below.

`design/prototype.html` is an **executable** spec — open it and use it rather than guessing at
behaviour (it pulls React and Babel from unpkg, so it needs network). `design/support.js` is its
renderer: **do not port it and do not read it for design intent.** `design/rejected-kaleidos.html`
is a rejected direction, context only.

Copy these verbatim rather than retyping: line 288 `PALETTES` → `src/data/palettes.ts`; 315–348
`LAYOUTS` / `FX` / `TYPESETS` / `MODES` / `SCOPES` → `src/data/catalog.ts`; 351 `BAD` +
`LOWCONTRAST` → `src/data/guardrails.ts`; 366 `PAGES` → `src/data/pages.ts`; 710 `scramble()`; 823
`startFx()`; 1029 `renderVals()`.

## Architecture

**State lives in one place.** `src/config/ConfigContext.tsx` owns the persisted `Config` and exposes
`update`, `go`, `shuffle`, `band`, the adapted `layout`, and `say`. Components read tokens, not props.

**`src/theme.ts` is the seam** — it collapses palette + typeface + layout + band + calm into CSS
custom properties on one wrapper, plus `layout-*` / `band-*` / `is-calm` classes that CSS branches
on. **No component may contain a literal colour**: a palette change has to be a variable swap, which
is what makes the 0.9s palette bleed work.

Three tokens carry rules rather than values:

- **`--panel`** — how much of `--surface` survives in a card's background. Two floors, both
  accessibility decisions and not tuning: 92% in calm (calm hides the canvas, so translucency buys
  nothing and costs the panel its edge) and 80% on the `LOW_CONTRAST` palettes.
- **`--panel-shift`** — how a layout adjusts translucency per block. **Never set `--panel` directly
  on a block**; an absolute value drives through both floors. `.v-block` clamps the sum.
- **`--elev`** — a unitless shadow multiplier, so a layout can say "nearer" without knowing the
  shadow's geometry.

**`--mx` / `--my` are the shared pointer light**, written to the wrapper by `useMotionSystems` and
registered with `@property` so they are typed and interpolate. Split, Mosaic and the HUD all hang
their light and parallax off these two rather than each growing its own listener. Not written in calm.

**Per-frame values belong in refs, outside React state** — mouse position, scroll velocity, card
element list, keystroke buffer, drag origin, scramble token. The spec is explicit about this.

**The three overlays (panel, door, screensaver) are siblings of `.v-chrome`, not children**, because
the screensaver fades the chrome to `opacity: 0` with `pointer-events: none` and must not take the
panel or the door with it.

**The panel and the door are operator-only, gated once at `openDoor` / `togglePanel`** rather than at
each of the six unlock routes, so a route added later inherits the gate. `isOperator` is false until
the session probe settles, so the door cannot flash open on load; losing it force-closes both. **The
door is theatre** — it guards a settings drawer, and real auth must never reuse its UI.

### The two halves of published site config

`worker/site-config.ts` writes `window.__VESSEL_SITE__` into the shell's `<head>` with HTMLRewriter,
before the bundle loads. `src/config/siteConfig.ts` reads that global **synchronously during the
first render** — which is why it is not a fetch: `ConfigContext` builds its initial state in that
render, so a fetch would put a 0.9s bleed from Nebula Drift to the real palette on every cold load.
Absent or malformed, it returns null and the defaults render. **`loadConfig` validates the payload
field by field** — a published layout id that no longer exists would render an unstyled page for
every visitor at once.

### Per-page appearance

**`Config.lookPages` is `duelPages` for the look itself** (2026-09-02, agreed 2026-08-27): a sparse
map of *partial* per-page overrides over eleven dials (`pal`, `layout`, `fx`, `ornament`, `type`,
`station`, and the five appearance booleans). Partial is load-bearing for the same reason as
`duelPages` — a page names only what it disagrees with and keeps tracking the site for the rest.
The invariants:

- **`applyLook` in `theme.ts` is the one seam**, and `ConfigContext` exposes its result as `look`.
  **Components render from `look`, never from `config`'s appearance dials** — gated by a source
  scan (the panel and the command palette are the allow-list, because their job is the stored
  value). `config` stays what is *kept*: the panel edits it, publish sends it, share codes encode
  it. A page with no override passes through `applyLook` as the same object, by reference.
- **The override goes through the same guardrail resolution as the site** — an override's grain on
  Peat is still dropped at render, and the panel's warning list judges the *merged* pair, because
  that is what publish makes the page render.
- **The panel's "this page" scope means the page behind the drawer, deliberately** — the live
  preview is the page itself, so editing a page you cannot see would be the duel editor's
  preview-elsewhere fault rebuilt. To dress another page, go there first. Behaviour, presets and
  setup codes stay site-level whatever the scope says.
- **A page that pins its own ornament beats the operator's per-load roll** — the roll already
  yields to an explicit pick, and an override is that pick made earlier.
- **`validLookPages` refuses and drops; it never repairs** — the `validDuelPages` doctrine,
  identity-tested. A refused dial kept at a default would be a working override shadowing the
  site.
- **Share codes carry none of it** — same decision as the duel settings, same reasoning: a code is
  a picture of the look, `lookPages` is a document, and the compromise (site dials without the
  map) is the thing to refuse. Site config is the distribution mechanism.
- **`MAX_CONFIG_BYTES` is 12,000** (was 8,000): `lookPages` is the second published key that
  grows. Still refuses, never truncates.
- Transition on navigation is the 2026-08-27 decision by construction: the palette override rides
  the same token swap as every palette change (0.9s bleed), and layout/type snap with the classes.

### Session and account routing

`src/auth/SessionContext.tsx` is **deliberately separate from `ConfigContext`**, which §11 requires
stay synchronous and gain no fetching; everything gated on it starts hidden.
`src/hooks/useAccountRoutes.ts` handles typing `whoami` / `login` / `admin` or dragging left past
260px — **these never call `openDoor`**, they navigate. `src/hooks/useOperatorRoutes.ts` owns the
door's six routes and arrow-key cycling over `NAV`. **Both keystroke hooks carry an `isEditable`
guard**: without it, typing in an account form pages the site on arrow keys and opens the door on
`sudo`.

**The footer's permanent `sign in` link is an invariant with a gate on it.** It lives in the footer
because that is the only chrome no layout hides. The previous route — five taps on the hero ornament
— had a dead end: `Ornament.tsx` returns `null` for the five `HIDES_ORNAMENT` layouts, two of which
(`console`, `sheet`) are exactly what `PHONE_LAYOUTS` collapses to, so an operator on a phone could
have no findable way in at all. `npm run check` fails if the link is re-gated behind a flag, if
`App.tsx` stops rendering the footer unconditionally, or if any stylesheet gives `.v-footer`
`display: none`. The five-tap machinery is **deleted**, not disabled. **The logo's five taps are
untouched** — those open the door, a different affordance for a different thing. The ornament renders
on the phone band (do not re-hide it), and non-desk bands get a header chip because the command
palette's only other route in is typing `cmd` on a hardware keyboard. **The chip is labelled `menu`,
not `cmd`** — see the mobile-menu entry below; it is the only route to a third of the site off the
desk, and it is gated.

## CSS invariants

`src/styles/` holds seven stylesheets. **`interaction.css` owns every hover, press and disabled
state**, because two requirements were fighting over the same properties: the palette bleed needs
colour to cross-fade over 0.9s, and pointer feedback needs to land in ~140ms. Before it, all sixteen
transitions ran at 0.9s and there was not one `:hover`, `:active` or `:disabled` rule anywhere.

**The split is by property, not by selector.** Colour belongs to the palette at 0.9s; `translate` and
`scale` to interaction at 140ms/90ms. Nothing in the interaction layer animates a colour and the
palette never animates a position. `box-shadow` is the one property both want, given the fast timing
deliberately. Two consequences:

- **Use `translate` / `scale`, never `transform`** — they compose independently, and `transform` is
  reserved for the cursor-lean `useMotionSystems` writes to `.v-block`'s style attribute.
- **Selectors are prefixed `.vessel` to reach 0-2-0**, beating `chrome.css` and `overlays.css` on
  specificity rather than import order. Dropping the prefix silently reinstates the 0.9s hover.

Eleven gotchas, each of which has bitten once:

- **`band-*` and `layout-*` are on the same element** — `.band-phone .layout-stack` matches nothing;
  it must be `.band-phone.layout-stack`. Phones collapse almost everything to Stack, so this was the
  main phone path and every override on it was silently dead. **The twin trap is a compound written
  correctly that still cannot match**: the `layout-*` class is the *adapted* layout, and `band` and
  `layout` come out of one `useMemo` in one render, so if `adaptLayout(id, band) !== id` that pair
  never reaches the DOM. Gated.
- **An animated `transform` beats a declared one — so centre with `translate`.** A rule declaring
  `transform: translateX(-50%)` beside `animation: … both` never applies its centring at any point.
  Check for this whenever a rule declares a transform and an animation together.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`** — an animated declaration outranks
  the style attribute, so a forwards fill leaves `v-rise`'s `translateY(0)` owning the card for ever
  and the cursor-lean tilt never renders. The stagger only needs the from-state held during the delay.
- **The entrance layer's `animation` shorthand outranks every layout and resets what it does not
  name.** `.has-entrances:not(.layout-console) .v-block` is **0-3-0** — `:not()` contributes its
  argument's specificity — so import order never enters into it, and the shorthand resets
  `animation-name`, `animation-timeline` and `animation-range` together. **A layout with a second
  animation must re-list both at the entrance layer**, not merely avoid the shorthand. Gated.
- **A from-only keyframe lands on the element's own declared value, so the property must interpolate
  from its initial one.** True for `translate`, `scale`, `rotate`, `opacity`. **Not for `clip-path`**,
  whose initial value is `none`: an `inset()` flips to it *discretely at 50%*. Elements animated this
  way declare the landing shape. Gated.
- **The chrome is a flex column, and Terminal is the one layout that opts out.** `.v-chrome` is
  `height: 100dvh` with `.v-stage` at `flex: 1; min-height: 0` — **`min-height: 0` is load-bearing**,
  since a flex child defaults to `min-height: auto` and refuses to shrink below its content.
  **Terminal overrides to `height: auto; min-height: 100dvh` with `flex: 0 0 auto`** because its stage
  expects the *document* to scroll; clamped, it clips and makes most of every page unreachable. **Do
  not "simplify" the clamp to `min-height` for everyone** — that makes every stage size to its content
  and nothing scrolls internally. **`.vessel` and `.v-chrome` must use the same viewport unit**
  (`dvh`); `vh` reintroduces a nested scroll on any mobile browser showing its URL bar.
- **`scroll-snap-type: mandatory` is unsafe once a snap area outgrows the scrollport, and on the phone
  the hero does** (654px scrollport, 684px `.v-hero`) — mandatory snap must come to rest *on* a snap
  point, so releasing anywhere in the first screenful went back to the top. `proximity` was not enough
  either. **Phones get `none`**, larger bands keep `proximity`. Same-element classes, per the first
  bullet.
- **`.v-stage` scrolls vertically, so its `overflow-x` computes to `auto`, not `visible`** — one axis
  cannot be visible while the other is not, so anything hanging off the side of a child (pseudo-
  elements included) gives the whole stage a horizontal scrollbar. Ambient-light pseudo-elements are
  pinned to `0` horizontally and widened rather than bled outward.
- **A floated `::first-letter` is invisible inside a multi-column container** — Chrome reserves the
  float's box and never paints the glyph. Magazine is the only layout with `columns`, so it is both
  the only place a drop cap was wanted and the only place the usual implementation cannot work; it
  uses `initial-letter: 3 3` behind `@supports`.
- **`.v-account` is a child of `.v-stage`, not `.v-grid` — and one stage is a flex row**, so its
  `grid-column: 1 / -1` does nothing in Side-scroll, where the form became a track item at 210px
  against 472px elsewhere. **A `max-width` cannot fix this** (a flex item with only a maximum still
  shrinks to its content), so it sets `width: min(100%, 34rem)`, and Side-scroll's stage opts out via
  `:has(.v-account)` — keyed on the form so a new account page inherits it. Both gated.
- **`clip-path` clips `box-shadow` away**, so the HUD's chamfered corners use a `drop-shadow` filter.
  Second consequence: `filter` makes an element a containing block for `position: fixed` descendants
  — safe on a content block, not on the grid or stage. **For the same reason the calm/404 `filter`
  lives on `.vessel`'s children, never on `.vessel`**, which would re-anchor every fixed overlay to
  the document and strand toasts in Terminal.

## Product decisions — do not revisit without asking

The spec's *Product decisions already made* table is binding. The ones most likely to be "fixed":

- **No city is ever named**, and the operator is not named. No client names on Work.
- **The email never appears in static markup** — assembled at runtime, click-to-reveal, copies on
  reveal, resets to unrevealed on page change.
- **Guestbook has no form.** "A form is a database is a liability."
- **The operator door and its `authenticate` button are theatre.** Never present an unlock route as
  security.
- **REVERSED 2026-08-26: the self-deprecating copy is *out*, and so is the one-person framing.**
  The client's words: *"get rid of ANYTHING and EVERYTHING that involves putting me down, saying its
  just one person and emphasizing that… just sounds bad."* This retires the old rule, which said the
  self-deprecation *was* the point — do not restore it from an earlier reading of this file. He is
  independent and first-person "I" stays; what goes is smallness as the pitch or the punchline
  ("one guy", "no shopfront", "no company, no chain", "nobody to transfer you to") and every joke at
  his own expense ("a website nobody asked for", "not going well", "took embarrassingly long").
  **The replacement is not corporate voice** — no "we", no "our team", no "solutions". The jokes stay
  and point outward: chains and their depots, Microsoft, subscriptions, scammers, the machines. Where
  a line's only content was the self-deprecation, **short and sweet beats a manufactured replacement**
  (client, same day). The copy still refuses to oversell; it just no longer apologises.
- **Calm is a second full aesthetic**, not a degraded first one, and it is the accessibility escape
  hatch for the deliberately low-contrast palettes.
- **Contact is the only page with a job.** It must work correctly at every stage of the build.
- **Nothing on the site advertises the site** — no palette inventories, no feature lists, no mention
  of pages a visitor cannot see. This retired the two palette gags: a joke that works by reciting an
  inventory is still reciting the inventory. The 404's page *list* stays — those are navigation.
- **The 404's page count moves whenever a content page is added** and reads "eleven other pages"
  today (gated).
  The counts on that page are jokes that depend on being true.
- **No copy promises anything the client has not said, and no fee is named.** "Free diagnosis" and
  "Fixed, or you pay nothing" were both removed as untrue of the business. *"Rough quote back, free"*
  is deliberately untouched and still true. The pricing block states **which way the $150 goes** —
  "not a deposit and it does not come off the hourly rate" — because the wrong reading becomes an
  argument when the invoice arrives.
- **`/setup` puts the scam warning *above* the software, and that ordering is a safety decision.**
  Someone being talked through an install by a criminal is following steps, not browsing. Do not move
  it down for visual balance.
- **`scams` is deliberately left almost alone — do not "finish" it.** Its terms cannot be simplified
  away, because recognising them *is* the defence. Naming the nationalities of scam callers was
  proposed by the client and declined: accent is not who started the call, and who started the call
  is the entire defence the page teaches.
- **Copy is written for comprehension, not verbatim fidelity** (the verbatim-only rule is retired).
  The failure mode was never long words — measured mean grade 5.0 — it was allusion. **Name the thing,
  then make the joke about it.**
- **"Calm" is labelled "Plain" in the interface, and only there.** `config.calm`, `.is-calm`,
  `vessel.calm.v1` and share-code bit 8 keep the old name; renaming breaks stored preferences and
  codes in circulation for zero visible gain.

## Implementation traps

- **Title scramble** — the resolved h1 is the default state and the scramble decorates it. Drive it
  from rAF against a `performance.now()` deadline (550ms), never a frame counter or `setInterval`, or
  a throttled background tab strands the headline in garbage permanently. Each run carries a token so
  a superseded run cannot clear the live one's timer.
- **The time-of-day randomiser must not fire on a first visit** — Nebula Drift wins on load
  (`hasVisited()`).
- **Persistence is validated field by field** in `src/config/persistence.ts`, never trusted.
- **Exactly two fields are stored and read back, and the rule is what they share: they are the
  settings a visitor can set for themselves** — `calm` and `sound`, under `vessel.calm.v1` /
  `vessel.sound.v1`, written only by their deliberate toggles. Everything else is *appearance*, which
  belongs to the operator and stays published-only. **Do not read either from the full-config echo
  `saveConfig` writes** — that freezes whatever was published on the first visit. **The test for a
  third is not "is this useful to remember" but "can a visitor set it at all."**
- **`loadConfig`'s no-published-config branch must still apply those two.** Returning bare defaults
  stops calm persisting whenever nothing is injected — including when D1 is unreachable, i.e. the
  accessibility escape hatch switching itself off in exactly the degraded case. Do not "simplify" it
  back to `{ ...DEFAULT_CONFIG }`.
- **The first visit gets one dialog, and it is not a cookie banner** (`Greeting.tsx`) — one sentence,
  one button, after 1.2s so it lands *after* the headline scramble. It stores a single "seen it" flag;
  no choice is extracted. Returning visitors get the two chips flashing three times (`is-nudge`), and
  only while neither has been touched: a control advertising the off switch for motion must not become
  the most restless thing on the page.
- **OS-forced calm is the one exception, and there the dialog must extract a choice.** Otherwise the
  only dialog on the page describes a *different* page — it said "The background moves" and named a
  button to stop motion that was not happening. `calmBySystem` names that state and `Greeting.tsx`
  branches on it. Three things are load-bearing: it **asks regardless of the greeting flag** ("has
  seen the introduction" and "has answered the motion question" are two different facts); it **cannot
  become a nag**, because `calmBySystem` is derived from the stored preference rather than latched;
  and turning motion on restores `grain`/`breathe` **from the config the visitor arrived with**, not
  from `DEFAULT_CONFIG`. The still option leads, takes focus, and Escape agrees with it.
- **That button is also the capability probe, and says nothing about it** (`src/fx/perf.ts`). It times
  a short burst of the work the effects actually do, at the real pixel ratio — **not
  `hardwareConcurrency`**, which counts cores, says nothing about the GPU, and is wrong in both
  directions. Two details are load-bearing: an **untimed warm-up round** (the first touch of a fresh
  context pays an allocation the real effects pay once at mount) and a **pixel read-back** (without it
  the timer measures how fast commands were *enqueued* — the one number that looks healthy on a slow
  GPU). **It can only ever start two tiers down**: demotion takes ~0.33s, so guessing high is cheap
  and guessing low strands a fast machine soft for seconds.
- **The site's sound is synthesised and cannot play uninvited** (`src/audio/engine.ts`). No files, so
  the *Assets* rule holds; pitch derives from the palette exactly as every colour does, so no voice
  contains a literal frequency. **No ambient bed, no loop, no timer** — every voice is fired by a
  gesture, which is how autoplay policy is satisfied, and the `AudioContext` is not constructed until
  the first voice. `chime` is the single gate; **`play` never reads config**, so the audio layer cannot
  become a second opinion about a setting with a visible checkbox.
- **Focus traps stack, and dialogs + the command palette are *modal*** — global key and drag routes
  stand down, Escape stops propagation so one press closes one layer, and only the top trap handles
  Tab. **The panel and door are deliberately not modal**: `sudo` with the panel open opens the door.
- **Adapted layouts: the operator's stored layout is never overwritten** when a small screen collapses
  it — it re-emerges when the window widens. That state is surfaced nowhere; if it needs to return it
  wants its own affordance rather than the vitals strip coming back.
- **Seventeen real URLs are wired in `src/data/pageIds.ts`** — ten content pages (the spec's eight
  plus `/setup` and `/scams`), `/404`, `/signup`, `/signin`, `/admin`, `/downloads`, and (phase 2)
  `/machines` and `/share`. The prototype's in-place page swap is a prototype limitation, not a
  design decision. **`PATHS` is a total map from a closed union**, which is what makes every link on
  the site compiler-checkable — and **adding a content page moves the 404's page count**.
- **One route has something after it, and exactly one** — `/downloads/<name>`, whose names are D1 rows
  and change while the site runs. `ConfigContext` carries it as `sub`, **deliberately not in `config`**,
  which is validated field by field, published to every visitor and packed into share codes. **Resist
  making the router general** — that total map above is what pays for every other link.
  **`pageFromPath` defers to `subFromPath`, and the two agreeing is gated** —
  a path under the prefix with no valid sub is `notfound`, or the index renders at an address that is
  not the index and `go()` early-returns, so nothing ever corrects the URL. **A sub-page is `noindex`
  and canonicalises to `/downloads`**, since the SPA fallback answers unknown paths with 200 and would
  otherwise make an infinite family of soft 404s each canonicalising to itself.
- **The served head carries exactly one `<meta name="description">`, and it is not the page's lede.**
  `index.html` has a static one and `withPageMeta` appends its own, so the Worker **removes** the
  shell's before appending — two tags shipped for months and the static one, being first, is what
  Google quoted, which is how *"free diagnosis"* stayed in search results long after the claim was cut
  from the copy. **The static tag stays** (Pages is the rollback and has no Worker) and must stay true.
  The copy comes from `src/data/snippets.ts`, written for that job: a lede is read after an eyebrow and
  a headline, a snippet arrives cold, and nine of eleven indexed routes were being cut mid-sentence at
  155 characters. **Home rotates by the day; `scams`, `setup` and `contact` never rotate** — the first
  is written to be forwarded, and a page about fraud that describes itself differently each time it is
  forwarded is arguing against itself. Gated: one tag each side, length, the retired claims, the
  no-rotate list, and that every home line names the business, since it is read alone.
- **`/now` claims to be true today, so it may only ever contain true things.** It was six entries of
  inherited handoff fiction until 2026-08-26 — a household file server, a screen in transit, a 486
  restoration — on the one page a customer can disprove for free by asking how one of them went. It
  now lists what is actually in for repair, which means **it goes stale by sitting still**, and a
  stale `now` page is worse than no `now` page. The same rule governs `about`: there is no workshop
  yet, there is a bin of parts, and the copy says so.
- **Copy claims are audited separately from copy editing, and the two passes do not substitute.**
  A rewrite invents things — a tool, a percentage, a duration — because the invention reads better
  than the truth, having been chosen for rhythm. The 2026-08-26 pass produced 38 findings, 24 of them
  invented that same day, ten touching money, safety or privacy. **The most dangerous shape is a
  retired promise rebuilt without its words**: "free diagnosis" came back as *"I tell you what's
  wrong and what it will cost, and then I fix it"* on three surfaces and the gate stayed green,
  because the gate tested for the phrase. It now tests `PAGES` as well as the snippets, and tests for
  the *form* — the fault established before anything starts, which is the boundary the $150 sits on.
- **A quotation is somebody's words; an attribution is the writer's.** The guestbook's five quotes
  may be re-attributed freely and **never reworded** — editing them for rhythm manufactures a
  testimonial. Whether they are real at all is an open question in `TODO.md`.
- **The 404 pill left the public nav** and now leads `OPERATOR_NAV` (404 / Account / Admin) plus a
  Config tab. **`OPERATOR_NAV` is deliberately not part of `NAV`**, which `useOperatorRoutes` cycles
  and Radial's orbit renders. The 404 *page* still renders for anyone at an unknown URL.
- **The FX canvas renders in CSS pixels, into a buffer sized to its own box** — `min(devicePixelRatio,
  2)` capped to a 2600px long edge, with a base `setTransform` each frame so effects keep receiving
  CSS pixels. **That last part is load-bearing**: `rain` sizes columns off `w` at a 16px cell and
  `plasma` its grid at 26px, so device pixels silently double their density on a retina display. It
  also means a missed `ctx.restore()` can no longer mirror the site permanently.
- **The screensaver has no rendering of its own** — it *is* the configured effect, alone and boosted,
  so "make the screensaver do X" is already answered for every effect: pick X. The duel alone needed
  an attract mode because it alone has a *subject*. **`Frame.sleeping` drives it, deliberately its own
  flag** rather than something recovered from `boost` (scroll velocity folds into that same number, so
  a hard scroll would be indistinguishable from a sleeping interface). The blend is **eased, never
  switched**. No other effect reads `sleeping`.
- **A resize is absorbed by each effect, never by the cache** — `FxCanvas` drops the cache only when
  the effect *id* changes, so anything holding geometry must notice a new box itself. **An effect that
  caches absolute coordinates and does not check the box strands itself on the first resize.**
  `vessels` rebuilds from a **stored pool of random numbers**, not `Math.random()`, so a rebuild
  re-fits *the same* tree instead of rolling a new one on every frame of a drag.
- **The adaptive resolution tier cannot reach a draw-call-bound effect, so effects also receive it as
  `quality`.** `TIERS` is `1 / 0.8 / 0.62 / 0.5 / 0.38 / 0.28`; that fixes fill rate and does nothing
  for `rain` (~1,900 blits a frame) or `plasma` (a grid in CSS pixels), so those two coarsen their own
  grid and every other effect ignores it. **The two directions are measured against different
  quantities, and that is load-bearing**: falling is judged on the frame *interval*, which is the
  complaint itself; rising cannot be, since a bar of "under 11ms" is above 90fps, which a vsync-locked
  60Hz display never produces — so promotion was unreachable on the commonest display while demotion
  stayed reachable, and since every change persists and `calibrateOnce` will not re-probe, one GC
  pinned a profile to a soft canvas permanently. **Rising is judged on headroom**: time inside
  `drawFx`, scaled by the square of the tier ratio, against the frame's budget. A promotion undone
  within ~900 frames sets a session ceiling so the detector cannot oscillate, and the sampler runs
  *after* the draw so calm frames are not evidence.
- **Particle counts scale with area, and the reseed guard is the box, not the count** (`field()`).
  Fixed counts gave a phone ~4× the density of a desktop at ~4× the cost on weaker hardware; scaling
  the count breaks a `length !== n` guard, hence the stored box and the 35%-area threshold.
- **`FX` is the wire format; `PICKABLE_FX` is the menu.** Anything offering a choice to a human reads
  `PICKABLE_FX`; anything *resolving* a stored or shared value reads `FX`, because a hidden effect is
  unlisted, not invalid. **No entry carries `hidden` today, so the two are equal — keep both lists and
  the flag anyway.** This is the mechanism for withdrawing an effect without moving anyone's share
  code; collapsing them forces the next withdrawal to delete an index.
- **Every surface that reads `PICKABLE_FX` is operator-gated.** A visitor's only appearance control is
  the calm toggle, and the home page's "Show me something weird" **navigates to the gallery, it does
  not roll the dice**. Making presets or share codes public is a product decision about who controls
  the look, not a fix.
- **Presets define themselves structurally and derive their share code** (`src/data/presets.ts`) — a
  hardcoded `"N-7-5-3-5-3"` stays correct until a catalogue gains an entry and then becomes a
  *working* code pointing at the wrong palette. `encodeShareCode` reads the same indices the decoder
  will. **A preset is a menu, so it may never name a `hidden` entry.** Gated by decoding each preset.
- **The toggle bitfield is where a new boolean goes, while bits remain** — `sound` 16, `slots` 32,
  `entrances` 64, the last stored **inverted** because its default is on and every code in circulation
  has the bit clear, so clear must decode to the default. Past one base-36 character (max 127 → `3J`)
  is harmless: nothing counts characters, only hyphens. Bits 128 up are free. **A non-boolean gets a
  field, not bits** — packing an enum into bits is how a catalogue gains an entry and overflows into
  its neighbour. **Both `PUBLISHED_KEYS` lists must gain the field**: the client's in
  `src/config/siteConfig.ts` and the Worker's in `worker/site-config.ts` are separate arrays, and
  either one missing it silently drops the value on publish.
- **Share codes are base-36 and `FX` order is a wire format.** Effect index 12 is `C`, not `12`;
  `0-0-12-0-7-0` parses `12` as 38 and falls through to the default effect, which looks exactly like a
  failed deploy. **Append to `FX`, never insert.** Codes are **seven** fields since the station landed;
  five- and six-field codes still decode, leaving later fields alone. `src/share/paths.ts` and
  `src/config/shareCode.ts` are covered by the harness because both are **wire formats whose failures
  are silent** — a wrong share code is a working code pointing at the wrong palette, so nothing throws
  and nothing logs.

## Known deviations from the prototype

All deliberate. Add to this list rather than silently diverging.

1. **Guardrail evaluation** (`src/data/guardrails.ts`) — a rule matches only when **all** its clauses
   match; the prototype's `ok()` tests each independently, which would reject every Editorial config
   rather than the Editorial+Datamosh pairing. **`Combination` must carry every dimension a roll can
   change, and each field is deliberately required** — the ornament was rolled for months and never
   passed to `isAllowed`, so no guardrail could constrain it *however it was written*. Required fields
   make the next forgotten dimension a type error. **Add a knob to the roll, add it to `Combination`.**

   **A guardrail must reach the page, not only the dice** (2026-08-28). `isAllowed` had two callers,
   the randomiser and the check suite — so publishing from the panel, pasting a share code and
   restoring stored config all walked past every rule, and production shipped a pairing the table had
   forbidden for nine days with the suite green. Two of the seventeen are now resolved at render, and
   the split is deliberate: **a rule is resolved when it is an accessibility floor and the direction
   of yield is obvious; every other rule is the client's taste, and taste is his to overrule.** The
   two are `effectiveStation` (the station yields, never the ornament) and `effectiveGrain` (the grain
   yields, never the palette — grain is a 14% `--fg` overlay across every word on the page, and it is
   already the first thing calm drops). What the operator could not do before is overrule a rule
   *knowingly*, so **every guardrail carries a required `note`** and the panel prints it. `resolve()`
   applies both halves and the gates drive it, never the predicate. **The grain rule lives in
   `GUARDRAILS` like the rest** — as a special case inside `isAllowed` it could not be named, so no
   list of the rules could include it. `combinationOf` is the one constructor.

   **None of the paragraph above was true until 2026-08-30, and the way it was untrue is the lesson.**
   `resolve()` had **zero callers in `src/`** — only `scripts/check.ts`. `theme.ts` imported
   `effectiveStation` alone and built `has-grain` from raw `config.grain`, so **grain rendered on Peat,
   Oxide, Terracotta Night and Deco Gold**: the 14% overlay, across every word, on the four
   lowest-contrast palettes, reachable by publish, by share code and from stored config. And
   `matched()` had no caller at all, so of the seventeen rules the fifteen that are meant to *warn* did
   not — every one carrying a mandatory, gated `note` that nothing rendered. The gate's own comment
   asserted it drove the page and then tested the resolver in isolation, which is the whole of how a
   fix can be recorded as shipped and not be. **A gate for "does this reach the page" must drive the
   thing that builds the page** — `themeClasses`, not `effectiveGrain`; the three new ones do.

   **`effectiveStation` is fed the *resolved* ornament, not the stored one** (2026-08-30, and this was
   `TODO` item 6, which asked for the decision: **the station follows what is DRAWN**, because a
   station is *where the ornament is*). Both directions were live. Signed in with a stored sonar and
   station `roam`, the operator's per-load roll draws a duel about every other load, the resolver was
   handed `"sonar"` and returned `roam` — so the duel faded to 12% and re-acquired three times a
   revolution, which is the pairing `GUARDRAILS` refuses and which the client originally reported. In
   the other direction a published `duel` + `roam` resolves to sonar for a signed-out visitor while the
   resolver still saw `"duel"` and emitted `hold`, so the operator published Roam and every visitor got
   Hold. `themeClasses` takes the resolved pair `ConfigContext` already exposes.
2. **Focus-visible styles exist** in `base.css` — the spec lists their absence as a gap, not a decision.
3. **Magazine's h1 minimum is `46px`** — the spec's value, not the prototype's `40px`.
4. **Matrix rain is rebuilt** (client request) — each column owns its speed, trail length and glyphs,
   and the trail is drawn explicitly so the leading glyph can be near-white. Colour still entirely
   from the palette (`fg` lead, `a1` body).
5. **"Breathing" does something** — the prototype defines a `v-breathe` keyframe and never attaches it.
   It drives the vignette at the valve's 4.6s rhythm: no reflow, no text resampling, no scrollbar.
6. **Contact's primary CTA reveals the address** instead of navigating to the page it is already on.
7. **The hero ornament is a setting, not a fixture** (`src/data/ornaments.ts`) — **eight, five
   withdrawn**. Lens, Valve, Aperture, Orrery and `duelholy` carry `hidden`: they resolve from stored
   config and share codes but appear in no menu (`PICKABLE_ORNAMENTS`, and `ROLLABLE_ORNAMENTS` =
   pickable minus "None", because a rolled empty hero slot is indistinguishable from a broken page).
   Offered: None, **Lightswords** (index 5) and **Sonar** (index 7, `DEFAULT_ORNAMENT`).
   **`duelholy` was withdrawn 2026-08-27, not deleted**: both duels now draw from the whole roster
   (`DUEL_POOLS`), so the two entries became the same thing and two identical menu rows is worse than
   one. Every stored config and share code naming it still resolves and still works — which is the
   case `hidden` exists for, and the published site config named it at the time. **An out-of-range share-code
   ornament field resolves to `DEFAULT_ORNAMENT`, not index 0** — index 0 is withdrawn. Sonar's contact
   flares are `animation-delay`-matched to the beam's arrival at their bearing, arithmetic written out
   in `chrome.css`: **retime the beam and every delay is wrong.** All eight sit in one square slot, so
   layouts that resize or hide it need no knowledge of which is showing. `SCOPES` has six entries, not
   the spec's five.

   **The slot also has a *station*** (`src/data/stations.ts`) — `hold` (index 0, the original
   behaviour), `opposite`, `roam`. It rides the **ornament** scope rather than gaining a seventh,
   because a station is *where the ornament is*. Five rules: **every station rule is
   `:not(.layout-radial)`** (Radial's slot is the dial — a *look* may not move or fade the site's
   navigation; gated); **placement is `order`, never a translate and never an auto margin** (`.v-stage`
   overflows sideways, and auto margins were a measured no-op because `.v-hero-text` grows into all the
   free space); **`opposite` is not a side** (on row heroes it moves left:0 → left:789, on Magazine and
   Marginalia's column heroes top:68 → top:498); **`roam` never fades to zero and never sets
   `pointer-events`** — the floor is 0.12, because at zero it reads as one element disappearing and a
   different one appearing, and its 14.4s cycle is three revolutions of the sonar beam, so **retiming
   the beam wants retiming here**; and **calm strips the motion and keeps the placement** (`roam` is
   `:not(.is-calm)`, `opposite` deliberately survives, because calm strips animation, not layout).

   A guardrail refuses `roam` with either duel — a duel is the one ornament with a subject, and fading
   it out twice a revolution loses the exchange you were watching.

   **Radial's dial lives in this slot and is the only navigation on that layout.** Pills are placed
   from `--i`/`--n` set inline from `NAV` — one circle at any count, bearings 360/n apart. The header's
   nav links stand down **in React, not only CSS**, so the landmark count stays honest; operator tabs
   are excluded; Radial is desk-band only; the slot survives at ornament "None" because the navigation
   lives in it; and **calm must not dim it** (a same-element `.is-calm.layout-radial` rule excepts it).
8. **The hero vitals strip is removed** (client request) — *show the layout, do not caption it.* The
   404's `pressure lost` variant and the ` · adapted` suffix went with it.
9. **The duel blades are literal colours** (client request) — see *The duel*.
10. **All visible "vessel" branding is gone** (client request) — wordmark, page titles, termbar, TOTP
    issuer and passkey rp name read `mcclevarty.ca`; the "Vessels" effect *label* is "Branches"; the
    favicon is an inline SVG data: URI. **Internal identifiers deliberately keep the old name** — the
    `.vessel` class, `vessel.*` storage keys, the `__Host-vessel_session` cookie, the `vessel/…` HKDF
    info strings, the Worker/D1 names and the effect id `vessels` — because renaming breaks live
    sessions, stored config, key derivation or share codes for zero visible change. **Do not "finish
    the job".**
11. **The photo slots hold placeholder photographs** — Wikimedia public-domain/CC0, re-encoded to strip
    EXIF so the gallery's "EXIF stripped" line stays true, rendered desaturated under the tile chrome
    so the palettes stay in charge. Ledger in `docs/PHOTOS.md`. The *no images* rule still holds for
    design assets.
12. **The contact sheet duotones its photographs, in every mode including calm** — greyscale plus an
    `--a1` field at `mix-blend-mode: color` at 22%, because the placeholders were the one element that
    did not recolour with the palette. **There is deliberately no `.is-calm` override**: calm exists so
    body copy holds up on low-contrast palettes, a photograph is not body copy, the caption sits above
    the blend, and calm changes no other palette value.
13. **Fourteen layouts, twenty-five palettes, sixteen effects** — `hud` at layout index 13, Cold Open
    at palette 24, `scan` / `telemetry` at effects 14 and 15. **All appended, never inserted.** `hud`
    is the only archetype that is not a grid, a column or a track: blocks sit on three z-planes and
    physically overlap, and the near plane's `backdrop-filter` blurs the one behind it — that occlusion
    is the point. **`TABLET_LAYOUTS` maps it to Cinematic, not Mosaic**: `adaptLayout` is a single
    lookup and does not chain, so mapping to a layout that itself collapses would render real
    six-column Mosaic at 700px.
14. **Six self-hosted webfonts** (client request) — a deliberate, explicitly granted exception to
    *Assets*. On Windows `grotesk`, `mixed`'s body and `condensed` all fell through to **Arial**: three
    of five typesets rendering identically. `public/fonts/` holds six latin-subset **variable** woff2
    files, **178KB**, all SIL OFL 1.1. **Self-hosted, not from a CDN** — the live CSP is
    `default-src 'self'` with no `font-src`, so a gstatic URL is refused in production. Weight axes are
    clipped to the ranges used; `docs/FONTS.md` is the ledger so a re-download does not silently
    re-fatten them. **Each typeset pairs its webfont with a platform-picked system fallback** rather
    than one macOS-first list, because that tail renders during `swap` and permanently if a file 404s.
    `TypeSet` also gained `displayWeight`, `bodyWeight` and `tracking`: there were **two**
    `font-weight` declarations in the entire stylesheet set before this, so every heading was the
    user-agent's `bold` in all five typesets.

## The duel

Design and phase history in `docs/DUEL.md` / `docs/DUEL-ABSORB.md`; the reference engine is
`handoff_duel_engine/duel-cycle-v2.html`. Costume work has its own skill (`duel-costumes`), which also
covers how to *see* any of this — rAF parks in an automated browser, so use `scripts/duel-shot.mjs`.

**Fighters and costume** (`src/fx/fighters.ts`, **a roster of twenty-four — twelve a side**, 2026-08-28):

- **The body is a mass and every mark carries its own edge — "the carve", and it is not optional.**
  Each shape is laid down in the palette's **background role** at a wider line before it is drawn in
  ink, so a helmet stops where the skull starts and the near leg crosses in front of the far one; each
  bone is a tapered capsule, two per limb, so the elbow and the knee are joints you can see. `paper` is
  a **role, not a literal** — it cross-fades with the 0.9s bleed and holds on all 25 palettes. It
  would read as a light *gap* rather than a dark rim on a pale palette; **there is no pale palette
  here** (the brightest `bg` is Clay at 0.0104 relative luminance against `fg` values of 0.88–0.94),
  so today it is always a rim. **Adding a light palette makes that a live question again.** **`rim: 0` disables it and is the rollback**,
  and is also the right value for any surface drawing the duel over an image rather than a palette.
  Measured at **0.097ms → 0.172ms** per frame at the ornament's 700×700 on a *software* rasteriser:
  1.77× the duel's own draw and ~1% of a 60fps budget. **Do not revert this to strokes** — the flat,
  wire look it replaced is the thing the client rejected by name.
- **The carve reaches every costume through `solid()` and `strokeInk()`, which is why sixteen surviving
  costumes needed no edit.** A hook that ends in a bare `ctx.stroke()` is uncarved and back to being a
  wire. **Two are deliberately bare**: the prophet's halo rings, drawn in the blade colour, because a
  background-coloured rim around a glow is a hole punched in the thing that is meant to glow.
- **`solid()`'s inner shadow is clipped to its own mark, and the clip is what keeps it from being the
  2026-08-14 slab** — it is a second value *inside* one shape, never across the body. Nothing else on
  the body gets a second interior tone, and cloth alpha must not be raised to compensate for the new
  edges: the carve already separates a cape from the legs, and alpha is what stops it becoming a
  shield.

- **Mass is allowed; a slab is not** — the rule is not "never fill", but a filled shape covering the
  torso must be faint enough to read the body through.
- **Two shapes on one head need a gap between them, or they merge into a third shape neither of them
  is.** Three costumes were built and lost this way before it was written down: the plague doctor's
  beak left the brow and disappeared under its own brim, the falconer's bird faced forward and made a
  two-headed figure, and the valkyrie's wings overlapped into one flap. Each was fixed by *moving* a
  shape, never by enlarging it. **The carve weakens this and does not retire it** — a mark now stops
  where the one behind it starts, so a collision is cheaper to survive, but two shapes drawn in the
  same place are still one shape and an edge cannot separate them.
- **A proportion has to be pushed past what looks right in the source.** At ~61px two rig units is one
  pixel — the gladiator's crest cleared its helm by eight units and read as a bump, and the reaper's
  skull had two units of cheek pinch and read as an egg.
- **Interior detail is not a costume — the outline is.** The monk had a sash and a bead loop, obeyed
  every rule, and read on the contact sheet as an undressed rig; what fixed it was a rolled fold that
  changes the *silhouette* at the shoulder. Same finding as the 2026-08-19 wire-diagram one, arriving
  at a costume that was doing nothing wrong. **This is the finding the 2026-08-28 cut came out of**:
  sixteen of the forty were a second copy of a stronger silhouette (three brimmed hats, four blocks
  for a head, two capes to the floor) or a costume whose whole read was interior detail, and the count
  turned out to be the wrong lever — what fixed the flatness was the carve, one level down.
  **The exhibits for all three rules — the falconer, the reaper, the monk — were among the sixteen
  cut, so the lessons are now older than anything you can look at. They are still true.**
- **All three were found on the contact sheet and none was visible in a single duel** — `duel-shot.mjs
  sheet` takes `--only a,b,c` and `--px N` so a tranche can be looked at large. **Add costumes in
  tranches and look at the sheet between them**; the question is whether they are telling apart in a
  row, which cannot be asked of one fighter.
- **The pools are derived from `side`, never hand-written** (`ROSTER_GOOD` / `ROSTER_EVIL`). Two lists
  that must agree with the roster is precisely how four of the original eight became unreachable.
- **`NEVER_MEET` is the answer to two costumes that read alike, and it is no longer empty**
  (2026-08-30). Answered `TODO` item 0 by rendering the roster at the *corrected* phone size and then
  the candidates in a real 281px slot. **The nearest pair is not the one that was predicted**: the
  guess was executioner/sentinel, and the worst is **gunslinger (good) / ringmaster (evil)** — both a
  brim, a boxy crown and a long coat, with `back` hooks that are node-for-node the same path, 1–7
  units apart, separated only by a crown height of 10 against 19. Three pairs are in it:
  gunslinger/ringmaster, sentinel/executioner (the only two cross-side heavies with no cloth at all,
  both a single solid rectangle for a head) and executioner/viking (the closest cross-side pair by
  proportion signature, separated only by the shield). **The costumes were kept and the pairings
  withdrawn** — the client's call, and what the mechanism was built for.
- **The duels' slot is widened on the phone *and* the tablet** (2026-08-30). The 2026-08-28 pass
  widened `band-phone` to `min(72vw, 300px)` and left the tablet on the shared `min(34vw, 240px)`, so
  the duel rendered **281px on a phone and 240px on a tablet** — and the tablet band starts at 561px,
  where 34vw is **190px**, the very size that pass calls below what the costumes were authored for.
  Tablet is `min(52vw, 340px)`, on the phone rule's own reasoning: no visitor can be shown a duel, so
  a wider hero costs only the person who gets the benefit. **`scripts/duel-shot.mjs` renders the real
  slot widths** — it was still hard-coding the pre-2026-08-28 190 as "phone", so the tool that exists
  to answer *"do any two read alike on a phone"* was answering it two thirds of the size.
- **A fighter has a `stance`, and it moves the hips and the feet only.** Eight costumes on eight
  identical bodies in one identical guard is what made the roster read as one fighter — which matters
  more at twenty-four, not less.
- **`prop` carries `head` and `build`; `proportion` is `shoulder` / `weight` / `hunch`, with
  deliberately no height multiplier** — the blade is drawn inside the same transform as the body, so
  scaling height scales reach.
- **Every costume declares its own `headroom` and `duelFocus`** — a flat clearance was right for marks
  that sit on a skull and wrong for horns and haloes. **`headroom` has two consumers and the health
  bar was the one nobody wired up** (2026-08-30): the bar sat at a flat `f.y - 34`, is four units
  tall, and four costumes reach into the band it occupies — the gladiator's crest at 34, the witch's
  hat at 31, the anubis's ears and the ringmaster's stovepipe at 30 — so it was drawn *through* the
  top hat's crown and across the prophet's halo at both the phone and the desk slot. The older half of
  the same bug: the camera frames to `max(26, headroom + 16)`, so a flat 34 was **already outside the
  frame for every costume under 18 of headroom**. It is
  `min(max(34, headroom + 8), max(26, headroom + 16))` now — clear of the costume, inside the box the
  camera fits. **The gate for it drives `drawDuel` and reads the emitted rectangle**; the first
  version re-derived the formula from `headroom`, and reverting the renderer left it green.
- **The costume gate sweeps the off hand, and pinning it is how a slab shipped** (2026-08-30). It drove
  one guard pose across its whole 400 × 5 × 2 sweep, so every mark hanging off a *hand* was measured in
  exactly one position — and the viking's shield covered 60% of the torso box at 60% of body alpha
  against a rule of "over 45% ⇒ at most 35%", and reached 36.9 units sideways against the 34 the camera
  frames. **Both were invisible to a gate that cannot move the arms.** It now drives the renderer's
  three hard-coded off-hand positions plus both ends of the holding arc.
- **`back` hooks draw before the legs** — a cape drawn last swallows the limbs it hangs off.
- **No real names, anywhere** — and this is the *client's* rule, in his words, recorded at the top of
  `src/fx/fighters.ts`: *"do not name them on pages that are not accessible only by me, to avoid any
  copyright or legal bullshit."* The plan permitted real names on operator-gated surfaces; they are
  **not used at all**, because a name sits in the public bundle even when nothing renders it. He asks
  for named characters periodically (Homer, Ned, Rick, Morty, Shrek, Jason, Freddy) and has proposed
  "similar but not identical" as a way round it — it is not one, substantial similarity is the test.
  **The argument that actually lands is technical**: this engine draws a silhouette plus one signature
  shape at ~200px and cannot draw face detail at all, and those characters are recognised by *face* —
  a mask texture, a burn scar, a jumper stripe. Folklore was designed as silhouette and is free: The
  Plague Doctor, The Nosferatu, The Prophet, The Pharaoh, The Anubis, The Viking. (The Reaper, The
  Headless Rider, The Count and The Djinn were drawn and then cut on 2026-08-28 — the rule that made
  them safe to draw is unchanged.)

**Visual legibility — measured, and the measurement cannot be gated:**

- **`npm run check` has no rasteriser**, so *"is this effect actually visible"* is measured offline
  with `scripts/fx-shot.mjs` plus a peak/coverage script, never asserted. The effect gates drive a
  recording-context stub, which can say a path was built and never that anything can be seen.
- **Score effects on peak *and* coverage, never on mean difference from the background.** The mean
  conflates a large area slightly different with a small area very bright, and it ranked
  `constellation` the least visible of the sixteen when its lit points are among the brightest —
  it is *sparse*, not dim. Peak (99th percentile channel distance from `bg`) plus % coverage
  separates the two, and it is what caught that the reported weakness of `bokeh` and
  `constellation` on Xerox was not real.
- **The baseline, on Xerox, 2026-08-28:** aurora 108, vessels 71, bokeh 54, flow 50, rain 42,
  plasma 42, scan 38, pressure 27, tunnel 25, telemetry 23 (was 16), orbits 17 (was 14), stars 7,
  constellation 3 — the last two are sparse-but-bright by design, not weak.
  `plasma` (22 → 42) and `pressure` (16 → 27) were raised that day; `telemetry` was the weakest thing in the set until 2026-08-29. An effect must stay short of the loud end deliberately — it sits behind body
  copy on palettes already near the contrast floor.
- **A sub-pixel line loses twice** — it is antialiased into a fraction of the alpha it asked for, so
  a hairline at low alpha is dimmer than its numbers say. `pressure`'s thin rings went 0.9px → 1.4px
  for that reason, not for weight.
- **Frequency is not character** (2026-08-29). `flow`, `telemetry` and `aurora` were three effects
  whose whole read was *horizontal wavy lines*, told apart mainly by which one had a playhead —
  and `telemetry`'s five lanes were the same two-term sine at five frequencies, which is one thing
  shown five times rather than five things. Each lane now carries a different **shape**: analogue
  sine, sample-and-hold steps, a noisy sensor, a sawtooth with a hard reset, and a pulse train.
  Shape is what distinguishes one channel of a real instrument from the next, and it is what a
  decorative wave never has. **Reach for a different shape before a different frequency.**
- **Noise in a trace is hashed from the sample index, never `Math.random`.** Random per frame makes
  the lane *boil* — every pixel resamples every frame — which undoes the one thing the playhead
  exists for: the trace must hold still between sweeps. Same rule the duel costumes record for
  `spray`'s wobble.
- **`--line` is never a canvas stroke somebody needs to see.** It is the hairline *border* token and
  measures 1.22–1.61:1 — the accessibility section already says it is not a contrast-bearing colour,
  and on canvas that reads as *absent*, not as faint. It has now been the bug three separate times:
  the sonar's channel colours (2026-08-17), `telemetry`'s lane baselines and `orbits`' outer four
  rings (2026-08-29, where it meant **the orbits were missing from Orbits**). Use `--faint` and let
  **alpha** carry recession — asking one token to be two brightnesses is what hid all three. The one
  legitimate canvas use left is the duel's ground line, which is a hairline on purpose.
- **A phase used as `x % 1` needs a positive modulo.** `%` keeps the sign of its left operand, and
  `telemetry`'s trace time is genuinely negative for the first few seconds of a page load — `t`
  starts at zero and each sample subtracts up to a whole playhead period. A negative phase sent the
  sawtooth to −3 and inverted the pulse, then corrected itself about eight seconds in, which is the
  kind of fault nobody reproduces because by the time you look it has stopped happening.

**The choreographer** — fighters decide nothing:

- **No sequence names a side.** Every beat is `ATT` or `DEF`, and the role coin consults nothing — not
  health, not position, not who won last.
- **Nothing waits on a condition** — sequences have fixed lengths and the director advances
  unconditionally.
- **`dist` is the sole authority on whether a blow lands.** Sparks come off the true blade-to-blade
  crossing, but gating *damage* on blade geometry is what made blocked strikes drop damage.
- **Every reaction frame is derived from the move table, never typed** — a module computes
  `lands(move, at)` and places the stagger there.
- **Modules chain; they do not concatenate** — one to three run under a single role coin, which is what
  a run of pressure by one fighter looks like.
- **`Module.hits` must hold on every roll**, because the anti-stall rail filters on it.
- **`buildSequence` sorts the beats and the gate still asserts builders emit them sorted** —
  `runDirector` walks the array in order and stops at the first future beat.
- **`st.dir.pressure` resets on match reset**, which is what makes the anti-stall rail per-match.

**Tuning, and where it may live:**

- **The palette chip says `menu` off the desk, and that word is a bug fix** (2026-08-28, client:
  *"the downloads page isnt showing in the menu in mobile"*). Measured on a 390×844 phone: the header
  nav is a horizontal scroller showing ~4.5 of its seven pills, and `.v-footer` sits at **y = 2873 in
  an 844px viewport** — every `FOOTER_NAV` page and the permanent sign-in link are ~2,000px below the
  fold. The palette was always the answer (it offers `[...NAV, ...FOOTER_NAV]` and lists everything on
  an empty query); what was missing was a reason to tap a chip labelled `cmd`. **Renaming beats adding
  a pill**: `NAV` is what `useOperatorRoutes` cycles and what Radial's orbit renders, so an eighth pill
  changes paging and the dial for everybody, and it would land in the hidden tail of that scroller
  anyway. Gated — the palette must enumerate both navs, still list all on an empty query, and the chip
  must be band-gated *and* say `menu`.
- **The duels are operator-only, and that is a lock rather than a default** (2026-08-28, client:
  *"lets keep it as a feature for just me unless i otherwise say so"*). `operatorOnly` on the `duel`
  and `duelholy` entries in **both** catalogues — `src/data/ornaments.ts` and `FxEntry` in
  `src/data/catalog.ts` — covers the hero ornament *and* the two full-screen background effects.
  **It is a different axis from `hidden`, and both duels carry both flags for unrelated reasons**:
  `hidden` is about *the picker* (`duelholy` was withdrawn from every menu on 2026-08-27), and
  `operatorOnly` is about *the page*.
- **Enforced where the thing is drawn, never at the storage end.** A published config or a share code
  naming a duel still resolves to one; it renders as `DEFAULT_ORNAMENT` / `FALLBACK_FX` for anybody
  not signed in. Enforcing it on the way in would mean the operator's own published config silently
  rewriting itself, so he would lose the setting by looking at his own site logged out.
  `ConfigContext` resolves it once and exposes `ornament` and `fx` beside the adapted `layout`;
  `Ornament.tsx` and `FxCanvas.tsx` read those, never `config`.
- **A roll site reads `live.current.isOperator`, never the closed-over one** (2026-08-30). `shuffle`
  and `setMode` have stable dependency lists, so both callbacks are built once — on the first render,
  where `isOperator` is still false because the session probe has not settled. Three roll sites were
  already fixed for exactly this; these two were missed, so **the operator's own shuffle button and
  mode picker could never roll him a duel from either catalogue.** It fails safe, which is why nothing
  reported it.
- **`roll()` takes `isOperator` and it defaults to `false`, which is the point.** Four routes deliver
  a config — published, share code, storage, dice — and **the dice are the one nobody checks**;
  before this, neither roll pool had a gate on it at all. A caller that has not thought about who is
  looking gets the pool that is safe to show anybody.
- **The operator's per-load ornament roll is component state and never a patch to `config`.** A roll
  written into config is a roll that gets published the next time he presses Publish for an unrelated
  reason — the dice would quietly become the site. Same doctrine as the adapted layout. It **cannot
  live in the mount-only boot roll** (`isOperator` is false until the session probe settles, so it
  would never fire), the pick happens **outside the updater** (StrictMode double-invokes them), and
  it **yields the moment he picks an ornament himself** — without that the panel looks broken to the
  only person who can use it. Gated, and verified in a browser: 14 signed-in loads gave 8 sonar and
  6 duel with the stored config still reading `sonar`.
- **The four withdrawn circles are deliberately not in the operator's roll pool.** He called them
  lame and had them withdrawn on 2026-08-17; putting them back into his own dice would be restoring
  rejected work by the back door. If he wants them again that is a decision, not a side effect.
- **REVERSED 2026-08-28: the duel is configuration, and it publishes.** This entry used to say
  `DUEL_TUNING` was *"not in `Config`, not published, not in a share code and not persisted, and that
  is the invariant"*, because a duel that is a different fight per visitor is one nobody can review.
  The client asked for the opposite, in his words: *"i want complete options for the duels for
  everyone n djust for mysef."* Both halves are built — the settings publish to every visitor, and
  the operator drives them live without publishing. **Do not restore the old rule from an earlier
  reading of this file.**

  The risk the old rule named has not gone away, it has **moved**: it is no longer "nobody agreed to
  this fight", it is "a bad value reaches every visitor at once", which is the exposure every other
  published appearance field already has. That is what `validDuelSettings` answers, and why it
  **refuses rather than repairs**, field by field, like the rest of the published config.

  Four multipliers — `circling` (the pick weight of the seven modules containing no blow), `rest`
  (the slack past the last move's *end*), `impact` (hit-stop frames), `patience` (the anti-stall
  threshold) — plus the pinned pairing, the per-side roster allow-lists, `rim`, `zoom`, `bars` and
  `kick`. `src/data/duelSettings.ts` owns the type, the bands and the validation.
- **`Config.duel` is the site default and `Config.duelPages` is a *sparse map of partial
  overrides*.** Partial is load-bearing: a full copy per page means sixteen of the seventeen silently
  going stale the next time the site default moves, so a page that says nothing about `zoom` keeps
  tracking it. Gated.
  **Partial reaches inside `tuning` too, and that is `DuelOverride` rather than
  `Partial<DuelSettings>`** (2026-08-30). `Partial<DuelSettings>`'s `tuning` is the whole four-knob
  object, so the editor could not express "this page disagrees about Patience" and wrote all four at
  their *resolved* values — the same "sixteen silently go stale" failure, one level down, inside the
  one field that is itself an object. Reproduced signed in: Patience on `/work`, then the site's
  Circling 1.00 → 2.50, and `/work` stayed at 1.00 while the editor said *"work sets 1 of its own:
  tuning"*. Gated with a knob-level override, which the old gate could not do because it only ever
  exercised `{ bars: false }`.
- **`validDuelPages` drops a refused key; it does not keep it at the default.** `validDuelSettings`
  answers a refusal by leaving the field at the global default, which is right for the site object
  and precisely wrong for an override — the refusal becomes a *working* override pinned to the
  default, shadowing whatever the site said. `{ work: { zoom: 99 } }` became `{ work: { zoom: 1 } }`;
  `{ work: { good: [] } }` became an explicit `good: null` that cancelled the site's roster
  restriction on that page. **The test is identity with what came in, not with what came out**, since
  from outside a refused field and one that legitimately equals the default are indistinguishable.
  A partly-salvaged list counts as refused. Gated.
- **A null allow-list means "the whole side" and is not the same as listing all twelve** — a null
  keeps up with the roster, a written-out list stops including anything added after it, which is
  exactly how four of the original eight became unreachable. **A restriction that would empty a side
  is refused** and falls back to the whole side: a hero slot drawing no fighter is indistinguishable
  from a broken page. Both gated.
- **The restriction rides on `DuelState.allow`, not on the call that rolls the pair** — the re-roll
  happens inside `advanceDuel` on a match boundary, where the caller is a rAF loop that has long
  since forgotten what it was configured with. Honoured only on the opening match, it comes back as
  *"it ignores my settings after a minute"*. Gated over six match resets.
- **The knobs ride on `DuelState.tuning`, defaulting to the `DUEL_TUNING` global by reference**
  (2026-08-31). They were a global alone on the argument that they "cannot vary within a page anyway",
  and **`/admin` renders three duels at once** — hero ornament, bench, and the settings editor's
  preview, whose whole job is previewing a *different page's* settings than the one it stands on. So
  the premise was false: the last host to run its effect decided the pacing for all three, and
  selecting a page target and dragging a knob moved nothing on the canvas built to judge it. Each
  host assigns `st.tuning` in its own frame loop; a fight that says nothing still tracks the global,
  which is what `applyDuelTuning`, `duel-shot --tune` and every gate assign into. Gated, including a
  source check that all three hosts hand it over.
- **A frame delta is floored at 0, never above it.** Every host clamps with `Math.min(3, Math.max(0,
  …))`. The `min` stops a stall teleporting the world; **the floor was 0.2 and undocumented, and it
  reintroduced the very fault the clamp exists to prevent** — 0.2 is a 300Hz frame, so a faster
  display had its real delta rounded *up* and a 500Hz panel ran 1.67× fast, which is the reported
  "they speed up at like x50 speed" from the other end. Nothing needs a floor: `advanceDuel`
  accumulates fractional frames. Gated across all four hosts.
- **A pinned pairing must be one alignment against the other.** `pin` bypasses `rollPairing`, so it
  is the one route into the engine `ROSTER_GOOD` / `ROSTER_EVIL` do not guard, and nothing checked
  it — a published `["ronin", "sentinel"]` pinned good against good, which the blade carve-out cannot
  express and which the pooled-fight gate asserts never happens. Refused whole; swapping in a legal
  opponent would be a repair. Gated over all 576 orderings.
- **A pool that weighs nothing is picked from evenly.** At `circling: 0` every blowless module weighs
  zero, and the old `|| TOTAL_WEIGHT` fallback was the sum over the *whole* list — larger than any
  filtered pool can subtract, so the loop never broke and the pick was `pool[0]` every time. The
  corner is unreachable through the director today (the rail filters to `hits` first) and **the gate
  says so and asserts at the source instead of pretending to drive it** — a behavioural test that can
  only pass is not a test.
- **`DEFAULT_DUEL_SETTINGS` and `DEFAULT_DUEL_TUNING` are frozen.** `DEFAULT_CONFIG.duel` hands out
  that exact object and `persistence.ts`'s no-published-config branch spreads it shallowly, so it is
  what every un-published visitor's config points at. Nothing mutates it today; frozen, the day
  something does is a `TypeError` where it happens rather than one visitor's edit silently becoming
  the default everyone is handed.
- **The two `PUBLISHED_KEYS` lists are compared whole, in both directions.** The gate used to look up
  `duel` and `duelPages` by name, which gates the field that was being added the day it was written
  and leaves every later one uncovered by the same reasoning. `MAX_CONFIG_BYTES` is gated too: that
  it is 8,000, that it throws, and that nothing truncates to it.
- **The old note said the knobs stayed a module-level global** (`applyDuelTuning`) when they became publishable, and
  that is deliberate: they are read from `buildSequence`, which is handed a module and an rng and no
  state, so carrying them would mean a parameter through the director, the module pool and the
  sequence builder to express something that cannot vary within a page anyway. The *other* settings
  reach the background effect on the `Frame` contract instead, where everything else per-render
  already lives.
- **Size goes *through* `duelCamera`, never over it** (2026-08-30). `zoom` was declared, banded,
  validated and published, and multiplied in exactly one place in the codebase: the editor's own
  preview canvas. `DuelOrnament` drew at `shot.scale`, so the operator dragged the slider, watched it
  work, published it to every visitor and the site ignored it — the `price` vs `priceCents` class
  arriving through a third door. **Copying the multiplication into the ornament is the other half of
  the bug**: applied after the fit, a Size above 1 voids the guarantee the camera gate exists to
  prove. It is a **request bounded by the fit** — capped at the largest scale that still holds the
  focus box, so a wide pose stops getting bigger rather than losing a head, and always free to pull
  out, deliberately under `CAM_MIN` because that floor exists to stop the fight shrinking to nothing
  *by accident*. One clamp; all three hosts go through it. **The gate reads the three call sites as
  well as driving the camera** — driving the camera alone stays green when a host drops the argument,
  which is the bug.
- **`DuelSettingsEditor` publishes and `DuelBench` does not, and no control appears on both.** The
  four knobs moved from the bench to the editor on 2026-08-28 for exactly that reason — a knob that
  publishes cannot also be a knob that does not. **There is one publish button for the whole
  appearance**, in the site-config panel; a second one here would be two routes that can disagree
  about what is live.
- **`MAX_CONFIG_BYTES` is 8,000, up from 2,000, and `duelPages` is why** — it is the first published
  key that grows without anybody editing `worker/site-config.ts`. It **fails loudly and must keep
  doing so**: truncating would inject a half-object that `loadConfig` then correctly refuses field by
  field, leaving the operator watching settings silently not apply.
- **Share codes carry none of this, and that is decided rather than pending** (2026-08-28). A share
  code is *a picture of the look*; `duel` and `duelPages` are *a document*. Every share-code field is
  an index into a fixed catalogue or a bit in one integer, while `duelPages` is a sparse per-page map
  whose entries are partial and two of whose fields are variable-length fighter lists — fully
  specified, about 6.8KB, which is not a code anybody can paste. **The compromise is the thing to
  refuse**: encoding the site-level settings and dropping the per-page map yields a code that parses
  cleanly, reads as complete and silently omits part of what the sender was looking at — the exact
  failure `decodeSetupCode` refuses. Site config is already the distribution mechanism, and it is
  per-page aware, validated field by field and has a publish button.
  **`SharedConfig` being a `Pick` is what makes it safe** — a decoded code is applied as a patch, so
  pasting a setup keeps the duel settings you already had. Widening it breaks that silently. Gated,
  and verified by widening it. Every default is arithmetic identity with the shipped engine, so the
  field changes nothing until somebody sets it.
- **Every default is 1 and 1 must stay arithmetic identity.** Each knob is written as a multiplier on
  a value the fight already rolls, never as a replacement for one, so 360,000 stepped frames and
  280,000 generated sequences pass unchanged. A default that merely *looked* neutral would move every
  duel gate at once, and they are the gates that cannot be eyeballed.
- **`rest` scales the slack, never the moves.** A move's frame count is what every reaction frame in
  the module pool is derived from; scaling moves would slide contacts out from under the beats that
  answer them. `buildSequence` re-derives the last move's end from the move table and scales only what
  is past it, with that end as a floor — at `rest: 0` a sequence must still contain its own last move.
  **The slack is signed, and clamping it at zero is what cost `rest: 1` its identity for eleven days**
  (2026-08-30). The floor was `Math.max(end, …)` over a slack clamped at zero, which reproduces
  `built.length` only when `built.length >= end` — and **four modules deliberately roll a length
  shorter than their last move's own end**, because a trailing drift may be cut short and nobody sees
  it. `disengage` and `pushed` had their subtraction *entirely* undone on 100% of builds, a mean of
  18.07 and 8.04 frames added back. **Positive slack is rest and scales; negative slack is a
  deliberate cut and is not rest at all**, so it survives untouched at every setting. Gated by
  comparing `buildSequence`'s length against the module's own roll — the old gate asserted the id and
  the beat ordering and never the length, which is the only place this was visible.
- **The measurements the knobs exist to move**, at the defaults, over 200 complete matches: median
  match **50.8s**, **62% of frames neutral**, 12% striking, **1.9% in hit-stop**, and **30.6% of
  module picks contain no blow at all** — the heaviest module in the pool (`close-in`, weight 22) is
  pure walking.

**Physics and rendering:**

- **`advanceDuel` drops a non-finite delta rather than clamping it.** `Math.max(0, NaN)` is `NaN`, so
  one bad frame count makes `st.acc` `NaN` for ever — `Math.floor(NaN)` is `NaN`, `NaN > 0` is false,
  `acc -= NaN` keeps it `NaN` — and every later call is a silent no-op with no way back short of a
  remount. **The hosts' own clamps do not catch it**: `Math.min(3, Math.max(0.2, NaN))` is also `NaN`,
  and every host writes that line against a `performance.now()` delta.
- **A match reset is a cut, and nothing may show through it.** `clash`, `hitStop`, `shake`, `sparks`
  and `scorch` clear with the fighters. `clash` is the one with a symptom: a cooldown of up to 30
  frames, so a match ending just after a blade cross opened the next one unable to spark for half a
  second. **`dir.pressure` is deliberately not asserted at zero on the turnover frame** — the reset
  sets it to 0 and `runDirector` runs later in the same `step` and counts the new match's opening
  sequence, so 1 there is the rail working.
- **The duel integrates against `dt` (real elapsed frames), never `boost`.** Every other effect is an
  ambient field and should surge when the page is scrolled or asleep; a duel is a performance and keeps
  its own tempo. Deriving from the effect clock ran it at ~2× under the screensaver and produced the
  reported "random lag" — never dropped frames, but a 1.9 rate alternating 2,2,1 steps.
- **A move that crosses the opponent declares `pass`, and facing is frozen for its duration** —
  `stepFighter` re-derives `facing` every frame otherwise.
- **The body-separation exemption is a *ground* pass** — a pass with no vertical impulse, not any pass.
- **A `quick` beat is a riposte, and it is a property of the beat, never a runtime test.**
- **`Move.carry` names what the *body* does, and the renderer branches on it rather than on move ids**
  (`flatten` / `tumble` / `roll` / `crouch`) — **including for its timing, which one branch did not**
  (2026-08-30). The crouch divided by `MOVES.duck.frames`, and two moves declare `carry: "crouch"`:
  `duck` at 26 and `sweep_low` at 32. So the longer one peaked at `mf 13` when its blade only arrives
  at the low line at `contact: 16` and holds there through 25, then stood the body fully upright for
  frames 26–32 with the blade still down. Gated as the general form — no carry branch in `drawFighter`
  may name a move — because the fault is the shape, and the gate found that `flatten` and `tumble` are
  *also* shared by moves of different lengths.
- **A low sweep cannot descend** — a blade coming down travels through everything between the guard and
  the floor. Geometry, not taste.
- **The somersault's tumble is derived from its own impulse, never typed** (flight time `2·vy/g`).
- **`the-lock` closes the pair to `LOCK_SEP` itself** — `close` range is nowhere near close enough for
  two 58-unit blades to meet.
- **The hit flash decays in `step`, above the fairness coin — never inside `stepFighter`**, which does
  not run while `hitStop` counts down. The flash *is* the hit-stop made visible.
- **`runDirector` runs below the hit-stop early return**, so the exchange clock freezes with the
  fighters it is scripting.
- **`spawnSparks` scales the contact bias with one draw, not two** — two independent `1 + random()*2`
  multipliers do not scale a vector, they shear it.
- **One function decides where sparks go, and it is the grinder model** (`contactSpray`, decomposing
  the swing from `f.trail` — the same samples the smear is drawn from).
- **A hand that is not holding anything cannot bounce** — the deferred recoil off a block would
  otherwise end a throw mid-flight and snap the sword back.
- **The scorch ramp is the palette's** — white → orange → dark as `core` → `spark` → `line`.

**The camera:**

- **`duelFocus` reports where a rising fighter is *going*, not where it is** (apex is `v²/2g` above).
- **A rotating or fallen fighter is wider than a standing one** — 51 units rotating, ~87 lying down,
  against `BODY_W` of 30 — and the camera must be told, or it frames a corpse as though it stood.
- **The zoom is asymmetric — out fast (0.13), in slow (0.03)** — pulling back is a correction that must
  arrive before the thing it is correcting for.
- **A match reset is a cut, not a pan.** The fighters teleport back to their marks; easing whipped the
  camera 43px in one frame.
- **The kick is ornament-only, bounded, and the camera knows about it** — kicks take the larger
  displacement rather than summing.

## Accounts — the invariants

`design/SPEC-ACCOUNTS.md` is approved and authoritative. **Read it before touching any of this.** §12
is a decision log where every rejected option keeps its reasoning and a *"revisit if"* condition — add
to it rather than relitigating.

- **Sign-in is password + TOTP, with passkeys retained** as an alternative credential. **No email is
  collected**, and the operator can reset any password — which is what makes email unnecessary.
- **Key slots (§5) are the load-bearing idea** — one grant keypair per account, wrapped once per
  credential, LUKS-style, so any credential opens the same key. This is why operator reset is safe: it
  deletes the password slot and cannot open it. **Operator escrow is rejected permanently**: a slot
  wrapped to an operator key would let the operator sign grants in a user's name, the exact thing the
  design exists to prevent.
- **The password never reaches the server** — the browser runs PBKDF2 and sends a derived auth secret,
  of which the Worker stores only an HMAC under a pepper. Do not "simplify" into a server-side hash; it
  also dodges the Worker CPU cap, and the browser must derive a password key anyway.
- **No personal data, and §9 has the full inventory** so the claim can be checked. **Adding anything to
  that inventory is a spec change, not an implementation detail.**
- **Phases 1/2/3 must not be collapsed** — phase 2 fails as "my files don't load", phase 3 as "a
  stranger read my files."
- **Authentication works end to end before any interface work starts.**

**Where the code is.** `worker/index.ts` serves the static site via the assets binding with `/api/*`
the exception — **delete every route and the site serves as it does today**, which is what "accounts
are strictly additive" has to mean. Server halves: `accounts.ts` over `session.ts` / `totp.ts` /
`crypto.ts`, plus `admin.ts`, `site-config.ts`, `rate-limit.ts`, `machines.ts`, `signal.ts`,
`webauthn.ts`. Browser halves: `src/auth/` and `src/share/`. **Grants and invites remain deliberately
absent from `migrations/`** — an empty `grants` table is an invitation to fill it before the phase that
hardens it.

`scripts/auth-e2e.ts` imports the **real** `src/auth` modules, through a fetch shim intercepting **only
relative URLs** so the raw `Client`'s cookie isolation survives, and computes TOTP codes independently
from RFC 6238 — so it fails if browser and Worker ever disagree about a byte. Its `d1()` helper shells
out **asynchronously on purpose**: a blocking `execSync` stops undici noticing closed keep-alive sockets
and the next fetch dies with a phantom "could not reach the server". `scripts/webauthn-sim.ts` *encodes*
the CBOR/DER the Worker *decodes*, independently, as a second opinion. **It imports `ws`** because
Node's built-in WebSocket cannot send a cookie header — the no-third-party-libraries rule is about the
site, and the site gained nothing.

**Known wart:** the two pure wire-format sections in `auth-e2e.ts` sit *after* the reachability gate
that `process.exit(1)`s when the Worker is not answering, so appending to a catalogue and running
`npm run test:auth` without `npm run dev:worker` runs **none** of them and exits looking like an
environment problem. Until they move above the health check, start the Worker.

### Decisions that are easy to "fix" back into bugs

- **`recordSuccess` resets the account bucket and only *decays* the client bucket** by one — wiping it
  on success hands an attacker a free reset. Client allowance 50, account 5, because one address is a
  household behind NAT. **Signup has a third bucket** (allowance 12), sized just above the harness's
  eight signups per run: shrink it and the harness locks itself out.
- **Rate limiting reserves and checks in one round-trip** — `/check` then `/fail` let N concurrent
  sign-ins all pass before any failure landed. **`challenge` deliberately stays on `/check`**: asking
  for a salt is not a failable attempt, and counting it would let anyone lock an owner out. It is the
  only exception; **any route that consumes an allowance reserves.**
- **The rate limiting lives inside `assertPassword`, not in its callers**, so a future caller cannot
  forget it and leave an unthrottled online password oracle.
- **`challenge`'s decoy reports `DEFAULT_ITERATIONS`, the real constant** — a varied decoy was the
  tell, not the disguise. **`challenge` takes the salt from any credential that has one**, preferring
  the password row for its iteration count; keyed on `kind = 'password'` it dropped an operator-reset
  account to the decoy branch and turned a working recovery code into a wrong one.
- **A redeemed recovery code returns its key slot in the sign-in response, and the slot row is *kept*.**
  The wrapping key exists only for that request, so a slot not handed back is a grant key sealed for
  ever.
- **A recovery code is not marked used until the sign-in completes** — spending it earlier burns one of
  ten per abandoned attempt, for the person recovery exists for.
- **Authorisation for set-password is a ticket, not the session.** A session says who you are, never how
  you proved it; gated on the session alone a stolen cookie becomes permanent takeover. **The ticket is
  single-use on the server, not just in the client** — its subject carries the redeemed credential and
  `setPassword` requires that credential's key slot to still exist. Clearing it in `flows.ts` is a
  courtesy, not the enforcement.
- **Change-password reuses the salt** — recovery codes derive against the password's salt, so rolling it
  would silently kill all ten.
- **A passkey sign-in has no TOTP stage and no rate limiting.** User verification is the passkey's
  second factor (`verifyAssertion` refuses an assertion without the UV flag) and a failed attempt means
  forging a P-256 signature. Adding a TOTP stage backs a stronger factor with a weaker one.
- **A `prf`-less authenticator registers a passkey with no key slot**, deliberately — it signs in and
  can never open the grant key, and the screen says so. "Fixing" this by wrapping the slot to something
  the server holds is escrow.
- **Removing a passkey is refused when its slot is the account's last openable one.** Spent recovery
  codes' slots do not count as openable.
- **The WebAuthn challenge tokens are stateless** — a replayed registration is refused by the
  credential-id uniqueness index, not a challenge table. **Do not add one.**
- **Set-password re-wraps; it does not unwrap.** `unwrapSlot` returns a deliberately **non-extractable**
  key, so the flow goes ciphertext-to-ciphertext through `rewrapSlot`; calling `unwrapSlot` here
  typechecks and fails at runtime.
- **The browser refuses implausible KDF parameters** (`checkIterations`) — floor at the constant the
  credential kind has always used, cap at 10M. **Refuse, never clamp**: a "corrected" count derives a
  secret the server does not hold. If the default rises, the floor stays at the oldest count ever
  deployed.
- **Passwords are NFKC-normalised before PBKDF2** (NIST 800-63B) — composed and decomposed non-ASCII
  must derive identically across platforms, and there is no email reset behind a mismatch.
- **The last-way-in guards live in the writes' own `WHERE` clauses**, not in a check before them
  (`passkeys.remove`, `admin.resetPassword`, `admin.setOperator`'s demotion, `totpEnrol`'s upsert) —
  check-then-act lets two concurrent requests each count the other as "another way in". Zero
  `meta.changes` is the refusal, and the audit row is written only after it. **Do not "simplify" these
  back into a pre-check plus an unconditional write.**
- **An SDP must carry exactly one distinct DTLS fingerprint, and `fingerprintFromSdp` refuses
  otherwise.** RFC 8122 §5 lets a media-level fingerprint override a session-level one, so matching only
  the first line let a hostile signalling service prepend the owner's genuine fingerprint to its own SDP
  and read every byte without forging a signature. **Do not simplify it back to a single match, and do
  not make it pick a winner** — identical repeats are allowed (a bundled SDP restates the same
  fingerprint per m-section); disagreement is refused.
- **The agent verifies peers itself; it never trusts the signalling introduction.** The trust root is
  **stored at pair time in IndexedDB and never re-fetched** — re-fetching would let a later server
  compromise quietly re-root a paired agent. `worker/signal.ts` is **an introducer, not a pipe**: it
  relays SDP/ICE without reading payloads, persists nothing, and all authentication happens in
  `signalUpgrade` *before* the object is reached. **The upgrade path bypasses `harden()` deliberately**
  — copying a 101 response drops its `webSocket` and hangs every connection.
- **Pairing and re-keying demand the password**; rename, remove and the drive routes are session-gated
  because those rows carry labels, not authority.
- **File paths travel as arrays of components, never strings** (`src/share/paths.ts`) — the agent walks
  handles component by component, so there is no parser to have a traversal bug in. **Refuse, never
  repair.**
- **One agent socket per machine; a newcomer replaces the incumbent**, which is sent `replaced`. The
  frame is the contract — local workerd delivers the server-side close lazily, so nothing may depend on
  the close code reaching the replaced tab.
- **STUN only; no TURN** until the client approves the spend. A hard-NAT pair fails with an honest
  message, not silently.

**Four things the client has not yet signed off** (in `TODO.md`; none blocking). **1.** `totp.last_step`
is a field §9's inventory does not list, and §9 says adding one is a spec change — it exists because
without it a TOTP code is replayable for up to 90 seconds; recommend approving. **2.** §3's operator row
is stronger than the design supports: the Worker sees the raw `authSecret` on every sign-in and holds
the salt and iteration count, so an operator who logged one sign-in could grind offline. The
cryptography is fine; the *unconditional* wording is not. **3.** `⌘K` is claimed twice — the door's
sixth unlock route in `SPEC.md`, the command palette in §10. **4.** Signup discloses handle availability
(409) while `challenge` goes to trouble to hide it.

## The sharing host — the invariants

Two setup scripts, and **each hard-refuses on the other's hardware**: `scripts/pi-setup.sh` on
anything that is not a Raspberry Pi, `scripts/thinkcentre-setup.sh` on a Pi. Half-working on the
wrong machine is worse than not running. `docs/pi-sharing-host.md` and
`docs/thinkcentre-sharing-host.md` are the guides.

- **The Chromium profile IS the pairing** — the persisted directory handle from
  `showDirectoryPicker()` lives in its IndexedDB. That is why the kiosk is a systemd *user* service
  and never a system one, and why the launcher must never gain `--user-data-dir` or `--incognito`:
  a fresh profile per launch drops the handle on every restart and turns a two-minute reboot into a
  trip to the machine with a mouse.
- **Never `--no-sandbox`, and never systemd-harden the kiosk unit.** `NoNewPrivileges`,
  `PrivateUsers` and a `SystemCallFilter` break Chromium's own sandbox, and the fix people reach for
  next is `--no-sandbox` — strictly worse, on the one machine holding a handle to real files. The
  unit file carries this as a comment addressed to whoever hardens it later.
- **Chromium is excluded from unattended-upgrades and given its own timer, and the second half is
  what makes the first half safe.** On Debian its security updates arrive through the same
  `-security` origin as everything else, so without the exclusion the binary is replaced under a
  running browser at an hour nobody chose; without the timer an un-patched browser holds a handle to
  somebody's files, which is worse. The timer is `Persistent=false` deliberately — a missed week
  waits for the next one rather than firing at an arbitrary moment after a boot.
- **The Chromium managed policy is the answer to autologin**, which is not optional: a host that
  stops sharing when the power flickers is not a host. `DefaultFileSystemReadGuardSetting` stays at
  "ask" (3) because that prompt *is* the folder picker the machine exists to answer; write is
  blocked, since §8 shares read-only.
- **`sudo docker`, never the `docker` group** — group membership is root-equivalent and this box
  autologins to a desktop. And **every published container port names an address**, because Docker
  writes its own iptables rules and they are evaluated ahead of ufw's.
- **The firewall reads the SSH port from `sshd -T`** and refuses to enable ufw at all if it cannot
  work it out. **In `sshd_config` the first value wins**, so a drop-in below an earlier setting is
  written, reloaded and silently ignored — the script asks `sshd -T` whether its settings actually
  took rather than trusting that writing the file was enough.

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
  that grants nothing; the worst a hostile one does is *suggest* a folder the person still has to pick
  themselves. Making it a POST would put a credential in a downloaded script and add a write route to
  defend. **Phase S adds no table, no route and no credential** — that is what let it ship without a
  security review, and it is worth keeping.
- **The code is a two-language wire format**: PowerShell and shell encoders, a TypeScript decoder.
  `npm run check` asserts the round trip, refuses twenty-one malformed shapes, **and greps the PowerShell
  script for its exact JSON template and base64url transformation**, so editing one side alone fails.
  Verified by breaking it. **Bump to `VS2.` rather than changing the shape of `VS1.`.**
- **`ConvertTo-Json` is not used, and neither shell script uses `jq`.** PowerShell 5.1 collapses a
  one-element array into a bare object, so somebody sharing exactly one folder would produce a code the
  site refuses — while everyone testing with two saw it work.
- **`decodeSetupCode` refuses; it never repairs.** A half-decoded plan renders as a complete checklist,
  the person ticks every row, and a folder they asked to share is silently absent. They would find out
  while away from that machine. **It refuses more than malformed structure**: a label or path carrying
  a bidi override or a zero-width character is rejected, because both fields are read by a person
  deciding which folder to hand over, and a label that *renders* as something other than what it
  stores is the whole attack - as are two rows that render identically, one of which ticks off and
  one of which does not. **Duplicate labels are refused too**, since they collide in the checklist's
  done-set.
- **The PowerShell JSON escaper branches on the integer code point, never on `switch`.** PowerShell's
  `switch` compares linguistically, so every zero-collation-weight character - emoji variation
  selectors, ZWJ, zero-width space, soft hyphen - compared equal to the first zero-weight clause and
  was written out as `\b`. A folder called "Photos [emoji]" produced a code the site then refused,
  after the links had already been made. `-CaseSensitive` does not fix it; `-eq` does not have it.
- **`@()` around the folder collection is load-bearing.** A one-element array unrolls on return and
  `Set-StrictMode -Version 2.0` suppresses the scalar `.Count` shim, so choosing exactly one folder
  crashed the script. It worked with two, which is why it would have survived every test but the
  first real one.
- **The scripts' chrome goes to stderr; stdout is a data channel.** `choose_folders` returns the
  chosen paths on stdout and the caller reads it with `while read < <(...)`. While `note`/`good`
  wrote to stdout, the instructions and the "Added:" lines were read back as folder paths - every
  interactive run told the customer their folders did not exist, and with no zenity the prompt
  concatenated onto the typed path and nothing survived.
- **The blocked-folder lists in all three scripts are a security control, and they are the ONLY
  barrier.** A link to a blocked directory inside a picked folder is read normally by Chrome - it
  blocks those as "do not pick", never "do not read" (crbug 40061477) - Chrome's own position is that
  evading its blocklist is not a security bug, and the scripts recommend picking the share root as one
  folder. So nothing downstream catches a miss. **Never relax an entry to be helpful, and never
  describe this as an echo of what Chrome refuses**; that framing is what left it with working
  bypasses. `npm run check` asserts the required entries, the fail-closed branch, the prefix matching
  and the framing sentence itself. Four rules, each of which had a working exploit on 2026-08-27:
  - **Canonicalise first, and fail closed.** Exact equality on the raw path let `/home/user//`,
    `/home/./user`, `//home/user` and `/home/user/../user` straight through. `cd -P` + `pwd -P` on
    Unix (`readlink -f` is absent on BSD, and failing silently there re-opens the hole); `GetFullPath`
    plus a bounded `.Target` walk on Windows (`ResolveLinkTarget` is .NET 6+ and absent from
    PowerShell 5.1). **A path that cannot be resolved is refused, never compared raw.**
  - **Collapse a leading `//`.** Bash's `pwd -P` preserves it, so `//home/user` canonicalised to
    itself and compared unequal to `/home/user`. Measured, not theorised.
  - **Block the parent of home** - `/home`, `/Users`, `C:\Users`. The cheapest exploit of the lot:
    "type `C:\Users` in the box" hands over every account on the machine, and the share root lives
    inside it, so the junction was recursive as well.
  - **Prefix-match, not exact-match.** `$HOME` was blocked and none of its children were, so
    `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config` and `~/Library` were all shareable - precisely the
    paths Chrome blocks with block-all-children semantics. The script was opening what Chrome
    deliberately closed. Windows also blocks `%LOCALAPPDATA%` and `%APPDATA%`, and refuses UNC/device
    paths and 8.3 short names (`C:\PROGRA~1` is stable on every install).
- **`--undo` removes links, never their targets, and refuses a share folder without its marker file.**
  Deleting through a symlink is how somebody's photographs get deleted. Both are tested.
- **The scripts leave the lid alone.** They stop idle sleep on mains when asked and warn when they see
  a battery. A laptop taught not to sleep in a bag gets hot, and somebody who shuts a lid expects
  sleep — changing that silently is a dangerous surprise, not a convenience.
- **Junctions need no administrator; symbolic links do.** That is why Windows uses a junction, and it
  is what keeps the whole prepare step running as an ordinary user. **A script that demands
  administrator for its safe half teaches people to give administrator to scripts.**
- **`CHECKSUMS.txt` and the readable `.txt` copies are generated, never typed.** A checksum in a
  document is wrong the first time a script changes, and the person who suffers is the one who checks
  properly, sees a mismatch, and concludes they were handed something tampered with. **The `.txt`
  downloads rather than opening** — `worker/downloads.ts` forces `attachment` and `octet-stream`
  unconditionally — so the page says "open it in a text editor", never "read it in your browser".
- **The scam warning goes above the download.** This page asks for exactly the behaviour `/scams`
  teaches people to refuse, so it earns the trust rather than assuming it: published source, checksum,
  and "if somebody rang you and asked you to run this, hang up." Same ordering rule as `/setup`, and
  for a stronger reason.
- **A browser directory listing may be incomplete and will not say so.** Since Chrome M132, `entries()`
  silently drops files whose resolved path is blocked and still reports success. **The phase-2 explorer
  inherits this**, so nothing may present a listing as provably complete, and "that file is not there"
  is never a safe thing to render as certainty.
- **Which browser profile is the most bug-prone line in phase S.** The folder handles live in one
  profile, not in the browser; a login task opening another gets a page that has never heard of the
  machine. Windows takes `-BrowserProfile`; the others say so in their manual notes.

## Downloads — the invariants

`docs/DOWNLOADS.md` is the runbook. **The catalogue is a database table, not TypeScript** — the old
"content is a deploy step" reasoning was right about a single flat list and wrong about what was asked
for: operator-named pages, laid out by them, published while they are on the phone to somebody, with
per-person access.

- **The bucket is private and the bytes only ever leave through `worker/downloads.ts`.** Put a program
  in `public/` and the code box in front of it becomes decoration. No public bucket URL, no custom
  domain on it, deliberately.
- **`id` is a wire format** — the R2 object key *and* the URL value, so it appears in links people keep.
  **Add ids, never rename one.**
  **And every route that takes one normalises it through `fileId`** — `saveFile` lowercases before
  writing, so an upload route reading `str(b.id, 64)` directly looks for an id that was never
  stored. Typing `Boot-Repair` saved the row as `boot-repair` and then answered the very next call
  of the same submit with *"Save the file's details first."*, leaving an invisible draft behind; the
  editor's id field lowercases as it is typed for the same reason. Gated — every id in the harness
  had been lowercase, which is how it stayed green.
- **`resolveAccess` is the only thing that decides who may see what, and every read goes through it.**
  Listing pages, reading one, and serving bytes ask the same function the same question; `canDownload`
  starts by calling `canRead` on the page, so **bytes cannot escape through a page the caller was
  refused**. **Do not give any route a second opinion** — two checks that agree today are two checks
  that disagree after the next change.
- **A ticket's subject carries three kinds of thing, and the difference between two is a security
  boundary.** `@slug` opens a page and everything on it; **`~slug` makes a page merely *readable***; a
  bare string is one file. A code scoped to one file must open the page that file is on — the download
  button lives there — but "you may look at this" is not "you may take everything on it".
  **`canDownload` reads `ticketPages` and must never read `ticketVisible`.** Gated, and the gate was
  verified by re-introducing the bug.
- **Grants are evaluated as rows, never as two sets.** A grant is a `(page, file)` pair in which either
  may be null, meaning "any"; shredding those into a set of pages and a set of files loses the pairing,
  and a null in one row then attaches its wildcard to *every other row's* scope. `grantedFile` tests
  both halves of one row. Also gated, also verified by breaking it.
- **A draft and a `granted` page both 404; a `code` page says it exists.** Somebody holding a code has
  to be told where to type it, whereas the existence of a page named after a customer is itself the
  thing being kept quiet.
- **Every refusal from the byte route is the same refusal, including "no such id"** — one `denied`
  object thrown from all three places. Distinguishing 404 from 403 makes the status code an existence
  oracle over the whole table, unauthenticated and unthrottled, and ids are lowercase-kebab named after
  what a file is and who it is for, so walking them is cheap.
- **A code can never open a `granted` page, so `mintCode` refuses to make one** — `canRead`'s `granted`
  branch consults the account's grants alone and never looks at a ticket, so such a code is not weak, it
  is *inert*. Drafts stay allowed; minting before publishing is normal.
- **An unscoped code opens every live page except the `granted` ones.** `unlisted` stays in
  deliberately: an unscoped code is the operator's "everything paid" code, and withholding those would
  make the widest scope narrower than a page-scoped one.
- **Deleting a page deletes the codes minted for it**, and `opened` re-reads the page anyway. A slug is
  a re-usable `TEXT PRIMARY KEY` and `download_codes.slug` carries no foreign key, so without this a
  reused address hands an old customer's code to whoever gets the slug next. Deleting is the only
  "withdraw" control this feature has, so it has to mean it.
- **The revoke handle is 16 hex characters and is checked for collisions at mint** — at 8, unchecked,
  with an unbounded `UPDATE` behind it, two codes sharing a prefix meant revoking one silently revoked
  the other, and the customer whose working code stopped is who finds out.
- **A download answers `206` only when it is genuinely partial, and the request header decides that**
  (`rangePlan`). R2 reports an `object.range` even for a request that carried no `Range`, and it may
  also *decline* a range and send everything — announcing that as partial makes a resuming client write
  bytes at the wrong offset. A served range that is not a genuine subset is a 200. **A zero-length range
  is `416`, never `206`** — clamping produced `content-range: bytes 300000-299999/300000`, a
  last-byte-pos below the first. Gated as a truth table.
- **`HEAD` is routed alongside `GET` on the byte route** — download managers probe with `HEAD` to learn
  the size and whether ranges work.
- **`content-disposition` carries both `filename` and `filename*`.** `headers.set` performs a WebIDL
  `ByteString` conversion, so one character above U+00FF throws — not a 400 on upload but a **500 on
  every click, for ever**, on a row that saved cleanly. `Réparation.exe` is an ordinary name here, so it
  is encoded (RFC 5987); what `saveFile` refuses is control characters, quotes and backslashes.
- **An upload writes the row before the bytes and marks it usable after** — `uploaded_at` is null in
  between and a page hides those rows, so a half-dead upload leaves an invisible draft rather than a
  link that 404s at a customer. **The size is read from the object with `head`, never from the browser.**
- **The upload is multipart even for a small file** — one path that always works beats two where the
  second is discovered by a 413 on the day a file gets big.
- **A replacement upload writes its bytes before its metadata; a new file is the other way round.** A
  new file needs its row first because `beginUpload` refuses an unknown id; a replacement must not,
  because saving the new filename and then failing to upload leaves the old bytes under the new name.
- **The table holds no personal data, and the free-text `label` is the one field that could change
  that.** No name, no email, no payment reference, no IP — which is what keeps §9's inventory unchanged
  by this whole feature, and why payment stays out of band. A code is a bearer token like a cinema
  ticket; a date and an amount identifies the row.
- **Validation moved from `npm run check` to the Worker, because the data moved** — the id and filename
  rules are 400s in `saveFile` now. What the check suite gates instead is that **every layout offered in
  the editor has a CSS rule**, the new way this feature can fail silently.

**Categories, prices, filters and sort:**

- **"No prices on the page" is reversed, and only halfway.** A price is stored per file and rendered
  **only** when its page has `show_prices` set, which is **off by default**. **Do not flip that
  default** — the decision is the operator's and the switch is how it stays theirs.
- **`free` and `price_cents` are independent in the table and resolved in `shapeFile`** — a free file is
  sent `price: 0` whatever is stored, because "free" and "$12.50" on one row is a contradiction.
  Resolved in the Worker rather than the renderer **because the same response feeds the sort**. The
  stored figure survives, so unticking free brings it back.
- **Zero is "no price", never "free".** `sortFiles` sorts unpriced files **last** — letting 0 lead puts
  every unpriced file at the top of a price-sorted list. Gated.
- **`CATEGORIES` is an append-only wire format and `PICKABLE_CATEGORIES` is the menu**, the same split
  as `FX`/`PICKABLE_FX`. **`categoryOf` never returns undefined** — an unknown id resolves to `other`,
  where falling to index 0 would silently claim every stray row is a diagnostic tool.
- **Every category is drawn, and `npm run check` fails if one is not.** `CategoryIcon.tsx` is the third
  answer to the no-images rule (after the favicon and `FileIcon`) and follows `FileIcon`'s shape. One
  ink per mark, and the ink is an accent — a category has no container, so a second colour would be
  decoration. They render at 18–20px, so **every mark is one silhouette with no interior detail**: the
  duel-costume lesson at a much smaller size.
- **The filter row is chips for categories and native selects for the rest — except on a phone, where
  the chips become a select too.** Measured, not preferred: at 420px, eight categories at the 44px touch
  minimum wrap to five rows and take 260px, opening the page on its own filter. **One control or the
  other, never both hidden by CSS** — two controls for one setting is two things in the accessibility
  tree.
- **The controls sit below the operator's prose and directly above the files** — they are a control for
  the list, not a header for the page. The free-form look is the exception, because there prose and file
  groups interleave.
- **The unsigned-Windows notice and the code box are asked of *every* file, never of the filtered
  view** — a safety notice that disappears under a filter is a notice with a hole in it.
- **A visitor's filter and sort live in the tab and are never stored.** A sort order is a view, not a
  setting.
- **`price` and `priceCents` are two fields answering two questions** — `price` is what the page
  *renders* (zeroed for a free file), `priceCents` what is *stored*. **The editor must read the
  second**; reading the first blanked the box for every free file and wrote that blank back on save.
- **The downloads editor's children reset on `[slug]`; they are deliberately not keyed.** `key={slug}`
  fixes the fiber tree and **leaves the outgoing `<div>` in the document** — two file managers, the
  stale one still offering to save, reproduced in a production build. An ordinary `useEffect` reset
  cannot duplicate anything, and `submit` also refuses a file absent from the list being rendered. **Do
  not "simplify" it back to a key.**
- **`--type-display-weight`, not `--display-weight`; `--font-mono`, not `--mono`.** A `var()` with a
  fallback never fails and never logs, so four headings rendered at a hardcoded 600 in the browser's
  default mono. `npm run check` now refuses **any** custom property a stylesheet reads that nothing
  writes — the general form, which found a third instance the day it was added.

## Checks — run them, and add to them

`npm run check` is the gate; `npm run check:fast` (~4s) is the same without the duel simulation and runs
automatically after every edit to `src/`, `worker/` or `scripts/` via the `PostToolUse` hook in
`.claude/settings.json`. The full pass is `predeploy`, so **nothing reaches production without it.**

It exists because one long session shipped a QR encoder that would not scan, a CSS rule silently dropped
by a scripted edit, an unreachable duel sequence, and an accessibility error that could never have been
announced. **Every one of them typechecked, built, and looked right.** The gap was never "does it
compile" — it was "does the thing it claims to do actually happen". It covers types, stylesheet
integrity, the QR encoder against the ISO worked example, the duel over 360,000 stepped frames and
**280,000 generated sequences**, costume legibility, the catalogue counts this file documents, and the
specific traps named throughout this file.

**Each gate is there because that exact failure shipped**, and each was verified by breaking it
deliberately. **When you fix a bug that got past the checks, add a check.** That is the whole discipline.

**And breaking it is not a formality — two gates written on 2026-08-30 passed while the fix was
reverted.** One restated the renderer's arithmetic from the same constant the renderer reads, so
reverting the renderer left it agreeing with itself; it drives `drawDuel` through a recording context
now and reads the rectangle actually emitted. The other drove `duelCamera` directly, so it stayed
green when the *ornament* stopped passing the setting — which was the bug. **A gate for "does this
control reach the page" has to read the page**, and a gate that re-derives what it is checking is the
mistake `DUEL_TABLES`' own comment names: a checker holding its own copy only ever confirms its own
copy. If a new gate does not fail when you break the fix, it is not a gate yet.

**It cannot check everything, and the report says so out loud** rather than implying green means
correct: whether the fight *reads* well, whether a layout is beautiful or the copy sounds right, whether
a QR actually scans on a phone, and the operator surfaces, which need a signed-in session. **A green
suite is a floor, not a verdict.**

## Deployment

Served by a **Cloudflare Worker with static assets** (`wrangler.toml`), **not Pages** — Pages cannot
define Durable Object classes and this stack needs them twice (rate limiting now, one signalling object
per paired machine in phase 2). Cutover added a `routes` entry rather than deleting the Pages custom
domain, because a Workers route is evaluated ahead of one. **Rollback is deleting the `routes` block and
redeploying.**

- **Deploy with `npm run deploy`, never bare `wrangler deploy`.** `predeploy` typechecks *and* strips
  `dist/_redirects`, which Workers static assets otherwise parses as *configuration* and rejects as an
  infinite loop — the deploy fails outright at the API call. The typecheck is not redundant with
  `npm run build`: `wrangler deploy` bundles `worker/` with esbuild, which strips types without checking
  them.
- **`public/_redirects` stays** until the Pages project is deliberately retired — Pages still
  auto-deploys from `main` and is the rollback. `.assetsignore` does not help; validation happens before
  the upload list is filtered.
- **`public/_headers` stays and is *not* stripped** — unlike `_redirects` it is valid for both hosts, and
  it is the only thing giving `/assets/*` its `nosniff`. **Do not generalise "strip the config files at
  deploy" to this one.**
- **The Worker's SPA fallback is `not_found_handling`**, not `_redirects`.
- **`run_worker_first = ["/*", "!/assets/*"]`** is what lets the Worker inline published site config into
  HTML — by default a request matching a real file never invokes the Worker, so `/` got no injection
  while `/contact` did. The negation keeps hashed bundles on the fast path, and means `/assets/*` never
  passes through `harden()`, which is why their headers come from `public/_headers`.
- **`workers.dev` is disabled**, since `workers_dev` defaults to false once a route exists. Wanted — it
  closes the signup endpoint that was publicly reachable before cutover. Setting it true reopens it.
- **`[dev] upstream_protocol = "https"`** is load-bearing for local development, not cosmetic.
- **Give a fresh deploy a few seconds** before testing routes; asset manifests propagate.

**HTTPS and headers.** **`URL.protocol = "https:"` silently does nothing in workerd** — the redirect URL
is built by concatenation **and** compared against the request before being sent, so the worst case is
"no redirect" rather than an infinite loop. **Keep that guard.** Loopback is exempt or `wrangler dev` and
`npm run test:auth` break.

**A state-changing request whose `Origin` is present and is not ours is refused** (`crossOrigin`) —
defence in depth behind `SameSite=Lax`, covering the two places Lax does not reach: Chromium's two-minute
grace on a freshly set cookie, and same-site subdomains. **A missing `Origin` is allowed deliberately**:
same-origin GETs and non-browser clients omit it, and the harness is one of those. Do not tighten to
"require an Origin" without fixing the harness first.

**The CSP is report-only, deliberately.** The nonce is minted per request, stamped on the inlined
site-config script by `withSiteConfig`, and named by `cspPolicy`; violations arrive at `/api/csp-report`
(visible in `wrangler tail`, written nowhere — §9 gains no field). **Do not add a report store; the log
line is the product.** `style-src 'unsafe-inline'` is deliberate — the theming *is* style attributes, and
`style-src-attr` would blank old Safari. **Flipping to enforcing is one header rename in `harden`**,
after production runs quiet through what the harness cannot drive: a passkey ceremony, a phase-2 browse,
TOTP enrolment, each effect. **`blob:` is deliberately absent**, and `saveBlob` in `MachinesPage.tsx`
depends on that staying understood: a download anchor is not governed by fetch directives, so it should
survive the flip, but it is the single unproven surface. **Do not flip to enforcing until one real file
has been downloaded from a phase-2 browse.** Adding `blob:` pre-emptively would not cover the anchor
path; it *will* be needed in `img-src` when "thumbnails from actual bytes" lands.

Secrets (`AUTH_PEPPER`, `SESSION_SECRET`, `RATE_SALT_SEED`, `TOTP_ENC_KEY`) are Cloudflare secrets and
cannot be read back. **`AUTH_PEPPER` must stay backed up** — losing it invalidates every stored auth
hash, i.e. every password on the site, unrecoverably. `docs/BREAK-GLASS.md` is the last resort.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and return
for both overlays, a live region for toasts, focus-visible styles, CSS-level `prefers-reduced-motion`,
and a skip link. **The sleeping chrome takes `inert`**, so a faded-out interface cannot be reached by Tab.

**The form convention: one `<form>` with an `onSubmit` calling `preventDefault()`, and a `type="submit"`
button.** Enter and the button are then the same code path instead of two that can drift apart.
`.v-paste` follows it — it used to submit on Enter only, with no button, so a share code could not be
applied by mouse or touch at all.

**`.v-paste` sets `outline: none`, and that is safe** — `.vessel :focus-visible` in `base.css` is 0-2-0
against that rule's 0-1-0, so it wins on specificity regardless of file order and the input focuses with
the normal 2px `--a1` ring. Verified in a browser. **Do not "fix" this.**

**Body text passes everywhere** — `--muted` on a card measures 6.26–8.57:1 across all 25 palettes. **Calm
cannot fix a palette contrast problem, by construction**: `themeVars()` changes five things in calm and
**none of them is `--fg`, `--muted`, `--faint` or `--a1`**. What calm remedies is the canvas, which it
hides outright, and that is where the real failures were. The standing rules:

- **The canvas wash is scoped to `.v-hero-text` alone** — the one case with genuinely no background. A
  wider scope reached 0-4-0 and silently outranked the layout-specific block rules, leaving desk and
  tablet Stack with *less* protection than before.
- **`--faint` is not a text colour** (2.78–4.09:1 on all 25 palettes). Text uses `--muted` — including
  the footer, which is real navigation, `::placeholder`, `.v-block-idx` (it renders "01" and is not
  `aria-hidden`) and `.v-panel-label` (operator-only is not a WCAG exemption). `.v-caret` and
  `.v-footer-dot` remain and genuinely are decorative.
- **`--a3`, the danger token, is exempt from calm's collapse** — collapsed into `--faint` it made
  destructive buttons and authentication errors the faintest thing on the page, in the mode every
  reduced-motion visitor lands in.
- **`--line` is not a contrast-bearing colour** (1.22–1.61:1) against 1.4.11's 3:1, so **controls use
  `--edge`** — **including `.v-cta`**, which was missed once and is the most important control on the
  site. Hairlines keep `--line`.
- Block headings are `h2`, not `h3`; the footer's current page carries `aria-current` and an underline
  rather than colour alone; `.v-hero-text` uses `min-width: min(300px, 100%)`, which a bare `300px`
  turned into 13px of horizontal overflow at a 320px viewport.

**Three palettes still fail on danger text** — oxide 3.00, xerox 4.07, peat 4.25 — down from all 25.
Consistent with this file's position on the low-contrast palettes rather than a new failure.
