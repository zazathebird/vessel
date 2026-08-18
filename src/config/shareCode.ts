import { FX, LAYOUTS, TYPESETS } from "../data/catalog";
import { DEFAULT_ORNAMENT, ORNAMENTS } from "../data/ornaments";
import { DEFAULT_STATION, STATIONS } from "../data/stations";
import { PALETTES } from "../data/palettes";
import type { Config } from "./types";

/**
 * Share codes: base-36 fields joined by hyphens, uppercased.
 * palette · layout · effect · type · toggle bitfield · ornament · station.
 * Bitfield: 1 grain, 2 breathing, 4 cursor glow, 8 calm, 16 sound, 32 slot labels.
 * e.g. "A-3-1-0-7-1".
 *
 * The ornament was added after codes were already in circulation, so it goes
 * last and is optional on the way in: a five-field code still decodes, and
 * leaves the ornament alone rather than silently resetting it.
 *
 * **The station (2026-08-18) took a seventh field, not a bit.** The bitfield is
 * where a new *boolean* goes while bits remain, and 128 is free — but a station
 * is one of four values, not a flag, and packing an enum into bits is how a
 * catalogue gains a fifth entry and silently overflows into its neighbour. It
 * follows the ornament's precedent exactly: appended last, optional on the way
 * in, and **absent means abstain rather than reset** — so all three of the
 * five-, six- and seven-field forms decode, and a six-field code handed out
 * yesterday still means what it meant.
 *
 * **Sound took the free bit rather than a seventh field** (2026-08-14). The
 * bitfield had 1, 2, 4 and 8 in use and 16 spare, and a bit costs nothing that
 * a field costs: every code already in circulation has bit 16 clear, which
 * decodes as sound off — the correct default, and the one a visitor would want.
 * The field count does not change, so nothing that counts hyphens breaks. The
 * bitfield has since outgrown one base-36 character (max 127 with bit 64) —
 * fine, because nothing counts characters, only hyphens.
 */

const GRAIN = 1;
const BREATHE = 2;
const CURSOR = 4;
const CALM = 8;
const SOUND = 16;
/**
 * Tile slot captions ("4:5 · photo slot"), off by default (2026-08-14).
 *
 * **No inversion needed here, unlike a default-on boolean would need.** Every
 * code already in circulation has bit 32 clear, and clear must mean *hidden* —
 * which is exactly the default the client asked for. A default-on flag would
 * have had to be stored inverted for the same reason.
 */
const SLOTS = 32;
/**
 * Layout entrances (2026-08-18) — **stored inverted: the bit set means
 * entrances OFF.** The default is on, and every code already in circulation
 * has bit 64 clear, so a clear bit has to decode to the default the way it
 * always has. `sound` and `slots` got away with the plain reading only
 * because their defaults are off.
 *
 * This bit takes the bitfield past one base-36 character (max 127 → "3J").
 * Harmless by construction: nothing counts characters, only hyphens, and
 * `parseInt(..., 36)` reads multi-digit fields exactly as it reads the
 * palette index.
 */
const ENTRANCES_OFF = 64;

export function encodeShareCode(config: Config): string {
  const layout = LAYOUTS.findIndex((l) => l.id === config.layout);
  const fx = FX.findIndex((f) => f.id === config.fx);
  const bits =
    (config.grain ? GRAIN : 0) +
    (config.breathe ? BREATHE : 0) +
    (config.cursor ? CURSOR : 0) +
    (config.calm ? CALM : 0) +
    (config.sound ? SOUND : 0) +
    (config.slots ? SLOTS : 0) +
    (config.entrances ? 0 : ENTRANCES_OFF);
  const ornament = ORNAMENTS.findIndex((o) => o.id === config.ornament);
  const station = STATIONS.findIndex((s) => s.id === config.station);
  return [config.pal, layout, fx, config.type, bits, ornament, station]
    .map((n) => Math.max(0, n).toString(36))
    .join("-")
    .toUpperCase();
}

/** The subset of config a code carries. Applying one also forces mode to Static. */
export type SharedConfig = Pick<
  Config,
  | "pal"
  | "layout"
  | "fx"
  | "type"
  | "grain"
  | "breathe"
  | "cursor"
  | "calm"
  | "sound"
  | "slots"
  | "entrances"
  | "mode"
> &
  Partial<Pick<Config, "ornament" | "station">>;

/** Returns null for anything malformed — the caller toasts "that isn't a setup code". */
export function decodeShareCode(input: string): SharedConfig | null {
  const parts = String(input ?? "").toLowerCase().trim().split("-");
  if (parts.length < 5 || parts.length > 7) return null;

  const numbers = parts.map((part) => {
    // parseInt would accept "3junk" as 3; a share code field is base-36 digits only.
    if (!/^[0-9a-z]+$/.test(part)) return NaN;
    return parseInt(part, 36);
  });
  if (numbers.some((n) => Number.isNaN(n))) return null;

  const [pal, layout, fx, type, bits, ornament, station] = numbers;
  return {
    // Same abstain-don't-reset rule as the ornament below, and the same
    // out-of-range treatment: a field past the end resolves to DEFAULT_STATION
    // rather than to index 0. They happen to be the same entry today (`hold` is
    // both), which is exactly why this is written out — the ornament list was
    // in that position too until its default moved and index 0 became hidden,
    // and the fallback was then wrong for a day.
    ...(station === undefined ? {} : { station: STATIONS[station]?.id ?? DEFAULT_STATION }),
    // Out of range falls back to DEFAULT_ORNAMENT, not to index 0: the head of
    // the list is Lens, which is withdrawn (hidden) — handing it out for a
    // malformed field would resurrect the exact ornament the client pulled.
    // The FX/layout fallbacks below stay on index 0 because their index 0 is
    // not hidden; if one ever is, it needs this same treatment.
    ...(ornament === undefined ? {} : { ornament: ORNAMENTS[ornament]?.id ?? DEFAULT_ORNAMENT }),
    pal: Math.min(pal, PALETTES.length - 1),
    layout: (LAYOUTS[layout] ?? LAYOUTS[0]).id,
    fx: (FX[fx] ?? FX[0]).id,
    type: Math.min(type, TYPESETS.length - 1),
    grain: !!(bits & GRAIN),
    breathe: !!(bits & BREATHE),
    cursor: !!(bits & CURSOR),
    calm: !!(bits & CALM),
    sound: !!(bits & SOUND),
    slots: !!(bits & SLOTS),
    entrances: !(bits & ENTRANCES_OFF),
    mode: "static",
  };
}
