/**
 * The canvas backgrounds. Twelve are the spec's (SPEC.md § "The twelve canvas
 * backgrounds"), ported from the prototype's startFx()
 * (design/prototype.html:823); the two duels and the two HUD effects are this
 * codebase's own — see FX in src/data/catalog.ts for what is listed and what is
 * merely holding an index.
 *
 * Every effect reads the live palette off the frame rather than closing over
 * one, which is what lets the canvas recolour smoothly during the .9s palette
 * bleed instead of cutting. `boost` arrives already folded into `t` for the
 * time-based effects and is applied directly by the ones that advance their own
 * particles, exactly as in the prototype.
 */

import type { FxId } from "../data/catalog";
import type { Palette } from "../data/palettes";
import {
  BLADE_COLORS,
  FEET_Y as DUEL_FEET_Y,
  WORLD_H as DUEL_WORLD_H,
  WORLD_W as DUEL_WORLD_W,
  advanceDuel,
  createDuel,
  drawDuel,
} from "./duel";
import type { DuelState, FighterStyle } from "./duel";

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
  /**
   * The screensaver is on — the chrome has faded out and the canvas has the
   * screen to itself.
   *
   * Deliberately its own flag rather than something read back out of `boost`:
   * scroll velocity is folded into that same number, so a hard scroll is
   * indistinguishable from a sleeping interface there. Only `duelling` uses it
   * (see its attract mode); every other effect is a field that already fills
   * the viewport and has nothing to gain from the extra room.
   */
  sleeping: boolean;
  /**
   * The adaptive-resolution tier, 1 / 0.75 / 0.5 — see `FxCanvas`.
   *
   * Only the two effects whose cost is bound by *draw calls* rather than by
   * pixels read it, to coarsen their grid: the buffer shrinking beneath them
   * does nothing for a fixed count of blits or fills. Everything else ignores
   * it deliberately, because for a particle field the buffer change already is
   * the fix and a second knob would only make the tier visible.
   */
  quality: number;
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
  /**
   * This column belongs to the far plane: slower, dimmer, drawn in `faint`
   * rather than `a1`, and with no bloom on its head.
   *
   * Before this the field was one plane. Speed varied threefold and *nothing
   * else did* — every glyph the same 16px, the same body colour, the same head
   * treatment, on an exact 16px lattice with no gaps. Speed variation with
   * nothing correlated to it reads as "some are fast", never as "some are far
   * away", so the effect was a well-built wall of one material.
   */
  deep: boolean;
  /** Left empty. Negative space is what makes the drawn columns read as chosen. */
  dead: boolean;
  /**
   * One glyph *index* per row, mutated in place while on screen. Indices rather
   * than the characters themselves, because the glyphs are now blitted out of a
   * pre-rendered atlas keyed by index — see `rainAtlas`.
   */
  glyphs: number[];
}

/**
 * Effect state that must survive between frames — the grown tree, particle
 * fields, rain columns. Held by the caller so the loop can keep it across
 * palette changes but drop it when the effect itself changes.
 */
export interface FxCache {
  rain?: { columns: number; rows: number; streams: RainColumn[] } | null;
  parts?: Particle[] | null;
  /** The box `parts` was seeded for — see `field()`. */
  partsBox?: { w: number; h: number } | null;
  /**
   * The grown tree, with the box it was grown for and the pool of random
   * numbers it was grown from. Both are part of the cache because `vessels` is
   * the one effect whose geometry is neither recomputed per frame nor able to
   * wrap back into a new box — see the note on `buildTree`.
   */
  tree?: { w: number; h: number; pool: number[]; t0: number; branches: Branch[] } | null;
  flow?: Channel[] | null;
  /** The duel's match state — fighters, health, sparks, the match counter. */
  duel?: DuelState | null;
  /**
   * `scan`'s static sphere, pre-rendered once per box and palette.
   *
   * The wireframe — 7 longitudes, 5 latitudes, 8 rim ticks — does not change
   * between frames, but it was being stroked from scratch on every one: twenty
   * antialiased ellipse paths at up to a 2600px buffer. Drawn once into an
   * offscreen canvas and blitted, it costs a single `drawImage`.
   */
  scanSphere?: { w: number; h: number; key: string; canvas: HTMLCanvasElement } | null;
  /**
   * `plasma`'s colour ramp and its reusable draw buckets, keyed on the three
   * accents. The buckets live here rather than being allocated per frame: they
   * are reset with `length = 0` and refilled, so a 60Hz effect does not hand the
   * collector twenty-two arrays a frame.
   */
  plasma?: { key: string; fill: string[]; alpha: number[]; buckets: number[][] } | null;
  /**
   * `rain`'s pre-rendered glyph atlas and head bloom.
   *
   * Every glyph in the set drawn once per colour into one strip, at device
   * resolution, plus one radial-gradient sprite for the leading glyph's glow.
   * Keyed on the two palette roles, the cell size *and* the device scale — the
   * scale belongs in the key because `FxCanvas`'s quality tier changes it
   * without changing `w`/`h`, and an atlas rendered for the old scale would be
   * magnified into a blur.
   */
  rainAtlas?: {
    key: string;
    canvas: HTMLCanvasElement;
    bloom: HTMLCanvasElement;
    cw: number;
    ch: number;
  } | null;
  /**
   * The duel's attract-mode blend, 0 (background) to 1 (screensaver). Eased
   * rather than switched, so nothing about the fight jumps when the interface
   * goes to sleep. Cached beside the match rather than inside `DuelState`
   * because the ornament shares that state and has no attract mode.
   */
  attract?: number;
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

/**
 * The shared particle field, seeded for a box rather than for a fixed count.
 *
 * Counts used to be constants — 260 stars, 90 nodes, 46 discs — with
 * `parts.length !== n` as the reseed guard. A constant count means density
 * swings with the viewport: 90 constellation nodes over a 390×844 phone is one
 * per 3,700px², against one per 14,400px² on a 1440×900 desktop, so the phone
 * got a mesh roughly four times denser *and* four times more expensive, on the
 * weaker hardware, behind the same body copy.
 *
 * Scaling the count with area fixes that and breaks the old guard: the target
 * count now changes with the box, so `length !== n` would reseed on every frame
 * of a drag-resize and re-roll the whole field sixty times a second. The box is
 * therefore stored alongside the field and a rebuild happens only when the area
 * moves by more than a third — which a drag crosses once, not continuously.
 * This is the same resize discipline `vessels` and `rain` already follow.
 */
function field(
  cache: FxCache,
  w: number,
  h: number,
  n: number,
  tune?: (s: Particle) => Particle,
): Particle[] {
  const box = cache.partsBox;
  const stale =
    !cache.parts || !box || Math.abs(w * h - box.w * box.h) / (box.w * box.h) > 0.35;
  if (stale) {
    const parts = seed(w, h, n);
    cache.parts = tune ? parts.map(tune) : parts;
    cache.partsBox = { w, h };
  }
  return cache.parts as Particle[];
}

/**
 * Recursively grown branching tree, depth 6, rooted below the bottom edge.
 *
 * The randomness comes from `pool` rather than from `Math.random()` directly,
 * and the pool is kept in the cache. That is what lets the tree be rebuilt at a
 * new canvas size and come back as the *same* tree, merely re-fitted — the two
 * alternatives on a resize are both visibly wrong. Keep the old geometry and
 * the trunk (rooted at `w * 0.5`) drifts off-centre while the two side branches
 * (rooted at `-10` and `w + 10`) detach from the edges and float in mid-canvas.
 * Re-roll it and the whole tree reshuffles on every frame of a drag-resize.
 *
 * Depth can still change with the box, because the `len < 14` floor bites at a
 * different level on a short canvas; the pool keeps that to a local difference
 * instead of a new tree.
 */
function buildTree(w: number, h: number, pool: number[]): Branch[] {
  const branches: Branch[] = [];
  let taken = 0;
  const rnd = () => {
    while (pool.length <= taken) pool.push(Math.random());
    return pool[taken++];
  };
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    if (depth > 6 || len < 14) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branches.push({ x, y, x2, y2, depth, phase: rnd() * 6.28 });
    const kids = depth < 2 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      grow(x2, y2, ang + (rnd() - 0.5) * 1.25, len * (0.62 + rnd() * 0.2), depth + 1);
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
  // Rebuilt on a box change, not only on an effect change. `FxCanvas` drops the
  // cache only when the effect id changes, on the grounds that a resize is
  // absorbed by the effects themselves — every particle field wraps back in and
  // `rain` rebuilds its columns. The tree does neither, so it has to say so.
  if (!cache.tree || cache.tree.w !== w || cache.tree.h !== h) {
    const pool = cache.tree?.pool ?? [];
    // `t0` survives the rebuild along with the pool. It is the origin of the
    // growth reveal below, and a resize must not replay it — during a
    // drag-resize the tree would retract and regrow on every frame.
    const t0 = cache.tree?.t0 ?? t;
    cache.tree = { w, h, pool, t0, branches: buildTree(w, h, pool) };
  }
  /*
   * The tree grows in, depth by depth (2026-08-14 animation audit).
   *
   * It was built complete on the first frame and thereafter only shimmered:
   * stepping the default effect through 1s, 6s, 15s and 30s produced four
   * near-identical images. For the effect that every first-time visitor sees,
   * that is the whole entrance thrown away — the shape is its most interesting
   * property and it was over before anyone could look at it.
   *
   * `age` is in `t` units, which advance 0.011 a frame, so 0.66 to the second.
   * A depth waits 0.24 (~0.36s) longer than its parent and takes 0.4 (~0.6s) to
   * extend, putting the last tips down at about 2.8s. The per-branch `phase`
   * jitter is what stops siblings arriving in lockstep, which is the tell that
   * separates a plant from a progress bar.
   */
  const age = t - cache.tree.t0;
  for (const b of cache.tree.branches) {
    const due = b.depth * 0.24 + (b.phase / TAU) * 0.12;
    const grow = Math.min(1, Math.max(0, (age - due) / 0.4));
    if (grow <= 0) continue;
    const near = 1 - Math.min(1, Math.hypot(b.x2 - mx * w, b.y2 - my * h) / 420);
    const wave = (Math.sin(t * 2.2 - b.depth * 0.9 + b.phase) + 1) / 2;
    ctx.strokeStyle = b.depth < 2 ? p.a1 : b.depth < 4 ? p.a2 : p.a3;
    ctx.globalAlpha = (0.1 + wave * 0.2 + near * 0.28) * grow;
    ctx.lineWidth = Math.max(1, (7 - b.depth) * (1 + near * 0.5));
    ctx.lineCap = "round";

    // Sway scales with depth: a trunk barely moves and a tip whips. One
    // amplitude for every branch — which is what this was — reads as the whole
    // tree sliding rather than bending. The per-branch rate keeps the canopy
    // from breathing as a single object.
    const swayAmp = 1.5 + b.depth * 2.4;
    const cx = (b.x + b.x2) / 2 + Math.sin(t * (0.8 + b.depth * 0.16) + b.phase) * swayAmp;
    const cy = (b.y + b.y2) / 2;

    // De Casteljau: the sub-curve from 0 to `grow` starts at the same point,
    // with control `lerp(P0, C, grow)` and endpoint the curve's own value there.
    const ax = b.x + (cx - b.x) * grow;
    const ay = b.y + (cy - b.y) * grow;
    const bx = cx + (b.x2 - cx) * grow;
    const by = cy + (b.y2 - cy) * grow;
    const ex = ax + (bx - ax) * grow;
    const ey = ay + (by - ay) * grow;

    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(ax, ay, ex, ey);
    ctx.stroke();
    if (grow >= 1 && b.depth > 3 && wave > 0.82) {
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

const randomGlyph = () => (Math.random() * RAIN_GLYPHS.length) | 0;
/** Vertical room per atlas cell, in multiples of the cell — descender space. */
const RAIN_CELL_H = 1.25;

function newRainColumn(rows: number, above: boolean): RainColumn {
  const deep = Math.random() < 0.3;
  return {
    deep,
    dead: Math.random() < 0.08,
    // A fresh column starts above the top edge, which is what staggers the
    // streams; the very first fill spreads them over the height instead, so the
    // effect does not begin with an empty screen.
    head: above ? -Math.random() * rows * 0.8 : Math.random() * rows,
    speed: (RAIN_SPEED_MIN + Math.random() * RAIN_SPEED_RANGE) * (deep ? 0.55 : 1),
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
const rain: Effect = ({ ctx, w, h, p, boost, quality }, cache) => {
  // A coarser cell at a lower tier is the only lever that helps here: the cost
  // is ~1,900 blits a frame and every one of them survives a smaller buffer.
  // Rounded, so the two tiers below 1 give whole-pixel cells (20px, 32px).
  const size = Math.round(RAIN_CELL / quality);
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

  /*
   * The glyphs are blitted from an atlas, not typeset per frame.
   *
   * Measured at 1530×860 this effect cost 3.0ms a frame — three to six times
   * every other background in the file, and comfortably the site's real lag.
   * Two things accounted for it. Roughly 2,100 `fillText` calls a frame, each
   * one re-running text shaping for a single character; and 96 more `fillText`
   * calls with `shadowBlur = 14`, which forces an offscreen Gaussian pass per
   * call and is among the most expensive operations in the 2D API.
   *
   * Both are now pre-rendered once: every glyph in the set drawn twice (body in
   * `a1`, head in `fg`) into one strip, and the head's glow baked into a single
   * radial-gradient sprite. A trail glyph becomes one `drawImage` from a source
   * rect, which skips shaping entirely, and the bloom becomes one more.
   *
   * Rendered at the device scale rather than at CSS pixels: the base transform
   * would otherwise magnify a CSS-resolution atlas and every glyph would be
   * soft on a retina display — the same trap `scanSphere` sets. Read before the
   * mirror flip below, since that negates the matrix's `a`.
   */
  const dScale = Math.abs(ctx.getTransform().a) || 1;
  const font = `${size}px ui-monospace, "MS Gothic", monospace`;
  const key = `${p.a1}|${p.fg}|${p.faint}|${p.muted}|${size}|${dScale}`;
  let atlas = cache.rainAtlas;
  if (!atlas || atlas.key !== key) {
    const cw = Math.ceil(size * dScale);
    const ch = Math.ceil(size * RAIN_CELL_H * dScale);
    const sheet = document.createElement("canvas");
    sheet.width = cw * RAIN_GLYPHS.length;
    sheet.height = ch * 4;
    const o = sheet.getContext("2d");
    if (o) {
      o.setTransform(dScale, 0, 0, dScale, 0, 0);
      o.font = font;
      o.textBaseline = "top";
      // Four rows: near body, near head, far body, far head. The far plane is
      // the palette's structural greys rather than its accent, which is what
      // makes it read as distance instead of as "the same rain, dimmer".
      const rows4 = [p.a1, p.fg, p.faint, p.muted];
      for (let r = 0; r < 4; r++) {
        o.fillStyle = rows4[r];
        for (let g = 0; g < RAIN_GLYPHS.length; g++) {
          o.fillText(RAIN_GLYPHS[g], g * size, size * RAIN_CELL_H * r);
        }
      }
    }

    /*
     * The head's glow, once.
     *
     * Sized tightly on purpose. The first version was a 64px sprite, which is
     * generous cover for a `shadowBlur: 14` — and both wrong and expensive: 96
     * of them a frame is nearly 400k pixels of alpha-blended gradient, so it
     * simply moved the cost from the blur to the fill rate, and at that radius
     * the glyph reads as a glowing ball rather than as a lit character. 28px is
     * about twice the cell, which is what a phosphor bloom actually looks like.
     */
    const BLOOM = 28;
    const bloom = document.createElement("canvas");
    bloom.width = bloom.height = Math.ceil(BLOOM * dScale);
    const bctx = bloom.getContext("2d");
    if (bctx) {
      bctx.setTransform(dScale, 0, 0, dScale, 0, 0);
      const g = bctx.createRadialGradient(BLOOM / 2, BLOOM / 2, 0, BLOOM / 2, BLOOM / 2, BLOOM / 2);
      g.addColorStop(0, p.a1);
      g.addColorStop(0.4, `${p.a1}59`);
      g.addColorStop(1, `${p.a1}00`);
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, BLOOM, BLOOM);
    }
    atlas = cache.rainAtlas = { key, canvas: sheet, bloom, cw, ch };
  }
  const glyphH = size * RAIN_CELL_H;

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
    if (stream.dead) continue;

    const x = -(i * size + size);
    const bodyRow = stream.deep ? atlas.ch * 2 : 0;
    const headRow = stream.deep ? atlas.ch * 3 : atlas.ch;
    const dim = stream.deep ? 0.45 : 1;
    const head = Math.floor(stream.head);

    /*
     * Tail first, head last, so the bright glyph is never overdrawn — and the
     * dead end of the tail is not drawn at all. Alpha is `fade²` with
     * `fade = 1 - k/length`, so beyond 78% of the trail it is under 0.05, which
     * through a 0.9-opacity canvas under the vignette is not on the screen.
     * Roughly a fifth of this effect's draw calls, for no visible change.
     */
    const tail = Math.min(stream.length - 1, Math.floor(stream.length * 0.78));
    for (let k = tail; k >= 1; k--) {
      const row = head - k;
      if (row < 0 || row >= rows) continue;
      // Mutation is weighted toward the head rather than uniform across the
      // trail: flicker belongs where the eye already is, and a twinkling dead
      // tail is noise. The total mutation count barely moves.
      const fade = 1 - k / stream.length;
      if (Math.random() < RAIN_MUTATE * (1 + 3 * fade)) stream.glyphs[row] = randomGlyph();
      ctx.globalAlpha = fade * fade * dim;
      ctx.drawImage(
        atlas.canvas,
        stream.glyphs[row] * atlas.cw,
        bodyRow,
        atlas.cw,
        atlas.ch,
        x,
        row * size,
        size,
        glyphH,
      );
    }

    if (head >= 0 && head <= rows) {
      if (Math.random() < RAIN_MUTATE * 4) stream.glyphs[head] = randomGlyph();
      // No bloom on the far plane — a distant light does not flare.
      if (!stream.deep) {
        const bw = atlas.bloom.width / dScale;
        ctx.globalAlpha = 0.42;
        ctx.drawImage(atlas.bloom, x + size / 2 - bw / 2, head * size + size / 2 - bw / 2, bw, bw);
      }
      ctx.globalAlpha = dim;
      ctx.drawImage(
        atlas.canvas,
        stream.glyphs[head] * atlas.cw,
        headRow,
        atlas.cw,
        atlas.ch,
        x,
        head * size,
        size,
        glyphH,
      );
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
};

/**
 * 5. Warp stars — a radial field streaming out past the viewer.
 *
 * **The speed has a constant floor** (2026-08-14 animation audit). Motion was
 * purely `distance * 0.012 * z`, i.e. proportional to radius, so a star's speed
 * fell to nothing as it approached the centre. That is right for perspective
 * and wrong as a picture: the steady state of a `1/r` drift is a crowd, and
 * roughly 60% of the field ended up loitering within 200px of the middle,
 * moving fractions of a pixel a frame. Thirty seconds in, "warp stars" was a
 * smudge in the centre with streaks in the corners the vignette had already
 * erased — it hid its best part and displayed its worst. The floor keeps
 * everything moving; the radial term still does the perspective.
 *
 * Respawn is on a ring rather than in a box around the centre. The box included
 * the exact centre, and a star born there had a near-infinite crawl ahead of it.
 */
const stars: Effect = ({ ctx, w, h, p, boost, mx, my }, cache) => {
  const n = Math.round(Math.min(300, Math.max(90, (w * h) / 5200)));
  const parts = field(cache, w, h, n);
  // Up into the vignette's clear band, and drifting with the shared pointer
  // light rather than pinned — the same shallow 5% `scan` uses.
  const cx = w * 0.5 + (mx - 0.5) * w * 0.06;
  const cy = h * 0.4 + (my - 0.5) * h * 0.05;
  for (const s of parts) {
    const dx = s.x - cx;
    const dy = s.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const sp = (0.35 + d * 0.012) * s.z * boost;
    s.x += (dx / d) * sp;
    s.y += (dy / d) * sp;

    // A depth-proportional roll about the centre, to first order — near stars
    // sweep visibly faster than far ones, which is parallax delivered rather
    // than asserted. No trig: over a thousand frames the radius inflates by
    // about 0.05%, and the respawn ring resets it long before that matters.
    const rot = 0.0009 * s.z * boost;
    s.x -= dy * rot;
    s.y += dx * rot;

    if (s.x < 0 || s.x > w || s.y < 0 || s.y > h) {
      const a = Math.random() * TAU;
      const rr = 48 + Math.random() * 34;
      s.x = cx + Math.cos(a) * rr;
      s.y = cy + Math.sin(a) * rr;
      s.z = Math.random() + 0.2;
    }

    // Three bands rather than a binary split at z > 0.8, so the far plane gets
    // `faint` — the role that exists for it — and the palette shows three
    // colours instead of two.
    ctx.strokeStyle = s.z > 0.86 ? p.a1 : s.z > 0.5 ? p.a2 : p.faint;
    ctx.globalAlpha = 0.16 + s.z * 0.56;
    // Off the sub-pixel floor: `z * 1.5` bottomed out at 0.3px, which
    // antialiases to grey regardless of the colour set above it.
    ctx.lineWidth = 0.55 + s.z * 1.35;
    // The trail has a floor too, for the same reason the speed does — it was
    // `dx * 0.05`, so the centre of the field drew dots, not streaks.
    const tl = 3 + sp * 4.2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - (dx / d) * tl, s.y - (dy / d) * tl);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** 6. Constellation — 90 drifting nodes, joined when closer than 150px. */
const constellation: Effect = ({ ctx, w, h, p, t, boost, mx, my }, cache) => {
  const n = Math.round(Math.min(120, Math.max(34, (w * h) / 15000)));
  const range = Math.min(190, Math.max(88, Math.sqrt(w * h) * 0.132));
  /*
   * Velocity is sampled as an angle and a speed, not as two independent
   * components (2026-08-14 audit).
   *
   * `seed()` draws `vx` and `vy` uniformly from ±0.25, which is a *square* of
   * velocities: a few nodes come out with both components near zero and sit
   * visibly parked for the whole visit, and a few more come out with one
   * component near zero and run along a perfect horizontal or vertical rail.
   * Parked dots and axis-aligned rails are the two most legible "screensaver"
   * tells there are. Sampling the angle uniformly and the speed away from zero
   * makes both impossible.
   */
  const parts = field(cache, w, h, n, (s) => {
    const a = Math.random() * TAU;
    const sp = 0.09 + Math.random() * 0.24;
    return { ...s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
  });
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    /*
     * A slow curl, so paths are long arcs rather than straight lines for ever.
     * This is a rotation, so it preserves speed exactly and cannot pump energy
     * into the field. The phase comes from the golden angle on the index rather
     * than from a stored field — deterministic, free, and no two nodes turn
     * together. The 0.21 rate gives a ~30s steer cycle, deliberately longer
     * than anyone looks, so it never resolves into a loop.
     */
    const rot = Math.sin(t * 0.21 + i * 2.399) * 0.011 * boost;
    const rc = Math.cos(rot);
    const rs = Math.sin(rot);
    const nvx = s.vx * rc - s.vy * rs;
    s.vy = s.vx * rs + s.vy * rc;
    s.vx = nvx;

    // Depth drives the drift rate, so the mesh has a front and a back instead
    // of travelling as one sheet.
    const drift = (0.45 + s.z) * boost;
    s.x += s.vx * drift;
    s.y += s.vy * drift;
    // Bounce *and* clamp back inside. Flipping the velocity alone is correct at
    // the edge, where the node is one frame outside and comes straight back —
    // and a trap once a node is far outside, which a **window shrink** does to
    // roughly half of them at once: the flip then reverses every single frame
    // and the node oscillates about its old position for ever, stranded.
    //
    // This is the class of bug CLAUDE.md records for `vessels`, and the note
    // there says particle fields "wrap back in within seconds". They do — but
    // only because `stars` teleports to the centre and `bokeh` reassigns `x` on
    // wrap. `constellation` did neither, so it was the one field the claim was
    // not true of. Clamping costs nothing at the edge and is the whole fix.
    if (s.x < 0 || s.x > w) {
      s.vx *= -1;
      s.x = Math.min(Math.max(s.x, 0), w);
    }
    if (s.y < 0 || s.y > h) {
      s.vy *= -1;
      s.y = Math.min(Math.max(s.y, 0), h);
    }
    /*
     * `z` is read at last. It was seeded on every particle and this effect
     * never looked at it, drawing all ninety nodes in `a1` at alpha 0.55 and
     * radius `s.r`. Depth sitting populated and unused in the data structure is
     * the definition of depth asserted and not delivered — and `s.r` bottomed
     * out at 0.5px, a 1px-diameter arc, which is a smudge rather than a shape.
     */
    const near = 1 - Math.min(1, Math.hypot(s.x - mx * w, s.y - my * h) / 420);
    ctx.fillStyle = near > 0.7 ? p.a3 : s.z > 0.85 ? p.fg : s.z > 0.5 ? p.a1 : p.a2;
    ctx.globalAlpha = 0.2 + s.z * 0.44 + near * 0.26;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 0.9 + s.z * 1.8, 0, TAU);
    ctx.fill();
  }
  /*
   * Reject on the squared distance before taking a square root.
   *
   * This loop is O(n²) and was calling `Math.hypot` on every pair — 4,005 pairs
   * a frame at the old fixed count, of which about 95% are out of range and
   * discarded. `Math.hypot` is variadic and does overflow-safe scaling, so it is
   * several times the cost of the naive form, and it was being paid in full for
   * every rejected pair. Comparing squares rejects at the price of two
   * multiplies and an add, and the root is then taken only for pairs that
   * actually draw. No visual change whatsoever.
   */
  const range2 = range * range;
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= range2) continue;
      const d = Math.sqrt(d2);
      // Links carry depth too, so the near plane is structure and the far plane
      // is atmosphere — which is what makes the mesh read as a volume.
      const zz = (a.z + b.z) * 0.5;
      ctx.globalAlpha = (1 - d / range) * 0.3 * (0.35 + zz * 0.75);
      ctx.strokeStyle = p.a2;
      ctx.lineWidth = 0.5 + zz * 0.9;
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

/** How many quantised brightness bands `plasma` sorts its cells into. */
const PLASMA_BANDS = 22;

/** `#rrggbb` → [r, g, b]. Returns null for anything else, so callers can bail. */
function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * `plasma`'s colour ramp: `a3` → `a2` → `a1` across `PLASMA_BANDS` stops.
 *
 * This replaces a three-way threshold (`a > 0.62 ? a1 : a > 0.42 ? a2 : a3`),
 * which had two problems. It drew two hard contour lines across a field that is
 * otherwise continuous — mach bands, the most obvious artefact a smooth field
 * can have — and the `a3` branch, while it did fire on about a tenth of cells,
 * only ever fired where the alpha ramp was near zero, so the site's third accent
 * was mathematically present and never visible. A ramp fixes both, and it is
 * what makes the bucketed drawing below possible: quantising to a band picks the
 * colour *and* the alpha, so every cell in a band shares one canvas state.
 */
function plasmaRamp(p: Palette): { fill: string[]; alpha: number[] } {
  const lo = hexRgb(p.a3);
  const mid = hexRgb(p.a2);
  const hi = hexRgb(p.a1);
  const fill: string[] = [];
  const alpha: number[] = [];
  for (let i = 0; i < PLASMA_BANDS; i++) {
    const a = (i + 0.5) / PLASMA_BANDS;
    alpha[i] = Math.max(0, (a - 0.35) * 0.32);
    if (!lo || !mid || !hi) {
      // A palette role that is not plain 6-digit hex: fall back to the old
      // discrete choice rather than guessing at the format.
      fill[i] = a > 0.62 ? p.a1 : a > 0.42 ? p.a2 : p.a3;
      continue;
    }
    const [from, to, f] = a < 0.5 ? [lo, mid, a * 2] : [mid, hi, (a - 0.5) * 2];
    const c = (k: number) => Math.round(from[k] + (to[k] - from[k]) * f);
    fill[i] = `rgb(${c(0)},${c(1)},${c(2)})`;
  }
  return { fill, alpha };
}

/**
 * 8. Plasma — a lattice of dots sized and lit by a four-term sine field.
 *
 * **Drawn in bands, not per cell** (2026-08-14 animation audit). This effect
 * issued one `fillStyle`, one `globalAlpha`, one `beginPath`, one `arc` and one
 * `fill` for every cell — about 3,100 of each per frame at 1920×1080, and 190k
 * `fill()` calls a second. It was far and away the most draw-call-bound effect
 * in the file.
 *
 * That matters more than the raw number, because it is the one effect the
 * site's performance lever cannot reach: `FxCanvas`'s adaptive resolution
 * shrinks the *buffer*, and `cell` is measured in CSS pixels, so dropping to the
 * half-resolution tier quarters the fill area and leaves every one of those
 * 3,100 draw calls exactly where it was. Sorting cells into `PLASMA_BANDS`
 * brightness buckets and filling one path per bucket takes it to 22 `fill()`
 * calls and 22 state changes per frame, whatever the viewport. The arcs never
 * overlap, so unioning them into one path is safe under nonzero winding.
 */
const plasma: Effect = ({ ctx, w, h, p, t, beat, quality }, cache) => {
  /*
   * The cell is sized from the viewport, then coarsened by the quality tier.
   *
   * A flat 26px is right on a desktop (about sixty columns) and wrong on a
   * phone, where 390px gives fifteen — dots so large relative to the screen
   * that the lattice stops being a texture and becomes the subject. Tying it to
   * the short edge keeps the *number* of cells roughly constant instead, which
   * is what actually governs how the field reads.
   *
   * Dividing by `quality` rather than multiplying: a lower tier means a coarser
   * grid and fewer cells. As with `rain`, this effect's cost is one arc per cell
   * and the cell is measured in CSS pixels, so the buffer shrinking underneath
   * it changes nothing on its own.
   */
  const cell = Math.round(Math.max(17, Math.min(30, Math.min(w, h) / 26)) / quality);
  const key = `${p.a1}|${p.a2}|${p.a3}`;
  let ramp = cache.plasma;
  if (!ramp || ramp.key !== key) {
    // Keyed on the accents, like `scan`'s sphere: the palette changes under a
    // running effect — that is what the 0.9s bleed *is* — and a ramp built once
    // would simply never follow it.
    ramp = cache.plasma = { key, ...plasmaRamp(p), buckets: [] };
  }
  const buckets = ramp.buckets;
  for (let i = 0; i < PLASMA_BANDS; i++) {
    if (!buckets[i]) buckets[i] = [];
    else buckets[i].length = 0;
  }

  /*
   * Four terms, none of them axis-aligned.
   *
   * The old three were `(0.008, 0)`, `(0, 0.009)` and `(0.006, 0.006)` — two
   * exactly on the axes and one at exactly 45°, over a square sampling lattice.
   * Iso-contours of that are squares and diamonds, so the field read as woven
   * plaid rather than plasma. Their wavelengths also all sat between 700 and
   * 800px, giving the whole thing exactly one spatial scale, and their speeds
   * were commensurate (10 : 13 : 7), which made the entire canvas swell and dim
   * in unison on a ~15s beat and repeat outright every 95s.
   *
   * These four are off-axis, the fourth is a shorter 370px wavelength whose
   * *direction* rotates on a ~136s period, and the four speeds 83/119/61/170 are
   * coprime over 100 — a common period of about 950 seconds, which is not a
   * period anyone will sit through.
   */
  const rc = Math.cos(t * 0.07);
  const rs = Math.sin(t * 0.07);
  for (let x = 0; x < w + cell; x += cell) {
    // Alternate columns are offset half a cell, which turns the square lattice
    // into a hexagonal one. A perfect square grid is legible as a grid at any
    // density; a staggered one reads as a field.
    const oy = (x / cell) & 1 ? cell * 0.5 : 0;
    for (let y = 0; y < h + cell; y += cell) {
      const v =
        Math.sin(x * 0.0071 + y * 0.0026 + t * 0.83) +
        Math.sin(x * -0.0034 + y * 0.0081 - t * 1.19) +
        Math.sin(x * 0.0049 + y * -0.0057 + t * 0.61) +
        0.7 * Math.sin((x * rc + y * rs) * 0.017 + t * 1.7);
      const a = (v + 3.7) / 7.4;
      if (a <= 0.35) continue; // below the alpha floor: nothing would be drawn
      // Radius rides a second, much slower field so size and brightness are no
      // longer the same variable twice — that is what allows big-and-dim and
      // small-and-bright to coexist, which is what gives the field depth.
      const g = Math.sin(x * 0.0019 - y * 0.0023 + t * 0.31) * 0.5 + 0.5;
      const r = cell * (0.22 + 0.38 * a) * (0.7 + 0.5 * g) + 0.8;
      const q = Math.min(PLASMA_BANDS - 1, (a * PLASMA_BANDS) | 0);
      buckets[q].push(x + cell / 2, y + cell / 2 + oy, r);
    }
  }

  // `beat` at last — plasma is the effect most suited to the site's heartbeat
  // and took neither it nor `boost`. One multiply per band, not per cell.
  const pulse = 0.86 + beat * 0.24;
  for (let i = 0; i < PLASMA_BANDS; i++) {
    const b = buckets[i];
    if (!b.length) continue;
    ctx.fillStyle = ramp.fill[i];
    ctx.globalAlpha = ramp.alpha[i] * pulse;
    ctx.beginPath();
    for (let k = 0; k < b.length; k += 3) {
      ctx.moveTo(b[k] + b[k + 2], b[k + 1]);
      ctx.arc(b[k], b[k + 1], b[k + 2], 0, TAU);
    }
    ctx.fill();
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

/**
 * 15. Sweep — a wireframe sphere with a radar arc running round it.
 *
 * Built for the HUD archetype: the one image the reference is actually about,
 * and the reason FxCanvas stopped stretching a fixed buffer. A sweep drawn into
 * a 1600×1000 buffer on a 21:9 display traced an ellipse and the "sphere" was an
 * egg; both are round now because the buffer follows the element.
 *
 * Deterministic throughout — no cache, no seeded field. The blips are computed
 * from their index, so the effect looks the same on every load and there is
 * nothing to drop when the palette changes.
 */
const scan: Effect = ({ ctx, w, h, p, t, mx, my }, cache) => {
  // A shallow pointer drift, not a follow: the instrument is mounted, and a
  // sphere that chases the cursor reads as a toy.
  const cx = w / 2 + (mx - 0.5) * w * 0.05;
  const cy = h / 2 + (my - 0.5) * h * 0.05;
  const r = Math.min(w, h) * 0.4;

  /*
   * The wireframe is pre-rendered (2026-08-14, client: "the radar/sonar is
   * lagging hard").
   *
   * It is twenty antialiased ellipse strokes plus eight ticks, none of which
   * changes between frames — only its *position* does, by a few pixels of
   * pointer drift. Stroking it per frame at a retina buffer was the bulk of
   * this effect's cost. Now it is drawn once into an offscreen canvas sized to
   * the sphere's own bounding box and blitted with one `drawImage`.
   *
   * Keyed on the box *and* the two palette colours it uses: the palette can
   * change under a running effect (that is the whole point of the 0.9s bleed),
   * and a sphere cached in the old colours would simply never update. Keyed on
   * the box because `FxCanvas` drops the effect cache only when the effect id
   * changes — a resize is each effect's own problem, which is exactly what
   * stranded `vessels` earlier today.
   */
  const key = `${p.line}|${p.faint}`;
  const pad = Math.ceil(r * 1.16) + 2;
  const box = pad * 2;
  let sphere = cache.scanSphere;
  if (!sphere || sphere.w !== w || sphere.h !== h || sphere.key !== key) {
    const off = document.createElement("canvas");
    off.width = box;
    off.height = box;
    const o = off.getContext("2d");
    if (o) {
      o.lineWidth = 1;
      o.strokeStyle = p.line;
      o.globalAlpha = 0.85;
      // Longitudes: ellipses whose width is the cosine of their own angle,
      // which is what a set of great circles looks like seen edge-on.
      for (let i = 0; i < 7; i++) {
        const k = (i / 6) * Math.PI - Math.PI / 2;
        o.beginPath();
        o.ellipse(pad, pad, Math.abs(Math.cos(k)) * r, r, 0, 0, TAU);
        o.stroke();
      }
      // Latitudes: flattened ellipses stepped down the sphere.
      for (let j = 1; j < 6; j++) {
        const f = j / 6;
        const rr = Math.sin(f * Math.PI) * r;
        o.beginPath();
        o.ellipse(pad, pad - r + f * 2 * r, rr, rr * 0.16, 0, 0, TAU);
        o.stroke();
      }
      // Eight ticks outside the rim, the furniture that makes it an instrument.
      o.strokeStyle = p.faint;
      for (let a = 0; a < 8; a++) {
        const ang0 = (a / 8) * TAU;
        const c = Math.cos(ang0);
        const sn = Math.sin(ang0);
        o.beginPath();
        o.moveTo(pad + c * r * 1.06, pad + sn * r * 1.06);
        o.lineTo(pad + c * r * 1.13, pad + sn * r * 1.13);
        o.stroke();
      }
    }
    sphere = cache.scanSphere = { w, h, key, canvas: off };
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(sphere.canvas, cx - pad, cy - pad);

  /*
   * The sweep, as one filled wedge instead of twenty-six strokes.
   *
   * It was 26 `beginPath`/`moveTo`/`lineTo`/`stroke` pairs per frame, each with
   * its own `globalAlpha` so they could not be batched — twenty-six separate
   * rasterizer runs to fake one gradient. A conic gradient does it in a single
   * fill, and looks better because the falloff is continuous rather than
   * banded in 26 steps. Guarded, because `createConicGradient` is recent enough
   * to be absent on an older browser; the fallback is the same idea at a
   * quarter of the original step count.
   */
  const ang = (t / 6.4) * TAU;
  const TAIL = 0.9; // radians of trailing wedge
  if (typeof ctx.createConicGradient === "function") {
    /*
     * The stops are placed at `TAIL / TAU`, not at 1.
     *
     * A conic gradient's 0..1 runs the **whole circle** from its start angle,
     * but the wedge below only fills `TAIL` of it — 0.9 of 6.28 radians. With
     * the bright stop at 1 the fill therefore only ever reached 14% of the way
     * to `a1` before the arc ended, and at `globalAlpha` 0.3 that is invisible:
     * the sweep rendered as the bare leading line with no trail behind it,
     * which is precisely how it looked on the site. Anchoring the stop at the
     * fraction the wedge actually occupies makes the falloff span the wedge.
     *
     * This was introduced with the performance rewrite earlier today, which
     * replaced 26 alpha-stepped strokes with one fill. The rewrite was right —
     * the effect went from 0.12 to 0.02ms/frame — but it silently deleted the
     * trail it was meant to preserve.
     */
    const g = ctx.createConicGradient(ang - TAIL, cx, cy);
    g.addColorStop(0, "transparent");
    g.addColorStop(TAIL / TAU, p.a1);
    g.addColorStop(1, p.a1);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, ang - TAIL, ang);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    ctx.strokeStyle = p.a1;
    ctx.lineWidth = 3;
    for (let sIdx = 0; sIdx < 7; sIdx++) {
      const back = ang - sIdx * 0.13;
      ctx.globalAlpha = 0.3 * (1 - sIdx / 7);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(back) * r, cy + Math.sin(back) * r);
      ctx.stroke();
    }
  }
  // The leading edge stays a crisp line — it is what reads as "now".
  ctx.strokeStyle = p.a1;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
  ctx.stroke();

  // Six contacts, lit as the sweep crosses them and fading over ~2s of the
  // 6.4s revolution.
  for (let b = 0; b < 6; b++) {
    const bang = b * 1.047 + 0.4;
    const brad = 0.26 + (((b * 7) % 10) / 10) * 0.6;
    const since = ((ang - bang) % TAU + TAU) % TAU;
    const life = Math.max(0, 1 - (since / TAU) * 6.4 / 2);
    if (life <= 0) continue;

    const bx = cx + Math.cos(bang) * r * brad;
    const by = cy + Math.sin(bang) * r * brad;
    ctx.fillStyle = [p.a1, p.a2, p.a3][b % 3];
    ctx.globalAlpha = life;
    ctx.beginPath();
    ctx.arc(bx, by, 3.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = life * 0.26;
    ctx.beginPath();
    ctx.arc(bx, by, 3.4 + (1 - life) * 24, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/**
 * 16. Telemetry — five oscilloscope lanes under a travelling playhead.
 *
 * The HUD's status strip. Each lane has its own two-term frequency so they
 * never phase-lock into one shape, and the playhead brightens what it is
 * passing, which is what makes it read as data arriving rather than as five
 * sine waves.
 *
 * Deterministic, like `scan` — nothing to seed, nothing to cache.
 */
const telemetry: Effect = ({ ctx, w, h, p, t }) => {
  const lanes = 5;
  const gap = h / (lanes + 1);
  const head = ((t * 0.13) % 1) * w;

  for (let i = 0; i < lanes; i++) {
    const y0 = gap * (i + 1);
    const amp = gap * (0.13 + (i % 3) * 0.07);
    const f1 = 0.004 + i * 0.0016;
    const f2 = 0.011 + i * 0.0009;
    const speed = 0.8 + i * 0.36;

    // The lane's own baseline, so an idle stretch still reads as a channel.
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(w, y0);
    ctx.stroke();

    ctx.strokeStyle = [p.a1, p.a2, p.a3][i % 3];
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";

    // Drawn in short runs rather than one path, so alpha can vary along the
    // lane — brightest just behind the playhead, falling away ahead of it.
    for (let x = 0; x < w; x += 8) {
      const near = 1 - Math.min(1, Math.abs(x - head) / (w * 0.34));
      ctx.globalAlpha = 0.12 + near * 0.5;
      ctx.beginPath();
      for (let s = 0; s <= 8; s += 4) {
        const px = x + s;
        const py =
          y0 +
          Math.sin(px * f1 + t * speed) * amp +
          Math.sin(px * f2 - t * speed * 0.6) * amp * 0.45;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = p.fg;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(head, 0);
  ctx.lineTo(head, h);
  ctx.stroke();
  ctx.globalAlpha = 1;
};

// Duelling figures ------------------------------------------------------------

/**
 * The lightsword duels, rebuilt to `docs/DUEL.md` after the client rejected the
 * stick-figure version twice. The match engine and renderer live in
 * `src/fx/duel.ts` and are shared with the hero-ornament slot; this wrapper
 * only adapts the effect clock to 60Hz frames and lays the fight out as a
 * background — modest scale, no health bars, bodies dimmed so the blades carry
 * it behind body copy.
 *
 * **Listed again since 2026-08-14** (client's call), at the indices 12 and 13
 * they have held throughout (`0-0-C-…`, `0-0-D-…`). They spent a day in `FX`
 * flagged `hidden` rather than absent from it — the array is the share-code wire
 * format, and leaving a gap invited the next appended effect to take those two
 * slots. Re-listing was deleting the two flags, as promised.
 *
 * Composition note, from looking at it on the real site: the fighters land
 * centred with their feet at 80% height, which on Cinematic at a short viewport
 * puts them behind the hero's CTA row. They stay legible and so does the button
 * — `dim: 0.55` is doing its job — but it is the one thing about this effect
 * that reads as placement rather than design, and it is the first thing to look
 * at if the client wants it moved.
 *
 * The note that once stood here about the 404's "12 background modes" line was
 * wrong: no such string exists in `pages.ts` or anywhere else. It went with the
 * hero vitals strip. No copy correction is owed.
 */
/**
 * Per-frame fraction of the remaining distance the attract blend closes.
 *
 * 0.016 puts it ~95% of the way there in about 182 fight frames, which is the
 * 1.6s the chrome takes to fade at the boost the screensaver is running at.
 */
const ATTRACT_RATE = 0.016;

/**
 * Exponential approach that survives a variable frame count.
 *
 * `frames` is not 1 — it is a delta-corrected, boost-inclusive count that the
 * duel already clamps to 4 — so a naive `x += (target - x) * rate` would move
 * a different distance per unit time on every display. Raising the retained
 * fraction to that power is the same curve sampled at the right places.
 */
function approach(from: number, to: number, frames: number): number {
  if (frames <= 0) return from;
  const next = to + (from - to) * Math.pow(1 - ATTRACT_RATE, frames);
  return Math.abs(next - to) < 0.0005 ? to : next;
}

function duelling(left: FighterStyle, right: FighterStyle): Effect {
  return ({ ctx, w, h, p, t, sleeping }, cache) => {
    let st = cache.duel;
    if (!st) st = cache.duel = createDuel(left, right);

    // One tick of the effect clock is 0.011 per 60Hz frame, so delta ÷ 0.011 is
    // a frame count, with boost already folded in. **Clamped**: a scroll surge
    // or the screensaver would otherwise hand this enough frames to teleport
    // the match, and a negative delta (clock reset) must never run the fight
    // backwards. A dropped frame is cheaper than a jump cut.
    const frames = Math.min(4, Math.max(0, (t - st.prev) / 0.011));
    st.prev = t;
    advanceDuel(st, frames);

    // Attract mode: the screensaver has faded the chrome out, so there is no
    // copy left to sit behind and the fight stops being polite about it.
    //
    // Eased, never switched. The chrome takes 1.6s to fade (`.v-chrome` in
    // chrome.css) and a figure that doubled in size on one frame would beat it
    // there and read as a glitch. The rate is expressed in *fight* frames, which
    // run boosted while asleep and unboosted awake, so the growth lands with the
    // fade and the settle back is roughly twice as slow — the right asymmetry:
    // waking up is the moment you want the page back, not a second animation.
    const attract = (cache.attract = approach(cache.attract ?? 0, sleeping ? 1 : 0, frames));

    // Sized as a background, not as a subject — the first attempt's figures were
    // taller than the hero copy. Feet on a line at 80% height, centred. Attract
    // mode spends the room the chrome vacated: about 1.4× linear, feet a little
    // lower so the taller pair still sits on a believable floor.
    const spanW = 0.62 + 0.26 * attract;
    const spanH = 0.55 + 0.23 * attract;
    const scale = Math.min((w * spanW) / DUEL_WORLD_W, (h * spanH) / DUEL_WORLD_H);
    drawDuel(ctx, st, {
      x: (w - DUEL_WORLD_W * scale) / 2,
      y: h * (0.8 + 0.04 * attract) - DUEL_FEET_Y * scale,
      scale,
      ink: p.fg,
      // The blades keep their alignment colours in every palette — the one
      // literal-colour carve-out on the site (see BLADE_COLORS in fx/duel.ts).
      bladeA: BLADE_COLORS[left],
      bladeB: BLADE_COLORS[right],
      core: p.fg,
      spark: p.a2,
      line: p.line,
      // Health bars are wrong behind body copy and right once the copy has gone
      // — the same judgement that made them ornament-only. `barAlpha` is what
      // keeps them from popping in: `bars` is a boolean and cannot be eased.
      bars: attract > 0.01,
      barAlpha: attract,
      dim: 0.55 + 0.45 * attract,
    });
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
  scan,
  telemetry,
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
