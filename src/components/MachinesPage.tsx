import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { api, type DriveInfo, type MachineInfo } from "../auth/api";
import { useSession } from "../auth/SessionContext";
import { useConfig } from "../config/ConfigContext";
import { DriveConnection } from "../share/browse";
import type { ListEntry } from "../share/protocol";
import { unlockForConnect } from "../share/unlock";
import { categorise, FileIcon } from "./FileIcon";

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
  /** Full path key, so a wash lands on the right row in any pane. */
  key: string;
  name: string;
  received: number;
  size: number;
}

type ViewMode = "list" | "grid" | "column";
type SortKey = "name" | "kind" | "size" | "modified";
interface Listing {
  entries: ListEntry[];
  truncated: boolean;
}

const VIEWS_KEY = "vessel.explorer.v1";

/** Per-drive view memory (§10), validated on the way back in like all storage. */
function storedView(driveId: string): ViewMode {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return "list";
    const view = (parsed as Record<string, unknown>)[driveId];
    return view === "grid" || view === "column" ? view : "list";
  } catch {
    return "list";
  }
}

function rememberView(driveId: string, view: ViewMode): void {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "{}");
    const views =
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    views[driveId] = view;
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Storage denied — the choice still holds for this visit.
  }
}

function baseSort(entries: ListEntry[]): ListEntry[] {
  return [...entries].sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      : a.kind === "directory"
        ? -1
        : 1,
  );
}

/** Component names cannot contain a separator (§12 S), so this is unambiguous. */
function pathKey(dir: string[], name: string): string {
  return [...dir, name].join("/");
}

const SORT_HEADS: ReadonlyArray<readonly [SortKey, string]> = [
  ["name", "Name"],
  ["kind", "Kind"],
  ["size", "Size"],
  ["modified", "Modified"],
];

/** The §10 explorer: List, Grid and Column over one listing protocol. */
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
  const { say, config } = useConfig();
  const [view, setView] = useState<ViewMode>(() => storedView(open.drive.id));
  const [path, setPath] = useState<string[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [columns, setColumns] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState<FetchProgress | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true });

  // Calm collapses Grid and Column to List and drops the wash (§10) — the
  // dense sortable table is the accessible view, not a degradation.
  const shown: ViewMode = config.calm ? "list" : view;

  // Panes already fetched, and the path they were fetched for. Pane d lists
  // path.slice(0, d), so panes survive any navigation that keeps their prefix.
  const colState = useRef<{ path: string[]; panes: Listing[] }>({ path: [], panes: [] });
  const colToken = useRef(0);
  const colsRef = useRef<HTMLDivElement>(null);

  const list = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await open.conn.list(open.drive.id, path);
      setListing({ entries: baseSort(result.entries), truncated: result.truncated });
    } catch (cause) {
      setListing(null);
      setError(cause instanceof Error ? cause.message : "That folder could not be listed.");
      if (open.conn.closed) onStale();
    } finally {
      setLoading(false);
    }
  }, [open, path, onStale]);

  const listColumns = useCallback(async () => {
    const token = ++colToken.current;
    setError(null);
    const prev = colState.current;
    let common = 0;
    while (common < prev.path.length && common < path.length && prev.path[common] === path[common])
      common++;
    const panes = prev.panes.slice(0, Math.min(prev.panes.length, common + 1));
    colState.current = { path: [...path], panes };
    setColumns([...panes]);
    if (panes.length > path.length) {
      // Fully served from cache — but a superseded run's finally is token-gated
      // and can no longer clear the flag, so this run must.
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      for (let depth = panes.length; depth <= path.length; depth++) {
        const result = await open.conn.list(open.drive.id, path.slice(0, depth));
        if (token !== colToken.current) return;
        panes.push({ entries: baseSort(result.entries), truncated: result.truncated });
        setColumns([...panes]);
      }
    } catch (cause) {
      if (token !== colToken.current) return;
      setError(cause instanceof Error ? cause.message : "That folder could not be listed.");
      if (open.conn.closed) onStale();
    } finally {
      if (token === colToken.current) setLoading(false);
    }
  }, [open, path, onStale]);

  const wantsColumns = shown === "column";
  useEffect(() => {
    if (wantsColumns) {
      void listColumns();
    } else {
      // Leaving Column mode must strand any in-flight column run, or its
      // completion writes loading/error state under the List view.
      colToken.current++;
      void list();
    }
  }, [wantsColumns, list, listColumns]);

  useEffect(() => {
    colsRef.current?.scrollTo({ left: colsRef.current.scrollWidth });
  }, [columns.length]);

  async function fetchFile(dir: string[], name: string) {
    if (fetching) return;
    const key = pathKey(dir, name);
    setFetching({ key, name, received: 0, size: 0 });
    setError(null);
    try {
      const blob = await open.conn.read(open.drive.id, [...dir, name], (received, size) =>
        setFetching({ key, name, received, size }),
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

  /** The §10 progress wash — a left-to-right fill in --a1 instead of a spinner. */
  function washStyle(dir: string[], entry: ListEntry): CSSProperties | undefined {
    if (config.calm || fetching?.key !== pathKey(dir, entry.name)) return undefined;
    const pct =
      fetching.size > 0 ? Math.min(100, Math.round((fetching.received / fetching.size) * 100)) : 0;
    return { "--wash": `${pct}%` } as CSSProperties;
  }

  const sortedEntries = useMemo(() => {
    if (!listing) return [];
    const flip = sort.asc ? 1 : -1;
    return [...listing.entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      let d = 0;
      if (sort.key === "size") d = (a.size ?? -1) - (b.size ?? -1);
      else if (sort.key === "modified") d = (a.modified ?? 0) - (b.modified ?? 0);
      else if (sort.key === "kind")
        d = categorise(a.name, a.kind).localeCompare(categorise(b.name, b.kind));
      if (d === 0) d = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return d * flip;
    });
  }, [listing, sort]);

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
        {!config.calm ? (
          <div className="v-viewswitch" role="group" aria-label="Explorer view">
            {(["list", "grid", "column"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`chip${view === mode ? " is-active" : ""}`}
                aria-pressed={view === mode}
                onClick={() => {
                  setView(mode);
                  rememberView(open.drive.id, mode);
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="v-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {error ? (
        <p className="v-account-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="v-account-link"
            onClick={() => void (wantsColumns ? listColumns() : list())}
          >
            Retry
          </button>
        </p>
      ) : null}

      {shown === "column" ? (
        columns.length === 0 ? (
          loading ? (
            <p className="v-account-note">Listing…</p>
          ) : null
        ) : (
          <div className="v-cols" ref={colsRef}>
            {columns.map((pane, depth) => (
              <ul className="v-col" key={depth}>
                {pane.entries.length === 0 ? (
                  <li className="v-col-note">This folder is empty.</li>
                ) : (
                  pane.entries.map((entry) => {
                    const dir = path.slice(0, depth);
                    const ws = washStyle(dir, entry);
                    const selected = entry.kind === "directory" && path[depth] === entry.name;
                    return (
                      <li key={entry.name}>
                        <button
                          type="button"
                          className={`v-col-row${selected ? " is-selected" : ""}${ws ? " v-wash" : ""}`}
                          style={ws}
                          aria-current={selected ? "location" : undefined}
                          disabled={entry.kind === "file" && fetching !== null}
                          onClick={() =>
                            entry.kind === "directory"
                              ? setPath([...dir, entry.name])
                              : void fetchFile(dir, entry.name)
                          }
                        >
                          <FileIcon name={entry.name} kind={entry.kind} />
                          <span className="v-col-name">{entry.name}</span>
                          {entry.kind === "directory" ? (
                            <span className="v-col-more" aria-hidden="true">
                              ›
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
                {pane.truncated ? (
                  <li className="v-col-note">Showing the first 2000 entries.</li>
                ) : null}
              </ul>
            ))}
            {loading ? <div className="v-col v-col-note">Listing…</div> : null}
          </div>
        )
      ) : loading ? (
        <p className="v-account-note">Listing…</p>
      ) : listing ? (
        listing.entries.length === 0 ? (
          <p className="v-account-note">This folder is empty.</p>
        ) : (
          <>
            {shown === "grid" ? (
              <div className="v-files-grid">
                {sortedEntries.map((entry) => {
                  const ws = washStyle(path, entry);
                  return (
                    <button
                      key={entry.name}
                      type="button"
                      className={`v-ftile${entry.kind === "directory" ? " is-dir" : ""}${ws ? " v-wash" : ""}`}
                      style={ws}
                      disabled={entry.kind === "file" && fetching !== null}
                      onClick={() =>
                        entry.kind === "directory"
                          ? setPath([...path, entry.name])
                          : void fetchFile(path, entry.name)
                      }
                    >
                      <FileIcon name={entry.name} kind={entry.kind} />
                      <span className="v-ftile-label">{entry.name}</span>
                      <span className="v-ftile-sub">
                        {entry.kind === "directory" ? "folder" : formatSize(entry.size)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <table className="v-files">
                <thead>
                  <tr>
                    {SORT_HEADS.map(([key, label]) => (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={
                          sort.key === key ? (sort.asc ? "ascending" : "descending") : undefined
                        }
                      >
                        <button
                          type="button"
                          className="v-files-sort"
                          onClick={() =>
                            setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))
                          }
                        >
                          {label}
                          {sort.key === key ? (sort.asc ? " ▲" : " ▼") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => {
                    const ws = washStyle(path, entry);
                    return (
                      <tr key={entry.name} className={ws ? "v-wash" : undefined} style={ws}>
                        <td className="v-file-cell">
                          <button
                            type="button"
                            className={`v-account-link v-file-name${entry.kind === "directory" ? " is-dir" : ""}`}
                            disabled={entry.kind === "file" && fetching !== null}
                            onClick={() =>
                              entry.kind === "directory"
                                ? setPath([...path, entry.name])
                                : void fetchFile(path, entry.name)
                            }
                          >
                            {entry.name}
                          </button>
                        </td>
                        <td>{categorise(entry.name, entry.kind)}</td>
                        <td>
                          {fetching?.key === pathKey(path, entry.name)
                            ? fetching.size > 0
                              ? `${Math.floor((fetching.received / fetching.size) * 100)}%`
                              : "fetching…"
                            : formatSize(entry.size)}
                        </td>
                        <td>
                          {entry.modified ? new Date(entry.modified).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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
          key={open.drive.id}
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
                    <span className="v-drive-label">{drive.label}</span>
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
