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

**Read `ok`, not the table count.** `{"ok":true,…}` means D1 is bound, migrated and reachable.
The endpoint asserts the expected number of tables itself (`worker/index.ts`: `ok: row?.n === 8`),
so the count is diagnostic detail and `ok` is the verdict.

> This line said `{"ok":true,"tables":6}` until 2026-08-18, which by then was a **contradiction**:
> migration 0004 took the count to eight, so a `tables:6` response carries `ok:false`. A runbook
> whose success criterion is the current failure signal is worse than one that says nothing, and
> it is read at the worst possible moment. Hence keying on `ok`, which cannot drift.

## Rotating a secret

The Worker holds four secrets (`wrangler secret put <NAME>`; they cannot be read back). **None of
them carries a key id**, so there is no overlap window: the moment a new value is put, everything
made under the old one stops verifying. What that costs differs completely between them. Back up
any new value in the password manager **before** putting it.

| Secret | What it keys | What rotating it breaks | Verdict |
|---|---|---|---|
| `RATE_SALT_SEED` | The names of the rate-limit buckets (and the daily client-key salt) | Every in-flight counter is forgotten — anybody mid-backoff starts fresh | **Rotates freely.** Nothing stored depends on it |
| `SESSION_SECRET` | Session cookies, and every short ticket: TOTP, set-password, the two WebAuthn challenges, download tickets | **Everybody is signed out**; a sign-in half-way through TOTP or a passkey ceremony starts again; a customer mid-download re-types their code | **Rotates cleanly.** Nothing stored depends on it — the right move after any suspicion of a leaked cookie secret |
| `AUTH_PEPPER` | The HMAC over every stored auth hash — **passwords, recovery codes, TOTP backup codes and download codes** (and the decoy salts `challenge` invents) | **Every password, every recovery code, every backup code and every download code stops working at once.** Nothing recomputes them: the server never held the inputs | **Do not rotate** short of a confirmed leak of the pepper *and* the database together. Passkeys are untouched (they are signatures, not hashes), so an account with a passkey still signs in; every other account has no way back in — an operator reset leaves recovery, and recovery codes are dead too — and is re-created. Every customer needs a new download code |
| `TOTP_ENC_KEY` | AES-GCM over every stored TOTP secret (`totp.secret_enc`) | Every enrolled authenticator stops verifying — nobody with TOTP can finish a password sign-in | **Only offline.** There is no key id on the ciphertext, so rotation is: decrypt every `totp.secret_enc` under the old key, re-encrypt under the new, write them back, *then* put the new secret — one script, run once, with both keys in hand. The fallback without the old key is an operator TOTP reset for every account (`/admin`, or step 3 above), and each owner re-enrols |

**Key versioning is not implemented**, deliberately for now: adding a key id to the TOTP ciphertext
is a migration of every enrolled secret, and a second pepper would mean every verification trying
two HMACs. If rotation ever becomes routine rather than an emergency, that is the work.

A rotation of `SESSION_SECRET` also ends the always-on host's session, so the kiosk signs in again
as it does after the twelve-hour ceiling.

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
