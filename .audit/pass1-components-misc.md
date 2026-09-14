# Pass 1 audit — components (misc), hooks, audio engine, pageIds, dev benches

Read-only debugging audit. No files changed except this one. Scope per assignment:
`src/components/*` (chrome, overlays, palette, account forms, ornament, content
blocks/contact/email-reveal), `src/audio/engine.ts`, `src/hooks/*`,
`src/data/pageIds.ts`, and build-exclusion of the five dev benches.

Explicitly **not** deep-audited here (left to their own passes, per the multi-pass
split): the duel engine internals (`DuelOrnament.tsx`, `DuelBench.tsx`,
`DuelSettingsEditor.tsx`, `src/fx/*`), the downloads feature internals
(`DownloadsPage.tsx`, `DownloadPage.tsx`, `DownloadEditor.tsx`, `DownloadCodes.tsx`,
`CategoryIcon.tsx`, `FileIcon.tsx`), phase-2 sharing (`MachinesPage.tsx`,
`SharePage.tsx`, `src/share/*`), and `src/auth/*` crypto internals. I did read the
account-form *components* (`SignIn.tsx`, `SignUp.tsx`, `PasswordField.tsx`,
`Passkeys.tsx`, `TotpEnrol.tsx`, `ProofDialog.tsx`, `Setups.tsx`) since the task
named them explicitly, but only for React-logic bugs, not crypto correctness.
`src/data/pages.ts`, `catalog.ts`, `guardrails.ts` etc. are other passes' data
slice; I only touched `pageIds.ts`.

## Findings

### 1. `aria-modal="true"` on the panel and door is a false promise to assistive tech — MEDIUM — logic-confirmed, browser confirmation would strengthen it

- `src/components/SiteConfigPanel.tsx:99` — `useFocusTrap(panelOpen, panelRef);` (no
  `{ modal: true }`)
- `src/components/SiteConfigPanel.tsx:206-209` — the `<aside>` carries
  `role="dialog" aria-modal="true"`, with a comment reading: *"The spec asks for
  focus trapping here, and a trapped drawer is modal whether or not it covers the
  page — so say so rather than letting the ARIA and the keyboard behaviour
  disagree."*
- `src/components/OperatorDoor.tsx:20` — `useFocusTrap(doorOpen, dialogRef);` (also
  no `{ modal: true }`)
- `src/components/OperatorDoor.tsx:33` — `role="dialog" aria-modal="true"` on `.v-door`

`isModalOpen()` (`src/hooks/useFocusTrap.ts`) only counts a trap as modal when
`{ modal: true }` is passed, and only `Dialog.tsx` and `CommandPalette.tsx` pass it.
Panel and door deliberately don't, per CLAUDE.md ("The panel and door are
deliberately not modal: `sudo` with the panel open opens the door"). That is a
real, working, and apparently intended behavior. But it directly contradicts:
  (a) the `aria-modal="true"` markup on both elements, which tells assistive tech
      the rest of the document is inert, and
  (b) the SiteConfigPanel's own comment, which claims the code was written so ARIA
      and keyboard behavior would *not* disagree — they do disagree, by design.

Concrete failure: a screen-reader user is told (via `aria-modal="true"`) that
nothing outside the panel/door can be reached, but a sighted/keyboard user can
still type `sudo`, `⌘K`, drag sideways, etc. while either is open, changing state
underneath the "modal" dialog. This is a WCAG/ARIA authoring-practices violation
(`aria-modal` implies full page inertness) independent of whether the actual
keyboard-routing behavior is desirable.

### 2. Arrow-key NAV paging is not gated on `doorOpen`, only `panelOpen` — MEDIUM — confirmed by code inspection, no browser needed

`src/hooks/useOperatorRoutes.ts:144-153`:

```ts
if (
  (key === "arrowright" || key === "arrowleft") &&
  !live.current.panelOpen &&
  !konamiStarted(keys)
) {
  const i = NAV.findIndex((n) => n.id === live.current.page);
  if (i > -1) go(NAV[(i + (key === "arrowright" ? 1 : NAV.length - 1)) % NAV.length].id);
}
```

The guard checks `!live.current.panelOpen` but omits `!live.current.doorOpen`.
Since `isModalOpen()` also returns false while only the door is open (see finding
1), nothing stops this branch firing while the operator door dialog is on screen.

Concrete failure scenario: operator opens the door (five taps, `sudo`, konami,
`⌘K`, drag, or the footer dot), then presses ArrowLeft/ArrowRight — for example
while reading the door's route list, or just out of habit navigating the site —
and `go()` fires, changing `config.page` and re-rendering the whole page
underneath the still-open door overlay. The door itself has no page-aware content
so it doesn't visibly break, but the page changes while a `role="dialog"
aria-modal="true"` element claims the page is inert, and the operator is left
looking at a door over a page they didn't mean to navigate to. This has existed
unchanged since the file's initial commit (verified via `git log -S`), and
`scripts/check.ts` has no gate for it (grepped for `doorOpen`/arrow-key terms:
zero matches).

Given the exact same class of bug is called out repeatedly elsewhere in this
codebase's own history (e.g. the documented "`Alt+←`/`⌘+←` is Back" fix just above
this code, and the account-routes/operator-routes drag-guard parity fixes), this
looks like a genuine omission rather than a deliberate design choice — the panel
gate exists specifically to stop this, and the door never got the same treatment.

### 3. `useEdgeFade`'s `document.fonts.ready` callback can fire after unmount — LOW — logic-confirmed, cosmetic only

`src/hooks/useEdgeFade.ts:99`: `document.fonts?.ready.then(schedule).catch(() => {})`
is not cancelled in the cleanup function (only the ResizeObserver, the
MutationObserver, the scroll listener and any pending rAF are cleaned up). If the
component unmounts (e.g., a very fast page change) before fonts finish loading,
`schedule` → `measure` will still run later and call `el.setAttribute(...)` /
`el.removeAttribute(...)` on a detached DOM node. This can't throw and has no user-
visible effect (the node is unreferenced garbage at that point), so it's a no-op
leak rather than a bug — noting it for completeness since CLAAUDE.md asks
specifically about "uncleaned timers/listeners on unmount", but I would not
prioritize a fix.

## Verified clean (matches documented invariants)

- **`src/hooks/useScramble.ts`** — rAF driven off `performance.now()` deadline
  (550ms), not a frame counter or `setInterval`; each run has a token (`runRef`)
  compared in the frame callback so a superseded run can't stomp a newer one;
  bails immediately on `document.hidden` and skip; cleanup cancels the rAF.
  Matches CLAUDE.md exactly.
- **`src/config/persistence.ts` interplay via `Greeting.tsx`** — first-visit dialog
  fires after 1.2s (deferred further if a modal is already open, re-polled every
  1.5s), stores one "seen it" flag via `markGreeted()` on dismiss (not on show),
  writes no other state. `calmBySystem` branch asks unconditionally regardless of
  `hasBeenGreeted()`, both its buttons call `chooseMotion` (so it cannot re-open
  once answered — derived from stored preference, not a separate "asked" latch),
  and the "still" option leads + `autoFocus`, with Escape routed to the same
  `answer(false)`. This matches every clause of the documented invariant.
- **`src/audio/engine.ts`** — no ambient bed/loop/timer; `AudioContext` is only
  constructed inside `acquire()`, called only from `play()`, so a visitor who
  never enables sound never allocates one; `play()` reads nothing from config
  (pitch/level are hardcoded per voice, root comes from `setAudioPalette`, called
  externally); every oscillator has an explicit `.stop()` scheduled; `releaseAudio`
  closes the context. No literal frequencies outside `ROOTS`/`BASE_HZ`.
- **`src/hooks/useFocusTrap.ts`** — trap stack with only the top trap handling Tab
  and (via `isTopTrap`) Escape; cleanup always splices the ref out of the stack and
  decrements `modals` only when `modal` was true, and restores focus to
  `previous` only if `previous.isConnected` (handles the door→panel replace-in-
  place case named in the comment). No leaked listeners found.
- **`src/hooks/useAccountRoutes.ts`, `src/hooks/useOperatorRoutes.ts`** (aside from
  finding 2) — stable effect dependency arrays (no stale-closure risk beyond the
  `live` ref pattern, which is read at event time correctly); `isEditable` guard
  applied consistently; pointer-drag guards correctly exclude touch and text
  selection on both directions; listeners are removed in cleanup.
- **`src/hooks/useMotionSystems.ts`** — strict adherence to the "per-frame values
  go in refs, not React state" rule: pointer position, scroll velocity and card
  list all live in `motion`/refs and are written straight to the DOM
  (`style.transform`, custom properties), never through `setState`. The one
  `IntersectionObserver`-driven `classList.toggle` is discrete state (arrival a
  few times per page), not per-frame, matching the comment's own justification.
  Cleanup for every effect (pointer listener, scroll listeners, observer
  disconnects, transform resets) is present and correct.
- **`src/components/Header.tsx` / `Footer.tsx`** — footer sign-in link renders
  unconditionally (not behind any flag or session gate beyond swapping its label);
  the wordmark's two tap-counters are on different elements (`.v-logo` vs
  `.v-logo-mark`) with `stopPropagation` on the inner one, matching the documented
  three-taps-admin / five-taps-door split; door-tap countdown correctly gated on
  `isOperator`; admin-tap counter has no countdown (as documented); calm/sound
  toggles correctly call `saveCalmPreference`/`saveSoundPreference` plus `update`,
  and the sound toggle uses `chime` (never `play` directly) after `update`, so the
  gate sees the freshly-set value per the documented 2026-08-18 fix.
- **`src/components/Ornament.tsx`** — reads `ornament`/`fx` off context (resolved),
  never off `config` directly, so the operator-only duel gating cannot leak to
  visitors from this component; `HIDES_ORNAMENT` layouts return `null`; Radial
  keeps the slot at "None" for its nav; grep across `src/` found no dead remnant of
  the old five-tap sign-in reveal (only the explanatory comment remains, as
  intended).
- **`src/components/Greeting.tsx`, `src/components/Dialog.tsx`,
  `src/components/CommandPalette.tsx`, `src/components/ProofDialog.tsx`** — Dialog
  and CommandPalette both correctly pass `{ modal: true }` to `useFocusTrap` and
  their Escape handlers correctly gate on `isTopTrap`; `ConfirmDialog`/`ProofDialog`
  correctly reset local state (`typed`, `password`) don't leak across reopens
  (`ConfirmDialog` has an explicit reset effect; `ProofDialog` is unmounted on
  close so state dies naturally, per its own comment).
- **`src/components/EmailReveal.tsx` / `ContentBlock.tsx`** — email is never in
  static markup; reveal state (`mailShown`) and copy-on-reveal are delegated to
  `ConfigContext` (outside this slice, but the component itself contains no literal
  address and no premature rendering of `MAIL`).
- **`src/components/PasswordField.tsx`, `SignUp.tsx`, `SignIn.tsx`,
  `TotpEnrol.tsx`, `Passkeys.tsx`, `Setups.tsx`** — all follow the one-`<form>`-with-
  `preventDefault`-plus-submit-button convention; no stale-closure or
  unmount-after-fetch issues found (the two list-loading effects in `Setups.tsx`
  and the `api.me()` probe in `SignIn.tsx` correctly use a `live` boolean guard
  against post-unmount `setState`; `Passkeys.tsx`'s `load` doesn't need one since
  nothing unmounts it mid-flight in the observed call sites, though note it has no
  such guard — see below).
- **`src/data/pageIds.ts`** — `PATHS` is a total, compiler-checked map from the
  closed `PageId` union; `pageFromPath`/`subFromPath` agreement is enforced exactly
  as documented (`pageFromPath` defers to `subFromPath`, refusing a path under the
  `/downloads/` prefix with a second slash or empty remainder back to `notfound`);
  `sub` state itself lives outside this file (in `ConfigContext`, not audited
  here) but the two functions that decide what a sub-path *is* are internally
  consistent and match the doc's "the two used to disagree about `/downloads/a/b`"
  fix.
- **Dev-only benches build exclusion** — `vite.config.ts` declares no
  `rollupOptions.input`, so Vite's default single-entry (`index.html`) build
  produces one bundle; `fxlab.html` and `sitelab.html` sit at the repo root
  alongside `index.html` but are not referenced by it and are not part of any
  `input` map, so `vite build` never touches them. Grepped `src/` and `worker/`
  for references to `fxlab`, `sitelab`, `duel-shot`, `duel-bench`, `fx-bench`,
  `fx-shot`, `ornament-shot` — every hit is a code comment (in `DuelBench.tsx`,
  `DuelOrnament.tsx`, `fighters.ts`, `duel.ts`) referencing the *script names* in
  prose, not an import or `<script>`/`<link>` reference. `DuelBench.tsx` (the
  in-app React component embedded in `Admin.tsx`, gated `enabled={isOperator}`) is
  a different thing from `scripts/duel-bench.mjs` (the standalone HTML generator)
  and its inclusion in the shipped bundle is intentional, not a build-exclusion
  leak.

## Minor observation, not filed as a finding

`src/components/Passkeys.tsx`'s `load()` callback (`useCallback`, called from a
mount-only effect) has no `live`/cancellation guard the way `SignIn.tsx` and
`Setups.tsx` do for their equivalent effects. In the current call site (mounted
for the lifetime of the signed-in account summary) this is very unlikely to
matter in practice — I did not find a code path that unmounts `Passkeys` mid-
fetch under normal navigation — so I'm not filing it as a bug, just noting the
inconsistency with the pattern used two files over for the same class of request.
