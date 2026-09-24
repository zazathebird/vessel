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

/*
 * The selector is the first pass only — what *could* take focus. `select` and
 * `textarea` gained their `:not([disabled])` beside `button` and `input`'s
 * (2026-09-24), but no selector can say whether an element is inside an
 * `inert` subtree or not rendered at all; `canTakeFocus` answers those.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What `canTakeFocus` needs to know about an element — DOM-free, so the gate
 *  can drive the decision with plain objects. */
export interface FocusFacts {
  /** `:disabled` — including through a disabled `<fieldset>`, which no attribute selector sees. */
  disabled: boolean;
  /** Inside an `inert` subtree — the sleeping chrome, for one. */
  inert: boolean;
  /** Has a box: not `display: none`, and not under a `hidden` or `display: none` ancestor. */
  rendered: boolean;
  /** Not `visibility: hidden` / `collapse`. */
  visible: boolean;
}

/**
 * Can the trap hand this element focus? (2026-09-24 review, item 15.)
 *
 * The selector alone let the trap pick an element the browser will not
 * focus, or one the visitor cannot see: a collapsed `<details>` body, a
 * `hidden` section, a control inside an `inert` region. `focus()` on those
 * either does nothing — so the trap's "first control takes focus" left focus
 * outside the dialog it promised to hold — or lands on something invisible,
 * and Tab's wrap to the *last* item went to the invisible one.
 */
export function canTakeFocus(f: FocusFacts): boolean {
  return !f.disabled && !f.inert && f.rendered && f.visible;
}

/** The browser's answers to `FocusFacts`, for a real element. */
function factsOf(el: HTMLElement): FocusFacts {
  const style = getComputedStyle(el);
  return {
    disabled: el.matches(":disabled"),
    inert: el.closest("[inert]") !== null,
    // No client rects means no box: display:none on it or on any ancestor
    // (which is what `hidden` does). Cheaper than walking the ancestors.
    rendered: el.getClientRects().length > 0,
    visible: style.visibility !== "hidden" && style.visibility !== "collapse",
  };
}

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

/**
 * Is this trap the top of the stack — the one layer allowed to act?
 *
 * Exported for the Escape handlers (2026-08-18). Tab was already gated on the
 * stack (line below in `useFocusTrap`), but Escape was not: both the dialog
 * and the palette listen on `document` and call `stopPropagation()`, which
 * stops the event reaching `window` but does **not** stop other listeners on
 * the same node — that is `stopImmediatePropagation`, and relying on it would
 * make correctness depend on registration order. So with two modal layers
 * open, one Escape closed both, contradicting the "one Escape, one layer"
 * guarantee both handlers state. Gating each handler on being the top layer
 * is the same fix Tab already uses.
 */
export function isTopTrap(ref: RefObject<HTMLElement | null>): boolean {
  return stack[stack.length - 1] === ref;
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
    const items = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) =>
        canTakeFocus(factsOf(el)),
      );

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
      // Asked *before* the splice, because this is a question about the stack
      // as it stood while the trap was open.
      //
      // **Returning focus is gated on being the top layer, exactly as Tab and
      // Escape are.** Traps stack — a dialog opens over the panel, the palette
      // over either — and closing a *lower* one is not a reason to move focus:
      // it yanked the caret out of the open modal above and into whatever had
      // opened the layer underneath it, which is the same fight the stack was
      // introduced to settle, one property over. The top layer closing is the
      // only case where "focus returns to whatever opened it" is a description
      // of what the visitor is looking at.
      const wasTop = isTopTrap(ref);
      const at = stack.lastIndexOf(ref);
      if (at !== -1) stack.splice(at, 1);
      if (modal) modals = Math.max(0, modals - 1);
      // The opener may have unmounted (the door replaces itself with the panel),
      // in which case there is nothing to return to and the browser default wins.
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [open, ref, modal]);
}
