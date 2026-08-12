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

export type OrnamentId = "lens" | "valve" | "aperture" | "orrery" | "none";

export const ORNAMENTS: { id: OrnamentId; label: string }[] = [
  { id: "lens", label: "Lens" },
  { id: "valve", label: "Valve" },
  { id: "aperture", label: "Aperture" },
  { id: "orrery", label: "Orrery" },
  { id: "none", label: "None" },
];

/** Lens is the default: it holds still and lets only the light move. */
export const DEFAULT_ORNAMENT: OrnamentId = "lens";
