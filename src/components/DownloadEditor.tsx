/**
 * The downloads editor — the operator's side of the sub-pages (2026-08-20).
 *
 * Client: *"i want to be able to design and name them as i want… each page will
 * be able to host files… a few different styles/layouts for the page that i can
 * edit and publish and make live on the site in real time… even more granular
 * options that i can set, for each user on what they can see."*
 *
 * FOUR THINGS ABOUT THIS SCREEN ARE DELIBERATE.
 *
 * 1. **Draft and live are two buttons, not a checkbox.** "Save" keeps a page
 *    exactly as visible as it already was; "Publish" is the one that changes who
 *    can see it. Making that a state toggle somewhere in a form is how a page
 *    goes live while it still says "test test" — the client is going to be
 *    editing these while on the phone to somebody.
 *
 * 2. **Nothing here is optimistic.** Every save round-trips and the screen
 *    re-reads what the server actually stored. The Worker normalises and
 *    truncates what it is given (a slug is lowercased, prose is capped), so a
 *    screen that kept its own copy would show the operator something the
 *    visitor is not getting.
 *
 * 3. **The upload is chunked and can be watched.** A 300MB program on a
 *    domestic upstream is minutes, and a progress bar is the difference between
 *    waiting and assuming it has hung. It also means a failed part is one part.
 *
 * 4. **The id and the address are stated as permanent, at the point of entry.**
 *    Both end up in links people keep. The field says so rather than a document
 *    saying so, because the document is not open when the form is.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, uploadPart } from "../auth/api";
import type {
  DownloadFileInfo,
  DownloadGrantRow,
  DownloadPageBody,
  DownloadPageSummary,
} from "../auth/api";
import { useConfig } from "../config/ConfigContext";
import { BLOCK_KINDS, PAGE_LAYOUTS, PAGE_VISIBILITY, PLATFORMS } from "../data/downloads";
import type { BlockKind } from "../data/downloads";
import { formatSize } from "./DownloadsPage";

/**
 * 8 MiB.
 *
 * R2 requires every part except the last to be at least 5 MiB, so this is the
 * floor plus room — and it is small enough that a dropped part on a poor line
 * costs seconds rather than a restart. Bigger parts mean fewer requests and a
 * longer thing to lose.
 */
const CHUNK = 8 * 1024 * 1024;

/** Blank page, so "new" has somewhere to start. */
const EMPTY = {
  slug: "",
  title: "",
  summary: "",
  intro: "",
  notice: "",
  layout: "list" as string,
  visibility: "public" as string,
  status: "draft" as string,
};

type Draft = typeof EMPTY;
interface BlockDraft {
  kind: BlockKind;
  body: string;
  group: string;
}

export function DownloadEditor() {
  const { say } = useConfig();
  const [pages, setPages] = useState<DownloadPageSummary[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [files, setFiles] = useState<DownloadFileInfo[]>([]);
  const [grants, setGrants] = useState<DownloadGrantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPages = useCallback(async () => {
    const result = await api.downloadPages();
    setPages(result.pages);
  }, []);

  const openPage = useCallback(async (next: string) => {
    setError(null);
    try {
      const body: DownloadPageBody = await api.downloadPage(next);
      setSlug(next);
      setDraft({
        slug: body.page.slug,
        title: body.page.title,
        summary: body.page.summary,
        intro: body.page.intro ?? "",
        notice: body.page.notice ?? "",
        layout: body.page.layout,
        visibility: body.page.visibility ?? "public",
        status: body.page.status ?? "draft",
      });
      setBlocks(
        (body.blocks ?? []).map((b) => ({
          kind: BLOCK_KINDS.includes(b.kind) ? b.kind : "text",
          body: b.body,
          group: b.group,
        })),
      );
      setFiles(body.files ?? []);
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Couldn't open that page.");
    }
  }, []);

  useEffect(() => {
    void refreshPages().catch(() => setError("Couldn't read the page list."));
    void api
      .adminGrants()
      .then((r) => setGrants(r.grants))
      .catch(() => undefined);
  }, [refreshPages]);

  async function savePage(status?: "draft" | "live") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = { ...draft, status: status ?? draft.status };
      const saved = await api.adminPageSave(next);
      if (draft.layout === "blocks") await api.adminBlocksSave(saved.slug, blocks);
      await refreshPages();
      await openPage(saved.slug);
      say(status === "live" ? "Published. It's live now." : "Saved.");
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function removePage() {
    if (!slug || busy) return;
    setBusy(true);
    try {
      await api.adminPageDelete(slug);
      setSlug(null);
      setDraft(EMPTY);
      setBlocks([]);
      setFiles([]);
      await refreshPages();
      say("Page deleted, files and all.");
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "That didn't delete.");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <section className="v-dledit">
      <h2 className="v-panel-label">Downloads pages</h2>

      <div className="v-dledit-bar">
        <select
          className="v-input"
          aria-label="Page to edit"
          value={slug ?? ""}
          onChange={(e) => {
            if (!e.target.value) {
              setSlug(null);
              setDraft(EMPTY);
              setBlocks([]);
              setFiles([]);
              return;
            }
            void openPage(e.target.value);
          }}
        >
          <option value="">New page…</option>
          {pages.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title} {p.status === "live" ? "" : "(draft)"}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="v-dl-error" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="v-dledit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void savePage();
        }}
      >
        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dle-title">
            Title
          </label>
          <input
            id="v-dle-title"
            className="v-input"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dle-slug">
            Address
          </label>
          <input
            id="v-dle-slug"
            className="v-input"
            value={draft.slug}
            disabled={slug !== null}
            onChange={(e) => set({ slug: e.target.value })}
            placeholder="diagnostic-tools"
          />
          <p className="v-field-hint">
            {slug === null
              ? "Lowercase letters, numbers and hyphens. This becomes /downloads/…, so it ends up in links people keep — it cannot be changed later."
              : `Fixed: /downloads/${draft.slug}. Links already handed out point here.`}
          </p>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dle-summary">
            One line
          </label>
          <input
            id="v-dle-summary"
            className="v-input"
            value={draft.summary}
            onChange={(e) => set({ summary: e.target.value })}
          />
          <p className="v-field-hint">Shown under the title, and on the card in the index.</p>
        </div>

        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dle-layout">
              Look
            </label>
            <select
              id="v-dle-layout"
              className="v-input"
              value={draft.layout}
              onChange={(e) => set({ layout: e.target.value })}
            >
              {PAGE_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {l === "list"
                    ? "List — a manifest"
                    : l === "cards"
                      ? "Cards — a box each"
                      : l === "sheet"
                        ? "Sheet — dense and mono"
                        : "Free-form — your own blocks"}
                </option>
              ))}
            </select>
          </div>

          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dle-vis">
              Who can see it
            </label>
            <select
              id="v-dle-vis"
              className="v-input"
              value={draft.visibility}
              onChange={(e) => set({ visibility: e.target.value })}
            >
              {PAGE_VISIBILITY.map((v) => (
                <option key={v} value={v}>
                  {v === "public"
                    ? "Anyone — listed"
                    : v === "unlisted"
                      ? "Anyone with the link"
                      : v === "code"
                        ? "Needs an access code"
                        : "Only people I've named"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {draft.layout === "blocks" ? (
          <BlockEditor blocks={blocks} onChange={setBlocks} files={files} />
        ) : (
          <>
            <div className="v-field">
              <label className="v-field-label" htmlFor="v-dle-intro">
                Intro
              </label>
              <textarea
                id="v-dle-intro"
                className="v-input v-dledit-area"
                rows={5}
                value={draft.intro}
                onChange={(e) => set({ intro: e.target.value })}
              />
              <p className="v-field-hint">Leave a blank line between paragraphs.</p>
            </div>
          </>
        )}

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dle-notice">
            Warning box
          </label>
          <textarea
            id="v-dle-notice"
            className="v-input v-dledit-area"
            rows={3}
            value={draft.notice}
            onChange={(e) => set({ notice: e.target.value })}
          />
          <p className="v-field-hint">
            Optional, and always shown above the files — never below them, whichever look you
            pick. The standing Windows warning appears on its own when a page holds a Windows
            program; this is for anything on top of that.
          </p>
        </div>

        <div className="v-dledit-actions">
          <button type="submit" className="v-btn" disabled={busy || !draft.title || !draft.slug}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="v-btn v-btn-primary"
            disabled={busy || !draft.title || !draft.slug}
            onClick={() => void savePage("live")}
          >
            {draft.status === "live" ? "Save and keep live" : "Publish"}
          </button>
          {draft.status === "live" && slug ? (
            <button
              type="button"
              className="v-btn v-btn-quiet"
              disabled={busy}
              onClick={() => void savePage("draft")}
            >
              Unpublish
            </button>
          ) : null}
          {slug ? (
            <button type="button" className="v-btn v-btn-danger" disabled={busy} onClick={removePage}>
              Delete page
            </button>
          ) : null}
        </div>
      </form>

      {slug ? (
        <>
          <FileManager slug={slug} files={files} onChanged={() => void openPage(slug)} />
          <GrantManager
            slug={slug}
            files={files}
            grants={grants}
            onChanged={() =>
              void api
                .adminGrants()
                .then((r) => setGrants(r.grants))
                .catch(() => undefined)
            }
          />
        </>
      ) : (
        <p className="v-field-hint">Save the page before adding files to it.</p>
      )}
    </section>
  );
}

/**
 * The free-form block list.
 *
 * Add, remove, reorder — and no rich text. The four kinds are the whole
 * vocabulary; see the migration for why an HTML box is not on offer.
 */
function BlockEditor({
  blocks,
  onChange,
  files,
}: {
  blocks: BlockDraft[];
  onChange: (next: BlockDraft[]) => void;
  files: DownloadFileInfo[];
}) {
  const groups = Array.from(new Set(files.map((f) => f.group || ""))).sort();
  const move = (i: number, by: number) => {
    const next = blocks.slice();
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const patch = (i: number, p: Partial<BlockDraft>) =>
    onChange(blocks.map((b, j) => (i === j ? { ...b, ...p } : b)));

  return (
    <div className="v-dledit-blocks">
      <h3 className="v-field-label">Blocks</h3>
      {blocks.map((block, i) => (
        <div className="v-dledit-block" key={i}>
          <div className="v-dledit-block-bar">
            <select
              className="v-input"
              aria-label={`Block ${i + 1} kind`}
              value={block.kind}
              onChange={(e) => patch(i, { kind: e.target.value as BlockKind })}
            >
              <option value="heading">Heading</option>
              <option value="text">Text</option>
              <option value="list">Bullet list</option>
              <option value="files">Files</option>
            </select>
            <button type="button" className="v-btn v-btn-quiet" onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="v-btn v-btn-quiet" onClick={() => move(i, 1)}>
              ↓
            </button>
            <button
              type="button"
              className="v-btn v-btn-quiet"
              onClick={() => onChange(blocks.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>

          {block.kind === "files" ? (
            <select
              className="v-input"
              aria-label={`Block ${i + 1} file group`}
              value={block.group}
              onChange={(e) => patch(i, { group: e.target.value })}
            >
              <option value="">Files with no group</option>
              {groups
                .filter(Boolean)
                .map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
            </select>
          ) : (
            <textarea
              className="v-input v-dledit-area"
              aria-label={`Block ${i + 1} text`}
              rows={block.kind === "heading" ? 1 : 4}
              value={block.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              placeholder={block.kind === "list" ? "One item per line" : ""}
            />
          )}
        </div>
      ))}

      <button
        type="button"
        className="v-btn"
        onClick={() => onChange([...blocks, { kind: "text", body: "", group: "" }])}
      >
        Add a block
      </button>
    </div>
  );
}

/** The files on one page: their details, their bytes, and getting rid of them. */
function FileManager({
  slug,
  files,
  onChanged,
}: {
  slug: string;
  files: DownloadFileInfo[];
  onChanged: () => void;
}) {
  const { say } = useConfig();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [platform, setPlatform] = useState("any");
  const [version, setVersion] = useState("");
  const [author, setAuthor] = useState("");
  const [caveat, setCaveat] = useState("");
  const [group, setGroup] = useState("");
  const [free, setFree] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!file || progress !== null) return;
    setError(null);
    setProgress(0);
    let uploadId = "";
    try {
      await api.adminFileSave({
        id,
        slug,
        name,
        blurb,
        platform,
        version,
        filename: file.name,
        free,
        author,
        caveat,
        group,
      });

      const begun = await api.adminUploadBegin(id, file.type || "application/octet-stream");
      uploadId = begun.uploadId;

      const parts: { part: number; etag: string }[] = [];
      const total = Math.max(1, Math.ceil(file.size / CHUNK));
      for (let i = 0; i < total; i += 1) {
        const chunk = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
        // Sequential on purpose. Parallel parts would be faster on a fat pipe
        // and this is a domestic upstream: three concurrent chunks would share
        // the same ceiling and each one would take three times as long to fail.
        parts.push(await uploadPart(id, uploadId, i + 1, chunk));
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      await api.adminUploadFinish(id, uploadId, parts);
      say(`${name || id} is up.`);
      setId("");
      setName("");
      setBlurb("");
      setVersion("");
      setAuthor("");
      setCaveat("");
      setFile(null);
      onChanged();
    } catch (thrown) {
      // An abandoned multipart upload holds storage until R2 expires it, so it
      // is told to stop rather than left. Best effort: the failure that got us
      // here may be the same one that stops this working.
      if (uploadId) await api.adminUploadAbort(id, uploadId).catch(() => undefined);
      setError(thrown instanceof ApiError ? thrown.message : "That upload didn't finish.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="v-dledit-files">
      <h3 className="v-panel-label">Files on this page</h3>

      <ul className="v-admin-list">
        {files.map((f) => (
          <li className="v-admin-row" key={f.id}>
            <div>
              <strong>{f.name}</strong>
              <span className="v-dledit-file-meta">
                {" "}
                {f.id} · {formatSize(f.size)} · {f.free ? "free" : "needs a code"}
                {f.group ? ` · ${f.group}` : ""}
              </span>
            </div>
            <button
              type="button"
              className="v-btn v-btn-danger"
              onClick={async () => {
                await api.adminFileDelete(f.id).catch(() => undefined);
                onChanged();
              }}
            >
              Delete
            </button>
          </li>
        ))}
        {files.length === 0 ? <li className="v-field-hint">No files on this page yet.</li> : null}
      </ul>

      <form className="v-dledit-form" onSubmit={add}>
        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-id">
              Id
            </label>
            <input
              id="v-dlf-id"
              className="v-input"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="boot-repair"
            />
            <p className="v-field-hint">
              Lowercase letters, numbers and hyphens. It is the download's address and cannot be
              changed once anyone has the link.
            </p>
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-name">
              Name
            </label>
            <input
              id="v-dlf-name"
              className="v-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlf-blurb">
            What it does
          </label>
          <input
            id="v-dlf-blurb"
            className="v-input"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
          />
        </div>

        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-platform">
              Runs on
            </label>
            <select
              id="v-dlf-platform"
              className="v-input"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-version">
              Version
            </label>
            <input
              id="v-dlf-version"
              className="v-input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-group">
              Group
            </label>
            <input
              id="v-dlf-group"
              className="v-input"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
            <p className="v-field-hint">Only used by the free-form look.</p>
          </div>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlf-author">
            Written by someone else?
          </label>
          <input
            id="v-dlf-author"
            className="v-input"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Leave blank if it's yours"
          />
          <p className="v-field-hint">
            If it is not yours, name them — and check their licence lets you hand it out. Nothing
            here can check that for you.
          </p>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlf-caveat">
            Anything to know before clicking
          </label>
          <input
            id="v-dlf-caveat"
            className="v-input"
            value={caveat}
            onChange={(e) => setCaveat(e.target.value)}
          />
        </div>

        <div className="v-field">
          <label className="v-check">
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
            <span>Free — no code needed</span>
          </label>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlf-file">
            The file
          </label>
          <input
            id="v-dlf-file"
            className="v-input"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? <p className="v-field-hint">{file.name} · {formatSize(file.size)}</p> : null}
        </div>

        {progress !== null ? (
          <p className="v-dledit-progress" aria-live="polite">
            Uploading… {progress}%
          </p>
        ) : null}
        {error ? (
          <p className="v-dl-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="v-btn" disabled={!file || !id || progress !== null}>
          Add file
        </button>
      </form>
    </div>
  );
}

/** Per-account access: who, to what, until when. */
function GrantManager({
  slug,
  files,
  grants,
  onChanged,
}: {
  slug: string;
  files: DownloadFileInfo[];
  grants: DownloadGrantRow[];
  onChanged: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [scope, setScope] = useState("");
  const [days, setDays] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.adminGrantAdd({
        handle,
        // An empty scope is this page; a value is one file on it. Granting
        // *everything* is deliberately not offered from a page's own screen —
        // it is a different decision and it should not be one dropdown away
        // from "this page".
        slug,
        item: scope || null,
        label,
        days,
      });
      setHandle("");
      setLabel("");
      onChanged();
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "That didn't save.");
    }
  }

  const mine = grants.filter((g) => g.slug === slug || g.slug === null);

  return (
    <div className="v-dledit-grants">
      <h3 className="v-panel-label">Who can see this page</h3>
      <p className="v-field-hint">
        Named people sign in with an account. This is separate from access codes, which need no
        account at all — use a code for a one-off sale and a name for somebody who comes back.
      </p>

      <ul className="v-admin-list">
        {mine.map((g) => (
          <li className="v-admin-row" key={g.id}>
            <div>
              <strong>{g.handle}</strong>
              <span className="v-dledit-file-meta">
                {" "}
                {g.slug === null ? "everything" : g.item_id ? `one file: ${g.item_id}` : "this page"}
                {g.expires_at ? ` · until ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                {g.label ? ` · ${g.label}` : ""}
              </span>
            </div>
            <button
              type="button"
              className="v-btn v-btn-danger"
              onClick={async () => {
                await api.adminGrantRemove(g.id).catch(() => undefined);
                onChanged();
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {mine.length === 0 ? <li className="v-field-hint">Nobody named yet.</li> : null}
      </ul>

      <form className="v-dledit-form" onSubmit={add}>
        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlg-handle">
              Account name
            </label>
            <input
              id="v-dlg-handle"
              className="v-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlg-scope">
              What
            </label>
            <select
              id="v-dlg-scope"
              className="v-input"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">This whole page</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  Just {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlg-days">
              Days
            </label>
            <input
              id="v-dlg-days"
              className="v-input"
              type="number"
              min={0}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            <p className="v-field-hint">0 never expires.</p>
          </div>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlg-label">
            Note
          </label>
          <input
            id="v-dlg-label"
            className="v-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        {error ? (
          <p className="v-dl-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="v-btn" disabled={!handle.trim()}>
          Give access
        </button>
      </form>
    </div>
  );
}
