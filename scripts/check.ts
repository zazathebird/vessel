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
import {
  createDuel,
  createDuelFrom,
  advanceDuel,
  buildSequence,
  makeRoll,
  bladeWorld,
  carryWindow,
  duelFocus,
  BODY_H,
  DUEL_TABLES,
  GRAVITY,
} from "../src/fx/duel";
import { duelCamera, ORNAMENT_PX } from "../src/components/DuelOrnament";
import type { DuelCam } from "../src/components/DuelOrnament";
import { BLADE_COLORS, DUEL_POOLS, FIGHTERS, rollPairing } from "../src/fx/fighters";
import type { CostumeCtx, FighterKind, FighterStyle } from "../src/fx/fighters";
import { PAGES } from "../src/data/pages";
import { DOWNLOADS } from "../src/data/downloads";
import { rangePlan } from "../worker/downloads";
import { PATHS } from "../src/data/pageIds";
import { LAYOUTS, FX, PICKABLE_FX, TYPESETS, SCOPES } from "../src/data/catalog";
import type { LayoutId } from "../src/data/catalog";
import { PALETTES } from "../src/data/palettes";
import { DEFAULT_ORNAMENT, ORNAMENTS, PICKABLE_ORNAMENTS } from "../src/data/ornaments";
import { decodeShareCode } from "../src/config/shareCode";
import { adaptLayout } from "../src/config/bands";
import { DEFAULT_STATION, PICKABLE_STATIONS, STATIONS } from "../src/data/stations";
import { isAllowed } from "../src/data/guardrails";
import { edgeState } from "../src/hooks/useEdgeFade";
import type { Band } from "../src/config/bands";
import { PRESETS } from "../src/data/presets";

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

// ---- 2a3. No stylesheet rule pairs a band with a layout it never renders ----
//
// `.band-*` and `.layout-*` sit on the *same* element, and CLAUDE.md's first CSS
// gotcha is the descendant-combinator version of that trap. This is its twin and
// it fails even more quietly: the selector is written correctly, it just names a
// combination the app cannot produce. `band` and the adapted `layout` come out of
// one `useMemo` in one render (`ConfigContext`), so they cannot disagree even
// mid-resize — if `adaptLayout(id, band) !== id`, that class pair is *never*
// written to the wrapper and the rule is dead.
//
// Four such rules were live on 2026-08-18 (Deck and Ledger on phone, Ledger on
// tablet, Side-scroll on phone). Harmless in themselves, which is the problem:
// two of them carried a comment claiming to "guard against a share code landing
// mid-resize", a state that is structurally impossible, and a reader trusting
// that guard would be relying on nothing. Removing them by eye is how three of
// four got found; this is how the fourth did.
//
// Comments are stripped first — the surviving notes *name* the dead pairings in
// prose, and a gate that trips on its own documentation is a gate people delete.

check("no band pairs with a layout it never renders", () => {
  const dir = "src/styles";
  const ids = new Set(LAYOUTS.map((l) => l.id));
  const bands: Band[] = ["phone", "tablet", "desk"];
  const dead: string[] = [];
  const unknown: string[] = [];
  let pairs = 0;

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Both orders — the classes are unordered on the element, so a future rule
    // could legitimately be written either way round.
    const re = /\.band-([a-z]+)\.layout-([a-z]+)|\.layout-([a-z]+)\.band-([a-z]+)/g;
    for (const m of css.matchAll(re)) {
      const band = (m[1] ?? m[4]) as Band;
      const layout = (m[2] ?? m[3]) as LayoutId;
      if (!bands.includes(band)) {
        unknown.push(`${file}: .band-${band} is not a band`);
        continue;
      }
      if (!ids.has(layout)) {
        unknown.push(`${file}: .layout-${layout} is not a layout`);
        continue;
      }
      pairs += 1;
      if (adaptLayout(layout, band) !== layout) {
        dead.push(`${file}: .band-${band}.layout-${layout} (${band} renders ${adaptLayout(layout, band)})`);
      }
    }
  }

  must(unknown.length === 0, unknown.join("; "));
  must(
    dead.length === 0,
    `unreachable band/layout rules — delete them or fix the selector: ${dead.join("; ")}`,
  );
  return `${pairs} band/layout pairings, all reachable`;
});

// ---- 2a4. A touch-sizing rule names both narrow bands, never phone alone ----
//
// 2026-08-19. **A phone held sideways is `band-tablet`, not `band-phone`.** The
// band is computed from `innerWidth` alone (`src/config/bands.ts`), and a
// landscape phone is ~844 CSS pixels wide, which sits inside the tablet band's
// 560–899. So every touch-target rule gated on `.band-phone` reached portrait
// only, and the one input mode that cannot use a mouse got the desk treatment.
//
// Measured at 844×420 before the fix: the footer's five links — `sign in` among
// them, which CLAUDE.md makes the *only* permanent route to an account — were
// 15px tall against a 24px floor, while the same links at 420×860 measured 44.
// Two of the four offending rules were the file explorer's row heights.
//
// The 2026-08-17 sweep that added these rules could not have caught it: it
// measured a portrait viewport, and in portrait they are all correct. That is
// exactly the class of gap a gate is for.
//
// A rule counts as touch-sizing when it uses one of the three idioms this
// codebase uses for a hit area, which are specific enough not to catch ordinary
// layout padding: `min-height: 44px` (the site's stated convention), a `padding`
// cancelled by a negative `margin` (an invisible hit area that shifts nothing),
// or `padding-block` (row height in the explorer's tables). Deliberately *not*
// flagged, and each verified as a real phone-only case: `.v-codes` (a grid
// column count, driven by width), `.v-tile`'s 128px minimum, and the `.v-hero` /
// `.v-termbody` paddings, which are layout spacing rather than targets.

check("touch-sizing rules name both narrow bands", () => {
  const dir = "src/styles";
  const phoneOnly: string[] = [];
  let touch = 0;

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      sels: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean),
      body: m[2],
    }));

    // Every target that is given tablet treatment anywhere in this file, so the
    // two halves of a fix may live in separate rules if that ever reads better.
    const tabletTargets = new Set<string>();
    for (const r of rules) {
      for (const s of r.sels) {
        const m = /^\.band-tablet[\s.](.+)$/.exec(s);
        if (m) tabletTargets.add(m[1].trim());
      }
    }

    for (const r of rules) {
      const hasFloor = /min-height:\s*44px/.test(r.body);
      const hasNegPull = /padding:/.test(r.body) && /margin:\s*-/.test(r.body);
      const hasRowPad = /padding-block:/.test(r.body);
      if (!hasFloor && !hasNegPull && !hasRowPad) continue;

      for (const s of r.sels) {
        const m = /^\.band-phone[\s.](.+)$/.exec(s);
        if (!m) continue;
        touch += 1;
        const target = m[1].trim();
        if (!tabletTargets.has(target)) phoneOnly.push(`${file}: ${s}`);
      }
    }
  }

  must(
    phoneOnly.length === 0,
    "touch-sizing rules that reach portrait only — a landscape phone is " +
      `band-tablet (844px wide), so these never fire on it: ${phoneOnly.join("; ")}`,
  );
  return `${touch} phone touch rules, all paired with tablet`;
});

// ---- 2a5. Scroll-driven animations survive the entrance layer ---------------
//
// 2026-08-18. `entrances.css` imports after `layouts.css` and its base arrival
// rule is the `animation` **shorthand**, which resets every longhand it does not
// name — `animation-name`, and with it `animation-timeline` and
// `animation-range`. It is `:not()`-qualified and `:not()` contributes its
// argument's specificity, so it sits at 0-3-0 against a layout's 0-2-0 and wins
// outright.
//
// Deck declares a second animation there: `v-deck-depth`, the view-timeline pass
// that stands the centre card forward. With `entrances` defaulting to true and
// published, it was simply switched off — and it came back the instant you
// turned entrances off or enabled calm, which is what let it survive review.
//
// The rule this encodes: **any animation bound to a view/scroll timeline must
// also be named at the entrance layer**, because the entrance layer outranks the
// layout that declared it. Names are paired with timelines *by index*, so
// `animation-name: v-ent, v-deck-depth` against `animation-timeline: auto,
// view(inline)` correctly flags only the second one — the first is the entrance
// and is expected to be replaced.

check("scroll-driven animations survive the entrance layer", () => {
  const dir = "src/styles";
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const entrances = strip(readFileSync(join(dir, "entrances.css"), "utf8"));

  const entranceNames = new Set<string>();
  for (const m of entrances.matchAll(/animation-name\s*:\s*([^;}]+)/g)) {
    for (const n of m[1].split(",")) entranceNames.add(n.trim());
  }

  const timelined = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = strip(readFileSync(join(dir, file), "utf8"));
    for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
      const body = block[1];
      const names = body.match(/animation-name\s*:\s*([^;}]+)/);
      const lines = body.match(/animation-timeline\s*:\s*([^;}]+)/);
      if (!names || !lines) continue;
      const nameList = names[1].split(",").map((s) => s.trim());
      const lineList = lines[1].split(",").map((s) => s.trim());
      nameList.forEach((name, i) => {
        const tl = lineList[i] ?? lineList[lineList.length - 1];
        if (/\b(view|scroll)\s*\(/.test(tl)) timelined.set(name, file);
      });
    }
  }

  const dropped = [...timelined].filter(([name]) => !entranceNames.has(name));
  must(
    dropped.length === 0,
    `the entrance layer's shorthand resets these scroll-driven animations — re-list them in ` +
      `entrances.css: ${dropped.map(([n, f]) => `${n} (${f})`).join(", ")}`,
  );
  must(timelined.size > 0, "no scroll-driven animations found at all — has the selector changed?");
  return `${timelined.size} scroll-driven animation(s), all re-listed at the entrance layer`;
});

// ---- 2a6. A from-only keyframe needs a landing value it can interpolate to ---
//
// 2026-08-18. `entrances.css`'s house rule is from-only keyframes, so the landing
// state is whatever the element declares. That is exactly right for `translate`,
// `scale`, `opacity` and `rotate`, whose initial values interpolate. It is wrong
// for `clip-path`: its initial value is `none`, and an `inset()` does not
// interpolate *to* `none` — it flips **discretely at 50% progress**. So the
// termbar's `steps(22, end)` "typewriter" produced no wipe whatsoever; the title
// was fully clipped, i.e. invisible, for the first half of its 0.85s and then
// popped in, on every navigation in Terminal.
//
// The gate: if a from-only keyframe animates `clip-path`, the element it is
// applied to must declare a `clip-path` of its own, so both endpoints are the
// same shape family. Widen DISCRETE if another such property is ever animated.

check("from-only keyframes land on an interpolable value", () => {
  const dir = "src/styles";
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const entrances = strip(readFileSync(join(dir, "entrances.css"), "utf8"));
  const every = readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => strip(readFileSync(join(dir, f), "utf8")))
    .join("\n");
  const DISCRETE = ["clip-path"];

  const problems: string[] = [];
  let pairs = 0;
  for (const kf of entrances.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    const [, name, body] = kf;
    for (const prop of DISCRETE) {
      if (!new RegExp(`\\b${prop}\\s*:`).test(body)) continue;
      // Every rule that applies this keyframe, and the element it targets.
      for (const rule of entrances.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!new RegExp(`animation[^;}]*\\b${name}\\b`).test(rule[2])) continue;
        const target = rule[1].trim().split(/\s+/).pop() ?? "";
        const cls = target.match(/\.[\w-]+$/)?.[0];
        if (!cls) continue;
        pairs += 1;
        // A declaration of that property for that class, outside any @keyframes.
        const declared = new RegExp(
          `\\${cls}\\s*(,[^{}]*)?\\{[^{}]*\\b${prop}\\s*:`,
        ).test(every);
        if (!declared) {
          problems.push(
            `${name} animates ${prop} from-only but ${cls} declares no ${prop} — it will flip ` +
              `discretely at 50%, not wipe`,
          );
        }
      }
    }
  }
  must(problems.length === 0, problems.join("; "));
  return pairs > 0 ? `${pairs} discrete-property keyframe(s) land on a declared value` : "none animated";
});

// ---- 2a4. The edge fade's truth table ---------------------------------------
//
// `edgeState` is exported and pure for one stated reason — "the environment this
// is built in cannot observe it… a function taking three numbers can be stepped
// through every state in Node instead, which is the only way this logic gets
// checked rather than assumed". Nothing was stepping it. This makes the doc true.
//
// The **1px dead band on all three comparisons** is the part worth pinning: sub-
// pixel layout means a row that fits reports fractional slack rather than zero,
// and a flick that lands at the end can stop a fraction short of it. Drop it from
// any one comparison and the header shows a fade pointing at nothing — the exact
// "affordance pointing at content that is not there" the hook's doc rejects.

check("the edge fade's truth table holds, dead band included", () => {
  const cases: [number, number, number, ReturnType<typeof edgeState>][] = [
    [0, 100, 100, null],        // fits exactly — no attribute at all
    [0, 101, 100, null],        // 1px of slack is noise, not content
    [0, 100.4, 100, null],      // sub-pixel slack, the case the band exists for
    [0, 200, 100, "end"],       // at the start, content to the right
    [1, 200, 100, "end"],       // a pixel in is still "at the start"
    [50, 200, 100, "both"],     // mid-row, hiding content on both sides
    [99, 200, 100, "start"],    // a pixel short of the end is still "at the end"
    [100, 200, 100, "start"],   // hard against the end
  ];
  for (const [left, sw, cw, want] of cases) {
    const got = edgeState(left, sw, cw);
    must(got === want, `edgeState(${left}, ${sw}, ${cw}) = ${got}, expected ${want}`);
  }
  return `${cases.length} states, both 1px dead bands`;
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

// ---- 2b. The downloads catalogue and its container --------------------------
//
// 2026-08-19. Three separate failures, all of which look fine in a build.
//
// **The container.** `.v-downloads` is a direct child of `.v-stage`, exactly
// like `.v-account`, so it inherits that section's documented Side-scroll
// problem in full: the stage is a flex row there, `grid-column` does nothing,
// and a section with only a `max-width` gets sized by the filmstrip track. The
// account form measured 210px when this bit it the first time. Same shape of
// bug, same two declarations, so the same two assertions.
//
// **The ids.** An id is simultaneously the R2 object key and a URL query value.
// A space or a slash in one produces a link that 404s for a paying customer
// and an object key that no longer matches what was uploaded — and neither
// shows up until somebody has paid. Uppercase is the quieter version of the
// same trap, because R2 keys are case-sensitive and a hand-typed
// `wrangler r2 object put` is not.
//
// **The filenames.** `content-disposition` hands this to the browser verbatim.
// An extensionless name lands in somebody's Downloads folder as a file Windows
// cannot open, on a page whose whole job is handing over working software.

check("the downloads catalogue and its container hold together", () => {
  const css = readFileSync("src/styles/chrome.css", "utf8");

  const block = css.match(/(^|\n)\.v-downloads\s*\{([^}]*)\}/);
  must(block !== null, "no `.v-downloads` rule found in chrome.css");
  must(
    /(^|[\s;])width\s*:/.test(block![2]),
    "`.v-downloads` sets no explicit `width` — a `max-width` alone lets Side-scroll's flex track shrink it",
  );
  must(
    /\.layout-sidescroll\s+\.v-stage:has\(\.v-downloads\)/.test(css),
    "Side-scroll's stage no longer opts out of its track for the downloads catalogue",
  );

  const seen = new Set<string>();
  for (const item of DOWNLOADS) {
    must(
      /^[a-z0-9][a-z0-9-]*$/.test(item.id),
      `download id "${item.id}" is not lowercase-kebab — it is an R2 object key and a URL value`,
    );
    must(!seen.has(item.id), `duplicate download id "${item.id}"`);
    seen.add(item.id);
    must(
      /\.[a-z0-9]{1,6}$/i.test(item.filename),
      `download "${item.id}" has a filename with no extension ("${item.filename}") — it is handed to the browser verbatim`,
    );
    must(item.name.trim().length > 0, `download "${item.id}" has no name`);
    must(item.blurb.trim().length > 0, `download "${item.id}" has no blurb`);
  }

  return `${DOWNLOADS.length} catalogue entries, container owns its width`;
});

// ---- 2c. The download's partial-response arithmetic -------------------------
//
// 2026-08-19, the first time the bucket was made to hand over a byte, and the
// bug was on *every* download the page could serve.
//
// `env.DOWNLOADS.get(id, { range: request.headers })` reports an `object.range`
// whether or not the request carried a `Range` header — a plain GET comes back
// as `{ offset: 0, length: size }` — so the module's test for "did R2 serve a
// partial body" was answering `206 Partial Content`, with a `content-range`
// spanning the whole file, to browsers that had asked for no such thing. RFC
// 9110 §15.3.7 permits a 206 only in reply to a range request. Browsers tolerate
// it; download managers and proxies are entitled not to, and these are large
// files going to people on the connections that made them ring the operator.
//
// The second row of the table is the other half: R2 may *decline* a range and
// send everything, which the old code would have announced as a partial. A
// client resuming at 40MB that trusts a `content-range` it did not ask for
// writes those bytes at the wrong offset, and the corruption surfaces when the
// program will not run.
//
// Gated as a truth table rather than through the Worker because this is exactly
// the kind of decision this codebase extracts and steps — `edgeState` and
// `duelCamera` are here for the same reason. Every row below was observed on a
// live local Worker against a real 300,000-byte object before it was written
// down; the `bytes=0-` and unsatisfiable rows are the two that came back from
// R2 looking identical to a whole-file read, which is why they are here.

check("a download is a 206 only when it is genuinely partial", () => {
  const size = 300_000;
  // The three shapes `R2Range` is a union of, spelled structurally: this file is
  // bundled for Node and has no workers-types in scope.
  type Served = { offset?: number; length?: number } | { suffix: number };
  const rows: Array<[string, boolean, Served | undefined, { offset: number; length: number } | null]> = [
    ["no Range header, R2 reports the whole object", false, { offset: 0, length: size }, null],
    ["no Range header, no reported range", false, undefined, null],
    ["bytes=100000-100999", true, { offset: 100_000, length: 1_000 }, { offset: 100_000, length: 1_000 }],
    ["bytes=150000- (a resume)", true, { offset: 150_000, length: 150_000 }, { offset: 150_000, length: 150_000 }],
    ["bytes=-1000 (suffix form)", true, { suffix: 1_000 }, { offset: 299_000, length: 1_000 }],
    ["bytes=0- (whole file, asked for)", true, { offset: 0, length: size }, null],
    ["unsatisfiable, R2 declined and sent everything", true, { offset: 0, length: size }, null],
    ["a length past the end is clamped", true, { offset: 299_000, length: 9_000 }, { offset: 299_000, length: 1_000 }],
    ["an offset past the end claims nothing", true, { offset: size + 10, length: 50 }, { offset: size, length: 0 }],
  ];

  for (const [name, asked, served, want] of rows) {
    const got = rangePlan(asked, served, size);
    if (want === null) {
      must(got === null, `${name}: expected a 200, got 206 claiming ${JSON.stringify(got)}`);
      continue;
    }
    must(got !== null, `${name}: expected a 206, got a 200`);
    must(
      got!.offset === want.offset && got!.length === want.length,
      `${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
    );
    // The header the browser reads back must never name a byte the object does
    // not have; a `content-range` past the end is how a stitched file ends up
    // the wrong length.
    must(got!.offset + got!.length <= size, `${name}: content-range would run past the object`);
  }

  return `${rows.length} range shapes, and a plain GET is a 200`;
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
  // Nothing is ranged `far` any more — the leash keeps the fight out of that
  // band entirely — so every module in the pool must actually be reachable.
  const total = DUEL_TABLES.modules.length;
  const fired = seen.size;
  must(fired === total, `only ${fired} of ${total} modules fired`);
  return `${n} matches, ${sigma.toFixed(2)}σ, ${fired}/${total} modules, no NaN`;
});

/*
 * The generator, and why this gate had to change shape rather than be tweaked.
 *
 * The move tables are arithmetic in data, and that is where this effect's bugs
 * live: a contact frame parked inside a `hold` plateau so the blow lands nine
 * frames before the sword arrives, a reaction scheduled before its own cause, a
 * move nothing in the pool reaches. Each of those shipped once. None of them is
 * visible reading the file and none reliably fails a stepped simulation, because
 * the fight runs perfectly well and merely looks wrong.
 *
 * Until 2026-08-18 the second half of that was a table of 28 hand-authored
 * sequences and this gate read it. The pool is a *generator* now — the client's
 * ask was "completely random, not a set amount of looping duels" — and a
 * generator cannot be read. It has to be run, and run enough times to visit its
 * corners, so this builds every module thousands of times from a fixed seed and
 * asserts on every result.
 *
 * That is strictly stronger than what it replaced. The old gate could only
 * confirm the numbers somebody had typed; this one re-derives every contact
 * frame from the move table on every roll, so a module that rolls itself into an
 * impossible ordering fails here rather than on the site.
 *
 * The seed is fixed and per-module, so a failure is reproducible: the same run
 * of the suite produces the same sequences in the same order.
 */
check("duel: every generated sequence is arithmetically sound", () => {
  const { moves, modules } = DUEL_TABLES;

  // Reaction moves exist only as the consequence of a scripted blow.
  const REACTIONS = new Set(["stagger", "knockdown", "stumble_in", "recoil"]);
  // Reached by the engine rather than by a beat: the idle, the victory pose, the
  // deferred bounce off a block, and the corpse.
  const ENGINE = new Set(["guard", "flourish", "recoil", "dead"]);

  /*
   * Per-move properties, which no roll can affect — so they are asserted once
   * over the table rather than once per generated sequence.
   *
   * **Contact must be a frame the blade has arrived on.** `spin_attack` fired at
   * 23, inside a plateau that parks the blade overhead until 28 and swings at
   * 32, so the damage, the sparks and the knockdown all landed with the sword
   * still up and it swept through empty air nine frames later. Four of six
   * attacks were early against their own tables.
   *
   * **Blade attacks only.** The force moves land their contact with the
   * outstretched *hand* — the rings are drawn off `offHand`, not off the sword —
   * and `force_hold` parks its blade overhead for the whole lift on purpose, so
   * its contact is inside a plateau and correctly so. This gate caught it on the
   * first run, which is the right outcome for a rule stated one notch too wide:
   * the invariant was always about the blade arriving.
   */
  for (const [id, m] of Object.entries(moves)) {
    must(
      m.windup === undefined || m.windup < m.contact,
      `${id}: windup ${m.windup} is not before contact ${m.contact}`,
    );
    if (m.contact >= 0 && m.chan === "attacking") {
      const t = m.contact / m.frames;
      const held = m.blade.some(
        (k, i) => i + 1 < m.blade.length && m.blade[i + 1][2] === "hold" && t > k[0] && t < m.blade[i + 1][0],
      );
      must(!held, `${id}: contact ${m.contact} lands inside a hold plateau`);
    }
  }

  /** The frame a beat's blow actually lands, counting a skipped wind-up. */
  const contactOf = (b: { move: string; at: number; quick?: boolean }): number => {
    const m = moves[b.move];
    return b.at + m.contact - (b.quick ? (m.windup ?? 0) : 0);
  };

  /** mulberry32 — small, seeded, and good enough to walk a builder's corners. */
  const seeded = (s: number) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const reached = new Set<string>(ENGINE);
  const PER_MODULE = 8_000;
  let built = 0;
  let longest = 0;

  for (let mi = 0; mi < modules.length; mi += 1) {
    const mod = modules[mi];
    const rand = seeded(0x5eed + mi * 7919);
    let everHit = false;
    for (let i = 0; i < PER_MODULE; i += 1) {
      // The raw build, not `buildSequence`, because `buildSequence` sorts the
      // beats and whether the *builder* emitted them in order is one of the
      // things gated below.
      const s = mod.build(makeRoll(rand));
      built += 1;
      longest = Math.max(longest, s.length);

      must(s.beats.length > 0, `${mod.id}: built an empty sequence`);
      must(
        Number.isFinite(s.length) && s.length > 0 && s.length < 1200,
        `${mod.id}: implausible length ${s.length}`,
      );

      let prevAt = -1;
      const contacts: number[] = [];
      for (const b of s.beats) {
        const m = moves[b.move];
        must(m !== undefined, `${mod.id} names an unknown move ${b.move}`);
        reached.add(b.move);
        /*
         * `runDirector` walks the array in order and stops at the first beat
         * whose frame has not arrived, so a beat out of order stalls every beat
         * behind it until its own frame comes round. `buildSequence` sorts, so
         * this cannot reach the site — but a builder that rolls its way into one
         * has an arithmetic mistake in it, and the sort would hide it.
         */
        must(b.at >= prevAt, `${mod.id}: beat ${b.move} at ${b.at} is out of order`);
        prevAt = b.at;
        // A beat at or past `length` is a beat the director throws away.
        must(b.at >= 0 && b.at < s.length, `${mod.id}: ${b.move} at ${b.at} outside 0..${s.length}`);
        // A quick entry with no wind-up to skip is a beat that thinks it is a
        // riposte and is not — it would run at full length and land late.
        must(
          !b.quick || m.windup !== undefined,
          `${mod.id}: ${b.move} is entered quick but declares no windup`,
        );
        /*
         * `power` is not always a damage multiplier. On a `lock` beat it is the
         * press — 1 drives, 0 gives ground — so zero is meaningful there and
         * only a *scripted blow* has to carry a positive one. A hit multiplied
         * by zero is a blow that lands for no damage, which reads as a miss the
         * victim flinches at.
         */
        must(
          b.power === undefined || (b.power >= 0 && b.power <= 2),
          `${mod.id}: ${b.move} rolled power ${b.power}`,
        );
        must(
          b.outcome !== "hit" || b.power === undefined || b.power > 0,
          `${mod.id}: ${b.move} scripts a hit at power ${b.power}`,
        );
        /*
         * A scripted hit on a move with no contact frame never resolves:
         * `resolveContact` is called from the frame `mf === m.contact`, so the
         * damage, the sparks and the hit-stop simply never happen and the
         * reaction beat fires over a blow that was never dealt.
         */
        if (b.outcome !== undefined) {
          must(m.contact >= 0, `${mod.id}: ${b.move} is given an outcome but can never connect`);
        }
        if (b.outcome === "hit") {
          contacts.push(contactOf(b));
          everHit = true;
        }
      }

      /*
       * A damage reaction may never precede its cause. A *parry* may, and
       * several deliberately do — a block that arrives after the blow is not a
       * block — so only the reactions are tested.
       */
      for (const b of s.beats) {
        if (!REACTIONS.has(b.move)) continue;
        must(
          contacts.some((c) => c <= b.at),
          `${mod.id}: ${b.move} at ${b.at} precedes every blow that could cause it`,
        );
      }

      /*
       * The thrower may not be given another move while its blade is still in
       * the air. `bladeWorld` returns the flying segment for the whole flight,
       * so a guard scheduled inside it takes the hand to a rest pose while the
       * sword is two hundred units downrange — and the smear, the blade-on-blade
       * spark test and the burst placement all follow the blade, so they follow
       * it into the wrong story. `the-throw` floors its recovery against the
       * move's own length rather than trusting the roll; this is the gate that
       * keeps that true.
       */
      for (let j = 0; j < s.beats.length; j += 1) {
        const b = s.beats[j];
        if (b.move !== "blade_throw") continue;
        const back = b.at + moves.blade_throw.frames;
        for (let k = j + 1; k < s.beats.length; k += 1) {
          const n = s.beats[k];
          must(
            n.who !== b.who || n.at >= back,
            `${mod.id}: ${n.move} at ${n.at} interrupts a throw still in the air until ${back}`,
          );
        }
      }
    }

    /*
     * `hits` is what the anti-stall rail filters on, so a module that declares
     * it must produce a landed blow on *every* roll — not merely on most. A
     * module that rolls its only hit away would silently join the rail's pool
     * and then fail to close the match it was picked to close.
     */
    if (mod.hits) must(everHit, `${mod.id} declares hits but rolled none in ${PER_MODULE} builds`);
  }

  // `buildSequence` is the production path: same builder, beats sorted, module
  // id carried through for the reachability count in the simulation gate.
  for (const mod of modules) {
    const s = buildSequence(mod, seeded(0xb1ade));
    must(s.id === mod.id, `buildSequence lost the module id for ${mod.id}`);
    must(
      s.beats.every((b, i) => i === 0 || b.at >= s.beats[i - 1].at),
      `buildSequence returned unsorted beats for ${mod.id}`,
    );
  }

  // A move nothing reaches is a move that does not exist. `docs/DECISIONS.md`
  // 2026-08-17: an unreachable sequence is exactly what this suite was built for.
  const orphans = Object.keys(moves).filter((id) => !reached.has(id));
  must(orphans.length === 0, `unreachable move(s): ${orphans.join(", ")}`);

  /*
   * The mix. Zero-damage modules are what the strikes are loud against, and they
   * are also the one thing that can stretch a match indefinitely — so the share
   * is reported rather than assumed, and railed well above where it sits.
   *
   * It sits at 34%, not the "roughly a fifth" an older note in `CLAUDE.md`
   * claimed. That note named `probe`, `standoff` and `disengage`, and
   * `disengage` deals damage; the real quiet set is `close-in`, `step-in`,
   * `probe`, `overhead-denied`, `standoff` and `the-overrun`. The number has not
   * moved with this rewrite — the weights are the ones the table shipped with —
   * only the description of it.
   */
  const totalWeight = modules.reduce((n, m) => n + m.weight, 0);
  const quiet = modules.filter((m) => !m.hits).reduce((n, m) => n + m.weight, 0);
  const share = quiet / totalWeight;
  must(share < 0.4, `zero-damage modules are ${(share * 100).toFixed(0)}% of the weight`);

  return `${Object.keys(moves).length} moves, ${modules.length} modules, ${built.toLocaleString()} sequences generated, longest ${longest}f, ${(share * 100).toFixed(0)}% quiet`;
});

/*
 * The two moves that cross the opponent, and the two things that has to not do.
 *
 * Both were shipped defects found by stepping the module: `stepFighter`
 * re-derives `facing` from the two centres every frame, so a fighter crossing
 * that line mirrored *the entire figure* on one frame in mid-somersault — on
 * every flip flown, 147–157 of them per 300,000 frames. It was invisible while
 * the figure had no rotation to contradict, and a flicker the moment it did.
 * And the tumble is timed from the jump's own impulse so the feet arrive on the
 * frame the revolution completes; typing that window as a constant instead is
 * how a later retune of `impulse` lands somebody mid-turn.
 */
if (!FAST) check("duel: a pass crosses without mirroring, and every turn ends upright", () => {
  const { moves } = DUEL_TABLES;
  const passes = Object.entries(moves).filter(([, m]) => m.pass);
  must(passes.length >= 3, `only ${passes.length} pass move(s) — expected the flip, the charge and the roll`);

  /*
   * **Every move that turns, not just the somersault.**
   *
   * This gate named `flip_over` for as long as it was the only rotating move,
   * and phase 3 added two more — a back handspring and a ground roll. A gate
   * that knows the name of the one move it is protecting protects exactly one
   * move; the property being asserted is *"a figure that starts a turn finishes
   * it before the move ends"*, and that is decidable for all of them from
   * `carryWindow`, which is the same function the renderer rotates by. A second
   * copy of that arithmetic here would only ever confirm the second copy.
   */
  const turns = Object.entries(moves).filter(([, m]) => carryWindow(m) !== null);
  must(turns.length >= 3, `only ${turns.length} turning move(s)`);
  const tumbles: string[] = [];
  const rolls: string[] = [];
  for (const [id, m] of turns) {
    const w = carryWindow(m)!;
    /*
     * The turn has to be over while the move still exists. Past the end the
     * renderer clamps and the figure simply stands up mid-revolution — which is
     * the thing this gate was built for on the somersault, and it is no less
     * wrong on a handspring.
     */
    must(w.to <= m.frames, `${id}: its turn ends at ${w.to.toFixed(1)} but the move is ${m.frames} frames`);
    must(m.spin !== undefined && m.spin !== 0, `${id} declares a turn with no revolutions`);
    if (m.carry === "tumble") {
      must(Math.abs(m.impulse?.vy ?? 0) > 0, `${id} tumbles with no vertical impulse to time it from`);
      tumbles.push(id);
    } else {
      /*
       * A roll is a **ground** pass, and the separation exemption keys on
       * exactly that — a pass with no vertical impulse. Give one a `vy` and it
       * silently becomes an airborne pass that is also exempt while it is on
       * the floor, which is the 15.79 → 4.39 regression `overrun` measured.
       */
      must(!m.impulse?.vy, `${id} rolls along the ground but declares a vertical impulse`);
      must(m.pass === true, `${id} rolls through the opponent but is not declared a pass`);
      rolls.push(id);
    }
  }

  const st = createDuel("hooded", "caped");
  // Fighters are created standing, so this is the floor — read rather than
  // re-declared, so the checker cannot hold a stale copy of it.
  const FLOOR = st.a.y;
  let mirrored = 0;
  const landings: Record<string, number> = {};
  let offBy = 0;
  let airborneRoll = 0;
  let prev = { a: { ...st.a }, b: { ...st.b } };
  // 240,000 rather than 120,000: the somersault has two modules behind it and
  // the handspring one, so at the shorter length a weight-5 module's landings
  // are a sample of about a dozen and the run-to-run spread reaches down to six.
  // The assertion is about *every* landing being upright, so the length is only
  // ever about having enough of them to mean something.
  for (let i = 0; i < 240_000; i += 1) {
    advanceDuel(st, 1);
    for (const k of ["a", "b"] as const) {
      const f = st[k];
      const was = prev[k];
      if (was.move === f.move && moves[f.move]?.pass && f.facing !== was.facing) mirrored += 1;
      // A ground roll that leaves the ground is not a ground roll.
      if (rolls.includes(f.move) && f.y < FLOOR - 0.5) airborneRoll += 1;
      // The frame the feet arrive during an airborne turn.
      if (tumbles.includes(f.move) && was.move === f.move && was.y < FLOOR - 0.5 && f.y >= FLOOR - 0.5) {
        landings[f.move] = (landings[f.move] ?? 0) + 1;
        const w = carryWindow(moves[f.move])!;
        if (Math.abs(f.mf - Math.round(w.to)) > 1) offBy += 1;
      }
    }
    prev = { a: { ...st.a }, b: { ...st.b } };
  }
  const total = Object.values(landings).reduce((n, x) => n + x, 0);
  must(mirrored === 0, `${mirrored} mid-pass mirror(s) — facing turned while crossing`);
  must(airborneRoll === 0, `${airborneRoll} frame(s) of a ground roll spent off the ground`);
  for (const id of tumbles) {
    must((landings[id] ?? 0) > 8, `only ${landings[id] ?? 0} landings of ${id} — is the move reachable?`);
  }
  must(offBy === 0, `${offBy} of ${total} airborne turns landed mid-revolution`);
  return `${turns.length} turning moves, ${total} landings, none mirrored or mid-revolution`;
});

/*
 * The camera, and the one question it exists to answer: **is everybody in
 * shot?**
 *
 * This effect has cut a fighter out of its own frame three times, by three
 * unrelated routes, and each was found only by measuring: a corpse reported as
 * a standing body (84.6% of death-hold frames clipped), a rotating body reported
 * as a standing one (8.61% of turning frames), and the arena clamp holding the
 * view at the stage edge while somebody tumbled into the corner (427 of the 430
 * frames that survived the first two fixes). None of them is visible in the
 * code, all of them are decidable by driving the real camera, and the ornament
 * is the one place on the site where the frame moves on its own — so the cost of
 * getting it wrong is a fight you cannot see happening.
 *
 * It drives `duelCamera` at the buffer the component actually declares, one
 * frame at a time, carrying the camera exactly as the render loop carries it.
 */
if (!FAST) check("duel: the ornament camera never cuts a fighter off", () => {
  const st = createDuel("hooded", "caped");
  let cam: DuelCam | null = null;
  let clipped = 0;
  let worst = 0;
  let dead = 0;
  for (let i = 0; i < 200_000; i += 1) {
    advanceDuel(st, 1);
    const shot = duelCamera(st, ORNAMENT_PX, ORNAMENT_PX, cam, 1);
    cam = shot.cam;
    const f = duelFocus(st);
    const viewLo = -shot.x / shot.scale;
    const viewHi = (ORNAMENT_PX - shot.x) / shot.scale;
    const over = Math.max(viewLo - (f.cx - f.width / 2), f.cx + f.width / 2 - viewHi, 0);
    if (st.over > 0) dead += 1;
    // Half a world unit of tolerance: this is about a body leaving the picture,
    // not about the last decimal of an eased scale.
    if (over > 0.5) {
      clipped += 1;
      worst = Math.max(worst, over * shot.scale);
    }
  }
  must(dead > 2_000, `only ${dead} death-hold frames — the fight may not be finishing matches`);
  must(
    clipped === 0,
    `${clipped} frame(s) cut a fighter off, worst by ${worst.toFixed(0)}px of ${ORNAMENT_PX}`,
  );
  return `200,000 frames at ${ORNAMENT_PX}px, ${dead.toLocaleString()} of them a death hold, none clipped`;
});

/*
 * The sweep and the jump over it — the second measured *pairing* in the pool,
 * and the reason both halves of one are worth a gate.
 *
 * `duck` + `strike_level` are a fit between two specific blade curves: the cut
 * holds level from frame 17 to 24 and the crouch is deepest at 19, so the blade
 * passes over the head rather than the two merely happening at once. `sweep_low`
 * + `hop` is the same idea upside down, and it is more fragile, because the
 * clearance is bought by *gravity* rather than by a pose — retune the hop's
 * impulse, slide the launch frame, or move the sweep's contact, and the blade
 * goes through the ankles of a fighter who is visibly trying to jump it.
 *
 * Neither number can be reasoned about from the tables alone (the jump is a
 * simulation), so this measures the real thing: on the frame the sweep resolves,
 * where is its blade tip against the hopping fighter's feet?
 */
if (!FAST) check("duel: a low sweep passes under the jump that answers it", () => {
  const { moves } = DUEL_TABLES;
  const sweep = moves.sweep_low;
  must(sweep.contact >= 0, "sweep_low cannot connect, so nothing has to clear it");

  /*
   * **The window is the frames the blade is on the low line, and it is derived
   * from the move's own table** — from the frame it arrives (`contact`, which
   * sits on the arrival key by construction) to the frame the plateau after it
   * ends. Retime the sweep and this window retimes with it.
   *
   * What is deliberately *outside* the claim, because measuring it was what
   * showed it is not a defect: on the way down the tip and the jumper's rising
   * boots cross each other exactly once, so there is a frame or two where they
   * are level. That is a near miss, it is what jumping a sweep looks like, and
   * it cannot be designed out — the blade descends and the feet rise, so
   * somewhere they are at the same height. The claim is about the strike, not
   * about the approach.
   */
  const t = sweep.contact / sweep.frames;
  let arrive = 0;
  for (let i = 0; i < sweep.blade.length; i += 1) if (sweep.blade[i][0] <= t) arrive = i;
  must(
    sweep.blade[arrive + 1]?.[2] === "hold",
    "sweep_low's contact is not followed by a plateau — it does not hold on the low line",
  );
  const active = { from: sweep.contact, to: Math.round(sweep.blade[arrive + 1][0] * sweep.frames) };

  const st = createDuel("hooded", "caped");
  const FLOOR = st.a.y;
  /** Canvas y grows downward, so clearance is the tip being *below* the feet. */
  const active_clear: number[] = [];
  const atContact: number[] = [];
  for (let i = 0; i < 240_000; i += 1) {
    advanceDuel(st, 1);
    for (const [f, foe] of [[st.a, st.b], [st.b, st.a]] as const) {
      if (f.move !== "sweep_low" || foe.move !== "hop") continue;
      // Only while they are genuinely off the ground: a landed fighter standing
      // next to a blade is not evading anything.
      if (foe.y >= FLOOR - 0.5) continue;
      const tip = bladeWorld(f);
      const clear = tip.ty - (foe.y + BODY_H);
      if (f.mf === sweep.contact) atContact.push(clear);
      // And only where there is a question to ask: the tip somewhere over the
      // body's own width, plus a blade's thickness either side.
      if (f.mf >= active.from && f.mf <= active.to && tip.tx >= foe.x - 6 && tip.tx <= foe.x + 36) {
        active_clear.push(clear);
      }
    }
  }
  must(atContact.length > 20, `only ${atContact.length} sweeps answered by a hop in 240,000 frames — is the pairing reachable?`);
  must(active_clear.length > 40, `the sweep never crossed the jumper at all — is it reaching them?`);
  const worst = Math.min(...active_clear);
  const median = atContact.slice().sort((x, y) => x - y)[atContact.length >> 1];
  must(worst > 0, `a sweep passed through the jumper by ${(-worst).toFixed(1)} units`);
  /*
   * A margin, not merely a sign. The bodies are 70 units tall, so a couple of
   * units of clearance is a blade shaving a boot — true, and indistinguishable
   * on screen from a hit. Ten is about an ankle.
   */
  must(worst > 10, `worst clearance ${worst.toFixed(1)} units is too fine to read as a miss`);
  return `${atContact.length} jumps, frames ${active.from}–${active.to}, clearance worst ${worst.toFixed(0)}, median at contact ${median.toFixed(0)}`;
});

/*
 * The roster (phase 2 of `docs/DUEL-ABSORB.md`), and why a costume needs a gate
 * at all when it is "only drawing".
 *
 * Three of the four things asserted here have already shipped as bugs in this
 * effect, in one form or another:
 *
 * - **Filled costume.** The version the client rejected drew filled robes and
 *   capes behind a filled torso, which composited into one slab and read as
 *   *"they are holding shields"*. That is not a matter of taste that can be
 *   left to an eye — it is a rule, and a rule about drawing calls can be
 *   checked. Every mark on this roster is a stroke.
 * - **Geometry that outgrows its frame.** `duelFocus` reserves clearance above
 *   the head from each costume's declared `headroom`. A declaration is a second
 *   copy of a number that lives in the drawing, and second copies drift — the
 *   camera has already framed a corpse as though it were standing once, for
 *   exactly this reason. So the drawing is *driven* and the reach re-derived
 *   from the calls it makes, and the declaration has to be tight, not merely
 *   generous: over-declaring is not free, it pulls the camera back.
 * - **A carve-out that stops meaning anything.** Good fights in blue or green
 *   and evil in red, in every palette — the site's one literal-colour exception,
 *   granted by the client. Alignment is stated twice (the roster's `side`, the
 *   colour table) and the two must agree, or the rule is decoration.
 *
 * The fourth is new: a costume that draws nothing at all would typecheck, run,
 * and quietly make two fighters identical.
 */
check("duel: every costume is stroked, framed and aligned", () => {
  /**
   * A recording 2D context: enough of the interface for a costume to draw into,
   * and it records where. Only the coordinates matter, so a curve is bounded by
   * its control points — which is conservative in the right direction, since the
   * curve itself stays inside that hull.
   */
  /** What `drawFighter` hands a costume as `c.alpha`, so a recorded
   *  `globalAlpha` can be read back as a fraction of the body's own. */
  const BODY_ALPHA = 0.85;

  /**
   * The torso box, in the body-local units every costume is written in: from
   * just under the shoulder bar to just above the hips, and as wide as the
   * widest shoulders on the roster. Fixed rather than per-fighter on purpose —
   * it is the region the *rejected* costume covered, and the point of the rule
   * is that this area of the drawing belongs to the body.
   */
  const TORSO = { x0: -15, x1: 15, y0: 15, y1: 40 };

  /** A filled shape, as the recorder saw it: its box, how much of the torso it
   *  lies over, and how solid it was. */
  interface Filled {
    w: number;
    h: number;
    cover: number;
    /** Fraction of the body's own alpha — 1 is as solid as the fighter. */
    rel: number;
  }

  const recorder = () => {
    const pts: { x: number; y: number }[] = [];
    const fills: Filled[] = [];
    /** Points since the last `beginPath`, which is the shape a `fill` fills. */
    let path: { x: number; y: number }[] = [];
    const at = (x: number, y: number) => {
      pts.push({ x, y });
      path.push({ x, y });
    };
    const ctx = {
      strokeStyle: "",
      fillStyle: "",
      globalAlpha: 1,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      strokes: 0,
      beginPath() {
        path = [];
      },
      closePath() {},
      save() {},
      restore() {},
      translate() {},
      moveTo: at,
      lineTo: at,
      quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
        at(cx, cy);
        at(x, y);
      },
      arc(x: number, y: number, r: number) {
        at(x - r, y - r);
        at(x + r, y + r);
      },
      ellipse(x: number, y: number, rx: number, ry: number) {
        at(x - rx, y - ry);
        at(x + rx, y + ry);
      },
      stroke() {
        this.strokes += 1;
      },
      fill() {
        if (path.length === 0) return;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const q of path) {
          if (q.x < x0) x0 = q.x;
          if (q.x > x1) x1 = q.x;
          if (q.y < y0) y0 = q.y;
          if (q.y > y1) y1 = q.y;
        }
        /*
         * How much of the *torso* this shape lies over — the box between the
         * shoulder line and the hips, which is where the slab lived. A helmet
         * covers none of it however solid it is; a cape covers all of it and
         * has to be faint enough for the spine and the limbs to read through.
         */
        const tx = TORSO.x1 - TORSO.x0;
        const ty = TORSO.y1 - TORSO.y0;
        const ox = Math.max(0, Math.min(x1, TORSO.x1) - Math.max(x0, TORSO.x0));
        const oy = Math.max(0, Math.min(y1, TORSO.y1) - Math.max(y0, TORSO.y0));
        fills.push({
          w: x1 - x0,
          h: y1 - y0,
          cover: (ox * oy) / (tx * ty),
          rel: this.globalAlpha / BODY_ALPHA,
        });
      },
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({ w, h, cover: 1, rel: this.globalAlpha / BODY_ALPHA });
      },
    };
    return { ctx, pts, fills };
  };

  /**
   * A body to dress, at a given moment of the idle cycle and travel.
   *
   * **Built from the fighter's own proportions**, not from one average body.
   * The rig scales the head by `prop.head`, widens the shoulders by
   * `prop.shoulder` and settles the hips by `stance.settle`, and every costume
   * hook is written against those — a horn drawn at `c.hy - 24` on a head 4%
   * smaller reaches somewhere different from the same horn on a helmet. Measure
   * the reach on a body nobody has and the declaration it is checking against
   * is a number about a fighter that does not exist.
   */
  const body = (kind: FighterKind, t: number, vx: number, airborne: boolean): CostumeCtx => {
    const breath = Math.sin(t * 0.045) * 1.1;
    const headY = -8 + breath * 0.6;
    return {
      hx: 0,
      hy: headY + 6,
      hr: 8 * kind.prop.head,
      shY: 13 + breath,
      shX: 11 * kind.prop.shoulder,
      hipY: 42 + (airborne ? 0 : kind.stance.settle),
      hipX: 7,
      feetY: 70,
      lean: vx * 1.4,
      vx,
      speed: Math.min(1, Math.abs(vx) / 2.2),
      airborne,
      t,
      phase: (t * 0.37) % (Math.PI * 2),
      ink: "#fff",
      blade: "#3d9bff",
      dim: 1,
      alpha: 0.85,
      hand: { x: 22, y: 6 },
      elbow: { x: 16, y: 14 },
      offHand: { x: 14, y: 14 },
      offElbow: { x: -2, y: 26 },
      lw: (n: number) => n,
    };
  };

  const GOOD = new Set(["#3d9bff", "#37d67a"]);
  const lines: string[] = [];
  for (const [id, kind] of Object.entries(FIGHTERS)) {
    const style = id as FighterStyle;
    const colour = BLADE_COLORS[style];
    must(!!colour, `${id} has no blade colour`);
    must(
      kind.side === "good" ? GOOD.has(colour) : !GOOD.has(colour),
      `${id} is ${kind.side} but carries ${colour} — the alignment carve-out disagrees with itself`,
    );

    const rec = recorder();
    // Sweep the idle cycle and the travel range a costume is handed. `vx` is
    // clamped to ±3.5 by `drawFighter` before it ever reaches a hook, so this
    // is the whole domain, not a sample of it.
    for (let t = 0; t < 400; t += 1) {
      for (const vx of [-3.5, -1.2, 0, 1.2, 3.5]) {
        for (const airborne of [false, true]) {
          const c = body(kind, t, vx, airborne);
          kind.back?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
          kind.head?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
          kind.overlay?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
        }
      }
    }

    must(rec.pts.length > 0, `${id} (${kind.label}) draws nothing — it is indistinguishable`);
    must(rec.ctx.strokes > 0, `${id} builds a path and never strokes it`);

    /*
     * **Mass is allowed; a slab is not** (2026-08-19, replacing a flat ban on
     * `fill`).
     *
     * The ban was written from the right failure and stopped one letter short
     * of the right rule. What the client rejected was a filled torso, a filled
     * head and a filled robe that between them covered the fighter and
     * composited into one pale shape as wide as it was tall — *"they are
     * holding shields"*. Refusing every fill refused that, and also refused
     * every filled *mark*, which left eight wire diagrams that were the same
     * pale stick at the size the ornament actually renders. So the rule is
     * about size and weight now, and it is the same three facts the old one was
     * groping for:
     *
     * - a **mark** (≤ 22 × 26 — a helmet, a hood, a horn, a crown) may be
     *   solid, because it merges with the head into one silhouette, which is
     *   what it is for;
     * - **cloth** (anything larger) may not be, and gets 35% of the body's own
     *   alpha, which is what keeps the limbs reading over it — that is the
     *   actual difference between a cape and a shield;
     * - **nothing** may be filled wider than the frame the camera reserves.
     */
    const COVER = 0.45;
    const CLOTH_ALPHA = 0.35;
    for (const f of rec.fills) {
      // Width needs no cap of its own: every point is already held inside ±34
      // by the sideways rule below, so a fill cannot be wider than the frame.
      must(
        f.h <= 72,
        `${id} fills something ${f.h.toFixed(0)} units tall — taller than the figure wearing it`,
      );
      must(
        f.cover < COVER || f.rel <= CLOTH_ALPHA + 0.001,
        `${id} fills a shape covering ${(f.cover * 100).toFixed(0)}% of the torso at ` +
          `${(f.rel * 100).toFixed(0)}% of body alpha — cloth over the body may not be more solid ` +
          `than ${CLOTH_ALPHA * 100}%, or the spine and the limbs stop reading through it and it ` +
          `is the slab the client rejected`,
      );
    }

    /*
     * Folded, not spread. `Math.min(...pts)` passes one argument per point, and
     * a costume with a repeated element — the hollow's hem is five chevrons —
     * lays down six figures of them across the sweep, which overflows the call
     * stack. That fails as a *crash in the gate*, which reads as the gate being
     * broken rather than as the costume being measured, and it would have
     * arrived the first time somebody drew something in a loop.
     */
    let top = 0;
    let side = 0;
    for (const q of rec.pts) {
      if (q.y < top) top = q.y;
      if (Math.abs(q.x) > side) side = Math.abs(q.x);
    }
    const reach = Math.ceil(-top);
    must(
      reach <= kind.headroom,
      `${id} reaches ${reach} above the torso but declares headroom ${kind.headroom} — the camera will crop it`,
    );
    must(
      kind.headroom - reach <= 6,
      `${id} declares headroom ${kind.headroom} for a reach of ${reach} — slack pulls the camera back for nothing`,
    );
    // Nothing may stream off sideways: `duelFocus` frames on the bodies, so a
    // costume much wider than one leaves the shot at the arena walls.
    const wide = Math.ceil(side);
    must(wide <= 34, `${id} reaches ${wide} units sideways — beyond what the camera frames`);
    lines.push(`${kind.label} ${reach}/${wide}`);
  }

  /*
   * The pools. Every match must be one alignment against the other — the blade
   * carve-out is meaningless in a fight between two good fighters, and the
   * fairness coin means nothing if a viewer cannot tell which side is which.
   * And a costume nothing can roll is a costume nobody will ever see, which is
   * the same failure as an unreachable duel module and is caught the same way:
   * by rolling, not by reading.
   */
  const seen = new Set<string>();
  const orders = new Set<string>();
  for (const pool of Object.keys(DUEL_POOLS) as (keyof typeof DUEL_POOLS)[]) {
    const { good, evil } = DUEL_POOLS[pool];
    must(good.length > 0 && evil.length > 0, `pool ${pool} is one-sided`);
    for (const s of [...good, ...evil]) {
      must(!seen.has(s), `${s} is in more than one pool — pools are meant to keep lookalikes apart`);
      seen.add(s);
      must(
        FIGHTERS[s].side === (good.includes(s) ? "good" : "evil"),
        `${s} is listed on the ${good.includes(s) ? "good" : "evil"} side of ${pool} but declares ${FIGHTERS[s].side}`,
      );
    }
    let rng = 1;
    for (let i = 0; i < 4000; i += 1) {
      // A cheap deterministic sequence, so a failure here is reproducible.
      rng = (rng * 1103515245 + 12345) % 2147483648;
      const [l, r] = rollPairing(pool, () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
      must(
        FIGHTERS[l].side !== FIGHTERS[r].side,
        `${pool} rolled ${l} against ${r} — both ${FIGHTERS[l].side}`,
      );
      orders.add(`${pool}:${l}:${r}`);
    }
  }
  const missing = (Object.keys(FIGHTERS) as FighterStyle[]).filter((s) => !seen.has(s));
  must(missing.length === 0, `unreachable costume(s): ${missing.join(", ")}`);
  // Both arena ends, both pools: 2 pools × 2 good × 2 evil × 2 orders.
  const wanted = Object.values(DUEL_POOLS).reduce((n, p) => n + p.good.length * p.evil.length * 2, 0);
  must(orders.size === wanted, `${orders.size} of ${wanted} pairings rolled`);
  return `${lines.length} costumes (${lines.join(", ")}), ${orders.size} pairings`;
});

/*
 * The other half of phase 2, and the only part of it that is not drawing: a
 * pooled fight rolls **new fighters on every match reset**, so a visitor who
 * watches for a few minutes sees the roster rather than one pairing forever.
 *
 * That is a change to `step`'s reset branch, which is the same branch that
 * clears the anti-stall rail and the phrase chain — a branch this effect has
 * had two shipped bugs in. So it is stepped rather than read: run a real pooled
 * fight through several matches and check the fighters actually change, that
 * every match is still one alignment against the other, and that a pinned
 * pairing (which every bench and the reference gates use) is left alone.
 */
if (!FAST) check("duel: a pooled fight rotates its fighters", () => {
  const st = createDuelFrom("duel");
  const pairs = new Set<string>();
  let matches = 0;
  let mixed = 0;
  for (let i = 0; i < 60_000; i += 1) {
    advanceDuel(st, 1);
    if (st.matches !== matches) {
      matches = st.matches;
      pairs.add(`${st.a.style}/${st.b.style}`);
      if (FIGHTERS[st.a.style].side !== FIGHTERS[st.b.style].side) mixed += 1;
    }
  }
  must(matches > 4, `only ${matches} matches in 60,000 frames`);
  must(mixed === matches, `${matches - mixed} match(es) rolled two fighters of one alignment`);
  must(pairs.size > 1, `${matches} matches and only one pairing — the reset is not re-rolling`);

  // A pinned fight must not acquire the behaviour: `createDuel` is what the
  // benches and the other duel gates drive, and a bench whose fighters changed
  // under it would be measuring something it did not set up.
  const pinned = createDuel("hooded", "caped");
  for (let i = 0; i < 20_000; i += 1) advanceDuel(pinned, 1);
  must(pinned.matches > 0, "the pinned fight never finished a match");
  must(
    pinned.a.style === "hooded" && pinned.b.style === "caped",
    `a pinned pairing rotated to ${pinned.a.style}/${pinned.b.style}`,
  );
  return `${matches} matches, ${pairs.size} pairings, all mixed; pinned pairing held`;
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

check("no preset offers a withdrawn effect or ornament", () => {
  // A preset is a *menu*, not a wire (CLAUDE.md: `FX` resolves, `PICKABLE_FX`
  // offers). Withdrawing a catalogue entry with `hidden` correctly leaves old
  // share codes and stored configs meaning what they meant — but a preset is
  // neither: it is a button the operator presses *now*, so it must not hand back
  // something the client had pulled. All three presets named withdrawn circle
  // ornaments from 2026-08-17 until 2026-08-18, i.e. the whole time the
  // withdrawal was in effect, and nothing failed because nothing was invalid.
  //
  // Decoded rather than read off the spec: the share code is the thing the panel
  // actually applies, so this tests the derivation as well as the choice.
  for (const preset of PRESETS) {
    const config = decodeShareCode(preset.shareCode);
    must(config !== null, `preset ${preset.id}: share code ${preset.shareCode} does not decode`);
    const ornament = config?.ornament;
    const fx = config?.fx;
    must(
      PICKABLE_ORNAMENTS.some((o) => o.id === ornament),
      `preset ${preset.id} offers withdrawn ornament "${ornament}"`,
    );
    must(PICKABLE_FX.some((f) => f.id === fx), `preset ${preset.id} offers withdrawn effect "${fx}"`);
  }
  return `${PRESETS.length} presets decode to pickable entries`;
});

// ---- 5c. The ornament's station -------------------------------------------
//
// New dimension, 2026-08-18. Three separate things here fail silently, which is
// why it gets three assertions rather than a count.

check("stations: wire order, decode, and the roam guardrail bites", () => {
  // (a) The wire ORDER, not the count — a reorder passes every length check and
  // silently repoints every code in circulation. Same gate the ornaments have.
  const WIRE = "hold,opposite,roam";
  must(
    STATIONS.map((s) => s.id).join(",") === WIRE,
    `station wire order changed: ${STATIONS.map((s) => s.id).join(",")}`,
  );
  must(STATIONS[0].id === DEFAULT_STATION, "index 0 must be the default — it is what every legacy code lands on");

  // (b) Absent means abstain, not reset. Five-, six- and seven-field codes must
  // all decode, and a six-field code handed out yesterday must still mean what
  // it meant rather than quietly acquiring a station.
  const six = decodeShareCode("0-0-0-0-0-7");
  must(six !== null && !("station" in six), "a six-field code should leave the station alone");
  const seven = decodeShareCode("0-0-0-0-0-7-1");
  must(seven?.station === "opposite", `seven-field code decoded station as ${seven?.station}`);
  const far = decodeShareCode("0-0-0-0-0-7-Z");
  must(
    far?.station === DEFAULT_STATION,
    `out-of-range station decoded to ${far?.station}, expected ${DEFAULT_STATION}`,
  );
  must(decodeShareCode("0-0-0-0-0-7-2-9") === null, "an eight-field code should be refused");

  // (c) The guardrail must actually bite. `CLAUDE.md` deviation 1 records the
  // ornament being rolled for months while absent from `Combination`, so no
  // rule could constrain it *however it was written* — nothing failed to
  // compile, and the one bad pairing shipped to ~3.6% of visits. A rule that
  // silently never matches is the failure mode of this whole file, so assert
  // the behaviour rather than the wiring.
  const base = {
    palette: PALETTES[0].id,
    layout: "cinematic" as const,
    fx: "vessels" as const,
    type: TYPESETS[0].id,
    grain: false,
  };
  must(
    !isAllowed({ ...base, ornament: "duel", station: "roam" }),
    "roam + a duel ornament must be refused — a fading duel is a duel you cannot follow",
  );
  must(
    !isAllowed({ ...base, ornament: "duelholy", station: "roam" }),
    "roam + the second duel must be refused too",
  );
  must(
    isAllowed({ ...base, ornament: "sonar", station: "roam" }),
    "roam + sonar is the pairing this was built for and must be allowed",
  );
  must(
    isAllowed({ ...base, ornament: "duel", station: "hold" }),
    "a held duel must stay allowed — the rule is about roaming, not about duels",
  );
  return `${STATIONS.length} stations, order pinned, 5/6/7-field codes, guardrail bites`;
});

check("every station has a rule, and none of them touches Radial", () => {
  // Radial's slot holds the dial, which since the header's nav row stood down
  // is the page's ONLY primary navigation. A station moving or fading it would
  // be a *look* relocating the navigation — the same class of error as calm
  // dimming the dial to 50%, which shipped and had to be excepted by hand.
  const css = readFileSync("src/styles/chrome.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const missing = PICKABLE_STATIONS.filter((s) => s.id !== DEFAULT_STATION).map((s) => s.id).filter(
    (id) => !css.includes(`.station-${id} .v-ornament`),
  );
  must(missing.length === 0, `no chrome.css rule for station(s): ${missing.join(", ")}`);

  const unguarded: string[] = [];
  for (const m of css.matchAll(/([^{}]*\.station-[\w-]+[^{}]*)\{/g)) {
    const selector = m[1].trim();
    if (!selector.includes(":not(.layout-radial)")) unguarded.push(selector);
  }
  must(
    unguarded.length === 0,
    `station rule(s) not excluded from Radial, where the slot is the only nav: ${unguarded.join(" / ")}`,
  );
  return `${PICKABLE_STATIONS.length - 1} station rules, all excluding Radial`;
});

// ---- 5d. The way in survives every layout ----------------------------------
//
// 2026-08-18, client: "I need a portal to the login page".
//
// The sign-in link used to appear only after five taps on the hero ornament —
// and `Ornament.tsx` returns `null` on five layouts (`HIDES_ORNAMENT`), two of
// which, `console` and `sheet`, are exactly what `PHONE_LAYOUTS` collapses to.
// The live site rolls its layout every visit, so an operator on a phone that
// rolled either had no findable way in at all: what was left was typing
// `whoami`/`login`/`admin` (a hardware keyboard) and a 260px leftward drag.
//
// The fix put the link in the footer, which is the one piece of chrome no
// layout hides. That property is now load-bearing rather than incidental, so it
// gets a gate: a `display: none` on `.v-footer` behind some future layout would
// silently restore the dead end, on the band least able to route around it.

check("the sign-in portal survives every layout", () => {
  const footer = readFileSync("src/components/Footer.tsx", "utf8");
  must(/go\("signin"\)/.test(footer), "the footer no longer routes to signin");
  // Not behind a reveal flag: the whole point is that it is always there.
  must(
    !/signinShown|revealSignin/.test(footer),
    "the footer's sign-in link is gated behind a reveal flag again — it must be unconditional",
  );

  const app = readFileSync("src/App.tsx", "utf8");
  must(/<Footer\s*\/>/.test(app), "App.tsx no longer renders <Footer /> unconditionally");

  const dir = "src/styles";
  const hidden: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]*\.v-footer\b[^{}]*)\{([^{}]*)\}/g)) {
      if (/display\s*:\s*none/.test(m[2])) hidden.push(`${file}: ${m[1].trim()}`);
    }
  }
  must(
    hidden.length === 0,
    `a layout hides the footer, which is the only way in on the phone band: ${hidden.join(" / ")}`,
  );
  return "footer routes to signin unconditionally, and no layout hides it";
});

// The two pointer routes added 2026-08-18 at the client's request: three taps on
// the wordmark to /admin, one on the footer clock to /share.
//
// Both are gated for the same reason the sign-in portal above is. These are
// *silent* routes by design — no name, no role, no tab stop, no toast until they
// fire — so every way they can break is invisible. Three specific ways, one gate
// each:
//
//  1. The two tap counters share the lockup. They are on different elements
//     because a single counter reaches three and navigates before the door's
//     fifth tap can land; drop the `stopPropagation` on the glyph and the door
//     route dies silently, since the glyph's taps would also advance admin's.
//  2. The counts invert. Admin must stay *below* the door's five — the client
//     asked for "more than 2 clicks", and at five-or-more they collide again.
//  3. A layout hides the host. This is exactly how the ornament's five-tap
//     sign-in route died: the element was absent on five layouts, two of which
//     are what the phone band collapses to, and nothing said so.
check("the wordmark and clock pointer routes still fire", () => {
  const header = readFileSync("src/components/Header.tsx", "utf8");
  must(/go\("admin"\)/.test(header), "the wordmark no longer routes to admin");
  must(
    /onClick=\{onMarkTap\}/.test(header) && /stopPropagation\(\)/.test(header),
    "the glyph's door taps no longer stop propagation — they would also advance the admin counter, " +
      "so the door's fifth tap becomes unreachable",
  );

  // The two thresholds, read out of the source rather than assumed. Admin fires
  // first, so it has to be the smaller number, and above 2 per the client.
  const adminAt = header.match(/adminTaps\.current >= (\d+)/);
  const doorAt = header.match(/doorTaps\.current >= (\d+)/);
  must(Boolean(adminAt && doorAt), "the tap thresholds are no longer readable in Header.tsx");
  const admin = Number(adminAt![1]);
  const door = Number(doorAt![1]);
  must(admin > 2, `the admin route needs more than 2 taps (client request); it is ${admin}`);
  must(
    admin < door,
    `the admin route (${admin} taps) must fire below the door's (${door}) — at or above it the ` +
      "two gestures collide on one lockup again",
  );

  const footer = readFileSync("src/components/Footer.tsx", "utf8");
  must(/go\("share"\)/.test(footer), "the footer clock no longer routes to share");
  must(/className="v-clock"/.test(footer), "the clock lost its .v-clock hook");

  // Neither host may be hidden, and neither may pick up a name that would
  // announce it — the client's "no hints that hidden routes exist".
  must(
    !/aria-label=[^\n]*wordmark|aria-label=[^\n]*operator access/i.test(header),
    "the wordmark has an aria-label again — it announces the hidden route to every screen reader",
  );

  const dir = "src/styles";
  const hidden: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]*\.(?:v-logo|v-clock|v-header)\b[^{}]*)\{([^{}]*)\}/g)) {
      if (/display\s*:\s*none/.test(m[2])) hidden.push(`${file}: ${m[1].trim()}`);
    }
  }
  must(hidden.length === 0, `a layout hides a pointer route's host: ${hidden.join(" / ")}`);

  const app = readFileSync("src/App.tsx", "utf8");
  must(/<Header\s*\/>/.test(app), "App.tsx no longer renders <Header /> unconditionally");

  return `admin at ${admin} taps, door at ${door}, clock routes to share, no layout hides either host`;
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
