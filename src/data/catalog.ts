/**
 * Layouts, canvas effects, typography sets, randomiser modes and scopes.
 * Copied from the prototype (Site v2 - Vessel.dc.html:315-348).
 */

export type LayoutId =
  | "cinematic" | "magazine" | "deck" | "split" | "radial" | "sidescroll"
  | "terminal" | "mosaic" | "ledger" | "stack" | "marginalia" | "console" | "sheet";

export type FxId =
  | "vessels" | "flow" | "pressure" | "rain" | "stars" | "constellation"
  | "aurora" | "plasma" | "tunnel" | "bokeh" | "orbits" | "off";

export type TypeSetId = "grotesk" | "editorial" | "mixed" | "allmono" | "condensed";

export type ModeId = "static" | "tod" | "visit" | "page" | "manual";

export type ScopeId = "pal" | "layout" | "fx" | "type" | "toggles";

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
];

export const FX: { id: FxId; label: string }[] = [
  { id: "vessels", label: "Vessels" },
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
];

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
  { id: "type", label: "Type" },
  { id: "toggles", label: "Toggles" },
];
