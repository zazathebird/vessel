# Pass 1 audit — core state/config architecture

Scope: `src/config/ConfigContext.tsx`, `src/config/siteConfig.ts`, `src/config/persistence.ts`,
`src/config/shareCode.ts`, `src/config/types.ts`, `src/config/bands.ts`, `src/config/randomiser.ts`,
`src/theme.ts`, `src/data/pages.ts`, `src/data/pageIds.ts`, `src/data/guardrails.ts`,
`src/data/presets.ts`, `src/data/duelSettings.ts`, `src/data/lookSettings.ts`, `src/data/stations.ts`,
`src/data/ornaments.ts`, `src/data/catalog.ts`, `worker/site-config.ts`. Read in full. Read-only —
nothing was edited except this file.

---

## Findings

### 1. `src/data/duelSettings.ts:103-122` — `DEFAULT_DUEL_SETTINGS.tuning` is not actually frozen
**Severity: bug (verified, currently latent)**

`Object.freeze()` is shallow. `DEFAULT_DUEL_TUNING` is frozen, and `DEFAULT_DUEL_SETTINGS` is
frozen at the top level, but `DEFAULT_DUEL_SETTINGS.tuning` is a **fresh, unfrozen plain object**
(`{ ...DEFAULT_DUEL_TUNING }`) sitting behind the frozen outer object. The file's own comment block
(lines 88-102) says explicitly: *"Frozen, the same mistake is a `TypeError` — module code is strict,
so the write throws rather than passing."* CLAUDE.md repeats the same claim. This is false for the
nested object.

Verified in a strict-mode Node repl with the exact shape used here:
```
DEFAULT_DUEL_SETTINGS.tuning.circling = 999;  // succeeds silently, no throw
DEFAULT_DUEL_SETTINGS.rim = 42;               // throws TypeError, as claimed
```
`Object.isFrozen(DEFAULT_DUEL_SETTINGS.tuning)` is `false`.

**Failure scenario:** `persistence.ts`'s no-published-config branch spreads `DEFAULT_CONFIG`
shallowly, so `config.duel` — and therefore `config.duel.tuning` — is the literal same module-level
object instance for every unpublished visitor's session in one isolate/tab lifetime. Nothing in the
current codebase mutates it in place today (`DuelSettingsEditor.tsx` clones via
`{ ...site.tuning, [key]: v }`, `resetSite` clones), so this is latent rather than live — exactly the
distinction the file's own comment draws. But the safety net the comment claims exists ("the same
mistake is a TypeError") does not cover the one field (`tuning`) most likely to be touched by future
editor code, since it's the one field that's itself a nested object. A future edit that does
`DEFAULT_DUEL_SETTINGS.tuning.circling = x` instead of cloning would corrupt the shared default for
every later visitor with nothing thrown and nothing logged — precisely the failure mode freezing was
added to prevent, reopened by the shallowness of `Object.freeze`.

**Fix shape (not applied, per instructions):** `Object.freeze` the inner `tuning` object too (and
`DEFAULT_DUEL_TUNING` is already frozen and reused by reference, so `tuning: DEFAULT_DUEL_TUNING`
directly, or `Object.freeze({ ...DEFAULT_DUEL_TUNING })`, would close this).

---

### 2. `worker/site-config.ts:192` / `scripts/check.ts` (~3555-3580) — the byte-vs-UTF-16 fix has no regression gate
**Severity: informational (gate-coverage gap; the app code itself is correct)**

CLAUDE.md states: *"`MAX_CONFIG_BYTES` is gated too: that it is 12,000, that it throws, and that
nothing truncates to it — **and, since 2026-09-03, that the ceiling is measured in BYTES.**"* The
historical bug being guarded against: `JSON.stringify(...).length` counts UTF-16 code units, so
11,921 CJK characters (35,721 real UTF-8 bytes) were wrongly accepted while 12,121 ASCII characters
were wrongly refused.

The current implementation in `worker/site-config.ts:192` is correct:
```
const bytes = new TextEncoder().encode(encoded).byteLength;
```

But `scripts/check.ts` has **zero** occurrences of `TextEncoder`, `byteLength`, `Buffer.byteLength`,
or any UTF-8-vs-UTF-16 assertion anywhere in the file (confirmed by grep across the whole file). The
only checks near `MAX_CONFIG_BYTES` (around line 3555-3574) are regex-based source-shape checks:
the constant equals `12_000`, the code path throws past it, and it isn't truncated via
`slice`/`substring`. None of these three would catch a regression where `new
TextEncoder().encode(encoded).byteLength` is "simplified" back to `encoded.length` — the exact bug
this file's own comments describe fixing. There's also no behavioral test in
`scripts/auth-e2e.ts` that actually publishes a CJK-heavy payload through the running Worker to
verify byte counting end-to-end (the site-config section there only checks basic publish/read-back
and unknown-key stripping). This is exactly the "gate reads the source, testing shape not behaviour"
pattern CLAUDE.md itself warns about in the *Checks* section — the claimed regression protection for
this specific historical bug does not currently exist.

---

### 3. `src/data/lookSettings.ts:44-57` — `LOOK_KEYS` is dead code, contradicting its own comment
**Severity: informational**

```ts
/** Every dial a page may override — the panel and the gates both read this. */
export const LOOK_KEYS = [ "pal", "layout", "fx", "ornament", "type", "station",
  "grain", "breathe", "cursor", "slots", "entrances" ] as const;
```

Grepped across `src/` and `scripts/`: `LOOK_KEYS` has **no importers anywhere**. Neither "the panel"
(`SiteConfigPanel.tsx`, which hardcodes each dial's UI individually) nor "the gates" actually read
it. `scripts/check.ts:4338` independently hardcodes the identical 11-name list inline as a regex:
```
const DIALS = /\bconfig\.(pal|layout|fx|ornament|type|station|grain|breathe|cursor|slots|entrances)\b/;
```
Today the two lists agree, but nothing enforces that they keep agreeing — adding a 12th field to
`PageLook` (and to `LOOK_KEYS`) would silently leave `check.ts`'s hardcoded regex out of date, which
is exactly the two-sources-of-truth drift this project's own conventions (see the `PUBLISHED_KEYS`
kept-in-step commentary elsewhere) treat as a real risk elsewhere. Not a live bug, but a stale
invariant/dead export that overstates what actually protects consistency.

---

### 4. `src/data/pageIds.ts:1-9` — header comment undercounts the pages by one, omits `downloads`
**Severity: informational**

```
* The sixteen pages and their real URLs — the spec's nine, plus setup and scams,
* plus signup, signin and admin (phase 1), and machines and share (phase 2,
```
That enumeration (9 + setup + scams + signup + signin + admin + machines + share) sums to 16, but
`downloads` (added 2026-08-19, has its own `PATHS`/`PageId` entry and its own `PAGES.downloads`
block) is never mentioned, and the `PageId` union actually has **17** members. CLAUDE.md's own
"Implementation traps" section already has the correct number: *"Seventeen real URLs are wired in
`src/data/pageIds.ts`."* The file's own header comment simply wasn't updated when `downloads`
landed. Purely cosmetic — `PATHS`, `BY_PATH`, `pageFromPath`/`subFromPath` all correctly include
`downloads` — but worth fixing since a header comment that undercounts its own union is exactly the
kind of thing a future reader trusts uncritically.

---

### 5. `src/data/pages.ts:1-6` — "thirteen pages that render blocks" does not match the file
**Severity: informational, low confidence**

Header comment: *"Final page copy for all thirteen pages that render blocks..."* Counting entries in
`PAGES` with a non-empty `blocks` array gives 11 (home, about, work, gallery, contact, now, setup,
changelog, guestbook, scams, notfound); `signup`, `admin`, `signin`, `machines`, `share`, `downloads`
all have `blocks: []` by design (their content is a component, not data). It's unclear whether "13"
was ever accurate (possibly written before `downloads`/`share` existed, or before the
empty-blocks-for-account-pages pattern was established) or is simply stale like finding 4. Flagging
for a follow-up copy pass rather than as a functional bug — nothing reads this comment
programmatically.

---

## Areas covered — checked carefully, nothing found

- **`ConfigContext.tsx` stale-closure/`live.current` pattern.** Every roll site that runs outside a
  `useEffect` with `[isOperator]` in its own deps (`shuffle`, `setMode`'s `visit` branch, the mount
  effect's `page`/`visit` roll, `go`'s commit, `popstate`'s `onPop`) reads `live.current.isOperator`
  rather than the closed-over `isOperator`, consistent with the documented 2026-08-30 fix. The one
  roll site that reads the reactive `isOperator` directly (`operatorRoll`'s own effect, keyed on
  `[isOperator]`) is correct to do so since its whole purpose is to re-fire when that value changes.
  No stale-closure gap found among these five/six sites.
- **`update()`'s synchronous `live.current` refresh vs. the effect-based resync.** Checked for a
  race between the direct write in `update()` and the `useEffect` that resyncs the whole `live.current`
  object on every render; they converge correctly because both are driven from the same successive
  `setConfig` patches. No divergence found.
- **`PUBLISHED_KEYS` parity** between `src/config/siteConfig.ts` and `worker/site-config.ts`: both
  arrays currently hold the identical 18-key set (order differs, which doesn't matter for either
  consumer). This has broken twice historically per CLAUDE.md; today it is in sync, and
  `scripts/check.ts` has a real bidirectional-diff gate for it (not just a name lookup).
  `MAX_CONFIG_BYTES` is `12_000` in both the Worker and the doc.
- **`validDuelPages` / `validLookPages` prototype-pollution safety.** Both use
  `Object.prototype.hasOwnProperty.call(PATHS, key)` / `Object.prototype.hasOwnProperty.call(FIGHTERS,
  v)` against a trusted own-property source before ever using an untrusted key to index or assign,
  which correctly excludes `__proto__`, `constructor`, `toString`, etc. Verified the reasoning holds
  even for the JSON.parse `"__proto__"`-as-own-property edge case (own-property check against `PATHS`
  still returns false since `PATHS` never has a literal `__proto__` key).
- **`validDuelPages`'s "refuse, never repair, drop don't default" doctrine**, including the
  `tuning` sub-object's independent partial-narrowing pass — traced through by hand for the
  documented failure cases (`{ zoom: 99 }`, `{ good: [] }`, a mis-cased `pin`) and all correctly
  drop the key rather than silently keeping a default-valued but "working" override.
  `sameSetting`'s identity-vs-equality distinction for `good`/`evil`/`pin` is implemented correctly
  (order- and length-sensitive comparison against the validated result, not just "is it in range").
- **Guardrail resolution wiring** (`theme.ts`'s `themeClasses`, `App.tsx`'s call site,
  `guardrails.ts`'s `resolve`/`effectiveStation`/`effectiveGrain`). Confirmed `App.tsx:141-142`
  passes `look` (not `config`) to both `themeClasses` and `themeVars`, confirmed `themeClasses`
  resolves `station` against the **drawn** ornament (`drawn.ornament`, the operator-roll/visibility
  -resolved value) rather than the stored one, and confirmed `SiteConfigPanel.tsx`'s own
  `warnings()`/`combinationOf()` call deliberately uses the **stored** merged config
  (`{ ...config, ...pageLook }`) rather than the drawn one, matching its own documented rationale
  (the panel is judging what publish will send, not what the operator currently sees rendered).
  Both `matched()` and `warnings()` do have live callers today (in `SiteConfigPanel.tsx`) — the
  "no caller in `src/`" state CLAUDE.md describes as a past bug is not the current state.
- **Ornament/fx operator-gating chain** (`ConfigContext`'s `ornament`/`fx` fields, `visibleOrnament`,
  `visibleFx`, `rollableOrnaments`, `rollableFx`, the per-page-pin-beats-roll branch). Traced the
  full precedence: page-level `lookPages[page].ornament` override beats the operator's per-load roll,
  which beats the stored/site `ornament`; a non-operator always gets `visibleOrnament`/`visibleFx`
  applied to the **looked-up** (page-merged) value. Consistent with the documented behaviour.
- **Share code encode/decode** (`shareCode.ts`). Append-only field order, base-36 round trip,
  5/6/7-field backward compatibility, out-of-range fallback to `DEFAULT_ORNAMENT`/`DEFAULT_STATION`
  (not index 0), and the inverted `ENTRANCES_OFF` bit all check out against the documented wire
  format. `SharedConfig` being a `Pick` (not a wider type) is confirmed — duel settings are correctly
  excluded from the codec.
- **`bands.ts` valve-size discrepancy investigated and resolved as a non-bug.** The raw
  `BAND_TOKENS.phone/tablet.valveSize` tokens still read the pre-2026-08-28 values
  (`min(44vw,190px)` / `min(34vw,240px)`), which at first looked like the documented phone/tablet
  duel-widening fix (`min(72vw,300px)` / `min(52vw,340px)`) had regressed. Confirmed via
  `src/styles/chrome.css:1004-1032` that the widening is intentionally implemented as a separate CSS
  override scoped to `.v-ornament.is-duel`/`.is-duelholy` under `.band-phone`/`.band-tablet`
  (excluding `.layout-radial`), layered on top of the base token rather than replacing it. Matches
  the documented design exactly; not a bug.
- **`Config`/`DEFAULT_CONFIG`/`loadConfig` field completeness.** All 20 `Config` fields are present
  and validated in `loadConfig`'s main branch (field-by-field, refuse-and-fallback, no `key in`
  prototype walks anywhere in this module), and all 20 are present in `DEFAULT_CONFIG`. The
  no-published-config branch's redundant explicit `slots: DEFAULT_CONFIG.slots` (already implied by
  the `...DEFAULT_CONFIG` spread immediately before it) is harmless dead code, not worth a separate
  entry.
- **`catalog.ts` / `ornaments.ts` wire-format append-only discipline** (`FX`, `LAYOUTS`, `TYPESETS`,
  `ORNAMENTS`, `STATIONS` indices), `PICKABLE_*`/`ROLLABLE_*`/`hidden`/`operatorOnly` split. All
  consistent with the documented invariants; the two duel entries in both `FX` and `ORNAMENTS`
  correctly carry both `hidden`/`operatorOnly` flags for the documented, distinct reasons.
- **`presets.ts`.** Structural definition with derived share codes (not hardcoded strings), and the
  `raise()` guard against a silently-wrong `-1` index on a typo'd palette/typeset id. No stale
  ornament references (all three presets correctly point at `sonar`/`none`, not a withdrawn circle).
- **`src/share/paths.ts`** (technically outside the config slice, included since it was named as
  "if config-related" — it is not; it's the file-sharing path-traversal validator). Skimmed for
  obvious issues only: component-array design, traversal/reserved-name/trailing-dot refusal all look
  sound. Not deeply audited since it belongs to the accounts/sharing slice, not config architecture.
