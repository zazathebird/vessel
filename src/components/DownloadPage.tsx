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
 */

import { useEffect, useState } from "react";
import { api, ApiError } from "../auth/api";
import type { DownloadFileInfo, DownloadPageBody } from "../auth/api";
import { useConfig } from "../config/ConfigContext";
import { PLATFORM_LABEL, UNSIGNED_NOTICE } from "../data/downloads";
import type { DownloadPlatform } from "../data/downloads";
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

function FileRow({ item, ticket }: { item: DownloadFileInfo; ticket: string | null }) {
  return (
    <li className={`v-dl-item${item.unlocked ? " is-open" : ""}`}>
      <div className="v-dl-main">
        <h3 className="v-dl-name">{item.name}</h3>
        {item.blurb ? <p className="v-dl-blurb">{item.blurb}</p> : null}
        {item.author ? <p className="v-dl-attrib">Written by {item.author}, not me.</p> : null}
        {item.caveat ? <p className="v-dl-caveat">{item.caveat}</p> : null}
      </div>

      {/* The manifest line. Real facts about a real file, in the order somebody
          scanning actually wants them: can I run it, which one is it, how big. */}
      <p className="v-dl-meta">
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
  const { go } = useConfig();
  const [ticket, setTicket] = useState<string | null>(() => readTicket());
  const [data, setData] = useState<DownloadPageBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
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
  const files = data.files ?? [];
  const blocks = data.blocks ?? [];
  // The unsigned-binary notice appears only when this page actually holds a
  // Windows binary. A standing warning about a file that is not on the page is
  // the kind of boilerplate people learn to scroll past — and this is the one
  // notice on the site that must not be scrolled past.
  const anyWindows = files.some((f) => f.platform === "windows");
  const layout = ["list", "cards", "sheet", "blocks"].includes(page.layout) ? page.layout : "list";

  /** Files in a named group, or the ungrouped ones for the default group. */
  const inGroup = (group: string) => files.filter((f) => (f.group || "") === group);

  return (
    <section className={`v-downloads v-dl-page dl-${layout}`}>
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
                if (!group.length) return null;
                return (
                  <ul className="v-dl-list" key={i}>
                    {group.map((f) => (
                      <FileRow item={f} ticket={ticket} key={f.id} />
                    ))}
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
          ) : (
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

              {files.length ? (
                <ul className="v-dl-list">
                  {files.map((f) => (
                    <FileRow item={f} ticket={ticket} key={f.id} />
                  ))}
                </ul>
              ) : (
                <p className="v-dl-empty">Nothing on this page yet.</p>
              )}
            </>
          )}

          {/* Only when something here actually needs one. A code box on a page
              of free files is a lock on an open door. */}
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
