# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The project

"Vessel" — a personal site for an independent computer repair operator, being built from a complete
design handoff. React 18 + Vite + TypeScript.

```sh
npm run dev        # dev server on http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck  # types only
```

No test suite yet. No runtime dependencies beyond React — the routing, state, and styling are all
hand-rolled, deliberately (see *Assets* in the spec: no third-party libraries, no webfonts, no
images).

## The spec is authoritative

- `design/SPEC.md` — final copy, tokens, layouts, motion timings, product decisions
- `design/prototype.html` — an **executable** spec. It genuinely runs; every feature described in
  SPEC.md works in it. Open it in a browser and use it rather than guessing at behaviour. It pulls
  React and Babel from unpkg at load, so it needs network access
- `design/support.js` — the prototype's own renderer. **Do not port it and do not read it for design
  intent.** It is scaffolding
- `design/rejected-kaleidos.html` — an earlier direction that was rejected. Context only

Fidelity is high: every hex value, duration, and easing curve in the spec is intended, not
approximate. The two deliberate exceptions are photo slots (placeholders, real images don't exist
yet) and operator authentication (theatre — see below).

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
| 366 | `PAGES` — all nine pages' final copy → ported to `src/data/pages.ts` (with the one approved copy correction below) |
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

Per-frame values (mouse position, scroll velocity, card element list, keystroke buffer, drag origin,
scramble token) belong in refs, outside React state. The spec is explicit about this.

All of it is built: token layer, persistence, share codes, randomiser + guardrails, bands, routing,
page copy, the shared chrome, all thirteen layouts, all twelve canvas effects, the siteconfig panel,
the operator door and its six routes, the screensaver, calm mode, and the five motion systems.

`src/App.tsx` is the real shell. The three overlays (panel, door, screensaver) are siblings of
`.v-chrome` rather than children, because the screensaver fades the chrome to `opacity: 0` with
`pointer-events: none` and must not take the panel or the door with it.

Two CSS gotchas that have already bitten once each, both worth knowing before editing styles:

- **`band-*` and `layout-*` are on the same element.** `.band-phone .layout-stack` matches nothing;
  it has to be `.band-phone.layout-stack`. Every phone override was silently dead until this was
  found — and phones collapse almost everything to Stack, so it was the main phone path.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`.** An animated declaration outranks
  the style attribute, so a forwards fill would leave `v-rise`'s `transform: translateY(0)` owning
  the card for ever and the cursor-lean tilt — which is written to `el.style.transform` — would
  never render. The stagger only needs the from-state held during the delay.

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
- **Adapted layouts**: the operator's stored layout is never overwritten when a small screen
  collapses it; the hero metadata strip appends ` · adapted` so the state is never silently wrong
- **Routing**: the prototype swaps pages in place with no URL change. That is a prototype
  limitation, not a design decision — nine real URLs are already wired in `src/data/pageIds.ts`

## Known deviations from the prototype

Both deliberate. Add to this list rather than silently diverging.

1. **Guardrail evaluation** (`src/data/guardrails.ts`). The prototype's `ok()` tests each clause
   independently, so `{ type:["editorial"], pal:["datamosh"] }` rejects *every* Editorial config
   rather than only the Editorial+Datamosh pairing — Editorial can never be rolled. The spec says
   "Editorial type may not pair with the Datamosh palette", so a rule here matches only when all its
   clauses match. Every other rule behaves identically under both readings.
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
   There are now five — **Lens** (the default: a recessed eye where the geometry is dead still and
   only the light moves), Valve (unchanged), Aperture, Orrery, None — pickable in siteconfig,
   rollable under a sixth `ornament` scope, and carried as a sixth share-code field. All five sit in
   one square slot (`.v-ornament`), so the layouts that resize it and the ones that hide it need no
   knowledge of which is showing, and Radial's orbiting nav pills work over any of them.

   Two consequences worth knowing: `SCOPES` now has six entries, not the spec's five; and share
   codes are six fields, with five-field codes still decoding and simply leaving the ornament alone.

## Copy correction, approved by the client

The home page's third block is stale from v1: it reads "Twenty-four palettes, eight layouts" and
lists "8 layout archetypes", but v2 ships thirteen. **The client has confirmed the full option set
stays and the copy gets corrected.** When porting `PAGES` into `src/data/pages.ts`, the `home`
block with `kicker: "the site"` becomes:

- title: `Twenty-four palettes, thirteen layouts`
- list item 2: `13 layout archetypes`

Body text and the other three list items are unchanged. This is the **only** stale count in the
copy — the 404's "eight other pages" (nine pages minus itself), "six ways into a panel" (six unlock
routes), "24 colour palettes", "12 background modes" and "5 type systems" are all correct. Every
other line of copy is still verbatim-only.

## Where this stands, and what is next

The site is finished and deployed (`main` → Cloudflare Pages → `mcclevarty.ca`). The queued work,
in the order the client set:

1. **Accounts, saved setups, and brokered drive access.** Now specified in full:
   **`design/SPEC-ACCOUNTS.md`** — a *proposal*, not an approved spec, and **nothing in it is built**.
   Read it before touching any of this. Four decisions are already fixed by the client: an account
   holds the person's own *site setup* (not uploaded media), every user may expose their own machines
   (not just the operator), sign-in is passkeys with no email collected, and the spec gets approved
   before code. It phases into (1) accounts + saved setups, (2) your own drives, (3) grants to
   others — the phases are load-bearing and must not be collapsed, because phase 2 fails as "my files
   don't load" and phase 3 fails as "a stranger read my files."

   Two things in it that override older notes here: the store is **D1, not KV** (revocation needs
   read-after-write consistency), and per `SPEC.md` §Security the real auth **must not reuse the
   operator door's UI** — the door stays theatre.

   Still open, and listed in that spec's §12: who operates the relay, whether the agent gets
   code-signed, read-only vs write, folder vs whole-drive scoping, and whether a grantee needs an
   account. Those block phase 2, not phase 1.
2. *(folded into 1 — the drive half is phases 2 and 3 of the same spec)*
3. **Richer transitions, slide-overs and typewriter effects.** Requested, and sequenced after 1. The
   hard part is the constraint attached to it: every layout, palette and ornament has to stay
   visually distinct. That points at a small set of motion primitives each layout composes
   differently, rather than bespoke animation per layout — but confirm the approach before building.

One thing left unverified: the client has not yet confirmed the **Matrix rain fall speed** by eye.
It was rebuilt after they said the original was far too fast, and verified headlessly at 96–307
px/sec against the old 960 — but the browser session it was checked in could not run animation.
`RAIN_SPEED_MIN` and `RAIN_SPEED_RANGE` in `src/fx/effects.ts` are the two constants to adjust.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and
focus return for both overlays (`src/hooks/useFocusTrap.ts`), a live region for toasts, focus-visible
styles and CSS-level `prefers-reduced-motion`. The sleeping chrome also takes `inert`, so a faded-out
interface cannot be reached by Tab.

**One exception, found 2026-08-12 and not yet fixed.** `.v-paste` — the share-code field in the
siteconfig panel, and the only text input in the entire app — sets `outline: none`
(`src/styles/overlays.css:185-194`) with no `:focus-visible` replacement, so it has no visible focus
indicator inside a focus-trapped drawer. It also submits on Enter only, with no button, so a code
cannot be applied by mouse or touch alone. Both are worth fixing before any account form is built,
since there is no other form in the codebase and whatever ships first becomes the convention.

Still open, and genuinely unresolved rather than overlooked: several palettes fail WCAG AA on body
text. That is deliberate — Peat especially — and calm mode is the intended remedy.
