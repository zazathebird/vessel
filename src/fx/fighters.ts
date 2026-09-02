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
  | "horned"
  | "maned"
  | "crowned"
  | "cowled"
  | "ronin"
  | "gladiator"
  | "plague"
  | "golem"
  | "nosferatu"
  | "musketeer"
  | "valkyrie"
  | "executioner"
  | "witch"
  | "sentinel"
  | "prophet"
  | "luchador"
  | "astronaut"
  | "gunslinger"
  | "viking"
  | "pharaoh"
  | "anubis"
  | "ringmaster";

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
 *
 * ## The evil side is one red, and it was two until 2026-08-31
 *
 * Six evil fighters carried `#ff3b30` and the other six `#ff2929`: 18 points
 * of green and 7 of blue apart, and nothing else. **ΔE2000 1.80 as authored,
 * and 1.4–1.8 as it actually composites** — the blade is three passes (an
 * additive glow at 0.22 over 11 units, a mid stroke at 0.5 over 4, and a
 * 1.6-unit core in `v.core`, which is a *palette* colour and covers the middle
 * of the stroke outright), so what carries the hue is a 4-unit band at half
 * alpha with a white line down it, on a figure 95–110px tall, swinging. A
 * ΔE2000 of 1 is the threshold for two flat patches held side by side under
 * good light. Neither of those conditions is ever true here.
 *
 * **Why a second red existed is not written down anywhere in this file or in
 * `docs/DUEL.md`, and the only thing it can have been is variety** — the same
 * instinct that gives the good side two colours. The instinct is right and the
 * execution was not, because *a colour that splits a side into two groups is a
 * claim that the two groups differ*, and here they do not: the twelve are one
 * side, one pool, one coin, and no field on the roster correlates with which
 * red a fighter held. A claim nobody can see is not a subtle claim, it is a
 * second constant to keep in step for nothing — and the next fighter added
 * would have had to be assigned one of them by a rule that does not exist.
 *
 * **The good side's blue/green stays, and it is not the same case.** It is not
 * *information* either — the split there is undocumented too, and no viewer is
 * ever asked to read a grouping out of it, because `DUEL_POOLS` puts one
 * alignment against the other so two good fighters never share a frame. What
 * it is is **variety across matches**, which needs only to be *seen*: measured
 * the same way, blue against green is **ΔE2000 41–42 composited**, 24–29× the
 * two reds and about the same distance as blue is from red. Green is also an
 * *ink* on this roster and not only a blade — the prophet's halo is drawn in
 * `c.blade` (see the comment there), which is what keeps it from being a new
 * literal — so collapsing the good side would take a costume with it.
 *
 * **`#ff3b30` is the survivor, and which one is not arbitrary.**
 * `scripts/duel-shot.mjs` hard-codes it as `bladeB` in two places, so keeping
 * it means every still that harness renders shows the red the roster actually
 * carries; keeping `#ff2929` would have left the only tool anybody reviews
 * this effect in drawing a colour no fighter has.
 *
 * The gate needed no edit: `scripts/check.ts` holds a `GOOD` set of the two
 * good colours and asserts an evil fighter's blade is *not* in it, so it tests
 * the boundary rather than the membership — which is the right shape for it,
 * and is why collapsing a side passes on the assertion it should.
 */
export const BLADE_COLORS: Record<FighterStyle, string> = {
  hooded: "#3d9bff",
  maned: "#3d9bff",
  caped: "#ff3b30",
  cowled: "#ff3b30",
  horned: "#ff3b30",
  crowned: "#ff3b30",
  ronin: "#3d9bff",
  gladiator: "#37d67a",
  plague: "#ff3b30",
  golem: "#ff3b30",
  nosferatu: "#ff3b30",
  musketeer: "#3d9bff",
  valkyrie: "#37d67a",
  executioner: "#ff3b30",
  witch: "#ff3b30",
  sentinel: "#37d67a",
  prophet: "#37d67a",
  luchador: "#3d9bff",
  astronaut: "#3d9bff",
  gunslinger: "#37d67a",
  viking: "#3d9bff",
  pharaoh: "#ff3b30",
  anubis: "#ff3b30",
  ringmaster: "#ff3b30",
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
  /**
   * Centre of the head disc, already leaned and hunched.
   *
   * **It is a trap in the `head` slot, and in that slot only.** `drawFighter`
   * calls the head hook inside `ctx.translate(neckX, 0)` precisely so a costume
   * can write `0` for the centre line of the skull — and `hx` *is* `neckX`. A
   * head hook that used this "as documented" would apply the lean and the hunch
   * a second time, which on the hollow (`hunch: 4.6`) puts the mark most of a
   * head-width forward of the head it is drawn on, in the one slot that carries
   * most of the recognition. The `back` and `overlay` hooks are **not**
   * translated, so it is the honest number in both of those, which is why it is
   * documented rather than deleted.
   *
   * No costume reads it today: every `head` hook here is written about `0`, and
   * that is the convention to keep.
   */
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
  /** Forward travel this frame: positive is the way the fighter faces.
   *  Clamped, and the number anything that trails should hang off — the lean
   *  is already in the body underneath. (`lean` and `speed` used to sit here,
   *  read by no costume; deleted 2026-09-02.) */
  vx: number;
  /** True while the fighter is off the ground. */
  airborne: boolean;
  /** World clock in frames, and this fighter's desync phase. */
  t: number;
  phase: number;
  /** Palette ink, this fighter's blade colour, and the scene's dim. */
  ink: string;
  blade: string;
  dim: number;
  /**
   * The palette's **background** role, resolved — the second tone the carve is
   * drawn in.
   *
   * Every mark is laid down in this at a wider line before it is drawn in ink,
   * so a shape carries its own edge against whatever is already behind it: a
   * helmet stops where the skull starts, and the near leg crosses in front of
   * the far one. It is a *role*, not a literal, which is what makes it legal
   * here — it cross-fades with the 0.9s palette bleed like every other colour,
   * and on the pale palettes the carve reads as a light gap rather than as a
   * dark rim, which is the same information either way.
   */
  paper: string;
  /**
   * Half the carve's width, in world units — so it scales with the figure like
   * every other costume dimension.
   *
   * **0 disables the carve entirely, and that path must keep working.** It is
   * the rollback, and it is also the right value for any surface that draws the
   * duel over an image rather than over a palette, where there is no background
   * role to be confident about. It is deliberately one number for the scene and
   * **not a per-costume field**: a costume that could opt out of the carve is a
   * costume that can silently go back to being a wire.
   */
  rim: number;
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
     * Torso mass, 0–1: **how wide the body itself is** at the chest, the waist
     * and the hips.
     *
     * This used to be two stroked edges drawn beside a spine, and the doc here
     * used to insist on it — *stroked, and only two lines*, because the version
     * the client rejected in 2026-08-14 filled the torso and a filled torso
     * next to a filled robe was the slab that read as a shield. Since the carve
     * (2026-08-28) the torso *is* a filled mass, and this number sizes it.
     *
     * **That is not a reversal of the 2026-08-14 rejection, and the difference
     * is worth stating**, because the two look identical in a diff. What was
     * rejected was a *pale* quad at cloth alpha, beside a pale robe and a pale
     * head block, all at one value, compositing into a single shape as wide as
     * the figure was tall. This is the body at full ink, narrow at the waist,
     * carved out of the cloth behind it — and the rule that separates them is
     * unchanged and still gated: cloth over the body never wins against the
     * body.
     *
     * Still reserved for the fighters whose whole character is that they are
     * built heavily. A light fighter sets 0 and tapers to a narrow waist, and
     * that contrast is what makes the heavy ones look heavy.
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

/**
 * Lay the current path down in `paper`, wider, before it is drawn in ink.
 *
 * This is the whole of the carve. It runs on a path that is already built, so
 * it can only ever be called on the *far* side of a hook's geometry — which is
 * why `ink()` below cannot do it and `strokeInk()` exists.
 *
 * `globalAlpha` is deliberately 1 rather than the body's alpha. The carve's job
 * is to *replace* what is behind the mark, not to tint it: at the body's own
 * alpha the shape underneath still reads through and two overlapping marks
 * still composite into a third shape neither of them is, which is the failure
 * the carve was added to fix.
 */
function carve(ctx: CanvasRenderingContext2D, c: CostumeCtx, width: number): void {
  if (c.rim <= 0) return;
  ctx.save();
  ctx.strokeStyle = c.paper;
  ctx.globalAlpha = 1;
  ctx.lineWidth = width + c.rim * 2;
  ctx.stroke();
  ctx.restore();
}

/** Set up a hook's stroke. Every costume opens with one of these. */
function ink(ctx: CanvasRenderingContext2D, c: CostumeCtx, width: number, alpha = 1): void {
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = c.alpha * alpha;
  ctx.lineWidth = c.lw(width);
  ctx.beginPath();
}

/**
 * Close an `ink()` path — carved, then stroked.
 *
 * Every stroked mark in the roster used to end in a bare `ctx.stroke()`, which
 * the carve cannot reach: `ink()` runs *before* the path exists, so there is no
 * path to lay down in paper at that point. Stroked marks are the minority here
 * — brims, sashes, ears, a nose bar, a whip — but they are exactly the thin
 * ones, and a thin uncarved line over a now-solid body is the one place the old
 * wire look survives. So the stroked marks get the same treatment the filled
 * ones do, and no hook ends in a bare `stroke()` any more.
 */
function strokeInk(
  ctx: CanvasRenderingContext2D,
  c: CostumeCtx,
  width: number,
  alpha = 1,
): void {
  carve(ctx, c, c.lw(width));
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = c.alpha * alpha;
  ctx.lineWidth = c.lw(width);
  ctx.stroke();
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
 * **Every mass carries its own edge, and the edge is the palette's background
 * role** (2026-08-28, the carve). This used to say the opposite — that fill and
 * edge were the same ink *on purpose*, because the reference engine could rim
 * its marks against an arena background it owned and this canvas is transparent
 * over the site, so there was no second colour available that was not a
 * literal. The premise was wrong: `bg` is a palette role like `fg` is, it
 * cross-fades with the 0.9s bleed, and it is by construction the colour the
 * figure is standing on. Rimming in it costs no literal and no asset.
 *
 * What same-ink actually bought was merging, and merging is right for a helmet
 * sitting on a skull and wrong for everything else. Without a second tone a
 * beak vanished under its own brim, two wings became one flap and a bird made a
 * two-headed figure — three costumes lost to it, each `fix` a matter of moving
 * a shape until the collision stopped. The carve removes the collision instead:
 * a mark laid over another now *stops* where the one behind it starts.
 *
 * On a pale palette the carve reads as a light gap rather than as a dark rim.
 * That is the same information, and it is why this is a role and not a colour.
 *
 * The gate that used to refuse every fill still bounds them: see `Costume`.
 */
function solid(
  ctx: CanvasRenderingContext2D,
  c: CostumeCtx,
  fill: number,
  edge = 2.4,
  edgeAlpha = 1,
): void {
  carve(ctx, c, c.lw(edge));
  ctx.fillStyle = c.ink;
  ctx.globalAlpha = c.alpha * fill;
  ctx.fill();
  if (c.rim > 0) {
    /*
     * An inner shadow along one edge, clipped to the mass, so a helmet has a
     * top and an underside rather than being a flat cut-out.
     *
     * **It is not a scene light, and this comment used to say it was.** The
     * offset is `translate(-1.5, 2.2)`: canvas y grows downward, so that is
     * back-and-*down*, not the "up-and-left, because the arena's light is above
     * and behind" the old text described. And it is applied inside the
     * `scale(facing, 1)` the whole figure is drawn in, so the two fighters in a
     * duel — who face each other by construction — are shaded from opposite
     * world directions. No single light anywhere in the arena produces that.
     *
     * What it actually is, is a **body-relative** convention: every mark on
     * every costume is shaded along its own lower-back inside edge, so the
     * shading reads as *form* (this shape has a near face and a far one) rather
     * than as *illumination* (the sun is over there). That is a weaker claim
     * than a light and it is the one the drawing can keep.
     *
     * **The offset is deliberately left alone.** At `0.34 * fill`, clipped to a
     * mark that is a few pixels across at the ornament's ~61px figure, it
     * registers as thickness and never as a direction — and re-deriving it from
     * `lightBone`'s world light would put it on the *front* edge for whichever
     * fighter faces left, where the mark's own ink outline already sits, buying
     * an invisible correction at the cost of half the roster's interior edge.
     *
     * **Clipped, which is what keeps it from being the 2026-08-14 slab.** It is
     * a second value *inside* one mark, not a second value across the body: it
     * cannot escape the shape it is shading, so it can never composite with the
     * mark next to it into one pale mass. Nothing else on the body gets a
     * second interior tone, deliberately.
     */
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = c.paper;
    ctx.globalAlpha = 0.34 * fill;
    ctx.lineWidth = Math.max(2.2, c.lw(edge) * 1.9);
    ctx.translate(-1.5, 2.2);
    ctx.stroke();
    ctx.restore();
  }
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
 * in `NEVER_MEET`, which carries **three pairs** since 2026-08-30; the old
 * answer was to keep them in separate pools, and that cost four of eight
 * costumes to solve a problem with, as it turned out, exactly three pairs.
 *
 * ## Twenty-four, twelve a side (2026-08-28)
 *
 * The client asked for twenty a side and for named characters. The names are
 * refused for the reason at the top of this file — and, separately, because
 * this engine cannot draw the thing those characters are recognised *by*: a
 * face. What it can draw is an outline plus one signature shape, which is what
 * folklore and the trades were designed as, so that is what these are.
 *
 * **The roster reached forty and came back to twenty-four the same day**, and
 * the cut is not a retreat from the count — it is the finding that the count
 * was the wrong lever. Sixteen of the forty were either a second copy of a
 * stronger silhouette (three brimmed hats, four blocks for a head, two capes
 * to the floor) or a costume whose whole read was interior detail — a sash, a
 * bead loop, a bandage, a bird. Interior detail is the first thing to go at
 * 61px, which is where this renders, so those costumes were not *weak*: they
 * were invisible, and forty of them was twenty-four fighters plus sixteen ways
 * to draw a stick. Twelve a side is 144 pairs per pool and 288 rolled
 * orderings, and lifts a given fighter's appearance rate from ~5% to ~8.3%.
 *
 * **What actually fixed the flatness was the renderer, one level down** — see
 * `carve()` and `solid()`. The body is a mass and every mark carries its own
 * edge, and that reached all sixteen surviving costumes with no edit to any of
 * them, which is the tell that the costumes were never the problem.
 *
 * **Three rules came out of building the forty, and each one cost a costume
 * before it was written down. All three survive their own exhibits** — the
 * falconer, the reaper and the monk were among the sixteen cut, so the lessons
 * are now older than anything you can look at.
 *
 * **The seraph went with them, and it is named here because it is the one cut
 * costume the comments below kept reasoning from.** It was a fan of feathers
 * behind the shoulders, and what it taught the roster was that a fan is read by
 * the *gaps* in it and not by the count of its parts — three heavy strokes with
 * air between them say "feathers" where seven touching ones say "cloak". Three
 * comments (the gladiator's arm bands, the musketeer's plume, the valkyrie's
 * wings) cited it by name into 2026-08-30, sending anybody who wanted to look
 * at it round a roster it has not been in since 2026-08-28. They now carry the
 * finding instead of the fighter. The three rules:
 *
 * 1. **Two shapes on one head need a gap between them, or they merge into a
 *    third shape neither of them is.** The plague doctor's beak left the brow
 *    and vanished under its own brim; the falconer's bird faced forward and
 *    made a two-headed figure; the valkyrie's wings overlapped into one flap.
 *    All three were fixed by moving a shape, never by making it bigger. **The
 *    carve weakens this rule without retiring it**: a mark now stops where the
 *    mark behind it starts, so the collision is cheaper to survive — but two
 *    shapes that merge are still one shape, and an edge does not separate what
 *    was drawn in the same place.
 * 2. **A proportion has to be pushed past what looks right in the code.** The
 *    gladiator's crest at eight units was a bump on a helmet, and the reaper's
 *    skull with two units of cheek pinch was an egg. At ~61px, two units is
 *    one pixel.
 * 3. **Interior detail is not a costume.** The monk had a sash and a bead loop
 *    and read, on the contact sheet, as an undressed rig — the fix was a
 *    rolled fold that changes the *outline* at the shoulder. This is the same
 *    finding as the 2026-08-19 one about wire diagrams, arriving at a costume
 *    that was obeying the fill rule perfectly, and it is the finding the whole
 *    cut and the whole carve came out of.
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
       * here on purpose. Interior detail is noise at desk size and invisible at
       * phone size, and everything that distinguishes these twenty-four is the
       * edge of the shape. **The reason has changed and the rule has not**: it
       * used to be that one ink over a transparent canvas had no second colour
       * to draw a face in shadow *with*. Since the carve there is one — `paper`
       * — and it is still not used for a face, because a face is not what
       * survives 61px. It is used for the edge, which is.
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
      strokeInk(ctx, c, 2.6, 0.85);
      ink(ctx, c, 2.2, 0.7);
      ctx.moveTo(-3, c.hipY - 6);
      ctx.quadraticCurveTo(-6 + sway * 0.5, c.hipY + 7, -5 + sway, c.hipY + 18);
      strokeInk(ctx, c, 2.2, 0.7);
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
      strokeInk(ctx, c, 2.2, 0.85);
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
       *
       * **"Out" is drawn as "back", and until 2026-08-30 both horns went the
       * same way.** This is a profile view: sideways is into the screen and
       * cannot be drawn at all, so the sweep is rendered as travel along −x.
       * With roots at −3 and +3 sweeping to −18 and −12, the two masses shared
       * ten units of x and most of their height — one shape with a seam in it,
       * which is the merge rule this file records three costumes lost to. They
       * are pulled apart along the skyline instead: **the tips are the read**,
       * and there are now two of them, 21 units apart at two different heights,
       * with four units of clear skull between the near horn's root at −4 and
       * the far horn's tip at 0 — more than the 3.4 two `DEFAULT_RIM` carves
       * take up, so the gap survives the rims rather than being flooded by them.
       * The far horn rises off the brow and is foreshortened; the near one
       * sweeps the full width of the crown behind it.
       *
       * **Far first, near second**, which is the other half of the fix. The
       * carve lays each mark down in `paper` before its ink, so whichever horn
       * is drawn last gouges the one drawn before it — and it must be the near,
       * bright one doing the gouging or the depth is inverted and the dim horn
       * composites on top of the bright one. Same order as the valkyrie's
       * wings; the anubis's ears had the same inversion and were fixed with it.
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
      // and no more — and it is worth *only* alpha, so the far horn keeps 16
      // of the near one's 20 units of rise rather than being shrunk into a nub.
      horn(7, 1, 16, 4.2, 0.75);
      horn(-4, -20, 20, 5, 1);
    },
    back: (ctx, c) => {
      const lash = Math.sin(c.t * 0.055 + c.phase) * 3 - c.vx * 1.4;
      const tipX = -22 + lash;
      const tipY = c.hipY - 9 + lash * 0.4;
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(-2, c.hipY + 3);
      ctx.quadraticCurveTo(-17, c.hipY + 7, tipX, tipY);
      strokeInk(ctx, c, 2.4, 0.9);
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
      strokeInk(ctx, c, 3.2);
      // The mouth of the hood, faint: it closes the shape without putting a
      // face in it, and at 60px it is the difference between an empty cowl and
      // a missing head.
      ink(ctx, c, 2.2, 0.45);
      ctx.moveTo(-9, c.hy + 12);
      ctx.quadraticCurveTo(0, c.hy + 5, 8, c.hy + 11);
      strokeInk(ctx, c, 2.2, 0.45);
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
      // **One sleeve, and one cuff.** The off arm gets the sleeve — a wide
      // mass drooping past the hand, which is the mark. The sword arm gets a
      // single stroked arc off the elbow and nothing over the hand at all,
      // deliberately: a sleeve over the hand doing the work would hide the one
      // silhouette the fight is actually about. The comment here read "both
      // sleeves" until 2026-08-30 and sent a reader looking for a second mass
      // that has never been drawn.
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
      strokeInk(ctx, c, 2.4, 0.6);
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
      strokeInk(ctx, c, 2.6, 0.9);
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
      // separate masses rather than as one sleeve, because **the gaps are what
      // read as banding** — the finding the seraph's fan of feathers left the
      // roster before it was cut (see the note above `FIGHTERS`): at this size
      // a repeated mark is read by the air between its parts, so three with
      // clear skin between them say "banded" where five touching ones say
      // "sleeve".
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
        strokeInk(ctx, c, 2, 0.85);
      }
    },
  },

  /**
   * The musketeer: a broad brim and a plume that streams off the back of it.
   * The plume is the mark, and it has to be, because **a brim identifies
   * nobody here**: five of the twenty-four wear one — the plague doctor, the
   * witch, the gunslinger, the ringmaster and this. (This comment claimed until
   * 2026-08-30 that "these two are the only hats on the roster", which was true
   * of neither the count nor the pairing it was reasoning about.) So each of the
   * five is told apart by what stands *on* the brim and nothing else: a beak, a
   * bent cone, a dented crown, a stovepipe, and here a plume that leaves the
   * silhouette backwards where every other one of them goes up.
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
      // right on paper, for the reason the gladiator's arm bands are three and
      // not five: **the gaps are what read as a plume**, so a stroke removed
      // buys more than a stroke added. Seven fine ones drew a smudge.
      for (let i = 0; i < 3; i += 1) {
        ink(ctx, c, 2.6 - i * 0.4, 0.9 - i * 0.12);
        ctx.moveTo(-r + 1, c.hy - r - 4);
        ctx.quadraticCurveTo(-14 - i * 2, c.hy - r - 10 - i * 2, -20 - i * 3, c.hy - r - 2 + i * 4);
        strokeInk(ctx, c, 2.6 - i * 0.4, 0.9 - i * 0.12);
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
   * The valkyrie: wings at the temples rather than at the back. That placement
   * is the decision — at ornament size **where a shape sits separates two
   * fighters more reliably than what the shape is**, so a span behind the
   * shoulders and a span on the skull are two different silhouettes built out
   * of one idea, and this roster only has room for the second. (The first was
   * the seraph's, cut on 2026-08-28; this comment cited it by name until
   * 2026-08-30, when there was nothing left to compare against.)
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
       * flap and the fighter reads as wearing a cap with an ear. **This costume
       * is the exhibit for that rule and it was still failing it**: at
       * `dx = -6.84` and `dx = 2.16` the two spans were x ∈ [−19.84, −2.84] and
       * [−10.84, 6.16] — eight units of overlap, both roots inside the other's
       * mass, over the same twelve units of height. The comment above them said
       * they were "pulled well apart", which is the shape of thing this file
       * exists to stop being true only in prose.
       *
       * Pulled apart for real, and the lever is **span, not just position**.
       * Two 17-unit wings cannot clear each other on a 16-unit skull however
       * they are placed, so the far one is *foreshortened* — which is what a
       * far wing does anyway — and the pair now reads back-to-front rather than
       * side-by-side: the near wing is long, low-rooted and sweeps the whole
       * width of the crown behind the head (x ∈ [−23.84, −4.19]); the far one
       * is short, rooted on the brow and clears the cap forward of it (x ∈
       * [0.54, 12.33]). **4.73 units of gap between them**, against the 3.4 two
       * `DEFAULT_RIM` carves occupy — so the gap is still a gap after the rims
       * are drawn, which is the number that actually matters and the one the
       * old pair had none of.
       *
       * **Far first, near second.** The carve lays every mark down in `paper`
       * before its ink, so the last one drawn cuts the one under it: drawn the
       * other way round the dim wing gouges the bright one and the depth
       * inverts. This costume already had it right and the devil's horns and
       * the anubis's ears did not, which is why they now match it.
       */
      const wing = (dx: number, span: number, alpha: number, lift: number) => {
        ctx.beginPath();
        ctx.moveTo(dx, c.hy - 2);
        ctx.quadraticCurveTo(dx - span * 0.53, c.hy - 9 - lift, dx - span, c.hy - 18 - lift);
        ctx.quadraticCurveTo(dx - span * 0.07, c.hy - 13 - lift, dx + span * 0.31, c.hy - 4);
        ctx.closePath();
        solid(ctx, c, 0.82 * alpha, 2.2, alpha);
      };
      // Rooted a unit or so outside the cap's two edges, one each way, which is
      // the readable form of "on opposite sides of the same helmet".
      wing(r + 1.7, 9, 0.45, -4);
      wing(-r - 1, 15, 1, 2);
    },
    back: (ctx, c) => {
      // One braid to the hip, swinging behind. Stroked and single: two braids
      // is hair, and hair belongs to the apprentice.
      const swing = Math.sin(c.t * 0.036 + c.phase) * 2 - c.vx * 2.2;
      ink(ctx, c, 3.4, 0.9);
      ctx.moveTo(-c.hr + 1, c.hy + 4);
      ctx.quadraticCurveTo(-11 + swing, c.shY + 12, -8 + swing, c.hipY + 2);
      strokeInk(ctx, c, 3.4, 0.9);
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
      /*
       * A belt wide enough to read at the waist, and bare arms above it.
       *
       * **It does not quite clear the torso box, which this said it did.** The
       * belt spans `hipY − 3 … hipY + 4`, and `hipY` is 46 standing (the stance
       * settles 4) but 42 airborne and dead, where the settle is suppressed —
       * so it sits at y 43…50 on its feet and y 39…46 in the air, against a box
       * that ends at 40. Measured across the whole sweep it covers **3.2% of
       * the torso at 80% of body alpha**, which is a mark by any reading of the
       * rule and nowhere near the 45% where cloth alpha starts. The conclusion
       * survives; the premise did not, and a premise that is checkable is worth
       * more here than a conclusion that is right by luck.
       */
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
      // Hair, hanging out from under the brim — **two strands, both on the
      // back**, which is what the loop draws and not the "two a side" this used
      // to claim. Hair on the front would fall over the face and the face is
      // the one place this costume has nothing to say; hair behind reads at the
      // jawline against the cone's lean and costs no width. Two and no more,
      // either way: more than that is a mane, and a mane belongs to the
      // apprentice.
      for (let i = 0; i < 2; i += 1) {
        ink(ctx, c, 2, 0.8);
        ctx.moveTo(-r - 1 + i * 2, c.hy - r + 3);
        ctx.quadraticCurveTo(-r - 4 - i, c.hy + 4, -r - 2 - i * 2, c.hy + 12);
        strokeInk(ctx, c, 2, 0.8);
      }
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


  /* ---- the eight added by the 2026-08-28 carve --------------------------
   *
   * Geometry verbatim from the roster sheet the client signed off
   * (`handoff_roster_carve/reference/Roster.dc.html`), with the `- c.vx * n`
   * trail terms added: the sheet is static, so nothing in it trailed with
   * travel. `headroom` is the measured reach rounded up, not the sheet's
   * declaration — two of these under-declared it and four over-declared it,
   * and under-declaring is the one that crops.
   */
  /**
   * Hair, beard and robe in one mass, with a ring of light clear above it.
   * The one costume whose signature is drawn in the blade colour rather than in
   * ink, because it is light and not cloth — so on the good side it is green,
   * which is a blade literal and not a new one. Reads against the Devil at any
   * size, which is what it was drawn for.
   */
  prophet: {
    label: "The Prophet",
    side: "good",
    prop: { shoulder: 1.04, weight: 1.08, hunch: -0.6, head: 1, build: 0.3 },
    stance: { settle: -2, spread: 7, heel: 0 },
    headroom: 29,
    head: (ctx, c) => {
      const r = c.hr;
      // hair off the back of the skull first, so the beard overlaps it
      ctx.beginPath();
      ctx.moveTo(-r + 3, c.hy - r + 1);
      ctx.quadraticCurveTo(-r - 8, c.hy + 4, -r - 5, c.hy + 17);
      ctx.quadraticCurveTo(-r + 1, c.hy + 7, -r + 4, c.hy - 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.2);
      // beard: closes the head into one mass and runs to the chest
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 3, c.hy + 15, -2, c.hy + 25);
      ctx.quadraticCurveTo(5, c.hy + 20, r - 1, c.hy + 1);
      ctx.quadraticCurveTo(0, c.hy + 9, -r + 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
      /*
       * The halo, and the two **deliberately uncarved** strokes in the file.
       *
       * Everything else on every costume is laid down in `paper` first so it
       * stops where the shape behind it starts. This is light, not cloth: it is
       * drawn in the blade colour, it is supposed to sit *over* the skull it
       * belongs to, and a background-coloured rim around a glow is a hole
       * punched in the thing that is meant to be glowing. Two rings, the second
       * wider and fainter, which is what turns a hoop into a source.
       */
      const bob = Math.sin(c.t * 0.04 + c.phase) * 1.5;
      ctx.strokeStyle = c.blade;
      ctx.globalAlpha = 0.95 * c.dim;
      ctx.lineWidth = c.lw(2.4);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 15 + bob, 13.5, 4.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.28 * c.dim;
      ctx.lineWidth = c.lw(1.6);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 17.5 + bob, 18, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.028 + c.phase) * 1.3 - c.vx * 1.4;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 3, c.hipY - 9);
      ctx.quadraticCurveTo(-15, c.hipY + 14, -14 + sway, c.feetY - 1);
      ctx.quadraticCurveTo(sway, c.feetY + 4, 13 + sway * 0.6, c.feetY - 2);
      ctx.quadraticCurveTo(14, c.hipY + 14, c.hipX + 3, c.hipY - 9);
      ctx.closePath();
      solid(ctx, c, 0.34, 2.8, 0.85);
    },
    overlay: (ctx, c) => {
      ink(ctx, c, 2.6, 0.8);
      ctx.moveTo(-c.shX + 1, c.shY + 4);
      ctx.quadraticCurveTo(0, c.shY + 11, c.shX - 1, c.shY + 4);
      strokeInk(ctx, c, 2.6, 0.8);
    },
  },

  /**
   * A laced mask with a blunt crest, on the widest shoulders in the good
   * half. The crest is the mark; the shoulders are what make it legible from
   * across the arena before the mark resolves.
   */
  luchador: {
    label: "The Luchador",
    side: "good",
    prop: { shoulder: 1.26, weight: 1.24, hunch: 0, head: 1.06, build: 0.95 },
    stance: { settle: 3, spread: 13, heel: 0 },
    headroom: 26,
    head: (ctx, c) => {
      const r = c.hr + 1;
      ctx.beginPath();
      ctx.moveTo(-r, c.hy + 5);
      ctx.quadraticCurveTo(-r - 1, c.hy - r - 2, 0, c.hy - r - 2);
      ctx.quadraticCurveTo(r + 1, c.hy - r - 2, r, c.hy + 5);
      ctx.quadraticCurveTo(0, c.hy + 11, -r, c.hy + 5);
      ctx.closePath();
      solid(ctx, c, 0.94, 2.6);
      // a blunt crest fore-and-aft, half a head clear of the dome
      ctx.beginPath();
      ctx.moveTo(-r + 4, c.hy - r);
      ctx.quadraticCurveTo(-3, c.hy - r - 13, 6, c.hy - r - 9);
      ctx.quadraticCurveTo(r + 2, c.hy - r - 5, r - 4, c.hy - r + 1);
      ctx.quadraticCurveTo(0, c.hy - r - 5, -r + 4, c.hy - r);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.2);
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-9.5, c.hipY - 3);
      ctx.lineTo(9.5, c.hipY - 3);
      ctx.lineTo(10, c.hipY + 3);
      ctx.lineTo(-10, c.hipY + 3);
      ctx.closePath();
      solid(ctx, c, 0.5, 2.4, 0.9);
    },
    back: (ctx, c) => {
      const trail = Math.sin(c.t * 0.035 + c.phase) * 1.6 - c.vx * 1.8;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY - 3);
      ctx.quadraticCurveTo(-16 + trail, c.shY + 14, -13 + trail, c.hipY + 8);
      ctx.quadraticCurveTo(-2, c.hipY + 12, 8 + trail * 0.5, c.hipY + 3);
      ctx.quadraticCurveTo(-2, c.shY + 8, -c.shX - 1, c.shY - 3);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },

  /**
   * A dome with a visor chord, a collar ring, and a pack behind the
   * shoulder. Three shapes on one head would normally merge — the dome, the
   * visor and the collar clear each other because the visor is inset and the
   * collar sits below the skull, not on it.
   */
  astronaut: {
    label: "The Astronaut",
    side: "good",
    prop: { shoulder: 1.22, weight: 1.3, hunch: 0, head: 1.3, build: 0.85 },
    stance: { settle: 4, spread: 11, heel: 0 },
    headroom: 20,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(1, c.hy - 1, r + 2, r + 2.5, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // visor band: a wide chord across the front of the dome
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - 3);
      ctx.quadraticCurveTo(1, c.hy - 9, r + 2, c.hy - 4);
      ctx.quadraticCurveTo(r + 1, c.hy + 4, 1, c.hy + 5);
      ctx.quadraticCurveTo(-r + 1, c.hy + 3, -r + 1, c.hy - 3);
      ctx.closePath();
      solid(ctx, c, 0.4, 2.4, 0.95);
      // collar ring
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + r + 1);
      ctx.lineTo(r + 1, c.hy + r + 1);
      ctx.lineTo(r + 1.5, c.hy + r + 5);
      ctx.lineTo(-r + 0.5, c.hy + r + 5);
      ctx.closePath();
      solid(ctx, c, 0.6, 2.4, 0.95);
      ink(ctx, c, 2, 0.85);
      ctx.moveTo(-r + 1, c.hy - r + 1);
      ctx.lineTo(-r - 3, c.hy - r - 6);
      strokeInk(ctx, c, 2, 0.85);
    },
    back: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 2, c.shY - 4);
      ctx.lineTo(-c.shX + 8, c.shY - 5);
      ctx.lineTo(-c.shX + 7, c.hipY - 1);
      ctx.lineTo(-c.shX - 4, c.hipY + 1);
      ctx.closePath();
      solid(ctx, c, 0.66, 2.8, 0.95);
      ink(ctx, c, 2.2, 0.8);
      ctx.moveTo(-c.shX - 1, c.shY + 6);
      ctx.quadraticCurveTo(-c.shX - 9, c.shY + 14, -c.shX - 2, c.hipY + 2);
      strokeInk(ctx, c, 2.2, 0.8);
    },
  },

  /**
   * A dented crown under a wide brim, over a duster split to the knee. The brim
   * is the widest thing above the shoulders on the good side, at 33.7 units
   * against the musketeer's 32.
   *
   * **The duster is not "the only split hem", which is what this used to say.**
   * The ringmaster's tails are the same shape — the same nine nodes in the same
   * order, within seven units of these, with the hem seven units higher — so
   * the split says *nothing* about which of the two is on screen and the top of
   * the costume has to carry the whole read on its own. It is the reason the
   * pair is in `NEVER_MEET`, and the reason the claim was worth correcting
   * rather than deleting: it was the specific sentence that stopped anybody
   * looking.
   */
  gunslinger: {
    label: "The Gunslinger",
    side: "good",
    prop: { shoulder: 1.06, weight: 1, hunch: 0.6, head: 0.98, build: 0.2 },
    stance: { settle: 2, spread: 13, heel: 0 },
    headroom: 21,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 2, r + 9, 3.2, -0.08, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.4);
      // crown with a dent in the top
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy - r + 1);
      ctx.lineTo(-r + 3, c.hy - r - 9);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r - 3, c.hy - r - 9);
      ctx.lineTo(r - 2, c.hy - r + 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // kerchief knot under the jaw
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy + 4);
      ctx.quadraticCurveTo(0, c.hy + 13, r - 1, c.hy + 4);
      ctx.quadraticCurveTo(0, c.hy + 8, -r + 2, c.hy + 4);
      ctx.closePath();
      solid(ctx, c, 0.5, 2.2, 0.9);
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.034 + c.phase) * 1.7 - c.vx * 2.2;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 3);
      ctx.quadraticCurveTo(-16 + sway, c.hipY + 8, -19 + sway, c.feetY - 13);
      ctx.lineTo(-6 + sway, c.feetY - 11);
      ctx.lineTo(-2 + sway, c.hipY + 6);
      ctx.lineTo(4, c.hipY + 6);
      ctx.lineTo(8 + sway * 0.5, c.feetY - 11);
      ctx.lineTo(19 + sway * 0.5, c.feetY - 14);
      ctx.quadraticCurveTo(15, c.hipY + 8, c.shX + 1, c.shY + 3);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },

  /**
   * A headdress that flares past the shoulders, and a straight bar off
   * the chin. The flare is the read: nothing else on the roster widens *below*
   * the skull.
   */
  pharaoh: {
    label: "The Pharaoh",
    side: "evil",
    prop: { shoulder: 1.08, weight: 1.08, hunch: 0, head: 1, build: 0.4 },
    stance: { settle: -1, spread: 9, heel: 0 },
    headroom: 18,
    head: (ctx, c) => {
      const r = c.hr;
      // nemes: narrow at the crown, flaring out past the shoulders
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r - 2);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r - 1, c.hy - r - 2);
      ctx.lineTo(r + 4, c.hy + 10);
      ctx.lineTo(r - 1, c.hy + 11);
      ctx.lineTo(r - 3, c.hy + 1);
      ctx.lineTo(-r + 3, c.hy + 1);
      ctx.lineTo(-r + 1, c.hy + 11);
      ctx.lineTo(-r - 4, c.hy + 10);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
      // false beard: a straight bar off the chin
      ctx.beginPath();
      ctx.moveTo(-3, c.hy + 5);
      ctx.lineTo(4, c.hy + 5);
      ctx.lineTo(3, c.hy + 20);
      ctx.lineTo(-2, c.hy + 20);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
      /*
       * The uraeus, rearing off the *crown* of the nemes and not out of the
       * middle of it (moved 2026-08-31, and moved rather than deleted, which
       * is the whole of the difference between this mark and the two that went
       * the same day).
       *
       * It used to start at `hy - r - 1` — **2.5 units inside the nemes fill**,
       * whose crown apex is at `hy - r - 3.5` once the quadratic is flattened,
       * not at the `hy - r - 5` the control point reads as. Measured through a
       * recording context: 8 of its 25 centreline points sat inside the mass,
       * and there `strokeInk`'s carve laid 5.8 units of `paper` at full alpha
       * across the one edge this costume is *for* — the docstring above says
       * the flare is the read, and the flare was being notched at its apex to
       * make room for a line that, being ink on ink, contributed nothing. The
       * other 17 points were already clear and already reading; the mark was
       * two-thirds right and rooted in the one place it could do damage.
       *
       * So it is translated, not enlarged — the rule this file loses costumes
       * to. Same length (11.2 units against 11.3), same 2.4-unit stroke, same
       * forward hook; the root moves to `(1, hy - r - 4)`, **0.53 units clear**
       * of the crown edge under it, and the arc peaks **3.4 units** clear at
       * `x = 6.5`. Both numbers are chosen against `DEFAULT_RIM`: 3.4 is twice
       * it and is this file's standing figure for a gap that survives being
       * drawn, and 0.53 is inside it *deliberately*, so the carve at the root
       * still bites the headband and the cobra reads as socketed into it
       * rather than as the detached accessory the reference engine warns about.
       * Nothing of it is inside the mass now, so nothing of it is a groove.
       *
       * **`headroom` is unchanged at 18 and that is a constraint, not a
       * coincidence.** The gate measures reach from raw path points, control
       * points included, so a quadratic declares most of the way to its control
       * point and not to the curve. Taken at the same instant — the top of the
       * breath cycle, where `hy` is −2.66 — the control at `hy - r - 7` sits
       * 17.66 units up and rounds to the declared 18, while the arc itself
       * peaks at 16.29. Lifting the hook any further would have moved the
       * camera's clearance for every match this fighter is in, for an arc
       * nobody would have seen get taller.
       */
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(1, c.hy - r - 4);
      ctx.quadraticCurveTo(7, c.hy - r - 7, 11, c.hy - r - 4.5);
      strokeInk(ctx, c, 2.4, 0.9);
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 3, c.shY + 3);
      ctx.quadraticCurveTo(0, c.shY + 12, c.shX + 3, c.shY + 3);
      ctx.quadraticCurveTo(0, c.shY + 6, -c.shX - 3, c.shY + 3);
      ctx.closePath();
      solid(ctx, c, 0.8, 2.4, 0.9);
    },
  },

  /**
   * A flared helm, a wedge of beard, and a shield on the off arm. The shield is
   * the signature and the only thing that separates this silhouette from the
   * executioner's, which is why `NEVER_MEET` pairs them rather than one of them
   * being cut.
   *
   * **It said "a flared helm with a nasal bar" until 2026-08-31**, which is the
   * third false claim this docstring has carried and is worth the line: the
   * nasal was deleted that day and a summary naming a mark that is not drawn is
   * how the next reader decides the costume already has one. See the head hook.
   *
   * **The two claims that used to be here were both false** (found 2026-08-30,
   * corrected the same day). It said "the widest costume on the roster at 31.7
   * units": the widest are The Mask and The Devil at 32, and this one measured
   * **36.9**. And it said the shield "does not grow with travel and stays
   * inside the 34 the camera frames": it does not trail, which is true and is
   * beside the point, because it was pinned to the off hand and `drawFighter`
   * *moves that hand* — to (−22, 12) for a kick, to (−8, 28) for a throw, and
   * anywhere on the guard arc, whose x runs [−16.93, 26.89] over one turn. The
   * shield rode it out to x = −36.0 and +36.9, past the frame, on a costume
   * whose own helm and beard reach 13. See the overlay for what it does now.
   */
  viking: {
    label: "The Viking",
    side: "good",
    prop: { shoulder: 1.3, weight: 1.3, hunch: 0.4, head: 1.02, build: 0.9 },
    stance: { settle: 4, spread: 14, heel: 0 },
    headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      // beard first: a wide wedge to the chest
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 4, c.hy + 13, -1, c.hy + 21);
      ctx.quadraticCurveTo(r + 3, c.hy + 12, r + 1, c.hy + 1);
      ctx.quadraticCurveTo(0, c.hy + 8, -r - 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // helm: a rounded cap with a flared rim
      ctx.beginPath();
      ctx.moveTo(-r - 3, c.hy + 1);
      ctx.quadraticCurveTo(-r - 3, c.hy - r - 5, 0, c.hy - r - 5);
      ctx.quadraticCurveTo(r + 3, c.hy - r - 5, r + 3, c.hy + 1);
      ctx.lineTo(r + 5, c.hy + 3);
      ctx.lineTo(-r - 5, c.hy + 3);
      ctx.closePath();
      solid(ctx, c, 0.94, 2.8);
      /*
       * **The nasal bar is gone (2026-08-31), and it could not be moved.** It
       * ran from `hy + 2` to `hy + 8` at `x = 1`, which put its top unit inside
       * the helm (filled 0.94) and its bottom three and a half inside the beard
       * (0.9) — measured through a recording context, its own outline at
       * half-width sat **3.53 units deep inside the union of the two** at the
       * tightest point, so it changed no silhouette anywhere in the idle cycle.
       * Six units of stroke, of which none was ever an edge.
       *
       * What was left of it was `strokeInk`'s carve, `2.2 + 2 × 1.7 = 5.6`
       * units of `paper` at full alpha, and the two things it touched were
       * **0.0 units away in both directions**: the helm's rim above and the
       * beard's brow below. That is the anubis's finding arriving from the
       * other side — the standing number in this file is that a gap under
       * `2 × DEFAULT_RIM` is not a gap once it is drawn, and a gap of zero is
       * an overlap. The bar's carve merged with both neighbours' carves into
       * one connected dark shape, so at the sheet it read as a *tab welding the
       * helm to the beard*, and at the phone slot's 0.87px per unit its own ink
       * was 1.9px of a colour 13% off the mass either side of it.
       *
       * It is deleted rather than relocated because there is nowhere for it to
       * go. A nasal is legible only as a break in the **helm's own outline**,
       * and this helm ends in a flat flared rim at `hy + 3` with the beard's
       * brow at `hy + 4.5` under it: 1.5 units of open face, less than half the
       * 3.4 the carve needs. Moving the mark within that band moves it from one
       * mass to the other. Making it a spur of the rim is not a move, it is a
       * different helm — and the helm is what `NEVER_MEET` pairs this fighter
       * with the executioner over. The signature is the shield, and the shield
       * is untouched.
       */
    },
    overlay: (ctx, c) => {
      /*
       * The round shield, **strapped to the arm rather than pinned to the fist**
       * (2026-08-30). Three things were wrong with the pinned version and the
       * first two are rule breaches, not taste:
       *
       * 1. **It was a slab.** A 24 × 25 mass at 0.6 of body alpha covered
       *    **60.2%** of the torso box at the `force` hand and **48.7%** at
       *    `thrown` — the rule is that anything over 45% is cloth over the body
       *    and gets at most 35% of the body's alpha, and this was a shield in
       *    the literal sense the 2026-08-14 rejection was about. The check
       *    suite drives one off-hand position (14, 14), which is a guard, so it
       *    never saw either.
       * 2. **It left the frame**, out to ±36.9 against the 34 `duelFocus`
       *    reserves — see the note above.
       * 3. A shield held at arm's length also reads as a *dish*. It is worn on
       *    the forearm, so drawing it there is both the fix and the truth.
       *
       * **The frame is a clamp on the centre, not a damping of it.** The first
       * attempt pulled the centre 70% of the way from the off shoulder to the
       * hand, which bounds the excursion beautifully and destroys the costume:
       * `drawFighter` draws the `head` hook *after* `overlay`, so the beard —
       * which reaches x = 11.16 — is painted over the shield, and a shield
       * dragged back onto the chest is a faint ring behind a beard. Rendered at
       * 640px it read as a halo. What makes the disc a shield is that it
       * **projects past the beard**, so the position at the hand is the whole
       * mark and the only thing that may be touched is where that position is
       * allowed to *stop*.
       *
       * So the centre is the hand, clamped to ±20. At `rx` 12 that is **32
       * units at the very worst**, two inside the frame, against 36.9 before —
       * and it is 32 for *every* hand position that will ever exist rather than
       * for the ones anybody has enumerated, which is the property the old
       * geometry lacked and the reason this is a clamp rather than a wider
       * envelope. It bites only at the extremes: 3 units of slide at the
       * `kicking` hand, ~4 at the far end of the guard arc, none at all in
       * guard, at `force` or at `thrown`. A strap on a forearm reaching its
       * stop is a thing that happens; a shield leaving the picture is not.
       *
       * The **fill drops 0.6 → 0.34**, one point under the 0.35 cloth ceiling,
       * and that is the half that closes the rule for good: worst measured
       * cover is still **60.2%** of the torso box at the `force` hand, so this
       * passes on the alpha clause and not on the cover one, and no hand
       * position anybody adds later can turn it back into the slab. The boss
       * stays solid — it covers **6.5%**, which is a mark by any reading.
       *
       * What carries the read at that alpha is the **edge**: a 3.2-wide carved
       * outline at full ink, the heaviest on the roster, with the solid boss at
       * its centre. A heavy ring with a solid middle, the beard showing through
       * it, is a shield. A disc filled at 0.6 was a dish.
       */
      const cx = Math.max(-20, Math.min(20, c.offHand.x - 2));
      const cy = c.offHand.y + 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 12, 12.5, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.34, 3.2, 1);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 3.4, 3.6, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2, 0.9);
    },
  },

  /**
   * Two ears standing straight up, and a muzzle that clears the shoulder. The
   * ears are the tallest thing on this costume by some way, which is what its
   * headroom of 30 is paying for — **joint third on the roster, not "the second
   * largest"** as this said until 2026-08-30: the gladiator's crest declares 34
   * and the witch's cone 31, and the ringmaster's stovepipe is 30 as well.
   */
  anubis: {
    label: "The Anubis",
    side: "evil",
    prop: { shoulder: 1.1, weight: 1.06, hunch: 0, head: 0.94, build: 0.5 },
    stance: { settle: 1, spread: 11, heel: 0 },
    headroom: 30,
    head: (ctx, c) => {
      const r = c.hr;
      /*
       * Two tall tapered ears, standing straight up and **actually apart**
       * (2026-08-30). This head carries three marks and until now they were
       * spaced at about a pixel: 1.04 units between the two ears at the base and
       * 1.5 from each ear to the muzzle, on a head that is 0.87 px per unit at
       * the phone slot — so the gaps were sub-pixel *and* narrower than
       * `DEFAULT_RIM` is at 1.7, which meant the two `paper` carves either side
       * of each gap overlapped and filled it in with background. Three marks
       * became one forked mass, and the carve, which exists to separate
       * touching shapes, was what closed them.
       *
       * So the standing number for this file is **twice `DEFAULT_RIM`, 3.4
       * units** — below that a gap is not a gap once it is drawn. The ears are
       * moved outboard to sit either side of the skull rather than on top of
       * it: 7.04 units between them at the base. The muzzle drops two units and
       * starts a unit forward, putting 4.52 between it and the near ear's lower
       * corner. **Nothing was enlarged**, which is the rule this file records
       * three lost costumes for: a gap is fixed by moving a shape.
       *
       * **Far ear first, near ear second**, so the near one's carve cuts the far
       * one and not the other way about — the same inversion the devil's horns
       * had, and the order the valkyrie's wings have always used.
       */
      for (const s of [1, -1]) {
        const a = s < 0 ? 1 : 0.78;
        ctx.beginPath();
        ctx.moveTo(s * (r - 1), c.hy - r + 3);
        ctx.quadraticCurveTo(s * (r + 4), c.hy - r - 12, s * (r + 1), c.hy - r - 19);
        ctx.quadraticCurveTo(s * (r - 3), c.hy - r - 8, s * (r - 4), c.hy - r + 2);
        ctx.closePath();
        solid(ctx, c, 0.88 * a, 2.4, a);
      }
      // muzzle: a long wedge forward, clear of the shoulders and now clear of
      // the near ear as well — its top edge is at `hy - 1` rather than `hy - 3`.
      ctx.beginPath();
      ctx.moveTo(1, c.hy - 1);
      ctx.quadraticCurveTo(r + 10, c.hy, r + 15, c.hy + 8);
      ctx.quadraticCurveTo(r + 4, c.hy + 11, 1, c.hy + 9);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 4, c.shY + 2);
      ctx.quadraticCurveTo(0, c.shY + 13, c.shX + 4, c.shY + 2);
      ctx.quadraticCurveTo(0, c.shY + 5, -c.shX - 4, c.shY + 2);
      ctx.closePath();
      solid(ctx, c, 0.78, 2.4, 0.9);
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.032 + c.phase) * 1.5 - c.vx * 2;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 2, c.hipY - 6);
      ctx.quadraticCurveTo(-12, c.hipY + 10, -11 + sway, c.feetY - 18);
      ctx.quadraticCurveTo(0, c.feetY - 13, 10 + sway * 0.6, c.feetY - 19);
      ctx.quadraticCurveTo(11, c.hipY + 9, c.hipX + 2, c.hipY - 6);
      ctx.closePath();
      solid(ctx, c, 0.28, 2.6, 0.88);
    },
  },

  /**
   * A stovepipe taller than it is wide, over tails cut to two points.
   *
   * **There are five brims on this roster, not two** — the plague doctor's, the
   * musketeer's, the witch's, the gunslinger's and this one. The claim that
   * "three were cut for reading alike" and these were what survived stood here
   * until 2026-08-30 and was doing real work, because it is the reason nobody
   * went looking at the pair this one is genuinely confusable with. The
   * separator it names is right and is the only one there is: **crown height**,
   * 19 units here against the gunslinger's 10. That is the whole difference at
   * 61px, and the rest of the costume repeats him — see `NEVER_MEET`, where the
   * two are now kept out of the same fight.
   */
  ringmaster: {
    label: "The Ringmaster",
    side: "evil",
    prop: { shoulder: 1.14, weight: 1.04, hunch: 0, head: 0.96, build: 0.35 },
    stance: { settle: -2, spread: 11, heel: 4 },
    headroom: 30,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 1, r + 6, 3, -0.06, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.4);
      // tall stovepipe crown, taller than it is wide
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r);
      ctx.lineTo(-r, c.hy - r - 19);
      ctx.lineTo(r - 1, c.hy - r - 19);
      ctx.lineTo(r - 2, c.hy - r);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.8);
      /*
       * **There was a moustache here until 2026-08-31, and what it drew was a
       * hole.** Its stated job — *"so the head shape is not a bare oval under
       * the hat"* — is rule 3 stated backwards: interior detail is not a
       * costume, and this engine cannot draw a face at all. What it cost is
       * worth writing down, because the same arithmetic condemns any ink mark
       * laid on an ink mass and there are twenty-four costumes to make it in.
       *
       * Measured by driving this hook through a recording context: a 9.87-unit
       * stroke whose centreline was **25/25 points inside the head disc**, and
       * whose own outline at half-width never got closer than **0.83 units** to
       * escaping it — so it changed no silhouette at any point of the idle
       * cycle. It was therefore ink at `0.85 × 0.85` sitting on ink at `0.85`,
       * a difference of 13% of the `fg`–`bg` range and in the *wrong direction*
       * — but that was not what showed. What showed was `strokeInk`'s carve:
       * `paper` at `globalAlpha` 1, `2.4 + 2 × 1.7 = 5.8` units wide, against a
       * head disc 15.4 units across. **A third of the face wiped to background
       * with a dimmer line down the middle**, which reads as a slot cut in the
       * skull and is what the contact sheet showed at 300px.
       *
       * The rule the carve documentation already states and this is the
       * corollary of: a mark is laid down in `paper` so it *stops where the
       * shape behind it starts*. Given nothing behind it to stop against —
       * given the same ink, at the same alpha, on the same plane — the carve is
       * the only thing left of the mark, and a carve on its own is a groove.
       * **An ink mark drawn wholly inside an ink mass draws a hole, never a
       * mark.** Check the containment before adding one; the cost is about 1%
       * of a frame either way, so a mark that reads as damage is not a cheap
       * mistake, it is a paid-for one.
       *
       * The silhouette is deliberately untouched by this: the stovepipe is the
       * whole read, its 19 units of crown against the gunslinger's 10 is the
       * only separator the pair has, and `NEVER_MEET` carries the rest.
       */
    },
    overlay: (ctx, c) => {
      // high collar standing off the neck
      for (const s of [-1, 1]) {
        ink(ctx, c, 2.4, 0.85);
        ctx.moveTo(s * 3, c.shY - 1);
        ctx.lineTo(s * 9, c.shY - 9);
        strokeInk(ctx, c, 2.4, 0.85);
      }
    },
    back: (ctx, c) => {
      const flick = Math.sin(c.t * 0.038 + c.phase) * 1.8 - c.vx * 2.2;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 2);
      ctx.quadraticCurveTo(-15 + flick, c.hipY + 6, -18 + flick, c.feetY - 20);
      ctx.lineTo(-7 + flick, c.feetY - 19);
      ctx.lineTo(-2, c.hipY + 4);
      ctx.lineTo(4, c.hipY + 4);
      ctx.lineTo(9 + flick * 0.5, c.feetY - 19);
      ctx.lineTo(18 + flick * 0.5, c.feetY - 22);
      ctx.quadraticCurveTo(15, c.hipY + 6, c.shX + 1, c.shY + 2);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },
};

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

/**
 * Which fighters each duel draws from. Every pool is one side against the
 * other, so a match is always good against evil and the blade colours always
 * disagree — that half is load-bearing and unchanged.
 *
 * **This block used to be attached to `ROSTER_GOOD`**, three declarations above
 * the thing it describes, which is how the eight-fighter arithmetic in it
 * survived two roster changes with a corrected paragraph sitting directly
 * underneath it. It is on `DUEL_POOLS` now, and the numbers are the roster's.
 *
 * **Both pools are the whole roster (2026-08-27, client).** They used to be a
 * themed four each — the order's fight and the war in heaven — and the cost of
 * that was measured rather than argued: with two good and two evil per pool,
 * **four of the eight costumes were unreachable for any given visitor**, only
 * four of the twenty-eight pairs could ever occur, and **72.7% of match resets
 * brought back at least one fighter from the previous match** (23.9% returned
 * the identical pair). The ornament id *is* the pool key and the ornament is
 * published site config, so which half of the roster a visitor could see was
 * fixed for everyone. The client's report was "only a couple characters get
 * chosen ever, always starts with the same characters", and he was right.
 *
 * Merged, and then grown to twenty-four on 2026-08-28: **every fighter is
 * reachable from every pool**, which is 144 pairs and 288 rolled orderings a
 * side rather than four, a per-fighter appearance rate of ~8.3% rather than the
 * ~52% two-of-four gave the lucky half, and back-to-back identical pairings at
 * about 0.7% rather than 24%.
 *
 * **What the merge gave up, stated because it was a real reason.** The roster
 * note above says confusable fighters were kept in different pools so they
 * never meet. That protection is gone, and it is replaced by `NEVER_MEET`
 * rather than by splitting the roster in half again — a blunt instrument that
 * cost four costumes to solve a problem which, once somebody actually measured
 * it, was three pairs.
 */
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
 * size. It is the mechanism that replaced the old pool split, so a "these two
 * look the same" finding costs one entry rather than a re-halving of the
 * roster — and on 2026-08-30 it was finally used, with the client approving
 * these three and no others.
 *
 * **Three, and each one is a measurement rather than an impression.** None of
 * them is a reason to cut a costume: every pair here is fine on its own and
 * only fails side by side, which is exactly the case this list exists for.
 *
 * 1. **The Gunslinger and The Ringmaster.** Brim, boxy crown, long coat, in
 *    that order, on both. Their `back` hooks are the same path node for node —
 *    same move, same two curves, same five line segments, same closing curve —
 *    differing by between 1 and 7 units per node, and the ringmaster's hem sits
 *    7 units higher. The one real separator is crown height, 19 units against
 *    10, which is about eight pixels at the phone slot's ~95px figure and is
 *    gone the moment either one turns. Verified by rendering the pair at the
 *    real 281px phone slot rather than at sheet size, which is the whole point:
 *    on the contact sheet at 300px they are plainly two hats.
 * 2. **The Sentinel and The Executioner.** The only two heavies on opposite
 *    sides carrying no cloth at all — neither declares a `back` hook — and both
 *    put a single solid rectangle where the head goes: 22 × 30 units against
 *    25 × 28, on shoulders of 1.24 and 1.32 and weights of 1.26 and 1.36. The
 *    Golem is the third block head and is *not* here, because it is separated
 *    by proportion the way the sentinel's own note claims: 25 × 22, squat, on
 *    1.42 shoulders. These two are not separated by anything of the kind.
 * 3. **The Executioner and The Viking.** The closest cross-side pair on the
 *    roster by proportion signature — shoulder, weight, hunch, head, build and
 *    the stance triple — at 0.140 on the audit's normalisation and first by a
 *    wide margin on any: min-max scaled over the roster it is 0.071, against
 *    0.090 for the next pair. What separates them is the viking's shield, one
 *    shape, which is why that shield is worth the trouble the overlay above
 *    goes to rather than being shrunk out of the way.
 *
 * Order-insensitive. `npm run check` asserts every entry names real fighters,
 * that a pair is not a fighter against itself, that the two are on opposite
 * sides (a same-side pair could never be rolled and would be protection that
 * does nothing), that `rollPairing` never emits one, and that the coverage
 * count subtracts exactly these — the gate reads this list rather than a
 * constant, so adding a fourth entry needs no edit there.
 */
export const NEVER_MEET: ReadonlyArray<readonly [FighterStyle, FighterStyle]> = [
  ["gunslinger", "ringmaster"],
  ["sentinel", "executioner"],
  ["executioner", "viking"],
];

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
/**
 * Which fighters a roll may draw from, per side — already intersected with the
 * pool and guaranteed non-empty by `allowFor` in `src/data/duelSettings.ts`.
 */
export interface RosterAllow {
  good: FighterStyle[];
  evil: FighterStyle[];
}

export function rollPairing(
  pool: DuelPool,
  rng: () => number = Math.random,
  allow: RosterAllow | null = null,
): [FighterStyle, FighterStyle] {
  /*
   * The operator's restriction, if there is one. **Defaulting to null rather
   * than to the full lists is the point**: an absent restriction has to mean
   * "the whole side as it stands today", not "the side as it stood when
   * somebody last looked at it". Two lists that must agree with the roster is
   * exactly how four of the original eight became unreachable.
   *
   * It is not re-checked for emptiness here. `allowFor` owns that, because the
   * fallback it applies — an excluded-everything list means the whole side — is
   * a product decision about what an operator meant, and this function's job is
   * to roll uniformly over whatever it is handed.
   */
  const good = allow ? allow.good : DUEL_POOLS[pool].good;
  const evil = allow ? allow.evil : DUEL_POOLS[pool].evil;

  let g = good[Math.floor(rng() * good.length) % good.length];
  let e = evil[Math.floor(rng() * evil.length) % evil.length];

  /*
   * Re-roll a forbidden pairing rather than filtering the pools, so the draw
   * stays uniform over what is allowed and an empty `NEVER_MEET` costs nothing.
   * Bounded: a runaway list must not spin here, and falling through with the
   * last roll is better than hanging the ornament.
   *
   * **Re-rolling rather than filtering is also what makes it impossible to
   * empty a side**, which is the failure mode a "just remove him from the pool"
   * fix has: with three entries out of 144 pairings, the exclusion touches a
   * pair and never a fighter, so every one of the twenty-four stays rollable
   * and `allowFor`'s guarantee that neither side is empty is untouched. The
   * fall-through is not a hole either, only a bound: a specific forbidden pair
   * would have to be drawn nine times running to survive, which is 144⁻⁹.
   */
  for (let attempt = 0; attempt < 8 && forbidden(g, e); attempt += 1) {
    g = good[Math.floor(rng() * good.length) % good.length];
    e = evil[Math.floor(rng() * evil.length) % evil.length];
  }

  return rng() < 0.5 ? [g, e] : [e, g];
}
