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
            aria-current={config.page === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}
        {signinShown && !isOperator ? (
          <button
            type="button"
            className={`v-footer-link is-found${config.page === "signin" ? " is-active" : ""}`}
            aria-current={config.page === "signin" ? "page" : undefined}
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
              aria-current={config.page === "signin" ? "page" : undefined}
              onClick={() => go("signin")}
            >
              account
            </button>
            <button
              type="button"
              className={`v-footer-link${config.page === "admin" ? " is-active" : ""}`}
              aria-current={config.page === "admin" ? "page" : undefined}
              onClick={() => go("admin")}
            >
              admin
            </button>
          </>
        ) : null}
        {/*
          The door's sixth route, and a pointer-only easter egg on purpose.

          It was a `<button aria-label="operator access">`, which announced the
          existence of a hidden route to every screen reader that reached the
          footer — the one thing the client asked the site not to do ("no hints
          that hidden routes exist"). It also put an 8×14 control in the tab
          order between two real footer links, so a keyboard user landed on a
          button that names a door and, for anyone who is not the operator,
          does nothing at all when pressed.

          Same resolution as the ornament's five taps, for the same reason:
          keyboard users are not locked out, because typing `sudo` is still a
          route and is the tellable one. A decorative mark should not advertise
          itself to the tab order.
        */}
        <span
          className="v-footer-dot"
          aria-hidden="true"
          onClick={() => openDoor("the footer dot")}
        >
          ·
        </span>
      </div>

      <span>last fiddled with · aug 2026 · {clock}</span>
    </footer>
  );
}
