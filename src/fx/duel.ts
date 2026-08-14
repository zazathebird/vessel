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

const SLASH_FRAMES = 15;
const KICK_FRAMES = 20;
const FORCE_FRAMES = 30;

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

function spawnSparks(st: DuelState, x: number, y: number, n: number): void {
  // The reference's 15-particle burst at the point of contact.
  for (let i = 0; i < n; i += 1) {
    const ang = Math.random() * TAU;
    const speed = 1.5 + Math.random() * 4;
    st.sparks.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 2,
      life: 1,
    });
  }
}

/** Where a fighter's blade meets the opponent — chest height, between the two. */
function contactPoint(f: Fighter, foe: Fighter): { x: number; y: number } {
  return { x: (centre(f) + centre(foe)) / 2, y: foe.y + BODY_H * 0.3 };
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
  if (f.action === "attacking" && !f.struck && elapsed >= 5) {
    f.struck = true;
    if (f.willHit && dist <= FAR + 20) {
      const hit = contactPoint(f, foe);
      damage(st, foe, (8 + Math.random() * 5) * f.attackPower);
      foe.vx += f.facing * 2;
      spawnSparks(st, hit.x, hit.y, 15);
    }
  } else if (f.action === "kicking" && !f.struck && elapsed >= 8) {
    f.struck = true;
    if (dist <= 100) {
      // The kick's job is the knockback more than the damage.
      damage(st, foe, 6);
      foe.vx += f.facing * 7;
      spawnSparks(st, centre(foe), foe.y + BODY_H * 0.55, 6);
    }
  } else if (f.action === "force" && !f.struck && elapsed >= 15) {
    f.struck = true;
    if (dist <= 320) {
      damage(st, foe, (12 + Math.random() * 7) * f.forcePower);
      foe.vx += f.facing * 9;
      spawnSparks(st, centre(foe), foe.y + BODY_H * 0.35, 10);
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

  for (const f of [st.a, st.b]) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= DECAY;
    if (f.y < FLOOR_Y) {
      f.vy += GRAVITY;
    } else {
      f.y = FLOOR_Y;
      f.vy = 0;
    }
    f.x = Math.max(20, Math.min(WORLD_W - 20 - BODY_W, f.x));
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

/** The blade's screen angle for the current action. 0 is level, negative up. */
function bladeAngle(f: Fighter, foe: Fighter, idle: number): number {
  const bob = Math.sin(idle * 0.05 + f.phase) * 0.06;
  if (foe.action === "dead") return -1.3 + bob;
  switch (f.action) {
    case "attacking": {
      // Fast strike, slow recovery — the single-easing drift is exactly what
      // made the first version float, so the split is the point of this branch.
      const p = 1 - f.timer / SLASH_FRAMES;
      if (p < 0.4) {
        const q = p / 0.4;
        return -1.5 + (0.55 - -1.5) * (q * q);
      }
      const q = (p - 0.4) / 0.6;
      return 0.55 + (-0.55 - 0.55) * (q * (2 - q));
    }
    case "force":
      return -2.3 + bob;
    case "kicking":
      return -0.4 + bob;
    default:
      return -0.55 + bob;
  }
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  st: DuelState,
  f: Fighter,
  foe: Fighter,
  blade: string,
  v: DuelView,
): void {
  const cx = centre(f);
  const facing = f.facing;

  if (f.action === "dead") {
    // Tip over during the first dozen frames of the hold, then lie flat.
    const p = Math.min(1, (DEATH_HOLD - st.over) / 12);
    ctx.save();
    ctx.translate(cx, FEET_Y);
    ctx.rotate(-facing * p * (Math.PI / 2));
    ctx.globalAlpha = 0.6 * v.dim;
    ctx.fillStyle = v.ink;
    ctx.fillRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H);
    ctx.fillRect(-9, -BODY_H - 15, 18, 15);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const bodyAlpha = 0.85 * v.dim;
  ctx.fillStyle = v.ink;

  // Capes, robes and wings hang behind, drawn first so the body covers their
  // top edge. Each style's back layer is half its likeness; the head block and
  // the chest dressing below do the other half.
  if (f.style === "caped") {
    // Floor-length cape, wide enough to read as a garment rather than a fin.
    ctx.globalAlpha = 0.4 * v.dim;
    ctx.beginPath();
    ctx.moveTo(cx - facing * 4, f.y + 2);
    ctx.lineTo(cx - facing * 30, f.y + BODY_H * 0.55);
    ctx.lineTo(cx - facing * 24, FEET_Y);
    ctx.lineTo(cx - facing * 6, f.y + BODY_H);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "haloed") {
    // The aura: a faint disc of the figure's own light, behind everything.
    ctx.globalAlpha = 0.08 * v.dim;
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.arc(cx, f.y + 22, 46, 0, TAU);
    ctx.fill();
    // The robe: the body block flares to the feet.
    ctx.globalAlpha = 0.6 * v.dim;
    ctx.fillStyle = v.ink;
    ctx.beginPath();
    ctx.moveTo(cx - BODY_W / 2, f.y + BODY_H * 0.4);
    ctx.lineTo(cx - BODY_W / 2 - 8, FEET_Y);
    ctx.lineTo(cx + BODY_W / 2 + 8, FEET_Y);
    ctx.lineTo(cx + BODY_W / 2, f.y + BODY_H * 0.4);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "horned") {
    // One bat wing on the trailing side — the scalloped edge is what stops it
    // reading as a cape.
    ctx.globalAlpha = 0.3 * v.dim;
    ctx.beginPath();
    ctx.moveTo(cx - facing * 5, f.y + 8);
    ctx.lineTo(cx - facing * 36, f.y - 10);
    ctx.lineTo(cx - facing * 28, f.y + 10);
    ctx.lineTo(cx - facing * 38, f.y + 18);
    ctx.lineTo(cx - facing * 26, f.y + 26);
    ctx.lineTo(cx - facing * 30, f.y + 36);
    ctx.lineTo(cx - facing * 6, f.y + 24);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "hooded") {
    // The tunic skirt below the belt — the robe's lower half.
    ctx.globalAlpha = 0.35 * v.dim;
    ctx.beginPath();
    ctx.moveTo(cx - BODY_W / 2, f.y + BODY_H * 0.55);
    ctx.lineTo(cx - BODY_W / 2 - 5, FEET_Y);
    ctx.lineTo(cx + BODY_W / 2 + 5, FEET_Y);
    ctx.lineTo(cx + BODY_W / 2, f.y + BODY_H * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // The body: the reference's plain filled block, 30×70.
  ctx.globalAlpha = bodyAlpha;
  ctx.fillRect(f.x, f.y, BODY_W, BODY_H);

  // The head block, and the silhouette feature that names each figure.
  const headY = f.y - 15;
  ctx.fillRect(cx - 9, headY, 18, 15);
  if (f.style === "hooded") {
    // The hood, deep enough to shadow the face at silhouette scale.
    ctx.beginPath();
    ctx.moveTo(cx - facing * 14, headY + 15);
    ctx.lineTo(cx + facing * 2, headY - 10);
    ctx.lineTo(cx + facing * 13, headY + 11);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "caped") {
    // The helmet: a rounded dome over the flared jaw line.
    ctx.beginPath();
    ctx.arc(cx, headY + 2, 13, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 12, headY + 9);
    ctx.lineTo(cx - 17, headY + 17);
    ctx.lineTo(cx + 17, headY + 17);
    ctx.lineTo(cx + 12, headY + 9);
    ctx.closePath();
    ctx.fill();
  } else if (f.style === "haloed") {
    // Shoulder-length hair, wider than the head so it survives silhouette.
    ctx.fillRect(cx - 14, headY, 5, 23);
    ctx.fillRect(cx + 9, headY, 5, 23);
    ctx.fillRect(cx - 10, headY - 3, 20, 5);
    // The halo floats clear of the head: a bright ring inside a soft glow.
    ctx.strokeStyle = blade;
    ctx.globalAlpha = 0.35 * v.dim;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, headY - 10, 14, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.95 * v.dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, headY - 10, 14, 5, 0, 0, TAU);
    ctx.stroke();
  } else {
    // Horns that curve back the way stick-on triangles don't.
    ctx.beginPath();
    ctx.moveTo(cx - 8, headY + 2);
    ctx.quadraticCurveTo(cx - 15, headY - 6, cx - 11, headY - 15);
    ctx.quadraticCurveTo(cx - 9, headY - 6, cx - 4, headY - 1);
    ctx.closePath();
    ctx.moveTo(cx + 8, headY + 2);
    ctx.quadraticCurveTo(cx + 15, headY - 6, cx + 11, headY - 15);
    ctx.quadraticCurveTo(cx + 9, headY - 6, cx + 4, headY - 1);
    ctx.closePath();
    ctx.fill();
  }

  // The front-of-body dressing that names each figure at chest height. Ink on
  // ink is invisible, so everything here borrows a colour the palette already
  // assigned to this fighter.
  if (f.style === "caped") {
    // The lit chest panel and belt boxes, in the spark colour.
    ctx.fillStyle = v.spark;
    ctx.globalAlpha = 0.9 * v.dim;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        ctx.fillRect(cx - 6 + col * 8, f.y + 15 + row * 6, 3, 3);
      }
    }
    ctx.globalAlpha = 0.6 * v.dim;
    ctx.fillRect(cx - 10, f.y + 42, 5, 5);
    ctx.fillRect(cx + 5, f.y + 42, 5, 5);
    ctx.fillStyle = v.ink;
  } else if (f.style === "hooded") {
    // The belt, in the fighter's own blade colour.
    ctx.fillStyle = blade;
    ctx.globalAlpha = 0.5 * v.dim;
    ctx.fillRect(f.x, f.y + 36, BODY_W, 4);
    ctx.fillStyle = v.ink;
  } else if (f.style === "horned") {
    // The tail sways behind and ends in the spade tip.
    const sway = Math.sin(st.idle * 0.06 + f.phase) * 5;
    const tailTipX = cx - facing * 32;
    const tailTipY = f.y + BODY_H - 26 + sway;
    ctx.strokeStyle = v.ink;
    ctx.globalAlpha = 0.7 * v.dim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - facing * 10, f.y + BODY_H - 6);
    ctx.quadraticCurveTo(cx - facing * 36, f.y + BODY_H + 10, tailTipX, tailTipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tailTipX - 5, tailTipY - 2);
    ctx.lineTo(tailTipX + 5, tailTipY - 2);
    ctx.lineTo(tailTipX, tailTipY - 11);
    ctx.closePath();
    ctx.fill();
  }

  // Hit feedback: the body flashes in the spark colour for a few frames.
  if (f.flash > 0) {
    ctx.globalAlpha = f.flash * 0.5 * v.dim;
    ctx.fillStyle = v.spark;
    ctx.fillRect(f.x, f.y, BODY_W, BODY_H);
  }

  ctx.lineCap = "round";

  // The kick: the front leg extends toward the opponent and retracts.
  if (f.action === "kicking") {
    const p = 1 - f.timer / KICK_FRAMES;
    const reach = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 34;
    ctx.globalAlpha = bodyAlpha;
    ctx.strokeStyle = v.ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx, f.y + BODY_H - 14);
    ctx.lineTo(cx + facing * (8 + reach), f.y + BODY_H - 14 - reach * 0.5);
    ctx.stroke();
  }

  // The force push: the free arm extends, and rings roll out from the palm.
  const shX = cx + facing * 10;
  const shY = f.y + 14;
  if (f.action === "force") {
    const p = 1 - f.timer / FORCE_FRAMES;
    ctx.globalAlpha = bodyAlpha;
    ctx.strokeStyle = v.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(shX, shY + 8);
    ctx.lineTo(shX + facing * 22 * Math.min(1, p * 2.5), shY + 8);
    ctx.stroke();
    if (p > 0.3 && p < 0.9) {
      const q = (p - 0.3) / 0.6;
      ctx.strokeStyle = v.spark;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const r = (q * 90 + i * 14) % 110;
        ctx.globalAlpha = (1 - q) * 0.4 * v.dim;
        ctx.beginPath();
        ctx.arc(shX + facing * 26, shY + 8, Math.max(4, r), -0.8, 0.8, facing < 0);
        ctx.stroke();
      }
    }
  }

  // The blade, from the leading hand. Three passes — widest and faintest
  // first — so the glow falls away from a bright core without a gradient.
  // A ~1.5% length wobble is what makes the blade look *held* rather than drawn.
  const a = bladeAngle(f, foe, st.idle);
  const flick =
    1 + (Math.sin(st.idle * 0.8 + f.phase) + Math.sin(st.idle * 1.37 + f.phase * 2)) * 0.008;
  const handX = shX + facing * 8;
  const handY = shY + 6;
  const reach = 58 * flick;
  const tipX = handX + Math.cos(a) * facing * reach;
  const tipY = handY + Math.sin(a) * reach;

  ctx.strokeStyle = blade;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = v.core;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(handX, handY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // The floating health bar, in the fighter's own blade colour.
  if (v.bars) {
    ctx.globalAlpha = 0.3 * v.dim;
    ctx.fillStyle = v.ink;
    ctx.fillRect(cx - 17, f.y - 30, 34, 4);
    ctx.globalAlpha = 0.9 * v.dim;
    ctx.fillStyle = blade;
    ctx.fillRect(cx - 17, f.y - 30, 34 * (f.health / MAX_HEALTH), 4);
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

  drawFighter(ctx, st, st.a, st.b, v.bladeA, v);
  drawFighter(ctx, st, st.b, st.a, v.bladeB, v);

  ctx.fillStyle = v.spark;
  for (const sp of st.sparks) {
    ctx.globalAlpha = Math.min(1, sp.life) * 0.85;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, Math.max(1, 2 * sp.life), 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
