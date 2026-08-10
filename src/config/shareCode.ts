import { FX, LAYOUTS, TYPESETS } from "../data/catalog";
import { PALETTES } from "../data/palettes";
import type { Config } from "./types";

/**
 * Share codes: five base-36 fields joined by hyphens, uppercased.
 * palette index · layout index · effect index · type index · toggle bitfield.
 * Bitfield: 1 grain, 2 breathing, 4 cursor glow, 8 calm. e.g. "A-3-1-0-7".
 */

const GRAIN = 1;
const BREATHE = 2;
const CURSOR = 4;
const CALM = 8;

export function encodeShareCode(config: Config): string {
  const layout = LAYOUTS.findIndex((l) => l.id === config.layout);
  const fx = FX.findIndex((f) => f.id === config.fx);
  const bits =
    (config.grain ? GRAIN : 0) +
    (config.breathe ? BREATHE : 0) +
    (config.cursor ? CURSOR : 0) +
    (config.calm ? CALM : 0);
  return [config.pal, layout, fx, config.type, bits]
    .map((n) => Math.max(0, n).toString(36))
    .join("-")
    .toUpperCase();
}

/** The subset of config a code carries. Applying one also forces mode to Static. */
export type SharedConfig = Pick<
  Config,
  "pal" | "layout" | "fx" | "type" | "grain" | "breathe" | "cursor" | "calm" | "mode"
>;

/** Returns null for anything malformed — the caller toasts "that isn't a setup code". */
export function decodeShareCode(input: string): SharedConfig | null {
  const parts = String(input ?? "").toLowerCase().trim().split("-");
  if (parts.length !== 5) return null;

  const numbers = parts.map((part) => {
    // parseInt would accept "3junk" as 3; a share code field is base-36 digits only.
    if (!/^[0-9a-z]+$/.test(part)) return NaN;
    return parseInt(part, 36);
  });
  if (numbers.some((n) => Number.isNaN(n))) return null;

  const [pal, layout, fx, type, bits] = numbers;
  return {
    pal: Math.min(pal, PALETTES.length - 1),
    layout: (LAYOUTS[layout] ?? LAYOUTS[0]).id,
    fx: (FX[fx] ?? FX[0]).id,
    type: Math.min(type, TYPESETS.length - 1),
    grain: !!(bits & GRAIN),
    breathe: !!(bits & BREATHE),
    cursor: !!(bits & CURSOR),
    calm: !!(bits & CALM),
    mode: "static",
  };
}
