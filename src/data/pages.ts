/**
 * Final page copy for all nine pages.
 * Copied verbatim from the prototype's PAGES object (Site v2 - Vessel.dc.html:366).
 *
 * COPY CORRECTION, approved by the client (see CLAUDE.md):
 * home's kicker:"the site" block was stale from v1 — "Twenty-four palettes, eight
 * layouts" / "8 layout archetypes" — but v2 ships thirteen layouts. Corrected here
 * to "Twenty-four palettes, thirteen layouts" / "13 layout archetypes". Every other
 * line in this file, including every other stale-looking count, is verbatim.
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
      { kicker: "the pitch", title: "Machines get fixed here", body: "Fifteen years of taking things apart and putting most of them back together. Laptops, desktops, drives that stopped spinning, networks that never worked properly to begin with." },
      { kicker: "the catch", title: "There is no catch", body: "No quote form, no ticket system, no chat widget pretending to be a person. You send an email, you get a reply, usually the same day." },
      { kicker: "the site", title: "Twenty-four palettes, thirteen layouts", body: "Everything visible here is switchable. It is entirely unnecessary. That is the point.", hasList: true, items: ["24 colour palettes", "13 layout archetypes", "12 background modes", "5 type systems"] },
      { kicker: "the honesty", title: "What this is not", body: "Not an agency. Not a startup. Not looking for funding, partnerships, or your synergy. One person and a bench." },
      { kicker: "the rate", title: "Free diagnosis, always", body: "If it can't be fixed you pay nothing and you get it back in the same number of pieces it arrived in." },
      { kicker: "the door", title: "Some of this is hidden", body: "There are six ways into a panel you will never need. Cosmetic to you, load-bearing to me." },
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
      { kicker: "recovery", title: "4TB out of a flooded drive", body: "Dried, cleaned, imaged in a single pass. 94% recovered, including the only copy of eleven years of photos.", hasTile: true, tile: "drive teardown · photo slot" },
      { kicker: "board", title: "Reflowed a GPU everyone wrote off", body: "Two cold joints. Still running two years later — two years longer than the shop that quoted a new machine predicted." },
      { kicker: "network", title: "A house with three routers fighting", body: "Removed two. The third works perfectly and always did.", hasTile: true, tile: "cabinet before/after · photo slot" },
      { kicker: "forensics", title: "Ransomware, no ransom", body: "An offline backup existed. Nobody knew. Restored in an afternoon." },
      { kicker: "absurd", title: "A laptop full of sand", body: "Beach holiday. Every key. It lives.", hasTile: true, tile: "keyboard, disassembled · photo slot" },
      { kicker: "ongoing", title: "Twelve machines kept alive past 2019", body: "Small office, no budget. SSDs and RAM instead of a purchase order." },
    ],
  },
  gallery: {
    eyebrow: "dumping ground",
    title: "Random shit, catalogued.",
    lede: "Dead hardware, screenshots of things that should not compile, and photographs of cable drawers. Lazy-loaded, EXIF stripped, no lightbox library.",
    ctas: [{ label: "Contact instead", to: "contact" }],
    blocks: [
      { kicker: "img_01", title: "Exploded ThinkPad", body: "Every screw laid out in order. It went back together.", hasTile: true, tile: "4:5 · photo slot" },
      { kicker: "img_02", title: "Burnt capacitor, close", body: "Macro. You can see where it gave up.", hasTile: true, tile: "16:9 · photo slot" },
      { kicker: "clip_01", title: "Fan bearing screaming", body: "Eight seconds. Muted by default, obviously.", hasTile: true, tile: "video · muted loop" },
      { kicker: "img_03", title: "Forty drives, one works", body: "A shelf of maybes.", hasTile: true, tile: "3:4 · photo slot" },
      { kicker: "img_04", title: "CRT still alive", body: "Refuses to die. Respect.", hasTile: true, tile: "1:1 · photo slot" },
      { kicker: "img_05", title: "Cable drawer, unsolved", body: "An ongoing situation.", hasTile: true, tile: "4:5 · photo slot" },
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

  signin: {
    eyebrow: "accounts",
    title: "Sign in.",
    lede: "Handle and password. The password is turned into a key here in your browser and the plain text never leaves it — the server is sent something derived from it and cannot work backwards.",
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
      { kicker: "how it works", title: "Three steps", body: "", hasList: true, items: ["Email what's wrong", "Rough quote back, free", "Fixed, or you pay nothing"] },
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
      { kicker: "suggestion", title: "Try the parts that exist", body: "There are eight other pages and all of them are more interesting than this one.", hasList: true, items: ["Landing — the joke", "Contact — the useful one", "Now — what's on the bench", "Gallery — the dumping ground"] },
      { kicker: "consolation", title: "Have a palette instead", body: "Twenty-four of them. None will find your page." },
    ],
  },
};
