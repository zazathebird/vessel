# Handoff

Written 2026-08-13, after the session that shipped recovery-code sign-in and the
security headers and the review session that followed it. Read `TODO.md` for what
to do and `docs/DECISIONS.md` for why things are as they are; this file is how to
pick the work up and how to prove you have not broken anything.

---

## Start-of-session prompt

Paste this to begin:

> Read `CLAUDE.md`, `TODO.md` and `docs/HANDOFF.md` before doing anything.
> `docs/DECISIONS.md` is the dated history if you need to know why something is
> the way it is.
>
> The site is live at `mcclevarty.ca`, served by a Cloudflare Worker. Everything
> in `main` is deployed — verify with the bundle-hash check in
> `docs/HANDOFF.md` rather than assuming.
>
> Start by running `npm run test:auth` against `npm run dev:worker` — it should
> pass. Kill any stray `wrangler dev` first: a second instance silently takes
> port 8788 and the harness will not find it. Then work `TODO.md` item 1, which
> is the coverage the suite does *not* have.
>
> If those pass, tell me before moving on. After that, work `TODO.md` in order
> unless I say otherwise. Do not deploy without running the verification block
> in `docs/HANDOFF.md` afterwards.

---

## State of the world

- **`piratelife` is the operator**, and is the only account. Promoted with step 1
  of `docs/BREAK-GLASS.md`. The old test account was deleted through `/admin`.
- **Deployed and working**: sign-up, sign-in + TOTP, change password,
  recovery-code sign-in, `/admin`, operator-published site config, forced HTTPS.
- **Withdrawn**: the lightsword duel. Code survives in `src/fx/effects.ts`; the
  two `FX` catalogue entries were removed. `docs/DUEL.md` is the spec for the
  rebuild.
- **Not deployed**: everything committed on 2026-08-13. The review session was
  local-only by instruction, so `main` and the live Worker are behind the working
  tree. Run the verification block below *after* the first deploy that carries it.
- **Unproven in a browser**: recovery-code sign-in. The harness covers the bytes;
  no human has redeemed a code on the live site. `TODO.md` item 2.

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

# 3. All four security headers present.
curl -s -i https://mcclevarty.ca/ | grep -icE 'strict-transport|x-content-type-options|referrer-policy|x-frame-options'

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
  as 38, falls through `FX[38] ?? FX[0]`, and applies Vessels — which looks
  exactly like a failed deploy. See `docs/DUEL.md`.
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
