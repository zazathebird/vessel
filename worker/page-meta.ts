import { PAGES } from "../src/data/pages";
import { pageFromPath } from "../src/data/pageIds";
import type { PageId } from "../src/data/pageIds";

/**
 * Per-route `<title>` and `<meta name="description">`, stamped into the shell
 * before it leaves the Worker.
 *
 * **The app already sets `document.title`, and that is not enough** (2026-08-17
 * audit). `App.tsx` writes the title on render, so a browser tab is correct —
 * but the *served* HTML carried `<title>mcclevarty.ca</title>` and no
 * description on every one of the sixteen routes, and the things that read a
 * page without running JavaScript are exactly the things that matter here:
 *
 * - **Link previews.** iMessage, WhatsApp, Messenger, Slack and SMS unfurl a
 *   URL by fetching the HTML and reading the head. None of them execute a
 *   bundle. So every link to this site previewed as the bare string
 *   "mcclevarty.ca" with no description — and the scams page ends by telling
 *   the reader to *"Send it to whoever in your family is most likely to answer
 *   the phone."* The one page written to be forwarded was the one that
 *   previewed as nothing.
 * - **Search.** Google renders JS eventually, but a served description is what
 *   it quotes rather than composing a snippet out of whatever it finds first.
 *
 * The copy is not invented for this: `title` and `lede` already exist on every
 * page in `src/data/pages.ts`, written and client-approved. Importing them is
 * what keeps the head and the page from drifting apart — a hand-maintained
 * table in the Worker would be wrong the first time a lede was edited.
 *
 * **No `og:image`.** `SPEC.md`'s *Assets* rule holds and there is no image to
 * point at; a preview card with a title and a description is the honest version
 * of this site. The favicon stays the inline `data:` SVG it already is.
 */

/**
 * Routes that get a description but must never be indexed.
 *
 * The account pages because they are unlinked by design — describing them for a
 * human who arrives is right, listing them in a search index is not.
 *
 * And **`notfound`, because the SPA fallback answers unknown paths with HTTP
 * 200** rather than 404. That is correct for a client-routed app and it makes
 * every mistyped URL a *soft 404*: a page a crawler is entitled to index, with
 * the 404 copy on it, under whatever nonsense path was requested. `noindex` is
 * the fix that does not require breaking the fallback.
 */
const UNLISTED: ReadonlySet<PageId> = new Set<PageId>([
  "signup",
  "signin",
  "admin",
  "machines",
  "share",
  "notfound",
]);

const SITE = "mcclevarty.ca";

/**
 * Attribute-safe escaping.
 *
 * Every value here is site copy rather than visitor input, but the same rule
 * applies as in `withSiteConfig`: a guarantee that depends on who typed the
 * string is one that breaks the day that stops being true.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Trim to something a search result will not cut mid-word.
 *
 * ~155 characters is the width Google has historically rendered before
 * truncating. The ledes are written as whole sentences, so this cuts on a word
 * boundary and adds an ellipsis rather than stopping mid-thought.
 */
function clamp(text: string, max = 155): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : max).replace(/[,;:.\s]+$/, "")}…`;
}

export function metaForPath(pathname: string): {
  id: PageId;
  title: string;
  description: string;
  unlisted: boolean;
} {
  const id = pageFromPath(pathname);
  const page = PAGES[id];
  return {
    id,
    // Matches `App.tsx`'s `document.title` exactly, so the served head and the
    // rendered tab never disagree.
    title: `${page.title} · ${SITE}`,
    description: clamp(page.lede),
    unlisted: UNLISTED.has(id),
  };
}

/**
 * Rewrite the shell's head for this route.
 *
 * Deliberately its own pass rather than folded into `withSiteConfig`: that
 * function returns early when nothing is published, and the head of an
 * unconfigured site still needs a title. Two `HTMLRewriter` passes cost nothing
 * — both stream, neither buffers the document.
 */
export function withPageMeta(response: Response, url: URL): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;

  const meta = metaForPath(url.pathname);
  // A 404 must not canonicalise to the nonsense path that produced it — that
  // would nominate `/typo` as the preferred URL for the 404 copy. It gets no
  // canonical at all, and `noindex` above.
  const canonical =
    meta.id === "notfound" ? null : `https://${SITE}${meta.id === "home" ? "/" : url.pathname}`;
  const title = esc(meta.title);
  const description = esc(meta.description);

  const tags = [
    `<meta name="description" content="${description}" />`,
    canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}" />` : "",
    `<meta name="twitter:card" content="summary" />`,
    // The account pages are unlinked by design; describing them for a human who
    // arrives is right, listing them in a search index is not.
    meta.unlisted ? `<meta name="robots" content="noindex,nofollow" />` : "",
  ]
    .filter(Boolean)
    .join("");

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on("head", {
      element(head) {
        head.append(tags, { html: true });
      },
    })
    .transform(response);
}
