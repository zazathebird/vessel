/**
 * The FX eye — stills of all sixteen backgrounds, in this environment.
 *
 * Same problem `duel-shot.mjs` was built for, and the same answer. A screenshot
 * of a canvas here returns a stale frame: the tab reports `document.hidden`, so
 * `requestAnimationFrame` parks — correctly — and anything that renders on its
 * own clock never advances. So this drives the *real* `src/fx/effects.ts`
 * through headless Chrome with explicit synchronous steps, pulls the pixels
 * straight out of the canvas with `toDataURL`, and POSTs them back to a local
 * server to be written as PNGs. What comes out is what the site draws.
 *
 *   node scripts/fx-shot.mjs [--out <dir>] [--pal a,b,c] [--frames N]
 *                            [--only id,id] [--size WxH] [--port N]
 *
 * Two things it does deliberately:
 *
 * **Three palettes, not one.** An effect that reads on Nebula Drift is not an
 * effect that reads: every one of these takes all of its colour off the frame,
 * so the palette is not a skin over the picture, it *is* the picture. Xerox and
 * Solarpunk are here because they are the two ends — Xerox has one accent and
 * it is nearly grey, Solarpunk has three that are all bright and all close in
 * hue, and an effect that survives both survives the other twenty-two.
 *
 * **Every shot is 300 frames in, from a clean cache.** These are fields: a
 * particle system at frame 1 is a seed pattern nobody ever sees, and the
 * question is what the thing settles into. The frames are stepped one at a
 * time rather than in one bulk call, because the duel integrates against `dt`
 * and would otherwise advance four frames however large the argument.
 *
 * `Math.random` is replaced with a seeded generator for the duration of each
 * render, so the three palettes get structurally identical pictures and the
 * only thing that changed between them is the colour. Without it every shot
 * rolls its own particle field and its own pairing, and a palette comparison
 * is comparing two different scenes.
 *
 * The contact sheet is the tool that matters, exactly as it is for the
 * costumes: the useful question is *"can you tell these apart in a row"*, and
 * that cannot be asked of one effect at a time. Its tiles are the single shots
 * scaled down — the same pixels, not sixteen fresh renders at tile size — so
 * an effect never looks different on the sheet than in its own file. That
 * matters because the density of half of these is viewport-relative: `rain`
 * lays out columns at a 16px cell and `plasma` grids at 26px, so a render into
 * a 440px box is a genuinely different picture, not the same one smaller.
 *
 * Nothing here ships, and `dist/` has never heard of it. Same exclusion rule as
 * `fxlab.html`, `sitelab.html`, `duel-shot.mjs` and the two benches.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const OUT = flag("--out", mkdtempSync(join(tmpdir(), "fx-shot-")));
const PAL = flag("--pal", "nebula,xerox,solar");
const FRAMES = flag("--frames", "300");
const ONLY = flag("--only", "");
const SIZE = flag("--size", "1024x576");
/* Port 8899 by default and upward from there. A fixed port is what lets two of
 * these run side by side without one silently answering the other's POSTs. */
const PORT = Number(flag("--port", "8899"));
mkdirSync(OUT, { recursive: true });

/* The bundle and Chrome's profile go somewhere else, never into `--out`.
 * `duel-shot` puts them beside its shots and it does not matter there, because
 * that directory is a temp dir it prints. This one is aimed at a directory
 * somebody keeps, and a browser profile — tens of megabytes of it — sitting
 * among the PNGs makes the deliverable look like a build artefact. */
const WORK = mkdtempSync(join(tmpdir(), "fx-shot-"));

/* The browser half. Imports the shipping modules by absolute path so esbuild
 * resolves them from anywhere, and takes every list from the module that owns
 * it — `FX` is a wire format and a second copy here would only ever confirm
 * itself. `DEFAULT_DUEL_SETTINGS` is imported for the same reason: `Frame.duel`
 * is required, the two duels read it, and a hand-built object would be a
 * second opinion about the defaults. */
const ENTRY = join(WORK, "entry.ts");
writeFileSync(
  ENTRY,
  `
import { drawFx } from ${JSON.stringify(join(ROOT, "src/fx/effects"))};
import { FX } from ${JSON.stringify(join(ROOT, "src/data/catalog"))};
import { PALETTES } from ${JSON.stringify(join(ROOT, "src/data/palettes"))};
import { DEFAULT_DUEL_SETTINGS } from ${JSON.stringify(join(ROOT, "src/data/duelSettings"))};
(window as any).__FX = { drawFx, FX, PALETTES, DEFAULT_DUEL_SETTINGS };
`,
);

const BUNDLE = join(WORK, "bundle.js");
await new Promise((resolve, reject) => {
  const p = spawn(
    "npx",
    ["esbuild", ENTRY, "--bundle", "--format=iife", `--outfile=${BUNDLE}`, "--log-level=warning"],
    { cwd: ROOT, stdio: "inherit" },
  );
  p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`esbuild exited ${c}`))));
});

/*
 * The page. Every shot is drawn on demand and posted back; `done` ends the run.
 * `dpr` is 1 throughout: the effects receive CSS pixels either way because of
 * the base `setTransform`, and a 2x buffer would only quadruple the cost of a
 * software rasteriser for a picture nobody is going to view at 2x.
 */
const PAGE = `<!doctype html><meta charset=utf-8>
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<canvas id=work></canvas>
<canvas id=sheet></canvas>
<script src="/bundle.js"></script>
<script>
const F = window.__FX;
const q = new URLSearchParams(location.search);
const [W, H] = (q.get('size') || '1024x576').split('x').map(Number);
const FRAMES = Number(q.get('frames')) || 300;
const only = (q.get('only') || '').split(',').filter(Boolean);
const LIST = only.length ? F.FX.filter(e => only.includes(e.id)) : F.FX;
const PALS = (q.get('pal') || 'nebula').split(',').filter(Boolean)
  .map(id => F.PALETTES.find(p => p.id === id)).filter(Boolean);

const work = document.getElementById('work');
work.width = W; work.height = H;
const wctx = work.getContext('2d');

/* A seeded generator standing in for Math.random, so the same effect draws the
 * same scene on every palette. Restored afterwards — leaving it installed
 * would make every later shot in the run share one stream and quietly correlate
 * effects that have nothing to do with each other. */
const real = Math.random;
function seeded(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/* One effect, from a clean cache, FRAMES frames in.
 *
 * The arithmetic is FxCanvas's: base setTransform every frame (so a missed
 * restore inside an effect cannot mirror the rest of the run, and so rain and
 * plasma receive CSS pixels), then t += 0.011 * boost. Stepped one frame at a
 * time — the duel integrates against dt and a bulk call is not the same thing. */
function render(entry, palette) {
  Math.random = seeded(20260828);
  const cache = {};
  let t = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    const boost = 1;
    t += 0.011 * boost;
    F.drawFx(entry.id, {
      ctx: wctx, w: W, h: H, p: palette, duel: F.DEFAULT_DUEL_SETTINGS,
      t, beat: (Math.sin(t * 1.9) + 1) / 2, boost, sleeping: false,
      dt: 1, quality: 1, mx: 0.5, my: 0.5,
    }, cache);
  }
  Math.random = real;
}

async function post(canvas, name) {
  await fetch('/shot?name=' + encodeURIComponent(name), {
    method: 'POST', body: canvas.toDataURL('image/png'),
  });
}

const sheet = document.getElementById('sheet');
const sctx = sheet.getContext('2d');

(async () => {
  for (const palette of PALS) {
    const cols = 4;
    const tw = 440, th = Math.round(440 * H / W), band = 26, head = 44;
    const rows = Math.ceil(LIST.length / cols);
    sheet.width = tw * cols;
    sheet.height = head + rows * (th + band);
    sctx.fillStyle = '#0b0d12';
    sctx.fillRect(0, 0, sheet.width, sheet.height);
    sctx.fillStyle = '#e8ecf5';
    sctx.font = '600 18px ui-monospace, monospace';
    sctx.textAlign = 'left';
    sctx.fillText(palette.name + '  ·  ' + palette.id + '  ·  ' + FRAMES + ' frames  ·  ' + W + 'x' + H,
      14, 28);

    for (let i = 0; i < LIST.length; i += 1) {
      const entry = LIST[i];
      render(entry, palette);
      await post(work, entry.id + '-' + palette.id);

      const ox = (i % cols) * tw;
      const oy = head + ((i / cols) | 0) * (th + band);
      sctx.fillStyle = '#000';
      sctx.fillRect(ox, oy, tw, th);
      sctx.drawImage(work, ox, oy, tw, th);
      sctx.strokeStyle = 'rgba(232,236,245,0.22)';
      sctx.lineWidth = 1;
      sctx.strokeRect(ox + 0.5, oy + 0.5, tw - 1, th - 1);
      sctx.fillStyle = '#e8ecf5';
      sctx.font = '13px system-ui, sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText(entry.label, ox + 8, oy + th + 18);
      sctx.fillStyle = '#6f8ab7';
      sctx.font = '12px ui-monospace, monospace';
      sctx.textAlign = 'right';
      sctx.fillText(entry.id, ox + tw - 8, oy + th + 18);
    }
    await post(sheet, 'sheet-' + palette.id);
  }
  await fetch('/done', { method: 'POST' });
})().catch(async (e) => {
  await fetch('/fail', { method: 'POST', body: String((e && e.stack) || e) });
});
</script>`;

const files = { "/bundle.js": ["text/javascript", BUNDLE] };
let finish;
const finished = new Promise((r) => (finish = r));
const written = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/shot" || url.pathname === "/done" || url.pathname === "/fail") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (url.pathname === "/shot") {
        const name = url.searchParams.get("name");
        const png = Buffer.from(body.split(",")[1] ?? "", "base64");
        const path = join(OUT, `${name}.png`);
        writeFileSync(path, png);
        written.push(`${path} (${(png.length / 1024).toFixed(0)}KB)`);
        console.log(`  ${name}.png`);
      }
      if (url.pathname === "/fail") finish({ error: body });
      if (url.pathname === "/done") finish({});
      res.writeHead(200).end("ok");
    });
    return;
  }
  if (files[url.pathname]) {
    const [type, path] = files[url.pathname];
    res.writeHead(200, { "content-type": type });
    res.end(readFileSync(path));
    return;
  }
  res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
});

/* Bind upward from the requested port rather than taking whatever the OS
 * offers: a fixed base is what lets a second run be told to go elsewhere, and
 * walking up means a stale server from a killed run does not stop this one. */
const port = await new Promise((resolve, reject) => {
  let candidate = PORT;
  const tryPort = () => {
    server.once("error", (e) => {
      if (e.code === "EADDRINUSE" && candidate < PORT + 40) {
        candidate += 1;
        tryPort();
        return;
      }
      reject(e);
    });
    server.listen(candidate, "127.0.0.1", () => resolve(candidate));
  };
  tryPort();
});

const query =
  `?pal=${encodeURIComponent(PAL)}&frames=${encodeURIComponent(FRAMES)}` +
  `&only=${encodeURIComponent(ONLY)}&size=${encodeURIComponent(SIZE)}`;

const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${join(WORK, "chrome")}`,
    // Generous, because sixteen effects at 300 frames on a software rasteriser
    // is real work and the budget is what stops the tab being torn down under
    // it. Virtual time only advances while the renderer is idle, so a
    // synchronous render does not spend any of it.
    "--virtual-time-budget=900000",
    `http://127.0.0.1:${port}/${query}`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
chrome.stderr.on("data", (d) => (stderr += d));

const timeout = setTimeout(() => finish({ error: `timed out\n${stderr.slice(-2000)}` }), 900_000);
const result = await finished;
clearTimeout(timeout);
chrome.kill();
server.close();

if (result.error) {
  console.error(`fx-shot failed:\n${result.error}`);
  process.exit(1);
}
console.log(`${written.length} shots in ${OUT}`);
for (const w of written) console.log(`  ${w}`);
