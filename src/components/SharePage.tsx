import { useCallback, useEffect, useState } from "react";

import { ApiError, api, type MachineInfo } from "../auth/api";
import { fromBase64Url, toBase64Url } from "../auth/encoding";
import { useSession } from "../auth/SessionContext";
import { useConfig } from "../config/ConfigContext";
import { VesselAgent, type AgentSnapshot } from "../share/agent";
import { generateMachineKeypair } from "../share/handshake";
import { shareStore, type StoredMachine } from "../share/store";
import { derivePassword } from "../share/unlock";

/**
 * The sharing tab — the agent itself (SPEC-ACCOUNTS.md §13).
 *
 * The one page with a reason to diverge (§10): its job is to be glanceable
 * from across a room and to make "this tab is holding your folder open"
 * unmissable. It still reads the palette like everything else.
 *
 * Everything durable lives server-side as labels; everything that grants
 * access — the machine key, the directory handles — lives in this profile's
 * IndexedDB and is treated as evictable (§12 O). Each render therefore starts
 * by reconciling the two, and every mismatch resolves to a routine flow, not
 * an error state.
 */

function formatBytes(count: number): string {
  if (count < 1024) return `${count} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = count;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

type AttachState = "attached" | "needs-permission" | "missing";

export function SharePage() {
  const { me, known } = useSession();
  const { go } = useConfig();

  // undefined = still reading IndexedDB; null = nothing stored.
  const [stored, setStored] = useState<StoredMachine | null | undefined>(undefined);
  const [machines, setMachines] = useState<MachineInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStored(await shareStore.machine());
    if (!me) return;
    try {
      setMachines((await api.machinesList()).machines);
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof ApiError ? cause.message : "Could not read the machine list. Try again shortly.",
      );
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!known) return null;

  if (!me) {
    return (
      <section className="v-account">
        <p className="v-account-note">
          This page shares folders from the machine you are signed in on.{" "}
          <button type="button" className="v-account-link" onClick={() => go("signin")}>
            Sign in first
          </button>
          .
        </p>
      </section>
    );
  }

  if (!window.showDirectoryPicker) {
    return (
      <section className="v-account">
        <p className="v-account-note">
          Sharing needs a Chromium browser — Chrome or Edge — because it is built on the File
          System Access API, which no other engine ships. Browsing what your machines share, on{" "}
          <button type="button" className="v-account-link" onClick={() => go("machines")}>
            your machines
          </button>
          , works anywhere.
        </p>
      </section>
    );
  }

  if (stored === undefined || (machines === null && !loadError)) {
    return (
      <section className="v-account">
        <p className="v-account-note">Checking this machine…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="v-account">
        <p className="v-account-error" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  const row = stored ? (machines ?? []).find((m) => m.id === stored.machineId) ?? null : null;

  if (!stored || !row) {
    return (
      <PairForm
        handle={me.account.handle}
        existing={machines ?? []}
        orphan={stored ?? null}
        onDone={load}
      />
    );
  }

  return <AgentPanel handle={me.account.handle} stored={stored} row={row} onChanged={load} />;
}

/**
 * Pair this browser profile as a machine, or re-key one that already exists
 * (§12 O). A password ceremony, not a session action (§12 L), and the form
 * says so rather than leaving the extra field unexplained.
 */
function PairForm({
  handle,
  existing,
  orphan,
  onDone,
}: {
  handle: string;
  existing: MachineInfo[];
  orphan: StoredMachine | null;
  onDone: () => Promise<void>;
}) {
  const { say } = useConfig();
  const [name, setName] = useState("");
  const [rekeyId, setRekeyId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = (rekeyId ? true : name.trim().length > 0) && password.length > 0 && !busy;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);
    try {
      const keys = await generateMachineKeypair();
      const agentPubkey = toBase64Url(keys.publicKeyBytes);
      const derived = await derivePassword(handle, password);
      const result = await api.machinePair(
        rekeyId
          ? { machineId: rekeyId, agentPubkey, authSecret: derived.authSecret }
          : { name: name.trim(), agentPubkey, authSecret: derived.authSecret },
      );
      await shareStore.saveMachine({
        machineId: result.machine.id,
        name: result.machine.name,
        keyPair: keys.keyPair,
        trustRoot: fromBase64Url(result.grantPubkey),
        publicKeyBytes: keys.publicKeyBytes,
      });
      setPassword("");
      say(rekeyId ? "Machine re-keyed." : "Machine paired.");
      await onDone();
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "Could not pair this machine.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="v-account">
      {orphan ? (
        <p className="v-account-error" role="alert">
          This tab remembers a machine (“{orphan.name}”) that is no longer on the account.{" "}
          <button
            type="button"
            className="v-account-link"
            onClick={() => {
              void shareStore.clearMachine().then(onDone);
            }}
          >
            Forget it
          </button>{" "}
          and pair afresh.
        </p>
      ) : null}

      <form className="v-account-form" onSubmit={onSubmit}>
        <h3 className="v-field-label">Pair this machine</h3>

        <p className="v-account-note">
          A “machine” here is this browser profile: the folder handles and the key that answers for
          them live in it and nowhere else. Pairing asks for your password because it adds a key
          the account will trust.
        </p>

        {existing.length > 0 ? (
          <label className="v-field">
            <span className="v-field-label">Pair as</span>
            <select
              className="v-input"
              value={rekeyId}
              onChange={(e) => setRekeyId(e.target.value)}
            >
              <option value="">a new machine</option>
              {existing.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} — re-key it to this tab
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {rekeyId ? null : (
          <label className="v-field">
            <span className="v-field-label">Machine name</span>
            <input
              className="v-input"
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="v-field-hint">
              Anything you like — it is never taken from the computer itself, and it is visible to
              anyone you later share with.
            </span>
          </label>
        )}

        <label className="v-field">
          <span className="v-field-label">Your password</span>
          <input
            className="v-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <p className="v-account-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="v-btn v-btn-primary" disabled={!ready}>
          {busy ? "Pairing…" : rekeyId ? "Re-key to this tab" : "Pair machine"}
        </button>
      </form>
    </section>
  );
}

/** The running agent: status, drives, and the flows that keep both healthy. */
function AgentPanel({
  handle,
  stored,
  row,
  onChanged,
}: {
  handle: string;
  stored: StoredMachine;
  row: MachineInfo;
  onChanged: () => Promise<void>;
}) {
  const { say } = useConfig();
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [attach, setAttach] = useState<Record<string, AttachState>>({});
  const [pending, setPending] = useState<{ handle: FileSystemDirectoryHandle; label: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // A row re-keyed by another tab means this tab's key no longer answers for
  // the machine. Running the agent anyway would offer connections nobody can
  // verify, so it stands down instead (§12 M has the replacement story).
  const rekeyedElsewhere = row.agentPubkey !== toBase64Url(stored.publicKeyBytes);

  const refreshAttach = useCallback(async () => {
    const states: Record<string, AttachState> = {};
    for (const drive of row.drives) {
      const handle_ = await shareStore.handle(drive.id);
      if (!handle_) states[drive.id] = "missing";
      else {
        states[drive.id] =
          (await handle_.queryPermission({ mode: "read" })) === "granted"
            ? "attached"
            : "needs-permission";
      }
    }
    setAttach(states);
  }, [row.drives]);

  useEffect(() => {
    void refreshAttach();
  }, [refreshAttach]);

  useEffect(() => {
    if (rekeyedElsewhere) return;
    const agent = new VesselAgent(
      row.id,
      stored.keyPair,
      stored.trustRoot,
      async (driveId) => {
        const handle_ = await shareStore.handle(driveId);
        if (!handle_) return null;
        return (await handle_.queryPermission({ mode: "read" })) === "granted" ? handle_ : null;
      },
      setSnapshot,
    );
    agent.start();
    return () => agent.stop();
    // `epoch` restarts a stood-down agent on request ("take over here").
    // Keyed on the machine id rather than the `stored` object: reloading the
    // store after a drive change makes a fresh object with the same key, and
    // restarting the agent on it would drop every connected peer for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, stored.machineId, rekeyedElsewhere, epoch]);

  // §12 N: warn on close only while somebody is actually connected.
  const peers = snapshot?.peers ?? 0;
  useEffect(() => {
    if (peers === 0) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [peers]);

  async function allowAccess(driveId: string) {
    const handle_ = await shareStore.handle(driveId);
    if (handle_) await handle_.requestPermission({ mode: "read" });
    await refreshAttach();
  }

  async function reattach(driveId: string) {
    try {
      const picked = await window.showDirectoryPicker!({ mode: "read" });
      await shareStore.saveHandle(driveId, picked);
      say("Drive re-attached.");
      await refreshAttach();
    } catch (cause) {
      if ((cause as { name?: string }).name === "AbortError") return;
      setError("Could not re-attach that folder.");
    }
  }

  async function removeDrive(driveId: string) {
    setError(null);
    try {
      await api.driveRemove(driveId);
      await shareStore.deleteHandle(driveId);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove that drive.");
    }
  }

  async function pickFolder() {
    try {
      const picked = await window.showDirectoryPicker!({ mode: "read" });
      setPending({ handle: picked, label: picked.name.slice(0, 40) });
    } catch (cause) {
      if ((cause as { name?: string }).name === "AbortError") return;
      setError("Could not open the folder picker.");
    }
  }

  async function addDrive(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !pending.label.trim()) return;
    setError(null);
    try {
      const added = await api.driveAdd(row.id, pending.label.trim());
      await shareStore.saveHandle(added.drive.id, pending.handle);
      setPending(null);
      say("Drive added.");
      await onChanged();
      await refreshAttach();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that drive.");
    }
  }

  const state = snapshot?.state ?? "connecting";
  const statusLine = rekeyedElsewhere
    ? "Another tab re-keyed this machine — sharing from here has stood down."
    : state === "online"
      ? "Sharing — this tab is holding your folders open."
      : state === "connecting"
        ? "Connecting…"
        : state === "offline"
          ? "Signalling connection lost — retrying."
          : state === "replaced"
            ? "Another sharing tab took over."
            : state === "removed"
              ? "This machine was removed from the account."
              : "Stopped.";

  return (
    <section className="v-account">
      <p className="v-share-status" aria-live="polite">
        {statusLine}
      </p>
      {snapshot?.note && state !== "online" ? (
        <p className="v-account-note">{snapshot.note}</p>
      ) : null}

      {rekeyedElsewhere ? (
        <TakeOverForm handle={handle} machineId={row.id} onDone={onChanged} />
      ) : (
        <>
          <p className="v-share-count">
            {row.name} · {peers} connected browser{peers === 1 ? "" : "s"} ·{" "}
            {formatBytes(snapshot?.bytesServed ?? 0)} served
          </p>

          {state === "replaced" ? (
            <button type="button" className="v-btn" onClick={() => setEpoch((n) => n + 1)}>
              Take over here
            </button>
          ) : null}
          {state === "removed" ? (
            <button
              type="button"
              className="v-btn"
              onClick={() => void shareStore.clearMachine().then(onChanged)}
            >
              Forget this machine
            </button>
          ) : null}

          <div className="v-account-form">
            <h3 className="v-field-label">Drives</h3>
            {row.drives.length === 0 ? (
              <p className="v-account-note">No folders shared yet.</p>
            ) : (
              row.drives.map((drive) => (
                <div key={drive.id} className="v-drive-row">
                  <span>{drive.label}</span>
                  {attach[drive.id] === "attached" ? (
                    <span className="v-field-hint">attached</span>
                  ) : attach[drive.id] === "needs-permission" ? (
                    <button type="button" className="v-btn" onClick={() => void allowAccess(drive.id)}>
                      Allow access
                    </button>
                  ) : (
                    <button type="button" className="v-btn" onClick={() => void reattach(drive.id)}>
                      Re-attach
                    </button>
                  )}
                  <button type="button" className="v-btn" onClick={() => void removeDrive(drive.id)}>
                    Remove
                  </button>
                </div>
              ))
            )}

            {pending ? (
              <form className="v-account-form" onSubmit={addDrive}>
                <label className="v-field">
                  <span className="v-field-label">Drive label</span>
                  <input
                    className="v-input"
                    type="text"
                    value={pending.label}
                    maxLength={40}
                    onChange={(e) => setPending({ ...pending, label: e.target.value })}
                  />
                  <span className="v-field-hint">
                    A display name. The folder's location stays on this machine — the site never
                    learns it.
                  </span>
                </label>
                <div className="v-drive-row">
                  <button
                    type="submit"
                    className="v-btn v-btn-primary"
                    disabled={!pending.label.trim()}
                  >
                    Add drive
                  </button>
                  <button type="button" className="v-btn" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="v-btn" onClick={() => void pickFolder()}>
                Pick a folder to share
              </button>
            )}
          </div>

          {error ? (
            <p className="v-account-error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="v-account-note">
            Close this tab and sharing stops. The site never sees the folder, its path, or a single
            file byte — it only introduces this tab to your own signed-in browsers.
          </p>
        </>
      )}
    </section>
  );
}

/** Re-key an elsewhere-keyed machine to this tab: the §12 L ceremony again. */
function TakeOverForm({
  handle,
  machineId,
  onDone,
}: {
  handle: string;
  machineId: string;
  onDone: () => Promise<void>;
}) {
  const { say } = useConfig();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const keys = await generateMachineKeypair();
      const derived = await derivePassword(handle, password);
      const result = await api.machinePair({
        machineId,
        agentPubkey: toBase64Url(keys.publicKeyBytes),
        authSecret: derived.authSecret,
      });
      await shareStore.saveMachine({
        machineId: result.machine.id,
        name: result.machine.name,
        keyPair: keys.keyPair,
        trustRoot: fromBase64Url(result.grantPubkey),
        publicKeyBytes: keys.publicKeyBytes,
      });
      setPassword("");
      say("Sharing taken over on this tab.");
      await onDone();
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "Could not take over sharing.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="v-account-form" onSubmit={onSubmit}>
      <label className="v-field">
        <span className="v-field-label">Your password</span>
        <input
          className="v-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error ? (
        <p className="v-account-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="v-btn v-btn-primary" disabled={!password || busy}>
        {busy ? "Re-keying…" : "Take over sharing on this tab"}
      </button>
    </form>
  );
}
