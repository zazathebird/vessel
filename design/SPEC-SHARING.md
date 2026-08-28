# Sharing, hosted storage, and setup — draft for approval

**Status: draft. Nothing here is built.** It extends `SPEC-ACCOUNTS.md`, which is approved and
authoritative; where the two disagree, that file wins until this one is approved and folded into it.
Decisions taken on 2026-08-27 are recorded in §2 with the reasoning, in the manner of
`SPEC-ACCOUNTS.md` §12, so a later reader can see what was chosen and what was declined.

The client's statement of the goal, verbatim, because everything below is downstream of it:

> *"the idea is that i/other ppl choose files on their computer, share, and then when they are out,
> they log in again, and can see their files that they shared and access them as long as their
> machines are on… there can also be an option to have them stored on MY storage… so when you share
> files, you can choose to share with yourself, certain users (need to know their name obviously) or
> everyone."*

---

## 1. What already exists, and what this is actually asking for

**Phase 2 shipped on 2026-08-14 and does the hard part.** `/share` is the agent: sign in on the
machine holding the files, pick folders with the browser's own folder picker, and that tab serves them
peer-to-peer over a DTLS data channel to `/machines`, which is a real file explorer with list, grid
and Miller-column modes. Drives are rows in D1. The folder handles live in that browser profile's
IndexedDB. Bytes never touch the server.

So *"use the site to access your own files"* is built and works. What is missing is everything around
it:

1. **Nobody can set it up.** The ceremony is four steps and every one of them is unfamiliar.
2. **The tab has to stay open**, which is a poor answer to *"when they are out"* if the machine is a
   laptop that sleeps.
3. **There is no second person.** Grants, invites and revocation are phase 3 and unbuilt.

This document specifies the three builds that close those, in the order they should be built.

### The constraint that shapes all of it

**A script cannot hand a browser a folder.** `showDirectoryPicker()` requires a user gesture, by
design. That sandbox boundary is not an obstacle to route around — it is the reason this feature
exists without a code-signing certificate (§8 of `SPEC-ACCOUNTS.md`), and it is why a path bug in our
code cannot reach the whole disk.

What a script *can* do: create folders, link other folders into them, install a managed browser policy
so the site is pre-approved, register the sharing tab to open at login, stop the machine sleeping, and
tell the site which folders the user meant. So the target is **one click, once, forever** — not zero
clicks. Zero clicks is the native agent in §6, which is a different and much larger thing.

---

## 2. Decisions taken 2026-08-27

Each is the client's, in answer to a direct question. Rejected options keep their reasoning.

**A. Who this is for — both.** Mostly the operator's own machines, but any account holder may share
from their own. This means the setup path is customer-facing and its copy is a safety surface, not a
convenience.

**B. Hosted storage exists and nobody is ever pushed into it.** Roughly 5GB per account, for people
who do not want to leave a machine on. A checkbox and a disclaimer, in the client's words — *"NOT
mandatory or even enforced."*

**Two different switches, and the wording matters because they point opposite ways.** The operator
decides who is *offered* a locker (decision G); the account holder decides whether to *use* it, and
nothing degrades if they never do. So it is not "opt-in" in the usual sense — a user cannot opt
themselves in — and the interface must not imply otherwise by showing an upload control to somebody
who has not been given the space.

**C. Encryption is optional per upload, and the default is encrypted.** An account's locker has two
areas: a **vault** (encrypted in the browser; the operator holds ciphertext) and a **plain area** (the
operator can read it). Uploads default to the vault. *Declined: escrow.* `SPEC-ACCOUNTS.md` §5 rejects
operator escrow permanently, and that stands — a key held in advance is a key that can be stolen or
compelled.

**D. There is an operator access code, and it is not escrow.** When a user wants help with vault files
they generate a code in their account; the operator enters it and can read the locker for **24 hours**,
after which it dies on its own. **The user can end it sooner, at any point, including before the code
has ever been used** (client, same day) — the 24 hours is a ceiling, not a commitment. The distinction that makes this sound: the user's browser produces it
while signed in and able to open their own key, so it is a *delegation*, not a stored master key.

> **Stated plainly because it will be asked:** this cannot recover files from someone locked out.
> Generating the code requires a credential. Someone who has lost their password, their TOTP and all
> ten recovery codes has lost their vault files permanently, and no mechanism short of escrow changes
> that. Plain-area files are unaffected, because they were never encrypted.

**E. "Everyone" means every signed-in account.** Not a public URL. *Declined: anonymous public links* —
they turn the domain into a general-purpose file host, and the first copyrighted or malicious file
someone shares is served from `mcclevarty.ca` with no name attached to whoever put it there. Revisit if
there is ever a reason worth the takedown process.

**F. Recipients are named by handle *or* by invite code — both.** Handles for people already known to
be here; codes for people who are not.

**G. Lockers are enabled per account by the operator.** Anyone may sign up and share from their own
machine for free; storage on the operator's drives is a switch on `/admin`. *Declined: automatic 5GB on
signup* — signup is open to the internet, and at two hundred accounts that is a terabyte nobody agreed
to. The operator also sets the size per account and may delete any account at their discretion, which
**must be stated on the page before the first byte is stored.**

**H. Retention: nothing expires on its own.** Files are kept until deleted. Deleting an account is an
immediate and irreversible purge of its files. *Declined: automatic expiry after idle* — a customer who
loses something they wanted is a betrayal even when it was warned about, and the storage bill is small.

**I. Setup scripts for Windows, macOS and Linux**, offered at three depths, published with a
description, the script's own source as a readable text file, and a SHA-256 checksum — explicitly so a
cautious person can paste the source into an AI and ask whether it is malicious. This is the right
instinct on a site with a `/scams` page and it should be encouraged rather than merely permitted.

**J. Native always-on agents are wanted as an option**, on all three platforms, and are the last thing
built. See §7 for what they cost.

---

## 3. Build order, and why this one

The client delegated the order. This is the proposal; it needs a yes before anything starts.

**S → L → G → N.** Setup scripts, then the locker, then grants, then native agents.

- **Setup scripts first** because they add nothing to the *server* — no route, no table, no
  credential (§4). That is not the same as harmless: the deeper option changes a browser policy, adds a
  login task and alters power settings on somebody's computer, and a downloaded script is exactly the
  artefact `/scams` warns about. What it does mean is that nothing here can leak a file, which makes it
  the cheapest thing to get wrong. It ships in days, and how real people fail at it feeds both builds
  after it.
- **The locker second, owner-only.** This repeats phase 2's discipline deliberately: build the storage
  with exactly one principal — you, looking at your own files — and harden it before a second person
  exists. It also solves *"when they are out"* properly, which is the client's core complaint, without
  waiting for the grant system.
- **Grants third, over both sources at once.** This is the important sequencing argument. If grants are
  built over machines now and retrofitted to the locker later, the capability check gets written twice
  and the two copies disagree the first time either changes. `resolveAccess` in `worker/downloads.ts`
  is the precedent — one function decides who may see what, and every read asks it the same question.
  Building grants once, over machine drives and locker files together, is why the locker goes first.
- **Native agents last, and possibly never**, because the setup scripts remove most of the pain they
  were for. Deciding this after S ships means deciding it with evidence.

`SPEC-ACCOUNTS.md` §7's rule — *phases 2 and 3 must not be collapsed* — is preserved. Phase 2 fails as
"my own files don't load"; the grant phase fails as "a stranger read my files." The locker inserts
itself between them as another single-principal phase, which is consistent with that reasoning rather
than an exception to it.

---

## 4. Phase S — setup

### What the script is for

Three depths, chosen by the user, all from one file:

1. **Prepare only.** Creates the share root, links the chosen folders into it, registers the folder
   list with the account, prints the browser steps. Touches nothing else. This is the floor and it
   always works.
2. **Prepare and keep running.** The above, plus: the managed browser policy that pre-approves the
   site, a login task that opens `/share`, and power settings that stop the machine sleeping while it
   is sharing. This is the recommended path and the one the page should lead with.
3. **Install the native agent.** §7. Not offered until §7 is built and signed.

### Choosing folders — both mechanisms, deliberately

The client asked for what is best for file sharing rather than what is easiest, so this is both belt
and braces:

- **The fast path: one share root.** The script creates `C:\Shared` (or `~/Shared`) and places a
  junction — a directory link — inside it for each folder the user picked. The browser picks the root
  once and sees everything under it. Adding a folder later is a script re-run and no browser step at
  all.
- **The guaranteed path: a guided checklist.** The script also prints a **setup code** carrying the
  machine name and the folder list, copies it to the clipboard, and writes it to a text file beside
  itself as a fallback. `/share` gains a paste box; pasting the code turns the folder list into a
  checklist, each row a button that opens the picker with the label already filled in and ticks itself
  off when the folder is added. This works whatever the browser does with links, and it is better than
  a bare picker even when the fast path works.

  **The code is deliberately not an API call.** The obvious design — the script POSTs the folder list
  to an authenticated endpoint — would add a write route reachable by a downloaded script holding a
  credential, which is a worse thing to own than a string on a clipboard. The code carries no
  authority: it is a list of names and paths, it grants nothing, and a hostile one can at worst
  suggest folders the user then has to pick by hand in their own browser. It follows `.v-paste`, which
  the site already uses for share codes, and it is **validated field by field** on arrival like every
  other untrusted payload in this codebase.

**The fast path is a deliberate softening of the sandbox, and that deserves saying.** §1 argues that
the picker gesture is load-bearing; a share root full of links means later folders join without one.
The gesture is not bypassed — the person still picked the root, and a script that can write links into
their home directory could equally write files there — but "add a folder with no browser step" is a
capability, and it belongs to whoever can write to that folder. So the root is created inside the user
profile rather than at `C:\`, and **the checklist path is what the page recommends to anyone who did
not run the script themselves.**

**Answered 2026-08-27, from the Chromium source rather than from a blog post: it traverses.**
Directory entries are exempted from the sensitive-path check *by construction* —
`FileSystemAccessDirectoryHandleImpl::DidReadDirectory` runs `ConfirmSensitiveEntryAccess` only on
files, and Chromium's own unit test asserts the exemption in as many words (*"Sensitive entry access is
not expected to perform on directories"*). The OS enumerator reports a junction or a symlink as an
ordinary directory because `NativeFileUtil` asks for no `SHOW_SYM_LINKS`, which selects `stat()` over
`lstat()`. Verified on the shipping branch, both feature flags compiled on.

**High confidence from source; not measured.** Nobody has watched it happen, junctions are tested
nowhere in Chromium at all, and this project's standing rule is that those are different claims. The
scripts therefore offer the one-pick path as *"worth a try first"* with the checklist underneath, and
the download page must not promise it until somebody has run the probe on real Windows.

Three consequences fall out of the same reading, and two of them are more important than the answer:

- **`entries()` can silently return a subset, and this is not a phase-S problem.** Since Chrome M132
  (stable January 2025) a file whose *resolved* path is blocked is omitted from the listing and the
  call still reports success — no exception, no signal to the page. **The phase-2 explorer already
  inherits this**, so a shared folder can show a customer fewer files than it holds with nothing
  anywhere saying so. Chrome published nothing about the change. The explorer must never present a
  listing as provably complete, and "that file is not there" must not be rendered as certainty.
- **The share-root-of-links pattern is the shape of a known blocklist bypass** (crbug 40061477, a
  $1,000 VRP, fixed only for the file leg). The home folder, Desktop, Documents and Downloads are
  blocked as *"you may not pick this"* rather than *"you may not read this"*, so a link to one of them
  **inside** a picked folder reads it. **Hardened 2026-08-27 after three reviews found four working
  bypasses** — exact string equality on a raw path, no symlink resolution, the parent of every profile
  (`/home`, `/Users`, `C:\Users`) absent from every list, and `$HOME` blocked while `~/.ssh`,
  `~/.gnupg`, `~/.config` and `~/Library` were not. All three scripts now canonicalise before
  comparing, **fail closed** when a path cannot be resolved, prefix-match so a blocked directory blocks
  its children, fold case on Darwin, and refuse a folder containing the share root. **That refusal is
  a security control, not a convenience check, it is the only barrier there is, and it must not be
  relaxed** — `npm run check` asserts the entries, the fail-closed branch, the prefix matching and the
  framing sentence, and each assertion was verified by breaking it.
- **A restored handle's root is never re-checked.** `DeserializeHandle` does not call
  `ConfirmSensitiveEntryAccess`, so a folder that was benign when picked and has since become a link
  to somewhere blocked is re-granted on the next visit. Child files are still checked on read, which
  is the mitigation.

Chrome's own position, from `docs/security/faq.md`, is that evading the blocklist is not treated as a
security bug because picking is an explicit user action. **So the blocklist is a misclick guard, not a
boundary**, and nothing in this design may lean on it as though it were one.

### Publishing them

The downloads feature already does exactly this job — private R2 bucket, bytes only through
`worker/downloads.ts`, operator-authored pages, categories, drawn icons. The scripts are rows in that
table. What each needs alongside it:

- A plain description of what the script changes on the machine, in the order it changes it.
- **The script's own source, published as a `.txt` beside it**, so it can be read without being run —
  and so it can be pasted into an AI and checked, which is a thing to say out loud on the page.
- **A SHA-256 checksum on the page**, with the one-line command to verify it on each platform.
- The unsigned-software notice that `/setup` already uses, unchanged in tone.

**The scam-page tension is real and must be resolved in the copy, not ignored.** `/scams` teaches
people not to run software a stranger talked them into running, and `/setup` puts that warning above
the software deliberately as a safety decision. This page is asking for exactly that behaviour, so it
must earn it: the checksum, the readable source, and a line saying that if somebody phoned you and
asked you to run this, hang up. The warning goes above the download, for the same reason it goes above
the software on `/setup`.

### Platforms

Windows first (PowerShell plus a `launch.bat` doing the `-ExecutionPolicy Bypass`), then macOS, then
desktop Linux. `scripts/pi-setup.sh` and `scripts/thinkcentre-setup.sh` already cover appliance Linux
and are the model for all of this: they refuse to run on the wrong hardware, they are idempotent, they
explain each step as they take it, and they end with a verification section. **Every new script follows
that shape**, including the hard refusal — half-working on the wrong machine is worse than not running.

---

## 5. Phase L — the locker

### Shape

Two areas per account, one quota covering both:

- **Vault** — encrypted in the browser before upload. The operator holds ciphertext.
- **Plain** — stored as uploaded. Previews work, the operator can read it, and the upload control says
  so where it is read rather than in a footnote.

The default is the vault (decision C). Moving a file between areas is an explicit action with the
consequence named.

### What is encrypted, and what is not

**This is the paragraph most likely to be got wrong, because the easy version of it is false.**

A first draft of this document claimed the vault made a file *"opaque to us"* while the schema beside
it carried a plaintext `name` column. A filename is not metadata in any sense a person would accept:
`Divorce settlement final.pdf` is the whole content for most purposes, and a list of filenames plus
sizes plus timestamps describes somebody's life adequately.

So, precisely:

- **Encrypted, and unreadable by the operator:** file contents, **filenames**, and any folder names
  inside the vault. The stored row carries an opaque id and a ciphertext blob for the name.
- **Not encrypted, and visible to the operator, unavoidably:** the number of files, each one's
  approximate size, and when it was uploaded. Sizes are rounded into buckets in the row so the exact
  length of a document is not an identifier, but a 4GB object is a 4GB object and pretending otherwise
  would be the same mistake again.
- **Not encrypted, deliberately:** everything in the plain area, including its filenames.

`SPEC-ACCOUNTS.md` §9's inventory gains a section stating exactly the above. **It goes from "no
personal data" to "no personal data, plus files you chose to store, of which the vault's contents and
names are ciphertext and whose count, rough size and dates are not."** That is a spec change and it
needs the client's sign-off before a byte is stored.

### The crypto, in enough detail to build

- **A locker master key** per account, generated in the browser, wrapped to the account's existing
  grant keypair. That keypair already has one key slot per credential (§5 of `SPEC-ACCOUNTS.md`), so
  **any credential opens the vault and operator password reset still cannot** — the property that made
  key slots worth building applies here unchanged.
- **A per-file key**, wrapped to the master key. Per-file rather than one key for everything, because
  sharing one vault file with one person must not hand over the ability to read the rest.
- **Chunked AES-GCM, not whole-file.** The chunk is 1MB, each with its own nonce derived from the file
  key and the chunk index, and the file's chunk count and size are authenticated so chunks cannot be
  dropped or reordered. **This is not an optimisation, it is what makes the rest of the design
  possible**: the downloads feature's byte route answers `206` to range requests and `HEAD` to download
  managers, and neither is implementable over a single GCM blob you must have entirely in hand before
  any of it verifies. It also keeps a multi-gigabyte upload out of a browser tab's memory.
- **Filenames** are encrypted with the master key, separately from the file, so a listing decrypts
  without touching any file key.

### The operator access code

The user's browser wraps the **locker master key** to the operator's grant public key. That ciphertext
is stored against a new row; the code the user reads out is the key to that row, not the key to the
locker.

- **The code is 20 characters of Crockford base-32** — around 93 bits, because it is read down a
  telephone and typed by hand, and because a short code with a wrapped master key behind it is worth
  grinding.
- **Redemption is rate-limited and reserves in one round-trip**, following the rule
  `SPEC-ACCOUNTS.md` records for every route that consumes an allowance. Ten wrong attempts burn the
  code rather than locking the account, because the account holder is not the one guessing.
- **The row exists from the moment the code is generated**, in state `issued`, which is what makes the
  next paragraph implementable at all.

### Ending it early is a first-class control

The 24 hours is a ceiling, not a commitment. The account page shows any live code with an unmissable
*End access now* beside it, taking effect on the next request.

- **No confirmation dialog.** Withdrawing access you granted is the safe direction; making somebody
  confirm it is friction pointed the wrong way.
- **An unredeemed code can be killed too** — generating one and thinking better of it before it is
  ever entered is the likeliest version of changing your mind, and a code sitting in a text message is
  exactly the thing worth cancelling. This is why the row is written at generation rather than at
  redemption: there is no way to revoke a code that exists only as a string in somebody's phone.
- **The operator gets no warning.** Their next request fails with "that access was ended". The user
  does not have to negotiate it.

**The limit that must not be papered over:** ending access stops further reads. Anything already
fetched has been fetched, and once the operator's browser has unwrapped the master key it holds it
until that tab is closed. The button's copy says "stops further access", never "destroys the key".

### Quota, accounting and abuse

Enabled per account on `/admin`, with a size the operator sets and can change (decision G). **Ciphertext
size counts**, since that is what is stored and what is paid for.

- **The counter reserves before the upload starts and settles after it finishes**, rather than being
  incremented on completion — two concurrent uploads that each fit but do not both fit is the same
  shape as the rate-limiter's check-then-act bug, and it has the same fix.
- **A periodic reconciliation** lists what is actually stored and corrects the counter, because a
  crashed upload leaves the two disagreeing and the honest number is the one on the disk.
- Uploads follow the downloads feature's hard-won rules: multipart even for a small file, the size read
  from the stored object rather than from the browser, the row written before the bytes and marked
  usable after, and **every refusal from the byte route identical** so the status code is not an
  existence oracle.

**Abuse, which the heading promises and a quota does not deliver.** The locker is operator-granted, so
there is a name attached to every byte and the operator can revoke the space. There is **no virus
scanning and there cannot be** — the vault is opaque by construction and there is no scanner on the
other side of a plain upload either. Files are served with `Content-Disposition: attachment` and a
`nosniff`, so nothing stored can execute in the site's origin, and that is the whole technical defence.
The rest is that this is not an anonymous service.

### Durability, stated because §2 H is a promise

*"Files are kept until deleted"* commits the operator to keeping them. That commitment is only as good
as the storage behind it, so the page must not imply more than is true: **the locker is a convenience,
not a backup.** Anyone whose only copy of something is here should be told, on the page, to keep
another. Whether the bytes are additionally replicated is an operational decision recorded in
`docs/DECISIONS.md` when it is taken — but the copy promises the weaker thing regardless, because the
stronger one cannot be checked by the person relying on it.

### What the page must say before the first byte

- That the operator can delete any account and its files at their discretion (decision G).
- That vault files cannot be recovered by anyone, including the operator, if every credential is lost.
- That the operator can read anything in the plain area.
- That nothing is scanned for viruses, and why.
- That this is not a backup.

---

## 6. Phase G — grants

Everything in `SPEC-ACCOUNTS.md` §7's phase 3, over both sources at once.

### What can be shared, which the first draft could not express

The client's goal is *"i/other ppl choose files on their computer, share"* — arbitrary files, chosen by
hand. A grant therefore names one of:

- **a whole drive** (a folder shared from a machine, as phase 2 already has them);
- **a folder inside a drive or inside the locker**, by path, meaning it and everything under it;
- **a single file.**

**The locker gains folders** for this reason: a flat list cannot express "share this folder" and the
client asked for folders first. A locker row carries a parent, so the locker is a tree like the drives
are, and one grant model covers both sources.

**A grant is a row and is evaluated as a row.** Either half may be a wildcard, and the pairing is what
carries the meaning — shredding rows into a set of resources and a set of subjects loses it, and a
wildcard in one row then attaches itself to every other row's scope. That exact bug is documented in
`worker/downloads.ts`; this build inherits both the rule and its test.

**One function decides.** Listing, opening and fetching bytes all ask the same question of the same
function, and no route gets a second opinion.

### The flow, end to end

1. The owner opens a folder or selects files, on `/files`, and chooses **Share**.
2. They pick a scope: **just me** (the default and the no-op), **someone specific**, or **everyone
   signed in**.
3. For *someone specific*, they either type a handle or generate an **invite code**. The handle form
   answers identically whether or not the account exists — *"if that account exists, it can now see
   this"* — which closes the enumeration half of `SPEC-ACCOUNTS.md`'s open sign-off item 4.
4. **The recipient is not notified by the site, because the site has no way to reach them.** No email
   is collected, by design, and adding one to send notifications would undo the single largest privacy
   property the account system has. So sharing produces **a line of text to send them yourself**, and
   the interface says that plainly rather than implying a message went out. A recipient who is already
   signed in sees it in *Shared with me* whether or not they were told.
5. Either party can end it. The owner revokes; the recipient can hide it. **Revocation stops further
   reads and cannot un-read**, said in those words wherever it appears.

### Encryption constrains who can receive

Sharing a vault file re-wraps its per-file key to the recipient's grant public key, which requires a
specific recipient. **"Everyone signed in" is therefore offered on plain files only**, and the
interface explains why instead of silently greying a control out. This is arithmetic: a key wrapped to
everybody is a key wrapped to nobody.

Sharing a vault *folder* wraps each file's key in turn, and a file added to that folder afterwards is
**not** retroactively shared — the wrap happened at share time. That is a real limitation and it is
better than the alternative, which is handing over the master key.

### Where it lives

**`/machines` becomes `/files`**, with three tabs: this account's machines, its locker, and shared with
it. The old name stops being true the moment it lists somebody else's folder. Both pages are unlinked,
so the cost is a line in `src/data/pageIds.ts` and a redirect, and **`PATHS` stays a total map from a
closed union** — the property that makes every link on the site compiler-checkable.

## 7. Phase N — native agents, and what they cost

Wanted as an option (decision J), last, and worth a separate decision when the time comes.

- **A signing certificate is not optional in practice.** Unsigned, Windows SmartScreen shows the
  full-screen warning that actual malware produces — on a site whose credibility rests on `/scams`.
  An OV certificate is roughly $300–500 a year plus a verified business entity and a signing step in
  every release. macOS notarisation is a separate Apple Developer account at $99 a year.
- **It is a second implementation of the trust model.** The fingerprint verification in
  `src/share/handshake.ts` — including the RFC 8122 §5 multi-fingerprint refusal, which exists because
  matching only the first line let a hostile signalling service read every byte — has to exist again,
  correctly, in another language. Go with `pion/webrtc` is the sane choice; it is still a second
  copy to keep in step.
- **The blast radius grows.** The browser can only ever hand out handles to folders the user picked.
  A native agent runs with the user's full filesystem rights, so path scoping stops being belt and
  braces and becomes the only thing standing between a bug and the whole disk.

None of that is a refusal. It is the reason it goes last, and the reason the setup scripts go first:
if step 1 makes the browser agent bearable, this may not be worth buying.

---

## 8. Data model additions

Sketch, to be settled when each phase is specified in detail — but the columns below are the ones the
sections above turned out to require, several of which a first draft did not have.

```
lockers        account_id · quota_bytes · used_bytes · reserved_bytes · enabled_at
               · enabled_by · master_key_wrapped

locker_nodes   id · account_id · parent_id · kind · name_enc · name_plain · size_bucket
               · bytes · encrypted · key_wrapped · uploaded_at · r2_key · deleted_at
                 kind = 'folder' | 'file'

locker_codes   id · account_id · code_hash · master_key_to_operator · state
               · issued_at · redeemed_at · expires_at · revoked_at · attempts
                 state = 'issued' | 'redeemed' | 'revoked' | 'expired'

grants         id · owner_id · resource_kind · resource_id · subject_kind · subject_id
               · key_wrapped · created_at · revoked_at
                 resource_kind = 'drive' | 'drive_path' | 'locker_node'
                 subject_kind  = 'account' | 'everyone'

invites        id · created_by · code_hash · grant_id · redeemed_by · redeemed_at · expires_at
```

Five things in there are load-bearing and were each missing until a cold read of this document went
looking for them:

- **`locker_codes` exists from the moment a code is generated**, carries the wrapped master key, and
  has a `state` with `issued` in it. Without the row at generation there is nowhere to record — or
  cancel — a code that has been written down and never used, which §5 requires. `attempts` is what the
  redemption throttle counts.
- **`locker_nodes` has a `parent_id`**, so the locker is a tree. A flat list cannot express "share this
  folder", which is the first thing the client asked for.
- **`name_enc` and `name_plain` are two columns and exactly one is ever populated.** A vault node has
  its name as ciphertext; a plain node has it in the clear. One nullable column doing both jobs is how
  a filename ends up written to the wrong one, and the check suite asserts the exclusivity.
- **`size_bucket` beside `bytes`.** The listing and the quota need different numbers: the quota needs
  the true ciphertext length, and anything the operator's own interface renders about a vault file
  reads the bucket, so an exact byte count does not become an identifier by the back door.
- **`grants.key_wrapped`** holds the file key re-wrapped to the recipient. Without it a share of an
  encrypted file has nowhere to put the thing that makes it readable.

**`grants.resource_kind` and `subject_kind` are wire formats the moment a row exists**, so they are
**append-only**, exactly as `FX` and the download `CATEGORIES` are: a value may be added, never
renamed, never re-pointed. `drive_path` carries a path *array* in `resource_id`, never a string —
`src/share/paths.ts` refuses to have a parser to have a traversal bug in, and a grant is not the place
to reintroduce one.

**Phase S adds no tables and no routes.** The setup code is carried on the clipboard and decoded in
the browser; that is the whole mechanism, and it is why phase S touches no server surface at all.

---

## 9. Open questions for the client

None of these block starting phase S.

1. **Where do the bytes actually live — Cloudflare R2, or a disk in the operator's house?** This
   document has been saying "the operator's storage" and specifying R2 prefixes, and those are not the
   same thing or the same bill. R2 is the assumption everything else here is built on; a machine at
   home is possible but changes durability, bandwidth and the phase-2 signalling story. **This one
   needs answering before phase L starts.**
2. **Does a locker file shared with "everyone" appear in a list**, or only to someone who has the link
   to it? A list is discoverable and therefore browsable by every account holder.
3. **Who pays for TURN**, which the locker does not need but a hard-NAT machine share still does. Open
   since phase 2 (§12 P).
4. **Should the operator's own machines be visible as a source to nobody but the operator**, or is the
   ThinkCentre a candidate for sharing to named accounts too?
5. **Is "send them the link yourself" acceptable**, given no email is collected and so the site cannot
   tell anybody they have been shared something? The alternative is collecting an address, which would
   be the largest reversal in the accounts design.
6. **Is 5GB the right starting number**, given it is per-account and operator-set anyway?

## 10. What this document deliberately does not change

- The peer-to-peer path. Locker files go through the server because they live there; machine files
  still do not, and that is what keeps hosting cost tied to connections rather than megabytes.
- The operator door, which remains theatre and is never reused for any of this.
- `PICKABLE_FX` and every other operator-gated appearance surface. Nothing here is a visitor-facing
  appearance control.
- The CSP's report-only state. **The standing rule holds: it does not flip to enforcing until one real
  file has been downloaded from a phase-2 browse**, and the locker's download path is a second unproven
  surface of the same kind, not a reason to flip early.
