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
 * **Calm is the one exception, and it is read back from storage.** The calm
 * toggle sits in the header for everyone, and CLAUDE.md names it the
 * accessibility escape hatch for the deliberately low-contrast palettes. A
 * visitor who needs it and does not carry OS-level reduced-motion should not
 * have to find the button again on every visit — an accessibility preference
 * is precisely "theirs to remember". Everything else stays published-only.
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
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONFIG };
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

function storedCalm(): boolean | null {
  try {
    const raw = localStorage.getItem(CALM_KEY);
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
