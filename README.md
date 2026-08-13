# vessel

A personal site for an independent computer repair operator. Deliberately over-designed: a
configurable visual toy wrapped around one genuinely useful page (Contact).

React 18 + Vite + TypeScript, served by a Cloudflare Worker. No runtime dependencies beyond React —
no CSS framework, no router library, no webfonts, no images. Every graphic is CSS or canvas. The
routing, state, styling and authentication are all hand-rolled, deliberately.

Live at [mcclevarty.ca](https://mcclevarty.ca); `mcclevarty.com` redirects to it.

## Commands

```sh
npm install
npm run dev          # Vite dev server on http://localhost:5173 (no API)
npm run dev:worker   # full stack — Worker + API + local D1, on http://127.0.0.1:8787
npm run build        # typecheck + production build to dist/
npm run typecheck    # types only, app and worker
npm run test:auth    # auth end-to-end suite; needs dev:worker running
npm run deploy       # build, strip dist/_redirects, publish the Worker
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
| `src/styles/` | Five stylesheets; `interaction.css` owns every hover, press and disabled state |
| `worker/` | The Worker: static assets, the account API, sessions, TOTP, rate limiting |
| `migrations/` | D1 schema |
| `scripts/auth-e2e.ts` | Auth suite — runs the real `src/auth` modules against a live Worker |

`CLAUDE.md` carries the working notes: binding decisions, deliberate deviations, and the
implementation traps. **`TODO.md` is the ordered backlog.**

## Build status

**The site is complete and live.** Every screen, layout, effect and interaction the spec describes is
built: the shared chrome, all thirteen layouts, twelve canvas backgrounds, the siteconfig panel, the
operator door and its six unlock routes, the screensaver, calm mode, the five motion systems, the
responsive bands, and the accessibility pass.

Beyond the spec, at the client's request: the hero ornament is a setting rather than a fixture (five
of them, `src/data/ornaments.ts`), and the Matrix rain was rebuilt to match the film. `CLAUDE.md`
lists every deliberate deviation with its reasoning.

### Accounts — phase 1, in progress

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

See **`TODO.md`** for the ordered list. The headlines: the auth harness's newest section has never
been run, the lightsword duel needs rebuilding (`docs/DUEL.md`), operator password reset and TOTP
enrolment have no UI, edit mode needs a client decision on images, and photo slots are still
placeholders.

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
  `x-frame-options` are on every response. There is deliberately **no CSP** — see `TODO.md` #12.
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
