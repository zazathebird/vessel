import { useEffect, useMemo, useRef, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import {
  DEFAULT_DUEL_SETTINGS,
  DUEL_BANDS,
  allowFor,
  resolveDuel,
} from "../data/duelSettings";
import type { DuelOverride, DuelSettings, DuelTuning } from "../data/duelSettings";
import { PATHS } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { PALETTES } from "../data/palettes";
import {
  BLADE_COLORS,
  DUEL_POOLS,
  FIGHTERS,
  advanceDuel,
  createDuel,
  createDuelFrom,
  drawDuel,
} from "../fx/duel";
import type { FighterStyle } from "../fx/duel";
import { ORNAMENT_PX, duelCamera } from "./DuelOrnament";
import type { DuelCam } from "./DuelOrnament";

/**
 * The duel's settings, on `/admin` — what the site shows, and what each page
 * shows if it disagrees.
 *
 * ## This is the published half, and `DuelBench` is the unpublished half
 *
 * The two are deliberately separate surfaces with no overlapping control, which
 * is the codebase's usual rule about two homes for one thing read the right way
 * round: they are two *different* things. Everything here is written into
 * `Config` and reaches every visitor on the next publish. Everything on the
 * bench — play, step, speed, the preview size — is a way of *looking* at a
 * fight and is saved nowhere. **The four pacing knobs used to be on the bench
 * and moved here on 2026-08-28**, because they became publishable that day and
 * a knob that publishes cannot also be a knob that does not.
 *
 * ## Nothing here saves on its own
 *
 * Changes land in the operator's own config immediately — which is why the
 * preview and the live hero ornament both move as a slider is dragged — and
 * reach nobody else until **Publish** in the site-config panel. That is one
 * publish button for the whole appearance, not a second one here: two publish
 * routes for one config is two things that can disagree about what is live.
 */

const PAGE_LABELS: { id: PageId; label: string }[] = (
  Object.keys(PATHS) as PageId[]
).map((id) => ({ id, label: id }));

const KNOBS = [
  {
    key: "circling" as const,
    label: "Circling",
    note: "Weight of the seven modules that contain no blow. At 1 they are 30.6% of every pick, and the heaviest of them is pure walking.",
  },
  {
    key: "rest" as const,
    label: "Rest",
    note: "The pause after each exchange. The moves themselves are never scaled — their frame counts are what every reaction is derived from.",
  },
  {
    key: "impact" as const,
    label: "Impact",
    note: "Frames of hit-stop a contact buys. At 1 it is 1.9% of all frames.",
  },
  {
    key: "patience" as const,
    label: "Patience",
    note: "How long before a match filters to modules that land. Lower ends fights sooner.",
  },
];

const LOOK = [
  {
    key: "rim" as const,
    label: "Carve",
    note: "How far each shape's edge is cut out of what is behind it. At 0 the carve is off and the fighters go back to flat wire — that is the rollback, not a look.",
  },
  {
    key: "zoom" as const,
    label: "Size",
    note: "How large the pair is drawn in the hero slot.",
  },
];

/** Which fields this page states for itself, so the editor can say so. */
function overriddenKeys(over: DuelOverride | undefined): (keyof DuelSettings)[] {
  return over ? (Object.keys(over) as (keyof DuelSettings)[]) : [];
}

/**
 * Which pacing knobs this page states for itself.
 *
 * Separate from `overriddenKeys` because `tuning` is one key holding four, and
 * counting it as one is what let the editor report *"work sets 1 of its own:
 * tuning"* while the page had in fact pinned all four — see `DuelOverride`.
 */
function overriddenTuning(over: DuelOverride | undefined): (keyof DuelTuning)[] {
  return over?.tuning ? (Object.keys(over.tuning) as (keyof DuelTuning)[]) : [];
}

export function DuelSettingsEditor({ enabled }: { enabled: boolean }) {
  const { config, update, say } = useConfig();
  /** `null` is the site default; a page id is that page's override. */
  const [target, setTarget] = useState<PageId | null>(null);
  const [pal, setPal] = useState(0);

  const site = config.duel;
  const over = target ? config.duelPages[target] : undefined;
  const value = useMemo(
    () => (target ? resolveDuel(site, config.duelPages, target) : site),
    [site, config.duelPages, target],
  );
  const overrides = overriddenKeys(over);
  /*
   * Named one level deep, because `tuning` is one key holding four and saying
   * "1 of its own: tuning" was true of the object and misleading about the
   * page — it read as one knob pinned when it was all four. Now that an
   * override can carry a single knob, the summary has to be able to say so.
   */
  const stated = overrides
    .flatMap((k) => (k === "tuning" ? overriddenTuning(over) : [k]))
    .map(String);

  /**
   * Write one field to whichever target is selected.
   *
   * Editing a page writes **only that field** into its override, which is what
   * keeps an override partial — a page that has been told about `zoom` and
   * nothing else keeps tracking the site default for everything else, so moving
   * the site default still moves it. Writing the whole resolved object here
   * would freeze today's values onto that page for ever, silently.
   */
  const set = <K extends keyof DuelSettings>(key: K, v: DuelSettings[K]) => {
    if (!target) {
      update({ duel: { ...site, [key]: v } });
      return;
    }
    update({
      duelPages: { ...config.duelPages, [target]: { ...over, [key]: v } },
    });
  };

  /**
   * Write one *pacing knob*, one level further down.
   *
   * `set("tuning", { ...value.tuning, [key]: v })` is what this used to be, and
   * `value` is the **resolved** settings — so touching one knob on a page wrote
   * all four at their current resolved values and froze the other three there
   * for ever. Reproduced signed in: Patience on `/work`, then the site's
   * Circling 1.00 → 2.50, and `/work` stayed at 1.00. The site object has no
   * such problem and keeps the whole-object write, because there is nothing
   * above it to track.
   */
  const setTuning = (key: keyof DuelTuning, v: number) => {
    if (!target) {
      update({ duel: { ...site, tuning: { ...site.tuning, [key]: v } } });
      return;
    }
    update({
      duelPages: {
        ...config.duelPages,
        [target]: { ...over, tuning: { ...(over?.tuning ?? {}), [key]: v } },
      },
    });
  };

  const clearPage = () => {
    if (!target) return;
    const next = { ...config.duelPages };
    delete next[target];
    update({ duelPages: next });
    say(`${target} follows the site again.`);
  };

  const resetSite = () => {
    update({ duel: { ...DEFAULT_DUEL_SETTINGS, tuning: { ...DEFAULT_DUEL_SETTINGS.tuning } } });
    say("Site duel back to the defaults.");
  };

  // ---- the preview --------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ value, pal });
  useEffect(() => {
    live.current = { value, pal };
  });

  /*
   * Rebuilt only when the *fight* changes — a pin or a roster restriction —
   * and never when the look or the pacing does. Dragging a slider must not
   * restart the match underneath the person who is dragging it to watch a
   * match.
   */
  useEffect(() => {
    if (!enabled) return undefined;
    const st = value.pin
      ? createDuel(value.pin[0], value.pin[1])
      : createDuelFrom("duel", Math.random, allowFor(value, "duel"));
    let raf = 0;
    let last = performance.now();
    let cam: DuelCam | null = null;
    let seen = st.matches;

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
      const { value: v, pal: pi } = live.current;
      /*
       * **The preview runs at the tuning it is previewing.** It used to read
       * the engine's global, which the hero ornament on this same page had
       * pushed `/admin`'s settings into — so selecting a page target and
       * dragging Circling, Rest, Impact or Patience wrote the value into
       * `duelPages[target]` and changed nothing on screen. The one surface
       * built to judge the pacing was the one that could not show it, and it is
       * the surface the client is meant to settle these numbers on.
       */
      st.tuning = v.tuning;
      advanceDuel(st, frames);
      const p = PALETTES[pi] ?? PALETTES[0];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (st.matches !== seen) {
        seen = st.matches;
        cam = null;
      }
      // Size goes through the camera, not over it — see the note on
      // `duelCamera`'s `zoom`. Multiplying `shot.scale` here is what this
      // preview used to do, and it is why the slider appeared to work while the
      // published site ignored it: this canvas was the only consumer in the
      // codebase. The preview has to reach the fight by the same route the
      // ornament does or it is a preview of something nobody is shown.
      const shot = duelCamera(st, canvas.width, canvas.height, cam, frames, v.zoom);
      cam = shot.cam;
      drawDuel(ctx, st, {
        x: shot.x,
        y: shot.y,
        scale: shot.scale,
        ink: p.fg,
        paper: p.bg,
        bladeA: BLADE_COLORS[st.a.style],
        bladeB: BLADE_COLORS[st.b.style],
        core: p.fg,
        spark: p.a2,
        line: p.line,
        bars: v.bars,
        kick: v.kick,
        rim: v.rim,
        dim: 1,
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled, value.pin, value.good, value.evil]);

  if (!enabled) return null;

  const sides = [
    { side: "good" as const, label: "Good", ids: DUEL_POOLS.duel.good },
    { side: "evil" as const, label: "Evil", ids: DUEL_POOLS.duel.evil },
  ];

  return (
    <section className="v-account v-duelset">
      <h2 className="v-account-title">What the duel does</h2>
      <p className="v-account-note">
        Applies to everybody once you publish. Pick a page to give that one page
        different settings; anything you leave alone there keeps following the
        site.
      </p>

      <div className="v-duelset-target" role="group" aria-label="What these settings apply to">
        <button
          type="button"
          className="v-duelset-tab"
          aria-pressed={target === null}
          onClick={() => setTarget(null)}
        >
          Whole site
        </button>
        {PAGE_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="v-duelset-tab"
            aria-pressed={target === id}
            onClick={() => setTarget(id)}
          >
            {label}
            {config.duelPages[id] ? <span aria-hidden="true"> ·</span> : null}
            {config.duelPages[id] ? (
              <span className="v-duelset-sr"> (has its own settings)</span>
            ) : null}
          </button>
        ))}
      </div>

      <p className="v-duelset-state" role="status">
        {target === null
          ? "Editing the whole site."
          : overrides.length === 0
            ? `${target} follows the site. Change anything below and it stops.`
            : `${target} sets ${stated.length} of its own: ${stated.join(", ")}.`}
      </p>

      <div className="v-duelset-rig">
        <div className="v-duelset-stage">
          <canvas
            ref={canvasRef}
            width={ORNAMENT_PX}
            height={ORNAMENT_PX}
            aria-hidden="true"
          />
          <label className="v-duelset-pal">
            <span>Preview palette</span>
            <select value={pal} onChange={(e) => setPal(Number(e.target.value))}>
              {PALETTES.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="v-duelset-controls">
          {/* ---- who fights ------------------------------------------- */}
          <fieldset className="v-duelset-group">
            <legend>Who fights</legend>
            <label className="v-duelset-check">
              <input
                type="checkbox"
                checked={value.pin !== null}
                onChange={(e) =>
                  set(
                    "pin",
                    e.target.checked
                      ? [DUEL_POOLS.duel.good[0], DUEL_POOLS.duel.evil[0]]
                      : null,
                  )
                }
              />
              <span>Always these two</span>
            </label>
            {value.pin ? (
              <div className="v-duelset-pair">
                {[0, 1].map((i) => (
                  <label key={i}>
                    <span>{i === 0 ? "One" : "The other"}</span>
                    <select
                      value={value.pin![i]}
                      onChange={(e) => {
                        const next: [FighterStyle, FighterStyle] = [...value.pin!] as [
                          FighterStyle,
                          FighterStyle,
                        ];
                        next[i] = e.target.value as FighterStyle;
                        set("pin", next);
                      }}
                    >
                      {(Object.keys(FIGHTERS) as FighterStyle[]).map((id) => (
                        <option key={id} value={id}>
                          {FIGHTERS[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="v-duelset-note">
                A new pair walks on for every match, drawn from whoever is ticked
                below.
              </p>
            )}
          </fieldset>

          {/* ---- who may appear ---------------------------------------- */}
          <fieldset className="v-duelset-group">
            <legend>Who may appear</legend>
            <p className="v-duelset-note">
              Untick anyone you would rather not see. Untick a whole side and it
              comes back — a side with nobody in it draws nothing, which looks
              like a broken page.
            </p>
            <div className="v-duelset-rosters">
              {sides.map(({ side, label, ids }) => (
                <div key={side} className="v-duelset-roster">
                  <h3>{label}</h3>
                  {ids.map((id) => {
                    const list = value[side];
                    const on = list === null || list.includes(id);
                    return (
                      <label key={id} className="v-duelset-fighter">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            const base = list ?? ids;
                            const next = e.target.checked
                              ? Array.from(new Set([...base, id]))
                              : base.filter((x) => x !== id);
                            // All of them ticked is the same fact as "no
                            // restriction", and null is the version that keeps
                            // up with the roster.
                            set(side, next.length === ids.length ? null : next);
                          }}
                        />
                        <span
                          className="v-duelset-blade"
                          style={{ background: BLADE_COLORS[id] }}
                          aria-hidden="true"
                        />
                        <span>{FIGHTERS[id].label}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </fieldset>

          {/* ---- how it fights ----------------------------------------- */}
          <fieldset className="v-duelset-group">
            <legend>How it fights</legend>
            {KNOBS.map(({ key, label, note }) => {
              const [lo, hi] = DUEL_BANDS[key];
              return (
                <label key={key} className="v-duelset-slider">
                  <span className="v-duelset-slider-head">
                    {label}
                    <b>{value.tuning[key].toFixed(2)}</b>
                  </span>
                  <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={0.05}
                    value={value.tuning[key]}
                    onChange={(e) => setTuning(key, Number(e.target.value))}
                  />
                  <small>{note}</small>
                </label>
              );
            })}
          </fieldset>

          {/* ---- how it looks ------------------------------------------ */}
          <fieldset className="v-duelset-group">
            <legend>How it looks</legend>
            {LOOK.map(({ key, label, note }) => {
              const [lo, hi] = DUEL_BANDS[key];
              return (
                <label key={key} className="v-duelset-slider">
                  <span className="v-duelset-slider-head">
                    {label}
                    <b>{value[key].toFixed(2)}</b>
                  </span>
                  <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={0.05}
                    value={value[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                  />
                  <small>{note}</small>
                </label>
              );
            })}
            <label className="v-duelset-check">
              <input
                type="checkbox"
                checked={value.bars}
                onChange={(e) => set("bars", e.target.checked)}
              />
              <span>Health bars in the hero slot</span>
            </label>
            <label className="v-duelset-check">
              <input
                type="checkbox"
                checked={value.kick}
                onChange={(e) => set("kick", e.target.checked)}
              />
              <span>A landed blow jolts the frame</span>
            </label>
            <p className="v-duelset-note">
              Bars and the jolt are the hero slot only. Behind body copy the
              fight stays still and unlabelled, because a readout the reader has
              to look past is one they did not ask for.
            </p>
          </fieldset>

          <div className="v-duelset-actions">
            {target ? (
              <button
                type="button"
                className="v-btn"
                onClick={clearPage}
                disabled={overrides.length === 0}
              >
                Follow the site again
              </button>
            ) : (
              <button type="button" className="v-btn" onClick={resetSite}>
                Back to the defaults
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
