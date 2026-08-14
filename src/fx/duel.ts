/**
 * The lightsword duel — the match engine and its renderer.
 *
 * Rebuilt to `docs/DUEL.md` after the client rejected the stick-figure version
 * twice ("that is terrible", "WAY too slow"). The reference implementation the
 * client supplied (`Endless Automated Saber Duel`) is the authoritative
 * statement of what "animated a LOT better" means, and its decisions are kept
 * verbatim wherever they survive the port:
 *
 * - **The fight is discrete matches with winners**, not a continuous exchange.
 *   Fighters have health, attacks land or miss, somebody dies, the winner holds
 *   the pose for two seconds, and both reset with re-rolled powers. This is the
 *   single most important idea in the reference — the first attempt had no
 *   events, so it had nothing to animate toward.
 * - **Bodies are filled blocks, not line art.** A blocky caped figure with a red
 *   blade reads as exactly what it reads as, without being a traced likeness —
 *   the naming-and-likeness constraint in `docs/DUEL.md` is settled at this
 *   resolution for free.
 * - **Timing is frame counts at 60Hz, not seconds.** The reference's
 *   `stateTimer` values (15 slash, 20 kick, 30 force), its physics constants
 *   (gravity 0.6, velocity decay 0.9, advance ±2.5, leap -10), its geometry
 *   (30×70 bodies, floor at y=200, far/close threshold 120) and its damage
 *   table (slash 8–13, force 12–19, kick 6, health 100) are all kept in the
 *   reference's own units. The simulation runs on a fixed 60Hz timestep behind
 *   an accumulator, so callers hand it elapsed *frames* and the fight behaves
 *   identically at any refresh rate.
 *
 * The four porting rules from `docs/DUEL.md` are all honoured here:
 * no literal colours (every colour arrives through `DuelView`), no fixed pixel
 * geometry on screen (the world is 700×350 reference units, mapped through one
 * scale), state lives on the caller's cache rather than module scope, and the
 * caller clamps the frame delta before it gets here.
 *
 * What survives from the first attempt is exactly what `docs/DUEL.md` lists as
 * reusable: the spark field and the three-pass blade rendering (wide faint glow
 * → mid → bright core), which the client liked. The stance machine is gone.
 *
 * **There is deliberately no winner text and no match-counter caption.** The
 * vitals strip was removed for captioning state instead of showing it, and the
 * same reasoning applies harder inside a 180px ornament slot: the fallen
 * fighter, the burst of sparks and the winner's raised blade *are* the
 * announcement. Health bars are opt-in (`DuelView.bars`) because they are right
 * in the ornament slot and wrong behind body copy — `docs/DUEL.md` flags that
 * split explicitly.
 */

export type FighterStyle = "hooded" | "caped" | "haloed" | "horned";

/**
 * The one deliberate literal-colour exception on the site (client request,
 * 2026-08-13): the good side fights in blue/green and the evil side in red,
 * in every palette. Everything else in the scene — bodies, sparks, ground,
 * blade cores — still reads the live palette and recolours with the bleed.
 */
export const BLADE_COLORS: Record<FighterStyle, string> = {
  hooded: "#3d9bff",
  haloed: "#37d67a",
  caped: "#ff3b30",
  horned: "#ff2929",
};

type Action = "neutral" | "attacking" | "kicking" | "force" | "dead";

/** The reference's world. Everything below is in these units. */
export const WORLD_W = 700;
export const WORLD_H = 350;
/** Top of a grounded body; the feet line is FLOOR_Y + BODY_H. */
const FLOOR_Y = 200;
const BODY_W = 30;
const BODY_H = 70;
/** The feet line, exported so callers can pin it to a screen height. */
export const FEET_Y = FLOOR_Y + BODY_H;
const GRAVITY = 0.6;
const DECAY = 0.9;
/** Centre-to-centre distance that separates "far" tactics from "close" ones. */
const FAR = 120;
const START_A = 150;
const START_B = 520;
const MAX_HEALTH = 100;
/** Frames the winner holds the field before the next match. Two seconds. */
const DEATH_HOLD = 120;

/**
 * The slash was 15 frames of pure strike. It is now 20, split three ways —
 * anticipation, strike, follow-through — because the missing beat was the
 * wind-up: at 15 the blade jumped 0.95rad in a single frame on the opening
 * frame, which reads as a pop rather than a swing. The kick pays the four
 * frames back so the exchange rate of the fight is unchanged.
 */
const SLASH_FRAMES = 20;
const KICK_FRAMES = 16;
const FORCE_FRAMES = 30;

/** Fractions of the slash: wind up, strike, then recover past the guard. */
const SLASH_WIND = 0.3;
const SLASH_HIT = 0.55;

/** Body proportions. The torso stops at the hips so the legs have somewhere to be. */
const TORSO_H = 42;
const SHOULDER_X = 11;
const SHOULDER_Y = 13;
const HIP_X = 7;
/*
 * Bone lengths are deliberately only a little longer than the reach they have
 * to cover: a chain much longer than its target distance has to put the slack
 * somewhere, and where it puts it is a joint sticking out sideways.
 */
const UPPER_ARM = 12;
const FOREARM = 12;
const THIGH = 16;
const SHIN = 16;
const BLADE_LEN = 58;
/** How far the sword hand orbits its shoulder. */
const HAND_REACH = 20;
/** Samples in the blade's motion smear, and where along the blade it starts. */
const TRAIL = 6;
const TRAIL_INNER = 0.5;

const TAU = Math.PI * 2;

interface Fighter {
  /** Left edge of the body block. */
  x: number;
  /** Top of the body block; FLOOR_Y when grounded. */
  y: number;
  vx: number;
  vy: number;
  health: number;
  action: Action;
  /** Frames remaining in the current action. */
  timer: number;
  /** Sustained movement intent while neutral: -1, 0 or 1, in world x. */
  drive: number;
  /** Rolled at decision time — the reference's 70% slash hit chance. */
  willHit: boolean;
  /** Whether the current action has already dealt its damage. */
  struck: boolean;
  /** Per-match damage multipliers, re-rolled every reset so rounds differ. */
  attackPower: number;
  forcePower: number;
  facing: 1 | -1;
  /** Hit feedback, 1 → 0. */
  flash: number;
  /** Desynchronises the idle bob and blade flicker between the pair. */
  phase: number;
  style: FighterStyle;
  /**
   * The blade's live angle and angular velocity, sprung toward the angle the
   * current action asks for. Every action used to set its angle directly, so
   * each of them began and ended on a snap; the spring is what removes all of
   * those at once, and it lives in the fixed-step simulation rather than the
   * renderer so the motion cannot depend on frame rate.
   */
  bladeA: number;
  bladeV: number;
  /** Walk-cycle phase, advanced by distance travelled so feet plant. */
  stride: number;
  /** Landing squash, 1 → 0. Set on the frame a fall is arrested. */
  land: number;
  /** Blade positions over the last few frames, world units, newest last. */
  trail: { hx: number; hy: number; tx: number; ty: number }[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface DuelState {
  a: Fighter;
  b: Fighter;
  sparks: Spark[];
  matches: number;
  /** Frames left in the end-of-match hold; 0 while the fight is live. */
  over: number;
  /** Fractional-frame accumulator behind the fixed 60Hz timestep. */
  acc: number;
  /** Previous effect-clock reading, kept for the background effect's delta. */
  prev: number;
  /** World clock in frames — drives the idle bob and blade flicker. */
  idle: number;
}

function makeFighter(x: number, facing: 1 | -1, style: FighterStyle): Fighter {
  return {
    x,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    health: MAX_HEALTH,
    action: "neutral",
    timer: 10 + Math.random() * 20,
    drive: 0,
    willHit: false,
    struck: true,
    // The reference re-randomises these per match, so rounds differ: one round
    // a glass cannon wins fast, the next two evenly-matched fighters grind.
    attackPower: 0.8 + Math.random() * 0.5,
    forcePower: 0.8 + Math.random() * 0.5,
    facing,
    flash: 0,
    phase: Math.random() * TAU,
    style,
    bladeA: -0.55,
    bladeV: 0,
    stride: Math.random() * TAU,
    land: 0,
    trail: [],
  };
}

export function createDuel(left: FighterStyle, right: FighterStyle): DuelState {
  return {
    a: makeFighter(START_A, 1, left),
    b: makeFighter(START_B, -1, right),
    sparks: [],
    matches: 0,
    over: 0,
    acc: 0,
    prev: 0,
    idle: 0,
  };
}

function centre(f: Fighter): number {
  return f.x + BODY_W / 2;
}

/**
 * Two-bone chain, solved with the law of cosines: given a root, a target and
 * two segment lengths, where does the joint sit? `bend` is ±1 and picks which
 * way the elbow or knee breaks.
 *
 * This is the whole of the "rig". There is no skeleton class and no animation
 * system — a limb is this function called twice, which is why articulating the
 * figures cost geometry rather than architecture. An unreachable target is not
 * an error: the `clamp` on the cosine straightens the limb and points it at the
 * target, which is exactly what an arm does when it over-reaches.
 */
function joint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  l1: number,
  l2: number,
  bend: number,
): { x: number; y: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  const c = Math.max(-1, Math.min(1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1)));
  const ang = Math.atan2(dy, dx) + bend * Math.acos(c);
  return { x: x0 + Math.cos(ang) * l1, y: y0 + Math.sin(ang) * l1 };
}

/**
 * Where the sword hand and blade tip are, in body-local units (+x forward).
 *
 * The hand orbits its shoulder on a shorter, phase-shifted arc than the blade,
 * which is what stops arm and blade collapsing into one straight line — and it
 * means the blade *travels* through space during a swing instead of pivoting
 * around a point welded to the torso, which it did when the hand was a pair of
 * constants.
 */
function bladeLocal(f: Fighter, flick: number): {
  hx: number;
  hy: number;
  tx: number;
  ty: number;
} {
  const ha = f.bladeA * 0.55 - 0.2;
  const hx = SHOULDER_X + Math.cos(ha) * HAND_REACH;
  const hy = SHOULDER_Y + Math.sin(ha) * HAND_REACH;
  const reach = BLADE_LEN * flick;
  return {
    hx,
    hy,
    tx: hx + Math.cos(f.bladeA) * reach,
    ty: hy + Math.sin(f.bladeA) * reach,
  };
}

/** The same geometry in world units, for the trail and for spark origins. */
function bladeWorld(f: Fighter): { hx: number; hy: number; tx: number; ty: number } {
  const l = bladeLocal(f, 1);
  const cx = centre(f);
  return {
    hx: cx + f.facing * l.hx,
    hy: f.y + l.hy,
    tx: cx + f.facing * l.tx,
    ty: f.y + l.ty,
  };
}

/**
 * The reference's burst at the point of contact, with an optional bias along
 * the direction the blow was travelling. A uniform burst reads as a firework;
 * biasing it along the swing is what makes the sparks look *struck off*
 * something rather than emitted by it.
 */
function spawnSparks(
  st: DuelState,
  x: number,
  y: number,
  n: number,
  bx = 0,
  by = 0,
): void {
  for (let i = 0; i < n; i += 1) {
    const ang = Math.random() * TAU;
    const speed = 1.5 + Math.random() * 4;
    st.sparks.push({
      x,
      y,
      vx: Math.cos(ang) * speed + bx * (1 + Math.random() * 2),
      vy: Math.sin(ang) * speed - 2 + by * (1 + Math.random() * 2),
      life: 1,
    });
  }
}

function damage(st: DuelState, foe: Fighter, amount: number): void {
  if (foe.action === "dead") return;
  foe.health = Math.max(0, foe.health - amount);
  foe.flash = 1;
  if (foe.health <= 0 && st.over === 0) {
    foe.action = "dead";
    foe.drive = 0;
    st.over = DEATH_HOLD;
    spawnSparks(st, centre(foe), foe.y + BODY_H * 0.4, 15);
  }
}

/**
 * The reference's decision function, verbatim in shape: re-rolled whenever the
 * timer runs out, branching on distance. Far fighters advance, force-push or
 * leap; close fighters slash, kick or retreat.
 */
function decide(f: Fighter, foe: Fighter): void {
  const dist = Math.abs(centre(f) - centre(foe));
  const r = Math.random();
  f.drive = 0;
  f.struck = true;

  if (dist > FAR) {
    if (r < 0.5) {
      // Advance.
      f.action = "neutral";
      f.drive = f.facing;
      f.timer = 15 + Math.random() * 12;
    } else if (r < 0.75) {
      f.action = "force";
      f.timer = FORCE_FRAMES;
      f.struck = false;
    } else {
      // The tactical leap — closes distance through the air.
      f.action = "neutral";
      f.drive = f.facing;
      f.timer = 24;
      if (f.y >= FLOOR_Y) f.vy = -10;
    }
  } else {
    if (r < 0.5) {
      f.action = "attacking";
      f.timer = SLASH_FRAMES;
      f.struck = false;
      f.willHit = Math.random() < 0.7;
    } else if (r < 0.75) {
      f.action = "kicking";
      f.timer = KICK_FRAMES;
      f.struck = false;
    } else {
      // Retreat — the beat that stops the fight reading as a scrum.
      f.action = "neutral";
      f.drive = -f.facing;
      f.timer = 10 + Math.random() * 10;
    }
  }
}

function stepFighter(st: DuelState, f: Fighter, foe: Fighter): void {
  f.flash = Math.max(0, f.flash - 1 / 12);
  if (f.action === "dead") return;

  // Always square up — a fighter leapt over turns to face the other way.
  f.facing = centre(foe) >= centre(f) ? 1 : -1;

  if (foe.action === "dead") {
    // Victory: hold the field, blade raised, until the reset. No decisions.
    f.action = "neutral";
    f.drive = 0;
    return;
  }

  f.timer -= 1;

  const dist = Math.abs(centre(f) - centre(foe));
  const elapsed =
    f.action === "attacking"
      ? SLASH_FRAMES - f.timer
      : f.action === "kicking"
        ? KICK_FRAMES - f.timer
        : FORCE_FRAMES - f.timer;

  // Each attack lands at a specific frame of its animation, so the damage, the
  // sparks and the visible strike are the same instant — the first attempt's
  // clashes were incidental geometry, which is why nothing felt caused.
  if (f.action === "attacking" && !f.struck && elapsed >= SLASH_FRAMES * SLASH_HIT) {
    f.struck = true;
    if (f.willHit && dist <= FAR + 20) {
      // The sparks come off the blade's actual tip, clamped into the body it
      // struck, rather than the midpoint between the two fighters. The midpoint
      // had nothing to do with where the visible blade was, which is why a
      // clash never looked like contact. `dist` remains the sole authority on
      // whether damage happens — gate that on the tip reaching and misses
      // become routine, health stops draining and the match never ends.
      const tip = bladeWorld(f);
      const hit = {
        x: Math.max(foe.x - 6, Math.min(foe.x + BODY_W + 6, tip.tx)),
        y: Math.max(foe.y - 10, Math.min(foe.y + BODY_H, tip.ty)),
      };
      damage(st, foe, (8 + Math.random() * 5) * f.attackPower);
      foe.vx += f.facing * 2;
      spawnSparks(st, hit.x, hit.y, 15, f.facing * 1.2, 0.6);
    }
  } else if (f.action === "kicking" && !f.struck && elapsed >= KICK_FRAMES * 0.45) {
    f.struck = true;
    if (dist <= 100) {
      // The kick's job is the knockback more than the damage.
      damage(st, foe, 6);
      foe.vx += f.facing * 7;
      spawnSparks(st, centre(foe), foe.y + BODY_H * 0.55, 6, f.facing * 1.6, -0.3);
    }
  } else if (f.action === "force" && !f.struck && elapsed >= 15) {
    f.struck = true;
    if (dist <= 320) {
      damage(st, foe, (12 + Math.random() * 7) * f.forcePower);
      foe.vx += f.facing * 9;
      spawnSparks(st, centre(foe), foe.y + BODY_H * 0.35, 10, f.facing * 2.2, 0);
    }
    // The reference's self-pushback: the push costs the caster ground too.
    f.vx -= f.facing * 4;
  }

  if (f.timer <= 0) decide(f, foe);

  // Sustained movement while neutral. The reference sets vx to ±2.5 under a 0.9
  // decay, which only holds if the intent is re-applied each frame.
  if (f.action === "neutral" && f.drive !== 0) {
    f.vx += f.drive * 0.9;
    f.vx = Math.max(-2.5, Math.min(2.5, f.vx));
  }
}

/** One fixed 60Hz step. */
function step(st: DuelState): void {
  st.idle += 1;

  if (st.over > 0) {
    st.over -= 1;
    if (st.over === 0) {
      // Next match: same fighters, fresh health, re-rolled powers.
      const { a, b } = st;
      st.matches += 1;
      st.a = makeFighter(START_A, 1, a.style);
      st.b = makeFighter(START_B, -1, b.style);
    }
  }

  stepFighter(st, st.a, st.b);
  stepFighter(st, st.b, st.a);
  springBlade(st, st.a, st.b);
  springBlade(st, st.b, st.a);

  for (const f of [st.a, st.b]) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= DECAY;
    f.land = Math.max(0, f.land - 1 / 8);
    if (f.y < FLOOR_Y) {
      f.vy += GRAVITY;
    } else {
      // A fall arrested is worth a squash; a foot resting on the floor is not.
      if (f.vy > 2) f.land = 1;
      f.y = FLOOR_Y;
      f.vy = 0;
    }
    f.x = Math.max(20, Math.min(WORLD_W - 20 - BODY_W, f.x));
    // The walk cycle advances with distance covered, not with time, so the
    // feet plant instead of paddling while the body slides.
    f.stride += f.vx * 0.16;

    if (f.action === "dead") {
      f.trail.length = 0;
    } else {
      f.trail.push(bladeWorld(f));
      if (f.trail.length > TRAIL) f.trail.shift();
    }
  }

  // Two grounded fighters must not stand inside each other; a gentle mutual
  // push reads as bodies, a hard clamp reads as a wall.
  const gap = centre(st.b) - centre(st.a);
  if (Math.abs(gap) < BODY_W && st.a.y >= FLOOR_Y && st.b.y >= FLOOR_Y) {
    const push = gap >= 0 ? 0.8 : -0.8;
    st.a.x -= push;
    st.b.x += push;
  }

  const alive: Spark[] = [];
  for (const sp of st.sparks) {
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += 0.25;
    sp.life -= 1 / 24;
    if (sp.life > 0) alive.push(sp);
  }
  st.sparks = alive;
  if (st.sparks.length > 120) st.sparks.splice(0, st.sparks.length - 120);
}

/**
 * Advance the fight by `frames` 60Hz frames (fractions accumulate). Callers
 * clamp their own deltas; this caps steps per call so a stall can never
 * teleport a match.
 */
export function advanceDuel(st: DuelState, frames: number): void {
  st.acc = Math.min(4, st.acc + Math.max(0, frames));
  let steps = Math.floor(st.acc);
  st.acc -= steps;
  while (steps > 0) {
    step(st);
    steps -= 1;
  }
}

/** Everything the renderer needs to draw one frame somewhere. No literals. */
export interface DuelView {
  /** Top-left of the world's box on the target canvas. */
  x: number;
  y: number;
  /** World units → canvas pixels. */
  scale: number;
  /** Body ink — `fg`, same as every figure on the site. */
  ink: string;
  /** Left and right blade colours — the two accents, so the pair reads opposed. */
  bladeA: string;
  bladeB: string;
  /** Blade core — `fg`, the brightest thing the palette offers. */
  core: string;
  spark: string;
  line: string;
  /** Health bars: right in the ornament slot, wrong behind body copy. */
  bars: boolean;
  /** Multiplies body/ground alphas: 1 in the ornament, lower as a background. */
  dim: number;
}

/**
 * The angle the current action *asks* for. 0 is level, negative up.
 *
 * Note it is a target, not the blade's position — `springBlade` is what the
 * blade actually does. Previously this function was the position, which meant
 * every action began and ended on a discontinuity: entering `attacking` moved
 * the blade 0.95rad between two consecutive frames, and `force`, `kicking` and
 * the victory pose were bare constants that snapped in and out.
 */
function bladeTarget(f: Fighter, foe: Fighter, idle: number): number {
  const bob = Math.sin(idle * 0.05 + f.phase) * 0.06;
  if (foe.action === "dead") return -1.3 + bob;
  switch (f.action) {
    case "attacking": {
      const p = 1 - f.timer / SLASH_FRAMES;
      if (p < SLASH_WIND) {
        // Anticipation: travel *away* from the strike and hold, so the blow has
        // somewhere to come from. Eased out, so it arrives and waits.
        const q = p / SLASH_WIND;
        return -0.55 + (-1.95 - -0.55) * (q * (2 - q));
      }
      if (p < SLASH_HIT) {
        // The strike, eased in — the fast half of the old two-part curve.
        const q = (p - SLASH_WIND) / (SLASH_HIT - SLASH_WIND);
        return -1.95 + (0.62 - -1.95) * (q * q);
      }
      // Follow-through: the blade carries past the guard and settles back onto
      // it, rather than stopping dead on the terminal frame.
      const q = (p - SLASH_HIT) / (1 - SLASH_HIT);
      return 0.62 + (-0.55 - 0.62) * (q * (2 - q)) - Math.sin(q * Math.PI) * 0.22;
    }
    case "force":
      return -2.3 + bob;
    case "kicking":
      return -0.4 + bob;
    default:
      return -0.55 + bob;
  }
}

/**
 * Track the target with a damped spring, in the fixed step so the motion is
 * frame-rate independent. The strike is stiff and lightly damped so it stays
 * crisp; everything else is soft, which is what turns the old constant-angle
 * poses into moves that are entered and left.
 */
function springBlade(st: DuelState, f: Fighter, foe: Fighter): void {
  if (f.action === "dead") return;
  const target = bladeTarget(f, foe, st.idle);
  const k = f.action === "attacking" ? 0.6 : 0.22;
  const d = f.action === "attacking" ? 0.5 : 0.72;
  f.bladeV = (f.bladeV + (target - f.bladeA) * k) * d;
  f.bladeA += f.bladeV;
}

/**
 * One fighter, drawn in body-local units: the origin is the top of the torso at
 * its centre line, and +x is *forward* because the whole figure is mirrored by
 * `scale(facing, 1)`. That transform is the reason this function can afford
 * limbs at all — the previous version inlined `cx` and `facing` into every
 * coordinate, so every part had to be written twice in its head, and the figure
 * was two rectangles because two rectangles was all that was affordable.
 */
function drawFighter(
  ctx: CanvasRenderingContext2D,
  st: DuelState,
  f: Fighter,
  blade: string,
  v: DuelView,
): void {
  const cx = centre(f);
  const dead = f.action === "dead";
  const bodyAlpha = 0.85 * v.dim;
  const cxFeet = BODY_H;

  // The blade's smear, in world units and behind everything: its geometry
  // belongs to the last few frames rather than this one, so it cannot live
  // inside the body transform.
  // Keyed to how fast the blade is *turning*, not to how fast it is moving. The
  // samples are world positions, so a fighter sliding sideways with a still
  // blade swept out a clean filled rectangle — motion, correctly recorded, but
  // reading as a slab of colour rather than as a swing.
  const smear = Math.min(0.13, Math.abs(f.bladeV) * 0.34);
  if (!dead && f.trail.length > 2 && smear > 0.012) {
    ctx.fillStyle = blade;
    ctx.globalAlpha = smear;
    ctx.beginPath();
    for (let i = 1; i < f.trail.length; i += 1) {
      const a = f.trail[i - 1];
      const b = f.trail[i];
      // Only the outer part of the blade smears. Sweeping the whole length
      // fills the fan right down to the fist, where the samples converge and
      // the smear stops reading as speed and starts reading as a cape.
      const ax = a.hx + (a.tx - a.hx) * TRAIL_INNER;
      const ay = a.hy + (a.ty - a.hy) * TRAIL_INNER;
      const bx = b.hx + (b.tx - b.hx) * TRAIL_INNER;
      const by = b.hy + (b.ty - b.hy) * TRAIL_INNER;
      ctx.moveTo(ax, ay);
      ctx.lineTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(bx, by);
      ctx.closePath();
    }
    // One path, one fill: filling per-quad would stack alpha everywhere the
    // smear crosses itself at the turn of a swing.
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, f.y);
  ctx.scale(f.facing, 1);

  if (dead) {
    // Tip over during the first dozen frames of the hold, then lie flat. This
    // now runs through the same transform as a live fighter, so the halo, the
    // horns, the cape and the tail stay on the body — they used to vanish on
    // the frame of death, leaving the two pairings indistinguishable for the
    // two seconds anyone actually looks at the loser.
    const p = Math.min(1, (DEATH_HOLD - st.over) / 12);
    ctx.translate(0, cxFeet);
    ctx.rotate(-p * (Math.PI / 2));
    ctx.translate(0, -cxFeet);
  } else if (f.land > 0) {
    // Landing squash, about the feet rather than the body's centre.
    ctx.translate(0, cxFeet);
    ctx.scale(1 + f.land * 0.14, 1 - f.land * 0.14);
    ctx.translate(0, -cxFeet);
  }

  /** Travel, in local units: positive is forward whichever way the figure faces. */
  const localVx = f.vx * f.facing;
  /** Lean into travel, knocked back by a fresh hit. The feet stay planted. */
  const lean = Math.max(-5, Math.min(5, localVx * 1.4)) - f.flash * 4;
  const breath = Math.sin(st.idle * 0.045 + f.phase) * 1.1;
  const airborne = f.y < FLOOR_Y - 0.5;
  const speed = Math.min(1, Math.abs(localVx) / 2.2);
  const headY = -15 + breath * 0.6;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = v.ink;
  ctx.fillStyle = v.ink;

  /** Stroke a two-bone limb and hand back the joint. */
  const limb = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    l1: number,
    l2: number,
    bend: number,
    width: number,
  ): { x: number; y: number } => {
    const j = joint(x0, y0, x1, y1, l1, l2, bend);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(j.x, j.y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    return j;
  };

  // ---- the off hand, behind the body ------------------------------------
  const forceP = f.action === "force" ? 1 - f.timer / FORCE_FRAMES : 0;
  const offShX = -SHOULDER_X + lean;
  const offShY = SHOULDER_Y + breath;
  let offHandX = -16;
  let offHandY = 32;
  if (f.action === "force") {
    // The push arm reaches forward; it is a solved arm now, so it has an elbow.
    offHandX = -4 + 30 * Math.min(1, forceP * 2.5);
    offHandY = 21;
  }
  ctx.globalAlpha = bodyAlpha * 0.9;
  limb(offShX, offShY, offHandX, offHandY, UPPER_ARM, FOREARM, 1, 7);

  // ---- the back layer: capes, robes, wings, tunics -----------------------
  if (f.style === "caped") {
    // The cape trails against travel instead of hanging like a board.
    const drift = Math.max(-12, Math.min(12, -localVx * 2.6));
    ctx.globalAlpha = 0.4 * v.dim;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-30 + drift, BODY_H * 0.55);
    ctx.lineTo(-24 + drift, BODY_H);
    ctx.lineTo(-6, BODY_H);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "haloed") {
    // The aura breathes rather than sitting at a fixed radius.
    ctx.globalAlpha = 0.08 * v.dim;
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.arc(0, 22, 46 + Math.sin(st.idle * 0.03 + f.phase) * 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.6 * v.dim;
    ctx.fillStyle = v.ink;
    ctx.beginPath();
    ctx.moveTo(-BODY_W / 2, BODY_H * 0.4);
    ctx.lineTo(-BODY_W / 2 - 8, BODY_H);
    ctx.lineTo(BODY_W / 2 + 8, BODY_H);
    ctx.lineTo(BODY_W / 2, BODY_H * 0.4);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "horned") {
    // The wing flares open on a leap and folds while grounded.
    const flare = airborne ? 1.35 : 1;
    ctx.globalAlpha = 0.3 * v.dim;
    ctx.beginPath();
    ctx.moveTo(-5, 8);
    ctx.lineTo(-36 * flare, -10 - (flare - 1) * 20);
    ctx.lineTo(-28 * flare, 10);
    ctx.lineTo(-38 * flare, 18);
    ctx.lineTo(-26 * flare, 26);
    ctx.lineTo(-30 * flare, 36);
    ctx.lineTo(-6, 24);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "hooded") {
    ctx.globalAlpha = 0.35 * v.dim;
    ctx.beginPath();
    ctx.moveTo(-BODY_W / 2, BODY_H * 0.55);
    ctx.lineTo(-BODY_W / 2 - 5, BODY_H);
    ctx.lineTo(BODY_W / 2 + 5, BODY_H);
    ctx.lineTo(BODY_W / 2, BODY_H * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // ---- legs --------------------------------------------------------------
  // A stance that widens into a swing, a walk cycle keyed to distance covered,
  // a tuck in the air, and a real support leg under the kick. Previously the
  // only leg in the file was the kick's single straight stub.
  const kickP = f.action === "kicking" ? 1 - f.timer / KICK_FRAMES : 0;
  const kickReach = Math.sin(Math.PI * Math.min(1, kickP * 1.4)) * 34;
  const brace = f.action === "attacking" ? 4 : 0;
  ctx.globalAlpha = bodyAlpha;
  ctx.strokeStyle = v.ink;
  for (let i = 0; i < 2; i += 1) {
    const front = i === 0;
    const hipX = front ? HIP_X : -HIP_X;
    let footX = front ? 3 + brace : -3 - brace;
    let footY = BODY_H;
    if (airborne) {
      footX = front ? 7 : -9;
      footY = BODY_H - 14;
    } else if (f.action === "kicking" && front) {
      footX = 8 + kickReach;
      footY = BODY_H - 14 - kickReach * 0.5;
    } else {
      const ph = f.stride + (front ? 0 : Math.PI);
      footX += Math.sin(ph) * 13 * speed;
      footY -= Math.max(0, Math.cos(ph)) * 9 * speed;
    }
    // The knee breaks forward, and the far leg is drawn a touch thinner so the
    // pair reads as two legs rather than one thick one.
    limb(hipX, TORSO_H - 2, footX, footY, THIGH, SHIN, -1, front ? 8 : 7);
  }

  // The sword arm goes on *before* the torso. Ink over ink at the same alpha
  // stacks, so an arm crossing the chest painted itself as a bright band; drawn
  // under, only the forearm and hand clear the body, which is also where an arm
  // actually is.
  const flick =
    1 + (Math.sin(st.idle * 0.8 + f.phase) + Math.sin(st.idle * 1.37 + f.phase * 2)) * 0.008;
  const g = bladeLocal(f, flick);
  if (!dead) {
    ctx.globalAlpha = bodyAlpha;
    ctx.strokeStyle = v.ink;
    limb(SHOULDER_X + lean, SHOULDER_Y + breath, g.hx, g.hy, UPPER_ARM, FOREARM, -1, 6);
  }

  // ---- torso and head ----------------------------------------------------
  // A quad rather than a rect, so the shoulders can lean over planted hips.
  ctx.globalAlpha = bodyAlpha;
  ctx.fillStyle = v.ink;
  ctx.beginPath();
  ctx.moveTo(-BODY_W / 2 + lean, breath);
  ctx.lineTo(BODY_W / 2 + lean, breath);
  ctx.lineTo(BODY_W / 2 - 2, TORSO_H);
  ctx.lineTo(-BODY_W / 2 + 2, TORSO_H);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(lean, 0);
  ctx.fillRect(-9, headY, 18, 15);
  if (f.style === "hooded") {
    ctx.beginPath();
    ctx.moveTo(-14, headY + 15);
    ctx.lineTo(2, headY - 10);
    ctx.lineTo(13, headY + 11);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "caped") {
    ctx.beginPath();
    ctx.arc(0, headY + 2, 13, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, headY + 9);
    ctx.lineTo(-17, headY + 17);
    ctx.lineTo(17, headY + 17);
    ctx.lineTo(12, headY + 9);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "haloed") {
    ctx.fillRect(-14, headY, 5, 23);
    ctx.fillRect(9, headY, 5, 23);
    ctx.fillRect(-10, headY - 3, 20, 5);
    // The halo floats clear of the head, and now bobs independently of it.
    const halo = headY - 10 + Math.sin(st.idle * 0.04 + f.phase) * 1.6;
    ctx.strokeStyle = blade;
    ctx.globalAlpha = 0.35 * v.dim;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, halo, 14, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.95 * v.dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, halo, 14, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = bodyAlpha;
    ctx.fillStyle = v.ink;
  } else {
    ctx.beginPath();
    ctx.moveTo(-8, headY + 2);
    ctx.quadraticCurveTo(-15, headY - 6, -11, headY - 15);
    ctx.quadraticCurveTo(-9, headY - 6, -4, headY - 1);
    ctx.closePath();
    ctx.moveTo(8, headY + 2);
    ctx.quadraticCurveTo(15, headY - 6, 11, headY - 15);
    ctx.quadraticCurveTo(9, headY - 6, 4, headY - 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ---- chest dressing ----------------------------------------------------
  if (f.style === "caped") {
    // The panel's cells blink out of phase, so the costume has a pulse.
    ctx.fillStyle = v.spark;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const lit = 0.35 + 0.55 * ((Math.sin(st.idle * 0.09 + row * 1.7 + col * 2.6 + f.phase) + 1) / 2);
        ctx.globalAlpha = lit * v.dim;
        ctx.fillRect(-6 + col * 8 + lean * 0.6, 15 + row * 6, 3, 3);
      }
    }
    ctx.globalAlpha = 0.6 * v.dim;
    ctx.fillRect(-10, 42, 5, 5);
    ctx.fillRect(5, 42, 5, 5);
    ctx.fillStyle = v.ink;
  } else if (f.style === "hooded") {
    ctx.fillStyle = blade;
    ctx.globalAlpha = 0.5 * v.dim;
    ctx.fillRect(-BODY_W / 2, 36, BODY_W, 4);
    ctx.fillStyle = v.ink;
  } else if (f.style === "horned") {
    const sway = Math.sin(st.idle * 0.06 + f.phase) * 5;
    const tailTipX = -32;
    const tailTipY = BODY_H - 26 + sway;
    ctx.strokeStyle = v.ink;
    ctx.globalAlpha = 0.7 * v.dim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, BODY_H - 6);
    ctx.quadraticCurveTo(-36, BODY_H + 10, tailTipX, tailTipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tailTipX - 5, tailTipY - 2);
    ctx.lineTo(tailTipX + 5, tailTipY - 2);
    ctx.lineTo(tailTipX, tailTipY - 11);
    ctx.closePath();
    ctx.fill();
  }

  // Hit feedback: the torso flashes in the spark colour for a few frames.
  if (f.flash > 0) {
    ctx.globalAlpha = f.flash * 0.5 * v.dim;
    ctx.fillStyle = v.spark;
    ctx.beginPath();
    ctx.moveTo(-BODY_W / 2 + lean, breath);
    ctx.lineTo(BODY_W / 2 + lean, breath);
    ctx.lineTo(BODY_W / 2 - 2, TORSO_H);
    ctx.lineTo(-BODY_W / 2 + 2, TORSO_H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = v.ink;
  }

  // ---- the force rings ---------------------------------------------------
  if (f.action === "force" && forceP > 0.3 && forceP < 0.9) {
    const q = (forceP - 0.3) / 0.6;
    ctx.strokeStyle = v.spark;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const r = (q * 90 + i * 14) % 110;
      ctx.globalAlpha = (1 - q) * 0.4 * v.dim;
      ctx.beginPath();
      ctx.arc(offHandX + 6, offHandY, Math.max(4, r), -0.8, 0.8);
      ctx.stroke();
    }
  }

  // ---- the blade ---------------------------------------------------------
  // The ~1.5% length wobble in `flick` is what makes it look *held* rather than
  // drawn, and the hand it hangs from is solved from the blade's own angle, so
  // the tip travels through space instead of pivoting around the torso.
  if (!dead) {
    // Three passes — widest and faintest first — so the glow falls away from a
    // bright core without a gradient.
    ctx.strokeStyle = blade;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(g.hx, g.hy);
    ctx.lineTo(g.tx, g.ty);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(g.hx, g.hy);
    ctx.lineTo(g.tx, g.ty);
    ctx.stroke();

    ctx.strokeStyle = v.core;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(g.hx, g.hy);
    ctx.lineTo(g.tx, g.ty);
    ctx.stroke();
  }

  ctx.restore();

  // The health bar is drawn outside the body transform: inside it, the mirror
  // would fill it from the wrong end and the landing squash would bounce it.
  if (v.bars && !dead) {
    ctx.globalAlpha = 0.3 * v.dim;
    ctx.fillStyle = v.ink;
    ctx.fillRect(cx - 17, f.y - 34, 34, 4);
    ctx.globalAlpha = 0.9 * v.dim;
    ctx.fillStyle = blade;
    ctx.fillRect(cx - 17, f.y - 34, 34 * (f.health / MAX_HEALTH), 4);
  }

  ctx.globalAlpha = 1;
}

/** Draw one frame of the fight into `v`'s box. Pure rendering, no simulation. */
export function drawDuel(ctx: CanvasRenderingContext2D, st: DuelState, v: DuelView): void {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.scale(v.scale, v.scale);

  ctx.globalAlpha = 0.3 * v.dim;
  ctx.strokeStyle = v.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, FEET_Y);
  ctx.lineTo(WORLD_W - 50, FEET_Y);
  ctx.stroke();

  // Both shadows before either body, or the second fighter's shadow paints over
  // the first one's legs. They shrink and fade with height, which is the only
  // thing on screen that says a leaping fighter has left the ground.
  ctx.fillStyle = v.line;
  for (const f of [st.a, st.b]) {
    if (f.action === "dead") continue;
    const lift = Math.max(0, (FLOOR_Y - f.y) / 60);
    ctx.globalAlpha = 0.22 * v.dim * (1 - lift * 0.7);
    ctx.beginPath();
    ctx.ellipse(centre(f), FEET_Y, 20 - lift * 7, 3.5 - lift * 1.2, 0, 0, TAU);
    ctx.fill();
  }

  drawFighter(ctx, st, st.a, v.bladeA, v);
  drawFighter(ctx, st, st.b, v.bladeB, v);

  // Sparks as short streaks along their own travel, not discs: a disc has no
  // direction, and the whole point of biasing the burst was to show one.
  ctx.strokeStyle = v.spark;
  ctx.lineCap = "round";
  for (const sp of st.sparks) {
    ctx.globalAlpha = Math.min(1, sp.life) * 0.85;
    ctx.lineWidth = Math.max(0.8, 2.2 * sp.life);
    ctx.beginPath();
    ctx.moveTo(sp.x - sp.vx * 1.8, sp.y - sp.vy * 1.8);
    ctx.lineTo(sp.x, sp.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
