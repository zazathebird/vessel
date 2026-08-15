import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import { drawFx } from "./effects";
import { TIERS, saveTier, storedTier } from "./perf";
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

  /**
   * Adaptive resolution (client report, 2026-08-14: "the radar/sonar is lagging
   * hard", plus "if there needs to be a detection of your system to run the
   * appropriate level of vfx, thats fine by me").
   *
   * **Resolution is the main lever, and for most effects the only one needed.**
   * A full-bleed canvas at `devicePixelRatio` 2 is four times the fill of dpr 1
   * and every effect pays that equally, so the buffer shrinks and CSS scales it
   * back up: one mechanism, all effects, and the per-frame `setTransform` means
   * effects keep receiving CSS pixels and never learn anything changed.
   *
   * **But resolution cannot reach a draw-call-bound effect, and two of the
   * sixteen are.** This originally claimed cost was dominated by pixels rather
   * than by draw calls; measuring the effects individually at 1530×860 showed
   * that is false where it matters most. `rain` issues ~1,900 blits a frame and
   * `plasma` grids at a fixed 26px *CSS* cell — both derive their work from `w`
   * and `h`, which the tier deliberately does not change, so dropping to the
   * half tier quartered their fill and left every draw call exactly where it
   * was. `rain` measured 3.0ms a frame, three to six times any other effect and
   * the largest single cost on the site.
   *
   * So the tier is also handed to the effects as `quality`. Almost all of them
   * ignore it — a particle field really is fill-bound and the buffer change is
   * the whole fix. The two that are bound by call count use it to coarsen their
   * grid, which is the only thing that actually helps them.
   *
   * Measured over a window rather than per frame, because one long frame is
   * usually a garbage collection or a tab regaining focus, not a slow machine.
   * Hysteresis is deliberately wide — stepping down at 21ms and back up only
   * below 12ms — so a machine sitting near the boundary settles instead of
   * oscillating, which would be far more visible than the lower resolution.
   */
  // Starts from the remembered measurement rather than optimistically at 1 —
  // see `src/fx/perf.ts`. A slow machine otherwise spends its first seconds at
  // full resolution finding out it cannot afford full resolution, and those are
  // the seconds a first-time visitor is looking at.
  const quality = useRef(storedTier() ?? 1);
  const refit = useRef<(() => void) | null>(null);

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
      const scale =
        Math.min(window.devicePixelRatio || 1, MAX_DPR, MAX_EDGE / Math.max(w, h)) *
        quality.current;

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
    // Held so the render loop can re-run it when it lowers the quality tier.
    refit.current = fit;
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

    // Rolling frame-cost window for the adaptive resolution above.
    let sampled = 0;
    let sampleMs = 0;
    let sinceChange = 0;

    const step = () => {
      raf = requestAnimationFrame(step);

      // Frames elapsed at 60fps. Every effect advances by boost, so folding the
      // real frame delta into it makes them run at the same wall-clock speed on
      // a 120Hz display as on a 60Hz one — without this, refresh rate silently
      // doubles the speed of the rain and every particle field. Clamped so a
      // long stall (a backgrounded tab, a slow first paint) cannot jump the
      // world forward, and pinned to 1 at 60fps so nothing changes there.
      const now = performance.now();
      const frameMs = now - lastFrameAt;
      const dt = Math.min(3, Math.max(0.2, frameMs / (1000 / 60)));
      lastFrameAt = now;

      // Sample only plausible frames. A backgrounded tab and the first paint
      // both produce enormous deltas that say nothing about the GPU, and
      // treating them as evidence would drop a fast machine to half resolution
      // the moment someone switched tabs and came back.
      if (frameMs > 4 && frameMs < 200) {
        sampleMs += frameMs;
        sampled += 1;
      }
      /*
       * **Falling is urgent; rising is not.** The two directions get
       * deliberately different evidence bars.
       *
       * A drop needs only 20 sampled frames — about a third of a second — so a
       * machine that cannot hold the frame stops being asked to within a
       * blink. The old window was 90 samples plus a 180-frame cooldown, which
       * on a machine running at 20fps is several seconds of visible stutter
       * before anything is done about it, and those seconds are the whole
       * complaint. A promotion still needs 150 samples and a long cooldown,
       * because a tier change reallocates the buffer and a detector that
       * flapped between two tiers would cost more than the effect.
       */
      sinceChange += 1;
      const enough = sampled >= 20 && sinceChange >= 40;
      if (enough) {
        const avg = sampleMs / sampled;
        const tier = TIERS.indexOf(quality.current);
        // 19ms is a hair over 52fps. Anything slower than that is visible.
        if (avg > 19 && tier < TIERS.length - 1) {
          quality.current = TIERS[tier + 1];
          saveTier(quality.current);
          refit.current?.();
          sinceChange = 0;
          sampled = 0;
          sampleMs = 0;
        } else if (avg < 11 && tier > 0 && sampled >= 150 && sinceChange >= 300) {
          quality.current = TIERS[tier - 1];
          saveTier(quality.current);
          refit.current?.();
          sinceChange = 0;
          sampled = 0;
          sampleMs = 0;
        } else if (sampled >= 150) {
          sampled = 0;
          sampleMs = 0;
        }
      }

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
        dt,
        quality: quality.current,
        mx: motion.mouse.x,
        my: motion.mouse.y,
      }, cache);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="v-canvas" aria-hidden="true" />;
}
