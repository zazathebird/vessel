import { useCallback, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { chromeUntouched, hasBeenGreeted, saveCalmPreference, saveSoundPreference } from "../config/persistence";
import { useSession } from "../auth/SessionContext";
import { NAV, OPERATOR_NAV, PATHS } from "../data/pageIds";
import { useEdgeFade } from "../hooks/useEdgeFade";
import { openCommandPalette } from "./CommandPalette";

/**
 * Header: logo (with the five-tap unlock route), nav pills, calm toggle, and
 * the siteconfig button (visible only once the operator door has ever opened).
 */
export function Header() {
  const { band, config, go, update, say, chime, togglePanel, openDoor, panelOpen, layout } = useConfig();
  // Operator tabs (404 / Account / Admin / Config) appear only once the session
  // probe answers operator. Like everything session-gated they start hidden and
  // arrive — never flash and vanish (SessionContext's rule).
  const { isOperator } = useSession();

  /**
   * The returning-visitor nudge (client request, 2026-08-14).
   *
   * First visit gets the `Greeting` dialog. After that it never returns — but
   * someone who dismissed it without reading has no second prompt, so the two
   * chips flash a few times instead. Read once at mount, not per render: it
   * must not restart the flash on every state change, and it must stop the
   * moment either switch is touched.
   */
  const nudge = useRef(hasBeenGreeted() && chromeUntouched()).current;

  /**
   * The pill row scrolls sideways on the narrow bands, and `useEdgeFade` is what
   * tells the reader so — on whichever edge is actually hiding something. See
   * the hook for why this is measured rather than driven off the band.
   *
   * A callback ref, because the nav is conditionally rendered (it stands down
   * on Radial for visitors): the hook has to rebind when the element mounts
   * later or is replaced, which a plain ref object cannot signal.
   */
  const navRef = useEdgeFade();

  /*
   * Two tap counters on one lockup, and they are deliberately on *different*
   * elements (2026-08-18, client: "my admin, click the mcclevarty.ca in the top
   * left corner", "more than 2 clicks on desktop and mobile").
   *
   * They cannot share an element. The door's route is five taps and admin's is
   * three, so a single counter reaches three first and navigates away — the
   * door's fifth tap is unreachable by construction. That is the same trap the
   * old comment here warned about when it said the five taps work *because* the
   * logo has no other click action; giving the lockup a second gesture is
   * exactly the case it named.
   *
   * So the split is by element and the sizes decided which way round:
   *
   * - **`/admin` is on the whole lockup** (`.v-logo`) — 32px tall and ~190px
   *   wide, because `.v-logo-mark` sets the row's height. The wordmark span on
   *   its own is a 13px font, so ~16px tall: fine for a mouse and a bad target
   *   for a thumb, and this route was asked for on mobile as well as desktop.
   * - **The door stays on the glyph** (`.v-logo-mark`, 32×32) and
   *   `stopPropagation`s, so a tap there never also counts toward admin. It is
   *   a decorative `aria-hidden` element, which is this codebase's established
   *   host for a pointer-only route — the footer `·` is the same pattern for
   *   the same reason, and is smaller than this.
   *
   * Neither counter announces itself. The door's "N more" countdown is kept and
   * stays gated on `isOperator`; admin gets no countdown at all, because the
   * moment it is most useful is signed *out* — when there is nobody to count
   * down to, and a visitor being told they are three taps from something is the
   * hint the client asked the site never to give.
   */
  const doorTaps = useRef(0);
  const doorTimer = useRef<number | undefined>(undefined);
  const adminTaps = useRef(0);
  const adminTimer = useRef<number | undefined>(undefined);

  /** Taps within this of each other count as one run. Shared by both routes. */
  const TAP_WINDOW = 1400;

  const onMarkTap = useCallback(
    (event: React.MouseEvent) => {
      // Without this the same tap lands on `.v-logo` underneath and advances
      // the admin counter too — five taps on the glyph would open the door and
      // have navigated to /admin two taps earlier.
      event.stopPropagation();
      doorTaps.current += 1;
      window.clearTimeout(doorTimer.current);
      if (doorTaps.current >= 5) {
        doorTaps.current = 0;
        openDoor("five taps");
        return;
      }
      // The countdown is gated the way the door itself is: openDoor refuses
      // non-operators, so teasing a visitor with "2 more" counts them down to
      // silently nothing (review 2026-08-13).
      if (doorTaps.current > 2 && isOperator) say(String(5 - doorTaps.current) + " more");
      doorTimer.current = window.setTimeout(() => {
        doorTaps.current = 0;
      }, TAP_WINDOW);
    },
    [openDoor, say, isOperator],
  );

  const onLogoTap = useCallback(() => {
    adminTaps.current += 1;
    window.clearTimeout(adminTimer.current);
    if (adminTaps.current >= 3) {
      adminTaps.current = 0;
      // Like every account route this *navigates* and never unlocks anything —
      // `useAccountRoutes`'s rule, and the reason these gestures stay disjoint
      // from the door's. Signed out, /admin says what it is and offers sign-in;
      // signed in as anyone else it does the same. It is not a gate.
      say("the corner office");
      go("admin");
      return;
    }
    adminTimer.current = window.setTimeout(() => {
      adminTaps.current = 0;
    }, TAP_WINDOW);
  }, [go, say]);

  return (
    <header className="v-header">
      <div className="v-artery">
        <span className="v-artery-highlight" />
      </div>

      <div className="v-header-row">
        {/*
          The wordmark: three taps to /admin, five taps on the glyph to the
          door. Both are pointer easter eggs, neither is a control.

          It was a `<button aria-label="mcclevarty.ca — tap for operator
          access">`, which is the same fault the footer dot had and in a worse
          place: the label named a hidden route to every screen reader on every
          page of the site, and "nothing on the site advertises the site — no
          hints that hidden routes exist" is the client's own instruction. It
          was also a dead control, because tapping the logo did nothing at all
          unless you were the operator and tapped it five times, so a keyboard
          user reached it, activated it, and got silence.

          **It is still not a link home, and still has no accessible name of its
          own.** Both of those stay true now that it navigates: a route that
          takes three taps is not a control, and naming it would advertise it.
          Keyboard users lose nothing — /admin is reachable by typing `admin`,
          which is the tellable version, and the door has five other routes
          including `sudo`.

          The header renders on every layout and every band — verified, and
          gated in `npm run check` — so unlike the ornament's deleted five-tap
          route this cannot develop a dead end on a layout that hides its host.
        */}
        <span className="v-logo" onClick={onLogoTap}>
          <span className="v-logo-mark" aria-hidden="true" onClick={onMarkTap}>
            <span className="v-logo-ring a" />
            <span className="v-logo-ring b" />
            <span className="v-logo-dot" />
          </span>
          <span className="v-wordmark">mcclevarty.ca</span>
        </span>

        {/*
          On Radial the dial in the ornament slot is the primary navigation and
          this row stands down (2026-08-17). Hiding the links with CSS alone
          left two <nav aria-label="Primary"> landmarks in the tree — one of
          them empty for non-operators — so screen-reader landmark navigation
          offered a "Primary" that led nowhere. The links now come out of the
          tree on Radial, the landmark renders only when it has content (the
          operator tabs), and it is labelled by what it then holds. The
          .layout-radial CSS rule stays as a belt for the same links.
          `layout` is the adapted layout, so this cannot fire off the desk band
          — Radial collapses to Cinematic/Stack elsewhere, exactly like the CSS.
        */}
        {(layout !== "radial" || isOperator) && (
        <nav className="v-nav" aria-label={layout === "radial" ? "Operator" : "Primary"} ref={navRef}>
          {layout !== "radial" && NAV.map((item) => (
            <a
              key={item.id}
              href={PATHS[item.id]}
              className={`chip v-pill v-pill-nav${config.page === item.id ? " is-active" : ""}`}
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
        )}

        <div className="v-header-right">
          {band !== "desk" && (
            // Mobile parity (client request, 2026-08-13): the palette's only
            // route in is typing `cmd`, which needs a hardware keyboard. Bands
            // that usually have none get a chip. Desk keeps the typed idiom —
            // a standing button everywhere would advertise what SPEC-ACCOUNTS
            // §10 shipped as a shortcut.
            <button type="button" className="chip" onClick={openCommandPalette}>
              cmd
            </button>
          )}
          <button
            type="button"
            className={`chip${nudge ? " is-nudge" : ""}`}
            aria-pressed={config.calm}
            /*
             * Labelled "plain", not "calm" (2026-08-14, client: "people won't
             * know what that means"). They were right — "calm" names a mood, not
             * a function, and this is the control that makes the low-contrast
             * palettes readable, so a visitor who needs it has to be able to
             * guess what it is. **The label is the only thing that changed**:
             * `config.calm`, `.is-calm`, `vessel.calm.v1` and share-code bit 8
             * all keep the old name, because renaming them breaks stored
             * preferences and codes already in circulation for zero visible
             * gain — the same rule the de-branding followed.
             *
             * The title says what it does, since two words on a chip cannot.
             */
            title="Plain: one accent colour, no motion, higher contrast"
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
              say(calm ? "plain — one accent, no motion" : "plain off");
            }}
          >
            {config.calm ? "plain ✓" : "plain"}
          </button>
          {!config.calm && (
            // Hidden in calm rather than disabled: calm silences sound anyway,
            // so a switch that visibly does nothing would be worse than no
            // switch. It returns, holding its value, when calm goes off.
            <button
              type="button"
              className={`chip${nudge ? " is-nudge" : ""}`}
              aria-pressed={config.sound}
              onClick={() => {
                const sound = !config.sound;
                update({ sound });
                // The second setting that follows the visitor home, and the
                // more important direction is off: being told to be quiet is an
                // instruction, not a preference for one session.
                saveSoundPreference(sound);
                // Through `chime`, the single gate — `update` above freshens
                // `live.current` in the same tick, so the gate sees the value
                // just set. This used to call `play` directly, on the belief
                // that the gate would still read the previous render's `sound:
                // false`. It read the previous render's `sound: **true**` on the
                // way *off*, so "switching off stays silent" was false: the tick
                // played and the release effect then closed the context a frame
                // later, mid-envelope, turning it into the click `blip` exists
                // to avoid. Switching on is the confirmation; switching off is
                // silent. Both now actually behave that way.
                chime("toggle");
                say(sound ? "sound on" : "sound off");
              }}
            >
              {config.sound ? "sound ✓" : "sound"}
            </button>
          )}
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
