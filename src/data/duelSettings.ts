/**
 * What the operator may say about the duel — site-wide, and per page.
 *
 * ## Why this reverses a rule that was written down
 *
 * `DUEL_TUNING` in `src/fx/duel.ts` carried this note, and it was right about
 * the risk: *"a duel that is a different fight per visitor is not a decision
 * anybody made"* — the four pacing knobs were a bench surface precisely so that
 * every visitor watched the same fight and two people could therefore discuss
 * it. **The client reversed that on 2026-08-28**, in his words: *"i want
 * complete options for the duels for everyone n just for myself."* Both halves
 * of that sentence are load-bearing and both are honoured here: the settings
 * publish to every visitor, *and* the operator can drive them live on `/admin`
 * without publishing anything.
 *
 * The risk the old note named has not gone away — it has moved. It is no longer
 * "nobody agreed to this fight"; it is **"the fight a visitor sees is whatever
 * was published, so a bad value reaches everyone at once"**, which is the same
 * exposure every other published appearance field already has. That is what
 * `validDuelSettings` is for, and why it refuses rather than repairs: the rest
 * of the published config is validated field by field for exactly this reason,
 * and a duel setting is no more trustworthy than a layout id.
 *
 * ## The shape, and why there are two of them
 *
 * `Config.duel` is the site default. `Config.duelPages` is a sparse map of
 * *partial* overrides keyed by page, so a page says only what it disagrees
 * with — `resolveDuel` merges one onto the other. Sparse and partial on
 * purpose: a full copy per page would mean seventeen places to update when the
 * site default changes, and sixteen of them would silently go stale.
 */
import type { FighterStyle } from "../fx/fighters";
import { DUEL_POOLS, FIGHTERS } from "../fx/fighters";
import type { PageId } from "./pageIds";
import { PATHS } from "./pageIds";

/** The four pacing multipliers. Every default is 1, and 1 is arithmetic identity. */
export interface DuelTuning {
  circling: number;
  rest: number;
  impact: number;
  patience: number;
}

export interface DuelSettings {
  /**
   * A pinned pairing, or null to roll from the pool on every match.
   *
   * Stored as two ids rather than as a "pinned" flag plus two ids, so the two
   * cannot disagree. A pin survives match resets because `DuelState.pool` goes
   * null, which is the same mechanism `createDuel` has always used.
   */
  pin: [FighterStyle, FighterStyle] | null;
  /**
   * Which fighters may be rolled, per side. **Null means the whole side**, and
   * that is not the same as listing all twelve: a null keeps up with the roster
   * automatically, where a full list silently stops including anything added
   * after it was written — which is precisely how four of the original eight
   * costumes became unreachable.
   */
  good: FighterStyle[] | null;
  evil: FighterStyle[] | null;
  /** The pacing knobs. See `DUEL_TUNING` for what each one moves. */
  tuning: DuelTuning;
  /**
   * Half the carve's width in world units. **0 switches the carve off**, which
   * puts the fighters back to the flat wire look the client rejected by name —
   * it is kept because it is the rollback and the right value over an image,
   * not because it is an aesthetic option.
   */
  rim: number;
  /** Health bars. Right in the ornament slot, wrong behind body copy. */
  bars: boolean;
  /** Whether a contact may displace the frame. */
  kick: boolean;
  /** Figure size multiplier in the ornament slot, 0.6–1.6. */
  zoom: number;
}

/**
 * The defaults, and **every one of them is what the site does today**.
 *
 * That is the same rule `DUEL_TUNING` has: this field changes nothing until
 * somebody sets it, so shipping it cannot move a single frame of the fight, and
 * the 360,000-frame and 280,000-sequence gates keep passing unchanged. A
 * default that merely *looked* neutral would move every duel gate at once.
 */
export const DEFAULT_DUEL_TUNING: DuelTuning = {
  circling: 1,
  rest: 1,
  impact: 1,
  patience: 1,
};

export const DEFAULT_DUEL_SETTINGS: DuelSettings = {
  pin: null,
  good: null,
  evil: null,
  tuning: { ...DEFAULT_DUEL_TUNING },
  // `DEFAULT_RIM` in duel.ts. Deliberately not imported: this module is read
  // during the first render and importing the engine to learn one number would
  // pull the whole simulation into that path. The gate asserts they agree.
  rim: 1.7,
  bars: true,
  kick: true,
  zoom: 1,
};

/** Per-page overrides. Sparse, and each entry is partial. */
export type DuelPageSettings = Partial<Record<PageId, Partial<DuelSettings>>>;

/** Every knob's band, so the UI, the validator and the gate cannot disagree. */
export const DUEL_BANDS = {
  circling: [0, 3],
  rest: [0, 4],
  impact: [0, 6],
  patience: [0.2, 3],
  rim: [0, 4],
  zoom: [0.6, 1.6],
} as const;

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

function style(v: unknown): FighterStyle | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FIGHTERS, v)
    ? (v as FighterStyle)
    : null;
}

/**
 * Validate a published payload field by field. **Refuses, never repairs.**
 *
 * The same rule the setup-code decoder follows and for the same reason: a
 * half-accepted duel setting is one a visitor sees and the operator cannot
 * account for. Anything wrong falls back to the default for that field alone,
 * so one bad number cannot take the whole duel down with it.
 */
export function validDuelSettings(raw: unknown): DuelSettings {
  const out: DuelSettings = {
    ...DEFAULT_DUEL_SETTINGS,
    tuning: { ...DEFAULT_DUEL_TUNING },
  };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.pin) && r.pin.length === 2) {
    const a = style(r.pin[0]);
    const b = style(r.pin[1]);
    // Both halves or neither. A pin naming one live fighter and one that was
    // withdrawn is not half a pin, it is a fight with one side missing.
    if (a && b) out.pin = [a, b];
  }

  for (const side of ["good", "evil"] as const) {
    const v = r[side];
    if (!Array.isArray(v)) continue;
    const ids = v.map(style).filter((s): s is FighterStyle => s !== null);
    const ofSide = ids.filter((s) => FIGHTERS[s].side === side);
    // An empty allow-list is refused rather than honoured: it would mean "no
    // fighter may appear on this side", and the honest rendering of that is
    // nothing at all. Null — the whole side — is the safe reading.
    if (ofSide.length > 0) out[side] = Array.from(new Set(ofSide));
  }

  const t = r.tuning;
  if (t && typeof t === "object") {
    const tr = t as Record<string, unknown>;
    for (const k of ["circling", "rest", "impact", "patience"] as const) {
      const [lo, hi] = DUEL_BANDS[k];
      const v = num(tr[k], lo, hi);
      if (v !== null) out.tuning[k] = v;
    }
  }

  const rim = num(r.rim, ...DUEL_BANDS.rim);
  if (rim !== null) out.rim = rim;
  const zoom = num(r.zoom, ...DUEL_BANDS.zoom);
  if (zoom !== null) out.zoom = zoom;
  if (typeof r.bars === "boolean") out.bars = r.bars;
  if (typeof r.kick === "boolean") out.kick = r.kick;
  return out;
}

/** Validate the sparse per-page map. An unknown page id is dropped, not kept. */
export function validDuelPages(raw: unknown): DuelPageSettings {
  const out: DuelPageSettings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(PATHS, k)) continue;
    if (!v || typeof v !== "object") continue;
    /*
     * Validated as a whole and then narrowed back down to the keys that were
     * actually present. Running the full validator gives every field the same
     * refusal rules for free; keeping only the present keys is what makes the
     * override *partial*, so a page that says nothing about `zoom` keeps
     * tracking the site default rather than freezing today's value.
     */
    const full = validDuelSettings(v);
    const partial: Partial<DuelSettings> = {};
    for (const key of Object.keys(v as object)) {
      if (key in full) (partial as Record<string, unknown>)[key] = full[key as keyof DuelSettings];
    }
    if (Object.keys(partial).length > 0) out[k as PageId] = partial;
  }
  return out;
}

/** The settings in force on one page: the site default, with its override on top. */
export function resolveDuel(
  site: DuelSettings,
  pages: DuelPageSettings,
  page: PageId,
): DuelSettings {
  const over = pages[page];
  if (!over) return site;
  return { ...site, ...over, tuning: { ...site.tuning, ...(over.tuning ?? {}) } };
}

/**
 * The allow-lists as the roster actually understands them: intersected with the
 * pool and **never empty**.
 *
 * A restriction that excludes everything is a restriction nobody meant, and the
 * honest fallback is the unrestricted side — an ornament that draws no fighter
 * is indistinguishable from a broken page, which is the same reasoning that
 * keeps "None" out of `ROLLABLE_ORNAMENTS`.
 */
export function allowFor(s: DuelSettings, pool: "duel" | "duelholy") {
  const { good, evil } = DUEL_POOLS[pool];
  const pick = (list: FighterStyle[] | null, all: FighterStyle[]) => {
    if (!list) return all;
    const kept = all.filter((id) => list.includes(id));
    return kept.length > 0 ? kept : all;
  };
  return { good: pick(s.good, good), evil: pick(s.evil, evil) };
}
