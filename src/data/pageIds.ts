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
  | "machines" | "share";

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
  { id: "about", label: "About" },
  { id: "work", label: "Work" },
  { id: "gallery", label: "Gallery" },
  { id: "contact", label: "Contact" },
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
 * **The account pages are deliberately unlinked.** `/signin` and `/signup` are
 * real, routable pages, but nothing on the site points at them while accounts
 * are still being built: there is nothing behind an account yet, so a visible
 * link would be an invitation to sign up for nothing. They are reached by the
 * hidden routes in `useAccountRoutes` — type `whoami` or `login`, or drag the
 * page leftward — or by typing the URL.
 *
 * Restoring the link is one entry in this array and nothing else, which is the
 * point: hiding it is a product decision about timing, not an architectural one.
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
};

const BY_PATH = new Map<string, PageId>(
  (Object.entries(PATHS) as [PageId, string][]).map(([id, path]) => [path, id]),
);

/** Unknown URLs land on the 404 page, which is a real page here rather than a fallback. */
export function pageFromPath(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return BY_PATH.get(clean) ?? "notfound";
}
