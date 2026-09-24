import { lazy, useEffect, useMemo, useRef, useState } from "react";

import { useConfig } from "./config/ConfigContext";
import { useSession } from "./auth/SessionContext";
import { PAGES } from "./data/pages";
import { themeClasses, themeVars } from "./theme";
import { FxCanvas } from "./fx/FxCanvas";
import { useMotionSystems } from "./hooks/useMotionSystems";
import { useOperatorRoutes } from "./hooks/useOperatorRoutes";
import { useAccountRoutes } from "./hooks/useAccountRoutes";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ContentBlock } from "./components/ContentBlock";
import { Footer } from "./components/Footer";
import { ChunkFailed, Lazy } from "./components/Lazy";
import { Greeting } from "./components/Greeting";
import { Screensaver } from "./components/Screensaver";
import { OverlayHostContext } from "./components/Dialog";
import { CommandPalette } from "./components/CommandPalette";

/*
 * The split (2026-09-14). Everything below this comment used to be a static
 * import, and the whole site was one 512KB chunk with no `import()` anywhere in
 * `src/` — so every anonymous visitor downloaded, parsed and threw away the
 * operator's entire application: the downloads editor, the settings panel, the
 * duel settings editor, `/admin`, `/machines`, `/share`, the door.
 *
 * **The seam is the one the site already draws.** Each of these is behind a
 * route or an overlay flag that starts closed, and `isOperator` is false until
 * the session probe settles, so nothing here can be reached in the first render
 * by anybody — which is exactly what a lazy boundary needs and what makes the
 * `null` fallback invisible rather than a flash. Three rules hold it together:
 *
 * 1. **Nothing the first paint needs may go behind one.** The chrome, the hero,
 *    the grid, the canvas, the greeting, the palette and the screensaver stay
 *    static. `ConfigContext` is untouched and still reads
 *    `window.__VESSEL_SITE__` synchronously in the first render (§11) — a
 *    boundary here cannot make it wait, because none of these components is
 *    mounted while it builds its initial state.
 * 2. **The two overlays mount on first open and then stay mounted.** The panel
 *    keeps state across close/reopen — `leaving`, the pasted code, the
 *    site/page target — and `SiteConfigPanel`'s own comment says so. `seen`
 *    below is what preserves that: unmounted until the first open, mounted for
 *    ever after, which is exactly today's behaviour from the first open onward.
 * 3. **The duel is deliberately NOT split.** `src/fx/effects.ts` imports
 *    `./duel` statically for `drawFx`, which every visitor's canvas calls every
 *    frame, so `duel.ts` + `fighters.ts` (~60KB) stay in the entry no matter
 *    what happens in this file. Lazily loading `DuelOrnament` alone would buy
 *    about 4KB and put a suspense boundary in the hero for it. Not worth it —
 *    see the report; the fix is one change in `effects.ts`, not here.
 */
const SignUp = lazy(() => import("./components/SignUp").then((m) => ({ default: m.SignUp })));
const SignIn = lazy(() => import("./components/SignIn").then((m) => ({ default: m.SignIn })));
const Admin = lazy(() => import("./components/Admin").then((m) => ({ default: m.Admin })));
const MachinesPage = lazy(() =>
  import("./components/MachinesPage").then((m) => ({ default: m.MachinesPage })),
);
const SharePage = lazy(() =>
  import("./components/SharePage").then((m) => ({ default: m.SharePage })),
);
const DownloadsPage = lazy(() =>
  import("./components/DownloadsPage").then((m) => ({ default: m.DownloadsPage })),
);
const SiteConfigPanel = lazy(() =>
  import("./components/SiteConfigPanel").then((m) => ({ default: m.SiteConfigPanel })),
);
const OperatorDoor = lazy(() =>
  import("./components/OperatorDoor").then((m) => ({ default: m.OperatorDoor })),
);

/**
 * The whole site: one chrome — header, hero with the valve, content grid,
 * footer — shared by every page and restyled per layout by CSS alone,
 * over the canvas and under the three overlays.
 *
 * The overlays are siblings of `.v-chrome` rather than children, because the
 * screensaver fades the chrome to `opacity: 0` with `pointer-events: none` and
 * must not be able to take the panel or the door with it.
 */
export default function App() {
  /*
   * `ornament` and `fx` are the resolved pair, not `config`'s — the duels are
   * operator-only and the operator's own ornament is rolled per load, so what
   * is drawn and what is stored routinely disagree. They are read here because
   * the wrapper's classes are built from them: see `themeClasses`, whose
   * station follows the ornament that is on the page rather than the one in
   * storage.
   */
  const { config, look, layout, band, sub, ornament, fx, diving, nav, saver, panelOpen, doorOpen } =
    useConfig();
  const { isOperator } = useSession();

  const page = PAGES[config.page];
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);

  // A faded-out interface must not still be reachable by Tab. `inert` is set
  // imperatively because React 18's DOM typings do not carry the attribute.
  useEffect(() => {
    const chrome = chromeRef.current;
    if (!chrome) return;
    if (saver) chrome.setAttribute("inert", "");
    else chrome.removeAttribute("inert");
  }, [saver]);

  // Motion systems 2 and 4 plus the cursor glow; the key tells the hook when the
  // card list has been rebuilt under it.
  useMotionSystems({ hostRef, glowRef, stageRef, gridKey: `${config.page}:${layout}:${band}` });
  useOperatorRoutes();
  useAccountRoutes();

  /*
   * The two overlays, once each has been opened once. See rule 2 above: the
   * panel is stateful across close/reopen and must not remount, so the flag is
   * one-way. `panelOpen ||` is what mounts it in the same render as the open,
   * rather than one render later via the effect.
   */
  const [panelSeen, setPanelSeen] = useState(false);
  const [doorSeen, setDoorSeen] = useState(false);
  useEffect(() => {
    if (panelOpen) setPanelSeen(true);
  }, [panelOpen]);
  useEffect(() => {
    if (doorOpen) setDoorSeen(true);
  }, [doorOpen]);

  /*
   * Warm the two overlay chunks the moment the session probe says operator.
   *
   * They are the only split surfaces reached by a *gesture* rather than a
   * navigation — ⌘K, five taps on the logo, typing `sudo` — so there is no page
   * transition to spend the round trip inside, and a panel that arrives a beat
   * after the keystroke reads as a missed keystroke. The routes are left to
   * fetch on navigation, which is a transition and already looks like one.
   *
   * Nothing here runs for a visitor: `isOperator` is false until the probe
   * settles and false for ever if it settles as anybody else. A rejection is
   * swallowed on purpose — this is a prefetch, and the boundary above handles
   * the real attempt.
   */
  useEffect(() => {
    if (!isOperator) return;
    void import("./components/SiteConfigPanel").catch(() => {});
    void import("./components/OperatorDoor").catch(() => {});
  }, [isOperator]);

  // A new page starts at the top, and with its own name in the tab. The stage
  // is the scroll container in every layout but Terminal, which gives it
  // `height: auto` and scrolls the document — so both have to be reset.
  //
  // **`sub` is part of "a new page", and leaving it out was the bug.** The one
  // route with something after it is `/downloads/<name>`, and moving between
  // the index and a program changes only `sub` — `ConfigContext` treats that as
  // a navigation, dives the stage and pushes a URL for it. Keyed on the page
  // alone, clicking a program card rendered the program at whatever offset the
  // visitor had scrolled the index to, under the index's title.
  useEffect(() => {
    if (stageRef.current) stageRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
    document.title = `${PAGES[config.page].title} · mcclevarty.ca`;
  }, [config.page, sub]);

  const stageAnimation = config.calm
    ? "none"
    : diving
      ? "v-dive 0.62s cubic-bezier(0.6,0,0.3,1) both"
      : `${nav % 2 ? "v-iris-a" : "v-iris-b"} 0.5s cubic-bezier(0.2,0.8,0.2,1) both`;

  const grid = useMemo(
    () => (
      <div className="v-grid">
        {page.blocks.map((block, i) => (
          // Keyed by kicker *and* index: Now reuses "in progress" twice, and a
          // duplicate key would let React reconcile the two together. Including
          // the kicker still changes every key across a page change, which is
          // what remounts the cards and replays their staggered entrance.
          <ContentBlock key={`${block.kicker}-${i}`} block={block} index={i} />
        ))}
        {/* Console's prompt: the line the log is still writing to. Rendered
            always and shown by CSS on that one layout, so the grid memo does
            not have to depend on the layout to know whether to emit it. */}
        <div className="v-caret" aria-hidden="true">
          ready
        </div>
      </div>
    ),
    [page],
  );

  /*
   * The routed pages render where the block grid would go — and all six of them
   * are split, so this is a boundary rather than an element. Everything around
   * them (hero, layout adaptation, entrance motion, palette bleed, footer) is
   * outside it and unchanged, which is what makes `null` an honest fallback:
   * the page is already painted and one region of it arrives late.
   */
  const routed =
    config.page === "signup" ? (
      <SignUp />
    ) : config.page === "signin" ? (
      <SignIn />
    ) : config.page === "admin" ? (
      <Admin />
    ) : config.page === "machines" ? (
      <MachinesPage />
    ) : config.page === "share" ? (
      <SharePage />
    ) : config.page === "downloads" ? (
      <DownloadsPage />
    ) : null;

  const body = (
    <>
      <Hero page={page} layout={layout} />
      {routed ? <Lazy error={<ChunkFailed />}>{routed}</Lazy> : grid}
      <Footer />
    </>
  );

  return (
    // Dialogs portal into the themed wrapper (never document.body, which has no
    // palette tokens), landing as siblings of the overlays below — see Dialog.tsx.
    <OverlayHostContext.Provider value={hostRef}>
    <div
      ref={hostRef}
      /*
       * `look`, not `config` (2026-09-02): the wrapper is built from what the
       * page shows, and a per-page override is part of that the same way the
       * adapted layout and the resolved ornament are. `config.page` is routing
       * and identical on both.
       */
      className={`page-${config.page} ${themeClasses(look, layout, band, { ornament, fx })}`}
      style={themeVars(look, layout, band)}
    >
      <FxCanvas />
      <div className="v-vignette" aria-hidden="true" />
      <div className="v-grain" aria-hidden="true" />
      <div ref={glowRef} className="v-cursor-glow" aria-hidden="true" />

      {/*
        * Skip link — WCAG 2.4.1 Bypass Blocks, and it earns its place here
        * rather than being a checkbox item (2026-08-17 audit). Every page puts
        * seven nav pills, two chips and the wordmark ahead of the content, and
        * on the phone band that nav is a 593px horizontal scroller inside a
        * 284px box: a keyboard user tabs through a strip that slides sideways
        * underneath them before reaching the h1. The landmarks were already
        * correct, which covers screen-reader users; this is the half that was
        * missing for sighted keyboard users.
        *
        * Visually hidden until focused — see `.v-skip` in base.css.
        */}
      <a className="v-skip" href="#main">
        Skip to content
      </a>
      <div ref={chromeRef} className={`v-chrome${saver ? " is-sleeping" : ""}`}>
        <Header />

        <main id="main" tabIndex={-1} ref={stageRef} className="v-stage" style={{ animation: stageAnimation }}>
          {layout === "terminal" ? (
            <>
              {/* Keyed by page so the bar remounts on navigation and the
                  entrance typewriter retypes the new path — the title is the
                  one element here whose text changes per page. */}
              <div key={config.page} className="v-termbar" aria-hidden="true">
                <span className="v-termbar-dot" style={{ background: "var(--a3)" }} />
                <span className="v-termbar-dot" style={{ background: "var(--a2)" }} />
                <span className="v-termbar-dot" style={{ background: "var(--a1)" }} />
                <span className="v-termbar-title">mcclevarty.ca — /{config.page}</span>
              </div>
              <div className="v-termbody">{body}</div>
            </>
          ) : (
            body
          )}
        </main>
      </div>

      <Screensaver />
      <Greeting />
      {/* Operator-only, and unmounted until the first open — see rule 2. No
          `error` node: an overlay that failed to arrive is one the operator can
          ask for again, and a broken-chunk card floating over the page would be
          worse than nothing. */}
      {(panelOpen || panelSeen) && (
        <Lazy>
          <SiteConfigPanel />
        </Lazy>
      )}
      {(doorOpen || doorSeen) && (
        <Lazy>
          <OperatorDoor />
        </Lazy>
      )}
      <CommandPalette />
      <Toast />
    </div>
    </OverlayHostContext.Provider>
  );
}

function Toast() {
  const { toast } = useConfig();
  return (
    <div role="status" aria-live="polite" className="v-toast-live">
      {toast ? <div className="v-toast">{toast}</div> : null}
    </div>
  );
}
