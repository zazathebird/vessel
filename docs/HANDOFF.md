# Handoff

Written 2026-08-13, at the end of the session that shipped recovery-code sign-in
and the security headers. Read `TODO.md` for what to do; this file is how to pick
the work up and how to prove you have not broken anything.

---

## Start-of-session prompt

Paste this to begin:

> Read `CLAUDE.md`, `TODO.md` and `docs/HANDOFF.md` before doing anything.
>
> The site is live at `mcclevarty.ca`, served by a Cloudflare Worker. Everything
> in `main` is deployed — verify with the bundle-hash check in
> `docs/HANDOFF.md` rather than assuming.
>
> Start with `TODO.md` item 1: run the auth end-to-end suite. Nine checks
> covering recovery→set-password were written on 2026-08-12 and have **never
> been executed**, so that flow is unproven rather than tested. Kill any stray
> `wrangler dev` first — a second instance silently takes port 8788 and the
> harness will not find it.
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
- **Unproven**: recovery-code sign-in. See the prompt above.

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

**Give a fresh deploy a few seconds** before testing routes. `/contact` 404s
briefly while the asset manifest propagates, then settles to 200.

**Deploy with `npm run deploy`, never bare `wrangler deploy`.** The bare command
fails on a fresh build — `predeploy` strips `dist/_redirects`, which Workers
static assets otherwise parses as *configuration* and rejects as an infinite
loop.

---

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
