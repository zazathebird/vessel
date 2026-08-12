import { useConfig } from "../config/ConfigContext";
import { NAV } from "../data/pageIds";
import type { LayoutId } from "../data/catalog";

/**
 * The valve: the site's one recurring ornament. Hidden on phones and in the
 * layouts that have no room for it (see chrome.css's `.v-valve` display rules).
 * In Radial orbit, the seven nav pills orbit it instead of living in the header.
 */
const HIDES_VALVE: LayoutId[] = ["sidescroll", "terminal", "ledger", "console", "sheet"];

export function Valve({ layout }: { layout: LayoutId }) {
  const { band, config, go } = useConfig();

  if (band === "phone" || HIDES_VALVE.includes(layout)) return null;

  return (
    <div className="v-valve">
      <span className="v-valve-dash" />
      <span className="v-valve-ring r1" />
      <span className="v-valve-ring r2" />
      <span className="v-valve-ring r3" />
      {layout === "radial" && (
        // The pills get their own container so their positions can be addressed
        // by :nth-child without counting the rings that precede them.
        <div className="v-orbit">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip v-pill v-orbit-pill${config.page === item.id ? " is-active" : ""}`}
              aria-current={config.page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <span className="v-valve-core" />
    </div>
  );
}
