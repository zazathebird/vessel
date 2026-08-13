# Review continuation — 2026-08-13 (updated after the second session)

State file for the full-codebase review. Nearly everything the first half of this file once
tracked is now DONE, fixed and deployed — `docs/DECISIONS.md` (2026-08-13, "Second review round"
and the two entries above it) is the durable record. What follows is only what is still open.
Delete this file when both items below are done or logged elsewhere.

## Open item 1 — the app-shell/UI review never ran

The Worker and client-auth review agents completed and every confirmed finding was fixed
(178/178 harness checks pass). The third agent died at a session limit before returning any
findings, so this scope is unreviewed by that round:

- src/App.tsx, src/theme.ts
- src/config/ (ConfigContext.tsx, persistence.ts, siteConfig.ts, bands.ts, randomiser.ts,
  shareCode.ts, types.ts)
- src/hooks/ — especially useFocusTrap.ts, useAccountRoutes.ts, useOperatorRoutes.ts
- src/components/ — especially CommandPalette, Dialog, Header, SiteConfigPanel, TotpEnrol,
  SignIn, Setups, DuelOrnament, Ornament, Footer (the last two changed since: ornament unlock,
  operator tabs, leave-operator-mode)
- src/data/, src/fx/, all five stylesheets

Rules for the reviewer: read CLAUDE.md in full first (Architecture, Implementation traps, Known
deviations, Accessibility), plus docs/DECISIONS.md's 2026-08-13 entries. Do not re-report
documented decisions. A prior 2026-08-13 frontend pass (DECISIONS.md: "nine findings fixed,
overlays learn to stack") covered much of this ground once — hunt for what it missed and what
the newest changes broke.

## Open item 2 — small harness nit

The raw-fetch signup fixtures in scripts/auth-e2e.ts (three of them) omit `slotAlg`, which the
Worker silently defaults — so signup *recording* the alg the browser sends is proven only via
the flows-driven sections. One-line fixture edits.

## Also waiting (not review work)

- TODO.md 2 (redeem a recovery code in a real browser, once) and 2c (eyeball the new operator
  chrome + ornament unlock) — both need the client's browser and eye.
- The four "Awaiting client sign-off" items in TODO.md — client decisions, not code.
- Phase 2 of SPEC-ACCOUNTS (machine pairing, the per-machine signalling Durable Object, drive
  brokering) has NOT started. It is the next big build. Read design/SPEC-ACCOUNTS.md §6-§8 and
  §12 before touching it, and keep phases 2/3 uncollapsed (CLAUDE.md).

## Paste-ready prompt for the next session

> Read docs/REVIEW-CONTINUATION.md. First finish its two open items: run the app-shell/UI
> review with the scope and rules it lists (fix what you confirm, run npm run typecheck and the
> auth harness after), and make the slotAlg fixture edits. Then, if I say go, begin
> SPEC-ACCOUNTS phase 2 — spec first, §12 decision log style, authentication-before-interface
> ordering as in phase 1. Deploy only if typecheck, build and the harness are all green.
