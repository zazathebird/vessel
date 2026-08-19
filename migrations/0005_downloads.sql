-- 0005 — access codes for the downloads page (2026-08-19, client request).
--
-- WHAT THIS DELIBERATELY DOES NOT STORE, and why the list matters more than the
-- schema: no name, no email, no address, no payment reference, no IP, no
-- purchase record. SPEC-ACCOUNTS §9 keeps a full inventory of every personal
-- field the site holds, and this migration adds **nothing** to it. That is not
-- an accident of scope — it is the whole reason payment is taken out of band.
-- The client is paid by e-transfer in their own bank, which is where that
-- relationship already lives and where it should stay; the site never learns
-- who paid, only that *a* code was issued and later redeemed.
--
-- A code is therefore a bearer token, exactly like a cinema ticket. Whoever
-- holds it can use it, it is not tied to a person, and losing it is the
-- operator's problem to fix by minting another. That is a deliberate trade
-- against the alternative — accounts, which would mean collecting the identity
-- this design exists to avoid.

CREATE TABLE download_codes (
  -- HMAC of the code under AUTH_PEPPER, never the code itself. Same discipline
  -- as `credentials.auth_hash`: a database that leaks hands over nothing
  -- usable, and the operator cannot read a customer's code back out either --
  -- if they lose it, they mint a new one and revoke the old.
  code_hash BLOB PRIMARY KEY,

  -- The operator's own note, so a row is identifiable in the admin list.
  --
  -- FREE TEXT, AND THE ONE FIELD THAT COULD BREAK THE PROMISE ABOVE. Typing a
  -- customer's name or email here would put personal data in a table whose
  -- entire claim is that it holds none. The admin screen says so at the point
  -- of entry, and the suggested form is a date and an amount -- "e-transfer,
  -- 19 Aug, $40" identifies the row perfectly well without identifying a person.
  label TEXT NOT NULL DEFAULT '',

  -- NULL means every paid item; an id scopes the code to one. Not a foreign key
  -- on purpose: the catalogue lives in TypeScript (`src/data/downloads.ts`), so
  -- D1 has nothing to reference. The Worker validates the id against the real
  -- catalogue on redemption, which is where a stale scope surfaces honestly.
  item_id TEXT,

  created_at INTEGER NOT NULL,

  -- NULL means it never expires. An expiry is the gentler alternative to
  -- revocation for a code handed to somebody who then went quiet.
  expires_at INTEGER,

  -- Why a limit at all, when the buyer has paid: a code travels by email or
  -- text and ends up in somebody's sent items for ever. A small allowance
  -- covers a failed download, a second machine and a re-download next year,
  -- while a code posted to a forum stops working. The operator raises it or
  -- mints another; both are one click.
  max_uses INTEGER NOT NULL DEFAULT 5,
  uses INTEGER NOT NULL DEFAULT 0,

  -- Set rather than deleted, so a redemption count survives revocation and the
  -- operator can see that a code they killed had in fact been used twice first.
  revoked_at INTEGER,

  -- Coarse on purpose: the day, not the moment. Enough to answer "did this
  -- ever arrive?", not enough to build a picture of when somebody is at their
  -- computer. `credentials.last_used_at` set this precedent.
  last_used_at INTEGER
);

-- The admin list reads newest first and is the only query that is not by
-- primary key.
CREATE INDEX idx_download_codes_created ON download_codes (created_at DESC);
