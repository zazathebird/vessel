/**
 * The downloads index (2026-08-19, rebuilt 2026-08-20 for operator sub-pages).
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
 * and mono type.
 *
 * WHAT CHANGED WHEN SUB-PAGES LANDED. This screen used to *be* the catalogue.
 * It is now the index to a set of pages the operator writes, and the manifest
 * moved into `DownloadPage`. The one thing that did not move is the code box:
 * a code can open a page, so it belongs where somebody who has just been sent
 * one arrives.
 *
 * NO LITERAL COLOURS, per the site's rule — every value is a palette token, so
 * this page bleeds with the rest of the site.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../auth/api";
import type { DownloadPageSummary } from "../auth/api";
import { useConfig } from "../config/ConfigContext";
import { DownloadPage } from "./DownloadPage";

/**
 * The redeemed ticket, kept for the tab's lifetime.
 *
 * `sessionStorage`, not `localStorage` and not component state. Component state
 * loses it the moment somebody follows a link from the index into the page the
 * code just opened, which is the one journey this feature exists for.
 * `localStorage` would keep a capability on a shared machine long after the
 * person who earned it walked away — and the ticket expires in half an hour
 * anyway, so persisting it past the tab buys nothing but that risk.
 *
 * This is deliberately **not** in `config`: the two stored settings are the two
 * a visitor can set for themselves (`vessel.calm.v1`, `vessel.sound.v1`), and
 * that rule is worth more than the convenience of one more key in one place.
 */
const TICKET_KEY = "vessel.dlticket.v1";

export function readTicket(): string | null {
  try {
    return window.sessionStorage.getItem(TICKET_KEY);
  } catch {
    // Private browsing modes throw rather than returning null. A visitor with no
    // storage simply re-enters the code on the next page, which is a worse day
    // than the alternative but not a broken one.
    return null;
  }
}

function writeTicket(ticket: string): void {
  try {
    window.sessionStorage.setItem(TICKET_KEY, ticket);
  } catch {
    /* see readTicket */
  }
}

/** The site's own wording for sizes. Bytes come from R2; a human reads this. */
export function formatSize(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)}${units[i]}`;
}

/**
 * The code box, shared by the index and by a locked page.
 *
 * One `<form>`, an `onSubmit` that prevents default, and a `type="submit"`
 * button — the site's convention, so Enter and the button are one code path
 * rather than two that can drift.
 */
export function CodeBox({ onRedeemed }: { onRedeemed: (ticket: string) => void }) {
  const { say } = useConfig();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.downloadClaim(code);
      writeTicket(result.ticket);
      setCode("");
      // The count matters to the person: a code with one use left is a thing to
      // be careful with, and finding that out at the moment it stops working is
      // worse than being told now.
      say(`Unlocked. ${result.usesLeft} use${result.usesLeft === 1 ? "" : "s"} left on that code.`);
      onRedeemed(result.ticket);
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Something went wrong. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
        Paid for something here? Send me an e-transfer and I'll send a code back. Capitals, hyphens
        and the letter O all sort themselves out — type it however it arrived.
      </p>
      {error ? (
        <p className="v-dl-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function DownloadsPage() {
  const { sub, go } = useConfig();
  const [pages, setPages] = useState<DownloadPageSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ticket, setTicket] = useState<string | null>(() => readTicket());

  const load = useCallback(async (t: string | null) => {
    try {
      const result = await api.downloadPages(t);
      setPages(result.pages);
      setFailed(false);
    } catch {
      // §11: everything degrades. A Worker that is down leaves a page that says
      // so rather than a spinner that never stops.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (sub) return;
    void load(ticket);
  }, [load, sub, ticket]);

  // One route in the site has something after it, and this is it. Rendered here
  // rather than in `App.tsx` so the whole downloads surface — index, sub-page
  // and the ticket they share — stays in one place.
  if (sub) return <DownloadPage slug={sub} />;

  if (failed) {
    return (
      <section className="v-downloads">
        <p className="v-dl-empty">
          I can't reach the list of files just now. That's my end, not yours — try again in a minute.
        </p>
      </section>
    );
  }

  if (pages === null) {
    return (
      <section className="v-downloads">
        <p className="v-dl-empty" aria-live="polite">
          Fetching the list…
        </p>
      </section>
    );
  }

  if (pages.length === 0) {
    // An empty screen is an invitation to act, not an apology. It points at the
    // one thing a visitor can usefully do, which is ask.
    return (
      <section className="v-downloads" aria-labelledby="v-dl-empty">
        <p className="v-dl-empty" id="v-dl-empty">
          Nothing here yet. There will be — small tools I've written for jobs that kept coming back.
          If you're after something in particular, ask me and I'll tell you whether it exists.
        </p>
      </section>
    );
  }

  return (
    <section className="v-downloads">
      <ul className="v-dl-index">
        {pages.map((p) => (
          <li className={`v-dl-card${p.locked ? "" : " is-open"}`} key={p.slug}>
            <a
              className="v-dl-card-link"
              href={`/downloads/${p.slug}`}
              onClick={(e) => {
                // A real href, intercepted — so middle-click, "open in new tab"
                // and a right-click copy all still do what they should, and the
                // in-page navigation keeps the stage dive.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go("downloads", p.slug);
              }}
            >
              <h2 className="v-dl-card-title">{p.title}</h2>
              {p.summary ? <p className="v-dl-card-summary">{p.summary}</p> : null}
            </a>
            {p.status !== "live" ? <p className="v-dl-draft">Draft — only you can see this</p> : null}
          </li>
        ))}
      </ul>

      <CodeBox onRedeemed={setTicket} />
    </section>
  );
}
