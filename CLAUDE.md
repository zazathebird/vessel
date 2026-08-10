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

Built: token layer, persistence, share codes, randomiser + guardrails, bands, routing, page copy.
Not built: all real chrome, layouts, canvas effects, siteconfig panel, calm mode's full treatment,
the five motion systems, screensaver, unlock routes.

`src/App.tsx` is a scaffold that renders the state machine so it can be verified in a browser. It is
not the design and gets replaced.

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

## Accessibility gaps still open

The spec lists these as work to do, not design intent: accessible button names, `aria-current` on
nav, focus trapping and focus return for the panel, a live region for toasts. Focus-visible styles
and CSS-level `prefers-reduced-motion` are already handled in `base.css`.
