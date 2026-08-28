
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

import type { OrnamentId } from "./ornaments";

/**
 * The station a config *actually renders at*, which is not always the one it
 * stores (2026-08-27).
 *
 * `guardrails.ts` refuses `roam` with either duel, and has since 2026-08-18:
 * roam fades the slot to 12% and re-acquires it at another bearing three times
 * a revolution, and a duel is the one ornament with a subject to lose.
 *
 * **That rule only ever constrained the dice.** `isAllowed` has two callers —
 * the randomiser and the check suite — so a roll is one of four ways a config
 * arrives, and the other three walked straight past it: published from the
 * operator panel, pasted as a share code (which carries ornament and station as
 * independent fields), or restored from storage. Production shipped
 * `duelholy` + `roam` for days, the client reported the fighters "grey out and
 * then come back", and `npm run check` stayed green throughout **because the
 * gate asserted the predicate rather than the page.**
 *
 * So the rule is enforced here as well, at the point all four paths converge —
 * exactly the doctrine `Ornament.tsx` already records for the one-fight-at-a-
 * time rule, which is this rule's sibling and got its half of the treatment
 * three years of sessions earlier.
 *
 * **The station yields, never the ornament.** The operator picked the duel
 * deliberately and the guardrail exists to protect it; substituting the
 * ornament would throw away the thing being defended to satisfy the rule
 * defending it. `hold` is the original behaviour and the only safe landing.
 */
export function effectiveStation(station: StationId, ornament: OrnamentId): StationId {
  const duel = ornament === "duel" || ornament === "duelholy";
  return duel && station === "roam" ? "hold" : station;
}

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
