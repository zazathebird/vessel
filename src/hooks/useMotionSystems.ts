import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { useConfig } from "../config/ConfigContext";
import type { LayoutId } from "../data/catalog";
import { motion } from "../fx/motion";

/**
 * The adapted layouts whose stylesheets read `--mx` / `--my`: Split's and
 * Mosaic's pointer light, and the HUD's parallax. **`npm run check` derives
 * the same set from the stylesheets and fails if the two disagree**, so a
 * layout that starts reading the light without being listed here — and would
 * therefore sit unlit — is caught, and so is one listed that stopped.
 */
export const POINTER_LIGHT_LAYOUTS: readonly LayoutId[] = ["split", "mosaic", "hud"];

/**
 * Does the shared pointer light get written? Only where something reads it.
 *
 * Both properties are registered `inherits: true` on `.vessel`, so every write
 * invalidates the whole page's style — for eleven of the fourteen layouts, a
 * cost with nothing drawn in return. Not in calm either, on any layout: calm
 * hides the light outright (CLAUDE.md, *Architecture*). `layout` is the
 * **adapted** one, because that is the class that reaches the DOM.
 */
export function pointerLightWrites(layout: LayoutId, calm: boolean): boolean {
  return !calm && POINTER_LIGHT_LAYOUTS.includes(layout);
}

/**
 * Coalesce a stream of values into one call per scheduled tick, with the
 * latest value — the pointer's rAF batching, pure so the gate can drive it
 * with a fake scheduler instead of a browser.
 */
export function coalesce<T, Id = number>(
  schedule: (run: () => void) => Id,
  unschedule: (id: Id) => void,
  flush: (latest: T) => void,
): { push: (value: T) => void; cancel: () => void } {
  let scheduled = false;
  let id: Id | undefined;
  let latest: T;
  return {
    push(value) {
      latest = value;
      if (scheduled) return;
      scheduled = true;
      id = schedule(() => {
        scheduled = false;
        flush(latest);
      });
    },
    cancel() {
      if (scheduled && id !== undefined) unschedule(id);
      scheduled = false;
    },
  };
}

/**
 * Motion systems 2 and 4, plus the cursor glow (SPEC.md § Motion systems).
 *
 * Everything here runs at pointer or scroll rate and writes straight to the DOM
 * and to `motion`, never to React state — a re-render per pointermove would
 * cost far more than the property writes it makes.
 *
 * **The cursor-lean card tilt is gone, deliberately** (client, 2026-09-22: "this
 * page jiggle needs to be killed"). Every card leaned toward the pointer on
 * every pointermove, and it read as the page twitching. Do not restore it; see
 * deviation 15 in docs/INVARIANTS.md.
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
  /** Changes whenever the card list does, so the card targets are re-collected. */
  gridKey: string;
}): void {
  const { config, look, band, layout, saver } = useConfig();
  const cardsRef = useRef<HTMLElement[]>([]);

  // `look.cursor` (2026-09-02): the glow is appearance, so a page override
  // reaches it. Calm has no per-page form and stays on `config`.
  // `lights` (2026-09-24): whether the shared pointer light is written at all
  // — see `pointerLightWrites`. Derived from the *adapted* layout.
  const lights = pointerLightWrites(layout, config.calm);
  const live = useRef({ calm: config.calm, cursor: look.cursor, saver, lights });
  useEffect(() => {
    live.current = { calm: config.calm, cursor: look.cursor, saver, lights };
  });

  // Re-collect the cards after every page, layout or band change, for Stack's
  // on-stage observer below.
  useEffect(() => {
    cardsRef.current = Array.from(stageRef.current?.querySelectorAll<HTMLElement>(".v-block") ?? []);
  }, [stageRef, gridKey]);

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

  // Recentre the shared light whenever nothing reads it any more — calm taking
  // over, or a layout change away from Split, Mosaic or the HUD — so a layout
  // that reads it later cannot come back lit from wherever the pointer
  // happened to be sitting.
  useEffect(() => {
    if (lights) return;
    const host = hostRef.current;
    if (!host) return;
    host.style.removeProperty("--mx");
    host.style.removeProperty("--my");
  }, [hostRef, lights]);

  useEffect(() => {
    /*
     * **One measurement and one write per frame, not per event** (2026-09-24
     * review, item 14). A pointer reports far faster than the display paints —
     * up to 1000Hz on a gaming mouse — and every event used to force a layout
     * with `getBoundingClientRect` and write two properties registered
     * `inherits: true` on `.vessel`, invalidating the style of the whole page
     * several times per painted frame. The event now only records where the
     * pointer is; the frame does the rest, once, with the latest position.
     */
    const frame = coalesce<{ x: number; y: number }>(
      (run) => requestAnimationFrame(run),
      (id) => cancelAnimationFrame(id),
      (at) => {
        const host = hostRef.current;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        const x = at.x - rect.left;
        const y = at.y - rect.top;
        motion.mouse = { x: x / rect.width, y: y / rect.height };

        const { calm, cursor, saver: sleeping, lights: writes } = live.current;

        // The shared pointer light. Split, Mosaic and the HUD hang a single
        // light source off these two numbers, and the HUD's planes parallax
        // from them — one input, so every layout's light agrees with every
        // other's rather than each growing its own listener.
        //
        // Written to the *host*, not the stage: it is the element the pointer is
        // measured against, and a stage-level write would be re-applied on every
        // layout change. **Written only where something reads it** — a custom
        // property write invalidates style on the whole subtree, unlike the
        // glow's compositor-only transform below, and eleven of the fourteen
        // layouts (and calm, on every layout) read neither. See
        // `pointerLightWrites`.
        if (writes) {
          host.style.setProperty("--mx", (x / rect.width).toFixed(4));
          host.style.setProperty("--my", (y / rect.height).toFixed(4));
        }

        const glow = glowRef.current;
        if (glow) {
          const visible = cursor && !calm && !sleeping;
          glow.classList.toggle("is-visible", visible);
          if (visible) glow.style.transform = `translate3d(${x}px,${y}px,0)`;
        }
      },
    );
    const onMove = (event: PointerEvent) => frame.push({ x: event.clientX, y: event.clientY });

    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      frame.cancel();
    };
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
