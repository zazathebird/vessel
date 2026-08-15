/**
 * How hard this machine can be pushed, measured rather than guessed.
 *
 * The brief is the client's (2026-08-14): "lets assume EVERY person is running
 * on a rig that is a decade old and is a shitbox acer. there must never ever
 * ever be lag. ever. animations MUST always flow smooth."
 *
 * `FxCanvas` already adapts continuously — it samples its own frame time and
 * moves through the resolution tiers. What it cannot do is know anything on the
 * *first* frame, so a slow machine spends its first seconds at full resolution
 * discovering that it cannot afford full resolution, and those seconds are
 * exactly the ones a first-time visitor is looking at.
 *
 * So the tier is also probed once, up front, and remembered. The probe is a
 * short burst of the same canvas work the effects actually do — arcs, strokes,
 * gradient fills, a blit — timed at the real device pixel ratio. It is not a
 * spec sheet lookup: `hardwareConcurrency` counts cores, says nothing about the
 * GPU, and is wrong in both directions. What matters is how long this machine
 * takes to fill pixels, so that is what gets timed.
 *
 * **Nothing about this is announced.** The client was explicit: "dont say the
 * site is going to do it, just have it linked to clicking ok." The greeting
 * dialog's button runs it on the way out; there is no readout and no second of
 * "checking your system", because the whole point of the greeting is that it is
 * one button and then the site.
 */

/** Resolution multipliers, best first. Shared with `FxCanvas`. */
export const TIERS = [1, 0.8, 0.62, 0.5, 0.38, 0.28];

const KEY = "vessel.perf.v1";

/**
 * The remembered tier, or null.
 *
 * Its own key, and read synchronously, for the same reason the calm and sound
 * preferences are: it has to be available during the first render, before
 * anything has been painted.
 */
export function storedTier(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const n = Number(raw);
    // Validated against the live table rather than trusted — a stored tier from
    // an older table would otherwise scale the buffer by a number that no
    // longer exists, exactly as `loadConfig` refuses a stale layout id.
    return TIERS.includes(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveTier(tier: number): void {
  try {
    localStorage.setItem(KEY, String(tier));
  } catch {
    /* private mode: the continuous adaptation still works, it just re-learns */
  }
}

/**
 * Time a burst of representative canvas work and pick a starting tier.
 *
 * Deliberately synchronous and short — a few milliseconds on any machine, and
 * it runs on a user gesture where a few milliseconds are invisible. An
 * offscreen canvas is used so nothing appears on screen.
 *
 * The work is chosen to look like the effects: `plasma`'s bucketed arcs,
 * `rain`'s blits, `bokeh`'s radial gradients and `constellation`'s strokes. A
 * synthetic loop of arithmetic would measure the JIT, which is not the thing
 * that struggles here — fill rate is.
 */
export function probeTier(): number {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 640;
    const h = 360;
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return TIERS[2];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const round = () => {
      ctx.fillStyle = "#101018";
      ctx.fillRect(0, 0, w, h);

      // Arcs in one path, the way `plasma` draws a band.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#4a4a80";
      ctx.beginPath();
      for (let i = 0; i < 500; i += 1) {
        const x = (i * 37) % w;
        const y = (i * 53) % h;
        ctx.moveTo(x + 6, y);
        ctx.arc(x, y, 6, 0, Math.PI * 2);
      }
      ctx.fill();

      // Strokes, the way `constellation` draws its links.
      ctx.strokeStyle = "#8080c0";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 220; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i * 29) % w, (i * 17) % h);
        ctx.lineTo((i * 43) % w, (i * 61) % h);
        ctx.stroke();
      }

      // Large soft gradients, the way `bokeh` does — the most expensive thing
      // any effect asks for, and the first to fall over on weak hardware.
      for (let i = 0; i < 14; i += 1) {
        const x = (i * 91) % w;
        const y = (i * 57) % h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
        g.addColorStop(0, "#6060a066");
        g.addColorStop(1, "#00000000");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 70, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // One warm-up round, discarded and *not* timed: the first touch of a fresh
    // context pays for its allocation and first upload, which is a cost the
    // real effects pay once at mount and never again. Timing it would read
    // every machine as slower than it is.
    round();
    ctx.getImageData(0, 0, 1, 1);

    const ROUNDS = 2;
    const started = performance.now();
    for (let r = 0; r < ROUNDS; r += 1) round();
    // A read forces the queued work to actually complete: without it the timing
    // measures how fast the commands were *enqueued*, which on a slow GPU is
    // the one number that looks fine.
    ctx.getImageData(0, 0, 1, 1);
    const perRound = (performance.now() - started) / ROUNDS;

    /*
     * Thresholds are per round of the burst above — roughly one busy effect
     * frame at 640×360.
     *
     * **The probe can only ever start things two tiers down.**
     *
     * It is a single short sample taken once, and a browser that happens to be
     * software-rendering at that moment — an automation host, a machine still
     * settling after load, a laptop that has just woken — will read far slower
     * than the machine really is. Meanwhile `FxCanvas` now demotes on twenty
     * frames, about a third of a second, so the cost of the probe guessing too
     * *high* is a third of a second of stutter, and the cost of it guessing too
     * *low* is a persistently soft canvas that takes several seconds to climb
     * back. The floor bounds the expensive mistake and leaves the cheap one to
     * the continuous sampling, which has far better evidence.
     */
    if (perRound < 1.6) return TIERS[0];
    if (perRound < 3.2) return TIERS[1];
    if (perRound < 6) return TIERS[2];
    return TIERS[3];
  } catch {
    // Probing must never be the thing that breaks the page.
    return TIERS[2];
  }
}

/** Probe and remember, unless a measurement is already stored. */
export function calibrateOnce(): void {
  if (storedTier() !== null) return;
  saveTier(probeTier());
}
