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
| `download_codes` | an HMAC of the code, a note you type, an optional item or page scope, four timestamps, two counters |
| `download_pages` | a page you wrote: address, title, prose, which look, who can see it, draft or live |
| `download_blocks` | the free-form blocks on such a page |
| `download_files` | a file's name, blurb, platform, version, filename, size and free/paid flag |
| `download_grants` | an account id, and which page or file it opens |

No name. No email. No address. No payment reference. No IP. No purchase record. `SPEC-ACCOUNTS.md`
§9's inventory of personal data is **unchanged** by this feature, which is the strongest claim any
part of this site makes and the reason payment stays out of band.

**The sub-pages added on 2026-08-20 add nothing to that inventory either.** A grant references an
account id, and an account is a handle somebody chose — §9 already covers it. There is still no
row anywhere that says who bought what.

**A code is a bearer token, like a cinema ticket.** Whoever holds it can use it; it is tied to no
one. That is a deliberate trade against the alternative — accounts — which would mean collecting the
identity this design exists to avoid. If somebody loses theirs, you revoke and mint another.

**The one field that could break this is the note.** It is free text. Typing a customer's name or
email into it puts personal data in a table whose entire claim is that it holds none. The admin
screen says so at the point of entry; a date and an amount identifies the row perfectly well.

---

## One-time setup

**Both steps are done** (2026-08-19, by the client): `vessel-downloads` exists, and
`wrangler d1 migrations list vessel --remote` reports nothing left to apply. Kept here because it is
what a fresh environment — or a second Cloudflare account — needs, and because the bucket's
privacy is a standing rule rather than a step.

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

> **Note for whoever holds the token:** this repo's wrangler token can deploy but has historically
> *not* been able to query D1 remotely — `--remote` reads failed with *"not authorized to access
> this service [code: 7403]"* (`TODO.md` 3b). `migrations list --remote` and `migrations apply
> --remote` do work as of 2026-08-20. If either is ever refused again, apply the migration from the
> D1 console in the Cloudflare dashboard by pasting the file.

**`0006_download_pages.sql` is the sub-pages migration** (2026-08-20) and must be applied before the
deploy that includes them, or every downloads route answers with a database error. It is purely
additive — four new tables and one nullable column on `download_codes` — so it cannot lose anything
that is already there.

---

## Building a page

**Everything below happens in the browser. There is no deploy and no terminal** (2026-08-20, at the
client's request). Sign in → **Admin** → *Downloads pages*.

1. **Pick "New page…"** and give it a title and an address. The address becomes
   `/downloads/<address>` — lowercase letters, numbers and hyphens — and **it cannot be changed
   later**, because it is what any link you have handed out points at.
2. **Choose a look.** Four, and they are the same facts arranged differently:
   - **List** — a manifest. The plainest, and the right default.
   - **Cards** — a box each, two across. Better for a few substantial programs than for a long list.
   - **Sheet** — dense and mono. For a reference page of many small scripts.
   - **Free-form** — you build the page out of blocks: headings, paragraphs, bullet lists and file
     groups, in whatever order you like.
3. **Choose who can see it** — see *Who can see what* below.
4. **Save** keeps it exactly as visible as it already was. **Publish** is the one that puts it live.
   A draft renders for you and 404s for everybody else, so you can build it in the open.

Switching between looks never destroys anything: the structured intro and the free-form blocks are
stored separately, so you can move back and forth and find your text where you left it.

### Putting a file on it

Fill in the row under *Files on this page* and pick the file. It uploads straight into the private
bucket in 8MB chunks with a percentage as it goes, so a large program on a domestic upstream is a
wait rather than a mystery. Nothing about it is capped by the size of the file.

- **Id** — lowercase-kebab, and the same wire format it always was: it is the object key and it
  appears in links people keep. Add ids; never rename one.
- **Filename** — what the visitor's computer saves it as, and the one place the extension is
  decided. A name with no extension is refused, because it would arrive as a file Windows does not
  know how to open.
- **Free** — one click, no code. Leave it off and the file needs a code or a grant.
- **Group** — only used by the free-form look, to say which *files* block a file belongs under.
- **Size is measured from the uploaded object**, not typed. (The old catalogue could not do this and
  said so; a page fetched from the database already has the number in the same response.)

If an upload fails halfway the row stays but the file is not offered to anybody — you will see it
listed and nobody else will. Upload it again.

### If you did not write it

`author` exists to make the question impossible to skip. **Redistributing somebody else's software
is that software's licence's call**, and a lot of standard repair-toolkit utilities — including
things that are free to download — forbid redistribution outright. Nothing here can check this and
neither can the check suite. It is a per-file judgement and it is yours.

---

## Who can see what

Four settings per page, and two of them are worth understanding properly.

| Setting | Who gets in |
|---|---|
| **Anyone — listed** | Everybody. It appears on `/downloads`. |
| **Anyone with the link** | Everybody who knows the address. Not listed anywhere. The secret is the link, and that is all it ever claims to be — treat it as "unlisted", not as "private". |
| **Needs an access code** | The page tells a stranger it exists and is locked, and hands over nothing until a code is typed in. |
| **Only people I have named** | Nothing at all to anyone else — it 404s, exactly like a draft, because the existence of a page named after a customer is itself the thing being kept quiet. |

**A file keeps its own free/paid switch on top of that.** A public page full of paid files is the
shape the site already had, and it still works: the page reads, each locked row says *needs a code*.

### Codes and named people answer different questions

- **A code** needs no account. It is a bearer token — whoever holds it can use it — which is exactly
  right for a one-off sale to somebody you will never see again, and it is the reason this feature
  holds no personal data.
- **A named person** signs in with an account. Use it for somebody who comes back: a customer on a
  retainer, or another technician you share tools with. Set it to expire or leave it open-ended.

Both are in the editor: *Who can see this page* is the named list, and codes are minted from
*Download codes* further down the admin page.

## Selling one

1. Somebody asks. You agree a price and they e-transfer you.
2. Sign in → **Admin** → *Download codes*.
3. Fill in the note (*"e-transfer, 19 Aug, $40"*), pick what it unlocks — everything paid, or one
   whole page — set uses and expiry, and press **Mint a code**.
4. **Copy the code and send it.** It is shown once and is then unrecoverable — the database holds
   only an HMAC of it, exactly as it does for passwords. If you lose it before sending, revoke that
   row and mint another.
5. They type it into the box on `/downloads`, or on the locked page itself, and what it covers
   unlocks. A code minted for a page opens that page and everything on it; a code minted for a
   single file opens that file **and the page it lives on**, because the page is where the download
   button is.

**Uses default to 5.** A code travels by email or text and lives in somebody's sent items for ever;
a small allowance covers a failed download, a second machine and a re-download next year, while a
code posted to a forum stops working. Raise it per code if you like.

**Expiry defaults to never.** Set days when you want the gentler alternative to revoking.

### Giving one away

Two ways, and they answer different questions:

- **To everybody, permanently** — tick *Free* on the file. No code, one click, live immediately.
- **To one person, no account** — mint a code scoped to that page. Set uses to 1 if you want it to
  be genuinely one person.
- **To one person, who comes back** — give their account name access under *Who can see this page*.

---

## What a visitor sees

- An index of your pages, one card each, and a code box under it.
- On a page: its title, your prose, any warning box, and the files.
- A notice about unsigned Windows binaries, shown **only when that page actually contains
  one**. It says the SmartScreen warning is real and doing its job, and draws the one honest
  distinction: *you came here and clicked it; nobody rang you.* This page must never become the
  counterexample to `/scams` — do not soften it, and do not move it below the list.
- The files as a manifest: name, blurb, and then platform · version · size in mono.
- A code box, shown only when there is something on the page still locked.
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
- ~~**Automatic sizes.**~~ **Built 2026-08-20**, and the objection it carried went away with the
  catalogue: the size was hand-typed because the page rendered from the bundle *before* any request,
  so a measured size would have arrived late and reflowed the list. A page now arrives from the
  database with its files in the same response, so the real size is already there. It is read from
  the uploaded object, which means it cannot be wrong.

- **Rich text or HTML in a page.** The free-form look is four kinds of block with no markup. An HTML
  box would be an XSS hole the first time something was pasted in from a website, and it would let a
  page opt out of the palette system that keeps every surface on this site recolouring together.

- **Renaming a page's address or a file's id.** Both are wire formats — they are in links people
  keep. Make a new one.
