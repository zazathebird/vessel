import { useMemo } from "react";

import { qrMatrix } from "../auth/qr";

/**
 * A QR code, drawn as inline SVG from a matrix computed in the browser.
 *
 * **Not an image asset.** `SPEC.md` § *Assets* forbids image files, and this is
 * not one — it is markup generated from a string at render time, the same
 * reasoning that lets the favicon be an inline `data:` SVG. Nothing is fetched
 * and nothing is stored.
 *
 * **The four-module quiet zone is mandatory, not styling.** Scanners use it to
 * find the symbol's edge; without it a reader against a dark page often cannot
 * lock on at all. `qrMatrix` deliberately returns a bare matrix so the border
 * lives here, where it is visible, rather than baked into a matrix nobody can
 * measure.
 *
 * **Colours are the palette's, and that is a real constraint rather than a
 * flourish.** A scanner needs contrast between modules and background and does
 * not care which way round — but it does need the *background* to be lighter or
 * darker consistently. `--fg` on `--surface` clears it on all 25 palettes,
 * which is checked the same way every other contrast pair here is.
 *
 * `shape-rendering="crispEdges"` matters: antialiased module edges at small
 * sizes are the usual reason a generated QR scans on a phone held still and
 * fails on one held by a person.
 */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const modules = useMemo(() => qrMatrix(value), [value]);

  const QUIET = 4;
  const span = modules.length + QUIET * 2;

  // One path for every dark module rather than one <rect> each: a version-10
  // symbol is 3,249 modules and roughly half are dark, and 1,600 elements is a
  // lot of DOM for something that never changes.
  const path = modules
    .flatMap((row, r) =>
      row.map((dark, c) => (dark ? `M${c + QUIET} ${r + QUIET}h1v1h-1z` : "")),
    )
    .join("");

  return (
    <svg
      className="v-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for the authenticator secret"
    >
      <rect width={span} height={span} fill="var(--surface)" />
      <path d={path} fill="var(--fg)" />
    </svg>
  );
}
