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
/**
 * `operatorOnly` withdraws an ornament from *visitors* rather than from menus,
 * and it is a different axis from `hidden` (2026-08-28, client request: the
 * duels are *"a feature for just me unless i otherwise say so"*).
 *
 * The two are orthogonal and both duels now carry both flags for different
 * reasons — `duelholy` is `hidden` because it is a duplicate of `duel` in the
 * menu, and both are `operatorOnly` because a lightsword is not for the public
 * site. Read the pair as: `hidden` is about *the picker*, `operatorOnly` is
 * about *the page*.
 *
 * **It is enforced where the ornament is drawn, not where it is stored.** A
 * published config or a share code naming a duel still resolves to one — it
 * simply renders as `DEFAULT_ORNAMENT` for anybody who is not signed in as the
 * operator. Enforcing it at the storage end instead would mean the operator's
 * own published config silently rewrote itself, and he would lose the setting
 * by looking at his own site logged out.
 */
export const ORNAMENTS: {
  id: OrnamentId;
  label: string;
  hidden?: boolean;
  operatorOnly?: boolean;
}[] = [
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
  { id: "duel", label: "Lightswords", operatorOnly: true },
  /*
   * **Withdrawn 2026-08-27, not deleted.** Both duel ornaments now draw from
   * the whole roster (`DUEL_POOLS`), so this one and index 5 became the same
   * thing, and two identical entries in a menu is worse than one. `hidden` is
   * the documented withdrawal mechanism: a stored config or a share code naming
   * `duelholy` still resolves to it and still works, it simply stops being
   * offered. The published site config named it at the time, which is exactly
   * the case `hidden` exists to keep working.
   */
  { id: "duelholy", label: "Lightswords: saint & serpent", hidden: true, operatorOnly: true },
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
 * Same rule as `ROLLABLE_FX`: a rolled empty hero slot is indistinguishable
 * from a broken page, and the visitor cannot see the setting that caused it.
 * The duel guardrail already settled this once — when a background duel forces
 * the ornament to yield it yields to `DEFAULT_ORNAMENT`, deliberately not to
 * `null` — so an automatic mechanism emptying the slot is a decided question,
 * and a roll is exactly such a mechanism.
 *
 * **This rule used to carry a second reason and no longer does** (2026-08-18):
 * five taps here revealed the footer's sign-in link, which on the phone band was
 * the only findable route to an account. That machinery is deleted — the footer
 * link is permanent (`Footer.tsx`) — so the aesthetic reason is now the whole
 * reason. It is still sufficient on its own; the rule does not change.
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

/**
 * The ornaments a visitor may ever be shown, and the ones the operator may.
 *
 * **The roll pool depends on who is looking**, which is what makes the lock
 * hold: a visitor's dice can never land on a duel, so there is no path — roll,
 * publish, share code or stored config — by which one reaches the public site.
 * `ROLLABLE_ORNAMENTS` above stays exactly what it was and is the operator's
 * pool; this narrows it.
 *
 * At the operator's end the pool is two — the duel and sonar — and that is a
 * real roll rather than a coin trick only in the sense that both outcomes are
 * ornaments he has actually chosen to offer. **The four withdrawn circles are
 * deliberately not re-added to it**: he called them lame and had them withdrawn
 * on 2026-08-17, and quietly putting them back in his own dice would be
 * restoring rejected work by the back door. If he wants them again that is a
 * decision, not a side effect.
 */
export function rollableOrnaments(isOperator: boolean) {
  return isOperator
    ? ROLLABLE_ORNAMENTS
    : ROLLABLE_ORNAMENTS.filter((o) => !o.operatorOnly);
}

/**
 * What actually gets drawn in the hero slot, given who is looking.
 *
 * Yields to `DEFAULT_ORNAMENT`, never to `"none"` — an empty hero slot is
 * indistinguishable from a broken page, and the visitor cannot see the setting
 * that caused it. Exactly the reasoning `ROLLABLE_ORNAMENTS` and the duel
 * guardrail already settled, applied to a third mechanism that can empty the
 * slot.
 */
export function visibleOrnament(id: OrnamentId, isOperator: boolean): OrnamentId {
  if (isOperator) return id;
  return ORNAMENTS.find((o) => o.id === id)?.operatorOnly ? DEFAULT_ORNAMENT : id;
}
