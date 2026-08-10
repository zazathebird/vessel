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

import { PALETTES, paletteIndexForHour } from "../data/palettes";
import { PATHS, pageFromPath } from "../data/pageIds";
import type { PageId } from "../data/pageIds";
import { adaptLayout, bandForWidth, isAdapted } from "./bands";
import type { Band } from "./bands";
import { SAVE_DEBOUNCE_MS, hasVisited, loadConfig, saveConfig } from "./persistence";
import { describeRoll, roll } from "./randomiser";
import { DEFAULT_CONFIG } from "./types";
import type { Config } from "./types";

interface ConfigContextValue {
  config: Config;
  /** Merge a partial update into config. */
  update: (patch: Partial<Config>) => void;
  /** Navigate — pushes a real URL and applies per-page rolls. */
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
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} · local`;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
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

  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

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
  const go = useCallback(
    (page: PageId) => {
      if (window.location.pathname !== PATHS[page]) {
        window.history.pushState({}, "", PATHS[page]);
      }
      setConfig((previous) => {
        const next = { ...previous, page };
        if (previous.mode !== "page") return next;
        const result = roll(previous);
        return result ? { ...next, ...result } : next;
      });
    },
    [],
  );

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
    }),
    [config, update, go, shuffle, band, toast, say, clock],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used inside <ConfigProvider>");
  return value;
}
