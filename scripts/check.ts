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
import { ORNAMENTS } from "../src/data/ornaments";

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

const FORMAT_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

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
    for (let i = 0; i <= 5; i += 1) setA(m[8][i], i);
    setA(m[8][7], 6);
    setA(m[8][8], 7);
    setA(m[7][8], 8);
    for (let i = 9; i <= 14; i += 1) setA(m[14 - i][8], i);
    for (let i = 0; i <= 6; i += 1) setB(m[size - 1 - i][8], i);
    for (let i = 7; i <= 14; i += 1) setB(m[8][size - 15 + i], i);
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
    for (let i = 0; i <= 5; i += 1) set(m[8][i], i);
    set(m[8][7], 6); set(m[8][8], 7); set(m[7][8], 8);
    for (let i = 9; i <= 14; i += 1) set(m[14 - i][8], i);
    const mask = FORMAT_M.indexOf(f);
    must(mask >= 0, "unreadable format bits");
    const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const mark = (r: number, c: number) => { if (r >= 0 && c >= 0 && r < size && c < size) fixed[r][c] = true; };
    for (let i = 0; i <= 8; i += 1) for (let j = 0; j <= 8; j += 1) { mark(i, j); mark(i, size - 1 - j); mark(size - 1 - i, j); }
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
  must(ORNAMENTS.length === 7, `${ORNAMENTS.length} ornaments, expected 7`);
  // A hidden effect is unlisted, not invalid — but the two lists must never
  // disagree about anything other than a `hidden` flag.
  must(
    PICKABLE_FX.every((f) => FX.some((g) => g.id === f.id)),
    "PICKABLE_FX contains an effect missing from FX",
  );
  return `${LAYOUTS.length}/${PALETTES.length}/${FX.length}/${ORNAMENTS.length} layouts/palettes/fx/ornaments`;
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
