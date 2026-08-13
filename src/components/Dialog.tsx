import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * The dialog primitive (SPEC-ACCOUNTS.md §10).
 *
 * Everything §10 fixes, in one place: focus-trapped with the same
 * `useFocusTrap` the panel and door use, Escape to dismiss, focus returned on
 * close (the trap's cleanup owns that), backdrop blur matching the panel's
 * 22px, entrance on the existing `cubic-bezier(.2,.8,.2,1)` at the panel's
 * 340ms, palette-driven with no literal colours, and z-index **75** — above
 * the panel (60), below the door scrim (80) and toasts (90). It does not
 * reuse the operator door, which stays theatre.
 *
 * **Dialogs portal into the themed wrapper, not `document.body`.** Every
 * colour in a dialog is a custom property set on that wrapper (`themeVars`),
 * so a body portal would render in no palette at all. The portal is also what
 * satisfies §11's "one more sibling at the overlay level": a dialog rendered
 * where its owner lives would sit inside `.v-stage`, whose entrance animation
 * holds a `transform` — and a transformed ancestor silently becomes the
 * containing block for `position: fixed`, pinning the "fullscreen" scrim to
 * the stage.
 *
 * `window.alert`, `window.confirm` and `window.prompt` remain banned (§10).
 * This is what exists instead.
 */

/** Set once in App to the themed wrapper element; dialogs portal into it. */
export const OverlayHostContext = createContext<RefObject<HTMLElement | null> | null>(null);

interface DialogProps {
  open: boolean;
  /** A sentence, not a label — it is the dialog's accessible name too. */
  title: string;
  /** Called on Escape, backdrop click, and the consumer's own cancel affordance. */
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const host = useContext(OverlayHostContext);
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, ref);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !host?.current) return null;

  return createPortal(
    <div className="v-dialog-scrim" onClick={onClose}>
      <div
        ref={ref}
        className="v-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="v-dialog-title">{title}</h2>
        {children}
      </div>
    </div>,
    host.current,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /**
   * §10: "the consequence stated in specific terms", never a generic "are you
   * sure". The caller writes the sentence because only it knows the numbers.
   */
  consequence: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  /**
   * §10's rule for account deletion: the confirm button stays disabled until
   * this exact text is typed. Omit for confirmations a click may carry.
   */
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The destructive-confirmation shape, built on the primitive. One `<form>`
 * with a submit button, per the project's form convention — Enter in the
 * type-to-confirm field and the button are the same code path.
 */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  busyLabel,
  requireText,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  // A reopened dialog must not remember the last confirmation's typing.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const ready = !busy && (!requireText || typed.trim() === requireText);

  return (
    <Dialog open={open} title={title} onClose={busy ? () => {} : onClose}>
      <div className="v-dialog-body">{consequence}</div>

      <form
        className="v-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onConfirm();
        }}
      >
        {requireText ? (
          <label className="v-field">
            <span className="v-field-label">Type {requireText} to confirm</span>
            <input
              className="v-input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </label>
        ) : null}

        <div className="v-dialog-actions">
          <button type="button" className="v-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="v-btn v-btn-danger" disabled={!ready}>
            {busy ? (busyLabel ?? "Working…") : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
