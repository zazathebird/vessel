import { PALETTES } from "../data/palettes";
import { FX, LAYOUTS, MODES, TYPESETS } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PATHS } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { DEFAULT_CONFIG } from "./types";
import type { Config, Scopes } from "./types";
import { publishedConfig } from "./siteConfig";

export const STORAGE_KEY = "vessel.cfg.v2";
export const SAVE_DEBOUNCE_MS = 250;

/**
 * Read the config the site should render.
 *
 * **The source is the operator's published look, not this browser's storage.**
 * The palette, layout, effect, ornament and typeface are the site's appearance
 * rather than a visitor's preference, so they are set once by the operator and
 * served to everybody — see `worker/site-config.ts`. The config panel that
 * changes them is visible only when signed in as the operator, so a visitor has
 * no way to set these and nothing of theirs to remember.
 *
 * **Two fields are read back from storage, and the rule is what they have in
 * common: they are the settings a visitor can set for themselves.** Everything
 * else on the site is appearance, which belongs to the operator; these two are
 * about the visitor's own eyes and ears, so they follow the visitor rather than
 * the site.
 *
 * - **`calm`** — the accessibility escape hatch for the deliberately
 *   low-contrast palettes. A visitor who needs it and does not carry OS-level
 *   reduced-motion should not have to find the button again every visit.
 * - **`sound`** (2026-08-14) — the same argument, pointing the other way.
 *   Calm must survive because a visitor turned it *on*; sound must survive
 *   because a visitor turned it *off*. A site that makes noise again on every
 *   visit despite being told not to is worse than one that never made any.
 *
 * That is the whole list, and the test for adding to it is not "is this
 * useful to remember" but "can a visitor set this at all". Today exactly two
 * controls are public — the two chips in the header — and they are these.
 *
 * One consequence is worth stating plainly, because it is a feature: the
 * operator sees exactly what a visitor sees. Their unpublished fiddling lives
 * in React state and is gone on reload, so "it looks right on my machine" and
 * "it looks right" cannot come apart.
 *
 * Every field is still validated rather than trusted, and now it matters more:
 * a bad layout id used to render one unstyled page for one visitor, and would
 * now render it for all of them at once. A corrupt, partial or absent value
 * falls back per field and never throws.
 */
export function loadConfig(): Config {
  const raw: unknown = publishedConfig();
  if (typeof raw !== "object" || raw === null) {
    // Nothing published — but the visitor's own two settings are not the
    // operator's to lose. This branch used to return the bare defaults, which
    // meant calm silently stopped persisting whenever the injection was absent:
    // before the first publish, and — the case that matters — whenever D1 is
    // unreachable and `worker/site-config.ts` correctly injects nothing. The
    // accessibility escape hatch must not switch itself off in the degraded
    // case, which is precisely when someone is least able to go hunting for it.
    // Found 2026-08-14 while adding `sound`, which had inherited the same bug.
    return {
      ...DEFAULT_CONFIG,
      calm: storedCalm() ?? DEFAULT_CONFIG.calm,
      sound: storedSound() ?? DEFAULT_CONFIG.sound,
      slots: DEFAULT_CONFIG.slots,
    };
  }
  const saved = raw as Partial<Record<keyof Config, unknown>>;

  const index = (value: unknown, length: number, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length
      ? value
      : fallback;

  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;

  const bool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

  const scope: Scopes = { ...DEFAULT_CONFIG.scope };
  if (typeof saved.scope === "object" && saved.scope !== null) {
    for (const key of Object.keys(scope) as (keyof Scopes)[]) {
      scope[key] = bool((saved.scope as Record<string, unknown>)[key], scope[key]);
    }
  }

  return {
    page: oneOf(saved.page, Object.keys(PATHS) as PageId[], DEFAULT_CONFIG.page),
    pal: index(saved.pal, PALETTES.length, DEFAULT_CONFIG.pal),
    layout: oneOf(saved.layout, LAYOUTS.map((l) => l.id), DEFAULT_CONFIG.layout),
    fx: oneOf(saved.fx, FX.map((f) => f.id), DEFAULT_CONFIG.fx),
    ornament: oneOf(saved.ornament, ORNAMENTS.map((o) => o.id), DEFAULT_CONFIG.ornament),
    type: index(saved.type, TYPESETS.length, DEFAULT_CONFIG.type),
    mode: oneOf(saved.mode, MODES.map((m) => m.id), DEFAULT_CONFIG.mode),
    scope,
    calm: storedCalm() ?? bool(saved.calm, DEFAULT_CONFIG.calm),
    grain: bool(saved.grain, DEFAULT_CONFIG.grain),
    breathe: bool(saved.breathe, DEFAULT_CONFIG.breathe),
    cursor: bool(saved.cursor, DEFAULT_CONFIG.cursor),
    sound: storedSound() ?? bool(saved.sound, DEFAULT_CONFIG.sound),
    // Appearance, so published-only: it is the operator's note to themselves,
    // not a preference a visitor can express.
    slots: bool(saved.slots, DEFAULT_CONFIG.slots),
    // Appearance too — the entrance motion belongs to the published look, and
    // a visitor who wants stillness has calm, which strips entrances with
    // everything else.
    entrances: bool(saved.entrances, DEFAULT_CONFIG.entrances),
    unlocked: bool(saved.unlocked, DEFAULT_CONFIG.unlocked),
  };
}

/**
 * Calm's own key, deliberately not `STORAGE_KEY`: `saveConfig` echoes the whole
 * config on every change, so reading calm back from there would freeze it at
 * whatever was *published* on the first visit, expressed preference or not.
 * This key is written only by `saveCalmPreference`, which only the calm
 * toggles call — absent means no preference was ever expressed.
 */
const CALM_KEY = "vessel.calm.v1";

/** Record a deliberate calm toggle. Either direction is a preference: on is
 * the visitor's accessibility need, off is their choice to leave a
 * calm-published site. */
export function saveCalmPreference(calm: boolean): void {
  try {
    localStorage.setItem(CALM_KEY, calm ? "1" : "0");
  } catch {
    // Storage full or unavailable. The toggle still works for this visit.
  }
}

/**
 * The first-visit greeting's own flag (client request, 2026-08-14).
 *
 * Its own key, like calm's and sound's, and for the same reason: `saveConfig`
 * echoes the whole config, so anything read back from there would be pinned to
 * whatever was published on the first visit. Written only when the greeting is
 * *dismissed* — a visitor who closes the tab during the 1.2s wait has not been
 * greeted and should be next time.
 *
 * Nothing about the visitor is recorded here beyond "has seen it once". §9's
 * inventory is unaffected: this never leaves the browser.
 */
const GREETED_KEY = "vessel.greeted.v1";

export function hasBeenGreeted(): boolean {
  try {
    return localStorage.getItem(GREETED_KEY) === "1";
  } catch {
    // Storage unavailable — treat as greeted rather than showing a dialog on
    // every single page load, which is the worse failure of the two.
    return true;
  }
}

export function markGreeted(): void {
  try {
    localStorage.setItem(GREETED_KEY, "1");
  } catch {
    /* The greeting simply reappears next visit. Harmless. */
  }
}

/**
 * True when the visitor has never expressed a preference about either of the
 * two chrome switches.
 *
 * Drives the first-visit highlight on the header chips: the controls that
 * govern motion and sound should be findable *before* someone needs them, not
 * after. It goes quiet permanently the moment either is touched, in either
 * direction — expressing a preference is the whole condition, not choosing a
 * particular one.
 */
export function chromeUntouched(): boolean {
  return calmPreference() === null && soundPreference() === null;
}

/** The stored sound preference, or `null` when never expressed. */
export function soundPreference(): boolean | null {
  return storedSound();
}

/**
 * The stored calm preference, or `null` when the visitor has never expressed
 * one. Exported because `ConfigContext` needs to tell those apart: OS
 * reduced-motion should set the *default*, and an explicit press of the chip
 * should beat it — which is impossible to express without knowing whether a
 * preference exists at all.
 */
export function calmPreference(): boolean | null {
  return storedCalm();
}

function storedCalm(): boolean | null {
  try {
    const raw = localStorage.getItem(CALM_KEY);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

/**
 * Sound's own key, for the same reason calm has one: `saveConfig` echoes the
 * whole config, so reading it back from there would pin sound to whatever was
 * published on the first visit.
 *
 * Written only by the deliberate sound toggles — the header chip, the panel and
 * the command palette. Absent means no preference, which resolves to the
 * published value and, failing that, to off.
 */
const SOUND_KEY = "vessel.sound.v1";

/** Record a deliberate sound toggle. Off is the direction that matters most:
 * being told to be quiet is an instruction, not a session preference. */
export function saveSoundPreference(sound: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, sound ? "1" : "0");
  } catch {
    // Storage full or unavailable. The toggle still works for this visit.
  }
}

function storedSound(): boolean | null {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

/**
 * Still written, though `loadConfig` reads only `calm` back.
 *
 * Two reasons it is not simply deleted. `hasVisited` is keyed off this entry
 * and drives the rule that time-of-day must not override a first visit, so
 * removing the write would make every visit look like a first one. And an
 * operator mid-edit has somewhere to be restored from if publishing ever grows
 * a draft state. It is appearance only — no account data has ever been written
 * here, and none is now.
 */
export function saveConfig(config: Config): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage full or unavailable. The site works fine without persistence.
  }
}

/** True when this browser has been here before — drives time-of-day's first-visit rule. */
export function hasVisited(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
