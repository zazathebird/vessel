/**
 * The hero ornament.
 *
 * The spec ships exactly one — the valve, a set of concentric rings around a
 * glowing core, pulsing on `dilate`. The client's objection to it was specific
 * and correct: because `dilate` scales the rings as well as brightening them,
 * the whole assembly physically pumps, and it reads as a speaker cone rather
 * than as something alive.
 *
 * So the ornament became a setting, like everything else on this site. All five
 * are drawn in CSS from palette tokens only — no images, no webfonts, per the
 * spec's Assets rule — and all five sit in the same square slot, so the layouts
 * that size it (Radial's 540px, Magazine's 180px) and the ones that hide it
 * outright keep working without knowing which is on.
 */

export type OrnamentId =
  | "lens" | "valve" | "aperture" | "orrery" | "none" | "duel" | "duelholy";

export const ORNAMENTS: { id: OrnamentId; label: string }[] = [
  { id: "lens", label: "Lens" },
  { id: "valve", label: "Valve" },
  { id: "aperture", label: "Aperture" },
  { id: "orrery", label: "Orrery" },
  { id: "none", label: "None" },
  // The two lightsword duels — the client's original request for this slot
  // (docs/DUEL.md), rebuilt as discrete matches with winners. Unlike the other
  // five these are a canvas, not CSS: see src/components/DuelOrnament.tsx.
  //
  // **Appended after "None", never inserted**, even though that reads oddly in
  // the panel: shareCode.ts encodes the ornament as this array's *index*, so
  // putting anything ahead of an existing entry silently repoints every share
  // code in circulation — the same wire-format rule as FX.
  { id: "duel", label: "Lightswords: light & dark" },
  { id: "duelholy", label: "Lightswords: saint & serpent" },
];

/**
 * The ornaments the *dice* may hand out — everything but "None".
 *
 * Same rule as `ROLLABLE_FX`, and for a second reason on top of the aesthetic
 * one: five taps on this element are what reveal the footer's sign-in link, and
 * on the phone band that is the only *findable* route to an account. Rolling
 * the slot empty removes it for a reason no visitor could see. The duel
 * guardrail already settled this once — when a background duel forces the
 * ornament to yield it yields to `DEFAULT_ORNAMENT`, deliberately not to
 * `null` — so an automatic mechanism emptying the slot is a decided question,
 * and a roll is exactly such a mechanism.
 *
 * "None" stays in `ORNAMENTS`, so the panel still offers it and its share-code
 * index never moves; the operator can still choose a bare hero deliberately.
 */
export const ROLLABLE_ORNAMENTS = ORNAMENTS.filter((o) => o.id !== "none");

/** Lens is the default: it holds still and lets only the light move. */
export const DEFAULT_ORNAMENT: OrnamentId = "lens";
