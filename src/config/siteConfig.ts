import type { Config } from "./types";

/**
 * The published look, as the Worker inlined it into the page.
 *
 * `worker/site-config.ts` writes `window.__VESSEL_SITE__` into the app shell's
 * `<head>` before the bundle loads, so this is readable synchronously during
 * the very first render. That timing is the entire reason it is not a fetch:
 * `ConfigContext` builds its initial state during that render specifically so
 * there is no flash of the default palette, and a fetch would put a 0.9s bleed
 * from Nebula Drift to the real palette on every cold load.
 *
 * Nothing here is trusted. The object is validated field by field by
 * `loadConfig`, exactly as stored config always has been — a published layout
 * id that no longer exists would otherwise render an unstyled page for every
 * visitor at once, which is a considerably worse version of the same bug.
 *
 * Absent, malformed or empty, this returns null and the site renders its
 * built-in defaults: the site precisely as it was before any of this existed.
 */
export function publishedConfig(): Partial<Config> | null {
  if (typeof window === "undefined") return null;
  const raw = (window as { __VESSEL_SITE__?: unknown }).__VESSEL_SITE__;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  return raw as Partial<Config>;
}

/**
 * The fields an operator publishes. `page` is per-visit, and `unlocked` is
 * per-session — omitting it here is what makes it false again on every reload.
 */
export const PUBLISHED_KEYS = [
  "pal",
  "layout",
  "fx",
  "ornament",
  "type",
  "mode",
  "scope",
  "calm",
  "grain",
  "breathe",
  "cursor",
] as const;

/** Narrow a full config down to the slice that gets published. */
export function publishable(config: Config): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLISHED_KEYS) out[key] = config[key];
  return out as Partial<Config>;
}
