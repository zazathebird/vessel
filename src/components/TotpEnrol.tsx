import { useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { ApiError, type MeResult } from "../auth/api";
import { beginTotpEnrolment, type TotpEnrolment } from "../auth/flows";

/**
 * Turn on the second factor, from inside the account.
 *
 * Three moments, in order: prove the password, copy the secret into an
 * authenticator, prove the authenticator. The middle one is text on purpose —
 * §4 requires the secret both as a manual string and as an `otpauth://` URI,
 * and both are shown as exactly that. A QR code would need a library, and the
 * no-third-party rule outranks the convenience of pointing a camera.
 *
 * The password is asked for once. `beginTotpEnrolment` holds the derived auth
 * secret in its closure for the confirm call — the same shape `RecoverySignIn`
 * uses for the wrapping key, and for the same reason: what must be presented
 * twice should be derived once and never sit in component state.
 *
 * The backup codes render before anything else in this component, including
 * the "already on" state — they are shown exactly once, the server keeps only
 * hashes, and a re-render that swapped them for a summary would be the screen
 * eating the only copy.
 */

interface Props {
  me: MeResult;
  /** Called after enrolment confirms, so the summary above can update. */
  onChanged: () => void | Promise<void>;
}

export function TotpEnrol({ me, onChanged }: Props) {
  const { say } = useConfig();

  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(cause: unknown) {
    setError(
      cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : "Something went wrong. Try again.",
    );
  }

  async function onBegin(event: React.FormEvent) {
    event.preventDefault();
    if (password.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    try {
      // A PBKDF2 run and two round trips — seconds on a slow phone, so the
      // button says what it is doing.
      setEnrolment(await beginTotpEnrolment(password));
      setPassword("");
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  const digits = code.replace(/\s/g, "");

  async function onConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolment || !/^[0-9]{6}$/.test(digits) || busy) return;

    setBusy(true);
    setError(null);
    try {
      const codes = await enrolment.confirm(digits);
      setBackupCodes(codes);
      setEnrolment(null);
      setCode("");
      say("Second factor on.");
      // The summary above refreshes behind the codes; this screen stays until
      // the reader says they have them.
      await onChanged();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <div className="v-account-form" aria-live="polite">
        <h3 className="v-field-label">Backup codes</h3>
        <p className="v-account-note">
          The second factor is on. These ten codes each work once, in place of a six-digit code,
          for the day the authenticator is lost. Write them down now — the site kept only hashes
          and genuinely cannot show them again.
        </p>
        <ul className="v-codes">
          {backupCodes.map((backupCode) => (
            <li key={backupCode} className="v-recovery-code">{backupCode}</li>
          ))}
        </ul>
        <button
          type="button"
          className="v-btn"
          onClick={() => {
            // Never claim a success that did not happen: a denied clipboard
            // write plus "copied" is how someone leaves with nothing.
            const written = navigator.clipboard?.writeText(backupCodes.join("\n"));
            if (!written) {
              say("Copying is unavailable here — write them down.");
              return;
            }
            written.then(
              () => say("Copied. Put them somewhere that is not this device."),
              () => say("Copying was refused — write them down."),
            );
          }}
        >
          Copy all ten
        </button>
        <button type="button" className="v-btn" onClick={() => setBackupCodes(null)}>
          I have them — done
        </button>
      </div>
    );
  }

  if (me.totp.confirmed) {
    return (
      <div className="v-account-form">
        <h3 className="v-field-label">Second factor</h3>
        <p className="v-account-note">
          On. There is no way to turn it off from here — if the authenticator is lost, a backup
          code signs you in, and the operator can clear the enrolment so you can set it up again.
        </p>
      </div>
    );
  }

  if (enrolment) {
    return (
      <form className="v-account-form" onSubmit={onConfirm}>
        <h3 className="v-field-label">Add the secret to an authenticator</h3>

        <p className="v-account-note">
          Type the secret into your authenticator app, or paste the address below it into one
          that accepts addresses. No QR code — this site ships no third-party code, and that
          includes the library one would need.
        </p>

        <ul className="v-codes v-codes-single">
          <li className="v-recovery-code v-totp-secret">{enrolment.secret}</li>
          <li className="v-recovery-code v-totp-secret">{enrolment.uri}</li>
        </ul>

        <label className="v-field">
          <span className="v-field-label">Six-digit code</span>
          <input
            className="v-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            spellCheck={false}
            autoFocus
            placeholder="what the app shows now"
          />
          <span className="v-field-hint">
            This proves the app really holds the secret. A mistyped setup locks nobody out —
            until a code is confirmed, sign-in does not ask for one.
          </span>
        </label>

        {error ? (
          <p className="v-account-error" role="alert">{error}</p>
        ) : null}

        <button
          type="submit"
          className="v-btn v-btn-primary"
          disabled={!/^[0-9]{6}$/.test(digits) || busy}
        >
          {busy ? "Checking…" : "Turn it on"}
        </button>

        <p className="v-account-aside">
          <button
            type="button"
            className="v-account-link"
            onClick={() => {
              setEnrolment(null);
              setCode("");
              setError(null);
            }}
          >
            Never mind
          </button>{" "}
          — an unconfirmed setup counts for nothing and costs nothing.
        </p>
      </form>
    );
  }

  return (
    <form className="v-account-form" onSubmit={onBegin}>
      <h3 className="v-field-label">Second factor</h3>

      <p className="v-account-note">
        Off. Turning it on means sign-in asks for a six-digit code from an authenticator app as
        well as the password.
        {me.totp.enrolled ? " An earlier setup was never confirmed; starting again replaces it." : ""}
      </p>

      <label className="v-field">
        <span className="v-field-label">Password</span>
        <input
          className="v-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <span className="v-field-hint">
          Adding a way to sign in asks for the one you have — a session alone is not enough.
        </span>
      </label>

      {error ? (
        <p className="v-account-error" role="alert">{error}</p>
      ) : null}

      <button type="submit" className="v-btn" disabled={password.length === 0 || busy}>
        {busy ? "Working…" : "Turn on second factor"}
      </button>
    </form>
  );
}
