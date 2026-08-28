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
 * Control characters and DEL, refused in every field - see `str`.
 *
 * Written as escapes deliberately: a literal control character inside a
 * regex is invisible in a diff and in review, so one deleted by accident
 * leaves a check that silently passes everything it was meant to catch.
 */
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Characters that make a label lie about what it says.
 *
 * `CONTROL` covers C0 and DEL, which stops a newline forging extra rows. It
 * does not stop a label *rendering* as something other than what is stored,
 * and both fields here are read by a person deciding which folder to hand to
 * the browser — the path is the only thing telling `D:\\Photos` from
 * `C:\\Users\\me\\Photos`, which is why it wraps rather than truncating.
 *
 * Refused, not stripped, consistent with the rest of this file:
 *   U+202A-U+202E, U+2066-U+2069  bidi overrides and isolates. `Family \u202EsotohP`
 *                                 renders as `Family Photos` while storing something else.
 *   U+200B-U+200D, U+FEFF, U+00AD zero-width and soft hyphen. Two rows reading
 *                                 `Invoices` where only one is the folder you picked —
 *                                 and `done` is a Set of exact strings, so one ticks off
 *                                 and the other does not, with nothing visible to explain it.
 */
const DECEPTIVE = /[\u00ad\u200b-\u200d\u202a-\u202e\u2066-\u2069\ufeff]/;

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
    if (folders.some((f) => f.label === label.trim())) return null;

    folders.push({ label: label.trim(), path: path.trim() });
  }

  return { machine: machine.trim(), folders };
}

/** Does this look like a setup code at all? Lets the paste box route by prefix. */
export function looksLikeSetupCode(input: string): boolean {
  return input.trim().startsWith(SETUP_CODE_PREFIX);
}
