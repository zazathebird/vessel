import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Focus trapping and focus return for the two overlays (SPEC.md § Accessibility,
 * listed there as a gap to close rather than a design decision).
 *
 * While open, Tab cycles inside the container and the first control takes focus;
 * on close, focus returns to whatever opened it — which for the panel is usually
 * the siteconfig button, and for the door is wherever the unlock route fired.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
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
      // The opener may have unmounted (the door replaces itself with the panel),
      // in which case there is nothing to return to and the browser default wins.
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref]);
}
