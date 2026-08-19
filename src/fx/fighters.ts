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
 * **Mass is allowed; a slab is not** (2026-08-19). This rule used to read
 * *"stroked, never filled"*, and the gate refused a costume hook that called
 * `fill` at all. That was the right rule for the wrong reason, and it cost the
 * roster a year of legibility: what the client rejected in 2026-08-14 was not
 * *filling* — it was a filled torso quad, a filled head block and a filled robe
 * that between them covered the whole figure, composited into one pale slab as
 * wide as the fighter was tall, read (correctly) as *"they are holding
 * shields"*. Banning the fill banned the slab, and also banned every filled
 * *mark*: a hood, a helmet, a horn, a wing. What was left was eight wire
 * diagrams that at the phone slot's ~61px figure were the same pale stick with
 * a thread on top — which is the state the client called out.
 *
 * So the rule is now about **where the fill lands**, which is the fact the old
 * one was reaching for, and `npm run check` enforces it by driving every hook
 * and measuring each filled path against the torso:
 *
 * - A shape covering **less than 45% of the torso box** may be as solid as it
 *   likes. That is a helmet, a hood, a horn, a crown, a pauldron, a wing —
 *   things that merge into one silhouette with the part of the body they sit
 *   on, which is exactly what they should do.
 * - A shape covering **more** is cloth over the body, and gets at most **35% of
 *   the body's own alpha**, so the spine and both limbs always read through it.
 *   That is the whole difference between a cape and a shield.
 * - Nothing may be filled **taller than the figure wearing it**, and the
 *   sideways rule already holds every point inside what the camera frames.
 *
 * The `solid` helper is the only way a mass is drawn.
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

/**
 * How a fighter *stands* — the half of recognition that is not a mark.
 *
 * Eight costumes on eight identical bodies in one identical guard was the state
 * this roster shipped in, and at the size the ornament renders (~61px on a
 * phone) a head mark of six units is two pixels: the figures were the same
 * drawing eight times. A duellist is recognisable standing still, from the
 * width of the stance and the height of the hips, and those survive being small
 * in a way a mark never does.
 *
 * **None of this reaches the simulation.** The hips move, the feet move, the
 * shoulders do not — `bladeLocal` hangs the grip off the shoulder line, so a
 * stance that moved it would hand the fighter a sword whose drawn length
 * disagreed with the one `bladeGap` and every contact frame in `MOVES` are
 * using. That is the "proximity is not contact" bug class, and it is why
 * `prop` has no height multiplier either.
 */
export interface Stance {
  /**
   * Hips lowered, in local units. The feet stay on the floor and the shoulders
   * stay where they are, so this bends the knees and shortens the spine: a
   * settled master sits into a low guard, a proud one stands over it.
   */
  settle: number;
  /**
   * Half the distance between the feet. The rig's old value was 4, which put
   * both feet inside the hips and read as a squat rather than as a guard.
   */
  spread: number;
  /** Back heel lifted — the tell of a stance about to move forward. */
  heel: number;
}

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
    /**
     * Head radius multiplier. A helmet is a bigger skull and a hood is a
     * smaller one, and at this size the head is a quarter of the silhouette's
     * width — it is the cheapest proportion there is.
     */
    head: number;
    /**
     * Torso mass, 0–1: the two edges of a chest, stroked from the shoulder bar
     * down to the hips. **Stroked, and only two lines** — the version the
     * client rejected filled this shape, and a filled torso next to a filled
     * robe is the slab that read as a shield. Two edges around a visible spine
     * read as a ribcage. Reserved for the fighters whose whole character is
     * that they are built heavily; a light fighter sets 0 and keeps the plain
     * stick, which is what makes the heavy ones look heavy.
     */
    build: number;
  };
  /** How the fighter stands when it is not doing anything else. */
  stance: Stance;
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
 * Close the current path as a **mass**: filled, then outlined in the same ink.
 *
 * This is the primitive the roster was missing, and it is the difference
 * between a character and a wire diagram of one. An outline says where a shape
 * ends; a mass says the shape is *there*, and at the size these render — a
 * ~61px figure on a phone — an outline three units wide is a pale thread that
 * washes into the body behind it while a filled hood is a black-and-white
 * silhouette you can read across a room.
 *
 * **Fill and edge are the same ink on purpose.** The reference engine rims its
 * marks in a separate dark colour, which it can do because it owns its arena's
 * background; this canvas is transparent over whatever the site's palette is
 * doing, so there is no second colour to rim with that would not be a literal.
 * Same-ink means a mark laid over the body *merges* with it into one
 * silhouette, which is what a helmet or a hood should do anyway, and marks that
 * need to stay separate are held apart by alpha instead — cloth behind the body
 * is drawn faint enough for the body to read over it.
 *
 * The gate that used to refuse every fill now bounds them: see `Costume`.
 */
function solid(
  ctx: CanvasRenderingContext2D,
  c: CostumeCtx,
  fill: number,
  edge = 2.4,
  edgeAlpha = 1,
): void {
  ctx.fillStyle = c.ink;
  ctx.globalAlpha = c.alpha * fill;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = c.alpha * edgeAlpha;
  ctx.lineWidth = c.lw(edge);
  ctx.stroke();
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
    prop: { shoulder: 1.02, weight: 1.06, hunch: 1.4, head: 0.92, build: 0 },
    // Sat into a wide, low guard: the oldest fighter here, and the only one who
    // has nothing to prove by standing tall.
    // Narrower than the fighting stances: a robe reads as a column, and a wide
    // stance under it pokes both legs out through the hem, which turned the
    // first version of this figure into somebody kneeling in a tent.
    stance: { settle: 3.5, spread: 9, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      /*
       * A deep cowl, not a hat. The version before this was three straight
       * lines making a triangle that floated above the skull and touched
       * nothing — at 61px it read as a party hat balanced on a ball. This one
       * starts on the shoulders, rises past the crown and falls to the other
       * shoulder as one outline, so the head sits *inside* it.
       */
      /*
       * The cowl is a **mass**, and it swallows the head disc: hood and skull
       * become one peaked silhouette, which is what a hood does and is the
       * only kind of detail this canvas can carry. There is no interior line
       * here on purpose — one ink over a transparent canvas has no second
       * colour to draw a face in shadow *with*, so anything inside the outline
       * is noise at desk size and invisible at phone size. Everything that
       * distinguishes these eight is the edge of the shape.
       *
       * Seated on the skull, clearing it by four units. Taller and it stops
       * being a hood and starts being a mitre, which is what the stroked
       * version drew.
       */
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(-r - 4, c.hy + 13);
      ctx.quadraticCurveTo(-r - 5, c.hy - 9, 0, c.hy - 13);
      ctx.quadraticCurveTo(r + 5, c.hy - 8, r + 3, c.hy + 11);
      // Back along the jaw, low enough to leave the shoulders clear.
      ctx.quadraticCurveTo(0, c.hy + 17, -r - 4, c.hy + 13);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
    },
    back: (ctx, c) => {
      // A robe to the ankles, drawn as its own two edges rather than as a
      // shape: the near edge swings with travel, the far one lags, and the hem
      // between them is what says "cloth" at 60px.
      /*
       * The robe is cloth, so it is filled *faintly* and the legs read over it
       * — that is the whole of the rule that replaced "never fill": the limbs
       * must always win. At 0.3 of the body's alpha it is a shade rather than a
       * shape, which is what turns the lower half of this fighter into a column
       * instead of two sticks with wires either side of them.
       */
      const sway = Math.sin(c.t * 0.031 + c.phase) * 1.6 - c.vx * 2.1;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 3, c.hipY - 11);
      ctx.quadraticCurveTo(-13, c.hipY + 12, -13 + sway, c.feetY - 3);
      ctx.quadraticCurveTo(-1 + sway, c.feetY + 3, 11 + sway * 0.6, c.feetY - 5);
      ctx.quadraticCurveTo(12, c.hipY + 12, c.hipX + 3, c.hipY - 11);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.85);
    },
    overlay: (ctx, c) => {
      // The sash, and the end of it hanging past the knee. A belt is the one
      // mark that says a robe is *worn* rather than draped, and the hanging
      // tail is a second, moving line in a costume that is otherwise still.
      const sway = Math.sin(c.t * 0.031 + c.phase) * 1.4 - c.vx * 1.6;
      ink(ctx, c, 2.6, 0.85);
      ctx.moveTo(-c.hipX - 2, c.hipY - 8);
      ctx.quadraticCurveTo(0, c.hipY - 5, c.hipX + 2, c.hipY - 9);
      ctx.stroke();
      ink(ctx, c, 2.2, 0.7);
      ctx.moveTo(-3, c.hipY - 6);
      ctx.quadraticCurveTo(-6 + sway * 0.5, c.hipY + 7, -5 + sway, c.hipY + 18);
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
    prop: { shoulder: 0.94, weight: 0.9, hunch: 0, head: 0.94, build: 0 },
    // The long lunge, with the back heel already off the floor: the youngest
    // fighter on the roster stands like someone about to move first.
    stance: { settle: -1, spread: 16, heel: 4 },
    headroom: 16,
    head: (ctx, c) => {
      /*
       * Hair as a mass hanging off the back of the skull and past the jaw, not
       * as two curved wires either side of it. The wires read as ears at desk
       * size and as nothing at all on a phone; the mass reads as a head with a
       * heavy shape behind it, which is the same information the silhouette
       * would carry in a film.
       *
       * It is drawn from the brow, over the crown and down the back, so the
       * front of the face stays the plain head disc — a fringe over the brow
       * would take the one bit of this figure that says *young*.
       */
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(r - 2, c.hy - r - 1);
      ctx.quadraticCurveTo(-1, c.hy - r - 5, -r - 5, c.hy - r + 4);
      ctx.quadraticCurveTo(-r - 9, c.hy + 6, -r - 4, c.hy + 19);
      ctx.quadraticCurveTo(-r + 2, c.hy + 12, -r + 1, c.hy + 2);
      ctx.quadraticCurveTo(-r + 2, c.hy - r + 3, r - 2, c.hy - r - 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
      /*
       * The braid. It is the one mark on this fighter that is unmistakably a
       * *choice* rather than an accident of the body, it trails behind on its
       * own delay, and it is what separates this silhouette from the hood's at
       * a glance — the two share a pool, so they have to be separable while
       * moving rather than only in a line-up.
       */
      const lag = Math.sin(c.t * 0.043 + c.phase) * 2.2 - c.vx * 2.6;
      ink(ctx, c, 2.2, 0.85);
      ctx.moveTo(-r - 2, c.hy + 8);
      ctx.quadraticCurveTo(-r - 8 + lag * 0.5, c.hy + 20, -r - 6 + lag, c.hy + 32);
      ctx.stroke();
    },
    back: (ctx, c) => {
      // A short tunic, split up the middle so one panel leads and the other
      // trails. Short, because a floor-length robe on the fighter whose whole
      // read is *speed* would be arguing with the stance.
      const sway = Math.sin(c.t * 0.037 + c.phase) * 1.8;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 1, c.hipY - 8);
      ctx.quadraticCurveTo(-14, c.hipY + 10, -15 - c.vx * 2.4 + sway, c.feetY - 16);
      ctx.quadraticCurveTo(-1, c.feetY - 11, 12 - c.vx * 1.2 + sway, c.feetY - 18);
      ctx.quadraticCurveTo(12, c.hipY + 9, c.hipX + 1, c.hipY - 8);
      ctx.closePath();
      solid(ctx, c, 0.28, 2.4, 0.9);
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
    prop: { shoulder: 1.02, weight: 1.06, hunch: -0.8, head: 1, build: 0.35 },
    // Upright, feet nearly together, knees straight. The only fighter here who
    // stands as though the fight were beneath them, which is the character.
    stance: { settle: -2.5, spread: 6, heel: 0 },
    headroom: 26,
    head: (ctx, c) => {
      // The beard: a wedge of mass under the skull, so the head reads as a
      // shape rather than as a disc balanced on a stick — and so this fighter
      // is the *old* one in a pool where the other is winged and weightless.
      ctx.beginPath();
      ctx.moveTo(-c.hr + 1, c.hy + 3);
      ctx.quadraticCurveTo(-4, c.hy + 18, 0, c.hy + 21);
      ctx.quadraticCurveTo(4, c.hy + 17, c.hr - 1, c.hy + 2);
      ctx.quadraticCurveTo(0, c.hy + 9, -c.hr + 1, c.hy + 3);
      ctx.closePath();
      solid(ctx, c, 0.85, 2.4);
      /*
       * The halo — the one costume mark drawn in a blade colour rather than in
       * ink, because it is light and not cloth. Two rings now: the ellipse
       * overhead and a fainter, wider one a little above it, which is what
       * turns a hoop into a source. It keeps the slow bob it has had since the
       * mark was one line.
       */
      const bob = Math.sin(c.t * 0.04 + c.phase) * 1.6;
      ctx.strokeStyle = c.blade;
      ctx.globalAlpha = 0.92 * c.dim;
      ctx.lineWidth = c.lw(2.2);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 14 + bob, 13, 4.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.3 * c.dim;
      ctx.lineWidth = c.lw(1.6);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 16 + bob, 17, 5.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    back: (ctx, c) => {
      // Full length and straight, because the halo is already carrying the read
      // and a busy robe under it would be two signatures fighting.
      const sway = Math.sin(c.t * 0.028 + c.phase) * 1.2 - c.vx * 1.4;
      // From the hips, not the shoulders: run it to the shoulders and the robe
      // plus the legs read as a box the fighter is standing in.
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 3, c.hipY - 8);
      ctx.quadraticCurveTo(-15, c.hipY + 14, -14 + sway, c.feetY - 1);
      ctx.quadraticCurveTo(0 + sway, c.feetY + 4, 13 + sway * 0.6, c.feetY - 2);
      ctx.quadraticCurveTo(14, c.hipY + 14, c.hipX + 3, c.hipY - 8);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.8, 0.85);
    },
    overlay: (ctx, c) => {
      /*
       * A collar, and deliberately *not* the pair of vertical bands that were
       * here first. Those ran shoulder-to-waist alongside two robe edges and a
       * spine, and five parallel verticals on one figure came out as a ladder —
       * the fighter read as wrapped rather than as robed. One horizontal mark
       * across the top of a vertical costume does the same job of saying
       * "vestment" and cannot stripe anything.
       */
      ink(ctx, c, 2.6, 0.8);
      ctx.moveTo(-c.shX + 1, c.shY + 3);
      ctx.quadraticCurveTo(0, c.shY + 9, c.shX - 1, c.shY + 3);
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
    prop: { shoulder: 1.06, weight: 0.98, hunch: 0, head: 0.94, build: 0 },
    // Weight on the front foot with the back heel lifted, knees nearly
    // straight: poised rather than braced, which is the only stance a figure
    // with wings can stand in without looking like it is being blown over.
    stance: { settle: -3, spread: 8, heel: 5 },
    headroom: 25,
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
        /*
         * The span is capped by what the camera frames, not by the drawing: the
         * gate refuses anything past 34 units off the centre line, because
         * `duelFocus` measures the *bodies* and a wing wider than that leaves
         * the shot at the arena walls. So the fan grows upward rather than
         * outward — which is the better wing anyway.
         */
        /*
         * **Three feathers, not four, and each one heavy.** Four thin strokes
         * from one root came out as a bundle of straw — at 61px a fan needs
         * *fewer* elements with more space between them, because the gaps are
         * what the eye reads as separate feathers. Their tips also run in a
         * curve rather than a fan of equal lengths: the leading one is short
         * and low, the trailing one long and high, which is a wing rather than
         * a whisk.
         *
         * The span is capped by what the camera frames, not by the drawing: the
         * gate refuses anything past 34 units off the centre line, because
         * `duelFocus` measures the *bodies* and a wing wider than that leaves
         * the shot at the arena walls. So it grows upward rather than outward,
         * which is the better wing anyway.
         */
        const root = { x: dx + 2, y: c.shY + 4 };
        const tips: [number, number][] = [
          [dx - 18, c.shY + 3],
          [dx - 17, c.shY - 17 - lift],
          [dx - 6, c.shY - 34 - lift],
        ];
        tips.forEach(([tx, ty], i) => {
          // Each feather is a **mass**: out along its own curve and back on a
          // tighter one, so it has a width that tapers to the tip. Three
          // strokes from a point were a bundle of straw, which is what a wing
          // drawn in wire always is.
          ctx.beginPath();
          ctx.moveTo(root.x, root.y);
          ctx.quadraticCurveTo(dx - 13, c.shY + 1 - i * 9, tx, ty);
          ctx.quadraticCurveTo(dx - 4, c.shY - 2 - i * 8, root.x, root.y);
          ctx.closePath();
          solid(ctx, c, 0.55 * alpha, 2.4 - i * 0.2, alpha);
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
    prop: { shoulder: 1.36, weight: 1.34, hunch: 0.6, head: 1.16, build: 1 },
    // Planted: the widest feet on the roster, hips low, nothing about it
    // suggesting movement. Heaviness is a stance before it is a stroke width.
    stance: { settle: 4, spread: 14, heel: 0 },
    headroom: 18,
    head: (ctx, c) => {
      /*
       * The helmet has to be visibly *bigger* than the skull under it, or it
       * reads as a slightly thicker head and the fighter is anonymous. Drawn at
       * `hr + 3` with two short cheek drops, so the dome, the cheeks and the
       * flange make one continuous outline around the head disc.
       */
      /*
       * The helmet is one mass — dome, cheeks and the flare of the jaw flanges
       * in a single closed path — and it is drawn visibly *bigger* than the
       * skull under it, which is the difference between a helmet and a slightly
       * thicker head. The flanges are the read: a dome alone is a bald man, and
       * the widening at the jaw is the only part of this shape that no other
       * fighter on the roster has.
       */
      const r = c.hr + 3;
      ctx.beginPath();
      ctx.moveTo(-r, c.hy + 1);
      ctx.quadraticCurveTo(-r, c.hy - r - 3, 0, c.hy - r - 2);
      ctx.quadraticCurveTo(r, c.hy - r - 3, r, c.hy + 1);
      ctx.lineTo(r + 5, c.hy + 14);
      ctx.quadraticCurveTo(0, c.hy + 10, -r - 5, c.hy + 14);
      ctx.closePath();
      solid(ctx, c, 0.94, 2.8);
    },
    overlay: (ctx, c) => {
      // The mantle: a plate over each shoulder, filled. High square shoulders
      // are the whole of this silhouette's top half, and the shoulder-width
      // multiplier alone cannot say *armour* — it only says wide.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 6, c.shY + 8);
      ctx.quadraticCurveTo(-c.shX - 4, c.shY - 6, 0, c.shY - 7);
      ctx.quadraticCurveTo(c.shX + 4, c.shY - 6, c.shX + 6, c.shY + 8);
      ctx.quadraticCurveTo(0, c.shY + 2, -c.shX - 6, c.shY + 8);
      ctx.closePath();
      solid(ctx, c, 0.8, 2.6, 0.9);
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
      //
      // Filled, faintly. This is the biggest shape any costume here draws and
      // therefore the one that would become the slab if it were solid: at 0.26
      // of the body's alpha the legs and the spine read straight through it and
      // what it adds is *bulk behind the shoulders*, which is the whole point
      // of a cape at this size.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 2, c.shY - 5);
      ctx.quadraticCurveTo(trail - 7, c.shY + 26, trail - 14, drop);
      ctx.quadraticCurveTo(trail - 3, drop + 6, trail + 7, drop - 5);
      ctx.quadraticCurveTo(trail * 0.4, c.shY + 24, -1, c.shY - 6);
      ctx.closePath();
      solid(ctx, c, 0.26, 2.8, 0.95);
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
    prop: { shoulder: 1.12, weight: 1.1, hunch: 3.4, head: 0.96, build: 0.5 },
    // The deepest crouch here, wide and forward-leaning: an animal stance, and
    // the one that most obviously is not a swordsman's.
    stance: { settle: 4.5, spread: 13, heel: 2 },
    headroom: 23,
    head: (ctx, c) => {
      /*
       * Horns, and they are the read, so they are drawn at the scale of the
       * head rather than as an ornament on it: out past the width of the
       * shoulders before they turn up. Two thin ticks vanished at 61px, which
       * is what the old pair were.
       */
      /*
       * They go **out before they go up**. Two horns rising off the crown side
       * by side are a rabbit, which is exactly what the first pair drew; a ram
       * leaves the temples sideways, turns at the width of the shoulders and
       * only then rises. The near one is longer and the far one shorter and
       * dimmer, so the pair reads as depth rather than as one flat mark.
       */
      const horn = (root: number, out: number, up: number, thick: number, a: number) => {
        // Each horn is a mass that tapers: out along the top edge, back along
        // the underside. A tapering shape is what makes it a horn rather than a
        // wire, and the taper is the only cue at this size that says which end
        // is the tip.
        ctx.beginPath();
        ctx.moveTo(root, c.hy - 5);
        ctx.quadraticCurveTo(out, c.hy - 1, out - 1, c.hy - up);
        ctx.quadraticCurveTo(out + thick, c.hy + 1, root, c.hy + thick * 0.4);
        ctx.closePath();
        solid(ctx, c, 0.85 * a, 2.2, a);
      };
      // The far one is dimmer, not thinner or shorter: at 0.5 alpha and half
      // the reach it dropped out of the silhouette entirely on a phone and the
      // fighter grew a single scythe. Depth is worth about 25% of alpha here
      // and no more.
      horn(-3, -18, 20, 5, 1);
      horn(3, -12, 17, 4.4, 0.75);
    },
    back: (ctx, c) => {
      const lash = Math.sin(c.t * 0.055 + c.phase) * 3 - c.vx * 1.4;
      const tipX = -22 + lash;
      const tipY = c.hipY - 9 + lash * 0.4;
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(-2, c.hipY + 3);
      ctx.quadraticCurveTo(-17, c.hipY + 7, tipX, tipY);
      ctx.stroke();
      // The spade, filled: without it the tail is a wire and reads as an error
      // in the cape of whoever it is fighting.
      ctx.beginPath();
      ctx.moveTo(tipX + 6, tipY + 4);
      ctx.lineTo(tipX - 2, tipY - 1);
      ctx.lineTo(tipX + 5, tipY - 5);
      ctx.closePath();
      solid(ctx, c, 0.85, 2, 0.9);
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
    prop: { shoulder: 1.3, weight: 1.26, hunch: 0, head: 1.04, build: 0.85 },
    // Stands over the fight rather than in it: knees straight, feet apart but
    // square. The heavy build without the low hips is what separates this from
    // the mask, which is the other heavy in the roster.
    stance: { settle: -2, spread: 10, heel: 0 },
    headroom: 26,
    head: (ctx, c) => {
      // Taller points, and a band under them. The band is what makes it a
      // crown rather than a starburst — the old five spokes radiated straight
      // out of the skull with nothing holding them, and read as a sun.
      /*
       * **One shape, not five spokes.** Five lines radiating out of a skull is
       * a sun, which is what this fighter has read as since the day it was
       * drawn. A crown is a band with points *on* it, so it is drawn as a
       * single closed path — up a point, down into the valley, up the next —
       * and filled. The middle point is the tallest, because a crown has a
       * front.
       */
      const n = 5;
      const inner = c.hr + 1;
      const band = c.hr + 3.5;
      ctx.beginPath();
      ctx.moveTo(-inner - 1, c.hy - 1);
      for (let i = 0; i < n; i += 1) {
        const a = Math.PI * 1.08 + (i * Math.PI * 0.84) / (n - 1);
        const mid = Math.PI * 1.08 + ((i + 0.5) * Math.PI * 0.84) / (n - 1);
        const len = i === 2 ? 15 : 10 - Math.abs(i - 2) * 1.5;
        ctx.lineTo(Math.cos(a) * (c.hr + len), c.hy + Math.sin(a) * (c.hr + len));
        if (i < n - 1) {
          ctx.lineTo(Math.cos(mid) * band, c.hy + Math.sin(mid) * band);
        }
      }
      ctx.lineTo(inner + 1, c.hy - 1);
      // The band itself, closing the shape under the points.
      ctx.quadraticCurveTo(0, c.hy - inner + 1, -inner - 1, c.hy - 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      // Pauldrons — a squared plate on each shoulder, drawn as three strokes
      // apiece. The only fighter with nothing hanging off the torso, so the
      // whole silhouette is *shape*: a wide flat top over a straight body.
      /*
       * Two plates, and they must not meet. The first pair ran level from
       * shoulder to shoulder across a thin body and read as one plank laid over
       * the figure — a yoke, not armour. They are angled *down* and away now,
       * with the shoulder bar visible between them: the outer corner sits below
       * the inner one, which is what a pauldron does and what stops the pair
       * being one horizontal.
       */
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (c.shX + 7), c.shY + 12);
        ctx.lineTo(s * (c.shX + 8), c.shY - 1);
        ctx.quadraticCurveTo(s * (c.shX + 2), c.shY - 7, s * (c.shX - 3), c.shY - 4);
        ctx.lineTo(s * (c.shX - 1), c.shY + 8);
        ctx.closePath();
        solid(ctx, c, 0.75, 2.4, 0.9);
      }
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
    prop: { shoulder: 1, weight: 1.02, hunch: 4.6, head: 1, build: 0 },
    // Hunched over a narrow base, hips low: the silhouette of something that
    // does not stand up straight. `hunch` carries the cowl forward past the
    // chest, which is the half of it that reads in a line-up.
    stance: { settle: 5, spread: 8, heel: 0 },
    headroom: 23,
    hollow: true,
    head: (ctx, c) => {
      // Taller and narrower than the hermit's, and empty. An empty hood is
      // unmistakable at any size; the hermit's peak sits on a visible head, so
      // the two never read as the same mark even though both are cloth.
      ink(ctx, c, 3.2);
      ctx.moveTo(-10, c.hy + 14);
      ctx.quadraticCurveTo(-13, c.hy - 7, -1, c.hy - 20);
      ctx.quadraticCurveTo(12, c.hy - 6, 9, c.hy + 13);
      ctx.stroke();
      // The mouth of the hood, faint: it closes the shape without putting a
      // face in it, and at 60px it is the difference between an empty cowl and
      // a missing head.
      ink(ctx, c, 2.2, 0.45);
      ctx.moveTo(-9, c.hy + 12);
      ctx.quadraticCurveTo(0, c.hy + 5, 8, c.hy + 11);
      ctx.stroke();
    },
    back: (ctx, c) => {
      /*
       * A hem in tatters. Every other robe on the roster closes with one smooth
       * curve; this one closes with five points, which is the same silhouette
       * information — where the cloth ends — carrying a second fact about who
       * is wearing it. It is also the cheapest possible difference from the
       * hermit, whose robe is otherwise the same shape.
       */
      /*
       * One path: down the back edge, across a hem torn into three points, and
       * up the front. Filled faintly like every other robe, so the hem's
       * points are read as the *shape ending raggedly* rather than as three
       * separate chevrons lying on the floor — which is what they looked like
       * when the hem was a stroke drawn under a separate robe.
       *
       * Three points, not five: five at this scale is a row of small teeth and
       * reads as a texture, and texture is the one thing that does not survive
       * being 61px tall.
       */
      const sway = Math.sin(c.t * 0.034 + c.phase) * 1.5 - c.vx * 2;
      const left = -14 + sway;
      const right = 12 + sway * 0.6;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 3, c.hipY - 10);
      ctx.quadraticCurveTo(-15, c.hipY + 12, left, c.feetY - 6);
      for (let i = 0; i < 3; i += 1) {
        const step = (right - left) / 3;
        const x = left + step * i;
        ctx.lineTo(x + step * 0.5, c.feetY + 3 - (i % 2) * 3);
        ctx.lineTo(x + step, c.feetY - 7 - i);
      }
      ctx.quadraticCurveTo(13, c.hipY + 11, c.hipX + 3, c.hipY - 10);
      ctx.closePath();
      solid(ctx, c, 0.28, 2.6, 0.88);
    },
    overlay: (ctx, c) => {
      // Both sleeves, wide and drooping past the hands. On the off arm it is a
      // shape; on the sword arm it is deliberately shorter, because a sleeve
      // over the hand doing the work would hide the one silhouette the fight is
      // actually about.
      ctx.beginPath();
      ctx.moveTo(c.offElbow.x - 5, c.offElbow.y - 2);
      ctx.quadraticCurveTo(c.offElbow.x - 6, c.offElbow.y + 15, c.offHand.x - 1, c.offHand.y + 6);
      ctx.quadraticCurveTo(c.offElbow.x + 3, c.offElbow.y + 8, c.offElbow.x - 5, c.offElbow.y - 2);
      ctx.closePath();
      // 0.3, not 0.4: both hands are on the grip in front of the chest, so this
      // sleeve lands *over the torso* — the gate measured it covering 56% of it
      // — and cloth over the body is held faint enough for the spine and both
      // arms to read through. It is the same rule the cape obeys, arriving
      // somewhere nobody would think to look for it.
      solid(ctx, c, 0.3, 2.4, 0.8);
      ink(ctx, c, 2.4, 0.6);
      ctx.moveTo(c.elbow.x - 3, c.elbow.y + 1);
      ctx.quadraticCurveTo(c.elbow.x - 2, c.elbow.y + 10, c.elbow.x + 5, c.elbow.y + 8);
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
