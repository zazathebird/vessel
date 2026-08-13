# Handoff: Vessel — identity, saved setups, and brokered drive access

**Status: approved by the client on 2026-08-12. Phase 1 is built and deployed.** This document was
written to be argued with before any code existed; that argument happened, and it is now the
authoritative design. **§12 is the living decision log** — nothing is deleted when it is settled,
every rejection keeps its reasoning and its *"revisit if"* condition. Add to it rather than
relitigating.

`design/SPEC.md` remains authoritative for the site as it stands; this is a companion that
extends it, and where the two disagree, the disagreements are called out explicitly in §1.

**What shipped diverges from this document in three places**, each annotated where it occurs:
the phase-1 routes (§10), the SPA fallback mechanism (§11), and one column the schema has that
§9's inventory does not list (§9). `docs/DECISIONS.md` carries the dated build history;
`CLAUDE.md` carries the invariants.

Decisions already fixed by the client, in conversation on 2026-08-12:

| Question | Answer |
|---|---|
| What "their own media selection" means | Each account holds **the person's own site setup** — palette, layout, effect, typeface, ornament — as named, saved profiles |
| Whose drives | **Everyone's.** Each user can expose their own machines and grant access to others. Not just the operator's |
| Sign-in | **Handle and password, with TOTP two-factor.** Passkeys retained as an alternative credential. No password ever reaches the server — see §4 |
| Email | **Not collected.** Recovery is layered credentials plus operator reset instead |
| Operator reset | **Yes.** The operator can reset any password. It restores account access and cannot restore grant authority — §4 |
| Sequencing | **This spec first, approved, then build** |
| What the agent *is* | **A browser tab holding a File System Access directory handle.** Not a native binary. See §8 |
| Permissions | **Read-only.** The `perms` field exists in the grant document so writes remain possible later, but nothing writes |
| Sharing unit | **Folders, and a machine may expose several.** Never a whole drive — and the browser would not permit one anyway, see §8 |
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
| The site operator | Cannot read any user's files, and cannot mint a grant. The site holds no key that opens anything. **Can** reset a password and thereby enter an account — see the honest statement below |
| The signalling service | Brokers a handshake and sees who connected to whom, when. File bytes never pass through it at all |
| A TURN relay, when one is needed | Sees DTLS ciphertext and traffic timing. No plaintext, no filenames, no keys |
| Network attacker | TLS to the edge, plus DTLS end-to-end between the two peers inside it |
| **A hostile signalling service** | Could substitute its own DTLS fingerprint and sit in the middle. Defeated by fingerprint binding — see below |
| A malicious grantee | Confined to exactly the folder granted, read-only, until expiry or revocation |
| A stolen laptop | Passkeys require user verification (biometric or PIN) on every sign-in. A password account is only as good as its TOTP factor, which is why 2FA is mandatory once a grant exists |
| Credential stuffing | New with passwords, absent with passkeys. Per-account and per-IP backoff in a Durable Object (§4) |
| **A compromised site frontend** | See below — this is the hard one |

**The operator, stated honestly.** An earlier draft of this table implied the operator was powerless
against a user's account. That was never quite true and is definitely not true now that operator
password reset exists (§4). The accurate claim is narrower and still worth having:

> The operator can take over any account. The operator cannot read any user's files, cannot mint a
> grant in a user's name, and cannot revive grant authority they have reset away.

The boundary holds because account access and grant authority are protected by different keys — a
reset destroys the password slot rather than opening it (§5). A user whose account is taken over loses
privacy over their saved setups and their grant *list*; they do not lose their files, and the operator
gains no power to hand anyone else's files to anyone. Users are told the operator can reset passwords,
rather than discovering it — **in plain language, not in the vocabulary of this paragraph.** The exact
user-facing wording is fixed in §4 and deliberately contains none of *mint*, *grant authority* or *key
slot*; those words are for this document only.

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

1. **Every grant signature requires a fresh user-verification gesture**, and the grant key is unwrapped
   for that one operation rather than held unwrapped for the session. On a passkey account that is a
   biometric prompt. **On a password account it is a re-entered password plus a TOTP code** — which is
   why §4 makes two-factor mandatory for any account that has ever issued a grant. Either way, hostile
   code cannot mint grants silently in the background.

   This is the one place the move to passwords genuinely weakened the design rather than merely
   changing it, and it is worth being precise about how. A biometric gesture is unphishable and cannot
   be replayed by script; a typed password and code can both be captured by the same compromised
   frontend they are meant to defend against. What the requirement still buys is that hostile code must
   wait for the user to *choose* to sign a grant and cannot act at an arbitrary moment, plus the
   unwrapped key never outlives the operation. Mitigation 2 is what actually catches this case, and it
   carries more weight now than it did.
2. **The agent logs every grant it accepts** and the owner can review that log. The agent's record is
   authoritative and lives outside the site's reach.
3. **Strict CSP, no inline script, no third-party origins.** The site already has no third-party
   anything, which makes this unusually easy to hold.

**Explicit non-goals.** A grantee with read access can copy the file — that is what read access is,
and no DRM is attempted. Protecting a user from an owner who grants and then revokes is not attempted.
Anonymity is not attempted; the relay learns which account talks to which machine and when.

## 4. Identity

**Two ways in, and one account may hold both.** The client's decision on 2026-08-12 replaced the
original passkey-only design: most people get a **handle and password with TOTP two-factor**, and
passkeys stay available for anyone who prefers them. §12 records why passkey-only was dropped, what it
cost, and what would justify reversing it.

An account is a display handle plus one or more **credentials**, where a credential is a password, a
passkey, or a recovery code. That uniformity is load-bearing for §5 — every credential gets its own
wrapped copy of the grant key, so no single loss is fatal.

**No email address is required and none is collected.** This survives the move to passwords, which
makes it the decision most likely to be questioned later; the reasoning is in §12. A breach of the
account table therefore leaks handles, public keys and hashed secrets, and nothing that identifies a
person or reaches them.

### Passwords, and where the stretching happens

**The password is never sent to the server.** The browser stretches it and sends a derived secret; the
Worker stores only a hash of that secret.

1. Browser: `PBKDF2-HMAC-SHA-256` over the password and a per-account salt, at a high iteration count.
2. HKDF splits that output into two independent values — an **auth secret** sent to the Worker, and a
   **wrapping key** that never leaves the browser (§5).
3. Worker: stores `HMAC-SHA-256(server_pepper, auth_secret)`. Its input is already a 256-bit KDF
   output rather than a human-chosen string, so a slow hash on the server buys nothing here.

Three reasons for this shape over a conventional server-side hash:

- **The plaintext password never reaches the operator's infrastructure at all**, which is strictly
  stronger than storing it correctly hashed.
- **It sidesteps the Worker CPU ceiling.** A high-iteration KDF costs real CPU and Workers cap CPU per
  invocation; the browser has no such cap and is doing the work for exactly one user.
- **The browser must derive a password key anyway** to unwrap its grant-key slot. One derivation, two
  outputs, rather than two unrelated ones.

The honest costs: the auth secret is password-equivalent **in transit**, so it rides TLS, is never
logged and never appears in a URL; and the iteration count is baked into each account's stored
parameters, so raising it later means re-deriving on next sign-in rather than a silent upgrade.
Argon2id was rejected — see §12 — for having no WebCrypto primitive and requiring this project's first
runtime dependency.

**Rate limiting is mandatory and it is new.** Passkeys needed none; passwords invite credential
stuffing. Per-account and per-client attempt limits with exponential backoff, held in a Durable Object
rather than D1 so the counter is consistent under concurrency.

**No raw IP address is stored, anywhere, at any point.** An IP is personal data, and per-IP rate
limiting is the one place in this design where one would otherwise be written down. The counter is
keyed by `HMAC-SHA-256(rotating_salt, ip)` instead — enough to recognise a repeat offender within the
window, useless afterwards. The salt rotates daily, which retires every key with it; entries expire
with the backoff window and are never copied into D1. The `audit` table records **actor and action, not
origin**: what happened and who did it, never from where.

### Two-factor

**TOTP** — six digits, 30-second step, `HMAC-SHA-1` per RFC 6238. That is roughly forty lines over
`WebCrypto`: no library, no SMS, no third-party service, and nothing that needs a phone number. SMS
2FA is rejected outright in §12.

Enrolment shows the secret as a manual string and as an `otpauth://` URI, and issues **ten single-use
backup codes**. Two-factor is optional per account and prompted at signup, but it is **required for
any account that has ever issued a grant** — once a person's credentials protect somebody else's
files, a second factor stops being their decision alone.

### Passkeys

Retained exactly as originally specified, now as one credential type among several rather than the
only one. **Verification is hand-rolled in the Worker.** Registration parses `clientDataJSON` (plain JSON) and
the `attestationObject` (CBOR) for `authData`, from which the credential ID and COSE public key are
read at fixed offsets. Attestation is `none` — the site does not care which vendor made the
authenticator. Only ES256 (`alg: -7`) is accepted, which narrows the CBOR shapes that must be handled
to a small, testable set. Authentication verifies the signature over
`authData || SHA-256(clientDataJSON)` and checks challenge, origin, RP ID hash, and the user-verified
flag. Sign-count monotonicity is checked but not enforced, because synced passkeys commonly return 0.

### Recovery, in four paths

With no email there is no reset link, so recovery is layered instead. In descending order of how much
they preserve:

1. **A second credential.** Any other credential on the account — a passkey, or a password when the
   passkey is what was lost — signs in normally and re-establishes the rest. Nothing is lost at all,
   because it opens its own grant-key slot (§5).
2. **A recovery code.** Ten are issued at signup and at every credential change. Each is single-use and
   holds its own grant-key slot, so redeeming one preserves grant authority in full.
3. **Operator reset** (below). Restores account access; **does not** restore grant authority.
4. **Nothing.** The account is unreachable. Stated plainly at signup rather than buried: saved setups
   and grant authority are lost — *not* the user's files, which never left their machine.

### Operator password reset

**Fixed by the client on 2026-08-12.** The operator can reset any account's password from the admin
surface. It exists because it is the recovery path that email would otherwise have provided, and
adding it is what allowed email to stay uncollected.

It degrades in precisely the right way, and this is the reason it is safe to have:

- **It restores account access.** The user signs in with a new password and finds their saved setups
  where they left them.
- **It cannot restore grant authority.** The password slot holding the grant key is sealed with
  material derived from the password the *user* chose, which the operator never held. A reset destroys
  that slot; it cannot open it. So the operator can enter an account and still cannot mint a grant or
  read one byte of anyone's files.
- **Other people do not lose access.** Grants are already-signed documents the agents already hold, and
  they keep working until expiry. What the user loses is the ability to *issue* new grants or *revoke*
  old ones until they re-pair the machine, which re-roots the agent on a fresh grant key.

Three requirements attached, none of them optional:

1. **The reset is logged to `audit` and shown to the user** on next sign-in — "your password was reset
   by the operator, on this date." An administrative power that leaves no trace is fine right up until
   the once it is not.

   **The wording users see, verbatim.** The threat-model language in §3 is internal — *mint a grant*,
   *grant authority*, *key slot* are terms for this document and must not reach a screen. One short
   passage, shown at signup and again on the account page, in the site's own register:

   > I can reset your password if you lose it. That means I can get into your account, which is worth
   > knowing. It does not mean I can get into your files — a reset destroys the key that shares your
   > folders rather than opening it. You would set your sharing up again afterwards, and anyone you had
   > already shared with keeps working in the meantime.

   No heading called *Disclaimer*, no checkbox, no modal to dismiss. It sits in the page as a plain
   paragraph, the way the home page's admission that the site is unnecessary does. A user agreeing to
   use the site is not the point; the point is that discovering this later would feel like something had
   been hidden, and it costs four sentences not to hide it.
2. **The operator is shown the consequences before confirming**, in specific terms — "Ada has issued 3
   grants; resetting will leave those live until they expire and she will not be able to revoke them
   until she re-pairs *workshop-pc*."
3. **It is a reset, never a read.** No surface anywhere exposes a user's grant key, wrapped or
   otherwise, to the operator — see §12 on why escrow was rejected.

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

**How the grant key survives, without the server ever holding it: key slots.**

There is **one** grant keypair per account, wrapped **once per credential**. Each wrapped copy is a
*slot*. Any single credential opens its own slot and recovers the same key; losing one slot costs
nothing as long as another survives. This is the arrangement LUKS uses for disk encryption, and it is
what makes operator reset (§4) safe to offer — a reset destroys the password slot and leaves every
other slot untouched.

| Slot | Wrapping key derived from |
|---|---|
| Password | The browser-side half of the §4 derivation — HKDF → AES-KW. The auth secret sent to the server is the *other* half and cannot produce this one |
| Passkey | WebAuthn **`prf` extension**, 32 deterministic bytes → HKDF → AES-KW. Syncs wherever the passkey syncs |
| Recovery code | The code itself → PBKDF2 → HKDF → AES-KW. One slot per unused code |

At signup the keypair is generated in the browser, a slot is written for every credential the account
starts with, and only the **wrapped** copies are stored server-side. Adding a credential later means
opening any existing slot and writing a new one; removing a credential deletes only its slot. The
server holds ciphertext it cannot open, in as many copies as the account has ways in.

If the authenticator does not support `prf`, that account simply has no passkey slot and relies on its
password and recovery slots — the fallback is a missing slot rather than a different design.

**Operator escrow is rejected**, and this is the sharpest line in the document: no slot is ever wrapped
to an operator-held key. Such a slot would let the operator open a user's grant key and sign grants in
their name, which is the precise capability §3 promises they do not have. Escrow would make the reset
feature stronger and the entire threat model false. See §12.

**If every slot is lost**, the grant key is gone. Grants already signed keep working — they are
documents the agents already hold, valid until expiry — but no new grant can be issued and no
revocation signed until the owner re-pairs the machine, which re-roots the agent on a fresh grant key.
Re-pairing is therefore a routine recovery step and must be designed as one, not as an error state.

## 6. The trust model, end to end

```
  Owner's browser                Site + Signalling            Owner's sharing tab
  ───────────────                ─────────────────            ───────────────────
  credential ─► slot ─► grant key                              agent + folder handle
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

**Phase 1 — accounts and saved setups.** Signup and sign-in by password with TOTP or by passkey, key
slots, rate limiting, the operator admin surface and its reset flow, an account page, and named setups
saved and applied. No agent, no relay, no drives.

The *saved setups* half really is small — the site already encodes an entire setup as a six-field share
code, so a setup is a row holding a name and a string. The *auth* half is not, and the second round of
decisions on 2026-08-12 roughly tripled it (§12 H). It stays one phase because an auth layer is not
independently useful in halves, but it has an internal order that is not negotiable: **authentication
works end to end before any interface work starts.** Building a command palette on top of a sign-in
that does not yet work is how the interesting part gets finished and the load-bearing part does not.

The phase still earns its place for the original reason: it proves the auth layer, the session layer
and the new dialog vocabulary in a context where nothing dangerous can go wrong. Nothing here can leak
a file, because there are no files in it.

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

**A machine may expose several folders**, each its own row in `drives`. This is the client's 2026-08-12
revision of the sharing unit, and it closes the gap that made whole-drive sharing tempting: someone
wanting to share a data volume plus two folders from their system drive can simply add three, rather
than reaching for a blunter instrument.

**Whole-drive sharing is not on the table, and the decision is not really ours.** The browser will not
issue a handle to one. `showDirectoryPicker()` returns a handle to a folder the user picks, and Chrome
refuses outright for system-critical locations — the root of the system volume, `Windows`, `Program
Files` and the user-profile root among them. So the sandbox declines the request before any policy of
ours applies. The original reasoning still stands on its own merits (a whole-drive default makes the
first misconfiguration unrecoverable), but it is now belt as well as braces.

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
accounts      id · handle · created_at · grant_pubkey · is_operator · reset_at
credentials   id · account_id · kind · label · created_at · last_used_at
                kind = 'password' | 'passkey' | 'recovery'
                password: auth_hash · kdf_salt · kdf_iterations
                passkey:  credential_id · public_key · sign_count
                recovery: code_hash · used_at
key_slots     id · account_id · credential_id · wrapped_grant_key · alg   ← one per credential, §5
totp          account_id · secret_enc · confirmed_at · backup_codes_hash · last_step ⚠
setups        id · account_id · name · share_code · created_at        ← phase 1 ends here
machines      id · owner_id · name · agent_pubkey · paired_at · last_seen
drives        id · machine_id · label · created_at        ← several per machine. NO path, see below
grants        id · drive_id · grantee_id · paths · perms · expires_at · signed_doc · revoked_at
invites       id · grant_id · issued_by · token_hash · claimed_by · expires_at   ← phase 3
audit         id · actor_id · action · target · at        ← append-only, mirrored by the agent
```

⚠ **`totp.last_step` is in the schema (migration `0002`) and is not in the inventory below, which
this section says is a spec change rather than an implementation detail.** It stores the 30-second
window of the last successful second factor; without it a TOTP code is replayable for up to ninety
seconds. It is coarser than `credentials.last_used_at`, which the inventory already covers.
**Awaiting client sign-off** — recorded in `TODO.md` and `CLAUDE.md`, and listed here rather than
left to be discovered.

Rate-limit counters are deliberately **not** here. They live in a Durable Object, because D1 gives no
atomic read-modify-write and a counter that loses races is a counter an attacker can outrun.

`signed_doc` is the owner-signed grant, stored verbatim. The site never regenerates it and never needs
to understand it beyond routing it to the right agent.

Three notes on fields whose shape is decided rather than incidental:

- **`grants.perms` exists but only ever holds read.** Keeping the field costs one column and one check
  the agent always passes; removing it would mean a migration and a grant-format version bump on the
  day writes are wanted. Nothing in the UI offers a write option.
- **No filesystem path is ever stored server-side.** This reverses the earlier draft, which held
  `drives.root_path` — the folder the owner picked. On Windows that value is `C:\Users\Patrick\
  Documents` and on macOS `/Users/patrick/Documents`: **the account holder's real name, in plaintext,
  collected by accident.** The client's constraint on 2026-08-12 was that no personal data be stored,
  and a home-directory path is personal data that nobody chose to provide.

  The root handle and its absolute path live **only in the sharing tab's IndexedDB**, alongside the
  directory handle they belong to. The server holds `drives.label`, a display name the owner types.
  Grants scope by `drive_id` plus a **relative** subpath, and the agent resolves that against the root
  it holds locally. The scoping check is unchanged in strength — resolve, normalise, re-check the
  prefix, refuse symlinks that escape, and it remains the one place in the agent worth a dedicated
  test suite. It simply runs against a root the server never learns.

  A second benefit falls out for free: a breach of `drives` and `grants` now reveals that someone
  shared *a* folder called "Invoices", not where it is or whose machine it sits on.
- **`machines.name` is typed by the owner and never taken from the hostname.** Default hostnames are
  `patricks-macbook` and `daves-pc` — the same accidental-name problem in a second place. The pairing
  screen asks for a name, suggests nothing, and says the name is visible to anyone shared with.
- **`key_slots` is a separate table, not columns on `accounts`.** An account has as many slots as it
  has credentials, and slot lifetime follows credential lifetime: adding a passkey writes a slot,
  deleting it drops one, an operator reset deletes exactly the password slot and touches nothing else.
  Putting the wrapped key on `accounts` — as the earlier draft did — makes all of that a rewrite of a
  single field and quietly reintroduces the single point of failure §5 exists to remove.
- **`accounts.reset_at` drives disclosure, not bookkeeping.** It is what the sign-in screen reads to
  tell a user their password was reset by the operator. Dropping it makes the reset silent, which §4
  forbids.
- **`invites.token_hash`, never the token.** An invite link carries a single-use token that admits the
  holder to *registration for a named grant* — it is not itself a capability and confers no access
  until a passkey is registered and a public key exists to bind the grant to. It expires, and it is
  stored hashed so a leak of the table does not leak live invites.

### Everything stored about a person

The client's constraint on 2026-08-12: *"as long as it isn't personal data — email, names, dates of
birth."* This is the complete inventory, so the claim can be checked rather than trusted, and so a
later addition has to be argued against a list rather than slipped in.

| Stored | What it is | Personal? |
|---|---|---|
| `handle` | A display name the user chooses | Only if they choose their own name — their call, and it is the one field where that is true |
| `auth_hash`, `kdf_salt`, `kdf_iterations` | A peppered hash of a browser-derived secret | No. **The password itself is never stored, hashed or otherwise — it never reaches the server** |
| `credential_id`, `public_key`, `sign_count` | Passkey material | No. Pseudonymous, site-scoped, useless elsewhere |
| `code_hash` | Hashed recovery codes | No |
| `totp.secret_enc`, `backup_codes_hash` | Second-factor material | No |
| `wrapped_grant_key` | Ciphertext the server cannot open | No |
| `grant_pubkey`, `agent_pubkey` | Public keys | No |
| `setups.name`, `share_code` | "Workshop mode", `2-0-0-0-7-3` | No |
| `machines.name` | A label the owner types, never the hostname | No, given the hostname rule above |
| `drives.label` | A label the owner types | No |
| `grants.paths` | Relative subpaths under a drive | No absolute path, no home directory, no username |
| `created_at`, `last_seen`, `last_used_at`, `reset_at` | Timestamps | Activity metadata. Retained because a user needs "last used" to spot a credential that is not theirs |
| `audit` | Actor, action, target, time | Behavioural, and deliberately so — it is the record that catches a compromised frontend (§3). No IP, no user agent |

**Not stored, at any point:** email addresses, real names, dates of birth, phone numbers, postal
addresses, payment details, IP addresses, user-agent strings, absolute filesystem paths, hostnames,
file contents, file names outside a granted subpath, and passwords.

**Adding anything to the left column is a spec change**, not an implementation detail. The two most
likely candidates are email (§12 C, already rejected once with the condition that would reverse it) and
IP logging for abuse investigation — which would be reasonable to want and is exactly why it is written
down here as absent.

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

**Where the new UI lives.** Three new routes in phase 1 — `/account`, `/machines`, and `/admin`, the
operator surface where password resets happen (§4), visible only to `accounts.is_operator` and
returning the ordinary 404 page to everyone else rather than a "forbidden" that confirms it exists —
joining the nine existing pages in `src/data/pageIds.ts`. They are chrome-consistent — same header, same hero, same
content grid, same thirteen layouts apply — because a bespoke settings aesthetic bolted onto this site
is the other way this reads as amateur.

> **What actually shipped: `/signup`, `/signin` and `/admin`.** `/account` and `/machines` do not
> exist. **The account summary lives on `/signin`**, which renders the sign-in form or the signed-in
> summary depending on what `api.me()` answers on mount — one page for both states. `/machines` has
> nothing to list until phase 2. `/account` remains a reserved handle and remains on the backlog;
> splitting the summary out of `/signin` is a change worth making deliberately rather than
> incidentally.
>
> Two further departures from this paragraph, both at the client's request: the account pages are
> **unlinked** (reached by typing `whoami`, `login` or `admin`, or by dragging the page left), and
> `/admin` is reachable by anyone while its *contents* are operator-gated, rather than returning the
> 404 page to non-operators.

Phase 2 adds a third, `/share` — the agent itself. *(A fourth, on the count above; the numbering
here predates the shipped route list.)* It is the one surface with a reason to *diverge*:
it is a long-lived tab whose job is to be glanceable from across a room and to make "this tab is
holding your folder open" unmissable. It stays palette-driven and uses the same tokens, but it need not
pretend to be a content page.

### The file explorer

The client's instruction on 2026-08-12: *"have some aesthetics and graphical options for the file
explorer — that will be the most used thing most likely."* That reading is correct, and it makes this
the one screen in the project worth designing rather than defaulting. It is also the screen a user
compares, unfairly but inevitably, against Finder, Explorer, and Dropbox.

It belongs to **phase 2** — there are no files to browse before it — so what this section fixes is the
design, to be built when there is something to put in it.

**Three view modes**, switched from the toolbar and remembered per drive:

- **List** — the default and the only one that works at every width. Name, size, modified, kind. Dense,
  sortable, keyboard-navigable.
- **Grid** — larger tiles, for folders of images and documents where the name is not the useful part.
- **Column** — Miller columns, one pane per directory level, sliding horizontally. This is the mode
  that suits the site's character best: it is what the layouts already do with horizontal composition,
  and it makes depth legible instead of hiding it behind a breadcrumb.

**Where the graphics come from, given no images may be used.** The constraint is real and the answer is
the one the site already uses everywhere: **draw them.** File-type icons are inline SVG built from the
palette's own roles — a stroked page outline in `--line` with a type-coloured corner fold, the accent
picked per category from `--a1`/`--a2` so a folder of mixed content reads as a colour distribution
before any label is read. Twelve or so categories, one small path each, no sprite sheet and no
dependency. Thumbnails, where a file *is* an image, come from the actual bytes over the data channel
and are the only pixels on the screen we did not draw.

**Motion, kept subordinate.** Column mode slides on the existing `cubic-bezier(.2,.8,.2,1)`; rows enter
on the same staggered rise `.v-block` already uses; a file being fetched fills its row with a
left-to-right progress wash in `--a1` rather than spawning a spinner. Nothing here invents a new easing
or a new duration — the tokens exist and using them is what will make this feel like the same site.

**Palette-driven, layout-aware, like everything else.** All thirteen layouts still apply to the page
around it, and the explorer sits in the content grid rather than replacing the chrome. Calm mode
collapses the grid and column modes to List and drops the progress wash, which is the correct
behaviour rather than a degradation — a dense sortable table is the accessible view.

**What it must never do**: block on a full directory listing before showing anything, present a folder
whose owner is offline as an error rather than as "that machine is offline" (§12, still open), or offer
a control that implies writing. Read-only is a decision, and a greyed-out *Delete* would be a lie.

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

> **Superseded by the move to a Worker.** The SPA fallback is now
> `not_found_handling = "single-page-application"` in `wrangler.toml`. `public/_redirects` survives
> only because Pages still auto-deploys from `main` and is the rollback — and it is not inert:
> Workers static assets parses it as *configuration* and rejects it, so `npm run deploy` strips it
> from `dist/`. See `docs/DECISIONS.md`.

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

Worth knowing before estimating the UI work: **there is exactly one `<input>` and exactly one `<form>`
in the entire application**, both of them the share-code paste field in the siteconfig panel. The only
shared primitive is the CSS class `.chip` (`base.css:89-116`), hand-applied about ten times; there is
no `Button`, `Input`, `Field` or `Dialog` component, and no validation or error-display convention to
inherit.

So an account screen is very nearly the first form this codebase has ever had. That is the concrete
reason §10 is a requirement rather than polish — there is almost nothing to copy, so whatever gets
built first *becomes* the convention.

**The convention was set on 2026-08-12** (commit `cf77b65`), by fixing the one defect in that field.
It previously submitted on Enter only, with no button, so a code could not be applied by mouse or touch
at all. It is now a real `<form>` with an `onSubmit` that calls `preventDefault()` and a `type="submit"`
button disabled while the field is blank. **Account forms should follow that shape**: Enter and the
button become one code path rather than two that drift apart, and neither needs special-casing. The
disabled styling it uses was already waiting in `interaction.css`, whose comment anticipated accounts
as the first control that would need to refuse a click mid-request.

An earlier draft of this section also claimed `.v-paste` had no visible focus indicator, on the
strength of its `outline: none` (`overlays.css:185-194`). **That was wrong.** `.vessel :focus-visible`
(`base.css:68`) is specificity 0-2-0 against that rule's 0-1-0 and wins on specificity irrespective of
source order; the field focuses with the standard `--a1` ring. Verified in a browser rather than
reasoned about. The retraction is kept here rather than deleted because the claim also reached
`CLAUDE.md`, and a plausible-sounding bug is easier to re-introduce than to disprove twice.

## 12. Decisions and open questions

**This section is the decision log, and it is kept deliberately.** Every entry records what was chosen,
what was rejected, and why — including options that were rejected for good reasons that might stop
being good reasons later. Nothing is deleted when it is settled; settled things move into the resolved
subsections and keep their reasoning. The client asked for this on 2026-08-12 so that a revisited idea
is readily available rather than re-derived, and the section had already been working this way: §11's
retracted focus-ring claim is kept precisely because a plausible-sounding bug is easier to re-introduce
than to disprove twice.

Each rejected option carries a **"revisit if"** — the condition that would make it the right answer.

### Resolved 2026-08-12 (second round — auth, drives, interface)

Prompted by the client's review of the first draft. These reverse or extend earlier decisions.

**A. Sign-in: passwords with TOTP, passkeys retained.** *Was: passkeys only.*

The client asked whether username and password with 2FA was possible. It is, and both now coexist —
§4. Passkeys were not removed, because the mechanism that carries passwords (per-credential key slots,
§5) makes supporting several credential types cost almost nothing.

- *Rejected: passkey-only.* Stronger against phishing, credential stuffing and reuse, and it needs no
  rate limiting, no password reset and no 2FA. Dropped because it asks every visitor to understand a
  credential model many still find unfamiliar, on a site whose users are walk-in repair customers.
  **Revisit if** passkey adoption becomes unremarkable, at which point the password path can be retired
  without touching the grant-key design.
- *Rejected: SMS two-factor.* Needs a phone number — which is PII the site otherwise refuses — plus a
  paid gateway, and it is defeated by SIM-swap. TOTP has none of those properties. **Revisit if** never;
  this one does not come back.

**B. Password hashing: client-side stretching, not server-side Argon2id.** *New question, created by A.*

The browser runs PBKDF2 and sends a derived auth secret; the Worker stores a peppered hash of it (§4).

- *Rejected: Argon2id in the Worker.* The stronger KDF, and the conventional answer. It has no
  WebCrypto primitive, so it means a WASM module — this project's first runtime dependency, against an
  explicit constraint. It also runs on Worker CPU, which is metered and capped. **Revisit if** the
  client-side derivation proves unworkable on low-end phones, or if a Worker-side KDF is ever needed for
  a flow the browser cannot perform.
- *Rejected: conventional server-side PBKDF2.* Simpler and better understood, but strictly weaker here:
  the plaintext password reaches the operator's infrastructure, and the iteration count is bounded by
  Worker CPU rather than by the user's device. **Revisit if** the pass-the-hash property of a
  client-derived secret ever becomes a problem in practice.

**C. Email: still not collected.** *Confirmed under pressure, having become harder to justify.*

The client offered to accept email collection if it made things materially better. It does not, because
decision D supplies the recovery path email would have provided.

- *Rejected: collecting email for self-service reset.* Would give users password reset without operator
  involvement, plus breach and security notifications. Costs a PII table worth stealing, an email
  delivery dependency (a third-party service, where there are currently none), verification and bounce
  handling, and it contradicts the site's stated ethos. **Revisit if** user numbers make manual operator
  resets a burden — this is the single most likely decision in this log to be reversed, and it is
  additive when it is.

**D. Operator password reset: yes.** *New capability, requested by the client.*

Specified in §4 with three mandatory conditions: logged, disclosed to the user, and consequences shown
to the operator before confirming.

- *Rejected: operator key escrow* — an operator-held slot that could recover a user's grant key. It
  would make reset lossless. It would also let the operator sign grants in a user's name, which is the
  exact capability §3 promises they lack, and it would make the threat model false rather than merely
  weaker. **Revisit if** never. This is the one line in the document that does not move.
- *Rejected: no reset at all.* The original position, correct while sign-in was passkey-only. Passwords
  are forgotten at a rate passkeys are not.

**E. Grant-key survival: one key, many slots.** *New, and it is what makes D safe.*

The client asked whether other people could keep access when a password is lost. They can — §5. One
grant keypair, wrapped once per credential, any credential opens it. Operator reset destroys the
password slot alone.

- *Rejected: one wrapped key per account* (the first draft's design). Simpler by one table. Makes every
  credential loss total, and makes operator reset destroy grant authority unavoidably rather than
  incidentally.
- *Worth recording, because it softens every loss case*: grants already signed keep working until
  expiry regardless, since they are documents the agents already hold. Total key loss costs the ability
  to issue and revoke, not other people's live access.

**F. Sharing unit: several folders per machine.** *Was: a folder.*

The client asked whether whole drives could be an option. §8 has the detail.

- *Rejected: whole-drive sharing.* Not primarily our decision — `showDirectoryPicker()` will not return
  a handle for the system volume root, `Windows`, `Program Files` or the user-profile root, so the
  browser refuses before any policy of ours applies. The original argument also still holds: a
  whole-drive default makes the first misconfiguration unrecoverable. **Revisit if** a native agent is
  ever built, since it would not be sandboxed — and note that this is an argument *against* building one.

**G. The file explorer gets designed, not defaulted.** *New scope, requested by the client.*

Three view modes, palette-derived SVG file icons, motion built only from existing tokens — §10. Belongs
to phase 2 because nothing can be browsed before it exists.

- *Rejected: an icon set or icon font.* Every option breaks "no images, no webfonts". Drawing icons from
  palette roles also makes them recolour with everything else, which a sprite sheet never would.

**H. Phase 1 grew, and stays one phase.** *Scope note, flagged by the assistant and accepted.*

Phase 1 was "passkey sign-in plus a setups table". It is now passwords, TOTP, rate limiting, key slots,
an operator admin surface, a reset flow, a dialog primitive and a command palette. It remains one phase
because the auth layer is not independently useful in halves, but **authentication must work end to end
before any of the interface work begins** — the aesthetic layer is sequenced second *within* phase 1.

**I. No personal data, checked against real values rather than asserted.** *Client constraint, and it
caught three things.*

The client's position — usernames and passwords are fine, email and real names are not — held up, but
three fields were carrying personal data nobody had chosen to collect. §9 now has the full inventory.

- *Removed: `drives.root_path`.* Held `C:\Users\Patrick\Documents`. The absolute path now lives only in
  the sharing tab; grants scope by relative subpath. **Revisit if** never — the server has no use for
  it, and doing without makes a breach less informative.
- *Removed: hostnames as machine names.* `patricks-macbook`. The owner types a label instead.
- *Removed: raw IPs from rate limiting.* Now `HMAC-SHA-256(daily_rotating_salt, ip)`, in a Durable
  Object, expiring with the backoff window, never in D1. **Revisit if** abuse makes investigation
  necessary — and note that reversing this is a spec change, not a config tweak.

### Resolved 2026-08-12 (first round)

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
