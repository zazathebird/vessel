import type { OrnamentId } from "./ornaments";

/**
 * Where the hero ornament holds, and whether it stays there.
 *
 * Client, 2026-08-18: *"visitors always need to see something as the ornament.
 * it can change location on the page however, right side, left, middle, moving,
 * bouncing, disappearing and reappearing. submarine sonar ping style, etc etc"*.
 *
 * **The organising idea is theirs — the slot is a scope, so this is station
 * keeping, not decoration.** That distinction is the whole reason this exists
 * in the shape it does. "Make it bounce" is the direction that produced the
 * four circle ornaments the client had pulled three weeks earlier ("what looks
 * like HAL from 2001… need to go"); the rule that survived that is written into
 * `CLAUDE.md` deviation 7 — *a shape is allowed to be a circle if it depicts an
 * instrument*. So a contact holds a bearing, fades, and is re-acquired on the
 * next sweep. Same latitude the client asked for, and it means something.
 *
 * Three entries, and `hold` is index 0 on purpose: it *is* today's behaviour
 * exactly — centred in the slot with the 9s `v-drift` float that has always
 * been there — so every stored config, every share code in circulation and
 * every visitor who never touches this lands on it unchanged.
 *
 * **Append only.** Like `FX`, `LAYOUTS` and `ORNAMENTS`, the index is the wire
 * format: share codes carry the position in this array, so inserting or
 * deleting silently repoints every code already handed out. Withdraw with
 * `hidden`, exactly as the four circle ornaments were.
 */

export type StationId = "hold" | "opposite" | "roam";

export const STATIONS: { id: StationId; label: string; note: string; hidden?: boolean }[] = [
  {
    id: "hold",
    label: "Hold",
    note: "Centred, with the slow float it has always had.",
  },
  {
    id: "opposite",
    label: "Opposite",
    note: "Holds at the far end of the hero — right of the headline, or below it.",
  },
  {
    id: "roam",
    label: "Roam",
    note: "Fades and is re-acquired at a new bearing, on the sonar's own cadence.",
  },
];

/** The menu, not the wire — see the `FX` / `PICKABLE_FX` note in CLAUDE.md. */
export const PICKABLE_STATIONS = STATIONS.filter((s) => !s.hidden);

/**
 * What the dice may hand out. Everything pickable, deliberately — unlike
 * `ROLLABLE_FX` and `ROLLABLE_ORNAMENTS`, nothing here is an *absence*.
 * `hold` is a real position, not "off", so a rolled `hold` is a legible hero
 * rather than a blank slot, and there is nothing to exclude.
 */
export const ROLLABLE_STATIONS = PICKABLE_STATIONS;

export const DEFAULT_STATION: StationId = "hold";

/**
 * The ornaments `roam` must not be paired with, enforced as a real guardrail
 * (`src/data/guardrails.ts`) rather than by hoping nobody picks it.
 *
 * A duel is the one ornament with a *subject*: two figures fighting a match
 * that resolves, which `docs/DUEL.md` costs three sessions of measurement to
 * make readable. Fading it to 12% every few seconds and moving it across the
 * hero does not decorate that, it interrupts it — you lose the exchange you
 * were watching, twice a revolution. Every other ornament is an ambient
 * instrument and loses nothing by being re-acquired.
 */
export const ROAM_EXCLUDES: OrnamentId[] = ["duel", "duelholy"];
