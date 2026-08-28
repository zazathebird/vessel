/**
 * Guardrails — combinations the client asked to block.
 * Source: BAD / LOWCONTRAST in the prototype (Site v2 - Vessel.dc.html:351),
 * and `design/SPEC.md`'s *Guardrails* list, whose wording most of the notes
 * below are taken from.
 *
 * **These are not "randomiser guardrails" any more, and the rename is the
 * point** (2026-08-28). They were written as a filter on the dice and for
 * months that is all they were: `isAllowed` had two callers, the randomiser
 * and `npm run check`. A roll is one of four ways a config arrives — the other
 * three are the operator panel, a pasted share code and stored config, and all
 * three walked straight past every rule here. Production shipped `duelholy` +
 * `roam` for days with the suite green. See `effectiveStation` in
 * `./stations.ts` for that story written out.
 *
 * So a rule now reaches the page by one of two routes, and **every rule must
 * be on one of them**:
 *
 *  - **Resolved at render.** `resolve()` below is called on the way to the
 *    wrapper's classes, so a config that stores a refused pairing renders an
 *    allowed one. Only the two rules whose *direction of yield* is obvious are
 *    resolved this way — see `effectiveStation` and `effectiveGrain`.
 *  - **Shown to the operator.** Every other rule is a matter of taste the
 *    client set down, and the operator is allowed to overrule his own taste;
 *    what he is not allowed to do is overrule it *without being told*. The
 *    panel reads `matched()` and prints the note.
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
import { TYPESETS } from "./catalog";
import type { OrnamentId } from "./ornaments";
import type { StationId } from "./stations";
import { ROAM_EXCLUDES, effectiveStation } from "./stations";
import type { PaletteId } from "./palettes";
import { LOW_CONTRAST, PALETTES } from "./palettes";

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
  /** Rule matches when the ornament's station is one of these. */
  station?: StationId[];
  /** Rule matches when the grain overlay is in this state. */
  grain?: boolean;
  /**
   * What this rule refuses, in words, addressed to the operator reading it in
   * the panel at the moment he trips it.
   *
   * **Required, for the reason every field of `Combination` is required.** A
   * rule the operator can overrule has to say what he is overruling, and an
   * optional note is a note that gets left off — the panel would then print a
   * blank line for the newest rule, which is the rule least likely to be
   * remembered. Say what the pairing *is*; say why only where the reason is
   * actually on record, because a plausible invented reason reads better than
   * the truth and this file has no way to tell them apart later.
   */
  note: string;
}

export const GUARDRAILS: Guardrail[] = [
  {
    layout: "magazine",
    fx: ["rain", "plasma"],
    note: "Magazine may not use Matrix rain or Plasma.",
  },
  {
    layout: "terminal",
    fxNot: ["rain", "tunnel", "off", "constellation", "stars", "aurora", "scan"],
    note: "Terminal may use only Matrix rain, Grid tunnel, Constellation, Warp stars, Aurora, Scan or None.",
  },
  { layout: "terminal", type: ["condensed"], note: "Terminal may not use Condensed type." },
  {
    type: ["editorial"],
    pal: ["datamosh"],
    note: "Editorial type may not pair with the Datamosh palette.",
  },
  {
    layout: "sidescroll",
    fx: ["rain", "plasma", "vessels", "bokeh"],
    note: "Side-scroll may not use a heavy effect — Matrix rain, Plasma, Branches or Bokeh.",
  },
  { layout: "radial", fx: ["plasma", "rain"], note: "Radial may not use Plasma or Matrix rain." },
  { layout: "ledger", fx: ["plasma", "bokeh"], note: "Ledger may not use Plasma or Bokeh." },
  { layout: "ledger", type: ["condensed"], note: "Ledger may not use Condensed type." },
  {
    layout: "console",
    fxNot: ["rain", "tunnel", "off", "constellation", "telemetry"],
    note: "Console may use only Matrix rain, Grid tunnel, Constellation, Telemetry or None.",
  },
  {
    layout: "marginalia",
    fx: ["rain", "plasma", "stars"],
    note: "Marginalia may not use Matrix rain, Plasma or Warp stars.",
  },
  {
    layout: "sheet",
    fx: ["rain", "plasma"],
    note: "Contact sheet may not use Matrix rain or Plasma.",
  },

  { layout: "deck", fx: ["plasma"], note: "Card deck may not use Plasma." },
  { layout: "mosaic", fx: ["plasma", "rain"], note: "Mosaic may not use Plasma or Matrix rain." },

  {
    layout: "hud",
    fxNot: ["scan", "telemetry", "tunnel", "constellation", "off"],
    note: "HUD may use only Scan, Telemetry, Grid tunnel, Constellation or None — it reads as an instrument, and its near plane blurs whatever is behind it.",
  },

  {
    fx: ["duel", "duelholy"],
    ornament: ["duel", "duelholy"],
    note: "One fight at a time — a duel in the hero and a duel across the whole canvas are two matches asking to be watched at once.",
  },
  {
    ornament: ROAM_EXCLUDES,
    station: ["roam"],
    note: "A roaming duel is a duel you cannot follow — Roam fades the slot to 12% and re-acquires it at a new bearing three times a revolution, and a duel is the one ornament with a subject to lose.",
  },

  /*
   * Moved into the table 2026-08-28. It lived as a special case inside
   * `isAllowed` since the beginning, which meant it could not be *named*: the
   * panel's warning list, `matched()` and every future reader of `GUARDRAILS`
   * would all have had to know about a seventeenth rule that was not in the
   * seventeen. One table, one matcher, one note each.
   */
  {
    pal: LOW_CONTRAST,
    grain: true,
    note: "Grain may not be on with a low-contrast palette (Peat, Oxide, Terracotta Night, Deco Gold) — it is a 14% overlay of --fg across the whole page, body copy included, on the four palettes with the least room for it.",
  },
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
  /** Required for the same reason `ornament` is — see above. */
  station: StationId;
}

/**
 * The one place a `Combination` is built.
 *
 * Structural, not `Config`, so the randomiser's in-flight candidate and the
 * operator's live config go through the same constructor — two constructors is
 * how the ornament came to be rolled and never checked. `pal` and `type` are
 * indices in the stored shape and ids here, and that translation is the only
 * work this does; a `??` on each because a published index that no longer
 * exists must not throw on the way to a guardrail check.
 */
export function combinationOf(c: {
  pal: number;
  layout: LayoutId;
  fx: FxId;
  ornament: OrnamentId;
  station: StationId;
  type: number;
  grain: boolean;
}): Combination {
  return {
    palette: (PALETTES[c.pal] ?? PALETTES[0]).id,
    layout: c.layout,
    fx: c.fx,
    type: (TYPESETS[c.type] ?? TYPESETS[0]).id,
    grain: c.grain,
    ornament: c.ornament,
    station: c.station,
  };
}

/** True when every clause the rule specifies matches the combination. */
function ruleMatches(rule: Guardrail, c: Combination): boolean {
  if (rule.layout !== undefined && rule.layout !== c.layout) return false;
  if (rule.fx !== undefined && !rule.fx.includes(c.fx)) return false;
  if (rule.fxNot !== undefined && rule.fxNot.includes(c.fx)) return false;
  if (rule.type !== undefined && !rule.type.includes(c.type)) return false;
  if (rule.pal !== undefined && !rule.pal.includes(c.palette)) return false;
  if (rule.ornament !== undefined && !rule.ornament.includes(c.ornament)) return false;
  if (rule.station !== undefined && !rule.station.includes(c.station)) return false;
  if (rule.grain !== undefined && rule.grain !== c.grain) return false;
  return true;
}

/** Every rule this combination trips, in table order. */
export function matched(c: Combination): Guardrail[] {
  return GUARDRAILS.filter((rule) => ruleMatches(rule, c));
}

/** A combination is allowed when no guardrail matches it. */
export function isAllowed(c: Combination): boolean {
  return !GUARDRAILS.some((rule) => ruleMatches(rule, c));
}

/**
 * Whether the grain overlay actually renders (2026-08-28), the second rule
 * enforced at the page rather than at the dice — see the header of this file
 * and `effectiveStation`, whose shape and reasoning this follows exactly.
 *
 * **The grain yields, never the palette.** The palette is the look: it is what
 * the 0.9s bleed exists for, it is what every token on the page is derived
 * from, and on these four it is a deliberate low-contrast choice the client
 * signed off. Grain is a 14% `mix-blend-mode: overlay` sheet of `--fg` laid
 * over the entire page, body copy included, and it is already the first thing
 * calm drops. Substituting the palette to keep the texture would throw away
 * the thing being defended to satisfy the rule defending it.
 *
 * This one is an accessibility floor rather than a matter of taste, which is
 * why it resolves instead of merely warning: the panel's warning is addressed
 * to the operator, and the person who pays for grain on Oxide is a visitor who
 * never sees the panel.
 */
export function effectiveGrain(grain: boolean, palette: PaletteId): boolean {
  return grain && LOW_CONTRAST.includes(palette) ? false : grain;
}

/**
 * A stored combination as it will actually render.
 *
 * Both resolvers, applied together, so "what does the page do with this?" has
 * one answer and the check suite can assert against the same one the wrapper
 * is built from. Whatever this returns must satisfy `isAllowed` for the two
 * rules it resolves; `npm run check` asserts exactly that, because a resolver
 * that has quietly stopped resolving passes every other test in the file.
 */
export function resolve(c: Combination): Combination {
  return {
    ...c,
    station: effectiveStation(c.station, c.ornament),
    grain: effectiveGrain(c.grain, c.palette),
  };
}
