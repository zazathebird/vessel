import { FX, LAYOUTS, TYPESETS } from "./catalog";
import type { FxId, LayoutId } from "./catalog";
import { ORNAMENTS } from "./ornaments";
import type { OrnamentId } from "./ornaments";
import { PALETTES } from "./palettes";
import { PATHS } from "./pageIds";
import type { PageId } from "./pageIds";
import { STATIONS } from "./stations";
import type { StationId } from "./stations";

/**
 * Per-page appearance (2026-09-02, agreed 2026-08-27 — client: every dial on
 * all seventeen pages, set from the admin panel).
 *
 * A `PageLook` is the appearance slice of `Config`, every field optional: a
 * page names only the dials it disagrees with and keeps tracking the site for
 * the rest — the same "partial is load-bearing" rule `duelPages` records,
 * because seventeen full copies means sixteen silently going stale the next
 * time the site default moves.
 *
 * What is deliberately NOT here: `calm` and `sound` (the two settings a
 * visitor owns), `mode` and `scope` (the randomiser is the site's behaviour,
 * not a page's), `duel`/`duelPages` (they have their own per-page map), and
 * `page`/`unlocked` (routing and session state). The test for adding a field
 * is "is this a dial of the page's look" — not "is it in `Config`".
 */
export interface PageLook {
  pal?: number;
  layout?: LayoutId;
  fx?: FxId;
  ornament?: OrnamentId;
  type?: number;
  station?: StationId;
  grain?: boolean;
  breathe?: boolean;
  cursor?: boolean;
  slots?: boolean;
  entrances?: boolean;
}

/** Sparse: a page missing from the map follows the site entirely. */
export type PageLooks = Partial<Record<PageId, PageLook>>;

/** Every dial a page may override — the panel and the gates both read this. */
export const LOOK_KEYS = [
  "pal",
  "layout",
  "fx",
  "ornament",
  "type",
  "station",
  "grain",
  "breathe",
  "cursor",
  "slots",
  "entrances",
] as const;

const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
// FX and ORNAMENTS, not the PICKABLE lists: this validates a *stored* value,
// and a hidden entry is unlisted, not invalid — the same rule every other
// resolver follows.
const FX_IDS = FX.map((f) => f.id);
const ORNAMENT_IDS = ORNAMENTS.map((o) => o.id);
const STATION_IDS = STATIONS.map((s) => s.id);

const isIndex = (value: unknown, length: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value);

/**
 * Validate a published or stored per-page look map. **A refused key is
 * DROPPED, never kept at a default** — the `validDuelPages` doctrine, and for
 * the same reason: an override pinned to the default is a *working* override
 * that shadows whatever the site later says, which is precisely what a refusal
 * must not become. The test is identity with what came in: a field either
 * survives exactly as sent or is absent.
 *
 * Unknown page keys are dropped (a page that no longer exists must not carry a
 * ghost override), and an override left empty by refusals is dropped whole —
 * `{}` and absence must mean the same thing, or the panel's "this page
 * overrides N dials" count lies.
 */
export function validLookPages(value: unknown): PageLooks {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: PageLooks = {};
  for (const [pageKey, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(pageKey in PATHS)) continue;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const source = raw as Record<string, unknown>;
    const look: PageLook = {};
    if (isIndex(source.pal, PALETTES.length)) look.pal = source.pal;
    if (isOneOf(source.layout, LAYOUT_IDS)) look.layout = source.layout;
    if (isOneOf(source.fx, FX_IDS)) look.fx = source.fx;
    if (isOneOf(source.ornament, ORNAMENT_IDS)) look.ornament = source.ornament;
    if (isIndex(source.type, TYPESETS.length)) look.type = source.type;
    if (isOneOf(source.station, STATION_IDS)) look.station = source.station;
    if (typeof source.grain === "boolean") look.grain = source.grain;
    if (typeof source.breathe === "boolean") look.breathe = source.breathe;
    if (typeof source.cursor === "boolean") look.cursor = source.cursor;
    if (typeof source.slots === "boolean") look.slots = source.slots;
    if (typeof source.entrances === "boolean") look.entrances = source.entrances;
    if (Object.keys(look).length > 0) out[pageKey as PageId] = look;
  }
  return out;
}
