# TODO

The single ordered backlog. `CLAUDE.md` explains *why* things are the way they
are, and `docs/DECISIONS.md` records what was decided when; this file is only
what is left to do.

---

## 2026-08-26 (evening) — rounds 4 and 5 of the copy review, run at last

The copy overhaul ran three rounds and stopped. **Round 4 (voice consistency across
all seventeen pages) and round 5 (a cold read of the two safety pages) never ran.**
They have now. Round 5 was run as two cold readers who were given the page text and
nothing else — no `CLAUDE.md`, no repo — and told to read as the people the pages are
actually for.

`npm run check` is **43 green** with the three fixes below applied.

### Applied this session, no sign-off needed

- **`gallery`, the capacitor block** — a three-turn run-on with a dashed aside inside a
  dashed aside; the third clause was a comma splice hiding behind an em-dash. Split into
  three sentences, every word of content kept, end-stress moved onto "got it wrong."
- **`changelog` v2.4** — "Nothing underneath it changed — same as a new laptop" is an
  allusion the reader has to decode, and it parses backwards on first pass. Now "…which
  is also true of most new laptops": names the target, and points the joke outward at
  the shops, which is where this site's jokes go.
- **`now`'s search snippet** — it promised "what came off it this week", and the page has
  no such section. It also said "on the bench", which is the thing that turned out not to
  exist. Replaced with a line that describes what the page actually holds.

---

### `/setup` — the cold read found a functional defect, not a copy problem

**1. The Tailscale instructions do not work as written. This is the top item on the page.**
"Sign in with your Google, Microsoft or Apple account" puts the machine on **the
customer's own tailnet**, which the operator is not on, and "Tell me the name it gives
the machine" is meaningless across tailnets — there is no lookup by name from outside
one. A customer who follows all five steps ends up with Tailscale installed, signed in,
and no connection to anywhere. For it to work, one of two steps has to happen and
neither is on the page: the customer **shares the device** out of their tailnet, or the
operator **invites them into his**. **Which one does he actually do?** The steps cannot
be written correctly without that answer.

**2. Tailscale is a network, not a screen-sharing tool, and the page never names the
program that actually shows the screen.** So even with the step above fixed, the
instructions stop one program short of the goal.

**3. "Screen sharing across it still asks you first" is a promise Tailscale does not
make.** Whether anything asks depends entirely on what is bolted on top: Remote Desktop
asks nobody and locks the local screen, an unattended VNC asks nobody. The same
overstatement is in "[what i can see]": *"every one of these asks you to allow it before
it shows me anything"* is a claim about **software**, welded to *"I will not set any of
them up to connect without asking"*, which is an honest personal promise and is the half
doing the work. Presenting the promise as a property of the tools takes away the reader's
ability to check it — and hands a scammer the line *"don't worry, it always asks first."*

**4. "it stops existing the moment you close the window"** — false. The Quick Assist
session ends; the app stays installed and stays in Start. The true version is nearly as
reassuring: it can do nothing until you open it and type a fresh code.

**5. "Quick Assist, already on your machine" / "Nothing to install"** — true on Windows 11,
often not on Windows 10, where it comes from the Microsoft Store. The commonest stall on
the page ("I typed it and it just offered me a web search") has no answer on the page.

**6. The page's own scam rule fires on the page's own workflow.** The rule is *"If they
rang you, it's a scam"* and *"The one difference that matters is who started it: you rang
me."* But the customer **emailed** — the CTA says so — and the next thing that happens is
the operator ringing *them* and a voice reading out a code. The one rule the reader is
meant to apply under pressure goes off on the legitimate repair. The fix is the callback,
which `/scams` already teaches: however the call started, hang up and ring back on the
number you already have, and *then* the code.

**7. "I read you the code over the phone, you type it in" is the scam script verbatim,**
now endorsed on the reader's own technician's site with no condition attached. Microsoft
has documented criminals running Quick Assist exactly this way. One clause fixes it — the
code is only ever given on a call the customer placed.

**8. There is no "I will never ask you for your password."** The page has the gift-card
equivalent and it is the best line on it. The password pledge is missing, on a page whose
own instructions tell somebody to sign in to their Google or Microsoft account because a
technician told them to.

**9. Missing, and each one costs an email:** the Quick Assist code expires; the UAC prompt
the customer must click themselves; whether their mouse gets taken over ("take full
control" vs "view screen"); Tailscale's **tray-icon Disconnect**, which is the off switch a
nervous person most wants and the page only offers uninstalling; that Tailscale shows
nothing while idle, so the machine looks identical whether or not anyone is connected; and
anything at all about afterwards — above all *"don't type passwords or open your bank while
I'm looking"*, which is one line and the most valuable sentence not on the page.

**10. Uncertain, flagged not asserted:** whether Apple is offered as a Tailscale sign-in;
the exact Quick Assist code expiry; whether the free tier covers commercial use. **The free
tier line should come out regardless** — it is a claim about somebody else's pricing, it
dates, and it is not the customer's problem.

**Genuinely right, and worth not losing:** the scam block is *second, before any
instruction* — that ordering is the best decision on the page; *"They will talk you into
installing exactly the kind of program this page describes — the same programs, by name"*
buys real credibility; recommending the throwaway tool first and the persistent one only
for repeat work is the correct order; and *"You don't have to tell me first."* settles who
is in control better than the whole "what I can see" block does.

---

### `/scams` — long, and four emergency instructions are in the tail

`CLAUDE.md` says this page is deliberately left almost alone. **Nothing below is a
"finish" of it** — they are an ordering problem, one wrong absolute, and one contradiction
with another page. All want the client's nod first.

**1. "None of that survives a reload. Not one pixel of it." is the one line here that can
cost somebody money.** The DOM-editing refund scam is described correctly, but there is a
second, well-documented variant where the scammer moves the victim's *own* money between
their *own* accounts, so the "overpayment" is a real transaction. That survives a reload
**and** survives checking on a second device. A reader who refreshes, sees the money still
there, and concludes the overpayment is genuine sends it — the exact outcome the block
exists to prevent. The absolutism is what makes it dangerous rather than merely incomplete.

**2. The bank call is bullet 6 of 6, below "Shut the computer down".** The page itself says
money "can sometimes be stopped in the first hours and almost never after that." The most
time-critical instruction on the site is last in the only block a panicking reader finishes.

**3. The site tells you no legitimate company ever asks for an e-transfer, and then asks
you for one.** *"Things no real company will ever ask you for… There is no exception to any
of these… not ever"* lists "wire transfer, e-transfer" — while `/downloads` says *"send an
e-transfer and a code comes back"* and the $150 is presumably the same. The neighbouring
remote-access bullet is already scoped ("when they contacted you first"); this one is not.
Splitting it keeps the absolute where it is true and scopes it where it is not:
  - *Payment in gift cards, cryptocurrency, or cash handed to a courier* — stays absolute
  - *A wire transfer or an e-transfer to somebody who rang you* — scoped
  The gift-card absolute earns its keep and must not be softened.

**4. Changing the email password does not evict them.** Forwarding rules, added recovery
addresses and added recovery phone numbers all survive a password change and are the
standard persistence trick after a screen-share. Nothing says to check for them, to sign
out other sessions, or to turn on two-factor. Also absent site-wide: a fraud alert with
Equifax and TransUnion, which is standard Canadian advice after details are handed over.

**5. The shame surface is in the scanned positions.** A scanner reads headings and first
lines. Block 6's first line is *"People assume victims are gullible."* — the accusation
arrives inside the reassurance. The lede opens by sorting the reader into a demographic
("older people") before helping them. *"If you have **actually** lost money"* divides
readers into real victims and fussers. On a page whose own thesis is that shame is the
mechanism, these are worth an hour.

**6. Three instructions a frightened non-technical reader cannot follow:**
  - *"unplug the network cable or switch off the Wi-Fi"* — neither branch names a findable
    physical object, and "the Wi-Fi" points at a setting **inside the machine the attacker
    is driving**. The router is never named.
  - *"Ctrl, Shift and Escape opens Task Manager, then End task on the browser"* — assumes
    they know their browser's name in a process list, and puts a panicking person somewhere
    the adjacent wrong click is worse. Block 2's own fallback (hold the power button in) is
    not offered here.
  - *"hold Ctrl and press W"* — these pages throw a "Leave site?" dialog, so the reader
    presses the keys, sees a box, and concludes it did not work.

**7. Order and position, in descending value:** the emergency block is *third*, behind the
lede and two CTAs, of which the first is **"Get my machine checked →"** — a repair
business's sales button above "hang up", which is the one thing on the page a sceptic
would hold against it. The recovery blocks run *least bad → worst* (26→27→28), so the
reader in the most trouble travels furthest. "Emergency, or somebody is at your door: 911"
is block 31, seventeen blocks after cash-by-courier is first named. The pop-up close
sequence is block 20, though the eyebrow — *"read this before you call anyone"* — is
addressed to the person staring at a pop-up right now.

**8. Verified, and the page is right:** `reportcyberandfraud.canada.ca` **is live (HTTP
200)** — a cold reader doubted it, and the doubt was wrong. `1-888-495-8501` (CAFC),
`1-888-310-1122` and `1-888-310-1133` (OPP non-emergency and TTY) all match. Escape
dropping full-screen, Command-Option-Escape, declining session restore on reopen, "ask
them to attempt a recall", and ringing gift-card issuers with the receipts are all correct.
The grandchild block is complete and correctly ordered. **The page's hours and that URL
want a re-check date on them**, since both can move without anything looking wrong.

**9. Two small ones:** *"Twenty minutes that make you a hard target"* is followed by seven
items including a trip to the bank in person — a careful reader clocks that. And the
recorded-line paragraph in block 10 spends fifty-five words on a one-directional inference
that its own bullet nine lines later states flatly, contradicting it.

**The three strongest lines on the site are on this page** and should survive any edit:
*"The problem is never the program — it is who asked you to install it, and why."*;
*"Hang up and ring your grandchild on the number you already have… ring their parents — the
people you were told not to ring."*; and *"My terms are on the contact page and they do not
change because you have had a bad week."* The last is the reason none of this reads as
fear-marketing, and it is in block 29 of 33.

---

### Round 4 — voice consistency across the seventeen pages

**The voice is holding.** Its mechanics are consistent page to page: short declaratives,
concrete numbers over categories, first-person singular, the negative-construction pitch
("No forms, no queue, no ticket number" / "No client names, no photographs of anybody's
living room" / "No name, no face, no city"), and the block's last sentence carrying a turn
that points **outward** — at chains, depots, commission, Microsoft — never at the operator.
The reversal held: there is no self-deprecation left to find. `contact` and the pricing
block are deliberately the plainest copy on the site, which is the right call and reads as
judgment being exercised rather than as inconsistency.

What drifted:

1. **`/downloads` still carries the promise this file records as cut.** Item 1 below says
   "Cut." It was not — it was **reworded**, and the permanence half survived: *"Shareware,
   the old way: pay once, and nothing here turns into $9.99 a month."* Verified as written
   *this session* (a `+` line in `b1201c9`). This is the shape `CLAUDE.md` warns about by
   name: a retired promise rebuilt without its words. Weaker than "nothing renews" —
   "pay once" is about recurrence, not permanence — but `expires_at` / `max_uses` /
   `revoked_at` still exist, and item 1 asks the client a question the live copy has already
   answered "yes, permanently" on his behalf.
2. **The 486 is still `/about`'s origin story**, and was *rewritten* this session, not
   removed. This file records it under *Answered already* as "gone with `/now`" — it went
   from `/now` only. It is inherited handoff content with exactly the provenance question
   of item 8, and it is now written down as closed. **Was the first machine he took apart
   really a 486?**
3. **The years number is still four phrasings over six surfaces** — "twenty-odd" (home
   eyebrow), "Over twenty" (home block), "Twenty-odd" (about title), "Twenty-plus" ×3 and
   "twenty years" ×1 (snippets). That is item 6, entirely unfixed. Worth unifying the
   *wording* even before he supplies the number, so his answer is one edit instead of six.
4. **`guestbook` is the last content page whose eyebrow does not say what the page is** —
   "1999 revival" over "Sign nothing." Both halves are flavour, and a stranger can name
   neither. That is the exact rule home's eyebrow was changed to satisfy (the comment above
   it in `pages.ts` sets it out), and `notfound` is explicitly exempt because it pairs its
   flavour with its own translation.
5. **"the bench" survives in four places** — home ×2, and the `about` and (until this
   session) `now` snippets — after the bench turned out to be aspirational. As a figure of
   speech for "where I work" it may be fine; it is his call, and it should be made once.
6. **`changelog`'s snippet is its own lede reworded** ("kept for the same reason people keep
   receipts" against "for the same reason people keep receipts"). A lede is read after an
   eyebrow and a headline; a snippet arrives cold and has to do a different job.
7. **`gallery`'s video block describes a sound, and its tile label says "muted loop"** — on
   top of the existing note that no clip exists anywhere in `public/`. The contradiction is
   visible on the page as it stands.

---

## 2026-08-26 — the copy overhaul, and eight questions only the client can answer

The whole site's text was rewritten this session (see `docs/DECISIONS.md` for
what and why). `npm run check` is 43 green. **What is left is not work — it is
eight facts nobody but the client can supply.** Each one is currently rendering
the *safe* reading, so the site is publishable as it stands; every answer either
confirms what is there or replaces it with something better.

**Answered already:** the bench (there isn't one yet — a bin of parts and two
laptops, so `/now` and `about` were rewritten to that), the privacy line (his own
wording, now on home and in the search rotation), and the 486 — **but the 486 went from
`/now` only and is still `/about`'s origin story**; see round 4 item 2 above.

1. **Downloads: "pay once, nothing renews."** **Not cut — reworded, and "pay once"
   survived**; see round 4 item 1 above. `download_codes` carries
   `expires_at`, `max_uses` and `revoked_at`, so the page was promising something
   the software can take back. **Does he want that promise on permanently?**
2. **Contact: "you will usually hear back within a day."** Inherited, and a
   service level he has to honour on his worst week. Home dropped its equivalent
   in this session; contact kept it. **Keep, soften, or drop?**
3. **Guestbook numbers** — "a five-year-old laptop that now starts up in nine
   seconds" and "the sand laptop, six months on". Both predate this session and
   neither traces to anything. **Real, or handoff placeholders?**
4. **`work`: "It has run for two years since."** Changed to "ever since", which
   cannot go stale. **If two years is true it is the better line** — and it will
   need re-checking every year it stays.
5. **"The same record I keep of what was done to your machine."** Cut from the
   changelog lede: it advertised a per-machine record-keeping service nothing
   else on the site mentions. **Does he keep written notes per machine?** If so
   it is worth having, and not only on the changelog.
6. **How many years?** The site said "twenty-odd", "over twenty", "twenty years"
   and "twenty-plus" in four places, and one block implied paying Microsoft since
   the nineties — nearer thirty. **One number, and it goes everywhere.**
7. **The Kevin joke** — "no chat window operated by a man named Kevin who is not
   named Kevin", on home and in a search snippet. It trades on offshore support
   staff using anglicised names, which is adjacent to the accent framing the
   client **already declined** for `/scams` ("accent is not who started the
   call"). One agent retired that joke on the safety page in the same session
   another put a version of it on the front page. **His call, made once already
   in the other direction.**
8. **Are `/work`'s six case studies his, and are the five guestbook quotes real?**
   The flooded drive at 94%, the cracked solder joints, three routers, the
   ransomware backup, the sand laptop, twelve office machines. **This is the most
   important one on the list.** The bench turned out to be aspirational, so the
   provenance of the page that tells a stranger *he can actually do this* can no
   longer be assumed. If any of it came from the design handoff rather than from
   real jobs, it is fabricated evidence of capability and has to go or be
   replaced with real ones.

### Also outstanding from this session, and not blocked on anybody

- **`/now` has an owner's job attached to it now.** It lists two real machines. A
  `now` page goes stale by sitting still, and a stale one is worse than none.
- **The gallery describes a video that does not exist** — there is no clip
  anywhere in `public/`. The copy was reworded to describe the sound rather than
  a recording, but eight seconds of a dying fan bearing would earn its place.
- **`/gallery`'s drive-shelf block says "Forty hard drives"; its `imgAlt` describes
  five.** (Recorded here against `/work`; the block is on `/gallery`, `pages.ts:241`. The
  photograph really does show five, so the alt text is right.) Pre-existing and
  defensible — the alt describes the placeholder photograph, not the claim — but a
  screen-reader user gets two different counts.
- ~~**Deploy.**~~ **Done.** Deployed, Search Console property verified, sitemap submitted
  (11 pages), home page in the priority crawl queue. Live copy confirmed serving one
  description tag. Google re-crawls on its own schedule from here.

## 2026-08-23 — the sharing host has a setup script

**Client:** *"i have the pc ready for the linux install that will run my file
sharing. pls make me the setup script. make sure EVERYTHING is included. then
check for errors 10 times. make sure you leave no security holes open."*

**`scripts/thinkcentre-setup.sh`** — the x86/Debian sibling of `pi-setup.sh`,
which hard-refuses on anything that is not a Raspberry Pi. Run it as your
ordinary user on the ThinkCentre once Debian is installed; it refuses if you run
it with sudo, because the Chromium profile that holds the folder handle belongs
to your account and in root's home the desktop would never see it. Re-running it
is safe and is the point: every step says `(already done)` when there is nothing
to do.

`docs/thinkcentre-sharing-host.md` now has a **"The script"** section listing
what it covers and what it still refuses to touch. The short version of the
refusals: it does not format or mount a disk, does not write `/etc/fstab`, does
not install Samba, does not open a port beyond SSH, does not add you to the
`docker` group (that group is root-equivalent and this box autologins), does not
pair the machine — §6 cannot be scripted on any hardware — and does not phone
home.

**Three things it does that the guide never did, and that matter most:**

1. **The browser is locked to your site.** This machine boots into a browser
   signed in as you, so it can now reach `mcclevarty.ca` and nothing else, with
   no password manager, no Google sign-in, no profile sync and no DevTools.
2. **Chromium gets its own upgrade window**, Sundays at 04:00, which restarts the
   tab afterwards and only if the version actually moved. It is excluded from the
   automatic security updates because those would replace the binary under a
   running browser at an hour nobody chose. Change the hour to one you would be
   happy for sharing to blink out in.
3. **The clock is disciplined**, because sign-in here is password + TOTP and a
   drifted clock fails with "wrong code" — which sends you looking at your phone
   rather than at the machine.

**Ten verification passes were run against a mocked Debian** — the script runs
end to end there, and every refusal, option and failure path was exercised. Six
real bugs were found and fixed; two of them mattered:

- **The firewall was never actually enabled.** The test for "is ufw already on?"
  was a substring match, and `inactive` contains `active` — so on a fresh machine
  the script would report a closed firewall in its own summary and have none.
- **`--verify` always exited 0**, including when a check failed. The cleanup
  handler's own exit status was replacing the script's, so the one command whose
  job is to report a bad state always reported a good one.

**Wants your eye, because I cannot run it from here:** it has never been run on
real hardware. Run it, read the summary it prints, then reboot and run
`./scripts/thinkcentre-setup.sh --verify` having touched nothing — that is the
state the machine spends its life in and the only test of it that means
anything.

---

## 2026-08-20 — a review of the recent work, and sixteen more bugs

**Client:** *"yes, have prices as a toggle. and whatever else you can think of
for a downloads page. also please review all recent work for bugs."*

**Prices were already a per-page toggle**, off by default, so nothing changed
there.

**Added:** picking a file now fills in its id, name and platform from the
filename; the editor has the page's link with a Copy button and a QR for
somebody standing next to you; a search box appears on pages of eight files or
more; anything added in the last thirty days is marked **new**; and each card on
`/downloads` says how many files are on it.

**Reviewed the last week of commits and found sixteen bugs**, twelve in the
downloads Worker and four in the duel. All fixed, all gated. The ones worth
knowing about as the person who runs this:

- A file with an accent or a non-Latin character in its name — `Réparation.exe` —
  **saved fine and then failed to download, for ever.** It now works properly.
- Resuming a big download was broken for the tools that do it (`HEAD` answered
  "no such endpoint"), and an already-finished download could get a malformed
  reply. Both fixed — these matter for the 300MB files going to people on poor
  connections.
- **Deleting a page did not delete the codes minted for it.** Since a page
  address can be reused, an old customer's code could come back to life on a new
  page at the same address and open somebody else's files. Deleting now means it.
- Minting a code for a page set to *Only people I've named* used to succeed and
  then open nothing. It is refused, with a message saying what to do instead.
- The revoke handle was short enough that two codes could collide, which would
  have revoked the wrong one silently. It is wider now and checked.

**Nothing here changes anything you have already set up**, and migration `0007`
is still the only one that needs applying.

**One thing I left alone and want you to know about:** the duel's fairness check
fails at random about once in every 370 runs, on correct code, because it samples
a fresh fight each time. `npm run check` runs before every deploy, so a deploy can
fail for no reason. The fix that looks obvious — loosening the threshold — would
weaken the check that guarantees neither fighter is favoured, so I have not
touched it. Say the word if you would rather it were made deterministic.

---

## 2026-08-20 — downloads: categories, prices, filters, sort, and eight bugs

**Client:** *"review the downloads page. make sure there are no bugs. I need
complete control of everything about this page from my admin panel/page.
descriptions/prices, categories, filters, sort by, with an icon for each
category. anticipate all types of software… or just have an upload portal."*

**Built.** Twenty-one categories with a drawn icon each, a price per file, a
filter row and a sort control, and — the gap the review turned up — the ability
to **edit a file after uploading it**, reorder files and pages, and mint a code
for one file. `docs/DOWNLOADS.md` is the runbook and has the whole loop.

**Migration `0007` must be applied to production D1 before or with the deploy.**
Additive only, and every default is the behaviour the page already had:
`npm run db:migrate:remote`.

**Two things want your decision, not mine:**

1. **Prices are off by default, per page.** This reverses the "no prices on the
   page" rule, deliberately and on your word — but only as far as giving you the
   switch. Nothing shows a figure until you tick *Show prices* on a page. There
   is still no Buy button and nothing takes money; a price is a fact in the same
   mono line as the file's size.
2. **A `code`-gated page is now listed on `/downloads`** as locked, showing its
   title and one-line summary to a stranger. It was silently invisible before,
   which made it a second *unlisted* — and somebody holding a code has to be told
   where to type it. If you would rather a paid page be invisible, that setting
   already exists and is *Only people I've named*.

**Still wants your eye**, because I cannot judge it for you: whether the
twenty-one categories are the right twenty-one for what is actually on your
memory stick, and whether any of the icons is ambiguous to somebody who did not
draw it. Ask for more categories if something does not fit — adding one is
cheap; renaming one is not, because the names are stored against your files.

---

## 2026-08-20 — downloads sub-pages, built

**Client:** *"i am going to have a few subpages in it… i want to be able to
design and name them as i want… each page will be able to host files… even more
granular options that i can set, for each user on what they can see."*

**Built and proven end to end** — the harness drives it against a real Worker,
real D1 and real R2, comparing the served bytes against the uploaded ones and
checking every one of the four visibilities from the outside, as a stranger with
no session (336 checks, `npm run test:auth`).

What it does: pages you name and address yourself, four switchable looks (one of
them free-form blocks), files uploaded from the browser in chunks with no size
ceiling, draft/publish, and access by **either** an anonymous code **or** a named
account — the two answer different questions and both are there.

**Migration `0006` must be applied to production D1 before or with the deploy.**
It is additive only.

**Still wants your eye**, because it is an operator surface and I cannot sign in:
whether the four looks are actually distinct enough to be worth four, and whether
the editor is laid out the way you want to work.

---

## 2026-08-19 — open, and waiting on the client

Two things on `/downloads`, one now closed.

1. ~~**The catalogue is empty and needs his files.**~~ — **it is no longer a
   deploy step** (2026-08-20). Pages, files and uploads are all in the admin
   panel now, so this is the client's to do whenever he likes, with no session
   of mine involved: Admin → *Downloads pages* → New page → add files.
   `docs/DOWNLOADS.md` is the runbook and has been rewritten for it. The
   `author` field is still deliberately awkward — fill it in when the program is
   not his, and check that its licence permits redistribution, which nothing
   here can check for him.

2. **The page is being redesigned outside this repo.**
   `design/claude-design-downloads.html` is the handoff: the page as it stands
   today, self-contained, four boards (desk locked, desk unlocked, phone, empty),
   real class names, stylesheet rules lifted verbatim, both fonts embedded. The
   client is taking it into Claude Design and bringing back a direction to
   implement. **The constraints that cannot be designed away are written out in
   the comment at the top of that file** — the safety notice's position above the
   list, **a price that is a fact and never a Buy button**, palette tokens only,
   an unlock that moves nothing, a plain anchor for the download, and no design
   that implies an account. Implementing means `src/components/DownloadsPage.tsx`
   and the `.v-dl-*` block of `src/styles/chrome.css`; the handoff keeps the
   class names so it is a translation rather than a rewrite. The file is a design
   artefact and ships nowhere: Vite builds one entry, so `dist/` never sees it.

   **Constraint 2 changed on 2026-08-20 and was rewritten rather than deleted.**
   It read *"NO PRICES, ANYWHERE"*; the client has since asked for prices they
   control, so a figure may now appear on a page whose operator has ticked *Show
   prices* — off by default. The half that still holds absolutely is that there
   is **no Buy button**, because nothing on this page takes money.

   **The handoff now predates categories, the drawn icons, the filter row and the
   price**, so it is a picture of a slightly older page. Every class name in it is
   still correct; the four it does not know about are `.v-caticon`,
   `.v-dl-filters`, `.v-dl-chip` and `.v-dl-price`.

   **Regenerate it rather than hand-editing it if the page changes first** — it
   was built by lifting the real rules out of `src/styles/*.css`, and a
   hand-patched copy is one that has quietly stopped matching the site.

---

Last updated 2026-08-18: **the animation audit, the duel rebuild, the
phone scroll fix and the low-end performance work are all shipped.** New open
items are in *This session's leftovers* immediately below. Previously:
**SPEC-ACCOUNTS phase 2 is built and harness-proven**
— machines, drives, the per-machine signalling Durable Object, the connect
ceremony, the file protocol, and the `/share` + `/machines` pages. The spec
grew §13 and §12 K–S; the harness **prints its own check count** (304 on 2026-08-18) —
read the run, not this line. Done items below are kept as
one-liners because their numbers are cross-referenced from `docs/DECISIONS.md`.

---

## 2026-08-16 — "nothing on the site is live", root-caused and fixed

**Reported for the second time, and the first fix genuinely did not reach it.**
Reproduced in a browser, not reasoned about: a visitor whose machine sets
`prefers-reduced-motion` lands in calm, and calm is total — `is-calm`, canvas at
`opacity: 0`, **zero** animated elements. Correct as a default; the bug was that
nothing on the page accounted for it, and the greeting actively contradicted the
screen ("The background moves… press **plain**" — to stop motion that was not
happening, with no way back).

Shipped and verified against production: `calmBySystem` on `ConfigContext`, and
a second `Greeting` branch that names the setting and settles it. Both buttons
write the preference, so it is asked once. It asks **regardless of the greeting
flag** — which is the part that matters for anyone already stuck, because they
have "seen the introduction" recorded and "answered the motion question" not.

**One thing for the client, and it decides whether this was the whole bug:**
this fix assumes the machine reports `prefers-reduced-motion: reduce` (Windows:
*Settings → Accessibility → Visual effects → Animation effects*, off). If motion
is still dead on a machine where that setting is **on**, the cause is something
else and this is the wrong tree — say so and it gets re-opened with fresh
measurements rather than another guess.

Two smaller things surfaced while measuring, neither fixed, neither urgent:

- ~~**The published site rolls `fx` on every visit**~~ — **fixed 2026-08-16**
  (`29f5aed`), client approved. `off` was one of the sixteen in the pool, so
  roughly one visit in sixteen arrived with no canvas effect at all — the same
  symptom as the bug above, from an unrelated cause. `ROLLABLE_FX` and
  `ROLLABLE_ORNAMENTS` are new *lists*, not new flags: `off` is a fine thing to
  choose and a terrible thing to be given, so `FX` (the wire format) and
  `PICKABLE_FX` (the menu) are untouched and no share code moves. The empty
  ornament went the same way, and for a second reason — five taps on it reveal
  the footer sign-in link, which on the phone band is the only findable route to
  an account. Simulated 200,000 rolls: zero exhaustions, every layout and all
  fifteen remaining effects still reachable.
- ~~**`vessel.tier.v1` was absent**~~ — **not a bug; the key does not exist**
  (resolved 2026-08-16). The performance tier is stored under **`vessel.perf.v1`**
  (`src/fx/perf.ts`), and `vessel.tier.v1` has never appeared anywhere in the
  codebase, so the check was looking for a key nothing writes. Verified live: on
  a cleared profile the key is absent before the greeting and reads `0.5`
  immediately after its button, which is `calibrateOnce` running on the way out
  exactly as designed.

  Two things worth keeping from checking it. The probe returned **`0.5` — the
  lowest tier it is allowed to return** — on this machine, which is the floor
  doing its job on a browser that is slow for reasons unrelated to the GPU. And
  before the 2026-08-16 `FxCanvas` fix that would have been *permanent*:
  promotion required a frame interval under 11ms, i.e. above 90fps, which a
  60Hz display cannot produce, so nothing could ever climb back. A wrongly-low
  probe now self-corrects within seconds.

## 2026-08-17 — audit round two, and a gate so this stops recurring

**`npm run check` is now the gate** (19 gates and growing, ~5s; `check:fast` runs after every edit
via the `PostToolUse` hook; the full pass is `predeploy`). Each gate exists because that exact
failure shipped, and each was verified by deliberately breaking it. **When something gets past it,
add a check** — that is the whole discipline.

**The lesson of the session, recorded because it kept repeating:** almost every real defect was
found by *someone other than the author*. A code review found seven canvas bugs; two duel audits
found fourteen; an accessibility audit found eight and disproved two claims in `CLAUDE.md`; an
adversarial re-review of my own commits found four of my own measured-sounding claims were wrong.
The one time I skipped review, I shipped a QR encoder with three scanner-fatal bugs — and my own
test could not have caught one of them, because it shared the encoder's map.

**Still needing a person, and the check suite says so out loud:** whether the fight *reads* well
(rAF parks here), whether any layout is beautiful or the copy sounds right, whether a QR actually
scans on a phone, and the operator surfaces — which have still never been seen, because they need a
signed-in session.

**Known and deliberate:** three palettes (oxide, xerox, peat) still fail AA on danger text, down
from all 25. `close-in` is the only `far` sequence and the leash makes that band rare, so it is
exempt from the reachability check.

## This session's leftovers (2026-08-14)

Everything here is *additive*. The site is shipped and working; none of these
are known breakage.

### A. See the duel run on a real machine — **still wants the client's eye**

**Reviewed frame by frame 2026-08-14 (later), and it was worth doing: four
defects, all shipping.** `docs/DECISIONS.md` has the full write-up. In short —
the anti-stall rail never reset, so 98.6% of sequence picks were made under it
and four sequences fired twice an hour; `bladeGap` solved the wrong equation and
reported crossing blades as 16 units apart, which is why blade-on-blade sparks
often did not fire; nothing stopped the two bodies overlapping, and they did on
3.9% of frames; and the blade lock's blades were never within 30 units of each
other. All four are fixed.

The environment limit is worse than recorded and worth knowing: the tab reports
`document.hidden`, rAF parks (zero frames in 700ms) **and timers throttle to
~1Hz** (two `setInterval(…,16)` ticks in 1,064ms). There is no live playback
here in any form. What does work is a filmstrip — step the real module N frames
into a grid of captioned cells — which is how the four above were found.

What a filmstrip still cannot judge is *tempo*: whether the stillness between
exchanges reads as poise or as a hang, and whether ~50s per match is right. That
needs eyes on a real screen. Watch it and say.

**Reviewed again 2026-08-16, after the client said it "seems a little off" with
no further detail — ten more defects, all shipping, all fixed.** The method moved
on from the filmstrip: bundle the real module with esbuild and step
`advanceDuel` in Node over 90,000–400,000 frames, plus a recording mock 2D
context for the drawn ones. `CLAUDE.md` deviation 9 has the list and the numbers;
`docs/DUEL.md`'s *Verification note* has the method. The headline: `impulse:
{ at: 0 }` could never fire, so **no fighter had ever been knocked down** across
13,591 frames of `knockdown`; blocked strikes never drew their downstroke, which
is ~40% of the pool; and the ornament camera showed both fighters on only 31% of
frames at the phone slot.

**The tempo question above is now partly answered and partly changed.** Matches
run ~45s rather than ~50s, because blows land where they are aimed. Stillness
measures at a median of 0.9s between exchanges with bursts of 0.45s, which is the
intended contrast. Whether that *reads* as poise or as a hang is still a
question only an eye can settle — and it is now the main open one, because the
correctness questions have been answered. **One trade is deliberately left
live**: pulling the pair into sword range (`LEASH`) means their resting blades
overlap more than they used to, 41.5% of frames against 21.7%. The spurious
sparks that came off that are gone; the visual crossing is not. Undoing it costs
the contact quality, so it wants a look before anyone trades it back.

### B. ~~Duel choreography — the moves designed but not yet built~~ — **done 2026-08-18**

**Everything on the sheet is built. 28 sequences, 31 moves, all reachable and
gated.** `CLAUDE.md` deviation 9 has the four load-bearing rules;
`docs/DECISIONS.md` 2026-08-18 (last) has the measurements.

Three defects surfaced while building it, none of them visible by reading the
code: a somersaulting fighter **mirrored the entire figure** on the frame it
crossed the opponent (147/147/157 events against ~169 flips, on three seeded
runs — i.e. every one); **`retreat` had never been used by any sequence** and had
been dead for the life of the director; and `overrun`'s sparks were authored
against a blade crossing that does not happen, because the two guards already
overlap before the charge starts. The first two now have gates.

**What still wants an eye** — no bench can settle these: whether the tumble reads
at ornament scale, whether one spark burst per charge is enough for the overrun,
and whether the thrown blade is legible or merely brief.

The original list, for the record:

- ~~**The blade lock's visuals.**~~ **Built 2026-08-14 (later).** The press has
  the sustained shower at the true crossing, the two-frequency judder that the
  loser shakes harder, the whole X rotating so the contact point walks into the
  loser a second before the break, a grind that carries the lock downfield, and
  a burst plus hit-stop as it fails. Who wins is `beatPower` on the beat, so it
  is fixed by the same role coin as everything else and the renderer never reads
  the director. Two prerequisites had to be fixed first and are the reason it
  looked like nothing: the blades were never touching, and `bladeGap` could not
  have told you where they touched if they were.
- ~~**`duck` and `overrun`.**~~ **Built 2026-08-18.** The duck needed something
  to duck under first — every other attack in the table finishes in the floor,
  and crouching under a descending blade puts your head where it is going — so
  `strike_level` came with it, holding its blade level for seven frames while
  the body carries it forward. `overrun` is a mutual charge on the ground, and
  it needed the body separation to stand down: that is a **ground pass**, a pass
  with no vertical impulse, and *not* "any pass move", which measured worse
  because it also licensed the nine frames after a somersault lands.
- ~~**Riposte with the wind-up skipped.**~~ **Built 2026-08-18** as
  `Move.windup` + a `quick` beat, and it is a property of the **beat**, never
  the runtime test the note here proposed. "Enter quick if a parry ended within
  8 frames" is a condition, and a condition moves the contact frame — so the
  reaction beat authored against it would be right on some runs and early on
  others, which is the one thing the director refuses to do. Lands four frames
  after its beat instead of sixteen.
- ~~**`blade_throw`.**~~ **Built 2026-08-18**, and it cost almost nothing
  because it is routed through `bladeWorld`: while the blade is out of the hand
  that function returns the flying segment, so the smear, the blade-on-blade
  spark test and the burst placement all follow it with no code that knows a
  throw exists. Reach is sized to the gap at release — `gap - 40`, because
  `duelFocus` ignores blade tips and an overshooting throw spends its apex
  outside the ornament's frame.
- ~~**`spin_attack`'s body flatten.**~~ **Built 2026-08-16.** Squared rather
  than signed, because the blade is drawn inside the same transform and a signed
  cosine would mirror the sword to the fighter's other side halfway through and
  fight the arc its own keyframes are drawing; and it turns once rather than
  twice, because this move's blade goes up, holds and comes down rather than
  sweeping a revolution.
- ~~**Converging rings on `force_pull`.**~~ **Built 2026-08-16**, and it mattered
  more than it looked: `force_pull` was also *pushing* its victim away (the knock
  was unsigned), so the expanding rings were arguing with a fixed physics bug
  rather than merely duplicating the push's look.

### B2. Absorb the duel-cycle engine — **planned 2026-08-18, `docs/DUEL-ABSORB.md`**

The client had a second duel engine built (`handoff_duel_engine/`) to make the fights
**procedurally generated rather than a fixed pool of sequences**, plus a VFX/audio reimagining.
Three audits ran against it: the generator is sound (3.5M stepped beats, no deadlock, no invalid
beat, no off-stage fighter, all modules reachable) and everything around it is not adoptable — no
exports, not steppable in Node, unframeable under `frame-ancestors 'none'`, a global CSS reset, a
document keydown with no `isEditable` guard, Google Fonts against the CSP, 125 literal colours, six
free-running oscillators, and a rAF loop that keeps animating in calm.

**Decided: absorb the ideas into `src/fx/duel.ts`.** Five phases — the procedural generator,
character identity, new moves, VFX, audio. Names are operator-only; silhouettes stay instantly
identifiable. The plan, the measurements and the *not taking* list are in `docs/DUEL-ABSORB.md`.

**Phase 1 is shipped (2026-08-18).** The 28 hand-authored `SEQUENCES` are 28 `MODULES` — builders
that roll their arcs, counts and timing and derive every reaction frame from the move table — and
the director chains one to three of them under a single role coin, re-measuring the band before
each. An exact exchange now repeats within its own match on **0.03%** of exchanges, against
everything past the twenty-eighth before. Tempo unchanged (51.8s median vs 50.4s, benched
identically). The static gate is replaced by a generator gate: **224,000 sequences** built from a
fixed seed and asserted on, all five new assertions verified by breaking them.

**Phase 2 is shipped (2026-08-18).** The four silhouettes are a roster of eight in
`src/fx/fighters.ts` — four good, four evil, two pools of four pairings — with `back`/`head`/
`overlay` costume hooks and render-only proportion multipliers, and **each duel rolls its pairing
again on every match reset**, so the fighters change every ~52s. Costumes are stroked and never
filled (the rule behind *"they are holding shields"*, now gated), and each declares its reach so
`duelFocus` can frame it: measured over 320,000 frames, a flat clearance cropped the tall costumes
on 0.07% of frames and the per-costume one on 0.00%, for no loss of figure size. Three of the eight
were rebuilt after being *looked at* — stills rendered through headless Chrome, which is the method
worth reusing. Nametags were declined (deviation 8: a label over a 61px figure captions a fight).

**Phase 3 is shipped (2026-08-20).** Five moves and seven modules — a low sweep and the jump that
answers it, a ground roll, a back handspring, a turning parry, and a thrown blade knocked out of the
air. 36 moves, 35 modules, all reachable and gated. It also closed a defect that had been live since
the somersault landed: the ornament camera reported a standing width for a *rotating* body, so it
cut fighters out of frame on 8.61% of turning frames — now **zero, death holds included**, which
also retires the 10.8% death-hold clipping the 2026-08-17 pass left open.

*Thrown props* and *blasters* were **not** taken and that is a scope decision, not a deferral: both
need a new entity in an arena that has nothing in it, and none of the eight fighters carries a gun.
Say if you want either and it becomes a character conversation rather than an engine one.

**Phase 4 is shipped (2026-08-20).** Directional sparks off the contact, a silhouette flash on the
struck fighter lasting exactly the hit-stop, a directional kick to the frame, scorch marks on the
ground, and per-bone blade lighting. Three gates came with it and each was verified by breaking it;
one of them — that `drawDuel` hands the canvas back with a balanced save stack and `source-over`
restored — is worth more than the feature that prompted it, because the file now has five additive
passes where it had one. `docs/DECISIONS.md` has the measurements.

**Two things in it are the client's, and both are in `docs/DUEL-ABSORB.md`:** the blade light washes
bodies in the blade's colour, which widens the literal-colour carve-out that was granted for blades
specifically; and whether the kick's 4.5 world units and the light's 0.5 strength are right, which is
a still-image judgement made on contact sheets.

**One remains.** Phase 5 (audio) — and it still needs the call below on duel audio being fired by
animation rather than by a gesture.

**One thing for the client before phase 5 starts**, flagged rather than assumed: the site's rule is
*"every voice is fired by a gesture."* A duel clash is fired by the *animation*. The rule's purpose
— nothing plays uninvited, no `AudioContext` until a deliberate toggle — is satisfied as long as
duel audio only sounds when `sound` is explicitly on. Its letter is not. That is the client's call,
not this side's.

**Phase 2's naming residue closed itself and needs nothing.** The worry was that real names would
sit in the public JS bundle even when only rendered behind `isOperator`. No real name is used
anywhere — the roster is archetypes — so there is nothing in the bundle to worry about.

**What no bench can settle, and is the same open question as before:** whether a chained phrase
reads as one fighter pressing an advantage or as two exchanges glued together, and whether the
rolled rests land as poise or as a hang. It wants an eye on a real screen.

### C. Severing / dismemberment — **deferred by the client**

Asked for ("cutting in half, dismembering"), then deprioritised ("if the
severing is a pain and causes lag, dont do it" / "but yes, make the fights good
pls"). The fights got the time instead. If it comes back: draw the figure twice
under two clip rectangles split at the cut height, each with its own falling
transform, plus a bright cauterised edge. It is not expensive — it is fiddly,
and at a body ~100px tall behind copy at `dim: 0.55` it may not read at all.
Judge it on screen before building it.

### D. Prove the low-end path on actual low-end hardware

The tier system is measured and self-correcting (six tiers, demote in ~0.33s,
promote slowly, plus the probe on the greeting's OK). What has *not* happened
is running it on a genuinely old machine. If stutter survives even the 0.28
tier, the next lever is halving the canvas's update rate — 30fps for an ambient
background is barely perceptible and exactly halves its cost — but that should
be added only if measurement says it is needed.

### E. ~~The duel ornament wastes its slot~~ — **camera built 2026-08-14 (later)**

The ornament drew the whole 700-unit arena across a square slot, so a fighter
was ~20px tall on a phone in a mostly-empty box. `duelCamera` now tracks the
pair: median figure **61px at 190px, 109px at 340px**. It anticipates a jumper's
apex (so nothing clips), zooms out fast and in slow, and cuts rather than pans
at a match reset. `docs/DECISIONS.md` has the measurements; the background home
is untouched. Left for the client's eye: whether the health bars still feel
right now the figures are three times bigger.

Two follow-ons it surfaced, neither urgent:

- ~~**`flip_over` does not flip.**~~ **Fixed 2026-08-18.** One linear revolution
  about the body's middle, over a window derived from the move's own impulse —
  `2·vy/g` — so the feet arrive on the frame the turn completes: measured over
  171 landings at a median offset of **0 frames, range 0 to 0**. Adding it
  exposed the mid-air mirror described in section B, which had to be fixed
  first: without that, the figure turns inside out at the top of the arc.
- The camera is the only place on the site where the frame moves on its own. If
  that ever reads as too much, `CAM_PAN` / `CAM_ZOOM_*` are the dials, and
  clamping `CAM_MIN` and `CAM_MAX` together makes it a static crop again.

### F. Go over the whole site, page by page, desktop and mobile — **client request**

Client, 2026-08-14: *"go over the entire website, page by page, point by point,
feature by feature. review it, log bugs, errors, improvements, etc. then we fix
it all… fix both versions — desktop and mobile site. if possible, make
everything run faster."*

Standing permissions given with it: open and drive the live site in both bands,
test, change. **Removals and tone-downs for performance need sign-off first, and
the reason has to come with them** — the client's words: "if you must remove
stuff, or tone it down for faster performance, thats fine, just run that by me
first and why."

Scope, so it is not re-litigated later: all fifteen routes including the four
unlinked account pages and the footer pages, both bands, every layout archetype
(fourteen) rather than only the default, calm on and off, and the operator
surfaces. The two environment traps that have already cost sessions apply
throughout — `resize_window` silently fails, so the phone band is tested via a
same-origin iframe at 420×860; and strings are verified in the live DOM, not in
a green build, because a find-and-replace has already no-opped silently while
everything still built and rendered.

Worth deciding before starting: whether the output is one findings document the
client reads and prioritises, or a fix-as-found pass. The audit is large enough
that fixing as found makes it impossible to review what changed and why.

**Decided fix-as-found, with one commit per finding** (2026-08-16, client: "your
call for everything"). That answers the reviewability worry — the commit message
is the findings document, and each one carries its own measurement.

**Coverage so far.** All sixteen routes at the desk band, at both ends of the
tablet band (600px and 760px — the historic nav regression lived at 600 while
760 was fine), and at 420px. All fourteen layout archetypes at desk and phone.
Calm on and off across all fourteen. A full copy read-through. Measured on every
route: horizontal overflow, `h1` count, images without `alt`, controls without
an accessible name, unlabelled inputs, and tap-target size. **Result: zero
horizontal overflow anywhere, one `h1` per route, every control named, every
input labelled.** One finding, fixed: `.v-mail` on Contact was the smallest tap
target on the site at 30.7px.

**Still uncovered, and why:**

- **The operator surfaces** — the panel, the door, the command palette, the
  admin screens. Reaching them means signing in, which means entering a password
  into a form, which is something I will not do even against a throwaway local
  account. The wiring was verified statically instead and is sound: the panel
  maps over the live `PALETTES` / `PRESETS` / `LAYOUTS` / `PICKABLE_FX` /
  `ORNAMENTS` arrays with no hardcoded list, so every catalogue entry is
  necessarily present and pickable. What has *not* been seen is how any of it
  looks. Sign in and it can be reviewed from there.
- **"If possible, make everything run faster."** Partly done and not as a
  removal: the adaptive resolution tier could only ever fall, never rise, on a
  60Hz display, so one bad second pinned a machine to a soft canvas permanently
  (`FxCanvas`, 2026-08-16). Nothing has been toned down or removed, so the
  sign-off condition attached to this request has not been triggered.

  **All sixteen effects were then measured, and there is no fruit left on this
  tree** (2026-08-16, `fxlab.html`'s own steady-state readout, 654×368 device
  pixels at dpr 2). Steady cost per frame, worst first: `rain` 0.11ms, `plasma`
  0.12, `constellation` 0.07, `bokeh` 0.06, `flow` 0.05, and everything else at
  or under 0.04 — against a 16.7ms frame. `rain`'s first second is 0.54ms
  because that is when its glyph atlas is built, which is what the atlas is for.
  Scaled to a full-bleed retina canvas the worst effect is still around a tenth
  of the frame budget.

  So the honest answer to "make everything faster" is that the canvas is not
  what would be slow — the one real defect was the tier being unable to climb,
  and it is fixed. If a machine still struggles, the next place to look is
  outside the effects: the 369KB bundle, the 178KB of webfonts, or the layout
  cost of the 0.9s palette bleed. **Do not go tuning effect internals on
  suspicion; measure first, the bench prints the number.**

### G. ~~Docs that are now behind the code~~ — **done 2026-08-16**

- `docs/DUEL.md` had gone further wrong than "behind": it said the parry state
  was declined (it exists), that sound was not built (it is), that attract mode
  was live (it was removed), and left the health-bar question open (answered:
  ornament-only). All corrected in place rather than deleted, and its
  *Verification note* now carries the measurement method that found this
  session's ten defects — which is the part worth reusing on any other effect.
- `CLAUDE.md`'s deviation 9 now covers both the choreography and the rendering
  passes with their measurements.

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

### 3b. Operator locked out — **runbook written 2026-08-16, `docs/ACCOUNT-RECOVERY.md`**

The client forgot the password to the only operator account and asked for a password-reset feature
"only for me". **Declined, with reasoning recorded in that document** — one already exists (ten
recovery codes, which restore grant authority in full rather than merely letting you back in), and a
second could not be scoped to one person, would require the escrow §5 rejects permanently, and has
no email to send to because §9 collects none.

The runbook is verified against the live schema: how to read the surviving credentials from the D1
console, the recovery-code and passkey paths, and — if both are gone — signing up a fresh account and
promoting it with one `UPDATE`. Two facts that make that last path cheap and are easy to get wrong:
a brand-new account signs in on the password alone, because the Worker only demands a TOTP stage when
a `confirmed_at` row exists; and the old account's sealed grant key costs nothing today, because
grants do not exist yet — the table is deliberately absent from `migrations/`.

**Known gap, deliberate:** a sole operator who loses password, recovery codes *and* passkey has no
in-product way back. The same property that makes operator reset safe makes self-rescue impossible.
The mitigation is the ten codes.

**Note for whoever holds the token:** `wrangler d1 execute --remote` fails with *"not authorized to
access this service [code: 7403]"* — this repo's token can deploy but not query D1. Use the
dashboard console.


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

### 8. Edit mode — operator-editable copy/images. **Architecture designed
2026-08-14; copy is unblocked, images are not.**

Copy follows the published-site-config pattern exactly: a **sparse overlay** in
D1 (new migration `0005`), injected into the shell by the Worker with its own
nonced script, validated field-by-field on the client with `pages.ts` as the
floor. That satisfies §11 literally — `ConfigContext` gains no fetch and the
first render stays synchronous.

Editable: `eyebrow`, `title`, `lede`, and per block `kicker`/`title`/`body`/
`items[]`, plus CTA labels. Not editable: block count and order (layouts are
tuned to them), CTA targets (a wrong `PageId` is a dead button), `img`, and
`hasMail`. **The five account pages are excluded** — their ledes make security
claims an operator must not be able to falsify from a text box.

**Images remain blocked** on the storage decision (R2 or similar).

Client decisions still needed before building: whether a block may be *blanked*
as well as rewritten; whether there is a draft/preview state (appearance has
none); and an acknowledgement that this makes the 404's joke counts
operator-overridable, quietly ending the verbatim-copy rule.
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

### 11. Richer transitions/slide-overs/typewriter — **approach confirmed
2026-08-14, planned, not yet built.**

**Entrance-per-archetype**, chosen over two alternatives: each of the 14 layouts
enters in a way derived from its own structure, so the motion says *which
archetype you are in* rather than decorating. Typewriter confined to Terminal's
termbar path — not body copy, which is the scramble trap in another costume.
One shared slide-over primitive replaces the three separate keyframes the panel,
door and dialogs use today.

**A boot/page-load sequence was considered and cut.** The site already runs five
motion systems; a front-door sequence delays first paint for every visitor to
buy a moment only first-timers see, and it competes with the title scramble that
already owns that instant.

Full plan (14 entrances, six shared families, the primitive set, the cut list)
is in the session notes. Key constraints when building:

- Compositor-only properties. The client's requirement is literally "as long as
  the site doesn't lag."
- Ships behind an **Entrances** toggle in the Life signs row, defaulting on.
- **The share-code bit must be stored inverted** — bit 32 meaning *entrances
  off*. The default is on and every code in circulation has that bit clear, so a
  clear bit has to decode to *on*. `sound` got away with the plain reading only
  because its default was off.
- Bit 32 takes the toggle bitfield past one base-36 character (max 63 → `"1R"`).
  Harmless, but the comment in `shareCode.ts` and CLAUDE.md both say one
  character and would become wrong.
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
`docs/SECURITY-AUDIT.md`). **Live state re-checked 2026-08-14, and
`mcclevarty.com` hardened the same day (§9b) — it had two SPF records, which is
a `permerror`, not a lenient policy.**

- ~~**DMARC**~~ — **done 2026-08-14, `p=reject`.** The two-week observation this
  item prescribed was made unnecessary by a fact, not skipped: the client
  confirmed neither domain has mail set up or needed, and a domain that sends
  nothing has no legitimate mail for a strict policy to break. Live:
  `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=…`. SPF is `-all`.
- **CAA: still none** (confirmed by query). The one item here that is a pure
  addition. `docs/SECURITY-AUDIT.md` §8 has Cloudflare's documented set verbatim.
  **Risk if done carelessly**: a CAA set that omits a CA Cloudflare actually uses
  makes certificate *renewal* fail silently, weeks later. The dashboard validates
  the set against its own issuance; the API does not.
- **DNSSEC: half done, and the ticket is now written and ready to send** —
  `docs/DNSSEC-TICKET.md` (2026-08-16). Cloudflare's half is enabled and the zone
  is signed; the DS is **not** published, so it is inert and safe to leave. The
  document carries a straight answer to *is this required* (no — but worth doing,
  because it is the only thing on the list that closes certificate mis-issuance
  via DNS, which CAA and HSTS both fail to), the paste-ready ticket, the
  verification commands, and the rollback.

  **The DS was re-derived from the live DNSKEY on 2026-08-16** rather than
  trusted: the derivation script was validated first against `cloudflare.com`,
  `ietf.org` and `cira.ca`, reproducing all three published digests exactly, and
  then agreed with both §7's recorded figure and Cloudflare's own. Key tag 2371,
  algorithm 13, digest type 2.

  **It could not be submitted from this side, and neither blocker is fixable
  here**: Namespro's ticket form carries a reCAPTCHA v2 checkbox, and the ticket
  wants to be filed from the signed-in account (their own form warns an anonymous
  ticket is untracked) — which needs the account password. Both are things this
  side must not do. The client sends it; everything else is prepared.

  **The bigger risk on this domain is not DNSSEC**: auto-renew is disabled
  (expiry 2027-Aug-09), and every protection in the audit is worth nothing the
  day the domain lapses.
- **Auto-renew is disabled on `mcclevarty.ca`** (expiry 2027-Aug-09). Noticed
  while in the registrar; not changed, because it is a billing choice. But every
  other protection here is worth nothing the day the domain lapses.

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
6. ~~**Contact-page email**~~ — **closed 2026-08-16, no change needed.** The site
   assembles `patrickmcclevarty@outlook.com` while the address on file here is
   `…@hotmail.ca`, and the discrepancy was real but not a bug: the client keeps
   both. *"Hotmail.ca is my main email for personal stuff. Outlook.com is for
   business. I use both. keep outlook on the website."* The business address is
   the correct one for the one page with a job. **Do not "fix" this to the
   hotmail address** — it has now been queried twice and answered.
7. **Per-account subdomains: wanted at all?** If yes, an Origin allowlist must
   land first (`design/GUIDE-SUBDOMAINS.md`); if no, the guide can be closed.
10. ~~**Rolled visits are now two-thirds lightsword duels**~~ — **signed off
   2026-08-18, no change.** Hiding the four circles leaves the dice choosing
   among duel/duelholy/sonar, and the live site publishes `mode: "visit"`, so
   sonar is the *minority* outcome of a roll. Put to the client with the lever
   named (weighting or trimming `ROLLABLE_ORNAMENTS`, never un-hiding the
   circles); their answer was *"your call. I want random, but I do like the
   lightsabre fight"*. Both halves of that are satisfied by the current
   behaviour — the roll stays random and the outcome they like is the common
   one — so the weighting stands as it is. **Do not "correct" the distribution
   toward sonar on the strength of the 08-17 note above**: it read the split as
   a possible defect, and the client has since read it as the feature.
11. **A republish may be needed for the withdrawn circles to fully go**
   (2026-08-17). Hidden means unlisted, not invalid: if the currently published
   config names Lens/Valve/Aperture/Orrery, first-time visitors keep getting it
   until the operator republishes. Check the published row after deploying.
8. **When to retire the Pages project** — it is the rollback; retiring it
   deletes the `_redirects` trap class.
9. ~~**Free-diagnostic copy rewrite**~~ — done 2026-08-14. The client's words:
   *"i dont do free diag. a mechanic will still charge you to diagnose your cars
   issues."* Home's "the rate" block ("Free diagnosis, always" / "you pay
   nothing") and Contact's step three ("Fixed, or you pay nothing") both carried
   a promise the business does not make, on the two blocks whose job is sending
   people to Contact. Both replaced; neither names a fee.
   **No figure on the site, by decision.** The client offered either an invented
   number or "discussed on contact" and left the choice to this side. No number:
   the site already refuses to be a quote machine, Contact's three steps already
   put a price in step two, and one flat fee cannot honestly cover both a laptop
   that will not boot and a drive that has stopped spinning. The copy describes
   the flow that already exists and stays true whatever the client charges, so
   setting a rate is a business decision that needs no further copy change.

   **No credentials named either**, though the client has them (senior analyst
   and sysadmin, college credits, vendor certs). `about` is built on "No name,
   no face, no city … the work speaks"; a list of MSP vendor logos would
   contradict that page and means nothing to someone with a slow laptop. The
   client's own instinct — "less is more for this part" — is the right one.

---

**Starting a session?** `docs/HANDOFF.md` has a paste-ready prompt, the deploy
verification block, and the list of things that cannot be verified from this side.
