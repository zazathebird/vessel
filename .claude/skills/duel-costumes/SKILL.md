---
name: duel-costumes
description: Author or fix a fighter's costume in handoff_duel_engine/duel-cycle-v2.html — the silhouette, mass and signature shape that make a character recognisable at 200px mid-motion. Use when adding a fighter, when two fighters look alike, when a costume mark is invisible, or when a stance needs to read as that character standing still. Also the procedure for SEEING any of it, which is not obvious here.
---

# Authoring a duel costume

Every fighter in `handoff_duel_engine/duel-cycle-v2.html` is one stroked stick figure plus a
costume. The costume is the whole of the character design, and it has to work at **200–320px, in
motion, on a reader who is looking at the page and not at the fight.** That rules out faces and
fine detail. What survives is **silhouette, mass, and one signature shape.**

## Before anything else: you cannot see this by taking a screenshot

The tab reports `document.hidden`, so `requestAnimationFrame` parks *and the page never
composites*. A screenshot returns a stale frame — verified by drawing a solid red rectangle
straight onto the canvas and watching it not appear. `ResizeObserver` does not fire either, for
the same reason.

Three consequences, and skipping any of them means reviewing an image from before your change:

1. **Step the engine explicitly.** `window.__DUEL.step(ms, n)` and `.seek(seconds)` run
   `tick` + `render` directly. `?a=vader&b=luke&arena=space` pins a matchup;
   `?sheet=1` draws the contact sheet.
2. **Pull the pixels out of the canvas**, do not screenshot. Serve the file from a server that
   accepts the PNG back:

   ```js
   await fetch('/shot?name=x', { method:'POST', body: canvas.toDataURL('image/png') });
   ```

   then `Read` the saved file. A ~40-line Python `SimpleHTTPRequestHandler` with a `do_POST` that
   base64-decodes into a directory is all this needs.
3. **Call `__DUEL.resize()` yourself** after changing the panel size. Nothing else will.

## The contact sheet is the tool, and one duel at a time is not

`?sheet=1` draws **every fighter side by side in their own signature guard at real size**. The
only question that matters about a costume — *can you tell them apart at a glance, in a row,
without reading the labels* — cannot be answered by looking at one duel, because you are never
comparing. Every costume problem found so far was found on the sheet:

- Vader was a black blob (costume marks had no edge pass)
- Anakin and Obi-Wan were the same beige (every mark used the one body colour)
- Dooku's hair covered his whole head, so he read as wearing a white helmet
- three guards were T-poses and two put the blade through the fighter's own legs

Look at the sheet **first**, change one thing, look again.

## The five rules

### 1. One unit rule: costume-facing sizes are RIG UNITS, never pixels

Every primitive multiplies by `D.S` itself. Mixing in a pixel value scales twice and the mark
silently doubles on a retina display. `px(u)` is the escape hatch for the two costumes that reach
for `ctx` directly.

### 2. Cloth hangs BEHIND the limbs, in the `back` slot, translucent

A filled quad between the arms is what turns two swordsmen into two slabs holding shields. It is
the single failure this vocabulary exists to prevent, and the reason the torso itself stays a
stroke. `drape()` is the only way body-covering cloth enters a costume. An open robe — two panels
with the front left clear — reads as cloth; one shoulder-to-knee quad reads as a bin bag.

### 3. Every mark carries its own rim, or the dark fighters disappear

The skeleton always had an edge pass; the costumes did not, so every mark on Vader, Batman, Neo
and Sauron was invisible against a dark arena. Each primitive now strokes the path in `D.edge`
before filling, so the fill covers the inner half and what survives is a clean outline.

`D.rimW` scales with the body: **2.6 on a dark fighter, 1.1 on a pale one** — on a pale fighter a
dark rim only muddies overlapping shapes. Pass `bare: true` for a mark that is already a
contrasting colour (a white eye, a black visor) where a rim would fight it.

### 4. Head-region marks use `D.mark`, not `D.col`

The second tone is what makes two Jedi in matching robes tell apart. It is derived by pushing the
body colour away from its own luminance, so every character gets separation with no work; set
`mark:"#..."` on the fighter where the real answer is a specific colour (blond, black hair, a
white beard).

### 5. Six primitives and no others

That constraint is what makes 29 characters read as one set rather than a grab bag. No costume
reaches for `ctx` except where a primitive genuinely cannot express the shape.

| | |
|---|---|
| `mass(p, rx, ry, rot, fill, a, bare)` | an ellipse of body — hair, egg bodies, hoods, beards |
| `plate(pts, fill, a, bare)` | a filled polygon — helmet flanges, lapels, pads, beard wedges |
| `rod(a, b, w, color, alpha, bare)` | a stroked segment — antennae, tails, moustaches, staffs |
| `spray(o, base, n, spread, len, w, color, jit)` | tapering spikes from a point — **the workhorse**: hair, horns, crowns, ears |
| `drape(t1, t2, b1, b2, fill, a, belly)` | hanging cloth, `back` slot only |
| `ring(p, r, w, color, a)` | a shallow ellipse outline — haloes, glasses, emblems |

Helpers: `off(p, ang, len)` offsets from a joint in rig units respecting facing;
`baseHead(j, r)` draws the default head so you can add marks to it rather than replace it.

**`spray`'s wobble is derived from the index, never `Math.random`** — random per frame makes the
hair boil.

## The four slots

All called `(j, dir, S)`, with `D` holding the draw context.

```js
COSTUMES.name = {
  back(j)    { /* before the legs — capes, coats, robes, extra limbs */ },
  head(j)    { /* replaces the plain circle. CARRIES MOST OF THE READ */ },
  torso(j)   { /* after the spine stroke — collars, belts, shoulder pads */ },
  overlay(j) { /* last — the one signature accessory */ }
};
```

Angle convention throughout: **0 = up, 90 = forward, 180 = down, 270 = back**, mirrored by `dir`.

## Stance is half of recognition

A duelist is recognisable standing still, and every fighter used to stand in the same guard. Set
`guard:'guardSoresu'` (and the rest) on the fighter; `poseFor` substitutes it at playback, so the
generator still only ever says `'guard'`. If a new stance is needed, add a pose and point at it —
do not special-case a fighter in the choreography.

## Checklist for a new fighter

1. `F({ name, color, mark, glow, guard, proportion, style })` in `FIGHTERS`.
2. A `COSTUMES` entry — start with `head` alone and stop there if it reads.
3. Open `?sheet=1`, capture, and check it against its **neighbours**, not on its own.
4. Confirm it survives a dark arena (`?a=<new>&b=vader&arena=space`) and a bright one
   (`arena=mustafar`).
5. If it is near-black, confirm the rim is doing the work by temporarily setting `D.rimW = 0`.

## Things already known not to work

- **Quads for a dome.** Vader's helmet built from `plate` read as a box on the shoulders. A dome
  wants `mass`.
- **A hair mass larger than the head.** Reads as a helmet, not as hair. Keep it under ~0.9 × head
  radius unless the character *is* mostly hair.
- **A thin mark on a dark body.** Two horns at 0.28 rig units vanished; 0.4 read.
- **An accessory that leaves the body.** The Devil's tail arced up and behind and read as a
  detached shape. Attach at a joint and keep the far end inside the figure's own bounds.
