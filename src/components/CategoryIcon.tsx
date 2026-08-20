/**
 * One drawn mark per download category (2026-08-20, client request: "with an
 * icon for each category").
 *
 * **Drawn, not shipped.** `SPEC.md`'s *Assets* rule says no images, and the site
 * has answered that the same way twice already — the favicon is an inline SVG
 * and `FileIcon.tsx` draws the §10 explorer's file types. This is the third, and
 * it follows `FileIcon`'s shape deliberately so the two read as one family: a
 * 24-unit box, stroked, no fills, and every colour a palette token so the whole
 * set recolours with the 0.9s bleed like everything else.
 *
 * **One ink per mark, and the ink is an accent.** `FileIcon` splits its outline
 * (`--line`) from its glyph (`--a1`/`--a2`) because a file icon is a page with
 * something drawn on it. A category has no container — the mark *is* the icon —
 * so a second colour would be decoration. The accent alternates down the
 * catalogue for the reason `FileIcon`'s does: a page holding several kinds of
 * program reads as a distribution rather than as a column of identical marks.
 *
 * **They are drawn to survive being small.** These render at 18px beside a file
 * name, which is smaller than the explorer's, so every mark here is one closed
 * silhouette with no interior detail — the same lesson the duel costumes cost a
 * session to learn (`CLAUDE.md`, deviation 9: at the size these render, the edge
 * of the shape is the whole recognition and interior detail is noise). Anything
 * that needed a second element inside it was redrawn until it did not.
 *
 * **They are decorative, and the markup says so.** Every icon is
 * `aria-hidden`, because the category is already beside it as text — a screen
 * reader announcing "diagnostics, Diagnostics" is worse than one that says it
 * once. The icon never carries information the row does not also state.
 */

import { CATEGORIES, categoryOf } from "../data/downloads";

/**
 * Which accent each category is drawn in, alternating down the catalogue.
 *
 * Derived from position rather than hand-assigned: a hand-written map is a
 * second list that has to be kept in step with `CATEGORIES`, and the failure
 * would be a new category silently rendering in whichever colour a missing key
 * falls back to. `other` is pinned to `a1` at the end regardless, because it is
 * the default and lands on rows nobody categorised — it should be the quieter of
 * the two, not whichever the arithmetic happened to land on.
 */
function accentFor(id: string): "a1" | "a2" {
  if (id === "other") return "a1";
  const i = CATEGORIES.findIndex((c) => c.id === id);
  return i >= 0 && i % 2 === 1 ? "a2" : "a1";
}

/**
 * The marks.
 *
 * Keyed by category id, so adding a category without drawing it is a missing
 * key rather than a wrong picture — `npm run check` fails on it, which is the
 * only way this file can stay in step with the catalogue by itself.
 */
const MARKS: Record<string, JSX.Element> = {
  // A trace on a screen: the shape of a machine being read rather than opened.
  diagnostics: <path d="M3.2 12h3.6l2.2-5.6 3.4 11.2 2.3-5.6H20.8" />,

  // A drive with something coming back up out of it.
  recovery: (
    <>
      <ellipse cx="12" cy="13.4" rx="6.4" ry="2.3" />
      <path d="M5.6 13.4v3.6c0 1.3 2.9 2.3 6.4 2.3s6.4-1 6.4-2.3v-3.6" />
      <path d="M12 9.8V3.6M9.6 6l2.4-2.4L14.4 6" />
    </>
  ),

  // A copy: the one gesture that is unmistakably "there are now two of these".
  backup: (
    <>
      <path d="M9.4 9.4h9.6v9.6H9.4z" />
      <path d="M14.6 9.4V6.2a1.2 1.2 0 00-1.2-1.2H6.2A1.2 1.2 0 005 6.2v7.2a1.2 1.2 0 001.2 1.2h3.2" />
    </>
  ),

  // A shield with the thing struck out of it. Not a tick — a tick says "you are
  // safe", and these are the tools you reach for when somebody already is not.
  antimalware: (
    <>
      <path d="M12 3.4l6.6 2.4v5.7c0 4.2-2.9 7.4-6.6 8.7-3.7-1.3-6.6-4.5-6.6-8.7V5.8z" />
      <path d="M9.7 9.7l4.6 4.6M14.3 9.7l-4.6 4.6" />
    </>
  ),

  // Two sparks. A broom was drawn first and lost its bristles at 18px.
  cleanup: (
    <>
      <path d="M9.8 4.2l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
      <path d="M17.4 13.6l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85z" />
    </>
  ),

  // A chip and its legs: the hardware that needs software.
  drivers: (
    <>
      <path d="M7.6 7.6h8.8v8.8H7.6z" />
      <path d="M10.2 7.6V5M13.8 7.6V5M10.2 16.4V19M13.8 16.4V19M7.6 10.2H5M7.6 13.8H5M16.4 10.2H19M16.4 13.8H19" />
    </>
  ),

  network: (
    <>
      <circle cx="12" cy="5.4" r="2.1" />
      <circle cx="5.6" cy="17.6" r="2.1" />
      <circle cx="18.4" cy="17.6" r="2.1" />
      <path d="M12 7.5v3.9M12 11.4L6.7 15.8M12 11.4l5.3 4.4" />
    </>
  ),

  // A screen with something arriving from outside it.
  remote: (
    <>
      <path d="M3.8 5.2h16.4v10.2H3.8z" />
      <path d="M9.6 19h4.8" />
      <path d="M8.6 10.3h5.6M12.2 7.9l2.4 2.4-2.4 2.4" />
    </>
  ),

  // The drum, divided. `recovery` is the same body with an arrow; this one is
  // the disk itself, which is what a partition tool is about.
  disks: (
    <>
      <ellipse cx="12" cy="6.8" rx="6.8" ry="2.4" />
      <path d="M5.2 6.8v10.4c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4V6.8" />
      <path d="M5.2 12c0 1.3 3 2.4 6.8 2.4s6.8-1.1 6.8-2.4" />
    </>
  ),

  // The power symbol. The one mark that means "make it start".
  boot: <path d="M12 3.8v7.4M8.1 6.7a6.6 6.6 0 107.8 0" />,

  // A dial pushed round: the shape of a number being proved.
  benchmark: (
    <>
      <path d="M4.4 17.2a7.6 7.6 0 1115.2 0" />
      <path d="M12 17.2l4.2-5.4" />
    </>
  ),

  monitor: <path d="M13.8 13.7V6.3a1.8 1.8 0 10-3.6 0v7.4a3.6 3.6 0 103.6 0z" />,

  passwords: (
    <>
      <circle cx="7.9" cy="12" r="3.3" />
      <path d="M11.2 12h9M17.6 12v3.1M20.2 12v2.5" />
    </>
  ),

  security: (
    <>
      <path d="M5.4 10.4h13.2v9.2H5.4z" />
      <path d="M8.5 10.4V7.9a3.5 3.5 0 017 0v2.5" />
    </>
  ),

  media: (
    <>
      <path d="M4.4 5.4h15.2v13.2H4.4z" />
      <path d="M10.2 9.3l5.1 2.7-5.1 2.7z" />
    </>
  ),

  office: (
    <>
      <path d="M6.4 3.6h8.2l3.6 3.6v13.2H6.4z" />
      <path d="M14.6 3.6v3.6h3.6" />
      <path d="M9.2 12.2h5.6M9.2 15.8h5.6" />
    </>
  ),

  dev: <path d="M9.4 8.4L4.8 12l4.6 3.6M14.6 8.4L19.2 12l-4.6 3.6M13.3 5.6l-2.6 12.8" />,

  system: (
    <>
      <path d="M4.4 7.4h15.2M4.4 12h15.2M4.4 16.6h15.2" />
      <circle cx="9.2" cy="7.4" r="1.8" />
      <circle cx="15.2" cy="12" r="1.8" />
      <circle cx="8.2" cy="16.6" r="1.8" />
    </>
  ),

  // A board rather than a chip: `drivers` already owns the chip, and the thing
  // that distinguishes firmware is that it is underneath everything.
  firmware: (
    <>
      <path d="M4.4 4.4h15.2v15.2H4.4z" />
      <path d="M9.4 9.4h5.2v5.2H9.4z" />
      <path d="M12 4.4v5M12 14.6v5M4.4 12h5M14.6 12h5" />
    </>
  ),

  mobile: (
    <>
      <path d="M7.4 3.4h9.2a1.4 1.4 0 011.4 1.4v14.4a1.4 1.4 0 01-1.4 1.4H7.4A1.4 1.4 0 016 19.2V4.8a1.4 1.4 0 011.4-1.4z" />
      <path d="M10.4 6.2h3.2" />
    </>
  ),

  // Three marks and no claim about what they are. The default category should
  // not look like a kind of program.
  other: (
    <>
      <circle cx="6.4" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="17.6" cy="12" r="1.5" />
    </>
  ),
};

/** Every category that has a mark. Exported so `npm run check` can compare. */
export const DRAWN_CATEGORIES = Object.keys(MARKS);

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  // Resolved through the catalogue, never used raw: a row carrying an id this
  // build does not know about falls to `other` and draws the neutral mark,
  // rather than rendering nothing and leaving a ragged column.
  const resolved = categoryOf(category);
  const mark = MARKS[resolved.id] ?? MARKS.other;

  return (
    <svg
      className={`v-caticon v-caticon-${accentFor(resolved.id)}${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {mark}
    </svg>
  );
}
