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
7. **Unattended remote access** — if ever wanted, self-hosted RustDesk or MeshCentral, never
   Tailscale again (reversed 2026-08-26). Ask whether he ever needs into a machine nobody is at.
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

1. **Run `thinkcentre-setup.sh --verify` after a reboot.** It has never run on real hardware;
   whatever it flags is the first thing to fix.
2. **Add `usbcore.autosuspend=-1` to the GRUB command line** and reboot. The root filesystem is
   on a USB SSD, and autosuspend under an idle disk hangs the box. The preflight names it and
   deliberately does not edit the boot line.
3. **Pair the machine** at `/share`, and never launch the kiosk with `--user-data-dir` or
   `--incognito` afterwards — the Chromium profile *is* the pairing.
4. **`thinkcentre-setup.sh` should learn SDDM.** `plasma-dark-setup.sh` writes the autologin
   today, which means the knowledge lives in two scripts. Fold it back in once the host is up.

## Needs hardware or a human eye — cannot be done from here

1. **Re-upload the setup bundle.** `launch.bat` changed (audit item 45); `dist-setup/` is rebuilt
   and its `CHECKSUMS.txt` is current, the published one is not. Downloads editor, existing ids,
   password at each finish. `docs/DOWNLOADS.md`.
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
