/**
 * The address, assembled at runtime.
 *
 * It must never appear in static markup — not in the HTML, and not as a
 * contiguous literal in the bundle either, which is why the parts are joined
 * rather than written out (SPEC.md § the nine pages).
 */
export const MAIL = ["patrickmcclevarty", String.fromCharCode(64), "outlook", ".", "com"].join("");
