# Handoff

Updated 2026-08-14: **SPEC-ACCOUNTS phase 2 is built, harness-proven and deployed** — spec
§13 + §12 K–S, migration `0004`, `worker/machines.ts`, the `MachineSignal` signalling Durable
Object, `src/share/*`, and the `/share` + `/machines` pages. Harness is at **258**. The docs
were condensed the same day (`FABLE-FINDINGS.md` deleted, its durable content moved —
`docs/DECISIONS.md` 2026-08-14 has the map). Read `TODO.md` for what to do and
`docs/DECISIONS.md` for why things are as they are; this file is how to pick the work up and
how to prove you have not broken anything.

---

## Start-of-session prompt

Paste this to begin:

> Read `CLAUDE.md`, `TODO.md` and `docs/HANDOFF.md` before doing anything. The site is live at
> `mcclevarty.ca`; everything in `main` is deployed. First prove the ground: kill stray
> `wrangler dev` processes, run `npm run test:auth` against `npm run dev:worker`, and confirm
> all 258 checks pass before anything else.
>
> Then pick up `TODO.md` from the top. Phase 2 is built but **unverified by eye** — if I am
> present, walk me through the two-tab test below first. Phase 3 (grants to others) must not
> start until `/api/account/slot` gets its password-proof gate (TODO 15) and I have signed off
> the list at the bottom of `TODO.md`.
>
> Deploy only if typecheck, build and the harness are all green, then run the verification
> block below. Commit and push at the end. Batch everything needing my eye or sign-off into
> one list at the end.

**The two-tab phase-2 test** (needs the client, two Chromium windows, one signed-in account):
on the machine with files, open `/share` → pair (password) → pick a folder. In another window
open `/machines` → the machine shows online → Open the drive → password unlock → browse, click
a file, watch it download. Then close the sharing tab and watch `/machines` say offline —
honestly, not as an error.

**Also open for a future session, at the client's request:** a full line-by-line review of all
code written before Fable 5 had access (his words: "look over every single line of code made by
the other models") — best run as its own dedicated session with fresh context.

---

## State of the world

- **`piratelife` is the operator**, and the only account.
- **Deployed and working**: everything phase 1 (sign-up/in + TOTP, recovery, change/set
  password, passkeys, saved setups, `/admin`, published site config, forced HTTPS) plus
  **phase 2**: machine pairing (password ceremony), drives, the per-machine signalling DO,
  the signed-fingerprint connect ceremony, the v1 file protocol, `/share` and `/machines`.
- **The harness is at 258** and covers every route end to end, negatives included. It cannot
  run `RTCPeerConnection` — the WebRTC hop itself and every phase-2 screen need the client's
  eye (the two-tab test above).
- **Phase boundaries hold**: no `grants`/`invites` tables, no TURN (client spend decision),
  no read cap (phase 3), `/api/account/slot` still session-only (gate lands *before* phase 3 —
  TODO 15).
- **Sign-off list** at the bottom of `TODO.md`: `totp.last_step`, §3's operator wording, `⌘K`'s
  double claim, signup's 409, TURN, the Contact mailbox (`outlook.com` vs `hotmail.ca`),
  subdomains yes/no, Pages retirement, the free-diagnostic copy.
- **Unproven in a browser** (accumulated): recovery-code sign-in on the live site (TODO 2),
  the `/admin` dialogs, TOTP enrolment screen, Passkeys + Saved setups sections, command
  palette, duel motion, matrix rain speed, mobile parity on a real phone — and now all of
  phase 2.

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

# 3. All six security headers present (expect 6).
curl -s -i https://mcclevarty.ca/ | grep -icE 'strict-transport|x-content-type-options|referrer-policy|x-frame-options|permissions-policy|cross-origin-opener'

# 3b. www 301s to the apex, path preserved.
curl -s -o /dev/null -w "status=%{http_code} location=%{redirect_url}\n" https://www.mcclevarty.ca/services

# 4. D1 bound, migrated (8 tables since phase 2), and the DO answering.
curl -s https://mcclevarty.ca/api/health          # {"ok":true,"tables":8,...}

# 5. Client-routed URLs resolve — including the phase-2 pair.
curl -s -o /dev/null -w "%{http_code}\n" https://mcclevarty.ca/signin
curl -s -o /dev/null -w "%{http_code}\n" https://mcclevarty.ca/machines
curl -s -o /dev/null -w "%{http_code}\n" https://mcclevarty.ca/share
```

**`/api/health` is the decisive one** for "is the Worker serving this domain".

**Step 3 proves the headers on page routes only.** `/assets/*` never passes through `harden()`
(`run_worker_first` negation); the bundles get `nosniff` from `public/_headers`, checked with:

```sh
curl -s -i https://mcclevarty.ca/assets/$(curl -s https://mcclevarty.ca/ \
  | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1) | grep -i 'x-content-type-options'
```

**`public/_headers` must not be stripped at deploy** — it is the bundles' only `nosniff`.
`_redirects` IS stripped (Pages-specific; the Worker rejects it).

**Give a fresh deploy a few seconds** before testing routes; manifests propagate.

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — `predeploy` typechecks *and*
strips `dist/_redirects`.

**Remote migrations are separate from deploy**: `npm run db:migrate:remote` before the first
deploy that needs a new table.

---

## Running the stack locally

Three things stand between a clean checkout and a working `npm run test:auth`, and all three
look like the code is broken:

- **`wrangler.toml` must keep `[dev] upstream_protocol = "https"`** — without it every local
  request 301s to itself (the routes make dev simulate `http://mcclevarty.ca/…` and the
  loopback exemption never matches).
- **Delete `dist/_redirects` before running the local Worker** (`npm run predeploy` strips it;
  bare `npm run build` does not). Workers static assets parses it as configuration and rejects
  it.
- **Zombie `workerd` processes.** Repeated `wrangler dev` runs on Windows leave listeners on
  8787+; each new run silently takes the next port while the stale one answers with old code.

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

Say so rather than implying otherwise.

- **Animation cannot be checked from a screenshot** — an occluded Chrome window freezes rAF.
- **CSS `:hover`/`:active` never fire under automation.**
- **Accounts cannot be created / passwords typed** into the live site through automation; test
  auth through the harness.
- **Recovery codes are shown once, to the client's browser.**
- **`RTCPeerConnection` does not exist in Node** — the harness proves signalling and the
  ceremony's bytes; the data channel itself needs the two-tab test.

---

## Traps that have each cost a cycle

- **Share codes are base-36; `FX` order is a wire format.** Append, never insert. `0-0-12-0-7-0`
  parses `12` as 38 and silently applies the default effect — looks exactly like a failed deploy.
- **`URL.protocol = "https:"` silently does nothing in workerd.** The redirect is built by
  concatenation and compared against the request first; keep that guard.
- **`band-*` and `layout-*` are on the same element** — `.band-phone.layout-stack`, no space.
- **Two `wrangler dev` instances** fight over local D1 until one dies with `SQLITE_BUSY`.
- **A stale browser bundle** looks identical to a failed deploy — compare hashes first.
- **A 101 response must not pass through `harden()`** — the copy drops `webSocket` and every
  signalling connection hangs. `signalUpgrade` is special-cased in `worker/index.ts`; keep it so.
- **workerd delivers server-initiated closes on hibernated sockets lazily** (local dev). The
  `replaced` frame is the contract, never the close code.
