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
 * **Dark modules on a light ground, with literal colours, and that is the one
 * thing here that must not be palette-driven** (corrected 2026-08-17).
 *
 * The first version used `--fg` on `--surface`. Contrast was excellent —
 * 12.8:1 to 16.9:1 — but `--fg` is *lighter* than `--surface` in **25 of 25**
 * palettes, so it drew a photographic negative: light modules on a dark ground.
 * ZXing does not look for inverted symbols by default (upstream's position is
 * that it is out of spec and would waste half the decode budget), and ZXing is
 * what Android authenticators are built on. That produces exactly the reported
 * failure: scans on one phone, refuses on another.
 *
 * No palette token is dark enough to be the module colour, so this is a
 * deliberate exception to *no component should contain a literal colour* — the
 * same carve-out already recorded for `BLADE_COLORS` in `src/fx/duel.ts`, and
 * for the same kind of reason: the outside world has an opinion about this
 * value and the palette does not get a vote. The card around it stays
 * palette-coloured; only the symbol and its quiet zone are fixed.
 *
 * `shape-rendering="crispEdges"` matters: antialiased module edges at small
 * sizes are the usual reason a generated QR scans on a phone held still and
 * fails on one held by a person.
 */
export function QrCode({
  value,
  size = 260,
  label = "QR code for the authenticator secret",
}: {
  value: string;
  size?: number;
  /**
   * What the symbol is *of*, for a screen reader.
   *
   * Defaulted to the enrolment wording because that was this component's only
   * caller for months and the string was hardcoded — which meant the second
   * caller would have announced a downloads link as an authenticator secret.
   * A wrong accessible name is worse than a generic one, so it is a prop now
   * and the default keeps the original caller unchanged.
   */
  label?: string;
}) {
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
      aria-label={label}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
