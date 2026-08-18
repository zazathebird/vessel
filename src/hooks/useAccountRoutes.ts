import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { isModalOpen } from "./useFocusTrap";
import { isEditable } from "./useOperatorRoutes";

/**
 * The hidden ways to the account pages.
 *
 * **The site does have a standing link now, and these are no longer the only
 * way in** (2026-08-18, client: *"I need a portal to the login page"*). The
 * footer carries a permanent `sign in` link — see `Footer.tsx` for why it had
 * to, which is that the route it replaced had a dead end on the phone band.
 *
 * These routes are kept anyway and are not redundant: they are the *tellable*
 * ones. "Type `whoami`" is a thing an operator can be told once and remember,
 * and it works from any page without hunting for a link. What changed is that
 * they stopped being load-bearing — nobody is locked out if none of them is
 * found.
 *
 * **These are not the operator door, and they must never become it.** `SPEC.md`
 * §Security fixes the door as theatre guarding a settings panel, and
 * `SPEC-ACCOUNTS.md` requires that real authentication not reuse it. So these
 * routes call `go("signin")` — a plain navigation to a real page — and nothing
 * here touches `openDoor`. The two sets of gestures are deliberately disjoint:
 *
 * | Gesture                | Goes to           |
 * |------------------------|-------------------|
 * | five taps on the logo  | door (theatre)    |
 * | the footer `·`         | door (theatre)    |
 * | konami, `sudo`, ⌘K     | door (theatre)    |
 * | drag **right**         | door (theatre)    |
 * | type `whoami`          | **sign-in**       |
 * | type `login`           | **sign-in**       |
 * | drag **left**          | **sign-in**       |
 * | the footer `sign in`   | **sign-in**       |
 *
 * The mirrored drag is the pick of them: the door is a sideways pull one way
 * and the account is the same pull the other, which is the kind of symmetry
 * someone finds once by accident and then remembers for good.
 *
 * `⌘K` is pointedly not used. It is already claimed twice — `SPEC.md` gives it
 * to the door and `SPEC-ACCOUNTS.md` §10 to the command palette — and that
 * contradiction is open with the client. Adding a third claimant would settle
 * it by accident, in the wrong direction.
 */

const DRAG_THRESHOLD = 260;

/** How much of a typed buffer to keep. Long enough for `whoami`, short enough to forget. */
const BUFFER = 12;

export function useAccountRoutes(): void {
  const { go, say, poke } = useConfig();

  // Read at event time so the listeners can be attached once and never rebound.
  const keys = useRef<string[]>([]);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    const enter = (via: string) => {
      keys.current.length = 0;
      // Say how they got in. A hidden route that arrives silently reads as a
      // misclick; naming it makes it a thing they found, and — more usefully —
      // tells them how to do it again.
      say(via);
      go("signin");
    };

    const onKey = (event: KeyboardEvent) => {
      poke();
      // Nothing here may fire under an aria-modal layer: typing `admin` with
      // focus on a dialog's Cancel button would navigate away and unmount the
      // confirmation mid-flight.
      if (isModalOpen()) return;
      // Typing a handle must never navigate. The account pages are the first
      // inputs outside the panel, so this guard is what makes them usable.
      if (isEditable(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = (event.key || "").toLowerCase();
      if (key.length !== 1) return;

      keys.current.push(key);
      if (keys.current.length > BUFFER) keys.current.shift();
      const buffer = keys.current.join("");

      if (buffer.includes("whoami")) enter("who indeed");
      else if (buffer.includes("login")) enter("the front door, sort of");
      else if (buffer.includes("admin")) {
        // Goes to the account page, not straight to administration: signed out,
        // /admin has nothing to say, and sign-in is the step that was missing
        // anyway. Signed in as an operator, the summary links straight on.
        keys.current.length = 0;
        say("through the back");
        go("admin");
      } else if (buffer.includes("machines")) {
        // The phase-2 pair (SPEC-ACCOUNTS.md §13): same unlinked convention as
        // the account pages — typed routes, and the account summary links them.
        keys.current.length = 0;
        say("the fleet");
        go("machines");
      } else if (buffer.includes("share")) {
        keys.current.length = 0;
        say("the sharing tab");
        go("share");
      }
    };

    // Selecting text is a drag. `/signup`'s recovery codes render exactly once
    // — the server keeps only hashes — and reading ten of them back means
    // selecting them, right-to-left as often as not; navigating on that would
    // unmount the screen and lose the codes for good. Two guards because one
    // does not cover it: the target check catches a drag begun inside an input,
    // and the selection check catches one begun on ordinary text.
    const onDown = (event: PointerEvent) => {
      dragFrom.current = isEditable(event.target) ? null : event.clientX;
    };

    const onUp = (event: PointerEvent) => {
      const from = dragFrom.current;
      dragFrom.current = null;
      if (from === null) return;
      if (isModalOpen()) return;
      // A finger is not a mouse (2026-08-14 phone audit): a mostly-horizontal
      // swipe over non-scrollable page never gets a pointercancel, so an
      // ordinary reading gesture would yank the visitor to /signin. Phones
      // have the footer's permanent `sign in` link instead, which is what the
      // five-tap ornament route named here used to be (deleted 2026-08-18).
      if (event.pointerType === "touch") return;
      if (window.getSelection()?.toString()) return;
      // Leftward, where the door is rightward. `useOperatorRoutes` owns the
      // other direction and the two thresholds are equal on purpose, so the
      // gesture is one motion with two meanings rather than two motions.
      if (from - event.clientX > DRAG_THRESHOLD) enter("pulled the other way");
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [go, say, poke]);
}
