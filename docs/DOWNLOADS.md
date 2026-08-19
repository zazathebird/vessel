# Downloads — the operator's loop

Built 2026-08-19 at the client's request: *"a downloads page which I will be using to offer my
programs… I want to charge for them, but also be able to give them to people for free should I
choose to."*

`CLAUDE.md` holds the invariants. This is the runbook.

---

## What the design does and does not hold

**It holds no personal data, and that was the point of the question that started it** (client:
*"Will it require me to keep data?"*). The answer is no, and here is the whole of what is stored:

| Table | Fields |
|---|---|
| `download_codes` | an HMAC of the code, a note you type, an optional item id, four timestamps, two counters |

No name. No email. No address. No payment reference. No IP. No purchase record. `SPEC-ACCOUNTS.md`
§9's inventory of personal data is **unchanged** by this feature, which is the strongest claim any
part of this site makes and the reason payment stays out of band.

**A code is a bearer token, like a cinema ticket.** Whoever holds it can use it; it is tied to no
one. That is a deliberate trade against the alternative — accounts — which would mean collecting the
identity this design exists to avoid. If somebody loses theirs, you revoke and mint another.

**The one field that could break this is the note.** It is free text. Typing a customer's name or
email into it puts personal data in a table whose entire claim is that it holds none. The admin
screen says so at the point of entry; a date and an amount identifies the row perfectly well.

---

## One-time setup

Two things, once, before the first deploy that includes this.

**1. Create the bucket.** It must be private — no public URL, no custom domain on it. The only path
to a byte is the Worker, after a code check, and that is what makes the gate real rather than
decorative.

```sh
wrangler r2 bucket create vessel-downloads
```

**2. Apply the migration.**

```sh
wrangler d1 migrations apply vessel --remote
```

> **Note for whoever holds the token:** this repo's wrangler token can deploy but *cannot* query D1
> remotely — `--remote` reads fail with *"not authorized to access this service [code: 7403]"*
> (`TODO.md` 3b). If the migration is refused for the same reason, apply it from the D1 console in
> the Cloudflare dashboard by pasting `migrations/0005_downloads.sql`.

---

## Adding a program

Three steps, and none of them can half-happen — a file with no catalogue entry is invisible, and a
catalogue entry with no file says so honestly rather than 404ing.

```sh
# 1. Upload the bytes. The object key MUST equal the catalogue id exactly.
wrangler r2 object put vessel-downloads/startup-sweeper --file ./StartupSweeper.exe

# 2. Add the entry in src/data/downloads.ts
# 3. Deploy
npm run deploy
```

The entry:

```ts
{
  id: "startup-sweeper",          // the R2 key AND the URL value — lowercase-kebab, never renamed
  name: "Startup Sweeper",
  blurb: "Turns off the twenty things that decided they should launch when your computer does.",
  platform: "windows",            // windows | linux | android | script | any
  version: "1.4",
  size: "2.1 MB",                 // written by hand; the page renders before any request
  filename: "StartupSweeper.exe", // what the visitor's browser saves it as
  free: true,                     // omit for a paid item
  author: "…",                    // ONLY if you did not write it — see below
  caveat: "Needs to be run as administrator.",
}
```

`npm run check` refuses an id that is not lowercase-kebab, a duplicate id, and a filename with no
extension. All three are failures that would only surface after somebody had paid.

**`id` is a wire format.** It is the object key and it appears in links people keep. Add ids; never
rename one.

### If you did not write it

`author` exists to make the question impossible to skip. **Redistributing somebody else's software
is that software's licence's call**, and a lot of standard repair-toolkit utilities — including
things that are free to download — forbid redistribution outright. The site cannot check this and
neither can the check suite. It is a per-item judgement and it is yours.

---

## Selling one

1. Somebody asks. You agree a price and they e-transfer you.
2. Sign in → **Admin** → *Download codes*.
3. Fill in the note (*"e-transfer, 19 Aug, $40"*), pick what it unlocks, set uses and expiry, and
   press **Mint a code**.
4. **Copy the code and send it.** It is shown once and is then unrecoverable — the database holds
   only an HMAC of it, exactly as it does for passwords. If you lose it before sending, revoke that
   row and mint another.
5. They type it into the box on `/downloads` and the rows it covers unlock.

**Uses default to 5.** A code travels by email or text and lives in somebody's sent items for ever;
a small allowance covers a failed download, a second machine and a re-download next year, while a
code posted to a forum stops working. Raise it per code if you like.

**Expiry defaults to never.** Set days when you want the gentler alternative to revoking.

### Giving one away

Two ways, and they answer different questions:

- **To everybody, permanently** — set `free: true` on the entry and deploy. No code, one click.
- **To one person** — mint a code scoped to that item. Set uses to 1 if you want it to be genuinely
  one person.

---

## What a visitor sees

- A notice about unsigned Windows binaries, shown **only when the catalogue actually contains
  one**. It says the SmartScreen warning is real and doing its job, and draws the one honest
  distinction: *you came here and clicked it; nobody rang you.* This page must never become the
  counterexample to `/scams` — do not soften it, and do not move it below the list.
- The catalogue as a manifest: name, blurb, and then platform · version · size in mono.
- A code box, shown only when there is something paid to unlock.
- Rows marked open with an accent rule. Every row reserves that rule's width, so unlocking changes
  a colour and moves nothing.

---

## Things that are decisions

- **A footer link, not a nav pill.** `setup`'s precedent. `NAV` is what `useOperatorRoutes` cycles
  and what Radial's orbit renders, so a pill there changes arrow-key paging and the dial for
  everybody. Revisit if selling becomes a real part of the business — a shop nobody can find is a
  shop that is not open.
- **The download is a plain anchor to a plain URL**, not a `fetch` into a `blob:`. `saveBlob` in
  `MachinesPage.tsx` is the one line still holding up the CSP flip to enforcing; this page
  deliberately does not add a second. It also means the browser's own download manager owns the
  transfer, shows progress, and can resume — the Worker passes `Range` straight to R2 for exactly
  that reason, because these files are large and the people downloading them are on the connections
  that made them ring you.
- **Redemption is rate-limited** on the same Durable Object as sign-in. A 12-character code is 60
  bits, which nobody guesses — but only because guessing is throttled.
- **Every failure gives the same message.** Unknown, expired, revoked and exhausted are one
  refusal, because distinguishing them tells somebody feeding in guesses that a code *exists*.
- **No prices on the page.** The site names no figures except the client's own rate on `/home`, and
  a price list would be the first. Prices are settled in the conversation that ends in an
  e-transfer.

---

## Not built, deliberately

- **A checkout.** Adding one means either a processor holding your customers' data, or you holding
  it. The whole design above is what "no" to that question buys.
- **Thumbnails or screenshots.** Would want image storage and an `img-src` widening, and the
  catalogue reads fine without them.
- **Automatic sizes.** Reading each object's size at render would put a fetch on the boot path and
  reflow the list under the reader's thumb. Type it in.
