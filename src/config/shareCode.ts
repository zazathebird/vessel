import { FX, LAYOUTS, TYPESETS } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PALETTES } from "../data/palettes";
import type { Config } from "./types";

/**
 * Share codes: base-36 fields joined by hyphens, uppercased.
 * palette · layout · effect · type · toggle bitfield · ornament.
 * Bitfield: 1 grain, 2 breathing, 4 cursor glow, 8 calm, 16 sound.
 * e.g. "A-3-1-0-7-1".
 *
 * The ornament was added after codes were already in circulation, so it goes
 * last and is optional on the way in: a five-field code still decodes, and
 * leaves the ornament alone rather than silently resetting it.
 *
 * **Sound took the free bit rather than a seventh field** (2026-08-14). The
 * bitfield had 1, 2, 4 and 8 in use and 16 spare, and a bit costs nothing that
 * a field costs: every code already in circulation has bit 16 clear, which
 * decodes as sound off — the correct default, and the one a visitor would want.
 * The field count does not change, so nothing that counts hyphens breaks, and
 * base-36 still renders the whole bitfield (max 31) in one character.
 */

const GRAIN = 1;
const BREATHE = 2;
const CURSOR = 4;
const CALM = 8;
const SOUND = 16;

export function encodeShareCode(config: Config): string {
  const layout = LAYOUTS.findIndex((l) => l.id === config.layout);
  const fx = FX.findIndex((f) => f.id === config.fx);
  const bits =
    (config.grain ? GRAIN : 0) +
    (config.breathe ? BREATHE : 0) +
    (config.cursor ? CURSOR : 0) +
    (config.calm ? CALM : 0) +
    (config.sound ? SOUND : 0);
  const ornament = ORNAMENTS.findIndex((o) => o.id === config.ornament);
  return [config.pal, layout, fx, config.type, bits, ornament]
    .map((n) => Math.max(0, n).toString(36))
    .join("-")
    .toUpperCase();
}

/** The subset of config a code carries. Applying one also forces mode to Static. */
export type SharedConfig = Pick<
  Config,
  "pal" | "layout" | "fx" | "type" | "grain" | "breathe" | "cursor" | "calm" | "sound" | "mode"
> &
  Partial<Pick<Config, "ornament">>;

/** Returns null for anything malformed — the caller toasts "that isn't a setup code". */
export function decodeShareCode(input: string): SharedConfig | null {
  const parts = String(input ?? "").toLowerCase().trim().split("-");
  if (parts.length !== 5 && parts.length !== 6) return null;

  const numbers = parts.map((part) => {
    // parseInt would accept "3junk" as 3; a share code field is base-36 digits only.
    if (!/^[0-9a-z]+$/.test(part)) return NaN;
    return parseInt(part, 36);
  });
  if (numbers.some((n) => Number.isNaN(n))) return null;

  const [pal, layout, fx, type, bits, ornament] = numbers;
  return {
    ...(ornament === undefined ? {} : { ornament: (ORNAMENTS[ornament] ?? ORNAMENTS[0]).id }),
    pal: Math.min(pal, PALETTES.length - 1),
    layout: (LAYOUTS[layout] ?? LAYOUTS[0]).id,
    fx: (FX[fx] ?? FX[0]).id,
    type: Math.min(type, TYPESETS.length - 1),
    grain: !!(bits & GRAIN),
    breathe: !!(bits & BREATHE),
    cursor: !!(bits & CURSOR),
    calm: !!(bits & CALM),
    sound: !!(bits & SOUND),
    mode: "static",
  };
}
