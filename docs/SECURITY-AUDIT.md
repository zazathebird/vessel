# Security audit — 2026-08-13

A full pass over the Worker, the auth stack (both halves), headers, cookies, the client, and DNS,
requested by the client. Everything server-side was read end to end; DNS was probed live from
outside. Findings are grouped by what happened to them: **fixed**, **needs the dashboard** (cannot
be done from this repository), and **reviewed and deliberately left**.

The 2026-08-13 review earlier in the week (`1729dfd`, `561e067`) covered the rate-limiting and
ticket-replay class of bugs; this audit did not re-find anything in that class.

---

## Fixed in this audit

### 1. API error responses shipped without security headers

`worker/index.ts` wrapped every *success* path in `harden()`, but the `catch` block returned
`problem()` bare — so every 4xx and 500 from `/api/*` went out without HSTS, `nosniff`,
`x-frame-options` or `referrer-policy`. Low severity (JSON bodies, no caching), but HSTS in
particular is only as good as its least consistent response. Both `problem()` calls in the catch
are now hardened.

### 2. Secret-carrying responses missing `cache-control: no-store`

The project's own convention (`noStore` in `accounts.ts`: "applied to anything carrying account
state or key material") had four gaps:

- `totpEnrol` — returned the raw TOTP shared secret and `otpauth://` URI, the one plaintext
  appearance §9 permits it
- `totpConfirm` — returned the ten backup codes in plaintext
- `signin`'s `totp-required` response — a five-minute bearer ticket
- `challenge` — per-account KDF parameters, both real and decoy branches

All POST responses, so real-world cache exposure was slim; the fix is consistency with the stated
rule. All four now `no-store`.

### 3. Session cookie now carries the `__Host-` prefix

`vessel_session` → `__Host-vessel_session` (`worker/session.ts`). The cookie already met every
precondition (Secure, `Path=/`, no `Domain`), so the prefix costs nothing and buys the one defence
attributes cannot: no other host can *plant* the cookie. Without it, a compromised or future
sibling subdomain (`design/GUIDE-SUBDOMAINS.md` — same-site, so in scope) could set
`vessel_session` with `Domain=mcclevarty.ca` and fix a victim's session to one the attacker
controls. Browsers honour prefixes on localhost/127.0.0.1, so `wrangler dev` is unaffected, and
the e2e harness's cookie jar is name-agnostic. Anyone signed in at deploy time is signed out once;
the operator signs back in.

### 4. `www.mcclevarty.ca` served a bare Cloudflare 522

The `www` DNS record exists and is proxied, but no Worker route covered it and Pages does not hold
it — so every visitor who typed `www.` got a Cloudflare error page. Not an exposure, but a broken
front door and a host serving *someone's* error under our name. Fixed with a second route in
`wrangler.toml` plus a canonical 301 to the apex in `worker/index.ts` (host-generic — any `www.`
host redirects to its parent, loopback untouched).

### 5. DNS-significant reserved handles, recommended 2026-08-12, actioned now

`design/GUIDE-SUBDOMAINS.md` §4 recommended blocking `www`, `mail`, `mailroot8` and `mailadmin`
as handles the day handles went DNS-safe, and noted on 2026-08-13 that it was never actioned.
Done, along with the standard infrastructure and mail-convention names (`smtp`, `imap`, `pop`,
`ftp`, `ns1`, `ns2`, `mx`, `dns`, `postmaster`, `hostmaster`, `webmaster`, `abuse`, `security`,
`noreply`/`no-reply`, `dev`, `staging`, `test`, `status`, `webmail`). Free while these names have
no owners; a breaking migration the day one does.

### 6. `Permissions-Policy` and `Cross-Origin-Opener-Policy` added to `harden()`

Neither is a hole so much as an unlocked door: the site uses no camera, microphone, geolocation,
payment, USB or motion-sensor API, so refusing them site-wide means injected script cannot quietly
ask. WebAuthn is deliberately *not* in the list — `publickey-credentials-*` keep their default
self-allowlist, which is what the passkey ceremonies need. COOP `same-origin` severs any opener
relationship; the site opens no popups and loses nothing.

---

## Needs the Cloudflare / Namespro dashboard — cannot be fixed from this repo

Verified live on 2026-08-13. In rough priority order:

### 7. DNSSEC is not enabled

No DS record exists at CIRA for `mcclevarty.ca`. Without it, responses for the zone can be spoofed
by an on-path resolver attacker — which, for a site whose accounts derive keys from parameters
fetched over the network, is worth closing. Cloudflare: **DNS → Settings → Enable DNSSEC**, then
add the DS record it produces at **Namespro** (the registrar). Two-step, ~10 minutes, one-time.

### 8. No CAA records

Any public CA will currently issue a certificate for `mcclevarty.ca` to anyone who passes its
validation. Add CAA records restricting issuance to the CAs Cloudflare Universal SSL actually
uses. In Cloudflare DNS, add for the apex:

```
CAA 0 issue "letsencrypt.org"
CAA 0 issue "pki.goog; cansignhttpexchanges=yes"
CAA 0 issue "ssl.com"
CAA 0 issuewild "letsencrypt.org"
CAA 0 issuewild "pki.goog; cansignhttpexchanges=yes"
CAA 0 issuewild "ssl.com"
```

(Cloudflare's own documented set for Universal SSL; it will refuse the config if it would break
its own issuance.)

### 9. Email spoofing posture: DMARC `p=none`, SPF `~all`

Current records:

- SPF: `v=spf1 mx include:_spf.mailroots.namespro.ca ~all` — softfail
- DMARC: `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net;` — monitor-only

`p=none` means a spoofed `@mcclevarty.ca` mail is delivered anyway; the domain forwards mail
(Namespro, see the 2026-08-12 incident) and sends none itself, so spoofing is the whole risk.
After reviewing a couple of weeks of the Cloudflare DMARC reports to confirm nothing legitimate
fails: move DMARC to `p=quarantine`, then `p=reject`, and consider SPF `-all`. Do it in that
order — forwarding is exactly the case that surprises strict SPF, which is why this is a
dashboard-and-observe change, not a repo edit.

### 10. TODO #13 stands: turn on "Always Use HTTPS" at the edge

The Worker's redirect works (verified live: `http://` → 301 → `https://`), so this is belt and
braces, at zero Worker invocations. SSL/TLS → Edge Certificates.

---

## Reviewed and deliberately left alone

Checked during this audit and confirmed as documented decisions, listed so the next audit does not
re-litigate them:

- **No CSP** — TODO #12; the inlined site config needs a nonce plumbed through
  `worker/site-config.ts` first. Worth doing properly, not badly.
- **Missing `Origin` allowed on state-changing requests** — same-origin GETs and the e2e harness
  omit it; `SameSite` + the present-and-wrong check carry the defence.
- **No rate limiting and no TOTP stage on passkey sign-in** — §4/§3; UV is the second factor,
  and a failed attempt is a forged P-256 signature.
- **`challenge` checks but never consumes rate-limit attempts** — counting salt requests would be
  a lockout primitive against the account's owner.
- **Stateless WebAuthn challenge tokens** — replay is refused by the credential-id uniqueness
  index; a challenge table is the rejected alternative.
- **Signup's 409 handle disclosure** — awaiting client sign-off (list item 4); availability is
  inherently probeable.
- **Sessions survive password change** (TODO #14) and **`/api/account/slot` authorises on the
  session alone** (TODO #15) — both recorded residual exposures with their trigger conditions.
- **`workers.dev` disabled** — verified live: NXDOMAIN.
- **Client storage** — no secrets in `localStorage`/`sessionStorage`; only display config. The
  set-password ticket and wrapped slots live in closures, and the wrapping key is a
  non-extractable `CryptoKey`.
- **XSS surface** — no `dangerouslySetInnerHTML` / `innerHTML` / `eval` anywhere in `src/`; the
  one HTML injection point (`worker/site-config.ts`) is operator-only, `<`-escaped, size-capped
  and key-filtered.

---

# Second pass — 2026-08-13, later the same day

A follow-up requested by the client under their CVP authorisation: find, log, fix. Everything
below was found by re-reading the Worker and both auth halves end to end against the spec's own
claims, with particular attention to the surfaces the morning audit post-dated least (saved
setups, admin). Static review only; no live probing beyond what the morning pass already did.

## Fixed in this pass

### 11. Operator password reset could permanently seal a grant key

`admin.resetPassword` refuses to reset an account with "no other way in", because the password
slot it deletes may be the last openable copy of the grant key. But the check counted
*credentials* (`kind IN ('recovery','passkey') AND used_at IS NULL`) while the property it
protects lives in *key slots* — and §5's `prf`-less fallback creates exactly the gap between
them: a passkey registered by an authenticator without `prf` has **no slot**. It signs in and can
never open the grant key. An account whose only remaining credentials were a password and such a
passkey passed the check, and a reset then deleted the last openable slot — sealing the grant key
for ever while the refusal message promised that could not happen. `passkeys.remove` already made
the same decision correctly (counting openable slots, spent recovery excluded); reset now uses
the same query shape. Low likelihood (needs a `prf`-less passkey plus exhausted recovery codes
plus an operator reset), but it silently falsified §5's "preserves grant authority in full", and
the two refusals guarding one line should never have disagreed.

### 12. The signup quota was ten times looser than its own comment believed

`signup` throttled account creation against the shared **client** bucket only. That bucket's free
allowance is 50 — sized, correctly, for a household's sign-in typos behind one NAT address — while
the comment beside the call stated the creation quota as "five before backoff". The code was the
looser of the two: one address could mint fifty accounts per 15-minute window before backoff
engaged (each signup writing an account, eleven credentials, eleven slots and an audit row).
Signup now also counts against a dedicated `signup:` bucket — same daily-rotating HMAC'd client
key, separate namespace — with a free allowance of **12**: an order of magnitude tighter, chosen
just above the e2e harness's eight legitimate signups per run so `npm run test:auth` keeps
passing (the harness now also has a regression check that trips signup backoff from a dedicated
RFC 5737 address). Sign-in traffic keeps its fifty; the two quotas no longer share one number.

### 13. Malformed base64url fields returned 500 instead of 400

`expectBytes`/`expectBytesRange` guard the character set by regex, but a base64url string whose
length is ≡ 1 (mod 4) passes the regex and still cannot decode — `atob` throws, the throw is not
a `BadRequest`, and `worker/index.ts` turned it into a generic 500 (and a `console.error`). No
disclosure — the 500 is hardened like everything else since fix 1 — but a hostile byte-shaped
field is a malformed request, not a server fault, and a 500 an attacker can produce at will is
noise in exactly the log that matters. Both helpers now refuse with the same 400 wording as every
other malformed field.

### 14. `signout` joined the `no-store` convention

The one state-changing auth response still cacheable in principle. The body is inert, but the
`Set-Cookie` clearing the session should never sit in any cache, and fix 2 established the rule
as "anything carrying account state". One line.

## Reviewed this pass and deliberately left alone

- **`/api/health`** — unauthenticated and does one D1 read plus one Durable Object round-trip per
  hit. Comparable cost to the also-unauthenticated `challenge`, discloses only "migrations
  applied" and a rate-limit verdict for a sentinel bucket, and is what deploy verification leans
  on (`docs/HANDOFF.md`). Not worth gating today; revisit if it ever reports more than liveness.
- **Saved setups (`worker/setups.ts`)** — session-gated, per-account scoped on every query,
  name and code shape-validated and length-capped, table bounded at 50 rows per account, ids
  server-minted. The upsert race it documents is a lost-update on one's own row, not a security
  boundary. Nothing to do.
- **WebAuthn CBOR/DER subset (`worker/webauthn.ts`)** — re-read against RFC 8949 §appendix and
  the WebAuthn L2 verification steps: bounds-checked at every read, depth-capped, rejects tags /
  floats / indefinite lengths / 64-bit lengths, requires UV on both ceremonies, verifies origin,
  type, challenge and RP ID hash, and pins ES256. The DER→P-1363 conversion refuses trailing
  bytes and oversized integers. No change.
- **Session token format (`worker/session.ts`)** — MAC covers purpose, subject, expiry, issue
  time; constant-time compare before expiry; subject base64url-wrapped so a `:` or `.` in it
  cannot confuse the later `split`s (subjects are UUIDs and base64url challenges throughout).
  The 12-hour refresh ceiling holds inside `verify`, not only at refresh. No change.
- **TOTP stack (`worker/totp.ts`)** — RFC-faithful, constant-time comparisons across the whole
  drift window, replay closed by the conditional `last_step` UPDATE, secret AES-GCM-encrypted
  under a Worker secret. The 90-second validity window is the standard drift allowance.
- **`crossOrigin` and the cookie posture** — unchanged from the morning pass; an `Origin` of
  `null` (sandboxed frames) parses as invalid and is refused, which is the right side of that
  edge.
