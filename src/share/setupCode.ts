/**
 * Setup codes — how a setup script tells the sharing tab which folders the
 * person meant to share (SPEC-SHARING.md §4).
 *
 * `showDirectoryPicker()` needs a human gesture, so no script can hand the
 * browser a folder. What a script *can* do is know which folders the person
 * chose while it was running, and pass that list along: the script prints this
 * code, puts it on the clipboard, and writes it to a text file beside itself.
 * Pasting it into `/share` turns the list into a checklist with the labels
 * already filled in, one picker click per folder.
 *
 * **The code carries no authority and is deliberately not an API call.** The
 * obvious design — the script POSTs the list to an authenticated endpoint —
 * would mean a downloaded script holding a credential and a new write route to
 * defend. This is a list of names: it grants nothing, it opens nothing, and the
 * worst a hostile code can do is *suggest* a folder that the person then has to
 * go and pick themselves, in their own browser, from the real picker. That is
 * the whole security argument, and it is why phase S adds no server surface.
 *
 * Wire format: `VS1.` + base64url of compact JSON. The prefix is a version and
 * a discriminator — the paste box also takes appearance share codes, and two
 * formats sharing one input must be told apart by looking rather than guessing.
 * **Append fields, never repurpose one**, and bump to `VS2.` if the shape ever
 * has to change: an old site reading a new code must refuse it rather than
 * decode half of it.
 */

/** Ceilings, all of them deliberate — see `decodeSetupCode`. */
const MAX_CODE = 4096;
const MAX_FOLDERS = 24;
const MAX_LABEL = 40;
const MAX_PATH = 400;
const MAX_NAME = 40;

/**
 * Line-breaking and control characters, refused in every field - see `str`.
 *
 * `\p{Cc}` is C0, DEL **and C1** — the last of which is why this is a property
 * and not the old `[\u0000-\u001f\u007f]` range: U+0085 NEXT LINE is a line
 * break to a text engine and was accepted. U+2028 and U+2029 are `Zl`/`Zp`
 * rather than `Cc`, so they have to be named; they are line and paragraph
 * separators and belong here for the same reason.
 *
 * **None of the three forges a row on the page today**, and that is a property
 * of the stylesheet rather than of this regex: `.v-setup-name` is
 * `white-space: normal`, which collapses them. Give that span — or
 * `.v-setup-path`, which is a filesystem path and an ordinary candidate for
 * `pre-wrap` — a preserving `white-space` and one label becomes two visible
 * rows. The refusal must not depend on a CSS declaration in another file.
 *
 * Written as escapes deliberately: a literal control character inside a
 * regex is invisible in a diff and in review, so one deleted by accident
 * leaves a check that silently passes everything it was meant to catch.
 */
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

/**
 * Characters that make a label lie about what it says.
 *
 * `CONTROL` stops a newline forging extra rows. It does not stop a label
 * *rendering* as something other than what is stored, and both fields here are
 * read by a person deciding which folder to hand to the browser — the path is
 * the only thing telling `D:\\Photos` from `C:\\Users\\me\\Photos`, which is
 * why it wraps rather than truncating.
 *
 * **This refuses by Unicode property rather than by enumeration, and the
 * enumeration is what was wrong with it.** The old list named five ranges and
 * missed every other invisible character in Unicode — U+034F, U+2062, U+2063,
 * U+17B4 and U+180E all measure **0.000px** of extra rendered width at
 * `.v-setup-name`'s font, trailing or mid-word, so:
 *
 *     { l: "Invoices",        p: "C:\\Users\\me\\Invoices" }
 *     { l: "Invoices\u034F",  p: "C:\\Users\\me" }
 *
 * decoded cleanly, drew two rows both reading `Invoices`, and left the second
 * one unticked after the person added the folder they meant — because
 * `SharePage`'s done-set is a Set of exact strings and `key={folder.label}`
 * stays unique, so neither React nor the checklist flags anything. The obvious
 * next click hands over the whole user profile through the real picker. That is
 * the exact failure the duplicate-label refusal below exists to prevent, walked
 * straight past. An enumeration cannot be made complete by adding to it, so it
 * is gone.
 *
 * What is refused, and why each class:
 *   `\p{Cf}`  every format character — all the bidi overrides and isolates
 *             (`Family \u202EsotohP` renders as `Family Photos`), the
 *             zero-widths, the soft hyphen, the BOM, the invisible operators.
 *   `\p{Cs}`  lone surrogates. With the `u` flag a *paired* surrogate is one
 *             astral code point and is not matched, so emoji survive; an
 *             unpaired one (JSON will happily carry `\uD800`) is a character
 *             no font can draw.
 *   `\p{Co}`  private use. Draws as whatever the reader's fonts decide, which
 *             is to say: not knowably anything.
 *   `\p{Cn}`  unassigned and noncharacters. Deliberate trade, stated plainly:
 *             an engine older than the folder name's Unicode version will
 *             refuse a brand-new emoji. Tofu cannot be told from other tofu,
 *             which is the twin-row failure again, and renaming the folder is
 *             a cheaper outcome than handing over the wrong one.
 *   the named set  blanks that are none of the above: U+034F is `Mn`, U+2800 is
 *             `So`, U+115F/U+1160/U+3164/U+FFA0 are `Lo`, U+17B4/U+17B5 are
 *             `Mn`, U+180E is `Cf` and is listed anyway so the measured set
 *             reads as one list. All render at zero or blank width.
 *             (U+17B5 was not measured; it is U+17B4's twin, same block, same
 *             category, equally invisible.)
 *   `\p{Zs}` bar U+0020  a space that is not the space. U+00A0 is
 *             indistinguishable from U+0020 at any size, and U+3000 is a blank
 *             of a different width — either makes two labels that read the same.
 *
 * `\p{Cc}` is the one `\p{C}` class not here; it is in `CONTROL` above, so
 * between the two every control-ish code point in Unicode is refused.
 */
const DECEPTIVE =
  /[\p{Cf}\p{Cs}\p{Co}\p{Cn}\u034f\u115f\u1160\u17b4\u17b5\u180e\u2800\u3164\uffa0]|(?!\u0020)\p{Zs}/u;

export const SETUP_CODE_PREFIX = "VS1.";

export interface SetupFolder {
  /** What the drive will be called on the account. Never taken from the disk. */
  label: string;
  /** Where it is on that machine, shown to the person so they pick the right one. */
  path: string;
}

export interface SetupPlan {
  /** Suggested machine name; empty when the script had no opinion. */
  machine: string;
  folders: SetupFolder[];
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * A string field, checked rather than coerced.
 *
 * Control characters are refused outright: a label ends up rendered on the
 * account and sent to anyone the folder is later shared with, and a label
 * carrying a newline is a label that can lie about how many rows there are.
 */
function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  if (CONTROL.test(value)) return null;
  if (DECEPTIVE.test(value)) return null;
  return value;
}

export function encodeSetupCode(plan: SetupPlan): string {
  const payload = {
    n: plan.machine,
    f: plan.folders.map((folder) => ({ l: folder.label, p: folder.path })),
  };
  return SETUP_CODE_PREFIX + base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * Decode, or return null. **Refuse, never repair** — the rule `src/share/paths.ts`
 * already follows, and it matters more here than it looks.
 *
 * A half-decoded plan is the dangerous outcome: it renders as a complete
 * checklist, the person ticks off every row, and a folder they told the script
 * to share is silently absent from their account. They would find out the next
 * time they were away from that machine and needed it. So one bad field rejects
 * the whole code, and the message says to run the script again.
 */
export function decodeSetupCode(input: string): SetupPlan | null {
  const trimmed = input.trim();
  if (trimmed.length > MAX_CODE) return null;
  if (!trimmed.startsWith(SETUP_CODE_PREFIX)) return null;

  const bytes = base64UrlDecode(trimmed.slice(SETUP_CODE_PREFIX.length));
  if (!bytes) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const body = parsed as Record<string, unknown>;
  const machine = str(body.n ?? "", MAX_NAME);
  if (machine === null) return null;

  if (!Array.isArray(body.f)) return null;
  if (body.f.length === 0 || body.f.length > MAX_FOLDERS) return null;

  const folders: SetupFolder[] = [];
  for (const entry of body.f) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const label = str(row.l, MAX_LABEL);
    const path = str(row.p, MAX_PATH);
    if (label === null || path === null) return null;
    if (label.trim().length === 0 || path.trim().length === 0) return null;
    // Duplicate labels are refused rather than de-duplicated here. The scripts
    // already suffix collisions ("Photos", "Photos 2"); a code carrying repeats
    // is hand-made. Left alone they collide in the checklist's `done` set, so
    // adding one folder marks every row sharing its label as added, and a
    // folder the person asked for is silently absent while the list reads
    // complete — the exact failure this decoder's refuse-never-repair rule
    // exists to prevent.
    //
    // **Compared after NFKC, stored as sent.** Two labels can be different
    // strings and the same picture: `Réparations` composed and decomposed are
    // byte-different and pixel-identical in every font, and the compatibility
    // mappings do the same for a fullwidth `Ｉnvoices` or the `ﬁ` ligature.
    // Each is the twin-row attack with a different character, and each collides
    // in the done-set exactly as an exact duplicate does. Folding only the
    // *comparison* keeps refuse-never-repair intact — a normalised label would
    // be a label the person's script did not write.
    const cleanLabel = label.trim();
    const folded = cleanLabel.normalize("NFKC");
    if (folders.some((f) => f.label.normalize("NFKC") === folded)) return null;

    folders.push({ label: cleanLabel, path: path.trim() });
  }

  return { machine: machine.trim(), folders };
}

/** Does this look like a setup code at all? Lets the paste box route by prefix. */
export function looksLikeSetupCode(input: string): boolean {
  return input.trim().startsWith(SETUP_CODE_PREFIX);
}
