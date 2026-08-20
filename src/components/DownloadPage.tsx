/**
 * One operator-authored downloads page (2026-08-20, client request).
 *
 * **Four looks, one set of facts.** The client asked for layouts they could
 * switch and publish live, so `layout` picks a class and nothing else: every
 * layout renders the same title, prose, notice and files, and the difference is
 * CSS. That is the only version of "choose a design" that cannot produce a page
 * missing its safety notice — which matters here more than anywhere else on the
 * site, because this is the page that hands somebody an executable.
 *
 * **The notice is always above the files, in every layout.** `/setup` set that
 * precedent and the reasoning is the same one: somebody being talked through a
 * download by a criminal is following steps, not browsing, so the warning has to
 * be in front of the steps. It is not a layout decision and no layout may move
 * it.
 *
 * **Nothing here decides who may have a file.** Each row arrives with `unlocked`
 * already answered by the Worker, which asked exactly the same question it will
 * ask again when the bytes are requested. A client that computed its own answer
 * would be a second opinion, and the interesting case is the one where the two
 * disagree.
 *
 * **Filtering and sorting are the visitor's, and they are the only thing on this
 * page that is** (2026-08-20). The operator sets the order the page arrives in
 * and whether the controls appear at all; a visitor may then re-sort and filter
 * what they are looking at, and that choice lives in the tab and is never
 * stored — a sort order is not one of the two settings this site keeps for a
 * visitor (`vessel.calm.v1`, `vessel.sound.v1`), and it must not become a third.
 */

import { useMemo, useState } from "react";
import { api, ApiError } from "../auth/api";
import type { DownloadFileInfo, DownloadPageBody } from "../auth/api";
import { useEffect } from "react";
import { useConfig } from "../config/ConfigContext";
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  FILE_SORTS,
  PAGE_LAYOUTS,
  PLATFORM_LABEL,
  SORT_LABEL_PUBLIC,
  UNSIGNED_NOTICE,
  categoryOf,
  formatPrice,
  isNew,
  matchesQuery,
  sortFiles,
} from "../data/downloads";
import type { DownloadPlatform, FileSort } from "../data/downloads";
import { CategoryIcon } from "./CategoryIcon";
import { CodeBox, formatSize, readTicket } from "./DownloadsPage";

/**
 * The href for a file. Free items need no ticket; gated ones carry the one the
 * claim minted.
 *
 * A plain URL on a plain anchor, deliberately — see `api.ts`. The Worker answers
 * with `content-disposition: attachment`, so the browser saves it, shows its own
 * progress, and can resume if the line drops. Nothing is buffered into the tab
 * and no `blob:` is constructed.
 */
function hrefFor(item: DownloadFileInfo, ticket: string | null): string {
  const base = `/api/downloads/file?item=${encodeURIComponent(item.id)}`;
  return item.free || !ticket ? base : `${base}&t=${encodeURIComponent(ticket)}`;
}

/** The category a row claims, resolved — never the raw stored string. */
function catOf(item: DownloadFileInfo): string {
  return categoryOf(item.category ?? DEFAULT_CATEGORY).id;
}

/**
 * The filter row.
 *
 * **Chips for categories, selects for the rest**, and the asymmetry is the
 * point. The category is the thing with a drawn mark against it, so it is the
 * one worth showing all of at once — a row of marks is a picture of what this
 * page holds. Platform and sort are utility choices with no picture to show, and
 * two more rows of chips would bury the one that matters. They get native
 * controls, which are also the ones that work on a phone without anything being
 * reimplemented.
 *
 * **Only categories actually present are offered.** A filter listing twenty
 * shelves for a page with three programs on it is a menu of empty rooms, and
 * every chip carries its count so nothing here leads anywhere with nothing in
 * it.
 */
function FilterBar({
  files,
  category,
  platform,
  sort,
  showIcons,
  showPrices,
  asChips,
  query,
  showSearch,
  onQuery,
  onCategory,
  onPlatform,
  onSort,
}: {
  files: DownloadFileInfo[];
  category: string;
  platform: string;
  sort: FileSort;
  showIcons: boolean;
  /** Whether this page prints prices — which decides whether it may sort by one. */
  showPrices: boolean;
  /** Chips when there is room for them; one more select when there is not. */
  asChips: boolean;
  query: string;
  /** Offered only on a page long enough that scanning it is work. */
  showSearch: boolean;
  onQuery: (next: string) => void;
  onCategory: (next: string) => void;
  onPlatform: (next: string) => void;
  onSort: (next: FileSort) => void;
}) {
  // Catalogue order, counted. `CATEGORIES` is filtered rather than the files
  // grouped, so the chips come out in the shelf order the catalogue defines
  // instead of in whatever order the operator happened to upload things.
  const present = CATEGORIES.filter((c) => files.some((f) => catOf(f) === c.id)).map((c) => ({
    ...c,
    count: files.filter((f) => catOf(f) === c.id).length,
  }));
  const platforms = Array.from(new Set(files.map((f) => f.platform)));

  return (
    <div className="v-dl-filters">
      {/*
        * ON A PHONE THE CHIPS BECOME A SELECT, and this is a measurement rather
        * than a preference. Measured at a real 420px: eight categories at the
        * 44px touch minimum wrap to five rows and take 260px — more vertical
        * space than the list they filter, so the page opens on its own filter
        * and the first program is below the fold. A row of marks is a picture of
        * what the page holds when it is a *row*; stacked it is a wall.
        *
        * Rendered as one control or the other, never both hidden by CSS: two
        * controls for one setting is two things in the accessibility tree and
        * two things to keep in step.
        */}
      {present.length > 1 && !asChips ? (
        <label className="v-dl-control">
          <span className="v-dl-control-label">Kind</span>
          <select
            className="v-input v-dl-select"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
          >
            <option value="all">Everything ({files.length})</option>
            {present.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {present.length > 1 && asChips ? (
        <div className="v-dl-chips" role="group" aria-label="Filter by kind">
          <button
            type="button"
            className={`v-dl-chip${category === "all" ? " is-on" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => onCategory("all")}
          >
            All
            <span className="v-dl-chip-count">{files.length}</span>
          </button>
          {present.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`v-dl-chip${category === c.id ? " is-on" : ""}`}
              aria-pressed={category === c.id}
              onClick={() => onCategory(category === c.id ? "all" : c.id)}
            >
              {showIcons ? <CategoryIcon category={c.id} className="v-dl-chip-icon" /> : null}
              {c.label}
              <span className="v-dl-chip-count">{c.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="v-dl-controls">
        {/*
          * A search box, only once the list is long enough that reading it is
          * work. On a page of five programs a search field is furniture — the
          * eye is faster — and on a page of thirty it is the only control that
          * matters. It filters on the words a visitor can actually see (see
          * `matchesQuery`), never on ids.
          *
          * `type="search"` rather than `text`: the browser supplies the clear
          * button, which is the one affordance this needs and the one it would
          * otherwise have to reimplement badly.
          */}
        {showSearch ? (
          <label className="v-dl-control">
            <span className="v-dl-control-label">Find</span>
            <input
              type="search"
              className="v-input v-dl-search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="name or what it does"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ) : null}

        {platforms.length > 1 ? (
          <label className="v-dl-control">
            <span className="v-dl-control-label">Runs on</span>
            <select
              className="v-input v-dl-select"
              value={platform}
              onChange={(e) => onPlatform(e.target.value)}
            >
              <option value="all">Anything</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p as DownloadPlatform] ?? p}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="v-dl-control">
          <span className="v-dl-control-label">Order</span>
          <select
            className="v-input v-dl-select"
            value={sort}
            onChange={(e) => onSort(e.target.value as FileSort)}
          >
            {/*
              * **"Price" is not offered on a page that hides prices**, which is
              * the default. Sorting a list by a figure the page never prints is
              * a control that appears to do nothing — the rows shuffle and not
              * one visible fact explains why. The operator's own stored default
              * is guarded the same way in `activeSort`, since `savePage` will
              * happily hold `sort: "price"` alongside `show_prices = 0`.
              */}
            {FILE_SORTS.filter((s) => s !== "price" || showPrices).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL_PUBLIC[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function FileRow({
  item,
  ticket,
  showIcon,
  showPrice,
  fresh,
}: {
  item: DownloadFileInfo;
  ticket: string | null;
  showIcon: boolean;
  showPrice: boolean;
  /** Added recently enough to be worth pointing out to a returning visitor. */
  fresh: boolean;
}) {
  const category = categoryOf(item.category ?? DEFAULT_CATEGORY);
  const price = showPrice ? formatPrice(item.price ?? 0) : null;

  return (
    <li className={`v-dl-item${item.unlocked ? " is-open" : ""}`}>
      {/* The mark sits in its own column so the names line up whether or not a
          given row's category has one — the same reserved-space discipline the
          accent edge uses, and for the same reason: nothing may move when a
          neighbouring row differs. */}
      {showIcon ? (
        <div className="v-dl-icon">
          <CategoryIcon category={category.id} />
        </div>
      ) : null}

      <div className="v-dl-main">
        {/* The marker rides *inside* the name rather than joining the meta
            line's dot-separated facts: it is a note about the row, not another
            property of the file, and a sixth fact in that line would bury the
            five that describe what the thing actually is. */}
        <h3 className="v-dl-name">
          {item.name}
          {fresh ? <span className="v-dl-new">new</span> : null}
        </h3>
        {item.blurb ? <p className="v-dl-blurb">{item.blurb}</p> : null}
        {item.author ? <p className="v-dl-attrib">Written by {item.author}, not me.</p> : null}
        {item.caveat ? <p className="v-dl-caveat">{item.caveat}</p> : null}
      </div>

      {/* The manifest line. Real facts about a real file, in the order somebody
          scanning actually wants them: what kind of thing it is, can I run it,
          which one is it, how big — and what it costs, when the operator has
          chosen to say. The price is last because it is the fact that decides
          nothing until the others have been read. */}
      <p className="v-dl-meta">
        <span className="v-dl-cat">{category.label}</span>
        <span className="v-dl-dot" aria-hidden="true">
          ·
        </span>
        <span className="v-dl-platform">
          {PLATFORM_LABEL[item.platform as DownloadPlatform] ?? item.platform}
        </span>
        {item.version ? (
          <>
            <span className="v-dl-dot" aria-hidden="true">
              ·
            </span>
            <span>{item.version}</span>
          </>
        ) : null}
        <span className="v-dl-dot" aria-hidden="true">
          ·
        </span>
        <span>{formatSize(item.size)}</span>
        {price ? (
          <>
            <span className="v-dl-dot" aria-hidden="true">
              ·
            </span>
            <span className="v-dl-price">{price}</span>
          </>
        ) : null}
      </p>

      <div className="v-dl-action">
        {item.unlocked ? (
          // One word on both paths, and not "Get it free" on the free ones: the
          // label names the action, and the action is the same. Whether it cost
          // anything is already settled by the time this is on screen.
          <a className="v-btn v-dl-get" href={hrefFor(item, ticket)}>
            Download
          </a>
        ) : (
          // Not a disabled button: there is nothing to press, and a disabled
          // control invites pressing. It states the condition instead.
          <p className="v-dl-locked">Needs a code</p>
        )}
      </div>
    </li>
  );
}

export function DownloadPage({ slug }: { slug: string }) {
  const { go, band } = useConfig();
  const [ticket, setTicket] = useState<string | null>(() => readTicket());
  const [data, setData] = useState<DownloadPageBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The visitor's own view of the list. Reset when the page changes, because
   * "Malware removal" is not a meaningful filter on a page that has no such
   * shelf — and a filter carried across a navigation shows an empty page with no
   * explanation of why.
   */
  const [category, setCategory] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FileSort | null>(null);

  /*
   * "Now", captured once per mount rather than read inside the render.
   *
   * `isNew` compares against it, and a `Date.now()` in the render body would be
   * a different value on every re-render — so a row could in principle flip its
   * marker while somebody was typing in the search box. One value per visit is
   * also honest: "new" is a fact about the page as you found it.
   */
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    setCategory("all");
    setPlatform("all");
    setQuery("");
    setSort(null);
    api
      .downloadPage(slug, ticket)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((thrown) => {
        if (!live) return;
        setError(
          thrown instanceof ApiError && thrown.status === 404
            ? "There's no page at that address."
            : "I can't reach that page just now. That's my end, not yours.",
        );
      });
    return () => {
      live = false;
    };
  }, [slug, ticket]);

  const files = useMemo(() => data?.files ?? [], [data]);

  /*
   * The operator's order until the visitor picks one, and the fallback is
   * `manual` — which is a no-op, so a page served by a Worker deployed before
   * the migration behaves exactly as it did.
   */
  const stored = data?.page.sort;
  /*
   * The operator's stored default, unless it is one this page cannot honestly
   * show. `savePage` will hold `sort: "price"` next to `show_prices = 0` quite
   * happily — the two are separate fields and neither is wrong on its own — but
   * a page arriving in price order while printing no prices is a list in an
   * order nothing on screen explains.
   */
  const storedSort: FileSort =
    FILE_SORTS.includes(stored as never) &&
    !(stored === "price" && data?.page.showPrices !== true)
      ? (stored as FileSort)
      : "manual";
  const activeSort: FileSort = sort ?? storedSort;

  const shown = useMemo(() => {
    const filtered = files.filter(
      (f) =>
        (category === "all" || catOf(f) === category) &&
        (platform === "all" || f.platform === platform) &&
        matchesQuery(f, query),
    );
    return sortFiles(filtered, activeSort);
  }, [files, category, platform, query, activeSort]);

  if (error) {
    return (
      <section className="v-downloads">
        <p className="v-dl-empty">{error}</p>
        <p>
          <button type="button" className="v-btn" onClick={() => go("downloads")}>
            Back to downloads
          </button>
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="v-downloads">
        <p className="v-dl-empty" aria-live="polite">
          Fetching…
        </p>
      </section>
    );
  }

  const { page } = data;
  const blocks = data.blocks ?? [];
  // The unsigned-binary notice appears only when this page actually holds a
  // Windows binary. A standing warning about a file that is not on the page is
  // the kind of boilerplate people learn to scroll past — and this is the one
  // notice on the site that must not be scrolled past. Asked of every file on
  // the page, never of the filtered view: a warning that disappears when
  // somebody filters to "Scripts" is a warning with a hole in it.
  const anyWindows = files.some((f) => f.platform === "windows");
  /*
   * The look. Validated against `PAGE_LAYOUTS` — **the imported array, not a
   * copy of it**. This line held its own hardcoded `["list","cards","sheet",
   * "blocks"]` until 2026-08-20, which is exactly the second-copy bug this
   * codebase keeps a rule about: adding a fifth layout would have had the editor
   * offer it, the Worker store it, `npm run check` demand a stylesheet rule for
   * it — and this one line quietly render it as a list.
   */
  const layout = PAGE_LAYOUTS.includes(page.layout as never) ? page.layout : "list";

  const showIcons = page.showIcons !== false;
  const showPrices = page.showPrices === true;
  /*
   * Offered when the operator asked for it and there is more than one file.
   *
   * **The two preconditions used to be one, and that was wrong.** This also
   * required two categories or two platforms — a *filter's* precondition — which
   * silently took the **Order** control away with it. A page of twelve files
   * that are all Windows diagnostics is exactly the page that most wants sorting
   * by name or size, and it was the one page that could not. Each control inside
   * `FilterBar` states its own condition: the chips need more than one category,
   * the platform select more than one platform, and the order select needs only
   * something to order.
   */
  const showFilters = page.showFilters === true && files.length > 1;
  /*
   * Eight, which is roughly where a list stops being something the eye scans and
   * becomes something it searches. Below that the box is furniture; above it, it
   * is the only control that matters. Deliberately not a separate operator
   * toggle — the switch is already called "let visitors filter and search", and a
   * fourth checkbox for a control that hides itself when useless is a setting
   * nobody would ever change.
   */
  const showSearch = showFilters && files.length >= 8;

  /** Files in a named group, from the filtered-and-sorted view. */
  const inGroup = (group: string) => shown.filter((f) => (f.group || "") === group);

  const rowsOf = (list: DownloadFileInfo[]) =>
    list.map((f) => (
      <FileRow
        item={f}
        ticket={ticket}
        showIcon={showIcons}
        showPrice={showPrices}
        fresh={isNew(f.added, now)}
        key={f.id}
      />
    ));

  /**
   * Filtered down to nothing, with the way back out.
   *
   * **Both layouts need this and only one had it.** A chip's count comes from
   * every file on the page, so a chip can read "Drivers 2" and — on the
   * free-form look, where a file only renders if some `files` block claims its
   * group — produce a page of headings and prose with no files under any of
   * them. It was escapable, because the filter row is still above it, but
   * nothing said what had happened. An earlier comment here claimed "the count
   * line below says why"; there was no count line, and there still is not.
   */
  const nothingMatched = (
    <p className="v-dl-empty">
      Nothing on this page matches that.{" "}
      <button
        type="button"
        className="v-btn v-btn-quiet"
        onClick={() => {
          setCategory("all");
          setPlatform("all");
          setQuery("");
        }}
      >
        Show everything
      </button>
    </p>
  );

  return (
    <section
      className={`v-downloads v-dl-page dl-${layout}${showIcons ? " has-icons" : ""}`}
    >
      <header className="v-dl-head">
        <h2 className="v-dl-title">{page.title}</h2>
        {page.summary ? <p className="v-dl-summary">{page.summary}</p> : null}
        {page.status === "draft" ? (
          <p className="v-dl-draft">Draft — only you can see this</p>
        ) : null}
      </header>

      {data.locked ? (
        <>
          <p className="v-dl-empty">
            This page is behind a code. If you've been sent one, put it in below.
          </p>
          <CodeBox onRedeemed={setTicket} />
        </>
      ) : (
        <>
          {page.notice ? (
            <aside className="v-dl-notice">
              <h3 className="v-dl-notice-title">Before you download</h3>
              <p className="v-dl-notice-body">{page.notice}</p>
            </aside>
          ) : null}

          {anyWindows ? (
            <aside className="v-dl-notice">
              <h3 className="v-dl-notice-title">{UNSIGNED_NOTICE.title}</h3>
              <p className="v-dl-notice-body">{UNSIGNED_NOTICE.body}</p>
            </aside>
          ) : null}

          {/*
            * The controls sit **directly above the files and below the prose**,
            * because they are a control for the list and not a header for the
            * page. Rendered above the intro they read as a toolbar the page is
            * wearing, and they push the operator's own first sentence — the one
            * thing on the page written by a person — below a row of widgets.
            *
            * On the free-form look they go above the blocks instead: there the
            * prose and the file groups are interleaved by the operator, so
            * there is no "below the prose" to be in.
            */}
          {showFilters && layout === "blocks" ? (
            <FilterBar
              files={files}
              category={category}
              platform={platform}
              sort={activeSort}
              showIcons={showIcons}
              showPrices={showPrices}
              asChips={band !== "phone"}
              query={query}
              showSearch={showSearch}
              onQuery={setQuery}
              onCategory={setCategory}
              onPlatform={setPlatform}
              onSort={setSort}
            />
          ) : null}

          {layout === "blocks" ? (
            /*
             * The free-form layout. Four kinds, no markup, no nesting — see the
             * migration for why raw HTML from an admin box is not on offer.
             * Paragraphs split on blank lines so a long `text` block reads as
             * prose rather than as one slab.
             */
            blocks.map((block, i) => {
              if (block.kind === "heading") {
                return (
                  <h3 className="v-dl-block-head" key={i}>
                    {block.body}
                  </h3>
                );
              }
              if (block.kind === "list") {
                return (
                  <ul className="v-dl-block-list" key={i}>
                    {block.body
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                  </ul>
                );
              }
              if (block.kind === "files") {
                const group = inGroup(block.group || "");
                // A group with nothing in it renders nothing, exactly as an
                // empty group always has. When the *filter* is what emptied it,
                // `nothingMatched` below explains it once for the whole page
                // rather than once per block.
                if (!group.length) return null;
                return (
                  <ul className="v-dl-list" key={i}>
                    {rowsOf(group)}
                  </ul>
                );
              }
              return (
                <div className="v-dl-block-text" key={i}>
                  {block.body
                    .split(/\n{2,}/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, j) => (
                      <p key={j}>{para}</p>
                    ))}
                </div>
              );
            })
          ) : null}

          {/* The free-form look's own filtered-to-nothing state, outside the
              block map so it is said once for the page rather than once per
              empty group. */}
          {layout === "blocks" && files.length > 0 && shown.length === 0 ? nothingMatched : null}

          {layout === "blocks" ? null : (
            <>
              {page.intro ? (
                <div className="v-dl-intro">
                  {page.intro
                    .split(/\n{2,}/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>
              ) : null}

              {showFilters ? (
                <FilterBar
                  files={files}
                  category={category}
                  platform={platform}
                  sort={activeSort}
                  showIcons={showIcons}
                  showPrices={showPrices}
                  asChips={band !== "phone"}
                  query={query}
                  showSearch={showSearch}
                  onQuery={setQuery}
                  onCategory={setCategory}
                  onPlatform={setPlatform}
                  onSort={setSort}
                />
              ) : null}

              {shown.length ? (
                <ul className="v-dl-list">{rowsOf(shown)}</ul>
              ) : files.length ? (
                nothingMatched
              ) : (
                <p className="v-dl-empty">Nothing on this page yet.</p>
              )}
            </>
          )}

          {/* Only when something here actually needs one. A code box on a page
              of free files is a lock on an open door. Asked of every file rather
              than of the filtered view, so filtering cannot hide the way in. */}
          {files.some((f) => !f.unlocked) ? <CodeBox onRedeemed={setTicket} /> : null}
        </>
      )}

      <p className="v-dl-back">
        <button type="button" className="v-btn v-btn-quiet" onClick={() => go("downloads")}>
          All downloads
        </button>
      </p>
    </section>
  );
}
