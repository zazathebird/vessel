# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file holds invariants — rules that are true now and that a future reader could plausibly
"fix" back into a bug.** It states the rule and the shortest reason it exists. It does not retell how
each was found: that is history, and history lives in `docs/DECISIONS.md`.

**`docs/INVARIANTS.md` is the other half of this file** — the same doctrine, at subsystem depth, for
the duel, accounts, the sharing host, the setup scripts and downloads. **Read that section before
touching that subsystem.** What is here is what bites in any session.

| Where the rest lives | |
|---|---|
| `docs/INVARIANTS.md` | Per-subsystem invariants: duel, accounts, host, setup scripts, downloads |
| `TODO.md` | The backlog. **If this file and `TODO.md` disagree, `TODO.md` is newer.** |
| `docs/HANDOFF.md` | Starting a session, verifying a deploy, what cannot be verified from here |
| `docs/DECISIONS.md` | Dated history: what was decided, when, why, with the measurements |
| `docs/TODO-ARCHIVE.md` | Session logs moved out of `TODO.md` — history, not current |
| `design/SPEC.md` | Authoritative on copy, tokens, layouts, motion, product decisions |
| `design/SPEC-ACCOUNTS.md` | Accounts + brokered drive access. Approved; §12 is its decision log |
| `design/SPEC-SHARING.md` | Sharing, hosted storage, setup. **DRAFT**; §2 is its decision log |
| `design/GUIDE-SUBDOMAINS.md` | How to add a page; what per-account subdomains would break |
| `docs/DUEL.md`, `docs/DUEL-ABSORB.md` | The duel's design and its five build phases |
| `docs/DOWNLOADS.md`, `docs/SHARING-SETUP.md` | Runbooks for downloads and the setup scripts |
| `docs/SECURITY-AUDIT.md`, `docs/BREAK-GLASS.md` | Standing security notes; operator last resort |
| `AUDIT-FINDINGS.md`, `docs/AUDIT-2026-09-14.md` | Site-wide audits. The second **ran things** |
| `docs/FONTS.md`, `docs/PHOTOS.md` | Asset ledgers — keep in sync when either changes |
| `docs/pi-sharing-host.md`, `docs/thinkcentre-sharing-host.md` | Phase 2's always-on host |
| `docs/HOST-BUILD-LOG.md` | The ThinkCentre as actually built. **Newer than the guide** |
| `../debian-desktop/BLUEPRINT.md` | **A separate repo** beside this one; §3 is the boundary |

**Load every skill that applies before starting, and say which ones** — a skill used silently is
indistinguishable from a skill skipped. `verify-site` for anything that must be *seen*;
`duel-costumes` for fighter work; `frontend-design` for visual work; `code-review` /
`security-review` before a deploy touching `worker/` or `src/auth`.

## Commands

```sh
npm run dev          # Vite dev server on http://localhost:5173 — no API
npm run dev:worker   # full stack: Worker + API + local D1, on http://127.0.0.1:8787
npm run check        # THE GATE — every automatable invariant. Also runs as predeploy
npm run check:fast   # the same without the duel simulation (~43s); runs after every edit via hook
npm run build        # typecheck + production build to dist/
npm run typecheck    # types only: app, worker, and scripts/
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run db:migrate   # apply migrations to local D1  (:remote for production)
npm run deploy       # check, build, strip dist/_redirects, publish the Worker
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — see *Deployment*.

**Dev-only benches, all excluded from the build by construction.** Vite declares no
`rollupOptions.input`, so the build has one entry (`index.html`) and `dist/` gets none of them —
**if a multi-page input map is ever added, leave them out of it.**

| Bench | For |
|---|---|
| `fxlab.html` / `sitelab.html` | The sixteen effects through `FxCanvas`'s exact frame maths; and the site |
| `scripts/fx-bench.mjs` / `fx-shot.mjs` | All sixteen effects as one self-contained HTML; and stills |
| `scripts/duel-bench.mjs` / `duel-shot.mjs` | The duel as self-contained HTML — the real `duel.ts`; and stills |
| `scripts/ornament-shot.mjs` | The eight hero ornaments — React and CSS, so they need the real app |

The `*lab.html` pages need the dev server and reload from `/src`; **what they cannot do is be handed
to anybody**, which is why the `*-bench.mjs` scripts build self-contained files. **Step buttons exist
because an automated or occluded browser reports `document.hidden`** (so rAF parks) *and*
`prefers-reduced-motion: reduce` (which becomes calm, which hides the canvas) — that pair has blocked
whole sessions from seeing an effect. Stills can say what a frame looks like and never whether the
fight reads, which is about tempo and is the only thing anyone asks.

`handoff_duel_engine/` holds the reference engine (`duel-cycle-v2.html`, with `BRIEF.md` /
`IMPLEMENTED.md`) the duel absorbed ideas from. **All 29 of its named
costumes are still in it and none has ever been deleted** — worth knowing, because it is asked about.

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

`design/prototype.html` is an **executable** spec — open it rather than guessing at behaviour (it
pulls React and Babel from unpkg, so it needs network). `design/support.js` is its renderer: **do not
port it and do not read it for design intent.** `design/rejected-kaleidos.html` is context only.

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
registered with `@property` so they are typed and interpolate. Split, Mosaic and the HUD hang their
light and parallax off these two rather than each growing a listener. Not written in calm.

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

**`Config.lookPages` is a sparse map of *partial* per-page overrides** over eleven dials (`pal`,
`layout`, `fx`, `ornament`, `type`, `station`, and the five appearance booleans). Partial is
load-bearing — a page names only what it disagrees with and keeps tracking the site for the rest.
`Config.duel` / `Config.duelPages` work the same way; see `docs/INVARIANTS.md`.

- **`applyLook` in `theme.ts` is the one seam**, and `ConfigContext` exposes its result as `look`.
  **Components render from `look`, never from `config`'s appearance dials** — gated by a source scan
  (the panel and the command palette are the allow-list, because their job is the stored value).
  `config` stays what is *kept*: the panel edits it, publish sends it, share codes encode it.
- **An override goes through the same guardrail resolution as the site**, and the panel's warning
  list judges the *merged* pair, because that is what publish makes the page render.
- **The panel's "this page" scope means the page behind the drawer, deliberately** — the live preview
  is the page itself, so editing a page you cannot see rebuilds the duel editor's preview-elsewhere
  fault. To dress another page, go there first. Behaviour, presets and setup codes stay site-level.
- **A page that pins its own ornament beats the operator's per-load roll** — the roll already yields
  to an explicit pick, and an override is that pick made earlier.
- **`validLookPages` refuses and drops; it never repairs**, identity-tested. A refused dial kept at a
  default would be a working override shadowing the site.
- **Share codes carry none of it** — a code is a picture of the look, `lookPages` is a document, and
  the compromise (site dials without the map) is the thing to refuse. Site config distributes it.
- **`MAX_CONFIG_BYTES` is 12,000, it throws, and nothing truncates to it.** It is measured in
  **bytes**, not `JSON.stringify(...).length`, which counts UTF-16 code units.

### Session and account routing

`src/auth/SessionContext.tsx` is **deliberately separate from `ConfigContext`**, which §11 requires
stay synchronous and gain no fetching; everything gated on it starts hidden.
`src/hooks/useAccountRoutes.ts` handles typing `whoami` / `login` / `admin` or dragging left past
260px — **these never call `openDoor`**, they navigate. `src/hooks/useOperatorRoutes.ts` owns the
door's six routes and arrow-key cycling over `NAV`. **Both keystroke hooks carry an `isEditable`
guard**: without it, typing in an account form pages the site on arrow keys and opens the door on
`sudo`.

**The footer's permanent `sign in` link is an invariant with a gate on it.** It lives in the footer
because that is the only chrome no layout hides. `npm run check` fails if the link is re-gated behind
a flag, if `App.tsx` stops rendering the footer unconditionally, or if any stylesheet gives
`.v-footer` `display: none`. The old five-tap-the-ornament route is **deleted**, not disabled — it
dead-ended, since `Ornament.tsx` returns `null` for the five `HIDES_ORNAMENT` layouts, two of which
are exactly what `PHONE_LAYOUTS` collapses to. **The logo's five taps are untouched**: those open the
door, a different affordance. The ornament renders on the phone band (do not re-hide it), and
non-desk bands get a header chip **labelled `menu`, not `cmd`** — it is the only route to a third of
the site off the desk, and it is gated. (The palette offers `[...NAV, ...FOOTER_NAV]`; an eighth nav
pill would change paging and Radial's dial for everybody.)

## CSS invariants

`src/styles/` holds seven stylesheets. **`interaction.css` owns every hover, press and disabled
state**, because two requirements were fighting over the same properties: the palette bleed needs
colour to cross-fade over 0.9s, and pointer feedback needs to land in ~140ms.

**The split is by property, not by selector.** Colour belongs to the palette at 0.9s; `translate` and
`scale` to interaction at 140ms/90ms. Nothing in the interaction layer animates a colour and the
palette never animates a position. `box-shadow` is the one property both want, given the fast timing
deliberately. Two consequences:

- **Use `translate` / `scale`, never `transform`** — they compose independently, and `transform` on
  `.v-block` stays reserved. It was for the cursor-lean tilt, **which is deleted and must stay
  deleted** (client, 2026-09-22 — it read as the page twitching; deviation 15, gated).
- **Selectors are prefixed `.vessel` to reach 0-2-0**, beating `chrome.css` and `overlays.css` on
  specificity rather than import order. Dropping the prefix silently reinstates the 0.9s hover.

Eleven gotchas, each of which has bitten once:

- **`band-*` and `layout-*` are on the same element** — `.band-phone .layout-stack` matches nothing;
  it must be `.band-phone.layout-stack`. **The twin trap is a correct compound that still cannot
  match**: the `layout-*` class is the *adapted* layout, so if `adaptLayout(id, band) !== id` that
  pair never reaches the DOM. Gated.
- **An animated `transform` beats a declared one — so centre with `translate`.** A rule declaring
  `transform: translateX(-50%)` beside `animation: … both` never applies its centring at any point.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`** — an animated declaration outranks
  the style attribute, so a forwards fill leaves `v-rise`'s `translateY(0)` owning the card for ever
  and the cursor-lean tilt never renders.
- **The entrance layer's `animation` shorthand outranks every layout and resets what it does not
  name.** `.has-entrances:not(.layout-console) .v-block` is **0-3-0** (`:not()` contributes its
  argument's specificity), so import order never enters into it, and the shorthand resets
  `animation-name`, `animation-timeline` and `animation-range` together. **A layout with a second
  animation must re-list both at the entrance layer**, not merely avoid the shorthand. Gated.
- **A from-only keyframe lands on the element's own declared value, so the property must interpolate
  from its initial one.** True for `translate`, `scale`, `rotate`, `opacity`. **Not for `clip-path`**,
  whose initial value is `none`: an `inset()` flips to it *discretely at 50%*. Elements animated this
  way declare the landing shape. Gated.
- **The chrome is a flex column, and Terminal is the one layout that opts out.** `.v-chrome` is
  `height: 100dvh` with `.v-stage` at `flex: 1; min-height: 0` — **`min-height: 0` is load-bearing**,
  since a flex child defaults to `min-height: auto`. **Terminal overrides to `height: auto;
  min-height: 100dvh` with `flex: 0 0 auto`** because its stage expects the *document* to scroll;
  clamped, it clips most of every page. **Do not "simplify" the clamp to `min-height` for everyone.**
  **`.vessel` and `.v-chrome` must use the same viewport unit** (`dvh`); `vh` reintroduces a nested
  scroll on any mobile browser showing its URL bar.
- **`scroll-snap-type: mandatory` is unsafe once a snap area outgrows the scrollport, and on the
  phone the hero does** (654px scrollport, 684px `.v-hero`) — mandatory snap must come to rest *on* a
  snap point, so releasing anywhere in the first screenful went back to the top. **Phones get
  `none`**, larger bands keep `proximity`.
- **`.v-stage` scrolls vertically, so its `overflow-x` computes to `auto`, not `visible`** — anything
  hanging off the side of a child (pseudo-elements included) gives the whole stage a horizontal
  scrollbar. Ambient-light pseudo-elements are pinned to `0` horizontally and widened, never bled.
- **A floated `::first-letter` is invisible inside a multi-column container** — Chrome reserves the
  float's box and never paints the glyph. Magazine is the only layout with `columns`, so it uses
  `initial-letter: 3 3` behind `@supports`.
- **`.v-account` is a child of `.v-stage`, not `.v-grid` — and one stage is a flex row**, so its
  `grid-column: 1 / -1` does nothing in Side-scroll. **A `max-width` cannot fix this** (a flex item
  with only a maximum still shrinks to its content), so it sets `width: min(100%, 34rem)`, and
  Side-scroll's stage opts out via `:has(.v-account)` — keyed on the form so a new account page
  inherits it. Both gated.
- **`clip-path` clips `box-shadow` away**, so the HUD's chamfered corners use a `drop-shadow` filter.
  Second consequence: `filter` makes an element a containing block for `position: fixed` descendants
  — safe on a content block, not on the grid or stage. **For the same reason the calm/404 `filter`
  lives on `.vessel`'s children, never on `.vessel`**, which would strand toasts in Terminal.

## Product decisions — do not revisit without asking

The spec's *Product decisions already made* table is binding. The ones most likely to be "fixed":

- **No city is ever named**, and the operator is not named. No client names on Work.
- **The email never appears in static markup** — assembled at runtime, click-to-reveal, copies on
  reveal, resets to unrevealed on page change.
- **No testimonials and no case studies unless they are real.** `/work` and `/guestbook` were
  removed 2026-09-23 because an earlier model session had invented all eleven. They are archived
  in `docs/RETIRED-PAGES.md` as a template only. Never restore that content, and never write a
  replacement: a fabricated case study is fake evidence of skill.
- **The operator door and its `authenticate` button are theatre.** Never present an unlock route as
  security.
- **The self-deprecating copy is *out*, and so is the one-person framing** (client's reversal, and
  **do not restore it from an earlier reading of this file**). What goes is smallness as the pitch or
  the punchline ("one guy", "no shopfront", "nobody to transfer you to") and every joke at his own
  expense. He is independent and first-person "I" stays. **The replacement is not corporate voice** —
  no "we", no "our team", no "solutions". The jokes stay and point outward: chains and their depots,
  Microsoft, subscriptions, scammers, the machines. Where a line's only content was the
  self-deprecation, **short and sweet beats a manufactured replacement**.
- **Calm is a second full aesthetic**, not a degraded first one, and it is the accessibility escape
  hatch for the deliberately low-contrast palettes.
- **Contact is the only page with a job.** It must work correctly at every stage of the build.
- **Nothing on the site advertises the site** — no palette inventories, no feature lists, no mention
  of pages a visitor cannot see. A joke that works by reciting an inventory is still reciting the
  inventory. The 404's page *list* stays: those are navigation.
- **The 404's page count moves whenever a content page is added** — "seven other pages" today,
  gated. The counts on that page are jokes that depend on being true.
- **No copy promises anything the client has not said, and no fee is named.** "Free diagnosis" and
  "Fixed, or you pay nothing" were both removed as untrue of the business. *"Rough quote back, free"*
  is deliberately untouched and still true. The pricing block states **which way the $150 goes** —
  "not a deposit and it does not come off the hourly rate" — because the wrong reading becomes an
  argument when the invoice arrives.
- **`/setup` puts the scam warning *above* the software, and that ordering is a safety decision.**
  Someone being talked through an install by a criminal is following steps, not browsing.
- **`scams` is deliberately left almost alone — do not "finish" it.** Its terms cannot be simplified
  away, because recognising them *is* the defence. Naming the nationalities of scam callers was
  proposed by the client and declined: accent is not who started the call, and who started the call
  is the entire defence the page teaches.
- **Copy is written for comprehension, not verbatim fidelity.** The failure mode was never long words
  — measured mean grade 5.0 — it was allusion. **Name the thing, then make the joke about it.**
- **Copy claims are audited separately from copy editing, and the two passes do not substitute.** A
  rewrite invents things — a tool, a percentage, a duration — because the invention reads better than
  the truth, having been chosen for rhythm. **The most dangerous shape is a retired promise rebuilt
  without its words**, which is why the gate tests `PAGES` and the snippets for the *form* of a
  promise, not for a phrase.
- **A quotation is somebody's words; an attribution is the writer's.** If real customer quotes
  ever appear, the attribution may be rewritten freely and the quote **never reworded** — editing
  one for rhythm manufactures a testimonial.
- **`/now` claims to be true today, so it may only ever contain true things.** It lists what is
  actually in for repair, which means **it goes stale by sitting still**, and a stale `now` page is
  worse than no `now` page. Same rule for `about`: there is no workshop yet, there is a bin of parts.
- **"Calm" is labelled "Plain" in the interface, and only there.** `config.calm`, `.is-calm`,
  `vessel.calm.v1` / `vessel.sound.v1` and share-code bit 8 keep the old name; renaming breaks stored preferences and
  codes in circulation for zero visible gain.

## Implementation traps

- **Title scramble** — the resolved h1 is the default state and the scramble decorates it. Drive it
  from rAF against a `performance.now()` deadline (550ms), never a frame counter or `setInterval`, or
  a throttled background tab strands the headline in garbage permanently. Each run carries a token so
  a superseded run cannot clear the live one's timer.
- **The time-of-day randomiser must not fire on a first visit** — Nebula Drift wins on load.
- **Persistence is validated field by field** in `src/config/persistence.ts`, never trusted.
- **Exactly two fields are stored and read back: `calm` and `sound`** (`vessel.calm.v1` /
  `vessel.sound.v1`), written only by their own toggles. The rule is what they share — they are the settings a *visitor* can set; everything else
  is appearance, which belongs to the operator and stays published-only. **Do not read either from
  the full-config echo `saveConfig` writes**, which freezes whatever was published on the first
  visit. **The test for a third is not "is this useful to remember" but "can a visitor set it at
  all."** **`loadConfig`'s no-published-config branch must still apply those two** — bare defaults
  switch the accessibility escape hatch off in exactly the degraded case (D1 unreachable).
- **The first visit gets one dialog, and it is not a cookie banner** (`Greeting.tsx`) — one sentence,
  one button, after 1.2s so it lands *after* the scramble. It stores a "seen it" flag; no choice is
  extracted. Returning visitors get the two chips flashing three times, and only while neither has
  been touched: a control advertising the off switch for motion must not become the most restless
  thing on the page.
- **OS-forced calm is the one exception, and there the dialog must extract a choice** — otherwise the
  only dialog on the page names a button to stop motion that is not happening. `calmBySystem` names
  that state. Three things are
  load-bearing: it **asks regardless of the greeting flag** (having seen the introduction and having
  answered the motion question are two facts); it **cannot become a nag**, being derived from the
  stored preference rather than latched; and turning motion on restores `grain`/`breathe` **from the
  config the visitor arrived with**. The still option leads, takes focus, and Escape agrees with it.
- **That button is also the capability probe, and says nothing about it** (`src/fx/perf.ts`). It
  times the work the effects actually do, at the real pixel ratio — **not `hardwareConcurrency`**,
  which counts cores and says nothing about the GPU. Two details are load-bearing: an **untimed
  warm-up round**, and a **pixel read-back**, without which the timer measures how fast commands were
  *enqueued* — the one number that looks healthy on a slow GPU. **It can only ever start three tiers
  down** (`TIERS[3]`); only the no-evidence branches land on `TIERS[2]`. Guessing high is right
  because demotion takes ~0.33s, while guessing low strands a fast machine soft for seconds.
- **The site's sound is synthesised and cannot play uninvited** (`src/audio/engine.ts`). No files, so
  the *Assets* rule holds; pitch derives from the palette, so no voice contains a literal frequency.
  **No ambient bed, no loop, no timer** — every voice is fired by a gesture, which is how autoplay
  policy is satisfied, and the `AudioContext` is not constructed until the first voice. `chime` is
  the single gate; **`play` never reads config**, so the audio layer cannot become a second opinion
  about a setting with a visible checkbox.
- **Focus traps stack, and dialogs + the command palette are *modal*** — global key and drag routes
  stand down, Escape stops propagation so one press closes one layer, and only the top trap handles
  Tab. **The panel and door are deliberately not modal**: `sudo` with the panel open opens the door.
- **Adapted layouts: the operator's stored layout is never overwritten** when a small screen
  collapses it — it re-emerges when the window widens. That state is surfaced nowhere.
- **Thirteen real URLs are wired in `src/data/pageIds.ts`** — six content pages (the spec's eight
  plus `/setup` and `/scams`, less `/gallery`, `/changelog`, `/work` and `/guestbook`, removed
  2026-09-23; `docs/RETIRED-PAGES.md`), `/404`, `/signup`, `/signin`, `/admin`, `/downloads`, and (phase 2)
  `/machines` and `/share`. **`PATHS` is a total map from a closed union**, which makes every link
  compiler-checkable — and **adding a content page moves the 404's page count**.
- **One route has something after it, and exactly one** — `/downloads/<name>`, whose names are D1
  rows and change while the site runs. `ConfigContext` carries it as `sub`, **deliberately not in
  `config`**, which is validated field by field, published to every visitor and packed into share
  codes. **Resist making the router general** — that total map is what pays for every other link.
  **`pageFromPath` defers to `subFromPath`, and the two agreeing is gated**: a path under the prefix
  with no valid sub is `notfound`, or the index renders at an address that is not the index and
  `go()` early-returns, so nothing ever corrects the URL. **A sub-page is `noindex` and canonicalises
  to `/downloads`**, since the SPA fallback answers unknown paths with 200 and would otherwise make
  an infinite family of soft 404s each canonicalising to itself.
- **The served head carries exactly one `<meta name="description">`, and it is not the page's lede.**
  `index.html` has a static one and `withPageMeta` appends its own, so the Worker **removes** the
  shell's before appending — two tags shipped for months and the static one, being first, is what
  Google quoted. **The static tag stays** (Pages is the rollback and has no Worker) and must stay
  true. Copy comes from `src/data/snippets.ts`: a lede is read after an eyebrow and a headline, a
  snippet arrives cold. **Home rotates by the day; `scams`, `setup` and `contact` never rotate** —
  those are written to be forwarded, and a page about fraud that describes itself differently each
  time it is forwarded is arguing against itself. Gated on both sides, length, the retired claims,
  the no-rotate list, and that every home line names the business.
- **The 404 pill left the public nav** and now leads `OPERATOR_NAV` (404 / Account / Admin / Share)
  plus a Config tab. Share is there because the one page that sets the machine up was
  undiscoverable once signed in; `machines` is deliberately not beside it (see `pageIds.ts`). **`OPERATOR_NAV` is deliberately not part of `NAV`**, which `useOperatorRoutes` cycles
  and Radial's orbit renders. The 404 *page* still renders for anyone at an unknown URL.
- **`FX` is the wire format; `PICKABLE_FX` is the menu.** Anything offering a choice to a human reads
  `PICKABLE_FX`; anything *resolving* a stored or shared value reads `FX`, because a hidden effect is
  unlisted, not invalid. **No entry carries `hidden` today, so the two are equal — keep both lists
  and the flag anyway**: it is the mechanism for withdrawing an effect without moving anyone's share
  code. Same split as `CATEGORIES` / `PICKABLE_CATEGORIES`.
- **Every surface that reads `PICKABLE_FX` is operator-gated.** A visitor's only appearance control
  is the calm toggle, and no visitor-facing control rolls the dice (the home page's "Show me something weird", which
  navigated to the removed gallery, is gone with it).
- **Presets define themselves structurally and derive their share code** (`src/data/presets.ts`) — a
  hardcoded `"N-7-5-3-5-3"` stays correct until a catalogue gains an entry and then becomes a
  *working* code pointing at the wrong palette. **A preset is a menu, so it may never name a `hidden`
  entry.** Gated by decoding each preset.
- **The toggle bitfield is where a new boolean goes, while bits remain** — `sound` 16, `slots` 32,
  `entrances` 64, the last stored **inverted** because its default is on and every code in
  circulation has the bit clear. **A non-boolean gets a field, not bits** — packing an enum into bits
  is how a catalogue gains an entry and overflows into its neighbour. **Both `PUBLISHED_KEYS` lists
  must gain the field**: `src/config/siteConfig.ts` and `worker/site-config.ts` are separate arrays,
  and either one missing it silently drops the value on publish. The gate compares them whole, in
  both directions — looking up fields by name gates only the one being added that day.
- **Share codes are base-36 and `FX` order is a wire format.** Effect index 12 is `C`, not `12`;
  `0-0-12-0-7-0` parses `12` as 38 and falls through to the default effect, which looks exactly like
  a failed deploy. **Append to `FX`, never insert.** Codes are **seven** fields since the station
  landed; five- and six-field codes still decode. `src/share/paths.ts` and `src/config/shareCode.ts`
  are covered by the harness because both are **wire formats whose failures are silent** — a wrong
  share code is a working code pointing at the wrong palette, so nothing throws and nothing logs.
- **`--type-display-weight`, not `--display-weight`; `--font-mono`, not `--mono`.** A `var()` with a
  fallback never fails and never logs, so four headings rendered at a hardcoded 600 in the browser's
  default mono. `npm run check` refuses **any** custom property a stylesheet reads that nothing
  writes — the general form, which found a third instance the day it was added.

**Canvas and effect internals live in `docs/INVARIANTS.md`** — the CSS-pixel buffer, the
screensaver, resize handling, the adaptive tier ladder, particle density, and the four rules
about making a trace legible. Read them before writing or editing an effect.

## Known deviations from the prototype

**The fifteen are listed in full in `docs/INVARIANTS.md`** — all deliberate, each with its reason.
**Add to that list rather than silently diverging.** In brief: guardrail evaluation is all-clauses
and must reach the page as well as the dice (1); focus-visible styles exist (2); Magazine's h1
minimum is the spec's `46px` (3); Matrix rain is rebuilt per column (4); "breathing" drives the
vignette (5); Contact's CTA reveals the address (6); the hero ornament is a setting with eight
entries, five withdrawn, and carries a *station* (7); the vitals strip is removed (8); duel blades
are literal colours (9); visible "vessel" branding is gone while **internal identifiers deliberately
keep the old name** (10); photo slots hold EXIF-stripped placeholders (11 — moot since 2026-09-23: the only pages with photos were removed, and `public/photos/` is gone); the contact sheet
duotones them in every mode including calm (12); **fourteen layouts, twenty-five palettes, sixteen
effects, all appended and never inserted** (13); six self-hosted variable webfonts, each paired with
a platform-picked system fallback (14); **the cursor-lean card tilt is deleted** (15).

## The duel

**Full invariants in `docs/INVARIANTS.md` — read that section before touching the duel.** Design in
`docs/DUEL.md` / `docs/DUEL-ABSORB.md`; costume work has its own skill (`duel-costumes`), which also
covers how to *see* any of this. The load-bearing few:

- **A roster of twenty-four, twelve a side**, and **the pools are derived from `side`, never
  hand-written** — two lists that must agree with the roster is how four of the original eight became
  unreachable.
- **No real names, anywhere** — the client's own rule, in his words at the top of `src/fx/fighters.ts`.
  Not even on operator-gated surfaces, because a name sits in the public bundle even when nothing
  renders it. **The argument that lands is technical**: this engine draws a silhouette plus one
  signature shape at ~200px and cannot draw face detail, and those characters are recognised by face.
- **The carve is not optional** — every mark is laid down in the palette's background role at a wider
  line before it is drawn in ink. **Do not revert this to strokes**; the flat, wire look it replaced
  is the thing the client rejected by name.
- **Interior detail is not a costume — the outline is.** Judge costumes on the contact sheet
  (`duel-shot.mjs sheet`), never in a single duel.
- **No sequence names a side**; every beat is `ATT` or `DEF` and the role coin consults nothing. The
  fairness gate counts **throws**, not match wins, and **a threshold may only rise when the evidence
  does**.
- **`dist` is the sole authority on whether a blow lands** — gating damage on blade geometry is what
  made blocked strikes drop damage.
- **The duel is configuration, and it publishes.** `validDuelSettings` and `validDuelPages` **refuse
  rather than repair**, field by field, walking OWN keys and never `key in`.
- **The duel integrates against `dt` (real elapsed frames), never `boost`** — every other effect is
  an ambient field that should surge; a duel is a performance and keeps its own tempo.
- **A frame delta is floored at 0, never above it** — a 0.2 floor is a 300Hz frame, and a 500Hz panel
  then runs 1.67× fast.
- **The duels are operator-only, enforced where the thing is drawn, never at the storage end** — else
  the operator's own published config silently rewrites itself when he looks at his site logged out.
- **The engine is a lazy chunk, never in the entry bundle** (2026-09-24) — `effects.ts` reaches it
  only through `loadDuelEngine`, `Ornament.tsx` through `lazy()`, and the config validator reads
  `src/fx/roster.ts` (ids, `SIDES`, pools — the one declaration of each fighter's side) rather than
  `fighters.ts`. One static import of `./duel` anywhere in the entry undoes it silently. Gated on the
  real bundle graph.
- **Every default is 1 and 1 must stay arithmetic identity**, so 360,000 stepped frames and 280,000
  generated sequences pass unchanged.

## Accounts

**Full invariants in `docs/INVARIANTS.md`.** `design/SPEC-ACCOUNTS.md` is approved and authoritative
— **read it before touching any of this**; §12 is a decision log where every rejected option keeps
its reasoning and a *"revisit if"* condition. The load-bearing few:

- **Sign-in is password + TOTP, with passkeys retained.** **No email is collected**, and the operator
  can reset any password — which is what makes email unnecessary.
- **Key slots (§5) are the load-bearing idea** — one grant keypair per account, wrapped once per
  credential, LUKS-style, so any credential opens the same key. **Operator escrow is rejected
  permanently**: a slot wrapped to an operator key would let the operator sign grants in a user's
  name, the exact thing the design exists to prevent.
- **The password never reaches the server** — the browser runs PBKDF2 and sends a derived auth
  secret, of which the Worker stores only an HMAC under a pepper.
- **No personal data, and §9 has the full inventory** so the claim can be checked. **Adding anything
  to that inventory is a spec change, not an implementation detail.**
- **Phases 1/2/3 must not be collapsed** — phase 2 fails as "my files don't load", phase 3 as "a
  stranger read my files."
- **A session says who you are, never how you proved it.** Every admin route that WRITES demands the
  caller's password (`proven()`), and the downloads editor and site publish draw the same line at
  **releases**, not writes.
- **Refuse, never repair**, and **the last-way-in guards live in the writes' own `WHERE` clauses**,
  not in a check before them — check-then-act lets two concurrent requests each count the other as
  "another way in".
- **`worker/index.ts` serves the static site with `/api/*` the exception** — **delete every route and
  the site serves as it does today**, which is what "accounts are strictly additive" has to mean.
- **Known wart:** the two wire-format sections in `auth-e2e.ts` sit *after* a reachability gate that
  exits when the Worker is not answering, so `npm run test:auth` without `npm run dev:worker` runs
  **none** of them and looks like an environment problem. Start the Worker.

## The sharing host, and the setup scripts

**Full invariants in `docs/INVARIANTS.md`.** `design/SPEC-SHARING.md` §4 is the design;
`docs/SHARING-SETUP.md` is the runbook. The load-bearing few:

- **That machine's DESKTOP is a separate repository, `../debian-desktop`, and the boundary is one
  question: can this take the file host offline?** Every privileged script stays here in `scripts/` —
  **`plasma-dark-setup.sh` must never move over there**, because it pins the X11 session the kiosk
  silently requires, and moving it puts that pin somewhere a change made for looks can take file
  sharing down.
- **The desktop half of the host is X11, and that is load-bearing rather than taste** — the kiosk
  blanks the screen with `xset` and hides the cursor with `unclutter`, both X11-only and **silently
  broken under Wayland**, giving you a kiosk that blanks itself.
- **The Chromium profile IS the pairing** — the persisted directory handle lives in its IndexedDB, so
  the kiosk is a systemd *user* service and the launcher must never gain `--user-data-dir` or
  `--incognito`. **Never `--no-sandbox`, and never systemd-harden the kiosk unit.**
- **A script cannot hand a browser a folder, and that is the feature, not the obstacle.** **The
  target is one click, once, forever — never zero.** Anything promising zero is a native agent.
- **The setup code carries no authority and must never become an API call.** **Phase S adds no table,
  no route and no credential** — that is what let it ship without a security review.
- **`decodeSetupCode` refuses; it never repairs** — including labels carrying bidi overrides or
  zero-width characters, and duplicate labels, because a label that *renders* as something other than
  what it stores is the whole attack.
- **The blocked-folder lists in all three scripts are a security control, and they are the ONLY
  barrier** — Chrome blocks those paths as "do not pick", never "do not read". **Never relax an entry
  to be helpful.** The rule covering the whole family of past holes: *a blocked thing must have no
  shareable neighbour holding the same secrets* — no shareable ancestor, self, or sibling.
  **Canonicalise first, fail closed, and check every component, not just the leaf.**
- **A gate for a barrier must DRIVE it, not read it** — all three blocklists are executed against
  throwaway home directories, one named with a space, and they fail against the pre-fix scripts.
- **`--undo` removes links, never their targets.** Deleting through a symlink is how somebody's
  photographs get deleted.

## Downloads

**Full invariants in `docs/INVARIANTS.md`.** `docs/DOWNLOADS.md` is the runbook. **The catalogue is a
database table, not TypeScript.** The load-bearing few:

- **The bucket is private and the bytes only ever leave through `worker/downloads.ts`.** Put a
  program in `public/` and the code box in front of it becomes decoration.
- **`id` is a wire format** — the R2 object key *and* the URL value, so it appears in links people
  keep. **Add ids, never rename one**, and every route that takes one normalises through `fileId`.
- **`resolveAccess` is the only thing that decides who may see what, and every read goes through
  it.** **Do not give any route a second opinion** — two checks that agree today are two checks that
  disagree after the next change.
- **Every refusal from the byte route is the same refusal, including "no such id"** — distinguishing
  404 from 403 makes the status code an existence oracle over the whole table.
- **Deleting a page deletes the codes minted for its FILES as well as for its slug**, because ids are
  re-usable in practice (`suggestFromFilename` derives one and the editor auto-fills it).
- **Zero is "no price", never "free"**, and `free` / `price_cents` stay independent in the table.
  **Prices render only when the page has `show_prices` set, which is off by default** — do not flip
  it; the decision is the operator's and the switch is how it stays theirs.
- **The downloads editor's children reset on `[slug]`; they are deliberately not keyed.** `key={slug}`
  leaves the outgoing `<div>` in the document — two file managers, the stale one still offering to
  save. **Do not "simplify" it back to a key.**

## Checks — run them, and add to them

`npm run check` is the gate (`scripts/check.ts`); `npm run check:fast` (~43s, measured 2026-09-24) is the same without the duel simulation and
runs automatically after every edit to `src/`, `worker/` or `scripts/` via the `PostToolUse` hook in
`.claude/settings.json`. The full pass is `predeploy`, so **nothing reaches production without it.**

It exists because one long session shipped a QR encoder that would not scan, a CSS rule silently
dropped by a scripted edit, an unreachable duel sequence, and an accessibility error that could never
have been announced. **Every one of them typechecked, built, and looked right.** The gap was never
"does it compile" — it was "does the thing it claims to do actually happen".

**A gate that reads the source is testing the source's SHAPE, not its behaviour.** Two gates were
green throughout the faults they were named after: the blocklist gate found every required entry
present while the lists were being consumed in a way that shattered them, and the passkey note
asserted a replay was caught by an index that had never looked at assertions. Both were true
sentences about the wrong question. **Where a gate can execute the thing, it must.**

**And breaking it is not a formality — two gates once passed while the fix was reverted.** One
restated the renderer's arithmetic from the same constant the renderer reads. The other drove
`duelCamera` directly, so it stayed green when the *ornament* stopped passing the setting, which was
the bug. **A gate for "does this control reach the page" has to read the page**, and a gate that
re-derives what it is checking only ever confirms its own copy. **If a new gate does not fail when
you break the fix, it is not a gate yet.**

**When you fix a bug that got past the checks, add a check.** That is the whole discipline.

**`npm run typecheck` runs THREE projects, and the third is `scripts/` itself**
(`tsconfig.scripts.json`). The gate suite — the
only thing between this repository and a bad deploy — **was typechecked by nothing at all**, since
`esbuild` strips types without checking them. Turning it on immediately found a promised compile
error that had never once fired, a simulator that had silently drifted from the interface it
implements (TypeScript checks method parameters **bivariantly**), and a structural copy of `R2Range`
that had drifted. **The deploy gate asserts `typecheck` still names all three.** One known hole:
`@cloudflare/workers-types` declares `const Buffer: any` globally, so a `Buffer` in `scripts/` is
unchecked.

**It cannot check everything, and the report says so out loud** rather than implying green means
correct: whether the fight *reads* well, whether a layout is beautiful or the copy sounds right,
whether a QR actually scans on a phone, and the operator surfaces, which need a signed-in session.
**A green suite is a floor, not a verdict.**

## Deployment

Served by a **Cloudflare Worker with static assets** (`wrangler.toml`), **not Pages** — Pages cannot
define Durable Object classes and this stack needs them twice (rate limiting now, one signalling
object per paired machine in phase 2). Cutover added a `routes` entry rather than deleting the Pages
custom domain, because a Workers route is evaluated ahead of one. **Rollback is deleting the `routes`
block and redeploying.**

- **Deploy with `npm run deploy`, never bare `wrangler deploy`.** `predeploy` typechecks *and* strips
  `dist/_redirects`, which Workers static assets otherwise parses as *configuration* and rejects as
  an infinite loop — the deploy fails outright at the API call. The typecheck is not redundant with
  `npm run build`: `wrangler deploy` bundles `worker/` with esbuild, which strips types without
  checking them.
- **`public/_redirects` stays** until the Pages project is deliberately retired — Pages still
  auto-deploys from `main` and is the rollback. `.assetsignore` does not help; validation happens
  before the upload list is filtered.
- **`public/_headers` stays and is *not* stripped** — unlike `_redirects` it is valid for both hosts,
  it is what gives `/assets/*` its `immutable`, and it is the bundles' `nosniff` on the Pages
  rollback. **Do not generalise "strip the config files at deploy" to this one.**
- **The Worker's SPA fallback is `not_found_handling`**, not `_redirects`.
- **An address that is not a page must be answered before the fallback reaches it** — the fallback
  says 200 and hands over the whole app shell, published config and all, at *any* unknown path.
  `crawlerFile` in `worker/page-meta.ts` holds four: the Google verification token, `/robots.txt`,
  `/sitemap.xml`, and **`/favicon.ico` + `/apple-touch-icon.png`, which are 404**. **A declared
  inline icon stops most *browsers* asking and does nothing about crawlers, unfurlers or iOS**, which
  fetches `/apple-touch-icon.png` when the site is saved to a home screen. 404 rather than a
  generated image, because *Assets* forbids adding one.
- **`run_worker_first = true`, with no negation.** It is what lets the Worker inline published site
  config into HTML — by default a request matching a real file never invokes the Worker, so `/` got
  no injection while `/contact` did. It used to be `["/*", "!/assets/*"]`, and **a negation is
  matched against the path, not against what exists at it**: every *miss* under `/assets/` was the
  asset server's SPA fallback — the shell with no security headers and a year-long `immutable` — live
  on production, frameable at any name somebody chose. Narrowing the glob to `*.js` only moves the
  name; nothing name-shaped closes it. A hit still keeps `immutable` from the asset binding, and
  `unvalidatable()` pins `max-age=0, must-revalidate` on every document it rewrites.
- **`workers.dev` is disabled**, since `workers_dev` defaults to false once a route exists. Wanted —
  it closes the signup endpoint that was publicly reachable before cutover. Setting it true reopens
  it.
- **`[dev] upstream_protocol = "https"`** is load-bearing for local development, not cosmetic.
- **Give a fresh deploy a few seconds** before testing routes; asset manifests propagate.

**HTTPS and headers.** **`URL.protocol = "https:"` silently does nothing in workerd** — the redirect
URL is built by concatenation **and** compared against the request before being sent, so the worst
case is "no redirect" rather than an infinite loop. **Keep that guard.** Loopback is exempt or
`wrangler dev` and `npm run test:auth` break.

**The origin test is one function, `foreignOrigin`, and both callers use it**: `crossOrigin` for
state-changing methods and `signalUpgrade` for the WebSocket handshake, which is a GET and so could
not reuse `crossOrigin` — its own copy compared the host alone, so the one long-lived authenticated
channel had a weaker test than a rename. Do not give either a second copy. **A state-changing request
whose `Origin` is present and is not ours is refused** — defence in depth behind `SameSite=Lax`,
covering the two places Lax does not reach: Chromium's two-minute grace on a freshly set cookie, and
same-site subdomains. **A missing `Origin` is allowed deliberately**: same-origin GETs and non-browser
clients omit it, and the harness is one of those. Do not tighten to "require an Origin" without
fixing the harness first. **`Sec-Fetch-Site: cross-site` is refused beside it** — browsers stamp it
and pages cannot alter it, so it covers the grace window even without an `Origin`; `same-site` is
deliberately not refused here because a sibling subdomain is the Origin check's job.

**The CSP is report-only, deliberately.** The nonce is minted per request, stamped on the inlined
site-config script by `withSiteConfig`, and named by `cspPolicy`; violations arrive at
`/api/csp-report` (visible in `wrangler tail`, written nowhere — §9 gains no field). **Do not add a
report store; the log line is the product.** `style-src 'unsafe-inline'` is deliberate — the theming
*is* style attributes, and `style-src-attr` would blank old Safari. **Flipping to enforcing is one
header rename in `harden`**, after production runs quiet through what the harness cannot drive: a
passkey ceremony, a phase-2 browse, TOTP enrolment, each effect. **`blob:` is deliberately absent**,
and `saveBlob` in `MachinesPage.tsx` depends on that staying understood: a download anchor is not
governed by fetch directives, so it should survive the flip, but it is the single unproven surface.
**Do not flip to enforcing until one real file has been downloaded from a phase-2 browse.**

Secrets (`AUTH_PEPPER`, `SESSION_SECRET`, `RATE_SALT_SEED`, `TOTP_ENC_KEY`) are Cloudflare secrets
and cannot be read back. **`AUTH_PEPPER` must stay backed up** — losing it invalidates every stored
auth hash, i.e. every password on the site, unrecoverably. `docs/BREAK-GLASS.md` is the last resort.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and
return for both overlays, a live region for toasts, focus-visible styles, CSS-level
`prefers-reduced-motion`, and a skip link. **The sleeping chrome takes `inert`**, so a faded-out
interface cannot be reached by Tab.

**The form convention: one `<form>` with an `onSubmit` calling `preventDefault()`, and a
`type="submit"` button.** Enter and the button are then the same code path instead of two that can
drift apart. `.v-paste` follows it — it used to submit on Enter only, with no button, so a share code
could not be applied by mouse or touch at all.

**`.v-paste` sets `outline: none`, and that is safe** — `.vessel :focus-visible` in `base.css` is
0-2-0 against that rule's 0-1-0, so it wins on specificity regardless of file order and the input
focuses with the normal 2px `--a1` ring. Verified in a browser. **Do not "fix" this.**

**Body text passes everywhere** — `--muted` on a card measures 6.26–8.57:1 across all 25 palettes.
**Calm cannot fix a palette contrast problem, by construction**: `themeVars()` changes five things in
calm and **none of them is `--fg`, `--muted`, `--faint` or `--a1`**. What calm remedies is the
canvas, which it hides outright, and that is where the real failures were. The standing rules:

- **The canvas wash is scoped to `.v-hero-text` alone** — the one case with genuinely no background.
  A wider scope reached 0-4-0 and silently outranked the layout-specific block rules, leaving desk
  and tablet Stack with *less* protection than before.
- **`--faint` is not a text colour** (2.78–4.09:1 on all 25 palettes). Text uses `--muted` —
  including the footer, which is real navigation, `::placeholder`, `.v-block-idx` (it renders "01"
  and is not `aria-hidden`) and `.v-panel-label` (operator-only is not a WCAG exemption). `.v-caret`
  and `.v-footer-dot` remain and genuinely are decorative.
- **`--a3`, the danger token, is exempt from calm's collapse** — collapsed into `--faint` it made
  destructive buttons and authentication errors the faintest thing on the page, in the mode every
  reduced-motion visitor lands in.
- **`--line` is not a contrast-bearing colour** (1.22–1.61:1) against 1.4.11's 3:1, so **controls use
  `--edge`** — **including `.v-cta`**, which was missed once and is the most important control on the
  site. Hairlines keep `--line`.
- Block headings are `h2`, not `h3`; the footer's current page carries `aria-current` and an
  underline rather than colour alone; `.v-hero-text` uses `min-width: min(300px, 100%)`, which a bare
  `300px` turned into 13px of horizontal overflow at a 320px viewport.

**Three palettes still fail on danger text** — oxide 3.00, xerox 4.07, peat 4.25 — down from all 25.
Consistent with this file's position on the low-contrast palettes rather than a new failure.
