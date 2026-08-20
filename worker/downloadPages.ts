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
import {
  BLOCK_KINDS,
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  FILE_SORTS,
  PAGE_LAYOUTS,
  PAGE_VISIBILITY,
  PLATFORMS,
} from "../src/data/downloads";

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
  /** How the files come out before a visitor touches anything (0007). */
  sort: string;
  show_filters: number;
  show_prices: number;
  show_icons: number;
}

/**
 * The presentation switches a page carries, resolved once and shaped the same
 * way for the renderer and for the editor.
 *
 * They travel together because they are one decision — *how this page presents
 * its files* — and splitting them across the response would let the editor and
 * the page drift into disagreeing about which are set.
 */
function shapePage(page: PageRow) {
  return {
    sort: FILE_SORTS.includes(page.sort as never) ? page.sort : "manual",
    showFilters: page.show_filters === 1,
    showPrices: page.show_prices === 1,
    showIcons: page.show_icons === 1,
  };
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

/**
 * Does it appear in the list on /downloads?
 *
 * **A `code` page is listed even to somebody who cannot open it, and that is the
 * asymmetry the whole visibility scheme turns on** (fixed 2026-08-20). `unlisted`
 * hides, `granted` and a draft 404, and `code` *says it exists* — because
 * somebody holding a code has to be told where to type it, whereas the existence
 * of a page named after a customer is itself the thing being kept quiet.
 * `readPage` has always honoured that and answered a locked stub; this function
 * did not, so a code-gated page was missing from the index entirely and the only
 * way to reach it was a direct link. That made `code` a second `unlisted` with a
 * lock on it, and the tell was in `listPages`: its `locked` line tested
 * `!canRead(...)`, a branch nothing that got past here could ever satisfy.
 */
function canList(page: PageRow, access: Access): boolean {
  if (access.operator) return true;
  if (page.visibility === "unlisted") return false;
  if (page.visibility === "code") return page.status === "live";
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
  created_at: number;
  uploaded_at: number | null;
  /** Which kind of program this is, and what it costs (0007). */
  category: string;
  price_cents: number;
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

/**
 * Everything a page needs to render, minus anything the caller may not have.
 *
 * **The price is sent whatever the page's `showPrices` setting says, and the
 * renderer is what withholds it.** That is the opposite of how the gates on this
 * module work and it is deliberate: a price is not a secret. It is a figure the
 * operator would say out loud on the telephone, and stripping it here would mean
 * the sort-by-price the same response enables could not agree with itself. The
 * rule this module actually enforces — nothing the caller may not *have* — is
 * about bytes, and it is `unlocked` that carries it.
 */
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
    category: CATEGORY_IDS.includes(f.category) ? f.category : DEFAULT_CATEGORY,
    /*
     * **A free file has no price, whatever is stored against it.**
     *
     * The two fields are independent in the table on purpose — `free` is the
     * gate and `price_cents` is a figure — so the operator can price something,
     * give it away for a while, and put the price back by unticking one box.
     * But to a visitor "free" and "$12.50" on the same row is a contradiction,
     * and the row also carries a Download button, so the price is the half that
     * is untrue.
     *
     * Resolved **here** rather than in the renderer, because the same response
     * feeds the sort: hiding it in `FileRow` alone would leave a free file
     * sorting among the paid ones by a figure the page never showed. One place
     * decides, and the render and the order cannot disagree.
     */
    price: f.free === 1 ? 0 : f.price_cents,
    /*
     * The stored figure, unresolved — **and the editor must read this one.**
     *
     * `price` above is the *rendered* price and is zeroed for a free file. The
     * editor loads its form from this same public response, so without a raw
     * field it read the zero, put an empty box in front of the operator, and
     * wrote that emptiness back on the next save: ticking "free", saving, then
     * later fixing a typo in the blurb silently destroyed the price. The form's
     * own hint promised the exact opposite — that the figure is kept and comes
     * back when free is unticked — so the interface was lying in the one
     * direction that costs money.
     *
     * Safe to publish for the same reason `price` is: a price is not a secret,
     * it is a figure the operator would say out loud on the telephone. What is
     * withheld from a caller is bytes, and `unlocked` carries that.
     */
    priceCents: f.price_cents,
    // The day rather than the moment, and coarse on purpose: "newest first" only
    // needs an order, and a precise upload time on a public response is a fact
    // about the operator's working hours that nobody asked to publish.
    added: Math.floor((f.created_at ?? 0) / 86_400_000) * 86_400_000,
    /*
     * Whether the bytes are actually in the bucket.
     *
     * `readPage` hides an unfinished row from everybody but the operator, and
     * this is what lets the operator's own screen *say so*. Without it a
     * replacement upload that died halfway looked completely normal in the
     * editor — same name, and `size` still printing the old file's size — while
     * being invisible to every visitor. A comment in `beginUpload` claimed the
     * admin screen showed it; it could not, because nothing sent it.
     */
    uploaded: f.uploaded_at !== null,
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
  /*
   * The file count comes back with the page, as a correlated subquery rather
   * than a second round trip: the index renders a card per page and "how much is
   * on this" is the one fact a card can carry that the title does not already
   * say. Counting only rows whose bytes arrived, because an unfinished upload is
   * not something anybody but the operator can have — a card promising four
   * files that opens onto three is worse than a card promising nothing.
   */
  const { results } = await env.DB.prepare(
    `SELECT p.*,
            (SELECT COUNT(*) FROM download_files f
              WHERE f.slug = p.slug AND f.uploaded_at IS NOT NULL) AS file_count
       FROM download_pages p
      ORDER BY p.position, p.created_at`,
  ).all<PageRow & { file_count: number }>();

  /*
   * `locked` is "you cannot walk straight in", asked of this caller rather than
   * of the page — so a page the operator has granted you reads as open, and the
   * same page reads as locked to a stranger. It drives the accent edge on the
   * index card and nothing else; every real decision is `canRead`/`canDownload`.
   */
  const pages = results.filter((p) => canList(p, access)).map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    layout: p.layout,
    visibility: p.visibility,
    status: p.status,
    files: p.file_count ?? 0,
    locked: !canRead(p, access),
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
          page: {
            slug: page.slug,
            title: page.title,
            summary: page.summary,
            layout: page.layout,
            ...shapePage(page),
          },
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
        ...shapePage(page),
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

  /*
   * The presentation switches (0007). Each one falls back to the behaviour the
   * page had before this existed, so an older client that does not send them —
   * or a field that arrives as something other than a boolean — leaves the page
   * looking exactly as it did. `sort` falls to `manual`, which is the operator's
   * own hand order.
   */
  const sort = FILE_SORTS.includes(b.sort as never) ? (b.sort as string) : "manual";
  const showFilters = b.showFilters === true ? 1 : 0;
  const showPrices = b.showPrices === true ? 1 : 0;
  // The only one whose default is on, so absent must decode to 1 — the same
  // shape as the `entrances` share-code bit, and for the same reason.
  const showIcons = b.showIcons === false ? 0 : 1;

  const now = Date.now();

  /*
   * One statement, insert-or-update, and `created_at` is preserved by the
   * conflict clause rather than re-read first. Two round trips to D1 to keep one
   * timestamp is two chances for the second one to lose a race with the admin
   * screen's own autosave.
   */
  await env.DB.prepare(
    `INSERT INTO download_pages
       (slug, title, summary, intro, notice, layout, visibility, status, sort,
        show_filters, show_prices, show_icons, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT position FROM download_pages WHERE slug = ?),
             (SELECT COALESCE(MAX(position), 0) + 1 FROM download_pages)), ?, ?)
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, summary = excluded.summary, intro = excluded.intro,
       notice = excluded.notice, layout = excluded.layout, visibility = excluded.visibility,
       status = excluded.status, sort = excluded.sort, show_filters = excluded.show_filters,
       show_prices = excluded.show_prices, show_icons = excluded.show_icons,
       updated_at = excluded.updated_at`,
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
      sort,
      showFilters,
      showPrices,
      showIcons,
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

  /*
   * **The codes go too, and this is the half that is not housekeeping.**
   *
   * `download_codes.slug` carries no foreign key and no cascade, and a slug is a
   * re-usable `TEXT PRIMARY KEY`. So deleting `acme` and later creating a new
   * page at the same address — for a different customer — handed every code ever
   * minted for the old one the new one's page and every paid file on it, because
   * `canRead` and `canDownload` both key on the slug. Deleting a page is the
   * only "withdraw" control this feature has, so it has to mean it.
   *
   * Codes scoped to this page's *files* are left alone deliberately: those rows
   * name an `item_id` whose file has just cascaded away, and `opened` already
   * resolves a missing file to "opens nothing" — the id is not re-usable the way
   * a slug is, because `saveFile` would have to be given the same id by hand.
   */
  await env.DB.prepare("DELETE FROM download_codes WHERE slug = ?").bind(slug).run();

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

/**
 * The files on one page, reordered.
 *
 * Scoped to a slug and not merely to a list of ids: `position` is per page, so a
 * request naming ids from two pages would interleave two orders into one
 * sequence and quietly reshuffle a page the operator was not looking at. The
 * `WHERE slug = ?` is what makes that unrepresentable rather than merely
 * unlikely, and it costs nothing.
 *
 * This is the order `sort = 'manual'` renders, which is the default — so without
 * it the operator's "my order" was whatever order the rows happened to be
 * created in, with no way to change it. `reorderPages` had the same shape and
 * the same gap on the index; both have a control now.
 */
export async function reorderFiles(request: Request, env: Env): Promise<Response> {
  await operator(request, env);
  const b = await body(request);
  const slug = str(b.slug, 64);
  const order = Array.isArray(b.ids) ? b.ids.filter((s): s is string => typeof s === "string") : [];
  if (!slug || !order.length) throw new BadRequest("Nothing to reorder.");

  await env.DB.batch(
    order.map((id, i) =>
      env.DB.prepare("UPDATE download_files SET position = ? WHERE id = ? AND slug = ?").bind(i, id, slug),
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

  /*
   * The filename, and **an absent one means "keep the one this row has"**.
   *
   * That distinction is what makes an edit possible without a re-upload
   * (2026-08-20). The editor sends a filename only when the operator has picked
   * actual bytes; changing a blurb sends none, and the row keeps the name its
   * bytes were uploaded under. Without this the screen would have to know the
   * stored filename to send it back — and `shapeFile` deliberately does not
   * publish it, so the only value the form had to hand was the *display* name,
   * which would have silently renamed every download it touched.
   *
   * A row that does not exist yet has nothing to keep, so there it is required.
   */
  const existing = await env.DB.prepare("SELECT filename FROM download_files WHERE id = ?")
    .bind(id)
    .first<{ filename: string }>();
  const supplied = str(b.filename, 160);
  const filename = supplied || existing?.filename || "";
  if (!filename) throw new BadRequest("A new file needs the file itself.");

  /*
   * The filename is handed to `content-disposition` verbatim, so it decides what
   * the visitor's computer calls the thing and whether it opens. A name with no
   * extension arrives as a file Windows does not know how to run, and the
   * operator finds out from a customer — which is exactly the failure the old
   * build-time check existed to prevent, moved to the only place it can now live.
   *
   * Re-checked even when it came from the row rather than the request: a value
   * stored by an earlier, laxer version of this function is exactly the one
   * nobody would think to re-validate.
   */
  if (!/\.[A-Za-z0-9]{1,12}$/.test(filename)) {
    throw new BadRequest("The filename needs an extension — that is what makes it open.");
  }
  /*
   * **Control characters are refused; accented letters are not.**
   *
   * This guard was `/["\\/\r\n]/`, which let a NUL, a stray control character
   * and any non-Latin-1 letter straight through — and every one of those makes
   * the *download* throw rather than the save. `headers.set` performs a WebIDL
   * `ByteString` conversion, so `filename="日本語.exe"` raises
   * `TypeError: … greater than 255` and a NUL raises "invalid header value", in
   * `file()`, on every click, for ever. The operator saves happily, the row
   * lists normally with a working button, and a customer finds out.
   *
   * Unicode is *allowed* rather than refused, because `Réparation.exe` is a
   * perfectly ordinary name for this operator's files and refusing it would be
   * solving the wrong half. `file()` encodes it properly on the way out
   * (RFC 5987), which is what should have been happening all along.
   */
  // eslint-disable-next-line no-control-regex
  if (/["\\/\u0000-\u001F\u007F]/.test(filename)) {
    throw new BadRequest("That filename has characters it cannot have.");
  }

  const name = str(b.name, LIMITS.title) || filename;
  const platform = PLATFORMS.includes(b.platform as never) ? (b.platform as string) : "any";
  /*
   * An unknown category resolves to the default rather than being refused. It is
   * a label on a shelf, not a wire format anybody's link depends on, and a row
   * written by a newer deploy should keep working against an older one — the
   * same reasoning the `FX` fallback uses, applied to something much less
   * consequential.
   */
  const category = CATEGORY_IDS.includes(str(b.category, 40)) ? str(b.category, 40) : DEFAULT_CATEGORY;
  /*
   * The price, in whole cents.
   *
   * Refused rather than clamped when it is not a number the operator could have
   * meant: a price silently rounded, floored to zero or turned into a hundred
   * times itself is discovered by a customer, and a wrong figure on a public
   * page is worse than a refusal on a form the operator is standing in front of.
   * The ceiling is a sanity rail, not a business rule.
   */
  const rawPrice = b.priceCents;
  if (rawPrice !== undefined && rawPrice !== null && !Number.isInteger(rawPrice)) {
    throw new BadRequest("A price has to be a whole number of cents.");
  }
  const priceCents = Number.isInteger(rawPrice) ? (rawPrice as number) : 0;
  if (priceCents < 0 || priceCents > 100_000_000) throw new BadRequest("That price is out of range.");

  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO download_files
       (id, slug, name, blurb, platform, version, filename, free, author, caveat, group_name,
        category, price_cents, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT position FROM download_files WHERE id = ?),
                      (SELECT COALESCE(MAX(position), 0) + 1 FROM download_files WHERE slug = ?)), ?)
     ON CONFLICT (id) DO UPDATE SET
       slug = excluded.slug, name = excluded.name, blurb = excluded.blurb,
       platform = excluded.platform, version = excluded.version, filename = excluded.filename,
       free = excluded.free, author = excluded.author, caveat = excluded.caveat,
       group_name = excluded.group_name, category = excluded.category,
       price_cents = excluded.price_cents`,
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
      category,
      priceCents,
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
  /*
   * **No object, no `uploaded_at`.** This used to write `size_bytes = 0` and
   * stamp the row as finished anyway, which is the one outcome the whole
   * write-row-then-mark-usable dance exists to prevent: the file would be
   * offered to customers, print its size as "—", and 404 on the click. An
   * unfinished row is invisible to everybody but the operator, who is the person
   * who can act on it — so failing here leaves exactly the state a browser that
   * closed mid-upload leaves, and the fix is the same one: upload it again.
   */
  if (!head) {
    throw new BadRequest("The upload completed but the file isn't in the bucket. Try it again.", 502);
  }

  await env.DB.prepare("UPDATE download_files SET size_bytes = ?, uploaded_at = ? WHERE id = ?")
    .bind(head.size, Date.now(), id)
    .run();

  return noStore(json({ ok: true, size: head.size }));
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
  /** Filled in below when a file is named without its page — see the note there. */
  let scope = slug;

  /*
   * Both scopes are checked against the database, exactly as `mintCode` checks
   * its own two — and for the same reason: a typo here produces a grant that
   * looks right in the list, opens nothing, and is discovered by the person it
   * was given to. `mintCode` had this care and this route did not.
   *
   * The pair is checked *together*: an item id that exists but sits on a
   * different page is the interesting mistake, because `grantedFile` tests both
   * halves of one row, so such a grant can never match anything at all.
   */
  if (slug) {
    const has = await env.DB.prepare("SELECT slug FROM download_pages WHERE slug = ?").bind(slug).first();
    if (!has) throw new BadRequest("No such page.", 404);
  }
  if (itemId) {
    const item = await env.DB.prepare("SELECT slug FROM download_files WHERE id = ?")
      .bind(itemId)
      .first<{ slug: string }>();
    if (!item) throw new BadRequest("No such download.", 404);
    if (slug && item.slug !== slug) {
      throw new BadRequest("That file is not on that page, so the grant would open nothing.");
    }
    /*
     * **A grant naming a file must also name that file's page.**
     *
     * `granted()` reads a null `slug` as "every page", so a row of
     * `(slug: null, item: "some-file")` is a one-file grant that quietly confers
     * *read* on every `granted` and `code` page on the site. The bytes stay
     * correctly scoped — `grantedFile` tests both halves of the row, which is the
     * 2026-08-20 review's fix and is untouched — but read access is not nothing:
     * a `granted` page is one whose very existence is the secret.
     *
     * Nothing in the editor produces such a row (it always sends the page's own
     * slug), so this is belt and braces. It is written as a *completion* rather
     * than a refusal because the page is not ambiguous: the file is on exactly
     * one page and we have just read it. Narrowing an over-broad row beats
     * refusing a request whose intent is clear.
     */
    scope = item.slug;
  }

  const days = Number.isInteger(b.days) ? Math.min(3650, Math.max(0, b.days as number)) : 0;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO download_grants (account_id, slug, item_id, label, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(account.id, scope, itemId, str(b.label, LIMITS.label), now, days ? now + days * 86_400_000 : null)
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
