import { useCallback, useEffect, useRef, useState } from "react";

import { api, type DriveInfo, type MachineInfo } from "../auth/api";
import { useSession } from "../auth/SessionContext";
import { useConfig } from "../config/ConfigContext";
import { DriveConnection } from "../share/browse";
import type { ListEntry } from "../share/protocol";
import { unlockForConnect } from "../share/unlock";

/**
 * The browse surface (SPEC-ACCOUNTS.md §13): paired machines with live
 * presence, their drives, and the §10 file explorer — List mode — over a
 * verified peer connection.
 *
 * Opening the first drive asks for the password once per page visit: §12 K's
 * ceremony, unwrapping the grant key that signs this connection's fingerprint.
 * The key lives in component state, non-extractable, and leaves with the page.
 */

function formatSize(size: number | undefined): string {
  if (size === undefined) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface OpenDrive {
  machine: MachineInfo;
  drive: DriveInfo;
  conn: DriveConnection;
}

interface FetchProgress {
  name: string;
  received: number;
  size: number;
}

/** The §10 explorer, List mode. Grid and Column follow the same listing later. */
function Explorer({
  open,
  onStale,
  onClose,
}: {
  open: OpenDrive;
  /** The connection folded mid-errand — the parent drops it so Retry reconnects. */
  onStale: () => void;
  onClose: () => void;
}) {
  const { say } = useConfig();
  const [path, setPath] = useState<string[]>([]);
  const [listing, setListing] = useState<{ entries: ListEntry[]; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState<FetchProgress | null>(null);

  const list = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await open.conn.list(open.drive.id, path);
      setListing({
        entries: [...result.entries].sort((a, b) =>
          a.kind === b.kind
            ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            : a.kind === "directory"
              ? -1
              : 1,
        ),
        truncated: result.truncated,
      });
    } catch (cause) {
      setListing(null);
      setError(cause instanceof Error ? cause.message : "That folder could not be listed.");
      if (open.conn.closed) onStale();
    } finally {
      setLoading(false);
    }
  }, [open, path, onStale]);

  useEffect(() => {
    void list();
  }, [list]);

  async function fetchFile(name: string) {
    if (fetching) return;
    setFetching({ name, received: 0, size: 0 });
    setError(null);
    try {
      const blob = await open.conn.read(open.drive.id, [...path, name], (received, size) =>
        setFetching({ name, received, size }),
      );
      saveBlob(blob, name);
      say(`Fetched ${name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
      if (open.conn.closed) onStale();
    } finally {
      setFetching(null);
    }
  }

  const crumbs = [open.drive.label, ...path];

  return (
    <div className="v-machine-card">
      <div className="v-machine-head">
        <nav className="v-crumbs" aria-label="Folder path">
          {crumbs.map((crumb, index) => (
            <button
              key={`${index}-${crumb}`}
              type="button"
              className="v-account-link"
              onClick={() => setPath(path.slice(0, index))}
              aria-current={index === crumbs.length - 1 ? "location" : undefined}
            >
              {crumb}
            </button>
          ))}
        </nav>
        <button type="button" className="v-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {error ? (
        <p className="v-account-error" role="alert">
          {error}{" "}
          <button type="button" className="v-account-link" onClick={() => void list()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="v-account-note">Listing…</p>
      ) : listing ? (
        listing.entries.length === 0 ? (
          <p className="v-account-note">This folder is empty.</p>
        ) : (
          <>
            <table className="v-files">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Size</th>
                  <th scope="col">Modified</th>
                </tr>
              </thead>
              <tbody>
                {listing.entries.map((entry) => (
                  <tr key={entry.name}>
                    <td>
                      <button
                        type="button"
                        className="v-account-link v-file-name"
                        disabled={entry.kind === "file" && fetching !== null}
                        onClick={() =>
                          entry.kind === "directory"
                            ? setPath([...path, entry.name])
                            : void fetchFile(entry.name)
                        }
                      >
                        {entry.name}
                      </button>
                    </td>
                    <td>{entry.kind === "directory" ? "folder" : "file"}</td>
                    <td>
                      {fetching?.name === entry.name
                        ? fetching.size > 0
                          ? `${Math.floor((fetching.received / fetching.size) * 100)}%`
                          : "fetching…"
                        : formatSize(entry.size)}
                    </td>
                    <td>{entry.modified ? new Date(entry.modified).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listing.truncated ? (
              <p className="v-account-note">Showing the first 2000 entries.</p>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

export function MachinesPage() {
  const { me, known } = useSession();
  const { go } = useConfig();

  const [machines, setMachines] = useState<MachineInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [grantKey, setGrantKey] = useState<CryptoKey | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ machine: MachineInfo; drive: DriveInfo } | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<OpenDrive | null>(null);

  // One verified connection per machine, kept for the visit. Dropped when its
  // channel folds so the next Open reconnects instead of failing forever.
  const connections = useRef(new Map<string, DriveConnection>());

  const load = useCallback(async () => {
    setListError(null);
    try {
      setMachines((await api.machinesList()).machines);
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "Could not list your machines.");
    }
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  useEffect(() => {
    const held = connections.current;
    return () => {
      for (const conn of held.values()) conn.close();
      held.clear();
    };
  }, []);

  const connect = useCallback(
    async (machine: MachineInfo, drive: DriveInfo, key: CryptoKey) => {
      setConnecting(drive.id);
      setCardErrors((errors) => ({ ...errors, [machine.id]: "" }));
      try {
        let conn = connections.current.get(machine.id);
        if (conn?.closed) {
          connections.current.delete(machine.id);
          conn = undefined;
        }
        if (!conn) {
          conn = await DriveConnection.open(machine, key);
          connections.current.set(machine.id, conn);
        }
        setOpen({ machine, drive, conn });
      } catch (cause) {
        setCardErrors((errors) => ({
          ...errors,
          [machine.id]:
            cause instanceof Error ? cause.message : "Could not connect to that machine.",
        }));
      } finally {
        setConnecting(null);
      }
    },
    [],
  );

  if (!known) return null;

  if (!me) {
    return (
      <section className="v-account" aria-live="polite">
        <p className="v-account-note">
          Machines belong to an account.{" "}
          <button type="button" className="v-account-link" onClick={() => go("signin")}>
            Sign in first
          </button>
          .
        </p>
      </section>
    );
  }

  async function onUnlock(event: React.FormEvent) {
    event.preventDefault();
    if (!password || unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const key = await unlockForConnect(me!.account.handle, password);
      setGrantKey(key);
      setPassword("");
      const asked = pendingOpen;
      setPendingOpen(null);
      if (asked) await connect(asked.machine, asked.drive, key);
    } catch (cause) {
      setUnlockError(cause instanceof Error ? cause.message : "Could not open your key.");
    } finally {
      setUnlockBusy(false);
    }
  }

  function askToOpen(machine: MachineInfo, drive: DriveInfo) {
    if (grantKey) void connect(machine, drive, grantKey);
    else setPendingOpen({ machine, drive });
  }

  return (
    <section className="v-account" aria-live="polite">
      {open ? (
        <Explorer
          open={open}
          onStale={() => connections.current.delete(open.machine.id)}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {pendingOpen && !grantKey ? (
        <form className="v-account-form v-machine-card" onSubmit={onUnlock}>
          <h2 className="v-account-title">Open your key</h2>
          <p className="v-account-note">
            Your password opens the key that proves this connection is yours — here in the browser,
            for this visit only. Nothing is stored.
          </p>
          <label className="v-field">
            <span className="v-field-label">Your password</span>
            <input
              className="v-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {unlockError ? (
            <p className="v-account-error" role="alert">
              {unlockError}
            </p>
          ) : null}
          <button type="submit" className="v-btn v-btn-primary" disabled={!password || unlockBusy}>
            {unlockBusy ? "Opening…" : `Open ${pendingOpen.drive.label}`}
          </button>
        </form>
      ) : null}

      {listError ? (
        <p className="v-account-error" role="alert">
          {listError}{" "}
          <button type="button" className="v-account-link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {machines === null && !listError ? (
        <p className="v-account-note">Listing your machines…</p>
      ) : null}

      {machines?.length === 0 ? (
        <p className="v-account-note">
          No machines yet. On the computer that holds the files, sign in and open{" "}
          <button type="button" className="v-account-link" onClick={() => go("share")}>
            the sharing tab
          </button>{" "}
          to pair it.
        </p>
      ) : null}

      {machines?.length ? (
        <div className="v-machines">
          {machines.map((machine) => (
            <div key={machine.id} className="v-machine-card">
              <div className="v-machine-head">
                <h2 className="v-account-title">{machine.name}</h2>
                <span className={machine.online ? "v-online" : "v-online is-off"}>
                  {machine.online ? "online" : "offline"}
                </span>
              </div>

              {!machine.online ? (
                <p className="v-account-note">
                  Offline — open its sharing tab on that machine to bring it back.
                </p>
              ) : null}

              {cardErrors[machine.id] ? (
                <p className="v-account-error" role="alert">
                  {cardErrors[machine.id]}
                </p>
              ) : null}

              {machine.drives.length === 0 ? (
                <p className="v-account-note">No folders shared from this machine yet.</p>
              ) : (
                machine.drives.map((drive) => (
                  <div key={drive.id} className="v-drive-row">
                    <span>{drive.label}</span>
                    <button
                      type="button"
                      className="v-btn"
                      disabled={!machine.online || connecting !== null}
                      onClick={() => askToOpen(machine, drive)}
                    >
                      {connecting === drive.id ? "Connecting…" : "Open"}
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      ) : null}

      {machines ? (
        <button type="button" className="v-btn" onClick={() => void load()}>
          Refresh
        </button>
      ) : null}
    </section>
  );
}
