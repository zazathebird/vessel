# Brief — new roster, and the carve

Two changes, in this order. The first is a data swap; the second is the reason the
roster was redrawn at all.

> ## The choreography engine is not to be touched
>
> `duel.ts` owns the fight: the director, `MODULES`, `MOVES`, the bands, `stepDuel`,
> `resolveContact`, the tuning knobs. **None of it changes for either half of this
> work**, and it is worth stating why it cannot: the only things it imports from the
> roster are `FIGHTERS` (read for `prop`, `stance`, `headroom`, `hollow` and the three
> costume hooks, all render-only) and `rollPairing`. `DUEL_POOLS` is derived from
> `FIGHTERS[].side`, so a fighter is rollable the moment it is declared.
>
> That means a 24-for-24 roster swap is invisible to the simulation, and it also means
> the swap is only safe while the invariants below hold. Check them, don't assume them.

---

## 1. The roster: 24 in, 24 out

The client's sheet is `reference/Roster.dc.html` — run it and you are looking at the
approved set. Twelve a side.

**Keep (16 already in `fighters.ts`, unchanged):**
`hooded` `maned` `caped` `horned` `crowned` `cowled` `ronin` `gladiator` `plague`
`golem` `nosferatu` `musketeer` `valkyrie` `executioner` `sentinel` `witch`

**Add (8, in `new-costumes.ts`):**
`prophet` `luchador` `astronaut` `gunslinger` `pharaoh` `viking` `anubis` `ringmaster`

**Delete (24):**
`monk` `beekeeper` `falconer` `lantern` `count` `headless` `herald` `smith` `reaper`
`werewolf` `piper` `nomad` `hyde` `boar` `standard` `harpooner` `inquisitor` `djinn`
`scarecrow` `mummy` `wendigo` `haloed` `winged` `diver`

Every one of those was either a second copy of a stronger silhouette — three brimmed
hats, four blocks for a head, two capes to the floor — or a costume whose whole read was
interior detail: a sash, a bead loop, a bandage, a bird. Interior detail is the first
thing to go at 61px, which is where this renders.

### What each deletion touches

1. `FighterStyle` — remove the 24 union members, add the 8. It is not a wire format;
   nothing stored names a fighter.
2. `BLADE_COLORS` — same 24 out, 8 in. Sides and colours already agree for the new
   entries (checked: `#3d9bff` / `#37d67a` good, `#ff2929` / `#ff3b30` evil). The
   prophet's halo is drawn in its blade colour, so it is the one entry where the
   carve-out is visible above the shoulders; `#ffd76a` on the sheet is *not* one of the
   two good-side literals — **use `#37d67a` and let the halo be green**, or take the
   exception to the client. Do not ship a good fighter holding a gold blade past
   `npm run check`.
3. `FIGHTERS` — delete the entries, paste in `new-costumes.ts`.
4. `NEVER_MEET` — still empty, and it should stay empty until somebody reports two of
   the new 24 reading alike. The nearest pair on the sheet is `executioner` (flat, soft,
   square) against `sentinel` (tall, hard, square); they are on opposite sides, so they
   can meet, and they are the pair to watch first.
5. `DUEL_POOLS` — no edit. It filters `FIGHTERS` on `side`.

### The invariants to re-check after the swap

- **12 good / 12 evil.** Both pools must stay non-empty and near-equal or the pairing
  roll skews; at 12 and 12 it is 144 pairs per pool and 288 rolled orderings.
- **Blade colour agrees with `side`** for all 24 (the existing gate).
- **`headroom` is not under-declared** — the camera crops what over-reaches. See
  MEASUREMENTS.md; the sheet had two.
- **Nothing reaches past 34 units sideways.** All 24 clear it.
- **The fill gate**: no filled mark covering more than 45% of the torso box may exceed
  35% of the body's alpha. All eight new entries pass a bounding-box approximation of
  it, which is the conservative direction, but run the real gate.

---

## 2. The carve, and the body as mass

This is the change the sheet exists to argue for, and it is a *renderer* change — the
costumes do not move. See `CARVE.md` for the code.

The roster read as flat because it was wire. Two fixes:

**The body is a mass.** Every bone becomes a tapered capsule, wide at the root and
narrow at the tip, with the torso a shape between the shoulders and the hips. A stroke
has no width that changes, so it has no direction, and a limb with no direction is a
wire.

**Every shape carries its own edge.** Each mark is laid down twice: first in the
palette's background role at a wider line, then in ink. So a helmet stops where the
skull starts, and the near leg crosses in front of the far one. The second tone is a
**palette role, not a literal** — it cross-fades with the site's bleed and holds on all
25 palettes, including the pale ones, where the carve reads as a light gap rather than a
dark rim.

Both live behind `ink()` and `solid()` plus the body block of `drawFighter`. That is
what keeps the 16 surviving costumes edit-free: they already draw through those two
helpers and nothing else.

### Order of work

1. `CostumeCtx` gains `paper: string` and `rim: number`; `DuelView` gains `paper`, and
   `DuelOrnament` passes the resolved background role down. Set `rim` to 0 to switch the
   whole carve off — keep that, it is the rollback.
2. Upgrade `ink()` and `solid()` (CARVE.md §1). At this point every existing costume is
   carved and nothing else has changed. Screenshot the contact sheet here; it is the
   cheapest place to catch a palette where the carve inverts.
3. Replace the wire body with the mass body in `drawFighter` (CARVE.md §2), keeping both
   `lightBone` calls per bone — the blade light is the one thing the mass version can
   silently drop.
4. Roster swap (§1 above).
5. Re-derive `headroom` through the recording context, run `npm run check`, and shoot a
   fresh contact sheet at `--px 61`.

### What not to do while in here

- Do not give the mass body a second interior tone beyond the clipped inner shadow in
  CARVE.md. Two values on the body plus cloth alpha is where the 2026-08-14 slab came
  from.
- Do not raise cloth alpha to compensate for the new edges. The carve already separates
  a cape from the legs; alpha is what stops it becoming a shield.
- Do not turn `rim` into a per-costume field. It is one number for the scene, in world
  units, and it scales with the figure.
