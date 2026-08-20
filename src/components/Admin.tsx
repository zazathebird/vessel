import { useCallback, useEffect, useState } from "react";
import { DownloadCodes } from "./DownloadCodes";
import { DownloadEditor } from "./DownloadEditor";

import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { ApiError, api, type AdminAccount } from "../auth/api";
import { ConfirmDialog } from "./Dialog";

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
 */
export function Admin() {
  const { say, go } = useConfig();
  const { me, known, isOperator, refresh } = useSession();

  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The destructive action awaiting its dialog's confirmation, if any. */
  const [confirming, setConfirming] = useState<{
    kind: "reset" | "delete";
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
   * Every action is the same shape: run it, say what happened, reload the list.
   *
   * Reloading rather than patching state locally is the point — the server's
   * answer is what is true, and an administration screen that drifts from it is
   * how someone deletes the wrong row.
   */
  async function act(id: string, label: string, run: () => Promise<unknown>) {
    setBusy(id);
    try {
      await run();
      say(label);
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
      setConfirming(null);
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

      {error ? (
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
                    onClick={() =>
                      act(
                        account.id,
                        account.isOperator ? "operator removed" : "operator granted",
                        () => api.adminSetOperator(account.id, !account.isOperator),
                      )
                    }
                  >
                    {account.isOperator ? "remove operator" : "make operator"}
                  </button>

                  <button
                    type="button"
                    className="chip"
                    disabled={working || !account.totp.confirmed}
                    onClick={() =>
                      act(account.id, "second factor cleared", () =>
                        api.adminResetTotp(account.id),
                      )
                    }
                  >
                    reset 2FA
                  </button>

                  {/* Both destructive actions open the §10 confirm dialog with
                      the consequence in specific terms; the dialogs live after
                      the list. Self is hidden (change-password is the right
                      tool for reset, and self-delete is refused) and a reset
                      with no codes left is disabled — the Worker refuses all
                      of these anyway; the states just say so before the click. */}
                  {self ? null : (
                    <button
                      type="button"
                      className="chip"
                      disabled={
                        working ||
                        !account.credentials.password ||
                        account.credentials.recoveryCodesRemaining === 0
                      }
                      onClick={() => setConfirming({ kind: "reset", account })}
                    >
                      reset password
                    </button>
                  )}

                  {self ? null : (
                    <button
                      type="button"
                      className="chip"
                      disabled={working}
                      onClick={() => setConfirming({ kind: "delete", account })}
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

      {/* §4 requirement 2: the operator is shown the consequences before
          confirming, in terms specific to the account — hence the live counts. */}
      <ConfirmDialog
        open={confirming?.kind === "reset"}
        title={`Reset ${confirming?.account.handle}'s password?`}
        consequence={
          <p>
            Their password and its key slot are deleted — nothing here can read either. They sign
            back in with one of their {confirming?.account.credentials.recoveryCodesRemaining}{" "}
            remaining recovery codes and choose a new password from there, and their next sign-in
            tells them this reset happened.
          </p>
        }
        confirmLabel="Reset password"
        busyLabel="Resetting…"
        busy={busy === confirming?.account.id}
        onConfirm={() =>
          confirming &&
          void act(confirming.account.id, `password reset for ${confirming.account.handle}`, () =>
            api.adminResetPassword(confirming.account.id),
          )
        }
        onClose={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming?.kind === "delete"}
        title={`Delete ${confirming?.account.handle}?`}
        consequence={
          <p>
            The account, its credentials, its key slots, its saved setups and its second factor
            are deleted. There is no undo — the grant key goes with it, and nothing can bring
            either back.
          </p>
        }
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        requireText={confirming?.account.handle ?? ""}
        busy={busy === confirming?.account.id}
        onConfirm={() =>
          confirming &&
          void act(confirming.account.id, `deleted ${confirming.account.handle}`, () =>
            api.adminDeleteAccount(confirming.account.id),
          )
        }
        onClose={() => setConfirming(null)}
      />

      {/* Download codes live on the admin page rather than in the siteconfig
          panel: the panel is *appearance*, and this is neither appearance nor
          an account. It is the third operator surface, and admin is where the
          other operator-only lists already are. */}
      <DownloadEditor />
      <DownloadCodes />
    </section>
  );
}
