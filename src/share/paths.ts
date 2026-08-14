/**
 * Path validation for the file protocol (SPEC-ACCOUNTS.md §12 S, §13).
 *
 * Paths travel as **arrays of components**, never as strings — there is no
 * separator to parse, no encoding to normalise, and no prefix to re-check. The
 * agent walks its directory handle one validated component at a time, so the
 * File System Access API's own sandbox is the outer wall and this function is
 * the inner one.
 *
 * This is the spec's "one place in the agent worth a dedicated test suite":
 * a pure function with no browser dependency, driven directly by the e2e
 * harness. Every rule here refuses rather than repairs — a "corrected" path is
 * a path the caller did not ask for.
 */

/** Windows reserves these names in every directory, extension or none. */
const RESERVED_DOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** NUL and the control range no honest filename contains, plus DEL. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Bounds: nobody's real tree is deeper or longer, scripts are. */
const MAX_DEPTH = 32;
const MAX_COMPONENT = 255;

/**
 * True when `value` is a well-formed path: an array of plain file or directory
 * names, each safe to hand to `getDirectoryHandle`/`getFileHandle` verbatim.
 * The empty array is valid and names the drive root.
 */
export function isValidPath(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_DEPTH) return false;
  return value.every(isValidComponent);
}

function isValidComponent(component: unknown): boolean {
  if (typeof component !== "string") return false;
  if (component.length === 0 || component.length > MAX_COMPONENT) return false;
  // Traversal, in every spelling: the two dot names and separators of either
  // slant. `getDirectoryHandle` would refuse most of these too; refusing here
  // keeps the rule testable without a browser.
  if (component === "." || component === "..") return false;
  if (component.includes("/") || component.includes("\\")) return false;
  if (CONTROL_CHARS.test(component)) return false;
  // A colon is a drive letter on Windows and an alternate data stream marker;
  // neither is a filename this protocol serves.
  if (component.includes(":")) return false;
  if (RESERVED_DOS.test(component)) return false;
  // Trailing dots and spaces are stripped by Windows on create, so a name that
  // carries them refers to a different file than it claims to.
  if (component.endsWith(".") || component.endsWith(" ")) return false;
  return true;
}
