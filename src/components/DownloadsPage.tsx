/**
 * The downloads page (2026-08-19, client request).
 *
 * THE DESIGN, and why it is not a shop.
 *
 * The template answer for "sell some software" is a card grid with a price and
 * a Buy button, and every part of that is wrong here. There is no checkout —
 * the client is paid by e-transfer and hands over a code — so a Buy button
 * would be a lie about what happens next. And this site names no figures by
 * decision: the one page that quotes a rate quotes the client's own words, and
 * everything else refuses to be a price list.
 *
 * So the structure is taken from what these things honestly are: **files**.
 * Each row reads like a line out of a manifest — name, what it runs on, its
 * version, its weight — because that is the information somebody scanning
 * actually wants, and because the operator's own world is directory listings
 * and mono type. The site already has a Terminal layout and a `ready` caret; a
 * manifest is native here in a way a product card is not.
 *
 * The one structural flourish is the **lock state**, and it earns its place by
 * carrying real information: a row is open, or it is not, and redeeming a code
 * changes rows from one to the other in place. That is the page's single
 * moment, so everything else stays quiet — no per-row art, no badges, no
 * numbering. A catalogue is not a sequence, so `01 / 02 / 03` would be
 * decoration pretending to be structure, which is exactly what `.v-block-idx`
 * is for on pages where the order does mean something.
 *
 * NO LITERAL COLOURS, per the site's rule — every value is a palette token, so
 * this page bleeds with the rest of the site.
 */

import { useMemo, useState } from "react";
import { api, ApiError } from "../auth/api";
import { useConfig } from "../config/ConfigContext";
import { DOWNLOADS, PLATFORM_LABEL, UNSIGNED_NOTICE } from "../data/downloads";
import type { DownloadItem } from "../data/downloads";

/**
 * The href for an item. Free items need no ticket; paid ones carry the one the
 * claim minted.
 *
 * A plain URL on a plain anchor, deliberately — see `api.ts`. The Worker
 * answers with `content-disposition: attachment`, so the browser saves it,
 * shows its own progress, and can resume if the line drops. Nothing is
 * buffered into the tab and no `blob:` is constructed.
 */
function hrefFor(item: DownloadItem, ticket: string | null): string {
  const base = `/api/downloads/file?item=${encodeURIComponent(item.id)}`;
  return item.free || !ticket ? base : `${base}&t=${encodeURIComponent(ticket)}`;
}

export function DownloadsPage() {
  const { say } = useConfig();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);

  const paid = useMemo(() => DOWNLOADS.filter((d) => !d.free), []);
  // The unsigned-binary notice appears only when the catalogue actually holds a
  // Windows binary. A standing warning about a file that is not on the page is
  // the kind of boilerplate people learn to scroll past — and this is the one
  // notice on the site that must not be scrolled past.
  const anyWindows = useMemo(() => DOWNLOADS.some((d) => d.platform === "windows"), []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.downloadClaim(code);
      setTicket(result.ticket);
      setOpened(result.items);
      setCode("");
      // The count matters to the person: a code with one use left is a thing to
      // be careful with, and finding that out at the moment it stops working is
      // worse than being told now.
      say(
        result.items.length === 1
          ? `Unlocked. ${result.usesLeft} use${result.usesLeft === 1 ? "" : "s"} left on that code.`
          : `Unlocked ${result.items.length} downloads. ${result.usesLeft} use${result.usesLeft === 1 ? "" : "s"} left.`,
      );
    } catch (thrown) {
      setError(
        thrown instanceof ApiError
          ? thrown.message
          : "Something went wrong. Try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (DOWNLOADS.length === 0) {
    // An empty screen is an invitation to act, not an apology. It points at the
    // one thing a visitor can usefully do, which is ask.
    return (
      <section className="v-downloads" aria-labelledby="v-dl-empty">
        <p className="v-dl-empty" id="v-dl-empty">
          Nothing here yet. There will be — small tools I've written for jobs that kept coming
          back. If you're after something in particular, ask me and I'll tell you whether it
          exists.
        </p>
      </section>
    );
  }

  return (
    <section className="v-downloads">
      {anyWindows ? (
        <aside className="v-dl-notice">
          <h2 className="v-dl-notice-title">{UNSIGNED_NOTICE.title}</h2>
          <p className="v-dl-notice-body">{UNSIGNED_NOTICE.body}</p>
        </aside>
      ) : null}

      {paid.length > 0 ? (
        // The site's form convention: one `<form>`, an `onSubmit` that prevents
        // default, and a `type="submit"` button — so Enter and the button are
        // one code path rather than two that can drift.
        <form className="v-dl-code" onSubmit={onSubmit}>
          <label className="v-field-label" htmlFor="v-dl-code-input">
            Access code
          </label>
          <div className="v-share-row">
            <input
              id="v-dl-code-input"
              className="v-input v-dl-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="v-dl-code-hint"
            />
            <button type="submit" className="v-btn" disabled={busy || !code.trim()}>
              {busy ? "Checking…" : "Unlock"}
            </button>
          </div>
          <p className="v-dl-code-hint" id="v-dl-code-hint">
            Paid for one of these? Send me an e-transfer and I'll send a code back. Capitals,
            hyphens and the letter O all sort themselves out — type it however it arrived.
          </p>
          {error ? (
            <p className="v-dl-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <ul className="v-dl-list">
        {DOWNLOADS.map((item) => {
          const unlocked = Boolean(item.free) || opened.includes(item.id);
          return (
            <li className={`v-dl-item${unlocked ? " is-open" : ""}`} key={item.id}>
              <div className="v-dl-main">
                <h2 className="v-dl-name">{item.name}</h2>
                <p className="v-dl-blurb">{item.blurb}</p>
                {item.author ? (
                  <p className="v-dl-attrib">Written by {item.author}, not me.</p>
                ) : null}
                {item.caveat ? <p className="v-dl-caveat">{item.caveat}</p> : null}
              </div>

              {/* The manifest line. Real facts about a real file, in the order
                  somebody scanning actually wants them: can I run it, which
                  one is it, how big. */}
              <p className="v-dl-meta">
                <span className="v-dl-platform">{PLATFORM_LABEL[item.platform]}</span>
                <span className="v-dl-dot" aria-hidden="true">
                  ·
                </span>
                <span>{item.version}</span>
                <span className="v-dl-dot" aria-hidden="true">
                  ·
                </span>
                <span>{item.size}</span>
              </p>

              <div className="v-dl-action">
                {unlocked ? (
                  // One word on both paths, and not "Get it free" on the free
                  // ones: the label names the action, and the action is the
                  // same. Whether it cost anything is already settled by the
                  // time this is on screen.
                  <a className="v-btn v-dl-get" href={hrefFor(item, ticket)}>
                    Download
                  </a>
                ) : (
                  // Not a disabled button: there is nothing to press, and a
                  // disabled control invites pressing. It states the condition
                  // instead, which is what the reader needs to know.
                  <p className="v-dl-locked">Needs a code</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
