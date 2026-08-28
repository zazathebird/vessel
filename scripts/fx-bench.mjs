/**
 * The FX bench — a self-contained page that RUNS all sixteen backgrounds.
 *
 * `fxlab.html` already renders the sixteen, and it is the right tool while the
 * dev server is up: it imports from `/src` and reloads as the source changes.
 * It cannot be *handed to anybody*. This builds one HTML file with the real
 * `src/fx/effects.ts` bundled into it and no external requests at all — no dev
 * server, no network, no webfont — so the operator can post it to a designer
 * who has never cloned the repo, exactly as `duel-bench.mjs` does for the fight.
 *
 *   node scripts/fx-bench.mjs [--out <dir>]
 *
 * It carries the three controls a review of these effects is impossible
 * without. **Palette**, because every effect reads its colours off the frame
 * and none of them owns one — sixteen effects across twenty-five palettes is
 * the actual surface, and a page showing one palette is showing 4% of it.
 * **Quality**, because the adaptive tier cannot reach a draw-call-bound effect,
 * so `rain` and `plasma` coarsen their own grid off it and that decision is
 * invisible anywhere else. **Step**, because an automated or occluded browser
 * reports `document.hidden`, `requestAnimationFrame` correctly parks, and a
 * page whose only clock is rAF then shows a reviewer nothing at all — the pair
 * of behaviours that cost three sessions and produced `fxlab.html`.
 *
 * Nothing here ships. It is built on demand and `dist/` has never heard of it:
 * Vite declares no `rollupOptions.input`, so the build has one entry and this
 * is not it. **If a multi-page input map is ever added, leave this out of it**
 * — same rule as `fxlab.html`, `sitelab.html` and `duel-bench.mjs`.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const OUT = outFlag >= 0 ? args[outFlag + 1] : mkdtempSync(join(tmpdir(), "fx-bench-"));
mkdirSync(OUT, { recursive: true });

/*
 * The entry imports by absolute path so esbuild resolves it from anywhere, and
 * it takes every list from the module that owns it rather than restating one.
 * A bench with its own copy of `FX` only ever confirms its own copy — and that
 * array is a wire format whose whole failure mode is a list that has drifted.
 *
 * `DEFAULT_DUEL_SETTINGS` comes from `src/data/duelSettings.ts` for the same
 * reason: `Frame.duel` is a required field, the two duel effects read it, and
 * a hand-built object here would be a second opinion about the defaults.
 */
const ENTRY = join(OUT, "entry.ts");
writeFileSync(
  ENTRY,
  `
import { drawFx } from ${JSON.stringify(join(ROOT, "src/fx/effects"))};
import { FX } from ${JSON.stringify(join(ROOT, "src/data/catalog"))};
import { PALETTES } from ${JSON.stringify(join(ROOT, "src/data/palettes"))};
import { TIERS } from ${JSON.stringify(join(ROOT, "src/fx/perf"))};
import { DEFAULT_DUEL_SETTINGS } from ${JSON.stringify(join(ROOT, "src/data/duelSettings"))};
(window as any).__FX = { drawFx, FX, PALETTES, TIERS, DEFAULT_DUEL_SETTINGS };
`,
);

const BUNDLE = join(OUT, "bundle.js");
await new Promise((resolve, reject) => {
  const p = spawn(
    "npx",
    [
      "esbuild",
      ENTRY,
      "--bundle",
      "--format=iife",
      "--minify",
      `--outfile=${BUNDLE}`,
      "--log-level=warning",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`esbuild exited ${c}`))));
});

const js = readFileSync(BUNDLE, "utf8");
const shell = readFileSync(join(ROOT, "scripts/fx-bench.template.html"), "utf8");

// A single marker, replaced with a function so a `$&` or `$1` anywhere in the
// minified bundle cannot be read as a replacement pattern.
const page = shell.replace("/*__FX_BUNDLE__*/", () => js);

const file = join(OUT, "fx-bench.html");
writeFileSync(file, page);
console.log(file);
