# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The project

"Vessel" — a personal site for an independent computer repair operator, being built from a complete
design handoff. React 18 + Vite + TypeScript.

```sh
npm run dev        # dev server on http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck  # types only
```

No test suite yet. No runtime dependencies beyond React — the routing, state, and styling are all
hand-rolled, deliberately (see *Assets* in the spec: no third-party libraries, no webfonts, no
images).

## The spec is authoritative

- `design/SPEC.md` — final copy, tokens, layouts, motion timings, product decisions
- `design/prototype.html` — an **executable** spec. It genuinely runs; every feature described in
  SPEC.md works in it. Open it in a browser and use it rather than guessing at behaviour. It pulls
  React and Babel from unpkg at load, so it needs network access
- `design/support.js` — the prototype's own renderer. **Do not port it and do not read it for design
  intent.** It is scaffolding
- `design/rejected-kaleidos.html` — an earlier direction that was rejected. Context only

Fidelity is high: every hex value, duration, and easing curve in the spec is intended, not
approximate. The two deliberate exceptions are photo slots (placeholders, real images don't exist
yet) and operator authentication (theatre — see below).

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
| 366 | `PAGES` — all nine pages' final copy → ported to `src/data/pages.ts` (with the one approved copy correction below) |
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

All of it is built: token layer, persistence, share codes, randomiser + guardrails, bands, routing,
page copy, the shared chrome, all thirteen layouts, all twelve canvas effects, the siteconfig panel,
the operator door and its six routes, the screensaver, calm mode, and the five motion systems.

`src/App.tsx` is the real shell. The three overlays (panel, door, screensaver) are siblings of
`.v-chrome` rather than children, because the screensaver fades the chrome to `opacity: 0` with
`pointer-events: none` and must not take the panel or the door with it.

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
- **Adapted layouts**: the operator's stored layout is never overwritten when a small screen
  collapses it; the hero metadata strip appends ` · adapted` so the state is never silently wrong
- **Routing**: the prototype swaps pages in place with no URL change. That is a prototype
  limitation, not a design decision — nine real URLs are already wired in `src/data/pageIds.ts`

## Known deviations from the prototype

Both deliberate. Add to this list rather than silently diverging.

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
   There are now five — **Lens** (the default: a recessed eye where the geometry is dead still and
   only the light moves), Valve (unchanged), Aperture, Orrery, None — pickable in siteconfig,
   rollable under a sixth `ornament` scope, and carried as a sixth share-code field. All five sit in
   one square slot (`.v-ornament`), so the layouts that resize it and the ones that hide it need no
   knowledge of which is showing, and Radial's orbiting nav pills work over any of them.

   Two consequences worth knowing: `SCOPES` now has six entries, not the spec's five; and share
   codes are six fields, with five-field codes still decoding and simply leaving the ornament alone.

## Copy correction, approved by the client

The home page's third block is stale from v1: it reads "Twenty-four palettes, eight layouts" and
lists "8 layout archetypes", but v2 ships thirteen. **The client has confirmed the full option set
stays and the copy gets corrected.** When porting `PAGES` into `src/data/pages.ts`, the `home`
block with `kicker: "the site"` becomes:

- title: `Twenty-four palettes, thirteen layouts`
- list item 2: `13 layout archetypes`

Body text and the other three list items are unchanged. This is the **only** stale count in the
copy — the 404's "eight other pages" (nine pages minus itself), "six ways into a panel" (six unlock
routes), "24 colour palettes", "12 background modes" and "5 type systems" are all correct. Every
other line of copy is still verbatim-only.

## Where this stands, and what is next

The site is finished and live (`main` → Cloudflare Pages → `mcclevarty.ca`). **Phase 1 of the accounts
work is now in progress** — the spec was approved by the client on 2026-08-12 and the build has
started.

### `design/SPEC-ACCOUNTS.md` is approved and authoritative

Read it before touching any of this. It is no longer a proposal. **§12 is a decision log** — every
rejected option keeps its reasoning and carries a *"revisit if"* condition, so an idea that comes back
starts from "here is why we didn't" rather than being re-derived. Add to it rather than relitigating.

The decisions most likely to be broken by someone who has not read it:

- **Sign-in is password + TOTP, with passkeys retained** as an alternative credential. This replaced
  passkey-only on 2026-08-12. **No email is collected**, and the operator can reset any password —
  which is what makes email unnecessary.
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
- Real auth **must not reuse the operator door's UI** (`SPEC.md` §Security). The door stays theatre.

Phase 1 grew roughly threefold with the second round of decisions, and it has one non-negotiable
internal order: **authentication works end to end before any interface work starts.** Building the
command palette on a sign-in that does not work yet is how the fun part ships and the load-bearing
part does not.

### What is built so far

- `migrations/0001_phase1_accounts.sql` — phase 1 tables only. Machines, drives, grants and invites
  are deliberately absent; an empty `grants` table is an invitation to fill it before the phase that
  hardens it. Constraints verified against local D1.
- `worker/index.ts` — serves the static site via the assets binding, `/api/*` is the exception.
  Delete every route and the site serves as it does today, which is what "accounts are strictly
  additive" has to mean.
- `worker/rate-limit.ts` — the `RateLimiter` Durable Object. Counts failures only, resets on success,
  exponential backoff to a **one-hour ceiling**; the ceiling stops an attack on a known handle from
  becoming an indefinite lockout of its owner. Never sees an IP. **Its backoff path is not yet
  exercised** — it needs a sign-in endpoint to fail against.
- `worker/crypto.ts` — HMAC helpers, constant-time compare, and `clientKey` for IP-free rate-limit
  keying.
- **The auth layer, end to end.** `src/auth/` holds the browser half — `derive.ts` (PBKDF2 → HKDF
  split into an auth secret and a wrapping key), `grantKey.ts` (the P-256 grant key and its AES-KW
  slots), `recoveryCodes.ts`, `api.ts`, `flows.ts`. `worker/accounts.ts` holds signup, challenge,
  sign-in, the TOTP second factor, sessions and the key-slot endpoint; `worker/session.ts` and
  `worker/totp.ts` are its two primitives.
- `scripts/auth-e2e.ts` — **78 checks against a live Worker and local D1**, run with
  `npm run test:auth` against `npm run dev:worker`. It imports the real `src/auth` modules rather
  than reimplementing them, so it fails if browser and Worker ever disagree about a byte, and it
  computes TOTP codes independently from RFC 6238 rather than calling `worker/totp.ts`.

Three things that are decisions, and are easy to "fix" back into bugs:

- **`recordSuccess` resets the account bucket and only *decays* the client bucket** by one
  (`rate-limit.ts` `/succeed`). Wiping the client bucket on success hands an attacker a free reset:
  sign in to an account you own, and the counter recording your failures against everyone else's
  goes to zero. Client allowance is 50 and account allowance 5 because one address is a household
  behind NAT and five would lock out a café over one typo.
- **A redeemed recovery code returns its key slot in the sign-in response**, and the slot row is
  *kept*, not deleted. The wrapping key exists only for that request — the code is spent — so a slot
  not handed back is a grant key sealed for ever, which would quietly make §5's "preserves grant
  authority in full" false. `signInWithRecoveryCode` unwraps it before returning.
- **A recovery code is not marked used until the sign-in completes.** With two-factor on, the ticket
  carries the pending credential id. Spending it earlier would burn one of ten codes per abandoned
  attempt, for the person recovery exists for.

Next, in order: the operator surface and its reset flow, set/change password (which is what lets a
redeemed recovery code write a fresh password slot), passkeys, then account/setups pages, then the
dialog primitive and command palette.

### Four things the client has not yet signed off

Found while building; none are blocking, all are recorded here rather than slipped in.

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

### Deployment is mid-migration

**The site moved from Pages to a Worker with static assets** (`wrangler.toml`), because Pages cannot
define Durable Object classes and this stack needs them twice — rate limiting now, one signalling
object per paired machine in phase 2.

Nothing is deployed yet, but the groundwork is now done. State as of 2026-08-12:

- ✅ `npx wrangler login` — done by the client. Account `760b80a637d2ffe755b09da3f4a339ff`.
- ✅ **The real D1 database exists.** `vessel`, region ENAM, id in `wrangler.toml`. Both migrations
  are applied `--remote`; `d1 list` was empty before this, so nothing was overwritten.
- ❌ **The four secrets are not set**, and the Worker cannot be deployed until they are. `Env` types
  all four as required `string`s, so a deploy without them yields a Worker whose every HMAC throws.
  The commands were blocked by the sandbox's permission classifier rather than by anything about the
  project; **the client runs these four themselves**, from the repo root:

  ```sh
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put AUTH_PEPPER
  # …and the same for SESSION_SECRET, TOTP_ENC_KEY, RATE_SALT_SEED
  ```

  **`AUTH_PEPPER` must be backed up somewhere the client controls before the first real account is
  created.** Cloudflare secrets are write-only — they cannot be read back. Losing the pepper
  invalidates every stored auth hash, i.e. every password on the site, unrecoverably. Today that
  costs nothing because no accounts exist; after the first signup it is a data-loss event. The other
  three are similar but cheaper: `SESSION_SECRET` only signs out everyone, `RATE_SALT_SEED` only
  resets counters, `TOTP_ENC_KEY` breaks enrolled second factors.
- ❌ `npx wrangler deploy`, then the cutover of `mcclevarty.ca` from the Pages project to the Worker.
  Do it once, deliberately, with the client watching. Deploy to `workers.dev` and verify
  `/api/health` returns `{"ok":true,"tables":6}` *before* moving the custom domain — the Pages
  project `vessel` still serves the live site and is the rollback.

**`public/_redirects` is dead under Workers but must stay** until cutover. The live site still deploys
from Pages, and removing it would break client-side routing in production on the next push.

Also queued, after phase 1:

- **Richer transitions, slide-overs and typewriter effects.** The hard part is the constraint: every
  layout, palette and ornament has to stay visually distinct. That points at a small set of motion
  primitives each layout composes differently, rather than bespoke animation per layout — but confirm
  the approach before building. The file-explorer design in §10 is *not* this; it is phase 2 and
  already specified.

One thing left unverified: the client has not yet confirmed the **Matrix rain fall speed** by eye.
It was rebuilt after they said the original was far too fast, and verified headlessly at 96–307
px/sec against the old 960 — but the browser session it was checked in could not run animation.
`RAIN_SPEED_MIN` and `RAIN_SPEED_RANGE` in `src/fx/effects.ts` are the two constants to adjust.

## Accessibility

The spec's gap list is closed: accessible button names, `aria-current` on nav, focus trapping and
focus return for both overlays (`src/hooks/useFocusTrap.ts`), a live region for toasts, focus-visible
styles and CSS-level `prefers-reduced-motion`. The sleeping chrome also takes `inert`, so a faded-out
interface cannot be reached by Tab.

**The one real defect is fixed, and it set the form convention.** `.v-paste` — the share-code field
in the siteconfig panel, and the only text input in the entire app — used to submit on Enter only
with no button, so a code could not be applied by mouse or touch at all. It is now a real `<form>`
with an `apply` submit button, disabled while the field is empty or blank.

That shape is deliberate and the account forms should follow it: **one `<form>` with an `onSubmit`
that calls `preventDefault()`, and a `type="submit"` button.** Enter and the button are then the same
code path instead of two that can drift apart, and neither has to be special-cased. The disabled
convention it uses was already waiting in `interaction.css` for exactly this. The row reuses
`.v-share-row`, so the paste field lines up with the copy field above it.

The *focus-indicator* half of this note was wrong and is retracted. `.v-paste` does set
`outline: none` (`overlays.css:185-199`), but `.vessel :focus-visible` in `base.css:68` has
specificity 0-2-0 against that rule's 0-1-0, so it wins on specificity regardless of file order and
the input focuses with the normal 2px `--a1` ring. Verified in the browser 2026-08-12: real click,
`:focus-visible` matches, computed outline `solid 2px` at 3px offset, ring visible in a screenshot.
Do not "fix" this.

Still open, and genuinely unresolved rather than overlooked: several palettes fail WCAG AA on body
text. That is deliberate — Peat especially — and calm mode is the intended remedy.
