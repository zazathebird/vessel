/**
 * Minting and revoking download access codes (2026-08-19). Operator only.
 *
 * THE ONE THING THAT MATTERS HERE: **a code is shown once and is then
 * unrecoverable.** The Worker stores an HMAC, exactly as it does for passwords
 * and recovery codes, so nobody — the operator included — can read a code back
 * out of the database. That is the whole reason a leaked database is worthless,
 * and it means this screen has to hand the plain code over carefully: it stays
 * on screen until dismissed, with a copy button, and the interface says plainly
 * that it will not be shown again. Losing one before sending it costs a revoke
 * and a re-mint, which is two clicks.
 *
 * THE SECOND THING: **the label is free text and is the one field that could
 * break the no-personal-data promise.** `migrations/0005_downloads.sql` has the
 * long version. The placeholder and the hint here steer towards a date and an
 * amount, because "e-transfer, 19 Aug, $40" identifies the row perfectly
 * without identifying a person, and a field with no guidance is a field
 * somebody types a customer's email into.
 */

import { useEffect, useState } from "react";
import { api, ApiError } from "../auth/api";
import type { DownloadCodeRow, DownloadPageSummary } from "../auth/api";
import { useConfig } from "../config/ConfigContext";

function day(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

/** What a row is *doing*, in one word, because six columns of state is a report. */
function state(row: DownloadCodeRow): { label: string; tone: string } {
  if (row.revoked_at) return { label: "revoked", tone: "is-dead" };
  if (row.expires_at && row.expires_at < Date.now()) return { label: "expired", tone: "is-dead" };
  if (row.uses >= row.max_uses) return { label: "used up", tone: "is-dead" };
  return { label: `${row.max_uses - row.uses} left`, tone: "is-live" };
}

export function DownloadCodes() {
  const { say } = useConfig();
  const [codes, setCodes] = useState<DownloadCodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("");
  /*
   * The scope, which is now a **page** rather than a catalogue entry: the
   * catalogue moved to D1 on 2026-08-20 and pages are the unit an operator
   * thinks in when they are minting a code for somebody.
   */
  const [item, setItem] = useState("");
  const [pages, setPages] = useState<DownloadPageSummary[]>([]);
  const [maxUses, setMaxUses] = useState(5);
  const [days, setDays] = useState(0);

  /** The plaintext of the code just minted. Held in state and nowhere else. */
  const [fresh, setFresh] = useState<string | null>(null);

  async function refresh() {
    try {
      setCodes((await api.adminDownloadsList()).codes);
      setError(null);
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Could not load codes.");
    }
  }

  useEffect(() => {
    // The operator sees every page, live or draft, because `listPages` answers
    // with whatever the caller may see and they may see everything.
    void api
      .downloadPages()
      .then((r) => setPages(r.pages))
      .catch(() => setPages([]));
  }, []);

  useEffect(() => {
    void refresh();
  }, []);

  async function onMint(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.adminDownloadMint({
        label: label.trim(),
        item: null,
        slug: item || null,
        maxUses,
        days,
      });
      setFresh(result.code);
      setLabel("");
      await refresh();
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Could not mint a code.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(ref: string) {
    setBusy(true);
    try {
      await api.adminDownloadRevoke(ref);
      say("Code revoked.");
      await refresh();
    } catch (thrown) {
      setError(thrown instanceof ApiError ? thrown.message : "Could not revoke that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="v-dlcodes">
      <h2 className="v-account-title">Download codes</h2>

      {error ? (
        <p className="v-account-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Shown once. The panel stays until dismissed rather than fading, because
          a toast that carries an unrecoverable secret is a secret you lose by
          looking away. */}
      {fresh ? (
        <div className="v-dlcodes-fresh" role="status">
          <p className="v-dlcodes-fresh-label">
            Send this to the buyer. It will not be shown again.
          </p>
          <output className="v-dlcodes-fresh-code">{fresh}</output>
          <div className="v-dlcodes-fresh-actions">
            <button
              type="button"
              className="v-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(fresh).then(
                  () => say("Code copied."),
                  () => say("Could not copy — select it and copy by hand."),
                );
              }}
            >
              Copy
            </button>
            {/* Plain `.v-btn` — the only variants that exist are `-primary`
                and `-danger`, and dismissing a panel is neither. */}
            <button type="button" className="v-btn" onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <form className="v-dlcodes-form" onSubmit={onMint}>
        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlc-label">
            Note to yourself
          </label>
          <input
            id="v-dlc-label"
            className="v-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e-transfer, 19 Aug, $40"
            aria-describedby="v-dlc-label-hint"
          />
          <p className="v-dlcodes-hint" id="v-dlc-label-hint">
            A date and an amount is enough to find the row again. Don't put a name or an email
            here — this table deliberately holds nothing that identifies anyone, and this is the
            only field that could change that.
          </p>
        </div>

        <div className="v-field">
          <label className="v-field-label" htmlFor="v-dlc-item">
            Unlocks
          </label>
          <select
            id="v-dlc-item"
            className="v-input"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          >
            <option value="">Everything paid</option>
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="v-field-hint">
            A whole page, or everything. To scope a code to one single file, mint it from that
            file's row in the downloads editor — that is the screen where the file is in front of
            you, and a code pointed at the wrong id is only discovered by the customer.
          </p>
        </div>

        <div className="v-dlcodes-row">
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlc-uses">
              Uses
            </label>
            <input
              id="v-dlc-uses"
              className="v-input"
              type="number"
              min={1}
              max={50}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </div>
          <div className="v-field">
            <label className="v-field-label" htmlFor="v-dlc-days">
              Expires in (days, 0 = never)
            </label>
            <input
              id="v-dlc-days"
              className="v-input"
              type="number"
              min={0}
              max={3650}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
        </div>

        <button type="submit" className="v-btn" disabled={busy}>
          {busy ? "Working…" : "Mint a code"}
        </button>
      </form>

      {codes === null ? (
        <p className="v-account-note">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="v-account-note">No codes yet.</p>
      ) : (
        <ul className="v-admin-list">
          {codes.map((row) => {
            const st = state(row);
            return (
              <li key={row.ref} className="v-admin-row">
                <div className="v-admin-who">
                  <span className="v-admin-handle">{row.label || "(no note)"}</span>
                  <span className="v-admin-facts">
                    {row.ref} · {row.item_id ?? "everything paid"} · made {day(row.created_at)}
                    {row.last_used_at ? ` · last used ${day(row.last_used_at)}` : ""}
                  </span>
                </div>
                <div className="v-admin-actions">
                  <span className={`v-dlcodes-state ${st.tone}`}>{st.label}</span>
                  {row.revoked_at ? null : (
                    <button
                      type="button"
                      className="v-btn v-btn-danger"
                      disabled={busy}
                      onClick={() => void onRevoke(row.ref)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
