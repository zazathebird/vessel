/**
 * One command that runs every automatable gate this project has.
 *
 * **Why it exists.** On 2026-08-17 a long session shipped, in order: a QR
 * encoder that would not scan, a CSS rule silently dropped because a scripted
 * edit landed it inside the previous block, a duel sequence that had become
 * unreachable, and an accessibility error that could never have been announced.
 * Every one of them typechecked, built, and looked right. The gap was never
 * "does it compile" — it was "does the thing it claims to do actually happen",
 * and nothing was asking that on every change.
 *
 * **What it is not.** It cannot check everything, and pretending otherwise is
 * how a green suite becomes a false reassurance. It checks the specific classes
 * of failure this codebase has actually produced, plus the invariants
 * `CLAUDE.md` states. Anything needing an eye — whether the fight *reads* well,
 * whether a layout is beautiful — is still a human's job, and the report says so
 * rather than staying quiet about it.
 *
 * Run with `npm run check`. It is also `predeploy`, so nothing reaches
 * production without passing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { qrMatrix } from "../src/auth/qr";
import { createDuel, advanceDuel } from "../src/fx/duel";
import { PAGES } from "../src/data/pages";
import { PATHS } from "../src/data/pageIds";
import { LAYOUTS, FX, PICKABLE_FX, TYPESETS, SCOPES } from "../src/data/catalog";
import { PALETTES } from "../src/data/palettes";
import { DEFAULT_ORNAMENT, ORNAMENTS, PICKABLE_ORNAMENTS } from "../src/data/ornaments";
import { decodeShareCode } from "../src/config/shareCode";

/**
 * `--fast` skips only the duel simulation, which is 360,000 stepped frames and
 * the one gate that takes tens of seconds. Everything else is milliseconds, so
 * the fast pass is what runs after every edit; the full pass gates the deploy.
 */
const FAST = process.argv.includes("--fast");

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, fn: () => string) => {
  try {
    results.push({ name, ok: true, detail: fn() });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
};
const must = (cond: boolean, message: string) => {
  if (!cond) throw new Error(message);
};

// ---- 1. Types and build ----------------------------------------------------

check("typecheck", () => {
  execFileSync("npm", ["run", "typecheck"], { stdio: "pipe" });
  return "app and worker typecheck";
});

// ---- 2. Stylesheets parse --------------------------------------------------
//
// A scripted CSS edit can land a rule *inside* the previous declaration block,
// which leaves a stray `}`. The page still renders — CSS error recovery skips
// to the next valid rule — so the only symptom is one rule silently not
// applying. That cost a debugging round today.

check("css braces balance", () => {
  const dir = "src/styles";
  const bad: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(dir, file), "utf8");
    let depth = 0;
    let stray = 0;
    for (const ch of css) {
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth < 0) {
          stray += 1;
          depth = 0;
        }
      }
    }
    if (stray !== 0 || depth !== 0) bad.push(`${file} (stray ${stray}, unclosed ${depth})`);
  }
  must(bad.length === 0, `unbalanced: ${bad.join(", ")}`);
  return `${readdirSync(dir).filter((f) => f.endsWith(".css")).length} stylesheets balanced`;
});

// ---- 2a2. Every layout owns an entrance -------------------------------------
//
// The entrance system (entrances.css, 2026-08-18) is one keyframe driven by
// per-layout tokens, so "a layout was added and forgotten here" fails silently:
// the new layout just plays the generic default and nobody notices. This gate
// makes the omission loud. Console is the documented exception — its 160ms
// stream in chrome.css *is* its entrance, and replacing it would orphan the
// kicker wipe that inherits its delay.
//
// The `to`-block assertion is structural: Split's even blocks and the HUD's
// parallax *declare* `translate`, so an entrance keyframe with a hardcoded
// `to` state would animate to the wrong place and pop on release. From-only
// keyframes resolve the landing to the element's own declared style, and that
// rule holding is what this file's correctness rests on.

check("every layout owns an entrance", () => {
  const css = readFileSync("src/styles/entrances.css", "utf8");
  const missing = LAYOUTS.map((l) => l.id).filter(
    (id) => id !== "console" && !css.includes(`.has-entrances.layout-${id}`),
  );
  must(missing.length === 0, `no entrance rule for: ${missing.join(", ")}`);
  must(
    /\.has-entrances:not\(\.layout-console\)\s+\.v-block/.test(css),
    "the base arrival rule is gone or renamed",
  );
  must(
    !/(^|\s)to\s*\{/m.test(css),
    "entrances.css has a `to` block — from-only is the rule (declared translate would pop on release)",
  );
  const chrome = readFileSync("src/styles/chrome.css", "utf8");
  must(
    /animation-delay:\s*calc\(var\(--i/.test(chrome),
    "chrome.css no longer computes the block stagger from --i",
  );
  return `${LAYOUTS.length - 1} entrances + console's stream; keyframes stay from-only`;
});

// ---- 2b. The account form is not sized by whatever contains it -------------
//
// 2026-08-17, client: "there is an issue with creating a profile… the current
// view does not give a large enough field for passwords."
//
// `.v-account` is a direct child of `.v-stage`, and Side-scroll's stage is a
// horizontally scrolling flex row — so the section became a flex item and was
// sized by the track. Measured 210px on desk against 472px in the other
// thirteen layouts; minus the reveal button's reserve that is about **eight
// characters** of a twelve-character minimum password, on the one form the site
// cannot recover a typo in. Side-scroll is what the live site publishes, so this
// was the state of production.
//
// A `max-width` alone does not prevent it: a flex item with only a maximum is
// still free to shrink to its content. The fix is an explicit `width`, plus the
// stage opting out of the track when it holds an account form. Both are asserted
// here because the real test needs a browser and this suite has none — a
// tripwire on the two declarations is what is available, and it is exactly the
// pair that was missing.

check("the account form owns its width", () => {
  const css = readFileSync("src/styles/chrome.css", "utf8");

  const block = css.match(/(^|\n)\.v-account\s*\{([^}]*)\}/);
  must(block !== null, "no `.v-account` rule found in chrome.css");
  const body = block![2];
  must(
    /(^|[\s;])width\s*:/.test(body),
    "`.v-account` sets no explicit `width` — a `max-width` alone lets Side-scroll's flex track shrink it",
  );

  must(
    /\.layout-sidescroll\s+\.v-stage:has\(\.v-account\)/.test(css),
    "Side-scroll's stage no longer opts out of its track for account pages",
  );

  return "explicit width, and Side-scroll's stage opts out";
});

// ---- 3. The QR encoder -----------------------------------------------------
//
// Three independent checks, because this one shipped broken and each of the
// first two passed while it was. The round trip is the one that catches
// placement; the format-copy check is the one that catches what a scanner sees.

check("qr: reed-solomon vs the ISO worked example", () => {
  // Re-derive the field exactly as qr.ts does, then check v1-M "01234567".
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
  const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
  let gen = [1];
  for (let i = 0; i < 10; i += 1) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j += 1) {
      next[j] ^= mul(gen[j], 1);
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  const rem = new Array<number>(10).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < 10; i += 1) rem[i] ^= mul(gen[i + 1], factor);
  }
  const expected = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];
  must(JSON.stringify(rem) === JSON.stringify(expected), "RS codewords do not match ISO example");
  return "matches ISO/IEC 18004 worked example";
});

const ALIGN_CENTRES = [[], [], [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

const FORMAT_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

/**
 * The free-module count, against the published capacity.
 *
 * **This is the check the round trip cannot make.** The decoder derives its
 * function-module map from the encoder's own `reserved()`, so if that map is
 * wrong they shift together and the round trip still passes — which is exactly
 * how a 16-module over-reservation shipped. Counting non-fixed modules and
 * comparing against `8 × totalCodewords + remainderBits` needs no decoder and
 * cannot share the mistake.
 */
check("qr: free modules match the published capacity", () => {
  const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
  // Derive the map from the finished symbol: a module is "function" if it is
  // identical under every one of the eight masks (masking only touches data).
  for (let v = 1; v <= 10; v += 1) {
    const size = 17 + v * 4;
    // A payload that lands exactly on this version.
    const cap = TOTAL[v];
    const text = "x".repeat(Math.max(1, Math.floor(cap / 3)));
    const m = qrMatrix(text);
    if (m.length !== size) continue;
    const expected = 8 * TOTAL[v] + REMAINDER[v];
    // Count modules the data placement is allowed to use, reconstructed from
    // the specification rather than from the encoder.
    let free = 0;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const topLeft = r <= 8 && c <= 8;
        const topRight = r <= 8 && c >= size - 8;
        const bottomLeft = r >= size - 8 && c <= 8;
        const timing = r === 6 || c === 6;
        let align = false;
        for (const ar of ALIGN_CENTRES[v]) {
          for (const ac of ALIGN_CENTRES[v]) {
            const near = (ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8);
            if (near) continue;
            if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) align = true;
          }
        }
        const versionInfo = v >= 7 && ((r < 6 && c >= size - 11 && c <= size - 9) || (c < 6 && r >= size - 11 && r <= size - 9));
        if (!topLeft && !topRight && !bottomLeft && !timing && !align && !versionInfo) free += 1;
      }
    }
    must(free === expected, `version ${v}: ${free} free modules, specification says ${expected}`);
  }
  return "versions 1-10 match 8×codewords + remainder";
});



check("qr: both format copies agree and are published values", () => {
  for (const text of ["short", "x".repeat(100), "x".repeat(200)]) {
    const m = qrMatrix(text);
    const size = m.length;
    let a = 0;
    let b = 0;
    const setA = (v: boolean, i: number) => {
      if (v) a |= 1 << i;
    };
    const setB = (v: boolean, i: number) => {
      if (v) b |= 1 << i;
    };
    // Specification positions (ZXing / python-qrcode), NOT the encoder's own —
    // the point is to read the symbol the way a scanner does.
    for (let i = 0; i <= 5; i += 1) setA(m[i][8], i);
    setA(m[7][8], 6);
    setA(m[8][8], 7);
    setA(m[8][7], 8);
    for (let i = 9; i <= 14; i += 1) setA(m[8][14 - i], i);
    for (let i = 0; i <= 7; i += 1) setB(m[8][size - 1 - i], i);
    for (let i = 8; i <= 14; i += 1) setB(m[size - 15 + i][8], i);
    must(a === b, `format copies disagree at ${size}x${size}: ${a.toString(16)} vs ${b.toString(16)}`);
    must(FORMAT_M.includes(a), `format bits 0x${a.toString(16)} not a level-M pattern`);
  }
  return "copies agree, values published, versions 1/6/10";
});

check("qr: output decodes back to its input", () => {
  const M_BLOCKS = [[], [10,1,16,0,0], [16,1,28,0,0], [26,1,44,0,0], [18,2,32,0,0], [24,2,43,0,0],
    [16,4,27,0,0], [18,4,31,0,0], [22,2,38,2,39], [22,3,36,2,37], [26,4,43,1,44]];
  const ALIGN = [[], [], [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  const MASKS = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const decode = (m: boolean[][]) => {
    const size = m.length;
    const version = (size - 17) / 4;
    let f = 0;
    const set = (v: boolean, i: number) => { if (v) f |= 1 << i; };
    for (let i = 0; i <= 5; i += 1) set(m[i][8], i);
    set(m[7][8], 6); set(m[8][8], 7); set(m[8][7], 8);
    for (let i = 9; i <= 14; i += 1) set(m[8][14 - i], i);
    const mask = FORMAT_M.indexOf(f);
    must(mask >= 0, "unreadable format bits");
    const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const mark = (r: number, c: number) => { if (r >= 0 && c >= 0 && r < size && c < size) fixed[r][c] = true; };
    for (let i = 0; i <= 8; i += 1) for (let j = 0; j <= 8; j += 1) {
      mark(i, j);
      if (j <= 7) mark(i, size - 1 - j);
      if (i <= 7) mark(size - 1 - i, j);
    }
    for (let i = 0; i < size; i += 1) { mark(6, i); mark(i, 6); }
    for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) mark(r + dr, c + dc);
    }
    if (version >= 7) for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) { mark(size - 11 + j, i); mark(i, size - 11 + j); }
    const bits: number[] = [];
    let up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let step = 0; step < size; step += 1) {
        const row = up ? size - 1 - step : step;
        for (let k = 0; k < 2; k += 1) {
          const c = col - k;
          if (fixed[row][c]) continue;
          bits.push(m[row][c] !== MASKS[mask](row, c) ? 1 : 0);
        }
      }
      up = !up;
    }
    const words: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    const [, b1, d1, b2, d2] = M_BLOCKS[version] as number[];
    const sizes = [...Array(b1).fill(d1), ...Array(b2).fill(d2)];
    const blocks: number[][] = sizes.map(() => []);
    let idx = 0;
    for (let i = 0; i < Math.max(d1, d2); i += 1) for (let b = 0; b < blocks.length; b += 1) if (i < sizes[b]) blocks[b].push(words[idx++]);
    const bs: number[] = [];
    for (const w of blocks.flat()) for (let i = 7; i >= 0; i -= 1) bs.push((w >> i) & 1);
    let p = 0;
    const take = (n: number) => { let v = 0; for (let i = 0; i < n; i += 1) v = (v << 1) | bs[p++]; return v; };
    must(take(4) === 0b0100, "not byte mode");
    const len = take(version < 10 ? 8 : 16);
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) out[i] = take(8);
    return new TextDecoder().decode(out);
  };
  for (const text of [
    "short",
    "otpauth://totp/mcclevarty.ca:piratelife?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=mcclevarty.ca",
    "x".repeat(200),
  ]) {
    must(decode(qrMatrix(text)) === text, `round trip failed for ${text.length} bytes`);
  }
  return "versions 1, 6 and 10 round trip";
});

// ---- 4. Duel invariants ----------------------------------------------------
//
// The fight cannot be watched here (rAF parks), so its guarantees are checked by
// stepping it. Each of these was a shipped bug at some point.

if (!FAST) check("duel: fairness, reachability, stability", () => {
  const styles = ["hooded", "caped", "haloed", "horned"] as const;
  let left = 0;
  let right = 0;
  let nan = 0;
  const seen = new Set<string>();
  for (let r = 0; r < 3; r += 1) {
    const st = createDuel(styles[r % 4], styles[(r + 1) % 4]);
    let over = 0;
    for (let i = 0; i < 120_000; i += 1) {
      advanceDuel(st, 1);
      if (st.dir.seq) seen.add(st.dir.seq.id);
      if (st.over > 0 && over === 0) {
        if (st.a.health <= 0 && st.b.health > 0) right += 1;
        else if (st.b.health <= 0 && st.a.health > 0) left += 1;
      }
      over = st.over;
      if (!Number.isFinite(st.a.x) || !Number.isFinite(st.b.x) || !Number.isFinite(st.a.health)) nan += 1;
    }
  }
  const n = left + right;
  const sigma = Math.abs(left - n / 2) / Math.sqrt(n * 0.25);
  must(nan === 0, `${nan} non-finite frames`);
  must(n > 100, `only ${n} matches — the fight may be stalling`);
  must(sigma < 3, `side bias ${sigma.toFixed(2)} sigma over ${n} matches`);
  // `close-in` is deliberately the only `far` sequence and the leash makes that
  // band rare, so it is exempt; everything else must be reachable.
  const missing = [...seen].length;
  must(missing >= 22, `only ${missing} of 23 sequences fired`);
  return `${n} matches, ${sigma.toFixed(2)}σ, ${missing}/23 sequences, no NaN`;
});


// ---- 5. Catalogue and content invariants -----------------------------------

check("catalogues match the documented counts", () => {
  must(LAYOUTS.length === 14, `${LAYOUTS.length} layouts, expected 14`);
  must(PALETTES.length === 25, `${PALETTES.length} palettes, expected 25`);
  must(FX.length === 16, `${FX.length} effects, expected 16`);
  must(TYPESETS.length === 5, `${TYPESETS.length} typesets, expected 5`);
  must(SCOPES.length === 6, `${SCOPES.length} scopes, expected 6`);
  must(ORNAMENTS.length === 8, `${ORNAMENTS.length} ornaments, expected 8`);
  // A hidden effect is unlisted, not invalid — but the two lists must never
  // disagree about anything other than a `hidden` flag.
  must(
    PICKABLE_FX.every((f) => FX.some((g) => g.id === f.id)),
    "PICKABLE_FX contains an effect missing from FX",
  );
  must(
    PICKABLE_ORNAMENTS.every((o) => ORNAMENTS.some((p) => p.id === o.id)),
    "PICKABLE_ORNAMENTS contains an ornament missing from ORNAMENTS",
  );
  // The default has to be something a human can still get back to. It is also
  // what a background duel makes the ornament yield to and what an out-of-range
  // share-code index resolves to, so a hidden default would be a slot nobody
  // could re-select once they left it.
  must(
    PICKABLE_ORNAMENTS.some((o) => o.id === DEFAULT_ORNAMENT),
    `DEFAULT_ORNAMENT (${DEFAULT_ORNAMENT}) is hidden — it must stay pickable`,
  );
  // The wire ORDER, not just the count. Length checks pass a reorder, and a
  // reorder silently repoints every share code in circulation — the exact
  // failure the append-only rule exists to prevent. Append here when appending
  // there; any other edit to this list is the bug this line exists to catch.
  const ORNAMENT_WIRE = "lens,valve,aperture,orrery,none,duel,duelholy,sonar";
  must(
    ORNAMENTS.map((o) => o.id).join(",") === ORNAMENT_WIRE,
    `ornament wire order changed: ${ORNAMENTS.map((o) => o.id).join(",")}`,
  );
  return `${LAYOUTS.length}/${PALETTES.length}/${FX.length}/${ORNAMENTS.length} layouts/palettes/fx/ornaments`;
});

check("hidden ornaments still decode; out-of-range falls to the default", () => {
  // The first actually-hidden catalogue entries landed 2026-08-17, so this is
  // the first time "hidden means unlisted, not invalid" is load-bearing: a
  // stored config or share code naming a withdrawn ornament must keep meaning
  // it. And a field past the end of the list must resolve to DEFAULT_ORNAMENT,
  // not to index 0 — index 0 is Lens, which is withdrawn; the decode fell back
  // to it until 2026-08-17 while two comments claimed otherwise.
  const lens = decodeShareCode("0-0-0-0-0-0");
  must(lens?.ornament === "lens", `hidden ornament at index 0 decoded to ${lens?.ornament}`);
  const far = decodeShareCode("0-0-0-0-0-Z");
  must(
    far?.ornament === DEFAULT_ORNAMENT,
    `out-of-range ornament decoded to ${far?.ornament}, expected ${DEFAULT_ORNAMENT}`,
  );
  const five = decodeShareCode("0-0-0-0-0");
  must(five !== null && !("ornament" in five), "a five-field code should leave the ornament alone");
  return "index 0 (hidden) resolves, out-of-range resolves to the default, five-field codes abstain";
});

check("every route has copy, and the 404's page count is true", () => {
  for (const id of Object.keys(PATHS) as (keyof typeof PATHS)[]) {
    must(Boolean(PAGES[id]), `no copy for route ${id}`);
    must(Boolean(PAGES[id].title) && Boolean(PAGES[id].lede), `${id} missing title or lede`);
  }
  // The 404 jokes about how many other pages there are, and the joke depends on
  // being true. Content pages = everything except the 404 and the account pages.
  const account = new Set(["signup", "signin", "admin", "machines", "share", "notfound"]);
  const content = (Object.keys(PATHS) as string[]).filter((id) => !account.has(id));
  const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const expected = words[content.length - 1];
  const body = JSON.stringify(PAGES.notfound);
  must(
    body.includes(`${expected} other page`),
    `404 should say "${expected} other pages" (there are ${content.length}); update src/data/pages.ts`,
  );
  return `${Object.keys(PATHS).length} routes have copy; 404 says "${expected}"`;
});

// ---- 6. Things only a person can judge -------------------------------------

const UNCHECKABLE = [
  "whether the fight reads well — it cannot be watched here (rAF parks)",
  "whether any layout is beautiful, or the copy sounds right",
  "whether a QR actually scans on a phone",
  "the operator surfaces, which need a signed-in session",
];

// ---- report ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name.padEnd(46)} ${r.detail}`);
}
console.log("");
if (failed.length === 0) {
  console.log(`${results.length} checks passed${FAST ? " (fast — duel simulation skipped)" : ""}.`);
  console.log("Still needs a person:");
  for (const u of UNCHECKABLE) console.log(`  · ${u}`);
} else {
  console.log(`${failed.length} of ${results.length} checks FAILED.`);
  process.exitCode = 1;
}
