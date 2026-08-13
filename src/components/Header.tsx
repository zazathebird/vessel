import { useCallback, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { saveCalmPreference } from "../config/persistence";
import { useSession } from "../auth/SessionContext";
import { NAV, OPERATOR_NAV, PATHS } from "../data/pageIds";

/**
 * Header: logo (with the five-tap unlock route), nav pills, calm toggle, and
 * the siteconfig button (visible only once the operator door has ever opened).
 */
export function Header() {
  const { config, go, update, say, togglePanel, openDoor, panelOpen } = useConfig();
  // Operator tabs (404 / Account / Admin / Config) appear only once the session
  // probe answers operator. Like everything session-gated they start hidden and
  // arrive — never flash and vanish (SessionContext's rule).
  const { isOperator } = useSession();

  const taps = useRef(0);
  const tapTimer = useRef<number | undefined>(undefined);

  const onLogoTap = useCallback(() => {
    taps.current += 1;
    window.clearTimeout(tapTimer.current);
    if (taps.current >= 5) {
      taps.current = 0;
      openDoor("five taps");
      return;
    }
    // The countdown is gated the way the door itself is: openDoor refuses
    // non-operators, so teasing a visitor with "2 more" counts them down to
    // silently nothing (review 2026-08-13).
    if (taps.current > 2 && isOperator) say(String(5 - taps.current) + " more");
    tapTimer.current = window.setTimeout(() => {
      taps.current = 0;
    }, 1400);
  }, [openDoor, say, isOperator]);

  return (
    <header className="v-header">
      <div className="v-artery">
        <span className="v-artery-highlight" />
      </div>

      <div className="v-header-row">
        <button type="button" className="v-logo" onClick={onLogoTap} aria-label="mcclevarty.ca — tap for operator access">
          <span className="v-logo-mark">
            <span className="v-logo-ring a" />
            <span className="v-logo-ring b" />
            <span className="v-logo-dot" />
          </span>
          <span className="v-wordmark">mcclevarty.ca</span>
        </button>

        <nav className="v-nav" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={PATHS[item.id]}
              className={`chip v-pill${config.page === item.id ? " is-active" : ""}`}
              aria-current={config.page === item.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                go(item.id);
              }}
            >
              {item.label}
            </a>
          ))}
          {isOperator &&
            OPERATOR_NAV.map((item) => (
              <a
                key={item.id}
                href={PATHS[item.id]}
                className={`chip v-pill${config.page === item.id ? " is-active" : ""}`}
                aria-current={config.page === item.id ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  go(item.id);
                }}
              >
                {item.label}
              </a>
            ))}
          {isOperator && (
            // Not a page — it toggles the siteconfig panel, so it is a button
            // with a pressed state rather than a link with a current one.
            <button
              type="button"
              className={`chip v-pill${panelOpen ? " is-active" : ""}`}
              aria-pressed={panelOpen}
              onClick={togglePanel}
            >
              Config
            </button>
          )}
        </nav>

        <div className="v-header-right">
          <button
            type="button"
            className="chip"
            aria-pressed={config.calm}
            onClick={() => {
              const calm = !config.calm;
              // Calm alone: `themeClasses` already suppresses grain/breathe
              // under calm, and writing them here overwrote the *published*
              // values once calm round-tripped (review 2026-08-13). The
              // command palette's toggle always did it this way.
              update({ calm });
              // Calm is the one setting that follows the visitor home —
              // an accessibility escape hatch that resets every visit is
              // a button someone has to find again every visit.
              saveCalmPreference(calm);
              say(calm ? "calm — one accent, no motion" : "calm off");
            }}
          >
            {config.calm ? "calm ✓" : "calm"}
          </button>
          {config.unlocked && (
            <button type="button" className="v-siteconfig-btn" onClick={togglePanel}>
              <span className="v-siteconfig-dot" aria-hidden="true" />
              siteconfig
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
