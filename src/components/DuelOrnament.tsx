import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import {
  FEET_Y,
  WORLD_H,
  WORLD_W,
  advanceDuel,
  createDuel,
  drawDuel,
} from "../fx/duel";
import type { FighterStyle } from "../fx/duel";

/**
 * The lightsword duel in the hero-ornament slot — the client's original
 * request (`docs/DUEL.md`), and the forgiving home: a square that layouts
 * already size and hide without knowing what is in it.
 *
 * Unlike the CSS ornaments this one is a canvas with its own loop, run the way
 * `FxCanvas` runs: fixed internal resolution stretched by CSS, palette and calm
 * read from a live ref each frame so a palette change recolours the running
 * fight, and the frame delta clamped so a stall cannot teleport a match.
 *
 * **Calm stops the simulation, not the rendering.** The ornaments' contract is
 * that they fall still in calm — so the fight freezes mid-frame but keeps being
 * drawn, which lets the palette bleed recolour the stilled scene instead of
 * leaving a stale canvas behind. The screensaver pauses the simulation the same
 * way: the chrome is faded to nothing, so advancing matches there would only
 * mean the fight a visitor was watching vanishes mid-swing when the site sleeps.
 *
 * Health bars are on — `docs/DUEL.md` calls them right for this slot and wrong
 * behind body copy. There is no winner text and no match counter: the fallen
 * fighter, the spark burst and the winner's raised blade are the announcement,
 * for the same reason the vitals strip was removed (show, don't caption).
 */

const PAIRINGS: Record<"duel" | "duelholy", [FighterStyle, FighterStyle]> = {
  duel: ["hooded", "caped"],
  duelholy: ["haloed", "horned"],
};

export function DuelOrnament({ pairing }: { pairing: "duel" | "duelholy" }) {
  const { config, saver } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const live = useRef({ pal: config.pal, calm: config.calm, saver });
  useEffect(() => {
    live.current = { pal: config.pal, calm: config.calm, saver };
  });

  useEffect(() => {
    const st = createDuel(...PAIRINGS[pairing]);
    let raf = 0;
    let last = performance.now();

    const step = () => {
      raf = requestAnimationFrame(step);

      const now = performance.now();
      // Elapsed 60Hz frames, clamped exactly as FxCanvas clamps its delta.
      const frames = Math.min(3, Math.max(0.2, (now - last) / (1000 / 60)));
      last = now;

      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected || document.hidden) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { pal, calm, saver: sleeping } = live.current;
      if (!calm && !sleeping) advanceDuel(st, frames);

      const p = PALETTES[pal] ?? PALETTES[0];
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // The world is 2:1 in a square slot: full width, centred vertically.
      const scale = w / WORLD_W;
      drawDuel(ctx, st, {
        x: 0,
        y: (h - WORLD_H * scale) / 2 + (WORLD_H - FEET_Y) * scale * 0.3,
        scale,
        ink: p.fg,
        bladeA: p.a1,
        bladeB: p.a3,
        core: p.fg,
        spark: p.a2,
        line: p.line,
        bars: true,
        dim: 1,
      });
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pairing]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={700}
      className="v-duelfight"
      aria-hidden="true"
    />
  );
}
