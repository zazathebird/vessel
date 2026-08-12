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
| `src/data/` | Palettes, layouts, effects, ornaments, typefaces, page copy, randomiser guardrails |
| `src/config/` | Config state, persistence, share codes, randomiser, responsive bands |
| `src/theme.ts` | Collapses palette + type + layout + band + calm into CSS custom properties |
| `src/fx/` | The twelve canvas backgrounds, and the per-frame values kept outside React |
| `src/hooks/` | Title scramble, the pointer-driven motion systems, unlock routes, focus trap |
| `src/styles/base.css` | Token-driven base layer and keyframes |
| `src/styles/chrome.css` | Shared chrome, the ornaments, and the four structural layouts |
| `src/styles/layouts.css` | The nine layouts that are pure overrides on the Cinematic baseline |
| `src/styles/overlays.css` | siteconfig drawer, operator door, screensaver |

`CLAUDE.md` carries the working notes: which decisions are binding, where the copy lives, and the
implementation traps the spec calls out.

## Build status

**The site is complete and deployed.** Every screen, layout, effect and interaction the spec
describes is built: the shared chrome, all thirteen layouts, all twelve canvas backgrounds, the
siteconfig panel, the operator door and its six unlock routes, the screensaver, calm mode, the five
motion systems, the responsive bands, and the accessibility pass.

Beyond the spec, at the client's request: the hero ornament is a setting rather than a fixture (five
of them, see `src/data/ornaments.ts`), and the Matrix rain background was rebuilt to match the film.
`CLAUDE.md` lists every deliberate deviation with its reasoning.

Deployed from `main` to Cloudflare Pages, which builds on every push. Live at `mcclevarty.ca`;
`mcclevarty.com` redirects to it.

### Not done

- **Accounts and saved setups.** A setup is already fully expressible as a share code, so this is
  close to "persist a share code against an identity" — but it needs auth and a store, which is the
  first thing to break the no-backend model.
- **Richer transitions and typewriter effects**, requested and deliberately sequenced after the
  above. The constraint that makes this non-trivial: every layout, palette and ornament has to stay
  visually distinct, so it wants a small set of motion primitives that each layout composes
  differently rather than bespoke animation per layout.
- **Photo slots are still placeholders.** Real images do not exist yet. When they arrive: strip
  EXIF, lazy-load, keep the aspect ratios in each caption, and do not add a lightbox library.
- **No test suite.**

## Two things that are decisions, not bugs

- **No city is named anywhere**, and the operator is not named. That is the About page's content.
- **The operator panel's `authenticate` button is theatre.** There is no backend and nothing behind
  the door but a settings drawer. It must never guard anything that matters.

The full list is in `design/SPEC.md` under *Product decisions already made*.
