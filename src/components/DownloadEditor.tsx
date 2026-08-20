/**
 * The downloads editor — the operator's side of the sub-pages (2026-08-20).
 *
 * Client: *"i want to be able to design and name them as i want… each page will
 * be able to host files… a few different styles/layouts for the page that i can
 * edit and publish and make live on the site in real time… even more granular
 * options that i can set, for each user on what they can see"*, and then
 * *"descriptions/prices, categories, filters, sort by, with an icon for each
 * category… or just have an upload portal for me as well please."*
 *
 * SIX THINGS ABOUT THIS SCREEN ARE DELIBERATE.
 *
 * 1. **Draft and live are two buttons, not a checkbox.** "Save" keeps a page
 *    exactly as visible as it already was; "Publish" is the one that changes who
 *    can see it. Making that a state toggle somewhere in a form is how a page
 *    goes live while it still says "test test" — the client is going to be
 *    editing these while on the phone to somebody.
 *
 * 2. **Nothing here is optimistic.** Every save round-trips and the screen
 *    re-reads what the server actually stored. The Worker normalises and
 *    truncates what it is given (a slug is lowercased, prose is capped, a price
 *    is refused rather than rounded), so a screen that kept its own copy would
 *    show the operator something the visitor is not getting.
 *
 * 3. **The upload is chunked and can be watched.** A 300MB program on a
 *    domestic upstream is minutes, and a progress bar is the difference between
 *    waiting and assuming it has hung. It also means a failed part is one part.
 *
 * 4. **The id and the address are stated as permanent, at the point of entry.**
 *    Both end up in links people keep. The field says so rather than a document
 *    saying so, because the document is not open when the form is.
 *
 * 5. **One form adds and edits, and picking a file fills it in** (2026-08-20).
 *    Before this the only way to change a blurb, a price or the free flag was to
 *    upload the whole program again — the Worker's `saveFile` had always
 *    supported an edit and no screen ever sent one. On an edit the file picker
 *    is optional, so changing a description costs nothing and replacing the
 *    bytes is the same gesture as uploading them the first time.
 *
 * 6. **Every presentation switch is the operator's, and each defaults to what
 *    the page did before it existed.** Prices are off, filters are off, icons
 *    are on, order is the operator's own. So turning them all off is exactly the
 *    page that shipped, and nothing changed under anybody without a decision.
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
import {
  BLOCK_KINDS,
  FILE_SORTS,
  PAGE_LAYOUTS,
  PAGE_VISIBILITY,
  PICKABLE_CATEGORIES,
  PLATFORMS,
  PLATFORM_LABEL,
  SORT_LABEL,
  categoryOf,
  formatPrice,
  suggestFromFilename,
} from "../data/downloads";
import type { BlockKind, DownloadPlatform } from "../data/downloads";
import { CategoryIcon } from "./CategoryIcon";
import { formatSize } from "./DownloadsPage";
import { QrCode } from "./QrCode";

/**
 * 8 MiB.
 *
 * R2 requires every part except the last to be at least 5 MiB, so this is the
 * floor plus room — and it is small enough that a dropped part on a poor line
 * costs seconds rather than a restart. Bigger parts mean fewer requests and a
 * longer thing to lose.
 */
const CHUNK = 8 * 1024 * 1024;

/** Blank page, so "new" has somewhere to start. Every default is today's page. */
const EMPTY = {
  slug: "",
  title: "",
  summary: "",
  intro: "",
  notice: "",
  layout: "list" as string,
  visibility: "public" as string,
  status: "draft" as string,
  sort: "manual" as string,
  showFilters: false,
  showPrices: false,
  showIcons: true,
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
        sort: body.page.sort ?? "manual",
        showFilters: body.page.showFilters === true,
        showPrices: body.page.showPrices === true,
        // On by default, so an absent field has to read as on — the same shape
        // the Worker uses, and the same shape the `entrances` share-code bit
        // uses. Reading it as off would silently strip the icons from every page
        // saved by an older deploy the first time it was opened here.
        showIcons: body.page.showIcons !== false,
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
    // Cleared on entry like every other action: an error left over from an
    // earlier failed save otherwise sits on screen after this one succeeds,
    // reporting a problem with something that is no longer there.
    setError(null);
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

  /**
   * Move a page up or down the index.
   *
   * `reorderPages` existed in the Worker from the day sub-pages landed and had
   * no control anywhere, so `position` could only ever be the order the pages
   * were created in. The whole order is rewritten because a dozen rows does not
   * need anything cleverer, which is what the endpoint already assumed.
   */
  async function movePage(from: number, by: number) {
    const to = from + by;
    if (to < 0 || to >= pages.length || busy) return;
    const order = pages.map((p) => p.slug);
    [order[from], order[to]] = [order[to], order[from]];
    setBusy(true);
    setError(null);
    try {
      await api.adminPageOrder(order);
      await refreshPages();
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Couldn't reorder those.");
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

      {/* The order the index shows them in. Only worth a control when there is
          more than one, and it is the order visitors see rather than a private
          sort — so it is here, next to the list, rather than inside a page. */}
      {pages.length > 1 ? (
        <div className="v-dledit-order">
          <h3 className="v-field-label">Order on /downloads</h3>
          <ul className="v-admin-list">
            {pages.map((p, i) => (
              <li className="v-admin-row" key={p.slug}>
                <div>
                  <strong>{p.title}</strong>
                  <span className="v-dledit-file-meta">
                    {" "}
                    /downloads/{p.slug}
                    {p.status === "live" ? "" : " · draft"}
                  </span>
                </div>
                <div className="v-admin-actions">
                  <button
                    type="button"
                    className="v-btn v-btn-quiet"
                    aria-label={`Move ${p.title} up`}
                    disabled={busy || i === 0}
                    onClick={() => void movePage(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="v-btn v-btn-quiet"
                    aria-label={`Move ${p.title} down`}
                    disabled={busy || i === pages.length - 1}
                    onClick={() => void movePage(i, 1)}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

        {/* ---- how the page presents its files ---------------------------- */}
        <fieldset className="v-dledit-fieldset">
          <legend className="v-field-label">How the files are shown</legend>

          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dle-sort">
              Order they come out in
            </label>
            <select
              id="v-dle-sort"
              className="v-input"
              value={draft.sort}
              onChange={(e) => set({ sort: e.target.value })}
            >
              {FILE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="v-field-hint">
              "My order" is the order you put them in below. Whatever you pick here is what the
              page arrives in; a visitor can re-sort what they're looking at, and that never
              changes what anyone else sees.
            </p>
          </div>

          <label className="v-check">
            <input
              type="checkbox"
              checked={draft.showFilters}
              onChange={(e) => set({ showFilters: e.target.checked })}
            />
            <span>Let visitors filter and search</span>
          </label>
          <p className="v-field-hint">
            The row only appears when there's actually a choice — two kinds of program, or two
            platforms. On a short page it stays hidden whatever you set here. A search box joins
            it once a page has eight files or more, which is about where a list stops being
            something you can just read down.
          </p>

          <label className="v-check">
            <input
              type="checkbox"
              checked={draft.showIcons}
              onChange={(e) => set({ showIcons: e.target.checked })}
            />
            <span>Show the category icon beside each file</span>
          </label>

          <label className="v-check">
            <input
              type="checkbox"
              checked={draft.showPrices}
              onChange={(e) => set({ showPrices: e.target.checked })}
            />
            <span>Show prices on this page</span>
          </label>
          <p className="v-field-hint">
            Off by default, and off is how the rest of the site behaves — no page names a figure
            except your own rate on the front page. Turn it on and every file here that has a
            price prints it next to its size. Files with no price set print nothing, so you can
            price some and not others.
          </p>
        </fieldset>

        {draft.layout === "blocks" ? (
          <BlockEditor blocks={blocks} onChange={setBlocks} files={files} />
        ) : (
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

      {slug ? <ShareLink slug={slug} live={draft.status === "live"} /> : null}

      {slug ? (
        <>
          {/*
            * **These two reset themselves when `slug` changes — they are NOT
            * keyed, and that was tried first.**
            *
            * The bug is real and was measured: the `{slug ? … : …}` ternary
            * stays on the same branch when the operator changes the page select,
            * so React keeps both instances and every piece of their state
            * survives. `FileManager`'s `editing` is the dangerous one — open
            * page A, press Edit on a file, switch to page B, press Save changes,
            * and `saveFile`'s `slug = excluded.slug` moves that file from A to
            * B, silently, keeping A's position. Reproduced against a production
            * build: the form still read "Editing pull-back" over page B's files.
            *
            * `key={slug}` fixes the *logic* — React's tree comes out correct,
            * one instance, reset — but leaves the outgoing `<div>` behind in the
            * document, so the operator sees **two** file managers, the stale one
            * still offering to save. Verified in a production build by reading
            * the fiber tree: the fragment had exactly two children, both keyed
            * `second`, while two `.v-dledit-files` nodes were connected.
            *
            * So the reset is done the ordinary way instead, inside each child on
            * `[slug]`, which cannot produce a duplicate. `submit` also refuses a
            * file that is not on the current page — a guard no state confusion
            * can get past, because it is checked against the list being shown.
            */}
          <FileManager
            slug={slug}
            files={files}
            showPrices={draft.showPrices}
            onChanged={() => void openPage(slug)}
          />
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
 * The page's own address, to hand to somebody.
 *
 * **This is the screen's most-used control and it did not exist**: the whole
 * point of the feature is that the operator builds a page *while on the phone to
 * the person who wants it*, and the last step of that call is reading them a
 * link. Until now that meant retyping `/downloads/<slug>` from the hint text.
 *
 * **The QR is the version for somebody standing next to you.** It reuses
 * `QrCode`, which is already drawn from a hand-rolled encoder and gated against
 * the ISO worked example — so a customer at the bench points a phone at the
 * screen instead of typing an address into it. Collapsed by default, because it
 * is the second-most-likely thing to want and a 200px block above the file list
 * every time is not.
 *
 * **It says out loud when the page is a draft**, because the link works
 * perfectly for the operator — who is signed in — and 404s for the person they
 * just sent it to. That is the single easiest mistake to make here.
 */
function ShareLink({ slug, live }: { slug: string; live: boolean }) {
  const { say } = useConfig();
  const [showQr, setShowQr] = useState(false);

  /*
   * Built from the live origin rather than hardcoded, so it is right in
   * development, on a preview and in production without a build-time constant
   * that would be wrong in two of the three.
   */
  const url = `${window.location.origin}/downloads/${slug}`;

  return (
    <div className="v-dledit-share">
      <h3 className="v-field-label">The link</h3>

      <div className="v-share-row">
        <input className="v-input" value={url} readOnly aria-label="Link to this page" />
        <button
          type="button"
          className="v-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(
              () => say("Link copied."),
              () => say("Could not copy — select it and copy by hand."),
            );
          }}
        >
          Copy
        </button>
        <button type="button" className="v-btn v-btn-quiet" onClick={() => setShowQr((v) => !v)}>
          {showQr ? "Hide code" : "QR"}
        </button>
      </div>

      {live ? null : (
        <p className="v-dledit-unfinished">
          This page is a draft. The link works for you because you are signed in, and gives
          everybody else a "no such page". Publish it before you send it.
        </p>
      )}

      {showQr ? (
        <div className="v-dledit-qr">
          <QrCode value={url} size={180} label={`QR code for ${url}`} />
          <p className="v-field-hint">Point a phone at this instead of reading the address out.</p>
        </div>
      ) : null}
    </div>
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
            <button
              type="button"
              className="v-btn v-btn-quiet"
              aria-label={`Move block ${i + 1} up`}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="v-btn v-btn-quiet"
              aria-label={`Move block ${i + 1} down`}
              onClick={() => move(i, 1)}
            >
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

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

/** Everything about a file except its bytes, as the form holds it. */
interface FileDraft {
  id: string;
  name: string;
  blurb: string;
  platform: string;
  version: string;
  author: string;
  caveat: string;
  group: string;
  category: string;
  /** Dollars, as typed. Converted to whole cents on the way out — see `toCents`. */
  price: string;
  free: boolean;
}

const BLANK_FILE: FileDraft = {
  id: "",
  name: "",
  blurb: "",
  platform: "any",
  version: "",
  author: "",
  caveat: "",
  group: "",
  category: "other",
  price: "",
  free: false,
};

/**
 * Dollars as typed → whole cents, or `null` if that is not a price.
 *
 * **Rounded here and refused by the Worker**, which sounds like the same check
 * twice and is not. `12.10 * 100` is `1209.9999999999998` in binary floating
 * point, so the rounding is arithmetic that has to happen somewhere; the
 * Worker's refusal is about a request that did not come from this form. Blank is
 * a legitimate answer and means no price, which is not the same as free.
 */
function toCents(typed: string): number | null {
  const trimmed = typed.trim().replace(/^\$/, "");
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Whole cents → the dollars the form shows. Blank for "no price". */
function toDollars(cents: number | undefined): string {
  if (!cents) return "";
  return String(cents / 100);
}

/** The files on one page: their details, their bytes, their order, and codes. */
function FileManager({
  slug,
  files,
  showPrices,
  onChanged,
}: {
  slug: string;
  files: DownloadFileInfo[];
  showPrices: boolean;
  onChanged: () => void;
}) {
  const { say } = useConfig();
  const [form, setForm] = useState<FileDraft>(BLANK_FILE);
  /** The id being edited, or null when the form is adding something new. */
  const [editing, setEditing] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** A freshly minted per-file code, shown once. */
  const [fresh, setFresh] = useState<{ id: string; code: string } | null>(null);
  /*
   * Bumped on every reset, and used as the file input's `key`.
   *
   * An `<input type="file">` is uncontrolled — clearing React state leaves the
   * native control still showing the last filename, so after an upload the form
   * looked as though it still had a file in it and the button stayed enabled.
   * Remounting it is the only way to clear it.
   */
  const [pickerKey, setPickerKey] = useState(0);

  const patch = (p: Partial<FileDraft>) => setForm((f) => ({ ...f, ...p }));

  function reset() {
    setForm(BLANK_FILE);
    setEditing(null);
    setFile(null);
    setError(null);
    setPickerKey((k) => k + 1);
  }

  /*
   * **Everything in this form belongs to one page, so a page change empties it.**
   *
   * This component is not remounted when the operator picks a different page —
   * see the long note at the call site for why it is not keyed — so without this
   * the form kept `editing` pointing at a file on the page you just left. Saving
   * then moved that file onto the page now on screen, silently. The half-typed
   * fields go with it, which is right: they described a different page's file.
   */
  useEffect(() => {
    reset();
    setFresh(null);
    // `reset` is a stable local closure over setters only; `slug` is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /** Load an existing row into the form. The bytes are left alone unless replaced. */
  function edit(f: DownloadFileInfo) {
    setForm({
      id: f.id,
      name: f.name,
      blurb: f.blurb,
      platform: f.platform,
      version: f.version,
      author: f.author,
      caveat: f.caveat,
      group: f.group,
      category: categoryOf(f.category ?? "other").id,
      /*
       * `priceCents`, **never `price`**. The rendered price is zero for a free
       * file, so loading it here put a blank box in front of the operator and
       * the next save wrote that blank back — quietly destroying the figure this
       * form's own hint promises to keep. `?? f.price` covers a response from a
       * Worker deployed before the raw field existed.
       */
      price: toDollars(f.priceCents ?? f.price),
      free: f.free,
    });
    setEditing(f.id);
    setFile(null);
    setError(null);
    setPickerKey((k) => k + 1);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (progress !== null || busy) return;

    const priceCents = toCents(form.price);
    if (priceCents === null) {
      setError("That price isn't a number. Leave it blank for no price.");
      return;
    }
    // On a new file the bytes are the point; on an edit they are optional, and
    // that is the whole difference between the two paths.
    if (!editing && !file) {
      setError("Pick the file to upload.");
      return;
    }

    /*
     * **An edit may only touch a file that is on the page in front of us.**
     *
     * `saveFile` upserts on `id` and sets `slug = excluded.slug`, so a save
     * carrying a file from another page silently *moves* it there. The reset on
     * `[slug]` above should make that unreachable; this is the guard that does
     * not depend on it, because it is checked against the very list being
     * rendered rather than against any state that could have gone stale.
     */
    if (editing && !files.some((f) => f.id === editing)) {
      setError("That file isn't on this page any more. Open it from the page it's on.");
      return;
    }

    setError(null);
    setBusy(true);
    let uploadId = "";

    /** Everything except the bytes. `filename` only when there are new bytes. */
    const details = (filename?: string) =>
      api.adminFileSave({
        id: form.id,
        slug,
        name: form.name,
        blurb: form.blurb,
        platform: form.platform,
        version: form.version,
        /*
         * Sent only when there are new bytes. An absent filename tells the
         * Worker to keep the one the row already has — which is the only
         * correct answer, because the stored filename is deliberately not
         * published to this screen and the display name is a different string
         * entirely.
         */
        filename,
        free: form.free,
        author: form.author,
        caveat: form.caveat,
        group: form.group,
        category: form.category,
        priceCents,
      });

    /** The bytes, in parts. The row must already exist — `beginUpload` requires it. */
    const bytes = async (pick: File) => {
      setProgress(0);
      const begun = await api.adminUploadBegin(form.id, pick.type || "application/octet-stream");
      uploadId = begun.uploadId;

      const parts: { part: number; etag: string }[] = [];
      const total = Math.max(1, Math.ceil(pick.size / CHUNK));
      for (let i = 0; i < total; i += 1) {
        const chunk = pick.slice(i * CHUNK, Math.min(pick.size, (i + 1) * CHUNK));
        // Sequential on purpose. Parallel parts would be faster on a fat pipe
        // and this is a domestic upstream: three concurrent chunks would share
        // the same ceiling and each one would take three times as long to fail.
        parts.push(await uploadPart(form.id, uploadId, i + 1, chunk));
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      await api.adminUploadFinish(form.id, uploadId, parts);
      uploadId = "";
    };

    try {
      /*
       * **THE ORDER DIFFERS BETWEEN THE TWO PATHS, AND THAT IS THE POINT.**
       *
       * A new file must have its row written first, because `beginUpload`
       * refuses an id it cannot find — that ordering is what makes a half-
       * finished upload an invisible draft rather than a broken link.
       *
       * A *replacement* is the other way round. Writing the new filename first
       * and then failing to upload leaves the row pointing at the **old bytes
       * under the new name**, and `content-disposition` hands that name to the
       * browser verbatim — so a customer downloads `tool-v2.exe` and gets v1,
       * which is the one failure here nobody would ever notice. Uploading first
       * means the worst case is new bytes still carrying the old name: wrong,
       * but wrong in the direction that is obvious and harmless.
       */
      if (editing && file) {
        await bytes(file);
        await details(file.name);
      } else {
        await details(file ? file.name : undefined);
        if (file) await bytes(file);
      }

      say(editing ? `${form.name || form.id} updated.` : `${form.name || form.id} is up.`);
      reset();
      onChanged();
    } catch (thrown) {
      // An abandoned multipart upload holds storage until R2 expires it, so it
      // is told to stop rather than left. Best effort: the failure that got us
      // here may be the same one that stops this working.
      if (uploadId) await api.adminUploadAbort(form.id, uploadId).catch(() => undefined);
      setError(thrown instanceof ApiError ? thrown.message : "That didn't save.");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  /**
   * Picking a file fills in the blanks — **the blanks only.**
   *
   * This is the "upload portal" half of what was asked for. Typing an id in
   * kebab case, a name, and a platform for every file is the part of an upload
   * form that stops people using it, and all three are sitting in the filename.
   *
   * **Nothing already typed is ever overwritten**, which is what makes a guess
   * safe: at worst it saves nothing. `editing` is excluded outright — the id is
   * fixed there, and a *replacement* is by definition a file whose details the
   * operator has already written.
   */
  function pick(next: File | null) {
    setFile(next);
    if (!next || editing) return;

    const guess = suggestFromFilename(next.name);
    setForm((f) => ({
      ...f,
      id: f.id || guess.id,
      name: f.name || guess.name,
      // "any" is the untouched default, so it is the only platform a guess may
      // replace. An operator who chose "any" on purpose picked their file first.
      platform: f.platform === "any" && guess.platform ? guess.platform : f.platform,
    }));
  }

  /**
   * Move a file up or down the page's own order.
   *
   * This is what `sort = "manual"` renders, which is the default — so before
   * this control existed the operator's "my order" was whatever order things
   * were created in, with no way to change it.
   */
  async function move(from: number, by: number) {
    const to = from + by;
    if (to < 0 || to >= files.length || busy) return;
    const ids = files.map((f) => f.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setBusy(true);
    try {
      await api.adminFileOrder(slug, ids);
      onChanged();
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Couldn't reorder those.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Mint a code that opens exactly one file.
   *
   * `DownloadCodes` has always pointed here for this — *"mint it from that
   * file's row in the downloads editor"* — and until now there was no such
   * control anywhere, so the one documented route to a file-scoped code did not
   * exist. The Worker and the API had supported it the whole time.
   */
  async function mintFor(f: DownloadFileInfo) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.adminDownloadMint({
        label: `${f.name} — minted from the file`,
        item: f.id,
        slug: null,
        maxUses: 5,
        days: 0,
      });
      setFresh({ id: f.id, code: result.code });
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Couldn't mint a code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="v-dledit-files">
      <h3 className="v-panel-label">Files on this page</h3>

      {fresh ? (
        <div className="v-dlcodes-fresh" role="status">
          <p className="v-dlcodes-fresh-label">
            Opens {files.find((f) => f.id === fresh.id)?.name ?? fresh.id}, and nothing else. Five
            uses, no expiry. It will not be shown again.
          </p>
          <output className="v-dlcodes-fresh-code">{fresh.code}</output>
          <div className="v-dlcodes-fresh-actions">
            <button
              type="button"
              className="v-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(fresh.code).then(
                  () => say("Code copied."),
                  () => say("Could not copy — select it and copy by hand."),
                );
              }}
            >
              Copy
            </button>
            <button type="button" className="v-btn" onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <ul className="v-admin-list">
        {files.map((f, i) => (
          <li className={`v-admin-row${editing === f.id ? " is-editing" : ""}`} key={f.id}>
            <div className="v-dledit-file-who">
              <CategoryIcon category={f.category ?? "other"} />
              <div>
                <strong>{f.name}</strong>
                <span className="v-dledit-file-meta">
                  {" "}
                  {f.id} · {categoryOf(f.category ?? "other").label} · {formatSize(f.size)} ·{" "}
                  {f.free ? "free" : "needs a code"}
                  {showPrices && f.priceCents ? ` · ${formatPrice(f.priceCents)}` : ""}
                  {f.group ? ` · ${f.group}` : ""}
                </span>
                {/*
                  * An upload that never finished. Nobody but you can see this
                  * row, and that is deliberate — but until this line existed
                  * nothing said so, and a *replacement* that died halfway looked
                  * entirely normal here (same name, still printing the old
                  * file's size) while being invisible on the live page.
                  */}
                {f.uploaded === false ? (
                  <p className="v-dledit-unfinished">
                    Upload never finished — nobody else can see this. Press Edit, pick the file
                    again and save.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="v-admin-actions">
              <button
                type="button"
                className="v-btn v-btn-quiet"
                aria-label={`Move ${f.name} up`}
                disabled={busy || i === 0}
                onClick={() => void move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="v-btn v-btn-quiet"
                aria-label={`Move ${f.name} down`}
                disabled={busy || i === files.length - 1}
                onClick={() => void move(i, 1)}
              >
                ↓
              </button>
              <button type="button" className="v-btn" disabled={busy} onClick={() => edit(f)}>
                Edit
              </button>
              {f.free ? null : (
                <button
                  type="button"
                  className="v-btn v-btn-quiet"
                  disabled={busy}
                  onClick={() => void mintFor(f)}
                >
                  Code
                </button>
              )}
              <button
                type="button"
                className="v-btn v-btn-danger"
                disabled={busy}
                onClick={async () => {
                  await api.adminFileDelete(f.id).catch(() => undefined);
                  if (editing === f.id) reset();
                  onChanged();
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {files.length === 0 ? <li className="v-field-hint">No files on this page yet.</li> : null}
      </ul>

      <form className="v-dledit-form" onSubmit={submit}>
        <h4 className="v-field-label">
          {editing ? `Editing ${editing}` : "Add a file"}
          {editing ? (
            <button type="button" className="v-btn v-btn-quiet v-dledit-cancel" onClick={reset}>
              Cancel
            </button>
          ) : null}
        </h4>

        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-id">
              Id
            </label>
            <input
              id="v-dlf-id"
              className="v-input"
              value={form.id}
              disabled={editing !== null}
              onChange={(e) => patch({ id: e.target.value })}
              placeholder="boot-repair"
            />
            <p className="v-field-hint">
              {editing
                ? "Fixed. It is the download's address and links already handed out point here."
                : "Lowercase letters, numbers and hyphens. It is the download's address and cannot be changed once anyone has the link."}
            </p>
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-name">
              Name
            </label>
            <input
              id="v-dlf-name"
              className="v-input"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
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
            value={form.blurb}
            onChange={(e) => patch({ blurb: e.target.value })}
          />
          <p className="v-field-hint">
            One line, in plain words. This is the only thing most people will read before deciding
            whether to click.
          </p>
        </div>

        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-category">
              Kind of program
            </label>
            <select
              id="v-dlf-category"
              className="v-input"
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              {PICKABLE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="v-field-hint v-dledit-cathint">
              <CategoryIcon category={form.category} />
              <span>{categoryOf(form.category).hint}</span>
            </p>
          </div>

          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-platform">
              Runs on
            </label>
            <select
              id="v-dlf-platform"
              className="v-input"
              value={form.platform}
              onChange={(e) => patch({ platform: e.target.value })}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p as DownloadPlatform] ?? p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="v-dledit-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-version">
              Version
            </label>
            <input
              id="v-dlf-version"
              className="v-input"
              value={form.version}
              onChange={(e) => patch({ version: e.target.value })}
            />
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-price">
              Price
            </label>
            <input
              id="v-dlf-price"
              className="v-input"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => patch({ price: e.target.value })}
              placeholder="40"
            />
            <p className="v-field-hint">
              Dollars. Blank means no price shown — which is not the same as free. It only appears
              to visitors if "Show prices on this page" is ticked above.
              {form.free
                ? " This one is ticked free, so nobody will see a price on it — the figure is kept, and comes back if you untick it."
                : ""}
            </p>
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlf-group">
              Group
            </label>
            <input
              id="v-dlf-group"
              className="v-input"
              value={form.group}
              onChange={(e) => patch({ group: e.target.value })}
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
            value={form.author}
            onChange={(e) => patch({ author: e.target.value })}
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
            value={form.caveat}
            onChange={(e) => patch({ caveat: e.target.value })}
          />
        </div>

        <div className="v-field">
          <label className="v-check">
            <input
              type="checkbox"
              checked={form.free}
              onChange={(e) => patch({ free: e.target.checked })}
            />
            <span>Free — no code needed</span>
          </label>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlf-file">
            {editing ? "Replace the file (optional)" : "The file"}
          </label>
          <input
            key={pickerKey}
            id="v-dlf-file"
            className="v-input"
            type="file"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="v-field-hint">
              {file.name} · {formatSize(file.size)}
            </p>
          ) : editing ? (
            <p className="v-field-hint">
              Leave this empty to change only the details. Pick a file and it replaces the bytes,
              keeping the same link.
            </p>
          ) : null}
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

        <button
          type="submit"
          className="v-btn"
          disabled={busy || !form.id || progress !== null || (!editing && !file)}
        >
          {busy ? "Working…" : editing ? "Save changes" : "Add file"}
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

  /*
   * The milder half of the same problem as `FileManager`'s: `scope` held a file
   * id from the page the operator just left, while the `<select>` beside it had
   * no matching option. `addGrant` refuses that pairing outright — a file on
   * another page opens nothing — so it errored rather than corrupting anything,
   * but an error the operator did nothing to earn is still a bug.
   */
  useEffect(() => {
    setScope("");
    setError(null);
  }, [slug]);

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
