/**
 * The hero ornament.
 *
 * The spec ships exactly one — the valve, a set of concentric rings around a
 * glowing core, pulsing on `dilate`. The client's objection to it was specific
 * and correct: because `dilate` scales the rings as well as brightening them,
 * the whole assembly physically pumps, and it reads as a speaker cone rather
 * than as something alive.
 *
 * So the ornament became a setting, like everything else on this site. There
 * are eight now; all but the two duels (a canvas) are drawn in CSS from palette
 * tokens only — no images, no webfonts, per the spec's Assets rule — and every
 * one sits in the same square slot, so the layouts that size it (Radial's
 * 540px, Magazine's 180px) and the ones that hide it outright keep working
 * without knowing which is on.
 */

export type OrnamentId =
  | "lens" | "valve" | "aperture" | "orrery" | "none" | "duel" | "duelholy" | "sonar";

/**
 * `hidden` withdraws an ornament from every menu without moving anyone's share
 * code — the mechanism `FX`/`PICKABLE_FX` already established, and the reason
 * both lists are kept even when they are equal. A hidden ornament is *unlisted,
 * not invalid*: a stored config or a share code naming one still resolves to it.
 *
 * **The first four are hidden as of 2026-08-17, at the client's word:** *"the
 * circles, what looks like HAL from 2001, and the other lame layouts need to
 * go. they are confusing and just cause me to say wtf is this and why is it a
 * circle."* That reading is fair and it is worth being precise about why, because
 * the answer shaped the replacement. A lens, a valve, an aperture and an orrery
 * are four circles that do not *depict* anything — the viewer is asked to admire
 * a glowing ring and told nothing about what it is for. Sonar is a circle too,
 * and that is not the same mistake: a scope is an instrument, it is read rather
 * than admired, and finding the fault in somebody's machine is what this whole
 * site is about. Same geometry, and now it means something.
 *
 * They are hidden rather than deleted for the wire-format reason below — and
 * because the operator can still reach them by pasting an old code, which is
 * what "withdrawn" ought to mean.
 */
export const ORNAMENTS: { id: OrnamentId; label: string; hidden?: boolean }[] = [
  { id: "lens", label: "Lens", hidden: true },
  { id: "valve", label: "Valve", hidden: true },
  { id: "aperture", label: "Aperture", hidden: true },
  { id: "orrery", label: "Orrery", hidden: true },
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
  /*
   * **Sonar — index 7, appended** (2026-08-17, client: *"a sonar with sweeping
   * radar ping would be better"*).
   *
   * A bezel, three range rings, four bearing ticks, and one beam sweeping the
   * scope on a 4.8s revolution. Contacts do not glow on their own: each fades up
   * only as the beam crosses its bearing and decays behind it, which is the
   * whole difference between a scope and a spinning gradient — the light comes
   * *from* the sweep, so the thing you are looking at is the instrument working
   * rather than a decoration cycling.
   *
   * CSS from palette tokens like every ornament but the duels, so it recolours
   * with the 0.9s bleed and needs no canvas, no image and no third-party
   * anything. `--a1` is the beam, so it is the site's own accent doing the
   * looking. In calm every animation is stripped: the beam parks at a bearing
   * and the contacts sit steady, which is a legible instrument at rest rather
   * than a broken one — the same standard calm is held to everywhere else.
   */
  { id: "sonar", label: "Sonar" },
];

/**
 * The ornaments a human may choose — the panel and the command palette read
 * this; anything *resolving* a stored or shared value reads `ORNAMENTS`.
 *
 * Exactly the `FX` / `PICKABLE_FX` split, and kept as two lists for the same
 * reason: collapsing them is the tidy-up that forces the next withdrawal to
 * delete an index instead of flagging one, and deleting an index silently
 * repoints every share code in circulation.
 */
export const PICKABLE_ORNAMENTS = ORNAMENTS.filter((o) => !o.hidden);

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
export const ROLLABLE_ORNAMENTS = PICKABLE_ORNAMENTS.filter((o) => o.id !== "none");

/**
 * Sonar is the default (2026-08-17), replacing Lens.
 *
 * It is also what a background duel makes the ornament yield *to*, and what an
 * out-of-range share-code index resolves to — so this constant now has to be an
 * ornament that is still offered. That is the second reason the withdrawn four
 * are hidden rather than left as the head of the list.
 */
export const DEFAULT_ORNAMENT: OrnamentId = "sonar";
