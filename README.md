# vessel

A personal site for an independent computer repair operator. Deliberately over-designed: a
configurable visual toy wrapped around one genuinely useful page (Contact).

React 18 + Vite + TypeScript. No runtime dependencies beyond React — no CSS framework, no router
library, no webfonts, no images. Every graphic is CSS or canvas.

## Commands

```sh
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
npm run typecheck  # types only
```

There is no test suite yet.

## Where things are

| Path | What |
|---|---|
| `design/SPEC.md` | The design spec. Final copy, tokens, layouts, motion, product decisions |
| `design/prototype.html` | The executable spec — open it in a browser, everything in it works |
| `src/data/` | Palettes, layouts, effects, typefaces, page copy, randomiser guardrails |
| `src/config/` | Config state, persistence, share codes, randomiser, responsive bands |
| `src/theme.ts` | Collapses palette + type + layout + band + calm into CSS custom properties |
| `src/styles/base.css` | Token-driven base layer and keyframes |

`CLAUDE.md` carries the working notes: which decisions are binding, where the copy lives, and the
implementation traps the spec calls out.

## Build status

Done: project scaffold, token layer, config state with validated persistence, share codes, the
randomiser and its guardrails, responsive bands with adapted-layout collapsing, real URLs for all
nine pages.

Page copy (`src/data/pages.ts`) is ported. Next, in order: the shared chrome and Cinematic layout,
the other twelve layouts, the twelve canvas effects, the siteconfig panel, calm mode, the five
motion systems, then the accessibility pass.

`src/App.tsx` is currently a scaffold that renders the state machine, not the design. It gets
replaced.

## Two things that are decisions, not bugs

- **No city is named anywhere**, and the operator is not named. That is the About page's content.
- **The operator panel's `authenticate` button is theatre.** There is no backend and nothing behind
  the door but a settings drawer. It must never guard anything that matters.

The full list is in `design/SPEC.md` under *Product decisions already made*.
