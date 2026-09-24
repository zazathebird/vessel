# Pass 2 — Phase-2 Sharing Audit (machines, signalling, browser-side P2P)

Scope reviewed in full: `worker/signal.ts`, `worker/machines.ts`, `src/share/agent.ts`,
`src/share/browse.ts`, `src/share/handshake.ts`, `src/share/paths.ts`, `src/share/protocol.ts`,
`src/share/setupCode.ts`, `src/share/store.ts`, `src/share/unlock.ts`, `src/share/fs-types.d.ts`,
`src/components/MachinesPage.tsx`, `src/components/SharePage.tsx`. Also read `worker/index.ts`'s
`crossOrigin`/`foreignOrigin`/`signalUpgrade`/CSP logic in full (not in the assigned file list, but
`signalUpgrade` and the origin checks it shares with the rest of the Worker are load-bearing for
everything this pass covers), and `src/auth/grantKey.ts`'s `unwrapSlot`/`provePublicKey` (already
in Pass 1's scope; re-read here only to confirm the arithmetic that `unlock.ts`'s trust-root
derivation depends on, not to re-audit it — Pass 1 owns that file).

This is Pass 1's declared gap: `pass1-accounts-auth.md` explicitly excluded `worker/signal.ts`,
`worker/machines.ts` and `src/share/*` and flagged them for whoever covers phase 2. No overlap
with Pass 1's findings was found (Pass 1's Finding 1 is the signup rate-limit double-count, unrelated
to this surface).

## Verified correct (mechanism-by-mechanism, re-derived from the code — not from its comments)

- **`fingerprintFromSdp` genuinely refuses a second, differing DTLS fingerprint.**
  `src/share/handshake.ts` collects every `a=fingerprint:` line in the SDP with a **global**,
  multiline regex (`matchAll(/^a=fingerprint:(.+)$/gm)`) into a `Set` after normalising each value,
  and refuses (`return null`) unless the set has exactly one member. Traced the RFC 8122 §5 attack
  the comment describes (a hostile relay prepending the real session-level fingerprint to its own
  SDP while keeping its own media-level fingerprint) against the actual regex: both lines are
  matched regardless of section, so `found.size === 2` and the offer is refused before any signature
  check runs. Confirmed JS's multiline `^`/`$` treat lone `\r`, lone `\n`, and `\r\n` all as line
  terminators (ECMA-262's line-terminator set for regex purposes is `\n \r    `), so an SDP
  using bare-CR line endings — which real SDP parsers also tolerate — cannot smuggle a second
  fingerprint past the line-start anchor. Identical repeats (a bundled SDP restating one fingerprint
  per m-section, or the same value in different case/spacing) normalise to one Set member and are
  accepted, per the documented behaviour. `scripts/auth-e2e.ts` (lines ~1898–1926) independently
  exercises exactly these cases (no-fingerprint, two-different, same-restated, same-value-different-
  case, differing-only-in-hash-name) and all assertions match the source's actual behaviour.
- **Neither side ever trusts the sidecar `fingerprint` field of a payload — only the SDP itself is
  authoritative.** In `agent.ts`'s `handleOffer`, the fingerprint used for `verifyFingerprint` is
  `fingerprintFromSdp(payload.sdp)`, independently re-derived — `payload.fingerprint` (also present
  on the wire) is never read there. Symmetrically, `browse.ts`'s answer handler re-derives
  `fingerprintFromSdp(payload.sdp)` rather than trusting `payload.fingerprint`. So even if a
  compromised or buggy relay altered the sidecar field, it would have no effect: the value actually
  verified is always pulled fresh from the SDP that is about to become the local/remote description.
- **`DriveConnection.open` consults the pin before dialling, on its one call path.** `grep` across
  `src/` confirms `DriveConnection.open` has exactly one caller (`MachinesPage.tsx:563`), and its
  private `dial()` (which opens the WebSocket and `RTCPeerConnection`) cannot be reached except
  through `open()`, which checks `pinVerdict` and throws `AgentKeyChanged` on `"changed"`
  **before** calling `dial()`. On `"first"`, the pin is written only **after** `dial()` resolves
  (i.e., after a live agent has produced a fingerprint-signed answer verified against
  `machine.agentPubkey`). This is the one invariant-conforming path — see Finding 1 for the other
  one.
- **The trust root an agent tab stores comes from the password, never from the pair response.**
  `src/share/unlock.ts`'s `pairMachine`: `provenSlot(derived)` unwraps the account's key slot
  **locally** (server only ever proves the password over the wire; `unwrapSlot` + `provePublicKey`
  do the actual binding of public key to password, in the browser, per `src/auth/grantKey.ts`'s
  `Q = d·G` check re-done "by arithmetic rather than by browser"). Only after that local proof
  succeeds does `pairMachine` call `api.machinePair(...)`, and it explicitly **discards** the
  server's claimed `result.grantPubkey` if it disagrees with `proven.grantPubkey`
  (`if (result.grantPubkey !== proven.grantPubkey) throw ...`). The returned `StoredMachine.trustRoot`
  is built from `proven.grantPubkey` (line 138), not from `result.grantPubkey`. Confirmed by reading
  the data flow rather than the comment describing it.
- **`worker/signal.ts` never reads a payload.** `webSocketMessage` inspects only `frame.type`,
  `frame.to` (validated as a UUID shape before being used as a hibernation tag), and `frame.from`
  (server-assigned, never client-supplied) — `frame.payload` is forwarded verbatim without
  inspection in both directions. No DB binding, no `env` field is used in the class at all
  (`constructor(ctx, _env)`), consistent with "persists nothing."
- **`signalUpgrade` authenticates before the Durable Object is reached, on every externally
  reachable path.** `worker/index.ts` special-cases `/api/signal/*` ahead of `route()`, and inside
  `signalUpgrade` the order is: upgrade-header check → `foreignOrigin` → `requireAccount` →
  machine-ownership `SELECT ... WHERE id = ? AND owner_id = ?` → role validation → **only then**
  `env.SIGNAL.get(...).fetch(...)`. The DO's own dispatch has three paths (`/connect`, `/presence`,
  `/shutdown`); `signalUpgrade` always constructs the downstream request as
  `https://signal/connect?role=${role}` regardless of the externally-requested path, and `/presence`
  /`/shutdown` are only ever invoked by `worker/machines.ts` via direct `stub.fetch(...)` calls
  (server-side, not reachable through the public route). So there is no external code path that
  reaches the DO without first passing the Worker's auth/ownership gate.
- **`foreignOrigin` (the check `signalUpgrade` and `crossOrigin` share) is a single function, and
  the WebSocket handshake actually goes through the newer, stricter version.** Confirmed it checks
  `Sec-Fetch-Site: cross-site` first (can't be forged by a page), then `Origin` host+scheme with a
  loopback carve-out — the same logic `crossOrigin` uses for POSTs — rather than the host-only
  comparison the file's own comment says used to exist before 2026-09-07.
- **One agent socket per machine, and the replace-then-accept sequence is atomic against a
  concurrent second `/connect`.** The loop that sends `{type:"replaced"}` to every existing
  `"agent"`-tagged socket, closes them, and then calls `this.ctx.acceptWebSocket(server, ["agent"])`
  contains no `await` between the loop and the accept — in Durable Objects' single-isolate,
  run-to-completion model this means a second concurrent `/connect?role=agent` request cannot
  observe a state where zero or two sockets hold the `"agent"` tag; the newest request's synchronous
  block always finishes constituting the new incumbent before the next queued invocation runs.
- **STUN-only, no TURN.** `src/share/protocol.ts`'s `ICE_SERVERS` names only
  `stun:stun.cloudflare.com:3478`; no TURN URL appears anywhere in `src/share/*` or the two page
  components.
- **Every filesystem-touching path in the agent goes through `isValidPath` first, with no string-path
  shortcut.** Grepped all of `src/share/*` and both page components for direct `getDirectoryHandle`/
  `getFileHandle` calls: the only caller is `agent.ts`'s `walk`/`stat`/the inline `read` handler, and
  all three are only ever reached after `handleRequest` has already called
  `isValidPath(request.path)` and returned early on failure. `MachinesPage.tsx`'s `pathKey()` (line
  102) does join components with `"/"`, but that string is used only as a React key / progress-map
  key for the UI — the actual wire call (`open.conn.read(open.drive.id, [...dir, name], ...)`) still
  passes an array, so the string join never reaches the protocol or the agent.
- **Agent public keys are validated as real P-256 points, not just 65 bytes starting `0x04`.**
  `worker/machines.ts`'s `expectAgentPubkey` does a `crypto.subtle.importKey` round-trip and refuses
  on failure, matching the comment's claim.

## Finding 1 — "Accept the new key" pins the offered agent key before any connection verifies it, reversing the documented pin-after-verification rule

**File/line**: `src/components/MachinesPage.tsx`, lines 732–755 (the `keyChanged` confirmation
dialog's "I re-keyed it — accept the new key" button), specifically:

```tsx
onClick={() => {
  const asked = keyChanged;
  setKeyChanged(null);
  void (async () => {
    try {
      await shareStore.savePin(asked.machine.id, asked.offered);   // line 740
    } catch {
      setCardErrors((errors) => ({ ...errors, [asked.machine.id]:
        "This browser could not remember the new key, so nothing was connected." }));
      return;
    }
    await connect(asked.machine, asked.drive, asked.key);          // line 749
  })();
}}
```

**Mechanism**: `src/share/browse.ts`'s `DriveConnection.open` — the codebase's own documented,
correct implementation of "pin after verification, never before" — checks the pin, refuses to dial
on a changed key, and only calls `shareStore.savePin` **after** `dial()` has resolved (i.e., after a
live agent has produced a fingerprint-signed answer verified against the server-reported
`machine.agentPubkey`). `pinVerdict`'s own doc comment states this explicitly: *"Pin after
verification, never before — a pin on an unverified key pins the impostor."*

The "accept the new key" button does not go through that ordering. It calls
`shareStore.savePin(asked.machine.id, asked.offered)` directly — the same store function `open()`
uses internally — and only afterwards calls `connect()`, which is what eventually reaches
`DriveConnection.open`/`dial()`. By the time `open()` runs, `shareStore.pin(machine.id)` already
equals `machine.agentPubkey`, so `pinVerdict` returns `"same"` rather than `"first"` or `"changed"`;
`open()` proceeds straight to `dial()` without re-checking or re-confirming anything, and (crucially)
without ever calling `shareStore.savePin` itself, since that branch is gated on `verdict === "first"`.
The pin write has therefore already happened, unconditionally, regardless of whether the subsequent
`dial()` succeeds, fails, times out, or is refused.

There is no compensating rollback: `shareStore.deletePin` exists (`src/share/store.ts:101`) but is
never called anywhere in `src/` (confirmed by grep). Once this button is clicked, the pin is
permanently overwritten to `asked.offered`, whether or not a real, verified agent ever answers using
that key.

**Concrete impact**: The pin exists specifically so that a server-side change to a machine's
`agent_pubkey` (whether from a legitimate re-key or from a compromised/malicious write to the
`machines` table) is caught and put in front of the human before the browsing tab starts trusting a
new identity — this is `CLAUDE.md`'s own framing: *"a database write could point the owner at an
agent serving files that are not theirs."* If the offered key is illegitimate (server compromise, or
a stale/incorrect row) and the owner — reasonably reading the dialog's own wording, *"if you
re-paired or re-keyed it yourself, accept the new key"* — clicks accept, the browser now trusts that
key **before** any cryptographic proof that a live, legitimate agent is actually signing with it.
If the follow-on `connect()`/`dial()` then fails for any reason (the real agent is offline, a network
hiccup, an actual impostor is not currently answering, the connection simply times out after 20s),
the failure is reported as an ordinary connection error — but the trust anchor has already been
silently and irreversibly downgraded. Every future connection attempt to this machine will see
`pinVerdict === "same"` and skip the warning entirely, so a later, quieter attempt by whatever holds
that key succeeds with no further scrutiny. The single moment the design relies on for defence — "a
human is asked, and the pin only moves if the answer to that question is backed by a working
handshake" — is split into two independent steps in this one code path, and the security-relevant
one (the handshake) is not the one gating the trust update.

**Severity**: Medium–High. Requires either a legitimate-looking re-key prompt for an illegitimate
key (the exact scenario the pin exists to catch) or simply an unlucky network failure right after an
honest re-key confirmation; in both cases the result is a pinned value that was never actually
confirmed by a successful, verified connection, with no user-visible indication that anything is
different from the "properly pinned" state, and no way back short of manually clearing IndexedDB.

**Suggested check** (not implemented, per instructions not to fix): drive `pinVerdict`/`savePin`
through a harness call that (a) simulates "accept new key," (b) makes the subsequent `dial()` fail
(e.g. by pointing at a machine id with no live agent), and (c) asserts the stored pin is unchanged
from its pre-click value. That test fails against the current code and would pass once the pin write
is moved to occur only after a verified `dial()` succeeds, matching `DriveConnection.open`'s own
internal ordering.

## Finding 2 — Removing a machine only *asks* its Durable Object to close live sessions; a failed best-effort call leaves already-open agent/browser sockets and any already-established P2P connections running indefinitely

**File/line**: `worker/machines.ts`, `remove()`, lines 276–294:

```ts
export async function remove(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  const body = await readJson(request);
  const machine = await ownMachine(env, account, body.machineId);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM machines WHERE id = ?").bind(machine.id),
    auditStatement(env, account.id, "machine.removed", machine.id),
  ]);

  try {
    const stub = env.SIGNAL.get(env.SIGNAL.idFromName(machine.id));
    await stub.fetch("https://signal/shutdown", { method: "POST" });
  } catch {
    // Best-effort: with the row gone, no new socket can be authorised anyway.
  }

  return json({ status: "removed" });
}
```

**Mechanism**: The file's own header comment for this function claims: *"The DO is told to hang up
so a live agent tab learns immediately rather than at its next message; its sockets close and any
future upgrade fails ownership."* The "any future upgrade fails ownership" half is true and verified
(`signalUpgrade` re-queries `machines` by id+owner on every new connection attempt, so a deleted row
refuses any *new* socket immediately). The "its sockets close... immediately" half depends entirely
on the `stub.fetch("https://signal/shutdown", ...)` call succeeding, and that call is wrapped in a
`try/catch` whose comment reasons only about future connections, not about sockets that are already
open.

`MachineSignal`'s `/shutdown` handler (`worker/signal.ts` lines 61–69) does correctly send
`{type: "machine-removed"}` to every currently attached socket and close each one — including the
agent's — and the agent's own handler for that frame (`src/share/agent.ts`, `case
"machine-removed": ... this.stop("removed")`) does correctly close **every** live
`RTCPeerConnection` it is holding (`for (const pc of this.peers.values()) pc.close();`). So the
mechanism, when the shutdown fetch succeeds, is genuinely comprehensive: it does not just close the
signalling socket, it tears down already-established P2P file-transfer sessions too. The gap is
entirely in what happens when that one `fetch` throws or the Durable Object does not answer
(subrequest failure, DO cold-start/overload, a transient Cloudflare edge issue) — none of which are
exotic failure modes for a cross-object `fetch` under load, and Cloudflare's own documentation
describes Durable Object overload/queueing errors as a real, if uncommon, occurrence. On that path,
nothing else ever retries or re-checks: the DO has no DB binding (`constructor(ctx, _env)` never uses
`env`) and no alarm that would let it notice on its own that its backing `machines` row disappeared,
so a signalling socket and any P2P connections that were already open at the moment of removal keep
running until they close for some unrelated reason (a page navigation, a network drop, or the
browser tab closing).

**Concrete impact**: An owner who removes a machine — the only "revoke" control this feature has —
gets no guarantee, only a best effort, that doing so actually stops an already-open sharing session
on that machine from continuing to serve files to an already-connected browsing tab. The scenario
this matters for is exactly the one removal exists to answer quickly: a machine believed lost,
stolen, or otherwise no longer trusted. If the `/shutdown` fetch happens to fail at that moment (rare
but not impossible), the owner has no way to know the revocation was incomplete — the UI reports
`{status: "removed"}` unconditionally, regardless of whether the DO ever actually received or acted
on the shutdown request.

**Severity**: Low–Medium. Narrow blast radius (phase 2 has no grantees yet, so the only party who
could be mid-session with a removed machine is the account owner's own other browsing tab), and the
underlying `fetch` is expected to succeed the overwhelming majority of the time — but the failure
mode directly contradicts the "immediately" and "its sockets close" language the codebase itself
asserts as the guarantee, with no fallback, no retry, and no way for the operator to detect that the
guarantee didn't hold.

**Suggested check** (not implemented): a gate that forces the `stub.fetch` in `remove()` to throw
(e.g. by stubbing `env.SIGNAL` to a binding that always rejects) and then asserts something
detectable happens — a retry, a queued shutdown, or at minimum a response field indicating the
shutdown could not be confirmed — would have caught that today's code silently swallows the failure
and reports unconditional success.

## Finding 3 — Machine names and drive labels typed directly (not via a setup code) skip the Unicode deception filtering `setupCode.ts` treats as load-bearing for the same class of data

**File/line**: `worker/machines.ts`, `expectName()`, lines 56–62:

```ts
function expectName(value: unknown, what: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > NAME_MAX) {
    throw new BadRequest(`Give the ${what} a name, up to ${NAME_MAX} characters.`);
  }
  return name;
}
```

This is the only server-side validation applied to a machine name (`pair`, `rename`) and a drive
label (`driveAdd`) when they arrive through the ordinary UI text inputs — `PairForm`'s "Machine
name" field and `AgentPanel`'s "Drive label" field in `src/components/SharePage.tsx` — neither of
which does any client-side filtering beyond `maxLength={40}`.

**Mechanism**: `src/share/setupCode.ts` devotes roughly 150 lines and several dated security passes
to exactly this class of input — a label a person relies on to know which folder they are looking
at or handing over — refusing format characters, bidi overrides, zero-widths, lone surrogates,
private-use characters, unassigned code points, variation selectors and non-space blanks
(`DECEPTIVE`), plus a separate `foldLabel` pass that also catches visual confusables (Cyrillic/Greek
look-alikes, case, `l/I/1`, `O/0`) for duplicate detection. The file's own comments are explicit that
this matters because *"both fields are read by a person deciding which folder to hand to the
browser."* A drive label and a machine name are read by exactly the same kind of person for exactly
the same kind of decision (`AgentPanel`'s drive rows and `MachinesPage`'s drive rows are the
UI a person uses to decide which of their own shared folders is which), but `expectName` applies
none of `setupCode.ts`'s filtering — not the `CONTROL` class (so a label could carry a raw C0/C1
control character or ` `/` `), not the `DECEPTIVE` class (bidi overrides, zero-widths,
confusables), and the duplicate check (`... COLLATE NOCASE`) only folds ASCII case, not the visual
look-alikes `foldLabel` folds.

**Concrete impact**: Today this is self-inflicted only — phase 2 has no grantee model, so the only
person who can type a deceptive machine name or drive label is the account owner labelling their own
machine, and the only person who reads it back is that same owner. But it is a real inconsistency
against the codebase's own stated threat model for this exact data shape (a folder label used to
decide what to trust), the rendering paths (`.v-drive-label`, `.v-account-title` for machine names)
carry none of `.v-setup-name`'s deliberate `white-space: normal` reasoning (it happens to also
default to `normal`, but nothing pins that the way `setupCode.ts`'s comment says it must for the
setup-code checklist), and the moment phase 3 grants land and a drive label is shown to someone other
than the person who typed it, this becomes exactly the twin-row/bidi-spoofing surface `setupCode.ts`
was hardened against — except un-hardened, on a different route to the same rendered element.

**Severity**: Low today (no cross-account exposure exists yet), but worth flagging now rather than
after grants ship, since the fix (reusing `setupCode.ts`'s `CONTROL`/`DECEPTIVE` filters, or factoring
them into a shared validator both `expectName` and `str` call) is the kind of change that is easy to
forget once the setup-code feature's own defences are considered "done."

**Suggested check** (not implemented): a gate that POSTs a machine name or drive label containing a
bidi override (`‮`) or a zero-width character through `pair`/`rename`/`driveAdd` and asserts a
400, mirroring the checks `scripts/auth-e2e.ts` or an equivalent harness already runs against
`decodeSetupCode` for the same character classes.

## Other observations, not rising to findings

- `src/share/agent.ts`'s `read` handler can compute a **negative** `length` when a client requests a
  `read` with an `offset` at or beyond the end of the file and an explicit `length` — 
  `Math.min(Math.max(0, request.length), file.size - offset)` clamps the lower bound of
  `request.length` but not the `file.size - offset` term, which is negative in that case. The reply
  sent back reports `{ size: length }` with a negative number before the (zero-iteration) send loop
  runs, and the client resolves an empty `Blob`. Not a security issue (no out-of-bounds read — 
  `Blob.slice` clamps internally per spec) and not currently visible in the UI in a way that misleads
  (the eventual file is just empty), but it is a wire-format inconsistency: a genuinely out-of-range
  read should probably be a `fail(...)`, not a `{ok: true, size: <negative>}`.
- Both `agent.ts` and `browse.ts` include a `fingerprint` field alongside `sdp`/`signature` in the
  `offer`/`answer` payloads, but neither receiving side ever reads it (both re-derive the fingerprint
  from the SDP instead — see "Verified correct" above). Harmless, but it's dead wire data that could
  give a future maintainer the false impression it's the value being trusted.
- `worker/machines.ts`'s duplicate-name check (`... COLLATE NOCASE`) only folds ASCII case; combined
  with Finding 3, two machines named e.g. `"Laptop"` and `"Lар†ор"` (Cyrillic а/р look-alikes) would
  both be accepted as distinct names, which is the same class of confusable `setupCode.ts`'s
  `foldLabel`/`CONFUSABLES` table exists to catch for setup-code labels.

## Summary

Three findings, in descending order of how directly they cut against a documented invariant:

1. **(Medium–High)** `MachinesPage.tsx`'s "accept the new key" flow pins a server-offered agent
   public key via `shareStore.savePin` *before* calling `connect()`/`dial()`, so the pin update does
   not wait on — and is not rolled back by — the actual cryptographic verification that is supposed
   to gate it. This directly reverses the "pin after verification, never before" rule stated for
   `DriveConnection.open`'s own internal logic, which *is* correctly ordered; the bug is a second,
   independent write path that bypasses that ordering entirely, with no rollback (`deletePin` is
   defined but never called anywhere in `src/`).
2. **(Low–Medium)** Removing a machine's guarantee that its live sessions stop "immediately" rests on
   a single best-effort `fetch` to its signalling Durable Object; a failure there (caught and
   silently swallowed) leaves already-open agent/browser signalling sockets — and any already-
   established peer-to-peer file transfer — running with no retry, no detection, and a `{status:
   "removed"}` response that reports success regardless.
3. **(Low)** `worker/machines.ts`'s `expectName` (machine names, drive labels typed directly rather
   than via a setup code) applies only trim+length checks, none of the Unicode control/deceptive-
   character or visual-confusable filtering `src/share/setupCode.ts` treats as load-bearing for the
   identical class of human-facing label — a live gap today only because phase 2 has no grantee model
   yet to expose it to anyone but the label's own author.

Everything the brief specifically asked to be re-derived from current code — the SDP fingerprint
check's actual rejection of a hostile second m-section value, the pin-before-dial ordering on its
documented call path, the password-derived (not server-derived) agent trust root in `pairMachine`,
`worker/signal.ts` being a true non-reading introducer, `signalUpgrade`'s auth running ahead of the
Durable Object on every externally reachable path, the one-agent-socket replacement's atomicity,
STUN-only ICE config, and the component-array path discipline with no string-path shortcut anywhere
in the file-touching code — was independently confirmed correct by tracing the actual logic rather
than trusting its comments. The one place the codebase's own stated ordering rule for pinning is
violated is a second, less-visible call path the "Verified correct" write-up above would have missed
had it stopped at `DriveConnection.open`'s internals.
