import type { PageId } from "./pageIds";

/**
 * The search-result and link-preview copy, written for that job and nothing
 * else.
 *
 * **Why this file exists** (2026-08-26). `worker/page-meta.ts` used each page's
 * `lede` as its description, on the reasoning that importing approved copy
 * beats a hand-maintained table in the Worker. That reasoning was right about
 * *drift* and wrong about *fit*: a lede is the second thing you read, after an
 * eyebrow naming the page and a headline. A snippet has neither. It arrives
 * cold, in a list of ten results, next to shopfronts.
 *
 * Measured before this file was written: nine of the eleven indexed routes were
 * clamped mid-sentence at 155 characters, and every one of them lost the useful
 * half — `contact` stopped at "you need the photographs off a hard drive…",
 * `scams` at "polite, patient and rehearsed. Here…". Home opened with four
 * things the site is *not* and was cut before "contact is one click away".
 *
 * The rules these are written to, all of them from CLAUDE.md and none of them
 * new:
 *
 * - **No fee is named and nothing is promised that the client has not said.**
 *   "Free diagnosis" lived in the shell's static description for months after
 *   the client killed it in the page copy — this is the surface that mistake
 *   escaped through, so it is the surface that gets the gate.
 * - **No city, no name.**
 * - **Nothing advertises the site.** Jokes are about the work, the man, or the
 *   fact that there is one of him. Never about palettes, layouts, or anything
 *   a visitor is supposed to find on their own.
 * - **Every line stands alone.** A snippet is never read next to another one,
 *   so each says what this is before it does anything else.
 * - **Nothing may exceed 155 characters**, which is where the clamp in
 *   `page-meta.ts` starts cutting. The clamp stays as a backstop; the gate in
 *   `npm run check` is what keeps it from ever firing.
 */

/**
 * Home rotates. The others do not, and the difference is a decision.
 *
 * A rotating snippet is only visible where the head is fetched fresh: a link
 * unfurling in iMessage, WhatsApp, Slack or SMS, and a crawler's next visit.
 * That makes it a joke that pays off for the person who shares the front page
 * twice, which is the client's own family and nobody else — which is exactly
 * the right size of joke.
 *
 * **`scams`, `setup` and `contact` must never rotate.** `scams` ends by telling
 * the reader to send it to whoever in their family answers the phone, so it is
 * the one page written to be forwarded, and a page about fraud that describes
 * itself differently each time it is forwarded is undermining its own case.
 * `setup` is read by someone about to install remote-access software, and
 * `contact` is the page with the job. Straight, every time. Gated.
 *
 * Rotation is **by the day, not by the request**: `Date.now()` divided into
 * whole days, modulo the pool. Stable inside a crawl and inside an afternoon,
 * different tomorrow, and — unlike a random pick — reproducible, which is the
 * only reason the gate below can test it at all.
 */
export const SNIPPETS: Record<PageId, readonly string[]> = {
  home: [
    "Computer repair done properly. Dead, slow, infected, or the photographs are trapped on a drive that stopped spinning. Twenty-plus years of that.",
    "Independent computer repair. Laptops, desktops, failed hard drives, virus removal, and home internet that never worked properly to begin with.",
    "Computer repair without the depot. Your machine is fixed here, not boxed up and sent away to somebody who has never seen it.",
    "Board-level computer repair and data recovery. The faults other shops call terminal are often a cracked solder joint, not a dead machine.",
    "Computer repair. No forms, no queue, no ticket number, and no chat window operated by a man named Kevin who is not named Kevin.",
    // The client's own, near-verbatim — only the punch word moved to the end.
    "Computer repair, twenty years. I stopped looking at people's stuff nineteen years ago \u2014 don't worry, I don't care enough to check.",
    "Computer repair and data recovery, twenty-plus years. You get a rough cost before anything is taken apart.",
  ],

  // The page with the job. Says what is fixed, then that a person answers.
  contact: [
    "Dead, slow, infected, or you need the photographs off a drive that stopped. Say what it is doing and you get an answer, not a ticket number.",
  ],

  // Written flat on purpose. This is the page that gets forwarded to somebody's
  // parent, and the snippet is the first sentence they read about it.
  scams: [
    "How the “Microsoft is calling about your computer” scam actually runs: what they say, what they ask you to install, and what to do if it already happened.",
  ],

  setup: [
    "Remote access, set up before a callout. A good half of what goes wrong does not need anyone in the room: same fix, no driving, no afternoon waiting in.",
  ],

  about: [
    "Twenty-plus years on the bench: board-level soldering, data recovery, and the machines other shops send away. No name, no face, no city — a preference.",
  ],

  work: [
    "Selected repairs: what came in, what was wrong, what happened next. No client names, and no photographs of anyone's living room.",
  ],

  gallery: [
    "Broken hardware, odd photographs and the inside of a cable drawer. Nothing the camera recorded about where any of it was taken survived the upload.",
  ],

  guestbook: [
    "A guestbook with nothing to sign. Anything typed into it would have to be stored somewhere, and I would rather not hold onto it.",
  ],

  now: [
    "What is on the bench at the moment, and what came off it this week.",
  ],

  changelog: [
    "What changed on this site and when, kept for the same reason people keep receipts.",
  ],

  downloads: [
    "Small programs written to fix things that were annoying, plus a few collected over the years. Some are free and the rest are a few dollars.",
  ],

  /*
   * `noindex` routes still get one, because `noindex` governs the search index
   * and governs nothing at all about a link pasted into a chat window.
   */
  notfound: [
    "Either the address is slightly wrong, a link somewhere is out of date, or the page was taken down on purpose. Nothing here. There never was.",
  ],

  signup: [
    "A handle and a password, and nothing else — no email, no name. The password never leaves the browser it was typed into.",
  ],

  signin: [
    "Handle and password. The password is turned into a key here in the browser, and the plain text never leaves it.",
  ],

  admin: [
    "Accounts, and what may be done to them. Visible to an operator, and refused by the server for everybody else.",
  ],

  machines: [
    "The computers you have paired and the folders they share. Files travel from that machine straight to this browser.",
  ],

  share: [
    "Pick a folder and this tab serves it, read-only, to your own signed-in browsers. Close the tab and the sharing stops.",
  ],
};

/** The pages a rotating snippet is refused for. See the note above. */
export const NEVER_ROTATES: readonly PageId[] = ["scams", "setup", "contact"];

/**
 * The snippet for a route, at a moment.
 *
 * `at` is passed in rather than read from the clock inside, so the gate can ask
 * for any day it likes and the Worker stays a pure function of its request.
 */
export function snippetFor(id: PageId, at: number): string {
  const pool = SNIPPETS[id];
  if (pool.length === 1) return pool[0];
  const day = Math.floor(at / 86_400_000);
  // `%` on a negative would index out of the array; a clock before 1970 is not
  // a real case, but a wrong answer here is silent and this costs nothing.
  return pool[((day % pool.length) + pool.length) % pool.length];
}
