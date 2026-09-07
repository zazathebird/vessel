# Security audit — 2026-09-03

A full pass over the Worker, the auth stack, the download catalogue, the four setup scripts and
both host scripts, commissioned by the client, with remediation. Everything below was **found by
reading the code against its own comments** and then reproduced — either against the local Worker
or, for the shell, by executing the real functions out of the real scripts.

**Nothing here is deployed.** `npm run check` is 70 green (69 → 70; one gate added) and
`npm run test:auth` 365, both against local D1.

**Numbering continues the sequence this document already uses** (1–14), because items in it are
cited by number elsewhere. Findings are grouped as before: **fixed**, **checked and sound**,
**needs the client**, and what could not be verified from here.

---

## 2026-09-07 — the fourth pass

Six of seven reviewers read their slice; the **setup and host scripts slice was never read** (its
reviewer died on a rate limit) and is still owed a pass. Everything below was verified against
the code, and item 39 against production, before it was fixed. `npm run check` is **75** (64
fast), `npm run test:auth` **406** (398 → 406). Break-verified: the two new `check` gates and
the WebSocket origin gate each go red against the pre-fix code. **Deployed 2026-09-07** as Worker `df6dba2a-9748-4ba7-9e95-d34390c319c9` (rollback `014152a8`, no migration); verified live — bundle `index-DZlb5G6p.js`, six headers, `/assets/does-not-exist-zz` and `/assets/does-not-exist.js` both hardened with `max-age=0`, the real bundle still `immutable`, a cross-site POST 403, a cross-site WebSocket upgrade 403 (over HTTP/1.1; curl on HTTP/2 drops the Upgrade header and gets the 426, which is not the origin check).

### 37. The agent's trust root was taken on faith from the pair response

`src/components/SharePage.tsx`, both `PairForm` and `TakeOverForm`. The agent tab's trust root
— the public key it will accept browse signatures from, stored at pair time and never re-fetched
precisely so a later server compromise cannot re-root it — was `grantPubkey` from
`POST /api/machines/pair`, stored as received. A lying Worker or database substituted its own
key at the one moment the tab was listening, and the agent then served that key's holder every
file it held a handle to. The password already proves the root for a *browsing* connection
(`unlockForConnect` opens the slot locally: AES-KW fails closed on the ciphertext and the P-256
import checks `Q = d·G`, so a public key that survives is bound to the password); pairing did
not use it. **Fix**: `pairMachine` in `src/share/unlock.ts` proves the slot *before* the pair
call, stores the proven key, and refuses a pair response that disagrees. Both forms go through
it. The security review added a caveat worth its own line: the `Q = d·G` import check is
Chromium's, not WebCrypto's promise, so `provePublicKey` (`src/auth/grantKey.ts`) also signs a
fixed message with the unwrapped key and verifies it against the server's point — the same
question asked of the arithmetic rather than the browser. **Harness**: driven through a fetch
shim that lies on the pair response and one that lies on the slot — each refused with nothing
stored; a wrong password is refused with nothing registered; the signature proof is driven
directly with the account's point and a stranger's.

### 38. Setup-code twin rows could be built from visible look-alikes

`src/share/setupCode.ts`. Item 30 closed the *invisible* twin row — `Invoices` and
`Invoices\uFE0F` — through `foldLabel`. A twin built from a glyph no reader can tell apart was
still open: `Invoiсes` with a Cyrillic es, `Bаnk` with a Cyrillic a, `FiIes` with a capital i
for the ell, `0ct 2O2O`, `PHOTOS`. NFKC folds none of them. **Fix, in the fold only**: a table
of Cyrillic, Greek and small-capital letters whose glyph *is* the Latin one, then a case fold,
`l/I/1/|` → `1` and `O/0` → `0`, before the duplicate test. **Deliberately not in the filter** —
a Russian folder name is honest and the code is machine-generated from names that already
exist, so refusing a script would refuse the whole code on the happy path. Gated: seven
look-alike pairs refused, and two different Cyrillic labels accepted so the fold cannot become a
script filter.

### 39. `/assets/<miss>` served the app shell with no security headers, cached for a year

Verified live on `mcclevarty.ca` before the fix. `run_worker_first = ["/*", "!/assets/*"]`
excluded every path under `/assets/` from the Worker, including the ones that do not exist —
and a miss is answered by the asset server's SPA fallback: the shell, never passing through
`harden()` (no CSP, no `X-Frame-Options`, no HSTS) and carrying `public/_headers`' year-long
`immutable` cache policy. A frameable, nonce-less copy of the site at any name somebody chose,
told every cache to keep it for a year. **Fix**: `run_worker_first = true`, no negation. The
first draft narrowed the glob to `!/assets/*.js` and `!/assets/*.css`; the code review pointed
out that a negation is matched against the *path*, so `/assets/anything.js` was still the
fallback shell — a miss can be named anything, and nothing name-shaped closes it. Every path
goes through the Worker now; the bundles' bytes and `_headers` still come from the asset
binding, so a hit keeps `immutable`, and `unvalidatable()` sets `cache-control: public,
max-age=0, must-revalidate` on any document it rewrites, whatever path it arrived by. Verified
under `wrangler dev`: a miss by any name gets the headers and `max-age=0`, the real bundle keeps
`immutable`. `docs/HANDOFF.md`'s verify block gained both curls.

### 40. `validDuelPages` threw on a prototype key

`src/data/duelSettings.ts`. Both override walks used `key in full`, which is true of
`constructor`; a published `{ tuning: { constructor: 1 } }` indexed `DUEL_BANDS.constructor`
and destructured a function as a `[lo, hi]` pair — a `TypeError` inside `loadConfig`, on every
visitor's first render, from one field of one page override. The site config is validated field
by field precisely so one bad value cannot take the page down. **Fix**: an own-property test.
Gated with `constructor` and `__proto__` at both levels, parsed from JSON so they are own keys
as they are off the wire.

### 41. The WebSocket upgrade's origin test was weaker than a POST's

`worker/index.ts`. `signalUpgrade` carried its own origin check because `crossOrigin` returns
false on GET and a handshake is a GET — and the copy compared the host alone: no scheme, no
`Sec-Fetch-Site`. The one long-lived authenticated channel had a weaker test than a rename.
**Fix**: `foreignOrigin()`, the method-blind half of `crossOrigin`, shared by both. Harness: an
upgrade from a foreign origin and one stamped `cross-site` are each refused 403; the scheme half
is loopback-exempt and so cannot be driven under `wrangler dev` (said so in the harness rather
than asserted).

### The same day, second sitting — the three recorded items and the scripts slice

`npm run check` **77** (65 fast), `npm run test:auth` **407**. **Deployed** as Worker `38ceae8d-be25-49f1-8b63-605e2cabe101` (rollback `df6dba2a`, no migration), verified live per HANDOFF. The scripts slice was read in full
this time (every file under `scripts/` that ships to a customer or a host); its "checked and
sound" list is at the end of this section.

### 42. `signout` answered 500 on a deleted account's still-valid cookie

`worker/accounts.ts`. `audit.actor_id` references `accounts` with `ON DELETE SET NULL`, and a
cookie outlives the account it names by up to thirty minutes after an operator delete-account —
so the plain insert violated the foreign key on the one request whose job is to clear that
cookie. **Fix**: the actor is resolved through a subselect, which yields NULL for a gone account,
the row the cascade would have produced. Harness: an account is signed up, deleted by the
operator, and its cookie signs out with 200.

### 43. The browsing tab pinned nothing — closed, the SSH shape (was item 4)

`src/share/browse.ts`, `src/share/store.ts`, `src/components/MachinesPage.tsx`. The owner's
browser fetched `machines.agent_pubkey` from the server on every browse, so a database write
could point the owner at an impostor agent that serves files the owner never put there. **Fix**:
a per-browser pin per machine, taken at first *verified* connect (after the agent has proven the
key by signature — pinning earlier would pin the impostor) and consulted *before* the signalling
socket opens, so a changed key learns nothing. On change the page asks: *"If you re-paired or
re-keyed it yourself, accept the new key; if not, refuse."* Pairing or re-keying from the same
browser pins the key it just made, so an honest re-key never trips the question. Gated on the
pure verdict and the wiring order; the socket path cannot run here.

### The passkey note was a documented decision, not a finding

`src/auth/api.ts` says it in the type: the sign-in assertion's `prf` output is deliberately not
retained, because unlike a spent recovery code it is re-derivable at will, and the harness already
opens the slot with a fresh evaluation. The 2026-09-07 morning note re-observed a decision. Struck.

### 44. The Windows blocklist opened most of `%APPDATA%`, `%LOCALAPPDATA%` and `%ProgramData%`

`scripts/windows-share-setup.ps1`. Chrome blocks all three with block-all-children; the script
had them as *exact* entries and named three vendors underneath, so `%APPDATA%\Thunderbird`
(saved passwords), `%APPDATA%\Telegram Desktop` (session keys), `%APPDATA%\discord` (the token)
and `%LOCALAPPDATA%\Packages` (every Store app's state) were shareable — the blocked-leaf,
shareable-ancestor shape one level above where 2026-09-03 fixed it. **Fix**: the three roots are
prefix entries. Same family on Unix: `~/.cache`, `~/.dbus` and `~/.thunderbird` added to both
shell scripts. Gated — and the gate's own parser was found closing the array at the first `)`,
which a `pass(1)` comment supplied, so every entry after that line had been outside the slice;
comments are stripped first now.

### 45. `launch.bat` resolved `powershell.exe` from the current directory

`scripts/launch.bat`. `cmd.exe` searches the current directory before `PATH`, and double-clicking
the launcher from Explorer makes Downloads the current directory — so a `powershell.exe` dropped
there by any drive-by download ran with the person's rights the moment they ran the launcher they
had just checksummed (CWE-427). **Fix**: the full `%SystemRoot%` path. **The published bundle must
be rebuilt and re-uploaded** (`scripts/setup-bundle.sh`, then the downloads editor), since its
checksum changed.

### 46. The Pi host wrote no Chromium managed policy

`scripts/pi-setup.sh`. CLAUDE.md recorded the policy as "the answer to autologin" under a heading
covering both hosts; the Pi script had none, so a Pi booted into the operator's signed-in profile
with every URL, DevTools, sync and the password manager available to whoever was at the keyboard.
**Fix**: ported from the ThinkCentre script — same keys, scheme and host matched against a closed
set, written beside-and-renamed to whichever `chromium*` policy directory the installed browser
reads, state reported from the disk. Gated for both hosts, including `bash -n`.

### 47. The runbook's `--undo` claim was wrong

`docs/SHARING-SETUP.md` said undo "refuses a share folder it did not create"; all three scripts
adopt an existing folder and write the marker into it, and undo then removes every link in a
marked folder. Links only, never targets, so the damage is bounded. The runbook now says what
happens.

### 48. The ThinkCentre launcher truncated Chromium's `Preferences` in place

`scripts/thinkcentre-setup.sh`, at every service start. A power cut mid-write left a truncated file
Chromium discards, and the persistent folder grant lives in it — the trip to the machine the
profile-is-the-pairing rule exists to avoid. **Fix**: written beside the file and renamed, as the
Pi script already did.

### 49. `--store /var/lib` was accepted and chowned the dpkg database to the desktop user

`scripts/thinkcentre-setup.sh`. `/var` and `/root` were exact-only refusals, so anything beneath
them was accepted, chowned to the autologin user and remembered in the store file — the
physical-access-becomes-root path the script's own preflight warns about. **Fix**: both are prefix
refusals.

### Scripts slice — checked and sound

Setup-code encoders (byte-wise JSON escaping in awk and by integer code point in PowerShell,
surrogate pairs intact, base64url matching the decoder, labels from the canonical basename);
blocklist evaluation (canonicalise-then-compare, `//` collapse, every-component reparse walk on
Windows, bash arrays, `/` surviving the strip); no `eval`, `Invoke-Expression`, `cmd /c` or
unquoted user values anywhere; `.desktop`, LaunchAgent and scheduled-task strings built from
constants plus the charset-gated `-BrowserProfile`; `sudo` only for `pmset` on Unix and nothing
for junctions on Windows; host scripts refuse root, write root files temp-and-rename with a
read-back, validate the kiosk URL before and after, take the SSH port from `sshd -T`, bind Docker
ports to an address, install from apt; `setup-bundle.sh` allowlists before `rm -rf`, asserts BOM
and CRLF, checksums the copied bytes. **Unverified**: whether Raspberry Pi OS adds its own archive
to unattended-upgrades' origins — if it does, Chromium is replaced under the running Pi kiosk,
the case the ThinkCentre script blacklists. Carried in `TODO.md`.

---

## 2026-09-06 — the second follow-up pass

A third reading, the same day as item 33 shipped, asked one question of every route: *what does
this change for somebody who is not the caller?* Read in full: every file under `worker/`,
`src/auth/`, `src/share/`, the migrations, the three share scripts and `launch.bat`, the
front-end sinks (`grep` over `src/` for every HTML and URL sink — there are none that take
data), the head injection and its escaper. `npm run check` is **75** (64 fast),
`npm run test:auth` **398** (379 → 398). **Deployed 2026-09-06** as Worker
`014152a8-be8f-4258-ab0e-cf8cd3f7cfe7` (rollback `4542397b`, no migration); verified live —
bundle `index-BGngf5mi.js`, a cross-site POST answered 403.

### 34. A save that widens was a session-only write

`worker/downloadPages.ts`. Item 33 drew the line at *"does this change what somebody else can
get"* and listed six routes on it. Two more were on it some of the time. `savePage` takes a
page from `draft` to `live` and from `granted` to `public`; `saveFile` flips a paid, uploaded
file to `free` and moves a file to another page — and every one of those was a session-only
write, so the thirty-minute stolen cookie that item 33 closed out of `finishUpload` could still
publish every draft, make a customer's private page public, and hand every paid program to
anyone, with no password anywhere. Reproduced through the harness with the cookie alone.

"A save is an edit" was not wrong; it was that these two saves are sometimes releases. So the
question is now asked of the **transition**, not the route: `savePage` reads the row it is
about to overwrite and demands the password when `status` becomes `live` on a page that was
not, or when a live page's visibility widens (`granted` < `code` < `unlisted` < `public`);
`saveFile` demands it when an existing row flips `free` on or changes `slug`. A title edit, a
price change, a narrowing, an unpublish, a new draft and a new file row all stay session-only —
a new row has no bytes until `finishUpload`, which asks. **`proven()` is deliberately not used
in either**: it asks unconditionally, which is the prompt-on-every-keystroke the client refused.

Both halves read one constant (`RELEASE_WORDING` in `src/data/downloads.ts`): the Worker
refuses with it and the editor opens its password dialog when a 401 starts with it, which is
what tells the refusal apart from a lapsed session's 401. The editor is **reactive** — it sends
the save, and a refusal opens the dialog and retries with the proof — because its copy of the
page's state can be stale and the Worker's cannot. One round trip before the dialog on a
publish, the same round trip a delete pays.

Gated in `npm run check` as shape (the guard and the call, and the absence of `proven()`) and
driven in `npm run test:auth` as the transitions: live without the password 401, with the wrong
one 401, with the right one saves; widen without 401; narrow, retitle, unpublish and open a
*draft's* visibility all save bare; the same six on a file, plus a new free row saving bare.
**Break-verified**: with the guard disabled the fast gate fails and the harness fails seven
checks.

### 35. `-BrowserProfile` reached the logon task's argument string unvalidated

`scripts/windows-share-setup.ps1`. `Register-LoginTask` builds
`--profile-directory="$BrowserProfile" --new-window <url>` and registers it as a task that runs
the browser at every logon. A value carrying a quote closed the argument and everything after
it was a browser flag — `--no-sandbox`, `--load-extension=`, `--user-data-dir=` — which is item
20's kiosk-URL finding one script over, and the same delivery: *"type this in the box"*. The
value is matched against a closed charset in `Main` before anything consumes it (a profile
directory is `Default` or `Profile N`), and a miss is a sentence and `exit 1`. Shape-gated.

### 36. Smaller, recorded so it is not re-found

- **`Sec-Fetch-Site: cross-site` is refused on every state-changing request** (`crossOrigin`,
  `worker/index.ts`), beside the Origin check rather than instead of it. Every current browser
  stamps it and a page cannot alter it, so it covers the Lax+POST grace window even when a
  browser omits `Origin`. A missing header is still allowed — non-browser clients and the
  harness — and `same-site` is deliberately not refused here, because a sibling subdomain is the
  Origin check's job.

### Checked this pass and found sound

- **Routing**: exact `METHOD /path` matching, nothing served from `/api/` by the assets binding,
  `PUT` on the upload part covered by the origin check, `HEAD` only on the byte route.
- **Sessions and tickets**: the six-field token, purpose under the MAC, constant-time compare
  before expiry, the 12-hour ceiling inside `verify`, `__Host-` cookie with `SameSite=Lax`, a
  ticket subject that cannot be confused (`@`/`~`/bare over ids that `KEY` restricts to
  `[a-z0-9-]`).
- **Sign-in**: equal database work on the unknown-handle path, the recovery code spent only when
  the sign-in completes, the TOTP ticket for a recovery sign-in carrying the credential, the
  second-factor bucket, `set-password` bound to the session's account and the redeemed slot's
  existence.
- **Passkeys**: the CBOR subset with bounded reads, DER → P-1363 with length checks, `UV` both
  ways, origin and RP hash from the routed request, the challenge spent monotonically. A
  registration after an operator reset is refused by `assertPassword` (no password row), which
  is the intended shape: recovery first, then a password, then more credentials.
- **Downloads**: `resolveAccess` first on every read, both lookups unconditional on the byte
  route, `canDownload` through `canRead`, grants as rows, the pin compared unconditionally, a
  `code` page's locked answer carrying no `intro`/`notice`, `listPages` hiding `granted` from
  strangers, the upload keyed only on a `KEY`-validated id with `complete` behind the password.
- **The head injection**: `<` escaped in the JSON, attribute escaping on the meta, the canonical
  built from a constant host and never the request.
- **The sharing agent**: offers verified against the pair-time root before any answer, the
  signed fingerprint bound to role and machine, the DTLS certificate the only thing a replayed
  signature could not supply, paths as validated component arrays walked handle by handle, reads
  only, drives resolved only through the `handle:` key prefix.
- **The front end**: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `srcdoc` or
  `postMessage` listener anywhere; every `href`/`src` from a constant or a `KEY`-restricted
  slug; `theme.ts` interpolates only catalogue ids into class names.
- **The share scripts**: `json_string` escapes quotes and backslashes and strips controls, the
  Linux call site does the base64url translation the helper's name promises, `make_link` refuses
  an existing non-link, `--undo` removes links and never targets, `launch.bat` runs only the
  sibling script by `%~dp0`.

### Needs the client's decision — not a fix

5. **A session survives a password change and an operator reset.** There is no session table
   by design (§9), so a cookie minted before either keeps working until its 30-minute expiry
   (12 hours across refreshes). Closing it needs one column — a `credentials_changed_at` on
   `accounts`, set by change-password, set-password and the operator reset, with
   `requireAccount` refusing a session issued before it. No personal data, but §9's inventory
   gains a field, which is a spec change and his call.
6. **`beginUpload` hides a live file before the password is asked.** It sets `uploaded_at` to
   null so the row's size cannot lie mid-upload, which means a stolen cookie can take every
   download offline without the proof `finishUpload` demands. Nothing leaks and nothing is
   replaced; it is an availability write on the edit side of the line. Keeping the old bytes
   live until `finishUpload` swaps them is the fix, and it changes what a half-finished
   replacement looks like to a customer, which is why it is a question.

### What this pass could not verify

- **The two new dialogs have not been driven by eye** — the page form's publish/open-up prompt
  and the file form's free/move prompt. Harness-proven at the Worker; the React path is
  typechecked and follows `ProofDialog`'s existing shape.

---

## 2026-09-06 — the follow-up pass

A second reading of the whole Worker, the browser auth layer and the phase-2 sharing agent, after
the 2026-09-05 session was cut short by a crash. Read in full: every file under `worker/`,
`src/auth/`, `src/share/`, the migrations, `wrangler.toml`, `public/_headers`, and the live DNS
and response headers. **Deployed 2026-09-06** as Worker version
`4542397b-b531-41f2-b368-81a9ec47d386` (rollback `ad36fcb6-7084-4e3b-82fd-4bb5d8979b51`, no
migration); verified live — eight routes 200, bundle `index-Diu_WTOh.js`, a 70KB claim body 413,
no validators on HTML. `npm run check` is **74** (63 fast),
`npm run test:auth` **379** (366 → 372 for the 2026-09-05 sections, → 379 for item 33).

### 32. The crash left the body-bound fix half-applied, and the half that landed was a regression

The 2026-09-05 session wrote `readBounded`, the gate for it, the harness section and the comments —
and never switched `readJson` over. The working tree had a comment saying the body was measured on
the stream above a line that still said `await request.text()`, and the byte-accurate
`TextEncoder` check from item 23 had been *removed* in the same edit, leaving `text.length` alone:
30,000 three-byte characters would have passed a 64KB limit at 90KB again. The check suite caught
it (the new stream gate timed out, then failed), which is the point of the gate. `readJson` now
reads through `readBounded`. The same crash left `worker/setups.ts`'s `CODE_PATTERN` at `{4,5}`
under a comment saying seven fields; the gate for that failed too, and it is `{4,6}`.

**What the crash was.** `reader.cancel()` on a request body that is still uploading is fine in
production workerd, but `wrangler dev`'s proxy surfaces it as `Network connection lost.` and
**exits the dev server** — reproduced: the harness's 70KB `claim` POST 413'd correctly and the
next request was `ECONNREFUSED`. `cspReport` never hit this because it refuses on the declared
`content-length` before opening the stream. `readJson` now does the same first, so every honest
oversized body (and every harness body) is refused without a cancel, and the cancel path is kept
for the chunked or lying body it exists for. Under `wrangler dev` that path still kills the
server; that is a wrangler bug, noted in `docs/HANDOFF.md`, and it cannot be reached by a browser
on the real site.

### 33. The release-shaped operator writes took a session alone

Found in the same reading, routed to the client as decision item 3 below, **decided and fixed the
same day**: "yes, on releases only." Six routes now demand the operator's password through a
`proven()` helper per file — `mintCode`, `addGrant`, `finishUpload`, `deletePage`, `deleteFile`
and `publishSiteConfig` — and the seven edit routes deliberately do not; `npm run check` asserts
both halves and `npm run test:auth` drives all six with a wrong proof or a missing one and reads
the 401, before any lookup. `docs/DECISIONS.md` 2026-09-06 has the line and why it is drawn where
it is. The screens gained one shared `ProofDialog` and four inline password fields; the upload
proves the password before its first part.

### Checked this pass and found sound

- **Sessions and tickets** (`session.ts`): purpose under the MAC, constant-time compare before the
  expiry check, twelve-hour ceiling carried across refreshes, `__Host-` cookie.
- **Sign-in** (`accounts.ts`): the decoy branch of `challenge`, equal database work on the
  unknown-handle path, no short-circuit over the recovery candidates, reserve-then-check on every
  credential path, the recovery code spent only when the sign-in completes, `setPassword` spent by
  the slot's existence.
- **Passkeys and WebAuthn** (`passkeys.ts`, `webauthn.ts`): the narrow CBOR subset with bounds on
  every read, DER → P-1363 with length checks, `UV` required both ways, origin and RP-hash checked,
  the challenge spent monotonically in the write's own `WHERE`, the attested credential id compared
  against the presented one.
- **Admin** (`admin.ts`): every write behind `proven()`, every last-way-in guard in the write.
- **Downloads** (`downloads.ts`, `downloadPages.ts`): `resolveAccess` the single authority,
  `canDownload` never reading `ticketVisible`, grants evaluated as rows, one refusal on the byte
  route with equal work either side, the pin compared unconditionally, `filename` stripped of quotes
  and backslashes again on the way out, `content-type` forced to `octet-stream`.
- **The sharing agent** (`src/share/*`): the offer verified against the pair-time trust root before
  an answer exists, `fingerprintFromSdp` refusing two distinct fingerprints, paths as component
  arrays with every spelling of traversal refused, reads only, the drive id resolved only through
  the `handle:` key prefix.
- **Headers and edge**: HSTS two years with subdomains, `X-Frame-Options: DENY` (the enforced
  clickjacking defence while the CSP stays report-only), `nosniff` on assets through `_headers`,
  `http://` and `www.` and `.com` all 301 to the apex, `/api/health` disclosing nothing an
  attacker can use.
- **DNS and mail**: DNSSEC validating (item 7, now closed), SPF `-all`, DMARC `p=reject` with
  strict alignment, CAA present.

### Needs the client's decision — not a fix

3. ~~**The downloads editor's writes and the site-config publish are session-gated, not
   password-proven.**~~ — **decided 2026-09-06: releases only; fixed as item 33.** Item 16 put `proven()` in front of every write in `admin.ts` on the argument
   that a session says who you are and never how you proved it. The same argument covers
   `POST /api/site-config` and the sixteen operator routes in `downloadPages.ts` /
   `downloads.ts`, and one of them is the most damaging write on the site: a stolen operator cookie
   can `beginUpload` / `uploadPart` / `finishUpload` **replacement bytes for a program customers
   download and run**, or mint an unscoped "everything paid" code, or add a grant. Thirty minutes
   of cookie becomes malware served under the operator's name indefinitely. It was left out of
   item 16 because the editor saves often and a password on every save is a password typed
   carelessly. The narrow version — `mintCode`, `addGrant`, `finishUpload`, `deletePage`,
   `deleteFile`, `publishSiteConfig`, each of which is a *release* rather than an edit — is one
   prompt per release and a `proven()` call apiece, plus the editor collecting the password once
   per session the way `Admin.tsx` does. His call, because it changes how the editor feels to use.
4. **The browsing tab pins nothing.** The agent stores the owner's grant public key at pair time
   and never re-fetches it; the owner's browser fetches `machines.agent_pubkey` from the server on
   every browse. So a database write — not a request, a write — could point the owner at an
   impostor agent that *serves* files the owner did not put there. §3's "the operator cannot read
   any user's files" still holds; what does not is "the files you see are yours". Closing it is a
   per-browser pin of the agent key at first connect with a warning on change, the SSH shape. A
   phase-3 question rather than a phase-2 fix.

---

## Fixed in this pass

### 15. WebAuthn challenges were bound but never spent

`worker/passkeys.ts`, plus a new `migrations/0008_passkey_replay.sql`.

A captured sign-in request body — token, `clientDataJSON`, `authenticatorData`, signature, all of
it — posted again **verbatim** minted a fresh session, every time, for the five minutes the
stateless token stayed alive. `verifyAssertion` binds the response to a challenge; it cannot make
that challenge single-use, because the same signed bytes answer the same challenge for ever.
**Binding is not spending**, and this codebase had conflated the two in three places: `session.ts`,
`webauthn.ts`, and this document's own *reviewed and deliberately left alone* list.

That defeats the specific argument §4 rests on. The passkey path takes no TOTP stage and no rate
limiting *because* a failed attempt is supposed to require forging a P-256 signature. **A replay
forges nothing.**

Registration had the same shape one step down: one token registered as many *different*
authenticators as anybody cared to send, because the credential-id uniqueness index only ever
refused an *identical* replay.

Both ceremonies now consume their challenge in a conditional UPDATE whose guard rides in the
write's own `WHERE` clause, zero `meta.changes` being the refusal — the `passkeys.remove` doctrine,
and the `totp.last_step` shape from migration 0002 one credential kind over. Check-then-act would
not close it: two copies of the same body would both read the challenge unspent, which is the
attack rather than a race around it.

**There is deliberately no challenge table.** The stateless token stays the design and a table of
live challenges stays the rejected option.

**The guard is monotonic in the token's issue time, and an equality guard was written first and was
still bypassable.** `last_challenge <> ?` refuses only the challenge stored *most recently*, so two
captured bodies alternated are each different from the one stored just before them and each is
accepted, indefinitely; a single captured body reopens the same way the moment any other sign-in on
that credential lands in between, which two tabs or one retry is enough to arrange. The test is on
`last_challenge_at` instead (`worker/passkeys.ts:245`, `:482`) — a challenge minted no later than
the last one spent is refused, whatever it is — so every old body is dead for good. The digest
column stays beside it as a conjunct, never an alternative: it can only refuse more, and it is the
half that depends on no clock.

**What monotonic costs, stated rather than discovered later:** a genuine ceremony completed *out of
order* is refused — two tabs opened in one order and finished in the other. That is the property
0002 already accepts for TOTP, the answer is "start again", and pressing the button again works.
An escape hatch for it would be the alternation hole one millisecond wide.

**Also here, and separate**: `credentials` had no row cap for passkeys. `assertPassword` throttles
a *failing* caller and `recordSuccess` resets the account bucket on every success, so a loop that
keeps succeeding was unthrottled by design and one password plus one session could grow that table
until D1 said stop. `MAX_PASSKEYS = 20` (`worker/passkeys.ts:87`), asked after the password so the
row count is not something an unproven caller can measure.

### 16. Every admin route was authorised by the session alone

`worker/admin.ts`. Four writes — grant/revoke the operator flag, reset TOTP, reset a password,
delete an account — took `operator(request, env)` and nothing else. **A session says who you are,
never how you proved it.** A stolen operator cookie could POST to `/api/admin/operator` and grant
itself the flag *permanently*, outliving the session it was lifted from and surviving both the
30-minute expiry and a sign-out; `resetPassword` and `deleteAccount` destroy key slots
irreversibly.

`proven()` (`worker/admin.ts:75`) is the chokepoint: caller, body, and `assertPassword` on the
caller's own password before `target()` runs, so a wrong password is refused without first
reporting whether the named account exists. One helper rather than the same two lines in four
handlers, on this file's own doctrine — the fifth admin write somebody adds inherits the proof.
`assertPassword` carries its own rate limiting, so this adds a bucket rather than an unthrottled
password oracle behind a session.

**`listAccounts` deliberately does not ask.** It changes nothing, and a password prompt in front of
a list is a password typed often enough to be typed carelessly.

The proof is the *caller's* password: a credential check, not an authorisation over the target —
the operator flag is the authorisation and has already been checked.

Verified by breaking it: with the proof removed the new harness gate reports `status 200` and
`operator flag is now true`.

The client half (`src/auth/api.ts`, `src/components/Admin.tsx`) takes `authSecret` as a **required**
argument so a new caller cannot omit it and find the 401 in production, and all four buttons now
open a confirm dialog. Asking for the password is not a step bolted onto the confirmation, it *is*
the confirmation — and granting operator, the one action here that escalates rather than destroys,
was the one with no confirmation at all.

### 17. A file-scoped download code outlived its file, and opened somebody else's page

`worker/downloadPages.ts`, `worker/downloads.ts`.

`deletePage` deleted `download_codes WHERE slug = ?`. A file-scoped code stores `slug = NULL,
item_id = <id>`, so that statement never matched one: the code was left **dormant, not revoked**,
and `opened()` re-resolves `item_id` against `download_files` at every redemption.

The comment that made this look safe said an id "is not re-usable the way a slug is, because
`saveFile` would have to be given the same id by hand". **That was false.**
`suggestFromFilename` derives the id from the filename and the editor auto-fills it, so re-adding
the same program produces the same id every time, by hand and without meaning to. Proven end to
end: customer A's code, after A's page was deleted and the same program was re-added on customer
B's page, passed the gate for B's bytes and rendered B's page in full — title, private prose, every
file's name and price.

Three fixes, because there are three ways the pairing comes apart:

- `deletePage` deletes file-scoped rows **first**, by subquery, because after the page goes the
  files cascade and nothing can find them (`worker/downloadPages.ts:660`). `deleteFile` deletes
  them too (`:936`) — the grants line beside it always had; the asymmetry was the tell.
- A file-scoped code now records, in `slug`, **the page its file was on when the code was minted**.
  `opened` refuses if the file has moved since. This is the case no delete can catch:
  `saveFile`'s `ON CONFLICT (id) DO UPDATE SET slug = excluded.slug` re-points every outstanding
  code for a file simply by *moving* it. **Refuse, never repair** — following the file to wherever
  it went is how a ticket ends up naming a page nobody agreed to hand over.
- `mintCode`'s `granted` refusal now covers a file's page as well as a page scope. It checked only
  that the file existed, so a code could be minted for a file on a `granted` page — and such a code
  is not weak, it is inert, which is why `mintCode` refuses to make one at all.

**Codes minted before this deploy carry `slug = NULL` and keep the old behaviour** rather than
being refused wholesale — see *needs the client* below.

### 18. A space in `$HOME` disabled the entire setup-script blocklist

`scripts/linux-share-setup.sh`, `scripts/macos-share-setup.sh`.

`BLOCK_EXACT` and `BLOCK_PREFIX` were single space-delimited strings, consumed unquoted
(`for bad in $BLOCK_EXACT`) so that word splitting would produce the entries — which means **IFS
shattered every `$HOME`-derived entry** into fragments that match nothing. Measured with
`HOME="/home/bob smith"`: `$HOME`, `~/.ssh`, `~/.gnupg`, `~/.config` and all of `~/.local` were
allowed. An account name with a space in it is ordinary on macOS, so this is the likelier machine,
not the exotic one. The `# shellcheck disable=SC2086` sitting above them is what suppressed the
warning; it is gone with the strings. Both lists are bash arrays now
(`scripts/linux-share-setup.sh:232`, `scripts/macos-share-setup.sh:263`).

This matters because of the standing rule: **these lists are the only barrier.** Chrome blocks
sensitive directories as "do not pick", never "do not read", so a link *inside* a picked folder is
read normally and nothing downstream catches a miss.

Two more holes in the same lists, found while fixing it:

- **Blocked directories with unblocked ancestors are not blocked.** `~/.local/share/keyrings` was
  refused while `~/.local`, which contains it, was allowed; on Windows,
  `%LOCALAPPDATA%\Google\Chrome\User Data` was refused while `%LOCALAPPDATA%\Google` was allowed,
  and `%APPDATA%\Microsoft\Crypto` was refused while `%APPDATA%\Microsoft` — which holds the DPAPI
  master keys that decrypt what the first one protects — was allowed. The ancestors are named now,
  along with `~/.var`, `~/.pki`, `~/.docker`, `~/.kube`, `~/.password-store` and their Windows
  equivalents.
- **The filesystem root `/` was never blocked at all.** `${bad%/}` reduces that one entry to the
  empty string, so `/` compared against `""` and passed the list that names it; no prefix entry
  matches `/` either, and the share-root containment test builds `"$f"/*`, which for `f=/` needs two
  leading slashes. **Pre-existing, present in HEAD, and missed by the audit** — it was found while
  building the gate for the rest. The strip no longer empties an entry, and a trailing-slash strip
  no longer empties `/` at the three other places it is applied.

**The gate for this now executes rather than greps** (`scripts/check.ts`). The old text gate
reported *"20 required blocklist entries … intact"* the whole time the barrier was open — every
entry it looks for was present; the consumption was what was broken. The new one slices `canon`,
`fold_case`, `check_folder` and both arrays out of the real scripts and drives them against two
throwaway home directories, one of them with a space in the name: 36 verdicts over two scripts.
It fails against the pre-fix scripts, which is what makes it a gate.

### 19. The folder that was checked and the folder that was linked were different

All three share scripts. `folder_problem` / `Test-ShareableFolder` canonicalised the path, followed
reparse points, compared *that* against the blocklist — and then **threw it away**, leaving the
caller to link the path as typed.

So `~/mydocs -> ~/Documents` passed the check and the link recorded `~/mydocs`. Repointing that
symlink at `~/.ssh` afterwards puts `id_rsa` under the share root, and Chrome reads it: the
identity checked and the identity shared were simply different, permanently. **It was never a
race** — no window to lose, nothing to re-check.

Both now return the approved path and the caller links *that* one (`check_folder` prints
`OK <path>`; `Test-ShareableFolder` takes `-Resolved ([ref] $full)`,
`scripts/windows-share-setup.ps1:403`). The label is taken off the canonical path too, so it names
the folder that is actually shared rather than the alias that was typed, and two aliases of one
folder are now caught as a duplicate rather than becoming two checklist rows for one folder.

Windows also gained a drive-root refusal **before** the reparse walk as well as after it: `C:\`
trims to `C:`, which is a drive-*relative* path, so `Get-Item -LiteralPath 'C:'` returns the
process's current directory on C: — and if that happened to be a junction, the walk rewrote the
path to its target and the drive root was then accepted. 8.3 short names (`C:\PROGRA~1`) were
already handled.

### 20. JSON injection into the Chromium kiosk managed policy

`scripts/thinkcentre-setup.sh`. The policy file interpolates the kiosk URL, and the **scheme** came
off the same untrusted line by string surgery — `scheme="${url%%://*}"` — with no validation. The
URL lives in a 0644 file this script deliberately never overwrites, so a crafted first line closed
the JSON string and reopened the object: `"URLAllowlist":["*"]` was writable from that file, and
the result **still passed the script's own `jq empty` gate** while the summary reported the policy
as written. Every other key went the same way — `DeveloperToolsAvailability`,
`DefaultFileSystemWriteGuardSetting`. The scheme is matched against a closed set now
(`scripts/thinkcentre-setup.sh:1625`), never extracted, and a URL that is neither http nor https
leaves the policy unwritten and says so.

`scripts/pi-setup.sh` had **no option parsing and no URL check at all**, so
`./pi-setup.sh --no-sandbox` wrote that string into the same never-overwritten file and the
launcher handed it to Chromium at every boot. It gained `validate_url` (`:78`) — the check
thinkcentre always had — and **both launchers now terminate their arguments with `--`** before the
URL, because Chromium reads a leading dash in that file as a flag: `--no-sandbox`,
`--user-data-dir=/tmp/x` and `--incognito` are every never-do in this project's host invariants,
reachable by editing one unguarded file.

### 21. The rate-limit bucket was keyed on the whole IP string

`worker/crypto.ts`. `clientKey` HMAC'd the address as it arrived, so **every IPv6 client had an
unlimited supply of fresh buckets**: rotating addresses inside a single /64 — which is what every
residential and VPS allocation hands you — produced **zero 429s across 72 attempts**, defeating the
signup allowance and the client bucket together.

`normaliseIp` (`worker/crypto.ts:152`) truncates to the /64 first. **/64 rather than /48, and the
reasoning is the reason the client bucket is loose in the first place**: /64 is the smallest unit
guaranteed to be one customer's subnet, so it closes the attack that costs an attacker nothing,
while at /48 — where an ISP delegates /56s — one prefix spans up to 256 unrelated households, and a
stuffing run would become an outage for real visitors. The right answer for a determined attacker
is two tiers, a /64 at the current allowance and a wider /48 at a much higher one, and that belongs
in `buckets()` rather than in this helper.

`::ffff:x.x.x.x` and `::x.x.x.x` are left whole — truncating those to /64 would collapse every IPv4
visitor into one bucket, which is a self-inflicted outage rather than a limit — and an unparseable
address is keyed whole, which is the old behaviour and the narrow direction.

**No raw address is stored either way**: the value is HMAC'd immediately and names a Durable
Object, so §9's inventory is unchanged and this is not a spec change. `cf-connecting-ip` is set by
the edge on every request and `workers_dev` is false, so it is not spoofable in production;
`X-Forwarded-For` is correctly never read anywhere in this Worker **and must not start being**.

### 22. A 304 broke both the CSP nonce and the publish button

`worker/index.ts`. The shell is not served as it is stored — `withSiteConfig` stamps the published
look and a per-request nonce, `withPageMeta` stamps the route's title, description and canonical.
A **304 has no body to stamp, and its headers still got a nonce.** Measured: a 200 carried header
nonce A against body nonce A, and the same URL with `If-None-Match` returned a 304 carrying header
nonce B against the body the browser had cached with A. RFC 9111 §4.3.4 says a 304's headers
*update* the stored response, so the browser then enforces B against A. Invisible today because the
CSP is report-only. **After the one-header flip in `harden` it blocks `window.__VESSEL_SITE__` on
every revalidated load** — that is, for every returning visitor — and the site silently falls back
to its built-in defaults. Recorded here because that flip is a standing intention.

The same 304 is why **publishing never reached anyone holding a cached page.** The ETag belongs to
the raw asset, computed before any injection, so it is byte-identical for every SPA-fallback route:
`/`, `/contact` and `/nonexistent-abc` all answered the same validator. A returning visitor
revalidated, got a 304, and kept whatever config, description and canonical they were served on
their first visit until `index.html` itself changed at the next deploy. `site-config.ts` documents
publish latency as "up to ten seconds"; for that visitor it was "until the next build", which
defeats the feature.

`asset()` (`worker/index.ts:408`) re-fetches a 304 that could be a document with the conditional
headers removed — **only a document**, since `/fonts/*` and `/photos/*` come through here too and
are where 304s are worth real bandwidth; a 304 that does not say what it is is re-fetched as well,
because guessing "not HTML" fails open into the bug. `unvalidatable()` (`:435`) then strips `etag`
and `last-modified` from what we rewrote, which costs nothing that
`cache-control: max-age=0, must-revalidate` was not already costing and keeps the re-fetch off the
common path.

### 23. Byte limits that counted UTF-16 code units

Two places, the same trap `readJson` in `accounts.ts` already documents and fixes.

- **`MAX_CONFIG_BYTES`** (`worker/site-config.ts:184`): 12,121 ASCII characters were refused with
  *"that config is 12121 bytes"* while **11,921 CJK characters were accepted** — 35,721 actual
  UTF-8 bytes, roughly 3× the ceiling, every one of them inlined into the `<head>` of every page
  the site serves. Nothing here is expected to be non-ASCII, which is exactly why it went
  unnoticed. Still refuses, still never truncates.
- **The signalling frame cap** (`worker/signal.ts`): a frame of three-byte UTF-8 characters passed
  a "64KB" check at ~192KB on the wire. The cheap length test stays first to short-circuit the
  common oversized case; the encode is what makes the limit true. That socket is
  owner-authenticated, so this is a bound rather than a boundary — but a bound that is 3× what it
  says is not a bound.

### 24. A missing Worker secret failed open, silently

`worker/index.ts`. `hmacKey` does `encoder.encode(secret)`, and **`TextEncoder.encode(undefined)`
is the nine bytes of the string `"undefined"`** — so a deploy with no `AUTH_PEPPER` keys every
stored auth hash on a constant any reader of this repository knows, and the site looks completely
healthy. `docs/BREAK-GLASS.md` treats *losing* the pepper as an emergency; never setting it was
quieter than a typo.

`assertSecrets` (`worker/index.ts:354`) refuses to serve at all when one of the four is absent or
empty — **in production only**, and the discriminator is `cf-ray`, not the hostname. Both obvious
tests are wrong here: `isLoopback` is false under `wrangler dev` (measured — the local server
reports the routed hostname `mcclevarty.ca`), and `request.cf` is populated locally too. The edge
stamps `cf-ray` on every request that reaches a Worker and `wrangler dev` does not. The spoofing
direction is what makes it sound: a client in production cannot *remove* the header, and sending
one to the dev server only makes local development stricter. If a future runtime stopped sending
it, the check quietly stops running rather than taking a correct site down — the right way round
for a guard whose failure mode is the whole site.

**Presence, not plausibility.** No length floor: a floor is a judgement about somebody else's
secret, and being wrong about it takes the entire site down.

### 25. The byte route's clock was still an existence oracle

`worker/downloads.ts`. Unifying the status codes closed the obvious half of this and left the
measurable half open: the route looked the file up, threw on a miss, and only then read the page
and resolved access — so a non-existent id cost one D1 round trip and an existing-but-refused id
cost two plus `resolveAccess`. **Measured over sixty interleaved pairs: a median of 9.61ms against
13.16ms, with "exists" the slower in 59 of them.** That is the whole oracle back, unauthenticated
and unthrottled, over draft and `granted` pages included, read off a stopwatch instead of a status
line. `resolveAccess` goes first now and both lookups are issued unconditionally and together, the
page found through the file's id rather than through `item.slug`; what is left between the two
paths is one `canDownload`, which touches no network.

Two more in the same file:

- **`claim` resolved what a code opens *after* spending a use.** A code whose file had been
  withdrawn answered `200 { pages: [], items: [] }` and charged for it — so the customer with a
  genuine complaint spends all five uses, one empty success at a time, with nothing on screen that
  reads as a refusal. It is also a positive oracle: an empty 200 says the code exists. A scope that
  opens nothing is now the same `refused` every other failure throws
  (`worker/downloads.ts:300`).
- **`content-disposition`'s `filename*` used `encodeURIComponent`, which is not an RFC 8187
  ext-value.** It leaves `'`, `(`, `)`, `*` and `!` alone, and of those only `!` is an `attr-char`
  — so `Bob's tool (v2).exe` produced a field with three apostrophes in it, which a strict parser
  may read as a different charset and language and a truncated name. Nobody sees a 500; the
  customer gets a file called something else. `extValue` (`worker/downloads.ts:422`) escapes all
  five. There is no injection to fix here — `saveFile` refuses quotes, backslashes and control
  characters on the way in — this is the header being well-formed.

### 26. The setup-code decoder enumerated invisible characters, and could not be complete

`src/share/setupCode.ts`. The deceptive-character refusal named five ranges and missed every other
invisible code point in Unicode. U+034F, U+2062, U+2063, U+17B4 and U+180E all measure **0.000px**
of extra rendered width at `.v-setup-name`'s font, so:

```
{ l: "Invoices",        p: "C:\\Users\\me\\Invoices" }
{ l: "Invoices\u034F",  p: "C:\\Users\\me" }
```

decoded cleanly, drew **two rows both reading `Invoices`**, and left the second unticked after the
person added the folder they meant — the done-set is a Set of exact strings, so neither React nor
the checklist flags anything. The obvious next click hands over the whole user profile through the
real picker. That is precisely the failure the duplicate-label refusal exists to prevent, walked
straight past.

**An enumeration cannot be made complete by adding to it**, so it is gone: `DECEPTIVE`
(`src/share/setupCode.ts:112`) refuses by Unicode property — `\p{Cf}`, `\p{Cs}`, `\p{Co}`,
`\p{Cn}`, every `\p{Zs}` bar U+0020 — plus a short named set of blanks that are none of those
(U+034F is `Mn`, U+2800 is `So`, U+115F/U+1160/U+3164/U+FFA0 are `Lo`). `\p{Cn}` is a stated trade:
an engine older than a folder name's Unicode version will refuse a brand-new emoji, and renaming a
folder is cheaper than handing over the wrong one.

`CONTROL` became `\p{Cc}` plus U+2028/U+2029, which adds C1 — **U+0085 NEXT LINE is a line break to
a text engine and was accepted.** None of the three forges a visible row today, and that is a
property of `white-space: normal` on `.v-setup-name` rather than of the regex: give that span, or
`.v-setup-path`, a preserving `white-space` and one label becomes two rows. **The refusal must not
depend on a CSS declaration in another file.**

Duplicate labels are now compared **after NFKC and stored as sent**. `Réparations` composed and
decomposed are byte-different and pixel-identical in every font, and the compatibility mappings do
the same for a fullwidth `Ｉnvoices` or the `ﬁ` ligature — each is the twin-row attack with a
different character, and each collides in the done-set exactly as an exact duplicate does. Folding
only the *comparison* keeps refuse-never-repair intact: a normalised label would be a label the
person's script did not write.

### 27. `challenge` returns two KDF parameters and the browser checked one

`src/auth/derive.ts`. `checkIterations` refuses an implausible iteration count; **the salt went
into PBKDF2 with no length, type or shape test at any call site.** Anything able to forge that
response — the same threat `checkIterations` is written against — could send `salt: ""` (legal in
WebCrypto) or one constant salt to every account, and a salt's whole purpose is gone: a single
precomputation, reusable across every account and, with a constant, across deployments. That turns
the offline-grinding exposure already flagged for client sign-off (item 2 of the four in
`CLAUDE.md`) from per-account work into one table — and the same table yields the **wrapping** key,
which is the half `derive.ts` promises the server cannot compute.

`checkSalt` (`src/auth/derive.ts:109`) is called inside `deriveFromPassword` and
`deriveFromRecoveryCode` rather than at their callers, for the reason rate limiting lives inside
`assertPassword`: there are eight places a server-supplied salt enters the browser and a guard the
caller has to remember is a guard the ninth caller forgets. Refuse, never clamp or pad — a
"corrected" salt derives a secret the server does not hold, and presents as a wrong password.

**What it does not close, so nobody later reads it as complete:** a forged `challenge` returning a
*plausible* 16 random bytes — one attacker-chosen salt per account, or the same 16 to everybody —
passes this check and always will. The client has nothing to compare against.

### 28. Smaller fixes, recorded so they are not re-found

- **`frame.to` was interpolated into a hibernation tag unvalidated** (`worker/signal.ts:39`). The
  runtime caps a tag at 256 characters, so an over-long one throws inside `webSocketMessage`, where
  an unhandled rejection is a refusal nobody sees. A peer id is a `crypto.randomUUID()` this object
  minted; it is matched against that shape now, before use.
- **Non-101 responses from the signalling object left without the site's headers.** The 101 is the
  only response that may skip `harden` — copying one drops its `webSocket` and every upgrade hangs.
  The object's 426/400/404 are ordinary responses and are hardened now, which makes the rule
  structural rather than a coincidence that holds while two duplicated checks agree.
- **`/api/csp-report` buffered an unbounded body, unauthenticated, in front of every other check.**
  Measured: a 20,000,000-byte POST returned 204 in 1.1s, materialised as a UTF-16 JS string and
  thrown away, where the same body to `/api/auth/challenge` was refused at 413. Bounded at 8KB on
  the declared `content-length` *and* on what actually arrives, since a chunked request's header is
  not evidence. Control characters in what is logged become spaces: a newline in an
  attacker-supplied string is a forged line in `wrangler tail`, and **the log line being the
  product** is what makes forging one worth something. No report store; §9 gains no field.
- **`validLookPages` keyed page ids with `in`**, which walks the prototype chain — `toString`,
  `valueOf`, `constructor`, `hasOwnProperty` and `isPrototypeOf` all passed as page ids and became
  overrides keyed on names that are not pages, and with `toString` and `valueOf` both set the
  returned map stops being coercible and `String(lookPages)` throws.
  `Object.prototype.hasOwnProperty.call` now, as `validDuelPages` already did
  (`src/data/lookSettings.ts:95`).
- **`SessionContext` read `me?.account.isOperator`**, one optional link short: a 200 whose body has
  no `account` throws a TypeError inside the `useMemo`, which is a blank site rather than the
  "signed out, site unchanged" degradation that file promises. Nothing but a signed-in operator may
  read true, so an unreadable answer is the same as no answer.
- **`QrCode` let the encoder take the page down.** `qrMatrix` throws above 213 bytes, and on the
  enrolment screen `value` is the server's `otpauth://` URI. A throw inside `useMemo` is a throw
  during render — a white screen, losing the whole enrolment form over the one part of it that is a
  convenience. It returns null now; both callers already print the secret and the URI in full
  (`src/components/QrCode.tsx:77`).
- **`publishSiteConfig` tested `!account.is_operator`** where the three other copies of that guard
  test `!== 1`. Nothing reaches it with a value the two forms disagree about today; the point is
  that four byte-identical guards in four files is how one of them eventually drifts, and the drift
  here would be an operator gate.
- **`scripts/thinkcentre-setup.sh`, four**: the `--store` directory was an exact match on the raw
  string, so `/etc/`, `//etc`, `/etc/systemd` and `/usr/local` were all accepted into
  `sudo chown ${USER}` — canonicalise, fail closed, prefix-match, the three rules the share scripts
  already record. `place_user_file` / `place_root_file` returned 0 when they had **not** written the
  file, and all 23 call sites are `|| true` or an `if` condition, so a failed `cp` fell through to
  `info "wrote …"` and the summary reported a security control that is not on the disk; they return
  2 now and verify the destination back against the source, and the policy summary is built from
  the write rather than from the loop. `ssh_ports` had a `|| ports="22"` fallback that made the
  fail-closed `die` in `configure_firewall` — the one that says "enabling it without an SSH rule
  would lock you out" — dead code that could never fire. And the updater's env file, which root
  sources weekly, is quoted and its account name checked.
- **`scripts/setup-bundle.sh` guarded its output directory with a denylist of three values**, so
  `~/Documents`, `../src` and `/etc` were all named by nothing before an `rm -rf`. It is an
  allowlist now — relative, no `..`, not `.` — plus a `.setup-bundle` marker file, which is the
  share scripts' `--undo` doctrine: never delete a directory you did not create.

---

### 29. The Windows blocklist resolved the leaf and compared the ancestors as typed

Found by the pre-deploy review of item 19's own fix, 2026-09-04, and it is item 19 again one
component up. `Test-ShareableFolder` resolved reparse points — for the **final path component
only**. `[System.IO.Path]::GetFullPath` does not follow a junction, and `Get-Item` reports the
`ReparsePoint` attribute of the leaf, so the `while` loop never fired when the junction was an
**ancestor** of the picked folder. `$full` was then compared, as typed, against `$blockExact` /
`$blockPrefix`, passed, and was junctioned into the share root.

**No attacker file-system setup is required, because Windows ships the junctions**, and their ACLs
carry a deny-*list-folder* ACE but do not deny `FILE_TRAVERSE` — so `Test-Path` through one
succeeds:

| Typed | Junction | Reaches |
|---|---|---|
| `C:\Documents and Settings\<user>` | → `C:\Users` | the **entire user profile**; matches neither `%USERPROFILE%` nor the parent-of-home entry |
| `C:\Users\<user>\Local Settings\Google\Chrome\User Data` | → `AppData\Local` | past the `%LOCALAPPDATA%\Google` prefix — Chrome `Cookies` and `Login Data` |
| `C:\Users\<user>\Application Data\Microsoft\Protect` | → `AppData\Roaming` | past `%APPDATA%\Microsoft` — the **DPAPI master keys that decrypt the above** |

The phone-call scenario the script's own banner describes is the delivery: *"type this in the
box"*. The runbook then recommends picking the share root as one folder, Chrome reads through the
junction normally (crbug 40061477), and per `CLAUDE.md` nothing downstream catches a miss.

**The Unix scripts never had this** — `cd -P` plus `pwd -P` resolves every component by
construction. That is the property the PowerShell copy had to reproduce by hand and did not.

Fixed by resolving **every ancestor**, restarting the walk after each substitution because a target
may itself sit under another junction, bounded at 32 rounds, and still failing closed: an ancestor
that cannot be read, or a link that cannot be resolved, is refused rather than compared.

**Gated by execution, not by reading.** `npm run check` slices the resolver out of the real script,
substitutes only the path separators — every substitution asserted, so a rewrite that changes the
shape fails the gate instead of silently testing nothing — and drives it under `pwsh` against a
throwaway tree with an ancestor link, a chain of them, a leaf link and a dangling one. Symlinks
stand in for junctions because .NET surfaces both through the same `ReparsePoint` attribute and the
same `.Target`, which is the property under test. Break-verified twice: against the pre-fix block,
and again with the block's shape left intact and only the loop narrowed to the leaf, which is the
version a structural gate would have passed.

**Where `pwsh` is absent the gate does not quietly pass** — it names itself under *"Could NOT be run
on this machine"* in the report, because a gate that skips silently is this document's recurring
lesson wearing a different hat.

### 30. `decodeSetupCode` refused invisibles by property and still missed the variation selectors

Item 26 replaced an enumeration of deceptive characters with Unicode general categories, on the
stated reasoning that *"an enumeration cannot be made complete by adding to it"*. The category set
was `Cf`, `Cs`, `Co`, `Cn`, `Zs` bar U+0020, and a hand-list — and it **omitted U+FE00–FE0F and
U+E0100–E01EF**, the variation selectors, which are zero width and which **NFKC does not fold**, so
the duplicate-label test did not catch them either. Verified against the real encoder/decoder:
`Invoices\uFE00` was accepted alongside `Invoices`, which is item 26's own twin-row attack rebuilt
character for character after it was fixed. A doubled ordinary space did the same.

Fixed in two halves, deliberately split:

- **The filter** now refuses `\p{Default_Ignorable_Code_Point}` and `\p{Variation_Selector}` — the
  property rather than the code points, which is the point. It is a **strict superset** of the old
  hand-list, verified by sweeping all 0x110000 code points: nothing the old expression refused is
  now allowed, and 260 are newly refused.
- **U+FE0E and U+FE0F are carved out**, and `foldLabel` pays for the carve-out. They are the emoji
  presentation selectors, and `Photos ❤️` is a folder name somebody has rather than an attack. The
  code is **machine-generated from names the person already has**, so refusing them would refuse
  the *whole code* over one honest folder, on the happy path, with nothing to do but rename it —
  turning a security fix into an outage. They remain dangerous only in the twin-row shape, and that
  is closed one level down: `foldLabel` strips every default-ignorable and collapses whitespace runs
  before the duplicate test, so `Invoices` and `Invoices\uFE0F` collide and the code is refused.

**The division of labour is the decision**: the filter refuses what has no business in a label; the
fold refuses what merely *reads* like another label. Labels are still **stored as sent** — folding
the comparison alone is what keeps refuse-never-repair intact.

The whitespace collapse is in `foldLabel` rather than left to `.v-setup-name`'s `white-space:
normal`, because **a refusal must not depend on a CSS declaration in another file.**

Gate goes 21 → 26 refused codes, plus a positive case asserting an emoji label still round-trips.
Break-verified against the pre-fix decoder.

### 31. The pin was compared conditionally, and the condition was for rows that do not exist

Item 17 pinned a file-scoped download code to the page its file was on at mint, so that *moving* a
file could not re-point an outstanding code — a case no delete can close. The comparison was then
made conditional on `row.slug !== null`, to avoid retiring codes minted before the pin existed.

**The condition had no subject.** `SELECT COUNT(*) FROM download_codes` on production is `0`, and
the `item_id IS NOT NULL AND slug IS NULL` count is `0`. So the carve-out retired nothing, because
there was nothing to retire; all it did was leave the move path open for any row that ever arrives
without a pin.

Closed unconditionally, and it cannot strand a legitimate code: `download_files.slug` is `NOT NULL`
(migration 0006) and `mintCode` copies it into `pageSlug` on every file-scoped mint, so a pin is
always written. A NULL reaching `opened()` now means a row this code did not mint — a restored
backup or a hand-written INSERT — and following a file for one of those is precisely what the pin
exists to refuse.

**Gated end to end, not asserted about**: `npm run test:auth` mints a file-scoped code through the
real admin route, nulls its pin in the database exactly as a legacy row would carry it, and redeems
it for real. 365 → 366. Break-verified — with the tolerance restored the claim returns a ticket
carrying both the page and the file, which is the hole.

**The general lesson, and it is the third time this pass:** the two earlier findings were controls
described accurately that did not do what the description implied. This one is a *carve-out*
described accurately whose justification was never checked against the data. Querying the table
took one command and removed a standing decision from the client's list.

## Checked this pass and found sound

Recorded because a clean answer is only worth something if it says what it checked.

- **The CSP nonce is fresh per request and matches the body in production, including on a
  Cloudflare cache HIT** — `run_worker_first` re-injects on every request. The mismatch in item 22
  is the 304 path specifically, and it was measured against local dev.
- **That 304 path cannot occur in production**, which sends no ETag on HTML routes at all. Fixed
  anyway: it is reachable the moment the assets binding's behaviour or the config changes, and the
  cost of the fix is a header deletion.
- **The `www.` host rewrite has no off-by-one.** `"wwww.mcclevarty.ca".startsWith("www.")` is
  `false`; the suspected bug does not exist.
- **`/api/auth/challenge` does not disclose whether a handle exists, by timing.** 400 timed
  requests: real median 27.4ms against decoy 28.1ms. The decoy branch reporting
  `DEFAULT_ITERATIONS` — the real constant — is what keeps that true, and remains the right choice.
- **`npm audit`: 0 vulnerabilities.** The runtime closure is still React alone, and no secret
  appears anywhere in the git history.

---

## Needs the client's decision — not a fix

1. ~~**`credentials.last_challenge` and `last_challenge_at` are fields SPEC-ACCOUNTS §9's
   inventory does not list**~~ — **approved 2026-09-04, and the inventory now lists them.**
   `totp.last_step`, flagged the same way since 2026-08-13, went in at the same time: leaving one
   ⚠ marker standing while resolving its twin would have left the section half-corrected. §12's
   *Resolved 2026-09-04* entry carries the argument and both rejected alternatives. The deciding
   point was the **direction of the error** — an inventory whose purpose is to let the
   no-personal-data claim be checked is worse when it omits a column than when it lists one, and
   two "awaiting sign-off" markers against deployed, load-bearing fields had become the least
   accurate lines in an otherwise authoritative document.
2. ~~**Download codes minted before this deploy carry `slug = NULL`**~~ — **withdrawn 2026-09-04,
   because the premise was false.** Production was queried instead of reasoned about:
   `download_codes` holds **zero rows**, and zero of the `item_id IS NOT NULL AND slug IS NULL`
   shape. There was never anything in a customer's hands to retire, so there was no business
   decision to refer and no backfill to write — and the carve-out that tolerated a missing pin was
   keeping a hole open for rows that cannot exist. `opened()` now compares the pin
   unconditionally. See item 31.

---

## What this pass could not verify

- **`scripts/macos-share-setup.sh` has not been run on a Mac.** See the functional bug below; the
  new picker uses only documented AppleScript and mirrors the Linux copy's structure, and only the
  typed-path fallback was exercised here. It is written, not verified.
- **Nothing here is deployed**, so every measurement above is against the local Worker and local D1
  except where it says otherwise (the timing figures, the 20MB report body, the UTF-16 byte counts
  and the 72-attempt rate-limit run are all local).
- The standing limits in `CLAUDE.md` are unchanged: `npm run check` has no rasteriser, the operator
  surfaces need a signed-in session, and a green suite is a floor rather than a verdict.

### One pre-existing functional bug, found and fixed

`scripts/macos-share-setup.sh` **called `choose_folders` and never defined it** — in HEAD too. The
call is `done < <(choose_folders)`, so on a stock Mac every run without `--folders` printed
`choose_folders: command not found`, chose nothing, and exited with *"No folders chosen, so there
is nothing to do."* **The normal interactive path — the one the runbook tells people to use — has
never worked on macOS.** Linux has had its copy all along; only this file was missing it.

It is written now with `osascript`'s `choose folder`, present on every stock Mac so there is
nothing to install, keeping the documented channel split: **stdout is a data channel and carries
only paths**, every prompt and every "Added:" line goes to stderr through `note`/`good`/`warn`,
because the caller reads the function with `while read < <(…)`. That is the 2026-09-02 lesson, and
it is why this could not simply reuse the prompts.

**Not tested on macOS hardware.** Stated plainly rather than implied: this replaces a path that was
certainly broken with one that is probably right, and it wants a real Mac before anybody says it
works.

---

## Corrections to this document

Two lines in the *Reviewed and deliberately left alone* list below were **false when written**, and
each was corrected in place with a dated note rather than deleted:

- *"No rate limiting and no TOTP stage on passkey sign-in — a failed attempt is a forged P-256
  signature."* The premise held; the conclusion did not, because a replay is not an attempt. See
  item 15.
- *"Stateless WebAuthn challenge tokens — replay is refused by the credential-id uniqueness
  index."* That index refuses a duplicate *credential*, which catches an identical registration
  replay and nothing else. It said nothing at all about assertions, where the whole hole was. See
  item 15.

A third has simply drifted: the 2026-08-16 table and the FABLE-FINDINGS appendix both describe the
site-config cap as 2KB. It is `MAX_CONFIG_BYTES = 12_000` today (2,000 → 8,000 for `duelPages`,
8,000 → 12,000 for `lookPages`), and until item 23 it was counted in UTF-16 code units. Marked in
place.

---

# Security review — 2026-08-16 (the `hud-pass` branch, which is what production serves)

**Result: no findings.** Recorded because a clean pass is only worth anything if it says what it
checked — otherwise the next session cannot tell "reviewed and clear" from "never looked".

**Why this pass happened**: `hud-pass` is 25 commits and ~6,480 insertions ahead of `main` and has
been serving production throughout, without a security review. This closes that gap.

| Surface | Verdict | The reason it holds |
|---|---|---|
| `worker/site-config.ts` — inline script injection | clear | `raw.replace(/</g, "\\u003c")` runs over `JSON.stringify` output, so `<` can only occur inside a JSON string literal where `<` is a valid escape. Kills `</script>`, `<script` and `<!--` in one stroke. Payload is never re-parsed between escaping and `head.append` |
| — its D1 provenance | clear | `publishSiteConfig` is the **only** writer of `site_config`; it does `requireAccount` then refuses non-operators, filters to `PUBLISHED_KEYS`, and caps at 2KB (**2026-09-03: 12,000 bytes today — 8,000 for `duelPages`, 12,000 for `lookPages` — and until item 23 the cap counted UTF-16 code units, not bytes**). No visitor-reachable path writes that table |
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

### 7. ~~DNSSEC~~ — **DONE, verified live 2026-09-06**

`dig +short DS mcclevarty.ca` now returns `2371 13 2 3FAAEC04…6F640E` — the exact record below — and
`dig @1.1.1.1 +dnssec mcclevarty.ca A` comes back with the `ad` flag set, so the chain validates end to
end from the root through CIRA to Cloudflare's signed zone. The Namespro ticket was evidently
actioned. **`mcclevarty.com` has no DS** and is not signed; it only ever 301s to the `.ca`, so the
exposure is a forged redirect target for a resolver that would have trusted an unsigned answer
anyway. Worth doing for symmetry when next in the Namespro panel, not urgent. The account below is
kept as history.

#### 7 (history). DNSSEC — half done 2026-08-14: signed at Cloudflare, DS not yet published

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

- **CSP ships report-only** (corrected 2026-08-18; this line read "No CSP" and was false). A
  per-request nonce is minted in `worker/index.ts` and stamped on the inlined site-config script;
  violations report to `/api/csp-report` and nothing is blocked. Flipping to enforcing is one header
  rename, gated on the four surfaces listed in `CLAUDE.md`; the inlined site config needs a nonce plumbed through
  `worker/site-config.ts` first. Worth doing properly, not badly.
- **Missing `Origin` allowed on state-changing requests** — same-origin GETs and the e2e harness
  omit it; `SameSite` + the present-and-wrong check carry the defence.
- **No rate limiting and no TOTP stage on passkey sign-in** — §4/§3; UV is the second factor,
  and a failed attempt is a forged P-256 signature. **(Corrected 2026-09-03: the premise was true
  and the conclusion was not, because a replay is not an attempt — the challenge was bound and
  never spent, so a captured body minted a session for five minutes. Item 15. The decision itself
  stands, now that the argument under it does.)**
- **`challenge` checks but never consumes rate-limit attempts** — counting salt requests would be
  a lockout primitive against the account's owner.
- **Stateless WebAuthn challenge tokens** — a challenge table is the rejected alternative, and
  still is. **(Corrected 2026-09-03: this line read "replay is refused by the credential-id
  uniqueness index", which was false. That index refuses a duplicate *credential* — an identical
  registration replay and nothing else — and said nothing at all about assertions, which is where
  the hole was. Both ceremonies now spend their challenge in a conditional UPDATE, monotonic in the
  token's issue time; migration 0008 and item 15. Still no challenge table.)**
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
  (**2026-09-03: the cap is 12,000 bytes now, and it counts bytes — see item 23.** The escaping,
  which is what makes this line's verdict true, is unchanged.)
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
