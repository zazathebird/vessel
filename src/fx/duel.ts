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
/*
 * Starting positions, and the band thresholds below, were retuned once the
 * director existed and the fighters could be *watched* over ninety seconds.
 *
 * They began at 150 and 520 — 370 units apart — and with travel halved to suit
 * the slower strikes, nothing ever closed that gap. Instrumenting a 90-second
 * run showed 34 exchanges drawn from just five sequences, every one of them
 * from the `far` band: the entire close-quarters half of the pool was
 * unreachable, and the fight was two figures shoving each other from across the
 * room. They now start inside the `mid` band and the bands are wider.
 */
const START_A = 250;
const START_B = 420;
const MAX_HEALTH = 100;
/** Frames the winner holds the field before the next match. Two seconds. */
const DEATH_HOLD = 200;

/**
 * Tempo (client, 2026-08-14: "just slow it the fuck down. this is giving me a
 * headache watching the looping fights", and "no limit in length of fight").
 *
 * The per-move frame counts now live in `MOVES`, and the shape of the fix is
 * the opposite of what it sounds like: the *strikes got faster* while the
 * *moves got longer*. A slash used to be 20 frames of continuous travel — slow
 * where it should be fast and fast where it should be slow. Each strike is now
 * 4–6 frames for its whole arc, wrapped in a long anticipation with a dead hold
 * at the top and a long recovery, and the sequences put 20–40 frames of
 * stillness between exchanges.
 *
 * Note the client was watching the old version at roughly *double* its numbers:
 * the duel clock had the canvas `boost` folded into it and the screensaver adds
 * 0.9 to that. See the note in `duelling` in effects.ts.
 */

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
/**
 * Centre-to-centre separation the blade lock closes to, in world units.
 *
 * Not a taste value: a hand sits about 28 units forward of a fighter's centre
 * and the blade reaches roughly 48 further at the lock's angle, so at this
 * distance the two blades cross near their middles — the bind lands between the
 * pair instead of on somebody's fist. Measured against the real geometry rather
 * than derived, because the press rotates the two blades apart as it runs and
 * the closed form stops describing it after the first few frames.
 */
const LOCK_SEP = 92;

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
  /**
   * The animation channel the renderer branches on, derived from the current
   * move rather than decided. Kept as its own field so `drawFighter` needs no
   * knowledge of the move table.
   */
  action: Action;
  /** The move being performed, and how many frames into it. */
  move: MoveId;
  mf: number;
  /** The scripted result of this move, written by the director's beat. */
  outcome?: "hit" | "miss" | "blocked";
  /** Per-beat damage multiplier, so both roles draw from one distribution. */
  beatPower: number;
  /** Sustained movement intent while neutral: -1, 0 or 1, in world x. */
  drive: number;
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
  /** Frames until the blades may throw sparks again — see the clash test. */
  clash: number;
  /**
   * Frames of hit-stop still owed. Both fighters' move clocks freeze while this
   * is above zero; the sparks and `idle` deliberately do not, because sparks
   * flying past two locked bodies *is* the effect.
   */
  hitStop: number;
  /** The choreographer's state — see the note above `MOVES`. */
  dir: {
    seq: Sequence | null;
    f: number;
    next: number;
    att: "a" | "b";
    /** Sequences elapsed this match; drives the anti-stall rail. */
    pressure: number;
  };
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
    move: "guard",
    mf: 0,
    beatPower: 1,
    drive: 0,
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
    clash: 0,
    hitStop: 0,
    dir: { seq: null, f: 0, next: 0, att: "a", pressure: 0 },
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
 * Closest approach between the two blades, as a distance and the midpoint
 * between the nearest pair of points.
 *
 * Standard segment-to-segment: solve for the parameters that minimise the
 * distance between the two infinite lines, clamp both into [0, 1], and re-solve
 * the second against the clamped first so a clamped result is still the nearest
 * point on that segment rather than an endpoint guess. The parallel case falls
 * out as `den` near zero and is handled by taking `s = 0`.
 */
function bladeGap(
  a: { hx: number; hy: number; tx: number; ty: number },
  b: { hx: number; hy: number; tx: number; ty: number },
): { d: number; x: number; y: number } {
  const ux = a.tx - a.hx;
  const uy = a.ty - a.hy;
  const vx = b.tx - b.hx;
  const vy = b.ty - b.hy;
  const wx = a.hx - b.hx;
  const wy = a.hy - b.hy;
  const uu = ux * ux + uy * uy;
  const uv = ux * vx + uy * vy;
  const vv = vx * vx + vy * vy;
  const uw = ux * wx + uy * wy;
  const vw = vx * wx + vy * wy;
  const den = uu * vv - uv * uv;

  let s = Math.abs(den) < 1e-6 ? 0 : (uv * vw - vv * uw) / den;
  s = Math.max(0, Math.min(1, s));
  /*
   * `vw`, not `uw`. Re-solving the second segment against a clamped `s` asks
   * where on `v` is nearest to `a.h + s·u`, which is `((w + s·u)·v) / (v·v)` —
   * and `w·v` is `vw`. With `uw` here the routine reported two segments that
   * provably cross as **16 units apart** and pinned the nearest point to `b`'s
   * hilt, which is the `r = 0` every configuration came back with.
   *
   * It is worth knowing what that cost, because none of it looked like a maths
   * bug: the blade-on-blade shower tests `near.d < 9`, so overstated distances
   * meant crossed blades frequently threw no sparks at all, and the bursts that
   * did fire were placed toward a fist rather than at the crossing. That is the
   * "sparks when swords meet" the client asked for, half working, for a reason
   * no amount of looking at the spark code would have found.
   */
  let r = vv < 1e-6 ? 0 : (vw + uv * s) / vv;
  r = Math.max(0, Math.min(1, r));
  // One more pass for `s` against the clamped `r`, for the same reason.
  s = uu < 1e-6 ? 0 : Math.max(0, Math.min(1, (uv * r - uw) / uu));

  const px = a.hx + ux * s;
  const py = a.hy + uy * s;
  const qx = b.hx + vx * r;
  const qy = b.hy + vy * r;
  return { d: Math.hypot(px - qx, py - qy), x: (px + qx) / 2, y: (py + qy) / 2 };
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
  life = 1,
): void {
  for (let i = 0; i < n; i += 1) {
    const ang = Math.random() * TAU;
    const speed = 1.5 + Math.random() * 4;
    st.sparks.push({
      x,
      y,
      vx: Math.cos(ang) * speed + bx * (1 + Math.random() * 2),
      vy: Math.sin(ang) * speed - 2 + by * (1 + Math.random() * 2),
      // The renderer sizes and fades a spark by its own life, so a burst spawned
      // short is *smaller and dimmer for its whole flight*, not merely briefer.
      // That is what lets the lock emit two or three every frame for a second
      // and a half without the shower reading as one accumulating cloud.
      life,
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

/*
 * The choreographer.
 *
 * The old engine ran `decide()` once per fighter, independently, and that is
 * the whole reason the fight read as "pathetic" and "a one-handed sword fight"
 * — not the artwork. Two independent randomisers cannot produce action and
 * reaction, and action-and-reaction is what a fight *is*. Nothing was ever
 * blocked, nothing ever bounced off anything, and every exchange was two people
 * swinging near each other and occasionally overlapping.
 *
 * So the fighters no longer decide anything. A director owns the exchange: it
 * picks a `Sequence` — a short script of beats — assigns the two roles by a coin
 * flip, and hands each fighter a move at a scripted frame. Outcomes are written
 * into the script rather than rolled per swing, which is what lets a parry be a
 * *reaction* to a specific strike instead of a coincidence.
 *
 * **The roles are also the fairness proof** (client: "random winners always, no
 * bias or favorites for winner"). No sequence names a side; every beat belongs
 * to `ATT` or `DEF`, and which fighter holds which role is one coin flip per
 * sequence that consults nothing — not health, not position, not who won the
 * last exchange. Damage multipliers live on the beats, so both sides draw from
 * one distribution by construction.
 *
 * **Nothing here waits on a condition.** Every sequence has a fixed length and
 * the director advances unconditionally; a blade lock's duration is rolled when
 * it starts, never "until someone wins the press". The match-reset loop has no
 * timeout, so a beat that could block would hang the whole effect — this is the
 * same hazard that got a reactive block declined in `docs/DUEL.md`, and a
 * scripted lock is safe for exactly the reason a reactive one is not: it does
 * not consult anything.
 */

type Ease = "in" | "out" | "inout" | "hold";
/** `[t (0–1 of the move), angle, how to arrive]`. */
type Key = [number, number, Ease];

type MoveId =
  | "guard"
  | "advance"
  | "retreat"
  | "circle"
  | "strike_overhead"
  | "strike_diagonal"
  | "strike_rising"
  | "thrust"
  | "kick"
  | "leap_strike"
  | "spin_attack"
  | "parry_high"
  | "parry_cross"
  | "parry_low"
  | "recoil"
  | "stagger"
  | "knockdown"
  | "backstep"
  | "force_push"
  | "lock"
  | "flip_over"
  | "force_pull"
  | "force_hold"
  | "stumble_in"
  | "held"
  | "flourish"
  | "dead";

interface Move {
  frames: number;
  blade: Key[];
  /** Frame the outcome resolves on, or -1 for a move that cannot connect. */
  contact: number;
  power: number;
  /** Which animation channel `drawFighter` should use. */
  chan: Action;
  impulse?: { at: number; vx: number; vy?: number };
}

/** Named blade angles. 0 is level and forward; negative is up. */
const GUARD_MID = -0.55;
const GUARD_HIGH = -1.15;
const GUARD_LOW = 0.15;

/*
 * Timing, and why the strikes got *faster* while the moves got longer.
 *
 * The old slash was 20 frames of continuous travel — slow where it should be
 * fast and fast where it should be slow. Every strike here is 4–6 frames for
 * its whole arc, roughly double the old angular speed, wrapped in a long
 * anticipation with a **dead hold** at the top and a long recovery. The hold is
 * the move: it is what gives the blow somewhere to come from.
 *
 * A fight reads through the contrast between stillness and explosion, and the
 * old one had no frame in which nothing was happening.
 */
const MOVES: Record<MoveId, Move> = {
  guard: {
    frames: 26,
    blade: [[0, GUARD_MID, "out"], [1, GUARD_MID, "hold"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  advance: {
    frames: 54,
    blade: [[0, GUARD_MID, "out"], [1, GUARD_MID, "hold"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  retreat: {
    frames: 34,
    blade: [[0, GUARD_MID, "out"], [1, GUARD_MID, "hold"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  circle: {
    frames: 46,
    blade: [[0, GUARD_MID, "out"], [0.5, GUARD_HIGH, "inout"], [1, GUARD_MID, "inout"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  // The blade travels the figure's whole vertical extent — the longest
  // silhouette move available, and the most readable at this size.
  strike_overhead: {
    frames: 36,
    blade: [
      [0, GUARD_MID, "out"],
      [0.33, -2.15, "out"],
      [0.46, -2.15, "hold"],
      [0.6, 0.95, "in"],
      [0.7, 1.15, "out"],
      [1, GUARD_MID, "out"],
    ],
    contact: 21,
    power: 1,
    chan: "attacking",
  },
  // Off-axis, so its smear is a diagonal band rather than a vertical one. It
  // exists to be distinguishable from the overhead.
  strike_diagonal: {
    frames: 32,
    blade: [
      [0, GUARD_MID, "out"],
      [0.31, -2.45, "out"],
      [0.43, -2.45, "hold"],
      [0.58, 0.55, "in"],
      [1, GUARD_MID, "out"],
    ],
    contact: 18,
    power: 1,
    chan: "attacking",
  },
  // The only attack whose smear travels upward, so it reads by direction alone.
  // Recovers to the high guard rather than the middle — free asymmetry.
  strike_rising: {
    frames: 30,
    blade: [
      [0, GUARD_MID, "out"],
      [0.3, 1.2, "out"],
      [0.4, 1.2, "hold"],
      [0.55, -1.35, "in"],
      [1, GUARD_HIGH, "out"],
    ],
    contact: 16,
    power: 1,
    chan: "attacking",
  },
  // A thrust reads through the *body*, not the blade — the blade barely
  // rotates, so there is almost no smear. It is the essential contrast against
  // a set of arcs; without it every attack looks like the same attack.
  thrust: {
    frames: 28,
    blade: [
      [0, GUARD_MID, "out"],
      [0.36, -0.35, "out"],
      [0.5, -0.05, "in"],
      [0.62, -0.05, "hold"],
      [1, GUARD_MID, "out"],
    ],
    contact: 14,
    power: 1.05,
    chan: "attacking",
    impulse: { at: 12, vx: 2.4 },
  },
  kick: {
    frames: 20,
    blade: [[0, -0.4, "out"], [1, GUARD_MID, "out"]],
    contact: 9,
    power: 0.55,
    chan: "kicking",
  },
  // The blade is held motionless overhead for the whole flight — a loaded
  // spring. A blade swinging in mid-air is visual mush.
  leap_strike: {
    frames: 48,
    blade: [
      [0, GUARD_MID, "out"],
      [0.17, -2.2, "out"],
      [0.62, -2.2, "hold"],
      [0.75, 1.1, "in"],
      [1, GUARD_MID, "out"],
    ],
    contact: 34,
    power: 1.3,
    chan: "attacking",
    impulse: { at: 8, vx: 4.2, vy: -11.5 },
  },
  spin_attack: {
    frames: 40,
    blade: [
      [0, GUARD_MID, "out"],
      [0.25, -1.6, "out"],
      [0.7, -1.6, "hold"],
      [0.8, 0.7, "in"],
      [1, GUARD_MID, "out"],
    ],
    contact: 23,
    power: 1.25,
    chan: "attacking",
  },
  /*
   * The three parries are chosen for where the bright bar lands on the body,
   * not for their angles: above the head, across the chest, at the knee. At the
   * size these render nobody reads a blade angle — they read the height of the
   * line. Each is roughly perpendicular to the strike it answers, which is what
   * makes a block read as a block rather than as two blades happening to be
   * near each other.
   */
  parry_high: {
    frames: 24,
    blade: [[0, GUARD_MID, "out"], [0.21, -0.1, "out"], [0.58, -0.1, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  parry_cross: {
    frames: 26,
    blade: [[0, GUARD_MID, "out"], [0.23, -0.85, "out"], [0.6, -0.85, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  parry_low: {
    frames: 24,
    blade: [[0, GUARD_LOW, "out"], [0.21, 0.55, "out"], [0.58, 0.55, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  // The half everyone forgets. Without it a blocked blade carries on through
  // its arc and the parry never happened.
  recoil: {
    frames: 18,
    blade: [[0, -1.5, "out"], [0.3, -1.9, "out"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 0, vx: -1.6 },
  },
  // A hit that produces no reaction did not happen. The blade goes off-guard,
  // which is the visual definition of vulnerability.
  stagger: {
    frames: 32,
    blade: [[0, -0.1, "out"], [0.35, 0.25, "out"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 0, vx: -2.5 },
  },
  knockdown: {
    frames: 56,
    blade: [[0, 0.4, "out"], [0.4, 1.1, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 0, vx: -4.2, vy: -6 },
  },
  backstep: {
    frames: 26,
    blade: [[0, GUARD_MID, "out"], [1, GUARD_MID, "hold"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 2, vx: -3.4 },
  },
  // The six-frame hold at full extension is what makes an invisible force
  // visible; without it the push reads as a gesture rather than an act.
  force_push: {
    frames: 44,
    blade: [[0, GUARD_MID, "out"], [0.3, -2.3, "out"], [1, GUARD_MID, "out"]],
    contact: 18,
    power: 1,
    chan: "force",
    impulse: { at: 20, vx: -2.2 },
  },
  // Length is rolled when it starts. It must never be condition-terminated.
  lock: {
    frames: 92,
    blade: [[0, -0.7, "out"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  /*
   * The somersault over the opponent's head. The most recognisable move in the
   * genre and the only one that changes the arena's geometry — the fighters end
   * on opposite sides, and `stepFighter` re-derives facing from the new
   * positions, so the turn costs nothing to bookkeep.
   *
   * The blade is held tucked and still for the whole flight, for the same
   * reason `leap_strike` holds its overhead: a blade swinging in mid-air is
   * mush, and a still blade under a tumbling body reads as control.
   */
  flip_over: {
    frames: 54,
    blade: [
      [0, GUARD_MID, "out"],
      [0.15, 1.35, "out"],
      [0.72, 1.35, "hold"],
      [1, GUARD_MID, "out"],
    ],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 7, vx: 10.5, vy: -13.2 },
  },
  // The only move where the target closes distance involuntarily. Rings that
  // converge inward plus a body travelling the wrong way is a clear read even
  // with nothing else to go on.
  force_pull: {
    frames: 42,
    blade: [[0, GUARD_MID, "out"], [0.3, -2.1, "out"], [1, GUARD_MID, "out"]],
    contact: 15,
    power: 0.35,
    chan: "force",
  },
  // A fighter hanging in the air with a slack blade. It deals nothing — its
  // whole job is to set up the blow that follows.
  force_hold: {
    frames: 56,
    blade: [[0, GUARD_MID, "out"], [0.22, -1.9, "out"], [0.7, -1.9, "hold"], [1, GUARD_MID, "out"]],
    contact: 13,
    power: 0,
    chan: "force",
  },
  // Dragged off balance toward the puller: the reaction that makes `force_pull`
  // legible as a pull rather than a shove that went the wrong way.
  stumble_in: {
    frames: 30,
    blade: [[0, 0.9, "out"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  // Lifted. Gravity is suspended for the duration (see the physics step) and
  // the blade droops — a limp blade is the whole tell.
  held: {
    frames: 44,
    blade: [[0, 0.4, "out"], [0.25, 1.25, "out"], [0.8, 1.25, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  flourish: {
    frames: 30,
    blade: [[0, GUARD_MID, "out"], [0.5, 2.6, "in"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  dead: { frames: 1, blade: [[0, 0, "hold"]], contact: -1, power: 0, chan: "dead" },
};

type Role = "ATT" | "DEF";

interface Beat {
  who: Role;
  move: MoveId;
  /** Frames from the start of the sequence. */
  at: number;
  outcome?: "hit" | "miss" | "blocked";
  power?: number;
}

interface Sequence {
  id: string;
  weight: number;
  range: "close" | "mid" | "far" | "any";
  /** Total frames including the trailing rest. Fixed — never conditional. */
  length: number;
  beats: Beat[];
}

/** Centre-to-centre bands the sequence pool is filtered by. */
const CLOSE = 132;
const MID = 245;

/*
 * The pool. Beats name roles, never sides — see the fairness note above.
 *
 * The mix matters as much as the contents. Roughly a fifth of the weight is
 * sequences that deal no damage at all (`probe`, `standoff`, `disengage`), and
 * that is deliberate: without silence the strikes have nothing to be loud
 * against. It is also kept under a third, because zero-damage sequences are the
 * one thing that can stretch a match indefinitely.
 */
const SEQUENCES: Sequence[] = [
  {
    // Pure closing. Both roles advance, and because `facing` always points at
    // the opponent, "advance" closes for whoever performs it — so this cannot
    // favour a side or drift the pair off toward one wall.
    id: "close-in",
    weight: 22,
    range: "far",
    length: 108,
    beats: [
      { who: "ATT", move: "advance", at: 0 },
      { who: "DEF", move: "advance", at: 0 },
      { who: "ATT", move: "advance", at: 56 },
      { who: "DEF", move: "circle", at: 56 },
    ],
  },
  {
    id: "step-in",
    weight: 13,
    range: "mid",
    length: 84,
    beats: [
      { who: "ATT", move: "advance", at: 0 },
      { who: "DEF", move: "guard", at: 0 },
      { who: "ATT", move: "guard", at: 58 },
      { who: "DEF", move: "advance", at: 58 },
    ],
  },
  {
    id: "probe",
    weight: 10,
    range: "mid",
    length: 96,
    beats: [
      { who: "ATT", move: "advance", at: 0 },
      { who: "DEF", move: "circle", at: 0 },
      { who: "ATT", move: "thrust", at: 18, outcome: "miss" },
      { who: "DEF", move: "backstep", at: 24 },
      { who: "ATT", move: "guard", at: 52 },
      { who: "DEF", move: "guard", at: 52 },
    ],
  },
  {
    id: "cut-and-catch",
    weight: 12,
    range: "close",
    length: 104,
    beats: [
      { who: "ATT", move: "strike_diagonal", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_cross", at: 8 },
      { who: "DEF", move: "strike_rising", at: 34, outcome: "hit", power: 0.85 },
      { who: "ATT", move: "stagger", at: 50 },
      { who: "DEF", move: "guard", at: 68 },
    ],
  },
  {
    id: "overhead-denied",
    weight: 12,
    range: "close",
    length: 118,
    beats: [
      { who: "ATT", move: "strike_overhead", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_high", at: 11 },
      { who: "DEF", move: "thrust", at: 26, outcome: "miss" },
      { who: "ATT", move: "backstep", at: 40 },
      { who: "ATT", move: "guard", at: 70 },
      { who: "DEF", move: "guard", at: 70 },
    ],
  },
  {
    id: "close-the-gap",
    weight: 10,
    range: "far",
    length: 110,
    beats: [
      { who: "ATT", move: "leap_strike", at: 0, outcome: "hit" },
      { who: "DEF", move: "stagger", at: 34 },
      { who: "ATT", move: "guard", at: 64 },
    ],
  },
  {
    id: "leap-evaded",
    weight: 7,
    range: "far",
    length: 116,
    beats: [
      { who: "ATT", move: "leap_strike", at: 0, outcome: "miss" },
      { who: "DEF", move: "backstep", at: 20 },
      { who: "DEF", move: "strike_rising", at: 48, outcome: "hit", power: 0.9 },
      { who: "ATT", move: "stagger", at: 64 },
      { who: "DEF", move: "guard", at: 90 },
    ],
  },
  {
    id: "pushed",
    weight: 9,
    range: "far",
    length: 122,
    beats: [
      { who: "ATT", move: "force_push", at: 0, outcome: "hit" },
      { who: "DEF", move: "knockdown", at: 19 },
      { who: "ATT", move: "advance", at: 78 },
      { who: "DEF", move: "guard", at: 78 },
    ],
  },
  {
    id: "trade",
    weight: 8,
    range: "close",
    length: 92,
    beats: [
      // Both land, six frames apart. Two impacts that close together read as
      // one event with a stutter in it, which is the point.
      { who: "ATT", move: "strike_rising", at: 0, outcome: "hit", power: 0.7 },
      { who: "DEF", move: "strike_diagonal", at: 4, outcome: "hit", power: 0.7 },
      { who: "ATT", move: "backstep", at: 40 },
      { who: "DEF", move: "backstep", at: 40 },
    ],
  },
  {
    id: "standoff",
    weight: 8,
    range: "mid",
    length: 150,
    beats: [
      { who: "ATT", move: "circle", at: 0 },
      { who: "DEF", move: "circle", at: 0 },
      { who: "ATT", move: "flourish", at: 60 },
      { who: "DEF", move: "guard", at: 60 },
      { who: "ATT", move: "guard", at: 96 },
      { who: "DEF", move: "guard", at: 96 },
    ],
  },
  {
    id: "two-blades-one-breath",
    weight: 7,
    range: "close",
    length: 84,
    beats: [
      { who: "ATT", move: "thrust", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_low", at: 6 },
      { who: "ATT", move: "strike_rising", at: 22, outcome: "hit", power: 0.8 },
      { who: "DEF", move: "stagger", at: 38 },
    ],
  },
  {
    id: "disengage",
    weight: 9,
    range: "any",
    length: 88,
    beats: [
      { who: "ATT", move: "strike_diagonal", at: 0, outcome: "miss" },
      { who: "DEF", move: "backstep", at: 4 },
      { who: "DEF", move: "force_push", at: 22, outcome: "hit", power: 0.6 },
      { who: "ATT", move: "stagger", at: 40 },
      { who: "ATT", move: "circle", at: 56 },
    ],
  },
  {
    id: "the-lock",
    weight: 5,
    range: "close",
    length: 176,
    beats: [
      { who: "ATT", move: "strike_overhead", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_high", at: 11 },
      /*
       * The only sustained moment where both blades touch. Everything else in
       * the fight is motion; this one's value is pressure.
       *
       * `power` is the press: 1 drives, 0 gives ground. It is not a damage
       * multiplier here — `lock` has no contact frame — it is how the script
       * tells the press who wins it, through the channel `setMove` already
       * carries. That matters because the outcome is then fixed at frame 22
       * and *nothing* consults a condition to find it: the winner is whoever
       * the role coin made ATT, and ATT is who breaks through at 116 below.
       * So the grind can lean the right way for a second and a half before the
       * blow lands, which is the whole point of the image.
       */
      { who: "ATT", move: "lock", at: 22, power: 1 },
      { who: "DEF", move: "lock", at: 22, power: 0 },
      // The press breaks: the winner drives through and the loser is thrown off.
      { who: "ATT", move: "strike_diagonal", at: 116, outcome: "hit", power: 0.8 },
      { who: "DEF", move: "stagger", at: 134 },
      { who: "ATT", move: "guard", at: 158 },
    ],
  },
  {
    id: "riposte-chain",
    weight: 6,
    range: "close",
    length: 140,
    beats: [
      { who: "ATT", move: "strike_diagonal", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_cross", at: 8 },
      { who: "DEF", move: "strike_rising", at: 22, outcome: "blocked" },
      { who: "ATT", move: "parry_low", at: 30 },
      { who: "ATT", move: "thrust", at: 44, outcome: "hit", power: 0.9 },
      { who: "DEF", move: "stagger", at: 60 },
      { who: "ATT", move: "guard", at: 96 },
    ],
  },
  {
    id: "ground-and-rise",
    weight: 4,
    range: "close",
    length: 148,
    beats: [
      { who: "ATT", move: "kick", at: 0, outcome: "hit" },
      { who: "DEF", move: "knockdown", at: 10 },
      { who: "ATT", move: "strike_overhead", at: 32, outcome: "miss" },
      { who: "DEF", move: "parry_high", at: 70 },
      { who: "ATT", move: "guard", at: 96 },
      { who: "DEF", move: "guard", at: 96 },
    ],
  },
  {
    id: "the-long-wind",
    weight: 5,
    range: "mid",
    length: 176,
    beats: [
      // 1.7 seconds of nothing, then the biggest single blow in the pool. The
      // contrast *is* the sequence — it should not get tightened in tuning.
      { who: "ATT", move: "guard", at: 0 },
      { who: "DEF", move: "guard", at: 0 },
      { who: "ATT", move: "advance", at: 44 },
      { who: "DEF", move: "guard", at: 58 },
      { who: "ATT", move: "strike_overhead", at: 104, outcome: "hit", power: 1.5 },
      { who: "DEF", move: "knockdown", at: 126 },
    ],
  },
  {
    id: "wall-of-parries",
    weight: 5,
    range: "close",
    length: 138,
    beats: [
      // A regular 22-frame beat, established three times and then broken. The
      // eye hears that as a rhythm even though there is no sound.
      { who: "ATT", move: "strike_overhead", at: 0, outcome: "blocked" },
      { who: "DEF", move: "parry_high", at: 9 },
      { who: "ATT", move: "strike_diagonal", at: 24, outcome: "blocked" },
      { who: "DEF", move: "parry_cross", at: 32 },
      { who: "ATT", move: "strike_rising", at: 48, outcome: "blocked" },
      { who: "DEF", move: "parry_low", at: 56 },
      { who: "ATT", move: "strike_overhead", at: 72, outcome: "hit" },
      { who: "DEF", move: "stagger", at: 94 },
    ],
  },
  {
    id: "spin-through",
    weight: 3,
    range: "close",
    length: 122,
    beats: [
      { who: "ATT", move: "spin_attack", at: 0, outcome: "miss" },
      { who: "DEF", move: "backstep", at: 20 },
      { who: "DEF", move: "strike_rising", at: 42, outcome: "hit", power: 1.2 },
      { who: "ATT", move: "stagger", at: 58 },
      { who: "DEF", move: "guard", at: 94 },
    ],
  },
  {
    id: "over-the-top",
    weight: 7,
    range: "close",
    length: 134,
    beats: [
      { who: "ATT", move: "strike_diagonal", at: 0, outcome: "miss" },
      // Somersaults the strike and lands behind. The sides swap.
      { who: "DEF", move: "flip_over", at: 6 },
      { who: "DEF", move: "strike_rising", at: 62, outcome: "hit", power: 0.95 },
      { who: "ATT", move: "stagger", at: 78 },
      { who: "DEF", move: "guard", at: 108 },
    ],
  },
  {
    id: "flip-and-press",
    weight: 5,
    range: "mid",
    length: 150,
    beats: [
      { who: "ATT", move: "flip_over", at: 0 },
      { who: "DEF", move: "guard", at: 0 },
      { who: "ATT", move: "strike_overhead", at: 58, outcome: "blocked" },
      { who: "DEF", move: "parry_high", at: 68 },
      { who: "ATT", move: "kick", at: 86, outcome: "hit" },
      { who: "DEF", move: "stagger", at: 98 },
      { who: "ATT", move: "guard", at: 126 },
    ],
  },
  {
    id: "pull-and-punish",
    weight: 5,
    range: "far",
    length: 138,
    beats: [
      { who: "ATT", move: "force_pull", at: 0, outcome: "hit", power: 0.35 },
      { who: "DEF", move: "stumble_in", at: 16 },
      // The payoff for the setup: the biggest thrust in the pool.
      { who: "ATT", move: "thrust", at: 34, outcome: "hit", power: 1.15 },
      { who: "DEF", move: "stagger", at: 50 },
      { who: "DEF", move: "backstep", at: 84 },
      { who: "ATT", move: "guard", at: 110 },
    ],
  },
  {
    id: "held-and-struck",
    weight: 3,
    range: "mid",
    length: 164,
    beats: [
      { who: "ATT", move: "force_hold", at: 0 },
      { who: "DEF", move: "held", at: 14 },
      { who: "ATT", move: "advance", at: 44 },
      { who: "ATT", move: "strike_overhead", at: 74, outcome: "hit", power: 1.3 },
      { who: "DEF", move: "knockdown", at: 96 },
      { who: "ATT", move: "flourish", at: 120 },
    ],
  },
  {
    id: "spin-connects",
    weight: 3,
    range: "close",
    length: 118,
    beats: [
      { who: "ATT", move: "spin_attack", at: 0, outcome: "hit", power: 1.25 },
      { who: "DEF", move: "knockdown", at: 25 },
      { who: "ATT", move: "flourish", at: 60 },
      { who: "DEF", move: "guard", at: 92 },
    ],
  },
];

const TOTAL_WEIGHT = SEQUENCES.reduce((n, s) => n + s.weight, 0);

/** Sample the move's blade curve at frame `mf`. */
function bladeCurve(m: Move, mf: number): number {
  const t = m.frames <= 0 ? 1 : Math.min(1, mf / m.frames);
  const k = m.blade;
  if (k.length === 1) return k[0][1];
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1][0]) i += 1;
  const [t0, a0] = k[i];
  const [t1, a1, ease] = k[i + 1];
  const span = t1 - t0;
  const q = span <= 0 ? 1 : Math.min(1, Math.max(0, (t - t0) / span));
  if (ease === "hold") return a0;
  const e =
    ease === "in" ? q * q : ease === "out" ? q * (2 - q) : q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
  return a0 + (a1 - a0) * e;
}

/** Give a fighter a move, from frame zero. */
function setMove(f: Fighter, id: MoveId, outcome?: Beat["outcome"], power = 1): void {
  if (f.action === "dead") return;
  f.move = id;
  f.mf = 0;
  f.outcome = outcome;
  f.beatPower = power;
  f.action = MOVES[id].chan;
  f.struck = outcome === undefined;
}

/**
 * Pick the next sequence for the current spacing, and roll the roles.
 *
 * The role coin consults nothing at all — not health, not who won the last
 * exchange, not position. That is the whole guarantee: an early lucky roll can
 * never compound into a decided match, because nothing carries forward.
 */
function chooseSequence(st: DuelState): void {
  const dist = Math.abs(centre(st.a) - centre(st.b));
  const band = dist <= CLOSE ? "close" : dist <= MID ? "mid" : "far";
  let pool = SEQUENCES.filter((s) => s.range === band || s.range === "any");
  /*
   * Under pressure the pool loses its quiet sequences and the blows get
   * heavier. This is the hard rail against a match that will not end: it is
   * deterministic, symmetric, and applies to whoever happens to be attacking,
   * so it cannot favour a side. A normal match never reaches it.
   */
  const hard = st.dir.pressure > 22;
  if (hard) pool = pool.filter((s) => s.beats.some((b) => b.outcome === "hit"));
  if (pool.length === 0) pool = SEQUENCES.filter((s) => s.range === "any");
  if (pool.length === 0) pool = SEQUENCES;

  const total = pool.reduce((n, s) => n + s.weight, 0) || TOTAL_WEIGHT;
  let roll = Math.random() * total;
  let pick = pool[0];
  for (const s of pool) {
    roll -= s.weight;
    if (roll <= 0) {
      pick = s;
      break;
    }
  }
  st.dir.seq = pick;
  st.dir.f = 0;
  st.dir.next = 0;
  st.dir.att = Math.random() < 0.5 ? "a" : "b";
  st.dir.pressure += 1;
}

/** Advance the exchange and hand out this frame's beats. */
function runDirector(st: DuelState): void {
  if (st.over > 0) {
    st.dir.seq = null;
    return;
  }
  if (!st.dir.seq) {
    chooseSequence(st);
    return;
  }
  const seq = st.dir.seq;
  st.dir.f += 1;
  while (st.dir.next < seq.beats.length && seq.beats[st.dir.next].at <= st.dir.f) {
    const b = seq.beats[st.dir.next];
    st.dir.next += 1;
    const att = st.dir.att === "a" ? st.a : st.b;
    const def = st.dir.att === "a" ? st.b : st.a;
    setMove(b.who === "ATT" ? att : def, b.move, b.outcome, b.power ?? 1);
  }
  if (st.dir.f >= seq.length) st.dir.seq = null;
}


/**
 * Resolve a beat's scripted outcome on the frame its move says it connects.
 *
 * Outcomes come from the script rather than from a coin per swing, which is the
 * only way a parry can be a *reaction* to a specific strike rather than a
 * coincidence. Geometry is still what the sparks are placed by — but it is not
 * what decides whether a blow lands. Gating damage on the blade tip actually
 * reaching would make misses routine, stop health draining, and hang the
 * match-reset loop, which has no timeout.
 */
function resolveContact(st: DuelState, f: Fighter, foe: Fighter, m: Move): void {
  if (f.outcome === undefined || foe.action === "dead") return;
  const tip = bladeWorld(f);
  if (f.outcome === "hit") {
    const hx = Math.max(foe.x - 6, Math.min(foe.x + BODY_W + 6, tip.tx));
    const hy = Math.max(foe.y - 10, Math.min(foe.y + BODY_H, tip.ty));
    damage(st, foe, (8 + Math.random() * 5) * m.power * f.beatPower * f.attackPower);
    foe.vx += f.facing * (m.chan === "force" ? 5.2 : 1.8);
    spawnSparks(st, hx, hy, 14, f.facing * 1.2, 0.6);
    // Hit-stop: both fighters' move clocks freeze for two frames while the
    // sparks keep flying. Two frames is nothing to describe and a great deal to
    // watch — it is the cheapest weight cue available.
    st.hitStop = 2;
  } else if (f.outcome === "blocked") {
    // Sparks at the true crossing of the two blades, and the attacker bounces.
    const near = bladeGap(tip, bladeWorld(foe));
    spawnSparks(st, near.x, near.y, 18, 0, -1.1);
    setMove(f, "recoil");
    st.hitStop = 3;
  } else if (f.outcome === "miss" && tip.ty > FLOOR_Y + BODY_H - 6) {
    // A swing that finishes in the floor throws sparks off it.
    spawnSparks(st, tip.tx, FLOOR_Y + BODY_H, 16, 0, -2.2);
  }
}

function stepFighter(st: DuelState, f: Fighter, foe: Fighter): void {
  f.flash = Math.max(0, f.flash - 1 / 12);
  if (f.action === "dead") return;

  // Always square up — a fighter who somersaults over the other turns to face
  // them again for free, which is why `flip_over` needs no bookkeeping.
  f.facing = centre(foe) >= centre(f) ? 1 : -1;

  if (foe.action === "dead") {
    // Victory: hold the field. One flourish, then the guard.
    if (f.move !== "flourish" && f.move !== "guard") setMove(f, "flourish");
    f.drive = 0;
  }

  const m = MOVES[f.move];
  f.mf += 1;

  if (m.impulse && f.mf === m.impulse.at) {
    f.vx += f.facing * m.impulse.vx;
    if (m.impulse.vy) f.vy = m.impulse.vy;
  }

  if (m.contact >= 0 && !f.struck && f.mf >= m.contact) {
    f.struck = true;
    resolveContact(st, f, foe, m);
  }

  // Sustained travel, by move rather than by a separate intent flag. `circle`
  // drifts on its own slow sine so the pair orbit instead of closing.
  f.drive =
    f.move === "advance"
      ? f.facing
      : f.move === "retreat"
        ? -f.facing
        : f.move === "circle"
          ? Math.sin(st.idle * 0.021 + f.phase) * 0.8
          : 0;
  if (f.drive !== 0) {
    // Advancing is a committed stride; retreating and circling are not.
    const top = f.move === "advance" ? 1.9 : 1.35;
    f.vx += f.drive * 0.5;
    f.vx = Math.max(-top, Math.min(top, f.vx));
  }

  if (f.mf >= m.frames) setMove(f, "guard");
}

/**
 * The press's two physical consequences, for the frames both blades are held
 * against each other.
 *
 * Separate from `stepFighter` because it is the one thing in the fight that is
 * a property of the *pair* rather than of either fighter — there is a single
 * contact point and a single shower coming off it, and computing them once from
 * both blades is the only way they agree.
 *
 * It reads nothing and decides nothing: `beatPower` already carries the outcome
 * the script fixed when the beat fired, and the length was rolled at the same
 * time. Nothing here can extend the lock, so the match-reset loop — which has
 * no timeout — is as safe as it was before.
 */
function stepLock(st: DuelState): void {
  const { a, b } = st;
  if (a.move !== "lock" || b.move !== "lock") return;
  const total = MOVES.lock.frames;
  const mf = Math.max(a.mf, b.mf);
  const q = Math.min(1, mf / total);

  /*
   * Close to the bind, first — because they were never in it.
   *
   * `the-lock` is a `close`-range sequence, and `close` is anything under 132
   * units. That is nowhere near close enough for two 58-unit blades held a
   * forearm out from the shoulder to touch: measured over 51 locks the blades
   * averaged **30.8 units apart**, and the worst spent the entire press 61
   * apart — half a blade of clear air between them. Nothing in the sequence
   * brought the pair together, so the shower, the contact point and the press
   * were all being computed from a crossing that did not exist.
   *
   * `LOCK_SEP` is where the two blades actually meet near their middles, so the
   * bind sits between the fighters rather than at one of their hands. The ease
   * is exponential and unconditional: it cannot fail to arrive and it cannot
   * extend the move, because the move's length was rolled when it started and
   * nothing here is allowed to consult the result.
   */
  const spread = centre(b) - centre(a);
  // Signed, so it holds the bind from both directions. Pulling only when too
  // far let the pair arrive from a parry already inside the distance and stay
  // there — blades crossed past each other at the hilts for the whole press,
  // which looks like a mistake rather than like strength.
  const err = Math.abs(spread) - LOCK_SEP;
  const step = Math.max(-1.4, Math.min(1.4, err * 0.1)) * (spread < 0 ? -1 : 1);
  a.x += step * 0.5;
  b.x -= step * 0.5;

  const near = bladeGap(bladeWorld(a), bladeWorld(b));

  /*
   * The shower: two or three every frame, thickening as the press builds, spawned
   * short so they stay small and fall away instead of accumulating into a cloud.
   * A single burst says two blades touched once; a sustained one says they are
   * still touching, which is the only thing distinguishing a press from a pose.
   */
  // A positive bias against `spawnSparks`'s own upward kick, so the shower
  // spreads and falls away from the bind instead of firing as one tall plume —
  // grinding blades throw sparks outward, and a plume reads as a flare.
  spawnSparks(st, near.x, near.y, Math.random() < 0.35 + q * 0.5 ? 3 : 2, 0, 0.55, 0.34 + Math.random() * 0.26);

  /*
   * The grind. Both fighters travel the same way — the winner forward, the loser
   * back — so the separation is unchanged and the *lock itself* walks across the
   * arena. That is the difference between two people leaning on each other and
   * one of them losing ground, and it costs one line because `DECAY` turns a
   * constant nudge into a steady creep on its own.
   */
  for (const f of [a, b]) {
    f.vx += f.facing * (f.beatPower * 2 - 1) * 0.05 * q;
  }

  // The break, on the last frame the move exists: the press fails all at once.
  if (mf >= total - 1) {
    spawnSparks(st, near.x, near.y, 22, 0, -1.4);
    st.hitStop = 2;
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
      /*
       * The anti-stall rail is **per match**, and resetting it here is what
       * makes that true. `pressure` counts sequences and nothing else cleared
       * it, so it was monotonic for the life of the page: about forty seconds
       * in it passed 22 and `chooseSequence` filtered the pool down to
       * sequences containing a `hit` for ever after. Measured over 55 simulated
       * minutes, 1,504 of 1,526 picks were made under the rail — the emergency
       * mode was the normal mode, four sequences fired twice an hour between
       * them, `standoff` never fired again after the first match, and
       * `disengage` (the only `any`-range entry, so the only one in all three
       * shrunken pools) took 30% of every exchange. The declared weights
       * described a fight nobody had seen since the opening match.
       */
      st.dir.pressure = 0;
    }
  }

  runDirector(st);

  /*
   * Hit-stop. Both move clocks hold for a frame or two on contact while the
   * sparks keep going — two frames is nothing to write down and a great deal to
   * watch. `st.idle` is deliberately outside it, so breathing, the blade
   * flicker and the spark field all carry on.
   */
  if (st.hitStop > 0) {
    st.hitStop -= 1;
    springBlade(st, st.a, st.b);
    springBlade(st, st.b, st.a);
    stepSparks(st);
    return;
  }

  /*
   * Whose turn resolves first is decided by a coin, every step.
   *
   * Stepping `a` then `b` unconditionally is a genuine, silent advantage to the
   * fighter on the left, and it decides exactly the matches that should be
   * closest. `damage()` sets `st.over` on a killing blow and `stepFighter`
   * returns immediately for a fighter whose action is `dead`, so when both are
   * due to land a lethal strike on the same frame, `a`'s lands and `b`'s never
   * happens. The client asked for "random winners always, no bias or favorites"
   * — the powers were already drawn from one distribution for both sides, but
   * this was not fair, and it biased the photo finishes.
   */
  if (Math.random() < 0.5) {
    stepFighter(st, st.a, st.b);
    stepFighter(st, st.b, st.a);
  } else {
    stepFighter(st, st.b, st.a);
    stepFighter(st, st.a, st.b);
  }
  stepLock(st);
  springBlade(st, st.a, st.b);
  springBlade(st, st.b, st.a);

  for (const f of [st.a, st.b]) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= DECAY;
    f.land = Math.max(0, f.land - 1 / 8);
    if (f.move === "held") {
      // Suspended. Eased rather than snapped, and the drop when the move ends
      // is an ordinary fall, so the landing squash comes for free.
      f.y += (FLOOR_Y - 26 - f.y) * 0.16;
      f.vy = 0;
    } else if (f.y < FLOOR_Y) {
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

  /*
   * Two fighters do not stand in the same place.
   *
   * There was no body-to-body constraint at all — only the arena walls — and
   * measured over 31 simulated minutes the two 30-unit bodies overlapped on
   * **3.9% of live frames**, closing to a minimum separation of 0.1 units: one
   * frame in twenty-six had two figures drawn inside each other. It reads as a
   * rendering fault rather than as a fight, and it is worst exactly where the
   * fight is closest and most looked at — the parry into `the-lock` opened at
   * 16 units of separation, so the press began with the pair interpenetrating.
   *
   * A soft positional resolve rather than a bounce: velocity is the
   * choreography's, and a fighter who was scripted to close should still be
   * closing on the next frame. Only the overlap is taken out, a third of it per
   * frame, so contact settles over a few frames instead of snapping.
   *
   * **Grounded pairs only**, and that exclusion is the whole reason `flip_over`
   * still works: the somersault's entire job is to pass over the opponent and
   * swap the sides, and a separation force that applied in the air would shove
   * the jumper back the way they came at the top of the arc. Anything airborne
   * is exempt, which costs nothing — an overlap is only visible when both
   * silhouettes are standing on the same line.
   */
  if (st.a.action !== "dead" && st.b.action !== "dead") {
    const grounded = st.a.y >= FLOOR_Y - 0.5 && st.b.y >= FLOOR_Y - 0.5;
    const gap = centre(st.b) - centre(st.a);
    // Narrower than BODY_W: the drawn figure is shoulders and hips, not the
    // full 30-unit box, so clearing the box would hold them apart visibly
    // further than they look, and a lock needs them shoulder to shoulder.
    const over = 26 - Math.abs(gap);
    if (grounded && over > 0) {
      const push = (over / 2) * 0.34 * (gap < 0 ? -1 : 1);
      st.a.x -= push;
      st.b.x += push;
      for (const f of [st.a, st.b]) {
        f.x = Math.max(20, Math.min(WORLD_W - 20 - BODY_W, f.x));
      }
    }
  }

  /*
   * Blade on blade (client, 2026-08-14: "the sparks when swords meet").
   *
   * Sparks used to come only off a landed *hit* — blade into body. Two blades
   * crossing produced nothing at all, which is the one contact a sword fight is
   * actually made of, and it is why the exchanges read as two figures waving
   * past each other rather than fighting.
   *
   * `bladeGap` is the real segment-to-segment distance, so this fires on the
   * frame the blades genuinely cross and at the point they cross, not on a
   * proximity guess between the two bodies. Deliberately independent of damage:
   * `dist` remains the sole authority on whether a blow lands (gating damage on
   * blade geometry would make misses routine, stop health draining, and hang
   * the match-reset loop, which has no timeout). This is presentation only.
   *
   * `clash` is a cooldown, not a flag — without it a slow cross showers sparks
   * on sixty consecutive frames and looks like a welding torch. With it, one
   * burst on contact and a smaller one if the blades stay locked.
   */
  if (st.a.action !== "dead" && st.b.action !== "dead") {
    const ga = bladeWorld(st.a);
    const gb = bladeWorld(st.b);
    const near = bladeGap(ga, gb);
    st.clash = Math.max(0, st.clash - 1);
    if (near.d < 9 && st.clash === 0) {
      // How hard they met: the sum of both blades' angular speeds. A parry that
      // catches a full swing throws far more than two blades drifting together.
      const force = Math.min(1, (Math.abs(st.a.bladeV) + Math.abs(st.b.bladeV)) * 3.4);
      spawnSparks(st, near.x, near.y, 6 + Math.round(force * 16), 0, -0.5 - force);
      st.clash = force > 0.45 ? 16 : 30;
      // A hard clash shoves both fighters apart, which is what sells it as
      // contact between two things with weight behind them.
      const dir = centre(st.a) < centre(st.b) ? 1 : -1;
      st.a.vx -= dir * force * 1.7;
      st.b.vx += dir * force * 1.7;
    }
  }

  /*
   * A soft leash, so the pair cannot drift to opposite ends of a 700-unit
   * arena and stay there. Pushes, knockdowns and backsteps all separate, and
   * nothing but a slow advance closes, so without this the fight settles into
   * the long-range half of the pool and the swordplay never happens — measured
   * at 54% of all frames beyond sword reach.
   *
   * **Both fighters move, and they move toward the midpoint of their own two
   * centres — never toward a fixed world x.** Closing on `WORLD_W / 2` would
   * pull whichever fighter happened to be further from the middle harder,
   * which feeds the two sides different sequence pools and is the subtlest way
   * a bias could get in here.
   */
  const sep = Math.abs(centre(st.b) - centre(st.a));
  if (sep > 290) {
    const dir = centre(st.a) < centre(st.b) ? 1 : -1;
    st.a.vx += dir * 0.12;
    st.b.vx -= dir * 0.12;
  }

  // Two grounded fighters must not stand inside each other; a gentle mutual
  // push reads as bodies, a hard clamp reads as a wall.
  const gap = centre(st.b) - centre(st.a);
  if (Math.abs(gap) < BODY_W && st.a.y >= FLOOR_Y && st.b.y >= FLOOR_Y) {
    const push = gap >= 0 ? 0.8 : -0.8;
    st.a.x -= push;
    st.b.x += push;
  }

  stepSparks(st);
}

function stepSparks(st: DuelState): void {
  const alive: Spark[] = [];
  for (const sp of st.sparks) {
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += 0.25;
    sp.life -= 1 / 24;
    if (sp.life > 0) alive.push(sp);
  }
  st.sparks = alive;
  // Raised from 120: the blade lock alone holds a large share alive and would
  // otherwise starve every other emitter on screen.
  if (st.sparks.length > 200) st.sparks.splice(0, st.sparks.length - 200);
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
  /**
   * Fades the bars independently of `dim`, 0–1, defaulting to 1.
   *
   * `bars` is a boolean and so can only pop. The background effect's attract
   * mode (`duelling` in effects.ts) brings the bars in as the screensaver takes
   * the screen, and needs them to arrive over the same 1.6s as everything else
   * rather than on one frame. The ornament omits it and gets full strength.
   */
  barAlpha?: number;
  /** Multiplies body/ground alphas: 1 in the ornament, lower as a background. */
  dim: number;
}

/**
 * The angle the current move asks for at this frame, from its keyframe table.
 *
 * This replaces a switch of hand-written easing per action. It is a *target*,
 * not the blade's position — `springBlade` is what the blade actually does, so
 * even a keyframe that steps still arrives with weight behind it.
 */
function bladeTarget(f: Fighter, foe: Fighter, idle: number): number {
  const bob = Math.sin(idle * 0.05 + f.phase) * 0.06;
  // The winner's salute. Reading the *foe*, so both the victory pose and the
  // loser's collapse are settled in one place.
  if (foe.action === "dead") return -1.3 + bob;
  const m = MOVES[f.move];
  const a = bladeCurve(m, f.mf);
  /*
   * The press.
   *
   * Two blades held against each other for 92 frames, and the failure mode is
   * that it reads as a freeze rather than as a strain — which is exactly what
   * it did: a single 0.045 sine through a soft spring came out as about a
   * degree of wobble, so the most iconic image in the genre was two figures
   * standing near each other holding sticks.
   *
   * Three things carry it now, and they are all the *same* fact seen three
   * ways: one of them is winning.
   *
   * `beatPower` is the script's verdict, set at the beat and never revisited
   * (see `the-lock`). Positive angles are down-and-forward, so the winner's
   * blade travels *down through* the crossing while the loser's is levered up.
   * That rotates the whole X, and rotating the X walks the contact point
   * toward the loser — which is the tell, visible a second before the break.
   * It is squared so the lean starts as a suggestion and ends as a rout.
   */
  if (f.move === "lock") {
    const q = Math.min(1, f.mf / m.frames);
    /** +1 drives the press, −1 gives ground. */
    const drive = f.beatPower * 2 - 1;
    const press = drive * 0.34 * q * q;
    /*
     * Two incommensurate frequencies, because a single sine is a wobble on a
     * fixed cadence and a strained blade judders. The one losing shakes
     * harder — a blade holding weight it cannot hold is the other half of the
     * same read.
     */
    const strain = (0.055 + 0.05 * q) * (1 - drive * 0.35);
    return (
      a +
      press +
      Math.sin(idle * 0.72 + f.phase) * strain +
      Math.sin(idle * 1.63 + f.phase * 2.1) * strain * 0.55
    );
  }
  // Only the resting moves breathe; a strike must not have a wobble added to it.
  return m.contact < 0 && m.chan === "neutral" ? a + bob : a;
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
  // A parry is stiffer than a strike: it has perhaps five frames to arrive, and
  // a block that drifts into place is not a reaction to anything.
  const parrying = f.move === "parry_high" || f.move === "parry_cross" || f.move === "parry_low";
  /*
   * The lock is stiff for a different reason than the parry: it has to *pass a
   * tremble through*. The neutral spring is a low-pass, and at the judder's
   * frequency it attenuated the strain to roughly a degree — the blade tracked
   * the press's slow lean perfectly and dropped the shake that made it read as
   * effort. Stiff and lightly damped keeps both.
   */
  const locking = f.move === "lock";
  const k = locking ? 0.55 : parrying ? 0.85 : f.action === "attacking" ? 0.6 : 0.24;
  const d = locking ? 0.5 : parrying ? 0.42 : f.action === "attacking" ? 0.5 : 0.7;
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

  /*
   * The body is a stick figure, and that is the client's own call (2026-08-14):
   * "if it makes it easier, make the character models more simple, but make the
   * fights better", then "im fine with stick figures as long as the fights are
   * decent". All the investment goes into the fighting.
   *
   * What was here before was worse than a stick figure, not better. A 30px
   * filled torso quad, a filled head block, and a filled robe or cape or tunic
   * behind it composited into one pale slab about as wide as the figure was
   * tall — which the client read, correctly, as "they are holding shields". And
   * only one arm ever reached the hilt, so it was also, correctly, "a
   * one-handed sword fight".
   *
   * Both hands are on the grip now unless an arm is doing something else. That
   * single change is most of what makes a silhouette read as a swordsman rather
   * than as a figure carrying a stick, and it is what the films look like.
   */
  const forceP = f.action === "force" ? Math.min(1, f.mf / MOVES[f.move].frames) : 0;
  const flick =
    1 + (Math.sin(st.idle * 0.8 + f.phase) + Math.sin(st.idle * 1.37 + f.phase * 2)) * 0.008;
  const g = bladeLocal(f, flick);

  const hipY = TORSO_H;
  const shY = SHOULDER_Y + breath;
  const neckX = lean * 0.9;

  // ---- legs, behind everything -------------------------------------------
  const kickP = f.action === "kicking" ? Math.min(1, f.mf / MOVES[f.move].frames) : 0;
  const kickReach = Math.sin(Math.PI * Math.min(1, kickP * 1.4)) * 34;
  const brace = f.action === "attacking" ? 5 : 0;
  ctx.globalAlpha = bodyAlpha;
  ctx.strokeStyle = v.ink;
  for (let i = 0; i < 2; i += 1) {
    const front = i === 0;
    const hipX = front ? HIP_X : -HIP_X;
    let footX = front ? 4 + brace : -4 - brace;
    let footY = BODY_H;
    if (airborne) {
      footX = front ? 8 : -10;
      footY = BODY_H - 15;
    } else if (f.action === "kicking" && front) {
      footX = 8 + kickReach;
      footY = BODY_H - 14 - kickReach * 0.5;
    } else {
      const ph = f.stride + (front ? 0 : Math.PI);
      footX += Math.sin(ph) * 13 * speed;
      footY -= Math.max(0, Math.cos(ph)) * 9 * speed;
    }
    limb(hipX, hipY, footX, footY, THIGH, SHIN, -1, front ? 5 : 4);
  }

  // ---- spine and head -----------------------------------------------------
  ctx.globalAlpha = bodyAlpha;
  ctx.strokeStyle = v.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(neckX, shY - 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-SHOULDER_X + lean, shY);
  ctx.lineTo(SHOULDER_X + lean, shY);
  ctx.stroke();

  ctx.fillStyle = v.ink;
  ctx.beginPath();
  ctx.arc(neckX, headY + 6, 8, 0, TAU);
  ctx.fill();

  // ---- the off hand -------------------------------------------------------
  // On the grip, a little below the sword hand, unless the arm is pushing.
  let offHandX = g.hx - Math.cos(f.bladeA) * 8;
  let offHandY = g.hy - Math.sin(f.bladeA) * 8;
  if (f.action === "force") {
    offHandX = -4 + 30 * Math.min(1, forceP * 2.5);
    offHandY = 21;
  } else if (f.action === "kicking") {
    // Thrown out for balance, which is what a kick actually needs.
    offHandX = -22;
    offHandY = 12;
  }
  ctx.globalAlpha = bodyAlpha * 0.85;
  ctx.strokeStyle = v.ink;
  limb(-SHOULDER_X + lean, shY, offHandX, offHandY, UPPER_ARM, FOREARM, 1, 4.5);

  // ---- the sword arm ------------------------------------------------------
  if (!dead) {
    ctx.globalAlpha = bodyAlpha;
    limb(SHOULDER_X + lean, shY, g.hx, g.hy, UPPER_ARM, FOREARM, -1, 5);
  }

  /*
   * The whole costume is four marks — one per style, drawn on the head.
   *
   * Everything else that used to distinguish them (capes, auras, wings, tunics,
   * chest panels, tails, belts) was filled geometry hung off the torso, and
   * filled geometry is exactly what made the pair read as armoured shield-
   * carriers. At the size these actually render, the head is the only place a
   * silhouette difference survives anyway.
   */
  ctx.save();
  ctx.translate(neckX, 0);
  ctx.strokeStyle = v.ink;
  ctx.globalAlpha = bodyAlpha;
  ctx.lineWidth = 3;
  if (f.style === "hooded") {
    // A hood: a peak over the skull.
    ctx.beginPath();
    ctx.moveTo(-10, headY + 12);
    ctx.lineTo(1, headY - 9);
    ctx.lineTo(10, headY + 10);
    ctx.stroke();
  } else if (f.style === "horned") {
    ctx.beginPath();
    ctx.moveTo(-6, headY + 1);
    ctx.quadraticCurveTo(-13, headY - 7, -8, headY - 13);
    ctx.moveTo(6, headY + 1);
    ctx.quadraticCurveTo(13, headY - 7, 8, headY - 13);
    ctx.stroke();
  } else if (f.style === "haloed") {
    const halo = headY - 6 + Math.sin(st.idle * 0.04 + f.phase) * 1.6;
    ctx.strokeStyle = blade;
    ctx.globalAlpha = 0.9 * v.dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, halo, 12, 4, 0, 0, TAU);
    ctx.stroke();
  } else {
    // Caped: a helmet brow, one stroke.
    ctx.beginPath();
    ctx.arc(0, headY + 6, 9, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  ctx.restore();

  // Hit feedback: the figure flares in the spark colour.
  if (f.flash > 0) {
    ctx.globalAlpha = f.flash * 0.55 * v.dim;
    ctx.strokeStyle = v.spark;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(neckX, shY - 2);
    ctx.stroke();
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
    const barFade = v.barAlpha ?? 1;
    ctx.globalAlpha = 0.3 * v.dim * barFade;
    ctx.fillStyle = v.ink;
    ctx.fillRect(cx - 17, f.y - 34, 34, 4);
    ctx.globalAlpha = 0.9 * v.dim * barFade;
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

  /*
   * The press's contact point, drawn over both blades because it is the one
   * place they are genuinely touching rather than merely crossing. Without it
   * the shower appears to come from a spot with nothing at it. Two flat discs
   * in `core` — the palette's brightest — rather than a gradient: this is drawn
   * every frame of the lock, and a radial gradient allocated per frame is the
   * kind of thing that turns up later as a mystery cost on a slow machine.
   */
  if (st.a.move === "lock" && st.b.move === "lock") {
    const near = bladeGap(bladeWorld(st.a), bladeWorld(st.b));
    const q = Math.min(1, Math.max(st.a.mf, st.b.mf) / MOVES.lock.frames);
    const r = 3 + q * 2.4;
    ctx.fillStyle = v.core;
    ctx.globalAlpha = (0.14 + q * 0.12) * v.dim;
    ctx.beginPath();
    ctx.arc(near.x, near.y, r * 2.6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = (0.5 + q * 0.35) * v.dim;
    ctx.beginPath();
    ctx.arc(near.x, near.y, r, 0, TAU);
    ctx.fill();
  }

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
