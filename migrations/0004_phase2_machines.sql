-- Phase 2 — machines and drives (SPEC-ACCOUNTS.md §9, §13).
--
-- Deliberately does NOT create grants or invites. Those are phase 3, and the
-- phases must not collapse (§7): an empty `grants` table sitting in the schema
-- is an invitation to start filling it before the phase that hardens it.
--
-- No filesystem path and no hostname is stored in either table (§9): the
-- directory handle and its absolute path live only in the sharing tab's
-- IndexedDB, and `machines.name` is typed by the owner, never suggested.

PRAGMA foreign_keys = ON;

-- Machines ------------------------------------------------------------------
--
-- A "machine" is a paired browser profile (§12 M) — the machine keypair and
-- the directory handles live in profile storage. `agent_pubkey` is the public
-- half of the P-256 key the agent tab generated at pairing; the browsing tab
-- verifies the agent's signed DTLS fingerprint against it (§3, §13). The
-- private half never reaches the server in any form.
CREATE TABLE machines (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  agent_pubkey  BLOB NOT NULL,
  paired_at     INTEGER NOT NULL,
  -- Stamped by the Worker when the agent's signalling socket connects, so its
  -- granularity is connection events, not liveness (§12 N). Liveness itself is
  -- the Durable Object's socket state and is persisted nowhere.
  last_seen     INTEGER
);

CREATE INDEX idx_machines_owner ON machines (owner_id);

-- Two machines with the same name on one account is a list that looks like a
-- bug; the handler checks case-insensitively (like setups) and this backstops
-- the race.
CREATE UNIQUE INDEX idx_machines_owner_name ON machines (owner_id, name);

-- Drives --------------------------------------------------------------------
--
-- Several per machine (§8). The label is a display name the owner types; the
-- server never learns which folder it is or where it lives. A breach of this
-- table reveals that someone shared *a* folder called "Invoices", not where it
-- is or whose machine holds it (§9).
CREATE TABLE drives (
  id          TEXT PRIMARY KEY,
  machine_id  TEXT NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_drives_machine ON drives (machine_id);
