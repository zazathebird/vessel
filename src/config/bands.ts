import type { LayoutId } from "../data/catalog";

/**
 * Responsive bands. Two breakpoints, deliberately.
 *
 * Rather than letting thirteen layouts degrade unpredictably, small screens
 * collapse to the ones that actually read. The operator's stored choice is
 * never overwritten — it re-emerges when the window widens — and the hero's
 * metadata strip appends " · adapted" so the state is never silently wrong.
 */

export type Band = "phone" | "tablet" | "desk";

export const PHONE_MAX = 560;
export const TABLET_MAX = 900;

export function bandForWidth(width: number): Band {
  if (width < PHONE_MAX) return "phone";
  if (width < TABLET_MAX) return "tablet";
  return "desk";
}

const PHONE_LAYOUTS: Partial<Record<LayoutId, LayoutId>> = {
  terminal: "console",
  console: "console",
  sheet: "sheet", // survives at 2 columns
};

const TABLET_LAYOUTS: Partial<Record<LayoutId, LayoutId>> = {
  mosaic: "cinematic",
  magazine: "cinematic",
  ledger: "cinematic",
  radial: "cinematic",
};

/** The layout actually rendered at this width, which may differ from the stored choice. */
export function adaptLayout(layout: LayoutId, band: Band): LayoutId {
  if (band === "desk") return layout;
  if (band === "tablet") return TABLET_LAYOUTS[layout] ?? layout;
  return PHONE_LAYOUTS[layout] ?? "stack";
}

export function isAdapted(layout: LayoutId, band: Band): boolean {
  return adaptLayout(layout, band) !== layout;
}

/** Per-band values from the spec's responsive table, exposed as CSS custom properties. */
export interface BandTokens {
  pagePadding: string;
  headerPadding: string;
  stageHeight: string;
  gridColumns: string;
  gridGap: string;
  valveSize: string;
  h1Size: string;
  footerPadding: string;
  footerSize: string;
  sheetColumns: string;
  deckCard: string;
}

export const BAND_TOKENS: Record<Band, BandTokens> = {
  phone: {
    pagePadding: "0 18px 64px",
    headerPadding: "14px 18px",
    // dvh, not vh: the stage scrolls internally, so iOS Safari's URL bar never
    // collapses and 100vh (the large viewport) hides the stage's bottom ~60px.
    stageHeight: "calc(100dvh - 132px)",
    gridColumns: "1fr",
    gridGap: "14px",
    // Sized, not hidden (mobile parity, client request 2026-08-13): the
    // ornament — and with it the duels and the five-tap sign-in reveal —
    // renders on phones too. Only Stack can show it there (console and sheet
    // hide the slot by layout), where it sits centred above the copy.
    valveSize: "min(44vw, 190px)",
    h1Size: "clamp(34px, 10vw, 52px)",
    footerPadding: "26px 0 8px",
    footerSize: "10px",
    sheetColumns: "repeat(2, 1fr)",
    deckCard: "0 0 82vw",
  },
  tablet: {
    pagePadding: "0 26px 72px",
    headerPadding: "16px 26px",
    stageHeight: "calc(100dvh - 132px)",
    gridColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gridGap: "20px",
    valveSize: "min(34vw, 240px)",
    h1Size: "clamp(42px, 6.2vw, 90px)",
    footerPadding: "34px 0 10px",
    footerSize: "11px",
    sheetColumns: "repeat(3, 1fr)",
    deckCard: "0 0 320px",
  },
  desk: {
    pagePadding: "0 40px 80px",
    headerPadding: "20px 40px",
    stageHeight: "calc(100vh - 86px)",
    gridColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gridGap: "20px",
    valveSize: "min(38vw, 340px)",
    h1Size: "clamp(42px, 6.2vw, 90px)",
    footerPadding: "34px 0 10px",
    footerSize: "11px",
    sheetColumns: "repeat(4, 1fr)",
    deckCard: "0 0 340px",
  },
};

/** Cursor-lean card tilt needs a hovering pointer; on touch it only jitters. */
export const SUPPORTS_TILT: Record<Band, boolean> = { phone: false, tablet: false, desk: true };
