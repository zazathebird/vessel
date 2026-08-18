import { useEffect, useState } from "react";

import { Dialog } from "./Dialog";
import { useConfig } from "../config/ConfigContext";
import { hasBeenGreeted, markGreeted } from "../config/persistence";
import { isModalOpen } from "../hooks/useFocusTrap";
import { calibrateOnce } from "../fx/perf";

/**
 * The first-visit greeting (client request, 2026-08-14).
 *
 * The problem it solves is real and was reported from the client's own machine:
 * the site is full of motion, the controls that switch it off are two small
 * chips in the header, and nobody reads a header. So a first-time visitor gets
 * one sentence telling them the site moves and where the off switch is, with a
 * single button. After that it never appears again — returning visitors get the
 * chips flashing a few times instead (`is-nudge` in Header.tsx), which is a
 * reminder rather than an interruption.
 *
 * **It is deliberately not a cookie banner.** No choice is being extracted, no
 * consent recorded, nothing is stored about the visitor except the single flag
 * that says "seen it" — the same shape as `vessel.calm.v1`. Dismissing it is
 * the whole interaction, and the site works identically either way.
 *
 * **It waits for the scramble.** `useScramble` runs the headline for 550ms on
 * load, and a modal that lands on top of it would eat the one moment the site
 * introduces itself. 1.2s puts it after the entrance has finished.
 *
 * It uses the `Dialog` primitive rather than rolling its own, so it inherits
 * the focus trap, the Escape handler, focus return, and the portal into the
 * themed wrapper. `window.alert` remains banned (§10) — this is what exists
 * instead.
 */
export function Greeting() {
  const { say, calmBySystem, chooseMotion } = useConfig();
  const [open, setOpen] = useState(false);

  /*
   * Two different facts, deliberately not one flag.
   *
   * `vessel.greeted.v1` records "has seen the introduction". The calm
   * preference records "has answered the motion question". A visitor who
   * dismissed the greeting before 2026-08-16 has the first and not the second,
   * and is sitting in OS-forced calm with every animation stripped, the chip
   * flash stripped with them, and now no dialog either — permanently, with
   * nothing on screen accounting for it. That is the state the client reported
   * from, so `calmBySystem` asks regardless of the greeting flag.
   *
   * It cannot become a nag: both buttons write the preference, which is what
   * `calmBySystem` is derived from.
   */
  useEffect(() => {
    if (!calmBySystem && hasBeenGreeted()) return;
    let id = 0;
    const tryOpen = () => {
      // Never on top of an open modal (2026-08-18). The 1.2s timer could land
      // while the command palette or a confirmation dialog was up; the
      // greeting then stacked over it, and the collateral Escape both
      // dismissed the greeting — permanently writing "seen it" (and, on the
      // calm branch, a motion preference) for a dialog nobody read — and
      // closed the layer beneath. Waiting costs nothing; the greeting has no
      // deadline.
      if (isModalOpen()) {
        id = window.setTimeout(tryOpen, 1500);
        return;
      }
      setOpen(true);
    };
    id = window.setTimeout(tryOpen, 1200);
    return () => window.clearTimeout(id);
  }, [calmBySystem]);

  // Takes its note as an explicit argument and is never passed straight to
  // `onClick`/`onClose` — a handler reference would be called with the event,
  // and the toast would render it.
  const close = (note: string) => {
    /*
     * The button is also the capability probe, and says nothing about it
     * (client, 2026-08-14: "just have it linked to clicking ok" and "dont say
     * the site is going to do it").
     *
     * A user gesture is the right moment: the machine is idle, a few
     * milliseconds are invisible behind a closing dialog, and the result is
     * ready before the first scroll. `calibrateOnce` no-ops if a measurement
     * is already stored, so this costs a returning visitor nothing — and the
     * continuous sampling in `FxCanvas` is still the authority either way.
     * This only decides where it starts.
     */
    calibrateOnce();
    // Marked on dismiss, not on show: a visitor who closes the tab during the
    // 1.2s wait has not been greeted, and should be next time.
    markGreeted();
    setOpen(false);
    // Silent by convention: calm silences audio anyway, and a visitor who has
    // just asked for less is the last one to greet with a noise.
    say(note, { silent: true });
  };

  const dismiss = () => close("suit yourself");

  /*
   * The reduced-motion branch (2026-08-16, client report: "nothing on the site
   * is live, no moving animations").
   *
   * A visitor whose computer asks for reduced motion is put into calm on
   * arrival, which is the right default and stays the right default. What was
   * wrong is that nothing said so. The canvas sits at `opacity: 0`, every
   * animation is stripped, the returning-visitor chip flash is stripped with
   * them — and then this dialog opened and said "The background moves", told
   * them to press **plain** to stop motion that was not happening, and never
   * mentioned the way back. The only dialog on the page described a different
   * page. That is indistinguishable from a site that is simply broken.
   *
   * So when the OS made the choice, the greeting names it and settles it. Both
   * buttons write a preference (`chooseMotion`), so this is asked exactly once
   * whichever way it is answered, and the still option leads and takes focus —
   * the visitor's computer already asked for that, and Escape agrees with it.
   */
  const answer = (moving: boolean) => {
    chooseMotion(moving);
    close(moving ? "off it goes" : "holding still");
  };

  if (calmBySystem) {
    return (
      <Dialog open={open} title="Your computer asked for no movement" onClose={() => answer(false)}>
        <div className="v-dialog-body">
          <p>
            This site normally has a slow pattern drifting about behind the words. Your
            computer is set to keep things still — that setting is usually called{" "}
            <strong>reduce motion</strong> — so the pattern is switched off and nothing
            here moves.
          </p>
          <p>
            You can turn it on for this site if you want to see it. That changes nothing
            else on your computer, and you can switch it off again at any time with the
            button marked <strong>plain</strong> at the top of the page.
          </p>
          <p>Nothing about you is saved or counted, and this message will not come back.</p>
        </div>
        <div className="v-dialog-actions">
          <button
            type="button"
            className="v-btn v-btn-primary"
            onClick={() => answer(false)}
            autoFocus
          >
            Keep it still
          </button>
          <button type="button" className="v-btn" onClick={() => answer(true)}>
            Let it move
          </button>
        </div>
      </Dialog>
    );
  }

  /*
   * Rewritten 2026-08-15 at the client's request — "make it stupid easy to
   * understand". The old version opened with "Yes, it moves.", which answers a
   * question the reader has not asked yet, then told them "plain in the corner
   * switches the whole lot off" without saying what plain is, where the corner
   * is, or what the whole lot means. Every sentence here now names the thing it
   * is talking about and says where to find it.
   */
  return (
    <Dialog open={open} title="The background moves" onClose={dismiss}>
      <div className="v-dialog-body">
        <p>
          The pattern behind this page drifts around on its own. It is decoration and
          nothing more — you can ignore it completely. If you would rather it held
          still, press the button marked <strong>plain</strong> at the top of the page
          and everything stops moving. Sound is already switched off.
        </p>
        <p>Nothing about you is saved or counted, and this message will not come back.</p>
      </div>
      <div className="v-dialog-actions">
        <button type="button" className="v-btn v-btn-primary" onClick={dismiss} autoFocus>
          OK
        </button>
      </div>
    </Dialog>
  );
}
