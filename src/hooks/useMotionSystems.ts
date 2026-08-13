import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { useConfig } from "../config/ConfigContext";
import { SUPPORTS_TILT } from "../config/bands";
import { motion } from "../fx/motion";

/**
 * Motion systems 2 and 4, plus the cursor glow (SPEC.md § Motion systems).
 *
 * Everything here runs at pointer or scroll rate and writes straight to the DOM
 * and to `motion`, never to React state — a re-render per pointermove would
 * make the tilt jitter and cost far more than the transform it applies.
 */
export function useMotionSystems({
  hostRef,
  glowRef,
  stageRef,
  gridKey,
}: {
  /** The site wrapper — pointer coordinates are measured against it. */
  hostRef: RefObject<HTMLElement | null>;
  glowRef: RefObject<HTMLElement | null>;
  /** The scrolling stage, which owns scroll velocity. */
  stageRef: RefObject<HTMLElement | null>;
  /** Changes whenever the card list does, so the tilt targets are re-collected. */
  gridKey: string;
}): void {
  const { config, band, saver } = useConfig();
  const cardsRef = useRef<HTMLElement[]>([]);

  const live = useRef({ calm: config.calm, cursor: config.cursor, saver, tilt: SUPPORTS_TILT[band] });
  useEffect(() => {
    live.current = { calm: config.calm, cursor: config.cursor, saver, tilt: SUPPORTS_TILT[band] };
  });

  // Re-collect the cards after every page, layout or band change. Holding the
  // list beats querying the DOM on every pointermove.
  useEffect(() => {
    cardsRef.current = Array.from(stageRef.current?.querySelectorAll<HTMLElement>(".v-block") ?? []);
  }, [stageRef, gridKey]);

  // Flatten every card the moment tilt stops applying, so a card can never be
  // left frozen mid-lean by switching to calm or resizing down to a touch band.
  useEffect(() => {
    if (SUPPORTS_TILT[band] && !config.calm) return;
    for (const card of cardsRef.current) card.style.transform = "";
  }, [band, config.calm, gridKey]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      motion.mouse = { x: x / rect.width, y: y / rect.height };

      const { calm, cursor, saver: sleeping, tilt } = live.current;

      const glow = glowRef.current;
      if (glow) {
        const visible = cursor && !calm && !sleeping;
        glow.classList.toggle("is-visible", visible);
        if (visible) glow.style.transform = `translate3d(${x}px,${y}px,0)`;
      }

      // Cursor-lean cards. Off-screen cards are skipped, and the lean is scaled
      // by a proximity falloff so distant cards stay flat.
      if (calm || !tilt) return;
      for (const card of cardsRef.current) {
        if (!card.isConnected) continue;
        const r = card.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) continue;
        const dx = (event.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (event.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const near = Math.max(0, 1 - Math.hypot(dx, dy) / 2.6);
        card.style.transform = `perspective(1100px) rotateY(${dx * 3.4 * near}deg) rotateX(${
          -dy * 3.4 * near
        }deg) translateZ(${near * 10}px)`;
      }
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [hostRef, glowRef]);

  // Scroll velocity: distance over time, clamped to 3. The canvas loop decays it
  // by ×.92 a frame and folds it into the effect's time step.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let last = stage.scrollTop;
    let lastAt = performance.now();
    const bump = (y: number) => {
      const now = performance.now();
      motion.scrollV = Math.min(3, (Math.abs(y - last) / Math.max(16, now - lastAt)) * 8);
      last = y;
      lastAt = now;
    };
    const onStage = () => bump(stage.scrollTop);
    // Terminal scrolls the *document* — the stage is height:auto there (see
    // chrome.css) — so the stage listener alone left scrollV permanently zero
    // in that one layout. Only one of these ever fires for a given layout.
    const onWindow = () => bump(window.scrollY);
    stage.addEventListener("scroll", onStage, { passive: true });
    window.addEventListener("scroll", onWindow, { passive: true });
    return () => {
      stage.removeEventListener("scroll", onStage);
      window.removeEventListener("scroll", onWindow);
    };
  }, [stageRef, gridKey]);
}
