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
  const { config, band, layout, saver } = useConfig();
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

  /*
   * Stack's snap arrival: each block's kicker rule draws itself as the block
   * reaches its snap point.
   *
   * An IntersectionObserver rather than a scroll handler, and the one thing in
   * this file that legitimately owns a class instead of a ref. The spec's
   * refs-not-state rule is about values that change at frame rate; this is a
   * discrete state change a handful of times per page, and the observer already
   * batches it off the main scroll path.
   *
   * Desk only, and never in calm: on phones Stack is the collapse target for
   * almost everything and renders as ordinary cards, where a rule drawing on
   * scroll would be noise rather than arrival.
   */
  useEffect(() => {
    if (layout !== "stack" || band !== "desk" || config.calm) return;
    if (typeof IntersectionObserver === "undefined") return;
    const cards = cardsRef.current;
    if (!cards.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-onstage", entry.isIntersecting);
        }
      },
      { root: stageRef.current, threshold: 0.55 },
    );
    for (const card of cards) observer.observe(card);

    return () => {
      observer.disconnect();
      // Leave nothing behind: a card frozen mid-draw after a layout change
      // would keep a half-length rule for ever.
      for (const card of cards) card.classList.remove("is-onstage");
    };
  }, [layout, band, config.calm, gridKey, stageRef]);

  // Recentre the shared light when calm takes over, so a layout that reads it
  // cannot be left lit from wherever the pointer happened to be sitting.
  useEffect(() => {
    if (!config.calm) return;
    const host = hostRef.current;
    if (!host) return;
    host.style.removeProperty("--mx");
    host.style.removeProperty("--my");
  }, [hostRef, config.calm]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      motion.mouse = { x: x / rect.width, y: y / rect.height };

      const { calm, cursor, saver: sleeping, tilt } = live.current;

      // The shared pointer light. Split, Mosaic and the HUD hang a single
      // light source off these two numbers, and the HUD's planes parallax
      // from them — one input, so every layout's light agrees with every
      // other's rather than each growing its own listener.
      //
      // Written to the *host*, not the stage: it is the element the pointer is
      // measured against, and a stage-level write would be re-applied on every
      // layout change. Cheap in absolute terms but not free — a custom
      // property write invalidates style on the subtree, unlike the glow's
      // compositor-only transform below — so it stops in calm, where nothing
      // reads them.
      if (!calm) {
        host.style.setProperty("--mx", (x / rect.width).toFixed(4));
        host.style.setProperty("--my", (y / rect.height).toFixed(4));
      }

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
