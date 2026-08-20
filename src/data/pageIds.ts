/**
 * The sixteen pages and their real URLs — the spec's nine, plus setup and scams,
 * plus signup, signin and admin (phase 1), and machines and share (phase 2,
 * SPEC-ACCOUNTS.md §13).
 *
 * The prototype swaps pages in place with no URL change; the spec is explicit
 * that this is a prototype limitation, not a design decision, so the real build
 * gets sixteen addressable routes.
 */

export type PageId =
  | "home" | "about" | "work" | "gallery" | "contact"
  | "guestbook" | "now" | "changelog" | "setup" | "scams" | "notfound" | "signup" | "signin" | "admin"
  | "machines" | "share" | "downloads";

/**
 * Header nav — **seven** public pills, in order.
 *
 * "404" was genuinely in the nav — that was the joke — until the client pulled
 * it behind sign-in on 2026-08-13 (`OPERATOR_NAV` below). The page itself is
 * still what every visitor gets at an unknown URL; only the *advertisement*
 * became operator-only.
 *
 * **Scams is the seventh, and the six-pill design is deliberately broken for
 * it** (client, 2026-08-14). Setup was kept out of the nav a few hours earlier
 * on exactly that reasoning, and this page is judged differently on purpose:
 * the client's argument was that it is the one page that might stop a
 * grandparent losing their savings, and a page like that is worth more than the
 * symmetry of six. Note the knock-on the Setup comment predicted — `NAV` is
 * what `useOperatorRoutes` cycles with the arrow keys and what Radial's orbit
 * renders, so both now carry seven.
 */
export const NAV: { id: PageId; label: string }[] = [
  { id: "home", label: "Home" },
  // Second, not last (client, 2026-08-14). On the phone the nav is a horizontal
  // scroller, so anything past about the fifth pill is behind a swipe nobody
  // makes — the position is the difference between a page that gets found and
  // one that does not. It also appears in `FOOTER_NAV`, so it is reachable at
  // the top and the bottom of every page on the site.
  { id: "scams", label: "Scams" },
  /*
   * Third, moved up from sixth (2026-08-16).
   *
   * The argument is the one Scams already made two pills to the left, applied
   * to the page the spec calls *the only page with a job*: the phone nav is a
   * horizontal scroller, sixth of seven is behind a swipe, and Contact being
   * behind a swipe is the site failing at the single thing it is actually for.
   * Home's primary CTA does point here, but that only helps a visitor who is
   * standing on Home — from any of the other six pages the nav was the route,
   * and on a phone it was a hidden one.
   *
   * Scams keeps second on its own reasoning, which outranks this: somebody
   * mid-scam needs it faster than somebody with a broken laptop needs me.
   */
  { id: "contact", label: "Contact" },
  { id: "about", label: "About" },
  { id: "work", label: "Work" },
  { id: "gallery", label: "Gallery" },
  { id: "guestbook", label: "Guestbook" },
];

/**
 * Operator-only tabs (client request, 2026-08-13): appended to the header nav
 * for a signed-in operator, rendered for nobody else. Deliberately **not** part
 * of `NAV` — `useOperatorRoutes` cycles `NAV` and Radial's orbit renders `NAV`,
 * so these stay top-bar tabs without changing arrow-key paging or the orbit for
 * anyone. The `Config` tab is not here because it is not a page: the header
 * renders it beside these, toggling the siteconfig panel.
 */
export const OPERATOR_NAV: { id: PageId; label: string }[] = [
  { id: "notfound", label: "404" },
  { id: "signin", label: "Account" },
  { id: "admin", label: "Admin" },
];

/**
 * Now and Changelog are footer links, not main nav. A settled decision.
 *
 * Account joins them rather than `NAV` deliberately: `useOperatorRoutes` cycles
 * `NAV` only, so adding a pill there would change the operator door's cycling as
 * a side effect (SPEC-ACCOUNTS.md §680).
 *
 * **The account pages are no longer unlinked** (2026-08-18, client: *"I need a
 * portal to the login page"*). They were, for as long as there was nothing
 * behind an account and a visible link would have been an invitation to sign up
 * for nothing.
 *
 * **The link is not in this array, and that is deliberate.** `Footer.tsx`
 * renders it separately because it is conditional on the session — `sign in`
 * signed out, `account` and `admin` signed in — and `FOOTER_NAV` is a static
 * list of public pages that every visitor gets. Folding a session-dependent
 * entry into it would mean this array could no longer be read as "what the
 * footer shows", which is the one thing it is for. The typed routes and the
 * leftward drag in `useAccountRoutes` still work and are unchanged.
 */
export const FOOTER_NAV: { id: PageId; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "changelog", label: "Changelog" },
  // Setup joins them rather than `NAV` (2026-08-14, client request — TODO 9).
  // It is a secondary page in the same sense they are, and the six pills are a
  // settled design; adding a seventh would also change what the operator door's
  // arrow-key cycling walks, since `useOperatorRoutes` cycles `NAV`.
  { id: "setup", label: "Setup" },
  // Deliberately in *both* navs. Duplicating a link is normally a smell, and
  // this is the exception: somebody who has just been talked into something is
  // not going to scroll back up, and somebody who reads to the bottom of any
  // page on this site should be one click from it.
  { id: "scams", label: "Scams" },
  /*
   * Downloads (2026-08-19, client request). A footer page on `setup`'s
   * precedent rather than `scams`': the seven-pill header is a settled design,
   * and `NAV` is also what `useOperatorRoutes` cycles and what Radial's orbit
   * renders, so a pill there changes arrow-key paging and the dial for
   * everybody. `scams` was judged worth that and this is not — somebody buying
   * a program has been sent here or has gone looking, whereas the scams page
   * has to reach a person who did not know they needed it.
   *
   * Revisit if the client starts selling in earnest: the argument flips then,
   * because a shop nobody can find is a shop that is not open.
   */
  { id: "downloads", label: "Downloads" },
];

export const PATHS: Record<PageId, string> = {
  home: "/",
  about: "/about",
  work: "/work",
  gallery: "/gallery",
  contact: "/contact",
  guestbook: "/guestbook",
  now: "/now",
  changelog: "/changelog",
  setup: "/setup",
  scams: "/scams",
  notfound: "/404",
  signup: "/signup",
  signin: "/signin",
  admin: "/admin",
  machines: "/machines",
  share: "/share",
  downloads: "/downloads",
};

const BY_PATH = new Map<string, PageId>(
  (Object.entries(PATHS) as [PageId, string][]).map(([id, path]) => [path, id]),
);

/**
 * The one route with something after it: `/downloads/<name>` (2026-08-20).
 *
 * The operator authors sub-pages, so their addresses cannot be in the table
 * above — they are rows in D1 and they change while the site is running. This is
 * deliberately the *only* prefix route: a general pattern router would be the
 * wrong trade for one case, and `PATHS` being a total map from a closed union is
 * what makes every other link on the site checkable by the compiler.
 *
 * The name is not validated here. Whether a page exists is the Worker's answer,
 * and asking twice would mean two definitions of a valid name — the client's,
 * which cannot see the database, and the real one.
 */
const SUB_PREFIX = `${PATHS.downloads}/`;

/** Unknown URLs land on the 404 page, which is a real page here rather than a fallback. */
export function pageFromPath(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean.startsWith(SUB_PREFIX)) return "downloads";
  return BY_PATH.get(clean) ?? "notfound";
}

/** The sub-page name in a path, or null. Only `/downloads` has one. */
export function subFromPath(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (!clean.startsWith(SUB_PREFIX)) return null;
  const rest = clean.slice(SUB_PREFIX.length);
  // A second slash is not a deeper page, it is a typo or a probe. One level is
  // the whole design.
  return rest && !rest.includes("/") ? rest : null;
}

/** Where a page — and optionally one of its sub-pages — lives. */
export function pathFor(page: PageId, sub?: string | null): string {
  return sub ? `${PATHS[page]}/${sub}` : PATHS[page];
}
