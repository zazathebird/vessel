# Guide — site sections, and per-account subdomains

Written 2026-08-12, in answer to *"a complete guide on all subsections of the site
(`accountname.mcclevarty.ca`) or how to make those."*

That phrasing has two readings and this covers both, because they are genuinely different jobs:

- **Part A — adding a section to the site.** A new page at `mcclevarty.ca/whatever`. Small, well
  understood, about an hour. The site already has nine of these.
- **Part B — per-account subdomains.** `ada.mcclevarty.ca` serving Ada's page. This is **not in
  `SPEC-ACCOUNTS.md`** and is a real architectural addition, not a config toggle. It is buildable,
  but it collides with four things already decided, and one of them is a blocker in code today.

Read Part B's *"Four things it breaks"* before deciding you want it.

---

## Part A — adding a new section (`mcclevarty.ca/whatever`)

Nothing here is speculative; it is how the existing nine pages work.

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
   `SPEC-ACCOUNTS.md` §680: `useOperatorRoutes.ts` cycles `NAV` only, so adding an entry changes the
   operator door's cycling behaviour as a side effect.
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

**3. The Worker route.** In `wrangler.toml`, after cutover:

```toml
routes = [
  { pattern = "mcclevarty.ca/*",   zone_name = "mcclevarty.ca" },
  { pattern = "*.mcclevarty.ca/*", zone_name = "mcclevarty.ca" },
]
```

**This cannot be done before the cutover.** The apex is still served by the Pages project; claiming
the route while Pages holds the domain is how you take the live site down. Cutover first, verify,
then add the wildcard as a separate deliberate change.

**4. The code**, in `worker/index.ts`, before the assets fallback:

```ts
const label = url.hostname.split(".")[0];
const isSubdomain = url.hostname.endsWith(".mcclevarty.ca") && label !== "www";
```

Then look up `accounts` by `handle_lower = label` and serve accordingly. Keep it ahead of
`env.ASSETS.fetch(request)` but behind the `/api/` branch, so the API stays reachable on every
hostname.

### Four things it breaks

**1. A DNS label cannot hold a current handle. This is a blocker, in code, today.**

`worker/accounts.ts:51` is:

```ts
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/i;
```

It permits `.` and `_`. Neither survives a hostname:

- `ada.smith` as a label produces `ada.smith.mcclevarty.ca` — a **two-level** name. Universal SSL
  does not cover it, so it fails with a certificate error, not a 404.
- `ada_smith` is invalid in a hostname outright. Browsers and resolvers reject underscores in the
  hostname position.

So subdomains require either tightening `HANDLE_PATTERN` to `/^[a-z0-9][a-z0-9-]{2,23}$/i`, or
mapping handles to labels. **Tightening is a breaking change** the moment one account exists with a
dot or underscore — which is an argument for deciding this *before* you create real accounts, not
after. Right now the account count is zero and the change is free. That window closes at first
signup.

**2. It broadcasts every handle, and the spec deliberately hides them.**

`CLAUDE.md` already records this as unresolved item 4: signup discloses handle availability via 409
while `challenge` "goes to real trouble to hide it." Subdomains end that debate by making every
handle enumerable — via DNS, via TLS SNI, via anyone trying names. If you build this, item 4 is
resolved by force in favour of disclosure, and `challenge`'s hiding becomes decorative. That is a
legitimate choice, but make it knowingly rather than discovering it later.

It also interacts with §9's no-personal-data inventory. A handle is not personal data by itself, but
a handle in a *public hostname* is a permanent, crawlable, third-party-visible identifier. If people
pick their real names as handles, the site publishes a directory of its users. §9 says adding to the
inventory is a spec change; this is arguably one.

**3. Cookies. This is the subtle one.**

The session cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` with **no `Domain` attribute**
(`worker/session.ts:181`). That makes it host-only: set on `mcclevarty.ca`, it is **not sent** to
`ada.mcclevarty.ca`. So a signed-in user arriving at a subdomain is anonymous there.

The obvious fix — adding `Domain=.mcclevarty.ca` — is the wrong instinct. It sends every session
cookie to **every** subdomain, including ones controlled by other users. The moment a subdomain
renders anything user-authored, that is a session-theft vector via XSS on someone else's page. The
current host-only cookie is a security property, not an oversight.

The right shape is subdomains that are **public and signed-out** — a read-only profile page, no
session, no cookie. Keep all authenticated surface on the apex.

**4. Reserved names need a second, larger list.**

`RESERVED_HANDLES` (`accounts.ts:59`) blocks `admin`, `operator`, `api`, `root` and friends — good
for handles, insufficient for DNS. A wildcard catches names that already have jobs in the zone:

- `www` — must fall through to the main site
- `mail`, `mailroot8`, `mailadmin` — **your MX records point here.** A wildcard record does not
  override an explicit one, so existing mail keeps working, but a *handle* named `mail` would be
  confusing and should be blocked
- `_dmarc`, `_domainkey` — TXT records; underscore-prefixed, so tightening the pattern excludes them
  automatically

### Recommendation

**Do not build this during phase 1.** Not because it is bad — it is a nice idea and cheap in code —
but because of ordering. `CLAUDE.md` is explicit that phase 1 has one non-negotiable internal order,
authentication before interface, and that phases must not be collapsed. Subdomains are interface.

**But do make one decision now, while it is free:** whether to tighten `HANDLE_PATTERN` to
DNS-safe characters. It costs one line today and is a breaking migration after the first real
account. Tightening keeps the option open at zero cost; leaving it permits handles that can never
become subdomains.

If you want to experiment while waiting, the cheapest satisfying thing is Part A — add a tenth page
and watch it render through thirteen layouts, twenty-four palettes and five ornaments. That
exercises the whole token layer and cannot break anything deployed.
