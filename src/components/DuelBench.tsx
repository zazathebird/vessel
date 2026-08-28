import { useEffect, useRef, useState } from "react";

import { PALETTES } from "../data/palettes";
import {
  BLADE_COLORS,
  DUEL_POOLS,
  DUEL_TUNING,
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
 * **The four knobs are a tuning surface, not a setting** (`DUEL_TUNING`). They
 * are not in `Config`, not published, not in a share code and not persisted:
 * turn one, watch, and the value that wins gets typed into the engine as the
 * new constant. A duel that is a different fight per visitor is not a decision
 * anybody made — and it would also be unreviewable, since no two people would
 * be discussing the same fight.
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

/** The knobs, with the band each slider spans. Order is the order they matter. */
const KNOBS = [
  {
    key: "circling" as const,
    label: "Circling",
    lo: 0,
    hi: 2,
    note: "Weight of the seven modules that contain no blow. At 1 they are 30.6% of every pick.",
  },
  {
    key: "rest" as const,
    label: "Rest",
    lo: 0,
    hi: 2,
    note: "The pause after each exchange. Moves themselves are never scaled — their frame counts are what every reaction is derived from.",
  },
  {
    key: "impact" as const,
    label: "Impact",
    lo: 0,
    hi: 4,
    note: "Frames of hit-stop a contact buys. At 1 it is 1.9% of all frames.",
  },
  {
    key: "patience" as const,
    label: "Patience",
    lo: 0.3,
    hi: 2,
    note: "How long before a match starts filtering to modules that land. Lower ends fights sooner.",
  },
];

export function DuelBench({ enabled }: { enabled: boolean }) {
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
  const [tuning, setTuning] = useState({ ...DUEL_TUNING });
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

  /* The knobs are module state on the engine, so write them straight through. */
  useEffect(() => {
    Object.assign(DUEL_TUNING, tuning);
  }, [tuning]);

  useEffect(() => {
    if (!enabled) return undefined;

    const st = createDuel(left, right);
    // No pool: the pairing holds across match resets. Re-rolling the fighters
    // underneath the person reviewing them is what the site does, not what a
    // bench should.
    st.pool = null;
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
      const shot = duelCamera(st, canvas.width, canvas.height, camRef.current, frames);
      camRef.current = shot.cam;
      drawDuel(ctx, st, {
        x: shot.x,
        y: shot.y,
        scale: shot.scale,
        ink: p.fg,
        bladeA: BLADE_COLORS[st.a.style],
        bladeB: BLADE_COLORS[st.b.style],
        core: p.fg,
        spark: p.a2,
        line: p.line,
        bars: true,
        kick: true,
        dim: 1,
      });
    };
    paintRef.current = paint;
    // The opening guard, drawn now rather than on the first animation frame.
    paint(1);

    const step = () => {
      raf = requestAnimationFrame(step);

      const now = performance.now();
      const frames = Math.min(3, Math.max(0.2, (now - last) / (1000 / 60)));
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
        the hero shows it. The four sliders are a tuning surface — nothing here
        is saved, published or seen by anybody else.
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

      <div className="v-duelbench-knobs">
        {KNOBS.map((k) => (
          <label key={k.key} className="v-duelbench-knob">
            <span className="v-duelbench-knob-head">
              {k.label}
              <b>{tuning[k.key].toFixed(2)}</b>
            </span>
            <input
              type="range"
              min={k.lo}
              max={k.hi}
              step={0.05}
              value={tuning[k.key]}
              onChange={(e) =>
                setTuning((t) => ({ ...t, [k.key]: Number(e.target.value) }))
              }
            />
            <span className="v-duelbench-knob-note">{k.note}</span>
          </label>
        ))}
      </div>

      <div className="v-duelbench-row">
        <button
          type="button"
          className="chip"
          onClick={() => setTuning({ rest: 1, circling: 1, impact: 1, patience: 1 })}
        >
          back to the shipped fight
        </button>
      </div>
    </section>
  );
}
