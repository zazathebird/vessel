import { LAYOUTS, PICKABLE_FX, TYPESETS } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PALETTES } from "../data/palettes";
import { isAllowed } from "../data/guardrails";
import type { Config } from "./types";

/** What a roll may change. Anything outside this set keeps its current value. */
export type RollResult = Pick<
  Config,
  "pal" | "layout" | "fx" | "ornament" | "type" | "grain" | "breathe" | "cursor"
>;

const MAX_ATTEMPTS = 60;

const pickIndex = (length: number) => Math.floor(Math.random() * length);
const pick = <T,>(items: readonly T[]): T => items[pickIndex(items.length)];

/**
 * Roll a new combination, honouring the scope switches and retrying until the
 * guardrails pass. Returns null if 60 attempts all fail, in which case the
 * caller leaves the current config alone rather than applying a blocked combo.
 *
 * Note the retry loop can genuinely exhaust: with narrow scopes the operator
 * can pin themselves to a corner of the space where nothing is legal (Terminal
 * locked with only Palette in scope, say). Failing closed is correct — the
 * alternative is quietly overriding a guardrail the client asked for.
 */
export function roll(config: Config): RollResult | null {
  const { scope } = config;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate: RollResult = {
      pal: scope.pal ? pickIndex(PALETTES.length) : config.pal,
      layout: scope.layout ? pick(LAYOUTS).id : config.layout,
      // PICKABLE_FX: a withdrawn effect is not a legal roll, even though a
      // share code carrying it still applies.
      fx: scope.fx ? pick(PICKABLE_FX).id : config.fx,
      ornament: scope.ornament ? pick(ORNAMENTS).id : config.ornament,
      type: scope.type ? pickIndex(TYPESETS.length) : config.type,
      grain: scope.toggles ? Math.random() > 0.35 : config.grain,
      breathe: scope.toggles ? Math.random() > 0.2 : config.breathe,
      cursor: scope.toggles ? Math.random() > 0.3 : config.cursor,
    };

    const allowed = isAllowed({
      palette: PALETTES[candidate.pal].id,
      layout: candidate.layout,
      fx: candidate.fx,
      type: TYPESETS[candidate.type].id,
      grain: candidate.grain,
    });

    if (allowed) return candidate;
  }

  return null;
}

/** What the shuffle button toasts: "Deep Reef · Card deck". */
export function describeRoll(result: RollResult): string {
  const layout = LAYOUTS.find((l) => l.id === result.layout);
  return `${PALETTES[result.pal].name} · ${layout?.label ?? ""}`;
}
