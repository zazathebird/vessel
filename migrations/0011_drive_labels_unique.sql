-- Case-insensitive unique drive labels, per machine (2026-09-24).
--
-- `driveAdd` refused a label carrying invisible characters (`expectDisplayName`)
-- because two rows that render the same are the attack the setup-code decoder
-- exists to refuse — and then accepted the visible version of it: `Invoices`
-- and `invoices`, or `Invoices` twice, on one machine. The explorer lists drives
-- by label, and the agent tab's checklist matches folders to rows by label, so a
-- duplicate is a drive that can be opened by the wrong name or never at all.
-- This index is the guard; the handler turns a violation into a 409.
--
-- **Nothing here deletes a row**, for the reason 0009 gives: a unique index
-- cannot be created over duplicates, and a drive row is the key the agent tab
-- files a directory handle under, so deleting one silently detaches a folder
-- somebody shared. A rename costs the owner nothing but a look — the drive
-- still opens, under a name that says which one it was.
--
-- Production is not expected to hold a duplicate: on 2026-09-24 it held one
-- paired machine (TODO.md), and reaching one needed the owner to type the same
-- label twice. The rename below makes the migration safe whether or not that is
-- still true, rather than assuming it.
--
-- A "loser" is a row with a strictly earlier sibling of the same label on the
-- same machine, ordered by `(created_at, id)`; the earliest row in a group is
-- never renamed, so it stays a witness for every later row however SQLite
-- orders the visit. The suffix comes from the row's own id. 29 + 11 characters
-- is inside the handler's `NAME_MAX` of 40.

PRAGMA foreign_keys = ON;

UPDATE drives
   SET label = substr(label, 1, 29) || ' (' || substr(id, 1, 8) || ')'
 WHERE EXISTS (
         SELECT 1
           FROM drives o
          WHERE o.machine_id = drives.machine_id
            AND o.id <> drives.id
            AND o.label = drives.label COLLATE NOCASE
            AND (o.created_at < drives.created_at
                 OR (o.created_at = drives.created_at AND o.id < drives.id))
       );

CREATE UNIQUE INDEX idx_drives_machine_label ON drives (machine_id, label COLLATE NOCASE);
