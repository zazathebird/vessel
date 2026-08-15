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
  if (ornament === "none" || HIDES_ORNAMENT.includes(layout)) {
    return null;
  }

  return (
    <div className={`v-ornament is-${ornament}`} onClick={onTap}>
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
        // The pills get their own container so their positions can be addressed
        // by :nth-child without counting whatever the ornament put before them.
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
    </div>
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
