/**
 * Layouts, canvas effects, typography sets, randomiser modes and scopes.
 * Copied from the prototype (Site v2 - Vessel.dc.html:315-348).
 */

export type LayoutId =
  | "cinematic" | "magazine" | "deck" | "split" | "radial" | "sidescroll"
  | "terminal" | "mosaic" | "ledger" | "stack" | "marginalia" | "console" | "sheet"
  | "hud";

export type FxId =
  | "vessels" | "flow" | "pressure" | "rain" | "stars" | "constellation"
  | "aurora" | "plasma" | "tunnel" | "bokeh" | "orbits" | "off"
  | "duel" | "duelholy"
  | "scan" | "telemetry";

export type TypeSetId = "grotesk" | "editorial" | "mixed" | "allmono" | "condensed";

export type ModeId = "static" | "tod" | "visit" | "page" | "manual";

export type ScopeId = "pal" | "layout" | "fx" | "ornament" | "type" | "toggles";

export const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "magazine", label: "Magazine" },
  { id: "deck", label: "Card deck" },
  { id: "split", label: "Split" },
  { id: "radial", label: "Radial orbit" },
  { id: "sidescroll", label: "Side-scroll" },
  { id: "terminal", label: "Terminal" },
  { id: "mosaic", label: "Mosaic" },
  { id: "ledger", label: "Ledger" },
  { id: "stack", label: "Stack" },
  { id: "marginalia", label: "Marginalia" },
  { id: "console", label: "Console" },
  { id: "sheet", label: "Contact sheet" },
  // Appended at index 13, never inserted: shareCode.ts encodes the layout as
  // this array's index, so anything placed ahead of an existing entry silently
  // repoints every code already in circulation.
  //
  // The fourteenth archetype, and the only one that is not a grid, a column or
  // a track — blocks sit on three z-planes and *overlap*, which is the one
  // thing none of the thirteen above can express. See `.layout-hud` in
  // layouts.css.
  { id: "hud", label: "HUD" },
];

export interface FxEntry {
  id: FxId;
  label: string;
  /**
   * Present in the array — and therefore holding its share-code index — but
   * kept out of the effect picker, the command palette and the shuffle. The
   * array is a wire format; the picker is a product decision, and the two
   * stopped being the same list when the duels were withdrawn.
   */
  hidden?: boolean;
}

export const FX: FxEntry[] = [
  // Label renamed from "Vessels" with the rest of the de-branding (2026-08-13,
  // client request); the id is a stored/share-code wire format and never changes.
  { id: "vessels", label: "Branches" },
  { id: "flow", label: "Flow" },
  { id: "pressure", label: "Pressure" },
  { id: "rain", label: "Matrix rain" },
  { id: "stars", label: "Warp stars" },
  { id: "constellation", label: "Constellation" },
  { id: "aurora", label: "Aurora" },
  { id: "plasma", label: "Plasma" },
  { id: "tunnel", label: "Grid tunnel" },
  { id: "bokeh", label: "Bokeh" },
  { id: "orbits", label: "Orbits" },
  { id: "off", label: "None" },

  /*
   * The two lightsword duels hold indices 12 and 13 and are **hidden**.
   *
   * The decision that withdrew them is unchanged: the renderer was rebuilt
   * 2026-08-13 to docs/DUEL.md and ships in the hero-ornament slot — the
   * client's original request — and the background versions return to the
   * picker only once the client's eye has passed the ornament. `hidden` is now
   * what enforces that, and lifting the flag is the whole of "re-list them".
   *
   * They are *present* in the array because the array is a wire format and the
   * comment they replace promised them exactly these two indices. Appending
   * `scan` and `telemetry` to an eleven-entry array would have taken 12 and 13
   * and broken that promise — or worse, been "fixed" later by inserting the
   * duels ahead of them, silently repointing every share code minted in
   * between.
   *
   * A hidden entry still decodes: a code carrying `C` or `D` applies the duel
   * it always applied. Only the surfaces that offer a choice skip them.
   */
  { id: "duel", label: "Lightswords: light & dark", hidden: true },
  { id: "duelholy", label: "Lightswords: saint & serpent", hidden: true },

  // Appended at 14 and 15 (`…-E-…`, `…-F-…`), never inserted — same rule.
  // Both are built for the HUD archetype; see src/fx/effects.ts.
  { id: "scan", label: "Sweep" },
  { id: "telemetry", label: "Telemetry" },
];

/**
 * The effects a person can actually pick, or be handed by the shuffle.
 *
 * Everything that offers the catalogue to a human reads this. Everything that
 * *resolves* a stored or shared value keeps reading `FX`, because a hidden
 * effect is unlisted, not invalid — persistence and share codes must go on
 * accepting one.
 */
export const PICKABLE_FX: FxEntry[] = FX.filter((effect) => !effect.hidden);

export interface TypeSet {
  id: TypeSetId;
  label: string;
  body: string;
  display: string;
  mono: string;
}

export const TYPESETS: TypeSet[] = [
  { id: "grotesk", label: "Grotesk", body: "ui-sans-serif,'Helvetica Neue',Helvetica,Arial,sans-serif", display: "ui-sans-serif,'Helvetica Neue',Helvetica,Arial,sans-serif", mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" },
  { id: "editorial", label: "Editorial", body: "Georgia,'Iowan Old Style','Times New Roman',serif", display: "Georgia,'Iowan Old Style','Times New Roman',serif", mono: "ui-monospace,SFMono-Regular,Menlo,monospace" },
  { id: "mixed", label: "Serif + mono", body: "ui-sans-serif,'Helvetica Neue',Arial,sans-serif", display: "Georgia,'Iowan Old Style',serif", mono: "ui-monospace,SFMono-Regular,Menlo,monospace" },
  { id: "allmono", label: "All mono", body: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", display: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", mono: "ui-monospace,SFMono-Regular,Menlo,monospace" },
  { id: "condensed", label: "Condensed", body: "'Avenir Next Condensed','Helvetica Neue',Impact,sans-serif", display: "'Avenir Next Condensed',Impact,'Helvetica Neue',sans-serif", mono: "ui-monospace,Menlo,monospace" },
];

export const MODES: { id: ModeId; label: string }[] = [
  { id: "static", label: "Static" },
  { id: "tod", label: "Time of day" },
  { id: "visit", label: "Per visit" },
  { id: "page", label: "Per page" },
  { id: "manual", label: "Shuffle only" },
];

export const SCOPES: { id: ScopeId; label: string }[] = [
  { id: "pal", label: "Palette" },
  { id: "layout", label: "Layout" },
  { id: "fx", label: "Effect" },
  { id: "ornament", label: "Ornament" },
  { id: "type", label: "Type" },
  { id: "toggles", label: "Toggles" },
];
