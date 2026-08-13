import { useCallback, useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { ApiError, api, type AdminAccount } from "../auth/api";

/**
 * Account administration, for the operator.
 *
 * Reached from the account summary when signed in as an operator, and by typing
 * `admin`. Signed out or signed in as anybody else, the page says so and offers
 * nothing — the Worker refuses every call behind it regardless, so this is a
 * courtesy rather than the security boundary. The boundary is `worker/admin.ts`.
 *
 * **What is missing is deliberate and worth reading before adding it.** There is
 * no "reset password" button. The Worker has no route for it either, and the
 * reason is timing rather than principle: an operator reset deletes the password
 * and its key slot, and the flow that lets the user set a new one — which needs
 * the grant key a recovery code opens — is not built. Shipping reset first would
 * mean an operator could put an account into a state where the only way in is a
 * recovery code, each sign-in spends one of ten, and after the tenth the account
 * is gone for good. A button that can do that is worse than no button.
 */
export function Admin() {
  const { say, go } = useConfig();
  const { me, known, isOperator, refresh } = useSession();

  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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

                  {/* Deleting is irreversible and takes the account's grant key
                      with it, so it asks twice. The second press is a different
                      button in the same place, which is the cheapest way to make
                      a slip impossible without a dialog primitive that does not
                      exist yet. */}
                  {self ? null : confirming === account.id ? (
                    <button
                      type="button"
                      className="chip is-danger"
                      disabled={working}
                      onClick={() =>
                        act(account.id, `deleted ${account.handle}`, () =>
                          api.adminDeleteAccount(account.id),
                        )
                      }
                    >
                      {working ? "deleting…" : "really delete"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chip"
                      disabled={working}
                      onClick={() => setConfirming(account.id)}
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
        Resetting a password is not here yet, on purpose. It would delete the password and its
        key slot, and there is still no screen that lets someone set a new one — so the account
        would be reachable only by recovery codes, one spent per sign-in, ten in total. That
        button arrives with the one that makes it survivable.
      </p>
    </section>
  );
}
