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
/*
 * **Frozen, because `DEFAULT_CONFIG.duel` hands this exact object out.**
 *
 * `types.ts` assigns `DEFAULT_DUEL_SETTINGS` by reference and
 * `persistence.ts`'s no-published-config branch spreads `DEFAULT_CONFIG`
 * shallowly — so the module-level object, and this `tuning` inside it, is the
 * one every un-published visitor's config points at. Nothing mutates either
 * today (the editor clones on every write, `resetSite` clones, and
 * `applyDuelTuning` assigns into `DUEL_TUNING`, a different object), so this is
 * latent rather than live. It is frozen anyway because the failure mode if it
 * ever stops being latent is the worst kind here: one visitor's edit silently
 * becoming the default every later visitor is handed, with nothing thrown and
 * nothing logged. Frozen, the same mistake is a `TypeError` on the line that
 * makes it — module code is strict, so the write throws rather than passing.
 */
export const DEFAULT_DUEL_TUNING: DuelTuning = Object.freeze({
  circling: 1,
  rest: 1,
  impact: 1,
  patience: 1,
});

export const DEFAULT_DUEL_SETTINGS: DuelSettings = Object.freeze({
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
});

/**
 * One page's disagreement with the site.
 *
 * **`tuning` is partial too, and that is not a detail** (2026-08-30). It was
 * `Partial<DuelSettings>`, whose `tuning` is the whole four-knob object — so
 * the editor, which writes `{ ...resolved.tuning, [key]: v }`, could not
 * express "this page disagrees about Patience" and instead wrote all four. The
 * merge below is a partial merge and did its job faithfully; there was simply
 * nothing partial left to merge. Reproduced in a signed-in browser: touching
 * Patience on `/work`, then moving the site's Circling from 1.00 to 2.50, left
 * `/work` reading 1.00 for ever, while the editor's own summary said *"work
 * sets 1 of its own: tuning"*.
 *
 * That is the failure this file's header says sparse-and-partial exists to
 * prevent — "sixteen of them would silently go stale" — arriving one level down,
 * inside the one field that is itself an object.
 */
export type DuelOverride = Omit<Partial<DuelSettings>, "tuning"> & {
  tuning?: Partial<DuelTuning>;
};

/** Per-page overrides. Sparse, and each entry is partial, tuning included. */
export type DuelPageSettings = Partial<Record<PageId, DuelOverride>>;

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
    /*
     * Both halves or neither. A pin naming one live fighter and one that was
     * withdrawn is not half a pin, it is a fight with one side missing.
     *
     * **And the two must be on opposite sides** (2026-08-31). Nothing checked
     * it, so a published `["ronin", "sentinel"]` was accepted and pinned a
     * good-versus-good match — which the blade carve-out cannot express (both
     * swords come out blue or green), which `duel: a pooled fight rotates its
     * fighters` asserts never happens, and which makes the fairness coin
     * meaningless because a viewer cannot tell which side is which. `pin`
     * bypasses `rollPairing` entirely, so it is the one route into the engine
     * that `ROSTER_GOOD` / `ROSTER_EVIL` do not already guard.
     *
     * Refused whole, like every other field here: half a pin is not a fight,
     * and silently swapping one fighter for a legal opponent would be the
     * repair this file exists not to do.
     */
    if (a && b && FIGHTERS[a].side !== FIGHTERS[b].side) out.pin = [a, b];
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

/**
 * Did this field survive validation *as itself*?
 *
 * `validDuelSettings` answers a refusal by leaving the field at the global
 * default, and from the outside a refused field and a field that legitimately
 * equals the default are indistinguishable — which is fine for the site object
 * and is the whole bug for an override. So the test is identity with what came
 * in, not with what came out. A partly-salvaged list counts as refused: an
 * allow-list of `["sentinel", "nonsense"]` is not a shorter allow-list, it is a
 * list the sender got wrong, and quietly honouring the half of it that parsed
 * is the repair this file promises not to do.
 */
function sameSetting(
  key: Exclude<keyof DuelSettings, "tuning">,
  given: unknown,
  validated: DuelSettings[Exclude<keyof DuelSettings, "tuning">],
): boolean {
  if (key === "pin") {
    return (
      Array.isArray(given) &&
      Array.isArray(validated) &&
      given.length === 2 &&
      given[0] === validated[0] &&
      given[1] === validated[1]
    );
  }
  if (key === "good" || key === "evil") {
    return (
      Array.isArray(given) &&
      Array.isArray(validated) &&
      given.length === validated.length &&
      given.every((x, i) => x === validated[i])
    );
  }
  return given === validated;
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
     *
     * **A key whose value was refused is dropped, not kept at the default** —
     * which is what "refuses, never repairs" has to mean here and did not.
     * `validDuelSettings` answers a refusal by leaving the field at the global
     * default, which is the right answer for the site-wide object and precisely
     * the wrong one for an override: keeping the key promoted rubbish into a
     * *working* override pinned to 1, shadowing whatever the site actually
     * said. `{ work: { zoom: 99 } }` became `{ work: { zoom: 1 } }`, so a site
     * at 1.4 rendered `/work` at 1.0 and nothing anywhere reported a refusal.
     * `{ work: { good: [] } }` was worse: an emptying allow-list is refused,
     * and the refusal became an explicit `good: null` that cancelled the site's
     * roster restriction on that page.
     *
     * Dropping the key is the honest reading — the page simply follows the
     * site, which is what a page that has said nothing valid has done.
     */
    const full = validDuelSettings(v);
    const given = v as Record<string, unknown>;
    const partial: DuelOverride = {};
    for (const key of Object.keys(given)) {
      if (!(key in full)) continue;
      if (key === "tuning") continue;
      const k2 = key as Exclude<keyof DuelSettings, "tuning">;
      // Refused ⇒ the validator handed back the default. Keep the key only when
      // what came in survived validation as itself.
      if (!sameSetting(k2, given[key], full[k2])) continue;
      (partial as Record<string, unknown>)[key] = full[k2];
    }
    /*
     * `tuning` is narrowed the same way one level further down, so a page may
     * disagree about Patience alone and keep tracking the site on the other
     * three. Written whole, it froze all four — see `DuelOverride`.
     */
    const tGiven = given.tuning;
    if (tGiven && typeof tGiven === "object") {
      const tuning: Partial<DuelTuning> = {};
      for (const key of Object.keys(tGiven as object)) {
        if (!(key in full.tuning)) continue;
        const k2 = key as keyof DuelTuning;
        const [lo, hi] = DUEL_BANDS[k2];
        if (num((tGiven as Record<string, unknown>)[key], lo, hi) === null) continue;
        tuning[k2] = full.tuning[k2];
      }
      if (Object.keys(tuning).length > 0) partial.tuning = tuning;
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
