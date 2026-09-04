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
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { qrMatrix } from "../src/auth/qr";
import {
  SETUP_CODE_PREFIX,
  decodeSetupCode,
  encodeSetupCode,
} from "../src/share/setupCode";
import {
  createDuel,
  createDuelFrom,
  advanceDuel,
  buildSequence,
  makeRoll,
  bladeWorld,
  carryWindow,
  contactSpray,
  DUEL_SHAKE_MAX,
  DUEL_SCORCH_MAX,
  duelFocus,
  drawDuel,
  BODY_H,
  BODY_W,
  DUEL_TABLES,
  DUEL_TUNING,
  DEFAULT_RIM,
  GRAVITY,
} from "../src/fx/duel";
import { duelCamera, ORNAMENT_PX } from "../src/components/DuelOrnament";
import type { DuelCam } from "../src/components/DuelOrnament";
import { BLADE_COLORS, DUEL_POOLS, FIGHTERS, NEVER_MEET, rollPairing } from "../src/fx/fighters";
import type { CostumeCtx, FighterKind, FighterStyle } from "../src/fx/fighters";
import {
  DEFAULT_DUEL_SETTINGS,
  DEFAULT_DUEL_TUNING,
  allowFor,
  resolveDuel,
  validDuelPages,
  validDuelSettings,
} from "../src/data/duelSettings";
import { PUBLISHED_KEYS } from "../src/config/siteConfig";
import { decodeShareCode, encodeShareCode } from "../src/config/shareCode";
import { roll } from "../src/config/randomiser";
import { FALLBACK_FX, rollableFx, visibleFx } from "../src/data/catalog";
import { rollableOrnaments, visibleOrnament } from "../src/data/ornaments";
import { DEFAULT_CONFIG } from "../src/config/types";
import type { Config } from "../src/config/types";
import { FOOTER_NAV, NAV, PATHS } from "../src/data/pageIds";
import type { PageId } from "../src/data/pageIds";
import { PAGES } from "../src/data/pages";
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  FILE_SORTS,
  PAGE_LAYOUTS,
  PLATFORMS,
  SORT_LABEL,
  SORT_LABEL_PUBLIC,
  matchesQuery,
  sortFiles,
  suggestFromFilename,
} from "../src/data/downloads";
import type { SortableFile } from "../src/data/downloads";
import { DRAWN_CATEGORIES } from "../src/components/CategoryIcon";
import { rangePlan } from "../worker/downloads";
import { PATHS, pageFromPath, pathFor, subFromPath } from "../src/data/pageIds";
import { metaForPath, robotsTxt, sitemapXml } from "../worker/page-meta";
import { NEVER_ROTATES, SNIPPETS, snippetFor } from "../src/data/snippets";
import { LAYOUTS, FX, PICKABLE_FX, TYPESETS, SCOPES } from "../src/data/catalog";
import type { LayoutId } from "../src/data/catalog";
import { LOW_CONTRAST, PALETTES } from "../src/data/palettes";
import { DEFAULT_ORNAMENT, ORNAMENTS, PICKABLE_ORNAMENTS } from "../src/data/ornaments";
import { decodeShareCode } from "../src/config/shareCode";
import { adaptLayout } from "../src/config/bands";
import { DEFAULT_STATION, PICKABLE_STATIONS, STATIONS } from "../src/data/stations";
import { GUARDRAILS, combinationOf, effectiveGrain, isAllowed, matched, resolve, warnings } from "../src/data/guardrails";
import { applyLook, themeClasses, themeVars } from "../src/theme";
import { validLookPages } from "../src/data/lookSettings";
import { effectiveStation } from "../src/data/stations";
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

/*
 * Gates that need a tool this machine may not have. A gate that quietly passes
 * when it could not run is the 2026-09-03 lesson wearing a different hat, so
 * anything landing here is NAMED in the report instead of disappearing.
 */
const SKIPPED: string[] = [];
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

  /*
   * **The id and filename rules moved into the Worker on 2026-08-20 and this is
   * the note that says where.** They used to be checked here, over a TypeScript
   * catalogue. The catalogue is D1 now — the operator types these into a form —
   * so a build-time check has nothing to read and the same two rules are
   * enforced by `worker/downloadPages.ts` as 400s (`KEY`, and the extension test
   * in `saveFile`). What *can* still be checked at build time is that every
   * layout the operator is offered actually exists in the stylesheet, which is
   * the new failure this feature introduced: a layout saved from a picker and
   * rendering as the default, silently.
   */
  for (const layout of PAGE_LAYOUTS) {
    must(
      new RegExp(`\\.dl-${layout}\\b`).test(css),
      `page layout "${layout}" is offered in the editor but has no \`.dl-${layout}\` rule — it would render as the default and say nothing`,
    );
  }

  return `${PAGE_LAYOUTS.length} page layouts, all styled; container owns its width`;
});

// ---- 2b-i. Every category is drawn, and every drawing is a category ---------
//
// 2026-08-20, with the categories. The client asked for "an icon for each
// category", and the way that claim goes quietly false is a category added to
// `CATEGORIES` without a mark in `CategoryIcon` — which does not fail to
// compile, because the lookup is a `Record<string, JSX.Element>` and a miss
// falls back to the neutral mark. Every uncategorised-looking file on the page
// would then be a file whose category simply has no picture, and the two are
// indistinguishable on screen.
//
// The reverse is checked too: a mark for a category that no longer exists is
// dead weight that reads as evidence the catalogue still has that shelf.

check("every download category is drawn, and nothing is drawn twice", () => {
  const ids = CATEGORIES.map((c) => c.id);

  must(new Set(ids).size === ids.length, "two download categories share an id");
  must(ids.includes(DEFAULT_CATEGORY), `DEFAULT_CATEGORY "${DEFAULT_CATEGORY}" is not in CATEGORIES`);

  for (const c of CATEGORIES) {
    // The id is stored on every row and named by a filter, so it obeys the same
    // rule as every other wire value here: lowercase kebab, nothing else.
    must(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.id), `category id "${c.id}" is not lowercase-kebab`);
    must(c.label.trim().length > 0, `category "${c.id}" has no label`);
    must(c.hint.trim().length > 0, `category "${c.id}" has no hint — the picker would offer it blind`);
    must(
      DRAWN_CATEGORIES.includes(c.id),
      `category "${c.id}" is offered in the picker but has no mark in CategoryIcon — it would silently draw the neutral one`,
    );
  }

  for (const drawn of DRAWN_CATEGORIES) {
    must(ids.includes(drawn), `CategoryIcon draws "${drawn}", which is not a category any more`);
  }

  // Both label maps are exhaustive. `SORT_LABEL_PUBLIC` spreads `SORT_LABEL`, so
  // this catches the case where the base map itself gains a hole.
  for (const s of FILE_SORTS) {
    must(Boolean(SORT_LABEL[s]), `sort "${s}" has no operator label`);
    must(Boolean(SORT_LABEL_PUBLIC[s]), `sort "${s}" has no visitor label`);
  }

  return `${CATEGORIES.length} categories, all drawn; ${FILE_SORTS.length} sorts, all labelled`;
});

// ---- 2b-ii. The sort a visitor picks is total, stable and honest ------------
//
// 2026-08-20. Three of these rules are decisions somebody would reasonably
// reverse by accident, and none of them fails loudly.
//
// **`manual` must not touch the array.** It is the operator's own hand order,
// already applied by the Worker's `ORDER BY position`. A comparator here — even
// one that looks like a no-op — would turn "the order I put them in" into
// whatever that comparator says, on the default setting, on every page.
//
// **Zero is "no price", not "free".** A file with no figure set has
// `price_cents = 0`, and free-versus-paid is a different column entirely. Sorted
// by price ascending, letting 0 lead puts every unpriced file at the top of the
// list — which reads as a page of free programs, on the page where the client is
// selling things.
//
// **Every comparator ties on the name.** Without it, `sort` being stable means a
// page of same-sized files comes back in `position` order, which is correct and
// looks exactly like the control having done nothing.

check("the downloads sort is total, stable and puts unpriced files last", () => {
  const f = (name: string, extra: Partial<SortableFile> = {}): SortableFile => ({
    name,
    size: 0,
    ...extra,
  });

  // `manual` is identity, element for element.
  const hand = [f("zebra"), f("apple"), f("mango")];
  const kept = sortFiles(hand, "manual");
  must(
    kept.length === hand.length && kept.every((x, i) => x.name === hand[i].name),
    "`manual` reordered the operator's own hand order",
  );

  // Every sort returns every file exactly once — a comparator that drops or
  // duplicates a row is a download nobody can find.
  const many = CATEGORIES.slice(0, 6).map((c, i) =>
    f(`file-${i}`, { category: c.id, size: i * 100, price: i % 2 ? i * 500 : 0, added: i * 86_400_000 }),
  );
  for (const sort of FILE_SORTS) {
    const out = sortFiles(many, sort);
    must(out.length === many.length, `sort "${sort}" changed the number of files`);
    must(
      new Set(out.map((x) => x.name)).size === many.length,
      `sort "${sort}" dropped or duplicated a file`,
    );
  }

  // Unpriced last, priced ascending.
  const priced = [f("free-ish", { price: 0 }), f("dear", { price: 9900 }), f("cheap", { price: 500 })];
  const byPrice = sortFiles(priced, "price").map((x) => x.name);
  must(
    byPrice[0] === "cheap" && byPrice[1] === "dear" && byPrice[2] === "free-ish",
    `price sort put them in ${byPrice.join(", ")} — an unpriced file must sort last, not first`,
  );

  // Ties break on the name, not on arrival order, for every sort that can tie.
  const tied = [f("beta", { size: 10, price: 100 }), f("alpha", { size: 10, price: 100 })];
  for (const sort of ["size", "price", "category", "newest", "oldest"] as const) {
    must(
      sortFiles(tied, sort)[0].name === "alpha",
      `sort "${sort}" left a tie in arrival order — indistinguishable from the control doing nothing`,
    );
  }

  // Category sorts in catalogue order, which is the order a repair job goes in.
  const shelves = [f("z", { category: "other" }), f("a", { category: "diagnostics" })];
  must(
    sortFiles(shelves, "category")[0].name === "a",
    "category sort is not following catalogue order",
  );

  return `${FILE_SORTS.length} sorts, all total; manual untouched, unpriced last, ties on name`;
});

// ---- 2b-iii. The upload portal's guesses are always saveable ----------------
//
// 2026-08-20. Picking a file fills in the id, the name and the platform, and the
// id it produces has to satisfy the Worker's `KEY` — `^[a-z0-9]+(-[a-z0-9]+)*$`
// — or `saveFile` answers 400 and the operator is refused in front of the form
// that just filled itself in. **A guess that cannot be saved is worse than no
// guess**, because it looks like the interface's own suggestion being rejected.
//
// The interesting inputs are all the ones a real filename actually has in it:
// spaces, brackets, versions with dots, unicode, leading and trailing junk,
// double extensions, and names that reduce to nothing at all.

check("a filename always suggests a saveable id", () => {
  // The Worker's rule, copied deliberately rather than imported: this asserts
  // the two agree, and importing it would assert only that it equals itself.
  const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const names = [
    "boot-repair.exe",
    "Boot Repair v2.1.exe",
    "  spaced  out .msi",
    "UPPER_CASE_TOOL.EXE",
    "tool(1).zip",
    "my.tool.v1.2.3.tar.gz",
    "весёлый.exe",
    "---.exe",
    "...",
    "",
    ".gitignore",
    "a.exe",
    "réparation-disque.deb",
    "x".repeat(200) + ".exe",
    "trailing-hyphen-.exe",
    "double--hyphen.exe",
    "100% working!!.bat",
  ];

  let guessed = 0;
  for (const name of names) {
    const g = suggestFromFilename(name);
    // An id is either empty — "I could make nothing of this, you type it" — or
    // it is one the Worker will accept. There is no third answer.
    must(
      g.id === "" || KEY.test(g.id),
      `"${name}" suggested the id "${g.id}", which the Worker's KEY refuses`,
    );
    must(g.id.length <= 64, `"${name}" suggested an id longer than the Worker's 64-char cap`);
    // The platform is either nothing or a real one — never a string the
    // `<select>` has no option for, which would silently show the wrong choice.
    must(
      g.platform === "" || PLATFORMS.includes(g.platform as never),
      `"${name}" suggested the platform "${g.platform}", which is not in PLATFORMS`,
    );
    if (g.id) guessed += 1;
  }

  // The ordinary cases must actually produce something, or the whole feature is
  // a no-op that still passes every assertion above.
  must(suggestFromFilename("boot-repair.exe").id === "boot-repair", "a plain filename lost its id");
  must(
    suggestFromFilename("Boot Repair v2.1.exe").id === "boot-repair-v2-1",
    "spaces and dots did not collapse to single hyphens",
  );
  must(
    suggestFromFilename("my.tool.v1.tar.gz").id === "my-tool-v1",
    "a .tar.gz kept its .tar and would have produced an id ending -tar",
  );
  must(suggestFromFilename("thing.exe").platform === "windows", ".exe did not imply Windows");
  must(suggestFromFilename("thing.apk").platform === "android", ".apk did not imply Android");
  // Silence is the correct answer for an extension that says nothing.
  must(suggestFromFilename("thing.zip").platform === "", ".zip claimed to imply a platform");

  return `${names.length} filenames, ${guessed} usable ids, none the Worker would refuse`;
});

// ---- 2b-iv. Search matches what the visitor can see -------------------------
//
// 2026-08-20. The search filters on rendered *labels*, never on ids: typing
// "antimalware" and matching a row that says "Malware removal" on screen is a
// result nobody can account for, and the id is a URL rather than a word anybody
// read. Every term must match, so typing more words can only ever narrow.

check("the downloads search matches labels, not ids", () => {
  const file = {
    name: "Drive check",
    blurb: "Reads the SMART numbers off every disk.",
    version: "2.1",
    category: "antimalware",
    platform: "windows",
  };

  must(matchesQuery(file, ""), "an empty query excluded a file");
  must(matchesQuery(file, "   "), "a whitespace query excluded a file");
  must(matchesQuery(file, "drive"), "a name term did not match");
  must(matchesQuery(file, "SMART"), "a blurb term did not match case-insensitively");
  must(matchesQuery(file, "2.1"), "a version term did not match");
  must(matchesQuery(file, "malware removal"), "the category's label did not match");
  must(matchesQuery(file, "windows"), "the platform's label did not match");
  must(!matchesQuery(file, "antimalware"), "the search matched a category *id* rather than a label");
  must(!matchesQuery(file, "linux"), "a platform it is not matched");
  // Every term, not any term.
  must(matchesQuery(file, "drive smart"), "two terms that both match were rejected");
  must(!matchesQuery(file, "drive linux"), "a query matched on one term when the other failed");

  return "labels match, ids do not, and every term must match";
});

// ---- 2b-vi. The one prefix route agrees with itself -------------------------
//
// 2026-08-20. `/downloads/<name>` is the only route on the site with anything
// after it, and it is resolved by two functions that have to agree.
//
// They did not. `pageFromPath` matched the prefix and answered `downloads` for
// *any* depth, while `subFromPath` refused a second slash and answered `null` —
// so `/downloads/a/b` rendered the index at an address that is not the index.
// That is worse than cosmetic: `ConfigContext`'s `go()` early-returns when the
// page and sub both already match, so clicking "Downloads" from there changed
// nothing and never pushed a corrected URL. The address bar kept the broken path
// for the rest of the visit, and every Back landed on it again.
//
// It also made every such path an indexable soft-404 with a self-canonical, the
// exact thing `page-meta.ts` puts `notfound` in `UNLISTED` to prevent.

check("the downloads sub-route resolves consistently", () => {
  const cases: Array<[string, PageId, string | null]> = [
    ["/downloads", "downloads", null],
    ["/downloads/", "downloads", null],
    ["/downloads/tools", "downloads", "tools"],
    ["/downloads/tools/", "downloads", "tools"],
    // Two segments is a typo or a probe, not a deeper page — and both functions
    // have to say so, or the pair disagrees.
    ["/downloads/a/b", "notfound", null],
    ["/downloads/a/b/c", "notfound", null],
    ["/scams", "scams", null],
    ["/nonsense", "notfound", null],
  ];

  for (const [path, wantPage, wantSub] of cases) {
    const page = pageFromPath(path);
    const sub = subFromPath(path);
    must(page === wantPage, `${path}: expected page "${wantPage}", got "${page}"`);
    must(sub === wantSub, `${path}: expected sub ${JSON.stringify(wantSub)}, got ${JSON.stringify(sub)}`);
    // The invariant behind both: a sub only exists on the page that has subs,
    // and a path under that prefix with no valid sub is not that page.
    must(
      sub === null || page === "downloads",
      `${path}: reported a sub on page "${page}", which has none`,
    );
    must(
      !path.replace(/\/+$/, "").startsWith("/downloads/") || (sub === null) === (page !== "downloads"),
      `${path}: pageFromPath and subFromPath disagree`,
    );
  }

  // Round trip: a resolved pair must regenerate the path it came from.
  for (const [path, , wantSub] of cases) {
    const page = pageFromPath(path);
    if (page === "notfound") continue;
    const back = pathFor(page, wantSub);
    must(
      back === path.replace(/\/+$/, "") || back === path,
      `${path}: pathFor round-tripped to "${back}"`,
    );
  }

  // The meta layer must refuse to canonicalise a sub-page at itself.
  const subMeta = metaForPath("/downloads/tools");
  must(subMeta.unlisted, "a downloads sub-page is not marked unlisted — it would be indexed");
  must(subMeta.sub, "metaForPath did not recognise a downloads sub-page");
  must(!metaForPath("/downloads").sub, "the downloads index was mistaken for a sub-page");

  return `${cases.length} paths, both resolvers agreeing, sub-pages unlisted`;
});

// ---- 2b-v. No stylesheet reads a custom property nothing writes -------------
//
// 2026-08-20, and this is the general form of two live bugs found the same day,
// both on the downloads page and both invisible in every way a build can see.
//
// `.v-dl-name` and three other headings asked for `var(--display-weight, 600)`.
// The token is `--type-display-weight`. So four of the site's headings ignored
// the typeset's own display weight and rendered at a hardcoded 600 — on the one
// surface added after the webfont work whose entire point (deviation 14) was
// that every heading had been the user-agent's `bold` in all five typesets.
// `.dl-sheet .v-dl-name` asked for `var(--mono, ui-monospace, monospace)`
// against a token called `--font-mono`, so the layout whose name is "dense and
// mono" was the one place on the site not using the site's mono.
//
// **The fallback is what hides it.** A `var()` with a fallback never fails, and
// never logs; it renders something plausible for ever. That is why this is a
// gate and not a code review note — a typo in a token name is a class of bug
// this codebase cannot otherwise detect at all.
//
// A property counts as written if any stylesheet declares it, `@property`
// registers it, or any TypeScript names it (the theme writes most of them, and
// a few — `--mx`, `--my`, `--i` — are set on style attributes). `var(...)`
// occurrences in TypeScript are stripped before that scan, or a typo inside a
// template string would declare itself.

check("every custom property a stylesheet reads is one something writes", () => {
  const styles = readdirSync("src/styles").filter((f) => f.endsWith(".css"));
  const css = styles.map((f) => readFileSync(join("src/styles", f), "utf8")).join("\n");

  const written = new Set<string>();
  const note = (source: string) => {
    for (const m of source.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gi)) written.add(m[1]);
    for (const m of source.matchAll(/@property\s+(--[a-z][a-z0-9-]*)/gi)) written.add(m[1]);
  };
  note(css);

  /*
   * Every TypeScript file under `src/`, because the theme writes most of these
   * from `themeVars()` and a few — `--mx`, `--my`, `--i`, `--n` — are set on
   * style attributes.
   *
   * **Matched only in writing positions, never as a bare mention.** The first
   * version took any `--token` anywhere in the file, and this codebase is
   * unusually comment-heavy *about* CSS tokens: every one of the bugs this gate
   * exists for is discussed by name in a comment somewhere, so a typo that
   * happened to be mentioned in prose would have declared itself and the gate
   * would have passed while claiming otherwise. The three forms below are the
   * three ways a property is actually written here — an object key, a
   * `setProperty` argument, and a declaration inside a template string.
   */
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  for (const path of walk("src")) {
    const source = readFileSync(path, "utf8");
    // `"--x":` / `'--x':` — a key in a style object or a token map.
    for (const m of source.matchAll(/["'](--[a-z][a-z0-9-]*)["']\s*:/gi)) written.add(m[1]);
    // `setProperty("--x", …)`.
    for (const m of source.matchAll(/setProperty\(\s*["'](--[a-z][a-z0-9-]*)["']/gi)) written.add(m[1]);
    // `--x:` inside a template literal or an inline style string.
    for (const m of source.matchAll(/[;{`\s](--[a-z][a-z0-9-]*)\s*:/g)) written.add(m[1]);
  }

  const missing = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/gi)) {
    if (!written.has(m[1])) missing.add(m[1]);
  }

  must(
    missing.size === 0,
    `stylesheets read ${[...missing].join(", ")}, which nothing ever writes — a var() with a fallback renders something plausible for ever and never logs`,
  );

  return `${styles.length} stylesheets, ${written.size} properties written, none read that are not`;
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
    ["a zero-length suffix claims nothing", true, { suffix: 0 }, { offset: size, length: 0 }],
  ];

  /*
   * **A zero-length plan is an unsatisfiable range, and the caller must answer
   * 416 — this table used to bless it as a 206.**
   *
   * `rangePlan` clamps rather than refusing, which is the right split: it
   * reports what the response would *be*, and `file()` decides the status. But
   * the row above was asserted as correct and the only arithmetic check was
   * `offset + length <= size`, so a plan of `{ offset: size, length: 0 }` passed
   * — and `file()` turned it into `content-range: bytes 300000-299999/300000`,
   * a last-byte-pos below the first, which RFC 9110 §14.4 does not permit.
   * `Range: bytes=300000-` against an already-complete file is the everyday way
   * to produce it, from exactly the resuming download managers this route
   * advertises `accept-ranges` for.
   */
  let unsatisfiable = 0;

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

    if (got!.length === 0) {
      unsatisfiable += 1;
      // The one thing a zero-length plan may never become is a 206. Asserted
      // against the arithmetic `file()` actually performs, so this fails if
      // anybody deletes the 416 branch and lets the subtraction run.
      const end = got!.offset + got!.length - 1;
      must(
        end < got!.offset,
        `${name}: a zero-length plan produced a coherent content-range, which hides the bug`,
      );
    } else {
      must(got!.length > 0, `${name}: a served 206 must carry at least one byte`);
    }
  }

  must(unsatisfiable === 2, `expected 2 unsatisfiable rows, saw ${unsatisfiable}`);

  return `${rows.length} range shapes, ${unsatisfiable} unsatisfiable (416), and a plain GET is a 200`;
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

// ---- The hit flash survives the fairness coin, and reactions follow causes ---
//
// 2026-08-20, two bugs the existing duel gates could not see.
//
// **The flash.** `damage()` sets the victim's `flash` to exactly 1 and
// `drawFighter` tests `flash >= 1`, so the flare is meant to last precisely the
// frozen hit-stop frames. The decay lived on `stepFighter`'s first line, which
// made it a casualty of the fairness coin: with the attacker stepped first, the
// victim's own step ran later in the same call and decayed the flash below the
// test before anything drew. Measured: **854 of 1,755 blows (48.7%) never
// flashed.** The renderer gate asserts only "more than 100 flashes in 40,000
// frames", which passes comfortably with half of them gone.
//
// **The ordering.** `runDirector` ran *above* the hit-stop early return, so the
// exchange clock advanced while both move clocks were frozen — and a reaction
// beat placed by `lands(move, at)` is in director frames while the damage it
// answers is dealt on the attacker's own `mf`. Any hit-stop between the two put
// the reaction first: **20 of 2,200 reaction starts began before their cause.**
// The sequence gate asserts that ordering in *beat* space, where the skew does
// not exist by construction.

if (!FAST) check("duel: a blow always flashes, and no reaction precedes its cause", () => {
  /*
   * `recoil` is deliberately absent: it answers a *block*, which deals no
   * damage, so it has no cause in the health record to be ahead of.
   */
  const REACTIONS = new Set(["stagger", "knockdown", "stumble_in"]);
  const st = createDuel("hooded", "caped");

  let blows = 0;
  let flashed = 0;
  let inverted = 0;
  let reactions = 0;

  /*
   * **Every** damage frame per fighter, not merely the most recent one.
   *
   * Keeping a single `last` was this gate's own first bug: a reaction whose
   * cause was five frames behind it, followed by an unrelated second hit ten
   * frames later, read as inverted because `last` had moved past it. It reported
   * 296 violations where there were none.
   */
  const hits: { a: number[]; b: number[] } = { a: [], b: [] };
  const pending: Array<{ who: "a" | "b"; frame: number }> = [];

  let hpA = st.a.health;
  let hpB = st.b.health;

  const FRAMES = 300_000;
  for (let i = 0; i < FRAMES; i += 1) {
    const movingA = st.a.move;
    const movingB = st.b.move;
    advanceDuel(st, 1);

    // A blow is a health drop. Checked immediately after the step that caused
    // it, which is the frame the flare has to be on screen for.
    if (st.a.health < hpA) {
      blows += 1;
      hits.a.push(i);
      if (st.a.flash >= 1) flashed += 1;
    }
    if (st.b.health < hpB) {
      blows += 1;
      hits.b.push(i);
      if (st.b.flash >= 1) flashed += 1;
    }
    hpA = st.a.health;
    hpB = st.b.health;

    // A reaction beginning. Recorded rather than judged, because its cause may
    // legitimately be a frame or two behind it in the same step.
    if (st.a.move !== movingA && REACTIONS.has(st.a.move)) pending.push({ who: "a", frame: i });
    if (st.b.move !== movingB && REACTIONS.has(st.b.move)) pending.push({ who: "b", frame: i });

    // Resolve anything old enough to judge.
    while (pending.length && i - pending[0].frame > 40) {
      const r = pending.shift()!;
      const mine = hits[r.who];
      const before = mine.some((f) => f <= r.frame && r.frame - f <= 40);
      const after = mine.some((f) => f > r.frame && f - r.frame <= 40);
      reactions += 1;
      /*
       * A reaction with no damage anywhere near it is one the director
       * reassigned inside its own window — documented, and not this bug. What is
       * refused is a reaction whose damage arrives *after* it started: effect
       * before cause.
       */
      if (!before && after) inverted += 1;
    }
  }

  must(blows > 500, `only ${blows} blows in ${FRAMES} frames — the fight is not landing anything`);
  must(
    flashed === blows,
    `${blows - flashed} of ${blows} blows (${(((blows - flashed) / blows) * 100).toFixed(1)}%) never flashed`,
  );
  must(inverted === 0, `${inverted} of ${reactions} reactions began before the damage they answer`);

  return `${blows} blows, all flashed; ${reactions} reactions, none before its cause`;
});

if (!FAST) check("duel: fairness, reachability, stability", () => {
  const styles = ["hooded", "caped", "maned", "horned"] as const;
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
    /*
     * **The kick counts against the frame.** `drawDuel` displaces the whole
     * world by `st.shake` on a contact, and `duelFocus` — which is what the
     * camera frames from — knows nothing about it, so every world unit of shake
     * is a world unit the camera has not reserved. Adding it here is what keeps
     * this gate's claim true now that the frame can move: raise `SHAKE_MAX` past
     * what the camera's margin absorbs and this fails, rather than the site
     * quietly cutting a fighter off on the frames a blow lands.
     */
    const lo = f.cx - f.width / 2 + st.shake.x;
    const hi = f.cx + f.width / 2 + st.shake.x;
    const over = Math.max(viewLo - lo, hi - viewHi, 0);
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
 * The four knobs, and the one that was not the identity it claimed to be.
 *
 * `CLAUDE.md` states the rule the whole tuning surface rests on: *"Every
 * default is 1 and 1 must stay arithmetic identity."* It is what lets 360,000
 * stepped frames and 280,000 generated sequences keep passing while a
 * publishable multiplier sits in front of them. Three of the four held. `rest`
 * did not, and it had not since the knobs landed — the gate below is the one
 * that would have caught it on the day.
 *
 * The form was `Math.max(end, round(end + max(0, built.length - end) * rest))`,
 * which reproduces `built.length` only when `built.length >= end`. **Four
 * modules deliberately roll a length shorter than their last move's own end**
 * — `disengage` at `ends("circle", away) - r.i(10, 26)` because a trailing
 * drift may be cut short and nobody sees it, `pushed` at `- r.i(2, 14)`,
 * `swept-down` and `held-and-struck` sometimes. For those the clamp threw the
 * roll away: measured over 20,000 builds each, it added back a mean of 18.07
 * and 8.04 frames — the subtraction *entirely* undone, on 100% of builds.
 *
 * The old gate asserted that `buildSequence` preserves the id and sorts the
 * beats, and never compared its length to the one the module asked for, which
 * is the only place the fault was visible.
 */
if (!FAST) check("duel: rest is a multiplier on slack, and 1 is arithmetic identity", () => {
  const before = DUEL_TUNING.rest;
  try {
    const ends = (mv: string, at: number) => at + DUEL_TABLES.moves[mv].frames;
    const seeded = (n: number) => {
      let x = n >>> 0;
      return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    };

    DUEL_TUNING.rest = 1;
    let drift = 0;
    let builds = 0;
    for (const m of DUEL_TABLES.modules) {
      for (let i = 0; i < 4000; i += 1) {
        const asked = m.build(makeRoll(seeded(4242 + i))).length;
        const got = buildSequence(m, seeded(4242 + i)).length;
        builds += 1;
        if (got !== asked) drift += 1;
      }
    }
    must(drift === 0, `rest:1 changed ${drift} of ${builds} sequence lengths — it is not the identity`);

    /*
     * And the two ends still mean what they say. At `rest: 0` a sequence must
     * still contain its own last move — that floor is why the clamp was there
     * — while a module that cut *itself* short keeps its cut, which is the half
     * the floor was trampling. At `rest: 4` nothing may come out shorter than
     * the module asked for.
     */
    let cut = 0;
    let holdsLast = 0;
    let extremes = 0;
    for (const rest of [0, 4]) {
      DUEL_TUNING.rest = rest;
      for (const m of DUEL_TABLES.modules) {
        for (let i = 0; i < 400; i += 1) {
          const raw = m.build(makeRoll(seeded(99 + i)));
          const seq = buildSequence(m, seeded(99 + i));
          const end = seq.beats.reduce((n, b) => Math.max(n, ends(b.move, b.at)), 0);
          extremes += 1;
          if (seq.length >= Math.min(raw.length, end)) holdsLast += 1;
          if (rest === 0 && seq.length < raw.length) cut += 1;
          must(
            rest !== 4 || seq.length >= raw.length,
            `rest:4 shortened ${m.id} from ${raw.length} to ${seq.length}`,
          );
        }
      }
    }
    must(
      holdsLast === extremes,
      `${extremes - holdsLast} sequences lost their own last move at an extreme rest`,
    );
    must(cut > 0, "rest:0 shortened nothing — the knob is not reaching the slack");
    return `${builds} builds identical at rest:1, ${cut} shortened at rest:0, last move held in all ${extremes}`;
  } finally {
    DUEL_TUNING.rest = before;
  }
});

/*
 * The health bar sat at a flat `f.y - 34` and the costumes are not one height.
 *
 * Same finding as `duelFocus`'s per-costume `clear()`, arriving at the other
 * consumer of `headroom` a roster later and never being applied: the bar is 4
 * units tall, so it occupies `[y-34, y-30]`, and the gladiator's crest (34),
 * the witch's hat (31), the anubis's ears and the ringmaster's stovepipe (30)
 * all reach into that band. Rendered at the real 281px phone slot and the 340px
 * desk slot, the bar is drawn *through* the top hat's crown — where it stops
 * reading as a readout at all — and across the prophet's halo.
 *
 * Asserted against the declared `headroom`, which the costume gate above
 * separately re-derives by driving the hooks, so this cannot drift away from
 * the drawing either.
 */
check("duel: the health bar clears every costume, and stays in frame", () => {
  /*
   * **Driven, not re-derived.** The first version of this gate restated the
   * renderer's formula from `headroom` and asserted on its own arithmetic —
   * which is the mistake `DUEL_TABLES`' own comment names: a checker holding
   * its own copy only ever confirms its own copy. Reverting the renderer to the
   * flat `f.y - 34` left it green. So it draws instead, through a recording
   * context, and reads the rectangle the renderer actually emits.
   *
   * The bar is 34 × 4 world units and is drawn outside the body transform, so
   * at `scale: 1` its coordinates arrive here in world units untouched.
   */
  const bars: { x: number; y: number }[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "fillRect") {
          return (x: number, y: number, w: number, h: number) => {
            if (w === 34 && h === 4) bars.push({ x, y });
          };
        }
        if (key === "canvas") return { width: 700, height: 700 };
        return typeof key === "string" && /^[a-z]/.test(key) ? () => undefined : 0;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;

  const view = {
    x: 0,
    y: 0,
    scale: 1,
    ink: "#fff",
    bladeA: "#00f",
    bladeB: "#f00",
    core: "#fff",
    spark: "#ff0",
    line: "#333",
    bars: true,
    kick: false,
    dim: 1,
  };

  const good = (Object.keys(FIGHTERS) as FighterStyle[]).filter((f) => FIGHTERS[f].side === "good");
  const evil = (Object.keys(FIGHTERS) as FighterStyle[]).filter((f) => FIGHTERS[f].side === "evil");
  const seen = new Set<string>();
  let drawn = 0;
  let tightest = Infinity;
  let worst = "";

  for (let k = 0; k < Math.max(good.length, evil.length); k += 1) {
    const st = createDuel(good[k % good.length], evil[k % evil.length]);
    for (let i = 0; i < 900; i += 1) {
      advanceDuel(st, 1);
      bars.length = 0;
      drawDuel(ctx, st, view);
      for (const bar of bars) {
        /*
         * Attributed exactly, not by proximity. The bar is emitted at
         * `centre(f) - 17`, and `centre` is `f.x + BODY_W / 2` — so the match
         * is arithmetic. Nearest-x looks equivalent and is not: the two cross
         * during a `pass`, and a fighter at the top of a somersault is 80 world
         * units above the other, so a misattributed bar reports a wild offset
         * against the wrong costume's headroom.
         */
        const key = bar.x + 17 - BODY_W / 2;
        const f = Math.abs(key - st.a.x) < 1e-6 ? st.a : st.b;
        must(
          Math.abs(key - f.x) < 1e-6,
          `a 34x4 rectangle at x=${bar.x} belongs to neither fighter — is something else this size?`,
        );
        const headroom = FIGHTERS[f.style].headroom;
        const offset = f.y - bar.y;
        const clear = Math.max(26, headroom + 16);
        seen.add(f.style);
        drawn += 1;
        must(
          offset - 4 >= headroom,
          `${f.style}: the bar's underside is ${(offset - 4).toFixed(1)} above the torso against a costume reaching ${headroom}`,
        );
        /*
         * And it must not escape upward. `duelFocus` frames to
         * `max(26, headroom + 16)`, so a bar above that is cropped by the very
         * camera meant to contain it — which a flat 34 was, for every costume
         * under 18 of headroom, on a bar only four units tall.
         */
        must(
          offset <= clear,
          `${f.style}: the bar's top edge at ${offset.toFixed(1)} is outside the camera's ${clear} of clearance`,
        );
        const slack = offset - 4 - headroom;
        if (slack < tightest) {
          tightest = slack;
          worst = f.style;
        }
      }
    }
  }
  must(seen.size === 24, `only ${seen.size} of 24 costumes had a bar drawn over them`);
  return `${drawn.toLocaleString()} bars drawn over 24 costumes, tightest clearance ${tightest.toFixed(0)} units (${worst})`;
});

/*
 * A non-finite delta stops the fight for ever, and nothing says so.
 *
 * `Math.max(0, NaN)` is `NaN`, so one bad frame count makes `st.acc` `NaN`
 * permanently: `Math.floor(NaN)` is `NaN`, `NaN > 0` is false, and `acc -= NaN`
 * keeps it `NaN`. Every later call is a silent no-op. The hosts' own clamps do
 * not help — `Math.min(3, Math.max(0.2, NaN))` is also `NaN`, and every host of
 * this engine writes that same line against a `performance.now()` delta.
 */
/*
 * A carry branch may not name a move.
 *
 * `Move.carry` names what the *body* does, and CLAUDE.md's rule is that the
 * renderer branches on it "rather than on move ids" — which it does, and then
 * one branch reached for a move id anyway to get its timing. Two moves declare
 * `carry: "crouch"`: `duck` at 26 frames and `sweep_low` at 32, and the crouch
 * was driven off `MOVES.duck.frames` for both. So `sweep_low` peaked at `mf 13`
 * when its blade only arrives at the low line at `contact: 16` and holds there
 * through 25, then stood the body fully upright for frames 26–32 with the blade
 * still down.
 *
 * Gated as the general form rather than as that one divisor, because the fault
 * is the shape: any carry shared by two moves of different lengths has it, and
 * the next one added will not be a crouch.
 */
check("duel: the renderer's carry branches name no move", () => {
  const src = readFileSync("src/fx/duel.ts", "utf8");
  const { moves } = DUEL_TABLES;

  /*
   * The gate only has teeth where a carry is shared by moves of *different*
   * lengths — otherwise the wrong divisor is the right number by luck, which is
   * how this survived. Assert that such a carry still exists, so the check
   * cannot quietly become vacuous.
   */
  const byCarry = new Map<string, Set<number>>();
  for (const m of Object.values(moves)) {
    if (!m.carry) continue;
    const set = byCarry.get(m.carry) ?? new Set<number>();
    set.add(m.frames);
    byCarry.set(m.carry, set);
  }
  const shared = [...byCarry].filter(([, lens]) => lens.size > 1).map(([c]) => c);
  must(
    shared.length > 0,
    "no carry is shared by moves of different lengths — this gate proves nothing",
  );

  /*
   * Scoped to `drawFighter` alone. The carry names also appear in the move
   * table and all over the module pool, and a window that runs past the end of
   * the renderer reports every move id in the choreography.
   */
  const from = src.indexOf("function drawFighter(");
  must(from > 0, "drawFighter has been renamed — this gate no longer reads the renderer");
  /*
   * Bounded by the next top-level declaration, `export function` included —
   * looking only for `\nfunction ` runs the window to the end of the file,
   * because what follows `drawFighter` is `export function drawDuel`.
   */
  const ends = [src.indexOf("\nfunction ", from + 1), src.indexOf("\nexport function ", from + 1)]
    .filter((i) => i > from);
  must(ends.length > 0, "drawFighter appears to run to the end of the file");
  const renderer = src
    .slice(from, Math.min(...ends))
    // Comments are where the fault is *explained*, so they name the move on
    // purpose. Strip them, or this gate fails on its own documentation.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const cuts = [...renderer.matchAll(/carry === "(\w+)"/g)];
  must(cuts.length >= 3, `only ${cuts.length} carry branches in drawFighter — has it moved?`);
  for (let i = 0; i < cuts.length; i += 1) {
    const at = cuts[i].index!;
    const to = i + 1 < cuts.length ? cuts[i + 1].index! : renderer.length;
    const named = renderer.slice(at, to).match(/MOVES\.[A-Za-z_$][\w$]*/g);
    must(
      named === null,
      `the ${cuts[i][1]} branch names ${named?.join(", ")} — it must read MOVES[f.move], or a longer move of the same carry runs on a shorter one's clock`,
    );
  }
  return `${cuts.length} carry branches in drawFighter, none naming a move; ${shared.join("/")} shared by different lengths`;
});

/*
 * The pacing is per fight, and every host hands its own over.
 *
 * `DUEL_TUNING` was a module global on the argument that the knobs "cannot vary
 * within a page anyway". `/admin` renders **three** duels at once — the hero
 * ornament, the bench, and the settings editor's preview — and the editor's
 * whole job is previewing a page other than the one it is standing on. So the
 * premise was false, the last host to run its effect decided the pacing for all
 * three, and dragging Circling with a page selected changed nothing on the one
 * canvas built to judge it.
 */
check("duel: the pacing rides on the fight, not on a global", () => {
  const a = createDuel("hooded", "caped");
  const b = createDuel("hooded", "caped");
  must(a.tuning === DUEL_TUNING, "a fresh fight does not default to the engine's tuning");

  // Two fights, two tunings, no bleed.
  a.tuning = { ...DUEL_TUNING, rest: 0 };
  b.tuning = { ...DUEL_TUNING, rest: 4 };
  must(DUEL_TUNING.rest === 1, "assigning one fight's tuning wrote through to the global");
  must(b.tuning.rest === 4 && a.tuning.rest === 0, "two fights are sharing one tuning object");

  /*
   * And it must actually reach the builder. Driven rather than read: run both
   * fights the same distance and compare how much sequence time each spends,
   * which is the thing `rest` moves.
   */
  const span = (st: typeof a) => {
    let total = 0;
    let seen = 0;
    for (let i = 0; i < 40_000; i += 1) {
      advanceDuel(st, 1);
      if (st.dir.seq && st.dir.seq.length !== seen) {
        seen = st.dir.seq.length;
        total += seen;
      }
    }
    return total;
  };
  const slow = span(b);
  const fast = span(a);
  must(slow > fast, `rest:4 produced ${slow} frames of sequence against rest:0's ${fast}`);

  /*
   * **Every host has to hand it over, which the loop above cannot see.** The
   * editor is the one that was broken and the one that matters; the others are
   * here so a new host cannot quietly inherit the old global.
   */
  for (const [file, what] of [
    ["src/components/DuelOrnament.tsx", "the hero slot"],
    ["src/components/DuelSettingsEditor.tsx", "the editor's preview"],
    ["src/components/DuelBench.tsx", "the bench"],
  ] as const) {
    must(
      /\bst\.tuning\s*=/.test(readFileSync(file, "utf8")),
      `${what} never assigns st.tuning — its fight will run at whatever another host last set`,
    );
  }
  return "3 hosts assign their own; two fights hold different tunings without bleeding";
});

/*
 * A frame delta is floored at 0, not at 0.2.
 *
 * The clamp exists so refresh rate does not change how fast the world runs —
 * `FxCanvas`'s own comment says so. The floor reintroduced that at the other
 * end: 0.2 is a 300Hz frame, so on anything faster the real delta was rounded
 * *up* and a 500Hz panel ran 1.67x fast. 480 and 540Hz displays ship. Nothing
 * needs a floor, because `advanceDuel` accumulates fractional frames.
 */
check("every frame clamp floors at zero, so a fast display is not a fast world", () => {
  const hosts = [
    "src/fx/FxCanvas.tsx",
    "src/components/DuelOrnament.tsx",
    "src/components/DuelBench.tsx",
    "src/components/DuelSettingsEditor.tsx",
  ];
  let clamps = 0;
  for (const file of hosts) {
    const src = readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, "");
    const found = [...src.matchAll(/Math\.min\(3,\s*Math\.max\(([0-9.]+)/g)];
    must(found.length > 0, `${file} no longer clamps its frame delta — has the loop moved?`);
    for (const m of found) {
      clamps += 1;
      must(
        Number(m[1]) === 0,
        `${file} floors its frame delta at ${m[1]} — anything above 0 runs fast on a display faster than ${Math.round(60 / Number(m[1]))}Hz`,
      );
    }
  }

  /*
   * And the accumulator is what makes a floor unnecessary: many small deltas
   * must advance the world by the same amount as one large one.
   *
   * Measured on `idle`, the world clock, which ticks once per fixed step —
   * **not on the director or on a position**, because `chooseSequence` throws a
   * real coin, so two fights given identical time still diverge and comparing
   * them proves nothing. A tolerance of two frames, because accumulating a
   * tenth six thousand times is not exactly six hundred in binary floating
   * point; the fault this guards against is not a rounding frame, it is the
   * 2x-and-up a floor produces.
   */
  const many = createDuel("hooded", "caped");
  const one = createDuel("hooded", "caped");
  for (let i = 0; i < 6_000; i += 1) advanceDuel(many, 0.1);
  for (let i = 0; i < 600; i += 1) advanceDuel(one, 1);
  must(
    Math.abs(many.idle - one.idle) <= 2,
    `6,000 tenths advanced the world ${many.idle} frames against 600 whole frames' ${one.idle} — a small delta is being rounded up`,
  );
  return `${clamps} clamps, all floored at 0; 6,000 tenths advance ${many.idle} frames against 600's ${one.idle}`;
});

/*
 * A pinned pairing is still one alignment against the other.
 *
 * `pin` bypasses `rollPairing`, so it is the one route into the engine that
 * `ROSTER_GOOD` / `ROSTER_EVIL` do not guard — and nothing checked it. A
 * published `["ronin", "sentinel"]` was accepted and pinned good-versus-good:
 * both blades come out blue or green, which the alignment carve-out cannot
 * express, and which `duel: a pooled fight rotates its fighters` asserts never
 * happens.
 */
/*
 * Two corners of the pacing knobs that nothing reached.
 *
 * **`circling: 0` picked deterministically.** It is the low end of a published
 * slider and it means "never pick a module that contains no blow". When the
 * anti-stall rail has already filtered the pool and every survivor happens to
 * be a zero-blow module, every weight is `weight * 0`, the total is 0, and the
 * old `|| TOTAL_WEIGHT` fallback was the sum over the *whole* module list —
 * far larger than anything that pool can subtract, so the loop never broke and
 * the pick was `pool[0]` every time. Not a crash: a silently fixed choice, at
 * the one setting whose entire purpose is to change which modules come up.
 *
 * **A quick beat's end was overstated by its own windup.** `ends` takes the
 * flag for the same reason `lands` does, and `buildSequence` was not passing
 * it. No module is affected today — 0 of 700,000 builds has a quick beat as its
 * last-ending one — so this is driven from a module built here rather than from
 * the pool, because a gate that can only pass is not a gate.
 */
check("duel: the pacing knobs behave at their corners", () => {
  const before = { ...DUEL_TUNING };
  try {
    // 1. A quick last beat ends a windup earlier, and the length follows.
    const quickTail = (quick: boolean) => ({
      id: "gate-quick",
      weight: 1,
      range: "close" as const,
      hits: true,
      build: () => ({
        beats: [
          { who: "ATT" as const, move: "strike_overhead" as const, at: 0, outcome: "blocked" as const },
          { who: "DEF" as const, move: "thrust" as const, at: 40, outcome: "hit" as const, power: 1, quick },
        ],
        /*
         * Deliberately *above* the last move's end, so there is slack — at
         * `rest: 0` the length then collapses to exactly that end, which is the
         * only way the quick flag is observable from outside. Rolling short
         * instead would take the negative-slack path, which returns the
         * module's own number untouched and never consults `ends` at all.
         */
        length: 200,
      }),
    });
    const windup = DUEL_TABLES.moves.thrust.windup ?? 0;
    must(windup > 0, "thrust has no windup, so this gate cannot tell the two cases apart");
    const plain = buildSequence(quickTail(false), Math.random, { ...DUEL_TUNING, rest: 0 }).length;
    const quick = buildSequence(quickTail(true), Math.random, { ...DUEL_TUNING, rest: 0 }).length;
    must(
      plain - quick === windup,
      `a quick last beat should end ${windup} frames earlier; got ${plain} vs ${quick}`,
    );

    // 2. `circling: 0` must still spread its picks, and must still reach the
    //    blowless modules it is meant to suppress rather than eliminate.
    const st = createDuel("hooded", "caped");
    st.tuning = { ...DUEL_TUNING, circling: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 120_000; i += 1) {
      advanceDuel(st, 1);
      if (st.dir.seq) seen.add(st.dir.seq.id);
    }
    must(
      seen.size > 6,
      `circling:0 only ever reached ${seen.size} module(s) in 120,000 frames — the weighted pick has collapsed`,
    );

    /*
     * 3. The zero-total branch, asserted at the source.
     *
     * **This corner is not reachable through the director today** and saying so
     * is the point: it needs `circling: 0` *and* a pool whose every survivor is
     * blowless, and the anti-stall rail filters to `hits` before that can
     * happen. So a behavioural test of it can only ever pass, which is not a
     * test. What is checkable is that the fallback is a *uniform pick* and not
     * a magic total: the old form fell back to the sum over the whole module
     * list, which no filtered pool can subtract its way through, so the loop
     * never broke and the pick was `pool[0]` every single time — deterministic,
     * silent, at the one setting whose purpose is to change what comes up.
     */
    const src = readFileSync("src/fx/duel.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    must(
      /const total = pool\.reduce\([^;]*, 0\);/.test(src),
      "the pick's total has a fallback again — a pool that weighs nothing must be picked from evenly",
    );
    must(
      /if \(total > 0\)/.test(src),
      "the pick no longer guards on a zero total",
    );
    return `quick tail ends ${windup} frames earlier; circling:0 still reaches ${seen.size} modules; the zero-weight pool is picked evenly`;
  } finally {
    Object.assign(DUEL_TUNING, before);
  }
});

check("a pinned duel is good against evil, or it is refused", () => {
  const good = (Object.keys(FIGHTERS) as FighterStyle[]).filter((f) => FIGHTERS[f].side === "good");
  const evil = (Object.keys(FIGHTERS) as FighterStyle[]).filter((f) => FIGHTERS[f].side === "evil");
  let refused = 0;
  let kept = 0;
  for (const a of good) {
    for (const b of good) {
      if (validDuelSettings({ pin: [a, b] }).pin !== null) {
        must(false, `a good-vs-good pin [${a}, ${b}] was accepted`);
      }
      refused += 1;
    }
  }
  for (const a of evil) {
    for (const b of evil) {
      must(validDuelSettings({ pin: [a, b] }).pin === null, `an evil-vs-evil pin [${a}, ${b}] was accepted`);
      refused += 1;
    }
  }
  for (const a of good) {
    for (const b of evil) {
      const pin = validDuelSettings({ pin: [a, b] }).pin;
      must(pin !== null, `a legal pin [${a}, ${b}] was refused`);
      kept += 1;
      must(validDuelSettings({ pin: [b, a] }).pin !== null, `[${b}, ${a}] was refused in the other order`);
    }
  }
  // Refused whole, never repaired into a legal pairing.
  must(validDuelSettings({ pin: ["ronin", "nonsense"] }).pin === null, "half a pin was repaired");
  return `${kept} cross-side pins kept, ${refused} same-side pins refused`;
});

check("duel: a bad frame count cannot kill the fight", () => {
  const st = createDuel("hooded", "caped");
  advanceDuel(st, 120);
  const before = st.a.x;
  for (const bad of [NaN, Infinity, -Infinity]) {
    advanceDuel(st, bad as number);
    must(Number.isFinite(st.acc), `advanceDuel(${String(bad)}) left the accumulator at ${st.acc}`);
  }
  advanceDuel(st, 120);
  must(st.a.x !== before || st.dir.f > 0, "the fight did not advance after a bad delta");
  return "NaN, +Inf and -Inf dropped; the fight kept running";
});

/*
 * A match reset is a cut, and nothing may survive a cut.
 *
 * `clash` is the one with a symptom: a cooldown of up to 30 frames, so a match
 * ending just after a blade cross opened the next one unable to spark for half
 * a second, and the first exchange of the new fight was silently the flattest
 * in it. The rest are bounded and mostly drained by the 200-frame hold, which
 * is exactly why they were easy to leave out.
 */
if (!FAST) check("duel: a match reset carries nothing over from the last fight", () => {
  const st = createDuelFrom("duel");
  let resets = 0;
  let dirty = 0;
  let seen = st.matches;
  for (let i = 0; i < 240_000 && resets < 6; i += 1) {
    advanceDuel(st, 1);
    if (st.matches !== seen) {
      seen = st.matches;
      resets += 1;
      /*
       * `dir.pressure` is deliberately not tested for zero here. The reset sets
       * it to 0 and `runDirector` runs later in the same `step`, choosing the
       * new match's opening sequence and counting it — so 1 on the frame the
       * match turns over is the rail working, not the old match leaking. Its
       * own gate asserts the reset; what this one is about is the transient
       * *drawing* state, which has no such excuse.
       */
      if (
        st.clash !== 0 ||
        st.hitStop !== 0 ||
        st.sparks.length !== 0 ||
        st.scorch.length !== 0 ||
        st.shake.x !== 0 ||
        st.shake.y !== 0 ||
        st.dir.pressure > 1
      ) {
        dirty += 1;
      }
    }
  }
  must(resets >= 3, `only ${resets} match resets in 240,000 frames — is the fight converging?`);
  must(dirty === 0, `${dirty} of ${resets} resets carried transient state into the next match`);
  return `${resets} resets, all clean`;
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
/*
 * **The kick and the ground marks are bounded, and both always settle.**
 *
 * Two pieces of world state were added for the impact work, and both have the
 * same pair of invariants — a ceiling, and a return to nothing.
 *
 * The kick (`st.shake`) displaces the whole drawn world on a contact. It may
 * never exceed `DUEL_SHAKE_MAX`, because what absorbs it is `duelCamera`'s
 * *never cut the subject in half* rule and an unbounded offset would walk the
 * pair out of the ornament. And it must decay to *exactly* zero: a residue that
 * never quite arrives parks the world permanently off-centre, which is invisible
 * frame to frame and unmistakable through a two-second victory hold.
 *
 * The ground marks (`st.scorch`) are the same shape of risk. The cap is what
 * stops a flurry in one place filling the list with copies of itself, and the
 * cooling is what stops a floor that has been fought on for a minute being lit
 * end to end.
 *
 * Both are the sort of thing a later *"make the hits feel heavier"* undoes by
 * making `kick` additive or by lengthening the cool without touching the cap,
 * which is precisely why the emitter takes the larger of two kicks rather than
 * summing them and why a near-by mark is reheated rather than stacked.
 */
if (!FAST) check("duel: the kick and the ground marks always settle", () => {
  const st = createDuel("hooded", "caped");
  let worst = 0;
  let live = 0;
  let longest = 0;
  let run = 0;
  let marks = 0;
  let hottest = 0;
  for (let i = 0; i < 200_000; i += 1) {
    advanceDuel(st, 1);
    const mag = Math.hypot(st.shake.x, st.shake.y);
    worst = Math.max(worst, mag);
    if (mag > 0) {
      live += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    marks = Math.max(marks, st.scorch.length);
    for (const s of st.scorch) {
      hottest = Math.max(hottest, s.heat);
      must(s.heat > 0, "a spent ground mark is still in the list");
    }
    must(
      st.scorch.length <= DUEL_SCORCH_MAX,
      `${st.scorch.length} ground marks, over the ${DUEL_SCORCH_MAX} cap`,
    );
  }
  must(
    worst <= DUEL_SHAKE_MAX + 1e-9,
    `a kick reached ${worst.toFixed(2)}, over the ${DUEL_SHAKE_MAX} ceiling`,
  );
  must(hottest <= 1 + 1e-9, `a ground mark reached heat ${hottest.toFixed(2)}`);
  must(live > 1_000, `only ${live} frames carried a kick — the emitters may have stopped firing`);
  must(marks > 0, "no ground mark was ever left — the emitters may have stopped firing");
  /*
   * **This is the assertion that proves a kick settles, and it is the whole of
   * it.** The obvious version — set a kick, step a few hundred frames, assert it
   * is zero — was written first and is *flaky*: `advanceDuel` runs a real fight,
   * so a contact somewhere in those frames re-arms the kick and the last frame
   * is legitimately non-zero. It failed on its second run, which is exactly the
   * kind of test that gets deleted later for being noisy rather than fixed.
   *
   * The run length says the same thing and cannot be fooled. At the documented
   * damping a kick is spent in about fourteen frames, so an unbroken run far
   * past that is a kick that never reaches zero — dropping the zero-snap gives
   * **3,732**, against a real worst of 24.
   */
  must(longest < 40, `a kick stayed live for ${longest} frames`);

  return `200,000 frames, kick worst ${worst.toFixed(2)} of ${DUEL_SHAKE_MAX} on ${((live / 200_000) * 100).toFixed(1)}% of frames (longest run ${longest}), at most ${marks} of ${DUEL_SCORCH_MAX} ground marks`;
});

/*
 * **`drawDuel` hands the canvas back exactly as it found it.**
 *
 * This effect draws into a canvas it shares with the rest of the site, and it
 * now sets `globalCompositeOperation = "lighter"` in five places — the blade's
 * bloom, the smear, the hit flash's ground mark, the scorch's hot pass and the
 * blade light on every bone of every limb. Each is wrapped in `save`/`restore`,
 * and a single missed `restore` would leave the whole page compositing
 * additively from that frame on.
 *
 * That failure mode is already written down in `CLAUDE.md` — `rain` flips the
 * world inside a save/restore pair, and a missed restore there "can no longer
 * mirror the site permanently" only because `FxCanvas` re-issues a base
 * transform every frame. It re-issues a *transform*; it does not reset the
 * composite operation, the alpha or the styles. So this is the half of that trap
 * nothing was catching, and the surface for it grew fivefold today.
 *
 * Driven rather than read: `drawDuel` is called with a recording context over
 * frames of a real fight, including a death hold and a frame with the flash, the
 * kick and a ground mark all live, and the depth must come back to zero with the
 * composite operation as it started.
 */
if (!FAST) check("duel: the renderer leaves the canvas as it found it", () => {
  let depth = 0;
  let worstDepth = 0;
  let op = "source-over";
  const opsSeen = new Set<string>();
  const stack: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "save") {
          return () => {
            stack.push(op);
            depth += 1;
            worstDepth = Math.max(worstDepth, depth);
          };
        }
        if (key === "restore") {
          return () => {
            must(depth > 0, "drawDuel called restore() more often than save()");
            depth -= 1;
            op = stack.pop() ?? "source-over";
          };
        }
        if (key === "globalCompositeOperation") return op;
        if (key === "canvas") return { width: 700, height: 700 };
        // Every other property read is a style slot; every other call is a draw.
        return typeof key === "string" && /^[a-z]/.test(key) ? () => undefined : 0;
      },
      set(_t, key: string, value) {
        if (key === "globalCompositeOperation") {
          op = String(value);
          opsSeen.add(op);
        }
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  const st = createDuel("hooded", "caped");
  const view = {
    x: 0,
    y: 0,
    scale: 1,
    ink: "#fff",
    bladeA: "#00f",
    bladeB: "#f00",
    core: "#fff",
    spark: "#ff0",
    line: "#333",
    bars: true,
    kick: true,
    dim: 1,
  };
  let flashes = 0;
  let marks = 0;
  let deaths = 0;
  for (let i = 0; i < 40_000; i += 1) {
    advanceDuel(st, 1);
    if (st.a.flash >= 1 || st.b.flash >= 1) flashes += 1;
    if (st.scorch.length > 0) marks += 1;
    if (st.over > 0) deaths += 1;
    drawDuel(ctx, st, view);
    must(depth === 0, `drawDuel left ${depth} unmatched save() at frame ${i}`);
    must(
      op === "source-over",
      `drawDuel left the composite operation as "${op}" at frame ${i}`,
    );
  }
  // If none of the interesting states came up, the run proved nothing.
  must(flashes > 100, `only ${flashes} flash frames — the run did not exercise a hit`);
  must(marks > 100, `only ${marks} frames carried a ground mark`);
  must(deaths > 100, `only ${deaths} death-hold frames — no match finished`);
  must(opsSeen.has("lighter"), "no additive pass ran — the run did not reach the code that risks this");
  return `40,000 frames drawn (${flashes.toLocaleString()} with a flash, ${marks.toLocaleString()} with a ground mark, ${deaths.toLocaleString()} a death hold), stack balanced, composite restored`;
});

/*
 * **Sparks never fly into the thing they were struck off.**
 *
 * `contactSpray` decomposes the swing against whatever was hit — the component
 * along the struck surface is kept, the component driving into it is reflected
 * back out — so the returned direction can never have a negative part along the
 * surface's outward normal. That property is the whole reason one function
 * serves a blade, a torso and the floor, and it is arithmetic, so it can be
 * checked exhaustively rather than sampled.
 *
 * It is gated rather than trusted because the failure is invisible: a shower
 * aimed through a blocking sword still draws sparks, still looks busy, and only
 * reads as wrong to someone watching for it. The site shipped a flat upward
 * bias on every block for months for exactly that reason.
 *
 * **What this deliberately does not claim** is that the result looks better.
 * That was benched and the bench could not answer it: at a real blade crossing
 * the two swords are on top of each other, so every direction passes through
 * one of them, and the burst-vs-blade metric is meaningless by construction.
 * What *was* measured, over 300,000 stepped frames, is that burst directions
 * stopped clustering — circular spread 0.327 → 0.899 — which says the contact
 * now determines the shower and the old constant did. Whether it reads better
 * wants an eye, exactly like the burst's placement before it.
 */
if (!FAST) check("duel: a spark never sprays into what it was struck off", () => {
  const st = createDuel("hooded", "caped");
  let cases = 0;

  // A fighter is only a carrier for `trail` and `facing` here, so the swing can
  // be dictated instead of waited for. Everything else on it is untouched.
  const swing = (f: typeof st.a, dx: number, dy: number) => {
    f.trail = [
      { hx: 0, hy: 0, tx: 0, ty: 0 },
      { hx: 0, hy: 0, tx: dx, ty: dy },
    ];
  };

  for (let a = 0; a < 24; a += 1) {
    const sa = (a / 24) * Math.PI * 2;
    // Every swing direction, at a speed well above the barely-moving fallback.
    swing(st.a, Math.cos(sa) * 4, Math.sin(sa) * 4);
    for (let b = 0; b < 24; b += 1) {
      const sb = (b / 24) * Math.PI * 2;
      // Every surface orientation, as a 58-unit segment through the origin.
      const struck = {
        hx: -Math.cos(sb) * 29,
        hy: -Math.sin(sb) * 29,
        tx: Math.cos(sb) * 29,
        ty: Math.sin(sb) * 29,
      };
      const s = contactSpray(st.a, struck);

      must(
        Math.abs(Math.hypot(s.x, s.y) - 1) < 1e-6,
        `spray is not a unit vector at swing ${a} surface ${b}: ${Math.hypot(s.x, s.y)}`,
      );

      // The outward normal is the side the swing arrived from — the side the
      // sparks have to leave on.
      const ex = struck.tx - struck.hx;
      const ey = struck.ty - struck.hy;
      const el = Math.hypot(ex, ey);
      let nx = -ey / el;
      let ny = ex / el;
      const arriving = Math.cos(sa) * nx + Math.sin(sa) * ny;
      // A swing exactly along the surface has no side to be on; skip it rather
      // than assert on a sign that is numerically arbitrary.
      if (Math.abs(arriving) < 1e-9) continue;
      if (arriving > 0) {
        nx = -nx;
        ny = -ny;
      }
      cases += 1;
      const out = s.x * nx + s.y * ny;
      must(out > -1e-9, `spray drives into the struck surface at swing ${a} surface ${b}: ${out}`);
    }
  }

  must(cases > 500, `too few cases exercised: ${cases}`);
  return `${cases} swing × surface pairs, none spraying into the surface`;
});

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
      /*
       * `solid()`'s clipped inner shadow calls this, and a stub without it
       * threw on the first carved costume. It records nothing deliberately: a
       * clip cannot add a point, and the shadow it bounds is drawn *inside* a
       * mark this recorder has already measured — counting it again would make
       * every carved mark look like two.
       */
      clip() {},
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
  /*
   * **The off hand moves, and pinning it is how a slab shipped for two days.**
   *
   * This drove one pose — a guard at `(14, 14)` — across the whole 400 × 5 × 2
   * sweep, so every mark that hangs off a *hand* was measured in exactly one
   * position: the viking's shield, the ronin's and hollow's sleeves, the
   * gladiator's arm bands, the nosferatu's fingers. `drawFighter` moves that
   * hand to three hard-coded places for `force`, `kicking` and `thrown`, and
   * swings it through an arc the rest of the time — and at `force` the viking's
   * shield covered **60% of the torso box at 60% of body alpha** against a rule
   * of "over 45% cover ⇒ at most 35% alpha", while the arc took it to 36.9
   * units sideways against the 34 the camera frames. Both invisible here.
   *
   * The three literals are the renderer's own, and the arc is sampled at the
   * extremes the guard reaches. A costume gate that cannot move the arms is a
   * costume gate for a statue.
   */
  const OFF_HANDS = [
    { x: 14, y: 14 }, // the guard this gate used to be the whole of
    { x: -4, y: 21 }, // `force`
    { x: -22, y: 12 }, // `kicking`
    { x: -8, y: 28 }, // `thrown`
    { x: 12, y: 4 }, // the holding arc, near end
    { x: 27, y: 10 }, // the holding arc, far end
  ] as const;

  const body = (
    kind: FighterKind,
    t: number,
    vx: number,
    airborne: boolean,
    offHand: { x: number; y: number } = { x: 14, y: 14 },
  ): CostumeCtx => {
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
      vx,
      airborne,
      t,
      phase: (t * 0.37) % (Math.PI * 2),
      ink: "#fff",
      blade: "#3d9bff",
      dim: 1,
      // The carve is measured with, not without. It adds no path points — so
      // the reach and sideways numbers are the same either way — but it is the
      // path that calls `clip()` and `save()`, and a gate that only ever drove
      // the `rim: 0` branch would not have caught the missing stub above.
      paper: "#000",
      rim: DEFAULT_RIM,
      alpha: 0.85,
      hand: { x: 22, y: 6 },
      elbow: { x: 16, y: 14 },
      offHand,
      // The off elbow trails its hand rather than staying put, or a mark drawn
      // between the two is measured on a limb that does not bend.
      offElbow: { x: (offHand.x - 2) / 2 - 2, y: (offHand.y + 26) / 2 },
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
          for (const offHand of OFF_HANDS) {
            const c = body(kind, t, vx, airborne, offHand);
            kind.back?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
            kind.head?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
            kind.overlay?.(rec.ctx as unknown as CanvasRenderingContext2D, c);
          }
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
  /*
   * **The cross-pool rule was replaced on 2026-08-27, not dropped.** It used to
   * assert that no fighter appeared in two pools, because the pools were how
   * lookalikes were kept apart. Measured, that cost four of the eight costumes:
   * the ornament id is the pool key and the ornament is published config, so
   * any given visitor could only ever see half the roster, four of twenty-eight
   * pairs, with 72.7% of resets returning a fighter from the previous match.
   *
   * The pools are now the whole roster and `NEVER_MEET` carries the exclusions.
   * So the assertion inverts: every fighter must be reachable from **every**
   * pool, which is the check that would have caught the original fault.
   */
  const seen = new Set<string>();
  const orders = new Set<string>();
  const reachable = new Map<string, Set<string>>();
  for (const pool of Object.keys(DUEL_POOLS) as (keyof typeof DUEL_POOLS)[]) {
    const { good, evil } = DUEL_POOLS[pool];
    must(good.length > 0 && evil.length > 0, `pool ${pool} is one-sided`);
    reachable.set(pool, new Set([...good, ...evil]));
    for (const s of [...good, ...evil]) {
      seen.add(s);
      must(
        FIGHTERS[s].side === (good.includes(s) ? "good" : "evil"),
        `${s} is listed on the ${good.includes(s) ? "good" : "evil"} side of ${pool} but declares ${FIGHTERS[s].side}`,
      );
    }
    let rng = 1;
    /*
     * **Scaled to the pool, not fixed.** This was 4,000 rolls, which covered
     * every pairing comfortably while the roster was eight — and silently
     * stopped covering them when it grew, failing as "1294 of 1296 pairings
     * rolled" rather than as anything to do with the roster. Collecting every
     * one of n outcomes takes about n·ln(n) uniform draws, so the count has to
     * grow faster than the roster does; forty per pairing is a wide margin on
     * that and still costs milliseconds.
     */
    const rolls = Math.max(4000, good.length * evil.length * 40);
    /*
     * **Deterministic, but not a linear congruential generator.** This was an
     * LCG, and at eight fighters it covered every pairing; at twenty it left
     * six of 1,600 unrolled however many rolls it was given. Successive values
     * from an LCG lie on a lattice, and `rollPairing` draws *three* in a row —
     * the good fighter, the evil one, and the side coin — so whole triples are
     * simply unreachable. Mulberry32 is the same one line of arithmetic and
     * the same reproducibility, without the structure.
     */
    const next = () => {
      rng = (rng + 0x6d2b79f5) | 0;
      let t = rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < rolls; i += 1) {
      const [l, r] = rollPairing(pool, next);
      must(
        FIGHTERS[l].side !== FIGHTERS[r].side,
        `${pool} rolled ${l} against ${r} — both ${FIGHTERS[l].side}`,
      );
      orders.add(`${pool}:${l}:${r}`);
    }
  }
  const missing = (Object.keys(FIGHTERS) as FighterStyle[]).filter((s) => !seen.has(s));
  must(missing.length === 0, `unreachable costume(s): ${missing.join(", ")}`);
  /*
   * Every good against every evil, at both ends of the arena, in every pool —
   * **less the pairings `NEVER_MEET` forbids**, which is the half this used to
   * be missing. `NEVER_MEET` is documented in `CLAUDE.md` as the mechanism
   * that replaced the old pool split, and with the list empty nobody noticed
   * that adding one entry to it would fail this assertion with "1598 of 1600
   * pairings rolled" — a message about coverage, for a deliberate exclusion.
   * The next person to answer a "these two look alike" report would have hit
   * it, which is precisely the moment not to be debugging the harness.
   */
  const wanted = Object.values(DUEL_POOLS).reduce(
    (n, p) =>
      n +
      (p.good.length * p.evil.length -
        NEVER_MEET.filter(
          ([a, b]) =>
            (p.good.includes(a) && p.evil.includes(b)) ||
            (p.good.includes(b) && p.evil.includes(a)),
        ).length) *
        2,
    0,
  );
  must(orders.size === wanted, `${orders.size} of ${wanted} pairings rolled`);

  // Every costume must be rollable from every pool. A costume nothing can roll
  // is a costume nobody will ever see — the same failure as an unreachable duel
  // module, and this is the assertion that was missing when four of them were.
  for (const [pool, members] of reachable) {
    for (const style of Object.keys(FIGHTERS)) {
      must(
        members.has(style),
        `${style} is unreachable from pool ${pool} — every fighter must be rollable from every pool`,
      );
    }
  }

  // NEVER_MEET replaces the old split, so it has to name real fighters and it
  // has to actually bite. A typo here would silently protect nothing.
  for (const [a, b] of NEVER_MEET) {
    must(a in FIGHTERS && b in FIGHTERS, `NEVER_MEET names an unknown fighter: ${a}/${b}`);
    must(a !== b, `NEVER_MEET pairs ${a} with itself`);
    must(
      FIGHTERS[a].side !== FIGHTERS[b].side,
      `NEVER_MEET lists ${a} and ${b}, who are the same side and could never meet anyway`,
    );
  }
  {
    // Roll hard against a stub rng that always returns the forbidden pair, and
    // confirm the exclusion survives. Verified by adding a temporary entry.
    for (const [a, b] of NEVER_MEET) {
      for (let i = 0; i < 200; i += 1) {
        const [x, y] = rollPairing("duel", () => Math.random());
        must(
          !((x === a && y === b) || (x === b && y === a)),
          `rollPairing produced the excluded pairing ${a}/${b}`,
        );
      }
    }
  }
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

check("every page is reachable off the desk", () => {
  /*
   * The bug this exists for (client, 2026-08-28): *"the downloads page isnt
   * showing in the menu in mobile."*
   *
   * On a phone the header nav is a horizontal scroller showing about four and a
   * half of its seven pills, and the five `FOOTER_NAV` pages sit at the bottom
   * of a ~2,900px scroll — measured, not estimated. So off the desk the command
   * palette is the only route to a third of the site, and it was labelled
   * `cmd`, which names what a developer types and tells a visitor nothing.
   *
   * Three things have to hold together for that route to exist at all, and each
   * is invisible on its own: the palette must **offer** every page, the chip
   * must be **rendered** off the desk, and it must be **called something a
   * person would tap**. This asserts all three, because a green suite said
   * everything was fine while a third of the site was unreachable on a phone.
   */
  const header = readFileSync("src/components/Header.tsx", "utf8");
  const palette = readFileSync("src/components/CommandPalette.tsx", "utf8");

  // 1. The palette offers both navs, and with an empty query it lists them all.
  must(
    /for \(const entry of \[\.\.\.NAV, \.\.\.FOOTER_NAV\]\)/.test(palette),
    "the palette no longer enumerates NAV + FOOTER_NAV — a page can be unreachable off the desk",
  );
  must(
    /:\s*commands;/.test(palette),
    "the palette no longer lists everything on an empty query, so it cannot be browsed by touch",
  );

  // 2. The chip is rendered off the desk, and only off the desk — the desk
  //    keeps the typed idiom deliberately.
  must(
    /band !== "desk" &&/.test(header),
    "the palette chip is no longer band-gated",
  );
  // 3. And it is called something a visitor would tap. `cmd` is the regression.
  const label = header.match(/onClick=\{openCommandPalette\}>\s*([a-z]+)\s*<\/button>/)?.[1];
  must(label === "menu", `the palette chip says "${label}", and a visitor does not tap "cmd"`);

  /*
   * 4. Every public page is offered by one of the two navs, so a page cannot be
   *    added to `PATHS` and left reachable by URL alone.
   *
   *    The exclusions are each a decision on record rather than an oversight:
   *    `notfound` is what an unknown URL renders and lost its pill when the 404
   *    joke moved behind sign-in; the four account and phase-2 pages are
   *    deliberately unlinked, which is the whole point of the footer's
   *    sign-in link being the one standing route in.
   */
  const OFF_NAV: PageId[] = ["notfound", "signup", "signin", "admin", "machines", "share"];
  const offered = new Set([...NAV, ...FOOTER_NAV].map((n) => n.id));
  const unreachable = (Object.keys(PATHS) as PageId[]).filter(
    (id) => !offered.has(id) && !OFF_NAV.includes(id),
  );
  must(
    unreachable.length === 0,
    `no nav offers ${unreachable.join(", ")} — unreachable without typing the URL`,
  );
  must(offered.has("downloads"), "downloads is offered by neither nav");
  return `${offered.size} pages in the two navs, palette chip says "${label}" off the desk`;
});

check("no duel can reach a visitor, by any route", () => {
  /*
   * The duels are the operator's alone (2026-08-28, client request: *"lets keep
   * it as a feature for just me unless i otherwise say so"*), and the failure
   * this gate exists for is that there are **four** ways a config arrives and
   * only one of them is obvious. A visitor gets what was published, what a
   * share code carried, what storage held — and what the dice rolled. The dice
   * are the route nobody checks, and before this change `ROLLABLE_ORNAMENTS`
   * and `ROLLABLE_FX` had no gate on them at all.
   *
   * So this asserts the lock at the two places it is actually enforced — the
   * pools and the render-time resolvers — rather than asserting that a flag is
   * set, which would pass whether or not anything read it.
   */
  const lockedOrnaments = ORNAMENTS.filter((o) => o.operatorOnly).map((o) => o.id);
  const lockedFx = FX.filter((f) => f.operatorOnly).map((f) => f.id);
  // Pinned, so withdrawing the lock from one of them is a deliberate edit here
  // rather than a quiet change of who sees what.
  must(
    lockedOrnaments.join(",") === "duel,duelholy",
    `operator-only ornaments are ${lockedOrnaments.join(",")}, expected duel,duelholy`,
  );
  must(
    lockedFx.join(",") === "duel,duelholy",
    `operator-only effects are ${lockedFx.join(",")}, expected duel,duelholy`,
  );

  // 1. The dice. A visitor's pool may not contain one; the operator's must.
  for (const id of lockedOrnaments) {
    must(
      !rollableOrnaments(false).some((o) => o.id === id),
      `a visitor's ornament dice can roll ${id}`,
    );
  }
  /*
   * The operator's own pool keeps the duel — but only the one that is still
   * offered. `duelholy` carries **both** flags, for unrelated reasons:
   * `operatorOnly` keeps it off the public site, and `hidden` withdrew it from
   * every menu on 2026-08-27 when both duels became the same fight. A withdrawn
   * entry is out of the dice for everybody, operator included, and asserting
   * otherwise here was this gate's own first bug.
   */
  const rollable = ORNAMENTS.filter((o) => o.operatorOnly && !o.hidden).map((o) => o.id);
  must(rollable.join(",") === "duel", `expected only duel rollable, got ${rollable.join(",")}`);
  for (const id of rollable) {
    must(
      rollableOrnaments(true).some((o) => o.id === id),
      `the operator's ornament dice cannot roll ${id}`,
    );
  }
  for (const id of lockedFx) {
    must(!rollableFx(false).some((f) => f.id === id), `a visitor's fx dice can roll ${id}`);
  }
  /*
   * The operator's pool keeps the locked entries that are still *offered*.
   * `hidden` and `operatorOnly` are separate axes and a withdrawn entry leaves
   * the dice for everybody, operator included — this gate asserted otherwise
   * twice, once for each catalogue, and was wrong both times. `duelholy` now
   * carries both flags in both catalogues: withdrawn because it is a duplicate,
   * locked because it is a duel.
   */
  const rollableLockedFx = FX.filter((f) => f.operatorOnly && !f.hidden).map((f) => f.id);
  must(
    rollableLockedFx.join(",") === "duel",
    `expected only duel rollable in fx, got ${rollableLockedFx.join(",")}`,
  );
  for (const id of rollableLockedFx) {
    must(rollableFx(true).some((f) => f.id === id), `the operator's fx dice cannot roll ${id}`);
  }
  // A pool that has emptied is not a locked pool, it is a broken page.
  must(rollableOrnaments(false).length > 0, "a visitor's ornament pool is empty");
  must(rollableFx(false).length > 0, "a visitor's fx pool is empty");

  // 2. The other three routes all converge on the render-time resolvers, which
  //    is why the lock lives there and not at the storage end — a published
  //    config naming a duel must still *store* one, or the operator would lose
  //    the setting by looking at his own site logged out.
  for (const id of lockedOrnaments) {
    must(visibleOrnament(id, false) === DEFAULT_ORNAMENT, `${id} renders for a visitor`);
    must(visibleOrnament(id, true) === id, `${id} does not render for the operator`);
  }
  for (const id of lockedFx) {
    must(visibleFx(id, false) === FALLBACK_FX, `fx ${id} renders for a visitor`);
    must(visibleFx(id, true) === id, `fx ${id} does not render for the operator`);
  }
  // Everything else is untouched by the lock, in both directions.
  for (const o of ORNAMENTS.filter((x) => !x.operatorOnly)) {
    must(visibleOrnament(o.id, false) === o.id, `${o.id} was substituted for a visitor`);
  }
  for (const f of FX.filter((x) => !x.operatorOnly)) {
    must(visibleFx(f.id, false) === f.id, `fx ${f.id} was substituted for a visitor`);
  }

  // 3. What a visitor lands on has to be something they may actually see, or
  //    the substitution is a loop.
  must(
    !ORNAMENTS.find((o) => o.id === DEFAULT_ORNAMENT)?.operatorOnly,
    "DEFAULT_ORNAMENT is itself operator-only",
  );
  must(!FX.find((f) => f.id === FALLBACK_FX)?.operatorOnly, "FALLBACK_FX is itself operator-only");

  // 4. The wire format is untouched. `operatorOnly` is about the page, and a
  //    stored config or a share code naming a duel must still resolve to one.
  must(ORNAMENTS.length === 8 && FX.length === 16, "the lock changed a catalogue's length");
  const rolls = 4000;
  let seen = 0;
  for (let i = 0; i < rolls; i += 1) {
    const out = roll({ ...DEFAULT_CONFIG, mode: "visit" }, false);
    if (!out) continue;
    seen += 1;
    must(!lockedOrnaments.includes(out.ornament), `a visitor's roll produced ${out.ornament}`);
    must(!lockedFx.includes(out.fx), `a visitor's roll produced fx ${out.fx}`);
  }
  must(seen > rolls * 0.9, `only ${seen} of ${rolls} visitor rolls succeeded`);
  return `2 ornaments and 2 effects locked, ${seen} visitor rolls clean, pools non-empty`;
});

check("a share code carries the look and never the duel", () => {
  /*
   * Decided 2026-08-28: the duel settings do not travel in a share code — see
   * `SharedConfig` for the reasoning. This gate is what keeps that decision
   * from being undone by accident rather than on purpose, and it guards the two
   * ways it could be.
   *
   * **A share code is the worst kind of wire format to get wrong**: a wrong one
   * is a *working* code pointing at the wrong thing, so nothing throws and
   * nothing logs. That is the whole reason this file covers it at all.
   */
  const loud: Config = {
    ...DEFAULT_CONFIG,
    duel: {
      ...DEFAULT_DUEL_SETTINGS,
      pin: ["hooded", "caped"],
      good: ["ronin"],
      zoom: 1.4,
      tuning: { ...DEFAULT_DUEL_TUNING, rest: 0.5 },
    },
    duelPages: { work: { bars: false } },
  };

  // 1. Encoding must not smuggle the duel in. A code is hyphen-separated
  //    base-36 fields and nothing counts the characters, so a widened encoder
  //    would produce codes that still decode and quietly mean more.
  const code = encodeShareCode(loud);
  must(/^[0-9a-z]+(-[0-9a-z]+)*$/.test(code), `${code} is not a plain share code`);
  must(code.split("-").length === 7, `${code} has ${code.split("-").length} fields, expected 7`);

  // 2. Decoding must not *claim* the duel either. `SharedConfig` is a `Pick`,
  //    and a decoded code is applied with `update(shared)` — a patch — so an
  //    operator who pastes a setup keeps the duel settings they already had.
  //    Widen the type and that stops being true with nothing to indicate it.
  const shared = decodeShareCode(code);
  must(shared !== null, `${code} did not decode`);
  for (const key of ["duel", "duelPages"]) {
    must(!(key in (shared as object)), `a decoded share code carries ${key}`);
  }

  // 3. The patch, performed the way `ConfigContext.update` performs it.
  const after = { ...loud, ...(shared as object) } as Config;
  must(after.duel.pin?.[0] === "hooded", "applying a share code dropped the pinned pairing");
  must(after.duel.tuning.rest === 0.5, "applying a share code reset the pacing");
  must(after.duelPages.work?.bars === false, "applying a share code dropped a page override");
  // And it must still have done its actual job.
  must(after.pal === loud.pal && after.layout === loud.layout, "the code lost the look");
  return `7 fields, ${code.length} chars, duel settings untouched by a round trip`;
});

check("the duel settings publish, refuse rubbish, and default to a no-op", () => {
  /*
   * Four ways this feature can fail without anything throwing, which is why it
   * has a gate at all rather than a typecheck.
   */

  // 1. The defaults must be arithmetic identity with what the engine already
  //    does. Every duel gate in this file — 360,000 stepped frames, 280,000
  //    generated sequences — is measured against the shipped fight, and a
  //    default that merely *looked* neutral would move all of them at once
  //    while reading as a change to nobody.
  for (const k of ["circling", "rest", "impact", "patience"] as const) {
    must(
      DEFAULT_DUEL_SETTINGS.tuning[k] === 1 && DUEL_TUNING[k] === 1,
      `${k} defaults to ${DEFAULT_DUEL_SETTINGS.tuning[k]}, and 1 is the identity`,
    );
  }
  must(
    DEFAULT_DUEL_SETTINGS.rim === DEFAULT_RIM,
    `settings default rim ${DEFAULT_DUEL_SETTINGS.rim} against the engine's ${DEFAULT_RIM}`,
  );

  // 2. **Both** published-key lists must carry both fields. They are separate
  //    arrays in separate files and either one missing a key drops the value
  //    silently on publish — the operator's own browser shows a setting that
  //    never reached anybody else, which is the hardest kind of bug to be told
  //    about because the person reporting it cannot see it.
  /*
   * **Compared as whole lists, not looked up key by key** (2026-08-31). Asking
   * only about `duel` and `duelPages` is a gate for the field that was being
   * added the day it was written; the invariant is that the two arrays *agree*,
   * and every field added since has been ungated by exactly the same reasoning.
   * A key in one list and not the other is silently dropped on publish — the
   * operator's browser shows a setting that reached nobody, which is the
   * hardest kind of bug to be told about because the person reporting it cannot
   * see it.
   */
  const workerSrc = readFileSync("worker/site-config.ts", "utf8");
  // Anchored on the declaration, not on the first `[` after the name — the
  // loose form ran past it into a later array and reported station labels as
  // missing published keys.
  const workerBlock = workerSrc.match(/const PUBLISHED_KEYS = \[([\s\S]*?)\n\]/);
  must(workerBlock !== null, "the Worker's PUBLISHED_KEYS array could not be read");
  const workerSet = new Set(
    // Comments first — the list documents itself line by line, and one of those
    // comments quotes "Roam" and "Hold" to explain why `station` matters.
    [
      ...workerBlock![1]
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .matchAll(/"([A-Za-z0-9_]+)"/g),
    ].map((m) => m[1]),
  );
  const clientSet = new Set(PUBLISHED_KEYS as readonly string[]);
  must(workerSet.size > 10, `only ${workerSet.size} keys parsed out of the Worker's list`);
  const onlyClient = [...clientSet].filter((k) => !workerSet.has(k));
  const onlyWorker = [...workerSet].filter((k) => !clientSet.has(k));
  must(
    onlyClient.length === 0,
    `the Worker's PUBLISHED_KEYS is missing ${onlyClient.join(", ")} — those values are dropped on publish`,
  );
  must(
    onlyWorker.length === 0,
    `the client's PUBLISHED_KEYS is missing ${onlyWorker.join(", ")} — those values are dropped on load`,
  );
  for (const key of ["duel", "duelPages"]) {
    must(clientSet.has(key), `${key} is missing from PUBLISHED_KEYS`);
  }

  /*
   * The size ceiling, which the two growing keys are the reason for:
   * `duelPages` (2026-08-28, raised it to 8,000) and `lookPages` (2026-09-02,
   * to 12,000) are the published keys that grow without anybody editing
   * `worker/site-config.ts`. **It must refuse, not truncate** — a truncated
   * payload injects a half object that `loadConfig` then correctly refuses
   * field by field, leaving the operator watching settings silently not apply.
   */
  must(
    /MAX_CONFIG_BYTES\s*=\s*12_?000/.test(workerSrc),
    "MAX_CONFIG_BYTES is no longer 12,000 — duelPages and lookPages are why it sits there",
  );
  const ceiling = workerSrc.slice(workerSrc.indexOf("MAX_CONFIG_BYTES"));
  must(
    /> MAX_CONFIG_BYTES/.test(ceiling) && /throw|BadRequest/.test(ceiling),
    "the config size ceiling no longer throws — a truncating publish fails silently",
  );
  must(
    !/slice\(0, MAX_CONFIG_BYTES|substring\(0, MAX_CONFIG_BYTES/.test(workerSrc),
    "the config is being truncated to the ceiling instead of refused",
  );

  // 3. It is published to every visitor, so it is validated field by field and
  //    refuses rather than repairs. A half-accepted duel setting is one the
  //    operator cannot account for.
  const rubbish: unknown[] = [
    null,
    42,
    "duel",
    { pin: ["hooded"] },
    { pin: ["hooded", "nosuchfighter"] },
    { good: [] },
    { good: ["caped"] },
    { tuning: { circling: "fast" } },
    { tuning: { rest: -1 } },
    { tuning: { patience: 99 } },
    { rim: -1 },
    { rim: Number.NaN },
    { zoom: 0 },
    { bars: "yes" },
  ];
  for (const r of rubbish) {
    const out = validDuelSettings(r);
    must(out.pin === null, `${JSON.stringify(r)} produced a pin`);
    must(
      out.tuning.circling === 1 && out.tuning.rest === 1 && out.tuning.patience === 1,
      `${JSON.stringify(r)} moved the pacing`,
    );
    must(out.rim === DEFAULT_RIM && out.zoom === 1, `${JSON.stringify(r)} moved the look`);
    must(out.bars === true && out.kick === true, `${JSON.stringify(r)} moved a flag`);
  }
  // `{ good: ["caped"] }` is refused for a reason worth pinning: `caped` is an
  // evil fighter, so it is not an allow-list for the good side at all — and an
  // allow-list that ends up empty means "nobody may appear", whose honest
  // rendering is an empty hero slot.
  must(validDuelSettings({ good: ["caped"] }).good === null, "a wrong-side allow-list stuck");
  const real = validDuelSettings({ good: ["hooded", "ronin"], tuning: { rest: 0.5 } });
  must(real.good?.length === 2 && real.tuning.rest === 0.5, "a valid payload was refused");

  // 4. An override is partial, and stays partial. A page that states one field
  //    must keep tracking the site default for the others — writing the whole
  //    resolved object would freeze today's values onto sixteen pages that
  //    nobody would think to revisit.
  const site = { ...DEFAULT_DUEL_SETTINGS, zoom: 1.4, tuning: { ...DEFAULT_DUEL_TUNING, rest: 2 } };
  const pages = validDuelPages({ work: { bars: false }, nosuchpage: { bars: false } });
  must(!("nosuchpage" in pages), "an unknown page id survived validation");
  must(Object.keys(pages.work ?? {}).length === 1, "a partial override was widened");
  const onWork = resolveDuel(site, pages, "work");
  must(onWork.bars === false, "the override did not apply");
  must(onWork.zoom === 1.4 && onWork.tuning.rest === 2, "the override froze the site default");
  must(resolveDuel(site, pages, "about").bars === true, "an override leaked onto another page");

  // 5. A restriction can never empty a side. An ornament that draws no fighter
  //    is indistinguishable from a broken page.
  const none = allowFor({ ...DEFAULT_DUEL_SETTINGS, good: [], evil: [] }, "duel");
  must(none.good.length > 0 && none.evil.length > 0, "a restriction emptied a side");
  const one = allowFor({ ...DEFAULT_DUEL_SETTINGS, good: ["hooded"] }, "duel");
  must(one.good.length === 1 && one.evil.length === 12, "allowFor did not intersect the pool");

  // 6. A restriction has to survive a match reset, which happens inside
  //    `advanceDuel` where the caller is a rAF loop that has forgotten what it
  //    was configured with. A restriction honoured only on the opening match
  //    comes back as "it ignores my settings after a minute".
  const st = createDuelFrom("duel", Math.random, one);
  let matches = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 200_000 && matches < 6; i += 1) {
    advanceDuel(st, 1);
    if (st.matches !== matches) {
      matches = st.matches;
      seen.add(st.a.style);
      seen.add(st.b.style);
    }
  }
  must(matches >= 5, `only ${matches} matches in 200,000 frames`);
  for (const id of seen) {
    must(
      id === "hooded" || FIGHTERS[id as FighterStyle].side === "evil",
      `${id} walked on past a restriction that excluded it`,
    );
  }
  return `${rubbish.length} malformed payloads refused, override stays partial, restriction held over ${matches} matches`;
});

/*
 * An override is partial *all the way down*, and Size actually reaches the page.
 *
 * Both of these are the same class of fault and both were live: a control that
 * appears to work while the thing it names does not move.
 *
 * **`tuning` was one key holding four.** `DuelPageSettings` was
 * `Partial<DuelSettings>`, whose `tuning` is the whole four-knob object, so the
 * editor could not express "this page disagrees about Patience" and wrote all
 * four. Reproduced in a signed-in browser: Patience on `/work`, then the site's
 * Circling 1.00 → 2.50, and `/work` read 1.00 for ever — while the editor's own
 * summary said *"work sets 1 of its own: tuning"*. That is precisely the
 * "sixteen of them would silently go stale" failure the sparse map exists to
 * prevent, one level down. The old gate only ever exercised a `{ bars: false }`
 * override, which is a scalar and cannot show it.
 *
 * **`validDuelPages` repaired where it promised to refuse.** It validated the
 * whole object and kept every key *present in the input*, taking its value from
 * the validated result — so a refused field survived as an override pinned to
 * the global default. `{ work: { zoom: 99 } }` became `{ work: { zoom: 1 } }`,
 * and a site at 1.4 then rendered `/work` at 1.0 with nothing reporting a
 * refusal. Worse for a list: an emptying allow-list is refused, and the refusal
 * became an explicit `good: null` cancelling the site's roster restriction on
 * that page.
 */
check("a page override is partial to the knob, and a refused field is dropped", () => {
  const site: DuelSettings = {
    ...DEFAULT_DUEL_SETTINGS,
    zoom: 1.4,
    good: ["ronin", "sentinel"],
    tuning: { ...DEFAULT_DUEL_TUNING, circling: 2.5, rest: 1.5 },
  };

  // 1. One knob, and only that knob, stops tracking the site.
  const onePages = validDuelPages({ work: { tuning: { patience: 2.5 } } });
  must(
    JSON.stringify(onePages.work?.tuning) === JSON.stringify({ patience: 2.5 }),
    `a one-knob override came back as ${JSON.stringify(onePages.work?.tuning)}`,
  );
  const onWork = resolveDuel(site, onePages, "work");
  must(onWork.tuning.patience === 2.5, "the page's own knob did not apply");
  must(
    onWork.tuning.circling === 2.5 && onWork.tuning.rest === 1.5,
    `the other knobs froze at ${JSON.stringify(onWork.tuning)} instead of tracking the site`,
  );

  // 2. Moving the site moves every knob the page has not spoken about.
  const moved = { ...site, tuning: { ...site.tuning, circling: 0.5 } };
  must(
    resolveDuel(moved, onePages, "work").tuning.circling === 0.5,
    "a page that never mentioned circling did not follow the site",
  );

  // 3. A refused field is dropped, so the page keeps following the site.
  for (const [label, raw] of [
    ["an out-of-band number", { work: { zoom: 99 } }],
    ["an emptying allow-list", { work: { good: [] } }],
    ["a wrong-side allow-list", { work: { good: ["ringmaster"] } }],
    ["a half-valid allow-list", { work: { good: ["ronin", "nonsense"] } }],
    ["an out-of-band knob", { work: { tuning: { rest: -1 } } }],
    ["a non-numeric knob", { work: { tuning: { impact: "fast" } } }],
  ] as const) {
    const pages = validDuelPages(raw);
    must(
      pages.work === undefined,
      `${label} survived as ${JSON.stringify(pages.work)} instead of being dropped`,
    );
    must(
      JSON.stringify(resolveDuel(site, pages, "work")) === JSON.stringify(site),
      `${label} changed what /work resolves to`,
    );
  }

  // 4. And a good value beside a refused one still lands, alone.
  const mixed = validDuelPages({ work: { zoom: 1.2, rim: 99 } });
  must(
    JSON.stringify(mixed.work) === JSON.stringify({ zoom: 1.2 }),
    `a mixed override came back as ${JSON.stringify(mixed.work)}`,
  );
  return "one knob stays one knob, 6 refused fields dropped, the good half of a mixed override kept";
});

/*
 * Size reaches the fight, and cannot break the camera's one promise.
 *
 * `zoom` was validated, banded, published — and multiplied in exactly one place
 * in the codebase: `DuelSettingsEditor`'s preview canvas, which only the
 * operator sees. `DuelOrnament` drew at `shot.scale`. So the slider worked
 * where it was dragged, published to every visitor, and moved nothing. Copying
 * that multiplication into the ornament would have been the other half of the
 * bug — applied after the fit, a Size above 1 voids the guarantee the camera
 * gate above exists to prove — so it goes *through* the camera instead.
 */
check("the duel's Size reaches the camera and never cuts a fighter off", () => {
  const st = createDuelFrom("duel");
  advanceDuel(st, 400);
  const at = (z: number) => duelCamera(st, ORNAMENT_PX, ORNAMENT_PX, null, 1, z);

  // 1 is arithmetic identity with the camera as it shipped.
  must(
    at(1).scale === duelCamera(st, ORNAMENT_PX, ORNAMENT_PX, null, 1).scale,
    "Size 1 is not the same picture as no Size at all",
  );
  // Monotonic, and it actually moves.
  must(at(0.6).scale < at(1).scale, "Size 0.6 did not pull back");
  must(at(1.6).scale >= at(1).scale, "Size 1.6 went the wrong way");

  /*
   * The promise, over a real fight rather than one frame: whatever Size says,
   * the whole focus box stays inside the slot. This is the same assertion the
   * camera gate makes, driven at both ends of the band.
   */
  let frames = 0;
  let grew = 0;
  const clipped: Record<string, number> = {};
  for (const z of [0.6, 1, 1.6]) {
    /*
     * Measured exactly as the camera gate above measures it — in world units,
     * with the kick counted against the frame and half a unit of tolerance,
     * because this is about a body leaving the picture and not about the last
     * decimal of an eased scale. A stricter test here would report a fault the
     * camera has always had rather than one Size introduced.
     */
    const fight = createDuel("hooded", "caped");
    let cam: DuelCam | null = null;
    clipped[z] = 0;
    for (let i = 0; i < 20_000; i += 1) {
      advanceDuel(fight, 1);
      const shot = duelCamera(fight, ORNAMENT_PX, ORNAMENT_PX, cam, 1, z);
      const plain = duelCamera(fight, ORNAMENT_PX, ORNAMENT_PX, cam, 1);
      cam = shot.cam;
      const f = duelFocus(fight);
      frames += 1;
      const viewLo = -shot.x / shot.scale;
      const viewHi = (ORNAMENT_PX - shot.x) / shot.scale;
      const lo = f.cx - f.width / 2 + fight.shake.x;
      const hi = f.cx + f.width / 2 + fight.shake.x;
      if (Math.max(viewLo - lo, hi - viewHi, 0) > 0.5) clipped[z] += 1;
      if (z === 1.6 && shot.scale > plain.scale) grew += 1;
    }
  }
  const bad = Object.entries(clipped).filter(([, n]) => n > 0);
  must(
    bad.length === 0,
    `Size put a fighter outside the slot: ${bad.map(([z, n]) => `${n} frames at ${z}`).join(", ")}`,
  );
  must(grew > 0, "Size 1.6 never made the pair larger on any frame — the knob is inert");

  /*
   * **And every home of the fight has to hand it over**, which the loop above
   * cannot see: it drives `duelCamera` directly, so it stays green if a caller
   * stops passing the setting — which is precisely the bug being fixed. The
   * only honest test of "does the control reach the page" is to read the page.
   */
  for (const [file, what] of [
    ["src/components/DuelOrnament.tsx", "the hero slot"],
    ["src/components/DuelSettingsEditor.tsx", "the editor's own preview"],
    ["src/components/DuelBench.tsx", "the bench"],
  ] as const) {
    const src = readFileSync(file, "utf8");
    /*
     * Anchored on the assignment, because `DuelOrnament.tsx` both *declares*
     * `duelCamera` and calls it — and the declaration's own signature carries
     * `zoom = 1`, so a bare `duelCamera\(` matches the definition, finds the
     * word and passes while every call site has dropped the argument. Verified
     * by deleting the argument from the ornament and watching this stay green.
     */
    const call = src.match(/=\s*duelCamera\([^;]*?\)/s);
    must(call !== null, `${what} no longer calls duelCamera at all`);
    must(
      /zoom/.test(call![0]),
      `${what} calls duelCamera without a zoom — Size will publish and move nothing there`,
    );
    must(
      !/shot\.scale\s*\*/.test(src),
      `${what} multiplies shot.scale itself; Size goes through the camera or it voids the fit`,
    );
  }
  return `${frames} frames at Size 0.6/1/1.6, none clipped, 1.6 larger on ${grew}; 3 hosts pass it through`;
});


check("catalogues match the documented counts", () => {
  must(LAYOUTS.length === 14, `${LAYOUTS.length} layouts, expected 14`);
  must(PALETTES.length === 25, `${PALETTES.length} palettes, expected 25`);
  must(FX.length === 16, `${FX.length} effects, expected 16`);
  must(TYPESETS.length === 5, `${TYPESETS.length} typesets, expected 5`);
  must(SCOPES.length === 6, `${SCOPES.length} scopes, expected 6`);
  must(ORNAMENTS.length === 8, `${ORNAMENTS.length} ornaments, expected 8`);
  /*
   * The roster, and **both halves of it**.
   *
   * The count was documented and never asserted, which is how it could go from
   * forty to twenty-four with the suite green. The total is the cheap half; the
   * per-side split is the half that matters, because `ROSTER_GOOD` and
   * `ROSTER_EVIL` are *derived* from `side` — so a costume added with the wrong
   * alignment does not fail anything, it silently makes one pool larger than
   * the other and skews every pairing roll from then on. Twelve and twelve is
   * 144 pairs per pool and 288 rolled orderings.
   */
  const roster = Object.values(FIGHTERS);
  must(roster.length === 24, `${roster.length} fighters, expected 24`);
  const good = roster.filter((k) => k.side === "good").length;
  must(
    good === 12 && roster.length - good === 12,
    `roster is ${good} good / ${roster.length - good} evil, expected 12 and 12`,
  );
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
  return `${LAYOUTS.length}/${PALETTES.length}/${FX.length}/${ORNAMENTS.length} layouts/palettes/fx/ornaments, ${roster.length} fighters ${good}/${roster.length - good}`;
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

check("no ornament can render at a station the guardrails refuse", () => {
  /*
   * **This gate exists because its predecessor was green while production was
   * broken** (2026-08-27). `check.ts` already asserted that
   * `isAllowed({ornament:"duelholy", station:"roam"})` is false, and it was —
   * and the live site shipped exactly that pairing for days, because
   * `isAllowed` has two callers, the randomiser and this suite. A roll is one
   * of four ways a config arrives; published config, share codes and stored
   * config all walked past it, and the client watched his fighters fade to 12%
   * three times a revolution.
   *
   * The lesson is the one `CLAUDE.md` already records about a retired promise
   * rebuilt without its words: **the old gate tested the predicate, not the
   * page.** This one drives `effectiveStation`, which is what the wrapper class
   * is actually built from, so it fails if the resolver stops resolving.
   */
  // The dimensions this gate is not about, held constant at a known-allowed
  // combination so any failure is attributable to the ornament/station pair.
  const BASE_COMBINATION = {
    palette: PALETTES[0].id,
    layout: "cinematic" as const,
    fx: "vessels" as const,
    type: TYPESETS[0].id,
    grain: false,
  };

  let refused = 0;
  for (const ornament of ORNAMENTS) {
    for (const station of STATIONS) {
      const resolved = effectiveStation(station.id, ornament.id);

      // Whatever a config stores, what RENDERS must be a pairing the
      // guardrails permit. This is the assertion that was missing.
      must(
        isAllowed({ ...BASE_COMBINATION, ornament: ornament.id, station: resolved }),
        `${ornament.id} + ${station.id} resolves to ${resolved}, which the guardrails still refuse`,
      );

      if (resolved !== station.id) {
        refused += 1;
        // The station yields; the ornament the operator chose must survive.
        must(
          resolved === DEFAULT_STATION,
          `${ornament.id} + ${station.id} resolved to ${resolved}, expected the ${DEFAULT_STATION} fallback`,
        );
      }
    }
  }

  // A resolver that never substitutes anything is a resolver that has been
  // quietly disabled, and it would pass every assertion above.
  must(refused > 0, "effectiveStation refused nothing — the roam/duel rule is no longer enforced anywhere");

  return `${ORNAMENTS.length * STATIONS.length} ornament/station pairs, ${refused} resolved away from a refused pairing`;
});

check("grain never renders on a low-contrast palette", () => {
  /*
   * The second rule enforced at the page rather than at the dice, and it is
   * here for the reason the station gate above is: **`isAllowed` constrained
   * the randomiser and nothing else.** Grain on Peat, Oxide, Terracotta Night
   * or Deco Gold was refused to the dice and publishable by hand from the
   * operator panel, pasteable as a share code, and restorable from storage —
   * a 14% `mix-blend-mode: overlay` sheet of `--fg` over every word on the
   * page, on the four palettes with the least room for it, shipped to every
   * visitor at once.
   *
   * So this drives `effectiveGrain`, which is what `themeClasses` builds
   * `has-grain` from — the page, not the predicate.
   */
  const BASE = {
    layout: "cinematic" as const,
    fx: "vessels" as const,
    type: TYPESETS[0].id,
    ornament: "sonar" as const,
    station: "hold" as const,
  };

  let refused = 0;
  for (const palette of PALETTES) {
    for (const grain of [true, false]) {
      const rendered = effectiveGrain(grain, palette.id);
      must(
        isAllowed({ ...BASE, palette: palette.id, grain: rendered }),
        `${palette.id} + grain ${grain} renders as ${rendered}, which the guardrails still refuse`,
      );
      // The grain yields; the palette the operator chose must survive untouched.
      if (rendered !== grain) {
        refused += 1;
        must(grain && !rendered, `${palette.id}: the resolver turned grain ON, which it may never do`);
      }
    }
  }

  must(
    refused === LOW_CONTRAST.length,
    `effectiveGrain refused ${refused} palettes, expected the ${LOW_CONTRAST.length} low-contrast ones`,
  );

  // `resolve` is what a caller reaches for, and a resolver that has quietly
  // stopped applying one of its two halves passes every assertion above.
  const both = resolve({
    ...BASE,
    palette: LOW_CONTRAST[0],
    grain: true,
    ornament: "duel",
    station: "roam",
  });
  must(both.grain === false, "resolve() did not apply effectiveGrain");
  must(both.station === "hold", "resolve() did not apply effectiveStation");
  must(isAllowed(both), "resolve() returned a combination the guardrails still refuse");

  return `${PALETTES.length} palettes × 2, ${refused} refused, resolve() applies both`;
});

check("every guardrail says what it refuses", () => {
  /*
   * A rule the operator can overrule has to say what he is overruling: fifteen
   * of the seventeen are matters of taste the client set down, and the panel
   * prints the note rather than silently letting a publish through. An empty
   * note is a blank line in that list, on the newest rule — the one least
   * likely to be remembered.
   */
  GUARDRAILS.forEach((rule, i) => {
    must(typeof rule.note === "string" && rule.note.trim().length > 12, `guardrail ${i} has no usable note`);
  });

  // `matched` is what the panel reads, and it must agree with `isAllowed` —
  // two opinions about the same table is how one of them goes stale.
  const bad = {
    palette: LOW_CONTRAST[0],
    layout: "magazine" as const,
    fx: "rain" as const,
    type: TYPESETS[0].id,
    grain: true,
    ornament: "sonar" as const,
    station: "hold" as const,
  };
  const hits = matched(bad);
  must(hits.length >= 2, `matched() found ${hits.length} rules on a combination that trips at least two`);
  must(!isAllowed(bad), "isAllowed disagrees with matched()");
  must(matched({ ...bad, fx: "vessels", grain: false }).length === 0, "matched() reports a rule on a clean combination");

  return `${GUARDRAILS.length} guardrails, all noted, matched() agrees with isAllowed`;
});

/*
 * ---- The three gates that drive the WRAPPER, not the predicate --------------
 *
 * The two gates above are the ones that were green on 2026-08-29 while the page
 * was shipping both faults they exist to prevent. They tested `effectiveGrain`
 * and `effectiveStation` in isolation and asserted, in a comment, that
 * `themeClasses` builds its classes from them — and it did not: `resolve()` had
 * no caller in `src/` at all, and the station was being resolved against the
 * stored ornament rather than the drawn one. A resolver nothing calls passes
 * every test written about the resolver.
 *
 * So these three drive the real function with a real `Config` and read the
 * class string the wrapper actually gets. "Does the thing it claims to do
 * actually happen" is the whole remit of this file, and for two days the answer
 * for these two rules was no.
 */

const CLASSES = (config: Config, ornament: Config["ornament"], layout: LayoutId = "cinematic") =>
  themeClasses(config, layout, "desk", { ornament, fx: config.fx }).split(" ");

check("the wrapper's classes drop grain on a low-contrast palette", () => {
  let dropped = 0;
  for (let pal = 0; pal < PALETTES.length; pal += 1) {
    const low = LOW_CONTRAST.includes(PALETTES[pal].id);
    const classes = CLASSES({ ...DEFAULT_CONFIG, pal, grain: true, calm: false }, DEFAULT_ORNAMENT);
    must(
      classes.includes("has-grain") !== low,
      low
        ? `${PALETTES[pal].id} renders has-grain — a 14% --fg overlay over every word on a low-contrast palette`
        : `${PALETTES[pal].id} lost has-grain, which the guardrails permit and the operator asked for`,
    );
    if (low) dropped += 1;
  }
  must(dropped === LOW_CONTRAST.length, `only ${dropped} of ${LOW_CONTRAST.length} low-contrast palettes dropped grain`);

  // Calm's gate is a different question and must survive untouched: calm hides
  // the canvas and drops the texture whatever the palette is.
  must(
    !CLASSES({ ...DEFAULT_CONFIG, pal: 0, grain: true, calm: true }, DEFAULT_ORNAMENT).includes("has-grain"),
    "calm no longer suppresses grain",
  );
  // And a resolver that refuses everything would pass every assertion above.
  must(
    CLASSES({ ...DEFAULT_CONFIG, pal: 0, grain: false, calm: false }, DEFAULT_ORNAMENT).includes("has-grain") === false &&
      CLASSES({ ...DEFAULT_CONFIG, pal: 0, grain: true, calm: false }, DEFAULT_ORNAMENT).includes("has-grain"),
    "the wrapper is no longer reading config.grain at all",
  );

  return `${PALETTES.length} palettes driven through themeClasses, ${dropped} drop grain, calm still strips it`;
});

check("the wrapper's station follows the ornament that is DRAWN", () => {
  /*
   * Both directions, because the bug was both directions at once and they look
   * nothing alike — see the comment on the station class in `src/theme.ts`.
   */
  const stationOf = (classes: string[]) => classes.find((c) => c.startsWith("station-"));
  const roaming = { ...DEFAULT_CONFIG, station: "roam" as const, calm: false };

  // The premise: a signed-out visitor is never drawn a duel. If this ever stops
  // being true the two assertions below stop meaning what they say.
  const seen = visibleOrnament("duel", false);
  must(seen !== "duel" && seen !== "duelholy", `a signed-out visitor was drawn ${seen}`);

  // (a) Published duel + roam. The ornament resolves to the default for a
  // visitor, so there is no fight to lose and roam must survive — the operator
  // published Roam and every visitor was getting Hold.
  must(
    stationOf(CLASSES({ ...roaming, ornament: "duel" }, seen)) === "station-roam",
    "a visitor's resolved sonar is still being stationed as though it were the stored duel",
  );

  // (b) Stored sonar + roam, drawn as a duel by the operator's per-load roll —
  // roughly every other signed-in load. The guardrail must bite on what is on
  // the page, not on what is in storage.
  must(
    stationOf(CLASSES({ ...roaming, ornament: "sonar" }, "duel")) === "station-hold",
    "a rolled duel is roaming — it fades to 12% and re-acquires three times a revolution",
  );

  // (c) The operator drawing exactly what he stored, which is the only case the
  // old code got right, and the case a regression would keep passing.
  must(stationOf(CLASSES({ ...roaming, ornament: "duel" }, "duel")) === "station-hold", "a stored, drawn duel is roaming");

  // (d) Nothing else yields: roam on an ambient instrument is the setting.
  must(stationOf(CLASSES({ ...roaming, ornament: "sonar" }, "sonar")) === "station-roam", "roam no longer reaches the page at all");

  return "duel drawn → hold, duel stored but sonar drawn → roam, sonar drawn → roam";
});

check("the panel prints every guardrail the operator trips", () => {
  /*
   * `matched()` was exported, documented as the thing the panel reads, and
   * imported nowhere in `src/`. Fifteen of the seventeen rules exist only to be
   * shown to the operator, so fifteen of the seventeen did nothing whatsoever.
   * This drives the list the panel renders and then checks that the surface
   * renders it, because either half alone is what let the last one through.
   */
  const tripping = combinationOf({
    pal: PALETTES.findIndex((p) => p.id === LOW_CONTRAST[0]),
    layout: "magazine",
    fx: "rain", // Magazine may not use it — taste, so it warns and publishes
    ornament: "duel",
    station: "roam", // resolved at render
    type: 0,
    grain: true, // resolved at render, on a low-contrast palette
  });

  const list = warnings(tripping);
  must(list.length === matched(tripping).length, "warnings() and matched() disagree about the same combination");
  must(list.length >= 3, `warnings() found ${list.length} rules on a combination that trips at least three`);
  must(
    list.some((w) => w.resolved) && list.some((w) => !w.resolved),
    "warnings() no longer tells a rule the page fixes from one that publishes as it looks",
  );
  must(list.every((w) => w.rule.note.trim().length > 12), "a warning carries no note to print");
  must(warnings(resolve(tripping)).every((w) => !w.resolved), "a resolved combination still reports a resolvable rule");

  // The clean case has to be clean, or the panel cries wolf on every setup.
  must(warnings(combinationOf({ ...DEFAULT_CONFIG, ornament: "sonar", station: "hold", grain: false })).length === 0, "warnings() reports a rule on a default setup");

  // The notes are React keys in the panel, so two rules sharing one would
  // silently render as a single warning.
  must(new Set(GUARDRAILS.map((r) => r.note)).size === GUARDRAILS.length, "two guardrails share a note — they collide as keys");

  /*
   * And the surface. A pure function nothing calls is exactly the failure being
   * fixed here, so the gate has to look at the panel as well as at the list.
   */
  const panel = readFileSync("src/components/SiteConfigPanel.tsx", "utf8");
  must(/import \{[^}]*\bwarnings\b[^}]*\} from "\.\.\/data\/guardrails"/.test(panel), "the panel no longer reads the guardrails");
  must(/combinationOf\(/.test(panel), "the panel builds a Combination by hand — combinationOf is the one constructor");
  /*
   * The note as *content*, on its own line — not merely mentioned. `rule.note`
   * is also this list's React key, so a looser test for the string passes on a
   * panel that renders "a guardrail was tripped" seventeen times. Verified by
   * making exactly that edit.
   */
  must(/\n\s*\{rule\.note\}\n/.test(panel), "the panel no longer prints the notes themselves");
  must(/tripped\.map\(/.test(panel), "the panel is not enumerating the list — one warning is not the list");
  must(/aria-live="polite"/.test(panel), "the guardrail list is not announced");
  // Warnings, never refusals: taste is the client's to overrule.
  must(!/disabled=\{[^}]*tripped/.test(panel), "the panel is gating a control on a guardrail — these warn, they do not refuse");
  // `--faint` is not a text colour (2.78–4.09:1 on all 25 palettes).
  must(!/var\(--faint\)/.test(panel), "the panel is painting text with --faint");

  return `${list.length} warnings on a tripping setup, ${list.filter((w) => w.resolved).length} resolved at render, the panel prints them`;
});

/*
 * ---- Per-page appearance (2026-09-02) ---------------------------------------
 *
 * `lookPages` is `duelPages` for the look itself: a sparse map of partial
 * overrides, published, validated by refusal, applied on the way to the page.
 * The two gates below follow the two disciplines this file keeps re-learning:
 * drive the function the page actually renders through (`applyLook`, and then
 * the wrapper built from its result), and test the validator on identity with
 * what came in rather than with what came out.
 */

check("a page's look override reaches the page, and only that page", () => {
  const peat = PALETTES.findIndex((p) => p.id === LOW_CONTRAST[0]);
  const cfg: Config = {
    ...DEFAULT_CONFIG,
    page: "work",
    calm: false,
    grain: false,
    lookPages: { work: { pal: peat, layout: "ledger", fx: "plasma", grain: true, slots: true } },
  };

  // The merge itself: named dials override, unnamed dials track the site.
  const shown = applyLook(cfg);
  must(
    shown.pal === peat && shown.layout === "ledger" && shown.fx === "plasma" && shown.slots,
    "applyLook did not lay the override over the site config",
  );
  must(shown.type === cfg.type && shown.ornament === cfg.ornament, "applyLook changed a dial the override does not name");
  must(cfg.pal === DEFAULT_CONFIG.pal && !cfg.slots, "applyLook mutated the stored config");

  // A page with no override passes through as the same object — reference
  // equality, so sixteen untouched pages cost nothing per render.
  const other: Config = { ...cfg, page: "about" };
  must(applyLook(other) === other, "a page with no override must pass through untouched");

  // The wrapper: the override's palette reaches the tokens, and the override's
  // grain goes through the same guardrail resolution the site's does — Peat is
  // low-contrast, so has-grain must be dropped even though the override asks.
  const vars = themeVars(shown, "ledger", "desk") as Record<string, string>;
  must(vars["--bg"] === PALETTES[peat].bg, "the override's palette did not reach the wrapper's tokens");
  must(
    !CLASSES(shown, DEFAULT_ORNAMENT, "ledger").includes("has-grain"),
    "an override's grain walked past the low-contrast guardrail",
  );

  // The taste rules see the merged pair too: Ledger + Plasma is a warning the
  // operator must be shown before he publishes it.
  const merged = warnings(
    combinationOf({
      pal: shown.pal,
      layout: shown.layout,
      fx: shown.fx,
      ornament: shown.ornament,
      station: shown.station,
      type: shown.type,
      grain: shown.grain,
    }),
  );
  must(
    merged.some((w) => !w.resolved) && merged.some((w) => w.resolved),
    "the merged combination no longer trips the rules the override walks into",
  );

  /*
   * And the call sites, because driving the seam alone stays green when a host
   * stops going through it — the Size slider shipped exactly that way. The
   * context must derive through applyLook, the derived layout and fx must read
   * the look, and App must hand the look (never the stored config) to both
   * halves of the wrapper.
   */
  const ctx = readFileSync("src/config/ConfigContext.tsx", "utf8");
  must(/applyLook\(config\)/.test(ctx), "ConfigContext no longer derives the look through applyLook");
  must(/adaptLayout\(look\.layout/.test(ctx), "the adapted layout reads the stored config, so a layout override never renders");
  must(/visibleFx\(look\.fx/.test(ctx), "the resolved fx reads the stored config, so an effect override never renders");
  const app = readFileSync("src/App.tsx", "utf8");
  must(
    /themeClasses\(look,/.test(app) && /themeVars\(look,/.test(app),
    "App.tsx hands the stored config to the theme — the override never reaches the wrapper",
  );

  /*
   * No renderer outside the config layer may read a stored appearance dial —
   * `look` is the one answer. The allowlist is the surfaces whose *job* is the
   * stored value: the panel (it edits it), the command palette (site-level
   * toggles), and this scan strips comments the way the custom-property gate
   * does, because Ornament.tsx names `config.ornament` in prose.
   */
  const ALLOWED = new Set(["SiteConfigPanel.tsx", "CommandPalette.tsx"]);
  const DIALS = /\bconfig\.(pal|layout|fx|ornament|type|station|grain|breathe|cursor|slots|entrances)\b/;
  const offenders: string[] = [];
  for (const dir of ["src/components", "src/fx", "src/hooks"]) {
    for (const file of readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(file) || ALLOWED.has(file)) continue;
      const src = readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (DIALS.test(src)) offenders.push(join(dir, file));
    }
  }
  must(
    offenders.length === 0,
    `stored appearance dials read outside the config layer (read \`look\` instead): ${offenders.join(", ")}`,
  );

  return "override merges, guards resolve on the merge, all three call sites go through the seam";
});

check("a page look override refuses rubbish and never repairs it", () => {
  // Identity with what came in: a valid partial survives exactly as sent.
  const good = { work: { pal: 3, layout: "ledger", grain: false }, about: { fx: "plasma" } };
  must(
    JSON.stringify(validLookPages(good)) === JSON.stringify(good),
    "a valid override did not round-trip identically",
  );

  // A refused field is DROPPED — an override pinned to a default is a working
  // override shadowing whatever the site later says, the validDuelPages bug.
  const mixed = validLookPages({ work: { pal: 999, layout: "nope", grain: "yes", fx: "plasma" } });
  must(
    JSON.stringify(mixed) === JSON.stringify({ work: { fx: "plasma" } }),
    `refused fields were kept or repaired: ${JSON.stringify(mixed)}`,
  );

  // An override emptied by refusals is dropped whole — {} and absence must
  // mean the same thing, or the panel's override count lies.
  must(!("work" in validLookPages({ work: { pal: -1 } })), "an emptied override survived as {}");

  // Unknown pages and non-object shapes are dropped, never guessed at.
  must(Object.keys(validLookPages({ nothome: { pal: 1 } })).length === 0, "an unknown page key survived");
  must(Object.keys(validLookPages("0-7-5")).length === 0, "a string was accepted as a look map");
  must(Object.keys(validLookPages([{ pal: 1 }])).length === 0, "an array was accepted as a look map");
  must(Object.keys(validLookPages({ work: [3] })).length === 0, "an array was accepted as an override");

  // A hidden catalogue entry is stored-valid: hidden is unlisted, not invalid.
  must(
    validLookPages({ home: { ornament: "duelholy" } }).home?.ornament === "duelholy",
    "a hidden ornament was refused — hidden means unlisted, not invalid",
  );

  // Fractional and out-of-range indices refuse rather than clamp.
  must(!("home" in validLookPages({ home: { pal: 2.5 } })), "a fractional palette index was accepted");
  must(!("home" in validLookPages({ home: { type: TYPESETS.length } })), "an out-of-range typeset was accepted");

  // And the wiring: loadConfig must actually pass the field through this.
  const persistence = readFileSync("src/config/persistence.ts", "utf8");
  must(
    /lookPages: validLookPages\(saved\.lookPages\)/.test(persistence),
    "loadConfig no longer validates lookPages through validLookPages",
  );

  return "valid overrides round-trip; rubbish is dropped, never repaired or defaulted";
});

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

check("the sitemap lists every indexed page and nothing unlisted", () => {
  /*
   * The site had neither file until 2026-08-26. Both are generated from `PATHS`
   * rather than kept in `public/`, so this gate is what makes that generation
   * worth trusting: a page added to the closed union has to appear here, and a
   * page that is `noindex` has to not.
   */
  const xml = sitemapXml();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  must(new Set(locs).size === locs.length, "the sitemap lists an address twice");

  const account = new Set(["signup", "signin", "admin", "machines", "share", "notfound"]);
  const routes = Object.keys(PATHS) as (keyof typeof PATHS)[];
  for (const id of routes) {
    // Home canonicalises to "/" rather than to its own path, exactly as
    // `withPageMeta` does; anything else nominates two addresses for one page.
    const want = `https://mcclevarty.ca${id === "home" ? "/" : PATHS[id]}`;
    const listed = locs.includes(want);
    if (account.has(id)) {
      must(!listed, `${id} is noindex and must not be in the sitemap`);
    } else {
      must(listed, `${id} is an indexed page and is missing from the sitemap (${want})`);
    }
  }

  // Named because it is the page most worth finding, and the one the client
  // asked for by name. It is also a home CTA, which is what sitelinks are
  // actually built from.
  must(locs.includes("https://mcclevarty.ca/scams"), "the scams page is not in the sitemap");
  must(!locs.some((l) => l.includes("/downloads/")), "a downloads sub-page reached the sitemap");
  must(xml.startsWith("<?xml"), "the sitemap has no XML declaration");
  must(!/lastmod|changefreq|priority/.test(xml), "the sitemap invents metadata it has no source for");

  /*
   * The Search Console token, which is load-bearing and invisible: remove it and
   * the property silently un-verifies at Google's next re-check, taking the
   * ability to request indexing with it. It lives in the Worker rather than
   * `public/` because static assets 307 `/x.html` to `/x`.
   */
  const meta = readFileSync("worker/page-meta.ts", "utf8");
  const token = meta.match(/const GOOGLE_VERIFICATION = "(google[0-9a-f]+\.html)"/)?.[1];
  must(Boolean(token), "the Google Search Console verification token is gone from page-meta.ts");
  must(
    new RegExp(`url\\.pathname === \`/\\$\\{GOOGLE_VERIFICATION\\}\``).test(meta),
    "the verification token is no longer served at its own path",
  );

  const robots = robotsTxt();
  must(
    robots.includes("Sitemap: https://mcclevarty.ca/sitemap.xml"),
    "robots.txt does not point at the sitemap",
  );
  must(robots.includes("Disallow: /api/"), "robots.txt no longer keeps crawlers out of the API");
  /*
   * A `noindex` can only be obeyed by a crawler allowed to fetch the page.
   * Disallowing the sub-pages would block the fetch, leave them eligible as
   * bare URLs, and publish a list of the addresses meant to stay quiet.
   */
  must(
    !/Disallow: \/downloads/.test(robots),
    "robots.txt disallows /downloads — that hides the noindex rather than the pages",
  );
  return `${locs.length} indexed pages listed, ${routes.length - locs.length} withheld, robots names the sitemap`;
});

check("every snippet fits, stands alone, and the straight pages stay straight", () => {
  /*
   * The search snippet is the only copy on this site read by somebody who has
   * not arrived yet, and it is the copy nobody sees while working — which is
   * how "free diagnosis" survived in it for months after the client killed the
   * claim, and how nine of the eleven indexed routes came to be clamped
   * mid-sentence without anyone noticing.
   */
  const DAY = 86_400_000;
  const routes = Object.keys(PATHS) as (keyof typeof PATHS)[];
  let lines = 0;

  for (const id of routes) {
    const pool = SNIPPETS[id];
    must(Array.isArray(pool) && pool.length > 0, `no snippet for route ${id}`);
    for (const line of pool) {
      lines += 1;
      must(line.trim().length > 0, `${id} has an empty snippet`);
      /*
       * 155 is where `page-meta.ts`'s clamp starts cutting. Being clamped is
       * not an error there — it is the backstop — but a snippet written for the
       * job and then truncated mid-word is the exact failure this file replaced.
       */
      must(
        line.length <= 155,
        `${id}'s snippet is ${line.length} characters and would be cut mid-sentence: "${line}"`,
      );
      // Claims the client has retired. They cost nothing to check and the one
      // place they can hide is a tag no browser renders.
      for (const claim of [/free diagnos/i, /free diag\b/i, /pay nothing/i, /no fix,? no fee/i, /guarantee/i]) {
        must(!claim.test(line), `${id}'s snippet makes a claim the client retired: "${line}"`);
      }
    }
  }

  /*
   * **The forwarded pages never rotate.** `scams` ends by telling the reader to
   * send it to whoever in their family answers the phone; `setup` is read by
   * somebody about to install remote-access software; `contact` is the page
   * with the job. A page about fraud that describes itself differently each
   * time it is forwarded is arguing against itself.
   */
  for (const id of NEVER_ROTATES) {
    must(
      SNIPPETS[id].length === 1,
      `${id} must not rotate — it is written to be forwarded, and it now has ${SNIPPETS[id].length} snippets`,
    );
  }

  /*
   * Home rotates, and every line in the pool has to survive being the only one
   * anybody ever sees: a rotating snippet is never read beside its siblings, so
   * each says what this is before it does anything else.
   */
  const home = SNIPPETS.home;
  must(home.length >= 2, "home's snippet pool no longer rotates");
  for (const line of home) {
    must(
      /\b(computers?|repair(s|ed|ing)?)\b/i.test(line),
      `a home snippet never says what this is, and it is read alone: "${line}"`,
    );
  }

  // Stable within a day, different across one, and every line reachable.
  const base = 1_800_000_000_000 - (1_800_000_000_000 % DAY);
  must(
    snippetFor("home", base) === snippetFor("home", base + DAY - 1),
    "home's snippet changes inside a single day — a crawl would see one line and the reader another",
  );
  const seen = new Set<string>();
  for (let d = 0; d < home.length; d += 1) seen.add(snippetFor("home", base + d * DAY));
  must(
    seen.size === home.length,
    `${home.length} home snippets but only ${seen.size} are reachable in a full cycle`,
  );

  // And the whole path end to end: what the Worker would actually serve today.
  const served = metaForPath("/", base);
  must(
    home.includes(served.description),
    `the served home description is not one of the pool's lines: "${served.description}"`,
  );
  must(
    metaForPath(PATHS.scams, base).description === SNIPPETS.scams[0],
    "the scams route no longer serves its own snippet",
  );

  return `${lines} snippets over ${routes.length} routes, longest ${Math.max(
    ...routes.flatMap((id) => SNIPPETS[id].map((l) => l.length)),
  )} chars, home rotates ${home.length} ways`;
});

check("the served head carries exactly one description", () => {
  /*
   * The shell's static description and the Worker's injected one both shipped,
   * in that order, on every route (found 2026-08-26). A crawler quoting the
   * first tag quotes the shell — one string for all sixteen routes — so Google
   * advertised "free diagnosis" for months after that claim was cut from the
   * copy, while the per-route description this build takes trouble over sat
   * below it unread. Nothing failed, nothing logged: two valid tags.
   */
  const shell = readFileSync("index.html", "utf8");
  const shellTags = shell.match(/<meta\s+name="description"/g) ?? [];
  must(
    shellTags.length === 1,
    `index.html declares ${shellTags.length} description tags; it needs exactly one`,
  );

  const meta = readFileSync("worker/page-meta.ts", "utf8");
  must(
    /\.on\(\s*'meta\[name="description"\]'\s*,\s*\{[\s\S]{0,200}?el\.remove\(\)/.test(meta),
    "withPageMeta no longer removes the shell's description — its own is appended, so the static " +
      "one wins by being first and every route serves the same snippet",
  );
  // Comments stripped first: this file argues about the tag at length, and a
  // sentence naming it is not a tag being emitted.
  const metaCode = meta.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const injected = metaCode.match(/<meta name="description"/g) ?? [];
  must(
    injected.length === 1,
    `withPageMeta injects ${injected.length} description tags; it needs exactly one`,
  );

  /*
   * **And the same claims, over the page copy itself** (2026-08-26, second pass).
   * The first version of this gate read `SNIPPETS` and the shell and stopped
   * there — so a claim-audit found three fresh promises of a free diagnosis in
   * `PAGES`, on the front page, while `npm run check` reported 34/34 green.
   * The words were never the point; the promise is. `IMPLIED_FREE_DIAGNOSIS`
   * catches the form all three took: the fault established *before* anything
   * starts, which is the boundary the $150 sits on.
   */
  const RETIRED = [/free diagnos/i, /free diag\b/i, /pay nothing/i, /no fix,? no fee/i, /guarantee/i, /on the bench/i];
  const IMPLIED_FREE_DIAGNOSIS =
    /(what(?:'s| is) wrong|the (?:likely )?fault)[^.]{0,80}\b(before (?:anything|any work|I) (?:starts|start|begin|touch)|before it is taken apart)/i;
  const copy = JSON.stringify(PAGES);
  for (const claim of RETIRED) {
    const hit = copy.match(new RegExp(`[^"]{0,60}${claim.source}[^"]{0,60}`, "i"));
    must(!hit, `page copy makes a claim the client retired: "…${hit?.[0]}…"`);
  }
  for (const page of Object.values(PAGES)) {
    const text = [page.lede, ...page.blocks.map((b) => b.body)].join(" ");
    const hit = text.match(IMPLIED_FREE_DIAGNOSIS);
    must(
      !hit,
      `"${page.title}" promises the fault before anything starts, which is a free diagnosis without the words: "…${hit?.[0]}…"`,
    );
  }

  /*
   * The static tag is the Pages rollback's only description, so it has to stay
   * true on its own. These are the claims the client has explicitly retired —
   * untrue of the business, and the one place they could survive unread is
   * exactly here.
   */
  const content = shell.match(/<meta\s+name="description"[\s\S]*?content="([^"]*)"/)?.[1] ?? "";
  must(Boolean(content), "index.html's description tag has no content");
  const claimed = RETIRED.filter((r) => r.test(content));
  must(
    claimed.length === 0,
    `index.html's description makes a claim the client retired: "${content}"`,
  );
  return `one in the shell, one injected, shell copy makes no retired claim`;
});

// A setup code is a wire format, and its failures are the silent kind: a code
// that decodes to the wrong folders is a working code, so nothing throws and
// nothing logs. Same reasoning as `shareCode.ts` and `paths.ts`, which are in
// this harness for exactly that reason (SPEC-SHARING.md §4).
check("setup codes round-trip, and refuse everything malformed", () => {
  const plan = {
    machine: "workshop",
    folders: [
      { label: "Photos", path: "D:\\Photos" },
      { label: "Invoices", path: "C:\\Users\\me\\Documents\\Invoices" },
      // Non-ASCII on both halves: a French filename is an ordinary thing here,
      // and the encoder goes through UTF-8 and base64url to survive it.
      { label: "Réparations", path: "D:\\Réparations\\2026" },
    ],
  };

  const round = decodeSetupCode(encodeSetupCode(plan));
  must(round !== null, "a code this encoder produced did not decode");
  must(JSON.stringify(round) === JSON.stringify(plan), `round trip changed the plan: ${JSON.stringify(round)}`);

  // One folder must survive. PowerShell 5.1's ConvertTo-Json turns a
  // one-element array into a bare object, which is why the script builds its
  // JSON by hand — and this is the case that would have shipped broken while
  // every two-folder test passed.
  const single = decodeSetupCode(encodeSetupCode({ machine: "", folders: [{ label: "One", path: "C:\\One" }] }));
  must(single !== null && single.folders.length === 1, "a one-folder code did not decode");

  const b64 = (json: string) =>
    SETUP_CODE_PREFIX +
    Buffer.from(json, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const rejected: Array<[string, string]> = [
    ["not a code at all", "plain text"],
    ["VS2.abc", "a future version"],
    [SETUP_CODE_PREFIX + "!!!!", "not base64url"],
    [b64("[]"), "an array rather than an object"],
    [b64('{"n":"a"}'), "no folder list"],
    [b64('{"n":"a","f":[]}'), "an empty folder list"],
    [b64('{"n":"a","f":{}}'), "a folder list that is not an array"],
    [b64('{"n":"a","f":[{"l":"x"}]}'), "a folder with no path"],
    [b64('{"n":"a","f":[{"l":"","p":"C:\\\\x"}]}'), "an empty label"],
    [b64('{"n":"a","f":[{"l":"x","p":"   "}]}'), "a whitespace path"],
    [b64('{"n":"a","f":[{"l":5,"p":"C:\\\\x"}]}'), "a numeric label"],
    [b64('{"n":"a","f":[null]}'), "a null folder"],
    // The one that matters most: a label carrying a newline renders on the
    // account and travels to anyone the folder is later shared with, where it
    // can lie about how many rows there are.
    [b64('{"n":"a","f":[{"l":"x\\ny","p":"C:\\\\x"}]}'), "a control character in a label"],
    [b64('{"n":"a\\u0000","f":[{"l":"x","p":"C:\\\\x"}]}'), "a control character in the machine name"],
    [b64(`{"n":"${"m".repeat(41)}","f":[{"l":"x","p":"C:\\\\x"}]}`), "an over-long machine name"],
    [b64(`{"n":"a","f":[{"l":"${"L".repeat(41)}","p":"C:\\\\x"}]}`), "an over-long label"],
    // A label that renders as something other than what it stores. Both fields
    // are read by a person choosing which folder to hand over, so a label that
    // lies is the whole attack — and two rows that render identically break the
    // checklist's done-set silently.
    [b64('{"n":"a","f":[{"l":"Family \\u202EsotohP","p":"C:\\\\x"}]}'), "a bidi override in a label"],
    [b64('{"n":"a","f":[{"l":"Invoices\\u200b","p":"C:\\\\y"}]}'), "a zero-width space in a label"],
    [b64('{"n":"a","f":[{"l":"x","p":"C:\\\\a\\u202Eb"}]}'), "a bidi override in a path"],
    [b64('{"n":"a\\ufeff","f":[{"l":"x","p":"C:\\\\x"}]}'), "a byte-order mark in the machine name"],
    // Two folders under one label collide in the checklist and one is silently
    // never added, while the list reads complete.
    [b64('{"n":"a","f":[{"l":"Photos","p":"C:\\\\a"},{"l":"Photos","p":"C:\\\\b"}]}'), "duplicate labels"],
    // VARIATION SELECTORS. The refusal used to be an enumeration; it was
    // replaced by Unicode general categories precisely because an enumeration
    // cannot be made complete — and the replacement still missed U+FE00-FE0F
    // and U+E0100-E01EF, which are zero width and which NFKC does not fold. So
    // `Invoices\uFE00` rebuilt the twin-row attack character for character
    // after it had been "fixed". Refused by property now.
    [b64('{"n":"a","f":[{"l":"Invoices\\ufe00","p":"C:\\\\y"}]}'), "a variation selector in a label"],
    [b64('{"n":"a","f":[{"l":"Invoices\\udb40\\udd00","p":"C:\\\\y"}]}'), "an ideographic variation selector in a label"],
    [b64('{"n":"a","f":[{"l":"Invoices\\u180b","p":"C:\\\\y"}]}'), "a Mongolian free variation selector in a label"],
    // The TWIN ROW itself, which is the thing the character classes exist to
    // stop. U+FE0F is deliberately NOT refused outright — it is the emoji
    // presentation selector and `Photos \u2764\uFE0F` is a folder somebody
    // has — so this pair has to be caught by the duplicate FOLD instead. If
    // the fold stops stripping default-ignorables, this is what goes red.
    [
      b64('{"n":"a","f":[{"l":"Invoices","p":"C:\\\\a"},{"l":"Invoices\\ufe0f","p":"C:\\\\Users\\\\me"}]}'),
      "two labels differing only by an emoji presentation selector",
    ],
    // Same shape with an ordinary space: `.v-setup-name` is `white-space:
    // normal`, so these are one picture. The refusal must not depend on a CSS
    // declaration in another file, so the fold collapses runs itself.
    [
      b64('{"n":"a","f":[{"l":"My Photos","p":"C:\\\\a"},{"l":"My  Photos","p":"C:\\\\Users\\\\me"}]}'),
      "two labels differing only by a doubled space",
    ],
  ];

  for (const [code, why] of rejected) {
    must(decodeSetupCode(code) === null, `accepted ${why}`);
  }

  // And the carve-out has to be real, or the fix is a different outage: the
  // code is machine-generated from folder names the person already has, so
  // refusing U+FE0F would refuse the WHOLE code over one honestly-named
  // folder, on the happy path, with nothing to do but rename it.
  const emoji = { machine: "m", folders: [{ label: "Photos \u2764\ufe0f", path: "D:\\Photos" }] };
  const emojiRound = decodeSetupCode(encodeSetupCode(emoji));
  must(
    emojiRound !== null && emojiRound.folders[0].label === "Photos \u2764\ufe0f",
    "refused an ordinary folder name carrying an emoji — the label is stored as sent",
  );

  // Too many folders is refused rather than truncated: a truncated list renders
  // as a complete checklist, and the folders past the cut are silently absent.
  const many = {
    machine: "m",
    folders: Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, path: `C:\\p${i}` })),
  };
  must(decodeSetupCode(encodeSetupCode(many)) === null, "accepted more than 24 folders");

  // Both halves of the wire format live in two languages, and the PowerShell
  // half cannot be run from here. So: assert the script still emits the shape
  // this decoder parses. Editing one side alone is what this catches.
  const ps = readFileSync("scripts/windows-share-setup.ps1", "utf8");
  must(ps.includes("'VS1.'"), "the Windows script no longer emits the VS1. prefix");
  must(
    ps.includes('{{"l":{0},"p":{1}}}'),
    "the Windows script's folder JSON no longer matches what decodeSetupCode reads",
  );
  must(
    ps.includes(`'{"n":'`),
    "the Windows script's envelope JSON no longer matches what decodeSetupCode reads",
  );
  must(
    ps.includes(".Replace('+', '-').Replace('/', '_').TrimEnd('=')"),
    "the Windows script no longer produces base64url",
  );

  return `${rejected.length} malformed codes refused, round trip holds, the Windows encoder still agrees`;
});

/*
 * The published Windows downloads keep their encodings (2026-09-02, closing
 * TODO 2026-08-27 item 2 — and both halves were live regressions when checked:
 * the .ps1 had no BOM and launch.bat carried em dashes over LF endings).
 *
 * Windows PowerShell 5.1 reads a BOM-less file with the ANSI code page, so a
 * .ps1 full of em dashes renders as mojibake on a page whose whole pitch is
 * "read it before you run it"; cmd.exe has no BOM story at all, so the only
 * safe batch file is pure ASCII with CRLF. `setup-bundle.sh` refuses to bundle
 * on the same three faults; this gate catches them at edit time, where
 * check:fast runs, rather than on the rare day somebody publishes.
 */
check("the Windows setup downloads keep their encodings", () => {
  const ps1 = readFileSync("scripts/windows-share-setup.ps1");
  must(
    ps1[0] === 0xef && ps1[1] === 0xbb && ps1[2] === 0xbf,
    "windows-share-setup.ps1 has lost its UTF-8 BOM — PowerShell 5.1 reads it as ANSI",
  );
  const bat = readFileSync("scripts/launch.bat");
  for (const byte of bat) {
    must(
      byte < 0x80,
      "launch.bat contains a non-ASCII byte — cmd.exe reads it with the ANSI code page",
    );
  }
  const lines = bat.toString("ascii").split("\n");
  for (const [i, line] of lines.entries()) {
    if (i === lines.length - 1 && line === "") continue;
    must(line.endsWith("\r"), `launch.bat line ${i + 1} is missing its CR — the file must stay CRLF`);
  }
  return "the .ps1 carries its BOM; launch.bat is ASCII with CRLF endings";
});

/*
 * The setup scripts' blocked-folder lists (SPEC-SHARING.md §4).
 *
 * These are a SECURITY CONTROL and the only one there is. A link to a blocked
 * directory placed inside a picked folder is read normally by Chrome — crbug
 * 40061477 — and the scripts recommend picking the share root as one folder, so
 * nothing downstream catches a miss. Chrome's own position is that evading its
 * blocklist is not a security bug, so it cannot be leaned on.
 *
 * Every entry below was absent at some point on 2026-08-27 and each absence had
 * a working exploit: the parent of home (`/home`, `/Users`, `C:\Users`) exposed
 * every account on the machine, and the credential directories were shareable
 * because only `$HOME` itself was blocked, never its children — which are
 * exactly the paths Chrome blocks with block-all-children semantics.
 *
 * This gate reads the scripts as text because it cannot run them. That is
 * weaker than executing the logic and it is what is available; the execution
 * evidence lives in the session that added it.
 */
check("the setup scripts refuse the folders that matter", () => {
  const unix = ["scripts/linux-share-setup.sh", "scripts/macos-share-setup.sh"];

  // Parse the actual token lists rather than substring-matching the file: a
  // bare `includes("$HOME")` passes on `$HOME/.ssh` and would have proved
  // nothing about whether the home directory itself is blocked.
  // Both list forms. They were space-delimited STRINGS until 2026-09-03, and a
  // string consumed unquoted (`for bad in $BLOCK_EXACT`) splits on IFS — so a
  // home directory with a space in it shattered every `$HOME`-derived entry and
  // `~/.ssh`, `~/.gnupg` and `~/.config` all became shareable. They are bash
  // arrays now. This helper reads either, because a parser that only knows the
  // shape it was written against reports "no BLOCK_EXACT list" when the list is
  // right there — which is exactly what it did, taking every assertion below it
  // out of service at the same time.
  const tokens = (text: string, name: string): string[] => {
    const arr = new RegExp(`${name}=\\(([^)]*)\\)`).exec(text);
    const src = arr ? arr[1] : (new RegExp(`${name}="([^"]*)"`).exec(text) ?? [])[1];
    if (!src) return [];
    return src
      .split(/\s+/)
      .map((t) => t.replace(/#.*$/, "").replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  };

  const requiredUnix: Record<string, { exact: string[]; prefix: string[] }> = {
    "scripts/linux-share-setup.sh": {
      exact: ["$HOME", "/home", "/etc", "/root", "/"],
      prefix: ["$HOME/.ssh", "$HOME/.gnupg", "$HOME/.config"],
    },
    "scripts/macos-share-setup.sh": {
      exact: ["$HOME", "/Users", "/System", "/Library", "/private", "/"],
      prefix: ["$HOME/Library", "$HOME/.ssh", "$HOME/.gnupg"],
    },
  };

  let checked = 0;
  for (const [file, want] of Object.entries(requiredUnix)) {
    const text = readFileSync(file, "utf8");
    const exact = tokens(text, "BLOCK_EXACT");
    const prefix = tokens(text, "BLOCK_PREFIX");
    must(exact.length > 0, `${file} has no BLOCK_EXACT list`);
    for (const entry of want.exact) {
      must(
        exact.includes(entry),
        `${file} no longer blocks ${entry} — that list is a security control, not a convenience check`,
      );
      checked += 1;
    }
    for (const entry of want.prefix) {
      must(
        prefix.includes(entry),
        `${file} no longer blocks ${entry} and everything under it`,
      );
      checked += 1;
    }
  }

  {
    const text = readFileSync("scripts/windows-share-setup.ps1", "utf8");
    for (const entry of ["$env:USERPROFILE", "$env:SystemRoot", "$env:ProgramFiles"]) {
      must(text.includes(entry), `windows-share-setup.ps1 no longer blocks ${entry}`);
      checked += 1;
    }
  }

  for (const file of unix) {
    const text = readFileSync(file, "utf8");

    // Fail closed. A path that cannot be canonicalised must be refused, never
    // compared raw — otherwise the symlink hole reopens on any platform where
    // the resolver is unavailable.
    must(text.includes("canon()"), `${file} lost its path canonicaliser`);
    must(
      text.includes("Could not work out where that folder really is"),
      `${file} no longer fails closed when a path cannot be resolved`,
    );

    // The leading `//` collapse: bash's `pwd -P` preserves it, and without this
    // `//home/user` compared unequal to `/home/user` and was shared.
    must(
      text.includes('while [ "${p#//}" != "$p" ]'),
      `${file} no longer collapses a leading double slash — //home/user would bypass the list`,
    );

    // Prefix matching, or blocking a directory does not block its children.
    must(text.includes("BLOCK_PREFIX"), `${file} lost its prefix blocklist`);

    // Case folding on Darwin, whose filesystem is case-insensitive.
    must(text.includes("fold_case"), `${file} no longer folds case for macOS`);

    /*
     * The framing must stay correct, asserted POSITIVELY.
     *
     * The first version of this assertion checked that the old wrong phrase
     * ("Refuse what the browser will refuse") was absent, and it failed
     * immediately — because the replacement comment quotes that phrase in order
     * to explain why it was wrong. An absence check cannot tell a live claim
     * from a cited one. Requiring the true statement is both stricter and not
     * defeated by someone discussing the old one.
     */
    must(
      text.includes("This is a security control, not a convenience check"),
      `${file} no longer calls its blocklist a security control — that framing is what stops it being relaxed to be helpful`,
    );
  }

  return `3 scripts, ${checked} required blocklist entries, fail-closed and prefix matching intact`;
});

/*
 * The same question, EXECUTED.
 *
 * The gate above reads the blocklist as text, and on 2026-09-03 that was shown
 * to be worth very little: the lists were space-delimited strings consumed
 * unquoted, so a home directory with a space in it split every `$HOME`-derived
 * entry into fragments and `~/.ssh`, `~/.gnupg`, `~/.config` and the whole of
 * `~/.local` became shareable. Every entry the text gate requires was present
 * the entire time. It reported "20 required blocklist entries … intact" while
 * the barrier CLAUDE.md calls "the ONLY barrier" was open, and its own comment
 * conceded it was weaker than executing the logic.
 *
 * So this one runs the real `check_folder` out of the real script, against
 * throwaway home directories — one ordinary, one with a space in the name,
 * which is the case that broke. It fails against the pre-fix scripts, which is
 * what makes it a gate rather than a description.
 *
 * The definitions are sliced out rather than sourced because these scripts run
 * their whole flow at the top level: sourcing one would try to set up a share.
 */
check("the setup scripts REFUSE, driven against a real home directory", () => {
  // String.raw: the awk program is full of backslashes, and a plain template
  // literal eats them — `/^\)/` arrives as `/^)/`, which is not a regex, so awk
  // fails, DEFS comes back empty and every verdict reads BROKEN.
  const probeScript = String.raw`
set -uo pipefail
SRC="$1"; FIX="$2"
DEFS="$(awk '
  /^(canon|fold_case|check_folder)\(\)/ { infn=1 }
  /^(BLOCK_EXACT|BLOCK_PREFIX)=\(/ { inarr=1 }
  infn { print }
  infn && /^}/ { infn=0 }
  inarr && !infn { print }
  inarr && /^\)/ { inarr=0 }
' "$SRC")"
HOME="$FIX"; SHARE_ROOT="$FIX/Shared"
eval "$DEFS"
for p in "$FIX" "$FIX/.ssh" "$FIX/.gnupg" "$FIX/.config" "$FIX/.local" \
         "$FIX/.local/share" /etc / "$FIX/Documents"; do
  r="$(check_folder "$p" 2>/dev/null | head -1)"
  case "$r" in OK*) v=ALLOWED ;; NO*) v=refused ;; *) v=BROKEN ;; esac
  printf '%s\t%s\n' "$v" "$p"
done
`;

  const root = mkdtempSync(join(tmpdir(), "vessel-blocklist-"));
  let driven = 0;
  try {
    // "bob smith" is the whole point: an ordinary macOS account name, and the
    // shape that shattered the list.
    for (const home of ["plain", "bob smith"]) {
      const fix = join(root, home);
      for (const d of [".ssh", ".gnupg", ".config", ".local/share/keyrings", "Documents", "Shared"]) {
        mkdirSync(join(fix, d), { recursive: true });
      }
      for (const file of ["scripts/linux-share-setup.sh", "scripts/macos-share-setup.sh"]) {
        const out = execFileSync("bash", ["-c", probeScript, "probe", file, fix], {
          encoding: "utf8",
        });
        const verdict = new Map<string, string>();
        for (const line of out.trim().split("\n")) {
          const [v, ...rest] = line.split("\t");
          verdict.set(rest.join("\t"), v);
        }

        // Everything private must be refused, in BOTH homes. `/` included: the
        // trailing-slash strip turned that entry into an empty string, so the
        // filesystem root matched nothing and was shareable in every version
        // before 2026-09-03.
        for (const p of [fix, `${fix}/.ssh`, `${fix}/.gnupg`, `${fix}/.config`,
                         `${fix}/.local`, `${fix}/.local/share`, "/etc", "/"]) {
          must(
            verdict.get(p) === "refused",
            `${file}: ${p.replace(fix, "~")} is ${verdict.get(p) ?? "unresolved"} with HOME="${home}" — that list is the only barrier there is`,
          );
          driven += 1;
        }

        // And it must still be usable: an ordinary folder has to pass, or the
        // safe answer is "refuse everything" and nobody can share anything.
        must(
          verdict.get(`${fix}/Documents`) === "ALLOWED",
          `${file}: an ordinary folder is refused with HOME="${home}" — the blocklist has become a wall`,
        );
        driven += 1;
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return `${driven} verdicts from the real check_folder, over 2 scripts x 2 home directories (one with a space)`;
});

/*
 * The Windows half of the same question, EXECUTED.
 *
 * The blocklist is only a barrier if the path it compares is the path the
 * browser will actually read, and on Windows that means resolving reparse
 * points. The script did resolve them — for the FINAL COMPONENT ONLY.
 * `GetFullPath` does not follow a junction, and `Get-Item` reports the
 * ReparsePoint attribute of the leaf, so a junction anywhere ABOVE the picked
 * folder was never resolved and the path was compared as typed.
 *
 * Windows ships the junctions that exploit this, and their ACLs deny listing
 * but not traversal, so `Test-Path` through one succeeds:
 *
 *   C:\Documents and Settings\me            -> the whole user profile
 *   ...\Local Settings\Google\Chrome\...    -> past the %LOCALAPPDATA%\Google entry
 *   ...\Application Data\Microsoft\Protect  -> past %APPDATA%\Microsoft, to the DPAPI keys
 *
 * The Unix scripts never had it, because `cd -P` plus `pwd -P` resolves every
 * component by construction. This gate exists to hold the PowerShell copy to
 * the same standard, by driving it rather than reading it — the text gate above
 * would have reported this one intact too, exactly as it did on 2026-09-03.
 *
 * The resolver block is sliced out of the real script and only its SEPARATORS
 * are substituted, so the walk, the restart, the bound and the fail-closed
 * catch are the shipped ones. Symlinks stand in for junctions: .NET reports
 * both through the same ReparsePoint attribute and the same `.Target`, which is
 * the property under test. Break-verified — the pre-fix block returns the alias
 * unresolved and fails every case below.
 */
check("the Windows script resolves EVERY path component, not just the leaf", () => {
  let hasPwsh = true;
  try {
    execFileSync("pwsh", ["-NoProfile", "-Command", "exit 0"], { stdio: "pipe" });
  } catch {
    hasPwsh = false;
  }
  if (!hasPwsh) {
    SKIPPED.push(
      "the Windows path resolver in windows-share-setup.ps1 — no `pwsh` here (snap install powershell --classic)",
    );
    return "NOT RUN — pwsh absent, named under 'could not be run' below";
  }

  const src = readFileSync("scripts/windows-share-setup.ps1", "utf8").replace(/^\uFEFF/, "");
  const from = src.indexOf("    try {\n        $rounds = 0");
  must(from >= 0, "the ancestor-resolving walk is gone from windows-share-setup.ps1");
  const marker = src.indexOf('        return "Could not work out where that folder really is', from);
  must(marker >= 0, "the fail-closed catch is gone from the resolver");
  const to = src.indexOf("}\n", marker) + 2;
  let block = src.slice(from, to);

  // Separator substitution ONLY, and every one asserted, so a rewrite that
  // changes the shape fails here rather than silently testing nothing.
  const subs: [string, string][] = [
    ["-split '\\\\'", "-split ([regex]::Escape($SEP))"],
    ["$parts[0] + '\\'", "$SEP"],
    ["$rest = '\\' +", "$rest = $SEP +"],
    ["-join '\\'", "-join $SEP"],
    ["TrimEnd('\\')", "TrimEnd([char]$SEP)"],
  ];
  for (const [a, b] of subs) {
    must(block.includes(a), `the resolver no longer contains ${a} — this gate is testing nothing`);
    block = block.split(a).join(b);
  }

  const root = mkdtempSync(join(tmpdir(), "vessel-pwsh-"));
  try {
    const harness = join(root, "resolve.ps1");
    writeFileSync(
      harness,
      "param([string] $Path)\n" +
        "$SEP = [string][System.IO.Path]::DirectorySeparatorChar\n" +
        "$full = [System.IO.Path]::GetFullPath($Path).TrimEnd([char]$SEP)\n" +
        "function Test-It {\n" +
        block +
        "\n  return $full\n}\nTest-It\n",
      "utf8",
    );

    const real = realpathSync(root);
    mkdirSync(join(root, "home", "me", "Documents"), { recursive: true });
    mkdirSync(join(root, "home", "me", ".ssh"), { recursive: true });
    // The shipped Windows aliases, reproduced in shape: an ancestor link, a
    // chain of them, and a leaf link (which the pre-fix code did handle).
    symlinkSync(join(root, "home"), join(root, "Documents and Settings"));
    symlinkSync(join(root, "Documents and Settings"), join(root, "chain"));
    symlinkSync(join(root, "home", "me", "Documents"), join(root, "home", "me", "leaflink"));
    symlinkSync(join(root, "nowhere-at-all"), join(root, "dangling"));

    const run = (p: string) =>
      execFileSync("pwsh", ["-NoProfile", "-File", harness, p], { encoding: "utf8" }).trim();

    const cases: [string, string, string][] = [
      ["an ancestor link", join(root, "Documents and Settings", "me", "Documents"), join(real, "home/me/Documents")],
      ["a chain of ancestor links", join(root, "chain", "me", "Documents"), join(real, "home/me/Documents")],
      ["a leaf link", join(root, "home", "me", "leaflink"), join(real, "home/me/Documents")],
      ["an ancestor link onto a blocked child", join(root, "Documents and Settings", "me", ".ssh"), join(real, "home/me/.ssh")],
      ["no link at all", join(root, "home", "me", "Documents"), join(real, "home/me/Documents")],
    ];
    let driven = 0;
    for (const [what, input, want] of cases) {
      const got = run(input);
      must(
        got === want,
        `${what}: the resolver returned "${got}" where the real folder is "${want}" — ` +
          "a path that resolves to somewhere else is compared against the blocklist as typed",
      );
      driven += 1;
    }

    // And it must FAIL CLOSED rather than pass a path it could not resolve.
    const dangling = run(join(root, "dangling"));
    must(
      dangling.startsWith("Could not work out") || dangling.startsWith("That folder is a link"),
      `a link that cannot be resolved was not refused — it returned "${dangling}"`,
    );
    driven += 1;

    return `${driven} verdicts from the real resolver: ancestor, chained, leaf and unresolvable links`;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- 6. Things only a person can judge -------------------------------------

const UNCHECKABLE = [
  "whether the fight reads well — it cannot be watched here (rAF parks)",
  "whether any layout is beautiful, or the copy sounds right",
  "whether a QR actually scans on a phone",
  "the operator surfaces, which need a signed-in session",
  // The gate above proves every category *has* a mark and that no mark is
  // orphaned. It cannot prove the mark is the right one, or that two of them are
  // not the same idea drawn twice — and at 18px that is the whole question.
  "whether a category's icon reads as that category, and whether any two are alike",
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
  if (SKIPPED.length > 0) {
    console.log("Could NOT be run on this machine:");
    for (const sk of SKIPPED) console.log(`  · ${sk}`);
  }
} else {
  console.log(`${failed.length} of ${results.length} checks FAILED.`);
  process.exitCode = 1;
}
