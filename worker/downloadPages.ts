/**
 * Operator-authored sub-pages for /downloads (2026-08-20, client request).
 *
 * The client asked to build and name pages themselves, lay them out, put files
 * on them, publish them live without a deploy, and control who can see each one
 * — down to individual accounts. `migrations/0006_download_pages.sql` explains
 * why that reverses the "catalogue is a TypeScript file" decision and why it was
 * cheap to reverse on the day it was asked for.
 *
 * FOUR THINGS HERE ARE LOAD-BEARING.
 *
 * 1. **`resolveAccess` is the only place that decides what a caller may see, and
 *    every read goes through it.** Listing, reading a page and serving bytes all
 *    ask the same function the same question, so a page cannot be listed to
 *    somebody who then cannot open it, and — much more important — a file cannot
 *    be *served* to somebody the page was hidden from. Two independent checks
 *    that agree today are two checks that disagree after the next change.
 *
 * 2. **Everything the operator types is validated on the way in, not on the way
 *    out.** The old catalogue was TypeScript, so `npm run check` could gate a
 *    malformed id at build time. This one is typed into a form by a person, and
 *    an id is an R2 object key and a URL — so the refusals that used to be a
 *    check are now a 400. Nothing downstream re-checks, which is only safe
 *    because nothing downstream *can* write.
 *
 * 3. **A page is HTML the site renders, never HTML the operator supplies.**
 *    Blocks are four kinds with no markup. Raw HTML in an admin box is an XSS
 *    hole the first time something is pasted in from a website, and it would let
 *    a page opt out of the palette system that keeps every surface recolouring
 *    together.
 *
 * 4. **An upload writes the row *before* the bytes and marks it usable
 *    *after*.** `uploaded_at` is null in between, and a page hides those rows —
 *    so an upload that dies halfway leaves an invisible draft rather than a link
 *    that 404s at the customer.
 */

import { json, noStore, requireAccount } from "./accounts";
import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { verify } from "./session";
import { BLOCK_KINDS, PAGE_LAYOUTS, PAGE_VISIBILITY, PLATFORMS } from "../src/data/downloads";

/*
 * The closed sets, imported from `src/data/downloads.ts` rather than declared
 * here. The renderer branches on the same arrays: two copies would let an
 * operator save a layout that silently renders as the default, which is the
 * class of bug this codebase keeps a rule about. Validated in TypeScript rather
 * than by a CHECK constraint so that adding a layout is a deploy and not a
 * migration.
 */

/**
 * An id is an R2 object key, a URL value and a string in somebody's bookmarks,
 * so it is checked the way the old catalogue's ids were checked by
 * `npm run check`: lowercase kebab only. The refusal moved from build time to
 * request time when the catalogue moved from TypeScript to D1; the rule did not.
 */
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Free text, bounded. Long enough for real prose, short enough not to be a store. */
const LIMITS = { title: 120, summary: 200, intro: 4000, notice: 1200, body: 4000, label: 120 };

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

async function body(request: Request): Promise<Record<string, unknown>> {
  return request.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
}

/** The caller, if they are a signed-in operator. Throws otherwise. */
async function operator(request: Request, env: Env) {
  const account = await requireAccount(request, env);
  if (account.is_operator !== 1) throw new BadRequest("Only the operator can do that.", 403);
  return account;
}

export interface PageRow {
  slug: string;
  title: string;
  summary: string;
  intro: string;
  notice: string;
  layout: string;
  visibility: string;
  status: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/**
 * What this caller is allowed to see, resolved once per request.
 *
 * Three independent routes in, and they are deliberately independent: the
 * operator (a session), a granted account (a session plus a row), and a code
 * (no account at all, which is the whole reason codes exist). A visitor may hold
 * none of them and still read every public page.
 */
interface Access {
  operator: boolean;
  accountId: string | null;
  /**
   * The grants this account holds, **as rows**.
   *
   * Deliberately not two sets of "pages" and "items". That was the first
   * version and it was a real hole: shredding `(slug, item)` pairs into
   * independent sets loses the pairing, and a `NULL` in either column became a
   * `"*"` that then attached itself to *every other row's* scope. An account
   * with a whole-page grant on a public page and a one-file grant on a private
   * one had the first row's wildcard satisfy the second row's item test, and so
   * could take every file on the private page. Found in review before it
   * shipped; the answer is to keep the rows and evaluate them pairwise.
   */
  grants: { slug: string | null; item: string | null }[];
  /** Pages a redeemed code opens **entirely** — the page and every file on it. */
  ticketPages: Set<string>;
  /**
   * Pages a redeemed code makes *readable* without opening their files.
   *
   * This is the other half of the same review finding. A code scoped to one file
   * has to open the page that file is on, or it is a code that works and appears
   * not to — the download button lives on the page. But "you may look at this
   * page" is not "you may have everything on it", and conflating the two meant a
   * customer who bought one program could fetch every other paid file on the
   * page by editing one query parameter. The file ids are in the page response
   * they legitimately received, so it was a bypass with no guessing in it.
   */
  ticketVisible: Set<string>;
  ticketItems: Set<string>;
}

/**
 * A ticket's subject, and the three things a code can open, prefixed so they can
 * never be confused:
 *
 * - `@slug` — the page and everything on it (a page-scoped or unscoped code).
 * - `~slug` — the page may be *read*, nothing more (the page a file-scoped code's
 *   file happens to live on).
 * - a bare string — one file.
 *
 * `claim` writes it and `resolveAccess` reads it, and they are the only two. The
 * prefixes are safe because `KEY` refuses anything but lowercase-kebab, so no
 * slug or id can contain `@`, `~` or a comma.
 */
export function ticketSubject(open: string[], visible: string[], items: string[]): string {
  return [...open.map((p) => `@${p}`), ...visible.map((p) => `~${p}`), ...items].join(",");
}

export async function resolveAccess(request: Request, env: Env, url: URL): Promise<Access> {
  const access: Access = {
    operator: false,
    accountId: null,
    grants: [],
    ticketPages: new Set(),
    ticketVisible: new Set(),
    ticketItems: new Set(),
  };

  /*
   * The session is optional here and that is the point: this route serves people
   * with no account, so a missing or expired cookie is an ordinary state and not
   * an error. `requireAccount` throws, so it is caught rather than awaited
   * bare — a signed-out visitor asking for a public page must not get a 401.
   */
  const account = await requireAccount(request, env).catch(() => null);
  if (account) {
    access.accountId = account.id;
    access.operator = account.is_operator === 1;
    const { results } = await env.DB.prepare(
      `SELECT slug, item_id FROM download_grants
        WHERE account_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
    )
      .bind(account.id, Date.now())
      .all<{ slug: string | null; item_id: string | null }>();
    access.grants = results.map((g) => ({ slug: g.slug, item: g.item_id }));
  }

  const ticket = url.searchParams.get("t") ?? "";
  if (ticket) {
    const token = await verify(env.SESSION_SECRET, "download", ticket);
    if (token) {
      for (const part of token.subject.split(",").filter(Boolean)) {
        if (part.startsWith("@")) access.ticketPages.add(part.slice(1));
        else if (part.startsWith("~")) access.ticketVisible.add(part.slice(1));
        else access.ticketItems.add(part);
      }
    }
  }

  return access;
}

/**
 * Does any grant reach this page? A null `slug` is the operator saying "the
 * lot", and it is read **per row** — a wildcard belongs to the row it is in and
 * to no other.
 */
function granted(access: Access, slug: string): boolean {
  return access.grants.some((g) => g.slug === null || g.slug === slug);
}

/**
 * Does any *single* grant reach this exact file? Both halves of one row, which
 * is the whole point: a row saying "everything on page A" must not lend its
 * wildcard to a row saying "one file on page B".
 */
function grantedFile(access: Access, slug: string, itemId: string): boolean {
  return access.grants.some(
    (g) => (g.slug === null || g.slug === slug) && (g.item === null || g.item === itemId),
  );
}

/**
 * May this caller open the page at all?
 *
 * A draft is the operator's alone — that is what makes "build it in the open,
 * publish when ready" safe. Everything else follows the page's own setting, and
 * `unlisted` is deliberately *readable*: the secret is the address, which is the
 * only thing it ever claimed to be.
 */
export function canRead(page: PageRow, access: Access): boolean {
  if (access.operator) return true;
  if (page.status !== "live") return false;
  switch (page.visibility) {
    case "public":
    case "unlisted":
      return true;
    case "code":
      // Either kind of ticket entry gets you *through the door*: a code for one
      // file has to open the page the file is on. What it does not get you is
      // the other files — see `canDownload`.
      return (
        access.ticketPages.has(page.slug) ||
        access.ticketVisible.has(page.slug) ||
        granted(access, page.slug)
      );
    case "granted":
      return granted(access, page.slug);
    default:
      // An unknown visibility is a page that has been edited by something that
      // is not this Worker. Refuse rather than guess — the failure of a hidden
      // page becoming public is much worse than the reverse.
      return false;
  }
}

/** Does it appear in the list on /downloads, given it can be read at all? */
function canList(page: PageRow, access: Access): boolean {
  if (page.visibility === "unlisted" && !access.operator) return false;
  return canRead(page, access);
}

export interface FileRow {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  platform: string;
  version: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  free: number;
  author: string;
  caveat: string;
  group_name: string;
  position: number;
  uploaded_at: number | null;
}

/**
 * May this caller have the *bytes*?
 *
 * Note what this does **not** do: it never asks whether the page is listed, only
 * whether it can be read. And it is the same `canRead` the page render used, so
 * a file cannot be reachable through a page that was hidden from the caller —
 * which is the single most valuable line in this module.
 */
export function canDownload(page: PageRow, item: FileRow, access: Access): boolean {
  if (!canRead(page, access)) return false;
  if (access.operator) return true;
  if (item.uploaded_at === null) return false;
  if (item.free === 1) return true;
  if (access.ticketItems.has(item.id)) return true;
  /*
   * `ticketPages` only — **never `ticketVisible`**. A code minted for one file
   * puts that file's page in `ticketVisible` so the page renders, and if this
   * line read that set too, one purchase would open every paid file on the page
   * by editing a query parameter. The ids are in the page response the customer
   * legitimately receives, so there would be nothing to guess.
   */
  if (access.ticketPages.has(page.slug)) return true;
  if (grantedFile(access, page.slug, item.id)) return true;
  return false;
}

/** Everything a page needs to render, minus anything the caller may not have. */
function shapeFile(f: FileRow, unlocked: boolean) {
  return {
    id: f.id,
    name: f.name,
    blurb: f.blurb,
    platform: f.platform,
    version: f.version,
    size: f.size_bytes,
    free: f.free === 1,
    author: f.author,
    caveat: f.caveat,
    group: f.group_name,
    // Whether *this* caller can take it right now, so the page can say "locked"
    // without the client re-deriving a rule the server already applied.
    unlocked,
  };
}

/* -------------------------------------------------------------------------- */
/* Public reads                                                                */
/* -------------------------------------------------------------------------- */

export async function listPages(request: Request, env: Env, url: URL): Promise<Response> {
  const access = await resolveAccess(request, env, url);
  const { results } = await env.DB.prepare(
    `SELECT * FROM download_pages ORDER BY position, created_at`,
  ).all<PageRow>();

  const pages = results.filter((p) => canList(p, access)).map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    layout: p.layout,
    visibility: p.visibility,
    status: p.status,
    locked: !canRead(p, access) || p.visibility === "code" || p.visibility === "granted",
  }));

  return noStore(json({ pages }));
}

export async function readPage(request: Request, env: Env, url: URL): Promise<Response> {
  const slug = url.searchParams.get("page") ?? "";
  const access = await resolveAccess(request, env, url);

  const page = await env.DB.prepare("SELECT * FROM download_pages WHERE slug = ?")
    .bind(slug)
    .first<PageRow>();
  /*
   * A page the caller may not read is **404, not 403**, and only for the two
   * hidden visibilities. `code` says out loud that a code opens it, because a
   * customer holding one has to be told where to type it; `granted` and a draft
   * say nothing at all, because the existence of a page named after a client is
   * itself the thing being kept quiet.
   */
  if (!page) throw new BadRequest("No such page.", 404);
  if (!canRead(page, access)) {
    if (page.visibility === "code" && page.status === "live") {
      return noStore(
        json({
          page: { slug: page.slug, title: page.title, summary: page.summary, layout: page.layout },
          locked: true,
        }),
      );
    }
    throw new BadRequest("No such page.", 404);
  }

  const [blocks, files] = await Promise.all([
    env.DB.prepare("SELECT kind, body, group_name FROM download_blocks WHERE slug = ? ORDER BY position")
      .bind(slug)
      .all<{ kind: string; body: string; group_name: string }>(),
    env.DB.prepare("SELECT * FROM download_files WHERE slug = ? ORDER BY position, created_at")
      .bind(slug)
      .all<FileRow>(),
  ]);

  return noStore(
    json({
      page: {
        slug: page.slug,
        title: page.title,
        summary: page.summary,
        intro: page.intro,
        notice: page.notice,
        layout: page.layout,
        visibility: page.visibility,
        status: page.status,
      },
      locked: false,
      blocks: blocks.results.map((b) => ({ kind: b.kind, body: b.body, group: b.group_name })),
      // A file whose bytes never arrived is not offered to anybody but the
      // operator, who is the one who has to notice and finish it.
      files: files.results
        .filter((f) => f.uploaded_at !== null || access.operator)
        .map((f) => shapeFile(f, canDownload(page, f, access))),
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Operator: pages                                                             */
/* -------------------------------------------------------------------------- */

export async function savePage(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);

  const slug = str(b.slug, 64).toLowerCase();
  if (!KEY.test(slug)) {
    throw new BadRequest("A page address is lowercase letters, numbers and hyphens.");
  }
  const title = str(b.title, LIMITS.title);
  if (!title) throw new BadRequest("A page needs a title.");

  const layout = PAGE_LAYOUTS.includes(b.layout as never) ? (b.layout as string) : "list";
  const visibility = PAGE_VISIBILITY.includes(b.visibility as never)
    ? (b.visibility as string)
    : "public";
  const status = b.status === "live" ? "live" : "draft";
  const now = Date.now();

  /*
   * One statement, insert-or-update, and `created_at` is preserved by the
   * conflict clause rather than re-read first. Two round trips to D1 to keep one
   * timestamp is two chances for the second one to lose a race with the admin
   * screen's own autosave.
   */
  await env.DB.prepare(
    `INSERT INTO download_pages
       (slug, title, summary, intro, notice, layout, visibility, status, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT position FROM download_pages WHERE slug = ?),
             (SELECT COALESCE(MAX(position), 0) + 1 FROM download_pages)), ?, ?)
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, summary = excluded.summary, intro = excluded.intro,
       notice = excluded.notice, layout = excluded.layout, visibility = excluded.visibility,
       status = excluded.status, updated_at = excluded.updated_at`,
  )
    .bind(
      slug,
      title,
      str(b.summary, LIMITS.summary),
      str(b.intro, LIMITS.intro),
      str(b.notice, LIMITS.notice),
      layout,
      visibility,
      status,
      slug,
      now,
      now,
    )
    .run();

  return noStore(json({ ok: true, slug }));
}

/**
 * Delete a page, its blocks, its files' rows **and its files' bytes**.
 *
 * The bytes go last and failures there are swallowed deliberately: an object
 * that outlives its row costs storage and nothing else, whereas a row that
 * outlives a failed delete is a page offering a file that is gone. Given one has
 * to win, it is the database.
 */
export async function deletePage(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const slug = str(b.slug, 64);

  const { results } = await env.DB.prepare("SELECT id FROM download_files WHERE slug = ?")
    .bind(slug)
    .all<{ id: string }>();

  const gone = await env.DB.prepare("DELETE FROM download_pages WHERE slug = ?").bind(slug).run();
  if (!gone.meta.changes) throw new BadRequest("No such page.", 404);
  // The blocks and files cascade; grants naming this page do not, because a
  // grant is a statement about a person and outliving its page is harmless.
  await env.DB.prepare("DELETE FROM download_grants WHERE slug = ?").bind(slug).run();

  for (const f of results) await env.DOWNLOADS.delete(f.id).catch(() => {});
  return noStore(json({ ok: true }));
}

/** The whole order, rewritten. A dozen rows does not need anything cleverer. */
export async function reorderPages(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const order = Array.isArray(b.slugs) ? b.slugs.filter((s): s is string => typeof s === "string") : [];
  if (!order.length) throw new BadRequest("Nothing to reorder.");

  await env.DB.batch(
    order.map((slug, i) =>
      env.DB.prepare("UPDATE download_pages SET position = ? WHERE slug = ?").bind(i, slug),
    ),
  );
  return noStore(json({ ok: true }));
}

/** Blocks are replaced wholesale — the editor owns the whole list. */
export async function saveBlocks(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const slug = str(b.slug, 64);
  const page = await env.DB.prepare("SELECT slug FROM download_pages WHERE slug = ?")
    .bind(slug)
    .first<{ slug: string }>();
  if (!page) throw new BadRequest("No such page.", 404);

  const raw = Array.isArray(b.blocks) ? b.blocks : [];
  // A hard cap, because this is a page and not a document store.
  const blocks = raw.slice(0, 40).map((x) => x as Record<string, unknown>);

  const statements = [env.DB.prepare("DELETE FROM download_blocks WHERE slug = ?").bind(slug)];
  blocks.forEach((blk, i) => {
    const kind = BLOCK_KINDS.includes(blk.kind as never) ? (blk.kind as string) : "text";
    statements.push(
      env.DB.prepare(
        "INSERT INTO download_blocks (slug, position, kind, body, group_name) VALUES (?, ?, ?, ?, ?)",
      ).bind(slug, i, kind, str(blk.body, LIMITS.body), str(blk.group, 64)),
    );
  });
  await env.DB.batch(statements);

  return noStore(json({ ok: true, blocks: blocks.length }));
}

/* -------------------------------------------------------------------------- */
/* Operator: files and their bytes                                             */
/* -------------------------------------------------------------------------- */

/**
 * Everything about a file except the bytes. Called to create a row before an
 * upload and to edit one afterwards, which is why it never touches
 * `uploaded_at`: that field belongs to the upload alone.
 */
export async function saveFile(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);

  const id = str(b.id, 64).toLowerCase();
  if (!KEY.test(id)) throw new BadRequest("A file id is lowercase letters, numbers and hyphens.");
  const slug = str(b.slug, 64);
  const page = await env.DB.prepare("SELECT slug FROM download_pages WHERE slug = ?")
    .bind(slug)
    .first<{ slug: string }>();
  if (!page) throw new BadRequest("No such page.", 404);

  const filename = str(b.filename, 160);
  /*
   * The filename is handed to `content-disposition` verbatim, so it decides what
   * the visitor's computer calls the thing and whether it opens. A name with no
   * extension arrives as a file Windows does not know how to run, and the
   * operator finds out from a customer — which is exactly the failure the old
   * build-time check existed to prevent, moved to the only place it can now live.
   */
  if (!/\.[A-Za-z0-9]{1,12}$/.test(filename)) {
    throw new BadRequest("The filename needs an extension — that is what makes it open.");
  }
  if (/["\\/\r\n]/.test(filename)) throw new BadRequest("That filename has characters it cannot have.");

  const name = str(b.name, LIMITS.title) || filename;
  const platform = PLATFORMS.includes(b.platform as never) ? (b.platform as string) : "any";
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO download_files
       (id, slug, name, blurb, platform, version, filename, free, author, caveat, group_name,
        position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT position FROM download_files WHERE id = ?),
                      (SELECT COALESCE(MAX(position), 0) + 1 FROM download_files WHERE slug = ?)), ?)
     ON CONFLICT (id) DO UPDATE SET
       slug = excluded.slug, name = excluded.name, blurb = excluded.blurb,
       platform = excluded.platform, version = excluded.version, filename = excluded.filename,
       free = excluded.free, author = excluded.author, caveat = excluded.caveat,
       group_name = excluded.group_name`,
  )
    .bind(
      id,
      slug,
      name,
      str(b.blurb, LIMITS.summary),
      platform,
      str(b.version, 40),
      filename,
      b.free === true ? 1 : 0,
      str(b.author, LIMITS.title),
      str(b.caveat, LIMITS.summary),
      str(b.group, 64),
      id,
      slug,
      now,
    )
    .run();

  return noStore(json({ ok: true, id }));
}

export async function deleteFile(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const id = str(b.id, 64);

  const gone = await env.DB.prepare("DELETE FROM download_files WHERE id = ?").bind(id).run();
  if (!gone.meta.changes) throw new BadRequest("No such file.", 404);
  await env.DB.prepare("DELETE FROM download_grants WHERE item_id = ?").bind(id).run();
  await env.DOWNLOADS.delete(id).catch(() => {});
  return noStore(json({ ok: true }));
}

/**
 * ---- the upload ----------------------------------------------------------
 *
 * R2 multipart, driven from the browser, and multipart **even for a small
 * file**. A single PUT would be less code and would carry a ceiling: a Worker
 * request body is capped, and the whole point of this feature is the operator
 * putting up their own programs without touching a terminal. One path that
 * always works beats two paths where the second one is discovered by a 413 on
 * the day a file gets big.
 *
 * The row is written by `saveFile` first and `uploaded_at` is set only by
 * `finishUpload`, so a browser that closes mid-upload leaves a row the page
 * hides and the admin screen shows as unfinished.
 */
export async function beginUpload(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const id = str(b.id, 64);
  const row = await env.DB.prepare("SELECT id, content_type FROM download_files WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw new BadRequest("Save the file's details first.", 404);

  const contentType = str(b.contentType, 120) || "application/octet-stream";
  const upload = await env.DOWNLOADS.createMultipartUpload(id, {
    httpMetadata: { contentType },
  });
  await env.DB.prepare("UPDATE download_files SET content_type = ?, uploaded_at = NULL WHERE id = ?")
    .bind(contentType, id)
    .run();

  return noStore(json({ uploadId: upload.uploadId }));
}

/**
 * One part. The body is raw bytes rather than JSON or a form, so nothing has to
 * base64 an 8MB chunk — which would cost a third more bandwidth on exactly the
 * connections this whole feature is for.
 */
export async function uploadPart(request: Request, env: Env, url: URL): Promise<Response> {
  await operator(request, env);
  const id = url.searchParams.get("id") ?? "";
  const uploadId = url.searchParams.get("upload") ?? "";
  const part = Number(url.searchParams.get("part") ?? "0");
  if (!id || !uploadId || !Number.isInteger(part) || part < 1) throw new BadRequest("Bad part.");

  const upload = env.DOWNLOADS.resumeMultipartUpload(id, uploadId);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new BadRequest("Empty part.");
  const uploaded = await upload.uploadPart(part, bytes);
  return noStore(json({ part: uploaded.partNumber, etag: uploaded.etag }));
}

export async function finishUpload(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const id = str(b.id, 64);
  const uploadId = str(b.uploadId, 200);
  const parts = Array.isArray(b.parts) ? b.parts : [];
  if (!id || !uploadId || !parts.length) throw new BadRequest("Nothing to finish.");

  const upload = env.DOWNLOADS.resumeMultipartUpload(id, uploadId);
  await upload.complete(
    parts.map((p) => {
      const x = p as { part?: number; etag?: string };
      return { partNumber: Number(x.part), etag: String(x.etag) };
    }),
  );

  /*
   * The size comes from R2 rather than from the browser, and that is not
   * pedantry: it is the number the page prints next to a download on a
   * connection where the difference between 4MB and 400MB decides whether
   * somebody starts. A client-reported size is a number nobody checked.
   */
  const head = await env.DOWNLOADS.head(id);
  await env.DB.prepare("UPDATE download_files SET size_bytes = ?, uploaded_at = ? WHERE id = ?")
    .bind(head?.size ?? 0, Date.now(), id)
    .run();

  return noStore(json({ ok: true, size: head?.size ?? 0 }));
}

export async function abortUpload(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const id = str(b.id, 64);
  const uploadId = str(b.uploadId, 200);
  if (id && uploadId) {
    await env.DOWNLOADS.resumeMultipartUpload(id, uploadId).abort().catch(() => {});
  }
  return noStore(json({ ok: true }));
}

/* -------------------------------------------------------------------------- */
/* Operator: per-account grants                                                */
/* -------------------------------------------------------------------------- */

export async function listGrants(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.account_id, a.handle, g.slug, g.item_id, g.label, g.created_at, g.expires_at
       FROM download_grants g JOIN accounts a ON a.id = g.account_id
      ORDER BY g.created_at DESC LIMIT 200`,
  ).all();
  return noStore(json({ grants: results }));
}

export async function addGrant(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);

  const handle = str(b.handle, 64).toLowerCase();
  const account = await env.DB.prepare("SELECT id FROM accounts WHERE handle = ?")
    .bind(handle)
    .first<{ id: string }>();
  if (!account) throw new BadRequest("No account with that name.", 404);

  const slug = str(b.slug, 64) || null;
  const itemId = str(b.item, 64) || null;
  const days = Number.isInteger(b.days) ? Math.min(3650, Math.max(0, b.days as number)) : 0;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO download_grants (account_id, slug, item_id, label, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(account.id, slug, itemId, str(b.label, LIMITS.label), now, days ? now + days * 86_400_000 : null)
    .run();

  return noStore(json({ ok: true }));
}

export async function removeGrant(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const id = Number(b.id);
  if (!Number.isInteger(id)) throw new BadRequest("Which grant?");
  const gone = await env.DB.prepare("DELETE FROM download_grants WHERE id = ?").bind(id).run();
  if (!gone.meta.changes) throw new BadRequest("That grant is already gone.", 404);
  return noStore(json({ ok: true }));
}
