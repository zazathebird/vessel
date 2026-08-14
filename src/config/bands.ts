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
  // The HUD's three overlapping planes need room on both axes; at 700px the
  // near plane covers the far one instead of occluding a corner of it.
  //
  // Cinematic, not Mosaic, even though Mosaic is the closer relative:
  // adaptLayout is a single lookup and does not chain, so mapping here to a
  // layout that itself collapses on this band would render real six-column
  // Mosaic at tablet width — which is the thing that mapping exists to prevent.
  hud: "cinematic",
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

/**
 * Per-band values from the spec's responsive table, exposed as CSS custom
 * properties.
 *
 * **`stageHeight` was removed on 2026-08-14 and must not come back.** It was
 * `calc(100dvh - 132px)` on phone — a hardcoded guess at the header's height —
 * and the real phone header is 147px, because it wraps to two rows there. The
 * chrome therefore came to 15px taller than the viewport and the *document*
 * scrolled behind the already-scrolling `.v-stage`: two nested vertical scroll
 * containers on the band least able to afford them. The number was right when
 * it was written and drifted afterwards, which is the whole problem with
 * measuring one element by hardcoding another's size — the header grows
 * whenever a chip is added, and one was. `.v-chrome` is now a flex column and
 * the stage is `flex: 1` with `min-height: 0`, which measures instead of
 * guessing. See the note on `.v-chrome` in chrome.css.
 */
export interface BandTokens {
  pagePadding: string;
  headerPadding: string;
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
