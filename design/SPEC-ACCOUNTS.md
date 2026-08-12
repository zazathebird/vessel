# Handoff: Vessel — identity, saved setups, and brokered drive access

**Status: proposal. Nothing here is built.** This document exists to be argued with before any code is
written. `design/SPEC.md` remains authoritative for the site as it stands; this is a companion that
extends it, and where the two disagree, the disagreements are called out explicitly in §1.

Decisions already fixed by the client, in conversation on 2026-08-12:

| Question | Answer |
|---|---|
| What "their own media selection" means | Each account holds **the person's own site setup** — palette, layout, effect, typeface, ornament — as named, saved profiles |
| Whose drives | **Everyone's.** Each user can expose their own machines and grant access to others. Not just the operator's |
| Sign-in | **Passkeys / WebAuthn.** No passwords stored anywhere |
| Sequencing | **This spec first, approved, then build** |
| What the agent *is* | **A browser tab holding a File System Access directory handle.** Not a native binary. See §8 |
| Permissions | **Read-only.** The `perms` field exists in the grant document so writes remain possible later, but nothing writes |
| Sharing unit | **A folder within a drive**, never a whole drive |
| Grantee identity | **An account is required**, reached through a one-tap invite link. No capability URLs |

The second of these replaced an earlier reading of the client's note — *"any drives i deem them
accessible, which i will do per user manually"* — which described a narrow model where the operator is
the only machine owner. The broad model is confirmed, and §8's move away from a native binary is what
makes it affordable; see §12 for what that decision cost and saved.

---

## 1. What this breaks

Stating this plainly up front, because the current spec is emphatic about it and a reader deserves to
know the cost before the design argues for itself.

`SPEC.md` §Assets: *"The site makes no network requests at all."* §State: *"No data fetching. No
backend. Everything is local."* Both stop being true. That is the price of the feature and there is no
version of it that avoids the price.

Three things are **not** broken, and the design below works to keep them that way:

- **No third-party runtime libraries.** WebAuthn, P-256 signing, HKDF and AES-KW are all native
  `WebCrypto`; WebRTC handles the transport and its encryption itself. The Worker side needs a small
  hand-rolled CBOR reader (~120 lines, one narrow subset) and nothing else. The React app gains no
  dependencies.
- **No images, no webfonts.** Unchanged.
- **The operator door stays theatre.** `SPEC.md` §Security is explicit: *"If real authentication is
  ever wanted, it needs a backend and should not reuse any of this UI."* Real auth gets its own
  surfaces. The door keeps guarding the settings panel and keeps making its joke.

One further tension worth naming: `SPEC.md` fixes *"Share codes — operator generates them; anyone can
have one applied to them."* Accounts make every user a generator of their own setups. That is an
extension of the decision rather than a reversal — the operator's codes stay operator-only, and a
user's saved setups are private to that user until they choose to share one — but it is a change and
it should be acknowledged rather than smuggled in.

## 2. Why brokered, and the honest case against it

The client chose brokered access over central custody. That is the right call, and the reason is not
technical: **centralising makes the operator the custodian of everyone's private files.** That is a
breach liability, a legal liability, and it flatly contradicts the site's own stated ethos (*"a form
is a database is a liability"*).

The case against, stated fairly, because it is real:

- **Availability is tied to the owner's machine.** Asleep, offline, or moved house means the files are
  gone until it comes back. There is no server-side copy to fall back to. This is inherent, not a bug
  to be fixed later. With a browser agent it is sharper still: the sharing tab must be *open*.
- **There is a setup step**, though no longer an install one. Every person exposing a folder must open
  the sharing page and pick that folder. That is a far smaller ask than a native binary, but it is not
  nothing, and the tab-stays-open requirement is the honest cost of removing the install.
- **Sharers are limited to Chromium.** The File System Access API exists in Chrome, Edge and other
  Chromium browsers, and in neither Firefox nor Safari. Grantees are unaffected — receiving a file
  needs no special API — so the restriction lands only on the smaller group, but it is a real one.
- **The security surface is larger, not smaller.** Decentralising removes the honeypot but adds a
  capability system, a signalling service, and a peer-to-peer transport. Each is a place to get it
  wrong. It no longer adds a native binary on people's home machines, which was the largest single
  item on this list.

The design below is shaped to make those costs as small as they can be, but it does not eliminate
them, and the feature should not be sold internally as though it does.

## 3. Threat model

**What the system must protect against:**

| Adversary | Guarantee |
|---|---|
| The site operator | Cannot read any user's files, and cannot mint a grant. The site holds no key that opens anything |
| The signalling service | Brokers a handshake and sees who connected to whom, when. File bytes never pass through it at all |
| A TURN relay, when one is needed | Sees DTLS ciphertext and traffic timing. No plaintext, no filenames, no keys |
| Network attacker | TLS to the edge, plus DTLS end-to-end between the two peers inside it |
| **A hostile signalling service** | Could substitute its own DTLS fingerprint and sit in the middle. Defeated by fingerprint binding — see below |
| A malicious grantee | Confined to exactly the folder granted, read-only, until expiry or revocation |
| A stolen laptop | Passkey requires user verification (biometric or PIN) on every sign-in |
| **A compromised site frontend** | See below — this is the hard one |

**The signalling MITM case.** Because the two peers discover each other through a service the site
operates, that service brokers the exchange of DTLS fingerprints — and whoever controls that exchange
can offer their own fingerprint to each side and decrypt everything in between. DTLS alone does not
prevent this; it only guarantees that *some* two endpoints share a channel.

The fix is mandatory, not optional, and without it the first row of this table is false: **the agent
signs its DTLS fingerprint with its machine key, and the grantee verifies that signature against the
`agent_pubkey` recorded when the machine was paired.** A substituted fingerprint fails the check and
the connection is refused. The signalling service is thereby reduced to an introducer that cannot
listen.

**The compromised-frontend case.** If the site's JavaScript is ever compromised (XSS, or a hostile
deploy), it runs in the origin that can use the signed-in user's grant key. A non-extractable
`CryptoKey` means the key itself cannot be stolen, but hostile code could still *use* it to sign a
malicious grant while the user is signed in. Three mitigations, all specified as requirements:

1. **Every grant signature requires a fresh passkey user-verification gesture.** Signing a grant means
   a biometric prompt, every time. Hostile code cannot mint grants silently in the background.
2. **The agent logs every grant it accepts** and the owner can review that log. The agent's record is
   authoritative and lives outside the site's reach.
3. **Strict CSP, no inline script, no third-party origins.** The site already has no third-party
   anything, which makes this unusually easy to hold.

**Explicit non-goals.** A grantee with read access can copy the file — that is what read access is,
and no DRM is attempted. Protecting a user from an owner who grants and then revokes is not attempted.
Anonymity is not attempted; the relay learns which account talks to which machine and when.

## 4. Identity

**Passkeys, `userVerification: "required"`, discoverable credentials preferred.**

An account is a display handle plus one or more passkey credentials. **No email address is required
and none is collected** — which keeps the "no database is a liability" instinct partly intact and
means a breach of the account table leaks handles and public keys, nothing more.

Recovery, since there is no email to send a reset to:

- The primary path is **registering a second passkey** at signup, prompted but skippable.
- The fallback is a **one-time recovery code** shown once at signup, which the user stores themselves.
- If both are lost, the account is lost. This is stated to the user in plain language at signup, not
  buried. Losing an account costs the user their saved setups and their grants — not their files,
  which never left their machine.

**Verification is hand-rolled in the Worker.** Registration parses `clientDataJSON` (plain JSON) and
the `attestationObject` (CBOR) for `authData`, from which the credential ID and COSE public key are
read at fixed offsets. Attestation is `none` — the site does not care which vendor made the
authenticator. Only ES256 (`alg: -7`) is accepted, which narrows the CBOR shapes that must be handled
to a small, testable set. Authentication verifies the signature over
`authData || SHA-256(clientDataJSON)` and checks challenge, origin, RP ID hash, and the user-verified
flag. Sign-count monotonicity is checked but not enforced, because synced passkeys commonly return 0.

Sessions are an HttpOnly, Secure, SameSite=Lax cookie carrying an HMAC-signed token, short-lived with
refresh. No JWT library, no third-party identity provider.

## 5. Two key hierarchies, and why they are separate

This is the load-bearing idea in the whole design, so it gets its own section.

**Key 1 — account identity.** The passkey. Proves "I am this account" to the site. Scoped to the site,
useless anywhere else.

**Key 2 — grant authority.** A P-256 keypair, generated in the browser, that signs capability grants.
**This is what the agent trusts.** The site never sees its private half.

They are separate because a WebAuthn assertion is an awkward signing oracle — it signs a challenge
wrapped in client-data JSON, not arbitrary payloads, and the agent would have to understand WebAuthn
to verify one. A plain P-256 signature over a plain grant document is something a small Go binary can
verify in a few lines.

**How the grant key survives across devices**, without the server ever holding it:

1. At signup, generate the grant keypair in the browser.
2. Use the WebAuthn **`prf` extension** to derive 32 deterministic bytes from the passkey.
3. HKDF those into an AES-KW wrapping key; wrap the grant private key with it.
4. Store the **wrapped** key server-side, alongside the account.
5. On any device where the passkey syncs, the same PRF output unwraps the same grant key.

The server holds ciphertext it cannot open. If `prf` is unavailable on the authenticator, the fallback
wraps the key with a PBKDF2-derived key from a user-chosen passphrase — worse UX, same server-side
property, and the only place in the design where a passphrase appears.

## 6. The trust model, end to end

```
  Owner's browser                Site + Signalling            Owner's sharing tab
  ───────────────                ─────────────────            ───────────────────
  passkey ──► grant key                                        agent + folder handle
      │                                                            │
      │  ①  pairing: same account, both tabs signed in             │
      ├───────────────────────────────────────────────────────────►│
      │     agent stores owner's grant PUBLIC key as its root,     │
      │     and registers its own machine key with the site        │
      │                                                            │
      │  ②  signs grant: {grantee, drive, paths, perms, exp}       │
      ├──────────────────►  site stores it  ──────────────────────►│
      │     (site can read it; site CANNOT forge it)               │
      │                                                            │
  Grantee's browser                                                │
      │  ③  signalling: SDP + DTLS fingerprint, signed by agent    │
      ├──────────────────►   DO introduces  ──────────────────────►│
      │      grantee verifies fingerprint against agent_pubkey      │
      │                                                            │
      │  ④  WebRTC data channel — DIRECT, peer to peer             │
      └════════════════════════════════════════════════════════════┤
             file bytes never touch the site      agent verifies:
                                                  • signed by root?
                                                  • grantee key matches?
                                                  • path in scope? not expired?
                                                  • not revoked?
```

Three properties fall out of this, and they are the reason to build it this way:

- **The site is a mailbox and a directory.** It stores grants and helps people find each other. It
  cannot create a grant, cannot open one, and cannot read a file.
- **The signalling service is an introducer, not a pipe.** It brokers a handshake and then drops out of
  the conversation entirely. It learns who talked to whom and when, and nothing else — and because
  fingerprints are signed, it cannot insert itself even if it wants to.
- **The agent is the policy enforcement point.** It is the only component that decides whether a
  request is allowed, and it is on hardware the owner controls.

**Revocation** works because of the last point. The signed grant is how a capability *reaches* the
agent; once it arrives, **the agent holds the authoritative list.** Revoking means the owner signs a
revocation, the agent applies it, and the grant is dead — no expiry window to wait out, no
distributed cache to invalidate, no reliance on the site being honest. Grants also carry a
conservative expiry (default 30 days) as a backstop for the case where the owner loses their keys and
can never sign a revocation.

## 7. Phasing

The client's earlier decision to phase this still holds, and the phases now have clearer edges. Each
phase is independently shippable and independently useful.

**Phase 1 — accounts and saved setups.** Passkey signup and sign-in, an account page, named setups
saved and applied. No agent, no relay, no drives. This is genuinely small: the site already encodes an
entire setup as a six-field share code, so a saved setup is a row holding a name and a code. It also
does the unglamorous work of proving the auth layer, the session layer and the new dialog vocabulary
in a context where nothing dangerous can go wrong.

**Phase 2 — your own drives.** The sharing page and its directory handle, the signalling service,
pairing, WebRTC transport with fingerprint verification, and browsing your own machine from your own
browser. No grants to other people yet, which means no capability system to get wrong — the only
principal is the owner. This is where the transport and the file protocol get hardened.

**Phase 3 — granting to others.** The capability system, invite links, the grant/revoke UI, the audit
log. Everything in §6 that involves a second person.

The temptation will be to collapse 2 and 3. The reason not to is that phase 2's failure mode is "my
own files don't load" and phase 3's is "a stranger read my files." Those deserve separate hardening
passes and separate review.

## 8. Components to be built

**The agent — a page, not a binary.** This reverses the earlier draft, and the reversal is what makes
the broad model affordable. The agent is a route on the site itself, opened on the machine that holds
the files. `showDirectoryPicker()` returns a live handle to a real folder; the handle is persisted in
IndexedDB and re-permissioned on later visits, so the folder is chosen once rather than every session.
That tab holds a WebSocket to the signalling service, stores the owner's grant public key as its trust
root, enforces path scoping, and serves reads over a data channel.

What this buys, stated plainly because the earlier draft called the install step *"the single biggest
risk to the feature being used at all"*:

- **No install, so no code-signing.** A native binary asking to share your drives needs an OV or EV
  certificate, a verified business entity, hardware-backed keys and a signing step in every release —
  several hundred dollars a year and a real process — or else it greets every user with the same
  full-screen OS warning that actual malware produces. None of that applies to a web page.
- **A far smaller blast radius.** A native agent runs with the user's full filesystem rights, so a path
  bug reaches the whole disk. The browser can only ever hand out handles to folders the user explicitly
  picked; the sandbox enforces the outer boundary that the earlier design enforced only in our code.
- **One language, one codebase.** No Go toolchain, no cross-compilation matrix, no second
  implementation of grant verification to keep in step with the first.

The costs are equally plain: **the tab must stay open**, and **sharers must use a Chromium browser**.
Both are recorded in §2.

A native always-on agent remains a legitimate later addition for anyone who wants sharing to survive a
reboot. It is explicitly *not* a prerequisite, and the code-signing question travels with it rather
than blocking this build.

**The signalling service.** A Cloudflare Durable Object per paired machine, brokering SDP offers,
answers and ICE candidates — kilobytes, not files. Durable Objects remain the right primitive because a
session is stateful and pinned to one machine.

**The transport.** A WebRTC data channel, negotiated through that Durable Object and then running
**directly between the two peers**. This is the significant economic change: file bytes do not flow
through Cloudflare, so hosting cost scales with connection count rather than with megabytes
transferred. The earlier draft deferred peer-to-peer because implementing WebRTC in Go was real work;
with a browser on both ends, `RTCPeerConnection` is simply present.

**TURN**, for the minority of connections whose NATs refuse to traverse — a fair planning assumption is
10–20%. Those fall back to a relayed path, which is a genuine per-byte cost, merely a bounded and much
smaller one. Cloudflare sells TURN directly and is the default choice.

**The store.** Cloudflare **D1**, not KV. Grants need relational queries ("everything granted to this
person", "everything on this machine") and revocation needs read-after-write consistency, which KV's
eventual consistency would quietly undermine.

**Encryption on the wire.** WebRTC data channels are DTLS-encrypted between the peers by construction,
including when relayed through TURN, so the hand-rolled ECDH/HKDF/AES-GCM layer the earlier draft
specified is **removed as redundant**. What replaces it is smaller and load-bearing: the agent signs
its DTLS fingerprint with its machine key and the grantee verifies that signature against
`machines.agent_pubkey` before accepting. See §3 — without this the transport is authenticated only by
the signalling service, which is exactly the party it must be secure against.

## 9. Data model (D1)

```
accounts      id · handle · created_at · wrapped_grant_key · grant_pubkey · recovery_hash
credentials   id · account_id · credential_id · public_key · sign_count · label · created_at
setups        id · account_id · name · share_code · created_at        ← phase 1 ends here
machines      id · owner_id · name · agent_pubkey · paired_at · last_seen
drives        id · machine_id · label · root_path · created_at
grants        id · drive_id · grantee_id · paths · perms · expires_at · signed_doc · revoked_at
invites       id · grant_id · issued_by · token_hash · claimed_by · expires_at   ← phase 3
audit         id · actor_id · action · target · at        ← append-only, mirrored by the agent
```

`signed_doc` is the owner-signed grant, stored verbatim. The site never regenerates it and never needs
to understand it beyond routing it to the right agent.

Three notes on fields whose shape is decided rather than incidental:

- **`grants.perms` exists but only ever holds read.** Keeping the field costs one column and one check
  the agent always passes; removing it would mean a migration and a grant-format version bump on the
  day writes are wanted. Nothing in the UI offers a write option.
- **`drives.root_path` is the folder the owner picked**, not a volume. Grants scope to a path at or
  below it. The agent must resolve and re-check every requested path against that prefix *after*
  normalisation, and must refuse symlinks that escape it — folder scoping is only as good as this
  check, which is the one place in the agent worth a dedicated test suite.
- **`invites.token_hash`, never the token.** An invite link carries a single-use token that admits the
  holder to *registration for a named grant* — it is not itself a capability and confers no access
  until a passkey is registered and a public key exists to bind the grant to. It expires, and it is
  stored hashed so a leak of the table does not leak live invites.

## 10. New interface surfaces

The client's note — *make it not look like high school teenagers did it: proper prompts, commands,
popups, effects* — is a requirement of this spec, not a follow-up to it. The reason it belongs here is
structural:

**The site currently has no vocabulary for any of this.** It makes zero network requests, so it has no
loading state, no error state, no retry, no optimistic update, and no way to say "that didn't work."
It has toasts, which are right for *"palette changed"* and completely wrong for *"revoke this person's
access to your documents?"*. Accounts and grants introduce dozens of moments that need a considered
answer and would otherwise get an improvised one. Improvised is exactly what reads as amateur.

**A dialog primitive.** Focus-trapped (`useFocusTrap` already exists and is used by both current
overlays), Escape to dismiss, focus returned on close, backdrop blur matching the panel's `22px`,
entrance on the existing `cubic-bezier(.2,.8,.2,1)` at the panel's 340ms. Palette-driven like
everything else — no literal colours. **It does not reuse the operator door**, per `SPEC.md` §Security.

**A command palette**, on `⌘K` / `Ctrl+K`. This is the "proper commands" ask, and it earns its place
rather than being decoration: the site already has ~50 discrete actions across nine pages, twenty-four
palettes, thirteen layouts, twelve effects and five ornaments, currently reachable only by opening a
drawer and hunting. Accounts add sign-in, setup switching and grant management on top. A palette also
fits the site's character — it is the interface a repair operator would actually want.

**Destructive confirmation.** Revoking access and deleting an account use a confirm dialog with the
consequence stated in specific terms ("Ada will lose access to 3 folders on *workshop-pc*"), not a
generic "are you sure". Account deletion requires typing the handle. **`window.alert`, `window.confirm`
and `window.prompt` are banned outright** — they are the single loudest amateur tell, and they would
also break the browser-automation guidance the project already follows.

**Async vocabulary.** Every network action defines pending, success, and failure, with failures stating
what to do next. Buttons disable and show progress in place rather than swapping to a spinner that
loses the label. Nothing spins for longer than 400ms without saying what it is waiting for.

**Where the new UI lives.** Two new routes in phase 1, `/account` and `/machines`, joining the nine
existing pages in `src/data/pageIds.ts`. They are chrome-consistent — same header, same hero, same
content grid, same thirteen layouts apply — because a bespoke settings aesthetic bolted onto this site
is the other way this reads as amateur.

Phase 2 adds a third, `/share` — the agent itself. It is the one surface with a reason to *diverge*:
it is a long-lived tab whose job is to be glanceable from across a room and to make "this tab is
holding your folder open" unmissable. It stays palette-driven and uses the same tokens, but it need not
pretend to be a content page.

**Effects.** The client asked for these too. The site's motion is already strong and the risk is
additive noise, so: the new surfaces use the existing five motion systems and the existing easing
tokens, and add nothing. The richer-transitions work (backlog item 3) stays a separate project with
its own constraint — *every layout, palette and ornament must stay visually distinct* — and folding it
in here would compromise both.

## 11. Integration with what exists

Verified against the current tree, not assumed.

**Saved setups are nearly free.** `encodeShareCode` / `decodeShareCode` (`src/config/shareCode.ts`)
already do the whole job: six base-36 fields — palette, layout, fx, typeface, a toggle bitfield
(grain/breathe/cursor/calm), ornament. A saved setup is a name and that string. Two properties come
along for free and are worth keeping: five-field legacy codes still decode and deliberately leave the
ornament untouched (`shareCode.ts:57`), and applying any code forces `mode: "static"`
(`shareCode.ts:66`) — a saved setup should behave identically, so loading one stops the randomiser
exactly as pasting a code does today.

**Adding `/account` and `/machines` is five coordinated edits**, and `Record<PageId, …>` turns four of
them into compile errors until done, which is the good kind of coupling:

1. `src/data/pageIds.ts` — add the ids to the `PageId` union
2. `src/data/pageIds.ts` — add to `PATHS`; `BY_PATH`, `pageFromPath`, `go` and popstate are all derived
   and need no further change
3. `src/data/pages.ts` — add entries to `PAGES`, or `App.tsx:29` hands `undefined` to `page.blocks.map`
4. `src/data/pageIds.ts` — decide on `NAV`. Note `useOperatorRoutes.ts:59-64` cycles `NAV` only, so a
   page left out of it is unreachable by arrow-key paging
5. `persistence.ts` needs nothing — it validates `page` against `Object.keys(PATHS)` and picks them up

`public/_redirects` already handles the SPA fallback on Cloudflare.

**Context split.** `ConfigContext` gains an optional `account` and the setup list. **It does not gain
fetching** — a separate `AccountContext` owns every network call, so `ConfigContext` stays synchronous
and a signed-out visitor's experience is bit-for-bit what it is today. `loadConfig()` runs
synchronously during first render specifically to avoid a default-palette flash
(`ConfigContext.tsx:79-86`); an async account fetch must never be allowed to reintroduce one.

**Overlay plumbing.** A new dialog mounts as one more sibling at `App.tsx:119-122`, alongside the
screensaver, panel and door — not as a child of `.v-chrome`, for the reason already documented there.
It uses `useFocusTrap(open, ref)` unchanged. The z-index ladder currently runs panel 60, saver 70,
door-scrim 80, toast 90; the account dialog takes **75** and the command palette **85**, keeping
toasts on top where they belong.

**`theme.ts` is untouched.** No new colours, no new tokens.

**Persistence** keeps working signed-out, unchanged, on `vessel.cfg.v2`. Signed in, the server copy
wins on conflict and the local copy is the offline fallback.

**Everything degrades.** If the Worker is down, or the user is signed out, or they never make an
account, the site is exactly the site that exists now. Accounts are strictly additive; nothing that
works today acquires a dependency on a network call.

### What the codebase does not yet have

Worth knowing before estimating the UI work: **there is exactly one `<input>` in the entire
application and zero `<form>` elements.** The sole input is the share-code paste field
(`SiteConfigPanel.tsx:255-271`). The only shared primitive is the CSS class `.chip`
(`base.css:89-116`), hand-applied about ten times; there is no `Button`, `Input`, `Field` or `Dialog`
component, and no validation, error-display or focus-ring convention to inherit.

So an account screen is the first form, the first labelled input, and the first submit button this
codebase has ever had. That is the concrete reason §10 is a requirement rather than polish — there is
nothing to copy, so whatever gets built first *becomes* the convention.

One defect in the existing input is worth fixing as part of that groundwork, since it would otherwise
be inherited by every form that follows:

- **The paste field submits on Enter only** — no button, no form — so a code cannot be applied by
  mouse or touch alone (`SiteConfigPanel.tsx:261-271`).

An earlier draft of this section also claimed `.v-paste` had no visible focus indicator, on the
strength of its `outline: none` (`overlays.css:185-194`). **That was wrong.** `.vessel :focus-visible`
(`base.css:68`) is specificity 0-2-0 against that rule's 0-1-0 and wins on specificity irrespective of
source order; the field focuses with the standard `--a1` ring. Verified in a browser rather than
reasoned about. The retraction is kept here rather than deleted because the claim also reached
`CLAUDE.md`, and a plausible-sounding bug is easier to re-introduce than to disprove twice.

## 12. Open questions

### Resolved 2026-08-12

The five questions this section originally carried are all answered, and the answers are folded into
the sections above rather than left here. Recorded for the reasoning, since several were close calls:

1. **Who operates the relay?** — Cloudflare, but the role shrank. Choosing a browser agent put
   `RTCPeerConnection` on both ends, which demoted the Durable Object from pipe to introducer and moved
   file bytes off the operator's infrastructure entirely. The residual cost is TURN for the 10–20% of
   connections that cannot traverse NAT. This was the strongest objection to the broad model and it is
   now largely gone.
2. **Does the agent get code-signed?** — **Moot for this build**, because there is no binary. It
   returns only if a native always-on agent is built later, and it travels with that decision.
3. **Write access, or read-only?** — **Read-only.** The `perms` field stays in the grant document so
   writes remain reachable without a format change; no surface offers them.
4. **What is the sharing unit?** — **A folder**, per the original assumption. Whole-drive-only would
   make the first mistake unrecoverable.
5. **Does a grantee need an account?** — **Yes**, reached through a one-tap invite link. Capability
   URLs were rejected: they leak through history, referrers and chat, they cannot be bound to a person,
   and they reduce the audit log to "someone who had the link."

### Still open, and now blocking phase 2

The browser agent answers old questions and raises new ones. None of these block phase 1.

1. **What happens when the sharing tab closes?** The honest answer today is "sharing stops," which is
   correct but needs to be *communicated* rather than merely true. A grantee hitting a closed tab must
   see "that machine is offline" and not a generic failure. Whether the owner gets any warning before
   closing — and whether that is even possible without being obnoxious — is undecided.
2. **How durable is the persisted directory handle in practice?** Handles survive in IndexedDB and
   permission can be granted persistently, but browser storage eviction, profile clearing and policy
   changes can all revoke it silently. The re-pairing path needs to be routine and cheap rather than an
   error state, and it has not been designed.
3. **What is the TURN budget, and what happens when it is exhausted?** Per-byte cost on the relayed
   minority is bounded but not zero, and an unauthenticated-by-default TURN service is an abuse target.
   Credentials must be short-lived and issued per session.
4. **Does the agent enforce a rate or volume limit?** Nothing currently stops a grantee reading the
   same folder continuously. The agent is the right place to cap it, and no cap is specified.
5. **Multiple sharing tabs on the same machine, or the same folder shared from two machines.** Both are
   reachable states with undefined behaviour.

### Deferred with the native agent, if it is ever built

Code-signing certificates and their annual cost; a Go implementation of grant verification kept in step
with the TypeScript one; installer and update mechanics; running as a service. All of it is avoidable
for as long as the tab-open constraint is acceptable.
