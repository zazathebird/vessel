import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import { drawFx } from "./effects";
import type { FxCache } from "./effects";
import { motion } from "./motion";

/**
 * One full-bleed canvas at 1600×1000 internal resolution, stretched to fill.
 *
 * The render loop is started once and never torn down: it reads the live effect,
 * palette and calm flag from a ref each frame rather than from its closure, so
 * changing the palette recolours the running effect instead of restarting it —
 * which is the whole point of the .9s bleed. The cache (grown tree, particle
 * fields, rain columns) is dropped only when the effect itself changes.
 *
 * All effects pause on `document.hidden` and accept a `boost` multiplier
 * derived from scroll velocity and the screensaver.
 */
export function FxCanvas() {
  const { config, saver } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const live = useRef({ fx: config.fx, pal: config.pal, calm: config.calm, saver });
  useEffect(() => {
    live.current = { fx: config.fx, pal: config.pal, calm: config.calm, saver };
  });

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
      const w = canvas.width;
      const h = canvas.height;
      const p = PALETTES[pal] ?? PALETTES[0];
      // Calm stops rendering entirely; the canvas has already faded out by CSS.
      const id = calm ? "off" : fx;

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
        mx: motion.mouse.x,
        my: motion.mouse.y,
      }, cache);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} width={1600} height={1000} className="v-canvas" aria-hidden="true" />;
}
