# Security review — 2026-08-16 (the `hud-pass` branch, which is what production serves)

**Result: no findings.** Recorded because a clean pass is only worth anything if it says what it
checked — otherwise the next session cannot tell "reviewed and clear" from "never looked".

**Why this pass happened**: `hud-pass` is 25 commits and ~6,480 insertions ahead of `main` and has
been serving production throughout, without a security review. This closes that gap.

| Surface | Verdict | The reason it holds |
|---|---|---|
| `worker/site-config.ts` — inline script injection | clear | `raw.replace(/</g, "\\u003c")` runs over `JSON.stringify` output, so `<` can only occur inside a JSON string literal where `<` is a valid escape. Kills `</script>`, `<script` and `<!--` in one stroke. Payload is never re-parsed between escaping and `head.append` |
| — its D1 provenance | clear | `publishSiteConfig` is the **only** writer of `site_config`; it does `requireAccount` then refuses non-operators, filters to `PUBLISHED_KEYS`, and caps at 2KB. No visitor-reachable path writes that table |
| — U+2028 / U+2029 | clear, deliberately noted | Unescaped by `JSON.stringify` and they pass the `<` filter, but ES2019 made both legal inside string literals. They cannot terminate a string or inject a statement |
| `loadConfig` field validation | clear | `pal`/`type` via `Number.isInteger` + range; `layout`/`fx`/`ornament`/`mode`/`page` via `oneOf` against the hardcoded catalogues; `scope` iterated over known keys with values forced boolean; everything else `bool()`. No `else` branch and no spread of the raw object, so an unknown key cannot reach `Config` |
| `shareCode.ts` decode | clear | Field count checked; each part must match `/^[0-9a-z]+$/` *before* `parseInt(…, 36)`, so no negatives, `NaN` or `Infinity`; `pal`/`type` clamped; `layout`/`fx`/`ornament` resolve through `ARRAY[i] ?? ARRAY[0]` and return `.id`, so the output is always a catalogue-owned string and never attacker text |
| `theme.ts` — CSS injection | clear | No config-derived **string** reaches a custom property. Every value originates in `PALETTES` / `TYPESETS` / `BAND_TOKENS` / `LAYOUT_*` via bounds-guarded indices; the numeric properties come from module constants. No `url()` sink |
| `sitelab.html` / `fxlab.html` reaching production | clear, **verified not assumed** | `vite.config.ts` declares no `build.rollupOptions.input`, both files sit at the repo root rather than `public/`, and `dist/` contains exactly one HTML file. Separately, the bench's `innerHTML` is not injectable: interpolations pass through its `esc()`, and the two values used *unescaped* (`w`/`h`) come from a fixed lookup table, not the query string |
| The new PostToolUse typecheck hook | clear | The file path reaches only a quoted `case "$f" in` word (quoting suppresses glob expansion) and a quoted `echo`. No `eval`, no unquoted expansion into command position, no command substitution. A path containing `$(…)` or `;` is inert |

**Repo-wide sweep**: `dangerouslySetInnerHTML|innerHTML|eval(|new Function|document.write|
insertAdjacentHTML|outerHTML` across `src/`, `worker/` and both HTML entries returns **one** hit —
the dev-only bench above. `ContentBlock.tsx`'s `<img src={block.img}>` draws from the static
`pages.ts` module, not config. `fonts.css` references only same-origin `/fonts/*.woff2`, consistent
with `default-src 'self'`; no external origin appears anywhere in the changed data or style files.

---

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

### 7. DNSSEC — **half done 2026-08-14: signed at Cloudflare, DS not yet published**

Cloudflare's half is done — DNSSEC is enabled and the zone is signed, so `mcclevarty.ca` now
publishes DNSKEY records. **It is deliberately inert**: DNSSEC does nothing until the DS record is
published at the registrar, and none is. `dig mcclevarty.ca DS` returns nothing, resolution and the
site are unaffected, and leaving it in this state indefinitely is harmless.

**The DS record to publish at Namespro**, derived independently from the published DNSKEY rather
than transcribed from the dashboard (whose fields truncate), and cross-checked against Cloudflare's
own displayed digest:

```
mcclevarty.ca.  IN DS  2371 13 2 3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E

Key Tag      2371
Algorithm    13   (ECDSAP256SHA256)
Digest Type  2    (SHA-256)
Digest       3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E
```

**Why it stopped there — and it is not the login.** The client signed in, and the account was then
searched properly. **Namespro's control panel does not expose DS record management at all.** Checked
exhaustively while signed in: *Edit domain settings* for `mcclevarty.ca` runs general settings →
web settings (nameservers) → e-mail settings → Save, with no DNSSEC section anywhere; and *Useful
Tools* offers exactly five tools — create registrant, domain push, bulk DNS server edit, bulk domain
renewal, whitelist addition. No DNSSEC among them. Their knowledge base does carry a
"What is DNSSec and how to use it?" article, but it 403s on direct URL access.

So the remaining step is **a support ticket to Namespro** asking them to publish the DS record above
to CIRA, not a form to fill in. That is the normal route for a registrar without a DNSSEC UI, and it
is why this could not simply be finished once logged in.

**That ticket is written: `docs/DNSSEC-TICKET.md` (2026-08-16).** It holds the paste-ready subject
and body, a straight answer to whether DNSSEC is required here at all, the post-publish verification
commands, and the rollback. The DS above was **re-derived from the live DNSKEY that day** rather than
carried forward on trust — the derivation was validated against `cloudflare.com`, `ietf.org` and
`cira.ca` first, reproducing all three of their published digests exactly, and then agreed with both
this section and Cloudflare's own displayed value.

**It cannot be submitted from this side.** Namespro's form has a reCAPTCHA v2 checkbox, and the
ticket should be filed from the signed-in account — their own page warns that an anonymous ticket is
untracked and its history unavailable, which is the wrong footing for a DS change. Both blockers are
the client's to clear.

**Noticed in passing, and worth its own decision**: `mcclevarty.ca` has **auto-renew disabled**
(expiry 2027-Aug-09). A domain that does not auto-renew is a domain that can lapse, and every other
protection in this document is worth nothing the day it does. Not changed — it is a billing choice,
not a security setting — but it should be a deliberate one.

**The risk to respect when doing it**: a wrong DS makes every validating resolver refuse the domain
— not the site, the *domain*, mail included — and the fix has to propagate through CIRA. Verify
immediately after with `dig +dnssec mcclevarty.ca` and remove the DS at the registrar if anything
looks wrong. Cloudflare's "Cancel Setup" is the other half of the rollback.

### 7b. Original finding: DNSSEC is not enabled

No DS record exists at CIRA for `mcclevarty.ca`. Without it, responses for the zone can be spoofed
by an on-path resolver attacker — which, for a site whose accounts derive keys from parameters
fetched over the network, is worth closing. Cloudflare: **DNS → Settings → Enable DNSSEC**, then
add the DS record it produces at **Namespro** (the registrar). Two-step, ~10 minutes, one-time.

### 8. ~~No CAA records~~ — DONE 2026-08-14

Any public CA could previously be talked into issuing a certificate for `mcclevarty.ca`. Three
`issue` records were added by hand in the Cloudflare dashboard — `letsencrypt.org`,
`pki.goog; cansignhttpexchanges=yes`, `ssl.com`.

**Cloudflare then completed the set itself, and that detail matters more than the three records
did.** The moment the first CAA record existed, Cloudflare injected its full CA list, so the live
answer is ten records, not three:

```
0 issue     "letsencrypt.org" / "pki.goog; cansignhttpexchanges=yes" / "ssl.com"
            / "comodoca.com" / "digicert.com; cansignhttpexchanges=yes"
0 issuewild  (the same five)
```

**The six-record list this section used to prescribe was incomplete** — it omitted `comodoca.com`
and `digicert.com`, both of which Cloudflare actually uses. Had those six been written to the zone
somewhere that does *not* auto-complete (the API, or another DNS host), certificate **renewal**
would have started failing silently, weeks later, with nothing obviously connecting the two. That is
the exact failure mode that made "do this in the dashboard, not over the API" the standing advice
here; the dashboard validating against its own issuance is not a nicety.

The `issuewild` records also turned out to need no separate thought: RFC 8659 falls back to `issue`
when no `issuewild` is present, so the three `issue` records alone would already have governed
wildcard issuance identically. Cloudflare added them anyway.

Verified after the change: `dig mcclevarty.ca CAA` returns the ten, and the site still serves 200
over TLS.

(Cloudflare's own documented set for Universal SSL; it will refuse the config if it would break
its own issuance.)

### 9. Email spoofing posture: DMARC `p=none`, SPF `~all`

Current records:

- SPF: `v=spf1 mx include:_spf.mailroots.namespro.ca ~all` — softfail
- DMARC: `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net;` — monitor-only

**Updated 2026-08-14, and the plan changed because a fact did.** The two-week observation this
section prescribed existed for one reason: the domain forwards mail, and forwarding is what
surprises strict SPF. The client then confirmed **neither `mcclevarty.ca` nor the `.com` has mail
set up, and neither is needed** — the Namespro records are registrar defaults, and the mail CNAMEs
are even *proxied*, which cannot work for IMAP/POP3/SMTP at all. A domain that sends nothing has no
legitimate mail for a strict policy to break, so there is nothing to observe and no reason to wait.

- **SPF is now `v=spf1 -all`** (was `v=spf1 mx include:_spf.mailroots.namespro.ca ~all`). Verified
  live. This declares that *no* server may send as `@mcclevarty.ca`, which is the strongest possible
  statement and is simply true today.
- **DMARC is now `p=reject`** (client allowed the action after a classifier blocked the first
  attempt). Live and verified:
  `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:…@dmarc-reports.cloudflare.net;`
  `sp=reject` covers subdomains, and `adkim=s`/`aspf=s` require strict alignment — all safe on a
  domain that sends nothing. **Audit item 9 is closed.**
- **MX and the mail CNAMEs/SRVs were deliberately left alone.** Removing them is cleanup, not
  hardening: SPF and DMARC govern *sending*, so the anti-spoofing benefit is already complete, and
  leaving inbound as-is costs nothing while keeping the door open if mail is ever wanted here.

**Reverting is one field each** if mail ever lands on this domain: SPF back to a real sender list,
DMARC back to `p=none` while it is observed.

### 9b. mcclevarty.com — hardened 2026-08-14, and it had a live bug

The client asked for the `.com` to be set up too. It is registered, sits in the **same Cloudflare
account** (same nameservers) and already 301s to `mcclevarty.ca` on http, https and www — so as a
defensive/vanity domain it was already doing its job.

**It had two SPF records**, which RFC 7208 forbids: a receiver seeing more than one is required to
return `permerror`, so the domain's SPF was **invalid rather than permissive**. One was the Namespro
default (`v=spf1 mx include:_spf.mailroots.namespro.ca ~all`), the other pointed at the `.ca`
(`v=spf1 include:mcclevarty.ca ~all`). Consolidated to a single `v=spf1 -all` — correct, because
this domain redirects and sends nothing — and the duplicate deleted.

DMARC was `p=none` **with no `rua`**, i.e. monitor-only while monitoring nothing. Now
`v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;`. No `rua`: the `.ca`'s report address is issued
per-zone by Cloudflare and is not valid here, and a domain that sends nothing has nothing to report
on. Protection is unaffected — `rua` is telemetry, not policy.

CAA: none existed. One `issue "letsencrypt.org"` added, and Cloudflare auto-completed its full set
exactly as it did on the `.ca` — ten records, including the `comodoca.com` and `digicert.com` that
a hand-written list would have missed.

Verified live: exactly one SPF record, DMARC `p=reject` (confirmed against the authoritative
nameserver and both 1.1.1.1 and 8.8.8.8 — a local resolver was briefly serving a cached `p=none`),
ten CAA records, and the 301 to the `.ca` still working.

**Not done here either: DNSSEC.** Same registrar blocker as the `.ca` (§7).

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

---

## Appendix — verified-safe list carried over from the 2026-08-13 full review (FABLE-FINDINGS)

`FABLE-FINDINGS.md` was that review's session-survival document; every finding in it was fixed
and its durable content moved here and to `TODO.md` before the file was deleted on 2026-08-14
(`docs/DECISIONS.md` has the note). These were checked adversarially and left standing — record
them so they are not re-litigated:

- **Site-config `</script>` breakout: SAFE.** Every `<` in the injected JSON is escaped before
  HTMLRewriter inlines it; content is allowlisted keys, ≤2000 bytes, `JSON.stringify` output.
- **`.dev.vars` is gitignored and was never committed**; it holds only placeholders.
- **Zero-operator state is unreachable** (last-operator self-revoke and self-delete refused).
- **Operator flag and account row are re-read from D1 every request** — nothing is cached in
  the token.
- **TOTP**: replay closed by the atomic conditional `last_step` UPDATE; backup-code spend is a
  compare-and-swap on the whole list; secret AES-GCM at rest with a fresh IV per encryption;
  verification constant-time across the drift window; `counterBytes` avoids the 32-bit `>>>`
  high-word bug.
- **Constant-time comparison on every secret**, session MAC compared before the expiry check.
- **Session MAC** covers purpose/subject/expiry/issuedAt; the 12-hour ceiling is enforced inside
  `verify`; no fixation (fresh token on every sign-in); no session id ever in a URL.
- **Uniform failure messaging and equalised D1 round-trips** on the sign-in paths (no latency
  oracle for handle existence).
- **`expectSignInHandle` forbids `:`**, which is what protects the synthetic
  `second-factor:<id>` bucket names.
- **No prototype pollution / mass assignment**: `readJson` rejects non-objects,
  `publishSiteConfig` copies an allowlist, `expectBytes` checks charset and length.
- **Grant public key validated on-curve at signup**; unwrapped keys non-extractable.
- **Signup writes are one D1 batch** — no half-created account can exist.
- **Migrations**: cascades, CHECK constraints and partial unique indexes all verified.
- **`AUTH_PEPPER` loss is unrecoverable** — it invalidates every stored auth hash. It is backed
  up in the client's password manager.
