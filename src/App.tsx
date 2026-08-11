import { useMemo, useRef } from "react";

import { useConfig } from "./config/ConfigContext";
import { PAGES } from "./data/pages";
import { themeClasses, themeVars } from "./theme";
import { FxCanvas } from "./fx/FxCanvas";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ContentBlock } from "./components/ContentBlock";
import { Footer } from "./components/Footer";

/**
 * The real chrome: header, hero (with the valve), content grid, footer — shared
 * by all nine pages, restyled per layout by CSS alone (theme.ts's class names).
 *
 * Still open: the remaining eleven canvas effects, the siteconfig panel and
 * operator door (theatre — see CLAUDE.md), the screensaver, and eight of the
 * thirteen layouts' CSS (Magazine, Deck, Split, Radial, Mosaic, Ledger,
 * Marginalia, Contact sheet — Cinematic, Terminal, Side-scroll, Stack and
 * Console are done). Cursor-lean card tilt and the scroll-velocity boost are
 * also not wired yet. None of that blocks the site from working.
 */
export default function App() {
  const { config, layout, band, diving, nav } = useConfig();

  const page = PAGES[config.page];
  const stageRef = useRef<HTMLElement | null>(null);

  const stageAnimation = config.calm
    ? "none"
    : diving
      ? "v-dive 0.62s cubic-bezier(0.6,0,0.3,1) both"
      : `${nav % 2 ? "v-iris-a" : "v-iris-b"} 0.5s cubic-bezier(0.2,0.8,0.2,1) both`;

  const staggerMs = layout === "console" ? 160 : 50;

  const grid = useMemo(
    () => (
      <div className="v-grid">
        {page.blocks.map((block, i) => (
          <ContentBlock key={block.kicker} block={block} index={i} staggerMs={staggerMs} />
        ))}
      </div>
    ),
    [page, staggerMs],
  );

  const body = (
    <>
      <Hero page={page} layout={layout} />
      {grid}
      <Footer />
    </>
  );

  return (
    <div className={`page-${config.page} ${themeClasses(config, layout, band)}`} style={themeVars(config, layout, band)}>
      <FxCanvas fx={config.fx} pal={config.pal} calm={config.calm} />
      <div className="v-vignette" aria-hidden="true" />
      <div className="v-grain" aria-hidden="true" />

      <div className="v-chrome">
        <Header />

        {layout === "terminal" ? (
          <main ref={stageRef} className="v-stage" style={{ animation: stageAnimation }}>
            <div className="v-termbar">
              <span className="v-termbar-dot" style={{ background: "var(--a3)" }} />
              <span className="v-termbar-dot" style={{ background: "var(--a2)" }} />
              <span className="v-termbar-dot" style={{ background: "var(--a1)" }} />
              <span className="v-termbar-title">vessel — /{config.page}</span>
            </div>
            <div className="v-termbody">{body}</div>
          </main>
        ) : (
          <main ref={stageRef} className="v-stage" style={{ animation: stageAnimation }}>
            {body}
          </main>
        )}
      </div>

      <Toast />
    </div>
  );
}

function Toast() {
  const { toast } = useConfig();
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="v-toast">
      {toast}
    </div>
  );
}
