/**
 * Who is fighting — the roster, its costumes, and the pools each duel draws
 * from. Phase 2 of `docs/DUEL-ABSORB.md`.
 *
 * The client's requirement is *"make the characters obvious and instantly
 * identifiable"*, and their constraint on it is the reason this file has no
 * proper nouns in it: *"do not name them on pages that are not accessible only
 * by me, to avoid any copyright or legal bullshit."* The plan permitted real
 * names on operator-gated surfaces. **They are not used at all** — the roster is
 * archetypes, and the strings below are the only names that exist. That closes
 * the question the plan flagged for the client (real names would sit in the
 * public bundle even when never rendered) by never writing one down, and it
 * costs nothing: recognition here comes from silhouette, not from a caption.
 * The site already made this exact trade when it named the weapon a lightsword.
 *
 * ## Why this is a separate file from `duel.ts`
 *
 * It has **no runtime import from `duel.ts`** — only types, which are erased —
 * so there is no import cycle to reason about at module-init time, and
 * `BLADE_COLORS` can stay a plain literal that `drawDuel`'s callers read on
 * their first frame. Everything a costume needs about the body arrives in
 * `CostumeCtx`, which is also what keeps the two files honest with each other:
 * a costume cannot reach into the rig and quietly depend on a constant that the
 * simulation is entitled to retune.
 *
 * ## The two rules every costume obeys
 *
 * **Stroked, never filled.** The version the client rejected in 2026-08-14 drew
 * a filled torso quad, a filled head block and a filled robe behind them, which
 * composited into one pale slab about as wide as the figure was tall — read,
 * correctly, as *"they are holding shields"*. Every mark here is a stroke, and
 * `npm run check` fails on a costume hook that calls `fill` at all. Mass is
 * conveyed by outline and by stroke weight; that is the whole vocabulary.
 *
 * **Everything declares its reach.** `headroom` is how far above the torso
 * origin the costume actually goes, and `duelFocus` frames on it, so a wing or
 * a horn that outgrows its declaration would be cropped by the camera rather
 * than by anything visible in the code. The gate re-derives it by driving every
 * hook through a recording context, so the number cannot drift from the drawing.
 */

/** The roster's ids. Not a wire format — no share code or stored config names a
 *  fighter — so this may be reordered or added to freely. */
export type FighterStyle =
  | "hooded"
  | "caped"
  | "haloed"
  | "horned"
  | "maned"
  | "crowned"
  | "cowled"
  | "winged";

/**
 * The one deliberate literal-colour exception on the site (client request,
 * 2026-08-13): the good side fights in blue/green and the evil side in red,
 * in every palette. Everything else in the scene — bodies, sparks, ground,
 * blade cores, health-bar tracks — still reads the live palette and recolours
 * with the bleed.
 *
 * Kept as one table under the name the rest of the codebase greps for. The
 * alignment is declared *twice*, here and as `side` on the roster entry, and
 * `npm run check` fails if the two disagree — a good fighter holding a red
 * blade is the one way this carve-out can silently stop meaning anything.
 */
export const BLADE_COLORS: Record<FighterStyle, string> = {
  hooded: "#3d9bff",
  maned: "#3d9bff",
  haloed: "#37d67a",
  winged: "#37d67a",
  caped: "#ff3b30",
  cowled: "#ff3b30",
  horned: "#ff2929",
  crowned: "#ff2929",
};

/** Which end of the fight a costume belongs to. Decides the blade colour and,
 *  through the pools, guarantees every match is one of each. */
export type Alignment = "good" | "evil";

/**
 * Everything a costume is handed about the body it is dressing, in body-local
 * units: the origin is the top of the torso at its centre line and **+x is
 * forward**, because the whole figure is drawn inside `scale(facing, 1)`.
 *
 * Passing this rather than exporting the rig constants is deliberate. A costume
 * that read `SHOULDER_X` directly would break silently the next time the rig is
 * retuned; one that reads `c.shX` moves with it.
 */
export interface CostumeCtx {
  /** Centre of the head disc. `hx` is already leaned and hunched. */
  hx: number;
  hy: number;
  /** Head radius. */
  hr: number;
  /** Shoulder line, and its half-width — both already carry `proportion`. */
  shY: number;
  shX: number;
  hipY: number;
  hipX: number;
  /** The feet line. */
  feetY: number;
  /** Lean into travel, in local units. */
  lean: number;
  /** Forward travel this frame: positive is the way the fighter faces. */
  vx: number;
  /** 0–1 travel speed, for costume that trails. */
  speed: number;
  /** True while the fighter is off the ground. */
  airborne: boolean;
  /** World clock in frames, and this fighter's desync phase. */
  t: number;
  phase: number;
  /** Palette ink, this fighter's blade colour, and the scene's dim. */
  ink: string;
  blade: string;
  dim: number;
  /** Body alpha, already scaled by `dim`. */
  alpha: number;
  /** Where the hands and elbows ended up, for sleeves and props. */
  hand: { x: number; y: number };
  elbow: { x: number; y: number };
  offHand: { x: number; y: number };
  offElbow: { x: number; y: number };
  /** Stroke width, already carrying this fighter's weight multiplier. */
  lw: (n: number) => number;
}

export type Costume = (ctx: CanvasRenderingContext2D, c: CostumeCtx) => void;

export interface FighterKind {
  /** The public archetype. Deliberately never rendered — see the file note. */
  label: string;
  side: Alignment;
  /**
   * Render-only multipliers on the rig.
   *
   * **There is deliberately no height multiplier.** The blade is drawn inside
   * the same transform as the body and its length feeds `bladeGap`, the clash
   * test and every contact frame in `MOVES`; a figure scaled vertically would
   * hold a sword whose drawn length disagreed with the one the simulation is
   * using, which is the "proximity is not contact" class of bug that has cost
   * this effect the most. Width, weight and hunch touch nothing the simulation
   * reads.
   */
  prop: {
    /** Shoulder half-width multiplier. */
    shoulder: number;
    /** Stroke width multiplier — how heavy the figure is built. */
    weight: number;
    /** Forward offset of the neck and head, in local units. */
    hunch: number;
  };
  /** World units the costume reaches above the torso origin. Gated. */
  headroom: number;
  /** Suppress the head disc — for a cowl that is meant to be empty. */
  hollow?: boolean;
  /** Behind the body: capes, wings, tails, skirts. */
  back?: Costume;
  /** On the skull, drawn after the head disc. Carries most of the recognition. */
  head?: Costume;
  /** Over the arms: sleeves and anything that hangs off a hand. */
  overlay?: Costume;
}

/** Set up a hook's stroke. Every costume opens with one of these. */
function ink(ctx: CanvasRenderingContext2D, c: CostumeCtx, width: number, alpha = 1): void {
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = c.alpha * alpha;
  ctx.lineWidth = c.lw(width);
  ctx.beginPath();
}

/**
 * The roster.
 *
 * Each entry is **one read**, chosen to survive the size these actually render
 * at — the ornament camera puts the median figure at ~61px on a phone and
 * ~109px on desk, which is enough for a torso-level mark and nowhere near
 * enough for a face. Where two fighters could be confused at a glance they are
 * kept in different pools, so they never meet.
 */
export const FIGHTERS: Record<FighterStyle, FighterKind> = {
  /**
   * The hood, kept exactly as it was: a peak over the skull. It is the oldest
   * mark here and the one the client has already seen and not objected to.
   * The robe hem is new — at the old figure size the head was genuinely the
   * only place a difference survived, and the camera has since changed that.
   */
  hooded: {
    label: "The Hermit",
    side: "good",
    prop: { shoulder: 1, weight: 1, hunch: 0 },
    headroom: 18,
    head: (ctx, c) => {
      ink(ctx, c, 3);
      ctx.moveTo(-10, c.hy + 6);
      ctx.lineTo(1, c.hy - 15);
      ctx.lineTo(10, c.hy + 4);
      ctx.stroke();
    },
    back: (ctx, c) => {
      // A robe reaching the shins, drawn as its own two edges rather than as a
      // shape: the near edge swings with travel, the far one lags, and the hem
      // between them is what says "cloth" at 60px.
      const sway = Math.sin(c.t * 0.031 + c.phase) * 1.4 - c.vx * 1.9;
      ink(ctx, c, 2.6, 0.9);
      ctx.moveTo(-c.hipX - 2, c.hipY - 6);
      ctx.quadraticCurveTo(-12, c.hipY + 10, -11 + sway, c.feetY - 9);
      ctx.moveTo(c.hipX + 2, c.hipY - 6);
      ctx.quadraticCurveTo(11, c.hipY + 10, 9 + sway * 0.6, c.feetY - 11);
      ctx.stroke();
      ink(ctx, c, 2.2, 0.75);
      ctx.moveTo(-11 + sway, c.feetY - 9);
      ctx.quadraticCurveTo(-1 + sway, c.feetY - 4, 9 + sway * 0.6, c.feetY - 11);
      ctx.stroke();
    },
  },

  /**
   * The apprentice: hair falling past the jaw, and a robe skirt split down the
   * middle so one panel trails and the other leads. The split is the read — it
   * is what separates this from the hood at a glance, and the two are in the
   * same pool, so they have to be separable while moving.
   */
  maned: {
    label: "The Apprentice",
    side: "good",
    prop: { shoulder: 0.96, weight: 0.94, hunch: 0 },
    headroom: 10,
    head: (ctx, c) => {
      ink(ctx, c, 2.8);
      // Past the jaw and onto the shoulders. Stopping at the jaw made two small
      // lobes that read as ears; the length is what makes it hair.
      ctx.moveTo(-c.hr + 3, c.hy - c.hr + 1);
      ctx.quadraticCurveTo(-c.hr - 6, c.hy + 3, -c.hr - 3, c.hy + 17);
      ctx.moveTo(c.hr - 2, c.hy - c.hr + 2);
      ctx.quadraticCurveTo(c.hr + 5, c.hy + 4, c.hr + 1, c.hy + 15);
      ctx.stroke();
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.037 + c.phase) * 1.6;
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(-c.hipX, c.hipY - 2);
      ctx.quadraticCurveTo(-13, c.hipY + 14, -13 - c.vx * 2.4 + sway, c.feetY - 12);
      ctx.moveTo(c.hipX, c.hipY - 2);
      ctx.quadraticCurveTo(11, c.hipY + 13, 10 - c.vx * 1.2 + sway, c.feetY - 14);
      ctx.stroke();
    },
  },

  /**
   * The saint. The halo is the only costume mark drawn in a blade colour rather
   * than in ink — it is light, not cloth — and it keeps the slow bob it has had
   * since the mark was one line. The beard closes the head shape underneath it
   * so the figure does not read as a disc balanced on a stick.
   */
  haloed: {
    label: "The Saint",
    side: "good",
    prop: { shoulder: 1, weight: 1.02, hunch: 0 },
    headroom: 21,
    head: (ctx, c) => {
      ink(ctx, c, 2.6, 0.95);
      ctx.moveTo(-4, c.hy + 4);
      ctx.lineTo(0, c.hy + 13);
      ctx.lineTo(4, c.hy + 4);
      ctx.stroke();
      const bob = Math.sin(c.t * 0.04 + c.phase) * 1.6;
      ctx.strokeStyle = c.blade;
      ctx.globalAlpha = 0.9 * c.dim;
      ctx.lineWidth = c.lw(2);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 12 + bob, 12, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    back: (ctx, c) => {
      // Full length and simple, because the halo is already carrying the read
      // and a busy robe under it would be two signatures fighting.
      const sway = Math.sin(c.t * 0.028 + c.phase) * 1.2 - c.vx * 1.4;
      // From the hips, not the shoulders: run to the shoulders and the two
      // edges plus the legs read as a box the fighter is standing in.
      ink(ctx, c, 2.6, 0.85);
      ctx.moveTo(-c.hipX - 3, c.hipY - 6);
      ctx.quadraticCurveTo(-14, c.hipY + 14, -13 + sway, c.feetY - 3);
      ctx.moveTo(c.hipX + 3, c.hipY - 6);
      ctx.quadraticCurveTo(13, c.hipY + 14, 12 + sway * 0.6, c.feetY - 4);
      ctx.moveTo(-13 + sway, c.feetY - 3);
      ctx.quadraticCurveTo(0 + sway, c.feetY + 2, 12 + sway * 0.6, c.feetY - 4);
      ctx.stroke();
    },
  },

  /**
   * Wings, and nothing else. Two arcs per side — the spar and a scalloped inner
   * edge — with the far wing dropped in alpha and pushed forward so the pair
   * reads as depth rather than as a single flat shape. This is the tallest
   * costume on the roster, hence the largest `headroom`, and it is the one that
   * proves the declaration is load-bearing: at the old fixed clearance the tips
   * left the ornament through the top.
   */
  winged: {
    label: "The Seraph",
    side: "good",
    prop: { shoulder: 1.04, weight: 1, hunch: 0 },
    headroom: 19,
    back: (ctx, c) => {
      const beat = Math.sin(c.t * 0.026 + c.phase) * 2.4;
      /*
       * A wing is drawn as a **fan of feathers from one root**, not as an
       * outline. Two attempts at an outline — a leading edge closed by a
       * scalloped trailing edge — both read as a leaf or a shield, because any
       * closed curve at this size is a blob with a highlight round it. Three
       * open strokes cannot close, and a fan is what the eye reads as a wing.
       */
      const wing = (dx: number, alpha: number, lift: number) => {
        const tips: [number, number][] = [
          [dx - 18, c.shY - 3],
          [dx - 16, c.shY - 18 - lift],
          [dx - 7, c.shY - 28 - lift],
        ];
        tips.forEach(([tx, ty], i) => {
          ink(ctx, c, 2.4 - i * 0.2, alpha);
          ctx.moveTo(dx + 2, c.shY + 3);
          ctx.quadraticCurveTo(dx - 10, c.shY - 4 - i * 5, tx, ty);
          ctx.stroke();
        });
      };
      // Far wing first, dimmer and forward of the near one: two identical
      // shapes on top of each other are one flat shape.
      wing(-c.shX + 5, 0.45, beat * 0.5);
      wing(-c.shX - 1, 1, beat);
    },
  },

  /**
   * The mask: a domed helmet with a flange at the jaw, high square shoulders,
   * and a cape to the floor that trails with travel. Three marks rather than
   * one, which is the exception on this roster and is earned — it is the heavy
   * silhouette, and heaviness is built out of proportion as much as outline.
   */
  caped: {
    label: "The Mask",
    side: "evil",
    prop: { shoulder: 1.2, weight: 1.18, hunch: 0 },
    headroom: 14,
    head: (ctx, c) => {
      /*
       * The helmet has to be visibly *bigger* than the skull under it, or it
       * reads as a slightly thicker head and the fighter is anonymous. Drawn at
       * `hr + 3` with two short cheek drops, so the dome, the cheeks and the
       * flange make one continuous outline around the head disc.
       */
      const r = c.hr + 3;
      ink(ctx, c, 3);
      ctx.arc(0, c.hy, r, Math.PI * 0.97, Math.PI * 2.03);
      ctx.stroke();
      ink(ctx, c, 2.8);
      ctx.moveTo(-r, c.hy - 1);
      ctx.lineTo(-r + 1, c.hy + 4);
      ctx.lineTo(-r - 4, c.hy + 11);
      ctx.moveTo(r, c.hy - 1);
      ctx.lineTo(r - 1, c.hy + 4);
      ctx.lineTo(r + 4, c.hy + 11);
      ctx.stroke();
    },
    back: (ctx, c) => {
      /*
       * The cape flares. The first version ran both edges to nearly the same
       * point and read as a robe — a column, not a cape. The hem is now wider
       * than the shoulders it hangs from, which is the whole difference, and it
       * lifts and streams when the fighter is off the ground.
       */
      const trail = -10 - c.vx * 1.6 + Math.sin(c.t * 0.033 + c.phase) * 1.8;
      const drop = c.airborne ? c.feetY - 16 : c.feetY - 2;
      // Both edges stay *behind* the spine and the hem is wider than the
      // shoulders. The version before this ran one edge from the front
      // shoulder across the body to the same hem, which drew a narrow panel
      // down the figure's side — a plank, not a cape.
      ink(ctx, c, 2.8, 0.95);
      ctx.moveTo(-c.shX - 2, c.shY - 5);
      ctx.quadraticCurveTo(trail - 7, c.shY + 26, trail - 14, drop);
      ctx.moveTo(-1, c.shY - 6);
      ctx.quadraticCurveTo(trail * 0.4, c.shY + 24, trail + 7, drop - 5);
      ctx.stroke();
      ink(ctx, c, 2.4, 0.8);
      ctx.moveTo(trail - 14, drop);
      ctx.quadraticCurveTo(trail - 3, drop + 5, trail + 7, drop - 5);
      ctx.stroke();
    },
  },

  /**
   * Horns swept back over the crown, and a tail that trails from the hip. The
   * tail is the second mark because horns alone are close to the crown below,
   * and the two share a pool.
   */
  horned: {
    label: "The Devil",
    side: "evil",
    prop: { shoulder: 1.06, weight: 1.05, hunch: 0 },
    headroom: 26,
    head: (ctx, c) => {
      ink(ctx, c, 2.8);
      ctx.moveTo(-5, c.hy - 5);
      ctx.quadraticCurveTo(-12, c.hy - 13, -13, c.hy - 22);
      ctx.moveTo(4, c.hy - 7);
      ctx.quadraticCurveTo(-2, c.hy - 15, -3, c.hy - 23);
      ctx.stroke();
    },
    back: (ctx, c) => {
      const lash = Math.sin(c.t * 0.055 + c.phase) * 3 - c.vx * 1.4;
      const tipX = -22 + lash;
      const tipY = c.hipY - 9 + lash * 0.4;
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(-2, c.hipY + 3);
      ctx.quadraticCurveTo(-17, c.hipY + 7, tipX, tipY);
      ctx.stroke();
      // The spade, two strokes: without it the tail is a wire and reads as an
      // error in the cape of whoever it is fighting.
      ink(ctx, c, 2, 0.9);
      ctx.moveTo(tipX + 5, tipY + 3);
      ctx.lineTo(tipX - 1, tipY - 1);
      ctx.lineTo(tipX + 4, tipY - 4);
      ctx.stroke();
    },
  },

  /**
   * A ring of short horns around the crown, and no cloth anywhere. The absence
   * is half the read: it is the only fighter on the roster with nothing hanging
   * off the torso, so at speed it is the one clean silhouette in the pool.
   */
  crowned: {
    label: "The Crown",
    side: "evil",
    prop: { shoulder: 1.14, weight: 1.16, hunch: 0 },
    headroom: 17,
    head: (ctx, c) => {
      ink(ctx, c, 2.4);
      for (let i = 0; i < 5; i += 1) {
        const a = Math.PI * 1.12 + (i * Math.PI * 0.76) / 4;
        const x = Math.cos(a);
        const y = Math.sin(a);
        ctx.moveTo(x * (c.hr - 1), c.hy + y * (c.hr - 1));
        ctx.lineTo(x * (c.hr + 6), c.hy + y * (c.hr + 6));
      }
      ctx.stroke();
    },
  },

  /**
   * A deep pointed cowl with nothing inside it. `hollow` suppresses the head
   * disc, which is the whole effect — an empty hood is unmistakable at any size
   * and impossible to confuse with the hermit's peak, which sits on a visible
   * head. The hunch is what stops it reading as a hood that fell off: the neck
   * comes forward and the shoulders drop with it.
   */
  cowled: {
    label: "The Hollow",
    side: "evil",
    prop: { shoulder: 1.02, weight: 1.06, hunch: 3.2 },
    headroom: 20,
    hollow: true,
    head: (ctx, c) => {
      ink(ctx, c, 3);
      ctx.moveTo(-9, c.hy + 12);
      ctx.quadraticCurveTo(-12, c.hy - 6, 0, c.hy - 17);
      ctx.quadraticCurveTo(11, c.hy - 5, 8, c.hy + 11);
      ctx.stroke();
      // The mouth of the hood, faint: it closes the shape without putting a
      // face in it, and at 60px it is the difference between an empty cowl and
      // a missing head.
      ink(ctx, c, 2, 0.45);
      ctx.moveTo(-8, c.hy + 10);
      ctx.quadraticCurveTo(0, c.hy + 4, 7, c.hy + 9);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      // One wide sleeve, on the off arm, drooping from the elbow past the hand.
      // The sword arm keeps its line — a sleeve on the arm doing the work would
      // hide the one silhouette the fight is actually about.
      ink(ctx, c, 2.4, 0.8);
      ctx.moveTo(c.offElbow.x - 4, c.offElbow.y - 1);
      ctx.quadraticCurveTo(c.offElbow.x - 4, c.offElbow.y + 13, c.offHand.x - 1, c.offHand.y + 4);
      ctx.stroke();
    },
  },
};

/** Which fighters each duel draws from. `duel` is the order's fight; `duelholy`
 *  is the war in heaven. Every pool is one side against the other, so a match
 *  is always good against evil and the blade colours always disagree. */
export const DUEL_POOLS: Record<DuelPool, { good: FighterStyle[]; evil: FighterStyle[] }> = {
  duel: { good: ["hooded", "maned"], evil: ["caped", "cowled"] },
  duelholy: { good: ["haloed", "winged"], evil: ["horned", "crowned"] },
};

export type DuelPool = "duel" | "duelholy";

/**
 * Roll a pairing, and roll which end of the arena each fighter walks on from.
 *
 * The side coin matters more than it looks: the fight's fairness guarantee is
 * that the role coin consults nothing, and with a fixed good-on-the-left
 * arrangement a viewer would still learn that the left fighter is the good one
 * and read every exchange through that. Rolling the side means the only thing
 * telling you who is who is the costume, which is the point of the phase.
 */
export function rollPairing(
  pool: DuelPool,
  rng: () => number = Math.random,
): [FighterStyle, FighterStyle] {
  const { good, evil } = DUEL_POOLS[pool];
  const g = good[Math.floor(rng() * good.length) % good.length];
  const e = evil[Math.floor(rng() * evil.length) % evil.length];
  return rng() < 0.5 ? [g, e] : [e, g];
}
