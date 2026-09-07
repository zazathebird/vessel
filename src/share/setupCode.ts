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
 *   `\p{Default_Ignorable_Code_Point}` and `\p{Variation_Selector}`
 *             the property, not a list of the code points it contains — which
 *             is the whole point, since the hand-list this replaced named
 *             U+034F, U+115F, U+1160, U+17B4, U+17B5, U+180E, U+3164 and
 *             U+FFA0 and *omitted the variation selectors*, U+FE00-FE0F and
 *             U+E0100-E01EF. Those are zero width, NFKC does not fold them,
 *             and `Invoices\uFE00` therefore rebuilt the twin-row attack this
 *             comment is about, character for character, after it was fixed.
 *             The property is a superset of the old list: nothing it refused
 *             is now allowed.
 *   `\p{Zs}` bar U+0020  a space that is not the space. U+00A0 is
 *             indistinguishable from U+0020 at any size, and U+3000 is a blank
 *             of a different width — either makes two labels that read the same.
 *
 * `\p{Cc}` is the one `\p{C}` class not here; it is in `CONTROL` above, so
 * between the two every control-ish code point in Unicode is refused.
 *
 * **U+FE0E and U+FE0F are the one carve-out, and `foldLabel` is what pays for
 * it.** They are the emoji presentation selectors and they are ordinary in a
 * real folder name — `Photos \u2764\uFE0F` is a name somebody has, not an
 * attack. Refusing them would refuse the WHOLE code over one honest folder,
 * and the code is machine-generated from names the person already has, so the
 * failure would land on the happy path with nothing to fix but a rename. They
 * stay dangerous only in the twin-row shape, and that shape is closed one
 * level down: `foldLabel` strips every default-ignorable before the duplicate
 * test, so `Invoices` and `Invoices\uFE0F` collide and the code is refused as
 * a duplicate. The filter refuses what has no business in a label; the fold
 * refuses what merely READS like another label.
 */
const DECEPTIVE =
  /(?![\ufe0e\ufe0f])[\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\p{Variation_Selector}\u2800]|(?!\u0020)\p{Zs}/u;

/**
 * The fold used for the duplicate-label test, and only for it. Each step
 * answers a measured way two labels render alike while comparing unequal:
 * strip the default-ignorables and variation selectors (invisible by
 * definition), NFKC (composed vs decomposed, fullwidth, ligatures), fold the
 * visible look-alikes (`CONFUSABLES` below — Cyrillic and Greek twins, case,
 * `l/I/1`, `O/0`), then collapse runs of whitespace — `My Photos` and `My  Photos` are one picture in
 * `.v-setup-name`, which is `white-space: normal`. **The refusal must not depend
 * on a CSS declaration in another file**, so the collapse is here rather than
 * relying on that.
 *
 * Folding the COMPARISON only. The label is stored exactly as sent, because a
 * normalised label is a label the person's script did not write.
 */
function foldLabel(label: string): string {
  return label
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Variation_Selector}]/gu, "")
    .normalize("NFKC")
    .replace(CONFUSABLE, (ch) => CONFUSABLES[ch] ?? ch)
    .toLowerCase()
    .replace(/[il|]/g, "1")
    .replace(/o/g, "0")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Visible look-alikes, folded to Latin for the duplicate test only
 * (2026-09-07, fourth security pass). The three steps above answer INVISIBLE
 * differences; a twin row is just as easily built from two labels that differ
 * by a glyph no reader can tell apart at any size — `Invoices` and
 * `Invoiсes` with a Cyrillic es, `Bank` and `Bаnk` with a Cyrillic a,
 * `Files` and `FiIes` with a capital i for the ell, `Photos` and `PHOTOS`.
 * NFKC folds none of these, since none is a compatibility form of the other.
 *
 * **This lives in the FOLD, deliberately not in the filter.** A Russian folder
 * name is honest, and the code is machine-generated from names that already
 * exist — refusing Cyrillic by property would refuse the whole code over
 * `Документы`, on the happy path, with nothing to fix but a rename. Two labels
 * that fold alike are refused as a duplicate; one label on its own is never
 * refused for its script.
 *
 * The table is the pairs that render identically in the fonts this site ships
 * and their platform fallbacks — the Cyrillic and Greek letters whose glyph IS
 * the Latin one, both cases. It is not Unicode's confusables.txt (6,000 rows,
 * most of them "similar at a squint"), and a fold that wide would refuse honest
 * pairs. The case fold and the `l/I/1/|` and `O/0` collapses come after the
 * table: the table maps to Latin, then Latin collapses to its own twins.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic, lower
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0456": "i", "\u0458": "j", "\u0455": "s",
  "\u04bb": "h", "\u0501": "d", "\u051b": "q", "\u051d": "w", "\u0475": "v",
  // Cyrillic, upper
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M",
  "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0422": "T",
  "\u0425": "X", "\u0405": "S", "\u0406": "I", "\u0408": "J", "\u04ae": "Y",
  "\u0474": "V",
  // Greek, lower
  "\u03bf": "o", "\u03b9": "i", "\u03bd": "v", "\u03c1": "p", "\u03c5": "u",
  // Greek, upper
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H",
  "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O",
  "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
  // Latin look-alikes NFKC leaves alone
  "\u0131": "i", // dotless i
  "\u0237": "j", // dotless j
  "\u0261": "g", // script g
  "\u0251": "a", // Latin alpha
  "\u1d00": "a", // small capital a
  "\u0274": "n", // small capital n
  "\u026a": "i", // small capital i
  "\u0299": "b", // small capital b
  "\u1d04": "c", "\u1d05": "d", "\u1d07": "e", "\u029c": "h", "\u1d0a": "j",
  "\u1d0b": "k", "\u029f": "l", "\u1d0d": "m", "\u1d0f": "o", "\u1d18": "p",
  "\u0280": "r", "\u1d1b": "t", "\u1d1c": "u", "\u1d20": "v", "\u1d21": "w",
  "\u028f": "y", "\u1d22": "z",
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "gu");

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
    // **Compared through `foldLabel`, stored as sent.** Two labels can be
    // different strings and the same picture: `Réparations` composed and
    // decomposed are byte-different and pixel-identical in every font, and the
    // compatibility mappings do the same for a fullwidth `Ｉnvoices` or the `ﬁ`
    // ligature. `Invoices` against `Invoices\uFE0F` is the same trick with an
    // invisible, and `My Photos` against `My  Photos` with an ordinary space.
    // Each is the twin-row attack with a different character, and each collides
    // in the done-set exactly as an exact duplicate does. Folding only the
    // *comparison* keeps refuse-never-repair intact — a normalised label would
    // be a label the person's script did not write.
    const cleanLabel = label.trim();
    const folded = foldLabel(cleanLabel);
    if (folders.some((f) => foldLabel(f.label) === folded)) return null;

    folders.push({ label: cleanLabel, path: path.trim() });
  }

  return { machine: machine.trim(), folders };
}

/** Does this look like a setup code at all? Lets the paste box route by prefix. */
export function looksLikeSetupCode(input: string): boolean {
  return input.trim().startsWith(SETUP_CODE_PREFIX);
}
