# Decisions

Dated history. `CLAUDE.md` says what is true *now*; this file says what was decided, when, and
why — including the bugs that produced the decisions, because a bug nobody wrote down is a bug
somebody re-introduces.

Newest first. Nothing here is deleted when it is superseded; the superseding entry is added above
it and says so.

`design/SPEC-ACCOUNTS.md` §12 is the *other* decision log, and it stays where it is: it records
what was chosen over what for the accounts design, with a "revisit if" on every rejection. This
file records what happened to the codebase.

---

## 2026-08-13 — The harness now drives the real browser modules

`TODO.md` item 1, closed. The suite grew from 89 to 131 checks, and the growth is in kind, not
just count.

### `flows.ts` and `api.ts` are imported, not re-implemented

The harness's whole argument is "it fails when browser and Worker disagree about a byte" — and it
was re-implementing every flow with raw `fetch`, which reopens exactly that gap. It now imports
`signUp`, `signIn`, `signInWithRecoveryCode`, `changePassword` and `openGrantKey` from
`src/auth/flows.ts` and the `api` object itself, driven through a **fetch shim** that maps
relative URLs onto the local Worker and plays cookie jar. The shim intercepts *only* relative
URLs, so the raw `Client` (absolute URLs) keeps its own cookie isolation; `asBrowser()` swaps
jars between scenarios.

### Recovery-with-2FA finally has coverage

The stranded-wrapping-key bug lived in `flows.ts` on exactly one path: an account **with** TOTP,
where the key slot arrives only after the second factor, by which time an earlier version had let
the wrapping key go out of scope. Both existing recovery fixtures had no TOTP, so that regression
had zero coverage. There is now a fixture that goes signup → change-password → TOTP enrolment
(through `api.totpEnrol`/`api.totpConfirm`) → recovery redemption → `completeSecondFactor` →
`setPassword`, asserting `canSetPassword()` flips true only after the second factor and that the
original grant key survives the whole chain.

### The untested endpoints are tested

Change-password, `GET`/`POST /api/site-config` (including HTML injection of
`window.__VESSEL_SITE__` and key-stripping), and all four `/api/admin/*` routes, including both
guards. The operator fixture is made by flipping `is_operator` in local D1 — `docs/BREAK-GLASS.md`
step 1, locally — because no API can do it, by design. Each run also deletes previous runs'
`harness-*` fixtures through the delete route, so local D1 stops accumulating a fixture set per
run (35 had built up) and the last-operator guard stays deterministic. The guard check skips,
loudly, if a non-`harness-` operator exists locally; `signintest` — pre-`/admin` dev debris — was
holding an operator flag and was demoted locally for exactly that reason.

### Two things learned the hard way

- **`execSync` kills the harness's own connections.** Shelling out to `wrangler d1 execute`
  synchronously blocks the event loop for seconds; undici cannot service the dev server closing
  its idle keep-alive socket, and the next fetch dies with "could not reach the server" while the
  Worker is fine. The `d1()` helper is async and its comment says why.
- **`api.totpEnrol`/`api.totpConfirm` hardcoded empty-ish bodies** and could never have worked —
  the Worker demands the password's `authSecret` on both (a credential change demands a
  credential). They now pass a caller-supplied body through, which is the transport half of
  `TODO.md` item 4; the enrolment screen still owes the derivation.

## 2026-08-13 — CSRF, asset headers, and the recovery dead end

`561e067`, closing three items the review had left open.

### An `Origin` that is present and wrong now refuses a state-changing request

**Defence in depth, not the defence.** `SameSite=Lax` on the session cookie is still what stops a
cross-site POST — the cookie is simply not sent, so the handler 401s. `crossOrigin` in
`worker/index.ts` covers the two places Lax does not reach:

1. **The Lax+POST grace window.** Chromium sends a freshly set cookie on a top-level cross-site
   POST for its first two minutes — the two minutes right after signing in.
2. **Same-site subdomains.** SameSite is *site*, not *origin*. If per-account subdomains
   (`design/GUIDE-SUBDOMAINS.md`) are ever built, `anything.mcclevarty.ca` becomes same-site with
   the apex and its POSTs carry the cookie. This check is what stops that silently becoming account
   takeover through `/api/admin/*`.

**A missing `Origin` is allowed**, deliberately: same-origin GETs and non-browser clients omit it,
and `scripts/auth-e2e.ts` is one of those. Refusing only a *present and wrong* origin is the
standard shape and costs nothing. The comparison is against the request's own host rather than a
literal, so it stays correct on loopback and on `workers.dev` without a list to maintain.

Verified four ways: absent, matching, foreign, and foreign-on-GET.

### `public/_headers` gives `/assets/*` the headers the Worker never applies

`run_worker_first = ["/*", "!/assets/*"]` keeps the hashed bundles on the asset server's fast path,
deliberately — they are immutable, never HTML, and there is nothing to inject into them. The cost
was that they also skipped `harden()`, so `nosniff` was absent from exactly the JavaScript and CSS
where it matters most.

**Unlike `_redirects`, this file is valid for both hosts and needs no stripping at deploy.** Pages
applies it too, and Pages is still the rollback. It carries `immutable` caching, which is safe only
because the filenames contain a content hash: a changed file is a changed URL.

### The recovery second factor no longer dead-ends

A non-`signed-in` result was silently ignored and an expired ticket left the user typing correct
codes into a wall — on the one path where the code that got them there is **already spent**, so
escaping costs another of ten.

### The handle-rule error message matches the pattern again

It promised `.` and `_`, which the DNS-safe tightening removed, so the rule the person was told and
the rule they were held to disagreed and the refusal read as a bug in the site. It now says
"letters, numbers, and hyphens after the first".

---

## 2026-08-13 — Five auth weaknesses closed, and a drag that ate recovery codes

`1729dfd`. Found by two independent adversarial passes over `worker/` and `src/auth/`, plus a
frontend pass. No critical or high finding: the cryptographic design, authorisation gating and
injection handling held up.

### `challenge`'s decoy iteration count is now the real constant

`challenge` exists so an unknown handle gets parameters indistinguishable from a real account's.
The *salt* decoy did that. The *iterations* decoy did the opposite: it returned
`600000 + (hmac(handle) % 200) * 1000`, uniformly spread over `{600000 … 799000}`, while every
real account returns exactly `DEFAULT_ITERATIONS` — 600000, hardcoded in `src/auth/derive.ts`,
written by signup, `changePassword` and `setPassword` alike, and the fallback for an
operator-reset account with no password row. No code path produces any other value.

So one unauthenticated POST classified any handle: above 600000 meant "certainly does not exist",
exactly 600000 meant "exists" at 199/200. Zero false negatives, ~99.5% confidence, one request —
and `challenge` deliberately never records a failure, so probing it was unthrottled.

The old comment reasoned about a future where the browser scales iterations to the device. That
reasoning is right about the future and backwards about the present: while the real distribution
is a point mass, the only safe decoy is that constant. **When real counts start varying, sample
the decoy from the same distribution** — the comment in `worker/accounts.ts` says so at the site.

`recoveryIterations` was left alone; real and decoy both report 100000, so it is not an oracle.
The salt decoy was left alone; it was already correct.

### Rate limiting is atomic

`/check` (non-consuming) then `/fail` was two Durable Object round-trips. N concurrent sign-ins
all read the bucket and all saw `allowed: true` before any failure landed — 500 concurrent POSTs
to `/api/auth/signin` ran 500 password guesses against an allowance of 5. The object serialises
its writes but cannot retroactively reject a request that already passed.

`RateLimiter` gained `/attempt`, which reads, decides and increments in one handler invocation:
the attempt is counted as a failure up front and `/succeed` refunds it, so the Nth concurrent
attempt sees N-1 already recorded. `worker/accounts.ts` gained `assertAttempt` alongside
`assertAllowed`, and every call site guarding a credential check uses it.

**`challenge` deliberately stays on `/check`.** Asking for a salt is not a failable attempt, and
counting it would let anyone lock an owner out of their own account by requesting it repeatedly.

### The password check counts itself

Rate limiting moved *inside* `assertPassword`. `totpEnrol` called it with no bucket at all, and
`totpConfirm` called it *above* the bucket it later set up for the TOTP code, so a wrong password
in either place was never recorded. `signin` and `changePassword` were the only ones that counted.

That left an unthrottled online password oracle, and the caller who benefits from it is precisely
the one who should not exist: somebody holding a session obtained *without* the password, via a
recovery code or a stolen cookie. The password opens the key slot, so grinding it there is an
escalation from session access to grant authority — the thing §5 exists to prevent.

Putting the counting inside the check means a future caller cannot forget it.

### The set-password ticket is single-use in fact, not only in comment

`worker/session.ts` called the ticket "a one-shot capability for the next request" and
`src/auth/flows.ts` cleared it — **client-side only**. Nothing on the server enforced it, so the
same ticket set the password repeatedly for its full fifteen minutes.

The ticket's subject now carries the redeemed recovery credential, and `setPassword` requires that
credential's key slot to still exist; the write batch deletes it. Presenting the ticket a second
time finds no slot and is refused. The harness already tested this property and had been failing.

### `wrangler dev` needed `upstream_protocol = "https"`

The `routes` entry makes `wrangler dev` simulate the request as arriving at
`http://mcclevarty.ca/…`. The loopback exemption in `httpsRedirect` checks `url.hostname`, which
is `mcclevarty.ca` and not `127.0.0.1`, so the exemption never matched and the Worker 301'd every
local request to itself. `npm run test:auth` could not run at all.

`[dev] upstream_protocol = "https"` in `wrangler.toml` makes the simulated request https, which is
also what the Worker sees in production after edge TLS termination.

### Frontend, in the same pass

- **A leftward drag no longer navigates while the user is selecting text.** The pointer routes had
  no equivalent of the `isEditable` guard the keyboard routes got, so any 260px horizontal drag
  fired — including ordinary text selection. On `/signup`'s recovery-codes screen, which renders
  **once** because the server keeps only hashes, selecting the codes right-to-left unmounted the
  screen and lost all ten. The same guard is on the operator's drag-right route.
- **`.v-code` was declared for two different components** and the later import won, so recovery
  codes rendered at the share row's 12px accent size rather than the size chosen to survive being
  photographed.
- **`go()` no longer runs effects inside a `setState` updater.** React requires updaters to be
  pure; under StrictMode they are double-invoked, so calm navigation ran `commit` twice per click
  and the iris A/B alternation never alternated in dev.
- The Konami code no longer pages the site four times mid-entry; `Ctrl+K` is only intercepted when
  the door will actually open; `.v-btn`, `.v-shuffle` and `.v-panel-close` got the interaction
  states `interaction.css` exists to provide; the 404 mutes `--a3` along with the other accents; a
  denied clipboard write no longer reports success.
- **A `data:` favicon.** Without one, `/favicon.ico` fell through `run_worker_first` to the Worker
  and was answered with the app shell — a Worker invocation and a D1-cache hit per visitor, for
  nothing. `href="data:,"` keeps the no-assets rule intact.
- **`unlocked` is a session-only field.** `loadConfig` sources the published config, which does not
  carry it, so it is false after every reload. Nothing is gated on it — the door and the panel check
  `is_operator`. The comments claiming "sticky once true" and "per-browser" were false from the
  published-config migration onward and are corrected.

### Tooling

**`predeploy` now typechecks.** `wrangler deploy` bundles `worker/index.ts` with esbuild, which
strips types without checking them, so a type error in `worker/` could reach production while
`npm run build` — which only compiles the app tsconfig — passed.

---

## 2026-08-13 — Documentation restructured

`CLAUDE.md` had grown by accretion into ten places where an older paragraph argued with a newer
one — "there is no sign-in UI" three sections above "sign-in exists", and so on. It is now cut to
currently-true invariants, and this file exists to hold the dated narrative that was removed. No
decision was dropped in the move; the entries below are that narrative.

`TODO.md` and `docs/HANDOFF.md` are the only two files that say "do X next".

---

## 2026-08-12 — `piratelife` is the operator, and `/admin` got its first real test

Created through `/signup` by the client and promoted with step 1 of `docs/BREAK-GLASS.md` — one
`UPDATE accounts SET is_operator = 1`. That made `/admin` reachable on the live site for the first
time.

The old test account `erwerwerwer` was then deleted **through `/admin`**, which is how that page
got its first end-to-end test. `piratelife` is the only account.

**This closed the window on schema and handle changes being free.** Notes written before this
saying "the account count is zero, so `HANDLE_PATTERN` and the schema are still free to change
without a migration" are obsolete from this point on.

### The footer carries `account` and `admin`, but only for a signed-in operator

The account pages stay unlinked for visitors, which is what the client asked for. But an operator
having to remember a typed word to reach their own administration is a trapdoor that locks from
the inside, not privacy. Signed out, `useSession().isOperator` is false and the links do not
render.

---

## 2026-08-12 — Recovery-code sign-in, and setting a password afterwards

`8669ed3`. The whole path, browser and Worker: `/api/account/set-password`,
`signInWithRecoveryCode` returning a `RecoverySignIn`, and three new stages in `SignIn.tsx`.

Three latent bugs were fixed on the way, and all three are the kind that typecheck.

**`signInWithRecoveryCode` returns an object with methods, not a result.** The old shape returned
`{ result, grantKey }`, so on an account **with a second factor** the wrapping key derived from
the code went out of scope at the `return` — and the key slot that arrives after TOTP could never
be opened. Recovery worked for accounts without 2FA and stranded the grant key of every account
with it. The closure now holds the key and `completeSecondFactor` finishes the sign-in through it.

**Set-password re-wraps, it does not unwrap.** `unwrapSlot` returns a deliberately
**non-extractable** key, which cannot then be wrapped into a new slot, so the flow goes
ciphertext-to-ciphertext through `rewrapSlot` exactly as `changePassword` does. Calling
`unwrapSlot` here typechecks and fails at runtime.

**`challenge` now takes the salt from any credential that has one**, preferring the password row
for its iteration count. Keyed on `kind = 'password'` it dropped an account whose password the
operator had reset through to the decoy branch and handed back a *fabricated* salt — turning a
working recovery code into a wrong one, and looking exactly like user error. This is what makes
operator password reset safe to build.

**Authorisation for set-password is a ticket, not the session.** A session says who you are, never
how you proved it. Gated on the session alone, a stolen cookie — a bounded thirty-minute exposure
today — would become permanent takeover. `TokenPurpose` gained `set-password`, minted only inside
`completeSignIn`, only on the recovery path, only after the last factor.

Verified live after deploy: `/api/health` returned six tables, `challenge` returned the real salt
for `piratelife`, `/signin` and `/admin` both 200.

**Still not verified by a human**: no recovery code has actually been redeemed on the live site.
Doing so spends one of ten, which is why it was not done casually. `TODO.md` item 2.

---

## 2026-08-12 — Sign-in, operator-published config, and administration

`92a9f5c`, `d305f98`, `200c887`. All deployed and verified live.

- **Sign-in** (`src/components/SignIn.tsx`, `/signin`). Handle + password, the TOTP second factor,
  the account summary, sign-out and change-password. One page for both states — `api.me()` on
  mount decides form or summary.
- **Change password** (`changePassword` in `flows.ts` + `worker/accounts.ts`). Re-wraps the key
  slot rather than regenerating the grant key, via `rewrapSlot`, where the scalar never becomes
  bytes in JS. **The salt is reused deliberately** — recovery codes derive against the password's
  salt, so rolling it would silently kill all ten. Verified: old password rejected, new one works.
- **The operator's config is now the site's** (`worker/site-config.ts`, migration `0003`).
  Published to D1 and **inlined into the app shell by the Worker** rather than fetched, so there is
  no palette flash and no network dependency on boot. This is what needed `run_worker_first` in
  `wrangler.toml`: by default a request matching a real file never invokes the Worker, so `/`
  (which *is* index.html) silently got no injection while `/contact` did. The site looked right on
  every URL except the front page.
- **The panel and door became operator-only.** Gated once at `openDoor` / `togglePanel` in
  `ConfigContext`, not at each of the six unlock routes. `loadConfig` no longer reads visitor
  localStorage.
- **`/admin`** (`src/components/Admin.tsx`, `worker/admin.ts`): list accounts, grant/revoke
  operator, reset 2FA, delete. Guards against removing your own last operator flag and against
  deleting yourself.
- **The account pages are unlinked**, at the client's request. Reached by typing `whoami`, `login`
  or `admin`, or by dragging **left** — mirroring the door's rightward drag. These never call
  `openDoor`; the door stays theatre.

This superseded the note that opened the same day: *"Not built, and asked for on 2026-08-12: an
operator-only siteconfig whose saved settings apply to every visitor."* The precedence question it
raised — whether a visitor's own choices override the operator's defaults or are replaced by them —
was answered by **replaced**: `loadConfig` sources the published config and no longer reads
visitor localStorage at all.

**Two real bugs fixed with it**: the screensaver faded out the recovery-codes screen mid-
transcription (`holdSaver`, reference-counted), and `useOperatorRoutes` paged the site on arrow
keys and opened the door on `sudo` from inside the new text inputs (`isEditable` guard).

---

## 2026-08-12 — Email recovery proposed, and rejected

Rejected on three counts, in favour of `docs/BREAK-GLASS.md`:

- it would put personal data into a design whose central claim (§9) is that it holds none;
- it would add an outbound mail dependency the site otherwise does not have;
- it would make a mailbox the master key to the account that administers every other account, so a
  compromised inbox would silently become full operator control.

The break-glass procedure is strictly stronger: it needs no third party, cannot be phished, and
already exists — the operator holds `wrangler` and the production D1 database, and operator status
is one integer in one row.

`SPEC-ACCOUNTS.md` §12 C carries the standing "revisit if": user numbers making manual operator
resets a burden. Read `docs/BREAK-GLASS.md` before re-proposing it.

---

## 2026-08-12 — The lightsword duel, withdrawn from the picker

`06dcb86`, `758d094`. The client saw the shipped stick-figure version and rejected it: *"that is
terrible"*, *"WAY too slow"*. They want a fast, obviously readable 8/32-bit pixel fight with
discrete matches and winners, and supplied a working reference implementation that is the
authoritative statement of it.

The code survives in `src/fx/effects.ts` (`EFFECTS.duel`, `EFFECTS.duelholy`) and in `FxId`; only
the two `FX` catalogue entries were removed, so nothing else had to change and putting them back
is two lines. The blade rendering and clash sparks are worth keeping; the stance machine is not.

`docs/DUEL.md` is the full spec — the reference's design table, why the first version failed, the
four changes needed to port it here, and the base-36 share-code trap. Read that rather than
re-deriving any of it.

---

## 2026-08-12 — Security headers, and the redirect that would have taken the site down

`758d094`. `http://mcclevarty.ca/` used to answer **200 over cleartext** — the browser's "not
secure" warning — because a Workers route matches both schemes.

**The first fix would have taken the site down**, and the failure is not obvious from reading it:

```js
const secure = new URL(url.toString());
secure.protocol = "https:";      // silently does nothing in workerd
```

The setter did not take, so `Location` came back equal to the request URL — an infinite redirect
loop, caught locally as `redirect count exceeded`. **The URL is now built by concatenation and
compared against the request before being sent**, so the worst case is "no redirect happens"
rather than "site down". Keep that guard. Loopback is exempt or `wrangler dev` and
`npm run test:auth` break.

Verified live: `http://` → exactly one 301 → `https://` → 200, with `Strict-Transport-Security`,
`x-content-type-options`, `referrer-policy` and `x-frame-options` on page responses.

Cloudflare's **SSL/TLS → Edge Certificates → Always Use HTTPS** does the same redirect at the edge
without costing a Worker invocation. Turning it on as well is free and is recommended — `TODO.md`
item 13.

---

## 2026-08-12 — The hero vitals strip removed

`fa95fba`, at the client's request. The palette name, layout name, effect name and pulse were a
readout of state nobody asked to see. The client's point, in their framing: **show the layout, do
not caption it.**

The `· adapted` suffix went with it. The stored layout is still never overwritten when a small
screen collapses it, so nothing is wrong in the data — but **that state is now surfaced nowhere**,
and that is deliberate rather than an oversight. If it needs to return it wants its own affordance
rather than the whole readout coming back.

The dead `.v-vitals` rule and the then-unused catalog imports went with it. This is a deviation
from `SPEC.md`, which specifies the strip in *Hero* and its `pressure lost` variant on the 404
page; it is recorded in `CLAUDE.md` under *Known deviations from the prototype*.

---

## 2026-08-12 — Handles restricted to DNS-safe characters

`e65cbe5`. `HANDLE_PATTERN` went from `/^[a-z0-9][a-z0-9._-]{2,23}$/i` to
`/^[a-z0-9][a-z0-9-]{2,23}$/i`.

Done **while the account count was still zero and the change was therefore free.** Neither `.` nor
`_` survives a hostname: a dot makes `ada.smith.mcclevarty.ca` a two-level name that Cloudflare
Universal SSL does not cover, and an underscore is invalid in the hostname position outright.
Keeping handles DNS-safe leaves per-account subdomains possible later
(`design/GUIDE-SUBDOMAINS.md`) instead of foreclosing them for whichever accounts happened to use
those characters. After the first real signup this would have been a breaking migration.

This is the decision `GUIDE-SUBDOMAINS.md` asks to "be made now", and it was made the same day the
guide was written — but the guide was not updated, so it went on describing the old pattern as a
live blocker. Corrected 2026-08-13.

**Still not actioned from that guide**: its recommendation that a handle named `mail` be blocked,
because the zone's MX records live there. `mail` is not in `RESERVED_HANDLES`. `account`,
`machines` and `share` are.

**The user-facing error message was not updated with the pattern** and went on promising `. _ -`
for a day, so the rule the person was told and the rule they were held to disagreed. Corrected
2026-08-13 (`561e067`).

---

## 2026-08-12 — Signup shipped, and the test account was deleted

`18aaa8d`, `d20eb99`. `src/components/SignUp.tsx` at `/signup`, the first real-auth surface.
Verified in a browser against production: an account was created end to end and ten recovery codes
rendered.

The test account was deleted afterwards — `accounts`, `credentials` and `key_slots` all cascade to
zero — because its password had been written down in a transcript.

The note that followed, *"the account count is zero again, so `HANDLE_PATTERN` and the schema are
still free to change without a migration"*, was true when written and is **superseded by the
`piratelife` entry above**.

The same commit left `/signup` linked from `FOOTER_NAV` as "Account". That was reversed later the
same day when the client asked for the account pages to be unlinked; `FOOTER_NAV` now holds only
Now and Changelog, and the operator's links are rendered separately in `Footer.tsx`.

---

## 2026-08-12 — Cutover: `mcclevarty.ca` is served by the Worker

`29b8f89`. The site moved from Cloudflare Pages to a Worker with static assets, because **Pages
cannot define Durable Object classes** and this stack needs them twice — rate limiting now, one
signalling object per paired machine in phase 2.

It was done by **adding a `routes` entry to `wrangler.toml` rather than deleting the Pages custom
domain**, because a Workers route is evaluated ahead of a Pages custom domain. `wrangler pages
domain` is not a command in wrangler 4.122, so removing it via CLI was not available anyway — but
the route approach is better regardless: the Pages project is untouched and still holds the domain
underneath, so **rollback is deleting the `routes` block and running `npm run deploy`**, not
rebuilding infrastructure under pressure.

Verified live: `/api/health` returned `{"ok":true,"tables":6}` — decisive, because Pages has no
`/api` and could not answer it at all. `/`, `/contact`, `/work`, `/404` and an unrouted path all
200, the served bundle hash matched a local build, and `mcclevarty.com` still 301s to `.ca`.

**Adding `routes` silently disabled the `workers.dev` URL**, since `workers_dev` defaults to false
once a route exists. `vessel.patrickmcclevarty.workers.dev` — which earlier notes cite as the
verification target — no longer resolves. That is wanted here, because it closes the public signup
endpoint that was reachable before cutover, but it means there is no non-production URL to test
against. Set `workers_dev = true` if you want one back, knowing it reopens that endpoint.

### The infrastructure it landed on

- `npx wrangler login` — done by the client. Account `760b80a637d2ffe755b09da3f4a339ff`.
- **The real D1 database.** `vessel`, region ENAM, id in `wrangler.toml`. Migrations applied
  `--remote`; `d1 list` was empty beforehand, so nothing was overwritten.
- **All four secrets set**, by the client. `AUTH_PEPPER` is backed up in their password manager.
  That backup matters: Cloudflare secrets are write-only and cannot be read back, so losing the
  pepper invalidates every stored auth hash — every password on the site — unrecoverably. It was
  free to regenerate while the account count was zero and is a data-loss event now. The other
  three are cheaper: `SESSION_SECRET` only signs everyone out, `RATE_SALT_SEED` only resets
  counters, `TOTP_ENC_KEY` breaks enrolled second factors.

---

## 2026-08-12 — `public/_redirects` breaks the Worker deploy, and stays anyway

`22fbc79`. An earlier note called the file "dead under Workers". That was wrong.

Workers static assets treats `_redirects` as **configuration, not as an asset**: it parses and
validates the file, and rejects `/*  /index.html  200` with
`Invalid _redirects configuration — Line 3: Infinite loop detected` (the rule strips `/index` and
re-triggers itself). The deploy fails outright at the API call.

Because it is configuration rather than an asset, **`.assetsignore` does not help** — that only
filters the upload list, and validation has already happened. This was tried and does not work.

It cannot simply be deleted either: `main` still auto-deploys to Pages, which is the rollback, and
removing it would break client-side routing there on the next push. So the file stays in `public/`
and is stripped from `dist/` at deploy time only:

```
"predeploy": "npm run build && node -e \"...rmSync('dist/_redirects')...\"",
"deploy": "wrangler deploy"
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — the bare command fails on a fresh
build. Pages is unaffected: Cloudflare runs its own `npm run build` and never sees the removal.

The original plan said *"at cutover, delete `public/_redirects` and both scripts together."*
**That is superseded.** The cutover happened and the file is deliberately kept, because Pages
continues to auto-deploy from `main` and is the rollback. Delete both when the Pages project is
deliberately retired, not before.

The SPA fallback for the Worker is `not_found_handling = "single-page-application"` in
`wrangler.toml`, not `_redirects`. `SPEC-ACCOUNTS.md` §11 predates this.

**It breaks local development too.** `dist/_redirects` is copied in by a bare `npm run build`, and
`npm run dev:worker` then hits the same validation. Run `npm run predeploy` instead, or delete
`dist/_redirects` first.

---

## 2026-08-12 — `design/SPEC-ACCOUNTS.md` approved

Approved by the client and no longer a proposal. §12 is its decision log and is kept deliberately:
every rejected option keeps its reasoning and carries a *"revisit if"* condition, so an idea that
comes back starts from "here is why we didn't" rather than being re-derived. Add to it rather than
relitigating.

Phase 1 grew roughly threefold with the second round of decisions (§12 H) and stays one phase,
with one non-negotiable internal order: **authentication works end to end before any interface
work starts.**
