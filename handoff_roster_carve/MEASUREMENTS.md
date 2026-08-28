# Measurements — the 24 kept costumes

Every number here was measured by driving each costume's `back`, `overlay` and `head`
hooks through a recording context over 140 animation frames × three travel speeds
(`vx` = 0, ±1.4) and taking the extremes of every path point. Method matches the gate's:
the origin is the top of the torso at its centre line, so `reach` is units above it.

Nothing is estimated.

## Reach

`declared` is the sheet's `headroom`. `reach` is what the drawing actually does.
`sideways` is the furthest any point lands off the centre line — the camera frames 34.

| costume | side | declared | reach | sideways | |
|---|---|---|---|---|---|
| gladiator | good | 34 | 33.5 | 21.4 | |
| witch | evil | 31 | 30.0 | 15.4 | |
| ringmaster | evil | 30 | 29.3 | 19.8 | |
| anubis | evil | 28 | **29.2** | 22.5 | under-declared → **30** |
| prophet | good | 30 | 27.6 | 18.0 | |
| plague | evil | 28 | 27.5 | 19.8 | |
| crowned | evil | 26 | 26.0 | 22.3 | |
| luchador | good | 24 | **25.1** | 17.6 | under-declared → **26** |
| musketeer | good | 26 | 24.7 | 26.0 | |
| horned | evil | 23 | 22.7 | 27.0 | |
| cowled | evil | 23 | 22.7 | 21.5 | |
| valkyrie | good | 23 | 22.7 | 19.8 | |
| sentinel | good | 22 | 21.7 | 17.6 | |
| gunslinger | good | 24 | 19.5 | 20.7 | over-declared → 21 |
| astronaut | good | 22 | 19.1 | 22.4 | over-declared → 20 |
| caped | evil | 18 | 17.9 | 25.8 | |
| ronin | good | 18 | 17.8 | 26.4 | |
| nosferatu | evil | 17 | 16.8 | 28.7 | |
| pharaoh | evil | 22 | 16.7 | 14.9 | over-declared → 18 |
| executioner | evil | 17 | 16.1 | 12.5 | |
| viking | good | 20 | 15.8 | **31.7** | over-declared → 17; widest on the roster |
| hooded | good | 17 | 15.7 | 14.6 | |
| golem | evil | 16 | 15.6 | 25.6 | |
| maned | good | 16 | 15.2 | 16.8 | |

**Two costumes reach higher than they declare**, both new: the anubis by 1.2 units (the
ears) and the luchador by 1.1 (the crest). Both are corrected in `new-costumes.ts`.
Under-declaring is the failure that matters — `duelFocus` reserves `headroom + 16`, so
the tips get cropped rather than the camera pulling back.

**Four over-declare**, all new, and all cost camera on every frame they are on screen:
the pharaoh by 5.3, the viking by 4.2, gunslinger 4.5, astronaut 2.9. Corrected to
`ceil(reach) + 1` in `new-costumes.ts`. Nothing else on the roster is out by more than
0.5.

**Nothing exceeds the 34-unit sideways limit.** The viking's shield at 31.7 is the
closest, and it is a fixed shape on the off hand rather than something that trails, so it
does not grow with travel.

## Balance

| | |
|---|---|
| kept | 24 |
| good / evil | **12 / 12** |
| pairs per pool | 144 |
| rolled orderings | 288 |
| blade colour vs `side` disagreements | 0 |
| `NEVER_MEET` entries | 0 |

Pools stay derived from `FIGHTERS[].side`, so nothing needs editing to make the new
eight rollable. Per-fighter appearance rate is ~8.3% within a side, against ~5% at forty.

## The fill gate

Every filled mark in the eight new costumes was measured against the torso box
(`±shX` by `shY`..`hipY`) by bounding box, which over-states coverage. **None of the 30
marks trips the rule** — no fill above 0.35 alpha covers more than 45% of the torso. The
closest calls are the viking's shield (0.6 on the off hand) and the pharaoh's and anubis's
collars (0.8 and 0.78 across the shoulders); run the real rasterising gate on those three
before signing off.

## What was not measured

Frame cost of the carve. The roster sheet holds 60fps drawing 48 figures at 240px with
the carve on, which is ~24× the ornament's load, so it was not worth instrumenting — but
that is an inference, not a measurement.
