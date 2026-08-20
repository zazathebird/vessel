/**
 * The downloads vocabulary — the small closed sets the Worker validates against
 * and the page renders from.
 *
 * **THIS FILE USED TO BE THE CATALOGUE, AND THAT DECISION WAS REVERSED ON
 * 2026-08-20 AT THE CLIENT'S REQUEST.** The reasoning it carried is worth
 * keeping, because it was right about the thing it was answering: the site keeps
 * content in `src/data/*.ts` and appearance in D1, on the grounds that copy
 * changes with a deploy. A one-line catalogue of a dozen programs genuinely is
 * copy.
 *
 * What was asked for is not that. It is several pages the operator names, lays
 * out, fills with their own files and publishes **while they are on the phone to
 * somebody** — plus per-account access. None of that can be a deploy step, and
 * an upload interface is not a second content system when the alternative is the
 * client opening a terminal. So the rows moved to D1
 * (`migrations/0006_download_pages.sql`) and this file kept the parts that are
 * genuinely constants: the notice, the labels, and the closed sets below.
 *
 * The catalogue was **empty** on the day it moved, so no id in circulation
 * changed and there was nothing to migrate.
 *
 * WHAT LIVES WHERE, because getting this wrong is the whole security of it:
 *
 *   - This file is **public**. It ships in the bundle and holds no data.
 *   - The **rows** live in D1 and are served by `worker/downloadPages.ts`, which
 *     decides per request what the caller may see.
 *   - The **bytes** live in a private R2 bucket the Worker alone can read
 *     (`DOWNLOADS` in wrangler.toml). There is no public URL to guess at, which
 *     is what makes the gate real rather than decorative.
 *   - The **codes** live in D1 as HMACs (`migrations/0005_downloads.sql`).
 *
 * THE PAYMENT IS DELIBERATELY NOWHERE. The client takes payment out of band —
 * e-transfer, then they hand over a code by hand. That is not a limitation
 * worked around; it is the reason this design stores no personal data at all.
 */

/**
 * Which machine an item is for. Purely a label — the gate does not care, and
 * nothing sniffs the visitor's platform. Somebody on a phone may well be
 * fetching a Windows tool to put on a memory stick.
 */
export type DownloadPlatform = "windows" | "linux" | "android" | "script" | "any";

export const PLATFORMS: readonly DownloadPlatform[] = [
  "windows",
  "linux",
  "android",
  "script",
  "any",
];

/**
 * The looks a page can wear, and **the single definition of them**.
 *
 * `worker/downloadPages.ts` validates against this list and `DownloadPage.tsx`
 * renders from it, importing the same array rather than each holding a copy —
 * which is the shape of bug this codebase has been bitten by often enough to
 * have a rule about it (`FX` and the share code; `duelFocus` and the camera).
 * A second copy here would mean an operator could save a layout that renders as
 * the default and be told nothing.
 *
 * Each one is a class on the page's own section, so a layout is CSS and never a
 * different set of facts. `npm run check` fails if one of these has no rule.
 */
export const PAGE_LAYOUTS = ["list", "cards", "sheet", "blocks"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

/**
 * Who can reach a page.
 *
 * - `public` — listed on /downloads for anyone.
 * - `unlisted` — reachable only by its address. The secret is the link, which
 *   is the only thing it ever claims to be.
 * - `code` — the whole page is behind an access code.
 * - `granted` — only accounts the operator has named.
 *
 * Per-*file* gating is separate and unchanged: a file's own free/paid switch
 * still decides whether the bytes need a ticket, so a public page full of paid
 * files is the shape the site already had.
 */
export const PAGE_VISIBILITY = ["public", "unlisted", "code", "granted"] as const;
export type PageVisibility = (typeof PAGE_VISIBILITY)[number];

/**
 * The free-form vocabulary. Four kinds, no nesting, no markup — see the
 * migration for why raw HTML from an admin box is not on offer.
 */
export const BLOCK_KINDS = ["heading", "text", "list", "files"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * THE UNSIGNED-BINARY LINE IS NOT PER-ITEM AND MUST NOT BECOME PER-ITEM.
 *
 * The client ships unsigned Windows executables, so SmartScreen will interrupt
 * the install and tell the visitor the file is dangerous. The site has a whole
 * page (`/scams`) teaching people not to be talked past exactly that kind of
 * warning, and this page must not become the counterexample — a visitor who
 * learns here that warnings are a formality has been taught the wrong lesson by
 * the same author.
 *
 * So the page says it once, at the top, in its own voice: the warning is real,
 * here is why this file trips it, and here is the difference between this and
 * the phone call the other page is about — *you came here and clicked it*. That
 * is the same distinction `/setup` draws, and it is the only honest one.
 *
 * Kept as a constant rather than in `pages.ts` because it is a safety notice
 * that happens to be copy, and burying it among nine pages of blocks is how it
 * would eventually be edited for tone by somebody skimming. It is **not**
 * operator-editable for the same reason: the per-page `notice` field is for the
 * operator's own warnings and sits beside this one, never instead of it.
 */
export const UNSIGNED_NOTICE = {
  title: "Windows will warn you about some of these",
  body:
    "Most of what's here I wrote myself, and I have not paid for a code-signing certificate. " +
    "So Windows sees an unknown author and puts a blue box in your way saying it protected your PC. " +
    "The warning is doing its job — it means the file is not from a company Microsoft has on file, " +
    "which is true. The difference between this and the call from \"Microsoft support\" is that you " +
    "came here on purpose and clicked it yourself. Nobody rang you. If anyone ever phones and talks " +
    "you through getting past that box, hang up.",
} as const;

export const PLATFORM_LABEL: Record<DownloadPlatform, string> = {
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  script: "Script",
  any: "Any machine",
};

/* -------------------------------------------------------------------------- */
/* Categories (2026-08-20, client request)                                     */
/* -------------------------------------------------------------------------- */

/**
 * What kind of program a file is — the list the operator picks from when they
 * put something up, and the thing the filter row filters on.
 *
 * **AN APPEND-ONLY WIRE FORMAT, like `FX` and every other catalogue here.** The
 * `id` is stored on every row and is what a filter in a shared link names, so
 * entries may be added and must never be renamed, reordered or removed. The
 * `hidden` mechanism the effects and ornaments use is the way to withdraw one
 * without moving anybody else's index; nothing carries it today.
 *
 * **The list is written from the bench, not from a software directory.** The
 * client asked to "anticipate all types of software", and the honest way to
 * anticipate is to name the jobs this operator is actually handed: a machine
 * that will not boot, a disk that is failing, a household that has been
 * scammed, a laptop that has become slow. So the categories are the shelves of
 * a repair toolkit rather than an app store's taxonomy — which is also why
 * "Boot & rescue media" is one of them and "Productivity" is not.
 *
 * `other` is last and is the default. A file whose category nobody chose is
 * genuinely uncategorised, and guessing from a filename would put a confident
 * wrong label on somebody's work with nothing to notice it by.
 */
export interface DownloadCategory {
  id: string;
  /** Shown in the picker, on the filter row and under the icon. */
  label: string;
  /** One line in the operator's picker, so the choice needs no documentation. */
  hint: string;
  /**
   * Withdrawn from the menus but still resolved from stored rows. Nothing
   * carries it today — kept so a category can be retired without renumbering.
   */
  hidden?: boolean;
}

export const CATEGORIES: readonly DownloadCategory[] = [
  { id: "diagnostics", label: "Diagnostics", hint: "Find out what is actually wrong." },
  { id: "recovery", label: "Data recovery", hint: "Get files back off something that is failing." },
  { id: "backup", label: "Backup & imaging", hint: "Copy a disk before touching it." },
  { id: "antimalware", label: "Malware removal", hint: "Scanners and cleaners." },
  { id: "cleanup", label: "Cleanup & tune-up", hint: "Junk, startup items, a machine gone slow." },
  { id: "drivers", label: "Drivers & updates", hint: "Hardware that needs its software." },
  { id: "network", label: "Network & Wi-Fi", hint: "Connections, routers, why it drops." },
  { id: "remote", label: "Remote access", hint: "Getting onto a machine that is not in front of you." },
  { id: "disks", label: "Disks & partitions", hint: "Formatting, resizing, cloning, health." },
  { id: "boot", label: "Boot & rescue media", hint: "Bootable sticks, and getting a dead machine to start." },
  { id: "benchmark", label: "Benchmarks & stress", hint: "Prove it is the hardware." },
  { id: "monitor", label: "Monitoring & sensors", hint: "Temperatures, fans, voltages, over time." },
  { id: "passwords", label: "Passwords & accounts", hint: "Locked out, or locking down." },
  { id: "security", label: "Security & privacy", hint: "Encryption, firewalls, hardening." },
  { id: "media", label: "Photo, video & audio", hint: "Playing, converting, repairing media." },
  { id: "office", label: "Documents & office", hint: "Readers, converters, the paperwork end." },
  { id: "dev", label: "Developer & scripts", hint: "Editors, terminals, the things you wrote yourself." },
  { id: "system", label: "System utilities", hint: "The general-purpose bench tools." },
  { id: "firmware", label: "Firmware & BIOS", hint: "Below the operating system." },
  { id: "mobile", label: "Phones & tablets", hint: "Android and iOS, from a computer." },
  { id: "other", label: "Everything else", hint: "The honest answer when none of the above fits." },
] as const;

/**
 * `CATEGORIES` is the wire format; this is the menu.
 *
 * Same split as `FX` / `PICKABLE_FX`, and it exists for the same reason: a
 * withdrawn category is *unlisted*, never invalid, so a row that still names one
 * keeps resolving. Anything offering a choice to a person reads this; anything
 * resolving a stored value reads `CATEGORIES`.
 */
export const PICKABLE_CATEGORIES = CATEGORIES.filter((c) => !c.hidden);

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

/** The default a row falls back to, by id rather than by index — index 21 today. */
export const DEFAULT_CATEGORY = "other";

/**
 * Resolve a stored value to a real entry. **Never returns undefined**: a row
 * carrying a category this build does not know about is a row written by a newer
 * deploy or edited by hand, and rendering it as "Everything else" is honest,
 * where rendering it as the first entry would silently claim it is a diagnostic
 * tool.
 */
export function categoryOf(id: string): DownloadCategory {
  return (
    CATEGORIES.find((c) => c.id === id) ??
    CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY) ??
    CATEGORIES[CATEGORIES.length - 1]
  );
}

/* -------------------------------------------------------------------------- */
/* Sort order                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The orders a page's files can come out in.
 *
 * `manual` is first and is the default: it is the operator's own hand order,
 * which is what every page does today and the only one that carries an opinion.
 * The rest are arithmetic on facts the row already holds.
 *
 * The Worker validates a page's stored default against this list; the visitor's
 * own choice is applied in the browser and never stored, because a sort order is
 * not one of the two settings a visitor may keep (`vessel.calm.v1` and
 * `vessel.sound.v1` — see CLAUDE.md, and do not make this a third).
 */
export const FILE_SORTS = [
  "manual",
  "name",
  "newest",
  "oldest",
  "size",
  "price",
  "category",
] as const;
export type FileSort = (typeof FILE_SORTS)[number];

/** What each order is called where somebody has to choose one. */
export const SORT_LABEL: Record<FileSort, string> = {
  manual: "My order",
  name: "Name",
  newest: "Newest first",
  oldest: "Oldest first",
  size: "Largest first",
  price: "Price",
  category: "Category",
};

/**
 * The visitor's wording for the same list, which is deliberately different.
 *
 * "My order" means something to the operator and nothing to a visitor, who has
 * no idea whose order it is or that there is an alternative. To them it is
 * simply the order the page is in.
 */
export const SORT_LABEL_PUBLIC: Record<FileSort, string> = {
  ...SORT_LABEL,
  manual: "Featured",
};

/* -------------------------------------------------------------------------- */
/* The upload portal's guesses                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What a filename implies, so picking a file fills the form in.
 *
 * The client asked for "an upload portal", and typing an id, a name and a
 * platform for every file — by hand, in kebab case, correctly, for a folder of
 * small scripts — is the part of an upload form that makes people stop using it.
 * Every field this returns is a **suggestion into an empty box**: the caller
 * never overwrites something already typed, so a guess can only ever save work.
 *
 * **It deliberately does not guess a `category`.** The migration says so and the
 * reason holds: a wrong label applied confidently, with nothing to notice it by,
 * is worse than `other`. An extension tells you what a file *is*, never what it
 * is *for* — `diagnostics` and `cleanup` ship the same `.exe`.
 *
 * Pure and exported so `npm run check` can drive it, because the id it produces
 * has to satisfy the Worker's `KEY` regex or the save is refused in front of the
 * operator — and a guess that cannot be saved is worse than no guess.
 */
export interface FilenameGuess {
  /** Lowercase-kebab, `KEY`-safe, and empty when nothing usable could be made. */
  id: string;
  /** Sentence case, for the human-facing name. */
  name: string;
  /** A `DownloadPlatform`, or "" when the extension does not say. */
  platform: string;
}

/**
 * Extensions that genuinely name a platform. **Absence is the common case and
 * is correct**: `.zip` and `.txt` say nothing, and guessing from them would put
 * a confident wrong label on most uploads.
 */
const PLATFORM_BY_EXT: Record<string, DownloadPlatform> = {
  exe: "windows", msi: "windows", msix: "windows", appx: "windows", reg: "windows",
  bat: "windows", cmd: "windows",
  apk: "android", aab: "android",
  deb: "linux", rpm: "linux", appimage: "linux",
  ps1: "script", sh: "script", py: "script", vbs: "script", pl: "script", rb: "script",
};

export function suggestFromFilename(filename: string): FilenameGuess {
  const cut = filename.lastIndexOf(".");
  const ext = cut > 0 ? filename.slice(cut + 1).toLowerCase() : "";
  // `foo.tar.gz` → base `foo`, not `foo.tar`, which would become the id
  // `foo-tar`. Compressed tarballs are how a linux tool usually arrives.
  let base = cut > 0 ? filename.slice(0, cut) : filename;
  if (/\.tar$/i.test(base)) base = base.slice(0, -4);

  /*
   * The id has to satisfy the Worker's `KEY` — `^[a-z0-9]+(-[a-z0-9]+)*$` — or
   * the save is refused in the operator's face. Built by keeping only what is
   * allowed and collapsing everything else into single hyphens, then trimming,
   * so there is no input that yields a leading, trailing or doubled hyphen.
   * Capped at the same 64 the Worker truncates to, and re-trimmed after the cap
   * in case the cut landed on a hyphen.
   */
  const id = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  /*
   * Sentence case, not title case: the site writes headings and names in
   * sentence case throughout, and "Boot Repair V2" is neither the filename nor
   * the house style. Version-looking fragments are left alone.
   */
  const words = base.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  const name = words ? words.charAt(0).toUpperCase() + words.slice(1) : "";

  return { id, name, platform: PLATFORM_BY_EXT[ext] ?? "" };
}

/**
 * How long a file counts as new.
 *
 * Thirty days, and the point is the *returning* visitor: somebody who looked
 * last month and is looking again should be able to see what has changed without
 * reading the whole list. Longer and everything on a slowly-growing page is
 * permanently "new", which marks nothing.
 *
 * Compared against `added`, which the Worker rounds to the day — so this is a
 * coarse comparison of coarse values, which is all it needs to be.
 */
export const NEW_FOR_MS = 30 * 86_400_000;

export function isNew(added: number | undefined, now: number): boolean {
  return typeof added === "number" && added > 0 && now - added < NEW_FOR_MS;
}

/**
 * Does this file match what somebody typed?
 *
 * **Matches the facts a visitor can see, and nothing else.** Name, description,
 * version, the category's *label* and the platform's *label* — never the
 * internal ids, because searching "antimalware" and matching a row that says
 * "Malware removal" on screen is a result nobody can explain. The id is excluded
 * for the same reason: it is a URL, not a word anybody read.
 *
 * Pure and exported so the search can be gated; every term must match, so typing
 * more words always narrows.
 */
export function matchesQuery(
  file: { name: string; blurb: string; version?: string; category?: string; platform?: string },
  query: string,
): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const hay = [
    file.name,
    file.blurb,
    file.version ?? "",
    categoryOf(file.category ?? DEFAULT_CATEGORY).label,
    PLATFORM_LABEL[(file.platform ?? "any") as DownloadPlatform] ?? file.platform ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((t) => hay.includes(t));
}

/**
 * The facts a sort reads. Structural on purpose: the renderer's row type lives
 * in `api.ts` alongside the wire shapes, and importing that here would point a
 * data module at the network layer. Anything with these fields sorts.
 */
export interface SortableFile {
  name: string;
  size: number;
  price?: number;
  added?: number;
  category?: string;
}

/**
 * Put a page's files in an order. **Pure, and exported so it can be gated** —
 * every rule below is a decision somebody could reasonably reverse by accident.
 *
 * `manual` returns the array untouched: the Worker has already sorted by the
 * operator's `position`, and re-sorting a list that is already in the order
 * somebody chose is how a hand order silently becomes alphabetical.
 *
 * **Every comparator breaks its tie on the name.** `Array.prototype.sort` is
 * stable, so without a tiebreak "largest first" on a page where four files are
 * the same size returns them in `position` order — correct, but indistinguishable
 * from the sort not having happened, which is worse than either answer.
 */
export function sortFiles<T extends SortableFile>(files: readonly T[], sort: FileSort): T[] {
  if (sort === "manual") return files.slice();

  const byName = (a: T, b: T) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const cat = (f: T) => CATEGORIES.findIndex((c) => c.id === categoryOf(f.category ?? DEFAULT_CATEGORY).id);
  const next = files.slice();

  switch (sort) {
    case "name":
      return next.sort(byName);
    case "newest":
      return next.sort((a, b) => (b.added ?? 0) - (a.added ?? 0) || byName(a, b));
    case "oldest":
      return next.sort((a, b) => (a.added ?? 0) - (b.added ?? 0) || byName(a, b));
    case "size":
      return next.sort((a, b) => b.size - a.size || byName(a, b));
    case "price":
      /*
       * Cheapest first, and **a file with no price sorts last rather than
       * first**. Zero means "no figure set", not "free" — free is the `free`
       * flag and is a statement about the gate — so letting 0 lead would put
       * every unpriced file at the top of a list sorted by price, which reads as
       * a page of free programs and is the one misreading that costs money.
       */
      return next.sort((a, b) => (a.price || Infinity) - (b.price || Infinity) || byName(a, b));
    case "category":
      /*
       * Catalogue order, not alphabetical. `CATEGORIES` is written in the order
       * a repair job actually goes in — diagnose, recover, back up — which is
       * more use to somebody scanning than sorting "Backup" above "Diagnostics".
       */
      return next.sort((a, b) => cat(a) - cat(b) || byName(a, b));
    default:
      return next;
  }
}

/**
 * A price, as a figure somebody reads.
 *
 * Canadian dollars with no currency code, matching `/home`, which quotes the
 * client's rate as "$150" and "$120 an hour" in a country where that is not
 * ambiguous. Whole dollars lose the `.00` because a price list of round numbers
 * covered in zeroes reads as a spreadsheet.
 *
 * Zero is **not** "$0" — it is no price at all, and the caller renders nothing.
 * Free is a different statement and belongs to `free`, which is about the gate.
 */
export function formatPrice(cents: number): string | null {
  if (!Number.isFinite(cents) || cents <= 0) return null;
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
