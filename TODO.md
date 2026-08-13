# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are, and `docs/DECISIONS.md` records what was decided when; this file is only
what is left to do.

Last updated 2026-08-13 (late — app-shell/UI review ran and its eight findings are fixed;
de-branding to `mcclevarty.ca`, duel silhouettes + literal blade colours, placeholder photos and
the new favicon shipped; `docs/REVIEW-CONTINUATION.md` completed and deleted per its own note).

---

## Do this first

### 1. ~~Close the harness's three coverage gaps~~ — done 2026-08-13

All three closed; `docs/DECISIONS.md` has the full note. The suite now imports
`flows.ts` and `api.ts` through a fetch shim, covers recovery-with-2FA (the
stranded-wrapping-key path), change-password, site config, and all four admin
routes with their guards. The number stays so cross-references hold.

```sh
npm run dev:worker      # wait for "Ready on http://127.0.0.1:8787"
npm run test:auth       # in a second terminal
```

The harness prints its own total; do not hardcode a count anywhere else. Snags
when running it:
- If the port is not 8787, the harness will not find the server. Kill stray
  `wrangler dev` processes first — a second instance silently takes 8788.
- `SQLITE_BUSY` / `workerd failed to start` means two instances are running.
- A bare `npm run build` leaves `dist/_redirects` in place, which the local
  Worker rejects the same way a deploy would. Run `npm run predeploy` instead,
  or delete the file. See `docs/HANDOFF.md`.
- The last-operator guard check skips (and says so) if a non-`harness-` account
  holds an operator flag in local D1. Demote it or accept the skip.

### 2. Redeem one recovery code on the live site, once, deliberately

Nobody has ever completed the flow end to end in a browser. It spends one of ten
codes, which is why it has not been done casually. The harness proves the bytes;
it does not prove the screens, and `SignIn.tsx`'s recovery stages were changed
on 2026-08-13.

### 2b. ~~Finish the review round: re-run the app-shell/UI review~~ — done 2026-08-13

Ran late 2026-08-13 over the full app-shell scope; eight findings confirmed and
fixed (Radial's six-pills-on-seven-slots orbit, the stuck "leaving…" button,
impure `setConfig` updaters, calm toggles overwriting published grain/breathe,
two dishonest clipboard toasts, Terminal's dead scroll boost, the unstyled
`.v-setup-row`, the logo countdown teasing visitors). One product-level finding
moved to *Awaiting client sign-off* (5). The `slotAlg` fixtures are fixed too —
178/178. `docs/DECISIONS.md` has the note; `docs/REVIEW-CONTINUATION.md` is
deleted per its own instruction.

### 2c. By eye, in a real browser (needs the client)

New since the last eyeball pass, all harness-proven but never seen: the ornament
five-tap → footer sign-in link (countdown toasts, Radial pills excluded), the
operator tabs (404/Account/Admin/Config) appearing on sign-in, and Leave
operator mode collapsing everything. Plus the standing items: TOTP enrolment
screen, dialog motion, command palette, duel ornaments, matrix rain speed.

---

## Accounts (phase 1 continues)

### 3. ~~Operator password reset in `/admin`~~ — done 2026-08-13

`POST /api/admin/reset-password` deletes the password credential and its key
slot, stamps `reset_at`, and returns status only — never key material (§5). Two
refusals: self-reset (change-password is the right tool) and an account with no
unspent recovery codes, where reset would seal the grant key for good. The
harness drives the whole loop — reset → recovery code → `setPassword`'s insert
branch → same grant key — and both refusals. The `/admin` button asks twice,
like delete. **Unverified by eye:** the button states in a real browser.

### 4. ~~TOTP enrolment screen~~ — done 2026-08-13

`beginTotpEnrolment` in `flows.ts` (the derived `authSecret` lives in its
closure between enrol and confirm, the `RecoverySignIn` shape), rendered by
`src/components/TotpEnrol.tsx` inside the signed-in summary. Secret and
`otpauth://` URI as text — no QR, no library. Backup codes shown once with the
honest-clipboard copy. The harness drives the flow, both refusals included.
**Unverified by eye:** the screen itself, like every account screen — the
client walks it in a real browser.

### 5. ~~Passkeys, account/setups pages, dialog primitive, command palette~~ — done 2026-08-13

All four built, in order, each with its own note in `docs/DECISIONS.md`. `⌘K`
remains unbound (claimed twice — see *Awaiting client sign-off*); the palette
opens by typing `cmd` until the client picks. The number stays so
cross-references hold.

- **Command palette — done 2026-08-13.** Typed `cmd` route, z 85; commands are
  what the caller could already do, operator vocabulary gated on `isOperator`.
  **Unverified by eye:** all of it.
- **Dialog primitive — done 2026-08-13.** `src/components/Dialog.tsx` per §10:
  focus trap, Escape, focus return, 22px blur, 340ms standard curve, z 75,
  portals into the themed wrapper (`OverlayHostContext` — body has no palette).
  `/admin`'s reset and delete now confirm through it; delete types the handle.
  **Unverified by eye:** everything, including the entrance motion.
- **Account/setups — done 2026-08-13.** Saved setups on the `/signin` summary
  (`worker/setups.ts`, `src/components/Setups.tsx`): name + share code, apply =
  paste, case-insensitive replace, harness-covered. `/account` stays reserved
  and the signed-in *current* config still does not sync — both deliberate,
  `docs/DECISIONS.md` has the reasoning. **Unverified by eye:** the section.
- **Passkeys — done 2026-08-13.** Hand-rolled WebAuthn (`worker/webauthn.ts`,
  `worker/passkeys.ts`, `src/auth/passkeys.ts`), each passkey a key slot on the
  same grant key via the `prf` extension, driven end to end by the harness with
  a software authenticator. Two recorded decisions — no TOTP stage and no rate
  limiting on passkey sign-in — in `docs/DECISIONS.md`. **Unverified by eye:**
  the Passkeys section, the sign-in link, and the real-authenticator ceremony
  on the live site, which needs the client's device.

---

## The lightsword duel

### 6. ~~Rebuild it per `docs/DUEL.md`~~ — ornament home done 2026-08-13

The new match engine (`src/fx/duel.ts`) keeps the client's reference verbatim:
blocky fighters, frame-count timers, the damage table, and **discrete matches
with winners**. Ships as ornaments 6 and 7 (`src/components/DuelOrnament.tsx`);
`docs/DECISIONS.md` has the note. Later the same day the four silhouettes were
upgraded (hair/halo/aura, horns/wing/spade tail, hood/belt, helmet/chest panel)
and the blades went to fixed alignment colours — blue/green good, red evil —
per the client (`CLAUDE.md` deviation 9). **Unverified by eye: the motion and
the new silhouettes** — this environment cannot check either, and the client's
verdict decides the remaining half of this item:

- **6b. Re-add the background `FX` entries once the client passes the ornament.**
  Append at indices 12/13 (never insert — share-code wire format);
  `EFFECTS.duel` / `EFFECTS.duelholy` already point at the new engine. Doing so
  dates the 404's "12 background modes" line, which is a copy correction that
  needs the client's sign-off at the same time.

### 7. Sound

Asked for twice, not built. The site has no audio at all. WebAudio synthesis fits
the no-assets rule; autoplay does not. Needs a control, a persisted toggle and a
share-code field — **a spec change, not a patch.**

---

## Content and copy

### 8. Edit mode — operator-editable page copy and images

Asked for 2026-08-12. Large. `src/data/pages.ts` is a static module today, so it
needs a D1 table and the same inject-don't-fetch treatment as site config.

**Blocked on a client decision:** the spec forbids images entirely (`SPEC.md`
*Assets*). Allowing them is a spec change and needs R2 or similar.

### 9. A setup guide page/download (Tailscale et al.)

Asked for 2026-08-12.

### 10. Photo slots hold stand-in photos, not yet the operator's own

Since 2026-08-13 the eight tiles show Wikimedia Commons PD/CC0 photographs
(`public/photos/`, ledger in `docs/PHOTOS.md`), EXIF stripped, lazy-loaded,
desaturated under the tile chrome. Two are approximate fits (flagged in
PHOTOS.md). When the operator's real images arrive: same treatment — strip
EXIF, lazy-load, keep the aspect ratios in each caption, no lightbox library —
and update PHOTOS.md.

---

## Polish

### 11. Richer transitions, slide-overs, typewriter effects

Deliberately sequenced after accounts. The constraint that makes it non-trivial:
every layout, palette and ornament has to stay visually distinct, which points at
a small set of motion primitives each layout composes differently rather than
bespoke animation per layout. **Confirm the approach before building.** The
file-explorer design in SPEC-ACCOUNTS §10 is *not* this — that is phase 2.

### 12. Content-Security-Policy

Deliberately absent. The app shell has the published site config **inlined** as a
script (`worker/site-config.ts`), so a `script-src` without a nonce plumbed
through that injection would blank the site's appearance on first paint. Worth
doing properly; not worth doing badly.

### 13. Turn on Cloudflare "Always Use HTTPS"

SSL/TLS → Edge Certificates. The Worker already redirects, so this is belt and
braces — but it happens at the edge without costing a Worker invocation.

---

## Security — found, reviewed, not fixed

The 2026-08-13 review's findings were fixed in `1729dfd` and `561e067`, and the
same day's full audit's in the security-audit commit — both recorded in
`docs/DECISIONS.md`, the audit's log in `docs/SECURITY-AUDIT.md`. Items 14 and
15 were left open deliberately, because neither is a patch: neither is
exploitable by an anonymous visitor today, and each becomes worse under a
specific future change, which is noted. Item 16 is open because it lives in the
Cloudflare and Namespro dashboards, not in this repository.

### 14. Password change is not a session-revocation event

`changePassword` and `setPassword` do not rotate or invalidate other session
cookies, and the stateless session design permits none. A stolen cookie survives
the victim changing their password, bounded by the 30-minute TTL and the 12-hour
absolute ceiling. Consistent with the no-session-table decision — but it should
be a written-down residual exposure rather than an assumption. Closing it needs
a table, so it is a design decision, not a patch.

### 15. `/api/account/slot` authorises on the session alone

**Not exploitable today**: it returns only ciphertext the server cannot open,
and unwrapping needs the password-derived wrapping key, which no session grants.
It becomes real in phase 3, where §3 requires a fresh user-verification gesture
per grant signature — a stolen 30-minute session could otherwise fetch the slot.
Add the password-proof + current-TOTP gate **before phase 3**, not with it.

### 16. DNS hardening — three dashboard changes (2026-08-13 audit)

Found by the full security audit (`docs/SECURITY-AUDIT.md` has records to paste and the order to
do them in); none can be done from this repository. In priority order:

1. **Enable DNSSEC** — Cloudflare DNS → Settings, then add the DS record at Namespro. No DS
   record exists at CIRA today.
2. **Add CAA records** — nothing restricts which CA may issue for `mcclevarty.ca`. The audit doc
   lists Cloudflare's Universal SSL set.
3. **Tighten mail records** — DMARC is `p=none` (spoofed mail is delivered, only reported) and
   SPF ends `~all`. Watch the Cloudflare DMARC reports for two weeks, then `p=quarantine` →
   `p=reject`. The domain forwards and never sends, so the only legitimate traffic at risk is the
   forwarding path — which is why this is observe-then-tighten, not a same-day edit.

---

## Unverified / unresolved

- **Matrix rain fall speed** has never been confirmed by eye. Rebuilt after the
  client said the original was far too fast, verified headlessly at 96–307 px/sec
  against the old 960. `RAIN_SPEED_MIN` / `RAIN_SPEED_RANGE` in
  `src/fx/effects.ts`.
- **Several palettes fail WCAG AA on body text.** Deliberate — Peat especially —
  with calm mode as the intended remedy. Open rather than overlooked.
- **Animation cannot be verified from screenshots here.** An occluded Chrome
  window freezes `requestAnimationFrame`. Motion needs the client's eye.

---

## Awaiting client sign-off

Found while building; none blocking. Full reasoning in `CLAUDE.md`.

1. **`totp.last_step`** is a field §9's inventory does not list, and §9 says
   adding one is a spec change. Without it a TOTP code is replayable for up to
   90 seconds. **Recommend approving.**
2. **§3's operator row is stronger than the design supports.** The Worker sees the
   raw `authSecret` on every sign-in, so an operator who logged one could grind
   candidate passwords offline. The cryptography is fine; the *unconditional*
   wording is not.
3. **`⌘K` is claimed twice** — `SPEC.md` makes it the operator door's sixth unlock
   route, `SPEC-ACCOUNTS.md` §10 makes it the command palette. Both cannot be true.
4. **Signup discloses handle availability** (409) while `challenge` goes to real
   trouble to hide it. Defensible, but the two should not disagree.
5. ~~**The findable sign-in affordance does not exist on phones**~~ — answered
   same day: the client asked for full mobile parity. The phone band now
   renders the ornament (five-tap reveal, duels and all; only Stack shows the
   slot there, by layout), and non-desk bands get a header `cmd` chip since
   the palette's typed route needs a hardware keyboard. **Unverified by eye
   on a real phone.**

---

**Starting a session?** `docs/HANDOFF.md` has a paste-ready prompt, the deploy
verification block, and the list of things that cannot be verified from this side.
