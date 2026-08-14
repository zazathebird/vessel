import { useEffect, useRef, useState } from "react";

/**
 * Title assembly from noise (SPEC.md § motion systems, "3. Title assembly from
 * noise"). The resolved title is the default state; scrambling only decorates
 * it on top, driven by requestAnimationFrame against a performance.now() wall-
 * clock deadline — never a frame counter or setInterval, both of which a
 * throttled background tab would clamp, stranding the headline in garbage.
 *
 * Each run carries a token (runRef) so a superseded run's straggling frame can
 * never clobber a newer one's resolved text.
 */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+=<>/\\|01";
const DURATION_MS = 550;

export function useScramble(target: string, skip: boolean): string {
  const [text, setText] = useState(target);
  const runRef = useRef(0);

  useEffect(() => {
    const run = ++runRef.current;
    setText(target);
    if (skip || document.hidden) return;

    const t0 = performance.now();
    let raf = 0;

    const frame = () => {
      if (runRef.current !== run) return;
      const k = (performance.now() - t0) / DURATION_MS;
      if (k >= 1 || document.hidden) {
        setText(target);
        return;
      }
      const out = target
        .split("")
        .map((ch, i) =>
          ch === " " ? " " : i < k * target.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0],
        )
        .join("");
      setText(out);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, skip]);

  return text;
}
