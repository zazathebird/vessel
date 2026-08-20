/**
 * The duel's eye — the only way to look at this effect in this environment.
 *
 * `requestAnimationFrame` parks here (the tab reports `document.hidden`) and a
 * screenshot returns a stale frame, so nothing that renders on its own clock
 * can be reviewed. This drives the *real* `src/fx/duel.ts` through headless
 * Chrome with explicit `step` calls, pulls the pixels straight out of the
 * canvas with `toDataURL`, and POSTs them back to a local server to be written
 * as PNGs. What comes out is what the site draws.
 *
 *   node scripts/duel-shot.mjs sheet      one guard per fighter, side by side
 *   node scripts/duel-shot.mjs strip      an exchange, every Nth frame
 *   node scripts/duel-shot.mjs move       one named move, frame by frame
 *   node scripts/duel-shot.mjs scale      one pairing at desk and phone size
 *   node scripts/duel-shot.mjs all        all of the above
 *
 * `move` is how a new move gets looked at. It does **not** force the move —
 * there is no back door into the engine and there should not be one. It steps a
 * real fight until the director happens to call for it, which also means what
 * comes out is the move in the company it actually keeps: the sweep with a
 * fighter jumping it, the throw with the parry that answers it.
 *
 * Output goes to `--out <dir>` (default: a temp dir it prints).
 *
 * The contact sheet is the tool that matters. A costume problem is *"can you
 * tell them apart at a glance, in a row"*, and that question cannot be asked of
 * one duel, because in one duel you are never comparing.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const modes = args.filter((a) => !a.startsWith("-"));
const outFlag = args.indexOf("--out");
const OUT = outFlag >= 0 ? args[outFlag + 1] : mkdtempSync(join(tmpdir(), "duel-shot-"));
const MODE = modes[0] ?? "all";
mkdirSync(OUT, { recursive: true });

/* The browser half. Imports the shipping module by absolute path so esbuild
 * resolves it from anywhere, and does every draw synchronously — no rAF. */
const ENTRY = join(OUT, "entry.ts");
writeFileSync(
  ENTRY,
  `
import {
  advanceDuel, createDuel, drawDuel, duelFocus, FIGHTERS, FEET_Y, WORLD_W, WORLD_H,
  BLADE_COLORS,
} from ${JSON.stringify(join(ROOT, "src/fx/duel"))};
(window as any).__DUEL = {
  advanceDuel, createDuel, drawDuel, duelFocus, FIGHTERS, FEET_Y, WORLD_W, WORLD_H, BLADE_COLORS,
};
`,
);

const BUNDLE = join(OUT, "bundle.js");
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
 *
 * Palette values are Nebula Drift's — the site's default and what a cold load
 * shows — because a costume that only reads on one palette is not fixed.
 */
const PAGE = `<!doctype html><meta charset=utf-8>
<style>html,body{margin:0;background:#0b0d12}canvas{display:block}</style>
<canvas id=c></canvas>
<script src="/bundle.js"></script>
<script>
const D = window.__DUEL;
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const INK = '#e8ecf5', BG = '#0b0d12', LINE = '#2a3040', SPARK = '#ffe9a8';

function view(over) {
  return Object.assign({
    x: 0, y: 0, scale: 1, ink: INK, bladeA: '#3d9bff', bladeB: '#ff3b30',
    core: INK, spark: SPARK, line: LINE, bars: false, dim: 1,
  }, over);
}
async function shot(name) {
  await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: c.toDataURL('image/png') });
}
function bg(w, h) {
  c.width = w; c.height = h;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
}
function label(text, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.5; ctx.fillStyle = INK;
  ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* One fighter per cell, in the guard it stands in, at the size the ornament
 * camera actually renders (~109px figure on desk, ~61px on a phone). The pair
 * is drawn clipped to the cell and offset so the subject lands in the middle. */
function sheet(px, tag, frame) {
  const ids = Object.keys(D.FIGHTERS);
  const cw = px, ch = Math.round(px * 1.25), cols = 4;
  const rows = Math.ceil(ids.length / cols);
  bg(cw * cols, ch * rows);
  ids.forEach((id, i) => {
    const foe = D.FIGHTERS[id].side === 'good' ? 'caped' : 'hooded';
    const st = D.createDuel(id, foe);
    if (frame) D.advanceDuel(st, frame);
    const col = i % cols, row = (i / cols) | 0;
    const ox = col * cw, oy = row * ch;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, cw, ch); ctx.clip();
    // The subject is st.a; put its feet on the cell's baseline at a scale that
    // gives the figure the height the ornament gives it.
    const scale = px / 175;
    const f = st.a;
    D.drawDuel(ctx, st, view({
      x: ox + cw / 2 - (f.x + 15) * scale,
      y: oy + ch * 0.80 - D.FEET_Y * scale,
      scale,
      bladeA: D.BLADE_COLORS[id], bladeB: D.BLADE_COLORS[foe],
    }));
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.28; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cw - 1, ch - 1);
    ctx.restore();
    label(id, ox + cw / 2, oy + ch - 8);
  });
  return shot('sheet-' + tag);
}

/* An exchange, sampled. Motion is the only state the site ever shows these in,
 * and a strip is the closest this environment gets to watching one. */
function strip(pool, seedFrames, n, gap, tag) {
  const st = D.createDuel(pool[0], pool[1]);
  D.advanceDuel(st, seedFrames);
  const cw = 260, ch = 220, cols = 6;
  const rows = Math.ceil(n / cols);
  bg(cw * cols, ch * rows);
  for (let i = 0; i < n; i += 1) {
    const col = i % cols, row = (i / cols) | 0;
    const ox = col * cw, oy = row * ch;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, cw, ch); ctx.clip();
    const fx = D.duelFocus(st);
    const scale = Math.min(cw / Math.max(160, fx.width + 90), 2.0);
    D.drawDuel(ctx, st, view({
      x: ox + cw / 2 - fx.cx * scale,
      y: oy + ch * 0.86 - D.FEET_Y * scale,
      scale,
      bladeA: D.BLADE_COLORS[pool[0]], bladeB: D.BLADE_COLORS[pool[1]],
    }));
    ctx.restore();
    label('+' + (i * gap), ox + cw / 2, oy + ch - 6);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = INK;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cw - 1, ch - 1); ctx.restore();
    D.advanceDuel(st, gap);
  }
  return shot('strip-' + tag);
}

/* One named move, sampled from the frame the director calls for it. The second
 * argument is an optional move the opponent has to be performing, which is how
 * a pairing — a sweep answered by a jump, a throw answered by a parry — gets
 * caught rather than whichever instance came up first.
 * (No backticks in here: this whole page is a template literal.) */
function moveStrip(name, mod, pool, n, gap, tag) {
  const st = D.createDuel(pool[0], pool[1]);
  let subject = null;
  for (let i = 0; i < 400000 && !subject; i += 1) {
    D.advanceDuel(st, 1);
    // Waiting on the *module* rather than on the two moves coinciding: the
    // second half of a pairing arrives frames after the first, so a test for
    // both at once never fires on the frame either of them starts.
    if (mod && (!st.dir.seq || st.dir.seq.id !== mod)) continue;
    for (const k of ['a', 'b']) {
      const f = st[k];
      if (f.move === name && f.mf <= 2) subject = k;
    }
  }
  const cw = 250, ch = 230, cols = 6;
  const rows = Math.ceil(n / cols);
  bg(cw * cols, ch * rows);
  if (!subject) {
    label('never reached: ' + name + (mod ? ' in ' + mod : ''), cw * cols / 2, ch * rows / 2);
    return shot('move-' + tag);
  }
  for (let i = 0; i < n; i += 1) {
    const col = i % cols, row = (i / cols) | 0;
    const ox = col * cw, oy = row * ch;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, cw, ch); ctx.clip();
    const fx = D.duelFocus(st);
    const scale = Math.min(cw / Math.max(150, fx.width + 80), 2.2);
    D.drawDuel(ctx, st, view({
      x: ox + cw / 2 - fx.cx * scale,
      y: oy + ch * 0.84 - D.FEET_Y * scale,
      scale,
      bladeA: D.BLADE_COLORS[pool[0]], bladeB: D.BLADE_COLORS[pool[1]],
    }));
    ctx.restore();
    const f = st[subject];
    label('+' + (i * gap) + '  ' + f.move + ' ' + f.mf, ox + cw / 2, oy + ch - 6);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = INK;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cw - 1, ch - 1); ctx.restore();
    D.advanceDuel(st, gap);
  }
  return shot('move-' + tag);
}

(async () => {
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'move' || mode === 'all') {
    await moveStrip('sweep_low', 'low-sweep', ['hooded', 'caped'], 12, 3, 'sweep-hop');
    await moveStrip('roll_through', 'roll-past', ['hooded', 'caped'], 12, 4, 'roll');
    await moveStrip('handspring', 'spring-away', ['maned', 'cowled'], 12, 4, 'handspring');
    await moveStrip('parry_spin', 'whirl-and-catch', ['haloed', 'horned'], 12, 3, 'parry-spin');
    await moveStrip('blade_throw', 'throw-deflected', ['hooded', 'caped'], 12, 5, 'throw-deflected');
  }
  if (mode === 'sheet' || mode === 'all') {
    await sheet(190, 'phone', 0);
    await sheet(340, 'desk', 0);
    await sheet(340, 'desk-moving', 300);
  }
  if (mode === 'strip' || mode === 'all') {
    await strip(['hooded', 'caped'], 240, 12, 7, 'order');
    await strip(['haloed', 'horned'], 600, 12, 7, 'holy');
  }
  if (mode === 'scale' || mode === 'all') {
    const st = D.createDuel('maned', 'cowled');
    D.advanceDuel(st, 420);
    for (const [px, tag] of [[190, 'phone'], [340, 'desk']]) {
      bg(px, px);
      const fx = D.duelFocus(st);
      const scale = Math.min(px / Math.max(150, fx.width + 92), 2.9);
      D.drawDuel(ctx, st, view({
        x: px / 2 - fx.cx * scale, y: px * 0.82 - D.FEET_Y * scale, scale,
        bladeA: '#3d9bff', bladeB: '#ff3b30', bars: true,
      }));
      await shot('slot-' + tag);
    }
  }
  await fetch('/done', { method: 'POST' });
})().catch(async (e) => {
  await fetch('/fail', { method: 'POST', body: String(e && e.stack || e) });
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

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${join(OUT, "chrome")}`,
    "--virtual-time-budget=20000",
    `http://127.0.0.1:${port}/?mode=${MODE}`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
chrome.stderr.on("data", (d) => (stderr += d));

const timeout = setTimeout(() => finish({ error: `timed out\n${stderr.slice(-2000)}` }), 90_000);
const result = await finished;
clearTimeout(timeout);
chrome.kill();
server.close();

if (result.error) {
  console.error(`duel-shot failed:\n${result.error}`);
  process.exit(1);
}
console.log(`${written.length} shots in ${OUT}`);
for (const w of written) console.log(`  ${w}`);
