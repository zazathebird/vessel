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
   * indistinguishable from a sleeping interface there.
   *
   * **Nothing reads it at present.** `duelling` was its only consumer, for an
   * attract mode the client has since asked to be removed — the screensaver
   * fight and the background fight are now the same scene. It stays on the
   * contract because "the interface is asleep" is a genuinely different fact
   * from "the page is being scrolled hard", and the next effect that wants it
   * should not have to re-derive it.
   */
  sleeping: boolean;
  /**
   * The adaptive-resolution tier — one of the six multipliers in `TIERS`,
   * `1 / 0.8 / 0.62 / 0.5 / 0.38 / 0.28`. See `FxCanvas` and `src/fx/perf.ts`.
   *
   * Only the two effects whose cost is bound by *draw calls* rather than by
   * pixels read it, to coarsen their grid: the buffer shrinking beneath them
   * does nothing for a fixed count of blits or fills. Everything else ignores
   * it deliberately, because for a particle field the buffer change already is
   * the fix and a second knob would only make the tier visible.
   */
  quality: number;
  /**
   * Real elapsed frames since the last render — 1 at a steady 60Hz, 2 on a
   * dropped frame, 0.5 on a 120Hz display. Clamped to [0.2, 3].
   *
   * Deliberately *not* `boost`, which is this multiplied by scroll velocity and
   * the screensaver's bonus. Anything that should run at a fixed rate in real
   * time regardless of what the page is doing — the duel, which is a
   * performance rather than an ambient field — integrates against this.
   */
  dt: number;
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
  /** Depth, 0–1. Size, speed, brightness and bloom are all derived from it. */
  z: number;
  s: number;
  r: number;
  /** Its own tempo and phase, so the field does not surge as one organism. */
  ph: number;
  rate: number;
  /** Offset across the channel, −1 to 1. */
  o: number;
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
  /** The `partsBox` identity `bokeh` last depth-sorted its field for. */
  bokehSorted?: { w: number; h: number } | null;
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
}

/**
 * Sloppy 2π, fine for full-circle `arc()` calls (anything ≥ 2π draws a closed
 * circle) and **never as a modulus or divisor**: used as a wrap it slips
 * 0.0168 rad per revolution, which is how `scan`'s contact flares drifted to
 * the opposite side of the dial over half an hour (fixed 2026-08-18). Angle
 * arithmetic uses `REV`.
 */
const TAU = 6.3;
const REV = Math.PI * 2;

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
 *
 * **The aspect is tested as well as the area, because a phone rotating changes
 * neither the area nor the count.** 390×844 to 844×390 is the same 329,160px²,
 * so an area-only guard sees no change at all and keeps coordinates seeded for
 * a box that no longer exists. `stars` hides it by respawning anything out of
 * bounds within a frame, but `bokeh` does not: its discs rise at 0.09–0.61
 * units a frame, and the ones seeded with a `y` between 390 and 844 are now
 * below the viewport entirely, so the field stays visibly thin for the better
 * part of fifteen seconds after a rotation. Both dimensions matter, not just
 * their product.
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
    !cache.parts ||
    !box ||
    Math.abs(w * h - box.w * box.h) / (box.w * box.h) > 0.35 ||
    Math.abs(w / h - box.w / box.h) / (box.w / box.h) > 0.35;
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
    // Viewport-relative reach: a fixed 420px lit the whole field on a phone.
    const near = 1 - Math.min(1, Math.hypot(b.x2 - mx * w, b.y2 - my * h) / (Math.min(w, h) * 0.5));
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

/**
 * The five channels, each with its own everything.
 *
 * They used to be derived from the lane index: `0.22 + l * 0.14` for y (so lane
 * 2 ran exactly through `h * 0.5`, a bright 10px band with a train of glowing
 * dots straight through the vertical centre of the page), one shared amplitude,
 * one width, one alpha, one direction. Five lanes sliding in lockstep is one
 * moving wallpaper, not five channels.
 *
 * `LANE_S` is signed: two lanes travel against the other three, which is what
 * makes the combined period effectively irrational and kills the wallpaper read
 * outright. `LANE_CYC` counts waves *across the viewport* rather than using an
 * absolute frequency — the old `x * 0.0032` drew 1.75 waves on an ultrawide and
 * 0.19 of one on a phone, i.e. on a phone the lanes were five straight parallel
 * lines. `LANE_A` deliberately rises toward the bottom, compensating for the
 * vignette rather than fighting it.
 */
const LANE_Y = [0.14, 0.27, 0.41, 0.58, 0.74];
const LANE_AMP = [0.055, 0.09, 0.038, 0.075, 0.11];
const LANE_CYC = [1.35, 2.1, 0.85, 1.7, 0.6];
const LANE_S = [0.42, -0.31, 0.58, -0.24, 0.37];
const LANE_W = [6, 11, 4, 9, 13];
const LANE_A = [0.34, 0.52, 0.24, 0.46, 0.6];

/** 2. Flow — five channels with particles travelling along them. */
const flow: Effect = ({ ctx, w, h, p, t, boost }, cache) => {
  if (!cache.flow) {
    cache.flow = Array.from({ length: 78 }, () => {
      const z = Math.random();
      return {
        u: Math.random(),
        lane: (Math.random() * 5) | 0,
        z,
        // Seeded from one depth, so near means large *and* fast *and* bright.
        // `r` and `s` used to be drawn independently, which let a big particle
        // crawl and a tiny one race: size varied, and nothing that would make
        // size mean anything varied with it.
        s: 0.0011 + z * 0.0026,
        r: 0.9 + z * 2.1,
        // Its own tempo and phase. One shared `beat` multiplier accelerated and
        // decelerated all 160 particles in perfect unison, which is the
        // strongest "cheap" signal an effect like this can send.
        ph: Math.random() * TAU,
        rate: 1.4 + Math.random() * 1.1,
        // Off the centreline of its channel — every dot sat exactly on it,
        // which read as beads on a wire rather than as traffic in a lane.
        o: Math.random() * 2 - 1,
      };
    });
  }
  const laneY = (x: number, l: number) =>
    h * LANE_Y[l] +
    Math.sin((x / w) * TAU * LANE_CYC[l] + l * 2.3 + t * LANE_S[l]) * h * LANE_AMP[l];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let l = 0; l < 5; l++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = laneY(x, l);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // `faint` on the loud/wide lanes, `line` on the quiet pair — swapped
    // 2026-08-18: measured, `faint` outshines `line` on all 25 palettes, so
    // the loud lanes were the least visible wires in the composition.
    ctx.strokeStyle = l === 0 || l === 2 ? p.line : p.faint;
    ctx.globalAlpha = LANE_A[l];
    ctx.lineWidth = LANE_W[l];
    ctx.stroke();
  }

  for (const c of cache.flow) {
    c.u += c.s * (0.75 + 0.9 * ((Math.sin(t * c.rate + c.ph) + 1) / 2)) * boost;
    if (c.u > 1) c.u = 0;
    const x = c.u * w;
    const y = laneY(x, c.lane) + c.o * LANE_W[c.lane] * 0.45;
    // Fade in and out at the edges. A hard `u > 1` teleport at full alpha meant
    // a dot popping into existence roughly every 90ms, which was the most
    // visible artefact in the effect.
    const edge = Math.min(1, Math.min(c.u, 1 - c.u) / 0.06);
    // Colour carries depth now, not lane. Keyed to the lane it made each
    // channel monochrome and, with five lanes over three accents, put `a3` in
    // exactly one of them.
    ctx.fillStyle = c.z > 0.66 ? p.a1 : c.z > 0.33 ? p.a2 : p.a3;
    ctx.globalAlpha = (0.35 + c.z * 0.5) * edge;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, TAU);
    ctx.fill();
    // Only near particles bloom — which is both what depth of field does and
    // about seventy fewer arcs a frame.
    // Only the nearest quarter blooms, and modestly. At `r * (2.6 + z * 2.4)`
    // the halo reached nineteen pixels on a three-pixel dot: with the whole
    // field funnelled into five lanes those overlapped into one mass and the
    // channels stopped being readable at all.
    if (c.z > 0.72) {
      ctx.globalAlpha = (0.05 + c.z * 0.1) * edge;
      ctx.beginPath();
      ctx.arc(x, y, c.r * (1.7 + c.z * 1.2), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

/**
 * 3. Pressure — a wave field expanding from a source.
 *
 * The ring march itself was well built and is untouched: `(t * 0.06) % (1/16)`
 * makes the ring set invariant under its own spacing, so the reset is genuinely
 * invisible. Everything hung around it was not. Sixteen perfect circles at
 * identical spacing, and *every* other quantity — ring alpha, disc alpha, disc
 * radius — driven by the single global `beat`, so the whole field inhaled and
 * exhaled as one object on a five-second clock. Thirty seconds was that loop
 * six times over, and the effect held no state at all.
 *
 * Phasing the pulse by ring *index* turns a synchronised blink into a wave
 * travelling outward through a standing structure, which is what the name
 * promises and what a pressure wave actually looks like. By index rather than
 * by radius, deliberately: `i` is fixed per ring, so there is no flicker when
 * the march wraps.
 */
const pressure: Effect = ({ ctx, w, h, p, t, beat, mx, my }) => {
  // The slow sine pair is the touch-device wander `scan` documents: on a
  // phone mx/my never move, and a pressure source that never drifts is a
  // bullseye printed on the page. Incommensurate periods, ~1% amplitude.
  const cx = w * 0.5 + (mx - 0.5) * w * 0.05 + Math.sin(t * 0.083) * w * 0.012;
  // Up out of the body copy. At 0.55h the bright focal disc — the loudest
  // single object in the effect — sat directly behind the text, at up to 0.32
  // alpha with a hard edge, on palettes already documented as failing AA.
  const cy = h * 0.34 + (my - 0.5) * h * 0.05 + Math.cos(t * 0.059) * h * 0.012;
  // One slow term with no common factor with either existing cycle, so the
  // composite never resolves inside a visit.
  const swell = 0.8 + 0.2 * Math.sin(t * 0.137);

  for (let i = 0; i < 16; i++) {
    const k = (i / 16 + ((t * 0.06) % (1 / 16))) % 1;
    // A power curve, as `tunnel` uses twelve lines away: evenly spaced
    // concentric circles are the "evenly-spaced anything" tell in its purest
    // form. Applied after `k`, so the wrap invariance survives.
    const r = Math.pow(k, 1.7) * Math.max(w, h) * 0.86;
    const bp = (Math.sin(t * 0.9 - i * 0.55) + 1) / 2;
    // Colour and weight key off `i`, never off `k` — off `k` they would flip
    // as a ring crossed a threshold, every 1.6 seconds.
    // `faint`, not `line`, for the outer rings — same measured invisibility
    // as the tunnel wall (≤ 1.08:1 effective on the darker palettes).
    ctx.strokeStyle = i < 2 ? p.a1 : i < 5 ? p.a2 : i < 9 ? p.a3 : p.faint;
    ctx.globalAlpha = (1 - k) * 0.3 * (0.55 + bp * 0.8) * swell;
    // Every third ring heavy, the rest hairlines: a ring field reads as a
    // series of events rather than as a grid.
    ctx.lineWidth = (i % 3 === 0 ? 2.2 : 0.9) * (1 + (1 - k));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }

  // The source, as a falloff rather than a hard-edged disc.
  const rr = 44 + beat * 30;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.4);
  g.addColorStop(0, p.a1);
  g.addColorStop(1, `${p.bg}00`);
  ctx.globalAlpha = 0.09 + beat * 0.07;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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
  // Rounded, so every tier gives a whole-pixel cell — 16px at 1, then 20, 26,
  // 32, 42 and 57 down the six-tier table.
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
      /*
       * **Painted on the same stride the blit samples on, which is `cw`/`ch`
       * and not `size`.** The cell has to be a whole number of *device* pixels
       * for the source rect to be one, so `cw` is `ceil(size * dScale)` — and
       * `size * dScale` is very rarely an integer, because `dScale` carries
       * both the device ratio and the quality tier. Laying the glyphs out at
       * `g * size` while sampling at `g * cw` therefore drifts by the rounding
       * error, cumulatively, across seventy glyphs: at a 1500px window on a
       * retina display the buffer clamp gives `dScale` 1.733, so the cell is
       * 27.73 device pixels wide and sampled as 28, and the last glyph in the
       * strip is read two-thirds of a cell to the right of where it was drawn.
       * The high half of the alphabet came out as sliced neighbours. Dividing
       * back by `dScale` puts the pen where the source rect will look.
       */
      for (let r = 0; r < 4; r++) {
        o.fillStyle = rows4[r];
        for (let g = 0; g < RAIN_GLYPHS.length; g++) {
          o.fillText(RAIN_GLYPHS[g], (g * cw) / dScale, (r * ch) / dScale);
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
      // `* boost`: mutation was a fixed per-frame probability, so a 120Hz
      // display flickered glyphs twice as fast as a 60Hz one, and the
      // screensaver doubled fall speed without touching flicker. `boost`
      // folds in the delta correction, which ties both back together.
      if (Math.random() < RAIN_MUTATE * (1 + 3 * fade) * boost) stream.glyphs[row] = randomGlyph();
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
      if (Math.random() < RAIN_MUTATE * 4 * boost) stream.glyphs[head] = randomGlyph();
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

    // One star in ~200 is a bright wanderer — `fg`, triple trail — so the
    // field has an occasional event instead of pure uniformity. Derived from
    // the seeded `r`, which `stars` never otherwise reads: it costs no new
    // state, and because respawn re-rolls `z` but not `r`, the *same* star
    // stays the bright one for the life of the field.
    const hot = s.r > 2.888;
    // Three bands rather than a binary split at z > 0.8, so the far plane gets
    // `faint` — the role that exists for it — and the palette shows three
    // colours instead of two.
    ctx.strokeStyle = hot ? p.fg : s.z > 0.86 ? p.a1 : s.z > 0.5 ? p.a2 : p.faint;
    ctx.globalAlpha = hot ? 0.5 + s.z * 0.4 : 0.16 + s.z * 0.56;
    // Off the sub-pixel floor: `z * 1.5` bottomed out at 0.3px, which
    // antialiases to grey regardless of the colour set above it.
    ctx.lineWidth = hot ? 1.3 + s.z * 1.2 : 0.55 + s.z * 1.35;
    // The trail has a floor too, for the same reason the speed does — it was
    // `dx * 0.05`, so the centre of the field drew dots, not streaks.
    const tl = (3 + sp * 4.2) * (hot ? 3 : 1);
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
    // Viewport-relative reach — a fixed 420px lit the whole field on a phone.
    const near = 1 - Math.min(1, Math.hypot(s.x - mx * w, s.y - my * h) / (Math.min(w, h) * 0.5));
    ctx.fillStyle = s.z > 0.85 ? p.fg : s.z > 0.5 ? p.a1 : p.a2;
    ctx.globalAlpha = 0.2 + s.z * 0.44 + near * 0.26;
    const nr = 0.9 + s.z * 1.8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, nr, 0, TAU);
    ctx.fill();
    // The pointer highlight eases in over near ∈ [0.55, 0.85] instead of the
    // old hard snap to `a3` at 0.7, which popped under a moving cursor at
    // exactly the spot the eye was following. Drawn over the base dot so the
    // depth colour never flips — only the highlight breathes.
    const hot = Math.min(1, Math.max(0, (near - 0.55) / 0.3));
    if (hot > 0) {
      ctx.fillStyle = p.a3;
      ctx.globalAlpha = (0.2 + s.z * 0.44 + near * 0.26) * hot;
      ctx.beginPath();
      ctx.arc(s.x, s.y, nr, 0, TAU);
      ctx.fill();
    }
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

/**
 * Aurora's five curtains, each with its own everything.
 *
 * The five used to share amplitude, width, alpha, spacing and their entire
 * second wave term — `sin(x * 0.0012 + t * 0.6)` had no per-ribbon component at
 * all, so the large slow undulation was a rigid motion of the whole stack and
 * the ribbons were five phase-shifted copies of one curve. Stacked 26px apart
 * at 46px wide they overlapped into a single fuzzy slab lying across the middle
 * of the frame, which is where the headline sits. It was a sky phenomenon drawn
 * as a horizon phenomenon.
 *
 * The five speeds are coprime over 100, so the ensemble's common period is
 * about 950 seconds. The old pairs were commensurate — ribbon 0's two terms sat
 * at exactly 5:3 and repeated every 48s, well inside the time someone spends
 * looking at it.
 */
/**
 * Wavelengths as cycles-per-viewport (`c1`/`c2`), not radians-per-pixel — the
 * `LANE_CYC` lesson from `flow`, applied here 2026-08-18. The old per-pixel
 * constants were tuned on a desk viewport; at 390px every ribbon carried
 * under half a wave and the aurora collapsed to five near-straight parallel
 * bands on exactly the band where the canvas is most of what a visitor sees.
 * Values are the desk look (1526px) restated, so the desk render is unchanged.
 */
const AURORA_RIBBONS = [
  { y: 0.22, amp: 0.15, wide: 118, a: 0.075, c1: 0.46, c2: 0.15, sp: 0.29, c: 0 },
  { y: 0.28, amp: 0.1, wide: 74, a: 0.11, c1: 0.75, c2: 0.21, sp: 0.37, c: 2 },
  { y: 0.33, amp: 0.19, wide: 44, a: 0.17, c1: 1.14, c2: 0.29, sp: 0.53, c: 1 },
  { y: 0.26, amp: 0.07, wide: 26, a: 0.24, c1: 1.68, c2: 0.41, sp: 0.71, c: 2 },
  { y: 0.4, amp: 0.24, wide: 156, a: 0.055, c1: 0.32, c2: 0.11, sp: 0.97, c: 0 },
];

/** 7. Aurora — five curtains of light hung in the upper frame. */
const aurora: Effect = ({ ctx, w, h, p, t, mx }) => {
  const roles = [p.a1, p.a2, p.a3];
  ctx.save();
  // Crossings bloom instead of muddying toward whichever ribbon drew last,
  // which is what light actually does. Every palette on the site has a
  // background at or below #1C1826, so additive blending is safe on all of them.
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < AURORA_RIBBONS.length; i++) {
    const r = AURORA_RIBBONS[i];
    const k1 = (r.c1 * REV) / w;
    const k2 = (r.c2 * REV) / w;
    // Near and far curtains shear against each other under the pointer.
    const lean = (mx - 0.5) * (i - 2) * 34;
    ctx.beginPath();
    // 26px steps, not 14: the wavelengths here are thousands of pixels wide, so
    // the old step was oversampling a nearly straight line. That pays for the
    // three-pass feather below outright.
    for (let x = 0; x <= w; x += 26) {
      const y =
        h * r.y +
        Math.sin(x * k1 + t * r.sp + i) * (h * r.amp) +
        Math.sin(x * k2 - t * r.sp * 0.61 + i * 2.1) * (h * r.amp * 0.55);
      if (x === 0) ctx.moveTo(x, y + lean);
      else ctx.lineTo(x, y + lean);
    }

    // One path, three strokes: a wide dim haze, a mid body, a bright core. A
    // single flat-width stroke of one solid colour is why this read as a
    // painted noodle rather than as light.
    ctx.strokeStyle = roles[r.c];
    for (const [mult, aMult] of [
      [2.4, 0.28],
      [1.35, 0.55],
      [0.5, 1],
    ]) {
      ctx.lineWidth = r.wide * mult;
      ctx.globalAlpha = r.a * aMult;
      ctx.stroke();
    }

    /*
     * Vertical striation — the signature.
     *
     * A curtain is made of field lines seen end-on, and without them a green
     * smear is just a gradient. One path of short rays hung off the centreline,
     * one stroke. The `g < 0.15` cull is the important part: it makes the rays
     * cluster and thin out as the field travels, where an unconditional ray
     * every 34px would be a comb — the evenly-spaced tell in its purest form.
     */
    ctx.globalAlpha = r.a * 0.3;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 34) {
      const g = Math.sin(x * 0.021 + t * 1.7 + r.sp * 9);
      // A high threshold, not a low one: only the top ~25% of the field draws a
      // ray, so they arrive in loose clusters. At 0.15 nearly every station
      // qualified and the result was a picket fence — and under `lighter` a
      // hairline at this alpha over an already-lit ribbon clips straight to
      // white, which is why the first attempt read as scratches rather than as
      // structure inside the light.
      if (g < 0.55) continue;
      const y =
        h * r.y +
        lean +
        Math.sin(x * k1 + t * r.sp + i) * (h * r.amp) +
        Math.sin(x * k2 - t * r.sp * 0.61 + i * 2.1) * (h * r.amp * 0.55);
      // Kept inside the curtain's own span, so a ray never hangs below it.
      ctx.moveTo(x, y - r.wide * 0.34);
      ctx.lineTo(x, y + r.wide * (0.1 + g * 0.34));
    }
    ctx.stroke();
  }
  ctx.restore();
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

/**
 * 9. Grid tunnel — nested rectangles receding to a vanishing point.
 *
 * Three things were wrong and all of them met at the centre of the screen.
 *
 * The alpha law was `0.38 * (1 - k)`, brightest at `k = 0` — but `s = k^2.4`
 * crowds the rings *toward* the vanishing point, so the most ink went where the
 * rings were smallest. The first four were sub-pixel rectangles stacked on one
 * point and the ring that nearly filled the screen drew at 1.4% alpha. Eight
 * spokes converged on that same pixel. The result was a bright knot roughly
 * 150px across sitting directly under the h1, and no visible tunnel wall
 * anywhere else: depth asserted by a power curve and delivered by nothing.
 *
 * And it was a treadmill. `(t * 0.14) % (1/26)` is a correct seamless wrap —
 * the ring set at the wrap is identical to the set at zero — but every ring is
 * drawn identically, so the exact same 0.42 seconds played 72 times in half a
 * minute. Every seventh ring is now a marker that travels outward and passes
 * you, which makes the real period 2.9s and gives the eye something to follow.
 */
const tunnel: Effect = ({ ctx, w, h, p, t, mx, my }) => {
  // The vanishing point drifts with the shared pointer light, as `scan`'s
  // instrument does. This is the effect that gains most from it: its entire
  // geometry hangs off one point, so moving that point moves everything.
  // Plus the touch-device wander `scan` and `pressure` carry: with no pointer
  // the vanishing point was nailed to dead centre, and this is the effect
  // whose whole geometry hangs off that one point.
  const cx = w * 0.5 + (mx - 0.5) * w * 0.06 + Math.sin(t * 0.071) * w * 0.013;
  const cy = h * 0.5 + (my - 0.5) * h * 0.06 + Math.cos(t * 0.047) * h * 0.013;

  // Rings recycle by index shift, so a stable per-ring identity has to *count
  // down* with the emission count. With the sign the other way the marker
  // colour flickers on every wrap, which is worse than no marker at all.
  const emitted = Math.floor(t * 0.14 * 26);
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const k = (i / 26 + ((t * 0.14) % (1 / 26))) % 1;
    const s = Math.pow(k, 2.4);
    if (w * s < 14) continue; // degenerate rings on the vanishing point
    const mark = ((((i - emitted) % 7) + 7) % 7) === 0;
    // `faint` for the wall: at alpha ≤ 0.3, `line` measured ≤ 1.08:1 on the
    // darker half of the palettes — the tunnel was only its marker rings.
    ctx.strokeStyle = mark ? p.a1 : p.faint;
    ctx.lineWidth = mark ? 2 : 1;
    // Fades in from the vanishing point and out at the mouth, peaking around
    // k≈0.45 where the rings are wide enough to describe a wall.
    ctx.globalAlpha = (mark ? 0.55 : 0.3) * Math.min(1, k * 5) * (1 - k * k);
    ctx.strokeRect(cx - (w * s) / 2, cy - (h * s) / 2, w * s, h * s);
  }

  // Spokes start clear of the centre, so the aperture stays dark instead of
  // becoming an eight-line star, and alternate major/minor rather than being
  // eight identical lines. `faint` because they are furniture, not signal.
  ctx.strokeStyle = p.faint;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * TAU + t * 0.06;
    ctx.globalAlpha = a & 1 ? 0.09 : 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * w * 0.07, cy + Math.sin(ang) * h * 0.07);
    ctx.lineTo(cx + Math.cos(ang) * w, cy + Math.sin(ang) * h);
    ctx.stroke();
  }

  // Atmospheric perspective, in one fill: the mouth of the tunnel is hazier
  // than its throat. This is what actually sells depth — scale and alpha only
  // imply it — and it costs one call against a budget of about thirty.
  const g = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(w, h) * 0.12,
    cx,
    cy,
    Math.max(w, h) * 0.62,
  );
  g.addColorStop(0, `${p.a2}00`);
  g.addColorStop(1, `${p.a2}1F`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
};

/**
 * 10. Bokeh — out-of-focus lights rising through the frame.
 *
 * **Size is derived from depth, not rolled separately.** `seed()` sets `r` and
 * the old `.map()` then overwrote it with an independent random, so a 110px
 * disc was exactly as likely to be the slowest, dimmest, furthest one as the
 * nearest. Depth of field's whole logic — nearer light, larger circle of
 * confusion, flatter profile, more parallax, lower peak brightness — was severed
 * at the first joint, and the effect's name was a promise it did not keep.
 *
 * **And the profile is an aperture, not a glow.** Every disc used the identical
 * ramp from 27% alpha at the centre to nothing at the rim, regardless of size —
 * which is a gaussian blob, the most templated thing available. Real bokeh is a
 * nearly *flat* disc with a bright rim, because what you are looking at is the
 * shape of the aperture. The plateau widens with depth, so far lights stay
 * soft points and near ones become flat coins.
 */
const bokeh: Effect = ({ ctx, w, h, p, t, boost, mx, my }, cache) => {
  const n = Math.round(Math.min(60, Math.max(20, (w * h) / 28000)));
  const parts = field(cache, w, h, n, (s) => ({
    ...s,
    r: 16 + s.z * 82,
    // Phase from its own random rather than from `r`: keyed to the radius, the
    // sway phase changed whenever the size rule was touched.
    vx: Math.random() * TAU,
  }));
  // Far discs first, so near ones occlude them rather than the seed order
  // deciding. Sorted once per build, not per frame — `z` never changes. The
  // guard compares against `partsBox` by identity: `field()` makes a fresh box
  // object on every rebuild, so a resize re-sorts and a steady state does not.
  if (cache.bokehSorted !== cache.partsBox) {
    parts.sort((a, b) => a.z - b.z);
    cache.bokehSorted = cache.partsBox;
  }

  for (const s of parts) {
    s.y -= (0.09 + s.z * 0.52) * boost;
    // `boost` was missing here while the rise had it, so on a 120Hz display the
    // sway ran at double speed relative to the climb and the two decoupled.
    s.x += Math.sin(t * 0.7 + s.vx) * 0.31 * boost;
    if (s.y < -s.r) {
      s.y = h + s.r;
      s.x = Math.random() * w;
    }

    // Parallax: near discs slide under the pointer, far ones barely move.
    // Applied at draw time so it never accumulates into the stored position.
    const px = s.x + (mx - 0.5) * s.z * 34;
    const py = s.y + (my - 0.5) * s.z * 22;

    const col = s.z > 0.85 ? p.a1 : s.z > 0.55 ? p.a2 : p.a3;
    // Peak alpha falls as the disc grows — the same light spread over more area.
    const peak = Math.round(Math.min(255, 2900 / s.r));
    const hex = peak.toString(16).padStart(2, "0");
    const rim = Math.min(255, Math.round(peak * 1.8))
      .toString(16)
      .padStart(2, "0");
    const flat = 0.3 + s.z * 0.52;

    // The nearest discs get a chromatic rim — the bright stop in `a2` while
    // the body stays `a1`. Real fast glass fringes its out-of-focus
    // highlights at the edge; one token swap on one stop is the whole cost.
    const rimCol = s.z > 0.85 ? p.a2 : col;
    const g = ctx.createRadialGradient(px, py, 0, px, py, s.r);
    g.addColorStop(0, `${col}${hex}`);
    g.addColorStop(flat, `${col}${hex}`);
    g.addColorStop(flat * 0.985 + 0.015, `${rimCol}${rim}`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    // Weighted outward, as every depth-of-field photograph is: the subject is
    // in the middle, and here the subject is the body copy.
    const d = Math.hypot((px - w / 2) / w, (py - h / 2) / h) * 2;
    ctx.globalAlpha = 0.5 + Math.min(1, d) * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/** How far the orbital plane is squashed vertically — a system seen near edge-on. */
const ORBIT_TILT = 0.34;
/** And rolled, so it is not axis-aligned either. */
const ORBIT_ROLL = 0.14;

/**
 * 11. Orbits — a system of bodies on a shared plane.
 *
 * Three separate uniformity failures met here, and together they made a
 * dartboard rather than a system.
 *
 * Radii were `i * min(w,h) * 0.062` — a perfect arithmetic progression, seven
 * rings at identical spacing in identical `line` at identical alpha and width.
 * Periods were `t * (1.4 / i)`, so every body's period was an exact whole
 * multiple of the innermost: the most resonant ratio set available, producing
 * rhythmic mass conjunctions and returning the entire system to its starting
 * configuration every 47.6 seconds. And bodies grew *larger and brighter with
 * radius*, so the loudest object was the slowest one, contradicting the depth
 * the falling speeds were asserting.
 *
 * Now: one tilted, rolled plane; radii on a power curve; `i^1.47` periods,
 * detuned off the physical 1.5 exactly so no two bodies are ever commensurate;
 * bodies that shrink with distance; and a primary at the focus for them to
 * orbit. Bodies on the far half of the plane are dimmed and drawn *before* the
 * rings, so the system occludes itself — the one depth cue that cannot be faked.
 */
const orbits: Effect = ({ ctx, w, h, p, t, beat, mx, my }) => {
  const cx = w * 0.5 + (mx - 0.5) * w * 0.03;
  // Up out of the vignette's fade: at h/2 the outer rings were being erased
  // while the clear band at the top of the frame held nothing at all.
  const cy = h * 0.42 + (my - 0.5) * h * 0.03;
  const rc = Math.cos(ORBIT_ROLL);
  const rs = Math.sin(ORBIT_ROLL);

  const place = (i: number) => {
    const r = Math.min(w, h) * 0.062 * Math.pow(i, 1.22);
    const ang = t * (1.4 / Math.pow(i, 1.47)) + i;
    const ox = Math.cos(ang) * r;
    const oy = Math.sin(ang) * r * ORBIT_TILT;
    return {
      r,
      ang,
      x: cx + ox * rc - oy * rs,
      y: cy + ox * rs + oy * rc,
      // `far` decides draw *order* (binary by necessity); `depth` carries the
      // continuous value so alpha can ease through the crossing.
      far: Math.sin(ang) < 0,
      depth: Math.sin(ang),
    };
  };

  const body = (i: number) => {
    const q = place(i);
    // Eased through the plane crossing: the old far/near booleans flipped
    // alpha 0.38↔0.95 in a single frame, at the ellipse extremes — exactly
    // where a body is largest on screen. `front` runs 0→1 over
    // sin(ang) ∈ [−0.15, 0.15], so at the crossing itself both draw passes
    // agree and the order swap is invisible.
    const front = Math.min(1, Math.max(0, (q.depth + 0.15) / 0.3));
    ctx.fillStyle = [p.a1, p.a2, p.a3][i % 3];
    ctx.globalAlpha = 0.38 + 0.57 * front;
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(1.6, 4.4 - i * 0.34), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.08 + 0.18 * front;
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(3, 13 - i * 0.9), 0, TAU);
    ctx.fill();
  };

  // Far bodies, then the rings over them, then near bodies over the rings.
  for (let i = 1; i <= 7; i++) if (place(i).far) body(i);

  for (let i = 1; i <= 7; i++) {
    const q = place(i);
    // The field fades outward instead of stopping at a hard seventh ring.
    // `faint` on the *inner* rings, `line` on the outer — measured on all 25
    // palettes `faint` is the brighter of the two on canvas, so the original
    // assignment (outer = faint "so they recede") made the outer rings pop
    // forward and inverted the hierarchy it was stating.
    ctx.strokeStyle = i > 4 ? p.line : p.faint;
    ctx.globalAlpha = 0.62 - i * 0.06;
    ctx.lineWidth = i < 3 ? 1.2 : 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, q.r, q.r * ORBIT_TILT, ORBIT_ROLL, 0, TAU);
    ctx.stroke();

    // A short trail behind each body, on its own ring. Motion becomes legible
    // without adding a single particle.
    ctx.strokeStyle = [p.a1, p.a2, p.a3][i % 3];
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(cx, cy, q.r, q.r * ORBIT_TILT, ORBIT_ROLL, q.ang - 0.55, q.ang);
    ctx.stroke();
  }

  // The focus. Seven orbits need something to orbit, and this is where `beat`
  // belongs — the one object in the system entitled to a pulse.
  ctx.fillStyle = p.fg;
  ctx.globalAlpha = 0.1 + beat * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, 26 + beat * 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.a1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, TAU);
  ctx.fill();

  for (let i = 1; i <= 7; i++) if (!place(i).far) body(i);
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
  // sphere that chases the cursor reads as a toy. The two slow sines are for
  // touch devices, where mx/my never move and the mount would otherwise be
  // bolted dead centre for the whole visit — incommensurate periods (~94s and
  // ~146s), amplitude ~1% of the viewport, invisible under a live pointer.
  const cx = w / 2 + (mx - 0.5) * w * 0.05 + Math.sin(t * 0.067) * w * 0.011;
  const cy = h / 2 + (my - 0.5) * h * 0.05 + Math.cos(t * 0.043) * h * 0.011;
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
  /*
   * Rasterised at the device scale, not at CSS pixels.
   *
   * `FxCanvas` hands every effect a context already scaled by up to 2, so an
   * offscreen canvas sized in CSS pixels gets magnified on the way in and the
   * whole instrument is soft on a retina display — against vector work beside
   * it that is not. `rain`'s atlas sets the same trap and dodges it the same
   * way. The scale joins the cache key because the quality tier moves it, and a
   * sphere cached at the old scale would never be re-rendered.
   */
  const dScale = Math.abs(ctx.getTransform().a) || 1;
  const key = `${p.faint}|${dScale}`;
  const pad = Math.ceil(r * 1.16) + 2;
  const box = pad * 2;
  let sphere = cache.scanSphere;
  if (!sphere || sphere.w !== w || sphere.h !== h || sphere.key !== key) {
    const off = document.createElement("canvas");
    off.width = Math.ceil(box * dScale);
    off.height = Math.ceil(box * dScale);
    const o = off.getContext("2d");
    if (o) {
      o.setTransform(dScale, 0, 0, dScale, 0, 0);
      o.lineWidth = 1;
      // `faint`, not `line`: the wireframe is the subject of this effect, and
      // `--line` measures 1.20–1.27:1 effective on seven palettes — the sphere
      // reduced to a rotating wedge plus dots, the same failure the sonar's
      // rings had in CSS. The rim ticks below already use `faint`; now the
      // sphere they decorate is no longer dimmer than its own furniture.
      o.strokeStyle = p.faint;
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
  // Explicit destination size: the buffer is in device pixels now, so the
  // intrinsic-size overload would draw it at `dScale` times its proper width.
  // A slow precession on the cached blit — ~14°/min. The wireframe is static
  // by construction (that is the whole performance win), but a perfectly
  // frozen sphere reads as printed; rotating the blit costs one transform and
  // makes the instrument read as tracking. The rim ticks ride along, which
  // reads as the mount turning with its scope.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.004);
  ctx.drawImage(sphere.canvas, -pad, -pad, box, box);
  ctx.restore();

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
    // `REV`, not `TAU`: this is a modulus, and 6.3 as a full circle slips
    // 0.0168 rad per revolution — measured, the flares were 74° off the beam
    // by minute ten and on the opposite side of the dial by minute thirty.
    const since = ((ang - bang) % REV + REV) % REV;
    const life = Math.max(0, 1 - (since / REV) * 6.4 / 2);
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
/** Per-lane constants. Hand-set — an `i % 3` pattern is visible as a pattern. */
const TEL_Y = [0.13, 0.2, 0.29, 0.78, 0.89];
const TEL_AMP = [0.31, 0.09, 0.22, 0.12, 0.27];
const TEL_WID = [1.8, 1, 1.6, 1, 1.7];
/** One traversal of the playhead, in `t` units. */
const TEL_PERIOD = 1 / 0.13;

const telemetry: Effect = ({ ctx, w, h, p, t, beat }) => {
  const lanes = 5;
  const head = ((t * 0.13) % 1) * w;
  // `faint`, never `line`, for a drawn channel: `--line` is the hairline
  // border token and measures ~1.13:1 effective at this alpha — the same
  // "one token documented as invisible" bug the sonar CSS had (2026-08-17),
  // which left lane 2 effectively absent on every palette.
  const cols = [p.a1, p.faint, p.a2, p.muted, p.a3];

  /*
   * Instrument furniture: ticks along the bottom of the top bank, one path.
   * This is what tells the eye these are channels rather than five decorative
   * squiggles. No numerals — at this alpha behind body copy they would be
   * unreadable, and unreadable numbers are decoration pretending to be data.
   */
  ctx.strokeStyle = p.faint;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k <= 24; k++) {
    const x = (k / 24) * w;
    const tall = k % 4 === 0 ? 10 : 5;
    ctx.moveTo(x, h * 0.335);
    ctx.lineTo(x, h * 0.335 + tall);
  }
  ctx.stroke();

  for (let i = 0; i < lanes; i++) {
    const y0 = h * TEL_Y[i];
    // Two quiet channels among three loud ones. Five equally loud channels is
    // the uniformity tell; hierarchy is what makes the loud ones read as the
    // ones worth watching. The quiet pair also carries `beat`, so the panel has
    // one obvious vital sign and several things that are plainly not.
    const quiet = i === 1 || i === 3;
    const amp = h * 0.055 * TEL_AMP[i] * 3.1 * (quiet ? 0.7 + beat * 0.5 : 1);
    // Cycles-per-viewport, like aurora's ribbons (2026-08-18): the old
    // per-pixel constants gave a phone 0.25–0.65 cycles per lane — five
    // near-flat lines. These restate the desk (1526px) look exactly.
    const f1 = ((0.97 + i * 0.39) * REV) / w;
    const f2 = ((2.67 + i * 0.22) * REV) / w;
    const speed = 0.8 + i * 0.36;

    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(w, y0);
    ctx.stroke();

    /*
     * **The playhead writes the trace.** This is the whole difference between
     * instrumentation and decoration, and it was the one thing missing.
     *
     * The trace was `sin(px * f1 + t * speed)` — a wave scrolling continuously
     * on its own, past a bright line sliding across it at an unrelated rate:
     * two motions contradicting each other. On a real scope the trace is
     * stationary in x and the head is the only thing moving, leaving fresh data
     * behind it and the *previous* sweep still standing ahead of it, with a hard
     * discontinuity at the head. That discontinuity is the entire visual
     * signature of an oscilloscope.
     *
     * So each sample is evaluated at the time the head last passed that x,
     * rather than at now. The trace then holds still, changes shape between
     * sweeps because the underlying signal has moved on, and breaks at the head.
     * It also inherits the head's period, which disposes of the per-lane
     * waveform repeats — lane 5's two terms were locked at 1 : 0.6 and recurred
     * exactly every 21 seconds.
     */
    /*
     * Phosphor decay, as a gradient along the lane rather than as per-run alpha.
     *
     * The old version quantised brightness into 180 steps by drawing the lane in
     * short strokes; one gradient is continuous and takes the whole lane in a
     * single path — about 900 strokes a frame across five lanes down to five.
     * The two stops either side of the head are the discontinuity: the writing
     * edge at full brightness, and immediately ahead of it the previous sweep,
     * still standing and nearly faded.
     */
    const hx = head / w;
    const at = (u: number) => Math.min(1, Math.max(0, u));
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, `${cols[i]}1A`);
    grad.addColorStop(at(hx - 0.5), `${cols[i]}1A`);
    grad.addColorStop(at(hx - 0.002), `${cols[i]}FF`);
    grad.addColorStop(at(hx), `${cols[i]}22`);
    grad.addColorStop(1, `${cols[i]}1A`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = TEL_WID[i];
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      // Standard positive modulo: how far back round the lane the head is from
      // this sample, 0 at the head and approaching 1 just ahead of it.
      const behind = ((((head - x) % w) + w) % w) / w;
      const tt = t - behind * TEL_PERIOD;
      const py =
        y0 +
        Math.sin(x * f1 + tt * speed) * amp +
        Math.sin(x * f2 - tt * speed * 0.6) * amp * 0.45;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
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

function duelling(left: FighterStyle, right: FighterStyle): Effect {
  return ({ ctx, w, h, p, t, dt }, cache) => {
    let st = cache.duel;
    if (!st) st = cache.duel = createDuel(left, right);

    /*
     * The fight runs on real time, not on the boosted effect clock (client,
     * 2026-08-14: "they speed up at like x50 speed", "it lags hard randomly,
     * especially when on screensaver").
     *
     * It used to derive its frame count from `t`, which has `boost` folded in —
     * and `boost` carries both scroll velocity and the screensaver's +0.9. So
     * the duel ran at roughly double speed for the entire time the screensaver
     * was up, which is exactly when the client was watching it, and a hard
     * scroll could push it to the 4× clamp.
     *
     * That also produced the "random lag", which was never dropped frames.
     * `advanceDuel` steps in whole frames from a fractional accumulator, so at
     * a rate of ~1.9 the number of steps per rendered frame alternates 2,2,1,
     * 2,2,1 — motion that stutters on a fixed cadence. At a rate of ~1.0 it
     * steps once per frame and the judder has nowhere to come from.
     *
     * Every other effect is an ambient field and should surge when the page
     * does. A duel is a performance: it keeps its own tempo.
     */
    st.prev = t;
    advanceDuel(st, dt);

    /*
     * **Attract mode no longer changes how the fight is drawn** (client,
     * 2026-08-14: "make sure the screensaver battles are the same graphics as
     * the nonscreensaver ones pls").
     *
     * It used to grow the figures about 1.4× linear, drop the feet line, raise
     * body alpha from 0.55 to 1 and fade health bars in — all eased over 1.6s to
     * land with the chrome's fade. The reasoning was sound (the screensaver
     * vacates the copy the fight was being polite about) and the client does not
     * want it: the same scene, in both states.
     *
     * Kept at the *background* presentation rather than the screensaver one,
     * because that direction is the one with a hard constraint on it. Behind
     * body copy the figures have to stay quiet enough to read through, and
     * several palettes already fail AA on body text. Making both ends bright
     * would have traded a real legibility problem for a cosmetic gain.
     *
     * `sleeping` and the `approach` easing helper went with it. The frame
     * contract still carries `sleeping`; this was its only reader, and a future
     * attract idea starts by reading this note.
     */
    const scale = Math.min((w * 0.62) / DUEL_WORLD_W, (h * 0.55) / DUEL_WORLD_H);
    drawDuel(ctx, st, {
      x: (w - DUEL_WORLD_W * scale) / 2,
      y: h * 0.8 - DUEL_FEET_Y * scale,
      scale,
      ink: p.fg,
      // The blades keep their alignment colours in every palette — the one
      // literal-colour carve-out on the site (see BLADE_COLORS in fx/duel.ts).
      bladeA: BLADE_COLORS[left],
      bladeB: BLADE_COLORS[right],
      core: p.fg,
      spark: p.a2,
      line: p.line,
      /*
       * Health bars stay off *here*, and on in the ornament (client, 2026-08-14:
       * "i love the idea of the health bar. genius. pls keep that", then "is
       * health bars a bad idea? ill leave it up to you actually… it is just a
       * random animation, not a focal point of the site").
       *
       * The split is by *slot*, not by taste. In `DuelOrnament` the fight is the
       * subject, contained in its own square, and a HUD frame around a subject
       * is exactly where a readout belongs. Here it is a full-bleed background
       * with body copy over it, and two bars pinned above two heads are a
       * readout the reader has to look past — the same objection that removed
       * the hero vitals strip. The client's own framing settles it: something
       * that is not a focal point should not be carrying instrumentation.
       *
       * So the feature is kept, in the one place it reads.
       */
      bars: false,
      dim: 0.55,
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
