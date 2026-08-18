import { useEffect, useState } from "react";

/**
 * Mark which edges of a horizontally scrolling element have content beyond
 * them, by writing `data-fade="start" | "end" | "both"` — or removing the
 * attribute entirely when the element does not scroll at all.
 *
 * **The affordance has to be attached to the fact, not to a band.** The header's
 * pill row already faded its trailing edge, on the reasoning recorded in
 * `chrome.css`: a cut letter reads as broken, a fading one reads as continuing.
 * That fade was scoped to `.band-phone`, because at the time a tablet fitted
 * "the six public pills with room to spare" — true when written, and false from
 * the moment Scams became a seventh pill. The 2026-08-16 review found the
 * original symptom reproduced exactly on the tablet band: `GUEST`, hard-edged,
 * at 600px. Binding the mask to a measurement rather than to a breakpoint is
 * what stops that happening again the next time a pill is added — and the
 * operator's nav is ten pills, which no breakpoint list was ever going to cover.
 *
 * **Both edges, because one edge was lying.** Scrolled to the end of the phone
 * row, the trailing fade still pointed right at nothing while `About` was sliced
 * flat against the left edge and two pills sat hidden behind it. An affordance
 * pointing at content that is not there is worse than none — the same argument
 * that took the fade off the tablet band originally, in the other direction.
 *
 * Written straight to the DOM rather than held in React state: this fires on
 * every scroll frame of a flick, and re-rendering the header for it would be
 * the one thing on this site that makes a decade-old machine stutter while you
 * drag. It is the same reasoning `useMotionSystems` uses for the cursor lean.
 */
/**
 * Which edges are hiding content, from three numbers. `null` means the element
 * does not scroll and must carry no attribute at all.
 *
 * **Exported and pure for the same reason `duelCamera` is** — the environment
 * this is built in cannot observe it. The tab reports `document.hidden`, so
 * `requestAnimationFrame` correctly parks and the scrolled states are
 * unreachable from a browser here; measured, zero rAF callbacks in 900ms. A
 * function taking three numbers can be stepped through every state in Node
 * instead, which is the only way this logic gets checked rather than assumed.
 *
 * The 1px dead band is on all three comparisons, not just the first: sub-pixel
 * layout means a row that fits reports a fractional slack rather than zero, and
 * a flick that lands at the end can stop a fraction short of it.
 */
export function edgeState(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): "start" | "end" | "both" | null {
  const slack = scrollWidth - clientWidth;
  if (slack <= 1) return null;
  if (scrollLeft <= 1) return "end";
  if (scrollLeft >= slack - 1) return "start";
  return "both";
}

/**
 * Returns a *callback ref*, not an effect over a ref object (2026-08-18).
 *
 * The old signature took a `RefObject` and ran its effect once — but the
 * header renders its `<nav>` conditionally (absent on Radial for visitors),
 * so the element the effect captured could be null at mount and the effect
 * never re-ran: a Radial-published site whose window narrowed to tablet got
 * the nav back with no fade, no listeners, and the hard-sliced "GUE" symptom
 * this hook exists to fix. A callback ref re-fires on every mount/unmount,
 * so the observers always hold the *live* node and detach from a dead one.
 */
export function useEdgeFade(): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const state = edgeState(el.scrollLeft, el.scrollWidth, el.clientWidth);
      if (state) el.setAttribute("data-fade", state);
      else el.removeAttribute("data-fade");
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();

    el.addEventListener("scroll", schedule, { passive: true });

    // Three things change the answer, and they are genuinely independent:
    // the box resizing, the *contents* changing without the box moving (the
    // operator's three tabs arriving when the session probe answers), and the
    // webfonts landing — six self-hosted faces load with `swap`, so every pill
    // is measured in a fallback face first and changes width underneath us.
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      mo.disconnect();
    };
  }, [el]);
  return setEl;
}
