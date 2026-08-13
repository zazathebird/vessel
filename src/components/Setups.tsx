import { useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { decodeShareCode, encodeShareCode } from "../config/shareCode";
import { ApiError, api, type SavedSetup } from "../auth/api";

/**
 * Named setups — what an account is *for*, phase 1 edition (SPEC-ACCOUNTS §7:
 * "named setups saved and applied"; §11: a setup is a name and a share code).
 *
 * Saving captures `encodeShareCode(config)` — the exact string the siteconfig
 * panel's copy button yields. Applying goes through `decodeShareCode`, so a
 * saved setup behaves identically to pasting a code today, including pinning
 * the randomiser to Static and clamping any field a newer catalogue no longer
 * has. Saving over an existing name replaces it; that is what "save" means.
 *
 * Deleting asks twice on the same button, the `/admin` convention, rather than
 * opening a dialog — the dialog primitive arrives with the next backlog item,
 * and a setup is two clicks to recreate, which is the mildest destruction on
 * the site.
 */

export function Setups() {
  const { config, update, say } = useConfig();

  const [setups, setSetups] = useState<SavedSetup[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The id whose delete button has been pressed once and is asking. */
  const [arming, setArming] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .setupsList()
      .then(({ setups: rows }) => live && setSetups(rows))
      .catch(() => live && setSetups([]));
    return () => {
      live = false;
    };
  }, []);

  function fail(cause: unknown) {
    setError(
      cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : "Something went wrong. Try again.",
    );
  }

  const currentCode = encodeShareCode(config);
  const trimmed = name.trim();
  const replacing = setups?.some((setup) => setup.name.toLowerCase() === trimmed.toLowerCase());

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      const { setup } = await api.setupSave(trimmed, currentCode);
      setSetups((rows) => [
        ...(rows ?? []).filter((row) => row.id !== setup.id),
        setup,
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      say(`Saved ${setup.name}.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  function onApply(setup: SavedSetup) {
    const shared = decodeShareCode(setup.shareCode);
    if (!shared) {
      // A code saved under an older catalogue decodes with clamped fields, so
      // the only way here is a row that was never a code at all.
      setError(`${setup.name} does not decode any more. Delete it and save afresh.`);
      return;
    }
    update(shared);
    say(`Applied ${setup.name}.`);
  }

  async function onDelete(setup: SavedSetup) {
    if (arming !== setup.id) {
      setArming(setup.id);
      return;
    }
    setArming(null);
    setBusy(true);
    setError(null);
    try {
      await api.setupDelete(setup.id);
      setSetups((rows) => (rows ?? []).filter((row) => row.id !== setup.id));
      say(`Deleted ${setup.name}.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="v-account-form" onSubmit={onSave}>
      <h3 className="v-field-label">Saved setups</h3>

      <p className="v-account-note">
        The site as it looks right now — palette, layout, background, type, ornament — kept under
        a name, to come back to from any machine you sign in on.
      </p>

      {setups && setups.length > 0 ? (
        <ul className="v-codes v-codes-single">
          {setups.map((setup) => (
            <li key={setup.id} className="v-recovery-code v-setup-row">
              <span>
                {setup.name} · {setup.shareCode}
              </span>{" "}
              <button
                type="button"
                className="v-account-link"
                disabled={busy}
                onClick={() => onApply(setup)}
              >
                apply
              </button>{" "}
              <button
                type="button"
                className="v-account-link"
                disabled={busy}
                onClick={() => void onDelete(setup)}
                onBlur={() => setArming((id) => (id === setup.id ? null : id))}
              >
                {arming === setup.id ? "sure?" : "delete"}
              </button>
            </li>
          ))}
        </ul>
      ) : setups ? (
        <p className="v-account-note">None yet.</p>
      ) : null}

      <label className="v-field">
        <span className="v-field-label">Save the current look as</span>
        <input
          className="v-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          spellCheck={false}
          placeholder="workshop mode"
        />
        <span className="v-field-hint">
          Right now that is {currentCode}.
          {replacing ? " A setup with this name exists — saving replaces it." : ""}
        </span>
      </label>

      {error ? (
        <p className="v-account-error" role="alert">{error}</p>
      ) : null}

      <button type="submit" className="v-btn" disabled={!trimmed || busy}>
        {busy ? "Working…" : replacing ? "Replace setup" : "Save setup"}
      </button>
    </form>
  );
}
