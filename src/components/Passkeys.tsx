import { useCallback, useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { ApiError, api, type PasskeyInfo } from "../auth/api";
import { addPasskey, removePasskey, webAuthnSupported } from "../auth/passkeys";

/**
 * The account's passkeys: list them, add one, remove one.
 *
 * Follows `TotpEnrol`'s shape for the same reasons — it is the neighbouring
 * section on the same summary, and both are credential changes, so both ask
 * for the password (`assertPassword` on the Worker refuses without it; the
 * field is not decoration).
 *
 * One password field authorises both adding and removing. A field per row
 * would be six ways to type the same password, and a remove that silently
 * reused a password typed for an add would be worse — so the row buttons stay
 * disabled until the field is filled, and the hint says so.
 */

interface Props {
  /** Called after the passkey set changes, so the summary counts can update. */
  onChanged: () => void | Promise<void>;
}

export function Passkeys({ onChanged }: Props) {
  const { say } = useConfig();

  const [list, setList] = useState<PasskeyInfo[] | null>(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.passkeyList()).passkeys);
    } catch {
      // The listing failing is not worth blocking the whole summary over; the
      // add form still works and reports properly.
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function fail(cause: unknown) {
    setError(
      cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : "Something went wrong. Try again.",
    );
  }

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (password.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { slotWrapped } = await addPasskey(password, label.trim());
      setPassword("");
      setLabel("");
      setNote(
        slotWrapped
          ? "Added. This passkey can do everything the password can, including whatever sharing becomes."
          : "Added — but this authenticator cannot carry the account's key. The passkey signs you in, and that is all it does.",
      );
      say("Passkey added.");
      await load();
      await onChanged();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(entry: PasskeyInfo) {
    if (password.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await removePasskey(password, entry.id);
      setPassword("");
      say("Passkey removed.");
      await load();
      await onChanged();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!webAuthnSupported()) {
    return (
      <div className="v-account-form">
        <h3 className="v-field-label">Passkeys</h3>
        <p className="v-account-note">
          This browser does not do passkeys. The password and recovery codes carry the account by
          themselves — a passkey is an extra way in, never the only one.
        </p>
      </div>
    );
  }

  return (
    <form className="v-account-form" onSubmit={onAdd}>
      <h3 className="v-field-label">Passkeys</h3>

      <p className="v-account-note">
        A passkey signs you in with this device's own lock — fingerprint, face, or PIN — instead of
        the password. Each one carries its own sealed copy of the account's key, so losing one
        costs nothing while another way in survives.
      </p>

      {list && list.length > 0 ? (
        <ul className="v-codes v-codes-single">
          {list.map((entry) => (
            <li key={entry.id} className="v-recovery-code v-passkey-row">
              <span>
                {entry.label} · added {new Date(entry.createdAt).toLocaleDateString()}
                {entry.hasSlot ? "" : " · signs in only"}
              </span>{" "}
              <button
                type="button"
                className="v-account-link"
                disabled={password.length === 0 || busy}
                onClick={() => void onRemove(entry)}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="v-field">
        <span className="v-field-label">Name for this passkey</span>
        <input
          className="v-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          spellCheck={false}
          placeholder="this laptop"
        />
        <span className="v-field-hint">So a list of three is tellable apart later.</span>
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
        <span className="v-field-hint">
          Changing how you sign in asks for the way you already do. It also authorises the remove
          buttons above.
        </span>
      </label>

      {error ? (
        <p className="v-account-error" role="alert">{error}</p>
      ) : null}
      {note ? (
        <p className="v-account-note" role="status">{note}</p>
      ) : null}

      <button type="submit" className="v-btn" disabled={password.length === 0 || busy}>
        {busy ? "Working…" : "Add a passkey"}
      </button>
    </form>
  );
}
