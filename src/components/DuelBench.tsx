import { useEffect, useRef, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import {
  BLADE_COLORS,
  DUEL_POOLS,
  FIGHTERS,
  advanceDuel,
  createDuel,
  drawDuel,
} from "../fx/duel";
import type { DuelState, FighterStyle } from "../fx/duel";
import { ORNAMENT_PX, duelCamera } from "./DuelOrnament";
import type { DuelCam } from "./DuelOrnament";

/**
 * The duel bench — the operator's window onto the fight, on `/admin`.
 *
 * **It costs almost nothing to ship.** `src/fx/duel.ts` and `duelCamera` are
 * already in the bundle: the hero ornament and the full-canvas effect both run
 * them on every visit. This adds a component, not an engine.
 *
 * **Why it exists at all.** `scripts/duel-shot.mjs` answers *"what does this
 * frame look like"* and `scripts/duel-bench.mjs` builds a standalone page for
 * review off-site — but neither is reachable from a phone, on a call, at the
 * moment somebody says the fight looks wrong. This is. It draws the same
 * engine through the same camera the hero slot uses, at the size the hero slot
 * uses, so what is judged here is what visitors get.
 *
 * **Nothing here is a setting.** It plays, steps, scrubs speed and changes the
 * preview size and palette, and every one of those is a way of looking rather
 * than a thing that is looked at — saved nowhere, published nowhere, seen by
 * nobody else.
 *
 * The four pacing knobs used to live here on exactly that reasoning, and
 * **moved to `DuelSettingsEditor` on 2026-08-28** when the client asked for
 * *"complete options for the duels for everyone n just for myself"* and they
 * became publishable. The old note said a duel that is a different fight per
 * visitor is not a decision anybody made; that is now a decision somebody made,
 * and the surface it is made on is the one that publishes.
 *
 * Operator-gated by its caller, and gated again here, for the reason every
 * operator surface is: a bench is production furniture to anybody else.
 */

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const SIZES = [
  { px: 200, label: "phone" },
  { px: 320, label: "desk" },
  { px: 520, label: "large" },
] as const;

export function DuelBench({ enabled }: { enabled: boolean }) {
  const { config } = useConfig();
  /*
   * Read live out of a ref rather than closed over, for the same reason every
   * other duel host does it: the paint runs from a rAF callback and from the
   * Step button, both of which outlive the render that made them, and a look
   * change must not restart the fight underneath somebody watching it.
   */
  const look = config.duel;
  const lookRef = useRef(look);
  lookRef.current = look;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<DuelState | null>(null);
  const camRef = useRef<DuelCam | null>(null);
  const seenRef = useRef(0);
  /*
   * The draw, reachable from outside the loop. Everything used to live inside
   * the rAF callback, which meant **Step advanced the simulation and painted
   * nothing** until the next animation frame — and in a tab that reports
   * `document.hidden` there is no next animation frame. Stepping is the one
   * control that has to work when the loop does not; it is also how this whole
   * effect is reviewed here at all.
   */
  const paintRef = useRef<((frames: number) => void) | null>(null);

  const styles = Object.keys(FIGHTERS) as FighterStyle[];
  const [left, setLeft] = useState<FighterStyle>(DUEL_POOLS.duel.good[0]);
  const [right, setRight] = useState<FighterStyle>(DUEL_POOLS.duel.evil[0]);
  const [pal, setPal] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [size, setSize] = useState<number>(320);
  const [running, setRunning] = useState(true);
  const [readout, setReadout] = useState("");

  /*
   * Live values in a ref, read once per frame. The loop is started by the pair
   * alone — restarting it on a palette or a speed change would reset the fight
   * under the operator every time he touched a slider, which is the one thing a
   * bench must not do.
   */
  const live = useRef({ pal, speed, running, size });
  useEffect(() => {
    live.current = { pal, speed, running, size };
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const st = createDuel(left, right);
    // No pool: the pairing holds across match resets. Re-rolling the fighters
    // underneath the person reviewing them is what the site does, not what a
    // bench should.
    st.pool = null;
    /*
     * The bench judges the published fight, pacing included — the same reason
     * its `bars`, `kick` and `rim` come from `config.duel` rather than the
     * engine defaults. Assigned per frame below as well, so dragging a knob in
     * the editor above moves this without restarting the match.
     */
    st.tuning = lookRef.current.tuning;
    stateRef.current = st;
    camRef.current = null;
    seenRef.current = st.matches;

    let raf = 0;
    let last = performance.now();
    let pending = 0;
    let sinceReadout = 0;

    const paint = (frames: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const p = PALETTES[live.current.pal] ?? PALETTES[0];
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // A match reset is a cut, not a pan — the ornament's own rule.
      if (st.matches !== seenRef.current) {
        seenRef.current = st.matches;
        camRef.current = null;
      }
      const shot = duelCamera(
        st,
        canvas.width,
        canvas.height,
        camRef.current,
        frames,
        lookRef.current.zoom,
      );
      camRef.current = shot.cam;
      drawDuel(ctx, st, {
        x: shot.x,
        y: shot.y,
        scale: shot.scale,
        ink: p.fg,
        // The second tone the carve is drawn in: the palette's background role,
        // which is literally the colour these figures are standing on. A role
        // and not a literal, so it cross-fades with the 0.9s bleed like the ink
        // does — and on the pale palettes the carve reads as a light gap rather
        // than a dark rim, which is the same information either way.
        paper: p.bg,
        bladeA: BLADE_COLORS[st.a.style],
        bladeB: BLADE_COLORS[st.b.style],
        core: p.fg,
        spark: p.a2,
        line: p.line,
        /*
         * The published look, not the engine defaults.
         *
         * These were `bars: true, kick: true` with no `rim` at all, three lines
         * under a doc comment promising *"what is judged here is what visitors
         * get"* — so the one surface whose whole job is judging the fight was
         * the one drawing it in a costume nobody is shown. `look` is the
         * **site** object rather than this page's resolution: `/admin` is where
         * the bench happens to live, not what it is about, and the site default
         * is what the great majority of pages actually render.
         */
        bars: lookRef.current.bars,
        kick: lookRef.current.kick,
        rim: lookRef.current.rim,
        dim: 1,
      });
    };
    paintRef.current = paint;
    // The opening guard, drawn now rather than on the first animation frame.
    paint(1);

    const step = () => {
      raf = requestAnimationFrame(step);

      const now = performance.now();
      // Floor of 0, not 0.2 — see the note on the same clamp in `FxCanvas`.
      // 0.2 is a 300Hz frame, and rounding a faster one up ran the fight fast.
      const frames = Math.min(3, Math.max(0, (now - last) / (1000 / 60)));
      last = now;

      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected || document.hidden) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (live.current.running) {
        /*
         * Whole frames, one call each. `advanceDuel` clamps its own accumulator
         * to 4, so a single bulk call for N frames advances four however large
         * the argument — the trap `duel-shot.mjs` records. Handling the
         * fraction out here is also what makes 0.25× a real quarter-speed
         * replay of the same simulation rather than a different one.
         */
        pending += frames * live.current.speed;
        let guard = 0;
        while (pending >= 1 && guard < 8) {
          st.tuning = lookRef.current.tuning;
      advanceDuel(st, 1);
          pending -= 1;
          guard += 1;
        }
        if (guard >= 8) pending = 0;
      }

      paint(frames);

      // Four readouts a second. At sixty it is unreadable, and it would cost
      // more than the fight it reports on.
      sinceReadout += frames;
      if (sinceReadout >= 15) {
        sinceReadout = 0;
        setReadout(
          `match ${st.matches}${st.over > 0 ? " · over" : ""} — ` +
            `${st.a.style} ${Math.max(0, Math.round(st.a.health))} (${st.a.move}) · ` +
            `${st.b.style} ${Math.max(0, Math.round(st.b.health))} (${st.b.move}) — ` +
            `gap ${Math.round(Math.abs(st.a.x - st.b.x))}u`,
        );
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled, left, right]);

  if (!enabled) return null;

  const stepOne = () => {
    const st = stateRef.current;
    if (!st) return;
    setRunning(false);
    advanceDuel(st, 1);
    paintRef.current?.(1);
  };

  const reroll = () => {
    const { good, evil } = DUEL_POOLS.duel;
    const g = good[Math.floor(Math.random() * good.length)];
    const e = evil[Math.floor(Math.random() * evil.length)];
    if (Math.random() < 0.5) {
      setLeft(g);
      setRight(e);
    } else {
      setLeft(e);
      setRight(g);
    }
  };

  return (
    <section className="v-account v-duelbench">
      <h2 className="v-account-title">The duel</h2>
      <p className="v-account-note">
        The engine the hero ornament runs, through the same camera, at the size
        the hero shows it, wearing the look the whole site is set to. Play,
        step, speed and size are ways of looking — nothing here is saved,
        published or seen by anybody else. The settings themselves are above.
      </p>

      <div className="v-duelbench-rig">
        <div
          className="v-duelbench-stage"
          style={{ width: `${size}px`, height: `${size}px` }}
        >
          <canvas
            ref={canvasRef}
            width={ORNAMENT_PX}
            height={ORNAMENT_PX}
            aria-hidden="true"
          />
        </div>

        <div className="v-duelbench-side">
          <div className="v-duelbench-pair">
            <label>
              <span>Left</span>
              <select value={left} onChange={(e) => setLeft(e.target.value as FighterStyle)}>
                {styles.map((id) => (
                  <option key={id} value={id}>
                    {FIGHTERS[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Right</span>
              <select value={right} onChange={(e) => setRight(e.target.value as FighterStyle)}>
                {styles.map((id) => (
                  <option key={id} value={id}>
                    {FIGHTERS[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Palette</span>
              <select value={pal} onChange={(e) => setPal(Number(e.target.value))}>
                {PALETTES.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="v-duelbench-row">
            <button type="button" className="chip" onClick={() => setRunning((r) => !r)}>
              {running ? "pause" : "play"}
            </button>
            <button type="button" className="chip" onClick={stepOne}>
              step
            </button>
            <button type="button" className="chip" onClick={reroll}>
              ↻ roll
            </button>
          </div>

          <div className="v-duelbench-row">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${speed === s ? " is-active" : ""}`}
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="v-duelbench-row">
            {SIZES.map((s) => (
              <button
                key={s.px}
                type="button"
                className={`chip${size === s.px ? " is-active" : ""}`}
                aria-pressed={size === s.px}
                onClick={() => setSize(s.px)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="v-duelbench-readout">{readout || "…"}</p>

      <p className="v-duelbench-note">
        The pacing and the look moved to <b>What the duel does</b> above on
        2026-08-28, when they became things that publish. A knob that reaches
        visitors cannot also be a knob that does not, so there is one of each
        rather than two of one. What is left here is a way of watching a fight:
        none of it is saved and none of it is seen by anybody else.
      </p>

    </section>
  );
}
