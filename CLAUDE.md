# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file holds invariants — things that are true now and that a future reader could plausibly
"fix" back into a bug.** Dated history lives in `docs/DECISIONS.md`; the ordered backlog lives in
`TODO.md`; how to start a session and verify a deploy lives in `docs/HANDOFF.md`. If this file and
`TODO.md` disagree, `TODO.md` is newer.

## The project

"Vessel" — a personal site for an independent computer repair operator, built from a complete
design handoff. React 18 + Vite + TypeScript, served by a Cloudflare Worker.

```sh
npm run dev          # Vite dev server on http://localhost:5173 — no API
npm run dev:worker   # full stack: Worker + API + local D1, on http://127.0.0.1:8787
npm run build        # typecheck + production build
npm run typecheck    # types only, app and worker
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run deploy       # build, strip dist/_redirects, publish the Worker
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — see *Deployment*.

The only tests are `scripts/auth-e2e.ts`, which drives the real `src/auth` modules against a live
Worker and local D1 and prints its own check count on completion. There is no test suite for the
site itself.

No runtime dependencies beyond React — the routing, state, styling **and authentication** are all
hand-rolled, deliberately (see *Assets* in the spec: no third-party libraries, no webfonts, no
images).

## The spec is authoritative

- `design/SPEC.md` — final copy, tokens, layouts, motion timings, product decisions
- `design/SPEC-ACCOUNTS.md` — accounts and brokered drive access. **Approved 2026-08-12**, not a
  proposal. §12 is its decision log
- `design/prototype.html` — an **executable** spec. It genuinely runs; every feature described in
  SPEC.md works in it. Open it in a browser and use it rather than guessing at behaviour. It pulls
  React and Babel from unpkg at load, so it needs network access
- `design/support.js` — the prototype's own renderer. **Do not port it and do not read it for design
  intent.** It is scaffolding
- `design/rejected-kaleidos.html` — an earlier direction that was rejected. Context only
- `design/GUIDE-SUBDOMAINS.md` — how to add a page, and what per-account subdomains would break

Fidelity is high: every hex value, duration, and easing curve in the spec is intended, not
approximate. The deliberate exceptions are photo slots (placeholders, real images don't exist yet),
operator authentication (theatre — see below), and the items under *Known deviations* below.

### Finding things in the prototype

`design/prototype.html` is one file: a `{{ binding }}` template inside `<x-dc>`, then a
`class Component extends DCLogic` (a React class component) inside `<script type="text/x-dc">`.
That format is prototype scaffolding — recreate the *behaviour*, not the shape.

Copy these verbatim rather than retyping or paraphrasing:

| Line | What |
|---|---|
| 288 | `PALETTES` — 24 palettes × 9 roles → already ported to `src/data/palettes.ts` |
| 315–348 | `LAYOUTS`, `FX`, `TYPESETS`, `MODES`, `SCOPES` → `src/data/catalog.ts` |
| 351 | `BAD` + `LOWCONTRAST` guardrails → `src/data/guardrails.ts` |
| 366 | `PAGES` — the nine content pages' final copy → ported to `src/data/pages.ts` (with the one approved copy correction below) |
| 710 | `scramble()` — the title assembly, and its timing trap |
| 823 | `startFx()` — all twelve canvas effects |
| 1029 | `renderVals()` — where layout, band, and calm collapse into concrete styles |

## Architecture

State lives in one place. `src/config/ConfigContext.tsx` owns the persisted `Config` and exposes
`update`, `go` (navigation), `shuffle`, the current `band`, the adapted `layout`, and `say` for
toasts. Components read tokens, not props.

`src/theme.ts` is the seam: it collapses palette + typeface + layout + band + calm into CSS custom
properties on one wrapper element, plus class names (`layout-*`, `band-*`, `is-calm`) that CSS
branches on. **No component should contain a literal colour** — a palette change has to be a
variable swap, which is what makes the 0.9s palette bleed work.

Per-frame values (mouse position, scroll velocity, card element list, keystroke buffer, drag origin,
scramble token) belong in refs, outside React state. The spec is explicit about this.

`src/App.tsx` is the real shell. The three overlays (panel, door, screensaver) are siblings of
`.v-chrome` rather than children, because the screensaver fades the chrome to `opacity: 0` with
`pointer-events: none` and must not take the panel or the door with it.

**The panel and the door are operator-only**, gated once at `openDoor` / `togglePanel` in
`ConfigContext` rather than at each of the six unlock routes — a route added later inherits the
gate instead of needing to remember it. `isOperator` is false until the session probe settles, so
the door cannot flash open on load. Losing `isOperator` force-closes both. `SPEC.md` describes
`authenticate` making the `siteconfig` button appear permanently for anyone; that is the
prototype's behaviour and no longer the site's. **The door itself is still theatre** — it guards a
settings drawer and nothing else.

### The two halves of published site config

- `worker/site-config.ts` writes `window.__VESSEL_SITE__` into the app shell's `<head>` with
  HTMLRewriter, before the bundle loads.
- `src/config/siteConfig.ts` is the client half: `publishedConfig()` reads that global
  **synchronously during the first render**, which is the whole reason it is not a fetch —
  `ConfigContext` builds its initial state in that render so there is no flash of the default
  palette, and a fetch would put a 0.9s bleed from Nebula Drift to the real palette on every cold
  load. Absent or malformed, it returns null and the built-in defaults render.

`loadConfig` validates the published payload field by field, exactly as it always validated stored
config. A published layout id that no longer exists would otherwise render an unstyled page for
every visitor at once.

### Session and account routing

- `src/auth/SessionContext.tsx` — who is signed in. **Deliberately separate from `ConfigContext`**,
  which §11 requires stay synchronous and gain no fetching. Everything gated on it starts hidden
  and appears when the answer arrives.
- `src/hooks/useAccountRoutes.ts` — the unlinked routes to the account pages: type `whoami`,
  `login` or `admin`, or drag the page **left** past 260px, mirroring the door's rightward drag.
  **These never call `openDoor`.** Since 2026-08-13 there is also one *findable* affordance
  (client request): five taps on the hero ornament (`Ornament.tsx`) reveal a sign-in link in the
  footer for the rest of the visit (`signinShown` in `ConfigContext`) — the account side's mirror
  of the logo's five taps, and like every account route it navigates rather than unlocking
  anything. Radial's orbit pills share the ornament's slot; their clicks are excluded from the
  count.
- `src/hooks/useOperatorRoutes.ts` — the door's six routes, and arrow-key page cycling over `NAV`.

Both keystroke hooks carry an `isEditable` guard: without it, typing in an account form pages the
site on arrow keys and opens the door on `sudo`.

### The interaction stylesheet

`src/styles/interaction.css` is the fifth stylesheet and owns **every** hover, press and disabled
state. It exists because the site had two requirements fighting over the same CSS properties: the
palette bleed needs colour to cross-fade over 0.9s, and pointer feedback needs to land in ~140ms.
Before it, all sixteen transitions in the codebase ran at 0.9s and there was not one `:hover`,
`:active` or `:disabled` rule anywhere — which was the direct consequence, not a coincidence.

The split is **by property, not by selector**: colour properties belong to the palette at 0.9s,
`translate` and `scale` belong to interaction at 140ms/90ms. Nothing in the interaction layer animates
a colour and the palette never animates a position. Two things follow that are easy to undo by
accident:

- **Use `translate` / `scale`, never `transform`.** They compose independently, and `transform` is
  reserved for the cursor-lean that `useMotionSystems` writes to `.v-block`'s style attribute.
- **Selectors are prefixed `.vessel` to reach 0-2-0**, so they beat the 0-1-0 rules in `chrome.css`
  and `overlays.css` on specificity rather than on import order. Dropping the prefix silently
  reinstates the 0.9s hover.

`box-shadow` is the one property both systems want and it is given the fast timing deliberately; the
cost is documented at the top of the file.

Two CSS gotchas that have already bitten once each, both worth knowing before editing styles:

- **`band-*` and `layout-*` are on the same element.** `.band-phone .layout-stack` matches nothing;
  it has to be `.band-phone.layout-stack`. Every phone override was silently dead until this was
  found — and phones collapse almost everything to Stack, so it was the main phone path.
- **`.v-block` uses `animation-fill-mode: backwards`, not `both`.** An animated declaration outranks
  the style attribute, so a forwards fill would leave `v-rise`'s `transform: translateY(0)` owning
  the card for ever and the cursor-lean tilt — which is written to `el.style.transform` — would
  never render. The stagger only needs the from-state held during the delay.

## Constraints that are decisions, not oversights

The spec's *Product decisions already made* table is binding — do not revisit without asking. The
ones most likely to be "fixed" by accident:

- **No city is ever named.** Service area is deliberately vague. No client names on Work
- **The email never appears in static markup.** Assembled at runtime from parts, click-to-reveal,
  copies to clipboard on reveal, resets to unrevealed on page change
- **Guestbook has no form.** "A form is a database is a liability"
- **The operator door and its `authenticate` button are theatre** — no backend, no real auth. Keep
  it guarding nothing but a settings panel, and never present an unlock route as security
- **The self-deprecating copy is the point.** The site openly admits it is unnecessary. Do not
  rewrite it to sound more professional
- **Calm mode is a second full aesthetic**, not a degraded first one, and it is the accessibility
  escape hatch for the deliberately low-contrast palettes
- **Contact is the only page with a job.** It must work correctly at every stage of the build

## Implementation traps

- **Title scramble**: the resolved h1 is the default state and the scramble decorates it. Drive it
  from `requestAnimationFrame` against a `performance.now()` deadline (550ms) — never a frame
  counter or `setInterval`, or a throttled background tab strands the headline in garbage
  permanently. Each run carries a token so a superseded run cannot clear the live one's timer
- **Time-of-day randomiser** must not fire on a first visit; Nebula Drift wins on load. Handled in
  `ConfigContext` via `hasVisited()`
- **Persistence** is validated field by field in `src/config/persistence.ts`, not trusted. A stored
  layout id that no longer exists would otherwise render an unstyled page forever
- **Calm is the one stored field `loadConfig` reads back** (2026-08-13), under its own key
  (`vessel.calm.v1`), written only by the three deliberate calm toggles. It is the accessibility
  escape hatch and must survive reload for visitors. Do not read it from the full-config echo
  `saveConfig` writes — that would freeze whatever was published on the first visit — and do not
  extend the carve-out to other fields: everything else stays published-only
- **The calm/404 `filter` lives on `.vessel`'s children, never on `.vessel`** (`base.css`). A
  filter on the wrapper makes it the containing block for every fixed-position overlay, which in
  Terminal (document scrolls) re-anchors toasts and scrims to the document instead of the viewport
- **Focus traps stack, and dialogs + the command palette are *modal*** (`useFocusTrap`'s
  `isModalOpen`): the global key and drag routes stand down under an open modal, its Escape
  handler stops propagation so one press closes one layer, and only the top trap handles Tab. The
  panel and door are deliberately **not** modal — `sudo` with the panel open opens the door
- **Adapted layouts**: the operator's stored layout is **never overwritten** when a small screen
  collapses it — it re-emerges when the window widens. That state is now surfaced **nowhere**:
  `SPEC.md` puts a ` · adapted` suffix on the hero metadata strip, and the strip was removed
  (deviation 8 below). Deliberate. If it needs to return it wants its own affordance rather than
  the whole readout coming back
- **Routing**: the prototype swaps pages in place with no URL change. That is a prototype
  limitation, not a design decision — **twelve** real URLs are wired in `src/data/pageIds.ts`: the
  spec's nine content pages plus `/signup`, `/signin` and `/admin`
- **The 404 pill left the public nav on 2026-08-13, by client decision.** "404 genuinely in the
  nav" was the spec's joke; the client pulled it behind sign-in. It now leads `OPERATOR_NAV`
  (404 / Account / Admin), the operator-only tabs the header appends for a signed-in operator,
  plus a Config tab that toggles the panel. `OPERATOR_NAV` is deliberately not part of `NAV`:
  `useOperatorRoutes` cycles `NAV` and Radial's orbit renders `NAV`, so the tabs change neither.
  The 404 *page* still renders for anyone at an unknown URL — only its advertisement moved. The
  panel's **Leave operator mode** button (same day) is the counterpart: it signs the session out,
  which collapses the tabs, the panel and the door in one motion, and clears `unlocked` so the
  header's siteconfig button retires with them
- **Share codes are base-36 and `FX` order is a wire format.** Effect index 12 is `C`, not `12`;
  `0-0-12-0-7-0` parses `12` as 38, falls through `FX[38] ?? FX[0]` and applies Vessels, which
  looks exactly like a failed deploy. Append to `FX`, never insert

## Known deviations from the prototype

All deliberate. Add to this list rather than silently diverging.

1. **Guardrail evaluation** (`src/data/guardrails.ts`). The prototype's `ok()` tests each clause
   independently, so `{ type:["editorial"], pal:["datamosh"] }` rejects *every* Editorial config
   rather than only the Editorial+Datamosh pairing — Editorial can never be rolled. The spec says
   "Editorial type may not pair with the Datamosh palette", so a rule here matches only when all its
   clauses match. Every other rule behaves identically under both readings.
2. **Focus-visible styles** exist in `base.css`. The spec lists their absence as a gap to close, not
   a design decision.
3. **Magazine's h1 minimum is `46px`**, the spec's value, not the prototype's `40px`. The spec is
   authoritative on every other measurement, so it is here too.
4. **Matrix rain is rebuilt, at the client's request** (`src/fx/effects.ts`). The prototype moves a
   whole 16px cell per frame — about 960px/s — and fakes trails by overdrawing the background, so
   every stream shares one speed and one endless tail. Each column now owns its speed, trail length
   and glyphs; the trail is drawn explicitly so the leading glyph can be near-white with the body
   falling away behind it; glyphs are mirrored half-width katakana and mutate in place. Colour is
   still entirely from the palette (`fg` lead, `a1` body), so it recolours like everything else.
5. **"Breathing" does something.** The prototype stores the toggle and defines a `v-breathe`
   keyframe, but never attaches it, so the control is inert. It now drives the vignette at the
   valve's 4.6s rhythm — no reflow, no text resampling, no scrollbar from a scaled column.
6. **Contact's primary CTA reveals the address** instead of navigating to the page it is already on,
   where the prototype leaves it doing nothing. Contact is the one page with a job.
7. **The hero ornament is a setting, not a fixture** (`src/data/ornaments.ts`). The spec ships only
   the valve, and the client's objection to it was specific and right: `v-dilate` scales the rings
   as well as brightening them, so the whole assembly physically pumps and reads as a speaker cone.
   There are now seven — **Lens** (the default: a recessed eye where the geometry is dead still and
   only the light moves), Valve (unchanged), Aperture, Orrery, None, and (2026-08-13) the two
   **lightsword duels** from `docs/DUEL.md`, the only canvas ornament
   (`src/components/DuelOrnament.tsx`) — pickable in siteconfig, rollable under a sixth `ornament`
   scope, and carried as a sixth share-code field. All seven sit in one square slot (`.v-ornament`),
   so the layouts that resize it and the ones that hide it need no knowledge of which is showing,
   and Radial's orbiting nav pills work over any of them. The duels' `FX` background entries remain
   withdrawn until the client's eye passes the ornament — see `TODO.md` 6b.

   Two consequences worth knowing: `SCOPES` now has six entries, not the spec's five; and share
   codes are six fields, with five-field codes still decoding and simply leaving the ornament alone.
   The siteconfig panel therefore has an **Ornament** section the spec's list does not mention.
8. **The hero vitals strip is removed**, at the client's request (`fa95fba`, 2026-08-12). The
   palette name, layout name, effect name and `pulse 47 bpm` were a readout of state nobody asked
   to see — *show the layout, do not caption it.* The 404's `pressure lost` variant and the
   ` · adapted` suffix went with it; see the adapted-layouts trap above for what that costs.
   `docs/DECISIONS.md` has the full note.

## Copy correction, approved by the client

The home page's third block is stale from v1: it reads "Twenty-four palettes, eight layouts" and
lists "8 layout archetypes", but v2 ships thirteen. **The client has confirmed the full option set
stays and the copy gets corrected.** In `src/data/pages.ts`, the `home` block with
`kicker: "the site"` reads:

- title: `Twenty-four palettes, thirteen layouts`
- list item 2: `13 layout archetypes`

Body text and the other three list items are unchanged. This is the **only** stale count in the
copy — the 404's "eight other pages" (nine content pages minus itself), "six ways into a panel"
(six unlock routes), "24 colour palettes", "12 background modes" and "5 type systems" are all
correct. Every other line of copy is verbatim-only.

## Accounts — the invariants

`design/SPEC-ACCOUNTS.md` is approved and authoritative. Read it before touching any of this. §12
is a decision log: every rejected option keeps its reasoning and carries a *"revisit if"*
condition. Add to it rather than relitigating.

The design decisions most likely to be broken by someone who has not read it:

- **Sign-in is password + TOTP, with passkeys retained** as an alternative credential. **No email
  is collected**, and the operator can reset any password — which is what makes email unnecessary.
- **Key slots (§5) are the load-bearing idea.** One grant keypair per account, wrapped once per
  credential, LUKS-style. Any credential opens the same key. This is why operator reset is safe: it
  deletes the password slot and cannot open it. **Operator escrow is rejected permanently** — a slot
  wrapped to an operator key would let the operator sign grants in a user's name, which is the exact
  thing the design exists to prevent.
- **The password never reaches the server.** The browser runs PBKDF2 and sends a derived auth secret;
  the Worker stores only an HMAC of that under a pepper. Do not "simplify" this into a server-side
  hash — it also dodges the Worker CPU cap, and the browser must derive a password key anyway to open
  its key slot.
- **No personal data, and §9 has the full inventory** so the claim can be checked. Three fields were
  removed on 2026-08-12 for carrying personal data nobody chose to collect: `drives.root_path` (held
  `C:\Users\Patrick\Documents`), hostnames as machine names, and raw IPs in rate limiting. Absolute
  paths now live only in the sharing tab; grants scope by relative subpath. **Adding anything to that
  inventory is a spec change, not an implementation detail.**
- **Phases 1/2/3 must not be collapsed** — phase 2 fails as "my files don't load", phase 3 as "a
  stranger read my files."
- **Authentication works end to end before any interface work starts.** Building the command palette
  on a sign-in that does not work is how the fun part ships and the load-bearing part does not.
- Real auth **must not reuse the operator door's UI** (`SPEC.md` §Security). The door stays theatre.

### Where the code is

- `migrations/` — `0001` phase 1 tables, `0002` TOTP replay, `0003` site config. Machines, drives,
  grants and invites are deliberately absent: an empty `grants` table is an invitation to fill it
  before the phase that hardens it.
- `worker/index.ts` — serves the static site via the assets binding; `/api/*` is the exception.
  Delete every route and the site serves as it does today, which is what "accounts are strictly
  additive" has to mean.
- `worker/accounts.ts` — signup, challenge, sign-in, the TOTP second factor, sessions, key slots,
  change/set password. `worker/session.ts`, `worker/totp.ts`, `worker/crypto.ts` are its primitives;
  `worker/admin.ts` is the operator surface; `worker/site-config.ts` the published appearance.
- `worker/rate-limit.ts` — the `RateLimiter` Durable Object. Counts failures only, resets on
  success, exponential backoff to a **one-hour ceiling**; the ceiling stops an attack on a known
  handle from becoming an indefinite lockout of its owner. Never sees an IP.
- `src/auth/` — the browser half: `derive.ts` (PBKDF2 → HKDF split into an auth secret and a
  wrapping key), `grantKey.ts` (the P-256 grant key and its AES-KW slots), `recoveryCodes.ts`,
  `api.ts`, `flows.ts`, `passkeys.ts` (WebAuthn flows behind an injectable `Authenticator` seam),
  `SessionContext.tsx`.
- `worker/webauthn.ts` — the hand-rolled CBOR subset and ES256 verification §1 budgeted;
  `worker/passkeys.ts` — the passkey routes. `scripts/webauthn-sim.ts` is the harness's software
  authenticator: it *encodes* the CBOR/DER the Worker *decodes*, independently, as a second
  opinion.
- `scripts/auth-e2e.ts` — the harness. It imports the real `src/auth` modules — including
  `flows.ts` and `api.ts`, driven through a fetch shim that intercepts **only relative URLs**, so
  the raw `Client`'s cookie isolation survives — so it fails if browser and Worker ever disagree
  about a byte, and it computes TOTP codes independently from RFC 6238 rather than calling
  `worker/totp.ts`. Its `d1()` helper shells out to wrangler **asynchronously on purpose**: a
  blocking `execSync` stops undici noticing closed keep-alive sockets and the next fetch dies with
  a phantom "could not reach the server". Its last section exercises the `RateLimiter`'s backoff
  path.

### Things that are decisions, and are easy to "fix" back into bugs

- **`recordSuccess` resets the account bucket and only *decays* the client bucket** by one
  (`rate-limit.ts` `/succeed`). Wiping the client bucket on success hands an attacker a free reset:
  sign in to an account you own, and the counter recording your failures against everyone else's
  goes to zero. Client allowance is 50 and account allowance 5 because one address is a household
  behind NAT and five would lock out a café over one typo. **Signup has a third bucket**
  (`signup:`, allowance 12 — 2026-08-13 audit): the client bucket alone let one address mint fifty
  accounts per window. Twelve is sized just above the e2e harness's eight signups per run — shrink
  it and the harness locks itself out.
- **Rate limiting reserves and checks in one round-trip** (`assertAttempt` → `/attempt`). `/check`
  then `/fail` was two, so N concurrent sign-ins all passed the check before any failure landed.
  **`challenge` deliberately stays on `/check`**: asking for a salt is not a failable attempt, and
  counting it would let anyone lock an owner out.
- **The rate limiting lives inside `assertPassword`, not in its callers.** Two callers had none and
  left an unthrottled online password oracle usable by anyone holding a session obtained *without*
  the password. Putting the counting inside the check means a future caller cannot forget it.
- **`challenge`'s decoy reports `DEFAULT_ITERATIONS`, the real constant.** A varied decoy was the
  tell, not the disguise — see `docs/DECISIONS.md`. When real iteration counts start varying,
  sample the decoy from the same distribution.
- **`challenge` takes the salt from any credential that has one**, preferring the password row for
  its iteration count. Keyed on `kind = 'password'` it dropped an operator-reset account through to
  the decoy branch and handed back a fabricated salt, turning a working recovery code into a wrong
  one. This is what makes operator password reset safe to build.
- **A redeemed recovery code returns its key slot in the sign-in response**, and the slot row is
  *kept*, not deleted. The wrapping key exists only for that request — the code is spent — so a slot
  not handed back is a grant key sealed for ever, which would quietly make §5's "preserves grant
  authority in full" false. `signInWithRecoveryCode` unwraps it before returning.
- **A recovery code is not marked used until the sign-in completes.** With two-factor on, the ticket
  carries the pending credential id. Spending it earlier would burn one of ten codes per abandoned
  attempt, for the person recovery exists for.
- **Authorisation for set-password is a ticket, not the session.** A session says who you are, never
  how you proved it. Gated on the session alone, a stolen cookie would become permanent takeover.
  `set-password` is minted only inside `completeSignIn`, only on the recovery path, only after the
  last factor.
- **That ticket is single-use on the server, not just in the client.** Its subject carries the
  redeemed recovery credential and `setPassword` requires that credential's key slot to still
  exist; the write batch deletes it. Clearing the ticket in `flows.ts` is a courtesy, not the
  enforcement — for fifteen minutes it was the only thing standing there.
- **Change-password reuses the salt.** Recovery codes derive against the password's salt, so rolling
  it would silently kill all ten.
- **A passkey sign-in has no TOTP stage, and no rate limiting.** User verification is the
  passkey's second factor (§3's stolen-laptop row; `verifyAssertion` refuses an assertion without
  the UV flag, so it is enforced) and §4 says passkeys need no rate limiting — a failed attempt
  means forging a P-256 signature. Adding a TOTP stage here would back a stronger factor with a
  weaker one. `docs/DECISIONS.md` 2026-08-13.
- **A `prf`-less authenticator registers a passkey with no key slot**, deliberately (§5: "the
  fallback is a missing slot rather than a different design"). It signs in and can never open the
  grant key, and the screen says so. Do not "fix" this by wrapping the slot to something the
  server holds — that is escrow.
- **Removing a passkey is refused when its slot is the account's last openable one** — same line
  as reset's second refusal: deleting the last openable slot is account destruction under a
  milder name. Spent recovery codes' slots do not count as openable.
- **The WebAuthn challenge tokens are stateless** (two `TokenPurpose`s in `worker/session.ts`);
  a replayed registration is refused by the credential-id uniqueness index, not by a challenge
  table. Do not add one.
- **Set-password re-wraps; it does not unwrap.** `unwrapSlot` returns a deliberately
  **non-extractable** key, which cannot be wrapped into a new slot, so the flow goes
  ciphertext-to-ciphertext through `rewrapSlot`. Calling `unwrapSlot` here typechecks and fails at
  runtime.
- **The browser refuses implausible KDF parameters** (`checkIterations` in `src/auth/derive.ts`,
  2026-08-13 review). Every consumer of `challenge`'s response floors the iteration count at the
  constant its credential kind has always used and caps it at 10M — otherwise anything that could
  forge that one response could say `iterations: 1` and silently strip the whole stretch. Refuse,
  never clamp: a "corrected" count derives a secret the server does not hold. If the default ever
  rises, the floor stays at the oldest count ever deployed.
- **Passwords are NFKC-normalised before PBKDF2** (same review; NIST 800-63B). Composed and
  decomposed non-ASCII must derive identically across platforms — there is no email reset behind
  a mismatch. A no-op for ASCII, so recovery codes are untouched.
- **The last-way-in guards live in the writes' own `WHERE` clauses**, not in a check before them
  (`passkeys.remove`, `admin.resetPassword`, `admin.setOperator`'s demotion, `totpEnrol`'s
  upsert; 2026-08-13 review). Check-then-act versions let two concurrent requests each count the
  other as "another way in" and destroy the invariant the refusal promises — sealed grant key,
  zero operators, a confirmed TOTP's secret replaced under it. Zero `meta.changes` is the refusal;
  the audit row is written only after it, so it can never record an act the guard declined. Do
  not "simplify" these back into a pre-check plus an unconditional write.

### Four things the client has not yet signed off

Found while building; none are blocking. Listed in `TODO.md`; the reasoning is here.

1. **`totp.last_step`** (`migrations/0002_totp_replay.sql`) is a field §9's inventory does not list,
   and §9 says adding one is a spec change. It stores the 30-second window of the last successful
   second factor — coarser than `credentials.last_used_at`, which the inventory already covers. It
   exists because without it a TOTP code is replayable for up to 90 seconds. Recommend approving.
2. **§3's operator row is stronger than the design supports.** The Worker sees the raw `authSecret`
   on every sign-in and holds the account's salt and iteration count, so an operator who logged one
   sign-in could grind candidate passwords offline, re-derive the wrapping key, and open the key
   slot from their own D1. The cryptography is fine — the *unconditional* wording is not.
3. **`⌘K` is claimed twice.** `SPEC.md` makes it the operator door's sixth unlock route;
   `SPEC-ACCOUNTS.md` §10 makes it the command palette. Both cannot be true.
4. **Signup discloses handle availability** (409) while `challenge` goes to real trouble to hide it.
   Defensible — availability is inherently public — but the two should not disagree.

## Deployment

Served by a **Cloudflare Worker with static assets** (`wrangler.toml`), not Pages. Pages cannot
define Durable Object classes and this stack needs them twice — rate limiting now, one signalling
object per paired machine in phase 2. The cutover completed 2026-08-12; `docs/DECISIONS.md` has
the story and the rollback.

Rules, each of which cost something to learn:

- **Deploy with `npm run deploy`, never bare `wrangler deploy`.** `predeploy` typechecks *and*
  strips `dist/_redirects`, which Workers static assets otherwise parses as *configuration* and
  rejects as an infinite loop; the deploy fails outright at the API call. The typecheck is not
  redundant with `npm run build`: `wrangler deploy` bundles `worker/` with esbuild, which strips
  types without checking them, so a Worker type error could otherwise reach production.
- **`public/_redirects` stays** until the Pages project is deliberately retired. Pages still
  auto-deploys from `main` and is the rollback. `.assetsignore` does not help — validation happens
  before the upload list is filtered.
- **`public/_headers` stays and is *not* stripped.** Unlike `_redirects` it is valid for both hosts,
  and it is the only thing giving `/assets/*` its `nosniff` — see the next bullet. Do not
  generalise "strip the config files at deploy" from `_redirects` to this one.
- **The Worker's SPA fallback is `not_found_handling`**, not `_redirects`.
- **`run_worker_first = ["/*", "!/assets/*"]`** is what lets the Worker inline the published site
  config into HTML. By default a request matching a real file never invokes the Worker, so `/`
  (which *is* index.html) silently got no injection while `/contact` did. The negation keeps the
  hashed bundles on the fast path — and means `/assets/*` responses never pass through `harden()`,
  which is why their headers come from `public/_headers` instead.
- **`workers.dev` is disabled**, since `workers_dev` defaults to false once a route exists. Wanted:
  it closes the signup endpoint that was publicly reachable before cutover. Set `workers_dev = true`
  if you need a non-production URL back, knowing that reopens it.
- **`[dev] upstream_protocol = "https"`** is load-bearing for local development, not cosmetic. See
  `docs/HANDOFF.md`.
- **Give a fresh deploy a few seconds** before testing routes; asset manifests propagate.

### HTTPS and headers

HTTPS is forced in `worker/index.ts` and `Strict-Transport-Security`, `x-content-type-options`,
`referrer-policy` and `x-frame-options` are set on page responses.

**`URL.protocol = "https:"` silently does nothing in workerd.** The redirect URL is built by
concatenation **and** compared against the request before being sent, so the worst case is "no
redirect happens" rather than an infinite loop. Keep that guard. Loopback is exempt or
`wrangler dev` and `npm run test:auth` break.

**A state-changing request whose `Origin` is present and is not ours is refused** (`crossOrigin` in
`worker/index.ts`). This is defence in depth — `SameSite=Lax` is what actually stops a cross-site
POST — covering the two places Lax does not reach: Chromium's two-minute grace on a freshly set
cookie, and same-site subdomains, which `design/GUIDE-SUBDOMAINS.md` would create. **A missing
`Origin` is allowed deliberately**: same-origin GETs and non-browser clients omit it, and
`scripts/auth-e2e.ts` is one of those. Do not tighten that to "require an Origin" without fixing
the harness first.

**There is deliberately no CSP.** The app shell has the published site config *inlined* as a script
(`worker/site-config.ts`), so a `script-src` without a nonce plumbed through that injection would
blank the site's appearance on first paint. Worth doing properly; not worth doing badly —
`TODO.md` #12.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and
focus return for both overlays (`src/hooks/useFocusTrap.ts`), a live region for toasts, focus-visible
styles and CSS-level `prefers-reduced-motion`. The sleeping chrome also takes `inert`, so a faded-out
interface cannot be reached by Tab.

**The form convention.** `.v-paste` — the share-code field in the siteconfig panel — used to submit
on Enter only with no button, so a code could not be applied by mouse or touch at all. It is now a
real `<form>` with an `apply` submit button, disabled while the field is blank.

Account forms follow that shape: **one `<form>` with an `onSubmit` that calls `preventDefault()`,
and a `type="submit"` button.** Enter and the button are then the same code path instead of two that
can drift apart, and neither has to be special-cased. The disabled convention it uses was already
waiting in `interaction.css`. The row reuses `.v-share-row`, so the paste field lines up with the
copy field above it.

**The focus-indicator half of that note was wrong and is retracted.** `.v-paste` does set
`outline: none` in `overlays.css`, but `.vessel :focus-visible` in `base.css` has specificity 0-2-0
against that rule's 0-1-0, so it wins on specificity regardless of file order and the input focuses
with the normal 2px `--a1` ring. Verified in a browser 2026-08-12: real click, `:focus-visible`
matches, computed outline `solid 2px` at 3px offset. Do not "fix" this.

Still open, and genuinely unresolved rather than overlooked: several palettes fail WCAG AA on body
text. That is deliberate — Peat especially — and calm mode is the intended remedy.
