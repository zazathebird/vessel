# Guide — site sections, and per-account subdomains

Written 2026-08-12, in answer to *"a complete guide on all subsections of the site
(`accountname.mcclevarty.ca`) or how to make those."* **Revised 2026-08-13**: three of Part B's
load-bearing claims had gone stale within a day of being written — the handle blocker was fixed,
the cutover completed, and the first real account was created. Each is corrected in place and the
correction says what changed.

That phrasing has two readings and this covers both, because they are genuinely different jobs:

- **Part A — adding a section to the site.** A new page at `mcclevarty.ca/whatever`. Small, well
  understood, about an hour. The site already has nine content pages built this way, plus three
  unlinked account pages.
- **Part B — per-account subdomains.** `ada.mcclevarty.ca` serving Ada's page. This is **not in
  `SPEC-ACCOUNTS.md`** and is a real architectural addition, not a config toggle. It is buildable,
  but it collides with four things already decided. One of those collisions has since been
  removed in code; the other three stand, and one of them has grown a new consequence.

Read Part B's *"Four things it breaks"* before deciding you want it.

---

## Part A — adding a new section (`mcclevarty.ca/whatever`)

Nothing here is speculative; it is how the existing pages work.

### The four files

| File | What you add |
|---|---|
| `src/data/pageIds.ts` | The id and its URL. This is the routing table |
| `src/data/pages.ts` | The page's copy — kicker, title, body, blocks |
| `src/data/pageIds.ts` → `NAV` | Only if it should appear in the nav bar |
| `wrangler.toml` | **Nothing.** SPA fallback already serves any unknown path the app shell |

### The steps

1. **Add the id.** In `src/data/pageIds.ts`, add your page to the id union and its path. Keep the id
   short and lowercase — it is used as a key in several maps.
2. **Add the copy.** In `src/data/pages.ts`, add an entry keyed by that id. Copy the shape of an
   existing page exactly: the block structure (`kicker`, `title`, `body`, `list`) is what the layouts
   render against, and a missing field renders as a gap rather than an error.
3. **Decide about nav.** `NAV` is the ordered list of pages that get a nav pill. A page absent from
   `NAV` is still reachable by URL — that is how `/404` works. Note the constraint recorded in
   `SPEC-ACCOUNTS.md` **§11**: `useOperatorRoutes.ts` cycles `NAV` only, so adding an entry changes
   the operator door's cycling behaviour as a side effect. *(Earlier revisions of this guide cited
   "§680", which is a line number dressed up as a section number. The same citation was copied into
   a comment in `src/data/pageIds.ts`.)*
4. **Check it in all thirteen layouts.** This is the step people skip. Layouts are not a wrapper —
   Magazine, Stack and Radial lay blocks out fundamentally differently, and a block count that looks
   fine in one can strand a widow in another. Cycle layouts in the siteconfig panel.
5. `npm run build`, then `npm run deploy`.

### The two traps

- **No literal colours.** Anything you add reads CSS custom properties from `src/theme.ts`. A
  hardcoded hex silently breaks the 0.9s palette bleed on that element only, which is easy to miss
  because it looks correct until someone changes palette.
- **Copy is verbatim from the spec.** `CLAUDE.md` records exactly one approved copy correction. If
  you are writing genuinely new copy, that is a product decision, not an implementation one — the
  self-deprecating register is deliberate and load-bearing.

---

## Part B — per-account subdomains (`ada.mcclevarty.ca`)

### What you would be building

Today one hostname serves everything. Per-account subdomains mean the Worker inspects
`url.hostname`, extracts the leftmost label, treats it as a handle, and serves that account's
public page. It is roughly 40 lines of Worker code and a DNS record. The work is not the code.

### The infrastructure, concretely

**1. Wildcard DNS.** In the `mcclevarty.ca` Cloudflare zone, add a proxied record:

```
Type: CNAME    Name: *    Target: mcclevarty.ca    Proxy: ON (orange cloud)
```

The orange cloud is mandatory — a grey-cloud wildcard resolves straight to origin and never reaches
the Worker.

**2. TLS — you are fine, but only by one level.** Cloudflare Universal SSL covers the apex *and*
`*.mcclevarty.ca`. So `ada.mcclevarty.ca` gets a valid certificate free and automatically.
`ada.files.mcclevarty.ca` does **not** — two-level wildcards need Advanced Certificate Manager or
SSL for SaaS, both paid. Design for one level.

**3. The Worker route.** In `wrangler.toml`:

```toml
routes = [
  { pattern = "mcclevarty.ca/*",   zone_name = "mcclevarty.ca" },
  { pattern = "*.mcclevarty.ca/*", zone_name = "mcclevarty.ca" },
]
```

**The cutover completed on 2026-08-12**, so this is now available. The original warning is kept
because the reasoning survives the event: while Pages held the apex, claiming a route was how you
took the live site down. Add the wildcard as its own deliberate change, separate from anything
else, and note that the apex route is also the rollback lever — deleting the `routes` block hands
the domain back to the Pages project underneath (`docs/DECISIONS.md`).

**4. The code**, in `worker/index.ts`, before the assets fallback:

```ts
const label = url.hostname.split(".")[0];
const isSubdomain = url.hostname.endsWith(".mcclevarty.ca") && label !== "www";
```

Then look up `accounts` by `handle_lower = label` and serve accordingly. Keep it ahead of
`env.ASSETS.fetch(request)` but behind the `/api/` branch, so the API stays reachable on every
hostname.

### Four things it breaks

**1. A DNS label cannot hold a current handle. — RESOLVED, in code, on 2026-08-12.**

`HANDLE_PATTERN` used to be `/^[a-z0-9][a-z0-9._-]{2,23}$/i`, permitting `.` and `_`. Neither
survives a hostname:

- `ada.smith` as a label produces `ada.smith.mcclevarty.ca` — a **two-level** name. Universal SSL
  does not cover it, so it fails with a certificate error, not a 404.
- `ada_smith` is invalid in a hostname outright. Browsers and resolvers reject underscores in the
  hostname position.

This guide's closing recommendation was to tighten the pattern while it was free, and **commit
`e65cbe5` did exactly that the same day.** `HANDLE_PATTERN` in `worker/accounts.ts` is now:

```ts
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{2,23}$/i;
```

**That window has since closed.** `piratelife` was created on 2026-08-12 and is the operator, so a
further tightening would now be a breaking migration rather than a one-line change. The tightening
that matters was made in time; nothing else about handles is free any more.

One loose end: the user-facing error message in `expectHandle` still describes the *old* pattern —
"letters, numbers, and `. _ -` after the first". `TODO.md` #17.

**2. It broadcasts every handle, and the spec deliberately hides them.**

`CLAUDE.md` already records this as unresolved item 4: signup discloses handle availability via 409
while `challenge` goes to real trouble to hide it. That contrast sharpened on 2026-08-13, when
`challenge` was found to be *leaking* handle existence through its decoy iteration count and was
fixed to report the real constant (`docs/DECISIONS.md`) — so it now genuinely hides what it claims
to hide, and the 409 is the only remaining disclosure.

Subdomains end the debate by making every handle enumerable — via DNS, via TLS SNI, via anyone
trying names. If you build this, item 4 is resolved by force in favour of disclosure and
`challenge`'s hiding becomes decorative. That is a legitimate choice, but make it knowingly rather
than discovering it later.

It also interacts with §9's no-personal-data inventory. A handle is not personal data by itself, but
a handle in a *public hostname* is a permanent, crawlable, third-party-visible identifier. If people
pick their real names as handles, the site publishes a directory of its users. §9 says adding to the
inventory is a spec change; this is arguably one.

**3. Cookies. This is the subtle one.**

The session cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` with **no `Domain` attribute**
(`setCookie` in `worker/session.ts`). That makes it host-only: set on `mcclevarty.ca`, it is **not
sent** to `ada.mcclevarty.ca`. So a signed-in user arriving at a subdomain is anonymous there.

The obvious fix — adding `Domain=.mcclevarty.ca` — is the wrong instinct. It sends every session
cookie to **every** subdomain, including ones controlled by other users. The moment a subdomain
renders anything user-authored, that is a session-theft vector via XSS on someone else's page. The
current host-only cookie is a security property, not an oversight.

The right shape is subdomains that are **public and signed-out** — a read-only profile page, no
session, no cookie. Keep all authenticated surface on the apex.

**Host-only is not enough on its own, and this is the part that has to land first.** `SameSite` is
scoped to the *site*, not the origin, so an attacker-controlled or XSS'd `evil.mcclevarty.ca` is
same-site with the apex and **its cross-origin POSTs would carry the session cookie**. CSRF on this
site currently rests on `SameSite=Lax` alone — there is no `Origin` check anywhere in the Worker —
so shipping any wildcard subdomain silently converts that into a live CSRF surface against
`/api/admin/*` and `/api/account/*`. **Close `TODO.md` #14 before the wildcard route exists**, not
after.

**4. Reserved names need a second, larger list.**

`RESERVED_HANDLES` in `worker/accounts.ts` blocks `admin`, `administrator`, `operator`, `vessel`,
`root`, `system`, `support`, `help`, `api`, `me`, `account`, `machines`, `share`, `null` and
`undefined` — good for handles, insufficient for DNS. A wildcard catches names that already have
jobs in the zone:

- `www` — must fall through to the main site
- `mail`, `mailroot8`, `mailadmin` — **your MX records point here.** A wildcard record does not
  override an explicit one, so existing mail keeps working, but a *handle* named `mail` would be
  confusing and should be blocked. **This was recommended here on 2026-08-12 and never actioned —
  `mail` is still not in `RESERVED_HANDLES`.**
- `_dmarc`, `_domainkey` — TXT records; underscore-prefixed, so the DNS-safe pattern excludes them
  automatically

### Recommendation

**Do not build this during phase 1.** Not because it is bad — it is a nice idea and cheap in code —
but because of ordering. `CLAUDE.md` is explicit that phase 1 has one non-negotiable internal order,
authentication before interface, and that phases must not be collapsed. Subdomains are interface.

**The one decision that had to be made while it was free has been made.** `HANDLE_PATTERN` is
DNS-safe as of `e65cbe5`, so the option stays open and costs nothing to keep open. Three things
remain outstanding before anything could ship, in this order:

1. **An `Origin` check on mutating `/api/*`** (`TODO.md` #14). Non-negotiable — see *3. Cookies*.
2. **`mail` and the other DNS-significant names in `RESERVED_HANDLES`.**
3. **A decision on enumeration** (*2* above), taken knowingly rather than discovered.

If you want to experiment while waiting, the cheapest satisfying thing is Part A — add a tenth page
and watch it render through thirteen layouts, twenty-four palettes and five ornaments. That
exercises the whole token layer and cannot break anything deployed.
