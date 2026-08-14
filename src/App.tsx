import { useEffect, useMemo, useRef } from "react";

import { useConfig } from "./config/ConfigContext";
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
import { SignUp } from "./components/SignUp";
import { SignIn } from "./components/SignIn";
import { Admin } from "./components/Admin";
import { MachinesPage } from "./components/MachinesPage";
import { SharePage } from "./components/SharePage";
import { SiteConfigPanel } from "./components/SiteConfigPanel";
import { OperatorDoor } from "./components/OperatorDoor";
import { Screensaver } from "./components/Screensaver";
import { OverlayHostContext } from "./components/Dialog";
import { CommandPalette } from "./components/CommandPalette";

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
  const { config, layout, band, diving, nav, saver } = useConfig();

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

  // A new page starts at the top, and with its own name in the tab. The stage
  // is the scroll container in every layout but Terminal, which gives it
  // `height: auto` and scrolls the document — so both have to be reset.
  useEffect(() => {
    if (stageRef.current) stageRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
    document.title = `${PAGES[config.page].title} · mcclevarty.ca`;
  }, [config.page]);

  const stageAnimation = config.calm
    ? "none"
    : diving
      ? "v-dive 0.62s cubic-bezier(0.6,0,0.3,1) both"
      : `${nav % 2 ? "v-iris-a" : "v-iris-b"} 0.5s cubic-bezier(0.2,0.8,0.2,1) both`;

  // Console streams its blocks in one at a time, so arrival reads as output
  // being printed rather than as a grid settling.
  const staggerMs = layout === "console" ? 160 : 50;

  const grid = useMemo(
    () => (
      <div className="v-grid">
        {page.blocks.map((block, i) => (
          // Keyed by kicker *and* index: Now reuses "in progress" twice, and a
          // duplicate key would let React reconcile the two together. Including
          // the kicker still changes every key across a page change, which is
          // what remounts the cards and replays their staggered entrance.
          <ContentBlock key={`${block.kicker}-${i}`} block={block} index={i} staggerMs={staggerMs} />
        ))}
        {/* Console's prompt: the line the log is still writing to. Rendered
            always and shown by CSS on that one layout, so the grid memo does
            not have to depend on the layout to know whether to emit it. */}
        <div className="v-caret" aria-hidden="true">
          ready
        </div>
      </div>
    ),
    [page, staggerMs],
  );

  // The two account pages render a form where the block grid would go.
  // Everything around them — hero, layout adaptation, entrance motion, palette
  // bleed — is unchanged.
  const body = (
    <>
      <Hero page={page} layout={layout} />
      {config.page === "signup" ? (
        <SignUp />
      ) : config.page === "signin" ? (
        <SignIn />
      ) : config.page === "admin" ? (
        <Admin />
      ) : config.page === "machines" ? (
        <MachinesPage />
      ) : config.page === "share" ? (
        <SharePage />
      ) : (
        grid
      )}
      <Footer />
    </>
  );

  return (
    // Dialogs portal into the themed wrapper (never document.body, which has no
    // palette tokens), landing as siblings of the overlays below — see Dialog.tsx.
    <OverlayHostContext.Provider value={hostRef}>
    <div
      ref={hostRef}
      className={`page-${config.page} ${themeClasses(config, layout, band)}`}
      style={themeVars(config, layout, band)}
    >
      <FxCanvas />
      <div className="v-vignette" aria-hidden="true" />
      <div className="v-grain" aria-hidden="true" />
      <div ref={glowRef} className="v-cursor-glow" aria-hidden="true" />

      <div ref={chromeRef} className={`v-chrome${saver ? " is-sleeping" : ""}`}>
        <Header />

        <main ref={stageRef} className="v-stage" style={{ animation: stageAnimation }}>
          {layout === "terminal" ? (
            <>
              <div className="v-termbar" aria-hidden="true">
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
      <SiteConfigPanel />
      <OperatorDoor />
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
