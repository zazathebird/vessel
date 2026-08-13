import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Focus trapping and focus return for the overlays (SPEC.md § Accessibility,
 * listed there as a gap to close rather than a design decision).
 *
 * While open, Tab cycles inside the container and the first control takes focus;
 * on close, focus returns to whatever opened it — which for the panel is usually
 * the siteconfig button, and for the door is wherever the unlock route fired.
 *
 * Traps stack. A dialog can open over the panel, and the palette over either,
 * and every trap listens on `document` — so without a stack, both handlers run
 * on the same Tab in registration order and fight: the lower trap yanks focus
 * to itself, the upper trap yanks it back to its *first* control, and Tab can
 * never reach the upper trap's second control. Only the most recently opened
 * trap may handle Tab; the ones beneath wait their turn.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Open traps, oldest first. The last entry is the one allowed to act. */
const stack: RefObject<HTMLElement | null>[] = [];

/** How many *modal* traps are open — dialogs and the palette, not the panel or
 * door. The global key routes check this: `aria-modal="true"` promises the
 * rest of the page is inert, so arrow-paging, `sudo`, `cmd` and ⌘K must not
 * fire underneath one. The panel and door are deliberately not modal — typing
 * `sudo` with the panel open has always opened the door, and stays that way. */
let modals = 0;

export function isModalOpen(): boolean {
  return modals > 0;
}

export function useFocusTrap(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  options?: { modal?: boolean },
): void {
  const modal = options?.modal ?? false;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    stack.push(ref);
    if (modal) modals += 1;

    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (stack[stack.length - 1] !== ref) return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inside = ref.current?.contains(active) ?? false;

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = stack.lastIndexOf(ref);
      if (at !== -1) stack.splice(at, 1);
      if (modal) modals = Math.max(0, modals - 1);
      // The opener may have unmounted (the door replaces itself with the panel),
      // in which case there is nothing to return to and the browser default wins.
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref, modal]);
}
