# TODO

The single backlog: **only what is left to do.** `CLAUDE.md` explains *why* things are the way
they are, `docs/DECISIONS.md` records what was decided when, and `docs/TODO-ARCHIVE.md` holds the
dated session logs this file used to carry (moved out 2026-09-07 — read it for the reasoning
behind any item here, by date).

State on 2026-09-07: `npm run check` **77** green, `npm run test:auth` **407**. Live is Worker
`38ceae8d` (rollback `df6dba2a`), commit `186468d`, pushed. Four security passes are recorded in
`docs/SECURITY-AUDIT.md` (items 1–49); nothing in it is open except what is listed below.

---

## Needs the client — decisions, not work

1. **The four duel sliders** (circling, rest, impact, patience) still carry defaults. Size works,
   `rest` is a real multiplier, the preview follows the selected page. His eye is the one thing
   that cannot be substituted for.
2. **Sessions survive a password change and an operator reset** (audit item 5). Closing it is one
   column on `accounts` and a check in `requireAccount` — a §9 inventory change, so his call.
3. **`beginUpload` hides a live file before the password is asked** (audit item 6). Keeping the
   old bytes live until `finishUpload` is the fix.
4. **Eight copy facts only he can supply** (2026-08-26; each renders the safe reading meanwhile):
   the "pay once, nothing renews" promise (now cut — wanted back permanently?); Contact's "within
   a day"; the two guestbook numbers; `work`'s "two years" (now "ever since"); the per-machine
   record line (cut); the years figure ("over twenty" everywhere, one phrase to change); the Kevin
   joke on home (adjacent to the accent framing he declined for `/scams`); and **whether `/work`'s
   six case studies and the five guestbook quotes are real** — the most important one, because a
   fabricated case study is evidence of capability that has to go.
5. **Was the first machine he took apart a 486?** It is `/about`'s origin story.
6. **`design/SPEC-SHARING.md` is a DRAFT awaiting sign-off.**
7. **Unattended remote access** — for CUSTOMER machines, self-hosted RustDesk or MeshCentral, never
   Tailscale (reversed 2026-08-26). **This does not cover the operator's own ThinkCentre host**,
   where Tailscale was reinstated on 2026-09-08 at his request; see `docs/DECISIONS.md`. Ask
   whether he ever needs into a customer machine nobody is at.
8. **Edit mode** (operator-editable copy): architecture designed 2026-08-14 (sparse D1 overlay,
   `pages.ts` as the floor, five account pages excluded). Three decisions first: may a block be
   blanked; is there a draft/preview state; and that it makes the 404's joke counts overridable.
   Images stay blocked on a storage decision.
9. **Severing / dismemberment in the duel** — deferred by him; judge on screen before building.
10. **`/scams` CTAs sit above the emergency block** — accepted, not fixed, worth his reconsidering.
11. **Downloads page redesign** — `design/claude-design-downloads.html` is the handoff he took into
    Claude Design; it predates categories, icons, filters and the price. Regenerate it, never
    hand-edit it, if the page changes first.
12. Spec wording he has not signed off: **§3's operator row** is stronger than the design supports
    (the Worker sees the raw `authSecret`); **`⌘K` is claimed twice** (door vs command palette);
    **signup discloses handle availability (409)** while `challenge` hides it.
13. **TURN** — enable Cloudflare TURN (per-byte spend) or keep the honest hard-NAT failure (§12 P).
14. **Per-account subdomains: wanted at all?** If yes, an Origin allowlist lands first
    (`design/GUIDE-SUBDOMAINS.md`); if no, close the guide.
15. **When to retire the Pages project** — it is the rollback; retiring it ends the `_redirects` trap.

## The ThinkCentre host — built 2026-09-08, being set up now

`docs/HOST-BUILD-LOG.md` is the record of the build and the four walls it hit (sudo not
configured, `/usr/sbin` off PATH, `./` on the script name, the USB root disk). Four scripts, in
order: `debian-basics.sh`, `plasma-dark-setup.sh`, `claude-code-setup.sh`,
`thinkcentre-setup.sh`. They are also in a Google Drive folder at the root of My Drive, still
named "Untitled folderwebsite".

All four scripts have run. `--verify` has run on real hardware, and walls 5, 6 and 7 in the build
log came out of it. Items 1, 2 and 6 below are **now done** (2026-09-08, second session) — the box
boots SDDM into Plasma **on X11**, `usbcore.autosuspend=-1` is live in `/proc/cmdline`, and
`--verify` reports every check `ok` except the two that want sudo. What is left:

1. ~~Re-run `plasma-dark-setup.sh --no-install`, then reboot.~~ **Done.** `/etc/sddm.conf.d/10-vessel.conf`
   carries `DisplayServer=x11` and `Session=plasmax11`, `/etc/X11/default-display-manager` reads
   `/usr/bin/sddm`, and the running session is `Type=x11`. `--verify` now checks all three.
2. ~~Add `usbcore.autosuspend=-1` to the GRUB command line.~~ **Done** and rebooted into — it is in
   `/proc/cmdline`.
3. **Run `--verify` with a cached sudo credential.** Everything else is `ok`. The two checks that
   want root — `firewall active` and `sshd refuses root login` — still report `????`, and `sshd -T`
   has never actually been consulted on this box. `sudo -v`, then `./scripts/thinkcentre-setup.sh
   --verify`. ufw *is* active (`systemctl is-active ufw`).
4. **Pair the machine** at `/share`, and never launch the kiosk with `--user-data-dir` or
   `--incognito` afterwards — the Chromium profile *is* the pairing.
5. **`thinkcentre-setup.sh` should learn SDDM.** `plasma-dark-setup.sh` writes the autologin
   today, which means the knowledge lives in two scripts — and that split is exactly how the box
   ended up with an lightdm autologin into xfce sitting under a Plasma install. Fold it back in
   once the host is up.
6. ~~Tailscale contradicts *Needs the client* item 7.~~ **Answered by the client, 2026-09-08:**
   it stays — *"i need it for remoting into this box from multiple different machines."* Recorded
   in `docs/DECISIONS.md`; *Needs the client* item 7 is amended.
7. **The host is on Wi-Fi**; `eno1` is down. **Client, 2026-09-08:** the box is at his work at
   the moment and *"it will be hardwired eventually... theres a chance tho that it will stay
   wifi."* So Wi-Fi is the state to keep working, not a fault to fix — **do not write anything
   that assumes a wired link**, and do not disable the wireless when the cable eventually goes
   in. Re-run `--verify` after any move; the kiosk reports the machine offline within seconds of
   losing the link, so a move shows up as "offline" on the site rather than as an error here. **Update 2026-09-11: the cable went in.** `eno1` is up on
   `<LAN-IP>` and the Wi-Fi adapter `wlx<MAC>` is `DOWN`. Wi-Fi must still keep
   working per the above, but the LAN firewall rules written for remote access assume the wired
   `<LAN-CIDR>` and would need a second rule if it ever goes back to wireless.

8. **Remote access is broken until someone runs the fix** — `docs/REMOTE-ACCESS.md` is the full
   record. xrdp is installed but `disabled`; `freerdp-shadow-cli3` held 3389 on 2026-09-11 but is
   not a systemd unit, so **after the next reboot there is no RDP server at all** and SSH on 22 is
   the only way in. Two halves, and they are different tools: `scripts/rdp-separate-user.sh` plus
   `systemctl enable --now xrdp xrdp-sesman` gives a *second* desktop that survives reboot;
   shadow-over-RDP or `krfb` gives the *live kiosk screen* and still needs a user unit and
   `loginctl enable-linger user` to persist. `/home/user/.xsession` is still present and is still
   the black-screen bug — the fix script removes it. Do not reach for GNOME/GDM; it would break
   the kiosk's autologin.

## Open, raised by the client 2026-09-08

0. **THE SHARE TAB IS COMMITTED BUT UNVERIFIED — DO NOT ASSUME IT WORKS.** `npm run check` has
   never run against it, it has never been built, and it has never been seen in a browser.
   Three files changed: `src/data/pageIds.ts` (adds `{ id: "share", label: "Share" }` to
   `OPERATOR_NAV`), `src/components/Footer.tsx` (a `me`-gated `share` link beside
   `account`/`admin`), and `scripts/check.ts` (a new three-nav reachability gate). **Run
   `npm run check` and look at the page before deploying any of it.**

   **FIXED 2026-09-08: the dependency install works on this box.** A plain
   `npm ci --no-audit --no-fund` added 110 packages in 5s, `node_modules/.bin` is populated, and
   `npm run check` ran all 77 checks green on the same npm 9.2.0 that failed before — so whatever
   it was, it was not the npm version. Node 20 still draws an `EBADENGINE` warning for
   `wrangler@4.122.0` (wants Node 22) — and that one is not only a warning:
   `npx wrangler whoami` **refused to start** ("Wrangler requires at least Node.js v22.0.0").

   **Node 22 is installed now (2026-09-10), in user space.** `~/.local/lib/nodejs/node-v22.23.2-linux-x64`,
   with `current` symlinked beside it and `node`/`npm`/`npx`/`corepack` linked into `~/.local/bin`,
   which `.profile` already puts on PATH. Debian's own `nodejs` package is untouched, so nothing
   system-wide changed and removing the two directories reverts it. The tarball was checksummed
   against nodejs.org's published SHASUMS256 before unpacking. `npm ci` then added 108 packages on
   npm 10.9.8 and `npm run check` is green at 77; `wrangler 4.122.0` starts.

   **What this box still has NO credentials for, and what that blocks:**
   - **Cloudflare** — `wrangler whoami` says *not authenticated*; there is no `~/.config/.wrangler`
     token and no `CLOUDFLARE_API_TOKEN`. So **nothing can be deployed from here.** `wrangler login`
     works as far as opening the dashboard OAuth page in Firefox on `:0`, but its window is roughly
     **two minutes** and four attempts expired unclicked. Note the kiosk is fullscreen Chromium on
     that display, so `firefox --new-tab` opens *behind* it — use `firefox --new-window`, and expect
     to alt-tab. **Do not open anything in the kiosk's own Chromium**: that profile is the pairing,
     and a new tab takes over the window that is holding the folder handles.
   - **GitHub** — no `gh`, no credential helper, no `~/.git-credentials`. `git push` over HTTPS dies
     with *"could not read Username"* because a non-interactive shell has nowhere to prompt.
     **An ed25519 key was generated for this host on 2026-09-08** at `~/.ssh/id_ed25519`
     (`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFI5Xt0LfDVlig346cZ/bG58bsvQcZdU2WeMGOSC3UJ8
     thinkcentre-host-20260908`). It is **not yet on the account** — `ssh -T git@github.com` answers
     *Permission denied (publickey)*. Paste it at github.com/settings/ssh/new, then
     `git remote set-url origin git@github.com:zazathebird/vessel.git` and the push needs nothing
     typed ever again on this box.

   **Two commits are unpushed** as of 2026-09-11: `ae2ef52` (the host blanking fix) and the
   share-page steps commit. Both are green under `npm run check`. Nothing is deployed.

   The old note is kept below because the symptom was real and may come back:

   ~~**Node is installed on the host now (v20.19.2, npm 9.2.0) but the dependency install is
   BROKEN**~~: `npm ci` and `npm install` both exit 0 while extracting every package directory
   EMPTY — `node_modules/esbuild/` has no `bin/`, `node_modules/.bin/` has zero entries, and
   `@esbuild/linux-x64` contains no binary. So `npm run check` dies at `esbuild: not found` and
   nothing on this box can typecheck, build or deploy. Debian trixie's npm 9.2.0 is the suspect
   (it is old for this lockfile, and the run emitted `TAR_ENTRY_ERROR ENOENT` on
   `@cloudflare/workerd-linux-64`). Fix before trusting anything built here: try a current npm
   (`npm i -g npm@latest`) or nodesource's Node 22, then `rm -rf node_modules && npm ci` and
   confirm `node_modules/.bin` is non-empty.

   Still to do on the share work itself, agreed with the client 2026-09-08:
   - **The command palette should offer the account and phase-2 pages when signed in.** It
     enumerates `[...NAV, ...FOOTER_NAV]` today, so `/share`, `/machines`, `/signin` and
     `/admin` are absent from the one route `CLAUDE.md` calls the only way to a third of the
     site off the desk. This is the "something cool I can tell them about" the client asked
     for — it is tellable, it works on touch via the `menu` chip, and it needs no new gesture.
     **The existing gate at `scripts/check.ts` asserts the palette enumerates
     `NAV + FOOTER_NAV`; keep that true and add the third list conditionally on the session.**
   - A drag mirror was considered and is NOT available: left is already sign-in and right is
     already the door, and the logo's 3-tap and 5-tap counters are both taken too.
   - Typing `share` anywhere (hardware keyboard, not in a form) already works and is unchanged.



1. **`/share` is reachable only by typing the URL, and that is the bug the client hit** — *"once
   i log in i cant get back to the share page to set up a shared folder."* Confirmed:
   `src/data/pageIds.ts` gives `share` and `machines` real entries in `PATHS` (`/share`,
   `/machines`) and puts them in **no nav array at all** — not `NAV`, not `FOOTER_NAV`, not
   `OPERATOR_NAV`. The command palette enumerates `[...NAV, ...FOOTER_NAV]`, so they are not in
   the palette either. There is no route to phase 2 from the interface.

   **This wants a decision before a patch**, because `NAV` is the wrong answer and `CLAUDE.md`
   says why: `useOperatorRoutes` cycles `NAV` and Radial's orbit renders it, so an eighth pill
   changes arrow-key paging and the dial for every visitor, to add a page no visitor may see.
   The candidates:
   - **`OPERATOR_NAV`** — where 404 / Account / Admin already live, deliberately outside `NAV`
     for exactly this reason. Most likely correct.
   - **The command palette** — it is already the documented way to a third of the site off the
     desk, and it is gated. Needs the palette to read a third list, not just `[...NAV,
     ...FOOTER_NAV]`.
   - **A link from `/admin`**, which is where the operator already goes to manage the machine.

   Whichever is chosen, both `share` and `machines` should get it together — they are one
   feature — and both are operator-only, so the gate is the same one the duels use.

2. **The desktop's KWallet prompt should be settled on the host.** `ksshaskpass` pulls in
   KWallet, whose first-run dialog offers Blowfish or GPG; **the GPG option errors because there
   are no GPG secret keys on this box**, which is what that backend encrypts the wallet to.
   Nothing on the host needs the wallet — the kiosk launcher already runs Chromium with
   `--password-store=basic` precisely to avoid it. **On an autologin host a wallet with a
   password is a liability**: it prompts at every boot with nobody there. Either disable KWallet
   outright or give it a blank-password Blowfish wallet. Not done; the sudo prompt was routed
   around it with a `kdialog --password` askpass instead.

## Needs hardware or a human eye — cannot be done from here

1. **Publish the setup bundle, and check whether it was ever published at all.** `launch.bat`
   changed (audit item 45); `dist-setup/` is rebuilt and its `CHECKSUMS.txt` is current, the
   published one is not. Downloads editor, existing ids, password at each finish.
   `docs/DOWNLOADS.md`.

   **2026-09-08: no setup page is publicly listed.** `GET /api/downloads/pages` unauthenticated
   returns exactly one page — slug `downloads`, title "Scripts", the Windows cleanup tool — with
   **zero files on it**. That listing withholds `unlisted`, `granted` and draft pages
   (`worker/downloadPages.ts:357`), so this is not proof the bundle is absent; it is proof that a
   customer standing on `/share` cannot reach it. **`/share` now links to `/downloads`**, so the
   setup page has to be `public` and `live` for that link to lead anywhere. If it should be
   unlisted instead, the share page needs the address hardcoded rather than the index — say which,
   and it is a one-line change in `SetupChecklist`.
2. **On a real Pi**: does Raspberry Pi OS add its own archive to unattended-upgrades' origins? If
   so Chromium is replaced under the running kiosk, which `pi-setup.sh` says cannot happen.
3. **`scripts/macos-share-setup.sh` has never run on a Mac.** `choose_folders` exists now; only the
   typed-path fallback was exercised.
4. **All of phase 2 by eye**: pairing, drive picking, the agent tab's states, a real two-tab WebRTC
   browse and download, offline/re-attach/take-over, the `/machines` explorer (Grid, Column, icons,
   wash, column slide), and the new agent-key accept/refuse panel (audit item 43). The harness
   proves every route; it cannot run `RTCPeerConnection`.
5. **Operator surfaces by eye since the password fields landed**: the mint form, the grant form,
   the file form with bytes, the publish row, the three dialogs, and the two release dialogs
   (publish/open-up, free/move).
6. **The duel on a real machine.** rAF parks in every automated browser here; `duel-bench` is the
   file to hand him. Matrix rain's fall speed and every animation are in the same bucket.
7. **The low-end path on genuinely old hardware.** If stutter survives the 0.28 tier, the next
   lever is a 30fps update rate — add only if measured.
8. **`/now` goes stale by sitting still.** It lists two real machines; a stale `now` is worse than none.

## Dashboards

1. Cloudflare **"Always Use HTTPS"** — belt and braces behind the Worker's redirect.
2. **`mcclevarty.com` has no DS record.** Symmetry only; it just redirects. (`mcclevarty.ca`'s
   DNSSEC was verified live 2026-09-06 — `docs/SECURITY-AUDIT.md` §7.)
3. Whatever remains of the **DNS hardening** list in `docs/SECURITY-AUDIT.md` §9 (DMARC `p=none`,
   SPF `~all`).

## Deliberately open — design changes, not patches

- **The fresh-TOTP check belongs on the phase-3 grant-submission endpoint**, which sees the signed
  grant itself. Build it before anything accepts a real grant (`docs/DECISIONS.md` 2026-08-14).
- **A republish may be needed for the withdrawn circles to fully go** — hidden is unlisted, not
  invalid; check the published row names none of Lens/Valve/Aperture/Orrery.
- **Photo slots hold Wikimedia placeholders** (`docs/PHOTOS.md`) — swap for his own, same treatment.
- **The gallery describes a video that does not exist**, and its drive-shelf block says forty drives
  while the alt text describes the five in the photograph. Both defensible, both worth a real clip
  and a real count.

## Traps recorded, not work

- **The Nosferatu sits at exactly 34 units sideways**, the camera's limit, so it is the one costume
  where widening anything fails the gate. The Viking was over and was fixed to 32.
- **The director's clock advances before it dispatches**, so `at: 0` and `at: 1` fire together.
  Unreachable today; if a module ever needs that offset, give it `at: 2`.
- **`c.hx` in `CostumeCtx` is `neckX`** and the `head` hook already runs inside that translate — the
  first head costume to use it as documented gets double the lean.

---

**Starting a session?** `docs/HANDOFF.md` has the paste-ready prompt, the deploy verification block,
and the list of things that cannot be verified from this side.
