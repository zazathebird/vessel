/**
 * The duel bench — a self-contained page that PLAYS the fight.
 *
 * `scripts/duel-shot.mjs` is the stepper: it exists because this environment
 * cannot show animation (the tab reports `document.hidden`, so rAF parks), and
 * it answers *"what does this frame look like"*. It cannot answer the question
 * the client actually asks, which is **"does the fight read"** — that question
 * is about tempo, rhythm and whether an exchange builds, and none of those
 * exist in a still.
 *
 * So this bundles the *real* `src/fx/duel.ts` and the *real* `duelCamera` into
 * one HTML file with no external requests, and hands it to somebody whose
 * browser is not headless. What it draws is what the site draws, at the size
 * the site draws it — the ornament's own 700-unit buffer, scaled the way CSS
 * scales it in the hero.
 *
 *   node scripts/duel-bench.mjs [--out <dir>]
 *
 * Nothing here ships. It is built on demand, like `duel-shot`, and `dist/` has
 * never heard of it: Vite declares no `rollupOptions.input`, so the build has
 * one entry and this is not it. **If a multi-page input map is ever added,
 * leave this out of it** — same rule as `fxlab.html` and `sitelab.html`.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const OUT = outFlag >= 0 ? args[outFlag + 1] : mkdtempSync(join(tmpdir(), "duel-bench-"));
mkdirSync(OUT, { recursive: true });

/*
 * The entry imports by absolute path so esbuild resolves it from anywhere, and
 * it takes `duelCamera` from `DuelOrnament` rather than re-deriving it —
 * exactly the reason that function is exported and pure. A bench with its own
 * camera only ever confirms its own camera.
 */
const ENTRY = join(OUT, "entry.ts");
writeFileSync(
  ENTRY,
  `
import {
  advanceDuel, createDuelFrom, createDuel, drawDuel,
  FIGHTERS, BLADE_COLORS, DUEL_POOLS,
} from ${JSON.stringify(join(ROOT, "src/fx/duel"))};
import { duelCamera, ORNAMENT_PX } from ${JSON.stringify(join(ROOT, "src/components/DuelOrnament"))};
import { PALETTES } from ${JSON.stringify(join(ROOT, "src/data/palettes"))};
(window as any).__DUEL = {
  advanceDuel, createDuelFrom, createDuel, drawDuel,
  FIGHTERS, BLADE_COLORS, DUEL_POOLS, duelCamera, ORNAMENT_PX, PALETTES,
};
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
const shell = readFileSync(join(ROOT, "scripts/duel-bench.template.html"), "utf8");

// A single marker, replaced with a function so a `$&` or `$1` anywhere in 260KB
// of minified engine cannot be read as a replacement pattern.
const page = shell.replace("/*__DUEL_BUNDLE__*/", () => js);

const file = join(OUT, "duel-bench.html");
writeFileSync(file, page);
console.log(file);
