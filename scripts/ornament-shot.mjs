/**
 * The hero ornament's eye — the eight of them, side by side, at both sizes.
 *
 * Same problem `scripts/duel-shot.mjs` exists for, and the same first rule: in
 * this environment a screenshot is not evidence. An automated browser reports
 * `document.hidden`, so `requestAnimationFrame` parks — `DuelOrnament.tsx` line
 * 324 returns outright on that flag and draws nothing at all — and it reports
 * `prefers-reduced-motion: reduce`, which the site honours by falling still.
 * Point a naive screenshotter at the page and every ornament comes back frozen
 * on frame one, which is indistinguishable from an ornament that does not move.
 *
 * So the browser is told the truth about itself before anything loads:
 * `Page.setWebLifecycleState('active')` and `Emulation.setFocusEmulationEnabled`
 * un-park the clock, `Emulation.setEmulatedMedia` un-does the reduced-motion
 * claim. Then three frames are taken 1.5s apart and **hashed** — if a costume
 * comes back identical three times the run says so out loud rather than
 * shipping three copies of one frame into a sheet a designer will read as
 * "this one is still".
 *
 * Unlike `duel-shot`, the subject is React and CSS rather than a canvas module,
 * so there is nothing to bundle and no `toDataURL` to reach for: the real site
 * has to be running. Point `--url` at `npm run dev:worker`. The pixels come
 * back over the same CDP socket that fixed the clock, which is why there is no
 * local server here — `duel-shot` POSTs to one because it drives Chrome by URL
 * alone and has no other channel back.
 *
 *   node scripts/ornament-shot.mjs --out <dir> [--url http://127.0.0.1:8788]
 *
 *   --only lens,sonar     narrow to a tranche
 *   --palettes a,b,c      palette ids (default nebula, xerox, solar)
 *   --fx <id>             what runs behind (default `off`)
 *
 * **The background is off by default and that is a choice, not an oversight.**
 * The question a costume review asks is whether the slot reads on its own; the
 * question of whether it survives Branches or Matrix rain behind it is a second
 * pass, and `--fx vessels` is how to run it.
 *
 * The contact sheet is the tool that matters, exactly as it is for the duel: a
 * shape either tells itself apart from seven others in a row or it does not,
 * and that cannot be asked of one ornament on its own.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const OUT = flag("out", mkdtempSync(join(tmpdir(), "ornament-shot-")));
const URL_BASE = flag("url", "http://127.0.0.1:8788");
const ONLY = flag("only", "").split(",").filter(Boolean);
const FX = flag("fx", "off");
const PALETTE_IDS = flag("palettes", "nebula,xerox,solar").split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });

/*
 * The catalogues are read out of the source, never typed here.
 *
 * `ORNAMENTS` is a wire format with four `hidden` entries in it, and a bench
 * that listed its own eight would be reviewing the eight it happened to know
 * about — the same mistake `ORNAMENT_PX` in `DuelOrnament.tsx` carries a note
 * about. A ninth ornament, or a palette appended after Cold Open, has to reach
 * this sheet without anybody remembering that this file exists.
 *
 * `pal` is a *numeric index* into `PALETTES`, so the order of the file is the
 * wire format and position here is the whole answer.
 */
const source = (rel) => readFileSync(join(ROOT, rel), "utf8");
const ORNAMENTS = [...source("src/data/ornaments.ts").matchAll(/^\s*\{ id: "([a-z]+)", label:/gm)].map(
  (m) => m[1],
);
const PALETTES = [...source("src/data/palettes.ts").matchAll(/^\s*\{\s*id: "([a-z]+)"/gm)].map(
  (m) => m[1],
);
if (ORNAMENTS.length < 8 || PALETTES.length < 25) {
  console.error(
    `ornament-shot: read ${ORNAMENTS.length} ornaments and ${PALETTES.length} palettes out of ` +
      `src/data — the shape of those files changed and this bench is now reviewing a subset.`,
  );
  process.exit(1);
}

const SUBJECTS = ONLY.length ? ORNAMENTS.filter((o) => ONLY.includes(o)) : ORNAMENTS;

/*
 * Two viewports, one either side of `PHONE_MAX` (560) with room to spare.
 *
 * The band is what sizes the slot — `min(38vw, 340px)` on desk against
 * `min(44vw, 190px)` on phone — and it is also what *adapts the layout*:
 * `adaptLayout` collapses Cinematic to Stack below 560, and Stack is the only
 * phone layout that shows the slot at all. So a viewport a few pixels the wrong
 * side of the breakpoint does not merely resize this sheet, it empties half of
 * it. 390 and 1440 are chosen to be nowhere near the edge.
 */
const BANDS = [
  { name: "desk", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

/** Frames per ornament, and the gap between them.
 *
 *  1.5s is not arbitrary: the sonar beam sweeps on 4.8s and the slot's own
 *  `v-drift` float on 9s, so three frames 1.5s apart land a third of a sweep
 *  apart and cannot all catch the beam at the same bearing. The settle is
 *  longer than the gap because a duel that has only just been created is two
 *  fighters walking towards each other, which is the least representative frame
 *  the ornament ever draws. */
const FRAMES = 3;
const FRAME_GAP_MS = 1500;
const SETTLE_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------------------
 * The Chrome half.
 *
 * A thin CDP client rather than a driver library: the site has no runtime
 * dependencies beyond React and this bench keeps to the spirit of it. `ws` is
 * already a devDependency for `scripts/webauthn-sim.ts`, and for the same
 * reason — Node's built-in WebSocket cannot do what is needed here either
 * (it has no way to hand back the browser-level target plumbing).
 */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!p) return;
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  /** Resolve on the next matching event. Registered before the call that
   *  causes it, never after — a load event that arrives first is a hang. */
  once(method, sessionId) {
    return new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method !== method) return;
        if (sessionId && msg.sessionId !== sessionId) return;
        this.listeners.splice(this.listeners.indexOf(fn), 1);
        resolve(msg.params);
      };
      this.listeners.push(fn);
    });
  }
}

/* The profile lives in a temp dir, never in `--out`: that directory is the
 * deliverable, and a browser profile sitting in it is one more thing for
 * whoever reviews the sheet to wonder about. */
const profile = mkdtempSync(join(tmpdir(), "ornament-shot-chrome-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    // The default window is 800×600 and `Emulation.setDeviceMetricsOverride`
    // overrides the *layout* viewport, not the surface being composited, so a
    // 1440-wide clip off an 800-wide surface comes back cropped and nobody is
    // told. Start it wide enough for the widest band.
    "--window-size=1600,1000",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let stderr = "";
const wsUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no DevTools port\n${stderr}`)), 20_000);
  chrome.stderr.on("data", (d) => {
    stderr += d;
    const m = stderr.match(/ws:\/\/[^\s]+/);
    if (m) {
      clearTimeout(timer);
      resolve(m[0]);
    }
  });
  chrome.on("exit", (c) => reject(new Error(`chrome exited ${c}\n${stderr}`)));
});

const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => socket.once("open", r));
const cdp = new Cdp(socket);

const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
await cdp.send("Page.enable", {}, sessionId);
await cdp.send("Runtime.enable", {}, sessionId);

/*
 * The three lies this environment tells the page, undone before it loads.
 *
 * Each one of them on its own is enough to make every ornament come back
 * motionless: the duel's loop returns on `document.hidden` before it draws, and
 * `prefers-reduced-motion: reduce` is calm, which sets `animation: none` on the
 * slot and freezes the CSS four outright. Focus emulation is the third because
 * a target created over CDP is not the foreground tab and Chrome throttles it.
 */
await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
await cdp.send(
  "Emulation.setEmulatedMedia",
  { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] },
  sessionId,
);

/** The published look, as `worker/site-config.ts` would have inlined it.
 *
 *  `loadConfig` reads `window.__VESSEL_SITE__` **synchronously during the first
 *  render** and validates it field by field, so this is the whole of the way in
 *  — the ornament is *appearance*, which is published-only and deliberately not
 *  read back from storage. Every field left out falls back to `DEFAULT_CONFIG`.
 *
 *  `mode: "static"` because the time-of-day randomiser would otherwise choose
 *  the palette this bench was told to hold still, and `station: "hold"` because
 *  `roam` fades the slot to 0.12 twice a revolution — a shot of an ornament at
 *  12% opacity is a shot of the station, not of the ornament. */
function seed(ornament, pal) {
  return {
    pal,
    ornament,
    layout: "cinematic",
    fx: FX,
    mode: "static",
    station: "hold",
    calm: false,
  };
}

/*
 * Injected before any page script, and defended with a getter.
 *
 * `Page.addScriptToEvaluateOnNewDocument` runs ahead of the document's own
 * scripts, which is ahead of the bundle — but it is also ahead of the Worker's
 * inlined `window.__VESSEL_SITE__ = …`, so a plain assignment here would be
 * silently overwritten by whatever is published in the D1 this dev server is
 * pointed at. An accessor whose setter does nothing survives it.
 *
 * The two storage keys are the visitor's own settings, and they are set for two
 * different reasons: `greeted` because the first-visit dialog lands 1.2s in and
 * would sit over the hero in every shot, and `calm` because this environment's
 * reduced-motion claim reaches `ConfigContext` through a route the media
 * override above does not cover — a stored preference beats the published value
 * permanently and in both directions, which is exactly what is wanted here.
 */
function bootstrap(config) {
  return `
    (() => {
      const published = ${JSON.stringify(config)};
      Object.defineProperty(window, "__VESSEL_SITE__", {
        get: () => published,
        set: () => {},
        configurable: false,
      });
      try {
        localStorage.setItem("vessel.greeted.v1", "1");
        localStorage.setItem("vessel.calm.v1", "0");
        localStorage.setItem("vessel.sound.v1", "0");
      } catch {}
    })();
  `;
}

let bootId = null;
async function setBootstrap(config) {
  if (bootId) await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: bootId }, sessionId);
  const r = await cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: bootstrap(config) },
    sessionId,
  );
  bootId = r.identifier;
}

async function evaluate(expression) {
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result.value;
}

async function shoot(clip) {
  const r = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false },
    sessionId,
  );
  return r.data;
}

/* ---------------------------------------------------------------------------
 * The run.
 */

const written = [];
const notes = [];
/* Every note is also printed the moment it is made.
 *
 * A run is forty-eight page loads long and the summary at the bottom is worth
 * nothing if the run does not reach it: the dev server this bench points at
 * fell over halfway through the first full pass, every subsequent navigation
 * landed on a connection error with no `.vessel` in it, and twenty-seven shots
 * were skipped in silence because the only record of it was a list waiting to
 * be printed at the end — which never came, because the same thing that took
 * the server took this process with it. Say it when it happens. */
function note(line) {
  notes.push(line);
  console.error(`  ! ${line}`);
}
/** Desk frame one per ornament per palette, kept for the contact sheets. */
const cells = new Map();
/** The palette's own ink, read off the page rather than out of the source —
 *  `themeVars()` is the seam and a sheet painted from `palettes.ts` would be
 *  asserting what the site *ought* to render rather than what it did. */
const inks = new Map();

function record(name, base64) {
  const png = Buffer.from(base64, "base64");
  const path = join(OUT, `${name}.png`);
  writeFileSync(path, png);
  written.push({ name: `${name}.png`, kb: png.length / 1024 });
  return createHash("sha1").update(png).digest("hex");
}

for (const palId of PALETTE_IDS) {
  const pal = PALETTES.indexOf(palId);
  if (pal < 0) {
    note(`palette "${palId}" is not in PALETTES — skipped`);
    continue;
  }

  for (const band of BANDS) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: band.width, height: band.height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );

    for (const ornament of SUBJECTS) {
      await setBootstrap(seed(ornament, pal));
      const loaded = cdp.once("Page.loadEventFired", sessionId);
      await cdp.send("Page.navigate", { url: `${URL_BASE}/` }, sessionId);
      await loaded;
      // Lifecycle has to be set *after* the navigation: the state belongs to
      // the document, and the one it was set on has just been replaced.
      await cdp.send("Page.setWebLifecycleState", { state: "active" }, sessionId);
      await sleep(SETTLE_MS);

      const box = await evaluate(`(() => {
        const wrap = document.querySelector('.vessel');
        const ink = wrap ? getComputedStyle(wrap) : null;
        // "None" renders no slot at all — Ornament.tsx returns null for it on
        // every layout but Radial. That is a real answer and the sheet has to
        // show it, so the hero stands in and the cell is labelled empty.
        const el = document.querySelector('.v-ornament') || document.querySelector('.v-hero');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.x, y: r.y, w: r.width, h: r.height,
          slot: !!document.querySelector('.v-ornament'),
          hidden: document.hidden,
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          calm: !!document.querySelector('.is-calm'),
          bg: ink ? ink.getPropertyValue('--bg').trim() : '#000',
          fg: ink ? ink.getPropertyValue('--fg').trim() : '#fff',
        };
      })()`);

      if (!box) {
        note(`${ornament}/${palId}/${band.name}: neither .v-ornament nor .v-hero in the DOM`);
        continue;
      }
      inks.set(palId, { bg: box.bg, fg: box.fg });
      if (box.hidden || box.reduced || box.calm) {
        note(
          `${ornament}/${palId}/${band.name}: the environment is still lying — ` +
            `hidden=${box.hidden} reduced=${box.reduced} calm=${box.calm}. Frames are frozen.`,
        );
      }

      /* One clip for all three frames, fixed on frame one.
       *
       * The slot floats on `v-drift` (translateY, ±12px over 9s), so a rect
       * taken per frame would follow the ornament and crop three subtly
       * different boxes — the sheet would then be comparing crops rather than
       * ornaments. A fixed box with the drift's own amplitude as padding keeps
       * the movement *inside* the frame, which is where it is visible. */
      const pad = box.slot ? 18 : 0;
      const clip = {
        x: Math.max(0, Math.round(box.x - pad)),
        y: Math.max(0, Math.round(box.y - pad)),
        width: Math.min(band.width, Math.round(box.w + pad * 2)),
        height: Math.min(band.height, Math.round(box.h + pad * 2)),
      };

      const hashes = [];
      for (let f = 1; f <= FRAMES; f += 1) {
        const data = await shoot(clip);
        const name = `${ornament}-${palId}-${band.name}-f${f}`;
        hashes.push(record(name, data));
        if (f === 1 && band.name === "desk") cells.set(`${palId}/${ornament}`, data);
        if (f < FRAMES) await sleep(FRAME_GAP_MS);
      }
      if (box.slot && new Set(hashes).size === 1) {
        note(
          `${ornament}/${palId}/${band.name}: three frames 1.5s apart are byte-identical — ` +
            `nothing in this slot moves.`,
        );
      }
    }
  }

  /*
   * The contact sheet, composited in the browser.
   *
   * There is no image library here and there is not going to be one; the
   * browser that took the pixels can put them next to each other, which is one
   * fewer thing to install and one fewer thing to be wrong about the colour
   * space. Painted on the palette's own `--bg` so the cells sit on the ground
   * the site would have put behind them.
   */
  const ink = inks.get(palId) ?? { bg: "#000", fg: "#fff" };
  const sheetCells = SUBJECTS.filter((o) => cells.has(`${palId}/${o}`)).map((o) => ({
    id: o,
    data: cells.get(`${palId}/${o}`),
  }));
  if (!sheetCells.length) continue;

  await evaluate(
    `window.__CELLS = ${JSON.stringify(sheetCells)};` +
      `window.__INK = ${JSON.stringify(ink)}; 1`,
  );
  const sheet = await evaluate(`(async () => {
    const CELL = 380, LABEL = 40, PAD = 16;
    const cells = window.__CELLS, ink = window.__INK;
    const imgs = await Promise.all(cells.map((c) => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = 'data:image/png;base64,' + c.data;
    })));
    const cv = document.createElement('canvas');
    cv.width = cells.length * CELL;
    cv.height = CELL + LABEL;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((img, n) => {
      // Letterboxed, never stretched: "None" stands in with the whole hero and
      // is several times the width of a slot, and a sheet that scaled each cell
      // to fill would be reporting a size difference that is not there.
      const s = Math.min((CELL - PAD * 2) / img.width, (CELL - PAD * 2) / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, n * CELL + (CELL - w) / 2, (CELL - h) / 2, w, h);
      ctx.fillStyle = ink.fg;
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cells[n].id, n * CELL + CELL / 2, CELL + 26);
      ctx.strokeStyle = ink.fg;
      ctx.globalAlpha = 0.14;
      ctx.strokeRect(n * CELL + 0.5, 0.5, CELL - 1, CELL + LABEL - 1);
      ctx.globalAlpha = 1;
    });
    return cv.toDataURL('image/png').split(',')[1];
  })()`);
  record(`sheet-${palId}`, sheet);
}

chrome.kill();
socket.close();

console.log(`${written.length} shots in ${OUT}`);
for (const w of written) console.log(`  ${w.name} (${w.kb.toFixed(0)}KB)`);
if (notes.length) {
  console.log(`\n${notes.length} thing(s) worth knowing:`);
  for (const n of notes) console.log(`  ${n}`);
}
