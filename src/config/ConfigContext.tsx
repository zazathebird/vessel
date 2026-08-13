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

import { MAIL } from "../data/mail";
import { MODES } from "../data/catalog";
import type { ModeId } from "../data/catalog";
import { PALETTES, paletteIndexForHour } from "../data/palettes";
import { PATHS, pageFromPath } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { adaptLayout, bandForWidth, isAdapted } from "./bands";
import type { Band } from "./bands";
import { SAVE_DEBOUNCE_MS, hasVisited, loadConfig, saveConfig } from "./persistence";
import { describeRoll, roll } from "./randomiser";
import { useSession } from "../auth/SessionContext";
import { DEFAULT_CONFIG } from "./types";
import type { Config } from "./types";

interface ConfigContextValue {
  config: Config;
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
  say: (message: string) => void;
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

  // Read storage during the first render so there is no flash of default palette.
  const [config, setConfig] = useState<Config>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
    const loaded = loadConfig();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Reduced motion lands the visitor in calm automatically — a settled decision.
    const motion = reduced ? { calm: true, grain: false, breathe: false } : null;
    return { ...loaded, ...motion, page: pageFromPath(window.location.pathname) };
  });

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

  const say = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const update = useCallback((patch: Partial<Config>) => {
    setConfig((previous) => ({ ...previous, ...patch }));
  }, []);

  const shuffle = useCallback(() => {
    setConfig((previous) => {
      const result = roll(previous);
      if (!result) {
        // 60 attempts all blocked — the scope switches have painted into a corner.
        say("nothing legal to roll");
        return previous;
      }
      say(describeRoll(result));
      return { ...previous, ...result };
    });
  }, [say]);

  /**
   * The address is never in static markup — it is assembled from parts at
   * runtime, and this is the only place it exists as a whole string.
   */
  const revealMail = useCallback(() => {
    setMailShown(true);
    navigator.clipboard?.writeText(MAIL).catch(() => {});
    say("address copied");
  }, [say]);

  const setMode = useCallback(
    (mode: ModeId) => {
      setConfig((previous) => {
        const next = { ...previous, mode };
        // Picking a mode applies it immediately, so the operator sees what they chose.
        if (mode === "tod") return { ...next, pal: paletteIndexForHour(new Date().getHours()) };
        if (mode === "visit") {
          const result = roll(next);
          return result ? { ...next, ...result } : next;
        }
        return next;
      });
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
    setConfig((previous) => {
      if (previous.mode === "visit") {
        const result = roll(previous);
        return result ? { ...previous, ...result } : previous;
      }
      if (previous.mode === "tod" && returning) {
        return { ...previous, pal: paletteIndexForHour(new Date().getHours()) };
      }
      return previous;
    });
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
      setConfig((previous) => {
        if (previous.mode !== "tod") return previous;
        const pal = paletteIndexForHour(hour);
        if (pal === previous.pal) return previous;
        say(PALETTES[pal].name);
        return { ...previous, pal };
      });
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
    setPanelOpen((v) => !v);
  }, [isOperator]);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const openDoor = useCallback(
    (via: string) => {
      if (!isOperator) return false;
      setDoorVia(`unlocked via ${via}`);
      setDoorOpen(true);
      setPanelOpen(false);
      return true;
    },
    [isOperator],
  );
  const closeDoor = useCallback(() => setDoorOpen(false), []);

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
      update,
      go,
      shuffle,
      band,
      layout: adaptLayout(config.layout, band),
      adapted: isAdapted(config.layout, band),
      toast,
      say,
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
    }),
    [
      config,
      update,
      go,
      shuffle,
      band,
      toast,
      say,
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
    ],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used inside <ConfigProvider>");
  return value;
}
