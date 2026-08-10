import type { FxId, LayoutId, ModeId, ScopeId } from "../data/catalog";
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
  type: 0,
  mode: "tod",
  scope: { pal: true, layout: true, fx: true, type: true, toggles: true },
  calm: false,
  grain: true,
  breathe: true,
  cursor: true,
  unlocked: false,
};
