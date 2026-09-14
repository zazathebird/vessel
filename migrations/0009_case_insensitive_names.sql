-- Case-insensitive unique names for machines and setups.
--
-- Both handlers check for a duplicate name with `COLLATE NOCASE` and then lean
-- on a unique index to close the race the check-then-act leaves open — the
-- shape `pair()`, `rename()` and `setups.save()` all document. The index they
-- leaned on collated BINARY, so it closed a *different* race than the one the
-- pre-check describes: two concurrent saves of the exact same string were
-- refused, and `Study` racing `study` both passed the pre-check, both passed
-- the index, and both landed. The list the pre-check exists to keep sane is
-- then exactly the list it was written to prevent, and it can only be reached
-- by a race, which is to say it can only be reached by the thing the index is
-- for.
--
-- `rename()` gained the missing `try`/`catch` on 2026-09-14 so a collision
-- surfaces as a 409 rather than a 500. That was the half that could be done in
-- the handler; this is the other half.
--
-- **Nothing here deletes a row, and that is the decision.** A unique index
-- cannot be created over a table that already holds duplicates, so a migration
-- that only created the index would fail — loudly, at a keyboard, since
-- migrations are applied by `npm run db:migrate`, not by `npm run deploy` — and
-- leave the estate half-migrated with nothing said about what to do next. The
-- two ways out of that are to delete the losing rows or to rename them, and
-- deleting is not available here: a `machines` row is an agent's introduction
-- (removing it makes the owner re-pair a machine that is working) and a
-- `setups` row is a saved look that took somebody a while to build. Neither
-- carries authority (§9 — labels, not keys), so a rename costs the owner one
-- edit and is visible in the list the moment they open it, which is the whole
-- of the harm. Deleting would be silent and permanent.
--
-- Production almost certainly holds no duplicates: reaching one needs a race
-- against a pre-check on a table with a handful of rows. "Almost certainly" is
-- the reason this is written rather than the reason it is skipped — the
-- 2026-09-04 lesson about the download-code pin is that a carve-out for what is
-- assumed to be in a table wants the table checked, and this cannot check
-- production from here.

PRAGMA foreign_keys = ON;

-- Machines --------------------------------------------------------------------
--
-- A "loser" is a row with a strictly earlier sibling of the same name under the
-- same owner, ordered by `(paired_at, id)`. The earliest row in a group is
-- never renamed, which is what makes this independent of the order SQLite
-- happens to visit rows in: the predicate asks only about *earlier* rows, the
-- earliest is never rewritten, so it stays a witness for every later row in its
-- group however many of them are updated first.
--
-- The suffix comes from the row's own `id` rather than from a count over the
-- table being written, for the same reason: a `COUNT(*)` subquery would read a
-- table that this statement is halfway through changing. 29 + 11 characters
-- keeps the result inside the handlers' own `NAME_MAX` of 40, so the owner can
-- still save it back after editing it.
UPDATE machines
   SET name = substr(name, 1, 29) || ' (' || substr(id, 1, 8) || ')'
 WHERE EXISTS (
         SELECT 1
           FROM machines o
          WHERE o.owner_id = machines.owner_id
            AND o.id <> machines.id
            AND o.name = machines.name COLLATE NOCASE
            AND (o.paired_at < machines.paired_at
                 OR (o.paired_at = machines.paired_at AND o.id < machines.id))
       );

DROP INDEX idx_machines_owner_name;
CREATE UNIQUE INDEX idx_machines_owner_name ON machines (owner_id, name COLLATE NOCASE);

-- Setups ----------------------------------------------------------------------
--
-- Same shape, ordered by `(created_at, id)`.
--
-- **`setups.save`'s upsert names this index as its conflict target, and it was
-- moved with it — but not because it had to be.** Measured against this exact
-- migration: SQLite matches a conflict target that *omits* a collation to an
-- index that has one, so the old `ON CONFLICT (account_id, name)` kept working
-- and kept absorbing the race. The handler says `ON CONFLICT (account_id, name
-- COLLATE NOCASE)` anyway, so that reading the clause tells you what the index
-- is rather than leaving it to a matching rule that ignores half the index
-- definition — the next person to change a collation here should not have to
-- discover that by running it. A conflict target that named a column the index
-- does not have *would* throw, and that throw is a 500 on the one race the
-- upsert exists to absorb, so this is worth stating either way.
UPDATE setups
   SET name = substr(name, 1, 29) || ' (' || substr(id, 1, 8) || ')'
 WHERE EXISTS (
         SELECT 1
           FROM setups o
          WHERE o.account_id = setups.account_id
            AND o.id <> setups.id
            AND o.name = setups.name COLLATE NOCASE
            AND (o.created_at < setups.created_at
                 OR (o.created_at = setups.created_at AND o.id < setups.id))
       );

DROP INDEX idx_setups_name;
CREATE UNIQUE INDEX idx_setups_name ON setups (account_id, name COLLATE NOCASE);
