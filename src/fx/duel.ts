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

/*
 * Who the fighters are lives in `src/fx/fighters.ts` — the roster, the costume
 * hooks and the pools. Re-exported here because every existing caller imports
 * these two names from this module, and because `BLADE_COLORS` is the site's
 * one literal-colour carve-out: it should stay findable from the file that
 * draws the blades.
 */
import { FIGHTERS, rollPairing } from "./fighters";
import type { CostumeCtx, DuelPool, FighterStyle } from "./fighters";

export type { FighterStyle, CostumeCtx, DuelPool } from "./fighters";
export { BLADE_COLORS, FIGHTERS, DUEL_POOLS, rollPairing } from "./fighters";

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
/**
 * Exported because the somersault's tumble is timed from it: a projectile is in
 * the air for `2·vy/g` frames, so the rotation window is derived rather than
 * typed, and `scripts/check.ts` re-derives it to prove the figure is upright on
 * the frame its feet arrive.
 */
export const GRAVITY = 0.6;
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
/*
 * The off arm gets its own, longer bones, and the reason is geometry rather
 * than anatomy (2026-08-16).
 *
 * It reaches from the *far* shoulder at local x −11 across the chest to a grip
 * that orbits +11 ± 20, so it has to span 30–42 units against the 24 the two
 * shared bones give it. `joint()` clamps the cosine and straightens the limb
 * correctly, but `limb()` then draws to the target anyway, so the arm
 * rubber-banded: measured, it was over-extended on **98.6% of figure-frames**
 * and drawn as a single straight line across the chest that never bent at the
 * elbow. With the spine and the shoulder bar that closes a triangle over the
 * torso — which is uncomfortably close to the filled slab the client read as
 * "they are holding shields" in the first place.
 *
 * The endpoints do not move. The arm simply gains an elbow.
 */
const OFF_UPPER_ARM = 20;
const OFF_FOREARM = 20;
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
  /**
   * Frames until a blocked attacker bounces into `recoil`, or 0 for none.
   * Deferred rather than immediate — see the `blocked` branch of
   * `resolveContact`.
   */
  bounce: number;
  /**
   * How far a thrown blade flies before it turns round, in world units, fixed
   * on the frame it leaves the hand.
   *
   * The same idea as `Move.span`, and there for the same reason: a fixed
   * distance cannot cross a variable gap. A throw that always flew 170 units
   * would sail past a close opponent and fall short of a distant one — and
   * unlike a leap there is no body following it, so the error would not even
   * read as effort.
   */
  throwReach: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface DuelState {
  /**
   * Where the next match's fighters come from, or null to keep this one's.
   * See `createDuelFrom`.
   */
  pool: DuelPool | null;
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
    /**
     * Modules still owed to the current phrase before the role coin is thrown
     * again. Rolled with the coin, so it consults nothing either.
     */
    chain: number;
    /** Modules elapsed this match; drives the anti-stall rail. */
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
    bounce: 0,
    throwReach: 0,
  };
}

/**
 * A fight between two named costumes. The pool is null, so the same two
 * fighters come back for every match — which is what a bench wants, and what
 * anything pinning a pairing deliberately wants.
 */
export function createDuel(left: FighterStyle, right: FighterStyle): DuelState {
  return {
    pool: null,
    a: makeFighter(START_A, 1, left),
    b: makeFighter(START_B, -1, right),
    sparks: [],
    clash: 0,
    hitStop: 0,
    dir: { seq: null, f: 0, next: 0, att: "a", chain: 0, pressure: 0 },
    matches: 0,
    over: 0,
    acc: 0,
    prev: 0,
    idle: 0,
  };
}

/**
 * A fight drawn from a pool — the form both of the site's duels use.
 *
 * The pairing is rolled here **and again on every match reset**, so a visitor
 * who watches for a couple of minutes sees different fighters walk on rather
 * than the same two rounds forever. That is the character-level half of the
 * client's *"completely random, not a set amount of looping duels"*: phase 1
 * stopped the exchanges repeating, and two fighters who never change are still
 * a loop at the scale anybody actually watches at.
 *
 * The reset is a **cut** — `DuelOrnament` nulls its camera on `matches`
 * changing — so new fighters appearing there is a scene change, not a swap
 * mid-frame.
 */
export function createDuelFrom(pool: DuelPool, rng: () => number = Math.random): DuelState {
  const [left, right] = rollPairing(pool, rng);
  const st = createDuel(left, right);
  st.pool = pool;
  return st;
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

/** The frames of `blade_throw` the blade spends out of its owner's hand. */
const THROW_OUT = 10;
const THROW_BACK = 50;
/** Revolutions the blade turns over the flight. */
const THROW_SPIN = 3;

/**
 * Where a thrown blade is, in world units, or null if this fighter is holding
 * theirs — which is every fighter on all but a few hundred frames in ten
 * thousand.
 *
 * The flight is a sine out and back, so the blade decelerates into the turn and
 * accelerates home without a single frame of it being scripted.
 *
 * **The sine reaching exactly zero at both ends is load-bearing, not tidiness.**
 * `bladeWorld` switches between the held blade and this one on the frames the
 * flight opens and closes, and the smear is built from the last six *world*
 * positions — so a flight that began or ended anywhere but at the hand would
 * drag a smear quad clean across the arena for six frames on the hand-off. A
 * linear out-and-back would do it at both ends. Keep the envelope zero-valued at
 * `q = 0` and `q = 1`.
 *
 * It is also **centred on the blade's middle rather than swung from a grip**: a
 * thrown sword turns about its own balance point, and pivoting it about an end
 * is the difference between a thrown blade and a blade being waved by an
 * invisible arm.
 *
 * `f.throwReach` was fixed to the real gap when it left, so the turn happens at
 * the opponent rather than at a constant the author guessed.
 */
function thrownBlade(f: Fighter): { hx: number; hy: number; tx: number; ty: number } | null {
  if (f.move !== "blade_throw" || f.action === "dead") return null;
  if (f.mf < THROW_OUT || f.mf > THROW_BACK) return null;
  const q = (f.mf - THROW_OUT) / (THROW_BACK - THROW_OUT);
  const reach = Math.sin(q * Math.PI) * f.throwReach;
  const spin = q * TAU * THROW_SPIN;
  // Chest height, rising a little at the far end of the flight so the arc has
  // somewhere to be other than a straight horizontal line.
  const cx = centre(f) + f.facing * (26 + reach);
  const cy = f.y + 22 - Math.sin(q * Math.PI) * 9;
  /*
   * **Mirrored by `facing`, like every other piece of geometry here.** The
   * flight offset above is mirrored and this was not, which had two costs: a
   * left-facing thrower's sword tumbled the opposite way relative to its own
   * travel — against the `scale(facing, 1)` the whole renderer is built on — and
   * `tx`/`ty` came back as the *trailing* end, so the smear's `TRAIL_INNER` cut
   * kept the wrong half of the blade for one of the two fighters.
   */
  const dx = f.facing * Math.cos(spin) * (BLADE_LEN / 2);
  const dy = Math.sin(spin) * (BLADE_LEN / 2);
  return { hx: cx - dx, hy: cy - dy, tx: cx + dx, ty: cy + dy };
}

/**
 * The same geometry in world units, for the trail and for spark origins — or
 * the thrown blade's, while it is in the air.
 *
 * Routing the throw through here rather than special-casing it at each site is
 * what makes the move cost so little: the smear samples this, the blade-on-blade
 * clash test measures this, and `resolveContact` places its burst at this. A
 * thrown blade therefore trails, throws sparks off the opponent's guard and
 * lands its blow with no code that knows a throw exists.
 */
function bladeWorld(f: Fighter): { hx: number; hy: number; tx: number; ty: number } {
  const thrown = thrownBlade(f);
  if (thrown) return thrown;
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
): { d: number; x: number; y: number; ax: number; ay: number; bx: number; by: number } {
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
  /*
   * The two closest points come back as well as their midpoint. The midpoint is
   * right when the blades genuinely cross — it is then within a couple of units
   * of both — and wrong when they do not, because it lands in the gap and so
   * touches neither sword. A caller that needs the burst to be *on* a blade
   * takes `ax/ay` or `bx/by` instead; see the `blocked` branch of
   * `resolveContact`.
   */
  return {
    d: Math.hypot(px - qx, py - qy),
    x: (px + qx) / 2,
    y: (py + qy) / 2,
    ax: px,
    ay: py,
    bx: qx,
    by: qy,
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
  | "strike_level"
  | "blade_throw"
  | "duck"
  | "overrun"
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
  /**
   * Size the horizontal impulse to the gap that actually exists when it fires,
   * so the move travels `gap + span` instead of a fixed distance. Negative to
   * deliberately stop short — a strike wants to arrive in reach, not on top of
   * its target.
   *
   * **A fixed impulse cannot cross a variable gap, and both moves that need to
   * cross one had a fixed impulse** (2026-08-16). `DECAY` is 0.9, so a move
   * travels ten times its `vx` and no further: `flip_over` at 10.5 covers 105
   * units and was launched from a median of 158, so the somersault — "the most
   * recognisable move in the genre" — cleared the opponent on **29%** of
   * attempts and otherwise tumbled impressively and landed back where it
   * started. `leap_strike` at 4.2 covers 42 and was being asked to cross 245:
   * **100% of its hits landed short, by a median of 188 units.**
   *
   * Clamped either side of the authored value so this stays a correction rather
   * than a new physics: a move can be asked for three times its impulse, never
   * more, and never less than half.
   */
  span?: number;
  /**
   * What a landed blow does to the *victim*, along the attacker's facing.
   * Defaults to 5.2 for a force move and 1.8 for a blade.
   *
   * **It exists because it has to be signed** (2026-08-16). The knock was
   * hardcoded as `facing * (chan === "force" ? 5.2 : 1.8)`, and `facing` points
   * at the opponent, so every force move threw its victim *away* — including
   * `force_pull`, whose entire job is to drag them in. Measured over 74
   * landings it imparted 4.7 units a frame outward and the separation 30 frames
   * later was unchanged: the pull never closed anything, and
   * `pull-and-punish` — a whole sequence built on that setup — delivered "the
   * biggest thrust in the pool" at a median of 280 units, four body-widths
   * short.
   */
  knock?: number;
  /**
   * The frame the anticipation ends and the blade starts travelling — the entry
   * point a `quick` beat starts the move on.
   *
   * A riposte is the same strike with its wind-up removed, not a different
   * strike: the blade is already up, because it has just parried, and
   * travelling back to a high guard before answering is exactly what makes a
   * counter read as slow. Only the moves a sequence actually ripostes with need
   * one.
   *
   * **It is a beat's property, never a runtime test.** "Enter quick if a parry
   * ended within eight frames" is a condition, and a condition here would move
   * the contact frame — so the reaction beats authored against it would be right
   * on some runs and early on others, which is the one thing the director
   * refuses to do. The sequence author places the beat inside a parry and marks
   * it `quick`; the timing is then as fixed as every other beat's.
   */
  windup?: number;
  /**
   * This move passes *through* the opponent, so two things stand down for its
   * duration: the body separation, and squaring up to face them.
   *
   * The facing half was a shipped defect rather than a new requirement.
   * `stepFighter` re-derives `facing` from the two centres every frame, and a
   * fighter somersaulting over its opponent crosses that line in mid-air — so
   * the entire figure mirrored on a single frame near the top of the arc, on
   * **172 somersaults out of the ~169 flown in 300,000 frames**, i.e. every one
   * of them. It went unnoticed only because the figure had no rotation to
   * contradict: a symmetrical stick figure mirrored about its own centre looks
   * much like itself. Adding the tumble turned it into a visible flicker.
   * Frozen, the turn happens where a turn belongs — on the landing frame, when
   * the move ends and the next frame squares up again.
   */
  pass?: boolean;
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
    // 21 fired a frame before the blade reached 0.95 at 21.6. See `spin_attack`.
    contact: 22,
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
    // The blade arrives at 18.6; firing at 18 threw away 31 units of reach.
    contact: 19,
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
    /*
     * **Deliberately no `windup`, and that is a finding rather than an
     * omission.** This move loads by dropping the blade *down* to +1.2 and then
     * sweeps up through it, so entering at the end of that load hands the spring
     * a target 1.3 rad below a level parry: measured over 800,000 frames, all
     * **207 of 207** quick ripostes tried here dipped before they rose, median
     * peak dip 0.31 rad. That is a wind-up — a downward one — on the one move
     * whose whole purpose is not to have one. A riposte wants a strike whose
     * load sits near the parry's own angle; see `thrust`.
     */
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
    /*
     * 0.36 × 28: the point the arm stops loading and starts extending — and the
     * reason this is the pool's riposte rather than the rising cut.
     *
     * A thrust loads at −0.35 and `parry_high` holds at −0.1, so entering here
     * moves the blade about a fifth of a radian *up* and then straight out. The
     * counter leaves from where the parry left it, which is what "the wind-up
     * already happened, it was the parry" is supposed to mean. Its impulse at
     * mf 12 also lands two frames into a quick entry, so the riposte carries a
     * small lunge — free, and exactly right.
     */
    windup: 10,
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
    // The blade arrives at 36 (0.75 × 48). See `spin_attack`.
    contact: 36,
    power: 1.3,
    chan: "attacking",
    impulse: { at: 8, vx: 4.2, vy: -11.5 },
    // Land in reach rather than on top of them: the blade covers ~90 from the
    // grip, so aim the leap to finish just inside that.
    span: -80,
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
    /*
     * **Contact is the frame the blade *arrives*, not the frame the move is
     * halfway through** (2026-08-16). This was 23, which is inside the `hold`
     * plateau: the blade is parked overhead from frame 10 to 28 and does not
     * come down until 32. So the damage, the spark burst and the knockdown all
     * fired with the tip 19 units forward of the grip, the victim reacted, and
     * the sword swept through empty air nine frames later. Of the six attacks
     * four were early against their own keyframe tables — this one by nine
     * frames, the rest by one or two.
     */
    contact: 32,
    power: 1.25,
    chan: "attacking",
  },
  /*
   * The one strike that travels *across* rather than down, and the only one a
   * duck can answer.
   *
   * Every other attack in the table is an arc that finishes in the floor, and
   * you cannot duck under a descending blade — crouching puts your head where
   * it is going. So `duck` needed something to duck under before it was worth
   * building. The blade snaps up, then comes down to within a few degrees of
   * level and **holds there** for seven frames while the body carries it
   * forward, which is the window the crouch has to be inside.
   *
   * The hold is what makes it readable at 60px: a blade that passes through
   * level on its way somewhere else is one frame of horizontal, and one frame
   * is not an image.
   */
  strike_level: {
    frames: 34,
    blade: [
      [0, GUARD_MID, "out"],
      [0.26, -1.9, "out"],
      [0.38, -1.9, "hold"],
      [0.5, -0.12, "in"],
      [0.72, -0.12, "hold"],
      [1, GUARD_MID, "out"],
    ],
    // 0.5 × 34: the frame the blade arrives level, not a frame inside the
    // travel. See `spin_attack` for what firing early costs.
    contact: 17,
    power: 1.1,
    chan: "attacking",
    impulse: { at: 15, vx: 2 },
  },
  /*
   * The blade leaves the hand.
   *
   * The silhouette losing its brightest element is the largest single read
   * available here and nothing else in the set does it — every other move
   * rearranges the same parts. The flight is deliberately a long out-and-back
   * rather than a straight line: a blade that goes and returns is one object the
   * eye tracks for a second, where a blade that vanishes and reappears is two
   * events.
   *
   * The geometry is in `thrownBlade`, and the reason it is routed through
   * `bladeWorld` rather than drawn as a special case is that everything else in
   * the fight then follows it for free — the smear, the blade-on-blade sparks,
   * and the point `resolveContact` places the burst at all read the same
   * segment they always did.
   */
  blade_throw: {
    frames: 64,
    blade: [
      [0, GUARD_MID, "out"],
      [0.1, -1.5, "out"],
      [0.17, -1.5, "hold"],
      [0.8, -0.3, "out"],
      [1, GUARD_MID, "out"],
    ],
    // Mid-flight, where `thrownBlade` puts it at full reach — which is where the
    // opponent is, because the reach is sized to the gap when it leaves.
    contact: 30,
    power: 1.15,
    chan: "attacking",
  },
  /*
   * Under the sweep. A crouch is a whole-body change with no new parts drawn,
   * which is the only kind of pose that survives at this size.
   */
  duck: {
    frames: 26,
    blade: [[0, GUARD_LOW, "out"], [0.25, 0.6, "out"], [0.62, 0.6, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
  },
  /*
   * The charge that swaps the sides.
   *
   * Both fighters run it on the same beat and both are moving, which is why the
   * span is *negative*: `span` is added to the whole gap, and each fighter only
   * has to cover about half of it before they meet. At the leash distance each
   * travels ~110 units and the pair end ~70 apart with the sides exchanged —
   * inside sword range, facing each other, which is the position the next
   * sequence wants.
   *
   * The blade sweeps through level *during* the pass rather than being held
   * there, and that is load-bearing rather than decorative: the blade-on-blade
   * shower tests the sum of both blades' angular speeds against a floor, so two
   * blades held still would cross in silence.
   *
   * **The sweep is timed against the measured crossing, and the first attempt
   * was authored against the wrong event.** Sweeping from 0.34 to 0.62 of the
   * move — frames 16 to 29 — reads as "through the middle" and produced sparks
   * on **3 frames in 65 runs**. Two things were wrong with it. The bodies pass
   * at mf 14–18 (separation falls 140 → 3 → back out), so a sweep starting at
   * 16 has barely begun; and the blades cross far earlier than the bodies do,
   * because a guard puts the tip 77 units forward and the pair start the charge
   * ~140 apart — they are already overlapping on frame one. The one burst that
   * did fire went off at mf 2 with almost no angular speed behind it and set the
   * 30-frame cooldown, which then swallowed the real crossing.
   *
   * **There is no moment of crossing to aim at, and that is the real finding.**
   * Sweeping 8 → 22 instead was still wrong: measured, the blades are *already*
   * overlapped on frame one of the charge — a guard puts the tip 77 units
   * forward and the leash holds the pair at ~142, so the two swords share 12
   * units of space before either fighter has moved. They never meet; they are
   * never apart. The bodies do have a crossing, at mf 14–18, but by then the
   * blades are long past each other.
   *
   * So the sweep starts on frame **one**, where the contact actually is. That
   * takes the shower from 3 spark frames in 65 runs to 62 in 68 — about one
   * burst per charge, thrown as the two blades drag across each other at the
   * start of the run.
   *
   * **The body crossing is silent, and it should be.** An earlier draft of this
   * comment predicted a second burst there, on the reasoning that a hard first
   * burst takes the 16-frame cooldown rather than the 30-frame one and would
   * come off it right at mf 17. It does not reproduce: measured, every burst
   * lands in mf 1–10 and none at the pass. The reason is the same geometry as
   * above — by the time the *bodies* are 4 units apart the *blades* are a long
   * way past each other, so there is nothing there to strike sparks off. Making
   * one happen anyway would be re-introducing the "proximity is not contact"
   * bug that the force floor exists to kill.
   */
  overrun: {
    frames: 46,
    blade: [
      [0, -0.6, "out"],
      [0.3, 0.6, "inout"],
      [1, GUARD_MID, "out"],
    ],
    contact: -1,
    power: 0,
    chan: "attacking",
    impulse: { at: 6, vx: 6.5 },
    span: -40,
    pass: true,
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
    // `at: 1`, not 0 — see `knockdown` below. The three reaction moves are the
    // only ones that ever asked for frame 0, and none of them were getting it.
    impulse: { at: 1, vx: -1.6 },
  },
  // A hit that produces no reaction did not happen. The blade goes off-guard,
  // which is the visual definition of vulnerability.
  stagger: {
    frames: 32,
    blade: [[0, -0.1, "out"], [0.35, 0.25, "out"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    impulse: { at: 1, vx: -2.5 },
  },
  knockdown: {
    frames: 56,
    blade: [[0, 0.4, "out"], [0.4, 1.1, "hold"], [1, GUARD_MID, "out"]],
    contact: -1,
    power: 0,
    chan: "neutral",
    /*
     * **`at: 1` is the first frame a move can have, not 0, and asking for 0
     * silently did nothing** (2026-08-16, client: the fight "seems a little
     * off"). `setMove` starts `mf` at 0 and `stepFighter` increments it
     * *before* testing the impulse, so the earliest value the test ever sees is
     * 1. All three reaction moves — recoil, stagger and this — asked for 0, so
     * for their whole existence not one of them received the velocity it
     * declares.
     *
     * Measured over 240,000 frames: **13,591 frames of `knockdown`, of which
     * 0.0% were airborne.** Nobody has ever been knocked down. `the-long-wind`
     * spends 1.7 seconds winding up the heaviest blow in the pool and the
     * victim stood exactly where they were and drooped their blade. Whatever
     * movement recoil and stagger did show was the flat 1.8 that
     * `resolveContact` adds, not their own -1.6 and -2.5.
     *
     * That is most of why the fight had no weight, and it is why the numbers on
     * the other moves look conservative — they were tuned against a fight in
     * which nothing was ever knocked back.
     */
    impulse: { at: 1, vx: -4.2, vy: -6 },
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
    // Past them, not onto them — the somersault's whole job is to swap sides.
    span: 40,
    // And passing through them means not turning round halfway. See `pass`.
    pass: true,
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
    // Negative: toward the puller. This is the move the signed `knock` exists
    // for — see the field's note.
    knock: -4.6,
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
    // Positive, i.e. *toward* the opponent — the one reaction in the table that
    // travels forward, because being dragged off balance is its whole job. It
    // carried no impulse at all, so the reaction to a pull was a fighter
    // standing still looking startled.
    impulse: { at: 1, vx: 3.4 },
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

export type Role = "ATT" | "DEF";

export interface Beat {
  who: Role;
  move: MoveId;
  /** Frames from the start of the sequence. */
  at: number;
  outcome?: "hit" | "miss" | "blocked";
  power?: number;
  /**
   * Enter the move at its `windup` frame instead of at zero — a riposte, with
   * the anticipation cut off.
   *
   * The beat's own `at` is unchanged, so **the contact frame moves earlier by
   * exactly `windup`** and the sequence's reaction beat has to be placed against
   * the shortened time. That is deliberate: the alternative is deciding it at
   * runtime, which would make one beat's timing depend on the previous beat's,
   * and nothing else in this pool does.
   */
  quick?: boolean;
}

/**
 * One built module: the concrete thing the director runs.
 *
 * `weight` and `range` used to live here, because a sequence *was* a pool entry.
 * They belong to the `Module` that builds this now — by the time the director
 * holds one of these the choosing is over, and the only things left that matter
 * are what happens and for how long.
 */
export interface Sequence {
  /** The module that built it. `scripts/check.ts` counts these for reachability. */
  id: string;
  /**
   * Total frames including the trailing rest. **Fixed the moment it is built,
   * never conditional** — the match-reset loop has no timeout, so a length that
   * could wait on something would hang the effect.
   */
  length: number;
  /** Ascending by `at`; `runDirector` stops at the first beat not yet due. */
  beats: Beat[];
}

/*
 * The pool, and why it is a pool of *builders* rather than a pool of tables.
 *
 * Every entry here used to be a fixed array of beats. Twenty-eight of them, and
 * the director picked one whole. That is what the client asked to change:
 * *"completely random, not a set amount of looping duels."*
 *
 * A module is `(roll) => { beats, length }`. It rolls its own strikes, its own
 * counts and its own timing, and — this is the part that matters — it derives
 * every reaction frame from the move table rather than from a typed number. So
 * swapping a diagonal cut for an overhead moves the block, the counter, the
 * stagger and the trailing rest with it, and cannot desynchronise them.
 *
 * **Rolling the pool is not enough on its own.** The reference engine the client
 * had built rolls its module order and never repeats a fight — and its
 * most-picked module runs `STRIKES[i % STRIKES.length]` from `i = 0`, so every
 * flurry it has ever drawn was down, across, up, thrust, in that order. Measured
 * over 20,000 of its fights the vocabulary came to 96 beat atoms and 48.4% of
 * module picks repeated inside a single fight. Phrase-level repetition is
 * audible even when no two fights are identical, which is why the rolls here are
 * *inside* the modules and not only over them. `docs/DUEL-ABSORB.md` has the
 * numbers.
 *
 * What has not changed, and must not:
 *
 * - **Beats name roles, never sides.** The role coin consults nothing — not
 *   health, not position, not who won the last exchange. An early lucky roll
 *   cannot compound, because nothing carries forward.
 * - **Nothing waits on a condition.** A module's `length` is fixed the moment it
 *   is built and the director advances unconditionally. Every loop in here is
 *   counted; there is no `do…while` on a roll and no beat that blocks. The
 *   match-reset loop has no timeout, so a module that could hang would hang the
 *   effect.
 * - **The mix.** Roughly a fifth of the weight deals no damage at all
 *   (`probe`, `standoff`, `close-in`, `step-in`, `the-overrun`), and that is
 *   deliberate: without silence the strikes have nothing to be loud against. It
 *   is also kept under a third, because zero-damage modules are the one thing
 *   that can stretch a match indefinitely.
 */

/** Centre-to-centre bands the module pool is filtered by. */
const CLOSE = 132;
const MID = 245;
/**
 * Where the soft leash starts pulling the pair back together.
 *
 * An empirical optimum, and both directions off it are worse — measured as the
 * distance from the attacking blade to the victim's body on the frame damage is
 * dealt, over 90,000 frames per setting:
 *
 * | leash at | close-band time | blade-to-body median | blade actually touching |
 * |---|---|---|---|
 * | 245 (`MID`) | 35% | 42.8 | 28% |
 * | 170 | 50% | 12.5 | 40% |
 * | **150** | **55%** | **11.1** | **45%** |
 * | 132 (`CLOSE`) | 65% | 26.4 | 16% |
 *
 * Leashing at `CLOSE` looks like it should be best and is the worst of the four:
 * holding the pair permanently inside sword range means the director scripts a
 * third more blows, and it scripts them at moments the choreography has not set
 * up, so more of them land in air. Just *outside* sword range is the right
 * place to stand — it leaves a band the pair can hold each other at without
 * being dragged in, which is what measuring an opponent looks like, and the
 * modules then close the last stretch themselves.
 */
const LEASH = 150;

type Band = "close" | "mid" | "far";

/**
 * A module's source of randomness, injectable so `scripts/check.ts` can generate
 * hundreds of thousands of sequences from a seed and assert on every one.
 *
 * The old pool was a table, so the checker read it. A generator cannot be read —
 * it has to be *run*, and run enough times to visit its corners. That gate is
 * strictly stronger than the table check it replaced: it re-derives every
 * contact frame from the move table for every roll, where the table check could
 * only confirm the numbers somebody had typed.
 */
export interface Roll {
  /** Uniform in [0, 1). */
  f(): number;
  /** Integer in [lo, hi], inclusive both ends. */
  i(lo: number, hi: number): number;
  /** Uniform in [lo, hi). */
  n(lo: number, hi: number): number;
  /** One of the list. */
  of<T>(xs: readonly T[]): T;
}

/**
 * Wrap a plain `() => number` as a `Roll`.
 *
 * Exported so `scripts/check.ts` can drive a module's `build` directly from a
 * seed. It needs the raw output rather than `buildSequence`'s, because
 * `buildSequence` sorts the beats — and *whether the builder emitted them in
 * order* is one of the things being gated.
 */
export function makeRoll(rng: () => number): Roll {
  return {
    f: rng,
    i: (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)),
    n: (lo, hi) => lo + rng() * (hi - lo),
    of: <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)],
  };
}

export interface Module {
  id: string;
  weight: number;
  /** The band this module can be entered from. */
  range: Band | "any";
  /**
   * It contains a landed blow. The anti-stall rail keeps only these, so a module
   * whose beats can roll away their only `hit` must declare `false`.
   */
  hits: boolean;
  build(r: Roll): { beats: Beat[]; length: number };
}

/** The frame a beat's blow lands, counting a skipped wind-up. */
function lands(move: MoveId, at: number, quick = false): number {
  const m = MOVES[move];
  return at + m.contact - (quick ? (m.windup ?? 0) : 0);
}

/** The frame a beat's move finishes, counting a skipped wind-up. */
function ends(move: MoveId, at: number, quick = false): number {
  const m = MOVES[move];
  return at + m.frames - (quick ? (m.windup ?? 0) : 0);
}

/** The three interchangeable blade arcs. Same reach, same channel, different read. */
const CUTS = ["strike_overhead", "strike_diagonal", "strike_rising"] as const;
type Cut = (typeof CUTS)[number];

/**
 * Which parry answers which strike.
 *
 * A block is a *reaction to a specific strike* — that is the whole reason
 * outcomes come from the script rather than from a coin per swing — so the
 * moment a module rolls its opener it has to roll the answer with it. Typed
 * pairs are how the old pool did it and they were correct; this is the same
 * table, made total so a rolled opener always has one.
 */
const PARRY_FOR: Record<Cut | "thrust" | "strike_level", MoveId> = {
  strike_overhead: "parry_high",
  strike_diagonal: "parry_cross",
  strike_rising: "parry_low",
  strike_level: "parry_low",
  thrust: "parry_low",
};

const other = (who: Role): Role => (who === "ATT" ? "DEF" : "ATT");

/**
 * The next cut in a run, never the one just thrown.
 *
 * Written as an offset rather than as "re-roll until it differs" on purpose: a
 * rejection loop is a loop whose length depends on a roll, and nothing in this
 * director is allowed to wait on a condition. This is O(1) and still uniform
 * over the two remaining arcs.
 */
function cutAfter(r: Roll, prev: Cut | null): Cut {
  if (prev === null) return r.of(CUTS);
  const i = CUTS.indexOf(prev);
  return CUTS[(i + 1 + r.i(0, CUTS.length - 2)) % CUTS.length];
}

const MODULES: Module[] = [
  {
    /*
     * Pure closing. Both roles advance, and because `facing` always points at
     * the opponent, "advance" closes for whoever performs it — so this cannot
     * favour a side or drift the pair off toward one wall.
     */
    id: "close-in",
    weight: 22,
    range: "mid",
    hits: false,
    build(r) {
      const second = r.i(50, 62);
      return {
        beats: [
          { who: "ATT", move: "advance", at: 0 },
          { who: "DEF", move: r.of(["advance", "advance", "circle"] as const), at: 0 },
          { who: "ATT", move: "advance", at: second },
          { who: "DEF", move: r.of(["circle", "advance", "guard"] as const), at: second },
        ],
        length: ends("advance", second) + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The length is derived, not typed, and that fixes a bug the fixed table
     * shipped: `advance` is 54 frames and the last beat used to start at 58
     * against a length of 84, so the module ended 28 frames inside its own
     * closing move. At weight 13 that was among the most frequently seen things
     * in the fight. Every `length` in this pool is now the last beat's own end
     * plus a rolled rest, so an overrun cannot be typed by hand.
     */
    id: "step-in",
    weight: 13,
    range: "mid",
    hits: false,
    build(r) {
      const second = r.i(54, 64);
      const hold = r.of(["guard", "guard", "circle"] as const);
      return {
        beats: [
          { who: "ATT", move: "advance", at: 0 },
          { who: "DEF", move: hold, at: 0 },
          { who: "ATT", move: r.of(["guard", "circle"] as const), at: second },
          { who: "DEF", move: "advance", at: second },
        ],
        length: ends("advance", second) + r.i(0, 16),
      };
    },
  },
  {
    id: "probe",
    weight: 10,
    range: "mid",
    hits: false,
    build(r) {
      const jab = r.of(["thrust", "strike_level"] as const);
      const at = r.i(14, 22);
      const evade = lands(jab, at) - r.i(2, 8);
      const rest = ends(jab, at) + r.i(4, 16);
      return {
        beats: [
          { who: "ATT", move: "advance", at: 0 },
          { who: "DEF", move: "circle", at: 0 },
          { who: "ATT", move: jab, at, outcome: "miss" },
          { who: "DEF", move: r.of(["backstep", "retreat"] as const), at: evade },
          { who: "ATT", move: "guard", at: rest },
          { who: "DEF", move: "guard", at: rest },
        ],
        length: rest + MOVES.guard.frames + r.i(2, 18),
      };
    },
  },
  {
    id: "cut-and-catch",
    weight: 12,
    range: "close",
    hits: true,
    build(r) {
      const opener = r.of(CUTS);
      const counter = r.of(["strike_rising", "thrust", "strike_diagonal"] as const);
      const parry = lands(opener, 0) - r.i(8, 12);
      const at = ends(opener, 0) + r.i(-4, 8);
      const hit = lands(counter, at);
      const guard = hit + r.i(16, 26);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "blocked" },
          { who: "DEF", move: PARRY_FOR[opener], at: parry },
          { who: "DEF", move: counter, at, outcome: "hit", power: r.n(0.78, 0.95) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(4, 22),
      };
    },
  },
  {
    id: "overhead-denied",
    weight: 12,
    range: "close",
    hits: false,
    build(r) {
      const opener = r.of(["strike_overhead", "strike_diagonal"] as const);
      const block = lands(opener, 0) - r.i(9, 13);
      const riposte = ends(opener, 0) - r.i(2, 10);
      const evade = lands("thrust", riposte) - r.i(0, 6);
      const rest = ends("thrust", riposte) + r.i(6, 18);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "blocked" },
          { who: "DEF", move: PARRY_FOR[opener], at: block },
          { who: "DEF", move: "thrust", at: riposte, outcome: "miss" },
          { who: "ATT", move: "backstep", at: evade },
          { who: "ATT", move: "guard", at: rest },
          { who: "DEF", move: "guard", at: rest },
        ],
        length: rest + MOVES.guard.frames + r.i(4, 20),
      };
    },
  },
  {
    /*
     * The gap-closers were authored `far` and re-ranged to `mid` on 2026-08-16
     * with the leash. Once the leash engages just outside sword range the far
     * bracket is 0.2% of frames, and all four went to *zero* picks. They also
     * read better from mid: `leap_strike` carries 42 units of travel and was
     * being asked to cross 245. **Nothing is ranged `far` today** — the band
     * exists in `chooseSequence` and the leash means the fight does not decide
     * anything in it.
     */
    id: "close-the-gap",
    weight: 10,
    range: "mid",
    hits: true,
    build(r) {
      const hit = lands("leap_strike", 0);
      const guard = hit + MOVES.stagger.frames - r.i(2, 10);
      const beats: Beat[] = [
        { who: "ATT", move: "leap_strike", at: 0, outcome: "hit", power: r.n(0.9, 1.1) },
        { who: "DEF", move: "stagger", at: hit },
        { who: "ATT", move: "guard", at: guard },
      ];
      // Half the time the struck fighter gives ground rather than standing it
      // off. Cheap, and this is one of the thinnest modules in the pool by
      // distinct forms — a three-beat exchange has very little else to roll.
      const away = r.f() < 0.5 ? 0 : guard + r.i(2, 12);
      if (away) beats.push({ who: "DEF", move: r.of(["backstep", "retreat"] as const), at: away });
      return {
        beats,
        length: Math.max(guard + MOVES.guard.frames, away + MOVES.retreat.frames) + r.i(8, 28),
      };
    },
  },
  {
    id: "leap-evaded",
    weight: 7,
    range: "mid",
    hits: true,
    build(r) {
      const dodge = r.i(16, 24);
      const cut = r.of(["strike_rising", "strike_diagonal"] as const);
      const at = ends("leap_strike", 0) - r.i(0, 8);
      const hit = lands(cut, at);
      const guard = hit + r.i(22, 32);
      return {
        beats: [
          { who: "ATT", move: "leap_strike", at: 0, outcome: "miss" },
          { who: "DEF", move: "backstep", at: dodge },
          { who: "DEF", move: cut, at, outcome: "hit", power: r.n(0.82, 0.98) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(4, 20),
      };
    },
  },
  {
    id: "pushed",
    weight: 9,
    range: "mid",
    hits: true,
    build(r) {
      const hit = lands("force_push", 0);
      const down = hit + r.i(0, 3);
      const follow = down + MOVES.knockdown.frames + r.i(0, 12);
      return {
        beats: [
          { who: "ATT", move: "force_push", at: 0, outcome: "hit", power: r.n(0.9, 1.1) },
          { who: "DEF", move: "knockdown", at: down },
          { who: "ATT", move: "advance", at: follow },
        ],
        length: ends("advance", follow) - r.i(2, 14),
      };
    },
  },
  {
    /*
     * Both land, a few frames apart. Two impacts that close together read as one
     * event with a stutter in it, which is the point.
     *
     * The flinches are ordered after *both* contacts rather than after each
     * fighter's own wound: staggering the defender at its own contact would cut
     * its strike before that strike lands, and then it is not a trade. Derived
     * from `max` of the two, so rolling the two arcs cannot break it — that
     * ordering was typed by hand until 2026-08-18 and had already been wrong
     * once.
     */
    id: "trade",
    weight: 8,
    range: "close",
    hits: true,
    build(r) {
      const first = r.of(CUTS);
      const second = cutAfter(r, first);
      const off = r.i(2, 7);
      const both = Math.max(lands(first, 0), lands(second, off)) + r.i(1, 3);
      const back = both + MOVES.stagger.frames + r.i(2, 10);
      return {
        beats: [
          { who: "ATT", move: first, at: 0, outcome: "hit", power: r.n(0.62, 0.78) },
          { who: "DEF", move: second, at: off, outcome: "hit", power: r.n(0.62, 0.78) },
          { who: "DEF", move: "stagger", at: both },
          { who: "ATT", move: "stagger", at: both + 1 },
          { who: "ATT", move: "backstep", at: back },
          { who: "DEF", move: "backstep", at: back },
        ],
        length: back + MOVES.backstep.frames + r.i(4, 20),
      };
    },
  },
  {
    id: "standoff",
    weight: 8,
    range: "mid",
    hits: false,
    build(r) {
      const show = r.i(50, 70);
      const settle = show + MOVES.flourish.frames + r.i(2, 12);
      return {
        beats: [
          { who: "ATT", move: "circle", at: 0 },
          { who: "DEF", move: "circle", at: 0 },
          { who: "ATT", move: "flourish", at: show },
          { who: "DEF", move: "guard", at: show },
          { who: "ATT", move: "guard", at: settle },
          { who: "DEF", move: "guard", at: settle },
        ],
        length: settle + MOVES.guard.frames + r.i(10, 32),
      };
    },
  },
  {
    id: "two-blades-one-breath",
    weight: 7,
    range: "close",
    hits: true,
    build(r) {
      const opener = r.of(["thrust", "strike_level", "strike_rising"] as const);
      const parry = lands(opener, 0) - r.i(6, 10);
      const second = ends(opener, 0) - r.i(2, 10);
      const hit = lands("strike_rising", second);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "blocked" },
          { who: "DEF", move: PARRY_FOR[opener], at: parry },
          { who: "ATT", move: "strike_rising", at: second, outcome: "hit", power: r.n(0.74, 0.9) },
          { who: "DEF", move: "stagger", at: hit },
        ],
        length: hit + MOVES.stagger.frames + r.i(4, 22),
      };
    },
  },
  {
    /*
     * The only `any`-range module, and the pool's answer to a band nothing else
     * covers. Its trailing `circle` is a drift and the length deliberately cuts
     * it short: nobody can see a drift end early.
     */
    id: "disengage",
    weight: 9,
    range: "any",
    hits: true,
    build(r) {
      const opener = r.of(CUTS);
      const back = r.i(3, 8);
      const push = r.i(20, 28);
      const hit = lands("force_push", push);
      const away = hit + MOVES.stagger.frames - r.i(6, 16);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "miss" },
          { who: "DEF", move: "backstep", at: back },
          { who: "DEF", move: "force_push", at: push, outcome: "hit", power: r.n(0.52, 0.68) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "ATT", move: "circle", at: away },
        ],
        length: ends("circle", away) - r.i(10, 26),
      };
    },
  },
  {
    /*
     * The only sustained moment where both blades touch. Everything else in the
     * fight is motion; this one's value is pressure.
     *
     * `power` is the press: 1 drives, 0 gives ground. It is not a damage
     * multiplier — `lock` has no contact frame — it is how the script tells the
     * press who wins it, through the channel `setMove` already carries. The
     * outcome is fixed the frame the lock starts and *nothing* consults a
     * condition to find it: the winner is whoever the role coin made ATT, and
     * ATT is who breaks through. So the grind can lean the right way for a
     * second and a half before the blow lands, which is the whole image.
     *
     * The lock starts one frame *after* the block resolves, derived rather than
     * typed: `setMove` clears `struck`, so a lock starting on the same frame
     * would silently delete the block that opens the module.
     */
    id: "the-lock",
    weight: 5,
    range: "close",
    hits: true,
    build(r) {
      const opener = r.of(["strike_overhead", "strike_diagonal"] as const);
      const lockAt = lands(opener, 0) + 1;
      const breakAt = lockAt + MOVES.lock.frames + r.i(1, 6);
      const brk = r.of(CUTS);
      const hit = lands(brk, breakAt);
      const guard = hit + r.i(20, 30);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "blocked" },
          { who: "DEF", move: PARRY_FOR[opener], at: lands(opener, 0) - r.i(9, 13) },
          { who: "ATT", move: "lock", at: lockAt, power: 1 },
          { who: "DEF", move: "lock", at: lockAt, power: 0 },
          { who: "ATT", move: brk, at: breakAt, outcome: "hit", power: r.n(0.74, 0.9) },
          { who: "DEF", move: "stagger", at: hit },
          { who: "ATT", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The chain, and the module that rolls its own length.
     *
     * Two or three blocked exchanges trading the initiative back and forth, then
     * one that lands. The count, every arc and every interval roll — this is the
     * module the reference engine's `mFlurry` should have been, and the reason
     * the rolls live inside modules rather than only over them.
     */
    id: "riposte-chain",
    weight: 6,
    range: "close",
    hits: true,
    build(r) {
      const beats: Beat[] = [];
      const n = r.i(2, 3);
      let at = 0;
      let who: Role = "ATT";
      let prev: Cut | null = null;
      for (let i = 0; i < n; i += 1) {
        const cut = cutAfter(r, prev);
        prev = cut;
        const c = lands(cut, at);
        beats.push({ who, move: cut, at, outcome: "blocked" });
        beats.push({ who: other(who), move: PARRY_FOR[cut], at: c - r.i(6, 11) });
        at = c + r.i(4, 10);
        who = other(who);
      }
      const last = r.of(["thrust", "strike_rising", "strike_diagonal"] as const);
      const hit = lands(last, at);
      const guard = hit + r.i(28, 40);
      beats.push({ who, move: last, at, outcome: "hit", power: r.n(0.82, 0.98) });
      beats.push({ who: other(who), move: "stagger", at: hit });
      beats.push({ who, move: "guard", at: guard });
      return { beats, length: guard + MOVES.guard.frames + r.i(2, 20) };
    },
  },
  {
    /*
     * A fighter on the ground does not parry; it rises and guards. There was a
     * `parry_high` here once, answering a strike that whiffed twelve frames
     * earlier while the defender was still lying down.
     */
    id: "ground-and-rise",
    weight: 4,
    range: "close",
    hits: true,
    build(r) {
      const hit = lands("kick", 0);
      const down = hit + r.i(1, 3);
      // The overhead misses into the floor beside the fallen fighter, which
      // `resolveContact` turns into a burst of sparks off the ground.
      const stomp = down + r.i(18, 28);
      const rise = down + MOVES.knockdown.frames + r.i(20, 34);
      return {
        beats: [
          { who: "ATT", move: "kick", at: 0, outcome: "hit", power: r.n(0.9, 1.1) },
          { who: "DEF", move: "knockdown", at: down },
          { who: "ATT", move: r.of(["strike_overhead", "strike_diagonal"] as const), at: stomp, outcome: "miss" },
          { who: "ATT", move: "guard", at: rise },
          { who: "DEF", move: "guard", at: rise },
        ],
        length: rise + MOVES.guard.frames + r.i(10, 30),
      };
    },
  },
  {
    /*
     * 1.7 seconds of nothing, then the biggest single blow in the pool. The
     * contrast *is* the module — it should not get tightened in tuning.
     */
    id: "the-long-wind",
    weight: 5,
    range: "mid",
    hits: true,
    build(r) {
      const walk = r.i(38, 52);
      const set = walk + r.i(10, 20);
      const big = r.of(["strike_overhead", "spin_attack"] as const);
      const at = ends("advance", walk) + r.i(0, 12);
      const hit = lands(big, at);
      return {
        beats: [
          { who: "ATT", move: "guard", at: 0 },
          { who: "DEF", move: "guard", at: 0 },
          { who: "ATT", move: "advance", at: walk },
          { who: "DEF", move: "guard", at: set },
          { who: "ATT", move: big, at, outcome: "hit", power: r.n(1.35, 1.6) },
          { who: "DEF", move: "knockdown", at: hit },
        ],
        length: hit + MOVES.knockdown.frames + r.i(0, 16),
      };
    },
  },
  {
    /*
     * A regular beat, established two to four times and then broken. The eye
     * hears that as a rhythm even though there is no sound — so the *interval*
     * rolls once and then holds, where every other module's intervals roll per
     * beat. Breaking that would take the module's only idea away from it.
     */
    id: "wall-of-parries",
    weight: 5,
    range: "close",
    hits: true,
    build(r) {
      const step = r.i(22, 28);
      const n = r.i(2, 4);
      const beats: Beat[] = [];
      let prev: Cut | null = null;
      for (let i = 0; i < n; i += 1) {
        const cut = cutAfter(r, prev);
        prev = cut;
        const at = i * step;
        beats.push({ who: "ATT", move: cut, at, outcome: "blocked" });
        beats.push({ who: "DEF", move: PARRY_FOR[cut], at: lands(cut, at) - r.i(6, 11) });
      }
      const last = cutAfter(r, prev);
      const at = n * step;
      const hit = lands(last, at);
      beats.push({ who: "ATT", move: last, at, outcome: "hit", power: r.n(0.92, 1.08) });
      beats.push({ who: "DEF", move: "stagger", at: hit });
      return { beats, length: hit + MOVES.stagger.frames + r.i(4, 20) };
    },
  },
  {
    id: "spin-through",
    weight: 3,
    range: "close",
    hits: true,
    build(r) {
      const dodge = r.i(16, 24);
      const cut = r.of(["strike_rising", "strike_diagonal", "thrust"] as const);
      const at = ends("spin_attack", 0) + r.i(0, 8);
      const hit = lands(cut, at);
      const guard = hit + r.i(30, 42);
      return {
        beats: [
          { who: "ATT", move: "spin_attack", at: 0, outcome: "miss" },
          { who: "DEF", move: "backstep", at: dodge },
          { who: "DEF", move: cut, at, outcome: "hit", power: r.n(1.1, 1.3) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * Somersaults the strike and lands behind. The sides swap — `flip_over` is
     * one of the two `pass` moves, so the counter cannot be scheduled until it
     * has landed, which is why `at` is derived from the flip's own end rather
     * than typed.
     */
    id: "over-the-top",
    weight: 7,
    range: "close",
    hits: true,
    build(r) {
      const opener = r.of(CUTS);
      const flip = r.i(4, 10);
      const cut = r.of(["strike_rising", "strike_diagonal"] as const);
      const at = ends("flip_over", flip) + r.i(1, 8);
      const hit = lands(cut, at);
      const guard = hit + r.i(26, 36);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "miss" },
          { who: "DEF", move: "flip_over", at: flip },
          { who: "DEF", move: cut, at, outcome: "hit", power: r.n(0.88, 1.02) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    id: "flip-and-press",
    weight: 5,
    range: "mid",
    hits: true,
    build(r) {
      const cut = r.of(["strike_overhead", "strike_diagonal"] as const);
      const at = ends("flip_over", 0) + r.i(2, 10);
      const parry = lands(cut, at) - r.i(9, 13);
      const kick = ends(cut, at) - r.i(0, 10);
      const hit = lands("kick", kick);
      const guard = hit + r.i(24, 34);
      return {
        beats: [
          { who: "ATT", move: "flip_over", at: 0 },
          { who: "DEF", move: "guard", at: 0 },
          { who: "ATT", move: cut, at, outcome: "blocked" },
          { who: "DEF", move: PARRY_FOR[cut], at: parry },
          { who: "ATT", move: "kick", at: kick, outcome: "hit", power: r.n(0.9, 1.1) },
          { who: "DEF", move: "stagger", at: hit },
          { who: "ATT", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The pull is the setup and the thrust is the payoff — the biggest thrust in
     * the pool. `force_pull`'s `knock` is signed negative for exactly this: it
     * spent two days throwing its victim *away*, and this module delivered its
     * payoff at a median of 280 units.
     */
    id: "pull-and-punish",
    weight: 5,
    range: "mid",
    hits: true,
    build(r) {
      const pull = lands("force_pull", 0);
      const stum = pull + r.i(1, 3);
      const jab = r.of(["thrust", "strike_rising", "strike_overhead"] as const);
      const at = stum + MOVES.stumble_in.frames - r.i(8, 16);
      const hit = lands(jab, at);
      const back = hit + MOVES.stagger.frames + r.i(0, 8);
      const guard = back + r.i(20, 32);
      return {
        beats: [
          { who: "ATT", move: "force_pull", at: 0, outcome: "hit", power: r.n(0.3, 0.42) },
          { who: "DEF", move: "stumble_in", at: stum },
          { who: "ATT", move: jab, at, outcome: "hit", power: r.n(1.05, 1.25) },
          { who: "DEF", move: "stagger", at: hit },
          { who: "DEF", move: "backstep", at: back },
          { who: "ATT", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    id: "held-and-struck",
    weight: 3,
    range: "mid",
    hits: true,
    build(r) {
      const grab = lands("force_hold", 0) + r.i(0, 3);
      const walk = grab + r.i(26, 36);
      const big = r.of(["strike_overhead", "strike_diagonal"] as const);
      const at = walk + r.i(26, 36);
      const hit = lands(big, at);
      const flour = hit + r.i(20, 30);
      return {
        beats: [
          { who: "ATT", move: "force_hold", at: 0 },
          { who: "DEF", move: "held", at: grab },
          { who: "ATT", move: "advance", at: walk },
          { who: "ATT", move: big, at, outcome: "hit", power: r.n(1.2, 1.4) },
          { who: "DEF", move: "knockdown", at: hit },
          { who: "ATT", move: "flourish", at: flour },
        ],
        length: flour + MOVES.flourish.frames + r.i(4, 24),
      };
    },
  },
  {
    id: "spin-connects",
    weight: 3,
    range: "close",
    hits: true,
    build(r) {
      const hit = lands("spin_attack", 0);
      const down = hit + r.i(1, 4);
      const flour = down + r.i(22, 32);
      const guard = flour + MOVES.flourish.frames + r.i(0, 8);
      return {
        beats: [
          { who: "ATT", move: "spin_attack", at: 0, outcome: "hit", power: r.n(1.15, 1.35) },
          { who: "DEF", move: "knockdown", at: down },
          { who: "ATT", move: "flourish", at: flour },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The duck, and the only sweep in the pool that can be ducked.
     *
     * The two are one idea and neither works alone: every other attack here
     * finishes in the floor, and crouching under a descending blade puts your
     * head where it is going. `strike_level` holds its blade level from frame 17
     * to 24 and the crouch is deepest at 19, so the sweep genuinely passes over
     * the head rather than the two merely happening at once — measured in local
     * units the blade runs at y 1–8 while the ducked head sits at 22.
     *
     * **Neither the moves nor the six-frame offset roll**, and that is the
     * exception in this pool rather than an oversight: the pairing is a measured
     * fit between two specific blade curves, so rolling either arc or sliding
     * the crouch would put the head back in the sword's path. What rolls is the
     * counter and the rest. Rising straight out of the crouch into the counter
     * is the payoff, and it is why the answer is `strike_rising`.
     */
    id: "under-the-sweep",
    weight: 8,
    range: "close",
    hits: true,
    build(r) {
      const at = r.i(26, 34);
      const hit = lands("strike_rising", at);
      const guard = hit + r.i(18, 28);
      return {
        beats: [
          { who: "ATT", move: "strike_level", at: 0, outcome: "miss" },
          { who: "DEF", move: "duck", at: 6 },
          { who: "DEF", move: "strike_rising", at, outcome: "hit", power: r.n(0.82, 0.98) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The charge that swaps the sides — the one exchange that ends with the
     * arena rearranged rather than restored.
     *
     * A long fight reads as more static than it is because the pair spend it
     * oscillating about one axis: the somersault is the only other move that
     * crosses, and it belongs to whoever is dodging. This one is mutual, it is
     * on the ground where it can be seen, and the blades cross at the start of
     * it — see `overrun`'s note on why the blade sweeps from frame one instead
     * of being timed to the pass.
     *
     * No damage, deliberately. It is a spacing move that happens to be thrilling,
     * and the pool needs its quiet entries to stay under a third.
     */
    id: "the-overrun",
    weight: 6,
    range: "mid",
    hits: false,
    build(r) {
      const settle = MOVES.overrun.frames + r.i(2, 12);
      // They do not turn round in unison: whoever recovers second is the one
      // who was still carrying the charge, and a frame or two of that is the
      // difference between two figures and two halves of one animation.
      const lag = r.i(0, 6);
      return {
        beats: [
          { who: "ATT", move: "overrun", at: 0 },
          { who: "DEF", move: "overrun", at: 0 },
          { who: "ATT", move: r.of(["guard", "guard", "circle"] as const), at: settle },
          { who: "DEF", move: r.of(["guard", "circle"] as const), at: settle + lag },
        ],
        length: settle + lag + MOVES.circle.frames + r.i(4, 22),
      };
    },
  },
  {
    /*
     * The riposte, with the wind-up cut out — see `Move.windup`.
     *
     * `wall-of-parries` and `riposte-chain` both answer a block with a strike,
     * and both answer it *slowly*, because the counter starts at frame zero and
     * spends twelve frames lifting a blade that is already lifted. Here the
     * thrust enters at its own `windup`, so it lands **four frames** after the
     * beat instead of sixteen, out of the parry's own angle.
     *
     * **The timing is the whole exercise and it is all fixed** — this module and
     * `under-the-sweep` are the two that roll almost nothing, for the same kind
     * of reason. The parry arrives at 21 and holds through the block at 22; the
     * counter leaves at 28, still inside that hold; it lands at 32, which is
     * where the stagger is written. And 32 leaves the attacker's deferred recoil
     * (26, four frames after the block) six frames to play before the stagger
     * takes the body — the window `resolveContact` says is eaten in 28.7% of
     * blocks. Here it is not. Rolling any of those five numbers closes that
     * window on some rolls and not others.
     *
     * **The counter is a thrust and not a rising cut**, because a riposte has to
     * leave from the parry's own angle and `strike_rising` loads by *dropping*
     * the blade — see the note on its missing `windup`.
     */
    id: "riposte-instant",
    weight: 6,
    range: "close",
    hits: true,
    build(r) {
      const guard = r.i(58, 68);
      const back = guard + r.i(2, 8);
      return {
        beats: [
          { who: "ATT", move: "strike_overhead", at: 0, outcome: "blocked" },
          { who: "DEF", move: "parry_high", at: 16 },
          { who: "DEF", move: "thrust", at: 28, outcome: "hit", power: r.n(0.9, 1.0), quick: true },
          { who: "ATT", move: "stagger", at: 32 },
          { who: "DEF", move: "guard", at: guard },
          { who: "ATT", move: "backstep", at: back },
        ],
        length: back + MOVES.backstep.frames + r.i(6, 24),
      };
    },
  },
  {
    /*
     * Giving ground — and the module that made `retreat` a move again.
     *
     * `retreat` had never been used by anything. The pool reaches for `backstep`
     * every time somebody withdraws, and a backstep is a 26-frame hop with an
     * impulse behind it: a flinch. `retreat` is a 34-frame *walk* backwards at a
     * deliberately uncommitted top speed, which is a different thing to watch —
     * one fighter yielding ground under pressure while still facing the person
     * pushing them.
     *
     * It ends in a counter rather than in quiet, deliberately: the pool's
     * zero-damage share is held under a third, and a withdrawal that draws the
     * attacker onto a thrust is what a withdrawal is *for*.
     */
    id: "give-ground",
    weight: 6,
    range: "close",
    hits: true,
    build(r) {
      const opener = r.of(CUTS);
      const yielded = r.i(3, 8);
      const chase = ends("retreat", yielded) - r.i(2, 10);
      const jab = r.of(["thrust", "strike_rising"] as const);
      const at = chase + r.i(8, 18);
      const hit = lands(jab, at);
      const back = hit + MOVES.stagger.frames + r.i(2, 10);
      const guard = back + r.i(2, 8);
      return {
        beats: [
          { who: "ATT", move: opener, at: 0, outcome: "miss" },
          { who: "DEF", move: "retreat", at: yielded },
          { who: "ATT", move: "advance", at: chase },
          { who: "DEF", move: jab, at, outcome: "hit", power: r.n(0.78, 0.92) },
          { who: "ATT", move: "stagger", at: hit },
          { who: "DEF", move: "backstep", at: back },
          { who: "ATT", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(0, 18),
      };
    },
  },
  {
    /*
     * The blade leaves the hand.
     *
     * Rare on purpose — the floor of the pool. It is the largest read in the set
     * precisely because the silhouette loses its brightest element, and a thing
     * that happens often is not a surprise. The defender simply guards: there is
     * no answer to a sword arriving on its own, and inventing one would need a
     * move whose whole content is "the thing that only happens here".
     *
     * The thrower's own recovery may not start before the blade is back in the
     * hand — `bladeWorld` returns the flying segment for the whole flight, so a
     * guard scheduled inside it would take the hand to a rest pose while the
     * sword was still 200 units downrange. Floored against the move's length
     * rather than trusted to the roll.
     */
    id: "the-throw",
    weight: 4,
    range: "mid",
    hits: true,
    build(r) {
      const hit = lands("blade_throw", 0);
      const back = hit + MOVES.stagger.frames + r.i(0, 8);
      const guard = Math.max(back, MOVES.blade_throw.frames + r.i(2, 10));
      return {
        beats: [
          { who: "ATT", move: "blade_throw", at: 0, outcome: "hit", power: r.n(0.88, 1.02) },
          { who: "DEF", move: "guard", at: 0 },
          { who: "DEF", move: "stagger", at: hit },
          { who: "DEF", move: "backstep", at: back },
          { who: "ATT", move: "guard", at: guard },
        ],
        length: guard + MOVES.guard.frames + r.i(8, 28),
      };
    },
  },
];

const TOTAL_WEIGHT = MODULES.reduce((n, m) => n + m.weight, 0);

/**
 * Build one module into a concrete sequence.
 *
 * Exported because the check suite has to generate hundreds of thousands of
 * these from a seed. A checker holding its own copy of a generator only ever
 * confirms its own copy — the same reason `duelCamera` is exported.
 *
 * The beats are sorted here rather than in each builder. `runDirector` walks the
 * array in order and stops at the first beat whose frame has not arrived, so an
 * out-of-order beat stalls every beat behind it — a builder that rolls its way
 * into one would produce a fight that runs perfectly well and is silently
 * wrong. The sort makes that safe at runtime; `scripts/check.ts` still asserts
 * that builders emit them in order, so the mistake is caught rather than
 * papered over. `Array.prototype.sort` is stable, so beats sharing a frame keep
 * the order they were authored in — which `the-lock` depends on.
 */
export function buildSequence(module: Module, rng: () => number = Math.random): Sequence {
  const built = module.build(makeRoll(rng));
  const beats = built.beats.slice().sort((x, y) => x.at - y.at);
  return { id: module.id, length: built.length, beats };
}

/**
 * The move table and the module pool, for `scripts/check.ts` and nothing else.
 *
 * Most of what can go wrong in here is **arithmetic in data** rather than logic
 * anyone could see reading the file — a contact frame inside a `hold` plateau, a
 * reaction scheduled before the blow that causes it, a move nothing reaches.
 * Every one of those is decidable from the numbers, and none of them is reliably
 * catchable by stepping the fight, because they present as a fight that runs
 * perfectly well and looks slightly wrong.
 *
 * **The second half is now a generator rather than a table, and the gate had to
 * change shape with it.** A table can be read; a generator has to be *run*, and
 * run enough times to visit its corners — so the checker builds every module
 * tens of thousands of times from a seed and asserts on every result. That is
 * strictly stronger than what it replaced: the old gate could only confirm the
 * numbers somebody had typed, and this one re-derives every contact frame from
 * the move table for every roll.
 *
 * Exported rather than re-declared in the checker for the same reason
 * `duelCamera` is: a checker holding its own copy only ever confirms its own
 * copy.
 */
export const DUEL_TABLES: {
  moves: Readonly<Record<string, Move>>;
  modules: readonly Module[];
} = { moves: MOVES, modules: MODULES };

/**
 * A pass that never leaves the floor, and so cannot be excused by the airborne
 * test — see the body-separation note in `step`. Module scope rather than a
 * closure in the step: this is asked twice a frame, for ever.
 */
function isGroundPass(f: Fighter): boolean {
  const m = MOVES[f.move];
  return m.pass === true && !m.impulse?.vy;
}

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

/** Give a fighter a move, from frame zero — or from its `windup`, if quick. */
function setMove(
  f: Fighter,
  id: MoveId,
  outcome?: Beat["outcome"],
  power = 1,
  quick = false,
): void {
  if (f.action === "dead") return;
  f.move = id;
  /*
   * A quick entry starts the move at the frame its blade stops loading, which
   * is what a riposte is: the wind-up already happened, it was the parry. The
   * blade spring is not reset with it, so the strike leaves from wherever the
   * parry left the blade rather than from a guard it never returned to.
   */
  f.mf = quick ? (MOVES[id].windup ?? 0) : 0;
  f.outcome = outcome;
  f.beatPower = power;
  f.action = MOVES[id].chan;
  f.struck = outcome === undefined;
  // A deferred bounce belongs to the move that earned it, never to this one.
  f.bounce = 0;
}

/**
 * Pick the next module for the current spacing, build it, and roll the roles.
 *
 * The role coin consults nothing at all — not health, not who won the last
 * exchange, not position. That is the whole guarantee: an early lucky roll can
 * never compound into a decided match, because nothing carries forward.
 *
 * The *module* is chosen by weight and band and then **built**, and the build is
 * where the fight stops looping: two picks of `riposte-chain` are two different
 * exchanges, not the same one twice.
 */
function chooseSequence(st: DuelState): void {
  const dist = Math.abs(centre(st.a) - centre(st.b));
  const band: Band = dist <= CLOSE ? "close" : dist <= MID ? "mid" : "far";
  let pool = MODULES.filter((m) => m.range === band || m.range === "any");
  /*
   * Under pressure the pool loses its quiet sequences and the blows get
   * heavier. This is the rail against a match that will not end: it is
   * deterministic, symmetric, and applies to whoever happens to be attacking,
   * so it cannot favour a side.
   *
   * **It is a closer, not an emergency, and the comment here used to say
   * otherwise** (measured 2026-08-16). "A normal match never reaches it" was
   * written when the counter was monotonic across the page's whole life and the
   * rail was firing on 98.6% of picks; resetting it per match fixed that, and
   * the claim was left behind uncorrected in the other direction. A match runs
   * about 24 sequences against a threshold of 22, so in practice the rail takes
   * the last one or two of **every** match — **16%** of all picks across
   * 360,000 frames, not zero. That is a fair description of a fight tightening
   * as it ends, and it is why matches converge at all; just do not raise the
   * threshold expecting to touch an edge case, because it is the ending.
   */
  const hard = st.dir.pressure > 22;
  if (hard) pool = pool.filter((m) => m.hits);
  if (pool.length === 0) pool = MODULES.filter((m) => m.range === "any");
  if (pool.length === 0) pool = MODULES;

  const total = pool.reduce((n, m) => n + m.weight, 0) || TOTAL_WEIGHT;
  let roll = Math.random() * total;
  let pick = pool[0];
  for (const m of pool) {
    roll -= m.weight;
    if (roll <= 0) {
      pick = m;
      break;
    }
  }
  st.dir.seq = buildSequence(pick);
  st.dir.f = 0;
  st.dir.next = 0;
  /*
   * The phrase, and the one thing the role coin is allowed to skip.
   *
   * A module is one exchange. Chaining two or three of them under a *single*
   * coin is what makes a run of pressure read as a fight rather than as a
   * shuffle — a fight where the aggressor changes every two seconds reads as
   * random, and runs are what a duel actually looks like.
   *
   * The coin still consults nothing when it is thrown. `chain` is rolled at the
   * same moment and consults nothing either, so this cannot become a way for an
   * early lucky roll to compound: it decides how long the *next* phrase is,
   * before anybody knows what happens in it.
   *
   * **The band is re-measured for every module, which is why they chain rather
   * than concatenate.** A composed-up-front sequence would have to guess where
   * each module leaves the pair, and a guess that is wrong schedules a close
   * exchange at 250 units, where the swords swing through air. Here the second
   * module of a phrase is chosen against the distance the first one actually
   * produced.
   *
   * Under the anti-stall rail phrases are cut to one module, so the closing
   * exchanges of a match each get their own coin.
   */
  if (st.dir.chain > 0) {
    st.dir.chain -= 1;
  } else {
    st.dir.att = Math.random() < 0.5 ? "a" : "b";
    const r = Math.random();
    st.dir.chain = hard ? 0 : r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
  }
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
    setMove(b.who === "ATT" ? att : def, b.move, b.outcome, b.power ?? 1, b.quick);
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
    foe.vx += f.facing * (m.knock ?? (m.chan === "force" ? 5.2 : 1.8));
    spawnSparks(st, hx, hy, 14, f.facing * 1.2, 0.6);
    // Hit-stop: both fighters' move clocks freeze for two frames while the
    // sparks keep flying. Two frames is nothing to describe and a great deal to
    // watch — it is the cheapest weight cue available.
    st.hitStop = 2;
  } else if (f.outcome === "blocked") {
    // The true crossing of the two blades — `bladeGap` returns the closest
    // approach of the two segments and the midpoint between them.
    const near = bladeGap(tip, bladeWorld(foe));
    /*
     * **The burst fires here, on the contact frame. An earlier claim that it
     * was deferred by a frame was wrong** (corrected 2026-08-17 by an
     * adversarial re-review of that same change).
     *
     * The deferral was written as `bounce = 5` plus a `bounce === 4` branch in
     * `stepFighter` — but that countdown runs *later in the same call*, so it
     * decremented to 4 and fired on the contact frame anyway. It was
     * bit-for-bit inert, and the figures claimed for it ("median gap 5.7,
     * in-clear-air rate halved") do not reproduce: re-measured over 200,000
     * frames the gap at the burst has a median of **14.25** units with 56.5%
     * beyond blade width — essentially unchanged.
     *
     * **Actually deferring it is worse, which is why it stays here.** One real
     * frame later the median measures **29.7** with 92.5% in clear air, because
     * by then the attacker is following through and the blades are separating.
     * The contact frame is the closest they ever get.
     *
     * So the original audit's finding stands and is still open: the burst is
     * placed at the *midpoint* of the gap and therefore touches neither sword.
     * The fix it wants is spatial — put it on the defender's blade at the point
     * nearest the attacker's tip — not temporal.
     */
    /*
     * `ax/ay` — the point on the *attacker's* blade nearest the defender's,
     * rather than the midpoint of the gap between them. When the blades cross
     * the two are the same point; when a scripted block leaves them apart, this
     * keeps the shower on the sword that just swung instead of floating in
     * clear air touching neither, and the eye is following the moving blade.
     *
     * **Kept on the arithmetic, not on a measurement.** `ax/ay` is by
     * construction a point on segment `a`, so the burst starts on the blade —
     * that needs no evidence. What could *not* be shown is that it reads any
     * better: an A/B against the midpoint over 300,000 frames came back
     * indistinguishable (median distance from the burst's centroid to the
     * nearest blade 3.1 against 3.2), because sparks are given velocity at
     * spawn and both blades move, so a frame later the drift is larger than the
     * difference being tested. Whether it looks better wants an eye, not
     * another bench.
     */
    spawnSparks(st, near.ax, near.ay, 18, 0, -1.1);

    /*
     * **The bounce is deferred, because switching move on the contact frame
     * deleted the swing it is bouncing off** (2026-08-16).
     *
     * The drawn blade is a spring and it lags the keyframe table by three to
     * five frames. `setMove(f, "recoil")` here retargets it to recoil's raised
     * angle on the very frame the table reaches the bottom of the arc, so the
     * spring turns around before it ever gets there. Measured over 164 blocked
     * overheads the blade's lowest drawn point was **0.23 rad *above*
     * horizontal**, against +1.37 when the same move runs uninterrupted: the
     * downstroke — the whole readable part of a sword swing — was never drawn
     * at all. Around 40% of the strikes in the pool are scripted `blocked`, so
     * this was most of the swordplay.
     *
     * `bounce` starts at 5 and is decremented once in this same call, so the
     * recoil lands **four** frames after contact, which is the spring's lag.
     * `setMove` clears it, so a deferred recoil can never land on top of a move
     * the director has since assigned.
     *
     * **The measured cost of that window:** in 28.7% of blocked strikes the
     * director assigns the next beat inside it (`wall-of-parries` parries at 24
     * against a contact at 22; `the-lock` at 23), so the bounce is eaten and
     * `recoil` never plays. That is the price of drawing the downstroke, and
     * the downstroke is worth more — shortening the window to rescue the recoil
     * puts the blade's turnaround back on top of the swing, which is the bug
     * this whole change exists to fix.
     */
    f.bounce = 5;
    st.hitStop = 3;
  } else if (f.outcome === "miss" && tip.ty > FLOOR_Y + BODY_H - 6) {
    // A swing that finishes in the floor throws sparks off it.
    spawnSparks(st, tip.tx, FLOOR_Y + BODY_H, 16, 0, -2.2);
  }
}

function stepFighter(st: DuelState, f: Fighter, foe: Fighter): void {
  f.flash = Math.max(0, f.flash - 1 / 12);
  if (f.action === "dead") return;

  /*
   * Square up — except while passing through them.
   *
   * A fighter who crosses the opponent's centre line turns to face them again
   * for free, which is why the pass moves need no bookkeeping. What they *do*
   * need is for that turn not to happen halfway through the pass: this line
   * fired on the frame the centres crossed, so the whole figure mirrored in
   * mid-somersault on **every flip measured** (172 of ~169 over 300,000
   * frames). Held for the duration of a `pass` move, the turn lands on the
   * frame the move ends — which is the landing.
   */
  if (!MOVES[f.move].pass) f.facing = centre(foe) >= centre(f) ? 1 : -1;

  if (foe.action === "dead") {
    /*
     * Victory: hold the field. One flourish, then the guard.
     *
     * **Not while the sword is still in the air.** `thrownBlade` is keyed on the
     * move, so switching to `flourish` here made a blade in flight vanish from
     * where it was and reappear in the winner's fist — a ~200-unit teleport on
     * the death frame, which is the *first* frame of the two-second hold the
     * design nominates as the announcement. Measured over 600,000 frames it hit
     * **11 of 104 throws (10.6%)**: exactly the throws that won the match, i.e.
     * the ones most worth looking at.
     *
     * Waiting costs 20 frames and is also simply true — you cannot salute with a
     * sword you have not caught yet. The blade returns to the hand at mf 50 and
     * the flourish takes over there, well inside the 200-frame hold.
     */
    const inFlight = thrownBlade(f) !== null;
    if (!inFlight && f.move !== "flourish" && f.move !== "guard") setMove(f, "flourish");
    f.drive = 0;
  }

  const m = MOVES[f.move];
  f.mf += 1;

  if (m.impulse && f.mf === m.impulse.at) {
    let vx = m.impulse.vx;
    if (m.span !== undefined) {
      // Travel is `vx / (1 - DECAY)`, so invert that for the gap in front of us.
      const want = (Math.abs(centre(foe) - centre(f)) + m.span) * (1 - DECAY);
      vx = Math.max(m.impulse.vx * 0.5, Math.min(m.impulse.vx * 3, want));
    }
    f.vx += f.facing * vx;
    if (m.impulse.vy) f.vy = m.impulse.vy;
  }

  // The blade leaves the hand knowing how far it has to go — see `throwReach`.
  // Sized here rather than at the beat because the gap on the frame of release
  // is the one that matters, and the wind-up is ten frames long.
  if (f.move === "blade_throw" && f.mf === THROW_OUT) {
    /*
     * Far enough to bite, not far enough to leave the picture.
     *
     * The blade's *centre* sits 26 units ahead of the thrower plus this reach,
     * and it is 58 long, so its tip lands `reach + 55` from the thrower's
     * centre. A first attempt at `gap + 18` was generous by about 88 units: it
     * flew clean through the opponent and out the far side, and `duelFocus`
     * frames the two bodies and deliberately ignores blade tips — so in the
     * ornament slot the subject of the move would have spent its apex outside
     * the frame. `gap - 40` puts the tip ~15 units past the opponent's centre,
     * which is a hit by any reading and still inside the box the camera fits.
     */
    f.throwReach = Math.max(60, Math.abs(centre(foe) - centre(f)) - 40);
  }

  if (m.contact >= 0 && !f.struck && f.mf >= m.contact) {
    f.struck = true;
    resolveContact(st, f, foe, m);
  }

  // The deferred bounce off a block. Set inside `resolveContact` above, which
  // is why this is tested after it rather than before.
  if (f.bounce > 0) {
    f.bounce -= 1;
    if (f.bounce === 0) {
      setMove(f, "recoil");
      return;
    }
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
      // Fresh fighters if this fight came from a pool, the same two if it was
      // pinned to a pairing. Rolled here rather than in the caller so every
      // home of the duel gets it without knowing the roster exists.
      const [left, right] = st.pool ? rollPairing(st.pool) : [a.style, b.style];
      st.a = makeFighter(START_A, 1, left);
      st.b = makeFighter(START_B, -1, right);
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
       *
       * `chain` clears with it, for a smaller reason: a phrase is a run of
       * pressure by one fighter, and a run cannot survive the fighters
       * teleporting back to their marks. Left set, the first exchange of a new
       * match would inherit the last exchange of the old one's aggressor
       * instead of throwing a fresh coin.
       */
      st.dir.pressure = 0;
      st.dir.chain = 0;
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
   * A positional resolve rather than a bounce: velocity is the choreography's,
   * and a fighter who was scripted to close should still be closing on the next
   * frame. Only the overlap is taken out — so the pair slide along their contact
   * instead of driving through each other, which is what reads as two bodies.
   *
   * **The whole overlap comes out on the frame it appears, and that number was
   * measured** (2026-08-16). It used to take a third per frame, on the reasoning
   * that contact should settle over a few frames rather than snap. Stepped over
   * 360,000 frames the settling never arrived: the fighters are driven by the
   * choreography at a closing speed that outruns a third-of-the-gap correction,
   * so the residue compounds and the silhouettes were interpenetrating on
   * **6.1%** of frames. Nor is it a smooth curve — 0.34 and 0.6 measure the same
   * (5.8% and 5.5%), because either one loses the race, and only full resolution
   * wins it, at **0.5%**. That is better than the two constraints this replaced
   * managed between them (0.9%), and the frame it takes to resolve is 16ms, which
   * is not a thing anybody sees.
   *
   * **Grounded pairs only**, and that exclusion is the whole reason `flip_over`
   * still works: the somersault's entire job is to pass over the opponent and
   * swap the sides, and a separation force that applied in the air would shove
   * the jumper back the way they came at the top of the arc. Anything airborne
   * is exempt, which costs nothing — an overlap is only visible when both
   * silhouettes are standing on the same line.
   */
  if (st.a.action !== "dead" && st.b.action !== "dead") {
    /*
     * **Airborne pairs are exempt, and so are ground passes — but a `pass` move
     * on its own is not enough, and assuming it was cost a measurement.**
     *
     * The airborne test has always been what lets the somersault cross: the
     * jumper is over the opponent's head, so there is nothing to resolve.
     * `overrun` needs the identical licence without ever leaving the floor, so
     * it has to be named some other way.
     *
     * Naming it "any `pass` move" is the version that does not work. `flip_over`
     * is only airborne for 83% of its 54 frames, so exempting it wholesale hands
     * the last nine frames — after it has landed, on top of somebody — a licence
     * it does not need, and the measured minimum grounded separation went from
     * **15.79 units to 4.39**: two figures standing inside each other for a
     * ninth of a second and then popping apart when the move ends.
     *
     * A **ground pass is a pass with no vertical impulse**, which is exactly the
     * distinction and needs no second flag to state. The somersault keeps its
     * exemption from the air, where it earns it, and gets separated the moment
     * its feet are down.
     */
    const passing = isGroundPass(st.a) || isGroundPass(st.b);
    const grounded = st.a.y >= FLOOR_Y - 0.5 && st.b.y >= FLOOR_Y - 0.5 && !passing;
    const gap = centre(st.b) - centre(st.a);
    // Narrower than BODY_W: the drawn figure is shoulders and hips, not the
    // full 30-unit box, so clearing the box would hold them apart visibly
    // further than they look, and a lock needs them shoulder to shoulder.
    const over = 26 - Math.abs(gap);
    if (grounded && over > 0) {
      const push = (over / 2) * (gap < 0 ? -1 : 1);
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
   * **the script remains the sole authority on whether a blow lands.** There is
   * no `dist` and no distance test anywhere in `resolveContact` — that name is
   * left over from the pre-director engine — and the reasoning is unchanged and
   * still load-bearing: gating damage on blade geometry would make misses
   * routine, stop health draining, and hang the match-reset loop, which has no
   * timeout. This is presentation only.
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
    // How hard they met: the sum of both blades' angular speeds. A parry that
    // catches a full swing throws far more than two blades drifting together.
    const force = Math.min(1, (Math.abs(st.a.bladeV) + Math.abs(st.b.bladeV)) * 3.4);
    /*
     * **Proximity is not contact, and the force floor is what says so**
     * (2026-08-16). Two fighters at rest hold their guards 28.5 units forward
     * of centre with a 58-unit blade, so their tips need 155 units of clearance
     * and the pair stand at a median of 123 — which means the resting blades
     * genuinely overlap, and this test fired on them for ever. Measured: a
     * burst every second, **84% of them while neither fighter was attacking or
     * parrying**, and sparks that constant make the ones marking a real parry
     * mean nothing.
     *
     * It got worse when `LEASH` came in — pulling the pair together traded two
     * figures at opposite ends of the arena for permanently tangled swords, and
     * the crossing rate went 21.7% of frames to 41.5%. The floor is the cheap
     * half of the answer and costs nothing in spacing: it removes 94% of the
     * resting showers and keeps every burst that came off a real swing.
     */
    if (near.d < 9 && st.clash === 0 && force > 0.15) {
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
   *
   * **It engages just outside sword range — see `LEASH`** (2026-08-16, client:
   * the fight "seems a little off"). It used to engage at a hardcoded 290 while
   * the director classified anything past 245 as far, a 45-unit dead band where
   * the pool had already given up on swordplay and nothing was pulling the pair
   * back. Measured, the fight sat in the far bracket **13.5%** of the time in
   * stretches with a **worst case of 1,022 frames — seventeen seconds** of two
   * figures at opposite ends of the arena, advancing and circling and never
   * touching. In a box this size that does not read as spacing, it reads as
   * broken.
   *
   * The number had to come in much further than the dead band alone suggested,
   * because fixing the reaction impulses gave every landed blow real knock-back
   * for the first time: with those live and the leash at 245, close-range time
   * fell to 35%, *below* where it had been. The old distances were tuned
   * against a fight in which nothing was ever knocked anywhere.
   */
  const sep = Math.abs(centre(st.b) - centre(st.a));
  if (sep > LEASH) {
    const dir = centre(st.a) < centre(st.b) ? 1 : -1;
    st.a.vx += dir * 0.12;
    st.b.vx -= dir * 0.12;
  }

  /*
   * Body separation is handled once, above, by the proportional resolve — this
   * is deliberately *not* a second constraint.
   *
   * There used to be one here: a flat 0.8 push per fighter whenever the centres
   * were within `BODY_W`. It survived the frame-by-frame pass that added the
   * soft resolve, so for a while both ran, and the two disagreed in a way that
   * showed. The resolve clears to 26 units and stops; this one kept pushing to
   * 30, with no proportionality, so every close exchange ended with a constant
   * 1.6 units a frame of drift apart in exactly the band where the sequences
   * want the pair shoulder to shoulder — `the-lock` closes to `LOCK_SEP` and
   * then had this working against it the whole way. One constraint, and it is
   * the one that scales with the overlap.
   */
  stepSparks(st);
}

function stepSparks(st: DuelState): void {
  const alive: Spark[] = [];
  for (const sp of st.sparks) {
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += 0.25;
    /*
     * The ground is solid. Gravity was applied and never tested against it, so
     * 3.8% of spark-frames were drawn below the ground line — up to 171 units
     * under it, two and a half body heights into the void beneath the stage,
     * which is most visible on exactly the floor-strike burst that should be
     * skittering along it. A little energy is kept horizontally and most is
     * taken out vertically, so they scatter along the ground and die there.
     */
    if (sp.y > FEET_Y) {
      sp.y = FEET_Y;
      sp.vy *= -0.32;
      sp.vx *= 0.72;
      sp.life -= 1 / 24;
    }
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
  /** Non-null only while this fighter's blade is in the air. */
  const thrown = thrownBlade(f);

  // The blade's smear, in world units and behind everything: its geometry
  // belongs to the last few frames rather than this one, so it cannot live
  // inside the body transform.
  // Keyed to how fast the blade is *turning*, not to how fast it is moving. The
  // samples are world positions, so a fighter sliding sideways with a still
  // blade swept out a clean filled rectangle — motion, correctly recorded, but
  // reading as a slab of colour rather than as a swing.
  const smear = Math.min(0.13, Math.abs(f.bladeV) * 0.34);
  if (!dead && f.trail.length > 2 && smear > 0.012) {
    /*
     * **Additive, because a sword's trail is light and not cloth.**
     *
     * Drawn normally, a 13%-alpha red fan over a near-black arena composites to
     * dark maroon — a *darker* shape than the background it is on. Every swing
     * therefore dragged a translucent flag behind it, which is exactly what it
     * looked like: a sheet of coloured plastic on the end of the sword. Under
     * `lighter` the same fan only ever adds, so it reads as the afterimage of
     * something bright, it cannot darken the effect drawn behind it in the
     * background presentation, and where the fan crosses itself at the turn of
     * a swing the overlap brightens instead of muddying.
     *
     * Restored immediately: this is the only composite operation in the file
     * and leaving it set would tint everything drawn after it.
     */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
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
    ctx.restore();
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
  } else if (f.move === "spin_attack") {
    /*
     * **The body turns with the blade** (TODO B, 2026-08-16). The spin was in
     * the sword and nowhere else: the figure stood square to the viewer while
     * its arms swept a full circle around it, which is why the move read as a
     * flourish rather than as a turn. Flattening the horizontal axis to a
     * vertical line and back is the whole trick — it is what a body rotating
     * through 180° looks like in a silhouette, it costs one `scale`, and unlike
     * anything drawn in detail it survives being 60px tall on a phone.
     *
     * Two details are deliberate. It is **squared, so it never goes negative**:
     * the blade is drawn inside this same transform, so a signed `cos` would
     * mirror the sword to the fighter's other side halfway through and fight
     * the arc its own keyframes are drawing. And it turns **once**, not twice —
     * this move's blade goes up, holds, and comes down rather than sweeping a
     * full revolution, so a body that went edge-on twice would be turning
     * faster than the sword it is supposed to be following. Squaring also makes
     * it linger near full width instead of passing through it linearly, which
     * is the difference between a person turning and a sheet of paper. The
     * floor keeps a sliver so the silhouette never quite vanishes.
     */
    const p = Math.min(1, f.mf / MOVES.spin_attack.frames);
    const turn = Math.cos(p * Math.PI);
    ctx.scale(Math.max(0.12, turn * turn * 0.86 + 0.14), 1);
  } else if (f.move === "flip_over") {
    /*
     * **The somersault somersaults** (TODO B). Its own comment described "a
     * still blade under a tumbling body" and there was no tumble: the figure
     * floated over upright with its legs tucked, and the only `ctx.rotate` in
     * the renderer was the death tip-over. It is the most recognisable move in
     * the genre and it was a hop.
     *
     * Three things here are derived rather than typed, which is the point:
     *
     * The window comes out of the move's **own impulse**. A projectile launched
     * at `vy` under a constant gravity is in the air for `2·vy/g` frames, so the
     * rotation starts on the frame the impulse fires and ends on the frame the
     * feet arrive. Retune the jump and the tumble retimes itself; write 44 here
     * instead and the next person to touch `impulse` lands a fighter mid-turn.
     *
     * The turn is **exactly one revolution and exactly linear**, so the figure
     * is upright at take-off and upright again at touchdown with no ease
     * needed — a somersault has constant angular velocity, and the steps at
     * either end are the kick into it and the stop on landing. Anything smoothed
     * here reads as floating, which is the complaint this move started with.
     *
     * It rotates about the **body's middle**, not the feet: a tumbling figure
     * turns about its own mass, and about the feet it is a pole vault.
     *
     * Positive is forward — the head goes the way the body is travelling —
     * because this is inside the `scale(facing, 1)` mirror, so "forward" is
     * already whichever way the fighter faces. The mirror is also why the
     * facing freeze in `stepFighter` matters more here than anywhere: without
     * it the whole figure flips inside out on the frame it crosses the
     * opponent, which is the one frame everybody is looking at.
     */
    const m = MOVES.flip_over;
    const at = m.impulse?.at ?? 0;
    const flight = (2 * Math.abs(m.impulse?.vy ?? 0)) / GRAVITY;
    const p = Math.max(0, Math.min(1, (f.mf - at) / flight));
    ctx.translate(0, BODY_H / 2);
    ctx.rotate(p * TAU);
    ctx.translate(0, -BODY_H / 2);
  } else if (f.move === "duck") {
    /*
     * The crouch. A whole-body compression about the feet, widening a little as
     * it drops, because that is what a body does and because at 60px tall a
     * pose made of new parts is a smudge while a change of proportion is
     * legible. It rises and falls on a sine so the deepest point sits in the
     * middle of the move, which is where `strike_level` holds its blade.
     */
    const p = Math.min(1, f.mf / MOVES.duck.frames);
    const crouch = Math.sin(Math.PI * p) * 0.34;
    ctx.translate(0, cxFeet);
    ctx.scale(1 + crouch * 0.2, 1 - crouch);
    ctx.translate(0, -cxFeet);
  }

  /** Travel, in local units: positive is forward whichever way the figure faces. */
  const localVx = f.vx * f.facing;
  /** Lean into travel, knocked back by a fresh hit. The feet stay planted. */
  const lean = Math.max(-5, Math.min(5, localVx * 1.4)) - f.flash * 4;
  const breath = Math.sin(st.idle * 0.045 + f.phase) * 1.1;
  const airborne = f.y < FLOOR_Y - 0.5;
  const speed = Math.min(1, Math.abs(localVx) / 2.2);
  // -8, not -15: at -15 there were a measured 9.02 world units of empty canvas
  // between the top of the spine stroke and the bottom of the head disc — over
  // half a head, reading as a head floating clear of the shoulders, and none of
  // the four style marks reaches down far enough to bridge it.
  const headY = -8 + breath * 0.6;

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

  const kind = FIGHTERS[f.style];
  /*
   * The three render-only multipliers. `weight` runs through every stroke, so a
   * heavy fighter is *built* heavier rather than merely drawn bigger; `shoulder`
   * widens the bar and both arm roots, which is where a square silhouette comes
   * from; `hunch` carries the neck forward. None of them reaches the simulation
   * — `FighterKind.prop` says why there is deliberately no height multiplier.
   */
  const lw = (n: number) => n * kind.prop.weight;
  const shX = SHOULDER_X * kind.prop.shoulder;
  const hr = 8 * kind.prop.head;

  /*
   * The stance settles the hips and nothing else.
   *
   * The feet stay on the floor and the shoulder line does not move, so a low
   * guard is drawn by bending the knees — `joint` has fixed bones, so shortening
   * the hip-to-foot distance *is* the bend — and by shortening the spine. That
   * containment is deliberate: `bladeLocal` hangs the grip off the shoulder, so
   * a stance that moved the shoulders would hand this fighter a blade whose
   * drawn length disagreed with the one `bladeGap` and every contact frame in
   * `MOVES` are working from. Same reason `prop` has no height multiplier.
   *
   * It is suppressed while airborne and while dead, where the pose is the
   * move's rather than the character's.
   */
  const stance = kind.stance;
  const settle = airborne || dead ? 0 : stance.settle;
  const hipY = TORSO_H + settle;
  const shY = SHOULDER_Y + breath;
  const neckX = lean * 0.9 + kind.prop.hunch;

  /*
   * Both hands, solved before anything is drawn rather than beside the arm that
   * uses them: a sleeve hangs off an elbow, and the costume's back hook runs
   * before the arms do. Same expressions as before, moved up.
   */
  let offHandX = g.hx - Math.cos(f.bladeA) * 8;
  let offHandY = g.hy - Math.sin(f.bladeA) * 8;
  if (f.action === "force") {
    offHandX = -4 + 30 * Math.min(1, forceP * 2.5);
    offHandY = 21;
  } else if (f.action === "kicking") {
    // Thrown out for balance, which is what a kick actually needs.
    offHandX = -22;
    offHandY = 12;
  } else if (thrown) {
    // Nothing to hold. Down at the side, so the two arms disagree and the
    // extended one reads as the one doing something.
    offHandX = -8;
    offHandY = 28;
  }
  // An empty hand held out toward the blade it has just thrown, rather than
  // clutching a grip that is fifty units away. It is the same arm; only the
  // target changes.
  const handX = thrown ? 26 : g.hx;
  const handY = thrown ? 10 : g.hy;

  /*
   * What the costume is told about the body it is dressing.
   *
   * `vx` is clamped, and that is the one line in here worth defending. Cloth
   * trails by travel, and the impulses in `MOVES` reach several units a frame —
   * unclamped, a cape or a tail is flung the better part of a body-length
   * behind its owner for the one frame of a launch, which reads as the drawing
   * tearing rather than as speed. Costume travel is a *reading* of movement,
   * not a measurement of it.
   */
  const costume: CostumeCtx = {
    hx: neckX,
    hy: headY + 6,
    hr,
    shY,
    shX,
    hipY,
    hipX: HIP_X,
    feetY: BODY_H,
    lean,
    vx: Math.max(-3.5, Math.min(3.5, localVx)),
    speed,
    airborne,
    t: st.idle,
    phase: f.phase,
    ink: v.ink,
    blade,
    dim: v.dim,
    alpha: bodyAlpha,
    hand: { x: handX, y: handY },
    elbow: joint(shX + lean, shY, handX, handY, UPPER_ARM, FOREARM, -1),
    offHand: { x: offHandX, y: offHandY },
    offElbow: joint(-shX + lean, shY, offHandX, offHandY, OFF_UPPER_ARM, OFF_FOREARM, 1),
    lw,
  };

  /*
   * The costume behind the body — capes, wings, tails, robe skirts — drawn
   * first so the limbs read *over* it. A cape drawn last swallows the legs it
   * is supposed to hang off, which is most of how the filled version the client
   * rejected turned two swordsmen into two slabs.
   *
   * It runs on a dead fighter too, deliberately: the corpse is rotated flat
   * about its own feet inside this same transform, so the cloth goes down with
   * it and lies on the ground, and the pairing stays legible through the two
   * seconds anybody actually looks at the loser.
   */
  if (kind.back) {
    ctx.save();
    kind.back(ctx, costume);
    ctx.restore();
  }

  // ---- legs, behind everything -------------------------------------------
  const kickP = f.action === "kicking" ? Math.min(1, f.mf / MOVES[f.move].frames) : 0;
  const kickReach = Math.sin(Math.PI * Math.min(1, kickP * 1.4)) * 34;
  const brace = f.action === "attacking" ? 5 : 0;
  ctx.globalAlpha = bodyAlpha;
  ctx.strokeStyle = v.ink;
  for (let i = 0; i < 2; i += 1) {
    const front = i === 0;
    const hipX = front ? HIP_X : -HIP_X;
    /*
     * **The feet used to stand inside the hips**, at ±4 against a hip at ±7,
     * which is not a guard — it is a person standing to attention, and with the
     * knees bent by the crouch it came out as a duck-footed squat on all eight
     * fighters at once. The stance's own spread puts them outside the hips and
     * makes the base of the figure say something about who is standing on it:
     * the mask plants at 14, the apprentice lunges at 16, the saint stands
     * nearly closed at 6.
     */
    let footX = front ? stance.spread + brace : -stance.spread - brace;
    // The back heel, lifted. A raised heel is the whole difference between a
    // stance that has arrived and one that is about to leave.
    let footY = BODY_H - (front ? 0 : stance.heel);
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
    limb(hipX, hipY, footX, footY, THIGH, SHIN, -1, lw(front ? 5 : 4));
  }

  // ---- spine and head -----------------------------------------------------
  ctx.globalAlpha = bodyAlpha;
  ctx.strokeStyle = v.ink;
  ctx.lineWidth = lw(6);
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(neckX, shY - 2);
  ctx.stroke();

  ctx.lineWidth = lw(5);
  ctx.beginPath();
  ctx.moveTo(-shX + lean, shY);
  ctx.lineTo(shX + lean, shY);
  ctx.stroke();

  /*
   * Torso mass, for the two fighters whose character is that they are built
   * heavily: the two *edges* of a chest, from the shoulder bar down to the
   * hips, and nothing between them.
   *
   * This is the shape the client rejected in 2026-08-14 — with the difference
   * that made it rejected removed. What read as *"they are holding shields"*
   * was a **filled** quad: a pale slab as wide as the figure was tall, which
   * swallowed the spine and both arms into one silhouette. Two strokes with the
   * spine still visible between them is a ribcage, and it is the only way this
   * rig can say *heavy* about a body rather than about a line width. It is
   * spent on two fighters out of eight on purpose: the light ones keep the
   * plain stick, and that contrast is what makes the heavy ones read heavy.
   */
  if (kind.prop.build > 0) {
    ctx.globalAlpha = bodyAlpha * (0.55 + kind.prop.build * 0.3);
    ctx.lineWidth = lw(3.2);
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * (shX - 1.5) + lean, shY + 1);
      ctx.quadraticCurveTo(
        s * (shX - 1) * kind.prop.build + lean * 0.5,
        (shY + hipY) / 2,
        s * (HIP_X + 1),
        hipY - 2,
      );
    }
    ctx.stroke();
    ctx.globalAlpha = bodyAlpha;
  }

  // A hollow costume has no head: the point of an empty cowl is that there is
  // nothing inside it, and a disc drawn under the hood makes it a hat.
  if (!kind.hollow) {
    ctx.fillStyle = v.ink;
    ctx.beginPath();
    ctx.arc(neckX, headY + 6, hr, 0, TAU);
    ctx.fill();
  }

  // ---- the off hand -------------------------------------------------------
  // On the grip, a little below the sword hand, unless the arm is pushing —
  // solved above, with the costume's.
  ctx.globalAlpha = bodyAlpha * 0.85;
  ctx.strokeStyle = v.ink;
  limb(-shX + lean, shY, offHandX, offHandY, OFF_UPPER_ARM, OFF_FOREARM, 1, lw(4.5));

  // ---- the sword arm ------------------------------------------------------
  if (!dead) {
    ctx.globalAlpha = bodyAlpha;
    limb(shX + lean, shY, handX, handY, UPPER_ARM, FOREARM, -1, lw(5));
  }

  /*
   * Sleeves and anything hanging off a hand, over the arms because that is
   * where they are. The one hook that is allowed to know about the limbs, which
   * is why `CostumeCtx` carries both hands and both elbows.
   */
  if (kind.overlay) {
    ctx.save();
    kind.overlay(ctx, costume);
    ctx.restore();
  }

  /*
   * The head mark, and it is still where most of the recognition lives.
   *
   * The four marks that used to be inlined here are the first four entries of
   * `FIGHTERS` now, with the roster's other hooks around them. The reason they
   * were *only* head marks is worth keeping, because it is also the reason the
   * torso hooks are safe to have at all: everything that used to distinguish
   * these figures below the neck (capes, auras, tunics, chest panels, belts) was
   * **filled** geometry, and filled geometry composited into one pale slab that
   * the client read, correctly, as a shield. A stroked cape is not that shape,
   * and the ornament's camera — which landed after those marks were written —
   * has since roughly doubled the size a fighter renders at, which is what makes
   * a torso-level read legible in the first place.
   *
   * Drawn inside the head's own translate, so a costume can be written about a
   * skull at the origin and needs to know nothing about lean or hunch.
   */
  if (kind.head) {
    ctx.save();
    ctx.translate(neckX, 0);
    kind.head(ctx, costume);
    ctx.restore();
  }

  // Hit feedback: the figure flares in the spark colour.
  if (f.flash > 0) {
    ctx.globalAlpha = f.flash * 0.55 * v.dim;
    ctx.strokeStyle = v.spark;
    ctx.lineWidth = lw(7);
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(neckX, shY - 2);
    ctx.stroke();
  }

  /*
   * ---- the force rings ----------------------------------------------------
   *
   * **A pull's rings converge; a push's expand** (TODO B, 2026-08-16). Both
   * force moves drew the same outward-travelling, fading rings, so the two were
   * visually identical — and once `force_pull` was fixed to actually drag its
   * victim inward, an expanding ring was arguing with the thing it was drawn on
   * top of. Reversing the radius and the fade is the whole difference: rings
   * arriving and brightening read as gathering, rings leaving and dimming read
   * as shoving.
   */
  if (f.action === "force" && forceP > 0.3 && forceP < 0.9) {
    const q = (forceP - 0.3) / 0.6;
    const pulling = f.move === "force_pull";
    ctx.strokeStyle = v.spark;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const t = pulling ? 1 - q : q;
      const r = (t * 90 + i * 14) % 110;
      ctx.globalAlpha = (pulling ? q : 1 - q) * 0.4 * v.dim;
      ctx.beginPath();
      ctx.arc(offHandX + 6, offHandY, Math.max(4, r), -0.8, 0.8);
      ctx.stroke();
    }
  }

  // ---- the blade ---------------------------------------------------------
  // The ~1.5% length wobble in `flick` is what makes it look *held* rather than
  // drawn, and the hand it hangs from is solved from the blade's own angle, so
  // the tip travels through space instead of pivoting around the torso.
  if (!dead && !thrown) {
    // Three passes — widest and faintest first — so the glow falls away from a
    // bright core without a gradient.
    //
    // The outer pass is **additive**, which is the bloom `docs/DUEL-ABSORB.md`
    // signs off on: *"if bloom is wanted, it is a second additive stroke, not a
    // shadow"*. Canvas shadow-blur is a separate blur pass and the reference
    // engine spends ~5,700 shadowed draws a second on it; this costs one stroke
    // and, unlike the shadow, cannot darken anything behind the blade.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = blade;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(g.hx, g.hy);
    ctx.lineTo(g.tx, g.ty);
    ctx.stroke();
    ctx.restore();

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

  /*
   * ---- the blade, when it is not in a hand ---------------------------------
   *
   * Drawn out here in world units because that is where it is: a thrown blade
   * has left the body transform along with the hand that was holding it, and
   * running it through the mirror and the crouch would tie a free-flying object
   * to the pose of the person who let go of it.
   *
   * Same three passes as the held blade — faint glow, mid, bright core — so it
   * is recognisably the same sword, and lit a little hotter because a blade
   * alone against the background has nothing next to it to be brighter than.
   */
  if (thrown) {
    for (const [style, width, alpha] of [
      [blade, 10, 0.22],
      [blade, 4.5, 0.55],
      [v.core, 1.8, 1],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha * v.dim;
      ctx.beginPath();
      ctx.moveTo(thrown.hx, thrown.hy);
      ctx.lineTo(thrown.tx, thrown.ty);
      ctx.stroke();
    }
  }

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

/**
 * What a camera has to keep in frame this instant, in world units.
 *
 * Exported rather than derived by the caller because it is the one part of
 * framing that is *geometry* — how wide a body is, how much clearance a head
 * needs — and those are constants of this module. Where to put the resulting
 * box, how fast to chase it and how far to zoom are presentation, and belong to
 * whoever is drawing.
 *
 * `top` is where the higher fighter is **going**, not where they are. A rising
 * fighter is a projectile under a constant gravity, so the apex is known in
 * closed form on the frame the impulse fires — `v²/2g` above the current
 * height — and reporting it means the camera starts pulling back at the bottom
 * of the jump instead of chasing it up. Reporting the current height instead
 * looks like it should work and does not: the somersault rises ~145 units in
 * about 22 frames, an eased zoom cannot cover that from a standing start, and
 * the jumper leaves through the top of the slot for a fifth of a second every
 * time. A camera that anticipates is also simply what a camera operator is.
 *
 * Blade tips are deliberately *not* included: an overhead wind-up throws the
 * tip a long way in two frames, and a camera chasing it would pump on every
 * swing. A blade leaving the frame for a moment reads as framing; the figure
 * leaving it reads as a bug.
 */
export function duelFocus(st: DuelState): { cx: number; width: number; top: number } {
  const apex = (f: Fighter) => f.y - (f.vy < 0 ? (f.vy * f.vy) / (2 * GRAVITY) : 0);
  /*
   * **A dead fighter lies down, and the camera has to be told** (2026-08-16).
   *
   * `drawFighter` rotates a corpse 90° about its feet, so it stops being 30
   * units wide and becomes about 87 — but this reported `BODY_W` for it either
   * way, and derived the centre from the two upright body centres. So for the
   * whole victory hold the camera framed a standing pair that was not there and
   * let the fallen one hang out of the side: measured at the ornament's buffer,
   * **84.6% of death-hold frames clipped a body, the worst by 173px of 700** —
   * a quarter of the frame gone, during the two seconds the design nominates as
   * the announcement. Death holds are 7.4% of all frames.
   *
   * So each fighter reports the span it actually occupies and the frame is
   * built from the union of the two, rather than from their centres.
   */
  const span = (f: Fighter) => {
    const c = centre(f);
    if (f.action !== "dead") return { lo: c - BODY_W / 2, hi: c + BODY_W / 2 };
    const toe = c - f.facing * (BODY_H + 17);
    return { lo: Math.min(c, toe), hi: Math.max(c, toe) };
  };
  const a = span(st.a);
  const b = span(st.b);
  const lo = Math.min(a.lo, b.lo);
  const hi = Math.max(a.hi, b.hi);
  /*
   * **Clearance is per costume, because the costumes are not the same height.**
   *
   * This was a flat 26 units above the torso origin, which is a head (10) plus
   * air, and it was right for four marks that all sat on the skull. A roster
   * has horns, a halo and a pair of wings in it: the wings reach 21 units above
   * the origin on their own, so a fixed 26 left five units of air above the tips
   * — the camera would frame them shaved off at the top of the ornament with
   * nothing in the code saying why. Each entry declares its `headroom` and
   * `npm run check` re-derives it by driving the hooks, so the number cannot
   * drift away from the drawing.
   */
  const clear = (f: Fighter) => Math.max(26, FIGHTERS[f.style].headroom + 16);
  return {
    cx: (lo + hi) / 2,
    width: hi - lo,
    top: Math.min(apex(st.a) - clear(st.a), apex(st.b) - clear(st.b)),
  };
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
    // `* v.dim`: the bodies already fade with it, and sparks at full strength
    // behind body copy are exactly the legibility case `dim` exists for.
    ctx.globalAlpha = Math.min(1, sp.life) * 0.85 * v.dim;
    ctx.lineWidth = Math.max(0.8, 2.2 * sp.life);
    ctx.beginPath();
    ctx.moveTo(sp.x - sp.vx * 1.8, sp.y - sp.vy * 1.8);
    ctx.lineTo(sp.x, sp.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
