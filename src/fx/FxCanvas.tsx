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
   *
   * **The two directions are measured against different things, and that is the
   * correction rather than a refinement.** Falling is judged on the frame
   * *interval*, because a slow interval is the complaint itself. Rising cannot
   * be, and for a while was: the bar was an interval under 11ms, i.e. above
   * 90fps, which a vsync-locked 60Hz display cannot produce no matter how
   * cheap the effect is. Promotion was therefore unreachable on the commonest
   * display in the world while demotion stayed reachable, and because every
   * change is persisted and `calibrateOnce` will not re-probe once anything is
   * stored, one garbage collection pinned that browser profile to a soft canvas
   * for good. Rising is now judged on *headroom* — how much of the frame's own
   * budget the draw actually used — which is a question with an answer at any
   * refresh rate.
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

    // Rolling frame-cost window for the adaptive resolution above. `sampleMs`
    // is the wall-clock interval the frame had to fit into; `sampleWork` is the
    // time actually spent inside `drawFx`. The first says whether we are
    // keeping up, the second whether there is room to ask for more.
    let sampled = 0;
    let sampleMs = 0;
    let sampleWork = 0;
    let sinceChange = 0;
    // Whether the previous frame drew anything. An interval that spans a calm
    // frame, a hidden tab or `off` measures the gap, not the effect.
    let drewLast = false;
    /*
     * The best tier this machine is allowed to try again, and the frames since
     * it last tried.
     *
     * A promotion that has to be undone within a few seconds is evidence, and
     * without recording it the detector oscillates: promote on 150 samples,
     * demote on 20, repeat every few seconds, reallocating the buffer each way.
     * One failed attempt puts the tier it reached out of bounds for the rest of
     * the page's life. It is deliberately *not* persisted — the stored tier is
     * a measurement, this is a note about one session, and a machine that was
     * busy once should get to try again on the next load.
     */
    let ceiling = 0;
    let sincePromotion = Infinity;
    /*
     * **Promotion is a single, bounded correction of the *probe*, not an
     * ongoing search** (2026-08-17, after an adversarial re-review of the
     * 2026-08-16 rewrite found the previous version guaranteed a stutter).
     *
     * The tier this session started at came from `probeTier()` — one short
     * synchronous sample, which the probe's own docs admit can read a machine
     * as far slower than it is. That guess deserves exactly one chance to be
     * wrong. A tier arrived at by *measurement*, i.e. by demoting because the
     * frame was actually late, deserves none: it is evidence, and evidence
     * beats a guess.
     *
     * So the first demotion clears this permanently for the session, and there
     * is at most one promotion attempt per load. That bounds the worst case to
     * a single ~1s stutter on a machine whose probe misfired, instead of the
     * repeating promote-stutter-demote cycle the previous version produced on
     * exactly the "decade-old shitbox Acer" `perf.ts` is written for.
     */
    let mayPromote = true;

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

      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected || document.hidden) {
        drewLast = false;
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        drewLast = false;
        return;
      }

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
        // Calm renders nothing, so a calm frame is not evidence about what the
        // canvas costs. Counted, it used to be: a visitor sitting in calm on a
        // fast display climbed the tier to 1 and persisted it, so the next
        // session on that slow machine opened at full resolution.
        drewLast = false;
        return;
      }

      if (id !== cachedFor) {
        cache = {};
        cachedFor = id;
      }

      const boost = (1 + motion.scrollV + (sleeping ? 0.9 : 0)) * dt;
      t += 0.011 * boost;

      const drawStartedAt = performance.now();
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
      const workMs = performance.now() - drawStartedAt;

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
       *
       * Sampled *after* the draw and only on consecutive drawn frames, so the
       * window contains frames that actually rendered this effect and nothing
       * else. A backgrounded tab and the first paint both produce enormous
       * deltas that say nothing about the GPU.
       */
      sinceChange += 1;
      sincePromotion += 1;
      if (drewLast && frameMs > 4 && frameMs < 200) {
        sampleMs += frameMs;
        sampleWork += workMs;
        sampled += 1;
      }
      drewLast = true;

      if (sampled >= 20 && sinceChange >= 40) {
        const avg = sampleMs / sampled;
        const work = sampleWork / sampled;
        const tier = TIERS.indexOf(quality.current);
        const settle = () => {
          sinceChange = 0;
          sampled = 0;
          sampleMs = 0;
          sampleWork = 0;
        };
        // 19ms is a hair over 52fps. Anything slower than that is visible.
        if (avg > 19 && tier < TIERS.length - 1) {
          // Undoing a promotion made moments ago: that tier is out of reach on
          // this machine, so stop reaching for it.
          if (sincePromotion < 900) ceiling = tier + 1;
          // Measured beats guessed: once the frame has actually been late, the
          // probe's opinion is spent and nothing climbs again this session.
          mayPromote = false;
          quality.current = TIERS[tier + 1];
          saveTier(quality.current);
          refit.current?.();
          settle();
        } else if (
          mayPromote &&
          tier > ceiling &&
          sampled >= 150 &&
          sinceChange >= 300 &&
          avg < 19 &&
          /*
           * Headroom, against a **fixed 16.7ms frame** rather than against the
           * interval we happen to be achieving.
           *
           * Using `avg` here was backwards: it made the budget *larger* exactly
           * as the machine got slower (a display struggling at 18.9ms was
           * granted 6.6ms, one running clean at 8ms only 2.8ms), so the test
           * was most permissive when it should have been strictest.
           *
           * Be honest about what this term can and cannot do. `workMs` brackets
           * Canvas2D command submission, and rasterisation is asynchronous — so
           * for a fill-bound effect, which is the whole premise of a
           * *resolution* tier, it is close to constant across tiers and cannot
           * tell you the next one is affordable. It is a floor, not a proof:
           * it stops a promotion when the main thread is visibly busy. What
           * actually bounds the risk is `mayPromote` above — one attempt, only
           * from a probe-set tier.
           */
          work * (TIERS[tier - 1] / TIERS[tier]) ** 2 < 16.7 * 0.35
        ) {
          quality.current = TIERS[tier - 1];
          saveTier(quality.current);
          refit.current?.();
          sincePromotion = 0;
          mayPromote = false;
          settle();
        } else if (sampled >= 150) {
          sampled = 0;
          sampleMs = 0;
          sampleWork = 0;
        }
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="v-canvas" aria-hidden="true" />;
}
