/**
 * Randomiser guardrails — combinations the client asked to block.
 * Source: BAD / LOWCONTRAST in the prototype (Site v2 - Vessel.dc.html:351).
 *
 * DEVIATION FROM THE PROTOTYPE, deliberate:
 * The prototype's ok() tests each clause independently, so the rule
 * { type:["editorial"], pal:["datamosh"] } rejects *every* Editorial config
 * rather than only the Editorial+Datamosh pairing — Editorial can never be
 * rolled at all. The spec's wording is "Editorial type may not pair with the
 * Datamosh palette", so here a rule matches only when ALL of its specified
 * clauses match. Every other rule behaves identically under both readings.
 */

import type { FxId, LayoutId, TypeSetId } from "./catalog";
import type { OrnamentId } from "./ornaments";
import type { PaletteId } from "./palettes";

export interface Guardrail {
  /** Rule applies only to this layout. */
  layout?: LayoutId;
  /** Rule matches when the effect is one of these. */
  fx?: FxId[];
  /** Rule matches when the effect is NOT one of these (an allowlist). */
  fxNot?: FxId[];
  /** Rule matches when the typeface is one of these. */
  type?: TypeSetId[];
  /** Rule matches when the palette is one of these. */
  pal?: PaletteId[];
  /**
   * Rule matches when the hero ornament is one of these.
   *
   * Added 2026-08-15. The randomiser has always *rolled* the ornament and never
   * submitted it to the guardrails — `roll` built a candidate with an ornament
   * in it and then called `isAllowed` with five of its six fields. So no
   * guardrail could constrain an ornament no matter how it was written, and the
   * one combination that genuinely does not work shipped.
   */
  ornament?: OrnamentId[];
}

export const GUARDRAILS: Guardrail[] = [
  { layout: "magazine", fx: ["rain", "plasma"] },
  /*
   * Terminal's allowlist, loosened.
   *
   * It was `rain`, `tunnel`, `off` and nothing else, and the reason was that the
   * window had no `backdrop-filter`: a 55%-opaque box over a *sharp* canvas made
   * anything with structure unreadable behind mono body text. The window is
   * frosted now (chrome.css), so the background arrives as diffused light and
   * three more effects become legible behind it.
   *
   * Still excluded: `plasma` and `plasma`-like fields whose contrast survives a
   * 20px blur, and `bokeh`, whose discs are large enough to read through frost
   * as moving blotches under the text.
   */
  { layout: "terminal", fxNot: ["rain", "tunnel", "off", "constellation", "stars", "aurora", "scan"] },
  { layout: "terminal", type: ["condensed"] },
  { type: ["editorial"], pal: ["datamosh"] },
  { layout: "sidescroll", fx: ["rain", "plasma", "vessels", "bokeh"] },
  { layout: "radial", fx: ["plasma", "rain"] },
  { layout: "ledger", fx: ["plasma", "bokeh"] },
  { layout: "ledger", type: ["condensed"] },
  { layout: "console", fxNot: ["rain", "tunnel", "off", "constellation", "telemetry"] },
  { layout: "marginalia", fx: ["rain", "plasma", "stars"] },
  { layout: "sheet", fx: ["rain", "plasma"] },

  /*
   * New, with the panel translucency drop (theme.ts `--panel`). At 70% opacity
   * a card hid whatever was behind it; at 54–58% with a real blur, `plasma`'s
   * moving dot field reads *through* body copy on the layouts whose panels grew
   * more transparent rather than less.
   *
   * Mosaic takes `rain` as well: its large spans sit at the deepest
   * translucency on the site outside the HUD, and a falling column behind a
   * paragraph is legible enough through that to compete with it.
   */
  { layout: "deck", fx: ["plasma"] },
  { layout: "mosaic", fx: ["plasma", "rain"] },

  /*
   * The HUD's allowlist, Terminal's in spirit. Three overlapping translucent
   * planes are the most demanding thing on the site to read through, so only
   * the effects that stay quiet under two layers of frost are allowed: the two
   * built for it, plus the two structured fields that already survive being
   * blurred.
   */
  { layout: "hud", fxNot: ["scan", "telemetry", "tunnel", "constellation", "off"] },

  /*
   * One fight at a time (client, 2026-08-15: "when in landscape mode on mobile,
   * there are two fights going at the same time").
   *
   * The duel has two homes and both are wanted — the hero ornament, which was
   * the original request, and the full-bleed background. What was never
   * intended is *both at once*, which runs two independent matches with
   * different fighters, different health and different winners a few inches
   * apart. The live site publishes `mode: "visit"`, so every visit re-rolls;
   * two of sixteen effects are duels and two of seven ornaments are, giving
   * 2/16 × 2/7 ≈ **3.6% of visits** — about one in twenty-eight.
   *
   * It shows up in landscape because that is where the two collide rather than
   * where it starts. Measured at 844×420 the stage is 269px tall, the ornament
   * is a 240px slot beginning 55px down, and the background fight's feet land
   * at 215px — the two occupy the same band of the screen at comparable size.
   * At 400×700 the ornament ends at 197px, the background fight's feet are at
   * 398px and its figures are half the size, so it reads as texture and nobody
   * looks twice. Same bug, both orientations.
   *
   * Cross-pairings count: `duel` behind `duelholy` is still two fights.
   */
  { fx: ["duel", "duelholy"], ornament: ["duel", "duelholy"] },
];

export interface Combination {
  palette: PaletteId;
  layout: LayoutId;
  fx: FxId;
  type: TypeSetId;
  grain: boolean;
  /**
   * Required, not optional, and that is the point. Every field here is a thing
   * a roll can change, and the ornament was rolled for months without being
   * checked because it was simply absent from this type — nothing failed to
   * compile, so nothing said so. Making it required means a future dimension
   * added to `RollResult` and forgotten here is a type error at the call site
   * rather than a rule that silently never matches.
   */
  ornament: OrnamentId;
}

/** True when every clause the rule specifies matches the combination. */
function ruleMatches(rule: Guardrail, c: Combination): boolean {
  if (rule.layout !== undefined && rule.layout !== c.layout) return false;
  if (rule.fx !== undefined && !rule.fx.includes(c.fx)) return false;
  if (rule.fxNot !== undefined && rule.fxNot.includes(c.fx)) return false;
  if (rule.type !== undefined && !rule.type.includes(c.type)) return false;
  if (rule.pal !== undefined && !rule.pal.includes(c.palette)) return false;
  if (rule.ornament !== undefined && !rule.ornament.includes(c.ornament)) return false;
  return true;
}

import { LOW_CONTRAST } from "./palettes";

/** A combination is allowed when no guardrail matches it. */
export function isAllowed(c: Combination): boolean {
  if (GUARDRAILS.some((rule) => ruleMatches(rule, c))) return false;
  // Grain on a low-contrast palette pushes body text under the floor.
  if (c.grain && LOW_CONTRAST.includes(c.palette)) return false;
  return true;
}
