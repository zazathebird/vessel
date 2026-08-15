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
 *
 * **`sound` is publishable, and the asymmetry is worth stating** (2026-08-14).
 * It sits here for the same reason `calm` does — it is a site setting the
 * operator owns, and the share code already carries it, so leaving it out would
 * mean a pasted code could do something publishing could not. But the two are
 * not equivalent in their failure mode: publishing `calm: true` makes the site
 * gentler for everyone, and publishing `sound: true` makes it louder for
 * everyone. Two things keep that honest, and both must stay true — **nothing
 * plays without a gesture** (there is no ambient bed and no timer in
 * `src/audio/engine.ts`), and **a visitor's stored preference always beats the
 * published value**, in `loadConfig`, permanently and in both directions.
 * Publishing it on is still the operator's call to make deliberately.
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
  "sound",
  "slots",
] as const;

/** Narrow a full config down to the slice that gets published. */
export function publishable(config: Config): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLISHED_KEYS) out[key] = config[key];
  return out as Partial<Config>;
}
