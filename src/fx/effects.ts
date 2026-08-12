/**
 * The twelve canvas backgrounds (SPEC.md § "The twelve canvas backgrounds"),
 * ported from the prototype's startFx() (design/prototype.html:823).
 *
 * Every effect reads the live palette off the frame rather than closing over
 * one, which is what lets the canvas recolour smoothly during the .9s palette
 * bleed instead of cutting. `boost` arrives already folded into `t` for the
 * time-based effects and is applied directly by the ones that advance their own
 * particles, exactly as in the prototype.
 */

import type { FxId } from "../data/catalog";
import type { Palette } from "../data/palettes";

export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** The live palette — sampled fresh each frame, never captured. */
  p: Palette;
  /** Effect clock, already multiplied by boost. */
  t: number;
  /** Heartbeat, 0–1. */
  beat: number;
  /** Scroll velocity + screensaver multiplier, ≥ 1. */
  boost: number;
  /** Pointer position, 0–1 of the viewport. */
  mx: number;
  my: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
}

interface Branch {
  x: number;
  y: number;
  x2: number;
  y2: number;
  depth: number;
  phase: number;
}

interface Channel {
  u: number;
  lane: number;
  s: number;
  r: number;
}

/** One falling stream: its own speed, trail length and glyphs. */
interface RainColumn {
  /** Position of the leading glyph, in cells from the top. */
  head: number;
  speed: number;
  length: number;
  /** One glyph per row, mutated in place while on screen. */
  glyphs: string[];
}

/**
 * Effect state that must survive between frames — the grown tree, particle
 * fields, rain columns. Held by the caller so the loop can keep it across
 * palette changes but drop it when the effect itself changes.
 */
export interface FxCache {
  rain?: { columns: number; rows: number; streams: RainColumn[] } | null;
  parts?: Particle[] | null;
  tree?: Branch[] | null;
  flow?: Channel[] | null;
}

const TAU = 6.3;

function seed(w: number, h: number, n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: Math.random() + 0.2,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    r: Math.random() * 2.4 + 0.5,
  }));
}

/** Recursively grown branching tree, depth 6, rooted below the bottom edge. */
function buildTree(w: number, h: number): Branch[] {
  const branches: Branch[] = [];
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    if (depth > 6 || len < 14) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branches.push({ x, y, x2, y2, depth, phase: Math.random() * 6.28 });
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      grow(x2, y2, ang + (Math.random() - 0.5) * 1.25, len * (0.62 + Math.random() * 0.2), depth + 1);
    }
  };
  grow(w * 0.5, h * 1.05, -Math.PI / 2, h * 0.19, 0);
  grow(-10, h * 0.35, 0.35, w * 0.11, 1);
  grow(w + 10, h * 0.62, Math.PI - 0.4, w * 0.11, 1);
  return branches;
}

type Effect = (f: Frame, cache: FxCache) => void;

/** 1. Vessels — the default. A branching tree that brightens near the cursor. */
const vessels: Effect = ({ ctx, w, h, p, t, beat, mx, my }, cache) => {
  if (!cache.tree) cache.tree = buildTree(w, h);
  for (const b of cache.tree) {
    const near = 1 - Math.min(1, Math.hypot(b.x2 - mx * w, b.y2 - my * h) / 420);
    const wave = (Math.sin(t * 2.2 - b.depth * 0.9 + b.phase) + 1) / 2;
    ctx.strokeStyle = b.depth < 2 ? p.a1 : b.depth < 4 ? p.a2 : p.a3;
    ctx.globalAlpha = 0.1 + wave * 0.2 + near * 0.28;
    ctx.lineWidth = Math.max(1, (7 - b.depth) * (1 + near * 0.5));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo((b.x + b.x2) / 2 + Math.sin(t + b.phase) * 7, (b.y + b.y2) / 2, b.x2, b.y2);
    ctx.stroke();
    if (b.depth > 3 && wave > 0.82) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.fg;
      ctx.beginPath();
      ctx.arc(b.x2, b.y2, 1.8, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 0.1 + beat * 0.06;
  const g = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, h * 0.75);
  g.addColorStop(0, p.a1);
  g.addColorStop(1, `${p.bg}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
};

/** 2. Flow — five sine channels with 160 particles travelling along them. */
const flow: Effect = ({ ctx, w, h, p, t, beat, boost }, cache) => {
  if (!cache.flow) {
    cache.flow = Array.from({ length: 160 }, () => ({
      u: Math.random(),
      lane: (Math.random() * 5) | 0,
      s: 0.0012 + Math.random() * 0.0022,
      r: Math.random() * 2.6 + 1,
    }));
  }
  const laneY = (x: number, l: number) =>
    h * (0.22 + l * 0.14) + Math.sin(x * 0.0032 + l * 1.4 + t * 0.5) * h * 0.07;

  for (let l = 0; l < 5; l++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = laneY(x, l);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  for (const c of cache.flow) {
    c.u += c.s * (1 + beat * 1.4) * boost;
    if (c.u > 1) c.u = 0;
    const x = c.u * w;
    const y = laneY(x, c.lane);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = [p.a1, p.a2, p.a3][c.lane % 3];
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/** 3. Pressure — 16 rings expanding from a centre, modulated by the heartbeat. */
const pressure: Effect = ({ ctx, w, h, p, t, beat }) => {
  const cx = w * 0.5;
  const cy = h * 0.55;
  for (let i = 0; i < 16; i++) {
    const k = (i / 16 + ((t * 0.06) % (1 / 16))) % 1;
    const r = k * Math.max(w, h) * 0.72;
    ctx.strokeStyle = [p.a1, p.a2, p.a3][i % 3];
    ctx.globalAlpha = (1 - k) * 0.3 * (0.6 + beat * 0.7);
    ctx.lineWidth = 1 + (1 - k) * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18 + beat * 0.14;
  ctx.fillStyle = p.a1;
  ctx.beginPath();
  ctx.arc(cx, cy, 40 + beat * 26, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
};

/**
 * The film's glyph set: mirrored half-width katakana, the digits, and a handful
 * of punctuation. Not the full-width kana the prototype used — those are twice
 * the width and read as text rather than as rain.
 */
const RAIN_GLYPHS =
  "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍｦｲｸｺｿﾁﾄﾉﾌﾔﾖﾙﾚﾛﾝ0123456789:･.\"=*+-<>¦|ç";

const RAIN_CELL = 16;
/** Cells per frame. Slow enough to read as falling glyphs rather than a blur. */
const RAIN_SPEED_MIN = 0.1;
const RAIN_SPEED_RANGE = 0.22;
const RAIN_TRAIL_MIN = 10;
const RAIN_TRAIL_RANGE = 26;
/** Chance per visible glyph per frame of mutating in place, as they do on screen. */
const RAIN_MUTATE = 0.02;

const randomGlyph = () => RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0];

function newRainColumn(rows: number, above: boolean): RainColumn {
  return {
    // A fresh column starts above the top edge, which is what staggers the
    // streams; the very first fill spreads them over the height instead, so the
    // effect does not begin with an empty screen.
    head: above ? -Math.random() * rows * 0.8 : Math.random() * rows,
    speed: RAIN_SPEED_MIN + Math.random() * RAIN_SPEED_RANGE,
    length: RAIN_TRAIL_MIN + Math.floor(Math.random() * RAIN_TRAIL_RANGE),
    glyphs: Array.from({ length: rows + 2 }, randomGlyph),
  };
}

/**
 * 4. Matrix rain.
 *
 * DEVIATION FROM THE PROTOTYPE, deliberate, at the client's request: the
 * prototype fakes trails by overdrawing the background at low alpha and moves a
 * whole cell per frame, which is both far too fast and gives every stream the
 * same speed and the same infinite tail. Here each column owns its speed, its
 * trail length and its own glyphs, and the trail is drawn explicitly — so the
 * leading glyph can be near-white with the body falling away behind it, the way
 * the film does it. Glyphs are mirrored and mutate in place.
 *
 * Colour still comes entirely from the palette: `fg` for the lead, `a1` for the
 * body. Under the Phosphor palette that lands on the film's green; under the
 * rest it recolours with everything else, which is the site's rule.
 */
const rain: Effect = ({ ctx, w, h, p, boost }, cache) => {
  const size = RAIN_CELL;
  const columns = Math.max(1, Math.ceil(w / size));
  const rows = Math.ceil(h / size);

  if (!cache.rain || cache.rain.columns !== columns || cache.rain.rows !== rows) {
    cache.rain = {
      columns,
      rows,
      streams: Array.from({ length: columns }, () => newRainColumn(rows, false)),
    };
  }
  const { streams } = cache.rain;

  ctx.font = `${size}px ui-monospace, "MS Gothic", monospace`;
  ctx.textBaseline = "top";
  ctx.shadowBlur = 0;

  // One flip for the whole effect rather than one per glyph: the film's
  // characters are mirrored, and a save/restore per glyph would cost more than
  // the rest of the effect put together.
  ctx.save();
  ctx.scale(-1, 1);

  for (let i = 0; i < columns; i++) {
    const stream = streams[i];
    stream.head += stream.speed * boost;
    if (stream.head - stream.length > rows) {
      streams[i] = newRainColumn(rows, true);
      continue;
    }

    const x = -(i * size + size);
    const head = Math.floor(stream.head);

    // Tail first, head last, so the bright glyph is never overdrawn.
    for (let k = stream.length - 1; k >= 1; k--) {
      const row = head - k;
      if (row < 0 || row >= rows) continue;
      if (Math.random() < RAIN_MUTATE) stream.glyphs[row] = randomGlyph();
      // Squared falloff: the body stays legible and the last few cells fade out
      // rather than the whole trail dimming evenly.
      const fade = 1 - k / stream.length;
      ctx.globalAlpha = fade * fade;
      ctx.fillStyle = p.a1;
      ctx.fillText(stream.glyphs[row], x, row * size);
    }

    if (head >= 0 && head <= rows) {
      if (Math.random() < RAIN_MUTATE * 4) stream.glyphs[head] = randomGlyph();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.fg;
      ctx.shadowColor = p.a1;
      ctx.shadowBlur = 14;
      ctx.fillText(stream.glyphs[head], x, head * size);
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
};

/** 5. Warp stars — 260 particles accelerating radially outward. */
const stars: Effect = ({ ctx, w, h, p, boost }, cache) => {
  if (!cache.parts || cache.parts.length !== 260) cache.parts = seed(w, h, 260);
  for (const s of cache.parts) {
    const dx = s.x - w / 2;
    const dy = s.y - h / 2;
    s.x += dx * 0.012 * s.z * boost;
    s.y += dy * 0.012 * s.z * boost;
    if (s.x < 0 || s.x > w || s.y < 0 || s.y > h) {
      s.x = w / 2 + (Math.random() - 0.5) * 80;
      s.y = h / 2 + (Math.random() - 0.5) * 80;
      s.z = Math.random() + 0.2;
    }
    ctx.strokeStyle = s.z > 0.8 ? p.a1 : p.a2;
    ctx.globalAlpha = 0.28 + s.z * 0.5;
    ctx.lineWidth = s.z * 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - dx * 0.05 * s.z, s.y - dy * 0.05 * s.z);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** 6. Constellation — 90 drifting nodes, joined when closer than 150px. */
const constellation: Effect = ({ ctx, w, h, p, boost }, cache) => {
  if (!cache.parts || cache.parts.length !== 90) cache.parts = seed(w, h, 90);
  const parts = cache.parts;
  for (const s of parts) {
    s.x += s.vx * boost;
    s.y += s.vy * boost;
    if (s.x < 0 || s.x > w) s.vx *= -1;
    if (s.y < 0 || s.y > h) s.vy *= -1;
    ctx.fillStyle = p.a1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= 150) continue;
      ctx.globalAlpha = (1 - d / 150) * 0.28;
      ctx.strokeStyle = p.a2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
};

/** 7. Aurora — five stacked wide sine ribbons. */
const aurora: Effect = ({ ctx, w, h, p, t }) => {
  for (let b = 0; b < 5; b++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 14) {
      const y =
        h * 0.5 +
        Math.sin(x * 0.004 + t * (1 + b * 0.22) + b) * (h * 0.13) +
        Math.sin(x * 0.0012 + t * 0.6) * (h * 0.09) +
        (b - 2.5) * 26;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = [p.a1, p.a2, p.a3][b % 3];
    ctx.globalAlpha = 0.17;
    ctx.lineWidth = 46;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** 8. Plasma — a 26px grid of dots sized by a three-term sine field. */
const plasma: Effect = ({ ctx, w, h, p, t }) => {
  const cell = 26;
  for (let x = 0; x < w; x += cell) {
    for (let y = 0; y < h; y += cell) {
      const v =
        Math.sin(x * 0.008 + t) + Math.sin(y * 0.009 - t * 1.3) + Math.sin((x + y) * 0.006 + t * 0.7);
      const a = (v + 3) / 6;
      ctx.fillStyle = a > 0.62 ? p.a1 : a > 0.42 ? p.a2 : p.a3;
      ctx.globalAlpha = Math.max(0, (a - 0.35) * 0.32);
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42 * a + 1, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

/** 9. Grid tunnel — 26 nested rectangles on a power curve, plus eight spokes. */
const tunnel: Effect = ({ ctx, w, h, p, t }) => {
  ctx.strokeStyle = p.a1;
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const k = (i / 26 + ((t * 0.14) % (1 / 26))) % 1;
    const s = Math.pow(k, 2.4);
    ctx.globalAlpha = 0.38 * (1 - k);
    ctx.strokeRect(w / 2 - (w * s) / 2, h / 2 - (h * s) / 2, w * s, h * s);
  }
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = p.a2;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * 6.28 + t * 0.06;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(ang) * w, h / 2 + Math.sin(ang) * h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** 10. Bokeh — 46 large soft discs rising with lateral drift. */
const bokeh: Effect = ({ ctx, w, h, p, t, boost }, cache) => {
  if (!cache.parts || cache.parts.length !== 46) {
    cache.parts = seed(w, h, 46).map((s) => ({ ...s, r: Math.random() * 90 + 22 }));
  }
  for (const s of cache.parts) {
    s.y -= (0.22 + s.z * 0.3) * boost;
    s.x += Math.sin(t + s.r) * 0.28;
    if (s.y < -s.r) {
      s.y = h + s.r;
      s.x = Math.random() * w;
    }
    const col = s.z > 0.7 ? p.a1 : s.z > 0.4 ? p.a2 : p.a3;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, `${col}44`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
};

/** 11. Orbits — seven rings, each with a lit body, speed inverse to radius. */
const orbits: Effect = ({ ctx, w, h, p, t }) => {
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 1; i <= 7; i++) {
    const r = i * Math.min(w, h) * 0.062;
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    const ang = t * (1.4 / i) + i;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = [p.a1, p.a2, p.a3][i % 3];
    ctx.beginPath();
    ctx.arc(x, y, 3.4 + i * 0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 12 + i, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

const EFFECTS: Record<Exclude<FxId, "off">, Effect> = {
  vessels,
  flow,
  pressure,
  rain,
  stars,
  constellation,
  aurora,
  plasma,
  tunnel,
  bokeh,
  orbits,
};

/** Draw one frame. "None" clears; the rest get an opaque palette ground first. */
export function drawFx(id: FxId, frame: Frame, cache: FxCache): void {
  const { ctx, w, h, p } = frame;
  if (id === "off") {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  EFFECTS[id](frame, cache);
}
