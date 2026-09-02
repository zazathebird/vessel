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
import { MODES, visibleFx } from "../data/catalog";
import type { ModeId } from "../data/catalog";
import { rollableOrnaments, visibleOrnament } from "../data/ornaments";
import { PALETTES, paletteIndexForHour } from "../data/palettes";
import { pageFromPath, pathFor, subFromPath } from "../data/pageIds";
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
import { applyLook } from "../theme";
import { DEFAULT_CONFIG } from "./types";
import type { Config } from "./types";

interface ConfigContextValue {
  config: Config;
  /**
   * The stored config with the current page's `lookPages` override laid on
   * top (2026-09-02) — `applyLook`, memoised. **Anything that renders
   * appearance reads this, never `config`**: the theme wrapper, the canvas
   * palette, the cursor glow, the slot captions. `config` stays what is
   * *kept* — the panel edits it, `publish` sends it, the share code encodes
   * it — exactly the stored-versus-drawn split the adapted layout and the
   * resolved ornament already follow.
   */
  look: Config;
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
  go: (page: PageId, sub?: string | null) => void;
  /**
   * The sub-page name, for the one route that has one: `/downloads/<name>`.
   *
   * **Routing state, and deliberately not part of `config`.** `config` is
   * validated field by field on load, published to every visitor, and packed
   * into share codes — so a field that is a transient URL fragment would have to
   * be excluded from three of those and remembered as excluded by everyone who
   * touches them. `page` lives there for historical reasons; this does not
   * follow it in.
   */
  sub: string | null;
  /** Operator shuffle. Announces the result; a blocked roll toasts instead. */
  shuffle: () => void;
  band: Band;
  /** The layout actually rendered, after small-screen collapsing. */
  layout: Config["layout"];
  adapted: boolean;
  /**
   * The ornament and the effect **actually rendered**, given who is looking.
   *
   * Two things happen here and both are presentation, so `config` is untouched
   * by either — the same rule the adapted layout has always followed, and for
   * the same reason: *the operator's stored choice is never overwritten.*
   *
   * 1. **The duels are operator-only** (2026-08-28, client request). A visitor
   *    gets `DEFAULT_ORNAMENT` / `FALLBACK_FX` in place of one. Resolved here
   *    rather than at the storage end so the operator does not lose the setting
   *    by viewing his own site logged out.
   * 2. **A signed-in operator gets a fresh ornament per load**, rolled from his
   *    own pool. Deliberately *not* written into `config`: a roll that mutated
   *    it would mean whatever the dice landed on is what gets published the
   *    next time he presses Publish for an unrelated reason. It also yields
   *    the moment he chooses an ornament himself — see `update`.
   */
  ornament: Config["ornament"];
  fx: Config["fx"];
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
  /** Reveal the footer's sign-in link — five taps on the hero ornament. */
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

  /*
   * The current page's look — `applyLook` is the seam per-page appearance goes
   * through (2026-09-02). Computed here, once, so every derived value below
   * (adapted layout, resolved ornament and fx, audio tuning) and every
   * consumer of the context reads one answer rather than each re-merging.
   * Memoised on `config` because the override lives inside it (`lookPages`
   * and `page` are both fields), so no second dependency can go stale.
   */
  const look = useMemo(() => applyLook(config), [config]);

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
  const [saverHeld, setSaverHeld] = useState(false);

  /*
   * The sub-page name for `/downloads/<name>`, read from the URL on the first
   * render so a cold load of a sub-page renders it rather than the index.
   * Separate from `config` — see the note on `sub` in the context type.
   */
  const [sub, setSub] = useState<string | null>(() =>
    typeof window === "undefined" ? null : subFromPath(window.location.pathname),
  );

  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const diveTimer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const saverHolds = useRef(0);

  // The idle timer fires a minute after the last click, long after the render
  // that armed it, so it reads current state from a ref rather than a closure.
  // `go` reads the same ref: a setConfig updater has to be pure, and StrictMode
  // double-invokes it, so the branch it takes cannot live inside one.
  /*
   * `isOperator` rides along because three roll sites need it from inside
   * callbacks that outlive the render that made them — navigation, popstate and
   * the mount roll. At mount it is still false, and that is correct rather than
   * unfortunate: the session probe has not settled, so the safe pool is the
   * honest one, and the operator's own per-load roll fires separately the
   * moment it does settle.
   */
  const live = useRef({ config, panelOpen, doorOpen, saverHeld, sub, isOperator });
  useEffect(() => {
    live.current = { config, panelOpen, doorOpen, saverHeld, sub, isOperator };
  });

  // The synth is tuned by the palette, the same way everything visible is
  // coloured by it — see `src/audio/engine.ts`. Pushed rather than pulled so
  // the audio module imports nothing and cannot hold a second opinion about
  // which palette is current.
  useEffect(() => {
    // The look's palette, not the stored one: pitch derives from the palette
    // exactly as every colour does, and a page overriding its palette would
    // otherwise sound like the site while looking like itself.
    setAudioPalette(look.pal);
  }, [look.pal]);

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
    // Choosing an ornament ends the per-load roll for this session. Without
    // this, the panel would appear broken to the one person who can use it:
    // he picks Sonar, the rolled duel is still what renders, and nothing on
    // screen explains why his own setting did not take.
    if (patch.ornament !== undefined) setOperatorRoll(null);
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
    // `live.current.isOperator`, not the closed-over one. This callback's
    // dependency list is stable, so it is built once — on the first render,
    // where `isOperator` is still false because the session probe has not
    // settled. The three sites named in the note on `live` were fixed for
    // exactly this; the shuffle button and the mode picker were missed, so the
    // operator's own dice could never hand him a duel from either catalogue.
    // It failed safe, which is why nothing reported it.
    const result = roll(live.current.config, live.current.isOperator);
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

  const setMode = useCallback(
    (mode: ModeId) => {
      // The roll and the clock read stay outside the updater — same purity
      // rule as `go` and `shuffle`.
      let patch: Partial<Config> = { mode };
      // Picking a mode applies it immediately, so the operator sees what they chose.
      if (mode === "tod") {
        patch = { mode, pal: paletteIndexForHour(new Date().getHours()) };
      } else if (mode === "visit") {
        // Same stale closure as `shuffle` above, same fix, same reason.
        const result = roll({ ...live.current.config, mode }, live.current.isOperator);
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
    /*
     * **`page` rolls here too, and its absence was the bug** (2026-08-27).
     *
     * `page` used to roll in exactly one place — `go`'s commit, which runs only
     * on an in-app click. So a reload, a typed URL, a bookmark, an external
     * link and back/forward all rendered the published look verbatim, and the
     * operator's report was "i hit per load, per page, per everything, but it
     * always stays stuck on one". He was right: a page *load* was not being
     * treated as a page *arrival*, which is the only way anyone reads the label.
     *
     * `visit` and `page` therefore both roll on mount. They still differ, and
     * the difference is the whole point of having both: `page` also rolls on
     * every navigation, `visit` does not.
     */
    if (cfg.mode === "visit" || cfg.mode === "page") {
      const result = roll(cfg, live.current.isOperator);
      if (result) setConfig((previous) => ({ ...previous, ...result }));
    } else if (cfg.mode === "tod" && returning) {
      const pal = paletteIndexForHour(new Date().getHours());
      setConfig((previous) => ({ ...previous, pal }));
    }
    // Intentionally runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ---- the operator's per-load ornament -----------------------------------
   *
   * Signed in, the hero slot rolls fresh on every load (2026-08-28, client
   * request); signed out, it is whatever was published. Three things about
   * this are deliberate.
   *
   * **It is state here, not a patch to `config`.** A roll written into config
   * is a roll that gets published the next time he presses Publish for an
   * unrelated reason — the dice would quietly become the site. Same doctrine as
   * the adapted layout: what he stored is what he stored.
   *
   * **It cannot live in the mount effect above.** `isOperator` is false until
   * the session probe settles, and that effect runs once on mount, so a roll
   * placed there would always see a signed-out viewer and never fire. Keyed on
   * `isOperator` instead, which is also what makes it re-roll on sign-in rather
   * than only on reload.
   *
   * **The pick happens outside the updater.** `Math.random` is impure and
   * StrictMode double-invokes updaters — the same rule `shuffle` and `setMode`
   * already record. Rolling out here and keeping the first result means the
   * double invoke settles on one ornament rather than two.
   */
  const [operatorRoll, setOperatorRoll] = useState<Config["ornament"] | null>(null);
  useEffect(() => {
    if (!isOperator) {
      // Signing out drops it, so the site immediately looks like the site.
      setOperatorRoll(null);
      return;
    }
    const pool = rollableOrnaments(true);
    const rolled = pool[Math.floor(Math.random() * pool.length)]?.id;
    if (rolled) setOperatorRoll((previous) => previous ?? rolled);
  }, [isOperator]);

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
  const go = useCallback((page: PageId, sub: string | null = null) => {
    poke();
    // The sub-page counts as part of "where we are": without it, moving between
    // two downloads pages would be a no-op and the URL would change under a
    // screen that never re-rendered.
    if (live.current.config.page === page && live.current.sub === sub) return;
    // Fired here, not in `commit`: the dive takes 300ms before the page swaps,
    // and a sound that waited for it would land after the motion it belongs to.
    chime("nav");

    const commit = () => {
      const path = pathFor(page, sub);
      if (window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
      setSub(sub);
      // Rolled out here rather than inside the updater: roll() is random, and a
      // double-invoked updater would spend two rolls to apply one.
      const current = live.current.config;
      const result = current.mode === "page" ? roll(current, live.current.isOperator) : null;
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
      // Back and forward are page arrivals, so `page` mode rolls for them as it
      // does for a click and for a load. Without this the browser's own buttons
      // were the one route that stayed frozen, which is indistinguishable from
      // the randomiser being broken.
      const rolled = live.current.config.mode === "page" ? roll(live.current.config, live.current.isOperator) : null;
      setConfig((previous) => ({
        ...previous,
        ...(rolled ?? {}),
        page: pageFromPath(window.location.pathname),
      }));
      // Back and forward have to move the sub-page too, or the browser's own
      // buttons leave the URL and the screen disagreeing.
      setSub(subFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      look,
      calmBySystem,
      chooseMotion,
      update,
      go,
      sub,
      shuffle,
      band,
      // The look's layout, so a page override reaches the band adaptation the
      // same way the stored value always has.
      layout: adaptLayout(look.layout, band),
      adapted: isAdapted(look.layout, band),
      /*
       * The rolled ornament wins for an operator until he picks one himself;
       * for everybody else the duels resolve away. `visibleFx` carries no roll
       * — he asked for a random *ornament*, and a background effect that
       * changed under the page every load is a different request.
       *
       * **A page that pins its own ornament beats the per-load roll** — the
       * roll already yields the moment he picks an ornament himself, and an
       * override on this page is exactly that pick, made earlier. Without
       * this, the one page he deliberately dressed would keep rolling under
       * him and the override would look broken to the only person who set it.
       */
      ornament: isOperator
        ? config.lookPages[config.page]?.ornament !== undefined
          ? look.ornament
          : (operatorRoll ?? look.ornament)
        : visibleOrnament(look.ornament, false),
      fx: visibleFx(look.fx, isOperator),
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
    }),
    [
      config,
      look,
      calmBySystem,
      chooseMotion,
      update,
      go,
      sub,
      shuffle,
      band,
      // Both feed the resolved `ornament`/`fx` above. Missing from here, the
      // hero slot keeps whatever it resolved to on the render before the
      // session probe settled — which is the signed-out answer, every time.
      isOperator,
      operatorRoll,
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
    ],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used inside <ConfigProvider>");
  return value;
}
