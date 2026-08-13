import { useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { MIN_PASSWORD_LENGTH, signUp } from "../auth/flows";
import { ApiError } from "../auth/api";

/**
 * Account creation.
 *
 * The first real-auth surface on the site, and deliberately **not** the operator
 * door: `SPEC.md` §Security fixes the door as theatre, and `SPEC-ACCOUNTS.md`
 * says real authentication must not reuse it. The door still guards nothing but
 * a settings panel; this guards an account.
 *
 * Form shape follows the convention `.v-paste` set — one `<form>` with an
 * `onSubmit` that calls `preventDefault()` and a `type="submit"` button — so
 * Enter and the button are one code path rather than two that can drift. The
 * disabled styling is already waiting in `interaction.css`.
 *
 * No literal colours anywhere: every surface below reads the palette custom
 * properties, so a palette change still bleeds across this page at 0.9s.
 */
export function SignUp() {
  const { go, say, holdSaver } = useConfig();

  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ handle: string; codes: string[] } | null>(null);

  // Writing ten codes down by hand takes minutes of touching nothing, and the
  // idle clock counts only clicks and keypresses — so without this the codes
  // fade out mid-transcription, on the one screen that renders exactly once.
  useEffect(() => {
    if (!result) return;
    holdSaver(true);
    return () => holdSaver(false);
  }, [result, holdSaver]);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const ready = handle.trim().length >= 3 && password.length >= MIN_PASSWORD_LENGTH && !busy;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);
    try {
      const created = await signUp(handle.trim(), password);
      setResult({ handle: created.account.handle, codes: created.recoveryCodes });
      say("Account created.");
    } catch (cause) {
      // An ApiError carries wording written to be read; anything else does not.
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Recovery codes are shown exactly once — the server keeps only hashes, so
  // there is no second chance and the copy has to say so plainly.
  if (result) {
    return (
      <section className="v-account" aria-live="polite">
        <h2 className="v-account-title">Account created — {result.handle}</h2>
        <p className="v-account-note">
          These ten recovery codes are shown <strong>once</strong>. They are the only way back in if
          you forget your password. Write them down now; the site kept only hashes of them and
          genuinely cannot show them again.
        </p>
        <ul className="v-codes">
          {result.codes.map((code) => (
            <li key={code} className="v-recovery-code">{code}</li>
          ))}
        </ul>
        <button
          type="button"
          className="v-btn"
          onClick={() => {
            // The one copy on the site that must never claim a success it did
            // not have: a denied clipboard write plus "copied" is how someone
            // leaves this screen with nothing.
            const written = navigator.clipboard?.writeText(result.codes.join("\n"));
            if (!written) {
              say("Copying is unavailable here — write them down.");
              return;
            }
            written.then(
              () => say("Recovery codes copied."),
              () => say("Copy was blocked — write them down."),
            );
          }}
        >
          Copy all ten
        </button>

        {/* Signup signs you in — the Worker attaches a session to the 201
            (`accounts.ts`, `withSession`) — so this is "go to your account",
            not "sign in". Deliberately a link and not an automatic redirect:
            leaving this screen is the one thing here that cannot be undone,
            and the codes are only on it once. */}
        <p className="v-account-aside">
          You are signed in already. Once those are written down,{" "}
          <button type="button" className="v-account-link" onClick={() => go("signin")}>
            go to your account
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="v-account">
      <form className="v-account-form" onSubmit={onSubmit}>
        <label className="v-field">
          <span className="v-field-label">Handle</span>
          <input
            className="v-input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoComplete="username"
            spellCheck={false}
            // Letters, digits and hyphens only, so a handle stays usable as a
            // DNS label later (design/GUIDE-SUBDOMAINS.md).
            pattern="[A-Za-z0-9][A-Za-z0-9-]{2,23}"
            placeholder="three to twenty-four characters"
          />
          <span className="v-field-hint">Letters, digits and hyphens. No email is collected.</span>
        </label>

        <label className="v-field">
          <span className="v-field-label">Password</span>
          <input
            className="v-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className="v-field-hint">
            {tooShort
              ? `At least ${MIN_PASSWORD_LENGTH} characters — ${MIN_PASSWORD_LENGTH - password.length} to go.`
              : `At least ${MIN_PASSWORD_LENGTH} characters. It never leaves your browser.`}
          </span>
        </label>

        {error ? (
          <p className="v-account-error" role="alert">{error}</p>
        ) : null}

        <button type="submit" className="v-btn v-btn-primary" disabled={!ready}>
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="v-account-aside">
          Already have one?{" "}
          <button type="button" className="v-account-link" onClick={() => go("signin")}>
            Sign in
          </button>
          .
        </p>
      </form>
    </section>
  );
}
