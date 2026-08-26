import { PAGES } from "../src/data/pages";
import { snippetFor } from "../src/data/snippets";
import { PATHS, pageFromPath, subFromPath } from "../src/data/pageIds";
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
 * The title is the page's own, imported, so the served head and the rendered
 * tab cannot drift apart.
 *
 * **The description is not** (2026-08-26). It was the page's `lede` for the
 * same reason — approved copy, no second table to maintain — and that was
 * wrong about fit rather than about drift. A lede is read third, after an
 * eyebrow naming the page and a headline; a snippet arrives cold, in a list of
 * ten results. Nine of the eleven indexed routes were being clamped
 * mid-sentence and losing the useful half. `src/data/snippets.ts` holds copy
 * written for this job, one line per route and a rotating pool for home, and
 * carries the rules it is written to.
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

/**
 * The crawler's two files, generated rather than kept in `public/`.
 *
 * **Generated, because a static file drifts** (2026-08-26). `PATHS` is a total
 * map from a closed union and `UNLISTED` is the list above it; a hand-written
 * `sitemap.xml` would be one more place a new page has to be remembered, and
 * the failure is silent — a page nobody submitted is simply a page nobody
 * finds. Here, adding a route adds a line, and `npm run check` fails if the two
 * ever disagree.
 *
 * **What a sitemap does and does not do.** It tells a crawler which addresses
 * exist and are worth its time; it does not rank them, and it cannot request a
 * sitelink. Sitelinks — the extra pages listed under a search result — are
 * chosen by Google from a site's own internal linking, and the way to ask for
 * one is to link the page prominently from home, which `/scams` already is.
 * This is the honest half of that job.
 */
export function sitemapXml(): string {
  const urls = (Object.keys(PATHS) as PageId[])
    .filter((id) => !UNLISTED.has(id))
    .map((id) => `https://${SITE}${id === "home" ? "/" : PATHS[id]}`);
  /*
   * No `lastmod`, deliberately. There is no honest source for it here — the
   * copy lives in a TypeScript module and the deploy date is not the date a
   * page changed — and a fabricated timestamp on every URL, refreshed on every
   * deploy, is the exact signal crawlers learn to discount. `priority` and
   * `changefreq` are omitted for the simpler reason that Google ignores them.
   */
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${esc(loc)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

export function robotsTxt(): string {
  /*
   * **Nothing under `/downloads/` is disallowed, and that is the point of this
   * comment.** Those sub-pages are `noindex` (see `metaForPath`), and a crawler
   * can only obey a `noindex` it is allowed to fetch and read. `Disallow` would
   * block the fetch, leave the pages eligible to appear as bare URLs, and turn
   * the file into a directory of exactly the addresses meant to stay quiet.
   *
   * `/api/` is disallowed because it is machinery, answers nothing useful to a
   * reader, and every route on it either refuses or costs a D1 read.
   */
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: https://${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * `/robots.txt` and `/sitemap.xml`, or null for every other request.
 *
 * Kept to one exported function so `worker/index.ts` gains one line rather than
 * two branches, and so the invariant it lives under stays readable: delete this
 * call and the site serves as it did before.
 */
export function crawlerFile(url: URL): Response | null {
  if (url.pathname === "/robots.txt") {
    return new Response(robotsTxt(), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  }
  if (url.pathname === "/sitemap.xml") {
    return new Response(sitemapXml(), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  }
  return null;
}

export function metaForPath(pathname: string, at: number = Date.now()): {
  id: PageId;
  title: string;
  description: string;
  unlisted: boolean;
  /** True for `/downloads/<name>`, whose canonical is the index above it. */
  sub: boolean;
} {
  const id = pageFromPath(pathname);
  const page = PAGES[id];
  /*
   * **An operator-authored sub-page is unlisted, and its canonical is the index.**
   *
   * This file already argues at length that `notfound` is in `UNLISTED` because
   * the SPA fallback answers unknown paths with 200, "which makes every mistyped
   * URL a *soft 404*: a page a crawler is entitled to index". Adding the
   * `/downloads/<name>` prefix route re-opened exactly that, without limit —
   * every one of an infinite family of addresses came back 200 with the
   * downloads title and a canonical pointing **at itself**.
   *
   * The Worker cannot tell a real sub-page from a typo without a D1 read on a
   * path that must stay cheap, and it should not try: the pages are operator
   * pages, several of them deliberately unlisted or code-gated, and none of them
   * wants to be in an index. So the whole family is `noindex` with the index as
   * its canonical, which is true of the real ones and of the typos alike.
   */
  const sub = subFromPath(pathname) !== null;
  return {
    id,
    // Matches `App.tsx`'s `document.title` exactly, so the served head and the
    // rendered tab never disagree.
    title: `${page.title} · ${SITE}`,
    // The clamp stays as a backstop and is expected never to fire: every
    // snippet is gated at 155 characters by `npm run check`. It is what stands
    // between a long line typed in a hurry and a snippet cut mid-word.
    description: clamp(snippetFor(id, at)),
    unlisted: UNLISTED.has(id) || sub,
    sub,
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
    meta.id === "notfound"
      ? null
      : meta.sub
        // A sub-page's canonical is the index it hangs off, never itself: it is
        // one of an unbounded family of addresses and none of them is preferred.
        ? `https://${SITE}${PATHS.downloads}`
        : `https://${SITE}${meta.id === "home" ? "/" : url.pathname}`;
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
    /*
     * **The shell's own description is removed, not left to lose.** (2026-08-26)
     *
     * `index.html` carries a static `<meta name="description">` and this pass
     * *appends* its own, so every route served two of them — the static one
     * first. A search engine quoting the first tag is quoting the shell, which
     * is the same string on all sixteen routes and cannot know which page it is
     * on. Google was still showing "free diagnosis" months after that claim was
     * cut from the site's copy, because the tag it was reading is not the one
     * this file writes. The title never had the bug: it is *set*, in place.
     *
     * **The static tag stays in `index.html`** rather than being deleted, and
     * that is deliberate: Pages still auto-deploys from `main` and is the
     * rollback (see *Deployment*), and under Pages there is no Worker and so no
     * injected head — the static description is then the only one there is. It
     * must therefore stay true, but it must never outrank this one.
     */
    .on('meta[name="description"]', {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(head) {
        head.append(tags, { html: true });
      },
    })
    .transform(response);
}
