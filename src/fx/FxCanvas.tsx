import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import { drawFx } from "./effects";
import type { FxCache } from "./effects";
import { motion } from "./motion";

/**
 * One full-bleed canvas, sized to its own box rather than to a fixed buffer.
 *
 * It used to render into a fixed 1600×1000 and let CSS stretch it, which cost
 * two things at once. The stretch is anisotropic, so every circle in `orbits`,
 * `constellation`, `bokeh` and the tunnel's spokes rendered as an ellipse
 * whose eccentricity was whatever the viewport's aspect happened to be — on an
 * ultrawide, visibly squashed. And on anything wider than 1600px the whole
 * background was an upscale of a smaller image.
 *
 * So the buffer follows the element, and the context carries a base scale so
 * every effect keeps working in CSS pixels. That last part is load-bearing:
 * the cell-based effects (rain's 16px column, plasma's 26px grid) size
 * themselves off `w`/`h`, and handing them device pixels would silently double
 * their density on a retina display.
 *
 * The render loop is started once and never torn down: it reads the live
 * effect, palette and calm flag from a ref each frame rather than from its
 * closure, so changing the palette recolours the running effect instead of
 * restarting it — which is the whole point of the .9s bleed. The cache (grown
 * tree, particle fields, rain columns) is dropped only when the effect itself
 * changes; a resize is absorbed by the effects themselves, which either rebuild
 * against the new dimensions (rain) or wrap into them (every particle field).
 *
 * All effects pause on `document.hidden` and accept a `boost` multiplier
 * derived from scroll velocity and the screensaver.
 */

/**
 * Ceiling on the buffer's long edge, in device pixels. A 5K display at dpr 2
 * would otherwise ask for a 10240×5760 buffer — 59M pixels a frame, with
 * `plasma` drawing an arc per 26px cell across all of it. Past this the scale
 * falls below the device ratio and the browser upscales, which is exactly the
 * trade the old fixed buffer made everywhere and is right to make only here.
 */
const MAX_EDGE = 2600;

/** Retina is worth paying for; a 3× phone panel is not, for a blurred backdrop. */
const MAX_DPR = 2;

export function FxCanvas() {
  const { config, saver } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** CSS-pixel size and the base scale, written by the observer, read per frame. */
  const size = useRef({ w: 1, h: 1, scale: 1 });

  const live = useRef({ fx: config.fx, pal: config.pal, calm: config.calm, saver });
  useEffect(() => {
    live.current = { fx: config.fx, pal: config.pal, calm: config.calm, saver };
  });

  // Buffer sizing. Separate from the render loop so a resize never touches the
  // frame path, and so the first measurement lands before the first frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const scale = Math.min(window.devicePixelRatio || 1, MAX_DPR, MAX_EDGE / Math.max(w, h));

      const bw = Math.max(1, Math.round(w * scale));
      const bh = Math.max(1, Math.round(h * scale));
      // Assigning width/height clears the canvas even when the value is
      // unchanged, so guard it — the observer fires on scrollbar appearance and
      // on the stage's own layout, not only on real window resizes.
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      size.current = { w, h, scale };
    };

    fit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let t = 0;
    let cache: FxCache = {};
    let cachedFor = live.current.fx;
    let raf = 0;
    let lastFrameAt = performance.now();

    const step = () => {
      raf = requestAnimationFrame(step);

      // Frames elapsed at 60fps. Every effect advances by boost, so folding the
      // real frame delta into it makes them run at the same wall-clock speed on
      // a 120Hz display as on a 60Hz one — without this, refresh rate silently
      // doubles the speed of the rain and every particle field. Clamped so a
      // long stall (a backgrounded tab, a slow first paint) cannot jump the
      // world forward, and pinned to 1 at 60fps so nothing changes there.
      const now = performance.now();
      const dt = Math.min(3, Math.max(0.2, (now - lastFrameAt) / (1000 / 60)));
      lastFrameAt = now;

      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected || document.hidden) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { fx, pal, calm, saver: sleeping } = live.current;
      const { w, h, scale } = size.current;
      const p = PALETTES[pal] ?? PALETTES[0];
      // Calm stops rendering entirely; the canvas has already faded out by CSS.
      const id = calm ? "off" : fx;

      // Reset to the base scale every frame rather than relying on effects to
      // leave the context as they found it. `rain` in particular flips the
      // world with scale(-1, 1) inside a save/restore pair, and one missed
      // restore would otherwise mirror the site permanently.
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      motion.scrollV *= 0.92;
      if (id === "off") {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      if (id !== cachedFor) {
        cache = {};
        cachedFor = id;
      }

      const boost = (1 + motion.scrollV + (sleeping ? 0.9 : 0)) * dt;
      t += 0.011 * boost;

      drawFx(id, {
        ctx,
        w,
        h,
        p,
        t,
        beat: (Math.sin(t * 1.9) + 1) / 2,
        boost,
        sleeping,
        mx: motion.mouse.x,
        my: motion.mouse.y,
      }, cache);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="v-canvas" aria-hidden="true" />;
}
