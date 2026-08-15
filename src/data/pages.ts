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
 *    jokes now, written for this build; the two palette *gags* (changelog
 *    v2.4, 404's "consolation") stay.
 * 2. `setup` is a whole new page, written for this build on 2026-08-14 (TODO 9).
 *    Scope agreed with the client: remote access *before a callout*.
 * 3. The 404's "eight other pages" became "nine", because `setup` made the old
 *    number false. The counts on that page are jokes that depend on being true,
 *    which is why the client kept them; leaving it wrong would have been the
 *    change. One word — nothing else on the 404 moved.
 * 4. home's "the rate" block carries the client's actual terms as of
 *    2026-08-14 ($150 up front, $120/hour after), and Contact's third step
 *    matches it. This is a term of business, not a joke — keep them in step.
 * 5. home's "Some of this is hidden" block was removed the same day: it
 *    advertised that hidden unlock routes exist, which is an invitation and not
 *    a feature.
 * 6. Every other line in this file, including every other stale-looking
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
      { label: "Show me something weird", to: "gallery" },
    ],
    blocks: [
      // "Fifteen years" → "Over twenty years" at the client's correction
      // (2026-08-14). His number, not the spec's.
      { kicker: "the pitch", title: "Machines get fixed here", body: "Over twenty years of taking things apart and putting most of them back together. Laptops, desktops, drives that stopped spinning, networks that never worked properly to begin with." },
      { kicker: "the catch", title: "There is no catch", body: "No quote form, no ticket system, no chat widget pretending to be a person. You send an email, you get a reply, usually the same day." },
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
      { kicker: "v2.4", title: "Added six palettes nobody will pick", body: "Oxide, Signal Flare, Peat, Xerox, Anodised, Sodium. Peat is deliberately hard to read." },
      { kicker: "v2.3", title: "The site now shuffles itself", body: "Five behaviours, including one that reshuffles on every click. Regret is a feature." },
      { kicker: "v2.2", title: "Calm mode stopped being a half measure", body: "It is now its own aesthetic rather than the same site with the fun turned down." },
      { kicker: "v2.1", title: "Screensaver", body: "Sixty seconds of no clicking and the interface gets out of the way. Mouse drift no longer counts as being alive." },
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
      { kicker: "suggestion", title: "Try the parts that exist", body: "There are nine other pages and all of them are more interesting than this one.", hasList: true, items: ["Landing — the joke", "Contact — the useful one", "Now — what's on the bench", "Gallery — the dumping ground"] },
      { kicker: "consolation", title: "Have a palette instead", body: "Twenty-four of them. None will find your page." },
    ],
  },
};
