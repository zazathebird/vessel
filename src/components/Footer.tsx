import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { FOOTER_NAV } from "../data/pageIds";

export function Footer() {
  const { config, go, clock, openDoor, signinShown } = useConfig();
  // The account/admin pair is operator-only, and that is what makes it
  // compatible with the account pages being unlinked. The request was that
  // *visitors* find no standing way in; a signed-in operator having to
  // remember a typed word to reach their own administration is not privacy,
  // it is a trapdoor that locks from the inside. Signed out, `isOperator` is
  // false and the pair renders nothing at all.
  //
  // `signinShown` is the one exception, added at the client's request
  // (2026-08-13): five taps on the hero ornament reveal a sign-in link here
  // for the rest of the visit. Findable, not advertised.
  const { isOperator, me } = useSession();

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
        {signinShown && !isOperator ? (
          <button
            type="button"
            className={`v-footer-link is-found${config.page === "signin" ? " is-active" : ""}`}
            onClick={() => go("signin")}
          >
            {me ? "account" : "sign in"}
          </button>
        ) : null}
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
