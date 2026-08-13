# Fable findings — full review of mcclevarty.ca

**Written 2026-08-13.** This file is a session-survival document. If you are Claude
reading this after a reboot: this is what the previous session found, what it
changed, and what it had not yet done. Start at *§0 Where to resume*.

The client (Patrick) was approved for the Claude CVP program on 2026-08-13 and asked
for a full review of the site — every md file, all config, GUI, VFX, functionality,
security, connection, the overall idea, code quality, errors and bugs — followed by a
docs restructure and an unlimited list of improvements. The standing goal he stated:
**make mcclevarty.ca as secure and as functional as it can be.**

Decisions he gave when asked, and which govern this work:

- **Docs**: restructure and correct, but **preserve every recorded decision** and its
  reasoning. Create missing docs. (Not a from-scratch rewrite.)
- **Bugs**: **fix everything I am confident in**; report only what needs a product
  decision from him.
- **Deploy**: **local only.** Do not `npm run deploy`, do not push to `main`
  (`main` still auto-deploys the old Pages project).

Standing permissions he granted mid-session, which persist:

- Full permission to open Cloudflare, Namespro, or any other site in Chrome, and to
  type usernames, passwords and other credentials into what is being worked on. If a
  login cannot be completed, he will do it himself.
- He offered an **SSH tunnel to the Linux box** that will host phase-2 file sharing
  for his personal profile — ask when phase 2 work needs it.
- Authorisation to scan the site for security issues (this is his own site).

Working preferences he stated mid-session, which persist:

- **Use RTK where it saves tokens**, unless it would produce inferior work. Superior
  code takes precedence, but token preservation is never off the table.
- **Keep output and everything bloat-free** — comments, prose, all of it. *But* when
  detail is genuinely needed, give full detail.
- Verify background agents are actually running rather than hung and burning tokens.

---

## 0. Where to resume

### Done and verified — the Worker security work is complete

| # | Change | Files | Verified by |
|---|---|---|---|
| A | `[dev] upstream_protocol = "https"` — unblocks all local testing | `wrangler.toml` | Local `/api/health` returns 200; the whole suite can run again |
| B | **S-1 — the `challenge` handle-enumeration oracle is closed.** The decoy now reports `DEFAULT_ITERATIONS`, the same constant every real account reports | `worker/accounts.ts` | `npm run test:auth` |
| C | **S-2 — rate limiting is atomic.** New `/attempt` on the RateLimiter reserves and checks in one round-trip; the five credential paths use it; `challenge` deliberately stays on `/check` | `worker/rate-limit.ts`, `worker/accounts.ts` | Suite's rate-limit section |
| D | **S-3 — the password check counts itself.** Limiting moved *inside* `assertPassword`, closing the unthrottled oracle in `totpEnrol` / `totpConfirm` | `worker/accounts.ts` | Typecheck + suite |
| E | **S-4 — the set-password ticket is genuinely single-use.** Its subject now carries the redeemed recovery credential, and the endpoint requires that credential's key slot to still exist. The batch deletes it, so a replay is refused | `worker/accounts.ts` | **The suite already had a test for this and it was failing.** It now passes |
| F | **C-1 (half) — `predeploy` runs `npm run typecheck`**, so the Worker can no longer deploy with a type error. `wrangler deploy` bundles with esbuild, which strips types without checking them | `package.json` | `npm run predeploy` |
| G | **S-5 — the Origin allowlist.** A present-and-foreign `Origin` refuses any state-changing request. A *missing* Origin is allowed deliberately — same-origin GETs and non-browser clients omit it, and the harness is one | `worker/index.ts` | Tested four ways: absent → 400, matching → 400, foreign → **403**, foreign-on-GET → 200 |
| H | **S-7 — `/assets/*` carries the security headers.** New `public/_headers`. Unlike `_redirects` it is valid for both hosts, so `predeploy` need not strip it | `public/_headers` | Wrangler logs "Parsed 1 valid header rule"; a live asset fetch returns `nosniff`, HSTS and immutable caching |
| I | **S-10 — the handle-rule message** no longer promises `.` and `_`, which the DNS-safe tightening removed | `worker/accounts.ts` | Typecheck |
| J | **F-14 — the recovery second factor no longer dead-ends.** A non-`signed-in` result was silently ignored, and an expired ticket left the user typing correct codes into a wall | `src/components/SignIn.tsx` | Typecheck + build |

**`npm run test:auth`: 89 checks passed.** `npm run typecheck` and `npm run build` both
pass. **Committed locally as `1729dfd`. Nothing has been pushed and nothing has been
deployed** — pushing to `main` auto-deploys the old Pages project, so hold pushes too.

Note on E: the failing test means the docs' claim of a clean 78-check run had not been
true since that section was added. The suite is worth trusting — it caught a real bug
this review found independently.

### Also done — every frontend finding in §4, plus C-3, C-4 and C-6

All seventeen landed, typecheck and build pass, and they are in the same commit. F-1
through F-13 are marked FIXED in §4 below. F-14 was missed by that agent and has since been fixed separately. Four further notes from that work, all still open:

1. **`interaction.css:126` has a stale comment** — "Nothing in the site can be disabled
   yet, because nothing is asynchronous." Untrue now: `.v-btn:disabled`, the publish
   button and the share-apply button all disable.
2. **`document.title` is only correct after hydration.** The Worker-served shell always
   ships `<title>vessel</title>`, so crawlers and the first paint see the generic title.
   Fixing it properly means injecting the title in `worker/site-config.ts`, alongside
   the config injection that already runs there.
3. **`useOperatorRoutes` calls `poke()` on every keydown before the `isEditable`
   guard**, so typing in a password field keeps the screensaver awake. That looks
   intentional — typing is activity — but nobody has confirmed it.
4. **The `go()` page-equality check now reads a ref** updated in a post-render effect
   rather than the updater's `previous`. Two `go()` calls dispatched in one tick before
   any re-render would both pass. No such path exists today (nav, arrows, CTAs and
   popstate are all separate events), but it is a new precondition.

### Still in flight

- **Docs restructure** — the whole of §6, including creating `docs/DECISIONS.md`. Scope
  limited to `.md` files, and explicitly *not* this file.

**Check `git status` and `git log` first.** If the `.md` files are modified beyond this
one, that work landed — spot-check a few of its claims against the code, since the whole
point of the restructure is accuracy. If they are untouched, §6 is a complete
specification for doing it.

### Then, in order

Every security finding from the review is now fixed. What remains:

1. **Verify the docs restructure** if it landed (above).
2. **C-2 — the harness gaps**, the largest remaining item: recovery-with-2FA driven
   through `flows.ts` rather than raw `fetch`, change-password, and the four admin
   routes including both lockout guards. The harness proved its worth this session by
   catching S-4 independently; the gaps are where the next S-4 hides.
3. **S-6, S-8, S-9** — the three remaining INFO-grade security items. S-8 in particular
   must be closed before phase 3, not after.
4. **Ask the client the questions in §8.** Two of them block work.
5. Then §7, the improvements list.

Run `npm run test:auth` after each batch. **See §2 first — starting the worker has a
trap, and a stale instance will make a fix look like it did nothing.**

---

## 1. What was verified as working, live and locally

**Live site (`https://mcclevarty.ca`), all confirmed this session:**

- `http://mcclevarty.ca/` → exactly one `301` → `https://` → `200`. No loop.
- `/api/health` → `{"ok":true,"tables":6,"rateLimit":{"allowed":true,"remaining":5,"retryAt":0}}`
  — D1 bound, migrated, reachable; Durable Object namespace answering.
- `/`, `/contact`, `/work`, and an unrouted path all `200`.
- Security headers present on page responses: `Strict-Transport-Security:
  max-age=63072000; includeSubDomains`, `x-content-type-options: nosniff`,
  `referrer-policy: strict-origin-when-cross-origin`, `x-frame-options: DENY`.
  **No CSP** — deliberate, documented reason (inlined site-config script).

**Local:**

- `npm run typecheck` — passes (app and worker).
- `npm run build` — passes. Output: `index.html` 0.52 kB, CSS 34.69 kB (6.74 kB
  gzip), JS 231.79 kB (75.31 kB gzip), 73 modules, ~1.7s.
- `/api/health` on the local worker returns the same healthy shape **once the dev
  trap in §2 is worked around**.

---

## 2. A trap that will waste your time — `wrangler dev` and the https redirect

**Symptom:** every local request, including `/api/health`, returns `301` with
`Location` equal to the request URL. `npm run test:auth` cannot run at all.

**Cause:** `wrangler.toml` has a `routes` entry for `mcclevarty.ca`, so `wrangler dev`
simulates the request as arriving at `http://mcclevarty.ca/...`. The loopback
exemption in `httpsRedirect` (`worker/index.ts:62-74`) checks `url.hostname`, which is
`mcclevarty.ca`, not `127.0.0.1` — so the exemption never matches and the Worker 301s
every local request. The dev proxy rewrites `Location` back to loopback, producing a
self-redirect.

**Fix applied (change A):** added to `wrangler.toml`

```toml
[dev]
upstream_protocol = "https"
```

This makes the simulated request `https://`, which matches what the Worker actually
sees in production (TLS terminates at the Cloudflare edge). Verified: health returns
`200` with the correct body afterwards.

**Two more operational notes on the same subject:**

- **`dist/_redirects` breaks the local worker too.** It is `public/_redirects`, copied
  into `dist/` by the build. Workers static assets treats `_redirects` as
  *configuration*, parses it, and rejects `/*  /index.html  200` as an infinite loop.
  `predeploy` strips it for real deploys; a bare `npm run build` followed by
  `npm run dev:worker` does not. Delete `dist/_redirects` before running dev, or run
  `npm run predeploy` instead of `npm run build`.
- **Zombie `workerd.exe` processes.** Repeated `wrangler dev` runs on Windows leave
  listeners on 8787/8788/8789 and each new run silently takes the next port. Check
  `netstat -ano | grep 878` and kill by PID, or match on command line:
  `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'wrangler' }`.
  A stale instance will answer your curl with the *old* code and make a fix look
  like it did nothing.

---

## 3. Security findings

Two independent adversarial passes were run over `worker/` and `src/auth/`. Both are
represented here; where they agreed, that is noted. **No critical or high-severity
issue was found.** The cryptographic design, authorisation gating and injection
handling are sound.

### S-1 — MEDIUM — **FIXED.** `challenge` leaks handle existence through the iteration count

**Both passes found this independently.** It is the highest-value fix in the review.

`worker/accounts.ts`, real branch line 611 vs decoy branch lines 623-628.

The endpoint exists specifically so an unknown handle gets parameters indistinguishable
from a real account's. The *salt* decoy achieves that. The *iterations* decoy does the
exact opposite:

- Every **real** account reports `iterations: 600000` exactly. `DEFAULT_ITERATIONS` is
  hardcoded at `src/auth/derive.ts:59`; signup (`flows.ts:90`), `changePassword` and
  `setPassword` all write it; an operator-reset account with no password row falls
  back to it at line 611. **No code path produces any other value today.**
- A **nonexistent** handle reports `600000 + (hmac(handle) % 200) * 1000` — uniformly
  in `{600000, 601000, …, 799000}`.

So one unauthenticated POST classifies any handle:

- `iterations > 600000` → the handle **definitely does not exist** (199/200 of fakes).
- `iterations == 600000` → the handle **exists**, false-positive rate 1/200.

Zero false negatives, ~99.5% confidence, one request. And `challenge` deliberately
never calls `recordFailure` (so nobody can lock an owner out by requesting their salt),
which means enumeration is **unthrottled**.

The comment at lines 617-622 reasons about a future where the browser scales iterations
per device. That reasoning is right about the future and backwards about the present:
the real distribution today is a point mass at 600000, so the decoy must be that
constant. When real counts start varying, sample the decoy from the same distribution.

**Fix:** in the decoy branch, return `iterations: DEFAULT_ITERATIONS`. Leave
`recoveryIterations` alone — real and decoy both report 100000 already, so that field
is not an oracle. Leave the salt decoy alone; it is correct.

This is distinct from the already-logged unsigned-off item 4 (signup's 409 discloses
availability). That item says `challenge` "goes to real trouble to hide it" — this
finding is that it does not currently succeed.

### S-2 — MEDIUM — **FIXED.** Rate-limit burst bypass (non-atomic check-then-fail)

`worker/rate-limit.ts:65-103`, used via `worker/accounts.ts:257-274`.

`/check` (non-consuming) and `/fail` are two separate Durable Object round-trips. N
concurrent auth requests all observe `allowed: true` before any of them records a
failure.

**Scenario:** fire 500 concurrent `POST /api/auth/signin` for one handle. Every request
calls `assertAllowed`, reads the bucket, sees fewer than 5 failures, and proceeds — so
all 500 password guesses run despite `ACCOUNT_FREE_ATTEMPTS = 5`. The DO serialises the
writes but cannot retroactively reject requests that already passed. The same applies
to the `second-factor:<id>` bucket, enlarging the effective TOTP guess budget.

**Fix, partially applied (change B).** An `/attempt` endpoint was added to
`RateLimiter` that reads, decides and increments in **one** handler invocation — the
attempt is counted as a failure up front and `/succeed` refunds it. The DO's
single-threaded execution then serialises properly: the Nth concurrent attempt sees
N-1 already counted.

**What remains:** `worker/accounts.ts` has not been switched over. `assertAllowed` still
calls `/check`, and `recordFailure` still calls `/fail`. To finish:

1. Add a helper alongside `assertAllowed` that calls `/attempt` and throws the same
   `BadRequest` on `!allowed`.
2. Switch the call sites that guard a **credential check** to it: `signin`,
   `signinTotp`, `changePassword`, `totpConfirm`, `signup`.
3. Those call sites then no longer need their trailing `recordFailure` on the failure
   path — the attempt is already counted. **Keep `recordSuccess`**, which refunds.
4. **Leave `challenge` on `/check`.** It must not consume, deliberately: consuming
   there would let anyone lock an owner out by requesting their salt.
5. Re-run `npm run test:auth`. The harness has a rate-limiting section that will
   exercise this.

If you would rather not finish it now, **revert the `/attempt` method** rather than
leaving dead code that looks like a shipped fix.

### S-3 — MEDIUM — **FIXED.** Unthrottled password brute-force via `/api/totp/enrol`

`worker/accounts.ts:1260` (`totpEnrol`), and `1295-1305` (`totpConfirm`).

`totpEnrol` calls `requirePassword` → `assertPassword` with **no** `assertAllowed` and
no `recordFailure` around it. `totpConfirm` calls `assertPassword` at 1295, *before*
it sets up its rate-limit bucket at 1304 — so a wrong password there throws without
being counted either. `signin` and `changePassword` both wrap their password check in
the limiter; these two are the exception.

**Scenario:** someone holding a session obtained **without** password knowledge — via a
recovery code, or a stolen cookie — brute-forces the account password by repeatedly
POSTing to `/api/totp/enrol`, with zero throttling. The password is what unlocks the
grant-key slot, so this is an escalation oracle from "session access" to "grant
authority" — precisely what the key-slot design in §5 of the accounts spec exists to
prevent.

**Fix:** route both password checks through `assertAllowed` / `recordFailure` on the
account bucket, exactly as `changePassword` does. In `totpConfirm`, move the bucket
setup **above** the `assertPassword` call.

### S-4 — LOW/MEDIUM — **FIXED.** `set-password` ticket is replayable for its full 15-minute TTL

`worker/accounts.ts:1154-1167`, `worker/session.ts:82-84`, `src/auth/flows.ts:239`.

`session.ts` states the ticket is "a one-shot capability for the next request", and
`flows.ts` clears it — **client-side only**. `setPassword` calls `session.verify` and
nothing else: no server-side nonce store, no DB used-flag, no invalidation. The same
ticket sets the password repeatedly for 15 minutes.

Bounded: every use also requires the live session cookie (`requireAccount`), and the
recovery code is already spent, so the blast radius is a caller who already holds that
session. But the property the comment asserts is not enforced.

**Fix options:** reject if the recovery slots the ticket targets are already cleared;
or add a single-use marker. Also worth noting `setPassword` has **no rate limit at
all** — it relies solely on this ticket.

### S-5 — LOW/MEDIUM — **FIXED.** CSRF rests on `SameSite=Lax` alone, with no defence in depth

`worker/session.ts:196-215`; no Origin check anywhere in `worker/`.

Confirmed by grep: the only `origin`/`referer` strings in the Worker are the
`referrer-policy` response header and a comment. Nothing reads
`request.headers.get("origin")`.

The design is sound *as far as Lax reaches*. Every state-changing endpoint is POST; the
cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only; Lax withholds it from
cross-site POST, so the handler 401s. Two residual gaps:

1. **The Lax+POST two-minute window.** Chromium treats a freshly set cookie as sendable
   on a top-level cross-site POST for its first two minutes — i.e. right after sign-in,
   exactly when the user is active. Nothing secondary closes this.
2. **Same-site subdomains.** SameSite is *site*, not *origin*. The planned per-account
   subdomains (`design/GUIDE-SUBDOMAINS.md`) mean an attacker-controlled or XSS'd
   `evil.mcclevarty.ca` would be same-site with the apex, and its POSTs **would** carry
   the cookie. Shipping subdomains silently converts this into a live CSRF surface
   against `/api/admin/*` and `/api/account/*`.

Also relevant: `readJson` does not check `content-type`, so a cross-site
`<form enctype="text/plain">` with a JSON body would parse — only the cookie policy
stops it.

**Fix:** on non-GET `/api/*`, reject when `Origin` is present and is not
`https://mcclevarty.ca` (allow loopback for dev). Cheap, and it must land **before**
subdomains ship.

### S-6 — LOW. Body size limit measured after full buffering, and in UTF-16 units

`worker/accounts.ts:144-162` (`readJson`). `await request.text()` buffers the whole body
before the `text.length > MAX_BODY_BYTES` check, and `.length` counts UTF-16 code units,
not bytes. The existing comment justifies not trusting `content-length`, which is fair —
but the byte/code-unit mismatch is real, if cosmetic while payloads are ASCII base64url.

### S-7 — LOW — **FIXED.** `/assets/*` responses carry none of the security headers

`wrangler.toml:52` + `worker/index.ts:98-107`. `run_worker_first = ["/*", "!/assets/*"]`
means hashed bundles are served by the asset server and never pass `harden()` — no
HSTS, and **no `x-content-type-options: nosniff` on exactly the JS and CSS responses
where nosniff matters most.** The "headers on every response" claim in the docs was
verified on page routes only.

**Fix:** ship a `dist/_headers` scoped to `/assets/*` (Workers static assets parses
`_headers` the same way it parses `_redirects` — the mechanism that broke the deploy is
proof the parser runs). Or accept and document.

### S-8 — INFO. `/api/account/slot` authorises on the session alone

`worker/accounts.ts:1036-1058`. Already flagged in `src/auth/flows.ts:309-336` as a
phase-3 gap. **Not exploitable today:** the endpoint returns only ciphertext the server
cannot open, and unwrapping needs the password-derived wrapping key, which no session
grants. Becomes real in phase 3: a stolen 30-minute session could fetch the slot, and
§3 of the spec requires a fresh gesture per signature. Add the password-proof + current
TOTP gate before phase 3.

### S-9 — INFO. Password change is not a session-revocation event

`changePassword` / `setPassword` do not rotate or invalidate other session cookies — the
stateless design permits none. A stolen cookie survives the victim changing their
password, bounded by the 30-minute TTL and the 12-hour ceiling. Consistent with the
no-session-table decision, but it should be written down as residual exposure rather
than assumed.

### S-10 — INFO — **FIXED.** Stale user-facing handle rule message

`worker/accounts.ts:167-171` says handles may contain "`. _ -` after the first", but
`HANDLE_PATTERN` at line 60 is DNS-safe and permits only `[a-z0-9-]` (commit `e65cbe5`).
The message is simply wrong. Fix the wording to "letters, numbers and hyphens".

### Verified safe — record these so they are not re-litigated

Both passes checked these adversarially rather than assuming them:

- **Site-config `</script>` breakout: SAFE.** `worker/site-config.ts:158` escapes every
  `<` to a `<` escape before injecting stored JSON into the inline script via
  HTMLRewriter.
  Script text is raw until `</script>`, and all `<` are neutralised, so no breakout —
  and escaped values still parse as correct JS strings. Content is further constrained
  to known keys, ≤2000 bytes, always `JSON.stringify` output.
- **`.dev.vars` is gitignored and was never committed** (`git ls-files` and
  `git log --all -- .dev.vars` both empty). It contains only obvious placeholders.
- **Zero-operator state is unreachable.** `admin.ts:105-133` blocks last-operator
  self-revoke; `deleteAccount` refuses self-deletion. The caller is always an operator
  and cannot remove themselves as the last one.
- **Operator flag and account row are re-read from D1 every request**, so revoke and
  delete take effect immediately; nothing is cached in the token.
- **TOTP replay is closed atomically** — single conditional
  `UPDATE … WHERE last_step IS NULL OR last_step < ?` with a `changes === 1` check, and
  the backup-code equivalent is a compare-and-swap on the whole list. Concurrent
  replays lose the race.
- **TOTP secret at rest**: AES-GCM, key `SHA-256(TOTP_ENC_KEY)`, **random 12-byte IV per
  encryption**, prepended. `encryptSecret` runs only at enrol, so no IV reuse.
- **TOTP verify** compares every candidate step in constant time even after a match — no
  "which step matched" oracle — and shape-checks `^[0-9]{6}$` before any crypto.
- **`counterBytes` avoids the 32-bit `>>>` high-word bug.**
- **Constant-time comparison on every secret** — auth hash, session MAC (compared
  *before* the expiry check), TOTP bytes.
- **Session MAC construction** covers purpose, subject, expiry and issuedAt; ticket
  purpose confusion is blocked both by the explicit purpose check and by the MAC.
  Cross-account binding is enforced (`set-password` checks `claim.subject`;
  `totp-ticket` derives the account from itself).
- **12-hour absolute session ceiling is enforced inside `verify`**, not only at refresh,
  and `me` passes the original `issuedAt` through — a polled cookie cannot outlive it.
- **No session fixation**: sign-in always mints a fresh token; nothing reuses a
  caller-supplied one; no session id in a URL.
- **Uniform failure messaging** on `signin`/`signinTotp`, and the not-found path does an
  equal number of D1 round-trips (`lookupCredentials(env, "no-such-account", …)`) to
  avoid a latency oracle.
- **`expectSignInHandle` forbids `:`**, which is what stops an attacker forging the
  synthetic bucket name `second-factor:<id>` and blocking a victim's second factor.
- **No prototype pollution / mass assignment**: `readJson` rejects arrays and
  non-objects; `publishSiteConfig` copies a fixed `PUBLISHED_KEYS` allowlist;
  `expectBytes` charset- and length-checks every wire-supplied byte string.
- **Grant public key is validated on-curve at signup**; every private-key handle from
  `unwrapSlot`/`rewrapSlot` is non-extractable; the extractable generation key never
  leaves `generateGrantKey`.
- **Signup credential writes are a single D1 batch**, so no half-created account can
  sign in without a key slot.
- **Migrations**: cascades correct (`credentials`, `key_slots`, `totp`, `setups` all
  `ON DELETE CASCADE`; `audit.actor_id` and `site_config.published_by` `ON DELETE SET
  NULL`); CHECK constraints enforce per-kind column presence; partial unique indexes
  enforce one password per account and unique passkey ids; `site_config CHECK (id = 1)`
  enforces the single-row design.

---

## 4. Frontend, GUI and VFX findings

### F-1 — HIGH — **FIXED.** A leftward text-selection drag navigates away, and can destroy the recovery codes

`src/hooks/useAccountRoutes.ts:89-99` (mirror: `src/hooks/useOperatorRoutes.ts:103-113`).

The **pointer** routes have no equivalent of the `isEditable` guard the keyboard routes
got. Any `pointerdown` → `pointerup` pair with more than 260px of horizontal delta
fires — **including ordinary text selection.** Dragging left anywhere fires
`go("signin")` for every visitor.

**Worst case, and it is bad:** on `/signup`'s recovery-codes screen — which renders
exactly once, because the server keeps only hashes — selecting the codes with a
right-to-left drag across the two-column grid navigates to `/signin`, unmounts
`SignUp`, and **the ten codes are gone for good.** Selecting the share code in the
siteconfig panel leftward does the same and also closes the panel. The `/signin`
set-password stage is protected only by accident (`go("signin")` no-ops on its own
page).

**Fix:** ignore drags that began on an editable or selectable target; or bail when
`window.getSelection()?.toString()` is non-empty at `pointerup`; or require that the
pointer target is not inside `.v-account` / `.v-panel`. **The same guard belongs on the
operator's drag-right route** — an operator selecting text opens the door.

### F-2 — MEDIUM — **FIXED.** `.v-code` is defined twice, and the wrong one wins

`src/styles/overlays.css:183` (share-code display: `flex:1; font-size:12px;
letter-spacing:0.1em; color:var(--a1); padding:11px 13px`) versus
`src/styles/chrome.css:1231` (recovery-code tiles: `font-size:13px;
letter-spacing:0.06em; color:var(--fg); padding:9px 11px`).

Same class, same 0-1-0 specificity, and `overlays.css` is imported **after**
`chrome.css` (`src/main.tsx:8-10`). So the recovery codes — which `chrome.css`
explicitly says are set "at a size that survives being photographed" in `--fg` —
actually render at 12px in the accent colour with the share row's padding.

**Fix:** rename one. `.v-recovery-code` for the SignUp list.

### F-3 — MEDIUM — **FIXED.** Terminal layout silently moves the scroll container to the document

`src/styles/chrome.css:286-296` sets `.layout-terminal .v-stage { height:auto;
overflow:hidden }`, so long pages grow `.vessel` (`min-height:100vh`) and the
**document** scrolls. Three consequences:

1. `src/App.tsx:56-58` resets only `stageRef.current.scrollTop` on page change, so
   under Terminal a new page opens at the previous window scroll position.
2. The scroll-velocity listener (`useMotionSystems.ts:90-104`) is attached to the
   stage, so scrolling never boosts the canvas under Terminal. Also true of Deck's
   `.v-grid` and Side-scroll's horizontal axis, which only ever change `scrollLeft`
   while the handler reads `scrollTop`.
3. `.v-termbody { overflow-y:auto }` (`chrome.css:321-324`) is dead — no height
   constraint, so it never scrolls.

**Fix:** add `window.scrollTo(0, 0)` to the page-change effect (harmless elsewhere),
and either give the terminal body a real height or accept document scroll and listen
there too.

### F-4 — MEDIUM (dev-visible, fragile) — **FIXED.** Side effects inside the `setConfig` updater in `go`

`src/config/ConfigContext.tsx:283-311`. **Both the frontend and the config reviewer
found this independently.**

The updater schedules timers and, in calm mode, synchronously runs `commit()` — which
calls `history.pushState`, `setConfig`, `setNav`, `setPanelOpen`, `setDiving` — from
inside a state-updater function. React requires updaters to be pure. Under StrictMode
(enabled at `src/main.tsx:17`) they are double-invoked: calm navigation runs `commit`
twice per click, `nav` increments by 2 so the iris A/B alternation never alternates in
dev, and per-page rolls fire twice. Production is correct because the updater runs
once — this is a dev-fidelity and fragility bug, not a live one.

**Fix:** read `config.page` from the existing `live` ref for the equality check, and do
the branch and timer work outside `setConfig`, using it only for the pure merge.

### F-5 — LOW/MEDIUM — **FIXED.** Entering the Konami code pages the site four times mid-entry

`src/hooks/useOperatorRoutes.ts:84-100`. The arrow-paging block runs **before** the key
buffer check, and the code contains arrowleft ×2 and arrowright ×2 — so an operator
typing it is flung across four page navigations, each with a dive animation and a
per-page roll if mode is "page", before the door opens.

**Fix:** suppress paging while the buffer is a prefix of `KONAMI`, or check the buffer
first.

### F-6 — LOW — **FIXED.** `Ctrl+K` is preventDefault-ed for every visitor although the door no-ops for them

`useOperatorRoutes.ts:67-71`. `openDoor` returns early for non-operators
(`ConfigContext.tsx:333-341`), but `event.preventDefault()` has already stolen the
browser's Ctrl+K from 100% of visitors in exchange for nothing.

**Fix:** expose `isOperator`, or have `openDoor` return a boolean, and only
preventDefault when the door will actually open.

**Note this interacts with unsigned-off item 3** — `⌘K` is claimed twice, by the door
in `SPEC.md` and by the command palette in `SPEC-ACCOUNTS.md` §10. Resolving that
decision may resolve this bug.

### F-7 — LOW — **FIXED.** `.v-btn` hover and press snap instead of animating

`src/styles/interaction.css:162-169` gives `.v-btn` `:hover`/`:active` translate and
scale but **no `transition`**, and `.v-btn` is in neither transition list (box-like at
:53-59, text-like at :103-107). The file's own comment on `.v-account-link` (:177-183)
describes this exact failure mode — "without one here the lift would … simply snap".
Every account-page button (Sign in, Create account, Sign out, Change password) snaps.

**Fix:** `.vessel .v-btn { transition: translate var(--t-hover) …, scale var(--t-press) …; }`

### F-8 — LOW — **FIXED.** `.v-shuffle` and `.v-panel-close` have no hover or press state at all

`overlays.css:70-80, 121-133`. This contradicts `interaction.css`'s stated charter —
hover, press and disabled for *every* control on the site. Both are buttons the
operator uses constantly, and every chip around them lifts while these two do not.

### F-9 — LOW — **FIXED.** The 404 "pressure lost" treatment misses `--a3`

`src/theme.ts:59-71`. The `lost` state remaps `--a1` to muted and `--a2` to faint, but
the `--a3` ternary has **no `lost` branch** — so the third accent (termbar dot, kicker
on some layouts, orrery body, error borders) stays fully saturated on the one page
whose comment says accents "drop to muted greys".

### F-10 — LOW — **FIXED.** SignUp's "Copy all ten" toasts success without checking

`src/components/SignUp.tsx:85-88`. `navigator.clipboard?.writeText(...)` has no
`.catch` — every other clipboard call in the codebase has one
(`ConfigContext.tsx:153`, `SiteConfigPanel.tsx:59`) — and `say("Recovery codes
copied.")` fires even when the write was denied. A false success on the single most
consequential copy on the site.

**Fix:** `.then(() => say(…)).catch(() => say("copy failed — write them down"))`.

### F-11 — LOW — **FIXED.** Dead rule `.stage`

`src/styles/base.css:74-80`. Nothing renders `className="stage"`; it is a stale
duplicate of `.v-stage` in `chrome.css`. Delete before it drifts into a trap.

### F-12 — LOW — **FIXED.** The publish button's accessible name never changes

`SiteConfigPanel.tsx:329-337`. `aria-labelledby="v-publish-label"` pins the name to the
heading "Publish to everyone", so a screen reader never hears "publish" versus
"publishing…", and the visible label is not in the accessible name (WCAG 2.5.3).

**Fix:** drop the `aria-labelledby`; the section heading already gives context.

### F-13 — LOW — **FIXED.** `document.title` is static across all real URLs

Routing pushes real paths (`src/data/pageIds.ts`) but the title is always "vessel"
(`index.html:6`). History entries, tabs and screen-reader page announcements are
indistinguishable. One line in the `config.page` effect fixes it.

### F-14 — INFO — **FIXED.** The recovery-path second factor has no expiry escape

`SignIn.tsx:302-320` lacks the ticket-timeout reset that `onSecondFactor` (:254-257)
has, and if `completeSecondFactor` ever resolves with a non-`signed-in` status the
handler silently does nothing (busy resets, no error). Low impact since `api.totp`
throws on failure — but on the one path where the code is **already spent**, a dead end
is expensive. At minimum surface "start recovery again with another code".

### Frontend: checked and confirmed working as documented

FxCanvas's never-torn-down loop, fixed 1600×1000 resolution and dt clamp; the scramble
token/deadline logic including the hidden-tab bail at both mount and mid-run;
`holdSaver` reference counting (StrictMode-symmetric, floors at 0); overlay mutual
exclusion and `inert`; the focus trap including the door→panel handoff ordering; swatch
inline palette colours (necessarily not tokens); `.v-block`'s backwards fill; every
`band-*.layout-*` compound selector.

### Frontend patterns worth keeping and documenting

- **The `live` ref pattern** (`ConfigContext.tsx:119-122`, `FxCanvas.tsx:25-28`,
  `useMotionSystems.ts:32-35`, `useOperatorRoutes.ts:55-58`) — listeners attached once,
  state read at event time. Zero rebinds, zero stale closures.
- **FxCanvas's frame-delta normalisation** (`dt` clamped to [0.2, 3]) — refresh-rate
  independence with tab-stall immunity, and the cache keyed on effect id so palette
  changes recolour without restarting the effect.
- **`useScramble`'s run token + wall-clock deadline + double `document.hidden` bail** —
  exactly the trap the working notes describe, closed at both ends.
- **`RecoverySignIn` as a closure holding the wrapping key**, with
  `completeSecondFactor` / `setPassword` methods (`flows.ts:173-242`) — makes the
  stranded-grant-key bug structurally impossible. The ticket is also locally single-use
  (though not server-side — see S-4).
- **SignIn's `settle()`** funnelling both sign-in paths through `/api/me` so the
  signed-in view has one shape; the mount probe's `live` flag cancellation.
- **`ContentBlock` keyed `${kicker}-${i}`** forcing remount-per-page to replay the
  stagger, while `useMemo([page, staggerMs])` shields the grid from palette re-renders.
- **`loadConfig`'s per-field validation applied identically to the operator-published
  payload** — the "a bad layout id renders unstyled for everyone" failure is pre-closed.
- **The focus trap's `previous?.isConnected` check** before focus return, and the
  opener/revocation pairing in `ConfigContext` (loss of `isOperator` force-closes both
  panel and door, :347-351).

---

## 5. Config, data, build and test findings

### C-1 — MEDIUM. The deploy path never typechecks the Worker, and the test file is typechecked by nothing

`package.json:12-14`, `tsconfig.json:20`, `tsconfig.worker.json:17`.

`npm run deploy` → `predeploy` → `npm run build` = `tsc -b && vite build`, and the app
tsconfig includes only `["src", "vite.config.ts"]`. `wrangler deploy` bundles
`worker/index.ts` with esbuild, which **strips types without checking them.** So a type
error in `worker/` deploys to production, and only someone who separately remembers
`npm run typecheck` catches it.

Separately, `scripts/auth-e2e.ts` is in **neither** tsconfig, and `test:auth` bundles it
with esbuild — the only test file in the repo is never typechecked, so a signature
drift in its `src/auth` imports surfaces as a runtime failure or silently-`any`
behaviour.

**Fix:** point `predeploy` at `npm run typecheck` rather than relying on `build`'s bare
`tsc -b`, and add `scripts` to a tsconfig include (the app tsconfig's lib works — it
needs DOM for WebCrypto types).

### C-2 — MEDIUM. The harness never imports `flows.ts` or `api.ts`, and the recovery-with-2FA path is untested

`scripts/auth-e2e.ts:21-35, 540-805`.

The working notes say the harness "imports the real `src/auth` modules". It imports
`derive`, `encoding`, `grantKey` and `recoveryCodes` — but **not `flows.ts` or
`api.ts`**, which it re-implements with raw `fetch`.

That matters specifically: the bug the notes record as fixed — `signInWithRecoveryCode`
stranding the wrapping key when the account has a second factor, so the post-TOTP key
slot could never be opened — **lives in `flows.ts`**. Both recovery fixtures in the
harness (`harness-rec-*` at line 543, `harness-set-*` at line 645) have **no TOTP
enrolled**. So the fixed path has zero automated coverage and can silently regress into
a permanently sealed grant key.

**Untested endpoints**, per the route table at `worker/index.ts:148-202`:
`POST /api/account/password` (change-password), `GET`/`POST /api/site-config`, and all
four `/api/admin/*` routes — **including** the "cannot remove your own last operator
flag" and "cannot delete yourself" guards. Also untested: rate-limiter success decay,
session expiry, and the set-password ticket TTL.

**Fix:** add a recovery fixture **with TOTP enrolled**, driven through
`flows.signInWithRecoveryCode` + `completeSecondFactor`; add a change-password section;
add an admin section (needs an operator fixture — flip `is_operator` via local D1 in
setup).

### C-3 — LOW. `unlocked` can never be true after a reload, and two comments now lie

`src/config/persistence.ts:33-72`, `siteConfig.ts:28-41`, `types.ts:29-30`.

`loadConfig` sources only `publishedConfig()`, and `unlocked` is not in
`PUBLISHED_KEYS` (the Worker's publish handler strips it too,
`worker/site-config.ts:27-39`), so `saved.unlocked` is always absent and always boots
`false`. `types.ts` says "Sticky once true" and `siteConfig.ts` says "`unlocked` is
per-browser" — both false since the published-config migration. Harmless today (door
and panel are operator-gated independently), but it is a dead field being persisted and
a trap for whoever reads those comments next.

### C-4 — LOW. `SHOWS_VALVE` is a dead export

`src/config/bands.ts:105`. Nothing imports it — phone hiding happens via
`BAND_TOKENS.phone.valveSize: "0px"`. Remove it, or wire it to whatever hides
`.v-ornament` on phones.

### C-5 — TRIVIAL. `readSiteConfig` can 500 on a corrupt row

`worker/site-config.ts:84` does an unguarded `JSON.parse(raw)`. Only reachable via a
manual D1 edit, since the publish path stringifies.

**The inline path is safe**, and this was checked explicitly: a bad payload throws
inside the injected `<script>`, `__VESSEL_SITE__` stays undefined, `publishedConfig()`
returns null, and the built-in defaults render.

### C-6 — TRIVIAL. No favicon

`index.html` declares none and `public/` holds only `_redirects`, so `/favicon.ico`
falls through `run_worker_first` to the Worker, gets the SPA fallback, and returns
`index.html` as `200 text/html` — with the site config injected into it. One Worker
invocation plus a D1-cache hit per new visitor, for nothing.

`<link rel="icon" href="data:,">` silences it without breaking the no-assets rule.

### C-7 — INFO. The email address is worth one client confirmation

`src/data/mail.ts:8` assembles **`patrickmcclevarty@outlook.com`**, byte-identical to
the prototype (`prototype.html:496`), so it is verbatim-correct per the spec. But the
client's address on file is **`patrickmcclevarty@hotmail.ca`**. Contact is "the only
page with a job" — if `outlook.com` is not a real mailbox he owns, the site's one
useful function fails silently.

**This is a question for Patrick, not a code fix.**

### Config and data: verified clean

- **Share codes**: encode/decode symmetric; five-field back-compat leaves the ornament
  alone via the `Partial` spread; the field regex rejects `parseInt` junk; clamping
  matches the prototype exactly. The base-36 trap from `docs/DUEL.md` (an index ≥ 10
  must be written as a letter) is a usage trap, and the "append, never insert"
  invariant is currently honoured — FX has 12 entries with the duels withdrawn from the
  end. One latent asymmetry: if `config.fx` ever held the type-valid-but-withdrawn
  `"duel"`, `encodeShareCode`'s `findIndex → -1 → Math.max → 0` would silently share
  "vessels". Currently unreachable.
- **Data versus the prototype**: all 24 palettes byte-identical (including oxide's
  lowercase `#775a4c`); `LAYOUTS`, `FX`, `TYPESETS`, `MODES` identical; guardrails and
  `LOW_CONTRAST` identical, no rule references a nonexistent id and none is
  unmatchable; `TIME_OF_DAY` matches `applyTod`; band breakpoints (560/900) and both
  adaptation tables match `renderVals`; toggle probabilities (.35/.2/.3) match.
- **`pages.ts`** is verbatim against `prototype.html:366-487` with exactly the approved
  home correction applied ("Twenty-four palettes, thirteen layouts" / "13 layout
  archetypes") and nothing else changed. The three account pages are additive; `NAV`
  and `FOOTER_NAV` match.
- **The two `encoding.ts` files agree byte-for-byte** on `toBase64Url` / `fromBase64Url`
  — same padding strip, same charset mapping. The Worker's adds `expectBytes` and BLOB
  helpers only. No format disagreement.
- **Band edge cases**: `bandForWidth` boundaries are exclusive exactly as the
  prototype's; `isAdapted` correctly reports false for sheet-on-phone and
  console-on-phone (identity mappings).
- **`wrangler.toml`**: bindings match `worker/env.ts`; the DO migration list,
  `run_worker_first` negation, routes and implicit `workers_dev = false` all match the
  documented decisions; `not_found_handling` is correct for the client routes.
- **Every `Config` field is validated in `loadConfig`** — checked key by key, no gaps.

---

## 6. Documentation audit

Twelve documents were read and their claims verified against code, git history,
`package.json` and the schema.

### 6a. Concrete inaccuracies

**`design/SPEC-ACCOUNTS.md`**

- The header still reads **"Status: proposal. Nothing here is built."** — the single
  most misleading line in the doc set. It was approved 2026-08-12 and phase 1 is
  deployed. The status line was never flipped.
- §10: "Three new routes in phase 1 — `/account`, `/machines`, and `/admin`". What
  shipped: `/signup`, `/signin`, `/admin`. **`/account` and `/machines` do not exist**;
  the account summary lives on `/signin`. "Phase 2 adds a third, `/share`" should say
  "a fourth" even on its own terms.
- §11: "`public/_redirects` already handles the SPA fallback" — superseded by
  `not_found_handling = "single-page-application"`; `_redirects` survives only for the
  Pages rollback.
- §9's `totp` table listing omits `last_step` (a real column, migration `0002`) with no
  annotation, even though §9 says adding a field is a spec change.
- §12's lettering runs A B C D E F G **I** H — out of order.
- Line-number citations are rotting (`overlays.css:185-194` here versus `:185-199` in
  the working notes; `session.ts:181` when the cookie code is nearer 211).

**`design/GUIDE-SUBDOMAINS.md`** — stale on three of its four load-bearing claims:

- "`worker/accounts.ts:51` is `/^[a-z0-9][a-z0-9._-]{2,23}$/i` … **This is a blocker, in
  code, today.**" — **False now.** `accounts.ts:60` is `/^[a-z0-9][a-z0-9-]{2,23}$/i`;
  commit `e65cbe5` "Restrict handles to DNS-safe characters" already did exactly what
  the guide's closing recommendation asks. **The guide was never updated and that
  decision is recorded nowhere in the doc set.**
- "the account count is zero and the change is free. That window closes at first
  signup" — closed: `piratelife` exists.
- "**This cannot be done before the cutover.**" — the cutover completed 2026-08-12.
- Cites `RESERVED_HANDLES (accounts.ts:59)`, now line 68. Its suggestion that a handle
  named `mail` "should be blocked" was never actioned — `mail` is **not** in
  `RESERVED_HANDLES`.
- Cites "`SPEC-ACCOUNTS.md §680`" — a line number dressed as a section number. The same
  odd citation was copied into `pageIds.ts`.

**`CLAUDE.md`**

- "**78 checks**" — there are now **89** `check()` call sites (90 counting three gated
  on `redeemed.keySlot`; none are inside loops). 78 was the count before the
  set-password section landed in commit `758d094`.
- "`worker/rate-limit.ts` … **Its backoff path is not yet exercised**" — stale. The
  harness ends with a rate-limiting section that was part of the last passing run.
- "linked from `FOOTER_NAV` as 'Account'" — `FOOTER_NAV` holds only Now and Changelog;
  the account and admin buttons are rendered separately and operator-only in
  `Footer.tsx`.
- "the hero metadata strip appends ` · adapted`" — **the vitals strip no longer
  exists.** Commit `fa95fba` "Remove the hero vitals strip" (client request,
  2026-08-12) removed the palette/layout/effect/pulse readout and the `· adapted`
  suffix with it. This trap entry is now actively wrong.
- "nine real URLs are already wired in `src/data/pageIds.ts`" — twelve now.
- The deployment section's "✅ The Worker is deployed at
  `https://vessel.patrickmcclevarty.workers.dev`. Verified there…" reads as current; a
  later bullet says that URL no longer resolves.
- "At cutover, delete `public/_redirects` and both scripts together" — the cutover
  happened and the file is deliberately kept until Pages is retired.

**`TODO.md`** — item 1 says "**nine** checks covering recovery→set-password"; the
section has **11**. Otherwise verified accurate: the `totpEnrol` trap is real
(`api.ts:133` posts `{}`; `worker/accounts.ts:1260` calls `requirePassword`), and the
`Admin.tsx` and `worker/admin.ts` notes both exist.

**`docs/HANDOFF.md`** — same "nine"→11 fix. Everything else verified: `predeploy`
exists, the header list matches `worker/index.ts` exactly, the health shape matches,
all six traps match code.

**`README.md`** — accurate throughout. Its only gap is having no pointer to the
orphaned phase-2 and subdomain files.

**`docs/BREAK-GLASS.md`** and **`docs/DUEL.md`** — both accurate; keep unchanged.

**`design/SPEC.md`** (a design handoff, so staleness is expected — these are *internal*
errors or unrecorded deviations):

- The siteconfig panel list says "**Layout — 8** — chips", a v1 leftover inside a v2
  spec that says thirteen everywhere else. The real panel renders "Layout — 13". The
  list also omits the Ornament section.
- The hero "vitals string (`pulse 47 bpm`…)" and the 404's "vitals read `pressure
  lost`" were removed by `fa95fba` and are **not** in the known-deviations list.
- "Share codes — five base-36 fields" / "Scope toggles — five switches" — six now.
- The Files section names `Site v2 - Vessel.dc.html` and `reference/Site v2 -
  Kaleidos.dc.html`; the repo files are `design/prototype.html`,
  `design/rejected-kaleidos.html`, `design/support.js`.
- Counts otherwise verified against code: 24 palettes, 13 layouts, 12 FX, 5 typesets,
  5 modes, 6 scopes, 5 ornaments, 12 routed pages; the email parts match `mail.ts`; all
  prototype line references (288/315/351/366/710/823/1029) land exactly.

**Scripts** — `scripts/pi-setup.sh` and `scripts/linux-drive-report.sh` exist and match
every behavioural claim `docs/pi-sharing-host.md` makes about them (refuses root,
refuses Lite, `about:blank` default, `VESSEL_KIOSK_URL`, does not touch VNC or
`cmdline.txt`, warns rather than refuses on small boards). Both are properly marked
phase-2 internally.

### 6b. `CLAUDE.md` internal contradictions — older paragraph versus newer

The file has grown by accretion and now argues with itself in ten places:

1. **Sign-in UI**: "There is no sign-in UI … smallest, highest-value next piece" versus
   "**Sign-in exists** (`src/components/SignIn.tsx`, `/signin`)".
2. **Operator-published config**: "Not built, and asked for on 2026-08-12 …" versus
   "**The operator's config is now the site's**".
3. **Accounts existing**: "The account count is zero again, so `HANDLE_PATTERN` and the
   schema are still free to change without a migration" versus "**`piratelife` exists
   and is the operator** … is now the only account."
4. **Footer link**: "linked from `FOOTER_NAV` as 'Account'" versus "**The account pages
   are unlinked** … the footer carries `account` and `admin` links, but only for a
   signed-in operator."
5. **Next-steps ordering**: "Next, in order: **sign-in UI**, then the operator surface
   …" versus everything up to set-password being shipped.
6. **Rate limiter**: "Its backoff path is not yet exercised" versus the harness section
   two paragraphs later.
7. **workers.dev URL**: "✅ deployed at … verified there" versus "no longer resolves".
8. **`_redirects` end-state**: "At cutover, delete … both scripts together" versus
   "leave both in place until the Pages project is deliberately retired".
9. **Panel and door access**: the architecture section still describes `authenticate`
   making the button appear permanently for anyone, which no longer matches
   `ConfigContext.tsx`'s operator gate.
10. **`· adapted`**: the traps section asserts it as a live invariant. Nothing records
    its removal — a contradiction with *git history* rather than with a later
    paragraph, which is worse, because nothing in the file flags it.

### 6c. Documentation gaps — real, and documented nowhere

1. **The vitals-strip removal** (`fa95fba`), a client-requested deviation from
   `SPEC.md`, recorded only in a commit message and a code comment. It belongs in the
   known-deviations list as item 8, and the adapted-layouts trap needs rewriting: "the
   stored layout is never overwritten" is still true; "surfaced via ` · adapted`" is
   not — that state is now surfaced **nowhere**, which the commit flags as deliberate.
2. **`HANDLE_PATTERN` is already DNS-safe** (`e65cbe5`) — the exact decision
   `GUIDE-SUBDOMAINS.md` demands "be made now" was made, and recorded nowhere.
3. **Orphaned phase-2 docs**: `docs/pi-sharing-host.md`, `scripts/pi-setup.sh`,
   `scripts/linux-drive-report.sh` and `design/GUIDE-SUBDOMAINS.md` are referenced by
   **no** index document — grep confirms zero mentions in `CLAUDE.md`, `README.md`,
   `TODO.md` or `HANDOFF.md`. The guide is cited only from a `wrangler.toml` comment. A
   reader following the documented entry points never finds them.
4. **The harness check count** should be stated once, correctly, or replaced with "the
   harness prints its own count". The rate-limiting section deserves a line in the
   what-is-built list.
5. **`/signin` doubles as the account page** — the reconciliation between
   `SPEC-ACCOUNTS.md` §10's planned `/account` and the shipped reality is nowhere
   stated. `/account` is still a reserved handle and still on the backlog.
6. **Code-comment staleness worth sweeping**: `pageIds.ts` ("The nine pages"),
   `pages.ts` ("all nine pages"), `worker/index.ts` ("nine client-routed URLs"),
   `public/_redirects` ("Nine real URLs") — all now twelve.
7. **`src/config/siteConfig.ts`** (the client half of the inlined config),
   **`src/auth/SessionContext.tsx`** and **`useAccountRoutes.ts`** are undocumented by
   name anywhere. `CLAUDE.md` names only the worker half and `useOperatorRoutes`.

### 6d. Proposed target structure — all decision logs preserved

- **`README.md`** — orientation only, as now. Add a pointer to `docs/` as a set,
  including the phase-2 host docs and `GUIDE-SUBDOMAINS.md`. Otherwise it survives
  nearly untouched; it is the most accurate file in the set.
- **`TODO.md`** — stays the single ordered backlog. Fix nine→11. Absorb nothing else.
- **`docs/HANDOFF.md`** — stays session-start, verification and environment limits.
  Same nine→11 fix. This and `TODO.md` are the only two files that should ever say "do
  X next".
- **`CLAUDE.md`** — cut to **currently-true invariants**: architecture, CSS traps,
  implementation traps (rewrite the adapted-layouts entry), known deviations (add #8,
  the vitals strip), binding constraints, deploy rules. **Delete every superseded
  narrative paragraph** — the "What is built so far" / "There is no sign-in UI" / "Not
  built: operator siteconfig" / next-in-order blocks. Their decisions are not lost
  because the history moves to the next file. **Keep** the "three things that are
  decisions" bullets (rate-limit decay, recovery-slot return, ticket-not-session, salt
  reuse, the challenge fallback) — those are invariants, not history.
- **New: `docs/DECISIONS.md`** — receives the *dated narrative* currently accreted in
  `CLAUDE.md`: the cutover story, the redirect bug, the `piratelife` bootstrap, the
  `erwerwerwer` deletion, the recovery-closure bug, the `_redirects` saga. This is where
  "older notes below" go to stay true **as history** instead of being false as present
  tense. Add entries for `e65cbe5` (DNS-safe handles) and `fa95fba` (vitals strip).
- **`design/SPEC.md`** — untouched as the design handoff, plus a short banner
  ("deviations are recorded in CLAUDE.md"). Optionally fix its two internal errors
  ("Layout — 8", the bundle filenames), which are wrong on the spec's own terms.
- **`design/SPEC-ACCOUNTS.md`** — flip the status header to "Approved 2026-08-12; §12 is
  the living decision log". §12 keeps everything. Annotate §10's route list with what
  actually shipped.
- **`design/GUIDE-SUBDOMAINS.md`** — one revision pass: blocker 1 resolved (cite
  `e65cbe5`), cutover done, account count nonzero. Its four-things-it-breaks analysis
  (cookies, enumeration, reserved names) is the valuable part and needs no change.
- **`docs/DUEL.md`, `docs/BREAK-GLASS.md`** — correct as-is. Keep unchanged.
- **`docs/pi-sharing-host.md` + the two scripts** — content is fine and properly
  phase-2-marked. They need *linking*, nothing more.

---

## 7. Improvements, additions and upgrades

Ordered by value. Nothing here has been implemented.

### Security hardening, beyond the findings

1. **Origin allowlist on every mutating `/api/*` route.** Cheap, and it must land
   before per-account subdomains ship (S-5).
2. **Require `content-type: application/json`** on POST routes. Closes the
   `enctype="text/plain"` form-POST shape entirely.
3. **A real CSP with a nonce**, plumbed through the site-config injection. The current
   reasoning for having none is sound but it is a deferral, not a decision. The
   injection point already runs HTMLRewriter, so the nonce has a natural home.
4. **Turn on Cloudflare's SSL/TLS → Edge Certificates → Always Use HTTPS.** Free, does
   the redirect at the edge without costing a Worker invocation. Keep the in-Worker
   redirect as the belt.
5. **Session revocation on password change** — needs a table, so it is a design
   decision, not a patch. At minimum document the current behaviour (S-9).
6. **Consider HSTS preload** once the site has been stable on HTTPS for a while. It is
   a one-way door; the current not-preloaded stance is defensible.
7. **Reserve `mail` and the other DNS-significant handles** in `RESERVED_HANDLES`,
   which `GUIDE-SUBDOMAINS.md` recommended and nobody actioned.
8. **Run the recovery path end to end, once, deliberately.** It has never been redeemed
   on the live site. It typechecks and its query was checked against production data,
   but "never actually run" is not "verified", and it costs one of ten codes.

### Testing

9. **Close the harness gaps in C-2** — recovery-with-2FA through `flows.ts`,
   change-password, and the four admin routes including the two lockout guards.
10. **Drive `flows.ts` and `api.ts` from the harness** rather than re-implementing them
    with raw `fetch`. The whole value of the harness is that it fails when browser and
    Worker disagree about a byte; re-implementation reopens exactly that gap.
11. **Any frontend test at all.** There are none. The site's logic — share codes,
    guardrails, band adaptation, persistence validation — is pure functions with no
    DOM, which is the cheapest possible test surface.
12. **A CI check** (GitHub Actions) running `npm run typecheck` and `npm run build` on
    push. The repo already auto-deploys from `main`; deploying something that does not
    typecheck is currently possible.

### Functionality and polish

13. **Per-page `document.title`** (F-13) — small, and it fixes real accessibility and
    history behaviour.
14. **A favicon** (C-6), even `data:,`.
15. **The TOTP enrolment UI.** The endpoints exist and are tested; there is no way to
    enrol a second factor from a browser.
16. **The operator password-reset flow.** The design is what makes email unnecessary,
    and it is the thing that makes the whole no-email decision honest.
17. **Passkeys**, which the spec retains as an alternative credential.
18. **The dialog primitive and command palette** — but resolve the `⌘K` collision
    (unsigned-off item 3) first, since it also fixes F-6.
19. **Richer transitions, slide-overs, typewriter effects.** The constraint is the hard
    part: every layout, palette and ornament must stay visually distinct, which points
    at a small set of motion primitives each layout composes differently rather than
    bespoke animation per layout. Confirm the approach with the client before building.
20. **Confirm the Matrix rain fall speed by eye.** It was rebuilt after the client said
    the original was far too fast, and verified headlessly at 96–307 px/sec against the
    old 960 — but the browser session it was checked in could not run animation.
    `RAIN_SPEED_MIN` and `RAIN_SPEED_RANGE` in `src/fx/effects.ts` are the two knobs.
21. **The duel effect.** `docs/DUEL.md` is a complete spec with a client-supplied
    reference implementation. Restoring it is two `FX` catalogue entries plus the four
    porting changes that file describes. The blade rendering and clash sparks are worth
    keeping; the stance machine is not.

### Code quality

22. **Resolve the four unsigned-off items with the client** — `totp.last_step` in the
    §9 inventory, §3's over-strong operator row, the `⌘K` double-claim, and the
    signup-409-versus-challenge disagreement (which S-1 makes sharper: fixing S-1 makes
    `challenge` genuinely opaque, which makes signup's 409 the only disclosure and
    therefore a cleaner, more deliberate decision).
23. **Sweep the "nine pages" comments to twelve** (6c item 6).
24. **Delete the dead code** — `.stage` (F-11), `SHOWS_VALVE` (C-4), and the `unlocked`
    field or its lying comments (C-3).
25. **A `dist/_headers` file** for `/assets/*` (S-7).

### Infrastructure

26. **Decide when to retire the Pages project.** It is the rollback today, which is why
    `public/_redirects` still exists and why `predeploy` strips it. Retiring Pages
    deletes that whole class of trap — but only once the Worker has proven itself over
    enough time.
27. **Set `workers_dev = true`** if a non-production URL is wanted back. Adding `routes`
    silently disabled it. Note the tradeoff: it reopens a publicly reachable signup
    endpoint.
28. **Phase 2 (the Linux file-sharing host).** Patrick has offered an SSH tunnel to that
    box. `docs/pi-sharing-host.md` and the two scripts are ready for it. Do not start
    before phase 1 is closed — the spec is explicit that collapsing the phases means
    phase 2 fails as "my files don't load" and phase 3 as "a stranger read my files".

---

## 8. Questions for Patrick — these need his answer, not a guess

1. **Is `patrickmcclevarty@outlook.com` a mailbox you actually own and read?** The site
   assembles that address on the Contact page (`src/data/mail.ts:8`), byte-identical to
   the design prototype, so it is verbatim-correct per the spec. But the address on file
   for you is `patrickmcclevarty@hotmail.ca`. Contact is the one page with a job — if
   that mailbox is not real, the site's only useful function fails silently and nobody
   would ever know. **This blocks nothing else but it is the highest-consequence item in
   the review.**

2. **`⌘K` / Ctrl+K is claimed twice.** `SPEC.md` makes it the operator door's sixth
   unlock route; `SPEC-ACCOUNTS.md` §10 makes it the command palette. Both cannot be
   true, and the answer decides both the F-6 fix and whether the command palette can be
   built. **This one blocks work.**

3. **Do you want per-account subdomains at all?** `design/GUIDE-SUBDOMAINS.md` analyses
   them. If yes, the Origin allowlist (S-5) must land first — a same-site subdomain
   carries the session cookie, which turns today's adequate CSRF posture into a live
   hole. If no, that guide can be marked closed and the reserved-handle work dropped.

4. **The four items still unsigned-off**, carried from the working notes:
   `totp.last_step` being a field the §9 inventory does not list; §3's operator row
   being worded more strongly than the design supports; the `⌘K` collision above; and
   signup's 409 disclosing handle availability while `challenge` hides it. The S-1 fix
   sharpens the last one — `challenge` is now genuinely opaque, so signup's 409 is the
   only remaining disclosure and is worth making a deliberate decision rather than an
   inconsistency.

5. **Should the recovery path be run once for real on the live site?** It has never been
   redeemed there. It typechecks, its query was checked against production data, and the
   local suite exercises it — but "never actually run in production" is not "verified".
   Doing it costs one of `piratelife`'s ten codes.

6. **When do you want to retire the Cloudflare Pages project?** It is the rollback
   today, which is the only reason `public/_redirects` still exists and `predeploy`
   strips it. Retiring Pages deletes that whole class of trap.

---

## 9. Standing constraints — do not undo these

Recorded here because they are decisions, and a fresh session is exactly when they get
"fixed" back into bugs. The full reasoning lives in `CLAUDE.md` and
`design/SPEC-ACCOUNTS.md` §12; this is the checklist.

- **No city is ever named.** No client names on Work.
- **The email never appears in static markup** — assembled at runtime, click to reveal.
- **The guestbook has no form.** "A form is a database is a liability."
- **The operator door is theatre** and must never be presented as security. Real auth
  must not reuse its UI.
- **The self-deprecating copy is the point.** Do not professionalise it.
- **Calm mode is a second full aesthetic**, not a degraded first one.
- **Contact is the only page with a job** and must work at every stage.
- **No third-party runtime dependencies beyond React.** No webfonts, no images.
- **No component contains a literal colour.** Palette changes are variable swaps.
- **`translate`/`scale`, never `transform`** — `transform` belongs to the cursor-lean.
- **Interaction selectors are `.vessel`-prefixed** to reach 0-2-0 specificity.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`.**
- **`band-*` and `layout-*` are on the same element** — `.band-phone.layout-stack`, no
  descendant space.
- **The password never reaches the server.** Do not "simplify" into a server-side hash.
- **Operator escrow is rejected permanently.** A slot wrapped to an operator key would
  let the operator sign grants in a user's name.
- **No personal data**; §9 is the full inventory and adding to it is a spec change.
- **Phases 1/2/3 must not be collapsed.**
- **Deploy with `npm run deploy`, never bare `wrangler deploy`.**
- **`public/_redirects` must stay** until Pages is deliberately retired.
- **`AUTH_PEPPER` loss is unrecoverable** — it invalidates every stored auth hash. It is
  backed up in the client's password manager.
