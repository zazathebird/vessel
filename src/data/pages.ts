/**
 * Final page copy for all seventeen pages. Eleven render blocks — the spec's
 * nine, plus `setup` and `scams` (2026-08-14). The other six (`signup`,
 * `signin`, `admin`, `machines`, `share`, `downloads`) carry hero copy written
 * for this build and an empty `blocks` array, because a component renders the
 * body of each.
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
    /*
     * Was "pressure nominal" (2026-08-16). It was instrument flavour on the
     * three words a stranger reads before anything else on the site, and it is
     * exactly the failure the 2026-08-15 rewrite was aimed at: short,
     * plain-worded, and telling the reader nothing. Every other content page's
     * eyebrow already names what the page is — "selected repairs", "the useful
     * page", "before the callout", "read this before you call anyone" — and
     * home was the one that did not, on the page that most needed to.
     *
     * It loses a private rhyme with the 404's "pressure lost · http 404",
     * which **stays**: that one pairs the flavour with its own translation, so
     * it reads as a joke rather than as a readout, and by the time anyone sees
     * it they already know what the site is. Roughly nobody sees both and
     * connects them; everybody sees this one first.
     *
     * "one guy" rather than anything grander is the house voice, and the same
     * joke the third block lands with "No AI, just a guy".
     */
    eyebrow: "computer repair · over twenty years",
    title: "Oh. It's you.",
    lede: "Broken boards get soldered here, not boxed up and quoted as a new machine. Dead, slow, crawling with viruses, or holding the only copy of photographs of somebody who isn't around to take any more. You email me, I tell you roughly what it will cost, and then I fix it.",
    ctas: [
      { label: "Fix my computer →", to: "contact", primary: true },
      // Featured on the landing page at the client's request (2026-08-14). It
      // sits ahead of the joke CTA deliberately: of the two, only one of them
      // can stop somebody losing their savings this afternoon.
      { label: "Don't get scammed", to: "scams" },
    ],
    blocks: [
      // "Fifteen years" → "Over twenty years" at the client's correction
      // (2026-08-14). His number, not the spec's.
      { kicker: "the pitch", title: "Machines get fixed here", body: "Over twenty years of laptops, desktops, drives that stopped spinning and home internet that never worked properly to begin with. If you are worried about privacy: I have seen enough by accident to have no interest in going near anybody's files." },
      { kicker: "the catch", title: "There is no catch", body: "No forms, no queue, no ticket number, and no chat window operated by a man named Kevin who is not named Kevin. You email me, I read it myself, and the reply comes from the person who will be fixing it, not from a queue." },
      // The one block on this page pointing somewhere other than the work.
      { kicker: "read this first", title: "Nobody legitimate calls you first", body: "Microsoft does not phone people about a virus. Nobody there is watching your computer, and no department anywhere rings you about one. Anyone who rings claiming otherwise is reading off a script, and there is a page here that walks through exactly which one. Send it to whoever in your family answers the phone." },
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
       * Its best line survived here for twelve days and is now gone too (client,
       * 2026-08-26): "get rid of how much i spent on the website. not important.
       * id rather have details relating to the actual site and what its for and
       * what i will do, OR make a joke." The elaborate-website gag is a joke
       * about the developer told to somebody holding a broken laptop. Both
       * halves of that instruction are now on the page — this block says what
       * he will do, and "the process" below says in what order.
       */
      { kicker: "the honesty", title: "What you actually get", body: "A shop with a wall of new laptops behind the counter has a reason to call yours finished. If your machine isn't worth fixing I'll tell you, and if I can't fix it I'll tell you that too \u2014 which loses me the job and saves you a week of being strung along by somebody who won't." },
      // NEW 2026-08-26. The client asked for copy about "what its for and what i
      // will do" in place of jokes about the website itself, and this is the one
      // thing a stranger most wants to know and no repair shop ever writes down:
      // the sequence. It also sets the expectation that silence is not neglect,
      // which is the complaint every repair business actually gets.
      { kicker: "the process", title: "What actually happens", body: "You email. I ask two or three questions, most of which sound stupid and aren't. You get a rough cost before anything starts, and the fault once I have the machine. Then it either comes to me or I look at it from here, and you hear from me when there is something worth saying \u2014 not daily updates engineered to feel like progress." },
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
      // REWORDED 2026-08-15 at the client's request. The previous version was
      // accurate and still left the one question a customer actually has
      // unanswered: is the $150 a deposit that comes off the hourly, or a
      // separate charge on top of it? "$150 before anything starts, then $120 an
      // hour from there" can be read either way, and the wrong reading turns
      // into an argument at invoice time. It says which now, in as many words.
      { kicker: "the rate", title: "What it costs", body: "$150 to take the job on, then $120 for every hour after that. The $150 is a separate charge — it is not a deposit and it does not come off the hourly rate — and I do not start until it has been paid. Plumbers and electricians charge for coming out, for the same reason: working out what is wrong with a machine is the job, not something I do for free first." },
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
    title: "Over twenty years of other people's disasters.",
    lede: "No name, no face, no city, and no stock photograph of a man in a headset who has never worked here. What I fix and what it costs are on the contact page, which is the only part of any biography that ever fixed a computer.",
    ctas: [
      { label: "Fix my computer →", to: "contact", primary: true },
    ],
    blocks: [
      { kicker: "origin", title: "It was dead when I got it", body: "A 486 — a desktop from the early nineties, ancient even then, and already dead when it reached me. I took it apart to find out why. That is still the whole job." },
      { kicker: "now", title: "Your machine does not leave this room", body: "Whatever comes in is worked on where I am, not packed into a box and sent away. The places with a counter and a lanyard will often do exactly that, then read you a tracking number." },
      { kicker: "stance", title: "Most dead computers aren't", body: "Most machines somebody has been told are finished need one part and about forty minutes. The ones genuinely past saving get stripped, and their parts go into somebody else's repair. \u201cIt is not worth fixing\u201d is a sentence with a commission attached." },
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

  downloads: {
    eyebrow: "programs",
    title: "Things I wrote, mostly.",
    // Written for this build, 2026-08-19. Same plain register as the 2026-08-15
    // rewrite, and it names the awkward part rather than skating past it: some
    // of these cost money and the way you pay is an e-transfer to a person,
    // which is unusual enough that saying so up front is less strange than
    // letting somebody discover it at the click.
    lede: "Small programs I wrote to fix things that annoyed me, and a few I've collected over the years. Some are free. The rest cost a few dollars \u2014 send an e-transfer and a code comes back that unlocks the download. Shareware, the old way: none of it turns into $9.99 a month the moment you look away.",
    ctas: [{ label: "Ask me about one \u2192", to: "contact", primary: true }],
    blocks: [],
  },

  share: {
    eyebrow: "drives",
    title: "Share this machine.",
    lede: "Pick a folder and this tab serves it, read-only, to your own signed-in browsers. Close the tab and sharing stops. The site never sees where the folder is, or a single file byte — only the name you give it.",
    ctas: [],
    blocks: [],
  },

  contact: {
    eyebrow: "the useful page",
    title: "Computer repair.",
    lede: "Dead, slow, riddled with viruses, or you need the photographs off a hard drive that has stopped working. The email address is below, and you will usually hear back within a day.",
    ctas: [{ label: "Copy the address", to: "contact", primary: true, action: "reveal-mail" }],
    blocks: [
      { kicker: "email", title: "Email, and nothing else", body: "The address below is put together by your own browser the moment you click it, so the machines that trawl websites collecting addresses for spam do not find it. There is no form to fill in, and nothing about you is stored here.", hasMail: true },
      { kicker: "what i fix", title: "Most of it", body: "", hasList: true, items: ["Laptops and desktops — Windows, Mac and Linux", "Won't turn on, freezes, crashes, or shuts itself off", "Making slow machines quick again with better parts", "Removing viruses, or wiping it and setting it up fresh", "Getting files back off a drive that is failing", "Screens, keyboards, batteries and fans", "Home wifi, routers and printers (reluctantly)", "Setting up backups, so it does not happen twice"] },
      { kicker: "what i don't", title: "A short list", body: "", hasList: true, items: ["Cracked phone and tablet screens", "Getting into an account that is not yours", "Recovering lost cryptocurrency", "3am emergencies, unless something is genuinely on fire"] },
      { kicker: "area", title: "Local, plus about thirty minutes around it", body: "You can drop the machine off, or I can come and collect it — whichever suits. Some problems I can sort out remotely while you are on the phone, when that will genuinely work. Ask, and I will tell you honestly whether you are near enough." },
      // COPY CHANGE 2026-08-14, following the home page's "the rate" block.
      // Step three was "Fixed, or you pay nothing" — the same no-fix-no-fee
      // promise the client has now contradicted, so it could not stay. It is
      // replaced with the step that actually happens rather than a new
      // guarantee: nothing here promises anything the client has not said.
      // "Rough quote back, free" is untouched and still true — a rough estimate
      // from an emailed description is not a diagnosis, and it is the one thing
      // in this flow that genuinely costs nothing.
      /*
       * The body carries the two numbers, and it is here because **step three
       * says "the $150" and Contact cannot assume the reader has seen home**
       * (2026-08-16). This is the destination of the primary call to action on
       * home, on scams and on setup, it is third in the nav, and it is the page
       * people bookmark and come back to — so arriving cold and meeting a
       * definite article in front of a number that appears nowhere else on the
       * page is the common case, not the edge one.
       *
       * It repeats the "not a deposit" wording from home's rate block on
       * purpose. `CLAUDE.md` calls that sentence load-bearing because the wrong
       * reading of it becomes an argument when the invoice arrives, and a
       * reader who never saw home would otherwise have no way to get it right.
       * No number changes here and no fee is named that the client has not
       * given.
       */
      { kicker: "how it works", title: "Three steps", body: "It is $150 to take the job on, and $120 for every hour after that. The $150 is a separate charge — it is not a deposit and it does not come off the hourly rate.", hasList: true, items: ["You email me what is wrong", "I reply with a rough price — that part costs nothing", "You pay the $150, and I get started"] },
      { kicker: "include", title: "What to put in the email", body: "The make and model if you know it, what the machine is doing wrong, and roughly when it started. One sentence is genuinely enough — it just saves us a round of questions." },
    ],
  },
  now: {
    /*
     * REWRITTEN 2026-08-26 to what is actually here.
     *
     * Every entry on this page had been inherited from the design handoff and
     * was fiction: three laptops with one keyboard, a screen in transit, a
     * household file store rebuilding its disks, an intermittent fault sent
     * home with a logger, two machines collected, a 486 restoration. The client
     * has two machines in front of him — a laptop with a heat fault and a
     * laptop with a suspected dead drive — and a bin of parts.
     *
     * **This is the one page on the site that claims to be true today**, which
     * makes it the one page a customer can catch out for free: they ask about
     * the file store, and there is no file store. A short true list beats a
     * long invented one here more than anywhere else on the site.
     *
     * It also means this page has an owner's job attached to it — it goes stale
     * by sitting still, and a stale `now` page is worse than no `now` page.
     */
    eyebrow: "currently in for repair",
    title: "What's open right now.",
    lede: "What is in front of me at the moment, updated when something comes off the list. If yours is on it, it is being worked on, and emailing twice does not move it up.",
    ctas: [{ label: "Add yours to it", to: "contact", primary: true }],
    blocks: [
      { kicker: "in progress", title: "A laptop that overheats", body: "Fine from cold, then it throttles or shuts itself off once it warms up. That is usually dust and dried-out paste, sometimes a failing fan, and occasionally a board fault doing an impression of both." },
      { kicker: "diagnosing", title: "A laptop whose drive has stopped answering", body: "The SSD is not showing up at all, which points at the drive itself rather than anything around it. If that holds, it is a replacement — and first, everything that can still be read off the old one." },
      { kicker: "parts", title: "A bin of machines that did not make it", body: "Screens, keyboards, drives, fans and a great deal of screws. Most repairs come out of it, which is why a part is often the cheapest thing about a job." },
    ],
  },

  /**
   * NEW COPY, written for this build (2026-08-14, TODO 9 — "a setup guide
   * page/download (Tailscale et al.)"). Not from the prototype and not from the
   * spec, so it is the second block of copy on the site that is not verbatim,
   * after home's "the site" block. Scope agreed with the client: remote access
   * *before a callout* — the page you send someone so a fix does not need a
   * drive. Tailscale was the standing option here until 2026-08-26, when it was
   * removed — see the block comment below for why, and do not put it back
   * without reading it.
   *
   * Three site rules it is written to keep: no city is named, there is no form
   * and no email in the markup (the CTA points at Contact, which assembles the
   * address at runtime), and nothing here is a link, because the site has no
   * outbound links anywhere.
   */
  setup: {
    eyebrow: "before the callout",
    title: "Let me look from here.",
    // "no drive" → "no driving" (2026-08-15). On a computer repair site "no
    // drive" reads first as *hard* drive, which is the one word on the page
    // that could be misread as being about the machine rather than the journey.
    lede: "A good half of what goes wrong doesn't need me in the room. Use one of these and I can see the machine from mine — same fix, no driving, no afternoon spent waiting in for someone.",
    // One CTA, like Contact's. Two buttons pointing at the same page is a wart,
    // and everything here funnels to the same place anyway: email first.
    ctas: [{ label: "Tell me what's wrong first →", to: "contact", primary: true }],
    blocks: [
      {
        kicker: "first",
        title: "Ask before you install anything",
        body: "Tell me what the machine is doing and I'll tell you whether looking at it from here is any use at all. A computer that won't turn on, a hard drive that has stopped working, anything that smells hot — that needs hands and a workbench. This page is for everything else, which is most of it.",
      },
      /*
       * MOVED UP 2026-08-15 at the client's request — "list software closer to
       * the disclaimer". It was the last block on the page, three blocks below
       * the tools it is about.
       *
       * It sits *above* the instructions rather than merely beside them, and
       * that is the whole point of moving it. This page teaches somebody to
       * install remote-access software and hand control of their screen to a
       * voice on the phone, which is precisely the thing a scammer spends a call
       * trying to achieve. A person already being talked through it by a
       * criminal is following steps, not browsing — so the warning has to be in
       * front of the steps, not after them. Anyone who reads to the bottom was
       * never the one at risk.
       */
      {
        kicker: "before any of it",
        title: "If they rang you, it's a scam",
        body: "Microsoft does not phone people. Neither does your bank's security department, nor anyone who has found a virus on a computer they have never seen. They will talk you into installing exactly the kind of program this page describes — the same programs, by name. The difference that matters is who started it. If a call ever leaves you unsure, end it and ring me back on the number I gave you: I will never mind, and a scammer cannot survive it.",
        hasList: true,
        items: [
          "Hang up — you don't owe them the rest of the call",
          "Don't install anything they name, however official it sounds",
          "If you already did, switch off the router — the box the internet comes into the house through — then ring me",
          "I will never ask you for a password. Not for this, not for anything",
          "Nobody legitimate asks to be paid in gift cards. Nobody. Ever",
        ],
      },
      /*
       * REWRITTEN 2026-08-26 (round 5, the cold read). The Windows list had two
       * defects and both would strand a real person.
       *
       * "it stops existing the moment you close the window" was simply false —
       * the *session* ends, the app stays installed. It was a reassurance built
       * on a wrong fact, which is the worst kind on this page, and the true
       * version is nearly as reassuring.
       *
       * "already on your machine" is true of Windows 11 and often not of
       * Windows 10, where Quick Assist comes from the Microsoft Store. Microsoft
       * retired the in-box app in 2022. The commonest stall on the whole page —
       * "I typed it and it just offered me a web search" — had no answer on it.
       *
       * The code line is scoped to a call the reader placed. As it stood it was
       * the scam script verbatim ("I read you the code over the phone, you type
       * it in"), endorsed on their own technician's site with no condition
       * attached, and criminals run Quick Assist exactly that way.
       */
      {
        kicker: "windows",
        title: "Quick Assist, already on most machines",
        body: "Nothing to sign up for, and it can do nothing at all until you open it and type in a code I have just given you on a call you rang me for. Reach for this one first.",
        hasList: true,
        items: [
          "Press Start, type Quick Assist, open it",
          "If nothing comes up, it is free in the Microsoft Store — search Quick Assist, published by Microsoft",
          "Type the code I give you into the box and press Submit. Codes do not last long, so do it while we are talking",
          "Choose to share your screen, and you watch the whole thing",
          "Windows may put up a prompt asking you to allow something. That one is yours to click — I cannot touch it from my side",
          "If I need to take the mouse I will say so first, and you will see it move",
          "Close the window when we're done. Either of us can end it, and that is the end of it",
        ],
      },
      {
        kicker: "mac",
        title: "Tell me which version you're on",
        body: "macOS has screen sharing built in, but where it lives moved around between versions and I would rather send you the three right steps than four wrong ones. Click the Apple menu, choose About This Mac, and email me the line that says macOS and a number. I'll send the steps back.",
      },
      /*
       * REPLACED THE TAILSCALE BLOCK, 2026-08-26 (round 5). Tailscale was the
       * page's "standing option" for machines the operator is in repeatedly.
       * Two things killed it.
       *
       * The steps did not work: signing in with the customer's own account puts
       * the machine on the *customer's* tailnet, which the operator is not on,
       * and a device name means nothing across tailnets. Five steps followed
       * exactly connected to nothing. Fixing that needs either an admin-console
       * share (far beyond this reader) or customers joining the operator's own
       * tailnet — which puts strangers' machines on one network whose default
       * ACLs let every device reach every other.
       *
       * And it was never needed. This page's own decision (docs/DECISIONS.md,
       * 2026-08-14) says what the operator can see is "the screen, while you
       * watch, **never unattended**." Unattended reach is the entire thing
       * Tailscale buys. It was paying an account signup, a second program the
       * page never named, and a permanent way into a customer's machine, for a
       * capability the operator had already decided not to use.
       *
       * What it saved for a repeat customer was one code exchange, on a call
       * they placed anyway. This block says that, and it says it as the
       * advantage it is: nothing is left running, so there is nothing for
       * anyone else to find later. If unattended access is ever genuinely
       * wanted, TODO.md has the path — and it is not this one.
       */
      {
        kicker: "if it's regular",
        title: "Even if I'm in there often",
        body: "There is nothing to install and nothing that stays behind, however many times I look. It is a fresh code every time, and it only works while you are sitting there agreeing to it. That is deliberate: a permanent way into your machine is worth something to me about twice a year, and worth a great deal to whoever finds it.",
      },
      /*
       * REWRITTEN 2026-08-26 (round 5). The old copy welded two claims together
       * and the join was where the weight sat: "every one of these asks you to
       * allow it before it shows me anything" is a claim about *software* and is
       * false for Tailscale, while "I will not set any of them up to connect
       * without asking" is an honest personal promise and is the half doing the
       * work. Presenting the undertaking as a property of the tools takes away
       * the reader's ability to check it, and hands a scammer the line "don't
       * worry, it always asks you first".
       *
       * The last two sentences are the page's most valuable missing line. A
       * screen share shows everything on the screen, passwords included, and the
       * page told somebody to hand over their screen without ever saying so.
       */
      {
        kicker: "what i can see",
        title: "Your screen, while you're watching it",
        body: "You watch the whole session and you can stop it at any point. I ask before I connect, every single time, and I will not put anything on your machine that can reach it without asking you first — so if a screen ever gets shared without you agreeing to it right then, it was not me. While I am looking, don't type a password and don't open your banking. I can see everything you can.",
      },
      {
        kicker: "after",
        title: "When we're done",
        body: "I'll tell you we're finished and you will see the window close — or close it yourself whenever you feel like it, since either of us can. On a Mac, stop sharing and it stops. Nothing was installed, so there is nothing to uninstall. If you typed anything private while I was watching — a password, a card number — change it afterwards, the same as you would if somebody had been standing behind you. And if you later get a call saying we need to connect again, hang up and ring me back on the number you already have. That will always be me, and it will never be them.",
      },
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
   * disclaimer block sits directly after the first block that names the
   * companies rather than in a footnote, and it is not a
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
   * **Reorganised 2026-09-23 at the client's request** ("all the info seems out
   * of order and random"): five runs — right now, the rule, the call in the
   * order it runs, after, before — with the repeats merged. The terms, the
   * scripted quotes and the reporting details were kept, not simplified; see
   * the "do not finish scams" note in CLAUDE.md, which this does not overrule.
   *
   * The register is deliberately flatter than the rest of the site. The house
   * voice is self-deprecating and this page is about somebody's grandmother
   * losing her savings, so the jokes step back and the sentences get shorter.
   */
  scams: {
    eyebrow: "read this before you call anyone",
    title: "Nobody legitimate calls you first.",
    lede: "If somebody rang you about your computer, it is a scam. What to do right now comes first. After that: the one rule, then how these calls run, step by step, so you can spot one while it is happening — and what to do if one already got you.",
    ctas: [
      { label: "Get my machine checked →", to: "contact", primary: true },
      { label: "Legitimate remote help", to: "setup" },
    ],
    blocks: [
      // ---- 1. Right now. Somebody mid-call is following steps, not browsing.
      { kicker: "if it is happening right now", title: "Stop, in this order", body: "If you are on the phone to one of them as you read this, do these and nothing else. You do not owe them politeness, and hanging up mid-sentence is the correct thing to do.", hasList: true, items: [
        "Hang up. Do not press any number, including the one that supposedly cancels",
        "If money has moved, ring your bank now, on the number printed on your card. This one has a clock on it",
        "If somebody is at your door to collect cash, ring 911",
        "If they are on your screen, switch off the router — the box the internet comes into the house through. Pulling its plug out does the same thing",
        "Shut the computer down — holding the power button in is fine",
        "Change your email password, from a different device — a phone is fine. It is the key that resets everything else",
        "Do not ring any number they gave you, and do not answer if they ring back",
        "Tell somebody. The secrecy is part of the attack"
      ] },
      { kicker: "the pop-up that will not close", title: "It is a web page, not a virus", body: "A full-screen warning with a siren and a phone number is a web page doing exactly what web pages can do. It has not scanned anything, it cannot see your files, and it is not a virus. It is designed to feel unclosable so that you ring the number instead.", hasList: true, items: [
        "Press Escape first — that alone drops most of them out of full screen",
        "Then hold Ctrl and press W to close the tab, or Command and W on a Mac",
        "If a box appears asking whether you really want to leave, that is the page trying it on. Say yes to leaving",
        "If the tab still will not close: Ctrl, Shift and Escape opens Task Manager, then End task on whichever line is your browser",
        "On a Mac: Command, Option and Escape, then Force Quit the browser",
        "Or just hold the power button in until the machine goes off. Nothing is lost that matters",
        "When you reopen the browser, decline any offer to restore the previous pages",
        "Never ring the number, and never let it talk you into installing a \"cleaner\""
      ] },
      { kicker: "if a number on your bank's page looks wrong", title: "Refresh the page. Then refresh it again.", body: "Somebody with control of your computer can change what your bank's website shows you. They can make a balance read $20,000 instead of $200, or add a payment that never happened, and it looks real because it is your own bank's page with your own name on it. Refreshing redraws the page from the bank itself and wipes their changes. Do it whenever a number looks wrong, and do it without announcing it. The rule underneath is simpler still: you do not send money to somebody who rang you, whatever the screen says.", hasList: true, items: [
        "On Windows: press F5, or hold Ctrl and press R",
        "On a Mac: hold Command and press R",
        "Or click the circular arrow next to the address bar",
        "On a phone or tablet: pull the page down and let go",
        "Best of all, check the balance on a different device they are not connected to",
        "If a number changes back after a refresh, you were being shown a fake",
        "If the money really is there, they may have moved it between your own accounts — ring the bank on the number on your card, and send nothing back",
        "If they tell you not to refresh, or refresh it themselves first, that is your answer"
      ] },

      // ---- 2. The rule, and the lines no real company crosses.
      { kicker: "the one rule", title: "If they contacted you, it is a scam", body: "Every real version of this starts with you contacting somebody, never the other way round. Microsoft will not ring you. Neither will Windows, Norton, McAfee, Amazon, PayPal, Apple, Geek Squad or your internet provider — not about a virus, an error, a refund or a renewal. No department anywhere watches your computer and rings you about it, and a warning on a web page cannot know your name, your machine, or whether it has a virus. Your bank is the one exception, because a bank genuinely may ring about a suspicious payment. It changes nothing: hang up and ring the number on the back of your card. A real bank will be glad you did. A scammer will do everything they can to stop you." },
      { kicker: "to be absolutely clear", title: "None of these companies are doing this", body: "Every company named on this page is named because scammers pretend to be them. Every program named is real, legitimate software that scammers talk people into installing. Microsoft, Amazon, Norton, McAfee, PayPal, Apple, the banks and the Canada Revenue Agency are not doing any of this, and neither are the makers of any tool listed here. What is described below is how criminals impersonate them — nothing else." },
      { kicker: "the line nobody crosses", title: "Things no real company will ever ask you for", body: "There is no exception to any of these. Not for verification, not for security, not for a supervisor, not ever. \"Except for verification\" is the gap the entire scam fits through.", hasList: true, items: [
        "Your password, your PIN, or a one-time code sent to your phone",
        "Remote access to your computer, when they contacted you first",
        "Payment in gift cards, cryptocurrency, or cash handed to a courier",
        "A wire transfer or an e-transfer to somebody who contacted you first",
        "To move your money to a \"safe account\" they give you",
        "To log into online banking while they are watching your screen",
        "To install anything at all from a link they read out to you",
        "To keep the conversation secret from your bank or your family"
      ] },
      { kicker: "the tell that never fails", title: "Nobody real asks for gift cards", body: "No company, no bank, no government department and no police force has ever been paid in Apple, Google Play, Steam or Amazon gift cards. Not once, anywhere. If gift cards come up in any conversation about money you supposedly owe, the conversation is a crime in progress. The same goes for cryptocurrency machines and for couriers sent to collect cash." },
      { kicker: "you are allowed", title: "Hanging up is not rude", body: "People stay on the line because they were raised not to be rude to a stranger, and the script is built on exactly that. You are allowed to put the phone down in the middle of a sentence, on anybody, for any reason. Do not try to argue, catch them out, or keep them talking to waste their time — that is an hour of your life against a shift they are paid for, and it marks your number as one that answers. Hang up, then report the number. That does the damage." },

      // ---- 3. How the call runs, in the order it runs.
      { kicker: "how it starts", title: "The five ways they reach you", body: "It almost always begins in one of these ways. Nothing further down this page happens until one of them has.", hasList: true, items: [
        "A phone call out of the blue, often with a delay before they speak",
        "A pop-up filling the screen, sometimes with a siren noise or a recorded voice, and a number to call",
        "An email or text about a payment, a renewal, a delivery or a refund you were not expecting",
        "A sponsored search result for a support number — they buy ads for the same words you searched",
        "A callback: you rang a number from a pop-up, hung up, and now they ring you"
      ] },
      { kicker: "who they claim to be", title: "The names they borrow", body: "The name is chosen to make you drop your guard, and it is always one you already trust. Impersonating these companies is the scam — the companies are not involved.", hasList: true, items: [
        "Microsoft, Windows Defender, or \"Windows Support\" — the most common by a wide margin",
        "Norton, McAfee or another antivirus, usually about a renewal you never signed up for",
        "Amazon, PayPal or Apple, about a purchase or a refund",
        "Your bank's fraud department, ringing to \"protect\" your account",
        "The Canada Revenue Agency, about a refund, a debt, or a warrant",
        "Geek Squad or a big-box store's support desk",
        "Your internet provider, about a problem with your connection",
        "A grandchild, a nephew, or a police officer ringing on their behalf"
      ] },
      { kicker: "the script", title: "Things they actually say", body: "If you hear any of these, you already have your answer. They are not variations on a theme — they are the theme.", hasList: true, items: [
        "\"We have detected suspicious activity coming from your IP address.\"",
        "\"Your computer is sending out errors to our servers.\"",
        "\"Your antivirus subscription renewed for $499. Press 1 to cancel.\"",
        "\"Do not turn off your computer or you may lose your files.\"",
        "\"Do not discuss this with anyone, including bank staff — this is an active investigation.\"",
        "\"We accidentally refunded you too much. You will need to send the difference back.\""
      ] },
      // Quoted like the scammer-voice list items above it. Bare, on a repair
      // site whose whole business is the reader ringing the operator, it reads
      // for a beat as the site's own instruction.
      { kicker: "the phone itself", title: "“Give me a call back on my mobile”", body: "How they handle the phone gives them away as clearly as what they say. A real company routes you through its own switchboard and is perfectly happy for you to hang up and ring the number on your bill instead.", hasList: true, items: [
        "\"Call me back on my cell phone\" — or any direct personal mobile number",
        "They ring back again and again once you hang up — for hours, then for days or weeks, knowing a little more about you each time",
        "A different number each time, often made to look local, or made to look like the real company",
        "They ask for your mobile number \"in case we get cut off\"",
        "No \"this call may be recorded\" at the start — real support lines nearly always say it, scammers do not",
        "They will not give you a number that reaches a real switchboard",
        "The name they give changes if you ask twice, and the badge number never checks out",
        "\"I am going to stay on the line with you the whole time\" — including while you drive to the bank"
      ] },
      { kicker: "the squeeze", title: "Urgency, secrecy, and threats", body: "Every one of these exists to stop you doing the single thing that ends the scam, which is telling somebody else what is happening.", hasList: true, items: [
        "It has to be done right now, today, within the hour",
        "Coaching you on what to tell bank staff if they ask what the money is for",
        "Telling you to say it is for family, or home improvements, or a car",
        "Threats: arrest, a warrant, deportation, losing your files, losing your pension",
        "\"If you hang up now, we cannot protect your account\"",
        "Asking whether you live alone, or when somebody else will be home"
      ] },
      { kicker: "the tell that costs them the most", title: "They will lose their temper. A real company never does.", loud: true, body: "This is the single most reliable signal on this page. It starts small — a sigh, a bit of tutting — and it arrives the moment you stop doing exactly what you are told. No employee of any real company behaves like this, because no real company has anything to gain from it. If you catch yourself thinking \"they are getting annoyed with me\", that is your answer. Hang up.", hasList: true, items: [
        "Sighing, groaning, tutting, or that long exasperated breath down the phone",
        "\"Ma'am. Ma'am. MA'AM.\" — talking over you, or repeating a line louder instead of answering it",
        "Audible frustration when you ask a simple question, or ask them to slow down",
        "Impatience turning to rudeness, then to insults and swearing, often quite suddenly",
        "Warm and friendly right up until you say no, then a completely different person",
        "Mocking you, or telling you that you do not understand computers",
        "Anger at the exact moment you mention your bank, your family, or the police",
        "You can hear a room full of other people running the same call behind them",
        "They break off mid-sentence to talk to a colleague in another language, then come back"
      ] },
      { kicker: "the handoff", title: "Now I'll pass you to my senior technician", body: "The moment you agree to give access, you usually stop talking to the person who rang you. The first voice is there to qualify you — to find out whether you will cooperate and whether there is money worth taking. The second one is the closer, and they are better at it: calmer, more senior-sounding, more patient, and the one who will actually walk you into the bank transfer. Being passed to a supervisor is not evidence that this is a real company. It is a sign you have been marked as worth the extra time." },
      { kicker: "the actual attack", title: "What they need you to do", body: "Everything above is theatre. This is the part that costs money, and it is always the same two steps: get onto your machine, then get money out in a form nobody can reverse.", hasList: true, items: [
        "Install a remote-access program so they can control your screen",
        "Sign in to your online banking while they are watching",
        "Buy gift cards and read the numbers on the back down the phone",
        "Send a wire transfer, an e-transfer, or cash by courier",
        "Deposit cash into a cryptocurrency machine",
        "Keep it secret from your family and from bank staff who ask why"
      ] },
      { kicker: "the tools", title: "Real software, used against you", body: "These are ordinary, legitimate remote-support programs. Technicians use them every day and there is nothing wrong with any of them. The problem is never the program — it is who asked you to install it, and why.", hasList: true, items: [
        "AnyDesk, TeamViewer, UltraViewer, LogMeIn, Splashtop, ConnectWise",
        "Windows Quick Assist, which is already on most machines",
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
        "A password gets changed \"for your security\" and they tell you the new one"
      ] },
      { kicker: "the proof that is not proof", title: "The screens they use to scare you", body: "Part of the script is showing you something alarming on your own machine. All of these are normal parts of Windows and not one of them means anything is wrong.", hasList: true, items: [
        "Event Viewer — every Windows PC on earth is permanently full of red and yellow warnings",
        "The netstat command, presented as \"look at all these foreign connections\"",
        "The Windows prefetch folder, presented as a list of viruses",
        "A CMD window with text scrolling, or a fake scan filling a browser window",
        "The Run box, typed into to show you a made-up \"licence ID\""
      ] },
      { kicker: "the questions that end it", title: "Ask them something they should already know", body: "A real company holds your details; a scammer is fishing for them. You do not have to be clever about this — one question usually collapses the whole call.", hasList: true, items: [
        "Ask which account, which invoice number, or which product they are ringing about",
        "Ask them to tell you your account number, rather than you telling them",
        "Ask for their name, department, and a switchboard number, then say you will ring back",
        "Notice if they ask for details the real company would already have",
        "Notice a \"Dear Customer\" email, or an address that is not the company's own domain",
        "Notice being \"put through to a supervisor\" who somehow already knows everything",
        "Any real company is happy for you to hang up and ring the number on your bill or card"
      ] },
      { kicker: "the other one aimed at you", title: "The grandchild who is in trouble", body: "Not a computer scam, but it targets the same people and it is worth knowing while you are here. Somebody rings in tears claiming to be a grandchild — arrested, in hospital, in a crash abroad — and needs money now, and begs you not to tell their parents. Sometimes a second voice comes on claiming to be a lawyer or a police officer. The secrecy is the tell, exactly as it is above. Hang up and ring your grandchild on the number you already have. If it was real, they will answer, and if they do not, ring their parents — the people you were told not to ring." },

      // ---- 4. After. Most readers arrive here, not at the top; worst case first.
      { kicker: "if you already paid", title: "Speed matters more than embarrassment", body: "Money can sometimes be stopped in the first hours and almost never after that. Ring your bank immediately, say plainly that you were defrauded, and ask them to attempt a recall. If you bought gift cards, ring the card issuer with the receipts and the numbers — occasionally the balance is still sitting on them. Nobody at the bank will be surprised, and nobody there thinks you are stupid." },
      { kicker: "if you gave them access", title: "Assume they took what they could", body: "Somebody who had control of your screen may have left something behind, read your saved passwords, or opened accounts in another window while you watched a fake scan.", hasList: true, items: [
        "Ring your bank from the number on your card, not from anything they gave you",
        "Change your email password first, from a different device — a phone is fine. It is the key that resets everything else",
        "Then, in the email settings, check for forwarding rules, and for a recovery address or phone number that is not yours. A new password does not remove those",
        "Sign out all other devices — every email account has that button somewhere in its security settings",
        "Turn on two-step verification while you are in there",
        "Then banking and shopping passwords, from that same other device",
        "Put a fraud alert on your credit file with Equifax and TransUnion. Both are free and take one phone call each",
        "Have the machine gone over properly before using it for anything financial"
      ] },
      { kicker: "if you only rang the number", title: "You rang, but installed nothing", body: "This is the most common outcome and the least dangerous, but it is not nothing: you have confirmed to a criminal operation that your number is live and that you answer.", hasList: true, items: [
        "Nothing was installed, so the machine is almost certainly fine",
        "Block the number, but expect them to ring from a different one",
        "Warn whoever else uses that phone, especially if it is a shared landline",
        "If you gave out any personal details at all, treat it as the section above"
      ] },
      { kicker: "the second wave", title: "The refund scam, months later", body: "If you were caught once, expect a second call. Sometimes it is a \"refund\" for the money you lost; sometimes it is somebody claiming to be police, or a recovery agency who can get it back for a fee. Lists of people who paid are sold on and reused. The second approach is often more convincing than the first, because this time they already know what happened to you." },
      { kicker: "why it works", title: "They are not stupid, and neither are you", body: "These are scripted operations with call centres, hold music and supervisors, and the script is built to put you under time pressure and keep you talking so that you never get a quiet minute to think. People assume anyone caught by one must have been gullible. They are not, and it is the wrong question anyway. Being caught out by a professional is not the same thing as being foolish, and the shame is most of what stops people telling somebody in time." },
      { kicker: "if you are reading this for somebody else", title: "How to help without making it worse", body: "Most people who have been scammed do not tell anyone, and shame is the reason the second call works. If you have walked in on it, the priority is the phone and the screen — not the conversation about how it happened.", hasList: true, items: [
        "Get the call ended and the machine off the network first, argue about it afterwards",
        "Do not tell them they have been stupid; they will stop telling you things",
        "Ring the bank together, from the number on the card",
        "Change the email password first, then everything else",
        "Report it even if they would rather not",
        "Expect follow-up calls for months, and warn them about the refund one"
      ] },
      { kicker: "and then get it checked", title: "This is the part I can help with", body: "Passwords and banks you have to do yourself, and quickly. The machine is mine. If somebody had remote control of it, it needs going over properly — what they left behind, what was installed, what runs at startup, and whether anything is set up to let them back in. Email me what happened and roughly when, and do not use it for banking until it has been looked at. My terms are on the contact page and they do not change because you have had a bad week." },
      // Merged from "where to report it" and "in ontario" (2026-09-23). Every
      // number, hour and address below is carried over character for character
      // from the verified originals; only their order and the prose moved.
      { kicker: "where to report it", title: "Report it, even if you lost nothing", body: "Report it even if you feel foolish. Reports are what get numbers shut down, and they are the one thing that actually costs these operations something — far more than an hour of anybody's time on the phone. The Canadian Anti-Fraud Centre, run jointly by the RCMP, the OPP and the Competition Bureau, builds the national picture; the police act on what happened to you, and Ontario has one number for the whole province. If money has gone, contact your local police as well.", hasList: true, items: [
        "Your bank, on the number printed on your card — first, if money has moved",
        "Emergency, or somebody is at your door: 911",
        "Canadian Anti-Fraud Centre: 1-888-495-8501, Monday to Friday 10am to 4:45pm Eastern, closed holidays",
        "Online, any time: reportcyberandfraud.canada.ca",
        "OPP, non-emergency, toll-free and answered 24 hours: 1-888-310-1122",
        "OPP TTY, for deaf or hard of hearing: 1-888-310-1133",
        "If you have a municipal police service, ring their non-emergency line instead of the OPP"
      ] },

      // ---- 5. Before it ever happens, and why the page exists. Last is what
      // gets remembered, so the page ends on "send it to your family".
      { kicker: "before it ever happens", title: "An afternoon that makes you a hard target", body: "None of this is urgent, and all of it is easier on a quiet afternoon than during a phone call designed to panic you. The first two take a minute each.", hasList: true, items: [
        "Agree a password with your family that anyone ringing for money has to say",
        "Write \"nobody legitimate calls me first\" on a card and leave it by the phone",
        "Tell your bank you will never authorise a transfer over the phone",
        "Put a daily transfer limit on the account, at the bank, in person",
        "Turn on call blocking or call screening with your phone provider",
        "Save the real numbers — bank, provider, me — into the phone so you never have to search for one",
        "Agree with one relative that you will ring them before moving any money, always"
      ] },
      { kicker: "the honest bit", title: "Why this page exists", body: "I am the person people ring afterwards. Nothing about that conversation is fun, and by then the money is usually gone. If there is an afterlife, there is a dark corner of it set aside for people who do this to somebody's grandmother for a living. Until then the best anyone can do is hang up and report the number. And if they already got you: tell somebody today. Not tomorrow, and not never. The silence is the part they are counting on, and you would be amazed how many people never say a word. If reading this stops one person handing over their screen, it has paid for the whole website several times over. Send it to whoever in your family is most likely to answer the phone." },
    ],
  },
  notfound: {
    eyebrow: "pressure lost · http 404",
    title: "Nothing here. Never was.",
    lede: "Either the address was typed slightly wrong, a link somewhere is out of date, the page was taken down deliberately, or you are a bot having a poke around. Three of those are forgivable.",
    ctas: [
      { label: "Go home", to: "home", primary: true },
      { label: "Contact", to: "contact" },
    ],
    blocks: [
      // Was `/var/www/whatever_you_wanted → exists = false`, which is a joke in
      // a language only a developer reads. The joke is the same — there is
      // nothing there and there never was — told so that anybody gets it.
      { kicker: "trace", title: "Nothing was ever at that address", body: "Not hidden, not moved, not deleted in a panic. It has been empty since the day the site went up, and that is the whole explanation — one more than you get from a blue screen." },
      // "eight" → "nine" (2026-08-14): the Setup page made the count wrong. The
      // client kept this line *because* it was correct — the counts on the 404
      // are jokes that depend on being true — so keeping the word would have
      // been the change, not correcting it. One word; nothing else here moved.
      { kicker: "suggestion", title: "Try the parts that exist", body: "The site has seven other pages, and four of them are below. The second one is the only one that reaches me.", hasList: true, items: ["Home — the front page", "Contact — the useful one", "Now — what is in for repair today", "Scams — before you answer the phone"] },
    ],
  },
};
