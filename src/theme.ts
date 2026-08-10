import type { CSSProperties } from "react";

import { PALETTES } from "./data/palettes";
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

  return {
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--line": palette.line,
    "--fg": palette.fg,
    "--muted": palette.muted,
    "--faint": palette.faint,
    "--a1": palette.a1,
    // Calm leaves exactly one accent: a2 and a3 collapse into the neutral ramp.
    "--a2": calm ? palette.muted : palette.a2,
    "--a3": calm ? palette.faint : palette.a3,

    "--font-body": type.body,
    "--font-display": type.display,
    "--font-mono": type.mono,

    "--radius": radiusFor(layout, band, calm),

    "--page-padding": tokens.pagePadding,
    "--header-padding": tokens.headerPadding,
    "--stage-height": tokens.stageHeight,
    "--grid-columns": tokens.gridColumns,
    "--grid-gap": tokens.gridGap,
    "--valve-size": tokens.valveSize,
    "--h1-size": tokens.h1Size,
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
  ]
    .filter(Boolean)
    .join(" ");
}
