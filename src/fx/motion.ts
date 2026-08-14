/**
 * Per-frame values that deliberately live outside React state (SPEC.md § State).
 *
 * Pointer position and scroll velocity update at input/animation rate; routing
 * them through state would re-render the whole tree sixty times a second. The
 * canvas loop and the pointer handlers are the only readers and writers, and
 * there is exactly one of each per document, so a module-level record is the
 * honest shape for them.
 */
export const motion = {
  /** Pointer position over the site wrapper, 0–1 on each axis. */
  mouse: { x: 0.5, y: 0.5 },
  /**
   * Scroll speed of the stage, clamped to 3 and decayed by ×.92 each frame by
   * the canvas loop. It multiplies the canvas time step, so fast scrolling
   * visibly accelerates the background (motion system 4).
   */
  scrollV: 0,
};
