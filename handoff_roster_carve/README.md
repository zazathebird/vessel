# Roster + carve handoff

Drop this folder anywhere in the repo (`docs/handoff-roster-carve/` is fine) and work
through `BRIEF.md`. Nothing in here is meant to be imported by the site as-is: the two
source files are reference implementations to fold into `src/fx/`.

| File | What it is |
|---|---|
| `BRIEF.md` | The work, in order. Read first. |
| `MEASUREMENTS.md` | Measured reach and gate results for all 24 kept costumes. Nothing here is estimated. |
| `CARVE.md` | The renderer patch: the second tone, and the body as mass instead of wire. |
| `new-costumes.ts` | The eight new roster entries, in the idiom of `fighters.ts`. |
| `reference/Roster.dc.html` | The signed-off roster sheet. Runs standalone; draws all 24 side by side, current build on the left and carved on the right, at 61 / 109 / 240px and over three palettes. |

## The short version

- **The choreography engine is untouched.** `duel.ts` imports `FIGHTERS` and
  `rollPairing` and nothing else from the roster, and both pools are derived from
  `FIGHTERS[].side`. Swapping 24 costumes for 24 costumes is invisible to the director,
  the module pool, the move table and the bands. No file outside `fighters.ts` changes
  for the roster half of this.
- **It fits.** 12 good and 12 evil, so the pools stay balanced at 144 pairs each side of
  the coin. Every kept costume stays inside the 34-unit sideways gate (worst: the
  viking's shield at 31.7). Two headrooms were under-declared on the sheet and are
  corrected in `new-costumes.ts`.
- **The carve is the only part that touches the renderer**, and it touches `drawFighter`
  and the two costume helpers — not the simulation.
