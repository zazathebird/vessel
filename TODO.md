# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are, and `docs/DECISIONS.md` records what was decided when; this file is only
what is left to do.

Last updated 2026-08-14: **SPEC-ACCOUNTS phase 2 is built and harness-proven**
— machines, drives, the per-machine signalling Durable Object, the connect
ceremony, the file protocol, and the `/share` + `/machines` pages. The spec
grew §13 and §12 K–S; the harness is at **301**. Done items below are kept as
one-liners because their numbers are cross-referenced from `docs/DECISIONS.md`.

---

## Do this first

### 1. ~~Close the harness's three coverage gaps~~ — done 2026-08-13

Harness snags, still true when running it: kill stray `wrangler dev` first (a
second instance silently takes 8788); delete `dist/_redirects` or run
`npm run predeploy`, never bare `npm run build`, before `dev:worker`; the
last-operator guard check skips if a non-`harness-` operator exists in local D1.

### 2. ~~Redeem one recovery code on the live site~~ — done 2026-08-14

Driven in a real Chromium against production with a throwaway account
(`fable-check` — non-operator, left in D1; remove via `/admin` if unwanted)
so the operator's own ten codes are untouched: signup → codes shown once →
sign out → redeem code → set-password ticket → signed in, `9 of 10` left →
sign out → sign in again with the new password. `wrangler tail` ran through
the whole browse: zero CSP reports.

### 2b. ~~App-shell/UI review~~ — done 2026-08-13 (eight findings fixed)

### 2c. By eye, in a real browser (needs the client)

Everything listed under *Unverified by eye* at the bottom.

### 2d. ~~The HUD pass~~ — built 2026-08-14; its four open calls decided the same day

The layout upgrade and the three presets are in and the build is clean.
The client handed over the four judgement calls ("do what is graphically the
best"); all four are decided and `docs/DECISIONS.md` 2026-08-14 has the
reasoning and the measurements. In short:

- **The contact sheet's duotone stays in calm — at the full 22%**, not the
  halved 10% it shipped with. Measured: over a tile image that is itself
  `opacity: 0.8` on a dark card, a 10% colour blend is invisible, so the
  half-measure was defending an effect nobody could see. The `.is-calm`
  override in `layouts.css` is deleted rather than retuned.
- **Presets stay operator-only.** A visitor's only appearance control today is
  the calm toggle — the shuffle, every picker and `.v-paste` are all gated, and
  "Show me something weird" navigates to the gallery rather than rolling. Public
  presets would be the site's first public appearance control.
- **The two duel backgrounds are re-listed** (see 6b).
- **`fxlab.html` is kept, `?site=` is not** (see the bench note below).

**The effects bench**: `fxlab.html` at the project root, opened at
`http://localhost:5173/fxlab.html` with `npm run dev` running. All sixteen
effects on one page, driven through `FxCanvas`'s exact frame maths from an
explicit **Step** button rather than rAF — which is why it works in a hidden or
occluded tab, the thing that blocked three sessions. It cannot reach production:
Vite's only build entry is `index.html`, verified by building. Do not add it to
a multi-page `rollupOptions.input`.

~~**Cannot be verified from this side**: the canvas effects.~~ **Done
2026-08-14.** All sixteen were rendered and looked at, at two viewport sizes and
two palettes, plus `hud`+`scan`, `hud`+`telemetry` and `terminal`+`rain` on the
real site. Circles are round; `plasma`'s grid arrives at ~58 columns across 1526
CSS pixels, so the per-frame `setTransform` is handing effects CSS pixels and not
device pixels. `scan` and `telemetry` read as intended.

Two things worth knowing for the next person who tries: nothing is visible unless
the tab is visible **and** calm is off. The verification browser reports both
`document.hidden` *and* `prefers-reduced-motion: reduce`, and calm hides the
canvas — that second half is why this looked unverifiable twice.

It found one real bug, in the default effect: `vessels` never rebuilt its tree on
a resize, so after a window resize the trunk sat off-centre and the side branches
floated detached in mid-page. A regression from the buffer change (before it,
`w`/`h` were constant). Fixed — `docs/DECISIONS.md` 2026-08-14 has the reasoning.

---

## Accounts

### 3. ~~Operator password reset~~ — done 2026-08-13
### 4. ~~TOTP enrolment screen~~ — done 2026-08-13
### 5. ~~Passkeys, saved setups, dialog primitive, command palette~~ — done 2026-08-13

`⌘K` stays unbound (claimed twice — sign-off list); the palette opens by
typing `cmd`.

### 5b. Phase 2 — ~~plumbing and interface~~ — built 2026-08-14

Spec §13 and §12 K–S; migration `0004`; `worker/machines.ts` + the
`MachineSignal` DO; `src/share/*`; `/share` and `/machines` pages (typed
routes `share` / `machines`, linked from the `/signin` summary). Harness
drives every route, the ceremony crypto, and the path validator — the WebRTC
hop itself needs two real Chromium tabs, which is the client's walk-through.
Remaining inside phase 2:

- ~~**Grid and Column explorer modes**~~ — done 2026-08-14 (view switcher
  remembered per drive under `vessel.explorer.v1`, palette-drawn SVG file-type
  icons, Miller columns with cached panes, §10 progress wash, sortable List
  headers; calm collapses to List). Still inside §10 and deliberately
  deferred: **image thumbnails from actual bytes** — reading whole files over
  the channel to decorate a grid wants the phase-3 read-cap conversation
  first, so tiles use the drawn icons for now.
- **TURN** — mechanics specified (§12 P), enablement is a client spend
  decision; without it a hard-NAT pair fails with an honest message.
- **The Pi sharing host** (`docs/pi-sharing-host.md`) can now point its final
  step at `/share`.

### 6. ~~Lightsword duel rebuild~~ — ornament home done 2026-08-13

- **6b. ~~Un-hide the background `FX` entries~~ — done 2026-08-14**, on the
  client's handover of the four design calls. It was deleting two `hidden: true`
  flags, exactly as promised; indices 12 and 13 never moved. Both render and
  read correctly at background scale (checked in `fxlab.html`). Low risk because
  every surface reading `PICKABLE_FX` is operator-gated: no visitor gains an
  effect, and one only ever sees a duel if the operator publishes it.
  `PICKABLE_FX` now equals `FX` — keep both anyway; the flag is the mechanism
  for withdrawing an effect without moving anyone's share code.

- **6c. ~~Screensaver attract mode~~ — done 2026-08-14** (client request). The
  screensaver was already "the configured effect, alone, boosted" — it has no
  rendering of its own, so the client's "make the screensaver do the lightsword
  fight / the matrix rain" was live the moment the duels were re-listed. What
  was missing is that the duel stayed at *background* settings while asleep.
  It now eases to ~1.4× scale, `dim` 1 and health bars over the same 1.6s the
  chrome takes to fade, via `Frame.sleeping` and `DuelView.barAlpha`.

  **Unverified on the live site, deliberately said so**: the sixty-second path
  cannot be driven from here — the timer runs in a hidden tab but the render
  loop correctly parks, so the blend advances a frame or two per screenshot and
  never visibly grows. The ease itself was driven end to end on `fxlab.html`
  (its **screensaver** checkbox), which runs the identical code.

  **Still wants the client's eye**: the fighters are centred with their feet at
  80% height, which on Cinematic at a short viewport sits them behind the hero's
  CTA row. Attract mode does *not* address this — that is the non-attract state.
  Recommendation on 2026-08-14 was **leave it**: the effect is operator-opt-in,
  the screensaver is now the showcase so the in-page state can afford to stay
  recessive, and the collision depends on viewport height *and* where the
  fighters are in the match, so a fixed offset trades one layout's collision for
  another's. Flagged in `src/fx/effects.ts`.

### 7. ~~Sound~~ — built 2026-08-14. All three parts it was flagged as needing:

- **Control**: a `sound` chip in the header beside `calm` (hidden in calm, which
  silences audio anyway), plus the siteconfig panel and the command palette.
- **Persisted toggle**: its own key `vessel.sound.v1`, written only by the three
  deliberate toggles — calm's exact pattern, and now calm's exact rule. See
  `loadConfig`: the stored fields are the ones a visitor can set for themselves,
  and there are exactly two.
- **Share-code field**: **bit 16 of the existing toggle bitfield**, not a seventh
  field. Every code already minted has it clear, which decodes as sound off.

Synthesised in `src/audio/engine.ts` — oscillators and envelopes, no files, so
`SPEC.md`'s *Assets* rule holds. Pitch comes from the palette, so changing
palette retunes the site. Nothing plays without a gesture: no ambient bed, no
loop, no timer, and no `AudioContext` until the first voice.

**One thing for the client**: `sound` is publishable, so you *can* ship the site
with it on. Recommendation is don't — publishing calm makes the site gentler for
everyone and publishing sound makes it louder for everyone. A visitor's stored
preference always beats the published value, in both directions, so nobody is
ever stuck with it.

Not built, and a deliberate stopping point: **no ambient/generative bed**. That
is a different feature with different autoplay and taste problems, and this one
is interface feedback.

---

## Content and copy

### 8. Edit mode — operator-editable copy/images. Large; blocked on the images
spec change (R2 or similar).
### 9. ~~A setup guide page~~ — built 2026-08-14 as `/setup`, "Let me look from here."

Scope agreed with the client: **remote access before a callout** — the page you
send someone so the fix does not need a drive. A page, not a download: a page
needs no file asset, works everywhere, and the visitor can still print it.

Order is deliberate. **Windows Quick Assist leads** because for a one-off look
"already on your machine, nothing to install, gone when you close it" beats an
account signup. **Tailscale is the standing option** for machines the operator
is in repeatedly, and is described honestly as what it is — a private link, with
screen sharing running *inside* it, not screen sharing on its own. Then what the
operator can see, how to turn it off, and a **scam-awareness block**, which was
not in the brief: a page telling people to install remote-access software is
exactly the page a scammer wants them to have read.

A **footer** page beside Now and Changelog, not a seventh nav pill — the six are
a settled design, and `NAV` is what `useOperatorRoutes` cycles and Radial's orbit
renders. Tailscale is named in prose, not linked; the site has no outbound links.

**It moved one word of protected copy**: the 404's "eight other pages" → "nine".
Those counts are jokes that depend on being true. Recorded in `CLAUDE.md` under
*Copy changes*. **Adding another content page moves it again.**
### 10. Photo slots hold Wikimedia placeholders (`docs/PHOTOS.md`); swap for
the operator's own when they exist, same treatment (EXIF stripped, lazy,
desaturated).

---

## Polish

### 11. Richer transitions/slide-overs/typewriter — after accounts; confirm
the motion-primitives approach before building.
### 12. ~~CSP~~ — nonce plumbed and shipped **report-only** 2026-08-14
(`cspPolicy` in `worker/index.ts`; reports to `/api/csp-report`, logged in
`wrangler tail`, stored nowhere). Remaining half: **flip to enforcing** — one
header rename in `harden`.

**Measured against production 2026-08-14, and the blocker list is now one item,
not four.** Session notes in `docs/DECISIONS.md`; in short:

- **The reporting pipeline is proven end to end** — browser → Reporting API →
  `POST /api/csp-report` → a log line in `wrangler tail`. It had never actually
  been seen working. **Reports arrive ~55s late** (the `age` field said 55218ms):
  "nothing in the tail after ten seconds" is not evidence of anything, and that
  is almost certainly why this looked untestable.
- **The public site runs quiet.** Zero violations across all nine content pages
  plus `/signin`, `/signup`, `/machines`, `/share` and a genuine 404, with calm
  **off** so the canvas renders and sound **on** so the AudioContext is built.
  Zero Worker exceptions.
- **Three of the four surfaces close by inspection rather than observation.**
  Passkeys: `navigator.credentials.*` is not a CSP-governed fetch. TOTP
  enrolment: there is no QR code at all, just text and an `otpauth://` link — no
  image, no library, no external fetch. Canvas effects: pure 2D canvas, and
  `src/` contains no `eval`, no `new Function`, no `dangerouslySetInnerHTML` and
  **no external origin at all**. The phase-2 signalling socket is
  `wss://mcclevarty.ca`, explicitly allowed, and STUN via `RTCPeerConnection` is
  not covered by any shipped fetch directive.
- **What is left is one line**: `saveBlob` in `MachinesPage.tsx` builds
  `<a href="blob:…" download>`. A probe confirmed **`blob:` is not in the policy**
  — `connect-src` and `img-src` both reject it — but a `download` anchor is not
  governed by fetch directives, so it is *probably* fine. Probably is not good
  enough when being wrong means the operator silently loses file downloads.

**So: flip after one real download in the two-tab test**, and not before. That
test is already owed. `blob:` was deliberately **not** added to the policy —
it would not protect the anchor path anyway, and widening a security policy for
an unbuilt feature is backwards. It *will* be needed in `img-src` when the
deferred "thumbnails from actual bytes" lands (5b).
### 13. Cloudflare "Always Use HTTPS" — dashboard toggle, belt and braces.

---

## Security — found, reviewed, deliberately open

### 14. Password change is not a session-revocation event. Bounded by the
30-minute TTL / 12-hour ceiling; closing it needs a session table (design
change, not a patch).
### 15. ~~`/api/account/slot` authorises on the session alone~~ — password-proof
gate done 2026-08-14 (`assertPassword`, rate-limited; harness 258 → 260). The
TOTP half deliberately did **not** land there: the slot bytes are identical
whatever the caller intends, so a code requirement on that endpoint cannot
tell §12 K's password-only connect from §3's sign gesture — an attacker would
claim the weaker purpose. **The fresh-TOTP check moves to the phase-3
grant-submission endpoint**, which sees the signed grant itself; build it
before anything accepts a real grant. `docs/DECISIONS.md` 2026-08-14.
### 16. DNS hardening, in the dashboards (2026-08-13 audit; records in
`docs/SECURITY-AUDIT.md`). **Live state re-checked 2026-08-14:**

- **DMARC already exists** and is not a record to create — the client offered to
  have one made, and there is one:
  `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net;`. The pending
  work is **escalating** it, `p=none` → `p=quarantine` → `p=reject`, and the
  audit is explicit that this must not happen until a couple of weeks of reports
  have been read. **`mcclevarty.ca` forwards mail** (`MX → mailroot8.namespro.ca`)
  and forwarding is precisely what strict SPF/DMARC breaks, so escalating blind
  risks quarantining the operator's real mail. Same reason SPF stays `~all` for
  now. This is a read-the-reports task, not a typing task.
- **CAA: still none** (confirmed by query). The one item here that is a pure
  addition. `docs/SECURITY-AUDIT.md` §8 has Cloudflare's documented set verbatim.
  **Risk if done carelessly**: a CAA set that omits a CA Cloudflare actually uses
  makes certificate *renewal* fail silently, weeks later. The dashboard validates
  the set against its own issuance; the API does not.
- **DNSSEC: still no DS record.** Needs Cloudflare to generate it *and* the
  registrar (**Namespro**) to publish it — the registrar half cannot be done from
  here at all.

**Nothing here is reachable from this machine**: the wrangler OAuth token carries
`account (read)` and `zone (read)` only, no `dns_records (write)`. Doing any of
it needs either the dashboard or a scoped API token.

---

## Unverified / unresolved

- **All of phase 2 by eye**: pairing, drive picking, the agent tab's states,
  a real two-tab WebRTC browse and download, offline/re-attach/take-over
  flows, the `/machines` explorer — now including the Grid and Column modes,
  the icons, the wash, and the column slide (2026-08-14, unseen). The harness proves every route and the
  ceremony's bytes; it cannot run `RTCPeerConnection`.
- **Matrix rain fall speed** — rebuilt, never confirmed by eye.
- **Several palettes fail WCAG AA** — deliberate; calm mode is the remedy.
- **Animation cannot be verified from screenshots here** — occluded windows
  freeze rAF; motion needs the client's eye.

---

## Awaiting client sign-off

Found while building; none blocking. Reasoning in `CLAUDE.md` unless noted.

1. **`totp.last_step`** — a field §9's inventory does not list. Without it a
   TOTP code replays for up to 90s. **Recommend approving.**
2. **§3's operator row is stronger than the design supports** — the wording,
   not the cryptography.
3. **`⌘K` is claimed twice** — door (SPEC.md) vs command palette
   (SPEC-ACCOUNTS §10).
4. **Signup discloses handle availability (409)** while `challenge` hides it.
5. **TURN**: enable Cloudflare TURN (per-byte spend, short-lived credentials
   already specified) or leave hard-NAT pairs with the honest failure (§12 P).
6. **Contact-page email** (`src/data/mail.ts`): the site assembles
   `patrickmcclevarty@outlook.com` (verbatim from the spec) but the address on
   file is `…@hotmail.ca`. Contact is the one page with a job — confirm the
   mailbox is real and read. (Carried from the 2026-08-13 full review.)
7. **Per-account subdomains: wanted at all?** If yes, an Origin allowlist must
   land first (`design/GUIDE-SUBDOMAINS.md`); if no, the guide can be closed.
8. **When to retire the Pages project** — it is the rollback; retiring it
   deletes the `_redirects` trap class.
9. **Free-diagnostic copy rewrite** — client leaning yes; wording and any fee
   pending.

---

**Starting a session?** `docs/HANDOFF.md` has a paste-ready prompt, the deploy
verification block, and the list of things that cannot be verified from this side.
