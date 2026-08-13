/**
 * The twelve pages and their real URLs — the spec's nine, plus signup, signin
 * and admin.
 *
 * The prototype swaps pages in place with no URL change; the spec is explicit
 * that this is a prototype limitation, not a design decision, so the real build
 * gets twelve addressable routes.
 */

export type PageId =
  | "home" | "about" | "work" | "gallery" | "contact"
  | "guestbook" | "now" | "changelog" | "notfound" | "signup" | "signin" | "admin";

/** Header nav — seven pills, in order. "404" is genuinely in the nav; that is the joke. */
export const NAV: { id: PageId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "work", label: "Work" },
  { id: "gallery", label: "Gallery" },
  { id: "contact", label: "Contact" },
  { id: "guestbook", label: "Guestbook" },
  { id: "notfound", label: "404" },
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
  notfound: "/404",
  signup: "/signup",
  signin: "/signin",
  admin: "/admin",
};

const BY_PATH = new Map<string, PageId>(
  (Object.entries(PATHS) as [PageId, string][]).map(([id, path]) => [path, id]),
);

/** Unknown URLs land on the 404 page, which is a real page here rather than a fallback. */
export function pageFromPath(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return BY_PATH.get(clean) ?? "notfound";
}
