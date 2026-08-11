import { useConfig } from "../config/ConfigContext";
import { FOOTER_NAV } from "../data/pageIds";

export function Footer() {
  const { config, go, clock, openDoor } = useConfig();

  return (
    <footer className="v-footer">
      <span>no trackers · no cookies · no idea why you're still here</span>

      <div className="v-footer-links">
        {FOOTER_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`v-footer-link${config.page === item.id ? " is-active" : ""}`}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="v-footer-dot"
          aria-label="operator access"
          onClick={() => openDoor("the footer dot")}
        >
          ·
        </button>
      </div>

      <span>last fiddled with · aug 2026 · {clock}</span>
    </footer>
  );
}
