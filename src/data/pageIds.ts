/**
 * The nine pages and their real URLs.
 *
 * The prototype swaps pages in place with no URL change; the spec is explicit
 * that this is a prototype limitation, not a design decision, so the real build
 * gets nine addressable routes.
 */

export type PageId =
  | "home" | "about" | "work" | "gallery" | "contact"
  | "guestbook" | "now" | "changelog" | "notfound" | "signup";

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
 */
export const FOOTER_NAV: { id: PageId; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "changelog", label: "Changelog" },
  { id: "signup", label: "Account" },
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
};

const BY_PATH = new Map<string, PageId>(
  (Object.entries(PATHS) as [PageId, string][]).map(([id, path]) => [path, id]),
);

/** Unknown URLs land on the 404 page, which is a real page here rather than a fallback. */
export function pageFromPath(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return BY_PATH.get(clean) ?? "notfound";
}
