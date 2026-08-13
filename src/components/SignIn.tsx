import { useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { MIN_PASSWORD_LENGTH, changePassword, signIn } from "../auth/flows";
import { ApiError, api, type MeResult } from "../auth/api";

/**
 * Sign in, and — once you are — the account summary.
 *
 * One page rather than two, because "am I signed in?" and "let me in" are the
 * same question asked from either side of the answer, and a separate account
 * page that redirects to a separate sign-in page is two routes to maintain for
 * one errand. `/signin` is therefore what the footer's "Account" link points at
 * in both states.
 *
 * Like `SignUp`, this is deliberately **not** the operator door: `SPEC.md`
 * §Security fixes the door as theatre and `SPEC-ACCOUNTS.md` says real
 * authentication must not reuse its UI. The door still guards a settings panel.
 *
 * Form shape follows the convention `.v-paste` set and `SignUp` repeated — one
 * `<form>` with an `onSubmit` that calls `preventDefault()`, and a
 * `type="submit"` button — so Enter and the button are one code path. Both
 * stages below are their own `<form>` for that reason rather than one form with
 * a branching handler.
 *
 * No literal colours: every surface reads the palette custom properties, so the
 * 0.9s bleed crosses this page like any other.
 *
 * **Signing in with a recovery code is deliberately not offered here yet.** The
 * Worker supports redeeming one and `signInWithRecoveryCode` is written and
 * tested. What is still missing is the screen that turns a redeemed code into a
 * fresh password: `changePassword` below needs the *current* password, and
 * someone arriving by recovery code is precisely the person who does not have
 * one. Until that variant exists, offering recovery here would spend one of ten
 * codes and leave the account no better off, so the signed-out view says to wait
 * rather than letting people discover it by burning codes.
 */

/**
 * Change the password, from inside the account.
 *
 * Its own component and its own `<form>` rather than more fields on the summary,
 * so Enter submits this and only this. The heavy lifting is two PBKDF2 runs and
 * a re-wrap in `changePassword` — the grant key is untouched, only the lock on
 * its password copy changes, which is what keeps the recovery codes working.
 */
function ChangePassword() {
  const { say } = useConfig();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && !busy;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setDone(true);
      say("Password changed.");
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "Could not change the password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="v-account-form" onSubmit={onSubmit}>
      <h3 className="v-field-label">Change password</h3>

      <label className="v-field">
        <span className="v-field-label">Current password</span>
        <input
          className="v-input"
          type="password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setDone(false);
          }}
          autoComplete="current-password"
        />
      </label>

      <label className="v-field">
        <span className="v-field-label">New password</span>
        <input
          className="v-input"
          type="password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setDone(false);
          }}
          autoComplete="new-password"
        />
        <span className="v-field-hint">
          At least {MIN_PASSWORD_LENGTH} characters. Your recovery codes keep working — they are
          not tied to the password.
        </span>
      </label>

      {error ? (
        <p className="v-account-error" role="alert">{error}</p>
      ) : null}
      {done ? (
        <p className="v-account-note" role="status">
          Changed. The old password no longer works anywhere.
        </p>
      ) : null}

      <button type="submit" className="v-btn" disabled={!ready}>
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

type Stage =
  | { name: "checking" }
  | { name: "credentials" }
  | { name: "second-factor"; ticket: string }
  | { name: "signed-in"; me: MeResult };

export function SignIn() {
  const { go, say } = useConfig();
  // Signing in changes what the rest of the interface is allowed to show — the
  // operator panel and its door are gated on it. Without telling the session
  // layer, that gate would stay shut until the next full reload, and the
  // operator would sign in successfully and find their own panel missing.
  const { refresh: refreshSession } = useSession();

  const [stage, setStage] = useState<Stage>({ name: "checking" });
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Is there already a session? A signed-in visitor landing on a sign-in form
  // and having to guess whether it worked last time is the failure this avoids.
  //
  // A 401 here is the ordinary answer, not a fault — it is how "signed out" is
  // spelled — so it sets the form rather than an error. So does a network
  // failure: §11 requires the site to be the site it is today when the Worker
  // is unreachable, and refusing to render the form because a status probe
  // failed would make the account layer load-bearing for a page that is meant
  // to degrade to "your attempt will tell you".
  useEffect(() => {
    let live = true;
    api
      .me()
      .then((me) => live && setStage({ name: "signed-in", me }))
      .catch(() => live && setStage({ name: "credentials" }));
    return () => {
      live = false;
    };
  }, []);

  /** Every failure path says something a person can act on, and nothing else. */
  function fail(cause: unknown) {
    setError(
      cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : "Something went wrong. Try again.",
    );
  }

  /**
   * Both stages end the same way, and it is worth them sharing one function.
   *
   * The sign-in response carries the account but not the credential counts, so
   * the summary needs `/api/me` regardless — and asking for it here means the
   * signed-in view has exactly one shape, whether it was reached by signing in
   * just now or by arriving with a live cookie. Two paths that build the same
   * screen from different fields is how the two drift.
   */
  async function settle(result: Awaited<ReturnType<typeof signIn>>) {
    if (result.status === "totp-required") {
      setStage({ name: "second-factor", ticket: result.ticket });
      setPassword("");
      return;
    }
    const me = await api.me();
    setStage({ name: "signed-in", me });
    setPassword("");
    setCode("");
    await refreshSession();
    say(`Signed in as ${me.account.handle}.`);
  }

  const credentialsReady = handle.trim().length >= 3 && password.length > 0 && !busy;

  async function onCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (!credentialsReady) return;

    setBusy(true);
    setError(null);
    try {
      // Two round trips and a PBKDF2 run: on a slow phone this is seconds, not
      // milliseconds, which is why the button says what it is doing.
      await settle(await signIn(handle.trim(), password));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  const digits = code.replace(/\s/g, "");
  const codeReady = /^[0-9]{6}$/.test(digits) || digits.length >= 8;

  async function onSecondFactor(event: React.FormEvent) {
    event.preventDefault();
    if (stage.name !== "second-factor" || !codeReady || busy) return;

    setBusy(true);
    setError(null);
    try {
      await settle(await api.totp(stage.ticket, digits));
    } catch (cause) {
      fail(cause);
      // The ticket lives five minutes. Once it has expired every code is
      // rejected with the same sentence, and a form that keeps accepting codes
      // against a dead ticket is a person typing correct codes into a wall — so
      // an expiry sends them back to the start rather than leaving them there.
      if (cause instanceof ApiError && /timed out/i.test(cause.message)) {
        setStage({ name: "credentials" });
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await api.signout();
      say("Signed out.");
    } catch {
      // The cookie is cleared by the response, so a failure here means the
      // request never landed. Saying so beats pretending it did.
      say("Could not reach the server — you may still be signed in.");
    } finally {
      setBusy(false);
      setStage({ name: "credentials" });
      setHandle("");
      setPassword("");
      setCode("");
      // Closes the operator panel and its door in the same breath, by taking
      // away the flag they are gated on. Signing out has to actually revoke
      // what signing in granted.
      await refreshSession();
    }
  }

  if (stage.name === "checking") {
    // Not a spinner. The check is one request and usually finishes before this
    // paints; a spinner that flashes for 80ms is worse than a line of text.
    return (
      <section className="v-account" aria-live="polite">
        <p className="v-account-note">Checking whether you are already signed in…</p>
      </section>
    );
  }

  if (stage.name === "signed-in") {
    const { account, credentials, totp, resetAt } = stage.me;
    return (
      <section className="v-account" aria-live="polite">
        <h2 className="v-account-title">
          Signed in as {account.handle}
          {account.isOperator ? " · operator" : ""}
        </h2>

        {/* §4: an operator reset must be *shown* to the account it happened to,
            not merely written to the audit log. This is that surface. */}
        {resetAt ? (
          <p className="v-account-error" role="alert">
            Your password was reset by the operator on{" "}
            {new Date(resetAt).toLocaleDateString()}. If that was not at your request, say so.
          </p>
        ) : null}

        <dl className="v-facts">
          <div className="v-fact">
            <dt>Password</dt>
            <dd>{credentials.password ? "set" : "none"}</dd>
          </div>
          <div className="v-fact">
            <dt>Second factor</dt>
            <dd>{totp.confirmed ? "on" : totp.enrolled ? "started, not confirmed" : "off"}</dd>
          </div>
          <div className="v-fact">
            <dt>Passkeys</dt>
            <dd>{credentials.passkeys}</dd>
          </div>
          <div className="v-fact">
            <dt>Recovery codes left</dt>
            <dd>{credentials.recoveryCodesRemaining} of 10</dd>
          </div>
        </dl>

        {account.isOperator ? (
          <p className="v-account-aside">
            <button type="button" className="v-account-link" onClick={() => go("admin")}>
              Administration
            </button>{" "}
            — accounts, and what may be done to them.
          </p>
        ) : (
          <p className="v-account-note">
            There is nothing else to do in here yet — no setups to save, no machines to reach.
            That is the honest state of it: the account works, and the things an account is{" "}
            <em>for</em> are being built behind it.
          </p>
        )}

        <ChangePassword />

        <button type="button" className="v-btn" onClick={onSignOut} disabled={busy}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </section>
    );
  }

  if (stage.name === "second-factor") {
    return (
      <section className="v-account">
        <form className="v-account-form" onSubmit={onSecondFactor}>
          <p className="v-account-note">
            That password was right. Now the six-digit code from your authenticator — or one of the
            backup codes you were given when you turned it on.
          </p>

          <label className="v-field">
            <span className="v-field-label">Code</span>
            <input
              className="v-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              // `one-time-code` is what lets a phone offer the code from the
              // notification rather than making someone switch apps and back.
              autoComplete="one-time-code"
              inputMode="numeric"
              spellCheck={false}
              autoFocus
              placeholder="six digits"
            />
            <span className="v-field-hint">Codes change every thirty seconds.</span>
          </label>

          {error ? (
            <p className="v-account-error" role="alert">{error}</p>
          ) : null}

          <button type="submit" className="v-btn v-btn-primary" disabled={!codeReady || busy}>
            {busy ? "Checking…" : "Finish signing in"}
          </button>

          <p className="v-account-aside">
            <button
              type="button"
              className="v-account-link"
              onClick={() => {
                setStage({ name: "credentials" });
                setCode("");
                setError(null);
              }}
            >
              Start again
            </button>
          </p>
        </form>
      </section>
    );
  }

  return (
    <section className="v-account">
      <form className="v-account-form" onSubmit={onCredentials}>
        <label className="v-field">
          <span className="v-field-label">Handle</span>
          <input
            className="v-input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoComplete="username"
            spellCheck={false}
          />
        </label>

        <label className="v-field">
          <span className="v-field-label">Password</span>
          <input
            className="v-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <span className="v-field-hint">It never leaves your browser.</span>
        </label>

        {error ? (
          <p className="v-account-error" role="alert">{error}</p>
        ) : null}

        <button type="submit" className="v-btn v-btn-primary" disabled={!credentialsReady}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="v-account-aside">
          No account?{" "}
          <button type="button" className="v-account-link" onClick={() => go("signup")}>
            Make one
          </button>
          . Forgotten the password? Recovery codes do not work yet — the screen that would let you
          set a new one is still being built, and redeeming a code before it exists would spend the
          code for nothing.
        </p>
      </form>
    </section>
  );
}
