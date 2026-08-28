# The carve — renderer patch

Two edits in `src/fx/`, and one field passed down from the ornament. Reference code
below is taken from `reference/Roster.dc.html`, renamed into the repo's vocabulary.

## 0. The second tone

```ts
// fighters.ts — CostumeCtx
/**
 * The palette's background role, resolved. Every mark is laid down in this at a
 * wider line before it is drawn in ink, so a shape carries its own edge against
 * whatever is behind it. It is a role, not a literal: it cross-fades with the
 * site's bleed, and on the pale palettes the carve reads as a light gap rather
 * than as a dark rim, which is the same information either way.
 */
paper: string;
/** Half the carve's width, in world units. 0 disables the carve entirely. */
rim: number;
```

`DuelView` gains `paper: string`, `DuelOrnament` resolves it from the same place it
resolves `ink`, and `drawFighter` copies both into the `CostumeCtx` it builds
(`rim: v.rim ?? 1.7`). Keep the 0 path working — it is the rollback, and it is also the
right value for any surface that draws the duel over an image rather than over a palette.

## 1. `ink()` and `solid()`

Both helpers already own every mark on every costume, so the carve arriving here reaches
all 24 with no costume edit.

```ts
/** Lay the current path down in paper, wider, before it is drawn in ink. */
function carve(ctx: CanvasRenderingContext2D, c: CostumeCtx, width: number): void {
  if (c.rim <= 0) return;
  ctx.save();
  ctx.strokeStyle = c.paper;
  ctx.globalAlpha = 1;
  ctx.lineWidth = width + c.rim * 2;
  ctx.stroke();
  ctx.restore();
}

function ink(ctx: CanvasRenderingContext2D, c: CostumeCtx, width: number, alpha = 1): void {
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = c.alpha * alpha;
  ctx.lineWidth = c.lw(width);
  ctx.beginPath();
}
```

`ink()` cannot carve — it runs *before* the path exists. So the carve goes on the far
side, and every `ink()` site already ends in `ctx.stroke()`: give the file a
`strokeInk(ctx, c, width, alpha)` that does `carve(); ctx.stroke();` and replace the bare
`ctx.stroke()` calls in the costume hooks, **or** leave the hooks alone and accept that
stroked marks (tails, braids, antlers, chains, rope) are uncarved. The sheet does the
former; the difference is visible on the wendigo's antlers and the devil's tail and
nowhere else.

```ts
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
    // An inner shadow along the shaded edge, clipped to the mass, so a helmet
    // has a top and an underside. Offset up-and-left because the arena's light
    // is above and behind the fighters.
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
```

## 2. The body as mass

Replaces the `limb()` / spine / shoulder-bar / `prop.build` block in `drawFighter`. The
capsule primitive and the two-capsules-per-limb shape are the point: the elbow and the
knee become joints you can see.

```ts
const massPath = (x0, y0, x1, y1, w0, w1) => {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const px = Math.cos(a + Math.PI / 2);
  const py = Math.sin(a + Math.PI / 2);
  ctx.moveTo(x0 + px * w0, y0 + py * w0);
  ctx.lineTo(x1 + px * w1, y1 + py * w1);
  ctx.arc(x1, y1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x0 - px * w0, y0 - py * w0);
  ctx.arc(x0, y0, w0, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.closePath();
};

// Same body as `solid`, without a CostumeCtx: the body is not a costume.
const fillMass = (build: () => void, alpha: number, edge: number) => { /* carve, fill,
  clipped inner shadow, ink edge — identical to solid() above */ };

// Two capsules, tapering root to tip, and the blade light on both bones.
const limb = (x0, y0, x1, y1, l1, l2, bend, w0, w1, w2, alpha) => {
  const j = joint(x0, y0, x1, y1, l1, l2, bend);
  fillMass(() => massPath(x0, y0, j.x, j.y, w0, w1), alpha, 0.7);
  fillMass(() => massPath(j.x, j.y, x1, y1, w1, w2), alpha, 0.7);
  lightBone(x0, y0, j.x, j.y, w1 * 2);
  lightBone(j.x, j.y, x1, y1, w2 * 2);
  return j;
};
```

Draw order, which is what makes the figure read as having a near and a far side:

1. `kind.back` (cloth, as today)
2. back leg + its foot
3. torso mass
4. shoulder capsule, then the neck capsule
5. head disc (unless `hollow`)
6. front leg + its foot — **over** the torso
7. off arm, then sword arm
8. `kind.overlay`, then `kind.head`
9. blade, then the hilt

The torso, replacing the spine stroke and the `prop.build` edges:

```ts
const bw = HIP_X * 1.15 + kind.prop.build * 1.4;      // hips
const tw = shX * 0.74 + kind.prop.build * 1.2;        // chest
const waist = shX * 0.6 + kind.prop.build * 2.6;
fillMass(() => {
  ctx.moveTo(-tw, shY + 0.5);
  ctx.quadraticCurveTo(-waist, (shY + hipY) / 2, -bw, hipY + 1);
  ctx.quadraticCurveTo(0, hipY + 4.5, bw, hipY + 1);
  ctx.quadraticCurveTo(waist, (shY + hipY) / 2, tw, shY + 0.5);
  ctx.quadraticCurveTo(0, shY - 2.5, -tw, shY + 0.5);
  ctx.closePath();
}, 1, 0.8);
```

**This is not the slab that was rejected in 2026-08-14.** That was a *pale* torso quad
beside a pale robe and a pale head block, all at one value, compositing into a single
shape as wide as the figure was tall. This is the body itself at full ink, narrow at the
waist, with the cloth behind it still at a third of the alpha — so the robe reads as
being behind a person rather than as part of one pale mass. The rule that made the
difference is unchanged and still gated: cloth over the body never wins against the body.

Widths that worked on the sheet, all through `lw()`: back thigh 5.0 → knee 3.9 → ankle
2.9 at alpha 0.9; front leg 5.6 → 4.4 → 3.1 at 1; off arm 4.2 → 3.1 → 2.3 at 0.92; sword
arm 4.6 → 3.4 → 2.5 at 1; shoulder bar 3.4; neck 3.0 → 2.6. Feet are one short capsule,
2.9 → 2.1, pointing the way the leg is facing.

## 3. What the carve costs

Three strokes and a clip per mark instead of one stroke, on ~10–20 marks per fighter per
frame. The sheet holds 60fps drawing 48 figures at 240px; the ornament draws two. If it
ever matters, `rim: 0` above the palette's own threshold is the knob, not a redraw.
