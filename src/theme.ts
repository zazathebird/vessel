import type { CSSProperties } from "react";

import { LOW_CONTRAST, PALETTES } from "./data/palettes";
import { TYPESETS } from "./data/catalog";
import type { LayoutId } from "./data/catalog";
import { BAND_TOKENS } from "./config/bands";
import type { Band } from "./config/bands";
import type { Config } from "./config/types";

/**
 * The token layer: palette + typeface + layout + band + calm collapse into one
 * set of CSS custom properties on a single wrapper element. Everything below
 * reads tokens only, so a palette change is a variable swap rather than a
 * re-render of styles — which is what makes the .9s palette bleed work.
 */

const DEFAULT_RADIUS = "16px";
const CALM_RADIUS = "6px";

/** Layouts that override the corner radius. Borderless row layouts go square. */
const LAYOUT_RADIUS: Partial<Record<LayoutId, string>> = {
  magazine: "2px",
  terminal: "2px",
  console: "3px",
  ledger: "0px",
  marginalia: "0px",
  stack: "0px",
  // The HUD's corners are cut, not rounded — the chamfer is a clip-path in
  // layouts.css and a radius under it would fight the polygon.
  hud: "0px",
};

/**
 * Layouts that set their own display size, overriding the per-band value.
 *
 * Magazine's minimum is the spec's `46px`, not the prototype's `40px` — see
 * CLAUDE.md § "Known deviations from the prototype".
 */
const LAYOUT_H1: Partial<Record<LayoutId, string>> = {
  magazine: "clamp(46px, 7.6vw, 104px)",
  sidescroll: "clamp(34px, 5vw, 68px)",
  ledger: "clamp(30px, 4vw, 52px)",
  console: "clamp(30px, 4vw, 52px)",
  marginalia: "clamp(32px, 4.4vw, 60px)",
  // Smaller than the baseline: the HUD's subject is the panel field, and a 90px
  // headline over it turns the panels into a caption for the title.
  hud: "clamp(30px, 4.2vw, 58px)",
};

/**
 * Panel translucency and elevation.
 *
 * `--panel` is how much of `--surface` survives in a card's background; the
 * rest is transparent, and `backdrop-filter` turns whatever the canvas is
 * doing behind it into diffused light. It was a literal `70%` inside
 * `.v-block`, which meant every layout wanting something else had to restate
 * the whole background — the same reason `--radius` is a token and not a
 * literal.
 *
 * `--elev` is a unitless multiplier on the drop shadow, so a layout can say
 * "nearer" without knowing the shadow's geometry. Mosaic drives it per span.
 *
 * Two floors, both load-bearing:
 *
 *  - **Calm goes nearly opaque.** Calm also hides the canvas, so there is
 *    nothing left to see through the glass, and a translucent panel with no
 *    backdrop is just a weaker edge — on exactly the palettes calm exists for.
 *  - **The low-contrast palettes go opaque too.** On Peat, `--surface` and
 *    `--bg` are about four points of luminance apart. Halve that difference
 *    and the panel edge stops existing.
 */
const DEFAULT_PANEL = 58;
const CALM_PANEL = 92;
const LOW_CONTRAST_PANEL = 80;

const LAYOUT_PANEL: Partial<Record<LayoutId, number>> = {
  deck: 54,
  sidescroll: 56,
  terminal: 62,
  sheet: 66,
  hud: 74,
};

const DEFAULT_ELEV = 1;

/**
 * Typography, for the typesets that do not override it (`TypeSet` in
 * `src/data/catalog.ts`).
 *
 * `700` is the user-agent's own `bold`, so a typeset that says nothing about its
 * display weight renders exactly as it did before these tokens existed — which
 * is what makes them safe to add to a catalogue entry one at a time.
 */
const DEFAULT_DISPLAY_WEIGHT = 700;
const DEFAULT_BODY_WEIGHT = 400;
const DEFAULT_TRACKING = "normal";

const LAYOUT_ELEV: Partial<Record<LayoutId, number>> = {
  deck: 1.25,
  sidescroll: 1.1,
  sheet: 0.9,
  hud: 1.3,
};

function radiusFor(layout: LayoutId, band: Band, calm: boolean): string {
  if (calm) return CALM_RADIUS;
  // Stack is only borderless on desk; on small screens it is the collapse target
  // for everything, where square-edged cards read as broken rather than deliberate.
  if (layout === "stack" && band !== "desk") return DEFAULT_RADIUS;
  return LAYOUT_RADIUS[layout] ?? DEFAULT_RADIUS;
}

export function themeVars(config: Config, layout: LayoutId, band: Band): CSSProperties {
  const palette = PALETTES[config.pal] ?? PALETTES[0];
  const type = TYPESETS[config.type] ?? TYPESETS[0];
  const tokens = BAND_TOKENS[band];
  const { calm } = config;
  // 404 desaturates and drops its accents to muted greys — pressure lost. Calm
  // wins over it, since calm is a whole aesthetic rather than a page treatment.
  const lost = !calm && config.page === "notfound";

  return {
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--line": palette.line,
    /*
     * The border colour for things you can *operate* — inputs, buttons, chips,
     * the share-code field. Separate from `--line`, which stays the decorative
     * hairline on cards and rules.
     *
     * **It exists because `--line` is not a contrast-bearing colour** (2026-08-17
     * accessibility audit). Measured across all 25 palettes, `--line` is
     * **1.22–1.61:1** against the surfaces it sits on, and WCAG 1.4.11 needs 3:1
     * for the visual boundary of a control — and on this site that 1px border is
     * the *only* thing distinguishing a text field or a chip from the background,
     * since neither has a fill. `--muted` clears the bar everywhere it is used as
     * text (6.3–9.0:1), so it clears it comfortably as an edge.
     *
     * Cards and hairlines deliberately keep `--line`: a card border is not a
     * control, 1.4.11 does not apply to it, and thickening every rule on the site
     * would change the drawing rather than fix an affordance.
     */
    "--edge": palette.muted,
    "--fg": palette.fg,
    "--muted": palette.muted,
    "--faint": palette.faint,
    "--a1": lost ? palette.muted : palette.a1,
    /*
     * Calm leaves exactly one accent: `a2` collapses into the neutral ramp.
     * 404 drops all three, or the one left saturated is the one it draws the
     * eye to.
     *
     * **`a3` is exempt from the calm collapse, because it is the danger token**
     * (2026-08-17 accessibility audit). It colours `.v-btn-danger`'s text, the
     * `.v-account-error` border and `.v-door-pending` — it carries meaning,
     * where `a2` is decorative. Collapsing it to `faint` made destructive
     * actions and authentication errors the *faintest* thing on the page:
     * measured across the 25 palettes, danger text fell from a median 9.60:1 to
     * **3.06:1**, failing AA on every one of them, and the error border failed
     * the 3:1 non-text minimum on 24 of 25.
     *
     * That is not an edge case here. This browser — and any visitor whose OS
     * asks for reduced motion — lands in calm by default, so calm was the mode
     * in which "your password was wrong" was hardest to see. The 404 still
     * drops it: that page has no errors and no destructive buttons.
     */
    "--a2": calm ? palette.muted : lost ? palette.faint : palette.a2,
    "--a3": lost ? palette.faint : palette.a3,

    "--font-body": type.body,
    "--font-display": type.display,
    "--font-mono": type.mono,

    // The non-family half of a typeset. Consumed only by `src/styles/fonts.css`,
    // which is the one stylesheet that can carry them: the hero h1's weight has
    // to beat the user-agent's `h1 { font-weight: bold }`, and body tracking has
    // to inherit from the wrapper, so neither can be expressed as a family name.
    //
    // Defaulted here rather than in the CSS `var()` fallback, so the value a
    // typeset omits is written down once, next to the values it sets.
    "--type-display-weight": String(type.displayWeight ?? DEFAULT_DISPLAY_WEIGHT),
    "--type-body-weight": String(type.bodyWeight ?? DEFAULT_BODY_WEIGHT),
    "--type-tracking": type.tracking ?? DEFAULT_TRACKING,

    "--radius": radiusFor(layout, band, calm),
    "--panel": `${
      calm
        ? CALM_PANEL
        : LOW_CONTRAST.includes(palette.id)
          ? Math.max(LAYOUT_PANEL[layout] ?? DEFAULT_PANEL, LOW_CONTRAST_PANEL)
          : LAYOUT_PANEL[layout] ?? DEFAULT_PANEL
    }%`,
    "--elev": String(calm ? 0 : LAYOUT_ELEV[layout] ?? DEFAULT_ELEV),

    "--page-padding": tokens.pagePadding,
    "--header-padding": tokens.headerPadding,
    "--grid-columns": tokens.gridColumns,
    "--grid-gap": tokens.gridGap,
    "--valve-size": tokens.valveSize,
    "--h1-size": LAYOUT_H1[layout] ?? tokens.h1Size,
    "--footer-padding": tokens.footerPadding,
    "--footer-size": tokens.footerSize,
    "--sheet-columns": tokens.sheetColumns,
    "--deck-card": tokens.deckCard,
  } as CSSProperties;
}

/**
 * Class names on the wrapper, so CSS can branch on layout and calm without
 * every component threading props down.
 */
export function themeClasses(config: Config, layout: LayoutId, band: Band): string {
  return [
    "vessel",
    `layout-${layout}`,
    `band-${band}`,
    config.calm ? "is-calm" : "is-alive",
    config.grain && !config.calm ? "has-grain" : null,
    config.breathe && !config.calm ? "has-breathe" : null,
    config.cursor && !config.calm ? "has-cursor" : null,
  ]
    .filter(Boolean)
    .join(" ");
}
