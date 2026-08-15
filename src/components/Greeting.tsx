import { useEffect, useState } from "react";

import { Dialog } from "./Dialog";
import { useConfig } from "../config/ConfigContext";
import { hasBeenGreeted, markGreeted } from "../config/persistence";
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
  const { say } = useConfig();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasBeenGreeted()) return;
    const id = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const dismiss = () => {
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
    say("suit yourself", { silent: true });
  };

  return (
    <Dialog open={open} title="Yes, it moves." onClose={dismiss}>
      <div className="v-dialog-body">
        <p>
          There is an animated background back there doing nothing useful whatsoever.
          That is on purpose. If it irritates you, <strong>plain</strong> in the corner
          switches the whole lot off, and <strong>sound</strong> is already off in case
          you were worried about that too.
        </p>
        <p>Nothing is stored, nothing is measured, and you will not see this again.</p>
      </div>
      <div className="v-dialog-actions">
        <button type="button" className="v-btn v-btn-primary" onClick={dismiss} autoFocus>
          Fine
        </button>
      </div>
    </Dialog>
  );
}
