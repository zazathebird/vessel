# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are; this file is only what is left to do.

Last updated 2026-08-13.

---

## Do this first

### 1. Run the auth harness

```sh
npm run dev:worker      # wait for "Ready on http://127.0.0.1:8787"
npm run test:auth       # in a second terminal
```

`scripts/auth-e2e.ts` gained a **set-password** section on 2026-08-12 — nine
checks covering recovery→set-password — and **those checks have never been
executed.** They are committed and they typecheck, but two `wrangler dev`
instances fought over local D1 that session, the restart landed on port 8788,
and the run was abandoned. Until this passes, treat recovery-code sign-in as
written-but-unproven.

Two known snags:
- If the port is not 8787, the harness will not find the server. Kill stray
  `wrangler dev` processes first — a second instance silently takes 8788.
- `SQLITE_BUSY` / `workerd failed to start` means two instances are running.

### 2. Redeem one recovery code on the live site, once, deliberately

Nobody has ever completed the flow end to end in a browser. It spends one of ten
codes, which is why it has not been done casually. Do it after step 1 passes.

---

## Accounts (phase 1 continues)

### 3. Operator password reset in `/admin`

**Now unblocked.** It was held back because a reset with no way to set a new
password strands the account permanently. `setPassword`'s insert branch and the
`challenge` salt fallback both exist specifically to make the post-reset account
recoverable. See the note in `src/components/Admin.tsx`.

The endpoint deletes the password credential and its key slot and sets
`reset_at`. It must **never** return a key slot — §5, and `worker/admin.ts`
explains why no route hands back another account's slot.

### 4. TOTP enrolment screen

Endpoints and tests exist; there is no UI, so nobody can turn on the second
factor that sign-in already supports.

**The trap:** `api.totpEnrol()` posts `{}`, but `worker/accounts.ts` calls
`requirePassword` on it. The screen must derive and send an `authSecret` or every
call 401s. `totpConfirm` needs one too.

§4 requires the secret be shown both as a manual string and as an `otpauth://`
URI — both are already returned. No QR library (no third-party deps), so render
the string and the URI as text.

### 5. Passkeys, account/setups pages, dialog primitive, command palette

In that order. Note `⌘K` is claimed twice — see *Unsigned-off* below.

---

## The lightsword duel

### 6. Rebuild it per `docs/DUEL.md`

**Withdrawn from the effect picker on 2026-08-12**, after the client rejected the
stick-figure version: *"that is terrible"*, *"WAY too slow"*. The code survives in
`src/fx/effects.ts`; only the two `FX` entries were removed.

`docs/DUEL.md` is the full spec and should be read before writing any renderer.
Short version: the client supplied a working reference implementation, and the
idea the first attempt missed is that the fight is made of **discrete matches
with winners**, not one continuous exchange.

Build the **hero-ornament version first** — that was the original request, it is
the cheaper path (`src/data/ornaments.ts` is already a list with a share-code
field), and a small square slot is a far more forgiving canvas than a full-page
background sitting behind body copy.

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

### 10. Photo slots are still placeholders

When real images arrive: strip EXIF, lazy-load, keep the aspect ratios in each
caption, and do not add a lightbox library.

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

---

**Starting a session?** `docs/HANDOFF.md` has a paste-ready prompt, the deploy
verification block, and the list of things that cannot be verified from this side.
