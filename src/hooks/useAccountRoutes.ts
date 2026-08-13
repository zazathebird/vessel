import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { isEditable } from "./useOperatorRoutes";

/**
 * The hidden ways to the account pages.
 *
 * The site has no visible link to `/signin` or `/signup`. That is a deliberate
 * choice while accounts are being built: there is nothing behind an account yet
 * — no setups to save, no machines to reach — so a footer link would be an
 * invitation to sign up for nothing. The URLs still work and are still real
 * pages; they are simply not advertised, the way the operator door is not.
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
    };

    const onDown = (event: PointerEvent) => {
      dragFrom.current = event.clientX;
    };

    const onUp = (event: PointerEvent) => {
      const from = dragFrom.current;
      dragFrom.current = null;
      // Leftward, where the door is rightward. `useOperatorRoutes` owns the
      // other direction and the two thresholds are equal on purpose, so the
      // gesture is one motion with two meanings rather than two motions.
      if (from !== null && from - event.clientX > DRAG_THRESHOLD) enter("pulled the other way");
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
