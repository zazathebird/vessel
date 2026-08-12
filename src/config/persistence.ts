import { PALETTES } from "../data/palettes";
import { FX, LAYOUTS, MODES, TYPESETS } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PATHS } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { DEFAULT_CONFIG } from "./types";
import type { Config, Scopes } from "./types";

export const STORAGE_KEY = "vessel.cfg.v2";
export const SAVE_DEBOUNCE_MS = 250;

/**
 * Read persisted config. A corrupt, partial, or absent value must fall back to
 * defaults and never throw — storage can also throw on access alone (Safari
 * private mode, disabled cookies), so the read itself is guarded too.
 *
 * Every field is validated rather than trusted: a stored layout id that no
 * longer exists would otherwise render an unstyled page forever.
 */
export function loadConfig(): Config {
  let raw: unknown = null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_CONFIG };
    raw = JSON.parse(stored);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
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
    calm: bool(saved.calm, DEFAULT_CONFIG.calm),
    grain: bool(saved.grain, DEFAULT_CONFIG.grain),
    breathe: bool(saved.breathe, DEFAULT_CONFIG.breathe),
    cursor: bool(saved.cursor, DEFAULT_CONFIG.cursor),
    unlocked: bool(saved.unlocked, DEFAULT_CONFIG.unlocked),
  };
}

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
