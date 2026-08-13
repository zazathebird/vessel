import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { FOOTER_NAV } from "../data/pageIds";

export function Footer() {
  const { config, go, clock, openDoor } = useConfig();
  // Operator-only, and that is what makes it compatible with the account pages
  // being unlinked. The request was that *visitors* find no way in; a signed-in
  // operator having to remember a typed word to reach their own administration
  // is not privacy, it is a trapdoor that locks from the inside. Signed out,
  // `isOperator` is false and this renders nothing at all.
  const { isOperator } = useSession();

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
        {isOperator ? (
          <>
            <button
              type="button"
              className={`v-footer-link${config.page === "signin" ? " is-active" : ""}`}
              onClick={() => go("signin")}
            >
              account
            </button>
            <button
              type="button"
              className={`v-footer-link${config.page === "admin" ? " is-active" : ""}`}
              onClick={() => go("admin")}
            >
              admin
            </button>
          </>
        ) : null}
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
