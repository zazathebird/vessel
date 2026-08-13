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
  /** The duel's stance transition, spark field and clash flash. */
  duel?: DuelState | null;
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

// Duelling figures ------------------------------------------------------------

/**
 * Two figures fighting with energy blades, endlessly.
 *
 * **One continuous duel, not a sequence of battles.** The client asked for the
 * fight never to end and the *stance* to be what changes, which is a much better
 * fit for this codebase than a set of choreographed bouts: there is no cut, no
 * replay boundary, and nothing to keep in sync with the effect clock. The figures
 * simply ease from one stance to the next, forever, picking the next one at
 * random when they arrive.
 *
 * **Nothing here is drawn from a picture.** Every figure is a handful of line
 * segments computed from joint angles, so the effect obeys the *Assets* rule the
 * whole site is built under — no images, no sprites, no third-party anything. The
 * two pairings differ only in the silhouette details appended to the same body
 * (hood versus cape, halo versus horns), which is why one renderer serves both
 * and why adding a third pairing is a line in `EFFECTS`, not a new effect.
 *
 * **Colour is entirely the palette's**, as in every other effect. Blades take the
 * two accents so the pair reads as opposed, the bodies take `fg`, and the core of
 * each blade is `fg` for the same reason the Matrix rain's leading glyph is —
 * it is the brightest thing the palette offers, and a literal white would be the
 * one hardcoded colour in the codebase. A palette change re-lights the duel over
 * the usual 0.9s without the animation noticing.
 */

/**
 * One figure's joints for a single stance. Angles are radians, and the arm chain
 * is **cumulative** — the forearm's true angle is `shoulder + elbow`, the blade's
 * is `shoulder + elbow + wrist`. That makes a stance readable as a pose ("upper
 * arm up, forearm level, blade angled back") and makes interpolation between two
 * stances behave, since every value is a local rotation rather than a position
 * that could pull a limb out of its socket.
 *
 * Positive Y is down, so a *negative* angle points a limb upward.
 */
interface Limbs {
  /** Torso tilt from vertical. Positive leans toward the opponent. */
  lean: number;
  /** 0 stands tall, 1 drops into a deep guard. */
  crouch: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  /** The free arm, counterweighting the blade. */
  offArm: number;
  frontLeg: number;
  backLeg: number;
}

interface Stance {
  a: Limbs;
  b: Limbs;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface DuelState {
  from: Stance;
  to: Stance;
  /** Progress through the current transition, 0–1. */
  k: number;
  speed: number;
  sparks: Spark[];
  /** Previous frame's clock, for a delta the boost cannot distort. */
  prev: number;
  flash: number;
  flashX: number;
  flashY: number;
  /** Ignition progress, 0–1. Blades grow out of the hilts rather than snapping on. */
  ignite: number;
}

function limbs(
  lean: number,
  crouch: number,
  shoulder: number,
  elbow: number,
  wrist: number,
  offArm: number,
  frontLeg: number,
  backLeg: number,
): Limbs {
  return { lean, crouch, shoulder, elbow, wrist, offArm, frontLeg, backLeg };
}

/**
 * The stance vocabulary. Any stance can follow any other, because each is a
 * balanced pose rather than a frame of a fixed sequence — which is what lets the
 * next one be chosen at random without the fight ever looking broken.
 */
const STANCES: Stance[] = [
  // Both high, blades crossed overhead.
  {
    a: limbs(0.12, 0.2, -1.15, -0.3, 0.3, 0.7, 0.32, -0.36),
    b: limbs(0.12, 0.2, -1.15, -0.3, 0.3, 0.7, 0.32, -0.36),
  },
  // A cuts down from overhead; B catches it high.
  {
    a: limbs(0.34, 0.45, -1.5, 0.45, 0.15, 1.0, 0.6, -0.5),
    b: limbs(-0.14, 0.3, -1.3, -0.2, 0.6, 0.5, 0.24, -0.28),
  },
  // B lunges a thrust; A turns it aside.
  {
    a: limbs(-0.2, 0.35, -0.45, 0.35, -0.7, 0.9, 0.2, -0.5),
    b: limbs(0.45, 0.55, -0.15, 0.05, 0.0, 1.1, 0.75, -0.6),
  },
  // Blade lock, both pressing into the centre.
  {
    a: limbs(0.4, 0.55, -0.9, -0.15, 0.15, 0.85, 0.55, -0.55),
    b: limbs(0.4, 0.55, -0.9, -0.15, 0.15, 0.85, 0.55, -0.55),
  },
  // A sweeps low; B drops the blade to block.
  {
    a: limbs(0.25, 0.6, 0.35, 0.2, 0.25, -0.5, 0.5, -0.6),
    b: limbs(0.1, 0.55, 0.15, 0.5, 0.55, -0.3, 0.42, -0.42),
  },
  // A recoils out of measure; B advances.
  {
    a: limbs(-0.35, 0.15, -0.7, -0.5, -0.35, 0.3, -0.2, -0.1),
    b: limbs(0.38, 0.4, -1.0, 0.2, 0.2, 0.95, 0.62, -0.52),
  },
  // B cuts overhead; A cross-blocks.
  {
    a: limbs(-0.16, 0.32, -1.35, -0.15, 0.65, 0.45, 0.26, -0.3),
    b: limbs(0.36, 0.45, -1.5, 0.4, 0.12, 1.0, 0.6, -0.5),
  },
  // The pause. Both open, blades wide — the beat before it starts again.
  {
    a: limbs(0.05, 0.1, -0.25, -0.55, -0.5, -0.7, 0.18, -0.22),
    b: limbs(0.05, 0.1, -0.25, -0.55, -0.5, -0.7, 0.18, -0.22),
  },
  // A thrusts; B deflects downward.
  {
    a: limbs(0.42, 0.5, -0.2, 0.1, -0.05, 1.05, 0.7, -0.58),
    b: limbs(-0.1, 0.4, 0.1, 0.45, 0.7, -0.25, 0.3, -0.35),
  },
];

function mixLimbs(a: Limbs, b: Limbs, k: number): Limbs {
  return {
    lean: a.lean + (b.lean - a.lean) * k,
    crouch: a.crouch + (b.crouch - a.crouch) * k,
    shoulder: a.shoulder + (b.shoulder - a.shoulder) * k,
    elbow: a.elbow + (b.elbow - a.elbow) * k,
    wrist: a.wrist + (b.wrist - a.wrist) * k,
    offArm: a.offArm + (b.offArm - a.offArm) * k,
    frontLeg: a.frontLeg + (b.frontLeg - a.frontLeg) * k,
    backLeg: a.backLeg + (b.backLeg - a.backLeg) * k,
  };
}

type FighterStyle = "hooded" | "caped" | "haloed" | "horned";

/**
 * Draw one figure and return the tip of its blade, which is what the caller
 * needs to know whether the blades just met.
 */
function drawFighter(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  groundY: number,
  s: number,
  facing: number,
  l: Limbs,
  style: FighterStyle,
  ink: string,
  blade: string,
  core: string,
  /** Blade length, 0–1. Below 1 the blade is still extending from the hilt. */
  extend: number,
  /** Unsteadiness in the blade's length, sampled per figure per frame. */
  flicker: number,
): { x: number; y: number } {
  const hipX = baseX;
  const hipY = groundY - s * 0.46 + l.crouch * s * 0.07;

  const shX = hipX + Math.sin(l.lean) * facing * s * 0.3;
  const shY = hipY - Math.cos(l.lean) * s * 0.3;
  const headX = shX + Math.sin(l.lean) * facing * s * 0.1;
  const headY = shY - Math.cos(l.lean) * s * 0.1;
  const headR = s * 0.072;

  const kneeFX = hipX + Math.sin(l.frontLeg) * facing * s * 0.24;
  const kneeFY = hipY + Math.cos(l.frontLeg) * s * 0.24;
  const footFX = kneeFX + Math.sin(l.frontLeg * 0.35) * facing * s * 0.24;
  const kneeBX = hipX + Math.sin(l.backLeg) * facing * s * 0.24;
  const kneeBY = hipY + Math.cos(l.backLeg) * s * 0.24;
  const footBX = kneeBX + Math.sin(l.backLeg * 0.35) * facing * s * 0.24;

  const elbX = shX + Math.cos(l.shoulder) * facing * s * 0.17;
  const elbY = shY + Math.sin(l.shoulder) * s * 0.17;
  const handX = elbX + Math.cos(l.shoulder + l.elbow) * facing * s * 0.16;
  const handY = elbY + Math.sin(l.shoulder + l.elbow) * s * 0.16;
  const bladeAngle = l.shoulder + l.elbow + l.wrist;
  // The blade is never quite still. A ~1.5% length wobble is the whole trick
  // behind the way these read on screen — a perfectly rigid glowing line looks
  // like a drawn stick, and the same line breathing slightly looks like it is
  // being *held*. It is deliberately too small to see as movement.
  const reach = s * 0.6 * extend * (1 + flicker * 0.015);
  const tipX = handX + Math.cos(bladeAngle) * facing * reach;
  const tipY = handY + Math.sin(bladeAngle) * reach;

  const offElbX = shX + Math.cos(l.offArm) * facing * s * 0.17;
  const offElbY = shY + Math.sin(l.offArm) * s * 0.17;
  const offHandX = offElbX + Math.cos(l.offArm + 0.5) * facing * s * 0.16;
  const offHandY = offElbY + Math.sin(l.offArm + 0.5) * s * 0.16;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // The cape hangs behind the shoulders and drags — drawn first so the body
  // covers its top edge.
  if (style === "caped") {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(shX, shY - s * 0.02);
    ctx.lineTo(shX - facing * s * 0.2, hipY + s * 0.3);
    ctx.lineTo(shX - facing * s * 0.02, hipY + s * 0.34);
    ctx.lineTo(shX + facing * s * 0.03, shY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = ink;

  ctx.lineWidth = Math.max(2, s * 0.026);
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeFX, kneeFY);
  ctx.lineTo(footFX, groundY);
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeBX, kneeBY);
  ctx.lineTo(footBX, groundY);
  ctx.stroke();

  ctx.lineWidth = Math.max(3, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(shX, shY);
  ctx.stroke();

  ctx.lineWidth = Math.max(2, s * 0.028);
  ctx.beginPath();
  ctx.moveTo(shX, shY);
  ctx.lineTo(offElbX, offElbY);
  ctx.lineTo(offHandX, offHandY);
  ctx.moveTo(shX, shY);
  ctx.lineTo(elbX, elbY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, TAU);
  ctx.fill();

  if (style === "hooded") {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(headX - facing * headR * 1.5, headY + headR * 1.3);
    ctx.lineTo(headX + facing * headR * 0.2, headY - headR * 2.1);
    ctx.lineTo(headX + facing * headR * 1.4, headY + headR * 0.9);
    ctx.closePath();
    ctx.fill();
  } else if (style === "caped") {
    // A brow ridge and a jaw line: enough to read as a helmet at this size.
    ctx.globalAlpha = 0.55;
    ctx.fillRect(headX - headR, headY - headR * 1.15, headR * 2, headR * 0.5);
    ctx.fillRect(headX - headR * 0.7, headY + headR * 0.55, headR * 1.4, headR * 0.55);
  } else if (style === "haloed") {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = blade;
    ctx.lineWidth = Math.max(1.5, s * 0.014);
    ctx.beginPath();
    ctx.ellipse(headX, headY - headR * 1.6, headR * 1.25, headR * 0.42, 0, 0, TAU);
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.72, headY - headR * 0.62);
    ctx.lineTo(headX - headR * 1.25, headY - headR * 2.0);
    ctx.moveTo(headX + headR * 0.72, headY - headR * 0.62);
    ctx.lineTo(headX + headR * 1.25, headY - headR * 2.0);
    ctx.stroke();
  }

  // The blade: three passes, widest and faintest first, so the glow falls away
  // from a bright core without needing a gradient or an alpha-composited layer.
  const hiltX = handX - Math.cos(bladeAngle) * facing * s * 0.035;
  const hiltY = handY - Math.sin(bladeAngle) * s * 0.035;

  ctx.strokeStyle = blade;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = Math.max(9, s * 0.075);
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(4, s * 0.034);
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = core;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = Math.max(1.5, s * 0.012);
  ctx.beginPath();
  ctx.moveTo(hiltX, hiltY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.globalAlpha = 1;
  return { x: tipX, y: tipY };
}

/**
 * Build the effect for one pairing. Both duels are the same fight with different
 * silhouettes, so they share every line of logic below.
 */
function duelling(left: FighterStyle, right: FighterStyle): Effect {
  return ({ ctx, w, h, p, t }, cache) => {
    let st = cache.duel;
    if (!st) {
      st = cache.duel = {
        from: STANCES[0],
        to: STANCES[1],
        k: 0,
        speed: 0.55,
        sparks: [],
        prev: t,
        flash: 0,
        flashX: 0,
        flashY: 0,
        ignite: 0,
      };
    }

    // **Clamped.** `t` arrives already multiplied by boost, so a scroll surge or
    // the screensaver kicking in would otherwise hand this a delta big enough to
    // teleport the fighters through a whole stance. A dropped frame is cheaper
    // than a jump cut, and a negative delta (palette reload, clock reset) must
    // never run the duel backwards.
    const dt = Math.min(0.05, Math.max(0, t - st.prev));
    st.prev = t;

    st.k += dt * st.speed;
    if (st.k >= 1) {
      st.k = 0;
      st.from = st.to;
      // Random, but never the same stance twice running — repeating one reads as
      // the animation having frozen, which is the one thing an endless fight
      // cannot afford to look like.
      let next = st.to;
      for (let guard = 0; guard < 8 && next === st.to; guard += 1) {
        next = STANCES[(Math.random() * STANCES.length) | 0];
      }
      st.to = next;
      // Varying the speed is what stops the duel reading as a metronome: a slow
      // circling recovery followed by a fast exchange is a fight, an even
      // cadence is a machine.
      st.speed = 0.35 + Math.random() * 0.8;
    }

    const k = st.k * st.k * (3 - 2 * st.k);
    const la = mixLimbs(st.from.a, st.to.a, k);
    const lb = mixLimbs(st.from.b, st.to.b, k);

    const s = Math.min(h * 0.5, w * 0.34);
    const groundY = h * 0.8;
    const cx = w / 2;
    const gap = s * 0.62;

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.9, groundY);
    ctx.lineTo(cx + s * 1.9, groundY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Ignition. The blades grow out of the hilts over the first ~0.6s of the
    // effect's life rather than snapping on, which is what makes switching to
    // this effect read as the fight starting instead of a frame appearing.
    st.ignite = Math.min(1, st.ignite + dt * 1.7);
    const extend = st.ignite * st.ignite * (3 - 2 * st.ignite);

    // Two different phases so the pair never flickers in unison, which would
    // read as the whole canvas pulsing rather than as two separate blades.
    const flickerA = Math.sin(t * 47) + Math.sin(t * 83.3 + 1.7);
    const flickerB = Math.sin(t * 51.7 + 2.9) + Math.sin(t * 79.1);

    const tipA = drawFighter(
      ctx, cx - gap, groundY, s, 1, la, left, p.fg, p.a1, p.fg, extend, flickerA,
    );
    const tipB = drawFighter(
      ctx, cx + gap, groundY, s, -1, lb, right, p.fg, p.a3, p.fg, extend, flickerB,
    );

    const dist = Math.hypot(tipA.x - tipB.x, tipA.y - tipB.y);
    if (dist < s * 0.16 && st.flash < 0.3) {
      st.flash = 1;
      st.flashX = (tipA.x + tipB.x) / 2;
      st.flashY = (tipA.y + tipB.y) / 2;
      for (let i = 0; i < 16; i += 1) {
        const ang = Math.random() * TAU;
        const speed = s * (0.35 + Math.random() * 1.2);
        st.sparks.push({
          x: st.flashX,
          y: st.flashY,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - s * 0.25,
          life: 1,
        });
      }
    }
    st.flash = Math.max(0, st.flash - dt * 2.6);

    if (st.flash > 0) {
      // Concentric discs rather than a radial gradient: the palette hands out hex
      // strings and a gradient would need them as rgba, which means parsing a
      // colour — the one thing this file is careful never to do.
      ctx.fillStyle = p.a2;
      for (let i = 3; i >= 1; i -= 1) {
        ctx.globalAlpha = st.flash * 0.14 * i;
        ctx.beginPath();
        ctx.arc(st.flashX, st.flashY, s * 0.05 * i * (2 - st.flash), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (st.sparks.length > 220) st.sparks.splice(0, st.sparks.length - 220);
    const alive: Spark[] = [];
    ctx.fillStyle = p.a2;
    for (const sp of st.sparks) {
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += s * 2.4 * dt;
      sp.life -= dt * 1.6;
      if (sp.life <= 0) continue;
      alive.push(sp);
      ctx.globalAlpha = Math.min(1, sp.life) * 0.85;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(1, s * 0.008 * sp.life + 0.6), 0, TAU);
      ctx.fill();
    }
    st.sparks = alive;
    ctx.globalAlpha = 1;
  };
}

const duel = duelling("hooded", "caped");
const duelholy = duelling("haloed", "horned");

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
  duel,
  duelholy,
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
