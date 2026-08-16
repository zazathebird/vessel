import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { play, releaseAudio, setAudioPalette } from "../audio/engine";
import type { VoiceId } from "../audio/engine";
import { MAIL } from "../data/mail";
import { MODES } from "../data/catalog";
import type { ModeId } from "../data/catalog";
import { PALETTES, paletteIndexForHour } from "../data/palettes";
import { PATHS, pageFromPath } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { adaptLayout, bandForWidth, isAdapted } from "./bands";
import type { Band } from "./bands";
import {
  SAVE_DEBOUNCE_MS,
  calmPreference,
  hasVisited,
  loadConfig,
  saveCalmPreference,
  saveConfig,
} from "./persistence";
import { describeRoll, roll } from "./randomiser";
import { useSession } from "../auth/SessionContext";
import { DEFAULT_CONFIG } from "./types";
import type { Config } from "./types";

interface ConfigContextValue {
  config: Config;
  /**
   * Calm is on because the OS asked for reduced motion and the visitor has
   * expressed no preference of their own. Read by `Greeting.tsx`, which is the
   * only place that tells them so.
   */
  calmBySystem: boolean;
  /** Settle the reduced-motion question for good. See `chooseMotion`. */
  chooseMotion: (moving: boolean) => void;
  /** Merge a partial update into config. */
  update: (patch: Partial<Config>) => void;
  /** Navigate — pushes a real URL, dives the stage, and applies per-page rolls. */
  go: (page: PageId) => void;
  /** Operator shuffle. Announces the result; a blocked roll toasts instead. */
  shuffle: () => void;
  band: Band;
  /** The layout actually rendered, after small-screen collapsing. */
  layout: Config["layout"];
  adapted: boolean;
  toast: string;
  /** Toast. `silent` suppresses the sound for callers that are not a gesture. */
  say: (message: string, opts?: { silent?: boolean }) => void;
  /**
   * Fire an interface sound. A no-op unless the visitor has switched sound on,
   * and always a no-op in calm.
   *
   * Exposed rather than left inside this module because the components that
   * know an interaction happened are the ones that should name it — a dialog
   * knows it is opening, and nothing here can infer that from a state change.
   */
  chime: (voice: VoiceId) => void;
  /** HH:MM · local, ticking. */
  clock: string;

  // ---- ephemeral UI state — deliberately not persisted (see SPEC.md § State) ----
  /** Mid page-transition: the stage is diving rather than resting. */
  diving: boolean;
  /** Increments per navigation; alternates which iris animation resolves the stage in. */
  nav: number;
  panelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;
  doorOpen: boolean;
  /** Which unlock route fired, e.g. "unlocked via five taps". Shown in the door modal. */
  doorVia: string;
  /** Opens the door. Returns false for a non-operator, so a route can decline to eat its keystroke. */
  openDoor: (via: string) => boolean;
  closeDoor: () => void;
  /** authenticate: sets unlocked, opens the panel, closes the door. Theatre — see CLAUDE.md. */
  openConfig: () => void;
  /** Screensaver active. Disabled entirely in calm; click-only wake. */
  saver: boolean;
  /** Restart the idle clock. Called on click and keypress — never on movement. */
  poke: () => void;
  /** Hold the screensaver off while something is being read rather than used. Reference-counted. */
  holdSaver: (held: boolean) => void;
  /** Has the address been revealed on this page. Resets on every page change. */
  mailShown: boolean;
  /** Reveal the address, copy it to the clipboard, and toast. */
  revealMail: () => void;
  /** Has the footer's sign-in link been found this visit. Never resets mid-visit. */
  signinShown: boolean;
  /** Reveal the footer's sign-in link — five taps on the hero ornament. */
  revealSignin: () => void;
  /** Switch randomiser mode, applying the new mode's immediate effect. */
  setMode: (mode: ModeId) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} · local`;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  // Reading a context is not fetching: §11's rule that this provider stays
  // synchronous is about the boot path, and `SessionProvider` sits above it
  // holding an answer that arrives whenever it arrives.
  const { isOperator } = useSession();

  /*
   * Boot state, read from storage during the first render so there is no flash
   * of the default palette.
   *
   * `loadConfig()` is called once and its result kept, rather than called again
   * later to recover what the reduced-motion override replaced: `chooseMotion`
   * has to put `grain` and `breathe` back exactly as the visitor arrived with
   * them, and a second call would be a second source of truth for that.
   */
  const [boot] = useState(() => {
    if (typeof window === "undefined") {
      const config = { ...DEFAULT_CONFIG };
      return { loaded: config, systemCalm: false, config };
    }
    const loaded = loadConfig();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    /*
     * Reduced motion lands the visitor in calm automatically — still a settled
     * decision, and unchanged for anyone who has not touched the chip.
     *
     * What changed (2026-08-14, client report): it no longer overrides an
     * *expressed* preference. This spread sat after `loaded`, so it beat
     * `storedCalm()` every time — a visitor with OS reduce-motion who clicked
     * calm off had `vessel.calm.v1 = "0"` written, and then had it read and
     * discarded one line later, on every reload, for ever. `persistence.ts` says
     * in as many words that either direction is a preference; this was the code
     * disagreeing with it.
     *
     * `null` means no preference was ever expressed, which is the only case the
     * OS hint should decide. The CSS half of the same fix is in base.css.
     *
     * **`systemCalm` names that case, and it is on the context because the
     * visitor has to be told** (2026-08-16, client report: "nothing on the site
     * is live, no moving animations"). Honouring the hint is right; doing it
     * silently is not. Everything stops, the canvas goes to `opacity: 0`, and
     * the greeting then insists the background moves and explains how to stop
     * it — so the one dialog on the page contradicts the page. That reads as a
     * broken site, not a considerate one. See `Greeting.tsx`.
     */
    const systemCalm = reduced && calmPreference() === null;
    const motion = systemCalm ? { calm: true, grain: false, breathe: false } : null;
    return {
      loaded,
      systemCalm,
      config: { ...loaded, ...motion, page: pageFromPath(window.location.pathname) },
    };
  });

  const [config, setConfig] = useState<Config>(boot.config);

  /**
   * Calm is on because the operating system asked for it, and the visitor has
   * still expressed nothing either way.
   *
   * Re-derived from the stored preference rather than latched, so it goes false
   * the moment *any* of the four toggles writes one — the header chip, the
   * panel, the command palette or the greeting — and cannot be left claiming
   * "your computer chose this" about a state the visitor chose themselves.
   */
  const calmBySystem = useMemo(
    () => boot.systemCalm && config.calm && calmPreference() === null,
    [boot.systemCalm, config.calm],
  );

  const [band, setBand] = useState<Band>(() =>
    typeof window === "undefined" ? "desk" : bandForWidth(window.innerWidth),
  );
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState(() => formatClock(new Date()));

  const [diving, setDiving] = useState(false);
  const [nav, setNav] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [doorVia, setDoorVia] = useState("");
  const [saver, setSaver] = useState(false);
  const [mailShown, setMailShown] = useState(false);
  const [signinShown, setSigninShown] = useState(false);
  const [saverHeld, setSaverHeld] = useState(false);

  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const diveTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const saverHolds = useRef(0);

  // The idle timer fires a minute after the last click, long after the render
  // that armed it, so it reads current state from a ref rather than a closure.
  // `go` reads the same ref: a setConfig updater has to be pure, and StrictMode
  // double-invokes it, so the branch it takes cannot live inside one.
  const live = useRef({ config, panelOpen, doorOpen, saverHeld });
  useEffect(() => {
    live.current = { config, panelOpen, doorOpen, saverHeld };
  });

  // The synth is tuned by the palette, the same way everything visible is
  // coloured by it — see `src/audio/engine.ts`. Pushed rather than pulled so
  // the audio module imports nothing and cannot hold a second opinion about
  // which palette is current.
  useEffect(() => {
    setAudioPalette(config.pal);
  }, [config.pal]);

  // Give the audio device back the moment sound is not wanted. A live
  // AudioContext marks the tab as playing audio and can hold a Bluetooth
  // headset in its high-latency profile; somebody who switched this off, or who
  // is in calm, should not pay for it. `play` rebuilds it on demand.
  useEffect(() => {
    if (!config.sound || config.calm) releaseAudio();
  }, [config.sound, config.calm]);

  /**
   * The gate every sound passes through: off unless the visitor asked for it,
   * and off in calm regardless. Calm is the site's quiet mode in every other
   * sense — no motion, no shadow, no canvas — and it would be a strange one
   * that still chimed.
   *
   * Reads `live.current` rather than `config` so it needs no dependency list
   * and cannot go stale in a callback. The one-render lag that costs is
   * irrelevant here and is deliberately worked around in the sound toggle
   * itself, which knows the value it is setting and plays its own confirmation.
   */
  const lastChime = useRef(0);
  const chime = useCallback((voice: VoiceId) => {
    const current = live.current.config;
    if (!current.sound || current.calm) return;
    const now = performance.now();
    // A toast almost always accompanies an action that already has a voice —
    // shuffle is the obvious one. Without this, rolling the dice plays the
    // flourish and then a tick on top of it.
    if (voice === "toast" && now - lastChime.current < 150) return;
    lastChime.current = now;
    play(voice);
  }, []);

  /**
   * `silent` is for the callers that are not a gesture.
   *
   * Almost every toast follows something the visitor just did, so a tick is
   * feedback. The exceptions are the ones a *timer* or a *socket* raises — the
   * hourly time-of-day palette change, and a `replaced` frame arriving on the
   * signalling socket — and those must stay quiet, because `src/audio/engine.ts`
   * promises nothing plays without a gesture and a promise with an exception in
   * it is not one.
   */
  const say = useCallback(
    (message: string, opts?: { silent?: boolean }) => {
      window.clearTimeout(toastTimer.current);
      setToast(message);
      if (!opts?.silent) chime("toast");
      toastTimer.current = window.setTimeout(() => setToast(""), 2600);
    },
    [chime],
  );

  const update = useCallback((patch: Partial<Config>) => {
    // Freshen the ref in the same tick, not just in the post-render effect.
    //
    // `live.current` is what `chime` reads, and inside one event handler the
    // effect has not run yet — so a handler that called `update({ sound: false })`
    // and then `say(...)` chimed anyway, on the previous render's `sound: true`.
    // The sound toggle's own "switching off stays silent" was therefore false,
    // and worse, the release effect closed the AudioContext a frame later, mid
    // envelope, turning the tone it should never have played into a click. Same
    // shape for calm: turning the accessibility escape hatch *on* announced
    // itself with a truncated tick.
    //
    // Writing a ref from an event handler is safe — this is not render — and it
    // only ever makes `live.current` fresher than the effect would.
    live.current = { ...live.current, config: { ...live.current.config, ...patch } };
    setConfig((previous) => ({ ...previous, ...patch }));
  }, []);

  /**
   * The greeting's answer, and the only route out of OS-forced calm a visitor
   * is ever shown (`calmBySystem`).
   *
   * It writes the preference **either way**, which is the load-bearing part: an
   * unanswered hint is what makes the site look broken on every load, so the
   * one dialog that raises it has to settle it. Whichever button is pressed,
   * `calmBySystem` is false from here on and nothing asks again.
   *
   * Turning motion on restores `grain` and `breathe` from the config the
   * visitor actually arrived with — not from `DEFAULT_CONFIG` — so a site
   * published without grain does not quietly acquire it here.
   */
  const chooseMotion = useCallback(
    (moving: boolean) => {
      saveCalmPreference(!moving);
      if (!moving) {
        update({ calm: true });
        return;
      }
      update({ calm: false, grain: boot.loaded.grain, breathe: boot.loaded.breathe });
    },
    [update, boot.loaded.grain, boot.loaded.breathe],
  );

  const shuffle = useCallback(() => {
    // roll() is random and say() dispatches state — neither may live inside a
    // setConfig updater, which StrictMode double-invokes (the same purity rule
    // `go` was already fixed for). The roll happens here; the updater applies it.
    const result = roll(live.current.config);
    if (!result) {
      // 60 attempts all blocked — the scope switches have painted into a corner.
      chime("deny");
      say("nothing legal to roll");
      return;
    }
    chime("shuffle");
    say(describeRoll(result));
    setConfig((previous) => ({ ...previous, ...result }));
  }, [say, chime]);

  /**
   * The address is never in static markup — it is assembled from parts at
   * runtime, and this is the only place it exists as a whole string.
   */
  const revealMail = useCallback(() => {
    setMailShown(true);
    // Never claim a success that did not happen (the TotpEnrol convention).
    // The address is on screen either way; the toast says which it was.
    const written = navigator.clipboard?.writeText(MAIL);
    if (!written) {
      say("address revealed — copy it by hand");
      return;
    }
    written.then(
      () => say("address copied"),
      () => say("address revealed — copy it by hand"),
    );
  }, [say]);

  // Unlike the address, a found sign-in link does not un-find itself on
  // navigation — it lasts the visit. A reload starts the hunt over, which is
  // the point of it being found rather than shown.
  const revealSignin = useCallback(() => setSigninShown(true), []);

  const setMode = useCallback(
    (mode: ModeId) => {
      // The roll and the clock read stay outside the updater — same purity
      // rule as `go` and `shuffle`.
      let patch: Partial<Config> = { mode };
      // Picking a mode applies it immediately, so the operator sees what they chose.
      if (mode === "tod") {
        patch = { mode, pal: paletteIndexForHour(new Date().getHours()) };
      } else if (mode === "visit") {
        const result = roll({ ...live.current.config, mode });
        if (result) patch = { mode, ...result };
      }
      setConfig((previous) => ({ ...previous, ...patch }));
      say(MODES.find((m) => m.id === mode)?.label ?? mode);
    },
    [say],
  );

  // ---- screensaver ----
  // Sixty seconds without a *click* fades the interface out. Mouse movement
  // deliberately does not count, so leaving the pointer drifting over the page
  // still lets it sleep. Disabled entirely in calm, and the panel and door hold
  // it off — they are fixed-position siblings the fade cannot reach.
  const poke = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    setSaver((sleeping) => (sleeping ? false : sleeping));
    idleTimer.current = window.setTimeout(() => {
      const { config: cfg, panelOpen: panel, doorOpen: door, saverHeld: held } = live.current;
      if (cfg.calm || panel || door || held) return;
      setSaver(true);
    }, 60_000);
  }, []);

  /**
   * Hold the screensaver off while something on screen is being *read* rather
   * than used.
   *
   * The idle clock counts clicks and keypresses, never movement, which is right
   * for a site you browse — and wrong for the one screen that exists to be
   * copied down by hand. Ten recovery codes take well over a minute to
   * transcribe, during which a person touches nothing, and the reward for doing
   * it carefully was watching the codes fade out. They come back on a click and
   * nothing is lost, but losing your place mid-transcription on the screen that
   * only ever renders once is a poor joke to play.
   *
   * A counter rather than a boolean because two holders must not be able to
   * cancel each other by unmounting in the wrong order. The panel and the door
   * stay separate rather than moving to this: they suppress the saver as a
   * consequence of being open, which the existing check already reads directly.
   */
  const holdSaver = useCallback((held: boolean) => {
    saverHolds.current = Math.max(0, saverHolds.current + (held ? 1 : -1));
    setSaverHeld(saverHolds.current > 0);
  }, []);

  useEffect(() => {
    poke();
    return () => window.clearTimeout(idleTimer.current);
    // Opening or closing an overlay restarts the clock, so it can never be left
    // armed from before the panel opened. A hold does the same, and it also
    // wakes an already-sleeping interface — a hold that began while the chrome
    // was faded out would otherwise keep it faded until the next click.
  }, [poke, panelOpen, doorOpen, saverHeld]);

  // ---- first load: per-visit and time-of-day ----
  // Time of day must NOT override a first visit: Nebula Drift wins on load, and
  // the clock only takes over on a return visit or when the hour actually changes.
  const bootHour = useRef<number>(new Date().getHours());
  useEffect(() => {
    const returning = hasVisited();
    // The roll happens out here and the updater stays pure — StrictMode
    // double-invokes updaters, and a roll inside one applies a different
    // combination than it announces.
    const cfg = live.current.config;
    if (cfg.mode === "visit") {
      const result = roll(cfg);
      if (result) setConfig((previous) => ({ ...previous, ...result }));
    } else if (cfg.mode === "tod" && returning) {
      const pal = paletteIndexForHour(new Date().getHours());
      setConfig((previous) => ({ ...previous, pal }));
    }
    // Intentionally runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A revealed address does not follow the visitor to the next page.
  useEffect(() => {
    setMailShown(false);
  }, [config.page]);

  // ---- clock tick, and the hour-change hook for time-of-day ----
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = new Date();
      setClock(formatClock(now));
      const hour = now.getHours();
      if (hour === bootHour.current) return;
      bootHour.current = hour;

      // Decided out here, not inside the updater. `say` dispatches state, arms
      // a timer on a ref and can fire a sound — and a `setConfig` updater must
      // be pure, because StrictMode double-invokes it. `shuffle`, `setMode`,
      // `go` and the boot effect each carry that reasoning already; this was
      // the one call site that still did it inside.
      const current = live.current.config;
      if (current.mode !== "tod") return;
      const pal = paletteIndexForHour(hour);
      if (pal === current.pal) return;
      setConfig((previous) =>
        previous.mode === "tod" && previous.pal !== pal ? { ...previous, pal } : previous,
      );
      // `silent` because **this is a timer, and nothing on a timer may make a
      // sound**. `src/audio/engine.ts` promises there is no ambient bed, no loop
      // and no timer, and an hourly palette announcement that chimed would have
      // been all three at once: with `mode: "tod"` and `sound` both published, a
      // page nobody had touched would build an AudioContext and queue a voice
      // into a suspended clock, which then fired late, attached to nothing, the
      // moment the visitor finally clicked something.
      say(PALETTES[pal].name, { silent: true });
    }, 1000);
    return () => window.clearInterval(id);
  }, [say]);

  // ---- debounced persistence ----
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveConfig(config), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(saveTimer.current);
  }, [config]);

  // ---- band tracking ----
  useEffect(() => {
    const onResize = () => setBand(bandForWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- routing ----
  // Valve dive on navigation (motion system 5): a 620ms transform runs on the whole
  // stage — scale up with blur while fading out, then an instant cut and a resolve
  // back to 1. The page swap itself commits at the 300ms mark, mid-blur, so the
  // ugly transition is hidden. Calm mode skips the dive and cuts instantly.
  const go = useCallback((page: PageId) => {
    poke();
    if (live.current.config.page === page) return;
    // Fired here, not in `commit`: the dive takes 300ms before the page swaps,
    // and a sound that waited for it would land after the motion it belongs to.
    chime("nav");

    const commit = () => {
      if (window.location.pathname !== PATHS[page]) {
        window.history.pushState({}, "", PATHS[page]);
      }
      // Rolled out here rather than inside the updater: roll() is random, and a
      // double-invoked updater would spend two rolls to apply one.
      const current = live.current.config;
      const result = current.mode === "page" ? roll(current) : null;
      setConfig((prev) => ({ ...prev, page, ...(result ?? {}) }));
      setNav((n) => n + 1);
      setPanelOpen(false);
      setDiving(false);
    };

    if (live.current.config.calm) {
      commit();
      return;
    }
    setDiving(true);
    window.clearTimeout(diveTimer.current);
    diveTimer.current = window.setTimeout(commit, 300);
  }, [poke]);

  /**
   * The door and the panel are the operator's, and only the operator's.
   *
   * Gated here rather than at each entrance on purpose: there are six unlock
   * routes — five taps, the footer dot, konami, `sudo`, ⌘K and a rightward drag
   * — and guarding them one at a time is six chances to miss one, forever, as
   * routes get added. Everything funnels through `openDoor`, so this is the
   * only place that has to be right.
   *
   * `isOperator` is false until the session check settles, so the door cannot
   * open in the window before we know. Closed-until-proven is the correct
   * direction for this: a visitor must never see the panel, not even for the
   * single frame that an optimistic default would cost.
   */
  const togglePanel = useCallback(() => {
    if (!isOperator) return;
    chime(live.current.panelOpen ? "close" : "open");
    setPanelOpen((v) => !v);
  }, [isOperator, chime]);
  const closePanel = useCallback(() => {
    if (live.current.panelOpen) chime("close");
    setPanelOpen(false);
  }, [chime]);

  const openDoor = useCallback(
    (via: string) => {
      if (!isOperator) return false;
      chime("open");
      setDoorVia(`unlocked via ${via}`);
      setDoorOpen(true);
      setPanelOpen(false);
      return true;
    },
    [isOperator, chime],
  );
  const closeDoor = useCallback(() => {
    if (live.current.doorOpen) chime("close");
    setDoorOpen(false);
  }, [chime]);

  // Gating the openers is not enough: an operator who signs out while the panel
  // is open would otherwise keep it, and keep publishing from it. Losing the
  // flag has to take the surfaces with it.
  useEffect(() => {
    if (isOperator) return;
    setPanelOpen(false);
    setDoorOpen(false);
  }, [isOperator]);
  const openConfig = useCallback(() => {
    setDoorOpen(false);
    setPanelOpen(true);
    update({ unlocked: true });
  }, [update]);

  useEffect(() => {
    const onPop = () => {
      setConfig((previous) => ({ ...previous, page: pageFromPath(window.location.pathname) }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      calmBySystem,
      chooseMotion,
      update,
      go,
      shuffle,
      band,
      layout: adaptLayout(config.layout, band),
      adapted: isAdapted(config.layout, band),
      toast,
      say,
      chime,
      clock,
      diving,
      nav,
      panelOpen,
      togglePanel,
      closePanel,
      doorOpen,
      doorVia,
      openDoor,
      closeDoor,
      openConfig,
      saver,
      poke,
      holdSaver,
      setMode,
      mailShown,
      revealMail,
      signinShown,
      revealSignin,
    }),
    [
      config,
      calmBySystem,
      chooseMotion,
      update,
      go,
      shuffle,
      band,
      toast,
      say,
      chime,
      clock,
      diving,
      nav,
      panelOpen,
      togglePanel,
      closePanel,
      doorOpen,
      doorVia,
      openDoor,
      closeDoor,
      openConfig,
      saver,
      poke,
      holdSaver,
      setMode,
      mailShown,
      revealMail,
      signinShown,
      revealSignin,
    ],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used inside <ConfigProvider>");
  return value;
}
