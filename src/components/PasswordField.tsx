import { useId, useState } from "react";

/**
 * A password input with a reveal toggle.
 *
 * **Written 2026-08-17, the day the operator was locked out of his own site**
 * — not by a lost password, but by one that was never correctly recorded. This
 * site has no email reset by design (§9 collects no address), so a typo at
 * signup is not an inconvenience, it is an unrecoverable account. A field you
 * cannot read while typing is a bad trade in that situation.
 *
 * It is a *reveal*, not a confirm-by-retyping, because NIST 800-63B is explicit
 * that verifiers **should** offer the option to display the secret: retyping
 * catches a typo only by making you make it twice, whereas showing it lets you
 * check the thing you actually have. Signup asks for both, and only signup —
 * see the note on `confirm` in `SignUp.tsx`.
 *
 * Three details are load-bearing:
 *
 * - **`type="button"`.** Inside a `<form>` a bare `<button>` submits it, so the
 *   reveal toggle would create the account.
 * - **The label is associated by `id`, not by nesting.** The rest of the account
 *   forms wrap the input in its `<label>`, which is fine until there is a button
 *   beside it — a click on a control inside a label also activates the label,
 *   which re-targets focus and makes the toggle behave oddly. Explicit
 *   `htmlFor` keeps the association without the nesting.
 * - **`autoComplete` is passed through** rather than hardcoded. `new-password`
 *   on signup and `current-password` on sign-in is what tells a password manager
 *   to offer generation versus retrieval, and getting it wrong is how people end
 *   up with an unsaved password — the exact failure this component exists for.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: "new-password" | "current-password";
  hint?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="v-field">
      <label className="v-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="v-input-wrap">
        <input
          id={id}
          className="v-input"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="v-reveal"
          aria-pressed={shown}
          aria-controls={id}
          // Without this the button takes focus off the field on mousedown, so
          // revealing loses your place in what you were typing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "hide" : "show"}
        </button>
      </div>
      {hint ? <span className="v-field-hint">{hint}</span> : null}
    </div>
  );
}
