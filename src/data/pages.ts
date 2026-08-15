/**
 * Final page copy for all thirteen pages that render blocks — the spec's nine,
 * `setup` (2026-08-14), plus the three account pages, whose hero copy was
 * written for this build.
 * Copied verbatim from the prototype's PAGES object (Site v2 - Vessel.dc.html:366).
 *
 * COPY CHANGES, both approved by the client (see CLAUDE.md):
 * 1. home's kicker:"the site" block was corrected from v1's stale counts on
 *    2026-08-13, then REPLACED the same day at the client's request — the
 *    option-count list told visitors about switches they cannot flip. It is
 *    jokes now, written for this build. The whole block was then cut outright
 *    on 2026-08-14 and its best line folded into "the honesty".
 * 2. `setup` is a whole new page, written for this build on 2026-08-14 (TODO 9).
 *    Scope agreed with the client: remote access *before a callout*.
 * 3. The 404's page count has moved twice: "eight" → "nine" when `setup`
 *    landed, and "nine" → "ten" when `scams` did. The counts on that page are jokes that depend on being true,
 *    which is why the client kept them; leaving it wrong would have been the
 *    change. One word — nothing else on the 404 moved.
 * 4. home's "the rate" block carries the client's actual terms as of
 *    2026-08-14 ($150 up front, $120/hour after), and Contact's third step
 *    matches it. This is a term of business, not a joke — keep them in step.
 * 5. home's "Some of this is hidden" block was removed the same day: it
 *    advertised that hidden unlock routes exist, which is an invitation and not
 *    a feature.
 * 6. **Nothing on this site advertises the site** (client, 2026-08-14: "get rid
 *    of anything to do with color palettes, features about my site like
 *    different layouts, or hidden sections, or ANYTHING that isnt relevant to
 *    everyone but me… i want people to find it out by being ON the site").
 *    Gone with that: the 404's "Have a palette instead" consolation block, the
 *    changelog's palette inventory and its shuffle, calm-mode and screensaver
 *    entries. A visitor came here to get a machine fixed; the machinery is
 *    there to be discovered, not announced. The 404's page list stays — those
 *    are page names, which is navigation, not a spec sheet.
 * 7. Every other line in this file, including every other stale-looking
 *    count, is verbatim from the prototype.
 */

import type { PageId } from "./pageIds";

export interface PageCta {
  label: string;
  to: PageId;
  primary?: boolean;
  /**
   * A CTA that acts on the page it already sits on rather than navigating.
   *
   * DEVIATION FROM THE PROTOTYPE, deliberate: there, Contact's primary CTA
   * points at Contact, so pressing it on Contact does nothing at all. Contact
   * is the one page with a job, so its "Copy the address" button does what it
   * says instead. The copy is unchanged.
   */
  action?: "reveal-mail";
}

export interface PageBlock {
  kicker: string;
  title: string;
  body: string;
  hasList?: boolean;
  items?: string[];
  hasTile?: boolean;
  tile?: string;
  /**
   * Placeholder photograph for a tile (2026-08-13, client request): a real
   * image behind the tile chrome until the operator's own photos exist.
   * Sourced under public-domain/CC0 only — docs/PHOTOS.md has the ledger.
   */
  img?: string;
  imgAlt?: string;
  hasMail?: boolean;
  /**
   * Render the block large and bold, as a callout.
   *
   * Added 2026-08-14 for the scams page, where one block genuinely matters more
   * than the ones around it and the client asked for it in "bold, large font".
   * Deliberately a *flag* rather than markup in the copy: `body` is a plain
   * string everywhere else on the site and the moment it starts carrying tags,
   * every page has to be audited for them.
   *
   * Use it about once per page. Two loud blocks on one page is no loud blocks.
   */
  loud?: boolean;
}

export interface Page {
  eyebrow: string;
  title: string;
  lede: string;
  ctas: PageCta[];
  blocks: PageBlock[];
}

export const PAGES: Record<PageId, Page> = {
  home: {
    eyebrow: "pressure nominal",
    title: "Oh. It's you.",
    lede: "There is no product here, no newsletter, no funnel, and nothing measuring you. The domain was already paid for, so this exists. If you need a machine fixed, contact is one click away and is the only genuinely useful part of it.",
    ctas: [
      { label: "Fix my computer →", to: "contact", primary: true },
      // Featured on the landing page at the client's request (2026-08-14). It
      // sits ahead of the joke CTA deliberately: of the two, only one of them
      // can stop somebody losing their savings this afternoon.
      { label: "Don't get scammed", to: "scams" },
      { label: "Show me something weird", to: "gallery" },
    ],
    blocks: [
      // "Fifteen years" → "Over twenty years" at the client's correction
      // (2026-08-14). His number, not the spec's.
      { kicker: "the pitch", title: "Machines get fixed here", body: "Over twenty years of taking things apart and putting most of them back together. Laptops, desktops, drives that stopped spinning, networks that never worked properly to begin with." },
      { kicker: "the catch", title: "There is no catch", body: "No quote form, no ticket system, no chat widget pretending to be a person. You send an email, you get a reply, usually the same day." },
      // The one block on this page pointing somewhere other than the work.
      { kicker: "read this first", title: "Nobody legitimate calls you first", body: "The single most expensive thing that happens to the people who ring me is a phone call from someone claiming to be Microsoft. There is a whole page here on exactly how that scam runs, what they say, what they ask you to install and what to do if it has already happened. Send it to whoever in your family answers the phone." },
      /*
       * The "the site" block is GONE (client, 2026-08-14) and should not come
       * back. It had already been rewritten once the day before — the
       * option-count list was a spec sheet for switches visitors cannot flip —
       * and the replacement jokes did not save it: "still just seems stupid and
       * useless". It was the only block on the page about the page rather than
       * about the work, on a site whose one job is getting someone to send an
       * email.
       *
       * Two of its four list items were also actively wrong to publish. "The
       * 404 page is load-bearing" was the spec's joke about 404 being genuinely
       * in the nav — but the 404 pill moved behind sign-in on 2026-08-13, so the
       * line was stale, and the client reads it as it now reads to a stranger:
       * a hint that there is something to go looking for. That is the same
       * objection that removed the "Some of this is hidden" block, and it is
       * right both times.
       *
       * Its best line survives here, because self-deprecation is still the
       * site's voice and this is the block that already carries it.
       */
      { kicker: "the honesty", title: "What this is not", body: "Not an agency. Not a startup. Not looking for funding, partnerships, or your synergy. Built like a flight simulator, used like a business card. One person and a bench." },
      // COPY CHANGE 2026-08-14, twice in one day and the second one is the real
      // policy. First the client killed "Free diagnosis, always" ("i dont do free
      // diag. a mechanic will still charge you to diagnose your cars issues").
      // Then they gave the actual terms and the reason behind them: "150 to show
      // up, then 120/hour, starting immediately after receiving the 150. no work
      // is done until i receive the 150 … not doing everything and then having
      // someone say ooh i cant pay. burned out of thousands in the past."
      //
      // So this block is no longer a philosophical position about diagnosis, it
      // is a **term of business**, and it is the copy on the site most likely to
      // save the client money. Written to be understood by someone who is not
      // technical — their note on the previous draft was that the second half
      // did not make sense even to them. Two numbers, one order of events, no
      // hedging.
      //
      // "$150 before anything starts" rather than "to come out": true whether the
      // machine is collected or dropped off, which "to show up" would not be.
      // The electrician comparison is the client's own and does the explaining
      // that a paragraph would otherwise have to.
      { kicker: "the rate", title: "Paid before I start", body: "$150 before anything starts, then $120 an hour from there. Nothing happens before that first payment lands — an electrician works the same way, for the same reason. Finding out what's wrong is the job, not a free sample." },
      // The "Some of this is hidden" block was REMOVED 2026-08-14 at the client's
      // request: "useless and just invites people to try and hack the site."
      // Correct on both counts. It advertised that hidden unlock routes exist and
      // gave a customer nothing, and the door it pointed at is theatre guarding a
      // settings drawer — so the line's only real effect was to invite poking at
      // it. The 404's "six ways into a panel" line is a different page, is behind
      // sign-in, and stays.
    ],
  },
  about: {
    eyebrow: "who",
    title: "Nobody, deliberately.",
    lede: "No name, no face, no city on this page. Not paranoia — a preference. The work speaks, and if it doesn't, a name wouldn't have helped.",
    ctas: [
      { label: "See the work", to: "work", primary: true },
      { label: "Contact", to: "contact" },
    ],
    blocks: [
      { kicker: "origin", title: "Started with a broken 486", body: "It was already broken when it arrived. It was more broken afterwards. Something clicked anyway." },
      { kicker: "now", title: "Benches, not offices", body: "A room, good light, an anti-static mat, and more spare screws than any person needs." },
      { kicker: "stance", title: "Repair over replace", body: "Most things called dead are one component and forty minutes away from fine. The rest get stripped, and the parts get used." },
      { kicker: "tools", title: "What's on the bench", body: "", hasList: true, items: ["Hot air station and a steady hand", "Drive imagers, write blockers", "A drawer of donor boards", "More USB sticks than sense"] },
    ],
  },
  work: {
    eyebrow: "selected repairs",
    title: "Things that were dead.",
    lede: "No client names, no photos of anyone's living room. What came in, what was wrong, what happened next.",
    ctas: [{ label: "Bring me yours", to: "contact", primary: true }],
    blocks: [
      { kicker: "recovery", title: "4TB out of a flooded drive", body: "Dried, cleaned, imaged in a single pass. 94% recovered, including the only copy of eleven years of photos.", hasTile: true, tile: "drive teardown · photo slot", img: "/photos/drive-teardown.jpg", imgAlt: "An opened hard disk drive on a white background, platter and read arm exposed" },
      { kicker: "board", title: "Reflowed a GPU everyone wrote off", body: "Two cold joints. Still running two years later — two years longer than the shop that quoted a new machine predicted." },
      { kicker: "network", title: "A house with three routers fighting", body: "Removed two. The third works perfectly and always did.", hasTile: true, tile: "cabinet before/after · photo slot", img: "/photos/network-cabinet.jpg", imgAlt: "A wiring rack buried under a chaotic curtain of blue patch cables" },
      { kicker: "forensics", title: "Ransomware, no ransom", body: "An offline backup existed. Nobody knew. Restored in an afternoon." },
      { kicker: "absurd", title: "A laptop full of sand", body: "Beach holiday. Every key. It lives.", hasTile: true, tile: "keyboard, disassembled · photo slot", img: "/photos/keyboard-disassembled.jpg", imgAlt: "A beige mechanical keyboard with most keycaps pulled, bare switch stems showing" },
      { kicker: "ongoing", title: "Twelve machines kept alive past 2019", body: "Small office, no budget. SSDs and RAM instead of a purchase order." },
    ],
  },
  gallery: {
    eyebrow: "dumping ground",
    title: "Random shit, catalogued.",
    lede: "Dead hardware, screenshots of things that should not compile, and photographs of cable drawers. Lazy-loaded, EXIF stripped, no lightbox library.",
    ctas: [{ label: "Contact instead", to: "contact" }],
    blocks: [
      { kicker: "img_01", title: "Exploded ThinkPad", body: "Every screw laid out in order. It went back together.", hasTile: true, tile: "4:5 · photo slot", img: "/photos/thinkpad-exploded.jpg", imgAlt: "A laptop opened on a wooden bench, battery and mainboard exposed, screwdrivers alongside" },
      { kicker: "img_02", title: "Burnt capacitor, close", body: "Macro. You can see where it gave up.", hasTile: true, tile: "16:9 · photo slot", img: "/photos/burnt-capacitor.jpg", imgAlt: "Bulged and vented electrolytic capacitors on a dusty motherboard, one shedding its sleeve" },
      { kicker: "clip_01", title: "Fan bearing screaming", body: "Eight seconds. Muted by default, obviously.", hasTile: true, tile: "video · muted loop" },
      { kicker: "img_03", title: "Forty drives, one works", body: "A shelf of maybes.", hasTile: true, tile: "3:4 · photo slot", img: "/photos/drive-shelf.jpg", imgAlt: "Five PATA hard drives stacked on a scuffed wooden desk, connectors facing out" },
      { kicker: "img_04", title: "CRT still alive", body: "Refuses to die. Respect.", hasTile: true, tile: "1:1 · photo slot", img: "/photos/crt-alive.jpg", imgAlt: "A CRT monitor glowing amber in a dark room, text faintly burned into the phosphor" },
      { kicker: "img_05", title: "Cable drawer, unsolved", body: "An ongoing situation.", hasTile: true, tile: "4:5 · photo slot", img: "/photos/cable-drawer.jpg", imgAlt: "A dense tangle of power and data cables jammed beneath a desk shelf" },
    ],
  },
  // The form itself is a component, not data — `App` renders `SignUp` in place
  // of the block grid for this page. `blocks` stays empty so the hero, the
  // layout adaptation and the entrance motion all behave exactly as they do
  // everywhere else.
  signup: {
    eyebrow: "accounts",
    title: "Make an account.",
    lede: "For saving setups and, later, reaching your own machines. No email, no name, nothing that identifies you — a handle and a password, and the password never leaves your browser.",
    ctas: [],
    blocks: [],
  },

  admin: {
    eyebrow: "operator",
    title: "Administration.",
    lede: "Accounts, and what may be done to them. Visible only to an operator, and every action behind it is refused by the server for anybody else — this page being hidden is a courtesy, not the lock.",
    ctas: [],
    blocks: [],
  },

  signin: {
    eyebrow: "accounts",
    title: "Sign in.",
    lede: "Handle and password. The password is turned into a key here in your browser and the plain text never leaves it — the server is sent something derived from it and cannot work backwards.",
    ctas: [],
    blocks: [],
  },

  machines: {
    eyebrow: "drives",
    title: "Your machines.",
    lede: "The computers you have paired, and the folders they share. Files travel straight from that machine to this browser — the site introduces the two and then gets out of the way.",
    ctas: [],
    blocks: [],
  },

  share: {
    eyebrow: "drives",
    title: "Share this machine.",
    lede: "Pick a folder and this tab serves it, read-only, to your own signed-in browsers. Close the tab and sharing stops. The site never sees the folder, its path, or a single file byte.",
    ctas: [],
    blocks: [],
  },

  contact: {
    eyebrow: "the useful page",
    title: "Computer repair.",
    lede: "Independent, one person, no shopfront. Dead, slow, infected, or you need the photos off a drive that stopped spinning. Email is below, reply usually within a day.",
    ctas: [{ label: "Copy the address", to: "contact", primary: true, action: "reveal-mail" }],
    blocks: [
      { kicker: "email", title: "The only way in", body: "Plain email, assembled in your browser so the scrapers don't get it. No form, no ticket system, nothing that stores your details on someone else's server.", hasMail: true },
      { kicker: "what i fix", title: "Most of it", body: "", hasList: true, items: ["Laptops and desktops — Windows, macOS, Linux", "Won't boot, blue screens, random shutdowns", "SSD and RAM upgrades for slow machines", "Malware removal and clean reinstalls", "Data recovery from failing drives", "Screens, keyboards, batteries, fans", "Home wifi, routers, printers (reluctantly)", "Backups, so it doesn't happen twice"] },
      { kicker: "what i don't", title: "A short list", body: "", hasList: true, items: ["Phone and tablet glass", "Getting into an account that isn't yours", "Crypto wallet recovery", "3am emergencies, unless genuinely on fire"] },
      { kicker: "area", title: "Local, plus about thirty minutes around it", body: "Drop-off or collection by arrangement. Remote fixes over the phone where they'll actually work. Ask and I'll tell you if you're in range." },
      // COPY CHANGE 2026-08-14, following the home page's "the rate" block.
      // Step three was "Fixed, or you pay nothing" — the same no-fix-no-fee
      // promise the client has now contradicted, so it could not stay. It is
      // replaced with the step that actually happens rather than a new
      // guarantee: nothing here promises anything the client has not said.
      // "Rough quote back, free" is untouched and still true — a rough estimate
      // from an emailed description is not a diagnosis, and it is the one thing
      // in this flow that genuinely costs nothing.
      { kicker: "how it works", title: "Three steps", body: "", hasList: true, items: ["Email what's wrong", "Rough quote back, free", "$150 lands, and I start"] },
      { kicker: "include", title: "To save a round trip", body: "Make and model, what it does, and when it started doing it. One sentence is fine." },
    ],
  },
  now: {
    eyebrow: "currently on the bench",
    title: "What's open right now.",
    lede: "Updated when it changes, which is not often enough to justify a feed. If your machine is on this list it is being worked on and you do not need to email me twice.",
    ctas: [{ label: "Add yours to it", to: "contact", primary: true }],
    blocks: [
      { kicker: "in progress", title: "Three ThinkPads, one keyboard between them", body: "Two are donors. The third is going home." },
      { kicker: "waiting on parts", title: "A screen coming slowly from very far away", body: "Ordered, shipped, tracking last seen in a warehouse. Six to ten days." },
      { kicker: "in progress", title: "A NAS rebuild that should not have taken this long", body: "Two disks replaced, array resilvering. Slow by design." },
      { kicker: "diagnosing", title: "An intermittent shutdown", body: "The worst kind. It behaves perfectly on the bench and dies at home. Currently running a week of logging." },
      { kicker: "done this week", title: "Two clean reinstalls and a battery", body: "All collected. All working." },
      { kicker: "personal", title: "Something old, being restored badly", body: "Not for a client. Not going well. Continuing anyway." },
    ],
  },
  /**
   * NEW COPY, written for this build (2026-08-14, TODO 9 — "a setup guide
   * page/download (Tailscale et al.)"). Not from the prototype and not from the
   * spec, so it is the second block of copy on the site that is not verbatim,
   * after home's "the site" block. Scope agreed with the client: remote access
   * *before a callout* — the page you send someone so a fix does not need a
   * drive — with Tailscale as the standing option and the simpler ones named.
   *
   * Three site rules it is written to keep: no city is named, there is no form
   * and no email in the markup (the CTA points at Contact, which assembles the
   * address at runtime), and nothing here is a link, because the site has no
   * outbound links anywhere.
   */
  setup: {
    eyebrow: "before the callout",
    title: "Let me look from here.",
    lede: "A good half of what goes wrong doesn't need me in the room. Set one of these up and I can see the machine from mine — same fix, no drive, no afternoon spent waiting in.",
    // One CTA, like Contact's. Two buttons pointing at the same page is a wart,
    // and everything here funnels to the same place anyway: email first.
    ctas: [{ label: "Tell me what's wrong first →", to: "contact", primary: true }],
    blocks: [
      {
        kicker: "first",
        title: "Ask before you install anything",
        body: "Say what the machine is doing and I'll tell you whether remote is any use. A computer that won't turn on, a drive that's stopped spinning, anything that smells hot — that needs hands and a bench. This page is for the rest of it, which is most of it.",
      },
      {
        kicker: "windows",
        title: "Quick Assist, already on your machine",
        body: "Nothing to install, nothing to sign up for, and it stops existing the moment you close the window. Reach for this one first.",
        hasList: true,
        items: [
          "Press Start, type Quick Assist, open it",
          "Choose the option to get help — it asks for a code",
          "I read you the code over the phone, you type it in",
          "Agree to share the screen, and you watch the whole thing",
          "Close the window when we're done. That's the end of it",
        ],
      },
      {
        kicker: "mac",
        title: "Tell me which version you're on",
        body: "macOS has screen sharing built in, but where it lives moved around between versions and I would rather send you the three right steps than four wrong ones. One line in an email and I'll send them back.",
      },
      {
        kicker: "if it's regular",
        title: "Tailscale, for machines I look after",
        body: "Worth ten minutes if I'm in your machine more than once. It builds a private link between your computer and mine — nothing else on the internet can reach it, and it survives reboots, so neither of us sets it up again.",
        hasList: true,
        items: [
          "Install it from the Tailscale website on that machine",
          "Sign in with an account you already have",
          "Tell me the name it gives the machine",
          "Screen sharing then runs inside that private link, not out in the open",
          "Free, for the amount of it we need",
        ],
      },
      {
        kicker: "what i can see",
        title: "Your screen, while you're watching it",
        body: "All of these show me the screen and ask you to agree before they do. You watch the whole session, you can stop it at any point, and none of them let me in while the machine is sitting there on its own. A tool that works any other way is not on this page.",
      },
      {
        kicker: "turning it off",
        title: "Whenever you feel like it",
        body: "Quick Assist ends when you close the window. Tailscale uninstalls like any other program, and taking it off the machine takes my way in with it. You don't have to tell me first.",
      },
      {
        kicker: "the warning",
        title: "If they rang you, it's a scam",
        body: "Microsoft does not phone people. Neither does your bank's security department, nor anyone who has found a virus on a computer they have never seen. They will talk you into installing exactly the kind of tool this page describes. The difference is that you rang me.",
        hasList: true,
        items: [
          "Hang up — you don't owe them the rest of the call",
          "Don't install anything they name, however official it sounds",
          "If you already did, unplug the network cable or turn off the wifi, then ring me",
          "Nobody legitimate asks for gift cards. Nobody. Ever",
        ],
      },
    ],
  },
  changelog: {
    eyebrow: "site edits",
    title: "Things I changed.",
    lede: "A log of edits to a website nobody asked for, kept for the same reason people keep receipts.",
    ctas: [{ label: "Back to the front", to: "home" }],
    blocks: [
      { kicker: "v2.4", title: "Repainted the whole thing", body: "Twice. The second one stuck." },
      { kicker: "v2.3", title: "Stopped explaining the website on the website", body: "Nobody came here to read the spec sheet." },
      { kicker: "v2.2", title: "Made it behave on a phone", body: "Most people are holding one. It took embarrassingly long to admit that." },
      { kicker: "v2.1", title: "Rewrote what it says about money", body: "The old version promised something I do not actually offer." },
      { kicker: "v2.0", title: "Threw out the terminal", body: "Green text on black was a decision made at 2am in 2009 and defended for far too long." },
      { kicker: "v1.9", title: "Email hidden from scrapers", body: "Assembled in the browser. The bots get a placeholder, you get an address." },
    ],
  },
  guestbook: {
    eyebrow: "1999 revival",
    title: "Sign nothing.",
    lede: "A guestbook with no form, because a form is a database and a database is a liability. Transcribed from emails, with permission, minus everything identifying.",
    ctas: [{ label: "Email instead", to: "contact", primary: true }],
    blocks: [
      { kicker: "entry 001", title: "“Got my photos back. All of them.”", body: "— someone who had not backed up since 2011" },
      { kicker: "entry 002", title: "“Cheaper than the quote for a new one.”", body: "— a five-year-old laptop that now boots in nine seconds" },
      { kicker: "entry 003", title: "“You told me not to buy anything. Who does that?”", body: "— unclear whether this was a compliment" },
      { kicker: "entry 004", title: "“The website is insane.”", body: "— many people, repeatedly" },
      { kicker: "entry 005", title: "“It still smells faintly of the sea.”", body: "— the sand laptop, six months on" },
    ],
  },
  /*
   * The scam-awareness page (client, 2026-08-14): "we both know people are
   * going to fucking click and call those numbers either way, but if it helps
   * even one grandparent not get scammed, worth it to me a million times over."
   *
   * **The naming rule, agreed with the client and load-bearing.** Every company
   * named here is named as somebody the *scammer impersonates*, and every tool
   * is named as legitimate software the scammer *abuses*. Nothing on this page
   * says or implies that any named company does any of this. That distinction
   * is what makes the page both useful and safe to publish, it is why the
   * disclaimer block sits third rather than in a footnote, and it is not a
   * decoration on the copy — a future edit that starts listing companies as
   * fraudulent removes the protection and gains the reader nothing, because a
   * reader does not need a company branded criminal to recognise the script
   * being read to them down the phone.
   *
   * The reporting details in "where to report it" were verified against the
   * Canadian Anti-Fraud Centre's own reporting page on 2026-08-14 — the number,
   * the hours, the online system and the advice to call local police are all
   * theirs, quoted rather than remembered. **If they are ever edited, re-check
   * them at the source first**: wrong reporting details on this page are worse
   * than no page.
   *
   * The register is deliberately flatter than the rest of the site. The house
   * voice is self-deprecating and this page is about somebody's grandmother
   * losing her savings, so the jokes step back and the sentences get shorter.
   */
  scams: {
    eyebrow: "read this before you call anyone",
    title: "Nobody legitimate calls you first.",
    lede: "Tech support scams take more money from older people than almost anything else online, and they work because they are polite, patient and rehearsed. Here is exactly how they run, in the order they run it, so you can recognise one while it is happening to you.",
    ctas: [
      { label: "Get my machine checked \u2192", to: "contact", primary: true },
      { label: "Legitimate remote help", to: "setup" },
    ],
    blocks: [
      { kicker: "the whole page in one line", title: "If they contacted you, it is a scam", body: "Microsoft does not ring you. Your bank does not ask you to install anything. A warning on a web page cannot know your name, your machine, or whether it has a virus. Every real version of this starts with you deciding to contact someone \u2014 never the other way round." },
      { kicker: "if it is happening right now", title: "Stop, in this order", body: "If you are on the phone to one of them as you read this, do these and nothing else. You do not owe them politeness, and hanging up mid-sentence is the correct thing to do.", hasList: true, items: [
        "Hang up. Do not press any number, including the one that supposedly cancels",
        "If they are on your screen, unplug the network cable or switch off the Wi-Fi",
        "Shut the computer down \u2014 holding the power button in is fine",
        "Do not ring any number they gave you, and do not answer if they ring back",
        "Tell somebody. The secrecy is part of the attack",
        "If money has already moved, ring your bank now, from the number on your card"
      ] },
      { kicker: "say it again", title: "They will never call you. Not once, not ever.", body: "Microsoft will not ring you. Windows will not ring you. Norton, McAfee, Amazon, PayPal, Apple, Geek Squad and your internet provider will not ring you about a virus, an error, a refund or a renewal. There is no department anywhere that watches your computer and telephones you about it \u2014 that department does not exist. Your bank is the one exception worth mentioning, because a bank genuinely may ring about a suspicious payment. It changes nothing: hang up and ring the number on the back of your card. A real bank will be glad you did. A scammer will do everything they can to stop you." },
      { kicker: "to be absolutely clear", title: "None of these companies are doing this", body: "Every company named on this page is named because scammers pretend to be them. Every program named is real, legitimate software that scammers talk people into installing. Microsoft, Amazon, Norton, McAfee, PayPal, Apple, the banks and the CRA are not doing any of this, and neither are the makers of any tool listed here. What is described below is how criminals impersonate them \u2014 nothing else." },
      { kicker: "the tell that costs them the most", title: "They will lose their temper. A real company never does.", loud: true, body: "This is the single most reliable signal on this page. It starts small \u2014 a sigh, a bit of tutting \u2014 and it arrives the moment you stop doing exactly what you are told. No employee of any real company behaves like this, because no real company has anything to gain from it. If you catch yourself thinking \"they are getting annoyed with me\", that is your answer. Hang up.", hasList: true, items: [
        "Sighing, groaning, tutting, or that long exasperated breath down the phone",
        "\"Ma'am. Ma'am. MA'AM.\" \u2014 talking over you, or repeating a line louder instead of answering it",
        "Audible frustration when you ask a simple question, or ask them to slow down",
        "Impatience turning to rudeness, then to insults and swearing, often quite suddenly",
        "Warm and friendly right up until you say no, then a completely different person",
        "Mocking you, or telling you that you do not understand computers",
        "Anger at the exact moment you mention your bank, your family, or the police",
        "You can hear a room full of other people running the same call behind them",
        "They break off mid-sentence to talk to a colleague in another language, then come back"
      ] },
      { kicker: "why it works", title: "They are not stupid, and neither are you", body: "People assume victims are gullible. They are not. These are scripted operations with call centres, hold music and supervisors, and the script is built to put you under time pressure and keep you talking so that you never get a quiet minute to think. Being caught out by a professional is not the same thing as being foolish, and the shame is most of what stops people telling somebody in time." },
      { kicker: "how it starts", title: "The five ways they reach you", body: "It almost always begins in one of these ways. Nothing further down this page happens until one of them has.", hasList: true, items: [
        "A phone call out of the blue, often with a delay before they speak",
        "A pop-up filling the screen, sometimes with a siren noise or a recorded voice, and a number to call",
        "An email or text about a payment, a renewal, a delivery or a refund you were not expecting",
        "A sponsored search result for a support number \u2014 they buy ads for the same words you searched",
        "A callback: you rang a number from a pop-up, hung up, and now they ring you"
      ] },
      { kicker: "who they claim to be", title: "The names they borrow", body: "The name is chosen to make you drop your guard, and it is always one you already trust. Impersonating these companies is the scam \u2014 the companies are not involved.", hasList: true, items: [
        "Microsoft, Windows Defender, or \"Windows Support\" \u2014 the most common by a wide margin",
        "Norton, McAfee or another antivirus, usually about a renewal you never signed up for",
        "Amazon, PayPal or Apple, about a purchase or a refund",
        "Your bank's fraud department, ringing to \"protect\" your account",
        "The CRA, about a refund, a debt, or a warrant",
        "Geek Squad or a big-box store's support desk",
        "Your internet provider, about a problem with your connection",
        "A grandchild, a nephew, or a police officer ringing on their behalf"
      ] },
      { kicker: "the script", title: "Things they actually say", body: "If you hear any of these, you already have your answer. They are not variations on a theme \u2014 they are the theme.", hasList: true, items: [
        "\"We have detected suspicious activity coming from your IP address.\"",
        "\"Your computer is sending out errors to our servers.\"",
        "\"Your antivirus subscription renewed for $499. Press 1 to cancel.\"",
        "\"Do not turn off your computer or you may lose your files.\"",
        "\"Do not discuss this with anyone, including bank staff \u2014 this is an active investigation.\"",
        "\"I am going to stay on the line with you the entire time.\"",
        "\"We accidentally refunded you too much. You will need to send the difference back.\""
      ] },
      { kicker: "the phone itself", title: "Give me a call back on my mobile", body: "How they handle the phone gives them away as clearly as what they say. A real company routes you through its own switchboard and is perfectly happy for you to hang up and ring the number on your bill instead. A real support line also opens by telling you the call is recorded, and a scam call essentially never does \u2014 but take that one the right way round: its absence tells you plenty, while hearing it proves nothing at all. It is one line of script, and script is the thing they have most of.", hasList: true, items: [
        "\"Call me back on my cell phone\" \u2014 or any direct personal mobile number",
        "They ring back again and again once you hang up, sometimes for hours",
        "They ring back for days or weeks, and each time they know a little more about you",
        "A different number each time, often made to look local, or made to look like the real company",
        "They ask for your mobile number \"in case we get cut off\"",
        "No \"this call may be recorded\" at the start \u2014 real support lines nearly always say it, scammers do not",
        "They will not give you a number that reaches a real switchboard",
        "The name they give does not match the accent, and changes if you ask twice",
        "\"I am going to stay on the line with you the whole time\" \u2014 including while you drive to the bank"
      ] },
      { kicker: "the squeeze", title: "Urgency, secrecy, and threats", body: "Every one of these exists to stop you doing the single thing that ends the scam, which is telling somebody else what is happening.", hasList: true, items: [
        "It has to be done right now, today, within the hour",
        "\"Do not tell anyone, this is an active investigation\"",
        "Coaching you on what to tell bank staff if they ask what the money is for",
        "Telling you to say it is for family, or home improvements, or a car",
        "Threats: arrest, a warrant, deportation, losing your files, losing your pension",
        "\"If you hang up now, we cannot protect your account\"",
        "Asking whether you live alone, or when somebody else will be home",
        "\"Do not turn the computer off or you will lose everything\""
      ] },
      { kicker: "the line nobody crosses", title: "Things no real company will ever ask you for", body: "There is no exception to any of these. Not for verification, not for security, not for a supervisor, not ever. \"Except for verification\" is the gap the entire scam fits through.", hasList: true, items: [
        "Your password, your PIN, or a one-time code sent to your phone",
        "Remote access to your computer, when they contacted you first",
        "Payment in gift cards, cryptocurrency, wire transfer, e-transfer, or cash by courier",
        "To move your money to a \"safe account\" they give you",
        "To log into online banking while they are watching your screen",
        "To install anything at all from a link they read out to you",
        "To keep the conversation secret from your bank or your family"
      ] },
      { kicker: "the handoff", title: "Now I'll pass you to my senior technician", body: "The moment you agree to give access, you usually stop talking to the person who rang you. The first voice is there to qualify you \u2014 to find out whether you will cooperate and whether there is money worth taking. The second one is the closer, and they are better at it: calmer, more senior-sounding, more patient, and the one who will actually walk you into the bank transfer. Being passed to a supervisor is not evidence that this is a real company. It is a sign you have been marked as worth the extra time." },
      { kicker: "the actual attack", title: "What they need you to do", body: "Everything above is theatre. This is the part that costs money, and it is always the same two steps: get onto your machine, then get money out in a form nobody can reverse.", hasList: true, items: [
        "Install a remote-access program so they can control your screen",
        "Sign in to your online banking while they are watching",
        "Buy gift cards and read the numbers on the back down the phone",
        "Send a wire transfer, an e-transfer, or cash by courier",
        "Deposit cash into a cryptocurrency machine",
        "Keep it secret from your family and from bank staff who ask why"
      ] },
      { kicker: "the tell that never fails", title: "Nobody real asks for gift cards", body: "No company, no bank, no government department and no police force has ever been paid in Apple, Google Play, Steam or Amazon gift cards. Not once, anywhere. If gift cards come up in any conversation about money you supposedly owe, the conversation is a crime in progress. The same goes for cryptocurrency machines and for couriers sent to collect cash." },
      { kicker: "the tools", title: "Real software, used against you", body: "These are ordinary, legitimate remote-support programs. Technicians use them every day and there is nothing wrong with any of them. The problem is never the program \u2014 it is who asked you to install it, and why.", hasList: true, items: [
        "AnyDesk, TeamViewer, UltraViewer, LogMeIn, Splashtop, ConnectWise",
        "Windows Quick Assist, which is already on your machine",
        "Anything they ask you to download from a link they read out to you"
      ] },
      { kicker: "once they are connected", title: "What they do while you watch", body: "If somebody already has control of your screen, these are the things to look for. Several of them exist so that you cannot see what is being done in your name.", hasList: true, items: [
        "Your screen goes black, or they \"need to run a scan\" you are told not to interrupt",
        "They type at you in Notepad instead of speaking, so nobody nearby overhears",
        "Windows minimise and reappear, or the mouse moves on its own",
        "Your antivirus is switched off, or Windows warnings are dismissed quickly",
        "A second remote tool is installed \"as a backup connection\"",
        "They ask you to leave the room, make a cup of tea, or fetch a bank card",
        "They open your email, your saved passwords, or your online banking",
        "A password gets changed \"for your security\" and they tell you the new one",
        "You get handed to a \"senior technician\", a \"supervisor\" or the \"refund department\""
      ] },
      { kicker: "the proof that is not proof", title: "The screens they use to scare you", body: "Part of the script is showing you something alarming on your own machine. All of these are normal parts of Windows and not one of them means anything is wrong.", hasList: true, items: [
        "Event Viewer \u2014 every Windows PC on earth is permanently full of red and yellow warnings",
        "The netstat command, presented as \"look at all these foreign connections\"",
        "The Windows prefetch folder, presented as a list of viruses",
        "A CMD window with text scrolling, or a fake scan filling a browser window",
        "The Run box, typed into to show you a made-up \"licence ID\""
      ] },
      { kicker: "the counter-move", title: "Refresh the page. Then refresh it again.", body: "The refund scam works by changing what is on your screen, not what is in your account. Somebody with control of your computer can edit the web page you are looking at \u2014 make a balance read $20,000 instead of $200, or add a payment that never happened \u2014 and it is convincing because it is your own bank's website with your own name on it. None of that survives a reload. Not one pixel of it. The page redraws from the bank's actual servers and every change they made disappears. Do it whenever a number looks wrong, and do it without announcing it.", hasList: true, items: [
        "On Windows: press F5, or hold Ctrl and press R",
        "On a Mac: hold Command and press R",
        "Or click the circular arrow next to the address bar",
        "On a phone or tablet: pull the page down and let go",
        "Best of all, check the balance on a different device they are not connected to",
        "If a number changes back after a refresh, you were being shown a fake",
        "If they tell you not to refresh, or refresh it themselves first, that is your answer"
      ] },
      { kicker: "the pop-up that will not close", title: "It is a web page, not a virus", body: "A full-screen warning with a siren and a phone number is a web page doing exactly what web pages can do. It has not scanned anything, it cannot see your files, and it is not a virus. It is designed to feel unclosable so that you ring the number instead.", hasList: true, items: [
        "Press Escape first \u2014 that alone drops most of them out of full screen",
        "Then hold Ctrl and press W to close the tab, or Command and W on a Mac",
        "If the tab will not close: Ctrl, Shift and Escape opens Task Manager, then End task on the browser",
        "On a Mac: Command, Option and Escape, then Force Quit the browser",
        "When you reopen the browser, decline any offer to restore the previous pages",
        "Never ring the number, and never let it talk you into installing a \"cleaner\""
      ] },
      { kicker: "the questions that end it", title: "Ask them something they should already know", body: "A real company holds your details; a scammer is fishing for them. You do not have to be clever about this \u2014 one question usually collapses the whole call.", hasList: true, items: [
        "Ask which account, which invoice number, or which product they are ringing about",
        "Ask them to tell you your account number, rather than you telling them",
        "Ask for their name, department, and a switchboard number, then say you will ring back",
        "Notice if they ask for details the real company would already have",
        "Notice a \"Dear Customer\" email, or an address that is not the company's own domain",
        "Notice being \"put through to a supervisor\" who somehow already knows everything",
        "Any real company is happy for you to hang up and ring the number on your bill or card"
      ] },
      { kicker: "the other one aimed at you", title: "The grandchild who is in trouble", body: "Not a computer scam, but it targets the same people and it is worth knowing while you are here. Somebody rings in tears claiming to be a grandchild \u2014 arrested, in hospital, in a crash abroad \u2014 and needs money now, and begs you not to tell their parents. Sometimes a second voice comes on claiming to be a lawyer or a police officer. The secrecy is the tell, exactly as it is above. Hang up and ring your grandchild on the number you already have. If it was real, they will answer, and if they do not, ring their parents \u2014 the people you were told not to ring." },
      { kicker: "the second wave", title: "The refund scam, months later", body: "If you were caught once, expect a second call. Sometimes it is a \"refund\" for the money you lost; sometimes it is somebody claiming to be police, or a recovery agency who can get it back for a fee. Lists of people who paid are sold on and reused. The second approach is often more convincing than the first, because this time they already know what happened to you." },
      { kicker: "before it ever happens", title: "Twenty minutes that make you a hard target", body: "All of this is easier to do on a quiet afternoon than during a phone call designed to panic you.", hasList: true, items: [
        "Agree a password with your family that anyone ringing for money has to say",
        "Write \"nobody legitimate calls me first\" on a card and leave it by the phone",
        "Tell your bank you will never authorise a transfer over the phone",
        "Put a daily transfer limit on the account, at the bank, in person",
        "Turn on call blocking or call screening with your phone provider",
        "Save the real numbers \u2014 bank, provider, me \u2014 into the phone so you never have to search for one",
        "Agree with one relative that you will ring them before moving any money, always"
      ] },
      { kicker: "if you are reading this for somebody else", title: "How to help without making it worse", body: "Most people who have been scammed do not tell anyone, and shame is the reason the second call works. If you have walked in on it, the priority is the phone and the screen \u2014 not the conversation about how it happened.", hasList: true, items: [
        "Get the call ended and the machine off the network first, argue about it afterwards",
        "Do not tell them they have been stupid; they will stop telling you things",
        "Ring the bank together, from the number on the card",
        "Change the email password first, then everything else",
        "Report it even if they would rather not \u2014 and see the second-wave note above",
        "Expect follow-up calls for months, and warn them about the refund one"
      ] },
      { kicker: "if you only rang the number", title: "You rang, but installed nothing", body: "This is the most common outcome and the least dangerous, but it is not nothing: you have confirmed to a criminal operation that your number is live and that you answer.", hasList: true, items: [
        "Nothing was installed, so the machine is almost certainly fine",
        "Block the number, but expect them to ring from a different one",
        "The next call may claim to be someone else entirely \u2014 police, your bank, a refund department",
        "Warn whoever else uses that phone, especially if it is a shared landline",
        "If you gave out any personal details at all, treat it as the section below"
      ] },
      { kicker: "if you gave them access", title: "Assume they took what they could", body: "Somebody who had control of your screen may have left something behind, read your saved passwords, or opened accounts in another window while you watched a fake scan.", hasList: true, items: [
        "Ring your bank from the number on your card, not from anything they gave you",
        "Change your email password first \u2014 it is the key that resets everything else",
        "Then banking and shopping passwords, from a different device if you have one",
        "Have the machine gone over properly before using it for anything financial",
        "Watch for a follow-up call about a refund; see above"
      ] },
      { kicker: "if you already paid", title: "Speed matters more than embarrassment", body: "Money can sometimes be stopped in the first hours and almost never after that. Ring your bank immediately, say plainly that you were defrauded, and ask them to attempt a recall. If you bought gift cards, ring the card issuer with the receipts and the numbers \u2014 occasionally the balance is still sitting on them. Nobody at the bank will be surprised, and nobody there thinks you are stupid." },
      { kicker: "and then get it checked", title: "This is the part I can help with", body: "Passwords and banks you have to do yourself, and quickly. The machine is mine. If somebody had remote control of it, it needs going over properly \u2014 what they left behind, what was installed, what runs at startup, and whether anything is set up to let them back in. Email me what happened and roughly when, and do not use it for banking until it has been looked at. My terms are on the contact page and they do not change because you have had a bad week." },
      { kicker: "where to report it", title: "The Canadian Anti-Fraud Centre", body: "Report it even if you lost nothing, and even if you feel foolish. Reports are what get numbers shut down, and they are the one thing that actually costs these operations something \u2014 far more than an hour of anybody's time on the phone. The Centre is run jointly by the RCMP, the OPP and the Competition Bureau, on 1-888-495-8501, Monday to Friday 10am to 4:45pm Eastern, closed holidays. There is an online reporting system at reportcyberandfraud.canada.ca. If you have actually lost money, contact your local police as well." },
      { kicker: "in ontario", title: "Who to ring here", body: "Report it even if nothing was lost. The Anti-Fraud Centre builds the national picture; the police act on what happened to you, and Ontario has one number for the whole province.", hasList: true, items: [
        "Emergency, or somebody is at your door: 911",
        "OPP, non-emergency, toll-free and answered 24 hours: 1-888-310-1122",
        "OPP TTY, for deaf or hard of hearing: 1-888-310-1133",
        "Canadian Anti-Fraud Centre: 1-888-495-8501, weekdays 10am to 4:45pm Eastern",
        "Online, any time: reportcyberandfraud.canada.ca",
        "If you have a municipal police service, ring their non-emergency line instead of the OPP",
        "Your bank, on the number printed on your card \u2014 first, if money has moved"
      ] },
      { kicker: "one last thing", title: "Hanging up is not rude", body: "People stay on the line because they were raised not to be rude to a stranger, and the script is built on exactly that. You are allowed to put the phone down in the middle of a sentence, on anybody, for any reason. Do not try to argue, catch them out, or keep them talking to waste their time \u2014 that is an hour of your life against a shift they are paid for, and it keeps a professional talking to you while marking your number as one that answers. Hang up, then report the number. That does the damage." },
      { kicker: "the honest bit", title: "Why this page exists", body: "I am the person people ring afterwards. Nothing about that conversation is fun, and by then the money is usually gone. If there is an afterlife, there is a dark corner of it set aside for people who do this to somebody's grandmother for a living. Until then the best anyone can do is hang up and report the number. And if they already got you: tell somebody today. Not tomorrow, and not never. The silence is the part they are counting on, and you would be amazed how many people never say a word. If reading this stops one person handing over their screen, it has paid for the whole website several times over. Send it to whoever in your family is most likely to answer the phone." },
    ],
  },
  notfound: {
    eyebrow: "pressure lost · http 404",
    title: "Nothing here. Never was.",
    lede: "You typed it wrong, a link rotted, something was deleted on purpose, or you are a crawler doing reconnaissance. Three of those are forgivable.",
    ctas: [
      { label: "Go home", to: "home", primary: true },
      { label: "Contact", to: "contact" },
    ],
    blocks: [
      { kicker: "trace", title: "resource not found", body: "/var/www/whatever_you_wanted → exists = false" },
      // "eight" → "nine" (2026-08-14): the Setup page made the count wrong. The
      // client kept this line *because* it was correct — the counts on the 404
      // are jokes that depend on being true — so keeping the word would have
      // been the change, not correcting it. One word; nothing else here moved.
      { kicker: "suggestion", title: "Try the parts that exist", body: "There are ten other pages and all of them are more interesting than this one.", hasList: true, items: ["Landing — the joke", "Contact — the useful one", "Now — what's on the bench", "Gallery — the dumping ground"] },
    ],
  },
};
