# TODO

The single backlog: **only what is left to do.** `CLAUDE.md` explains *why* things are the way
they are, `docs/DECISIONS.md` records what was decided when, and `docs/TODO-ARCHIVE.md` holds the
dated session logs this file used to carry (moved out 2026-09-07 — read it for the reasoning
behind any item here, by date).

State on 2026-09-15: `npm run check` **86** green, `npm run test:auth` **409**. Live is Worker
`38ceae8d` (rollback `df6dba2a`); the audit branch is at `ee9ee75`, **not yet pushed**, and **is
ahead of what is deployed**. Four security passes are recorded in `docs/SECURITY-AUDIT.md`
(items 1–49); a fifth, find-and-fix, is in `docs/AUDIT-2026-09-14.md`.

**Both flaky gates are closed** (health bar 2026-09-14, fairness 2026-09-15), so `predeploy` no
longer fails at random — which was the one thing blocking a deploy from this branch.

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
2. **#13, downloads (Medium–High): a code for a never-finished upload redeems and burns a use.**
   Neither `mintCode` nor `opened()` checks `uploaded_at IS NULL`, so the customer spends one of a
   limited number of uses, lands on a page showing nothing, and gets no error saying why. Same bug
   class already fixed for withdrawn files. The refusal has to come through the single `denied`
   object or it becomes an existence oracle — that reasoning is the whole fix.
3. **#28, `thinkcentre-setup.sh` (Medium): `canon_store()` resolves symlinks only when the full
   target path already exists**, so `--store <symlinked-ancestor>/newdir` — the normal first-run
   shape — is compared as a plain string and `prepare_store()` then follows the link for real.
   Fix is "resolve the longest existing prefix, re-append the tail, fail closed", and the gate has
   to *execute* `canon_store` against throwaway symlinked directories the way the share-script
   blocklist gate does.
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

- **#14** — `fileId()` on `addGrant`/`mintCode`'s id reads. One line each, but it is in `worker/`,
  which the rule above puts on the judgment side however small the fix is. Do it in the same pass
  as #13, which is in the same file.
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

The coin gives **~1,646 samples a pass instead of 119** (it counts *throws*, not sequence starts —
a chained phrase deliberately reuses its aggressor, and entering those repeats as independent
samples is the same modelling error one level down). So 4σ is **stricter and quieter at once**:
it detects p ≥ 0.549 where the old gate needed 0.638, while false-failures fall to ~1 run in
16,000. Break-verified both halves — with the coin forced to 0.57 the new gate fails 11/12 passes
at ≥4σ (median 5.74σ) and **the old win statistic saw nothing at all, 0/12, median 0.74σ.** The
win count is kept at a loose 6σ, because a fair coin does not prove fair outcomes: damage, reach
or the reaction table could be asymmetric under a perfectly fair director.

**Gate coverage** was zero for the most severe. #12, #10/#17, #47, #5 and #6 are gated now. **#13,
#15, #28 and #29 still are not**, and each fix wants one, per this project's own discipline.

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
