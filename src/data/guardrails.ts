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
];

export interface Combination {
  palette: PaletteId;
  layout: LayoutId;
  fx: FxId;
  type: TypeSetId;
  grain: boolean;
}

/** True when every clause the rule specifies matches the combination. */
function ruleMatches(rule: Guardrail, c: Combination): boolean {
  if (rule.layout !== undefined && rule.layout !== c.layout) return false;
  if (rule.fx !== undefined && !rule.fx.includes(c.fx)) return false;
  if (rule.fxNot !== undefined && rule.fxNot.includes(c.fx)) return false;
  if (rule.type !== undefined && !rule.type.includes(c.type)) return false;
  if (rule.pal !== undefined && !rule.pal.includes(c.palette)) return false;
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
