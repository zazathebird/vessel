# Break glass

The operator's recovery path when everything else is gone: password forgotten,
recovery codes lost, phone wiped, all at once.

**This replaced the proposal to add email recovery, on 2026-08-12.** Email was
rejected on three counts and the decision is recorded in CLAUDE.md rather than
only here. It would put personal data into a design whose central claim (§9) is
that it holds none; it would add an outbound mail dependency the site otherwise
does not have; and it would make a mailbox the master key to the account that
administers every other account — so a compromised inbox would silently become
full operator control. What follows is strictly stronger: it needs no third
party, cannot be phished, and already exists.

## Why this always works

The operator holds `wrangler` and the production D1 database. Operator status is
one integer in one row. Nothing about the key-slot design resists this, and it is
not supposed to: §5 protects users *from the operator reading their grant keys*,
not the operator from themselves.

The one thing this procedure deliberately **cannot** do is recover an existing
account's password or open its grant key. That is the design working, not a
limitation to route around — see §5, and `worker/admin.ts` on why no route
returns another account's key slot. If you have lost your password, you make a
new account and move operator status to it. What is lost with the old account is
what its grant key signed, which in phase 1 is nothing.

## The procedure

Everything below is run from the project root on a machine logged in with
`npx wrangler login`.

### 1. Get back in as operator

Create a fresh account through the site's own signup page (`/signup` — it is
unlinked but routable), **write the ten recovery codes down this time**, then:

```sh
npx wrangler d1 execute vessel --remote \
  --command "UPDATE accounts SET is_operator = 1 WHERE handle_lower = 'your-new-handle';"
```

Sign in. The config panel and `/admin` are yours again. From `/admin` you can
delete the old account and manage everyone else without touching the CLI again.

### 2. See who exists

```sh
npx wrangler d1 execute vessel --remote \
  --command "SELECT handle, is_operator, datetime(created_at/1000,'unixepoch') AS created FROM accounts ORDER BY created_at;"
```

### 3. Clear a stuck second factor

Only needed if you are locked out *before* step 1 has given you `/admin`, which
has a button for this.

```sh
npx wrangler d1 execute vessel --remote \
  --command "DELETE FROM totp WHERE account_id = (SELECT id FROM accounts WHERE handle_lower = 'the-handle');"
```

### 4. Confirm it worked

```sh
curl -s https://mcclevarty.ca/api/health
```

`{"ok":true,"tables":6}` means D1 is bound, migrated and reachable.

## What this does not survive

Losing the Cloudflare account itself. That is the real single point of failure
and no amount of in-app recovery addresses it, so the mitigations are ordinary
ones and they live outside this repo: keep the Cloudflare login in the password
manager alongside `AUTH_PEPPER`, and keep two-factor on it.

Losing `AUTH_PEPPER` is separate and worse in one specific way — every stored
auth hash becomes unverifiable, so **every password on the site stops working at
once**, and no procedure here recovers it. It is backed up in the password
manager. Cloudflare secrets are write-only and cannot be read back, so that
backup is the only copy.
