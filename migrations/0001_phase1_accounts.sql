-- Phase 1 — accounts, credentials, key slots, two-factor, saved setups, audit.
--
-- Deliberately does NOT create machines, drives, grants or invites. Those are
-- phases 2 and 3, and the spec is explicit that the phases must not collapse
-- into each other (SPEC-ACCOUNTS.md §7). An empty `grants` table sitting in the
-- schema is an invitation to start filling it.
--
-- Timestamps are INTEGER unix epoch milliseconds throughout — no locale, no
-- timezone, no string parsing.

PRAGMA foreign_keys = ON;

-- Accounts ------------------------------------------------------------------
--
-- No email, no name, no date of birth, no IP. `handle` is the only field that
-- can carry a real name, and only if the user types one (§9, inventory).
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL,
  handle_lower  TEXT NOT NULL,            -- lookup key; handles are case-preserving, case-insensitive
  created_at    INTEGER NOT NULL,
  -- The account's grant public key. The PRIVATE half never reaches the server;
  -- it arrives only as ciphertext, once per credential, in key_slots.
  grant_pubkey  BLOB,
  is_operator   INTEGER NOT NULL DEFAULT 0,
  -- Set when the operator resets this account's password. Read by the sign-in
  -- screen to disclose the reset to the user. Dropping it makes the reset
  -- silent, which §4 forbids.
  reset_at      INTEGER
);

CREATE UNIQUE INDEX idx_accounts_handle_lower ON accounts (handle_lower);

-- Credentials ---------------------------------------------------------------
--
-- One table for all three kinds, because §5 treats them uniformly: every
-- credential owns exactly one key slot. The type-specific columns are nullable
-- and guarded by CHECK constraints rather than split across three tables,
-- which would make "does this account have any credential left?" a three-way
-- union on every delete.
CREATE TABLE credentials (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('password', 'passkey', 'recovery')),
  label           TEXT,
  created_at      INTEGER NOT NULL,
  last_used_at    INTEGER,

  -- kind = 'password'. auth_hash is HMAC-SHA-256(server_pepper, auth_secret),
  -- where auth_secret is itself PBKDF2 output from the browser. The password
  -- never reaches the server in any form (§4).
  auth_hash       BLOB,
  kdf_salt        BLOB,
  kdf_iterations  INTEGER,

  -- kind = 'passkey'
  credential_id   BLOB,
  public_key      BLOB,
  sign_count      INTEGER,

  -- kind = 'recovery'
  code_hash       BLOB,
  used_at         INTEGER,

  CHECK (kind <> 'password' OR (auth_hash IS NOT NULL AND kdf_salt IS NOT NULL AND kdf_iterations IS NOT NULL)),
  CHECK (kind <> 'passkey'  OR (credential_id IS NOT NULL AND public_key IS NOT NULL)),
  CHECK (kind <> 'recovery' OR code_hash IS NOT NULL)
);

CREATE INDEX idx_credentials_account ON credentials (account_id);

-- A passkey credential id is globally unique and is how sign-in finds the
-- account, so it is indexed rather than scanned. Partial index: only passkey
-- rows have one, and SQLite would otherwise collapse every NULL into a
-- uniqueness conflict-free free-for-all we cannot query.
CREATE UNIQUE INDEX idx_credentials_passkey ON credentials (credential_id)
  WHERE credential_id IS NOT NULL;

-- An account has at most one password. Recovery codes and passkeys may be many.
CREATE UNIQUE INDEX idx_credentials_one_password ON credentials (account_id)
  WHERE kind = 'password';

-- Key slots -----------------------------------------------------------------
--
-- The load-bearing idea (§5). ONE grant keypair per account, wrapped once per
-- credential. Any credential opens the same key; losing one slot costs nothing
-- while another survives. This is why operator reset is safe: it deletes the
-- password slot and cannot open it.
--
-- Its own table, not a column on accounts, so that slot lifetime follows
-- credential lifetime — add a passkey, gain a slot; reset a password, lose
-- exactly one.
CREATE TABLE key_slots (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  credential_id     TEXT NOT NULL REFERENCES credentials (id) ON DELETE CASCADE,
  wrapped_grant_key BLOB NOT NULL,        -- ciphertext the server cannot open
  alg               TEXT NOT NULL,        -- e.g. 'AES-KW/HKDF-SHA-256'
  created_at        INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_key_slots_credential ON key_slots (credential_id);
CREATE INDEX idx_key_slots_account ON key_slots (account_id);

-- Two-factor ----------------------------------------------------------------
--
-- TOTP only. No SMS, so no phone number (§12 A). Optional per account, and
-- mandatory once an account has issued a grant — enforced in phase 3, where
-- grants first exist.
CREATE TABLE totp (
  account_id         TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  secret_enc         BLOB NOT NULL,
  confirmed_at       INTEGER,             -- NULL until the first correct code proves enrolment worked
  backup_codes_hash  TEXT NOT NULL,       -- JSON array of hashes; single-use, struck as they are spent
  created_at         INTEGER NOT NULL
);

-- Saved setups --------------------------------------------------------------
--
-- The genuinely small half of phase 1. The site already encodes an entire
-- setup as a six-field share code, so a setup is a name and that string.
-- Applying one behaves exactly like pasting a code today, including pinning
-- the randomiser to static (shareCode.ts:66).
CREATE TABLE setups (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  share_code  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_setups_account ON setups (account_id);
CREATE UNIQUE INDEX idx_setups_name ON setups (account_id, name);

-- Audit ---------------------------------------------------------------------
--
-- Append-only. Actor and action, never origin: no IP address, no user agent
-- (§9). This is the record that catches a compromised frontend, and in phase 3
-- the agent keeps its own copy outside the site's reach.
CREATE TABLE audit (
  id        TEXT PRIMARY KEY,
  actor_id  TEXT REFERENCES accounts (id) ON DELETE SET NULL,
  action    TEXT NOT NULL,
  target    TEXT,
  at        INTEGER NOT NULL
);

CREATE INDEX idx_audit_actor ON audit (actor_id, at);
