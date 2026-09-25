# TODO

The single backlog: **only what is left to do.** `CLAUDE.md` explains *why* things are the way
they are, `docs/DECISIONS.md` records what was decided when, and `docs/TODO-ARCHIVE.md` holds the
dated session logs this file used to carry (moved out 2026-09-07 — read it for the reasoning
behind any item here, by date).

State on 2026-09-17: `npm run check` **90** green, `npm run test:auth` **409**, `npm run typecheck`
clean across **three** projects (the third, `scripts/`, is new). The 90th gate is audit item 28,
the host's store blocklist driven through `parse_args` against a symlinked tree. **Not yet
deployed** — nothing in it touches the Worker or the site; it is `scripts/` and docs only.
Previously **DEPLOYED** — live is Worker
`eae7958a`, rollback `38ceae8d`, with **migration 0009 applied to production** (8 commands, no row
renamed: production held 1 machine and 0 setups, so its two `UPDATE`s matched nothing). The
find-and-fix audit branch is merged to `main` at `57f76cd`; `main` is **14 commits ahead of
`origin/main` and not pushed** — 9 of those predate this session. Four security passes are recorded
in `docs/SECURITY-AUDIT.md` (items 1–49); a fifth, find-and-fix, is in `docs/AUDIT-2026-09-14.md`.

**Both flaky gates are closed** (health bar 2026-09-14, fairness 2026-09-15), so `predeploy` no
longer fails at random — which was the one thing that had been blocking the deploy.

**Verified live after deploying**: all twelve content routes render their real `h1` with zero
overflow and zero console errors; an anonymous visit fetches **two** JS chunks (entry plus the page
it landed on) and no operator code; all eight lazy chunks serve 200; `/api/health` reports 8 tables;
and all five icon probes — including `-precomposed` and the sized variants — answer `404 text/plain`
where production had been serving the whole app shell.

**A fifth pass ran on 2026-09-14 — a find-AND-fix sweep, not findings-only** (the four before it
were read-only). Ten parallel reviews covering every slice of the tree, then six fix crews; the
whole of it is in `docs/AUDIT-2026-09-14.md`, which is the file to read before acting on anything
below. What separates it from passes 1–6 is that it **ran things**: the Worker under
`wrangler dev` driven by the real browser auth modules, the setup scripts' blocklists executed
against throwaway home directories, the PowerShell under `pwsh`, and the site itself in a browser
across all fourteen layouts and every route. Several of its findings are fixed *and*
break-verified — the fix was confirmed by watching the test fail against the old code first.

**The desktop of the ThinkCentre is a separate repository**, `../debian-desktop`. The boundary is
"can this take the file host offline?" — every privileged script stays in `scripts/` here.
`../debian-desktop/BLUEPRINT.md` §3 is the argument; §6 is that machine's own task list, and it is
newer than the host section below.

**2026-09-23 (not yet deployed):** `/gallery` and `/changelog` removed as filler, and `/work` and
`/guestbook` removed because the client confirmed their case studies and quotes were invented by an
earlier model session (routes 17 → 13, nav 7 → 4 pills, 404 says "seven", every photo gone; all four
archived in `docs/RETIRED-PAGES.md`), `/scams` reorganised into five runs with its repeats
merged, `/setup`'s two closing blocks merged, `/about`'s parts list cut. `npm run check` 91 green.

---

## Review of 2026-09-24 — four parallel reviews, findings not yet fixed

Security 8.5, live hygiene 9, code quality 7, performance 6–8, accessibility 8. No Critical/High in
the site. **Where each item runs:** site fixes run on the PC that has the Cloudflare token (the
Debian box has none); host-script fixes must be written *and tested* on the ThinkCentre.

### For the ThinkCentre session (host scripts — test on the box)

**Items 1–5, 7 and 9 were FIXED IN THE REPO on 2026-09-24 (a different machine, nothing run on the
box).** Each fixed host-script item has a gate in `npm run check` that drives the real function and
was break-verified (it fails with the fix reverted). What only the box can confirm is listed under
*Confirm on the box* below; until then treat the fixes as written, not as proven.

1. **FIXED in repo — confirm on the box.** ~~`plasma-dark-setup.sh:1356,1361` writes PowerDevil keys with `--group AC`.~~ Plasma 6 reads
   `[AC][Display]` and `[AC][SuspendAndShutdown]`, so the display-off fix is probably ignored and
   the kiosk still blanks. Check: `kreadconfig6 --file powerdevilrc --group AC --group Display --key
   TurnOffDisplayWhenIdle`, then leave it idle 20 min. `--verify` never reads powerdevilrc — add it.
   *Now:* nested `[AC][Display]` / `[AC][SuspendAndShutdown]` per PowerDevil's own
   `PowerDevilProfileSettings.kcfg`; stale flat keys deleted; `--verify` reads all four idle keys
   back and FAILS on any that would blank. `docs/HOST-BUILD-LOG.md` wall 7 has the on-box steps.
2. **FIXED in repo.** ~~`graphical_session_id` in `thinkcentre-setup.sh` picks the first `Class=user` session~~, and
   SSH sessions are `Class=user` too (`Type=tty`). `--verify` over SSH can FAIL a healthy box.
   Filter on `Type` x11/wayland or a non-empty `Seat`.
3. **FIXED in repo** (`sddm_value`, last file wins, `[Autologin]` only). ~~The SDDM config loop keeps the *first* `User=`/`Session=`;~~ SDDM lets later files win, and the
   loop ignores sections. Low.
4. **FIXED in repo — never run on the box in this form.** No `sh -c`; sudo is `--with-sudo`
   (and it refuses a user already in `sudo` without it); loosening `/home/user` is `--share-home`;
   `--undo` reverses only what `/var/lib/vessel-rdp-user/` records. Was:
   ~~**`scripts/rdp-separate-user.sh` — do not run as written.** Lines ~427-431 paste `{}` into a
   `sh -c` string run as root (a filename in /home/user with `'` or `$(…)` executes); it makes a
   sudo-capable user that logs in by password over xrdp with no lockout; it loosens /home/user
   700 → 750; it has no `--undo`.~~
5. **FIXED** (644 in git, gated). ~~**Both `attic-*.DO-NOT-RUN` files are mode 755.** The GDM one disables SDDM. `chmod -x` them.~~
6. **`plasma-vibes.sh` and `konsole-profiles.sh` are looks, not host** — by BLUEPRINT §3 they
   belong in `../debian-desktop`, and they are a second look system nobody documents or gates.
7. **FIXED in the docs** (the GitHub step below). **Use a repo-scoped deploy key**, not the account-wide SSH-keys page — an always-on kiosk box with
   RDP should not hold write access to the whole GitHub account.
8. The Share operator tab has never been seen in a browser on the phone band (header may scroll).
9. **FIXED** (lines below corrected; the Share tab is still unseen — item 8). Stale lines left by the 09-11 commits: "Share tab UNVERIFIED, never built" and "two commits
   unpushed, nothing deployed" (both deployed 2026-09-23 as Worker 3d1133a5); "green at 77" (91);
   `REMOTE-ACCESS.md`'s xrdp/freerdp state not re-checked since 09-11.

#### Confirm on the box (after pulling the 2026-09-24 fixes)

- [ ] `./scripts/plasma-dark-setup.sh --no-install` as `user` in the desktop session; then the
      three `kreadconfig6 … --group AC --group Display|SuspendAndShutdown` reads say
      `false` / `false` / `0`, and `~/.config/powerdevilrc` has no flat `[AC]` keys left.
- [ ] **The 20-minute idle test**: touch nothing, no remote session attached, 20+ minutes; the
      screen is lit, undimmed, unlocked, kiosk showing. Repeat once after a logout/login.
- [ ] `./scripts/thinkcentre-setup.sh --verify` **over SSH while the desktop is logged in**:
      `graphical session type` is `ok x11` (not `tty`), `pointer hidden` is checked, the four new
      idle lines are `ok`, and autologin/session read `user` / `plasmax11`.
- [ ] `ls /etc/sddm.conf.d/ /usr/lib/sddm/sddm.conf.d/` — if anything sorts after
      `10-vessel.conf`, `--verify` now reports what SDDM will really use; make sure that is right.
- [ ] Before any RDP work: `sudo bash scripts/rdp-separate-user.sh --help` reads right; then run it
      (plain, no flags unless wanted), log in over xrdp as the new user, and confirm `id` shows no
      `sudo`. Then `sudo bash scripts/rdp-separate-user.sh --undo` on a throwaway run if you want
      to prove the undo, and re-run.
- [ ] `ls -l scripts/attic-*` shows no `x` after the pull.
- [ ] The deploy key: add `~/.ssh/id_ed25519.pub` as a deploy key on the one repository (see
      the GitHub step under *Open, raised by the client*), `ssh -T git@github.com` names the repo.

### For the site (needs the PC with the Cloudflare token)

10. ~~**Anonymous lockout of password sign-in**~~ **Fixed 2026-09-24 on a branch, NOT deployed** —
    per-(address, handle) bucket at 5 plus a per-handle ceiling at 30 (`SECURITY-AUDIT.md` item 50).
    Items 16, 17, 18 and the CORP/health half of 21 are in the same commits (items 51–54).
    **Follow-up, same day, also NOT deployed** (items 55–60): the pair bucket keys IPv6 on the /48
    (a /64 key let one free tunnel refill the lockout; passkeys remain the real mitigation); session
    epoch + signalling hang-up on password change / operator resets; replacement uploads stay live;
    download tickets die with their code; `setPassword`'s UPDATE branch guarded in the write;
    `BREAK-GLASS.md` gained secret rotation. **Deploy order: `npm run db:migrate:remote` (0010)
    first, then `npm run deploy`.**
11. **`/share` step 1 points signed-in users at `/downloads` for the setup script**, which is not
    publicly listed and, until re-uploaded, still carries the other-account `.ssh` hole. Fixed by
    the bundle re-upload (*Needs hardware* item 1), or hold the link back until then.
12. **The duel engine (~60 KB min / 16 KB gz) ships to every visitor** — `src/fx/effects.ts`
    imports it statically. Lazy-load it; it is operator-only.
13. **Arrow keys page the site inside Deck's sideways-scrolling grid** (`useOperatorRoutes.ts`).
14. `--mx`/`--my` are written on every pointermove without rAF batching, and invalidate the whole
    `.vessel` subtree (`inherits: true`) for 11 layouts that never read them.
15. `useFocusTrap.ts`'s `FOCUSABLE` does not exclude hidden/`inert` elements.
16. ~~`setPassword` reports `set` on a UNIQUE conflict~~ **Fixed 2026-09-24, not deployed** — 409
    unless the stored password is the one sent.
17. ~~Passkey labels skip `expectDisplayName`~~ **Fixed 2026-09-24, not deployed.**
18. ~~A stolen operator cookie can rewrite live download-page text~~ **Fixed 2026-09-24, not
    deployed**: any save to a live page, and revoke/remove-grant, now ask for the password. **Still
    his call** whether the prompt on a live-page typo fix is worth it — `DECISIONS.md` 2026-09-24
    names the narrower cut ("live and public only") if he says no.
19. No linter: the four `eslint-disable … exhaustive-deps` comments suppress nothing. Add
    `eslint-plugin-react-hooks` or delete them. `DownloadEditor.tsx` (2,014 lines) wants splitting.
20. Doc drift: `check:fast` takes ~43s, not ~4s; CLAUDE.md's `OPERATOR_NAV` line omits Share.
    (The `SECURITY-AUDIT.md` `/api/account/slot` line is corrected, 2026-09-24.)
21. Hygiene: ~~no `Cross-Origin-Resource-Policy`~~ and ~~`/api/health` uncached~~ **fixed
    2026-09-24, not deployed** (CORP `same-origin`; health memoised 30s per isolate). Left: CAA
    allows five CAs (dashboard), no font preload. HSTS `preload` deliberately not added.
22. **MX points at namespro while SPF is `-all` and DMARC `reject`** — mail *sent* as
    @mcclevarty.ca will be rejected. Fine only if he never sends from the domain; confirm which
    address the contact reveal shows.

## Needs the client — decisions, not work

1. **The four duel sliders** (circling, rest, impact, patience) still carry defaults. Size works,
   `rest` is a real multiplier, the preview follows the selected page. His eye is the one thing
   that cannot be substituted for.
2. ~~**Sessions survive a password change and an operator reset**~~ **Fixed 2026-09-24 on a branch,
   NOT deployed** ("fix everything"): `accounts.sessions_after`, migration 0010 — **apply it before
   deploying** — §9 updated; the same events hang up signalling sockets (`SECURITY-AUDIT.md` 58–59).
3. ~~**`beginUpload` hides a live file before the password is asked**~~ **Fixed 2026-09-24 on a
   branch, NOT deployed**: the old bytes stay live until `finishUpload` (`SECURITY-AUDIT.md` 55).
4. **Eight copy facts only he can supply** (2026-08-26; each renders the safe reading meanwhile):
   the "pay once, nothing renews" promise (now cut — wanted back permanently?); Contact's "within
   a day"; the two guestbook numbers; `work`'s "two years" (now "ever since"); the per-machine
   record line (cut); the years figure ("over twenty" everywhere, one phrase to change); the Kevin
   joke on home (adjacent to the accent framing he declined for `/scams`);. (`/work` and the
   guestbook are answered: both were invented and both are removed, 2026-09-23.)
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
   the only way in (**all as of 2026-09-11 — unchecked since**). Two halves, and they are different tools: `scripts/rdp-separate-user.sh` plus
   `systemctl enable --now xrdp xrdp-sesman` gives a *second* desktop that survives reboot;
   shadow-over-RDP or `krfb` gives the *live kiosk screen* and still needs a user unit and
   `loginctl enable-linger user` to persist. `/home/user/.xsession` is still present and is still
   the black-screen bug — the fix script removes it. Do not reach for GNOME/GDM; it would break
   the kiosk's autologin.

## Open, raised by the client 2026-09-08

0. **THE SHARE TAB HAS STILL NEVER BEEN SEEN IN A BROWSER.** It has since passed `npm run check`,
   been built, and was **deployed on 2026-09-23 as Worker 3d1133a5** — but nobody has looked at
   it, on the phone band least of all (review item 8: the header may scroll).
   Three files changed: `src/data/pageIds.ts` (adds `{ id: "share", label: "Share" }` to
   `OPERATOR_NAV`), `src/components/Footer.tsx` (a `me`-gated `share` link beside
   `account`/`admin`), and `scripts/check.ts` (a new three-nav reachability gate). **Look at the
   page, signed in, desk and phone band.**

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
   npm 10.9.8 and `npm run check` was green at 77 (91 by 2026-09-23, 96 on 2026-09-24);
   `wrangler 4.122.0` starts.

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
     thinkcentre-host-20260908`). It is **not yet on GitHub** — `ssh -T git@github.com` answers
     *Permission denied (publickey)*. **Add it as a DEPLOY KEY on this one repository** —
     the repo's *Settings → Deploy keys → Add deploy key* — **not** on the account's SSH-keys page.
     An account key opens every repository the account can reach, from an always-on box that
     autologins to a desktop and takes RDP; a deploy key opens one. Tick **Allow write access**
     only because this box commits and pushes (it did on 2026-09-11); if it ever stops being a
     place work is done, remove the key and re-add it read-only, which is all a pull needs. A key
     can be a deploy key on only one repo, so a second repo on this box needs its own key. Then
     `git remote set-url origin git@github.com:zazathebird/vessel.git`.

   ~~**Two commits are unpushed** as of 2026-09-11~~ — `ae2ef52` (the host blanking fix) and the
   share-page steps commit both reached `main` and were **deployed 2026-09-23 as Worker
   3d1133a5**. (The blanking fix itself turned out to write the wrong group — review item 1.)

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

4. **`thinkcentre-setup.sh` should learn SDDM.** `plasma-dark-setup.sh` writes the autologin
   today, which means the knowledge lives in two scripts. Fold it back in once the host is up.
5. **Checked over SSH 2026-09-12 and found ABSENT on that box:** `claude` is not installed and
   there is no `~/project/website` clone, so `claude-code-setup.sh --with-repo` never ran or did
   not stick — nothing on the host can read any of this. `krfb` is absent too, so the
   remote-viewing half of the X11 rationale is unrealised and that desktop can only be
   photographed, not watched.
6. **It is not certain `thinkcentre-setup.sh` has ever been run there at all** — only a loose
   `~/Downloads/thinkcentre-setup.sh` was found. Item 1 above assumes it has; establish that
   first. **`../debian-desktop/BLUEPRINT.md` §6 is the live version of this list.**

## The site-wide debug audit — 45 findings, 17 fixed, 28 open

Two scans by a second session, both findings-only by design: **Passes 1–5** (2026-09-13/14) read
the whole application, **Pass 6** (2026-09-14) took four slices none of them had touched — the
host-provisioning scripts, a meta-audit of `scripts/check.ts` itself, the remaining components and
data files, and the dev/test tooling. **`AUDIT-FINDINGS.md` is the index** and `.audit/pass*.md`
are the evidence, both committed so this does not live on one machine.

**Read the caveats before acting on any of it.** The audit was reading a tree that was being
changed under it, so exact line numbers in the pass files are historical; function and file names
were written to survive. And it is one model's reading. **Six have since been verified by hand
against live source** (2026-09-14, third session) and all six held: the two `0.2` frame-delta
floors (#10/#17, #47), `canon_store`'s bypass (#28), the Pi Chromium fallback (#29), check.ts's
nested `SKIPPED` banner and `ok`-on-zero-bytes (#36, #39), and the panel's `[config]` dependency
(#42). **#28's severity is argued down to Medium**: it needs a symlink whose ancestor already
points into `/etc`, on a box being run with sudo by its own operator. Everything else is still an
unverified claim until somebody checks it.

### Who should fix what

**The fix is rarely the work here — the gate is**, and it has to be break-verified. So the routing
is not by severity, it is by whether the correct pattern already exists in-tree to copy. **The
line is the one `CLAUDE.md` already draws:** anything touching `worker/`, `src/auth`, `src/share`,
`migrations/` or the host scripts' security controls wants the more capable model, one-line fix or
not — three of the four worst findings in this audit are places where an earlier careful fix moved
the hole instead of closing it, #12's first attempt among them.

**Wants judgment (Opus or equivalent), in the order worth doing them:**

1. ~~**#36/#39/#40 — check.ts's own honesty about what it did not run.**~~ **Fixed 2026-09-14**,
   commit `4ad2f49`. `skip()` throws a sentinel the way `must()` does, the status column gains
   SKIP, skipped gates leave the pass count ("70 checks passed, 1 could not be run"), the banner
   prints on red runs too, and a skip never sets a non-zero exit code. Break-verified with the
   sibling absent *and* with an unrelated gate deliberately broken, which is the half of #36 that
   a plausible fix leaves undone. **#41 is deliberately not fixed**: the pin-writer allow-list is
   a substring scan, which its author weighed and called proportionate for a script with no access
   to the TypeScript compiler API, and the audit's own read agreed it is reasonable but
   incomplete. Closing it properly means a real AST pass; a cleverer regex would only buy false
   confidence. It stays a known limit on a gate protecting a property that has regressed once.
2. ~~**#13, downloads: a code for a never-finished upload redeems and burns a use.**~~ **Was
   already fixed and gated on 2026-09-14; this entry was stale.** `opened()` refuses on
   `uploaded_at === null` and `claim` resolves the scope *before* spending the use, so the refusal
   is the shared `denied`/403 and the count does not move. Both halves are asserted in
   `auth-e2e.ts` ("a code for a file that never finished uploading is refused" / "and that refusal
   does not spend one of its uses"). **`mintCode` deliberately does not refuse** — minting before
   uploading is a normal order of work, so the file simply is not yet something a code can open.
3. ~~**#28, `thinkcentre-setup.sh`: `canon_store()` resolves symlinks only when the full target
   path already exists.**~~ **Fixed and gated 2026-09-17.** It walks back to the longest prefix
   that exists as a directory, resolves that, and re-appends the tail; a component that exists but
   is not a directory is refused rather than carried into the tail (`-L` beside `-e`, for the
   dangling symlink `mkdir -p` would follow). **The gate drives `parse_args`, not `canon_store`** —
   driving the resolver alone stays green when the caller stops consulting it — against a real
   symlinked throwaway tree, 7 verdicts. Break-verified: it fails against the pre-fix script,
   naming `TMP/link-to-etc/vessel` as ACCEPTED. `docs/DECISIONS.md` carries the reasoning.
4. **#29, `pi-setup.sh` (Medium): the documented fallback to Debian's `chromium` silently defeats
   the no-auto-upgrade invariant.** `configure_unattended_upgrades()`'s premise is "Chromium comes
   from the Raspberry Pi archive", which is false the moment the fallback fires. Needs *both*
   halves — the blacklist and its own timer — or it is worse than leaving it. This is the concrete
   mechanism behind *Needs hardware* item 2 below, and answers half of it from source.
5. **#19 + #27, worker (Low–Medium): two case-collision races** on bare binary-collated unique
   indexes behind `COLLATE NOCASE` runtime checks (`setups.ts`, `machines.ts`), plus `rename()`
   lacking the `try/catch` its sibling `pair()` has three lines above. Wants a migration.
6. **#2/#3, accessibility (Medium): `aria-modal="true"` on two non-modal overlays**, and arrow-key
   NAV paging checks `!panelOpen` but not `!doorOpen`, so the page moves under an open door.
   `CLAUDE.md` says non-modal is deliberate, so resolving the contradiction is a design call; the
   edit afterwards is one line.
7. **#42, the panel (Medium): the "Published" note is invalidated by mere navigation.** The
   resetting `useEffect` depends on the whole `Config`, which carries `page`/`sub` — so publishing
   and then clicking a nav link to see how it reads elsewhere says the publish was lost. The right
   dependency is the publishable subset, and choosing that is a judgment about what "anything
   changes" means.
8. **#1 + #48 together**: signup's taken-handle path double-counts against its own rate-limit
   bucket, and `auth-e2e.ts`'s own test accepts anything from 2 through 14 so it cannot see it.
   Coupled — tightening the test fails while the bucket bug is open.
9. **#30/#31, `plasma-dark-setup.sh` (Medium)**: `set_key()` silently no-ops **all** theming when
   `kwriteconfig` is absent while promising a fallback that does not exist, and the two tools the
   wallpaper subsystem's own "THE TRAP" comment says are required are never installed outside a
   `LOOK=deepin` branch. Straddles `../debian-desktop`, which is under independent development.

**Mechanical — DONE 2026-09-14**, by Fable under review, four commits, each break-verified and
each leaving `npm run check` green (80 → 82; the two new gates are the `--faint` allow-list and the
byte-ceiling one). `b321a6f` **#10/#17 + #47**, the two `0.2` frame-delta floors, both templates now
in `check.ts`'s `hosts` array — plus a knock-on it found and I closed: a zero floor makes `60 /
elapsed` reachable, and the duel bench's fps average is sticky, so one such frame parked the readout
at Infinity. `607857a` **#16**, both `--faint` labels — and `.v-saver-label`'s `opacity: 0.6` had to
go with it, since `--muted` at 0.6 measures 3.19–4.01:1 and the colour change alone would not have
closed the finding. **That makes the screensaver's exit instruction visibly brighter; it wants his
eye.** `112416a` **#5, #4, #7, #6, #50**. `b2a1269` the seven stale comments (**#8/#45, #9, #46,
#26, #49, #25**) — two of which the audit had itself described wrongly, and one of which
(**`perf.ts`'s "two tiers down" is three**) was false in `CLAUDE.md` too and is corrected there.

**Left in the mechanical group deliberately:**

- ~~**#14** — `fileId()` on `addGrant`/`mintCode`'s id reads.~~ **Stale: already fixed**
  (`downloads.ts` `addGrant`, `downloadPages.ts` `mintCode`; recorded in `docs/AUDIT-2026-09-14.md`
  item 7). Confirmed by the 2026-09-22 sweep.
- **#32/#33/#34** — `deepin-exact` excluded from its own package gate, `--accent` checking digit
  count rather than range, the `fc-list` guard applied to the display font but not the mono one a
  line above the comment explaining why. All three are in `plasma-dark-setup.sh`, which carries the
  host's X11 pin: low value against a blast radius that ends at "the file host does not come back".
- **#43** — the scope qualifier on the three look-dial toasts that lack one. It is operator-facing
  copy, so it is his voice, not a smaller model's.

**Left deliberately unrouted**: #15, #18, #20, #21, #22, #23, #24, #35, #44 — real but narrow, and
none of them is worth a session of its own. See the index; fold them into whichever pass is already
in that file.

**Not a finding, a decision for the client:** the "accept the new key" dialog never shows the
offered key, so the owner attests "I re-keyed it" without being able to compare fingerprints.
Pre-existing and inherent to the design as written.

**Closed 2026-09-14** — the flaky `duel: the health bar clears every costume` gate. It was the
gate, not the renderer: it attributed each bar to a fighter by x, and `stepFighter` clamps *both*
fighters to the same arena wall while either is airborne, so `st.b`'s bar was judged against
`st.a`'s `y`. Measured at 2.5% of runs; now attributed by draw order, 0 in 400 passes. The
renderer is provably safe over all 24 headroom values. Neither reading in the old entry was right,
and the airborne exemption it offered would have masked it.

**Closed 2026-09-15** — the second flaky gate, `duel: fairness, reachability, stability`. It
measures the **role coin** now rather than match wins, and the verdict is that the old statistic
was *blind* as well as noisy. Two things were established before the threshold was chosen:

- **The engine is not biased.** Pooled p(att = "a") = **0.49983 over 329,113 coin throws**
  (z = 0.19) across 200 passes, with lag-1 agreement 0.49931 — fair, and independent.
- **The old gate really did self-trip**, ≥3σ in **2 of 200** standalone passes (max 3.29), i.e.
  about 1 predeploy in 175. The 2026-09-14 note called this "not reproducible standalone" on the
  strength of 0 in 150; it is reproducible, just rarely, and the two runs pool to 2/350 ≈ 0.57%.
  **The separate 2-failures-in-5 in-suite observation remains unexplained** and should still be
  treated as unexplained rather than as noise.

The gate runs **twelve rounds now, not three** — ~478 matches and ~6,690 coins a pass — and **both
halves sit at 4σ**. The round count is what pays for the threshold: a first version moved the coin
to 4σ (right, it had gained 13.8× the samples) and the *win* count to 6σ at the same time (wrong —
same estimator, same ~119 matches, only the bar moved), which is the "raise the threshold until it
stops failing" this repo warns against, applied to the one property the coin cannot see. **A
threshold may only rise when the evidence does.** Caught by `/code-review` before deploy.

Re-measured at the shape actually used, 60 passes: p(coin) = **0.49999 over 401,208 throws**,
p(wins) = **0.49887 over 28,657 matches**, max σ 2.40 / 2.74, **0 at ≥4σ**. Both halves now detect
better than the 3σ they replace *and* false-fail ~1 run in 16,000 instead of ~1 in 175. The
detector also counts the opening throw of each match, which the first version missed (1.70%,
unbiased). Break-verified: with the coin forced to 0.57 the new gate fails 11/12 passes at ≥4σ
(median 5.74σ) while **the old win statistic saw nothing at all, 0/12, median 0.74σ.**

**Closed 2026-09-15** — two of the three named gate gaps, and the suite is **88**.

- **The deploy shape had no gate of any kind.** Nothing mentioned `_redirects`, `_headers`,
  `rollupOptions`, `fxlab`, `sitelab` or `run_worker_first`, so audit item 39's fix existed only as
  a comment. Break-verified twice: re-adding the exact `["/*", "!/assets/*"]` negation fails it,
  and so does dropping the `dist/_redirects` strip from `predeploy`.
- **`crawlerFile` is driven**, and asserts the converse as well — five page paths must still fall
  through, so it cannot be satisfied by intercepting everything. Break-verified by deleting the
  favicon branch.
- **`scripts/` is typechecked** (`tsconfig.scripts.json`, wired into `npm run typecheck`, which the
  deploy gate now asserts). What that found is in `docs/SESSION-HANDOFF-2026-09-14.md`; the worst
  is that **`DuelView.paper`'s promised compile error had never once fired.**

**Closed the same day** — the **Windows blocklist** is driven now (22 verdicts under `pwsh`
against throwaway profiles), which was the security-shaped one of the three. **It found a live hole
on its first run**: `/home/other` and `/home/other/.ssh` were shareable on *all three* scripts,
since the dot-directory entries are keyed to your own `$HOME`. Fixed, gated both platforms (Unix
went 36 → 48 verdicts) and break-verified behaviourally. See `docs/DECISIONS.md`.

**Still ungated** of the three named: **`src/hooks` is gated by nothing at all**, and three of the
2026-09-14 findings were in there.

**Gate coverage** was zero for the most severe. #12, #10/#17, #47, #5, #6, **#13** (in
`auth-e2e.ts`, both halves — the refusal and that no use is spent) and **#28** (2026-09-17, driving
`parse_args` against a symlinked tree) are gated now. **#15 and #29 still are not**, and each fix
wants one, per this project's own discipline.

## Needs hardware or a human eye — cannot be done from here

1. **Re-upload the setup bundle — a SECURITY item, not hygiene** (2026-09-15). All three scripts
   changed: they refused your own `$HOME/.ssh` and **allowed `/home/someone-else/.ssh`**, because
   every dot-directory entry is keyed to your own home. The published bundle still has that hole;
   `launch.bat` was already stale (audit item 45). **`dist-setup/` is rebuilt and current as of
   2026-09-22** — all four files byte-identical to the gated sources, `CHECKSUMS.txt` regenerated
   (both are generated, never typed). **2026-09-22 adds a second reason**: on a real Mac the
   other-account rule was inert (it folded the input's case but not `/Users` or `$HOME`), so the
   macOS script was still allowing `/Users/someone-else/.ssh` even after the 09-15 fix. The rebuilt
   bundle carries the fix. **What is left is the upload itself**, which needs a signed-in
   session: downloads editor, existing ids, password at each finish. `docs/DOWNLOADS.md`.
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

## Ideas only — run past me by the client 2026-09-24, not planned

1. **Login history on the account page** ("IP, timestamp, OS"). The account page already exists
   (`/signin` signed in: password, passkeys, TOTP, change password). **IP and user-agent collide
   with SPEC-ACCOUNTS §9** — "No raw IP address is stored, anywhere" and the inventory's explicit
   exclusion of IPs and user-agent strings — and with Contact's "nothing about you is stored".
   Recommended shape, pending his answer: a **sessions list** with sign-in time, a coarse device
   label derived at sign-in ("Windows · Chrome", never the raw UA), which credential was used,
   and "sign out this one / all others" (the `sessions_after` epoch already does the latter);
   the current request's IP shown live but never stored. Any stored field is a §9 spec change.
   **Follow-up idea (client, same day): the log lives on THEIR machine.** The Worker is the only
   party that sees every sign-in (an intruder signs in from their own browser, so a browser-kept
   log never sees them), so the Worker emits each event to the owner's paired agent, which appends
   to a file in a folder they choose. While the agent is offline, events queue **encrypted to a
   per-machine ECDH key** (the agent's current key is ECDSA, signing only) and are deleted on
   delivery — the operator cannot read the queue. Opt-in per field via a checklist (sign-ins,
   device label, IP, failed attempts incl. attacker IPs, credential changes, file access), all
   off by default. §9 gains an honest line for the opaque queue. Order: sessions list first →
   phase 2 seen working → this. **Client's own verdict: an attacker's IP is nearly always Tor or a
   VPN, so logging IPs is close to pointless** — drop IP from any version of this; the device
   label, time and credential type are what would actually catch an intrusion.
2. **Customisable file browser** (`/machines` explorer). Per-user look and behaviour: view mode,
   density, sort, icon style, colours from the palette set, what a double-click does, hidden-file
   visibility. Today one choice persists in localStorage (`vessel.explorer.v1`). Decide: per
   browser (localStorage, zero spec impact) or per account (a prefs field in D1 — not personal
   data, but a §9 inventory line). Build after phase 2 has been seen working by eye (pairing
   has never happened on the real box).
