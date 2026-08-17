import { useCallback, useRef } from "react";
import type { MouseEvent } from "react";

import { useConfig } from "../config/ConfigContext";
import { NAV } from "../data/pageIds";
import type { LayoutId } from "../data/catalog";
import { DEFAULT_ORNAMENT } from "../data/ornaments";
import { DuelOrnament } from "./DuelOrnament";

/**
 * The hero ornament slot.
 *
 * Whichever ornament is selected, it occupies the same square box, so the
 * layouts that resize it (Radial's 540px, Magazine's 180px) and the ones that
 * hide it entirely need no knowledge of which is showing. Radial's orbiting nav
 * pills live in this slot too, and work over any of them.
 *
 * Every ornament recolours with the palette bleed and falls still in calm. All
 * but the duels are drawn from palette tokens in CSS — see chrome.css; the
 * duels are a canvas (DuelOrnament.tsx) that honours the same two promises.
 */

/** Layouts with no room for it: the windowed, sideways and row layouts. */
const HIDES_ORNAMENT: LayoutId[] = ["sidescroll", "terminal", "ledger", "console", "sheet"];

export function Ornament({ layout }: { layout: LayoutId }) {
  const { config, go, say, signinShown, revealSignin } = useConfig();

  const taps = useRef(0);
  const tapTimer = useRef<number | undefined>(undefined);

  // Five taps on the ornament reveal the footer's sign-in link (client request,
  // 2026-08-13) — the account side's answer to the logo's five taps, the way
  // the leftward drag answers the rightward one: same rhythm, other door. It
  // reveals a plain link to a real page and never touches `openDoor` —
  // SPEC-ACCOUNTS.md requires real auth stay clear of the operator theatre.
  // Keyboard users are not locked out: typing `login` remains the tellable
  // route, so this stays a pointer easter egg on a decorative element rather
  // than a button that would advertise itself to the tab order.
  const onTap = useCallback(
    (event: MouseEvent) => {
      // Radial parks its orbit pills in this same slot; a pill click is
      // navigation, not a tap on the ornament.
      if ((event.target as Element).closest("button")) return;
      if (signinShown) return;
      taps.current += 1;
      window.clearTimeout(tapTimer.current);
      if (taps.current >= 5) {
        taps.current = 0;
        revealSignin();
        say("the footer noticed");
        return;
      }
      if (taps.current > 2) say(String(5 - taps.current) + " more");
      tapTimer.current = window.setTimeout(() => {
        taps.current = 0;
      }, 1400);
    },
    [signinShown, revealSignin, say],
  );

  /*
   * One fight at a time (client, 2026-08-15: "when in landscape mode on mobile,
   * there are two fights going at the same time").
   *
   * `guardrails.ts` stops the randomiser *choosing* this pair, and that is what
   * fixed the live site, which publishes `mode: "visit"`. It is not the whole
   * fix, because a roll is only one of four ways config arrives: it can also be
   * published from siteconfig, pasted as a share code (which encodes the effect
   * and the ornament as independent fields), or restored from storage. This is
   * the one place all four converge, so the rule is enforced here as well.
   *
   * **The substitution is the default ornament, never `null`.** Emptying the
   * slot looks like the tidier answer and quietly breaks something else: the
   * five taps that reveal the footer's sign-in link live on this element, and
   * on the phone band that is the only findable route to an account. A visitor
   * would lose it for a reason they could not see and did not cause.
   *
   * The ornament yields rather than the background because a missing ornament
   * is already ordinary here — five layouts hide the slot outright — whereas a
   * missing background effect is not.
   */
  const duelFx = config.fx === "duel" || config.fx === "duelholy";
  const duelOrnament = config.ornament === "duel" || config.ornament === "duelholy";
  const ornament = duelFx && duelOrnament ? DEFAULT_ORNAMENT : config.ornament;

  // The phone band renders the ornament too (mobile parity, client request
  // 2026-08-13) — it is the findable sign-in affordance and the duels' home,
  // and hiding it left phones with neither. The layouts with no room for the
  // slot still hide it, on every band.
  if (HIDES_ORNAMENT.includes(layout)) {
    return null;
  }

  /*
   * **Radial keeps the slot even at "None", because its navigation lives in
   * it** (2026-08-17). The orbit is the only nav on that layout since the header
   * row stood down, so an empty ornament setting would have left the page with
   * no way off it — a chain of two settings, neither of which mentions the
   * other. The slot survives and simply draws nothing inside.
   */
  if (ornament === "none" && layout !== "radial") {
    return null;
  }

  return (
    <div className={`v-ornament is-${ornament}`} onClick={onTap}>
      {ornament === "sonar" && <Sonar />}
      {ornament === "valve" && <Valve />}
      {ornament === "lens" && <Lens />}
      {ornament === "aperture" && <Aperture />}
      {ornament === "orrery" && <Orrery />}
      {(ornament === "duel" || ornament === "duelholy") && (
        // The one ornament that is a canvas rather than CSS — an endless run of
        // little lightsword matches. See docs/DUEL.md and DuelOrnament.tsx.
        <DuelOrnament pairing={ornament} />
      )}

      {layout === "radial" && (
        /*
         * **The dial is the navigation on this layout, and the only copy of
         * it** (2026-08-17, client: *"if the links to pages are going to be
         * swirling around, dont have them at the top of the page also"*). The
         * header's row stands down under `.layout-radial`; this is what the
         * visitor gets instead, so it has to be complete and it has to be
         * correct.
         *
         * **The geometry is computed, not enumerated, and that is the whole
         * repair.** The old block hard-coded six positions as percentages of
         * *each pill's own box* — so the radius varied with the label, and the
         * six were never on one circle. Then `scams` joined `NAV` on 2026-08-14
         * and made it seven: the seventh pill matched no rule, took no
         * transform, and sat on the centre of the ornament underneath the
         * others. Measured before the fix, radii ran 50–113px and *Guestbook*
         * overlapped *Contact* by 95×34px. The comment on that block had even
         * warned that changing `NAV`'s length meant editing it; the warning was
         * the only thing that survived the change.
         *
         * `--i` and `--n` come from the data, so the dial is a circle at any
         * count and adding an eighth page is a nav change and nothing else.
         */
        <nav
          className="v-orbit"
          aria-label="Primary"
          style={{ "--n": NAV.length } as React.CSSProperties}
        >
          {NAV.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`chip v-pill v-orbit-pill${config.page === item.id ? " is-active" : ""}`}
              aria-current={config.page === item.id ? "page" : undefined}
              style={{ "--i": index } as React.CSSProperties}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/**
 * A sonar scope: a bezel, three range rings, a bearing cross, one beam sweeping
 * on a 4.8s revolution, and three contacts that answer it.
 *
 * The default ornament since 2026-08-17, and the client's own idea. The four it
 * replaces were circles that depicted nothing; this one is an instrument, which
 * is the difference the client was reaching for with *"why is it a circle"*.
 *
 * Every visual decision is in `chrome.css` — the slot owns the size and the calm
 * behaviour, so this only has to name the parts. The contacts' bearings are
 * fixed rather than random: a scope that finds something different on every
 * reload is a toy, and this one is the same instrument each time you look at it.
 */
function Sonar() {
  return (
    <>
      <span className="v-sonar-bezel" />
      <span className="v-sonar-ring s1" />
      <span className="v-sonar-ring s2" />
      <span className="v-sonar-ring s3" />
      <span className="v-sonar-cross" />
      <span className="v-sonar-beam" />
      <span className="v-sonar-blip b1" />
      <span className="v-sonar-blip b2" />
      <span className="v-sonar-blip b3" />
      <span className="v-sonar-core" />
    </>
  );
}

/** The original: a dashed ring, three dilating rings, a glowing core. */
function Valve() {
  return (
    <>
      <span className="v-valve-dash" />
      <span className="v-valve-ring r1" />
      <span className="v-valve-ring r2" />
      <span className="v-valve-ring r3" />
      <span className="v-valve-core" />
    </>
  );
}

/**
 * A lens in a recessed bezel. Nothing scales — the geometry is dead still and
 * only the light in the pupil moves, which is what separates a watching eye
 * from a pumping speaker.
 */
function Lens() {
  return (
    <>
      <span className="v-lens-bezel" />
      <span className="v-lens-inner" />
      <span className="v-lens-halo" />
      <span className="v-lens-iris" />
      <span className="v-lens-pupil" />
      <span className="v-lens-glint" />
    </>
  );
}

/** A camera iris: hard-edged blades on a slow rotation around a dark opening. */
function Aperture() {
  return (
    <>
      <span className="v-ap-blades" />
      <span className="v-ap-hole" />
      <span className="v-ap-rim" />
    </>
  );
}

/** Three bodies on three rings, each orbiting slower the further out it sits. */
function Orrery() {
  return (
    <>
      <span className="v-orrery-ring o1">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-ring o2">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-ring o3">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-sun" />
    </>
  );
}
