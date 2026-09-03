import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { DownloadCodes } from "./DownloadCodes";
import { DownloadEditor } from "./DownloadEditor";
import { DuelBench } from "./DuelBench";
import { DuelSettingsEditor } from "./DuelSettingsEditor";

import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { ApiError, api, type AdminAccount } from "../auth/api";
import { derivePassword } from "../share/unlock";
import { Dialog } from "./Dialog";

/**
 * Account administration, for the operator.
 *
 * Reached from the account summary when signed in as an operator, and by typing
 * `admin`. Signed out or signed in as anybody else, the page says so and offers
 * nothing — the Worker refuses every call behind it regardless, so this is a
 * courtesy rather than the security boundary. The boundary is `worker/admin.ts`.
 *
 * **Reset password arrived once it was survivable** (2026-08-13). It was held
 * back not on principle but because a reset with no way to set a new password
 * strands the account: reset deletes the password credential and its key slot,
 * and the way back — recovery-code sign-in into `setPassword`'s insert branch —
 * had to exist end to end first. It does now, and the harness drives the whole
 * loop. The Worker still refuses a reset that would seal an account with no
 * recovery codes left, and refuses self-reset (change-password is the right
 * tool); the buttons below mirror both refusals as disabled states, but the
 * Worker's word is the one that counts.
 *
 * **All four actions confirm with the operator's password**, because all four
 * write and `worker/admin.ts` demands the credential for a write — a session
 * says who you are, never how you proved it. Asking is not an extra step bolted
 * on to the confirmation, it *is* the confirmation: §4 requires the operator be
 * shown the consequence before confirming, and this is the gesture that follows
 * it. Which is also why the two chip actions gained dialogs of their own —
 * granting operator is the one action here that escalates rather than destroys,
 * and it was the one with no confirmation at all.
 */
export function Admin() {
  const { say, go } = useConfig();
  const { me, known, isOperator, refresh } = useSession();

  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The action awaiting its dialog's confirmation and password, if any. */
  const [confirming, setConfirming] = useState<{
    kind: ActionKind;
    account: AdminAccount;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const { accounts: rows } = await api.adminAccounts();
      setAccounts(rows);
      setError(null);
    } catch (cause) {
      setAccounts(null);
      setError(cause instanceof Error ? cause.message : "Could not load accounts.");
    }
  }, []);

  useEffect(() => {
    if (isOperator) void load();
  }, [isOperator, load]);

  /**
   * Open a confirmation, carrying no failure into it — a refusal left over from
   * the last account would otherwise appear under this one's consequence, where
   * it reads as a warning about the account being confirmed.
   */
  function ask(kind: ActionKind, account: AdminAccount) {
    setError(null);
    setConfirming({ kind, account });
  }

  /**
   * Every action is the same shape: prove the password, run it, say what
   * happened, reload the list.
   *
   * Reloading rather than patching state locally is the point — the server's
   * answer is what is true, and an administration screen that drifts from it is
   * how someone deletes the wrong row.
   *
   * The password is turned into an auth secret and nothing else: `derivePassword`
   * is the same call the machine-pairing and slot-opening ceremonies make, and
   * the plaintext never leaves the browser (§4). Nothing here decides whether it
   * was right — the Worker does, rate-limited, and its wording is what shows.
   *
   * A failure leaves the dialog open with the typing intact, because the
   * commonest failure is a typo and the second commonest is the wrong account.
   */
  async function confirmed(password: string) {
    if (!confirming || !me) return;
    const { kind, account } = confirming;

    setBusy(account.id);
    setError(null);
    try {
      const { authSecret } = await derivePassword(me.account.handle, password);
      const label = await run(kind, account, authSecret);
      say(label);
      setConfirming(null);
      await load();
      // Granting or revoking your own operator flag changes what you may see.
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "That did not work.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!known) {
    return (
      <section className="v-account">
        <p className="v-account-note">Checking…</p>
      </section>
    );
  }

  if (!isOperator) {
    return (
      <section className="v-account">
        <h2 className="v-account-title">Not for you</h2>
        <p className="v-account-note">
          {me
            ? "This account is not an operator. Nothing here would work even if it were shown."
            : "You are not signed in."}{" "}
          <button type="button" className="v-account-link" onClick={() => go("signin")}>
            Go to sign-in
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="v-account v-admin">
      <h2 className="v-account-title">Accounts</h2>

      {/* While a dialog is open the failure is shown inside it: an alert behind
          a scrim is an alert nobody reads, and a wrong password is answered
          where it was typed. */}
      {error && !confirming ? (
        <p className="v-account-error" role="alert">{error}</p>
      ) : null}

      {accounts === null ? (
        <p className="v-account-note">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="v-account-note">No accounts.</p>
      ) : (
        <ul className="v-admin-list">
          {accounts.map((account) => {
            const self = account.id === me?.account.id;
            const working = busy === account.id;
            return (
              <li key={account.id} className="v-admin-row">
                <div className="v-admin-who">
                  <span className="v-admin-handle">
                    {account.handle}
                    {self ? " · you" : ""}
                    {account.isOperator ? " · operator" : ""}
                  </span>
                  <span className="v-admin-facts">
                    {account.credentials.password ? "password" : "no password"} ·{" "}
                    {account.totp.confirmed ? "2FA on" : "2FA off"} ·{" "}
                    {account.credentials.recoveryCodesRemaining} codes ·{" "}
                    {account.credentials.passkeys} passkeys
                    {account.resetAt ? " · awaiting a new password" : ""}
                  </span>
                </div>

                <div className="v-admin-actions">
                  <button
                    type="button"
                    className="chip"
                    disabled={working}
                    onClick={() => ask("operator", account)}
                  >
                    {account.isOperator ? "remove operator" : "make operator"}
                  </button>

                  <button
                    type="button"
                    className="chip"
                    disabled={working || !account.totp.confirmed}
                    onClick={() => ask("totp", account)}
                  >
                    reset 2FA
                  </button>

                  {/* Every action opens the §10 confirm dialog with the
                      consequence in specific terms and the password that
                      `worker/admin.ts` requires; the dialog lives after the
                      list. Self is hidden on the two destructive ones
                      (change-password is the right tool for reset, and
                      self-delete is refused) and a reset with no codes left is
                      disabled — the Worker refuses all of these anyway; the
                      states just say so before the click. */}
                  {self ? null : (
                    <button
                      type="button"
                      className="chip"
                      disabled={
                        working ||
                        !account.credentials.password ||
                        account.credentials.recoveryCodesRemaining === 0
                      }
                      onClick={() => ask("reset", account)}
                    >
                      reset password
                    </button>
                  )}

                  {self ? null : (
                    <button
                      type="button"
                      className="chip"
                      disabled={working}
                      onClick={() => ask("delete", account)}
                    >
                      delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="v-account-note">
        Resetting a password deletes it along with its key slot — nothing here can read or set
        one, by design. The owner signs back in with a recovery code, which carries its own copy
        of their key, and chooses a new password from there. An account with no codes left cannot
        be reset, only deleted: a reset would seal it for good under a milder name.
      </p>

      <p className="v-account-note">
        Every button here asks for your password. Being signed in says who you are; the password
        says it is you at the keyboard, which is the difference that matters on a screen that can
        delete an account.
      </p>

      {/* §4 requirement 2: the operator is shown the consequences before
          confirming, in terms specific to the account — hence the live counts.
          Rendered only while there is something to confirm, rather than four
          dialogs each holding an `open`: one dialog cannot show the wrong
          account's numbers under another account's title, and a fresh mount is
          what clears the password box between actions. */}
      {confirming ? (
        <ProofDialog
          {...describe(confirming.kind, confirming.account)}
          busy={busy === confirming.account.id}
          error={error}
          onConfirm={(password) => void confirmed(password)}
          onClose={() => {
            setError(null);
            setConfirming(null);
          }}
        />
      ) : null}

      {/* Download codes live on the admin page rather than in the siteconfig
          panel: the panel is *appearance*, and this is neither appearance nor
          an account. It is the third operator surface, and admin is where the
          other operator-only lists already are. */}
      <DownloadEditor />
      <DownloadCodes />

      {/* The duel bench, last: it is the only panel here that is not
          administration of anything — it changes no stored state and touches no
          account. It costs nothing to ship (the engine is already in the bundle
          for the hero ornament) and it is gated on `isOperator` like everything
          else on this page, because a bench is production furniture to anybody
          else. `enabled` rather than a conditional render so the rAF loop is
          torn down by the component's own cleanup rather than by unmounting
          mid-frame. */}
      {/* The published half above the unpublished one: what visitors get is
          the more consequential surface, and it is the one to land on first. */}
      <DuelSettingsEditor enabled={isOperator} />
      <DuelBench enabled={isOperator} />
    </section>
  );
}

/** The four things this screen can do to an account. Each of them writes. */
type ActionKind = "operator" | "totp" | "reset" | "delete";

/**
 * The call an action makes, and the line the toast says once it has.
 *
 * One place rather than four closures in the list, so the password proof cannot
 * be attached to three of them and forgotten on the fourth — the same reasoning
 * `worker/admin.ts` gives for checking it in one helper on its side.
 */
function run(kind: ActionKind, account: AdminAccount, authSecret: string): Promise<string> {
  switch (kind) {
    case "operator":
      return api
        .adminSetOperator(account.id, !account.isOperator, authSecret)
        .then(() => (account.isOperator ? "operator removed" : "operator granted"));
    case "totp":
      return api.adminResetTotp(account.id, authSecret).then(() => "second factor cleared");
    case "reset":
      return api
        .adminResetPassword(account.id, authSecret)
        .then(() => `password reset for ${account.handle}`);
    case "delete":
      return api.adminDeleteAccount(account.id, authSecret).then(() => `deleted ${account.handle}`);
  }
}

/** What a confirmation says and demands. One shape, so the dialog cannot drift. */
interface Confirmation {
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** §10's rule for account deletion: type the handle before the button lives. */
  requireText?: string;
}

/** What the dialog says. The numbers are live, which is the point of §4's rule. */
function describe(kind: ActionKind, account: AdminAccount): Confirmation {
  switch (kind) {
    case "operator":
      return account.isOperator
        ? {
            title: `Remove ${account.handle}'s operator?`,
            consequence: (
              <p>
                {account.handle} keeps the account and loses this screen, the site's appearance and
                the downloads with it. Nothing of theirs is deleted.
              </p>
            ),
            confirmLabel: "Remove operator",
            busyLabel: "Removing…",
          }
        : {
            title: `Make ${account.handle} an operator?`,
            consequence: (
              <p>
                {account.handle} gets this screen: every account on the site, and the power to reset
                a password, delete an account and publish what every visitor sees. It is the same
                power you are using now.
              </p>
            ),
            confirmLabel: "Make operator",
            busyLabel: "Granting…",
          };
    case "totp":
      return {
        title: `Clear ${account.handle}'s second factor?`,
        consequence: (
          <p>
            The authenticator {account.handle} enrolled stops working. Until they enrol another one,
            their password alone signs them in.
          </p>
        ),
        confirmLabel: "Clear second factor",
        busyLabel: "Clearing…",
      };
    case "reset":
      return {
        title: `Reset ${account.handle}'s password?`,
        consequence: (
          <p>
            Their password and its key slot are deleted — nothing here can read either. They sign
            back in with one of their {account.credentials.recoveryCodesRemaining} remaining
            recovery codes and choose a new password from there, and their next sign-in tells them
            this reset happened.
          </p>
        ),
        confirmLabel: "Reset password",
        busyLabel: "Resetting…",
      };
    case "delete":
      return {
        title: `Delete ${account.handle}?`,
        consequence: (
          <p>
            The account, its credentials, its key slots, its saved setups and its second factor are
            deleted. There is no undo — the grant key goes with it, and nothing can bring either
            back.
          </p>
        ),
        confirmLabel: "Delete account",
        busyLabel: "Deleting…",
        requireText: account.handle,
      };
  }
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
function ProofDialog({
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
