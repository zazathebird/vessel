import type { FxId, LayoutId, ModeId, ScopeId } from "../data/catalog";
import type { OrnamentId } from "../data/ornaments";
import { DEFAULT_ORNAMENT } from "../data/ornaments";
import type { PageId } from "../data/pageIds";

export type Scopes = Record<ScopeId, boolean>;

/**
 * Everything the operator can set. This is exactly the slice that persists —
 * transient UI state (panel, door, toast, screensaver, dive) lives in the
 * component tree and is deliberately never written to storage.
 */
export interface Config {
  page: PageId;
  /** Index into PALETTES. */
  pal: number;
  layout: LayoutId;
  fx: FxId;
  /** Which hero ornament is drawn. */
  ornament: OrnamentId;
  /** Index into TYPESETS. */
  type: number;
  mode: ModeId;
  scope: Scopes;
  calm: boolean;
  grain: boolean;
  breathe: boolean;
  cursor: boolean;
  /**
   * Interface feedback sounds (`src/audio/engine.ts`). **Off by default and
   * off in calm**, and the second of the two settings a visitor can set for
   * themselves — see `loadConfig`'s note on why those two are stored and
   * nothing else is.
   *
   * Nothing plays without a gesture: every voice is fired by an interaction,
   * so a published `sound: true` still makes no noise until the visitor
   * touches something. That is autoplay policy satisfied by construction, and
   * it is also simply good manners.
   */
  sound: boolean;
  /**
   * Show the tile slot captions ("4:5 · photo slot", "video · muted loop").
   *
   * **Off, and off is the point** (client, 2026-08-14: "the labels for photos
   * and vids… remove em. they can see its a pic. they dont need to see photo
   * slot. video slot. JUST show the damn photo"). They were production notes —
   * aspect ratios and slot types — printed on the page for a visitor who did
   * not commission the layout and cannot change it.
   *
   * Kept as a setting rather than deleted because the captions are genuinely
   * useful to the operator while the real photographs are still going in: they
   * say what each slot is *for*. Operator-only, like every other appearance
   * control, so a visitor never sees them.
   */
  slots: boolean;
  /**
   * Has the operator door been opened in this session. Not persisted and not
   * published, so it is false again after every reload — `loadConfig` reads the
   * published config only, and `unlocked` is not one of its keys. Nothing is
   * gated on it: the door and the panel check `is_operator` instead.
   */
  unlocked: boolean;
}

export const DEFAULT_CONFIG: Config = {
  page: "home",
  pal: 0, // Nebula Drift — what a stranger gets on a first visit
  layout: "cinematic",
  fx: "vessels",
  ornament: DEFAULT_ORNAMENT,
  type: 0,
  mode: "tod",
  scope: { pal: true, layout: true, fx: true, ornament: true, type: true, toggles: true },
  calm: false,
  grain: true,
  breathe: true,
  cursor: true,
  sound: false, // a site that makes noise uninvited is a site people leave
  slots: false, // production notes are for the operator, not the visitor

  unlocked: false,
};
