import { useEffect, useId, useState } from "react";

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
 * Everything below was corrected after an adversarial review found the first
 * version shipped with two ways to lose a password and an error nobody would
 * hear. Each one is noted where it sits.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus,
  error,
  onBlur,
  hideSignal,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: "new-password" | "current-password";
  hint?: React.ReactNode;
  autoFocus?: boolean;
  /**
   * A validation failure for this field. Rendered instead of the hint, styled
   * as an error, announced, and reflected on the input as `aria-invalid`.
   *
   * Deliberately separate from `hint` rather than a hint that changes wording:
   * a hint and a failure look identical to a screen reader and nearly identical
   * to a sighted user, and "these do not match" needs to read as something
   * being wrong rather than as advice.
   */
  error?: string;
  onBlur?: () => void;
  /**
   * Change this to force the field back to hidden.
   *
   * Parents bump it when they submit. Two reasons, both about the secret
   * outliving the moment it was needed: browsers exclude `type="password"` from
   * session/bfcache form restore but *not* `type="text"`, so a revealed field
   * left revealed can come back in plaintext on Back; and a rejected sign-in
   * otherwise leaves the password on screen for as long as the tab is open.
   */
  hideSignal?: number;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  useEffect(() => {
    if (hideSignal !== undefined) setShown(false);
  }, [hideSignal]);

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

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
          /*
           * **`autoCorrect` and `autoCapitalize` are the reveal's hidden cost.**
           * iOS suppresses both while a field is `type="password"` and applies
           * them the moment it becomes `type="text"` — so revealing and carrying
           * on typing gets you a capitalised first letter and autocorrected
           * words, the field shows what you typed, and a *different* string
           * reaches PBKDF2. At signup that is a sealed account: exactly the
           * failure this component exists to prevent, reintroduced by the fix.
           */
          autoCorrect="off"
          autoCapitalize="off"
          autoFocus={autoFocus}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        />
        <button
          type="button"
          className={`v-reveal${shown ? " is-shown" : ""}`}
          /*
           * A name that says what the button *does*, and no `aria-pressed`.
           *
           * Carrying both is the documented anti-pattern: a changing label plus
           * a state makes a reader announce "hide, pressed", where the label is
           * the next action and the state is the current one. And the name has
           * to include which field — signup has two of these, and "show, show"
           * in a button list is unusable.
           */
          aria-label={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-controls={id}
          // Without this the button takes focus off the field on mousedown, so
          // revealing loses your place in what you were typing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "hide" : "show"}
        </button>
      </div>
      {error ? (
        /*
         * **`key` is what makes this announce.** Both branches render a `<span>`
         * at the same position, so without distinct keys React reconciles them
         * as one element and patches `role`, `id` and text in place — no node is
         * inserted, and `role="alert"` fires on *insertion*. The first version
         * had no keys and its comment claimed it announced; measured against how
         * React reconciles, it would not have.
         */
        <span key="error" id={errorId} className="v-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span key="hint" id={hintId} className="v-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
