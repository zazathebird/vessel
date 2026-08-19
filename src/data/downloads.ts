/**
 * The downloads catalogue — the operator's own programs, offered free or behind
 * an access code (2026-08-19, client request).
 *
 * WHY THIS IS A TYPESCRIPT FILE AND NOT A DATABASE TABLE. The site already
 * keeps its content in `src/data/*.ts` and its *appearance* in D1, and the
 * split is deliberate: appearance changes on a whim and copy changes with a
 * deploy. A catalogue entry is copy. Adding a program is therefore: upload the
 * file, add an entry here, deploy — three steps, none of which can half-happen.
 * The alternative (an editable table plus an upload interface) is a second
 * content system for a list that will have a dozen rows in it.
 *
 * WHAT LIVES WHERE, because getting this wrong is the whole security of it:
 *
 *   - This file is **public**. It ships in the bundle. It holds names, blurbs,
 *     versions and sizes — never a URL, never a key, never a code.
 *   - The **bytes** live in a private R2 bucket the Worker alone can read
 *     (`DOWNLOADS` in wrangler.toml). There is no public URL to guess at, which
 *     is what makes the gate real rather than decorative. A file dropped in
 *     `public/` would be fetchable by anyone who typed its name, and the code
 *     entry in front of it would be theatre.
 *   - The **codes** live in D1 as HMACs (`migrations/0005_downloads.sql`).
 *
 * THE PAYMENT IS DELIBERATELY NOT HERE. The client takes payment out of band —
 * e-transfer, then they hand over a code by hand. That is not a limitation
 * worked around; it is the reason this design stores no personal data at all.
 * There is no checkout, no processor, no card, no name, no email, no invoice
 * table. See `docs/DOWNLOADS.md` for the operator's side of the loop.
 */

/**
 * Which machine an item is for. Purely a label — the gate does not care, and
 * nothing sniffs the visitor's platform. Somebody on a phone may well be
 * fetching a Windows tool to put on a memory stick.
 */
export type DownloadPlatform = "windows" | "linux" | "android" | "script" | "any";

export interface DownloadItem {
  /**
   * Stable id. It is the R2 object key *and* the URL fragment, so renaming one
   * breaks any link already handed out. Treat it as a wire format: add, never
   * rename.
   */
  id: string;
  name: string;
  /** One or two sentences, in the site's voice. What it does, plainly. */
  blurb: string;
  platform: DownloadPlatform;
  /** Shown as-is. No parsing, no comparison — a human reads it. */
  version: string;
  /**
   * Human-readable size, written by hand rather than measured at runtime: the
   * catalogue renders before any request to the Worker, and a size that arrives
   * late makes the list reflow under the reader's thumb.
   */
  size: string;
  /**
   * The exact filename the visitor receives. Also what the Worker puts in
   * `content-disposition`, so it is the one place the extension is decided.
   */
  filename: string;
  /**
   * Free items need no code and download on one click. Paid items need one.
   *
   * This is the whole free/paid switch: the client can give any item away by
   * flipping this and deploying, or give it to *one* person by minting a code
   * scoped to it. Both were asked for.
   */
  free?: boolean;
  /**
   * Set when the item is not the operator's own work, naming who wrote it.
   *
   * It exists to make the question impossible to skip. Redistributing somebody
   * else's software is their licence's call and not this site's, and a field
   * that has to be filled in is a better reminder than a note in a document
   * nobody re-reads. Rendered as an attribution line.
   */
  author?: string;
  /**
   * Anything the visitor should know *before* clicking: an unsigned binary, a
   * dependency, a "this needs administrator". Rendered as a warning line.
   */
  caveat?: string;
}

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
 * would eventually be edited for tone by somebody skimming.
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

/**
 * The catalogue.
 *
 * EMPTY ON PURPOSE at the time of writing — the page, the gate and the storage
 * are built and the client's own files have not been uploaded yet. An empty
 * list renders an honest "nothing here yet" rather than a broken grid, and the
 * check suite asserts the shape of whatever is added rather than the count.
 *
 * To add one:
 *   1. `wrangler r2 object put vessel-downloads/<id> --file ./thing.exe`
 *   2. add an entry here whose `id` matches that key exactly
 *   3. `npm run deploy`
 * `docs/DOWNLOADS.md` has the full loop, including minting a code.
 */
export const DOWNLOADS: DownloadItem[] = [];

/** Resolve an id to its entry. Unknown ids are not errors here — the Worker refuses them. */
export function downloadById(id: string): DownloadItem | undefined {
  return DOWNLOADS.find((d) => d.id === id);
}

export const PLATFORM_LABEL: Record<DownloadPlatform, string> = {
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  script: "Script",
  any: "Any machine",
};
