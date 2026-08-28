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
  | "winged"
  | "ronin"
  | "gladiator"
  | "plague"
  | "golem"
  | "diver"
  | "monk"
  | "nosferatu"
  | "scarecrow"
  | "musketeer"
  | "valkyrie"
  | "wendigo"
  | "executioner"
  | "beekeeper"
  | "falconer"
  | "witch"
  | "mummy"
  | "lantern"
  | "sentinel"
  | "count"
  | "headless"
  | "herald"
  | "smith"
  | "reaper"
  | "werewolf"
  | "piper"
  | "nomad"
  | "hyde"
  | "boar"
  | "standard"
  | "harpooner"
  | "inquisitor"
  | "djinn";

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
  ronin: "#3d9bff",
  gladiator: "#37d67a",
  plague: "#ff3b30",
  golem: "#ff2929",
  diver: "#3d9bff",
  monk: "#37d67a",
  nosferatu: "#ff3b30",
  scarecrow: "#ff2929",
  musketeer: "#3d9bff",
  valkyrie: "#37d67a",
  wendigo: "#ff3b30",
  executioner: "#ff2929",
  beekeeper: "#3d9bff",
  falconer: "#37d67a",
  witch: "#ff3b30",
  mummy: "#ff2929",
  lantern: "#3d9bff",
  sentinel: "#37d67a",
  count: "#ff3b30",
  headless: "#ff2929",
  herald: "#3d9bff",
  smith: "#37d67a",
  reaper: "#ff3b30",
  werewolf: "#ff2929",
  piper: "#3d9bff",
  nomad: "#37d67a",
  hyde: "#ff3b30",
  boar: "#ff2929",
  standard: "#3d9bff",
  harpooner: "#37d67a",
  inquisitor: "#ff3b30",
  djinn: "#ff2929",
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
 * enough for a face. Where two fighters could be confused at a glance they go
 * in `NEVER_MEET`, which is empty today; the old answer was to keep them in
 * separate pools, and that cost four of eight costumes to solve a problem
 * with at most a couple of pairs.
 *
 * ## Forty, twenty a side (2026-08-28)
 *
 * The client asked for twenty a side and for named characters. The names are
 * refused for the reason at the top of this file — and, separately, because
 * this engine cannot draw the thing those characters are recognised *by*: a
 * face. What it can draw is an outline plus one signature shape, which is what
 * folklore and the trades were designed as, so that is what the other
 * thirty-two are.
 *
 * **Three rules came out of building them, and each one cost a costume before
 * it was written down.**
 *
 * 1. **Two shapes on one head need a gap between them, or they merge into a
 *    third shape neither of them is.** The plague doctor's beak left the brow
 *    and vanished under its own brim; the falconer's bird faced forward and
 *    made a two-headed figure; the valkyrie's wings overlapped into one flap.
 *    All three were fixed by moving a shape, never by making it bigger.
 * 2. **A proportion has to be pushed past what looks right in the code.** The
 *    gladiator's crest at eight units was a bump on a helmet, and the reaper's
 *    skull with two units of cheek pinch was an egg. At ~61px, two units is
 *    one pixel.
 * 3. **Interior detail is not a costume.** The monk had a sash and a bead loop
 *    and read, on the contact sheet, as an undressed rig — the fix was a
 *    rolled fold that changes the *outline* at the shoulder. This is the same
 *    finding as the 2026-08-19 one about wire diagrams, arriving at a costume
 *    that was obeying the fill rule perfectly.
 *
 * Every one of those was found on the contact sheet (`duel-shot.mjs sheet`,
 * which now takes `--only` and `--px`) and none of them was visible in a
 * single duel, because in a single duel you are never comparing.
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
       * distinguishes these forty is the edge of the shape.
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
  /**
   * The ronin: a shaved pate with a bound topknot, and sleeves wide enough to
   * hang. Two marks, and the second is doing the work — a topknot alone is a
   * small mass on a skull and reads as a bun at ornament size, while a sleeve
   * that swings off the elbow is visible from the far side of the arena.
   */
  ronin: {
    label: "The Ronin",
    side: "good",
    prop: { shoulder: 1.08, weight: 1.1, hunch: 0.4, head: 0.94, build: 0.4 },
    // Sunk into a wide, deep guard with both feet flat: the stance a swordsman
    // takes when the fight is expected to be long.
    stance: { settle: 5.5, spread: 15, heel: 0 },
    headroom: 18,
    head: (ctx, c) => {
      const r = c.hr;
      // The knot itself: a small mass sat *behind* the crown, not on top of
      // it. On top it is a bun; behind it, the skull in front of it reads as
      // shaved, which is the whole silhouette.
      ctx.beginPath();
      ctx.ellipse(-3, c.hy - r - 4, 5.2, 3.6, -0.5, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2);
      // The tail falls back from the knot and trails with travel. Stroked, not
      // massed: a filled tail is a second knot and the pair read as antlers.
      const flick = Math.sin(c.t * 0.05 + c.phase) * 1.6 - c.vx * 1.8;
      ink(ctx, c, 2.6, 0.9);
      ctx.moveTo(-5, c.hy - r - 5);
      ctx.quadraticCurveTo(-13 + flick, c.hy - r - 3, -15 + flick, c.hy + 3);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      /*
       * Both sleeves hang from the elbow and close back on the hand, so they
       * swing with the arm rather than sitting on it. Held at 0.3 — the off
       * sleeve lands over the torso when the guard closes, and cloth over the
       * body is the one thing on this roster that may not be solid.
       */
      const sleeve = (e: { x: number; y: number }, h: { x: number; y: number }) => {
        ctx.beginPath();
        ctx.moveTo(e.x - 6, e.y - 4);
        ctx.quadraticCurveTo(e.x - 9, e.y + 12, e.x - 3, e.y + 16);
        ctx.quadraticCurveTo(e.x + 4, e.y + 9, h.x - 2, h.y + 2);
        ctx.quadraticCurveTo(e.x + 5, e.y - 1, e.x - 6, e.y - 4);
        ctx.closePath();
        solid(ctx, c, 0.3, 2.4, 0.85);
      };
      sleeve(c.offElbow, c.offHand);
      sleeve(c.elbow, c.hand);
    },
  },

  /**
   * The gladiator: a helm whose comb runs fore-and-aft, and a banded sleeve up
   * the sword arm. The comb is the read — it is the one crest on the roster
   * that is *along* the head rather than across it, so it cannot be confused
   * with the crown's spikes at any size.
   */
  gladiator: {
    label: "The Gladiator",
    side: "good",
    prop: { shoulder: 1.18, weight: 1.2, hunch: 0.8, head: 1.1, build: 0.7 },
    stance: { settle: 3, spread: 12, heel: 0 },
    headroom: 34,
    head: (ctx, c) => {
      const r = c.hr + 2;
      // The helm swallows the head disc and closes under the brow, so the face
      // is the gap between the two outlines rather than anything drawn.
      ctx.beginPath();
      ctx.moveTo(-r, c.hy + 4);
      ctx.quadraticCurveTo(-r - 1, c.hy - r - 2, 0, c.hy - r - 3);
      ctx.quadraticCurveTo(r + 1, c.hy - r - 2, r, c.hy + 4);
      ctx.lineTo(r - 2, c.hy + 6);
      ctx.quadraticCurveTo(0, c.hy + 2, -r + 2, c.hy + 6);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
      /*
       * The comb: one closed arc standing on the dome, tallest forward of
       * centre. Symmetrical it reads as a mohawk; leaning forward it reads as
       * a helmet crest, which is a different animal.
       *
       * **It has to clear the dome by more than it seems it should.** The
       * first version rose eight units and on the sheet it was a bump on a
       * helmet — indistinguishable from the mask's at a glance, which is the
       * one fighter it must not resemble. A crest is read by the *gap* between
       * its top and the skull, so the height is the mark, not the shape.
       */
      ctx.beginPath();
      ctx.moveTo(-r + 3, c.hy - r + 2);
      ctx.quadraticCurveTo(-5, c.hy - r - 20, 5, c.hy - r - 17);
      ctx.quadraticCurveTo(r + 1, c.hy - r - 12, r - 3, c.hy - r + 1);
      ctx.quadraticCurveTo(1, c.hy - r - 6, -r + 3, c.hy - r + 2);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
    },
    overlay: (ctx, c) => {
      // Three bands climbing the sword arm from shoulder to elbow. Drawn as
      // separate masses rather than one sleeve: the gaps are what read as
      // banding, exactly as the seraph's feathers do.
      for (let i = 0; i < 3; i += 1) {
        const t = i / 2;
        const x = c.shX - 2 + (c.elbow.x - c.shX + 2) * t;
        const y = c.shY + 1 + (c.elbow.y - c.shY - 1) * t;
        ctx.beginPath();
        ctx.ellipse(x, y, 6.5 - i * 0.8, 3.4, 0.7, 0, Math.PI * 2);
        ctx.closePath();
        solid(ctx, c, 0.8, 2.2, 0.9);
      }
    },
  },

  /**
   * The plague doctor: the beak, and a flat brim over it. The strongest
   * silhouette available to this engine and the reason folklore beat the
   * client's list — it is recognised entirely by its outline, which is the one
   * thing a ~61px figure can carry.
   */
  plague: {
    label: "The Plague Doctor",
    side: "evil",
    prop: { shoulder: 1, weight: 1, hunch: 2.2, head: 0.98, build: 0 },
    stance: { settle: 2, spread: 11, heel: 0 },
    headroom: 28,
    head: (ctx, c) => {
      const r = c.hr;
      // The beak leaves the brow and comes to a point below the jaw. Forward
      // and *down*: level, it is a bird; down, it is the mask.
      /*
       * The beak leaves the *jaw*, not the brow. Drawn from the brow it ran
       * along under the brim with nothing between them, and the two masses
       * merged into one wide hat — on the sheet the fighter had no beak at
       * all. Starting it low leaves eight units of head disc between the two,
       * and the gap is what makes them read as two shapes.
       */
      ctx.beginPath();
      ctx.moveTo(-1, c.hy + 1);
      ctx.quadraticCurveTo(r + 9, c.hy + 2, r + 12, c.hy + 15);
      ctx.quadraticCurveTo(r + 2, c.hy + 9, -1, c.hy + 7);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.4);
      // The brim is one flat ellipse and the crown a low box on it. Two shapes
      // rather than one outline, because a hat drawn as a single silhouette
      // merges with the beak into an arrowhead.
      ctx.beginPath();
      ctx.ellipse(0, c.hy - r - 1, r + 6, 2.6, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.85, 2.2);
      /*
       * The crown is tall and narrow on purpose. The first version was two
       * units of dome under a brim as wide as the beak was long, and on the
       * sheet it read as a boater — a hat for a summer afternoon on the one
       * figure that must read as a hat for a pestilence. **The proportion is
       * the whole mark**: the brim narrows, the crown rises, and the beak is
       * long enough that the outline has a direction.
       */
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy - r - 2);
      ctx.quadraticCurveTo(-r + 3, c.hy - r - 17, 0, c.hy - r - 17);
      ctx.quadraticCurveTo(r - 3, c.hy - r - 17, r - 2, c.hy - r - 2);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
    },
    back: (ctx, c) => {
      // A coat to the ankle, hung from the shoulders rather than the hips, so
      // it reads as outerwear and not as a skirt.
      const sway = Math.sin(c.t * 0.03 + c.phase) * 1.4 - c.vx * 2.2;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 4);
      ctx.quadraticCurveTo(-13 + sway, c.hipY + 6, -12 + sway, c.feetY - 8);
      ctx.quadraticCurveTo(0, c.feetY - 3, 11 + sway * 0.5, c.feetY - 9);
      ctx.quadraticCurveTo(12, c.hipY + 6, c.shX + 1, c.shY + 4);
      ctx.closePath();
      solid(ctx, c, 0.24, 2.6, 0.9);
    },
  },

  /**
   * The golem: no neck, a block where the head should be, and the heaviest
   * build on the roster. The only fighter here whose entire character is
   * proportion — it carries no cloth and no accessory at all, which is what
   * makes it read as made of one material.
   */
  golem: {
    label: "The Golem",
    side: "evil",
    prop: { shoulder: 1.42, weight: 1.5, hunch: 0, head: 1.24, build: 1 },
    // Hips deep and feet wide apart, heels down. Nothing about this stance is
    // ready to move, which is the point of it.
    stance: { settle: 6, spread: 16, heel: 0 },
    headroom: 16,
    head: (ctx, c) => {
      const r = c.hr;
      // Cut corners rather than a rectangle: a true box reads as a television,
      // and the chamfers are what make it stone.
      ctx.beginPath();
      ctx.moveTo(-r - 2, c.hy + 7);
      ctx.lineTo(-r - 1, c.hy - r + 1);
      ctx.lineTo(-r + 4, c.hy - r - 3);
      ctx.lineTo(r - 3, c.hy - r - 3);
      ctx.lineTo(r + 2, c.hy - r + 2);
      ctx.lineTo(r + 3, c.hy + 6);
      ctx.lineTo(r - 4, c.hy + 9);
      ctx.lineTo(-r + 2, c.hy + 9);
      ctx.closePath();
      solid(ctx, c, 0.95, 3);
    },
    overlay: (ctx, c) => {
      // Slabs sat outboard of the shoulder line, so the head sinks between
      // them. They clear the torso box entirely — this is a mark, not cloth.
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (c.shX - 2), c.shY - 6);
        ctx.lineTo(s * (c.shX + 9), c.shY - 4);
        ctx.lineTo(s * (c.shX + 10), c.shY + 9);
        ctx.lineTo(s * (c.shX - 1), c.shY + 6);
        ctx.closePath();
        solid(ctx, c, 0.85, 2.6, 0.9);
      }
    },
  },
  /**
   * The diver: a ball bolted to a collar, and a hose trailing behind it. The
   * only fighter on the roster whose head is bigger than its shoulders are
   * wide, which is a proportion the eye reads before it reads any mark.
   */
  diver: {
    label: "The Diver",
    side: "good",
    prop: { shoulder: 1.2, weight: 1.24, hunch: 0, head: 1.3, build: 0.8 },
    // Flat-footed and square. A man carrying a helmet made of brass does not
    // rise onto his toes.
    stance: { settle: 4, spread: 12, heel: 0 },
    headroom: 20,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(1, c.hy, r + 2.5, r + 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      /*
       * The collar is what turns a large head into a bolted-on helmet, and it
       * is doing more work than the ball is: without it the fighter reads as
       * somebody with a big round head, which is a cartoon rather than a
       * costume. There is deliberately no porthole — one ink on a transparent
       * canvas has no second tone to draw a window *in*, and a same-ink ring
       * over a same-ink ball is invisible at every size.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + r - 1);
      ctx.lineTo(r + 3, c.hy + r - 1);
      ctx.lineTo(r + 4, c.hy + r + 4);
      ctx.lineTo(-r - 2, c.hy + r + 4);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
      ctx.beginPath();
      ctx.moveTo(-2, c.hy - r - 1);
      ctx.lineTo(4, c.hy - r - 1);
      ctx.lineTo(3, c.hy - r - 6);
      ctx.lineTo(-1, c.hy - r - 6);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2);
    },
    back: (ctx, c) => {
      // The hose. Stroked and heavy, leaving the back of the helmet and
      // falling to the hip — an accessory that leaves the figure's own bounds
      // reads as a detached shape, which is why it comes back in.
      const coil = Math.sin(c.t * 0.031 + c.phase) * 2.2 - c.vx * 2.4;
      // Heavy, and held well clear of the spine. At three units against the
      // body's own stroke it was a scratch behind the shoulder — a hose has to
      // be *thicker* than the limb it hangs beside or it reads as a seam.
      ink(ctx, c, 4.2, 0.95);
      ctx.moveTo(-c.hr - 3, c.hy + 4);
      ctx.quadraticCurveTo(-22 + coil, c.hy + 13, -19 + coil, c.shY + 17);
      ctx.quadraticCurveTo(-10 + coil, c.hipY + 2, -21 + coil * 0.6, c.hipY + 10);
      ctx.stroke();
    },
  },

  /**
   * The monk: the smallest head and the narrowest stance on the roster, a robe
   * over one shoulder, and beads on the off hand. **The only fighter here with
   * no mark above the shoulders** — which is itself the mark, since every
   * other silhouette is recognised by what it is wearing on its skull.
   */
  monk: {
    label: "The Monk",
    side: "good",
    prop: { shoulder: 0.96, weight: 0.94, hunch: 0, head: 0.84, build: 0 },
    // Feet almost together, hips neither settled nor proud. Standing, not
    // guarding — it is the stillest thing on the sheet.
    stance: { settle: 0, spread: 6, heel: 0 },
    // Nothing reaches above the torso origin at all, and `duelFocus` floors at
    // 26 anyway, so this declares the truth rather than a polite minimum.
    headroom: 0,
    head: (ctx, c) => {
      // A shaved skull carries no mark, so the neck carries it: the rolled
      // collar of the robe, standing behind the head.
      ink(ctx, c, 3.2, 0.9);
      ctx.moveTo(-c.hr - 2, c.hy + c.hr + 2);
      ctx.quadraticCurveTo(0, c.hy + c.hr - 3, c.hr + 2, c.hy + c.hr + 3);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      // The kesa: one band shoulder to opposite hip, leaving the other
      // shoulder bare. Cloth over the body, so it is held at cloth alpha —
      // a solid band here is a sash-shaped slab.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 2, c.shY + 1);
      ctx.lineTo(-c.shX + 5, c.shY - 1);
      ctx.lineTo(c.hipX + 4, c.hipY - 2);
      ctx.lineTo(c.hipX - 3, c.hipY + 1);
      ctx.closePath();
      solid(ctx, c, 0.32, 2.4, 0.9);
      /*
       * **The rolled edge over the shoulder, and this is the fighter's whole
       * read.** On the full contact sheet the monk was the one figure that
       * looked like an undressed rig: a band at cloth alpha and a thin loop
       * are both *interior* detail, and a silhouette is what survives at
       * 61px. The roll is a mark by the gate's measure — it clears the torso
       * — so it may be solid, and it puts a bump on the outline where every
       * other fighter has a helmet.
       */
      ctx.beginPath();
      ctx.moveTo(-c.shX - 5, c.shY + 4);
      ctx.quadraticCurveTo(-c.shX - 7, c.shY - 6, -c.shX + 3, c.shY - 7);
      ctx.quadraticCurveTo(-c.shX + 9, c.shY - 4, -c.shX + 7, c.shY + 4);
      ctx.quadraticCurveTo(-c.shX, c.shY + 1, -c.shX - 5, c.shY + 4);
      ctx.closePath();
      solid(ctx, c, 0.85, 2.4, 0.92);
      // Beads, hanging off the off hand and swinging with it. Bigger than they
      // want to be on paper, for the same reason.
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = c.alpha * 0.85;
      ctx.lineWidth = c.lw(2.8);
      ctx.beginPath();
      ctx.ellipse(c.offHand.x - 1, c.offHand.y + 10, 5.8, 8, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    },
    back: (ctx, c) => {
      // A wrap that flares to the shin, not a box to the knee. The first
      // version left the hips at full width and stopped square, and on the
      // sheet it was a crate the fighter was standing in.
      const sway = Math.sin(c.t * 0.026 + c.phase) * 1.1 - c.vx * 1.6;
      ctx.beginPath();
      ctx.moveTo(-c.hipX + 1, c.hipY - 5);
      ctx.quadraticCurveTo(-9 + sway, c.hipY + 14, -13 + sway, c.feetY - 12);
      ctx.quadraticCurveTo(0, c.feetY - 5, 12 + sway * 0.6, c.feetY - 13);
      ctx.quadraticCurveTo(8, c.hipY + 14, c.hipX - 1, c.hipY - 5);
      ctx.closePath();
      solid(ctx, c, 0.26, 2.4, 0.85);
    },
  },

  /**
   * The nosferatu: a skull taller than it is wide, ears standing off it, and
   * fingers longer than a hand should be. Public domain since 1922 and drawn
   * as a silhouette from the start, which is exactly why folklore beat the
   * client's list of faces.
   */
  nosferatu: {
    label: "The Nosferatu",
    side: "evil",
    prop: { shoulder: 0.86, weight: 0.84, hunch: 3.8, head: 1.02, build: 0 },
    // The narrowest shoulders and the deepest stoop, feet close. Everything
    // about it is vertical, which is what the wide fighters are measured
    // against.
    stance: { settle: 2, spread: 6, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      // The proportion is the mark. A head four units taller than it is wide
      // reads as wrong before any detail arrives, and detail is what this
      // canvas cannot carry.
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - 2, r - 1.5, r + 4, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.4);
      // Ears, standing off and back. Two spikes off the sides of a tall skull
      // cannot be confused with two horns off the crown, which is the one
      // fighter this must stay clear of.
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (r - 3), c.hy - 4);
        ctx.lineTo(s * (r + 6), c.hy - 11);
        ctx.lineTo(s * (r - 2), c.hy + 1);
        ctx.closePath();
        solid(ctx, c, 0.88, 2, 0.9);
      }
    },
    overlay: (ctx, c) => {
      for (let i = 0; i < 3; i += 1) {
        ink(ctx, c, 2, 0.85);
        ctx.moveTo(c.offHand.x - 1, c.offHand.y + 1);
        ctx.quadraticCurveTo(
          c.offHand.x + 4 + i,
          c.offHand.y + 7,
          c.offHand.x + 1 + i * 3,
          c.offHand.y + 13,
        );
        ctx.stroke();
      }
    },
  },

  /**
   * The scarecrow: a sack for a head, tied off at the crown, and straw at both
   * wrists. Loose everywhere — the one fighter whose stance has a heel up and
   * whose head does not sit straight.
   */
  scarecrow: {
    label: "The Scarecrow",
    side: "evil",
    prop: { shoulder: 1.08, weight: 0.9, hunch: 1.4, head: 1.12, build: 0 },
    stance: { settle: -1, spread: 15, heel: 6 },
    headroom: 22,
    head: (ctx, c) => {
      const r = c.hr;
      // Slack at the crown and pinched at the neck, and not symmetrical: a
      // sack has no skull in it holding the shape.
      ctx.beginPath();
      ctx.moveTo(-r - 3, c.hy + 2);
      ctx.quadraticCurveTo(-r - 4, c.hy - r - 5, 1, c.hy - r - 6);
      ctx.quadraticCurveTo(r + 5, c.hy - r - 4, r + 2, c.hy + 3);
      ctx.quadraticCurveTo(r - 3, c.hy + 8, -2, c.hy + 8);
      ctx.quadraticCurveTo(-r + 1, c.hy + 7, -r - 3, c.hy + 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // The tie. Three strokes from one point, fanning — the same shape the
      // straw uses, which is what makes the two read as the same material.
      for (let i = 0; i < 3; i += 1) {
        ink(ctx, c, 1.8, 0.85);
        ctx.moveTo(0, c.hy - r - 5);
        ctx.lineTo(-4 + i * 4, c.hy - r - 10);
        ctx.stroke();
      }
    },
    overlay: (ctx, c) => {
      const straw = (h: { x: number; y: number }) => {
        for (let i = 0; i < 3; i += 1) {
          ink(ctx, c, 1.8, 0.8);
          ctx.moveTo(h.x - 2, h.y + 2);
          ctx.lineTo(h.x - 9 + i * 5, h.y + 11);
          ctx.stroke();
        }
      };
      straw(c.hand);
      straw(c.offHand);
    },
  },
  /**
   * The musketeer: a broad brim and a plume that streams off the back of it.
   * The plume is the mark — a brimmed hat alone is the plague doctor's, and
   * these two are the only hats on the roster, so the difference between them
   * has to be a whole shape rather than a proportion.
   */
  musketeer: {
    label: "The Musketeer",
    side: "good",
    prop: { shoulder: 1.04, weight: 0.96, hunch: 0, head: 1, build: 0 },
    // Front foot forward, back heel up, hips high: the only stance here that
    // is on its toes.
    stance: { settle: -2, spread: 13, heel: 5 },
    headroom: 26,
    head: (ctx, c) => {
      const r = c.hr;
      // The brim sits low and tilts, so the front edge lifts. Level, a brim is
      // a plate balanced on a head.
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 1, r + 8, 3, -0.16, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.2);
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy - r);
      ctx.quadraticCurveTo(-r + 3, c.hy - r - 7, 0, c.hy - r - 7);
      ctx.quadraticCurveTo(r - 2, c.hy - r - 7, r - 1, c.hy - r + 1);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
      // Three strokes, splaying as they go back. Fewer and heavier than looks
      // right on paper — the same lesson the seraph's feathers taught, and for
      // the same reason: the gaps are what read as a plume.
      for (let i = 0; i < 3; i += 1) {
        ink(ctx, c, 2.6 - i * 0.4, 0.9 - i * 0.12);
        ctx.moveTo(-r + 1, c.hy - r - 4);
        ctx.quadraticCurveTo(-14 - i * 2, c.hy - r - 10 - i * 2, -20 - i * 3, c.hy - r - 2 + i * 4);
        ctx.stroke();
      }
    },
    overlay: (ctx, c) => {
      // The baldric, shoulder to opposite hip. Cloth over the body, so cloth
      // alpha — the rule arrives here too.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 2);
      ctx.lineTo(-c.shX + 6, c.shY);
      ctx.lineTo(c.hipX + 5, c.hipY - 3);
      ctx.lineTo(c.hipX - 2, c.hipY);
      ctx.closePath();
      solid(ctx, c, 0.32, 2.4, 0.9);
    },
  },

  /**
   * The valkyrie: wings at the temples rather than at the back. Deliberately
   * the same idea as the seraph solved in the other place — the seraph's span
   * is behind the shoulders and this one's is on the skull, and at ornament
   * size *where* a shape sits separates two fighters more reliably than what
   * the shape is.
   */
  valkyrie: {
    label: "The Valkyrie",
    side: "good",
    prop: { shoulder: 1.04, weight: 1, hunch: 0, head: 0.98, build: 0.3 },
    stance: { settle: -3, spread: 11, heel: 3 },
    headroom: 23,
    head: (ctx, c) => {
      const r = c.hr;
      // The cap first: the wings need something to be bolted to, or they read
      // as two shapes floating either side of a head.
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 1, c.hy - r - 3, 0, c.hy - r - 3);
      ctx.quadraticCurveTo(r + 1, c.hy - r - 3, r + 1, c.hy + 1);
      ctx.quadraticCurveTo(0, c.hy - r + 3, -r - 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
      /*
       * The two wings have to be pulled well apart or they composite into one
       * flap and the fighter reads as wearing a cap with an ear. The far one
       * is forward *and* low, the near one back and high, and each is broad
       * enough to be a wing rather than a blade — the seraph's lesson about
       * gaps, applied to a pair instead of to a fan.
       */
      const wing = (dx: number, alpha: number, lift: number) => {
        ctx.beginPath();
        ctx.moveTo(dx, c.hy - 2);
        ctx.quadraticCurveTo(dx - 8, c.hy - 9 - lift, dx - 13, c.hy - 18 - lift);
        ctx.quadraticCurveTo(dx - 1, c.hy - 13 - lift, dx + 4, c.hy - 4);
        ctx.closePath();
        solid(ctx, c, 0.82 * alpha, 2.2, alpha);
      };
      wing(-r + 10, 0.45, -7);
      wing(-r + 1, 1, 2);
    },
    back: (ctx, c) => {
      // One braid to the hip, swinging behind. Stroked and single: two braids
      // is hair, and hair belongs to the apprentice.
      const swing = Math.sin(c.t * 0.036 + c.phase) * 2 - c.vx * 2.2;
      ink(ctx, c, 3.4, 0.9);
      ctx.moveTo(-c.hr + 1, c.hy + 4);
      ctx.quadraticCurveTo(-11 + swing, c.shY + 12, -8 + swing, c.hipY + 2);
      ctx.stroke();
    },
  },

  /**
   * The wendigo: antlers, and nothing else. The build carries the rest — the
   * lightest stroke on the roster over a visible ribcage, which is a body that
   * has been starving rather than one that has been training.
   */
  wendigo: {
    label: "The Wendigo",
    side: "evil",
    prop: { shoulder: 1, weight: 0.8, hunch: 4.2, head: 0.9, build: 0.55 },
    stance: { settle: 3, spread: 12, heel: 0 },
    headroom: 31,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * Antlers, not horns. The devil's two horns curve *back* off the crown
       * and are drawn as masses; these branch, go *up*, and are stroked — the
       * branching is the whole difference, and it survives at phone size
       * because a fork is a change of direction rather than a detail.
       */
      const antler = (dx: number, dir: number, alpha: number, span: number) => {
        // The beam sweeps *out* before it goes up, so the pair opens into a V
        // rather than standing parallel. Parallel, they were a crown of
        // spikes, which is a fighter this roster already has.
        ink(ctx, c, 2.8, alpha);
        ctx.moveTo(dx, c.hy - r + 1);
        ctx.quadraticCurveTo(dx + dir * span, c.hy - r - 8, dx + dir * (span - 3), c.hy - r - 21);
        ctx.stroke();
        // Two tines off the outside of the beam, short and forward of it. A
        // tine as long as its beam is a second antler.
        for (let i = 0; i < 2; i += 1) {
          const t = 0.4 + i * 0.32;
          ink(ctx, c, 2.2, alpha * 0.9);
          ctx.moveTo(dx + dir * span * t * 0.9, c.hy - r - 11 * t);
          ctx.lineTo(dx + dir * (span + 4 + i * 2), c.hy - r - 12 - i * 6);
          ctx.stroke();
        }
      };
      // Not a mirrored pair: an animal that has grown these has grown them
      // unevenly, and symmetry is what made the first version read as a crown.
      antler(-2, -1, 0.95, 13);
      antler(2, 1, 0.78, 9);
    },
  },

  /**
   * The executioner: a flat-topped bag over the head and the second-heaviest
   * build here. Set against the hermit and the hollow deliberately — all three
   * are heads under cloth, and this one is the only one that is *soft and
   * wide* rather than peaked, which is the one difference a 61px figure keeps.
   */
  executioner: {
    label: "The Executioner",
    side: "evil",
    prop: { shoulder: 1.32, weight: 1.36, hunch: 0.4, head: 1.06, build: 1 },
    stance: { settle: 4, spread: 13, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * **Flat across the top, and square at the corners.** Drawn as a rounded
       * bag it was the hermit's cowl with the peak taken off, and those two
       * are the same silhouette at the size this renders. A straight crown is
       * the one line that cannot be mistaken for a hood.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 4, c.hy + 11);
      ctx.lineTo(-r - 4, c.hy - r - 2);
      ctx.lineTo(-r + 1, c.hy - r - 5);
      ctx.lineTo(r - 1, c.hy - r - 5);
      ctx.lineTo(r + 4, c.hy - r - 2);
      ctx.lineTo(r + 4, c.hy + 11);
      ctx.quadraticCurveTo(0, c.hy + 15, -r - 4, c.hy + 11);
      ctx.closePath();
      solid(ctx, c, 0.93, 2.8);
    },
    overlay: (ctx, c) => {
      // A belt wide enough to read at the waist, and bare arms above it. The
      // belt clears the torso box entirely, so it is a mark and may be solid.
      ctx.beginPath();
      ctx.moveTo(-11, c.hipY - 3);
      ctx.lineTo(11, c.hipY - 3);
      ctx.lineTo(12, c.hipY + 4);
      ctx.lineTo(-12, c.hipY + 4);
      ctx.closePath();
      solid(ctx, c, 0.8, 2.4, 0.9);
    },
  },
  /**
   * The beekeeper: a flat brim with a veil hanging off it to the shoulders.
   * The third brim on the roster and the one that had to earn its place — it
   * does, because the veil is a *panel*, and the plague doctor's beak and the
   * musketeer's plume are both spikes. Three hats, three different second
   * shapes.
   */
  beekeeper: {
    label: "The Beekeeper",
    side: "good",
    prop: { shoulder: 1.02, weight: 1, hunch: 0, head: 0.94, build: 0 },
    stance: { settle: 1, spread: 10, heel: 0 },
    headroom: 19,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * The veil goes down first so the brim sits on top of it, and it is held
       * at cloth alpha even though the gate would allow it solid: it is a veil,
       * and the head has to read *through* it. This is the one costume where
       * the translucency is the character rather than a rule being obeyed.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 9, c.hy - r + 1);
      ctx.lineTo(r + 9, c.hy - r + 1);
      ctx.lineTo(r + 6, c.shY + 4);
      ctx.lineTo(-r - 6, c.shY + 4);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.2, 0.85);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - r, r + 10, 2.6, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.2);
      // Flat-topped and low. A domed crown under a wide brim is the
      // musketeer's hat with the plume pulled off.
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy - r - 1);
      ctx.lineTo(-r + 3, c.hy - r - 8);
      ctx.lineTo(r - 3, c.hy - r - 8);
      ctx.lineTo(r - 2, c.hy - r - 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
  },

  /**
   * The falconer: a bird on the off shoulder. The only costume on the roster
   * that is a second creature, and it works at this size for the same reason
   * everything else here does — it is a silhouette with one spike on it (the
   * beak) sitting where nothing else on any fighter sits.
   */
  falconer: {
    label: "The Falconer",
    side: "good",
    prop: { shoulder: 1.06, weight: 1.02, hunch: 0, head: 0.92, build: 0 },
    stance: { settle: 0, spread: 11, heel: 2 },
    headroom: 16,
    head: (ctx, c) => {
      const r = c.hr;
      // A flat cap with a short bill, kept deliberately small: the bird is the
      // read and a second strong shape on the skull would compete with it.
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy - r + 3);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r + 1, c.hy - r + 2);
      ctx.lineTo(r + 6, c.hy - r + 4);
      ctx.lineTo(r + 5, c.hy - r + 6);
      ctx.quadraticCurveTo(0, c.hy - r + 2, -r - 1, c.hy - r + 3);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.2);
    },
    overlay: (ctx, c) => {
      /*
       * The bird sits **above** the shoulder with daylight under it. Perched
       * level with the shoulder line it merged into the fighter's own
       * outline and read as a bundle strapped on — the same failure as the
       * plague doctor's beak under its brim, arriving on a different part of
       * the body. What separates a creature from a lump is the gap.
       */
      const bx = -c.shX - 1;
      const by = c.shY - 13;
      const bob = Math.sin(c.t * 0.05 + c.phase) * 0.9;
      ctx.beginPath();
      ctx.ellipse(bx, by + bob, 6.4, 5, -0.3, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.4);
      // Head and beak as one shape, because at this size a bird's head is the
      // beak and nothing else.
      /*
       * **The bird faces backwards.** Facing forward its beak ran straight at
       * the fighter's own skull and the two shapes merged into one two-headed
       * silhouette — there is nowhere else on a shoulder for a beak to point.
       * Turned round, the beak leaves the figure and the tail is short enough
       * to stay clear.
       */
      ctx.beginPath();
      ctx.moveTo(bx - 2, by - 4 + bob);
      ctx.quadraticCurveTo(bx - 9, by - 9 + bob, bx - 12, by - 4 + bob);
      ctx.quadraticCurveTo(bx - 7, by - 1 + bob, bx - 2, by - 1 + bob);
      ctx.closePath();
      solid(ctx, c, 0.92, 2);
      ink(ctx, c, 2.6, 0.9);
      ctx.moveTo(bx + 5, by + 3 + bob);
      ctx.lineTo(bx + 11, by + 9 + bob);
      ctx.stroke();
      // The gauntlet it is standing on, and the forearm holding it up.
      ink(ctx, c, 4.4, 0.75);
      ctx.moveTo(bx - 5, by + 6 + bob);
      ctx.lineTo(bx + 5, by + 6 + bob);
      ctx.stroke();
      ink(ctx, c, 3, 0.6);
      ctx.moveTo(bx + 1, by + 7 + bob);
      ctx.lineTo(bx + 3, c.shY + 1);
      ctx.stroke();
    },
  },

  /**
   * The witch: a brim with a tall cone bending back off it, and stringy hair
   * under it. The bend is load-bearing — a straight cone is a party hat, and
   * the tip going back is what makes the whole shape lean.
   */
  witch: {
    label: "The Witch",
    side: "evil",
    prop: { shoulder: 0.94, weight: 0.88, hunch: 3, head: 0.92, build: 0 },
    stance: { settle: 3, spread: 12, heel: 0 },
    headroom: 31,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 1, r + 7, 3.2, 0.1, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.2);
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r - 1);
      ctx.quadraticCurveTo(-6, c.hy - r - 14, -15, c.hy - r - 20);
      ctx.quadraticCurveTo(-6, c.hy - r - 10, r - 1, c.hy - r - 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
      // Hair, hanging out from under the brim. Two strokes a side and no more:
      // more than that is a mane, and a mane belongs to the apprentice.
      for (let i = 0; i < 2; i += 1) {
        ink(ctx, c, 2, 0.8);
        ctx.moveTo(-r - 1 + i * 2, c.hy - r + 3);
        ctx.quadraticCurveTo(-r - 4 - i, c.hy + 4, -r - 2 - i * 2, c.hy + 12);
        ctx.stroke();
      }
    },
  },

  /**
   * The mummy: a wrapped head and one bandage that never got tucked in. The
   * trailing end is drawn as a *band* rather than a stroke — the roster
   * already has a topknot tail and a braid, and the thing that separates cloth
   * from hair at this size is that cloth has two edges.
   */
  mummy: {
    label: "The Mummy",
    side: "evil",
    prop: { shoulder: 1.04, weight: 1.06, hunch: 1, head: 1, build: 0 },
    // Square and stiff, feet closer than the fighting stances. Nothing about
    // it is coiled, which is the read.
    stance: { settle: 2, spread: 9, heel: 0 },
    headroom: 18,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * **Lumpy, and knotted off-centre.** Drawn as a clean ovoid this was an
       * ordinary head one size up — nothing on the sheet said it was wrapped,
       * because one ink over a transparent canvas cannot draw a band *across*
       * a shape it has already filled. So the wrapping has to happen on the
       * outline: four bulges of different sizes, and a knot where the last
       * turn was tied.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 2, c.hy + 3);
      ctx.quadraticCurveTo(-r - 3, c.hy - r, -r + 2, c.hy - r - 2);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r - 1, c.hy - r - 1);
      ctx.quadraticCurveTo(r + 4, c.hy - 2, r + 1, c.hy + 5);
      ctx.quadraticCurveTo(r - 3, c.hy + 9, -1, c.hy + 8);
      ctx.quadraticCurveTo(-r + 1, c.hy + 8, -r - 2, c.hy + 3);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      ctx.beginPath();
      ctx.ellipse(-4, c.hy - r - 4, 4, 3, -0.4, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2);
      // Trail scaled to keep the far tip inside the 34 units the camera frames
      // at full sprint — a bandage that leaves the shot is a bandage nobody
      // sees leave it.
      const drift = Math.sin(c.t * 0.03 + c.phase) * 2.4 - c.vx * 2;
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + 1);
      ctx.quadraticCurveTo(-14 + drift, c.hy + 7, -22 + drift, c.hy + 21);
      ctx.quadraticCurveTo(-13 + drift, c.hy + 13, -r - 1, c.hy + 8);
      ctx.closePath();
      solid(ctx, c, 0.55, 2.2, 0.9);
    },
    overlay: (ctx, c) => {
      // Loose ends at both wrists, trailing the hand rather than hanging off
      // it — they have to move with the arm or they read as damage.
      const end = (h: { x: number; y: number }) => {
        ink(ctx, c, 2.2, 0.75);
        ctx.moveTo(h.x - 3, h.y + 2);
        ctx.quadraticCurveTo(h.x - 9, h.y + 8, h.x - 8, h.y + 14);
        ctx.stroke();
      };
      end(c.hand);
      end(c.offHand);
    },
  },
  /**
   * The watchman: a lantern on the off hand, lit in the blade colour. The
   * second costume on the roster allowed a colour of its own — the saint's
   * halo was the first — and for the same reason: a light that is the same ink
   * as the thing holding it is not a light, it is a box.
   */
  lantern: {
    label: "The Watchman",
    side: "good",
    prop: { shoulder: 1.06, weight: 1.08, hunch: 0.6, head: 0.96, build: 0.3 },
    stance: { settle: 2, spread: 11, heel: 0 },
    headroom: 16,
    head: (ctx, c) => {
      const r = c.hr;
      // A collar turned up around the jaw, not a cap: the falconer already has
      // the cap, and a man on a night watch is dressed against the cold rather
      // than for the weather.
      ctx.beginPath();
      ctx.moveTo(-r - 5, c.hy + 4);
      ctx.quadraticCurveTo(-r - 3, c.hy + 10, 0, c.hy + 11);
      ctx.quadraticCurveTo(r + 3, c.hy + 10, r + 5, c.hy + 3);
      ctx.lineTo(r + 3, c.hy + 13);
      ctx.quadraticCurveTo(0, c.hy + 16, -r - 3, c.hy + 13);
      ctx.closePath();
      solid(ctx, c, 0.82, 2.4, 0.9);
      // A flat cap on top, low enough not to compete with the lantern.
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy - r + 2);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r + 1, c.hy - r + 2);
      ctx.quadraticCurveTo(0, c.hy - r + 4, -r - 1, c.hy - r + 2);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.2);
    },
    overlay: (ctx, c) => {
      const lx = c.offHand.x - 1;
      const ly = c.offHand.y + 13;
      ink(ctx, c, 2, 0.85);
      ctx.moveTo(c.offHand.x, c.offHand.y + 2);
      ctx.quadraticCurveTo(lx, ly - 10, lx, ly - 7);
      ctx.stroke();
      // The case, stroked rather than massed: the light has to come out of it.
      ink(ctx, c, 2.6, 0.9);
      ctx.moveTo(lx - 6, ly - 7);
      ctx.lineTo(lx + 6, ly - 7);
      ctx.lineTo(lx + 5, ly + 6);
      ctx.lineTo(lx - 5, ly + 6);
      ctx.closePath();
      ctx.stroke();
      // The flame, and one ring of spill around it. Both in the blade colour,
      // both stroked, and the spill pulses — a lantern that does not move is a
      // lamp somebody left on a shelf.
      const flick = 0.85 + Math.sin(c.t * 0.12 + c.phase) * 0.15;
      ctx.strokeStyle = c.blade;
      ctx.globalAlpha = 0.95 * c.dim;
      ctx.lineWidth = c.lw(2.6);
      ctx.beginPath();
      ctx.ellipse(lx, ly, 2.4, 3.4 * flick, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.24 * c.dim * flick;
      ctx.lineWidth = c.lw(1.8);
      ctx.beginPath();
      ctx.ellipse(lx, ly, 9 * flick, 10 * flick, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  /**
   * The sentinel: a tower helm, taller than it is wide, on the second-heaviest
   * build. Set against the golem and the executioner on purpose — three
   * fighters whose head is a solid block, separated by nothing but proportion:
   * the golem's is wide, the executioner's is soft, and this one is tall.
   */
  sentinel: {
    label: "The Sentinel",
    side: "good",
    prop: { shoulder: 1.24, weight: 1.26, hunch: 0, head: 1, build: 0.9 },
    // Square and vertical, hips barely settled. It is standing a post.
    stance: { settle: 1, spread: 10, heel: 0 },
    headroom: 22,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + 8);
      ctx.lineTo(-r + 1, c.hy - r - 8);
      ctx.lineTo(-r + 4, c.hy - r - 11);
      ctx.lineTo(r - 3, c.hy - r - 11);
      ctx.lineTo(r, c.hy - r - 8);
      ctx.lineTo(r, c.hy + 8);
      ctx.lineTo(r + 3, c.hy + 11);
      ctx.lineTo(-r - 3, c.hy + 11);
      ctx.closePath();
      solid(ctx, c, 0.93, 2.8);
    },
    overlay: (ctx, c) => {
      // A gorget across both shoulders — one band, so the helm sits on a plate
      // rather than on a neck.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 4, c.shY + 1);
      ctx.quadraticCurveTo(0, c.shY - 6, c.shX + 4, c.shY + 1);
      ctx.quadraticCurveTo(0, c.shY + 4, -c.shX - 4, c.shY + 1);
      ctx.closePath();
      solid(ctx, c, 0.8, 2.4, 0.9);
    },
  },

  /**
   * The count: a collar standing higher than the head. Everything else about
   * this figure is upright and narrow, and the collar is the one shape on the
   * roster that rises from the *shoulders* rather than from the skull.
   */
  count: {
    label: "The Count",
    side: "evil",
    prop: { shoulder: 1.1, weight: 1, hunch: -1.2, head: 0.96, build: 0 },
    // Hips high, feet close, no heel lift. Nothing here is braced; it does not
    // expect to have to move.
    stance: { settle: -3, spread: 8, heel: 0 },
    headroom: 19,
    head: (ctx, c) => {
      const r = c.hr;
      // The widow's peak: a small mass over the crown coming to a point at the
      // brow. Kept under the head's own radius, or it is a helmet.
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r + 3);
      ctx.quadraticCurveTo(0, c.hy - r - 4, r - 1, c.hy - r + 3);
      ctx.quadraticCurveTo(r - 3, c.hy - r + 4, 0, c.hy - r + 8);
      ctx.quadraticCurveTo(-r + 3, c.hy - r + 4, -r + 1, c.hy - r + 3);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2);
    },
    overlay: (ctx, c) => {
      // One fin, behind the head and to the back. Two would frame the skull
      // symmetrically and read as wings, which the valkyrie owns.
      ctx.beginPath();
      ctx.moveTo(-c.shX + 1, c.shY + 3);
      ctx.quadraticCurveTo(-c.shX - 5, c.shY - 16, -4, c.shY - 30);
      ctx.lineTo(-1, c.shY - 22);
      ctx.quadraticCurveTo(-c.shX + 3, c.shY - 9, -c.shX + 6, c.shY + 3);
      ctx.closePath();
      solid(ctx, c, 0.62, 2.4, 0.92);
    },
    back: (ctx, c) => {
      // A cape to the hip, not to the floor — the mask's reaches the ground
      // and these two must not read as the same fighter from behind.
      const trail = -8 - c.vx * 1.8 + Math.sin(c.t * 0.035 + c.phase) * 1.6;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 2);
      ctx.quadraticCurveTo(trail - 6, c.shY + 18, trail - 10, c.hipY + 8);
      ctx.quadraticCurveTo(trail - 1, c.hipY + 12, trail + 8, c.hipY + 4);
      ctx.quadraticCurveTo(trail * 0.4, c.shY + 16, 0, c.shY + 1);
      ctx.closePath();
      solid(ctx, c, 0.26, 2.6, 0.92);
    },
  },

  /**
   * The headless: no skull at all, and the head carried under the off arm.
   * The only fighter here recognised by an *absence*, which is why it is also
   * the only one that has to draw the stump — an empty neck with nothing on it
   * reads as a rendering fault, and this effect has shipped one of those.
   */
  headless: {
    label: "The Headless",
    side: "evil",
    prop: { shoulder: 1.14, weight: 1.12, hunch: 0, head: 1, build: 0.6 },
    stance: { settle: 1, spread: 13, heel: 0 },
    headroom: 6,
    hollow: true,
    head: (ctx, c) => {
      // The severed neck: a closed collar where the head should be, so the gap
      // above it is deliberate.
      ctx.beginPath();
      ctx.ellipse(0, c.hy + c.hr - 1, 6.4, 2.6, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.85, 2.6);
      ink(ctx, c, 2.4, 0.7);
      ctx.moveTo(-5, c.hy + c.hr - 4);
      ctx.quadraticCurveTo(0, c.hy + c.hr - 7, 5, c.hy + c.hr - 4);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      // The head itself, held at the off hand and swinging with it. A mark, by
      // the gate's measure — it clears most of the torso — so it may be solid,
      // which is what makes it read as a head and not as a bag.
      const gx = c.offHand.x - 2;
      const gy = c.offHand.y + 3;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 6, 6.4, 0.2, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // The hand it is held by, over the crown.
      ink(ctx, c, 2.6, 0.8);
      ctx.moveTo(gx - 5, gy - 5);
      ctx.quadraticCurveTo(gx, gy - 9, gx + 5, gy - 4);
      ctx.stroke();
    },
  },
  /**
   * The herald: a trumpet slung across the back. A long straight diagonal
   * behind the shoulders is a shape no other fighter here makes — every other
   * back hook on the roster is cloth, and cloth hangs.
   */
  herald: {
    label: "The Herald",
    side: "good",
    prop: { shoulder: 1, weight: 0.98, hunch: 0, head: 0.94, build: 0 },
    stance: { settle: -1, spread: 10, heel: 2 },
    headroom: 22,
    back: (ctx, c) => {
      /*
       * Long, and heavier than the limbs it crosses. The first version ran
       * from the hip to the shoulder and its bell sat behind the skull, where
       * it read as a small pennant — the diagonal has to be longer than the
       * torso for the eye to take it as one object passing behind the figure.
       */
      ink(ctx, c, 4, 0.92);
      ctx.moveTo(-21, c.hipY + 10);
      ctx.lineTo(5, c.shY - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, c.shY - 17);
      ctx.lineTo(11, c.shY - 33);
      ctx.lineTo(17, c.shY - 22);
      ctx.lineTo(7, c.shY - 12);
      ctx.closePath();
      solid(ctx, c, 0.85, 2.4, 0.9);
    },
    overlay: (ctx, c) => {
      // The tabard: a full front panel to the hip, square at the hem. Wider
      // than the monk's band and the musketeer's baldric, which are the two
      // other diagonals — this one is not a diagonal at all.
      ctx.beginPath();
      ctx.moveTo(-c.shX + 1, c.shY + 3);
      ctx.lineTo(c.shX - 1, c.shY + 3);
      ctx.lineTo(c.hipX + 3, c.hipY + 4);
      ctx.lineTo(-c.hipX - 3, c.hipY + 4);
      ctx.closePath();
      solid(ctx, c, 0.32, 2.4, 0.9);
    },
  },

  /**
   * The smith: a hammer at the belt and a build to swing it. The hammer hangs
   * *below* the hips, which is the only place on the figure nothing else on
   * this roster puts anything — the eye finds it because the neighbourhood is
   * empty.
   */
  smith: {
    label: "The Smith",
    side: "good",
    prop: { shoulder: 1.22, weight: 1.3, hunch: 0.8, head: 0.98, build: 0.8 },
    stance: { settle: 4, spread: 12, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      // A rolled leather cap, close to the skull. Small on purpose: the
      // hammer is the read and a second heavy shape would split it.
      ctx.beginPath();
      ctx.moveTo(-r - 2, c.hy - r + 5);
      ctx.quadraticCurveTo(0, c.hy - r - 6, r + 2, c.hy - r + 5);
      ctx.quadraticCurveTo(0, c.hy - r + 2, -r - 2, c.hy - r + 5);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      const hx = -9;
      const hy = c.hipY + 6;
      const swing = Math.sin(c.t * 0.04 + c.phase) * 1.2 - c.vx * 1.4;
      ink(ctx, c, 2.8, 0.9);
      ctx.moveTo(hx + 3, c.hipY - 2);
      ctx.lineTo(hx - 1 + swing, hy + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx - 7 + swing, hy + 5);
      ctx.lineTo(hx + 5 + swing, hy + 3);
      ctx.lineTo(hx + 6 + swing, hy + 11);
      ctx.lineTo(hx - 6 + swing, hy + 13);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4, 0.9);
    },
  },

  /**
   * The reaper: a bare skull. Deliberately **not** hooded — the hermit, the
   * hollow and the executioner already own cloth over a head, and a hooded
   * reaper would be a fourth. What is left is the skull itself, which is a
   * wide cranium over a narrow jaw, and that proportion is the whole mark.
   */
  reaper: {
    label: "The Reaper",
    side: "evil",
    prop: { shoulder: 1.04, weight: 0.82, hunch: 1.6, head: 1.06, build: 0.7 },
    stance: { settle: 2, spread: 12, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * **One mass with a waist in it.** A dome with a jaw drawn under it —
       * filled or stroked, both were tried — reads as an egg with a line on
       * it, because the two shapes share an edge and the eye takes the outer
       * one. A skull is a wide cranium, a pinch at the cheek and a narrow jaw,
       * and that is a single outline that changes direction twice.
       */
      /*
       * The waist has to be **deep**. At the first depth — a cranium of r+1
       * over a jaw of r-4 — the outline was a smooth egg on the full sheet,
       * because two units of pinch is one pixel at the size this renders. A
       * wide dome over a jaw half its width is the same drawing with the
       * proportion pushed until it survives.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 3, c.hy - 3);
      ctx.quadraticCurveTo(-r - 3, c.hy - r - 5, 0, c.hy - r - 5);
      ctx.quadraticCurveTo(r + 3, c.hy - r - 5, r + 3, c.hy - 3);
      ctx.quadraticCurveTo(r, c.hy + 3, r - 6, c.hy + 4);
      ctx.quadraticCurveTo(r - 5, c.hy + 15, 0, c.hy + 16);
      ctx.quadraticCurveTo(-r + 5, c.hy + 15, -r + 6, c.hy + 4);
      ctx.quadraticCurveTo(-r, c.hy + 3, -r - 3, c.hy - 3);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
    },
  },

  /**
   * The werewolf: a muzzle out front, ears swept back, and a heavy tail. The
   * only head on the roster whose mass leaves the skull *forward* — the plague
   * doctor's beak is the near miss, and the two are separated by the beak
   * being a spike under a hat and this being a blunt jaw under two ears.
   */
  werewolf: {
    label: "The Werewolf",
    side: "evil",
    prop: { shoulder: 1.16, weight: 1.16, hunch: 4.6, head: 1, build: 0.6 },
    // Low and long, back heel up: an animal about to close the distance.
    stance: { settle: 5, spread: 14, heel: 3 },
    headroom: 20,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(0, c.hy - 3);
      ctx.quadraticCurveTo(r + 8, c.hy - 3, r + 11, c.hy + 3);
      ctx.quadraticCurveTo(r + 9, c.hy + 7, 0, c.hy + 6);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
      for (const [dx, dy] of [
        [-2, -1],
        [2, 0],
      ]) {
        ctx.beginPath();
        ctx.moveTo(dx - 1, c.hy - r + 2);
        ctx.lineTo(dx - 8, c.hy - r - 8 + dy);
        ctx.lineTo(dx + 4, c.hy - r - 1);
        ctx.closePath();
        solid(ctx, c, 0.88, 2.2, 0.9);
      }
    },
    back: (ctx, c) => {
      // A heavy tapered tail, low. The devil's is a thin stroke with a spade
      // on the end; this one is mass, and the difference is the animal.
      const lash = Math.sin(c.t * 0.045 + c.phase) * 3 - c.vx * 1.8;
      ctx.beginPath();
      ctx.moveTo(-3, c.hipY - 2);
      ctx.quadraticCurveTo(-16, c.hipY + 6, -24 + lash, c.hipY + 2 + lash * 0.5);
      ctx.quadraticCurveTo(-15, c.hipY + 12, -2, c.hipY + 5);
      ctx.closePath();
      solid(ctx, c, 0.72, 2.4, 0.9);
    },
    overlay: (ctx, c) => {
      // A ruff at the shoulders — short spikes off the collar line, which is
      // what stops the muzzle reading as a helmet on a man.
      for (let i = 0; i < 5; i += 1) {
        const x = -c.shX + 2 + (i * (c.shX * 2 - 4)) / 4;
        ink(ctx, c, 2.2, 0.8);
        ctx.moveTo(x, c.shY + 3);
        ctx.lineTo(x - 2 + (i - 2) * 1.6, c.shY - 6);
        ctx.stroke();
      }
    },
  },
  /**
   * The piper: three drones fanning off one shoulder. The herald's trumpet is
   * the near miss and the difference is countable — one rod against three, and
   * three of anything reads as a bundle before the eye has resolved what it is
   * looking at.
   */
  piper: {
    label: "The Piper",
    side: "good",
    prop: { shoulder: 1.06, weight: 1.04, hunch: 0, head: 0.96, build: 0 },
    stance: { settle: 1, spread: 11, heel: 0 },
    headroom: 19,
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.028 + c.phase) * 0.8;
      for (let i = 0; i < 3; i += 1) {
        ink(ctx, c, 2.8 - i * 0.3, 0.9 - i * 0.1);
        ctx.moveTo(-c.shX + 2, c.shY + 2);
        ctx.lineTo(-c.shX - 4 - i * 4 + sway, c.shY - 24 - i * 3);
        ctx.stroke();
      }
    },
    overlay: (ctx, c) => {
      // The bag, under the off arm. Solid enough to be an object rather than
      // cloth — the gate allows it, because it clears most of the torso.
      const puff = Math.sin(c.t * 0.033 + c.phase) * 0.5;
      ctx.beginPath();
      ctx.ellipse(-c.shX + 3, c.shY + 12, 8 + puff, 6.5 + puff, -0.3, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.6, 2.4, 0.9);
    },
  },

  /**
   * The nomad: a wrapped head with a tail of cloth streaming off it. Set
   * against the mummy on purpose — both are heads under cloth with something
   * trailing, and they are held apart by *tempo*: the mummy's end is short,
   * lumpy and slack, and this one is long, smooth and pulled taut by travel.
   */
  nomad: {
    label: "The Nomad",
    side: "good",
    prop: { shoulder: 1, weight: 0.98, hunch: 0.6, head: 1.04, build: 0 },
    stance: { settle: 1, spread: 12, heel: 2 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      // The wrap: wider than the skull and flat across the top, so it reads as
      // cloth wound round rather than as a helmet.
      ctx.beginPath();
      ctx.moveTo(-r - 4, c.hy + 2);
      ctx.quadraticCurveTo(-r - 5, c.hy - r - 2, -r + 2, c.hy - r - 4);
      ctx.lineTo(r - 1, c.hy - r - 4);
      ctx.quadraticCurveTo(r + 5, c.hy - r - 1, r + 4, c.hy + 2);
      ctx.quadraticCurveTo(0, c.hy + 5, -r - 4, c.hy + 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // The veil across the lower face, held lighter so the jaw reads through
      // it — the beekeeper's rule, on a smaller panel.
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + 2);
      ctx.quadraticCurveTo(0, c.hy + 12, r + 1, c.hy + 2);
      ctx.quadraticCurveTo(0, c.hy + 7, -r - 1, c.hy + 2);
      ctx.closePath();
      solid(ctx, c, 0.45, 2.2, 0.85);
      // The tail. Two edges, long, and pulled straighter the faster it goes.
      // Scaled to keep the tip inside the 34 units the camera frames at a
      // full sprint: at three units per unit of travel the tail left the shot.
      const drag = Math.sin(c.t * 0.032 + c.phase) * 2.2 - c.vx * 1.8;
      ctx.beginPath();
      ctx.moveTo(-r - 3, c.hy - 3);
      ctx.quadraticCurveTo(-15 + drag, c.hy + 2, -24 + drag, c.hy + 12);
      ctx.quadraticCurveTo(-15 + drag, c.hy + 8, -r - 3, c.hy + 3);
      ctx.closePath();
      solid(ctx, c, 0.5, 2.2, 0.88);
    },
  },

  /**
   * The hyde: a top hat over a body that has gone wrong. The hat is the fifth
   * on the roster and the one that had to justify itself hardest — it does it
   * by being the only one with *straight sides*, which is a thing a 61px
   * outline keeps when it has lost everything else.
   */
  hyde: {
    label: "The Hyde",
    side: "evil",
    prop: { shoulder: 1.28, weight: 1.3, hunch: 3.2, head: 0.96, build: 1 },
    stance: { settle: 5, spread: 13, heel: 0 },
    headroom: 26,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(0, c.hy - r + 1, r + 6, 2.6, -0.06, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.2);
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r - 1);
      ctx.lineTo(-r + 2, c.hy - r - 15);
      ctx.lineTo(r - 1, c.hy - r - 15);
      ctx.lineTo(r - 1, c.hy - r - 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      // One shoulder, not two. The asymmetry is the character — a matched pair
      // of pads is armour, and armour belongs to three fighters already.
      ctx.beginPath();
      ctx.moveTo(-c.shX - 2, c.shY + 8);
      ctx.quadraticCurveTo(-c.shX - 9, c.shY - 10, -2, c.shY - 12);
      ctx.quadraticCurveTo(4, c.shY - 6, 2, c.shY + 6);
      ctx.quadraticCurveTo(-c.shX + 2, c.shY + 3, -c.shX - 2, c.shY + 8);
      ctx.closePath();
      solid(ctx, c, 0.72, 2.6, 0.92);
    },
  },

  /**
   * The boar: a short blunt snout and two tusks coming up off the jaw. The
   * werewolf is the fighter it must not resemble, and the separation is the
   * direction of the second shape — a muzzle goes forward, and these go up.
   */
  boar: {
    label: "The Boar",
    side: "evil",
    prop: { shoulder: 1.3, weight: 1.28, hunch: 4, head: 1.08, build: 0.9 },
    stance: { settle: 5, spread: 15, heel: 0 },
    headroom: 18,
    head: (ctx, c) => {
      const r = c.hr;
      // The snout: short, blunt and square at the end.
      ctx.beginPath();
      ctx.moveTo(1, c.hy - 1);
      ctx.lineTo(r + 7, c.hy + 1);
      ctx.lineTo(r + 7, c.hy + 8);
      ctx.lineTo(1, c.hy + 8);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
      // Tusks, off the lower jaw and curling up past the snout. Two, and the
      // near one longer — a matched pair reads as a moustache.
      const tusk = (x: number, len: number, alpha: number) => {
        ctx.beginPath();
        ctx.moveTo(x, c.hy + 8);
        ctx.quadraticCurveTo(x + 5, c.hy + 4, x + 3, c.hy - len);
        ctx.quadraticCurveTo(x + 1, c.hy + 3, x - 2, c.hy + 8);
        ctx.closePath();
        solid(ctx, c, 0.9 * alpha, 2, alpha);
      };
      tusk(r + 2, 9, 1);
      tusk(r - 3, 5, 0.72);
      // Two small ears, forward off the crown — the werewolf's are swept back,
      // and that is the pair's other separation.
      for (const dx of [-3, 3]) {
        ctx.beginPath();
        ctx.moveTo(dx, c.hy - r + 2);
        ctx.lineTo(dx + 5, c.hy - r - 6);
        ctx.lineTo(dx + 6, c.hy - r + 1);
        ctx.closePath();
        solid(ctx, c, 0.86, 2, 0.9);
      }
    },
  },
  /**
   * The standard-bearer: a pole above the shoulder with a pennant streaming
   * off it. The tallest thing on the roster, and the reason it is worth the
   * camera it costs — `duelFocus` reserves `headroom + 16`, so a banner pulls
   * the shot back on every frame it is in. It earns that by being the only
   * fighter identifiable from outside the frame the others fit in.
   */
  standard: {
    label: "The Standard-Bearer",
    side: "good",
    prop: { shoulder: 1.08, weight: 1.06, hunch: 0, head: 0.96, build: 0.3 },
    stance: { settle: 1, spread: 11, heel: 0 },
    headroom: 25,
    back: (ctx, c) => {
      const wave = Math.sin(c.t * 0.04 + c.phase) * 2.4;
      const topY = c.shY - 32;
      ink(ctx, c, 3.2, 0.9);
      ctx.moveTo(-6, c.hipY + 10);
      ctx.lineTo(-11, topY - 4);
      ctx.stroke();
      // Cloth, so cloth alpha, even up here where it covers nothing: a solid
      // pennant is a slab that happens to be above the head.
      ctx.beginPath();
      ctx.moveTo(-11, topY - 2);
      ctx.quadraticCurveTo(-22 + wave, topY + 2, -28 + wave, topY + 12);
      ctx.quadraticCurveTo(-19 + wave, topY + 10, -10, topY + 14);
      ctx.closePath();
      solid(ctx, c, 0.34, 2.4, 0.9);
    },
  },

  /**
   * The harpooner: a beard, and a coil of rope over the shoulder. The beard is
   * the only mark on the roster that grows *downward* off a head, which is why
   * it survives next to fifteen hats and helmets.
   */
  harpooner: {
    label: "The Harpooner",
    side: "good",
    prop: { shoulder: 1.1, weight: 1.08, hunch: 0.6, head: 0.94, build: 0.4 },
    stance: { settle: 2, spread: 12, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 1, c.hy + 10, -1, c.hy + 15);
      ctx.quadraticCurveTo(r + 1, c.hy + 10, r - 1, c.hy);
      ctx.quadraticCurveTo(0, c.hy + 6, -r + 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
      // A knit cap pulled down to the brow — no brim, which is what keeps it
      // out of the hat family.
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy - r + 5);
      ctx.quadraticCurveTo(0, c.hy - r - 6, r + 1, c.hy - r + 5);
      ctx.quadraticCurveTo(0, c.hy - r + 2, -r - 1, c.hy - r + 5);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      // Three turns of rope over the shoulder. Stroked, so the gate's cloth
      // rule does not reach it — and stroked is right anyway, because a coil
      // is read from the gaps between its turns.
      for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = c.ink;
        ctx.globalAlpha = c.alpha * (0.9 - i * 0.08);
        ctx.lineWidth = c.lw(2.6);
        ctx.beginPath();
        ctx.ellipse(-c.shX + 1, c.shY + 6 + i * 3, 7 - i * 0.6, 5.2, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },

  /**
   * The inquisitor: a mitre with a cleft in it. The fourth tall hat here and
   * the only one that is *notched* — the witch's bends, the plague doctor's
   * tapers, the hyde's is straight-sided, and this one has a hole in its
   * outline, which is the loudest thing a silhouette can do.
   */
  inquisitor: {
    label: "The Inquisitor",
    side: "evil",
    prop: { shoulder: 1.08, weight: 1.06, hunch: -1, head: 0.96, build: 0.4 },
    stance: { settle: -2, spread: 9, heel: 0 },
    headroom: 29,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy - r + 4);
      ctx.lineTo(-r + 2, c.hy - r - 18);
      ctx.lineTo(-1, c.hy - r - 11);
      ctx.lineTo(r - 2, c.hy - r - 18);
      ctx.lineTo(r + 1, c.hy - r + 4);
      ctx.quadraticCurveTo(0, c.hy - r + 7, -r - 1, c.hy - r + 4);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
    },
    overlay: (ctx, c) => {
      // A chain off the belt. Four links and no more — a longer one reads as a
      // leg, which is a mistake that only shows up in motion.
      const swing = Math.sin(c.t * 0.042 + c.phase) * 2.2 - c.vx * 1.6;
      for (let i = 0; i < 4; i += 1) {
        ctx.strokeStyle = c.ink;
        ctx.globalAlpha = c.alpha * 0.78;
        ctx.lineWidth = c.lw(2);
        ctx.beginPath();
        ctx.ellipse(-8 + (swing * i) / 3, c.hipY + 2 + i * 5, 2.6, 3.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },

  /**
   * The djinn: a second pair of arms. The only fighter here whose silhouette
   * is wrong at the *body* rather than at the head, and the last shape this
   * vocabulary had left that nothing else was using — every other costume on
   * the roster is a mark on a figure with two arms.
   */
  djinn: {
    label: "The Djinn",
    side: "evil",
    prop: { shoulder: 1.06, weight: 1.02, hunch: 0, head: 0.96, build: 0.3 },
    // Feet close and hips high. The lower arms carry the width, so the stance
    // must not — wide feet under four arms is a figure with no vertical line
    // in it at all.
    stance: { settle: -1, spread: 8, heel: 0 },
    headroom: 25,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * **One crescent, not two points.** Drawn as a symmetrical pair rising
       * off the temples it read, unmistakably, as rabbit ears — two of
       * anything standing up either side of a skull does. A single arc lying
       * across the crown with both tips turned up is a moon, and a moon is
       * nothing else on this roster.
       */
      ctx.beginPath();
      ctx.moveTo(-r - 5, c.hy - r - 2);
      ctx.quadraticCurveTo(-r - 2, c.hy - r - 12, 0, c.hy - r - 12);
      ctx.quadraticCurveTo(r + 2, c.hy - r - 12, r + 5, c.hy - r - 2);
      ctx.quadraticCurveTo(r - 1, c.hy - r - 7, 0, c.hy - r - 6);
      ctx.quadraticCurveTo(-r + 1, c.hy - r - 7, -r - 5, c.hy - r - 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    back: (ctx, c) => {
      /*
       * The lower arms go in `back`, so the real arms and the blade draw over
       * them — an extra limb in front of the sword hand reads as the fighter
       * having dropped something. They are held lighter than the body for the
       * same reason a cape is: what is behind must not compete with what is
       * doing the fighting.
       */
      /*
       * **They hang, and they are as heavy as the real ones.** Curled up and
       * ending in a small disc they read as two stubs with knobs on; an arm is
       * recognised by its length and by the elbow being somewhere between the
       * shoulder and the hand. So these go out and *down* to hip level, at the
       * body's own stroke weight, held back only by alpha.
       */
      const flex = Math.sin(c.t * 0.03 + c.phase) * 2;
      for (const s of [-1, 1]) {
        ink(ctx, c, 4, 0.68);
        ctx.moveTo(s * (c.shX - 2), c.shY + 6);
        ctx.quadraticCurveTo(s * (c.shX + 11), c.shY + 17, s * (c.shX + 15), c.hipY - 3 + flex);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(s * (c.shX + 15), c.hipY + 2 + flex, 3.4, 4.2, s * 0.3, 0, Math.PI * 2);
        ctx.closePath();
        solid(ctx, c, 0.6, 2.2, 0.68);
      }
    },
  },
};

/**
 * Which fighters each duel draws from. Every pool is one side against the
 * other, so a match is always good against evil and the blade colours always
 * disagree — that half is load-bearing and unchanged.
 *
 * **Both pools are now the whole roster (2026-08-27, client).** They used to be
 * a themed four each — the order's fight and the war in heaven — and the cost
 * of that was measured rather than argued: with two good and two evil per pool,
 * **four of the eight costumes were unreachable for any given visitor**, only
 * four of the twenty-eight pairs could ever occur, and **72.7% of match resets
 * brought back at least one fighter from the previous match** (23.9% returned
 * the identical pair). The ornament id *is* the pool key and the ornament is
 * published site config, so which half of the roster a visitor could see was
 * fixed for everyone. The client's report was "only a couple characters get
 * chosen ever, always starts with the same characters", and he was right.
 *
 * Merged: all eight are reachable, sixteen pairs instead of four, per-fighter
 * appearance evens out at ~25% instead of ~52%, and back-to-back identical
 * pairings fall from 24% to 7%.
 *
 * **And derived, since 2026-08-28.** The pools were four hand-written ids each,
 * which is exactly how four costumes came to be unreachable without anyone
 * noticing: a list and a roster that have to agree are two places to forget.
 * `ROSTER_GOOD` and `ROSTER_EVIL` filter `FIGHTERS` on the `side` field the
 * blade-colour carve-out is already checked against, so a fighter is rollable
 * the moment it is declared and the only way to withhold one is to delete it.
 * At twenty a side that is 400 pairs per pool and 1,600 rolled orderings.
 *
 * **What this gave up, stated because it was a real reason.** The roster
 * comment above says confusable fighters were kept in different pools so they
 * never meet. That protection is gone, and it is replaced by a specific
 * exclusion list rather than by splitting the roster in half again — a blunt
 * instrument that cost four costumes to solve a problem with at most a couple
 * of pairs. Add to `NEVER_MEET` if two of them turn out to read alike.
 */
/**
 * The two sides, derived from the roster rather than typed out.
 *
 * They used to be four hand-written ids per pool, which is how four of the
 * eight costumes came to be unreachable without anybody noticing: the list and
 * the roster were two places that had to agree, and the gate that caught it
 * only exists because they stopped. Deriving from `FIGHTERS[].side` — the same
 * field the blade-colour carve-out is checked against — means a fighter is
 * rollable the moment it is declared, and the only way to withhold one is to
 * delete it.
 */
const ROSTER_GOOD = (Object.keys(FIGHTERS) as FighterStyle[]).filter(
  (s) => FIGHTERS[s].side === "good",
);
const ROSTER_EVIL = (Object.keys(FIGHTERS) as FighterStyle[]).filter(
  (s) => FIGHTERS[s].side === "evil",
);

export const DUEL_POOLS: Record<DuelPool, { good: FighterStyle[]; evil: FighterStyle[] }> = {
  duel: {
    good: ROSTER_GOOD,
    evil: ROSTER_EVIL,
  },
  duelholy: {
    good: ROSTER_GOOD,
    evil: ROSTER_EVIL,
  },
};

/**
 * Pairs that must never be drawn together because they read alike at ornament
 * size. Empty today and deliberately kept: it is the mechanism that replaces
 * the old pool split, so the next "these two look the same" report is one entry
 * rather than a re-halving of the roster.
 *
 * Order-insensitive. `npm run check` asserts every entry names real fighters.
 */
export const NEVER_MEET: ReadonlyArray<readonly [FighterStyle, FighterStyle]> = [];

function forbidden(a: FighterStyle, b: FighterStyle): boolean {
  return NEVER_MEET.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

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

  let g = good[Math.floor(rng() * good.length) % good.length];
  let e = evil[Math.floor(rng() * evil.length) % evil.length];

  // Re-roll a forbidden pairing rather than filtering the pools, so the draw
  // stays uniform over what is allowed and an empty NEVER_MEET costs nothing.
  // Bounded: a runaway list must not spin here, and falling through with the
  // last roll is better than hanging the ornament.
  for (let attempt = 0; attempt < 8 && forbidden(g, e); attempt += 1) {
    g = good[Math.floor(rng() * good.length) % good.length];
    e = evil[Math.floor(rng() * evil.length) % evil.length];
  }

  return rng() < 0.5 ? [g, e] : [e, g];
}
