# vessel

A personal site for an independent computer repair operator. Deliberately over-designed: a
configurable visual toy wrapped around one genuinely useful page (Contact).

React 18 + Vite + TypeScript, served by a Cloudflare Worker. No runtime dependencies beyond React —
no CSS framework, no router library. The routing, state, styling and authentication are all
hand-rolled, deliberately, and that rule is absolute.

Two parts of the original "no assets" rule have been lifted by the client and are recorded as
deviations in `CLAUDE.md`: **six self-hosted variable webfonts** (`public/fonts/`, 178KB, SIL OFL,
because three of the five typesets collapsed to Arial on Windows) and **placeholder photographs**
(`public/photos/`, public-domain, EXIF stripped). Every other graphic is still CSS or canvas.

Live at [mcclevarty.ca](https://mcclevarty.ca); `mcclevarty.com` redirects to it.

## Commands

```sh
npm install
npm run dev          # Vite dev server on http://localhost:5173 (no API)
npm run dev:worker   # full stack — Worker + API + local D1, on http://127.0.0.1:8787
npm run build        # typecheck + production build to dist/
npm run typecheck    # types only, app and worker
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run check        # THE GATE — every automatable invariant. Also runs as predeploy
npm run check:fast   # the same without the duel simulation; runs after every edit
npm run deploy       # check, build, strip dist/_redirects, publish the Worker
npm run db:migrate   # apply migrations to local D1  (add :remote for production)
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — the bare command fails on a fresh
build. See *Deployment* below.

## Where things are

| Path | What |
|---|---|
| `design/SPEC.md` | The design spec. Final copy, tokens, layouts, motion, product decisions |
| `design/SPEC-ACCOUNTS.md` | The accounts and private-drive spec. Approved 2026-08-12; §12 is a decision log |
| `design/prototype.html` | The executable spec — open it in a browser, everything in it works |
| `src/data/` | Palettes, layouts, effects, ornaments, typefaces, page copy, randomiser guardrails |
| `src/config/` | Config state, persistence, share codes, randomiser, responsive bands |
| `src/theme.ts` | Collapses palette + type + layout + band + calm into CSS custom properties |
| `src/fx/` | The canvas backgrounds, and the per-frame values kept outside React |
| `src/hooks/` | Title scramble, pointer-driven motion systems, unlock routes, focus trap |
| `src/auth/` | The browser half of authentication — PBKDF2, grant keys, key slots, flows |
| `src/components/` | Sign-up, sign-in, administration, and the shared chrome |
| `src/styles/` | Seven stylesheets; `interaction.css` owns every hover, press and disabled state, `entrances.css` the per-layout arrivals |
| `worker/` | The Worker: static assets, the account API, sessions, TOTP, rate limiting |
| `migrations/` | D1 schema |
| `scripts/auth-e2e.ts` | Auth suite — runs the real `src/auth` modules against a live Worker |
| `scripts/check.ts` | **The gate.** Every automatable invariant; also `predeploy` |
| `sitelab.html`, `fxlab.html` | Dev-only benches for the site and the effects. Never built into `dist/` |

## The documents

| File | What it is for |
|---|---|
| `TODO.md` | **The ordered backlog.** The one place that says what to do next |
| `docs/HANDOFF.md` | Starting a session, verifying a deploy, and what cannot be verified from here |
| `CLAUDE.md` | Working notes — binding decisions, deliberate deviations, implementation traps. Invariants only |
| `docs/DECISIONS.md` | Dated history: what was decided, when, and why. Where superseded notes stay true |
| `docs/BREAK-GLASS.md` | The operator's recovery path when password, recovery codes and phone are all gone |
| `docs/DUEL.md` | The lightsword duel — built, re-listed 2026-08-14, and audited twice |
| `docs/AUDIT-BRIEF.md` | A cold-start brief for auditing the site |
| `docs/SECURITY-AUDIT.md` | Standing security review notes |
| `docs/FONTS.md` | The webfont ledger — subset ranges and byte counts |
| `docs/PHOTOS.md` | The placeholder-photo ledger and its sources |
| `docs/ACCOUNT-RECOVERY.md` | Recovery-code format and the flow |
| `docs/pi-sharing-host.md` | **Phase 2.** Building the always-on Linux/Raspberry Pi host that will hold the sharing tab open. Paired with `scripts/pi-setup.sh` and `scripts/linux-drive-report.sh` |
| `design/SPEC.md` | The design handoff. Authoritative on copy, tokens, layouts and motion |
| `design/SPEC-ACCOUNTS.md` | The accounts and drive-access spec. Approved 2026-08-12; §12 is its decision log |
| `design/GUIDE-SUBDOMAINS.md` | How to add a page, and the four things per-account subdomains would break |

`TODO.md` and `docs/HANDOFF.md` are the only two that say "do X next". Everything else says why.

## Build status

**The site is complete and live.** Every screen, layout, effect and interaction the spec describes is
built: the shared chrome, **fourteen** layouts, **sixteen** canvas backgrounds, **twenty-five**
palettes, the siteconfig panel, the operator door and its six unlock routes, the screensaver, calm
mode, the motion systems, the responsive bands, the per-layout entrances, and the accessibility pass.

Beyond the spec, at the client's request: the hero ornament is a setting rather than a fixture
(**eight**, four of them withdrawn but still decodable, default `sonar`) with a **station** saying
where it holds; the two lightsword duels are both an ornament and a background; and the Matrix rain
was rebuilt. `CLAUDE.md` lists every deliberate deviation with its reasoning.

### Accounts — phases 1 and 2 built

Authentication works end to end and is deployed:

- **Sign-up and sign-in** with password + TOTP second factor, at `/signup` and `/signin`
- **Recovery codes** — sign in with one, then set a new password
- **Change password**, re-wrapping the key slot rather than regenerating the grant key
- **`/admin`** — list accounts, grant/revoke operator, reset 2FA, delete
- **Operator-published site config** — the operator's appearance becomes every visitor's, inlined
  into the app shell by the Worker so there is no palette flash

The password never reaches the server: the browser runs PBKDF2 and sends a derived auth secret, of
which the Worker stores only an HMAC under a pepper. One grant keypair per account is wrapped once
per credential, LUKS-style, so any credential opens the same key and an operator reset cannot read
it. No email is collected and no personal data is stored — `SPEC-ACCOUNTS.md` §9 has the full
inventory.

The account pages are **unlinked** at the client's request: reach them by typing `whoami`, `login` or
`admin`, by dragging the page left, or — once signed in as an operator — from the footer.

### Not done

**See `TODO.md`** — it is the single ordered backlog and it is kept current. This section used to
restate it and drifted into being three-quarters false, so it no longer tries: the harness now drives
the real `flows.ts`, the duel is built and audited twice, and operator reset and TOTP enrolment both
have UI. What genuinely remains is in `TODO.md`.

## Deployment

Served by a Cloudflare Worker with static assets (`wrangler.toml`), **not** Pages. The move was
forced: Pages cannot define Durable Object classes, and this stack needs them twice — rate limiting
now, one signalling object per paired machine in phase 2.

Cutover was done by adding a `routes` entry rather than deleting the Pages custom domain, because a
Workers route is evaluated ahead of one. **Rollback is deleting the `routes` block and redeploying**,
not rebuilding infrastructure under pressure.

Two consequences that look like bugs and are not:

- **`public/_redirects` must stay, and `npm run deploy` strips it from `dist/`.** Workers static
  assets treats it as *configuration*, parses it, and rejects `/* /index.html 200` as an infinite
  loop — the deploy fails outright. It cannot simply be deleted either, because Pages still
  auto-deploys from `main` and is the rollback. `.assetsignore` does not help; validation happens
  before the upload list is filtered.
- **`workers.dev` is disabled**, since `workers_dev` defaults to false once a route exists. That is
  wanted — it closes the public signup endpoint that was reachable before cutover — but it means
  there is no non-production URL. Set `workers_dev = true` if you need one.

Give a fresh deploy a few seconds before testing routes; asset manifests propagate.

## Security

- HTTPS is forced and `Strict-Transport-Security`, `x-content-type-options`, `referrer-policy` and
  `x-frame-options` are on every response the Worker serves; `public/_headers` covers `/assets/*`,
  which by design never reaches the Worker. A nonced **CSP ships report-only** on every page
  response — deliberately report-only as stage one, with violations logged and nothing blocked;
  `CLAUDE.md` has the conditions for flipping it to enforcing.
- A state-changing request whose `Origin` is present and is not ours is refused, as defence in
  depth behind the session cookie's `SameSite=Lax`.
- Secrets (`AUTH_PEPPER`, `SESSION_SECRET`, `RATE_SALT_SEED`, `TOTP_ENC_KEY`) are Cloudflare secrets
  and cannot be read back. **`AUTH_PEPPER` must stay backed up** — losing it invalidates every
  stored auth hash, i.e. every password on the site, unrecoverably.
- `docs/BREAK-GLASS.md` is the operator's recovery path when everything else is gone. Email recovery
  was proposed and rejected; the reasoning is in that file.

## Three things that are decisions, not bugs

- **No city is named anywhere**, and the operator is not named. That is the About page's content.
- **The operator door's `authenticate` button is theatre.** Real authentication must never reuse its
  UI. The door guards a settings drawer and nothing else.
- **Guestbook has no form.** A form is a database is a liability.

The full list is in `design/SPEC.md` under *Product decisions already made*, and
`design/SPEC-ACCOUNTS.md` §12 for the accounts work.
