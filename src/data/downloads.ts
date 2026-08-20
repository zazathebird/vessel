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
