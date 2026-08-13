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
