/**
 * The operator's password, asked in the same gesture as a consequential act.
 *
 * Extracted from `Admin.tsx` on 2026-09-06 when the downloads editor's releases
 * (delete a page, delete a file, mint a per-file code) and the site publish
 * gained the same password proof the account actions have had since
 * 2026-09-03. One dialog, so the four screens that ask cannot ask differently.
 * The caller turns the password into an auth secret with `derivePassword` and
 * nothing here sees the plaintext for longer than the dialog lives.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { Dialog } from "./Dialog";

/** What a confirmation says and demands. One shape, so the dialog cannot drift. */
export interface Confirmation {
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** §10's rule for account deletion: type the handle before the button lives. */
  requireText?: string;
}

/**
 * A confirmation that also takes the operator's own password.
 *
 * Built on `Dialog` rather than on `ConfirmDialog` because the password belongs
 * to the same gesture as the confirmation: the Worker will not write without it,
 * and a second dialog after the first would be a second chance to lose track of
 * which account is being acted on. Everything §10 fixes still comes from the
 * primitive — the trap, Escape, the portal into the themed wrapper.
 *
 * One `<form>` with a `type="submit"` button, per the project's form convention,
 * so Enter in either field and the button are the same code path.
 *
 * The password is component state and dies with the dialog, which is unmounted
 * on close. It is deliberately not a `PasswordField`: that field's reveal exists
 * so a password being *set* can be checked before it becomes unrecoverable, and
 * this one is being re-typed by somebody who already knows it.
 */
export function ProofDialog({
  title,
  consequence,
  confirmLabel,
  busyLabel,
  requireText,
  busy,
  error,
  onConfirm,
  onClose,
}: Confirmation & {
  busy: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");

  const ready = !busy && password.length > 0 && (!requireText || typed.trim() === requireText);

  return (
    <Dialog open title={title} onClose={busy ? () => {} : onClose}>
      <div className="v-dialog-body">{consequence}</div>

      <form
        className="v-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onConfirm(password);
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

        <label className="v-field">
          <span className="v-field-label">Your password</span>
          <input
            className="v-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus={!requireText}
          />
        </label>

        {/* Inside the dialog, not behind it: the failure this most often
            reports is a mistyped password, and it is answered where it was
            typed. Kept, along with the typing, so the fix is one keystroke. */}
        {error ? (
          <p className="v-account-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="v-dialog-actions">
          <button type="button" className="v-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="v-btn v-btn-danger" disabled={!ready}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
