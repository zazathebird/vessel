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
   *
   * **No entry carries it today** (the duels were re-listed 2026-08-14), so
   * `PICKABLE_FX` currently equals `FX`. Keep the flag and keep the two lists
   * distinct anyway: this is the mechanism for withdrawing an effect without
   * moving anyone's share code, and collapsing them back into one array is
   * exactly the "tidy-up" that would force the next withdrawal to delete an
   * index instead of flagging it.
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
   * The two lightsword duels hold indices 12 and 13, and are **listed again**
   * as of 2026-08-14 (client's call, taken on the graphics).
   *
   * They are *present* in the array — and were, even while hidden — because the
   * array is a wire format and the comment they replace promised them exactly
   * these two indices. Appending `scan` and `telemetry` to an eleven-entry array
   * would have taken 12 and 13 and broken that promise, or worse, been "fixed"
   * later by inserting the duels ahead of them and silently repointing every
   * share code minted in between.
   *
   * What un-hiding actually exposes is small, and that is why it was safe: every
   * surface reading `PICKABLE_FX` — the siteconfig panel, the command palette's
   * appearance block, the shuffle — is operator-gated. No visitor gains an
   * effect here; the operator gains two entries in their own menu, and a visitor
   * sees a duel only if the operator publishes one.
   */
  { id: "duel", label: "Lightswords: light & dark" },
  { id: "duelholy", label: "Lightswords: saint & serpent" },

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
  /**
   * The three tokens that are not a family name. All optional; `theme.ts`
   * supplies the defaults, so a typeset that wants the ordinary treatment says
   * nothing. They exist because a variable font with one weight is a static
   * font that costs more, and because five typesets differing only in family
   * still read as one typeset — see `src/styles/fonts.css`, which is the only
   * place they land.
   */
  /** `font-weight` on the hero h1. Beats the user-agent's `bold`. */
  displayWeight?: number;
  /** `font-weight` inherited into body copy. */
  bodyWeight?: number;
  /** `letter-spacing` inherited into body copy. Never reaches the h1. */
  tracking?: string;
}

/**
 * The five typesets.
 *
 * ## The defect this shape exists to fix
 *
 * These were the prototype's stacks until 2026-08-14, and they were written
 * macOS-first. On Windows — where the client is — three of the five collapsed
 * onto **Arial**:
 *
 *  - `grotesk`: `ui-sans-serif` is weak on Windows and `Helvetica Neue`/
 *    `Helvetica` are not installed, so the stack fell to `Arial`.
 *  - `mixed` body: the same stack, so also `Arial`.
 *  - `condensed`: `Avenir Next Condensed` is macOS-only and `Helvetica Neue`
 *    absent, so it fell to `Impact` — or past it, to `Arial`.
 *
 * The client's report was "a lot of the fonts are the same, the typical, basic
 * font", and that is exactly what the catalogue was doing.
 *
 * ## What replaced them
 *
 * Six self-hosted latin-subset variable woff2 files (`public/fonts/`, declared
 * in `src/styles/fonts.css`, ledgered in `docs/FONTS.md`), after the client
 * lifted SPEC.md's no-webfonts rule. Each stack is **webfont first, then a
 * platform-picked system fallback** — the fallback is not decoration. It is what
 * renders during `font-display: swap`, and what renders permanently if a woff2
 * ever 404s, so it has to be distinct across the five on its own merits. Those
 * fallbacks are Windows-first for the same reason the original stacks were
 * wrong, and every family named in them ships with the OS it is there for:
 * Segoe UI / Sitka / Constantia / Cambria / Candara / Consolas / Bahnschrift on
 * Windows, the `ui-*` generics plus Iowan Old Style / Optima / Avenir Next
 * Condensed on macOS, Cantarell / Noto / DejaVu / Liberation on Linux.
 *
 * `Impact` survives in `condensed`'s **display** stack only, as the last resort
 * before the generic. It is deliberately absent from the body stack: it is a
 * poster face and is unreadable at 15px, and the old catalogue had it in both.
 *
 * The array's order and length are a share-code wire format — `shareCode.ts`
 * encodes the typeset as this array's index. Fields may be added to an entry;
 * entries may not be reordered, inserted or removed.
 */
export const TYPESETS: TypeSet[] = [
  // Index 0, and so `DEFAULT_CONFIG.type` — what a stranger gets on a first
  // visit. Space Grotesk throughout: the same family at 700 over 400, which is
  // what "Grotesk" should mean, and its angled terminals and single-storey `a`
  // keep it from reading as another neutral UI sans.
  {
    id: "grotesk",
    label: "Grotesk",
    display:
      "'Space Grotesk','Segoe UI Variable Display','Segoe UI',ui-sans-serif,system-ui,Cantarell,'Noto Sans','Liberation Sans',sans-serif",
    body:
      "'Space Grotesk','Segoe UI Variable Text','Segoe UI',ui-sans-serif,system-ui,Cantarell,'Noto Sans','Liberation Sans',sans-serif",
    mono:
      "'JetBrains Mono',Consolas,ui-monospace,SFMono-Regular,Menlo,'Liberation Mono',monospace",
    displayWeight: 700,
  },

  // High-contrast display serif over a screen-reading text serif. Playfair is
  // the fanciest thing on the site and is display-only on purpose — its
  // hairlines disappear at body sizes, which is what Literata is for.
  {
    id: "editorial",
    label: "Editorial",
    display:
      "'Playfair Display','Sitka Banner','Sitka Display',ui-serif,'New York',Didot,Constantia,'Noto Serif',Georgia,serif",
    body:
      "Literata,Constantia,'Iowan Old Style',Charter,'Noto Serif','Liberation Serif',Georgia,serif",
    mono:
      "'JetBrains Mono','Lucida Console','PT Mono',Monaco,'Nimbus Mono PS','Liberation Mono',monospace",
    // 500, not 700. Bold Playfair fills its own counters at 90px.
    displayWeight: 500,
  },

  // Serif head over a geometric sans body. Literata does the display duty here
  // that it does not do in `editorial`, so the two serif typesets never show
  // the same face in the same role.
  {
    id: "mixed",
    label: "Serif + mono",
    display:
      "Literata,Cambria,'Palatino Linotype',Palatino,'Iowan Old Style','URW Palladio L','DejaVu Serif',Georgia,serif",
    body: "Sora,Candara,Optima,'Avenir Next','DejaVu Sans','Noto Sans',sans-serif",
    mono: "'JetBrains Mono',Consolas,'Andale Mono',Monaco,'DejaVu Sans Mono',monospace",
    displayWeight: 600,
    // Sora sets tight. A hair of tracking stops body copy closing up at 15px.
    tracking: "0.005em",
  },

  {
    id: "allmono",
    label: "All mono",
    display:
      "'JetBrains Mono','Cascadia Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace",
    body:
      "'JetBrains Mono','Cascadia Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace",
    mono:
      "'JetBrains Mono','Cascadia Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace",
    displayWeight: 700,
    // Monospaced advance widths already put air between glyphs; at paragraph
    // length that reads as loose, so this pulls back rather than adds.
    tracking: "-0.012em",
  },

  {
    id: "condensed",
    label: "Condensed",
    display:
      "Oswald,Bahnschrift,'Avenir Next Condensed','Liberation Sans Narrow','DejaVu Sans Condensed','Noto Sans Display',Impact,sans-serif",
    body:
      "Oswald,Bahnschrift,'Avenir Next Condensed','Liberation Sans Narrow','DejaVu Sans Condensed',sans-serif",
    mono: "'JetBrains Mono',Consolas,ui-monospace,Menlo,'Liberation Mono',monospace",
    displayWeight: 600,
    // The two corrections a condensed face needs as body copy: narrow stems go
    // thin against a dark background, and narrow glyphs need the space back
    // between them that they lost inside them.
    bodyWeight: 500,
    tracking: "0.02em",
  },
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
