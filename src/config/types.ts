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
  /** Has the operator door ever been opened. Sticky once true. */
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
  unlocked: false,
};
