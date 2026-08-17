---
name: verify-site
description: Drive and verify mcclevarty.ca in a real browser — any route, any of the fourteen layouts, any of the three bands, calm on or off. Use whenever a change needs to be SEEN rather than assumed, when checking the phone band, when a string must be confirmed in the live DOM, or when the site "looks broken/still/dead". Encodes four environment traps that have each cost a session.
---

# Verifying this site in a browser

The client's standing instruction is **never guess or assume — open the page, run the test.**
This skill exists because doing that here is not obvious: four separate traps make the naive
approach silently report the wrong thing, and each has cost at least one session.

## The four traps, first — they explain everything below

1. **`resize_window` silently fails.** `innerWidth` stays 1536 no matter what. The phone band is
   therefore *not* reachable by resizing. Use an iframe (below).
2. **This browser reports `prefers-reduced-motion: reduce`.** The site correctly puts that visitor
   into calm, and calm is total: canvas at `opacity: 0`, every animation stripped. So the default
   state here shows you a site with nothing moving, which is *correct behaviour* and looks exactly
   like a bug. Two "nothing is live" reports were spent on this.
3. **The tab reports `document.hidden`, so `requestAnimationFrame` parks.** Measured: zero callbacks
   in 900ms. **Canvas effects and animation can never be observed here in any form.** Anything
   rAF-driven cannot be watched — only stepped (see *Things that cannot be watched*).
4. **Verify strings in the live DOM, not in a green build.** A find-and-replace with escaped quotes
   has silently no-opped while the page still built and rendered fine.

## Start the bench

```sh
npm run dev          # Vite on :5173 — no Worker, no D1, no API
npm run dev:worker   # only if you need /api/* — kill stray wrangler first; see CLAUDE.md
```

`sitelab.html` is the site bench (`fxlab.html` is the *effects* bench — different tool, see below).
Both are dev-only by construction: Vite declares no `rollupOptions.input`, so `dist/` receives
neither. If a multi-page input map is ever added, leave both out of it.

## Reaching a band — the iframe is the only way

The band is computed from `window.innerWidth`, and inside an iframe that is the **iframe's** width.
So a framed page reports a *real* band, not a simulated one. Vite sends no `x-frame-options`;
production sends `DENY`, which is why this only works against localhost.

```
http://localhost:5173/sitelab.html?band=phone          # 420x860  -> band-phone
http://localhost:5173/sitelab.html?band=tablet         # 760x1024 -> band-tablet
http://localhost:5173/sitelab.html?band=desk           # 1280x820 -> band-desk
```

Breakpoints are `PHONE_MAX = 560` and `TABLET_MAX = 900` (`src/config/bands.ts`). The widths above
sit *inside* each band rather than on its edge. **The tablet band is wide (560–899) and behaves
differently across it** — a nav regression lived at 600px while 760px was fine, so test the bottom
of the band, not just the middle.

## Reaching a layout

Appearance is published-only and the panel is operator-gated, so in `npm run dev` every page renders
`DEFAULT_CONFIG` and thirteen of the fourteen archetypes are unreachable. `sitelab.html` writes
`window.__VESSEL_SITE__` before the bundle loads — the real published-config path, not a debug hook.

```
?layout=hud              ?fx=telemetry        ?pal=0..24        ?type=0..4
?ornament=<OrnamentId>   ?calm=1              ?path=/scams      ?slots=1
?all=1                   # every layout at once, captioned with what the band adapts it to
```

Combine freely: `?all=1&band=phone&path=/contact`. An amber arrow in a caption means the band
adapts that layout to another one, so the cell is showing the **adaptation**, not the archetype —
on the phone band most layouts collapse to Stack.

## Defeating forced calm (trap 2) — do this or you are reviewing the wrong site

Calm is on because the OS asks for it *and* no preference is stored. Store one:

```js
localStorage.setItem('vessel.calm.v1', '0');   // calm off — see the real site
localStorage.setItem('vessel.greeted.v1', '1'); // suppress the greeting dialog
localStorage.setItem('vessel.sound.v1', '0');   // keep it quiet
location.reload();
```

Set these on `localhost:5173` (the iframe is same-origin, so the parent can set them). Confirm it
worked by reading the wrapper's classes — you want `is-alive`, not `is-calm`:

```js
document.querySelector('.vessel').className
// page-home vessel layout-stack band-phone is-alive has-grain has-breathe has-cursor
```

**Calm is a second full aesthetic, not a degraded one.** Review it deliberately with `?calm=1` —
just don't let it be the thing you review by accident.

## Traps 5 and 6, found 2026-08-17 during the accessibility audit

5. **`:focus` never matches, so focus styles cannot be observed.** The window has no OS
   focus — `document.hasFocus()` is `false` — and `:focus` / `:focus-visible` are scoped to the
   focused document. `el.focus()` *does* move `document.activeElement`, so the two disagree and the
   naive check reports a broken focus style that is actually fine. To test one, add a temporary
   class rule at the **same specificity** as the `:focus` rule and confirm nothing overrides the
   declaration:

   ```js
   const st = document.createElement('style');
   st.textContent = '.vessel .v-skip.__probe { transform: translateY(0); }';  // matches 0-3-0
   document.head.appendChild(st);
   el.classList.add('__probe');
   // …measure, then clean up
   ```

6. **`getComputedStyle` returns gamma-shifted colours inside the app frame** — `#0b0a1f` reads back
   as `rgb(9, 8, 25)`. Close enough to look right, wrong enough to move a contrast ratio across a
   WCAG boundary. Compute contrast from the **tokens** (`src/data/palettes.ts` plus the `--panel`
   rules in `theme.ts`), not from `getComputedStyle`. For canvas contrast, sample real pixels out of
   `fxlab.html` after stepping frames.

**And a CSS-editing hazard that cost a round trip here:** inserting a rule "after" a declaration by
matching on one of its properties can land the new rule *inside* the old block, leaving a stray `}`.
The site still renders — CSS error recovery skips to the next valid rule — so the symptom is one
rule silently not applying, not a visible break. Check balance after any scripted CSS edit:

```sh
node -e "const c=require('fs').readFileSync('src/styles/chrome.css','utf8');let d=0,b=0;for(const x of c){if(x==='{')d++;else if(x==='}'){d--;if(d<0){b++;d=0}}}console.log(b,d)"
```

## Verifying a string (trap 4)

Never conclude from the source file or a green build.

```js
document.body.innerText.includes('the exact string')
document.querySelector('h1').textContent
```

## Things that cannot be watched here, and what to do instead

Canvas effects, the duel, entrance animations, the 60-second screensaver, and any rAF-driven
transition. rAF is parked (trap 3). Two escape hatches:

- **`fxlab.html`** — all sixteen effects, driven through `FxCanvas`'s exact frame maths by an
  explicit **Step** button instead of rAF. This is the only way to see an effect here. Contact-sheet
  mode: `?sheet=<id>&cols=1`.
- **Make the decision pure and test it in Node.** This is the established pattern in this codebase,
  not a workaround: `duelCamera` and `edgeState` are both exported pure functions *because* the
  thing they drive cannot be observed here. If you are about to write logic you cannot watch,
  extract the decision, then step it:
  ```sh
  ./node_modules/.bin/esbuild --bundle /tmp/t.ts --platform=node --outfile=/tmp/t.js && node /tmp/t.js
  ```
  (`npx tsx` misbehaves in this environment; esbuild is a devDependency and is what `test:auth` uses.)

**Say so when something could not be observed.** "Verified" and "could not be watched here" are
different claims, and the client has explicitly called out the difference.

## Sweeping every route

Sixteen routes (`src/data/pageIds.ts`): `/ /scams /about /work /gallery /contact /guestbook /now
/changelog /setup /404 /signup /signin /admin /machines /share`.

Reuse one iframe and swap `src` rather than opening sixteen tabs. Worth probing per route:
horizontal overflow (`documentElement.scrollWidth - innerWidth`, a documented trap class),
console errors, images missing `alt`, controls with no accessible name, unlabelled inputs.

## Verifying a deploy

```sh
npm run deploy       # never bare `wrangler deploy` — see CLAUDE.md
sleep 6              # asset manifests propagate
```

Then confirm the change is *in the shipped bundle*, not just in the repo:

```sh
html=$(curl -s https://mcclevarty.ca/)
css=$(echo "$html" | grep -o '/assets/index-[A-Za-z0-9_-]*\.css' | head -1)
curl -s "https://mcclevarty.ca$css" | grep -o 'your-selector[^{]*{' 
```

Production **can** be driven directly for desk-band and DOM checks; it cannot be framed
(`x-frame-options: DENY`), so band testing stays on localhost.
