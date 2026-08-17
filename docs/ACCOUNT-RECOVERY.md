# Getting back in

Written 2026-08-16, when the operator forgot the password to the only operator account and asked
for a password-reset feature to be built. **One already exists and a second must not be**, so this
is the runbook instead. Everything here was verified against the live schema and the real Worker
code on the day it was written; nothing is from memory.

The paths are in order. Stop at the first one that works.

---

## 0. First, see what the account actually has

You cannot recover what you cannot see, and every decision below depends on which credentials
survive. **Cloudflare dashboard → Workers & Pages → D1 → `vessel` → Console**, and run:

```sql
SELECT a.handle,
       a.is_operator,
       a.reset_at,
       c.kind,
       c.label,
       c.used_at        -- non-NULL on a recovery code means it is spent
  FROM accounts a
  LEFT JOIN credentials c ON c.account_id = a.id
 ORDER BY a.handle, c.kind;
```

And, because it decides whether a sign-in will ask for a six-digit code:

```sql
SELECT account_id, confirmed_at FROM totp;
```

**Read it like this.** `kind = 'recovery'` rows with `used_at` NULL are unspent recovery codes —
that is path 1 and you are fine. A `kind = 'passkey'` row is path 2. A confirmed `totp` row means
sign-in has a second stage; **no row, or `confirmed_at` NULL, means there is no TOTP stage at all**
(the Worker only demands one when `confirmed_at IS NOT NULL`).

> The `wrangler d1 execute --remote` route needs an API token with D1 read permission. The token in
> this repo can deploy but **cannot** query D1 — it returns *"not authorized to access this service
> [code: 7403]"*. Use the dashboard console rather than chasing that.

---

## 1. A recovery code — the designed answer

**Ten are issued at signup.** They are the password reset, and they are better than one: each code
is a credential in its own right with its own key slot, so redeeming one restores grant authority in
full instead of merely letting you back in.

On `/signin`, enter the handle and paste a code where the password goes — the form recognises the
shape and switches to the recovery flow itself (`looksLikeRecoveryCode`). It signs you in **and**
hands you a set-password screen, because `completeSignIn` mints a single-use `set-password` ticket
on the recovery path only.

They are Crockford base32 — digits and uppercase letters with `I` and `L` removed — chosen for
transcription because they are meant to live on paper. Look wherever you put them at signup.

## 2. A passkey

If one was registered, it signs in with **no password and no TOTP stage**: user verification is
itself the second factor, and `verifyAssertion` refuses an assertion without the UV flag. Nothing
else is needed.

## 3. No credentials left — make a new operator, do not patch the site

This is the owner-level path, and it is legitimate precisely because it is **not** a product
feature: it needs control of the Cloudflare account, it is not reachable over HTTP, and it leaves
no bypass in the codebase.

1. **Sign up normally** at `/signup`. The route is live and unlinked, exactly as designed.
2. **A brand-new account signs in with the password alone** — no TOTP until you enrol one, per the
   query above. So do not enrol TOTP until you are certain the password is saved somewhere.
3. **Promote it**, in the D1 console:

   ```sql
   SELECT handle, is_operator FROM accounts;                       -- confirm the handle first
   UPDATE accounts SET is_operator = 1 WHERE handle_lower = 'yournewhandle';
   ```

   `handle_lower` is the lookup key — handles are case-preserving but matched case-insensitively,
   so match on the lower-cased column and pass a lower-cased value.
4. **Save the ten recovery codes this time.** That is the entire reason this document exists.

### What you lose, and why it is nothing today

The old account's grant key is sealed once its last credential is gone. That sounds worse than it
is: **the grant key only signs phase-3 file-access grants, and grants do not exist yet** — the
`grants` table is deliberately absent from `migrations/`, because an empty grants table is an
invitation to fill it before the phase that hardens it. Nothing in the site as it stands today reads
that key. So a fresh operator account costs you a handle and nothing else.

### Do not expect the admin reset to rescue the old account

`admin.resetPassword` deletes the password credential and its key slot, and every write is guarded
in its own `WHERE` clause by "another openable slot still exists". With no recovery codes and no
passkey there is no other slot, so the guard **refuses** and `meta.changes` is zero. That is correct:
deleting the last openable slot is account destruction under a milder name. The refusal is the
feature, not an obstacle to route around.

---

## Why a bespoke "reset for me only" was declined

Recorded so it does not get proposed again as if it were new.

- **It cannot be scoped to one person.** The server cannot distinguish the owner from anyone holding
  what the owner holds. A path in is a path in, and it would sit permanently in a codebase whose
  accounts design exists specifically to not have one.
- **It would require escrow, which §5 rejects permanently.** To hand back a working account the
  server would have to hold something that opens the key slot — and a slot wrapped to an operator
  key lets whoever holds that key sign grants in a user's name, which is the exact thing the design
  exists to prevent. The alternative is handing back an account whose grant key is sealed, which is
  what path 3 already does, without new code.
- **There is no email to send a reset to, by design.** §9 collects none, which is *why* there is no
  email reset. Adding one is a spec change to the personal-data inventory, not a feature.

The honest gap this leaves is real and worth naming: **a sole operator who loses their password,
their recovery codes and their passkey has no in-product way back.** That is a deliberate trade —
the same property that makes operator reset safe makes self-rescue impossible — and the mitigation
is the ten codes, which is why path 1 leads and why step 4 of path 3 is written in bold.
