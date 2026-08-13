# Handoff

Updated 2026-08-13 (night), after the client-requests session: visible
branding is now `mcclevarty.ca` everywhere (CLAUDE.md deviation 10), the duel
figures carry their likenesses with fixed blade colours (deviation 9), all
eight photo slots hold PD/CC0 placeholders (`docs/PHOTOS.md`), phones have
feature parity (ornament + duels + `cmd` chip), home's option-count block is
jokes now, and the app-shell/UI review finally ran — eight findings fixed,
`docs/REVIEW-CONTINUATION.md` deleted per its own note. Harness is at **178**.
Read `TODO.md` for what to do and `docs/DECISIONS.md` for why things are as
they are; this file is how to pick the work up and how to prove you have not
broken anything.

---

## Start-of-session prompt — phase 2

Paste this to begin:

> Read `CLAUDE.md`, `TODO.md` and `docs/HANDOFF.md` before doing anything, then
> `design/SPEC-ACCOUNTS.md` §6–§8 and §12 in full. `docs/DECISIONS.md` is the
> dated history if you need to know why something is the way it is.
>
> The site is live at `mcclevarty.ca`, served by a Cloudflare Worker;
> everything in `main` is deployed. First prove the ground: kill stray
> `wrangler dev` processes, run `npm run test:auth` against `npm run
> dev:worker`, and confirm it passes before anything else.
>
> Then begin **SPEC-ACCOUNTS phase 2** — machine pairing, the per-machine
> signalling Durable Object, and brokered drive access — and get as far as you
> can in this order, stopping only where a decision is genuinely mine:
>
> 1. **Spec first.** Extend `design/SPEC-ACCOUNTS.md` with the phase-2 design
>    in §12's decision-log style: every choice recorded with what it was chosen
>    over and a "revisit if". Decide what you can from the approved spec and
>    log it; collect the genuinely client-level calls into one short list for
>    me instead of stopping at each.
> 2. **Authentication and plumbing before interface**, exactly as phase 1 did
>    it: migrations (machines/pairing tables — grants stay absent until the
>    phase that hardens them), the pairing protocol, the signalling Durable
>    Object, and `scripts/auth-e2e.ts` coverage proving every new route end to
>    end — including the negative cases — before any screen exists.
> 3. Interface last, reusing the account-form conventions (`CLAUDE.md`
>    § Accessibility) and never the operator door's UI.
>
> Phases 2 and 3 stay uncollapsed: phase 2 fails as "my files don't load",
> phase 3 as "a stranger read my files" — do not borrow phase-3 hardening
> early, and do not ship phase-2 routes that phase 3 will need to break.
>
> Deploy only if typecheck, build and the harness are all green, then run the
> verification block in `docs/HANDOFF.md`. Commit and push at the end. Also
> waiting on me, whenever I say so mid-session: the free-diagnostic copy
> rewrite (my call is pending), the sign-off list at the bottom of `TODO.md`,
> and every "unverified by eye" item — batch those into one list for me at the
> end rather than asking as you go.

---

## State of the world

- **`piratelife` is the operator**, and is the only account. Promoted with step 1
  of `docs/BREAK-GLASS.md`. The old test account was deleted through `/admin`.
- **Deployed and working** (verified 2026-08-13 night, Worker version
  `9226f325`): sign-up, sign-in + TOTP, change password, recovery-code
  sign-in, `/admin` incl. operator password reset, TOTP enrolment,
  **passkeys** (register/list/remove/sign-in, each a key slot on the same
  grant key), **saved setups**, operator-published site config, forced HTTPS.
  The harness is at **178 checks** and covers all of it, passkeys included,
  via a software authenticator.
- **The client-requests session (2026-08-13 night) is live**: `mcclevarty.ca`
  branding (the TOTP issuer and passkey rp name changed with it), the
  middle-finger favicon, upgraded duel silhouettes with fixed blade colours,
  placeholder photos in all eight slots, mobile parity (phone ornament +
  header `cmd` chip on non-desk bands), the home jokes block, and the eight
  app-shell review fixes — including two visitor-visible regressions (Radial's
  orbit gap, the stuck "leaving…" button).
- **The 2026-08-13 security audit shipped and is live**: hardened API error
  responses, `no-store` on the four secret-carrying responses, the session
  cookie renamed to `__Host-vessel_session` (anyone signed in at deploy was
  signed out once — the operator just signs back in), `www.mcclevarty.ca`
  routed and 301ing to the apex (it was a bare 522 before), the
  DNS-significant reserved handles, and `Permissions-Policy` + COOP site-wide.
  `docs/SECURITY-AUDIT.md` is the log, including the deliberate decisions the
  audit checked and left standing — read it before "fixing" any of those.
- **All of `TODO.md` item 5 is built**: passkeys, saved setups on the `/signin`
  summary, the dialog primitive (`/admin`'s reset and delete confirm through
  it; delete types the handle), and the command palette — **opened by typing
  `cmd`; `⌘K` deliberately unbound** until the client settles its double claim.
  Four dated notes in `docs/DECISIONS.md` carry the decisions made en route
  (passkey sign-in has no TOTP stage and no rate limiting; prf-less passkeys
  get no slot; `/account` stays reserved; visitor-facing calm was not smuggled
  into the palette).
- **The lightsword duel is live in the ornament slot** (ornaments 6–7). The
  background `FX` entries stay withdrawn until the client's eye passes the
  motion — `TODO.md` 6b, including the "12 background modes" copy catch.
- **Unproven in a browser, needs the client's eye**: recovery-code sign-in
  (TODO 2), the reset/delete dialogs in `/admin`, the TOTP enrolment screen,
  the Passkeys and Saved setups sections, the command palette, and the duel's
  motion. Passkeys additionally need a **real authenticator** — the harness
  proves the bytes, only the client's device can prove the platform prompt and
  its `prf` support.
- **The next build is SPEC-ACCOUNTS phase 2** (machine pairing, the signalling
  Durable Object, drive brokering) — the client gave the go on 2026-08-13. The
  start-of-session prompt above is written for it. Also open: the
  free-diagnostic copy rewrite (client is leaning yes, exact wording and any
  fee amount pending), items 7 (sound) and 8 (edit mode) as spec changes
  needing sign-off, 13 and **16 (DNSSEC, CAA, DMARC)** in the dashboards, 6b
  on the duel verdict, and the sign-off list at the bottom of `TODO.md`
  (`totp.last_step`, §3's operator wording, `⌘K`, signup 409).

---

## Verifying a deploy

Run all of it. Each line has caught something real.

```sh
# 1. Is what I have actually what is live? Hashes must match.
npm run predeploy
ls dist/assets/*.js
curl -s https://mcclevarty.ca/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1

# 2. HTTPS is forced, with exactly ONE redirect. More than one is a loop.
curl -s -L -o /dev/null -w "redirects=%{num_redirects} final=%{url_effective} status=%{http_code}\n" http://mcclevarty.ca/

# 3. All six security headers present (expect 6; permissions-policy and COOP
#    joined in the 2026-08-13 audit).
curl -s -i https://mcclevarty.ca/ | grep -icE 'strict-transport|x-content-type-options|referrer-policy|x-frame-options|permissions-policy|cross-origin-opener'

# 3b. www 301s to the apex, path preserved (it was a bare 522 before the audit).
curl -s -o /dev/null -w "status=%{http_code} location=%{redirect_url}\n" https://www.mcclevarty.ca/services

# 4. D1 bound, migrated, and the Durable Object answering.
curl -s https://mcclevarty.ca/api/health          # {"ok":true,"tables":6,...}

# 5. Client-routed URLs resolve.
curl -s -o /dev/null -w "%{http_code}\n" https://mcclevarty.ca/signin
curl -s -o /dev/null -w "%{http_code}\n" https://mcclevarty.ca/contact
```

**`/api/health` is the decisive one** for "is the Worker serving this domain" —
Pages has no `/api` and could not answer it at all.

**Step 3 proves the headers on page routes only.** `run_worker_first` excludes
`/assets/*`, so the hashed bundles never pass through `harden()`. They get their
headers from `public/_headers` instead, which is a separate mechanism worth
checking separately:

```sh
curl -s -i https://mcclevarty.ca/assets/$(curl -s https://mcclevarty.ca/ \
  | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1) | grep -i 'x-content-type-options'
```

**`public/_headers` must not be stripped at deploy.** `_redirects` is — it is
Pages-specific and breaks the Worker — but `_headers` is valid for both hosts
and is the only thing giving the bundles `nosniff`.

**Give a fresh deploy a few seconds** before testing routes. `/contact` 404s
briefly while the asset manifest propagates, then settles to 200.

**Deploy with `npm run deploy`, never bare `wrangler deploy`.** The bare command
fails on a fresh build — `predeploy` strips `dist/_redirects`, which Workers
static assets otherwise parses as *configuration* and rejects as an infinite
loop.

---

## Running the stack locally

Two things stand between a clean checkout and a working `npm run test:auth`, and
both look like the code is broken.

**`wrangler.toml` must keep `[dev] upstream_protocol = "https"`.** The `routes`
entry makes `wrangler dev` simulate the request as arriving at
`http://mcclevarty.ca/…`, so the loopback exemption in `httpsRedirect` — which
checks `url.hostname` — never matches, and the Worker 301s every local request
to itself. The symptom is that *everything*, including `/api/health`, returns
301 with `Location` equal to the request URL, and the harness cannot run at all.
`https` matches what the Worker sees in production after edge TLS.

**Delete `dist/_redirects` before running the local Worker.** It is
`public/_redirects`, copied into `dist/` by the build. Workers static assets
parses `_redirects` as *configuration* and rejects `/* /index.html 200` as an
infinite loop — locally as well as on deploy. `npm run predeploy` strips it;
a bare `npm run build` does not.

**Zombie `workerd` processes** are the third one. Repeated `wrangler dev` runs on
Windows leave listeners on 8787/8788/8789, and each new run silently takes the
next free port while the stale instance keeps answering your `curl` with the
*old* code — which makes a correct fix look like it did nothing.

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'wrangler' }
```

## Checking production data

Read-only, safe:

```sh
npx wrangler d1 execute vessel --remote \
  --command "SELECT handle, is_operator, datetime(created_at/1000,'unixepoch') AS created FROM accounts ORDER BY created_at;"
```

`docs/BREAK-GLASS.md` has the write commands and when they are appropriate.

---

## What cannot be verified in this environment

Say so rather than implying otherwise — three claims went out this session that
had to be walked back to "unverified".

- **Animation cannot be checked from a screenshot.** An occluded Chrome window
  freezes `requestAnimationFrame`, so a canvas effect renders one static frame
  and never advances. Static layout, scale and colour *can* be checked. Motion
  needs the client's eye. This is why the duel shipped too slow twice.
- **CSS `:hover` and `:active` never fire** under automation, so pointer feedback
  is unverifiable here. `src/styles/interaction.css` owns all of it.
- **Accounts cannot be created and passwords cannot be typed** into the live site
  through browser automation. Test auth through `scripts/auth-e2e.ts`, which
  drives the real `src/auth` modules against a local Worker, or ask the client to
  perform the step.
- **Recovery codes are shown once, to the client's browser.** They are not
  recoverable from this side, so a flow that needs one needs the client.

---

## Traps that have each cost a cycle

- **Share codes are base-36.** Effect index 12 is `C`. `0-0-12-0-7-0` parses `12`
  as 38, falls through `FX[38] ?? FX[0]`, and applies the default effect (id
  `vessels`, labelled "Branches") — which looks exactly like a failed deploy.
  See `docs/DUEL.md`.
- **`FX` order is a wire format.** Append, never insert; the index is the share
  code.
- **`URL.protocol = "https:"` silently does nothing in workerd.** It produced a
  redirect whose `Location` equalled the request URL — an infinite loop that
  would have taken the site down. The fix builds the URL by concatenation *and*
  compares it against the request before sending. Do not simplify that guard away.
- **`band-*` and `layout-*` are on the same element**, so `.band-phone .layout-stack`
  matches nothing. It must be `.band-phone.layout-stack`.
- **Two `wrangler dev` instances** silently take 8787 and 8788, then fight over
  local D1 until one dies with `SQLITE_BUSY`. Kill strays before starting.
- **A stale browser bundle** looks identical to a failed deploy. Compare hashes
  (step 1 above) before debugging anything else.
