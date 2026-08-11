import { useCallback, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { NAV, PATHS } from "../data/pageIds";

/**
 * Header: logo (with the five-tap unlock route), nav pills, calm toggle, and
 * the siteconfig button (visible only once the operator door has ever opened).
 */
export function Header() {
  const { config, go, update, say, togglePanel, openDoor } = useConfig();

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
    if (taps.current > 2) say(String(5 - taps.current) + " more");
    tapTimer.current = window.setTimeout(() => {
      taps.current = 0;
    }, 1400);
  }, [openDoor, say]);

  return (
    <header className="v-header">
      <div className="v-artery">
        <span className="v-artery-highlight" />
      </div>

      <div className="v-header-row">
        <button type="button" className="v-logo" onClick={onLogoTap} aria-label="vessel — tap for operator access">
          <span className="v-logo-mark">
            <span className="v-logo-ring a" />
            <span className="v-logo-ring b" />
            <span className="v-logo-dot" />
          </span>
          <span className="v-wordmark">vessel</span>
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
        </nav>

        <div className="v-header-right">
          <button
            type="button"
            className="chip"
            aria-pressed={config.calm}
            onClick={() => {
              const calm = !config.calm;
              update({ calm, breathe: !calm, grain: !calm });
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
