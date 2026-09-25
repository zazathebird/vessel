# Retired pages

Four pages removed from the site on 2026-09-23 at the client's request, kept here so they can come
back. **This file is not shipped** — nothing in `src/` imports it, so none of this reaches the
public bundle.

- **`/work` and `/guestbook` were invented.** The six case studies and five quotes were written by
  an earlier model session, not taken from real jobs or real customers. **Do not restore either
  with this content.** They are kept only as a template: the shape of a case study, the tone of an
  attribution line. Restore with real jobs and real words, or not at all.
- **`/gallery` and `/changelog` were cut as filler** — the gallery was placeholder stock photos
  with invented captions, the changelog a page about the website on a site whose rule is that
  nothing advertises the site.

Restoring one: add its id back to `PageId`, `PATHS` and a nav list in `src/data/pageIds.ts`, its
object to `PAGES`, a line to `SNIPPETS`, and move the 404's page count (`npm run check` names the
word it wants). Photos for work/gallery are in git history under `public/photos/`.

## `/work`

```ts
  work: {
    eyebrow: "selected repairs",
    title: "Things that were dead.",
    lede: "No client names, no photographs of anybody's living room, and no five-star reviews. What came in, what was wrong, what happened next.",
    ctas: [{ label: "Bring me yours", to: "contact", primary: true }],
    blocks: [
      { kicker: "recovery", title: "Ninety-four per cent of eleven years", body: "It had been under water. Dried out, cleaned up, and copied off in a single pass, because a drive in that state may only spin up once more. Ninety-four per cent came back, including the only copy of eleven years of family photographs.", hasTile: true, tile: "drive teardown · photo slot", img: "/photos/drive-teardown.jpg", imgAlt: "An opened hard disk drive on a white background, platter and read arm exposed" },
      { kicker: "board", title: "The machine that died whenever it felt like it", body: "Two of the tiny solder joints holding the graphics chip to the board had cracked, which is a fault that looks exactly like a dying computer. I melted them and set them down again. It has run without trouble ever since, which the shop selling them a whole new machine was not banking on." },
      { kicker: "network", title: "Three routers, one house", body: "Took two of them out. The third works perfectly, and always did.", hasTile: true, tile: "cabinet before/after · photo slot", img: "/photos/network-cabinet.jpg", imgAlt: "A wiring rack buried under a chaotic curtain of blue patch cables" },
      { kicker: "forensics", title: "Held to ransom, and nothing paid", body: "Criminals had scrambled every file on the machine and wanted money to put it back. A backup nobody remembered making sat on a drive left unplugged in a drawer, which is why the attack could not reach it, and everything was back by the afternoon. A backup that stays plugged in can be encrypted along with everything else." },
      { kicker: "absurd", title: "A laptop full of sand", body: "One beach holiday, sand under every single key. It still works.", hasTile: true, tile: "keyboard, disassembled · photo slot", img: "/photos/keyboard-disassembled.jpg", imgAlt: "A beige mechanical keyboard with most keycaps pulled, bare switch stems showing" },
      { kicker: "ongoing", title: "Twelve office machines nobody could afford to replace", body: "Faster storage and more memory in the computers they already owned, for a fraction of the price of twelve new ones. They were still in service last I heard. A mechanical hard drive is the most common reason a computer feels slow, and the cheapest to fix." },
    ],
  },
```

## `/gallery`

```ts
  gallery: {
    eyebrow: "dumping ground",
    title: "Random shit, catalogued.",
    // "The pictures only load as you reach them" was lazy-loading — a fact
    // about how the site is built, told to somebody who did not commission it
    // and cannot act on it, which is the thing the client asked to be gone
    // (2026-08-16). The second clause stays: where a photograph was taken is a
    // privacy claim about the photographs, which is the reader's business.
    lede: "Broken hardware, things that burned out, and the inside of a cable drawer. Phones stamp photographs with where they were taken; anything like that has been taken back out of these.",
    ctas: [{ label: "Contact instead", to: "contact" }],
    blocks: [
      { kicker: "photo", title: "A laptop taken completely apart", body: "Laptop screws come in several lengths that look identical, and the long one goes straight through the mainboard. Hence the order. Every screw went back where it came from. Nothing that leaves here rattles.", hasTile: true, tile: "4:5 · photo slot", img: "/photos/thinkpad-exploded.jpg", imgAlt: "A laptop opened on a wooden bench, battery and mainboard exposed, screwdrivers alongside" },
      { kicker: "photo", title: "The exact spot a computer gave up", body: "One of the small barrels that smooth out the power inside a machine. They bulge, they vent, and they take the computer with them. For most of the 2000s they did it in their millions: the story goes that somebody stole the recipe for the liquid inside and got it wrong.", hasTile: true, tile: "16:9 · photo slot", img: "/photos/burnt-capacitor.jpg", imgAlt: "Bulged and vented electrolytic capacitors on a dusty motherboard, one shedding its sleeve" },
      { kicker: "video", title: "A cooling fan on its way out", body: "The noise a fan bearing makes before it seizes. People live with it for a year and then ask why the machine keeps getting hot.", hasTile: true, tile: "video slot · nothing in it yet" },
      { kicker: "photo", title: "Forty hard drives, one of them working", body: "Pulled out of dead machines over the years. One still spins up. Worth remembering about the thing holding your only copy of everything.", hasTile: true, tile: "3:4 · photo slot", img: "/photos/drive-shelf.jpg", imgAlt: "Five of them stacked on a scuffed wooden desk, connectors facing out" },
      { kicker: "photo", title: "A tube monitor that has outlasted everything since", body: "The heavy kind, from before flat screens, and the kind that can still hold a dangerous charge long after you unplug it. Nothing sold this year will be working in thirty.", hasTile: true, tile: "1:1 · photo slot", img: "/photos/crt-alive.jpg", imgAlt: "A CRT monitor glowing amber in a dark room, text faintly burned into the phosphor" },
      { kicker: "photo", title: "The drawer that still has your cable", body: "Every one of those is the only surviving cable for a device that no longer exists. The industry changed the plug every eighteen months for thirty years, and I kept every fucking one of them. Yours is in there.", hasTile: true, tile: "4:5 · photo slot", img: "/photos/cable-drawer.jpg", imgAlt: "A dense tangle of power and data cables jammed beneath a desk shelf" },
    ],
  },
```

## `/changelog`

```ts
  changelog: {
    eyebrow: "site edits",
    title: "Things I changed.",
    lede: "The bigger changes to this site, listed, for the same reason people keep receipts.",
    ctas: [{ label: "Back to the front", to: "home" }],
    blocks: [
      { kicker: "v2.4", title: "Repainted the whole thing", body: "Twice. Nothing underneath it changed, which is also true of most new laptops." },
      { kicker: "v2.3", title: "Cut everything that was not about your computer", body: "Nobody arrives with a dead laptop hoping to read about a website. What is left is what I fix and what it costs." },
      { kicker: "v2.2", title: "Made it behave on a phone", body: "If your computer will not start, you are reading this on a phone. So the phone comes first now." },
      { kicker: "v2.1", title: "Rewrote what it says about money", body: "The old version promised something I do not actually offer. Working out what is wrong with a machine is the job, and nobody asks a mechanic to find the noise for free." },
      { kicker: "v2.0", title: "Threw out the terminal", body: "Green text on black is what every repair site looked like in 2009. None of them told you whether anyone there could fix a laptop." },
      // Missed by the 2026-08-15 rewrite, and the textbook case for it: three
      // terms ("scrapers", "assembled in the browser", "placeholder") in two
      // sentences, none of which mean anything to the reader that rewrite was
      // for. Contact's version of the identical fact was rewritten and lands —
      // this one still said it sideways. Same joke, named rather than alluded to.
      { kicker: "v1.9", title: "Hid my email address from the spam machines", body: "Your browser assembles it the moment you click. The programs that crawl the web harvesting addresses arrive, look around, and find no address to take." },
    ],
  },
```

## `/guestbook`

```ts
  guestbook: {
    eyebrow: "guestbook · 1999 revival",
    title: "Sign nothing.",
    lede: "Nothing here to sign, deliberately. A box you can type in is a database, and a database is a breach waiting for a slow news week. Every company that has ever lost yours had one. These come out of emails, with permission, with every identifying detail taken out.",
    ctas: [{ label: "Email instead", to: "contact", primary: true }],
    blocks: [
      { kicker: "entry 001", title: "“Got my photos back. All of them.”", body: "— someone who had been meaning to back up since 2011" },
      { kicker: "entry 002", title: "“Cheaper than the quote for a new one.”", body: "— a five-year-old laptop that now starts up in nine seconds" },
      { kicker: "entry 003", title: "“You told me not to buy anything. Who does that?”", body: "— the answer is nobody who works on commission" },
      { kicker: "entry 004", title: "“The website is insane.”", body: "— and it has still never tried to sell them antivirus" },
      { kicker: "entry 005", title: "“It still smells faintly of the sea.”", body: "— the sand laptop, six months on" },
    ],
  },
```

