# The sharing setup scripts — the runbook

What phase S is, how to publish it, and what is known not to work. The design is
`design/SPEC-SHARING.md` §4; this file is the operational half.

## What the scripts are for, in one paragraph

Phase 2 shipped a working feature that almost nobody can set up. `/share` serves folders from a
browser tab, but getting there means signing in on the right machine, pairing it, picking folders one
at a time in a system dialog with nothing to say which is which, and knowing to leave the tab open.
The scripts do everything around that except the one part that cannot be automated: **only a human
gesture can hand a folder to a browser**, and that is the property that lets this whole feature exist
with no installer and no code-signing certificate.

## The pieces

| File | What it is |
|---|---|
| `scripts/windows-share-setup.ps1` | The Windows script. Junctions, browser policy, logon task, power. |
| `scripts/launch.bat` | Double-clickable wrapper. Exists because double-clicking a `.ps1` opens Notepad. |
| `scripts/macos-share-setup.sh` | The macOS script. Symlinks, LaunchAgent, `pmset`. |
| `scripts/linux-share-setup.sh` | The desktop Linux script. Symlinks, XDG autostart, GNOME power. |
| `scripts/setup-bundle.sh` | Builds the publishable bundle: scripts, `.txt` copies, `CHECKSUMS.txt`. |
| `src/share/setupCode.ts` | Decodes what the scripts emit. **Wire format** — see below. |

**Each script hard-refuses on the wrong machine**, the rule `pi-setup.sh` and `thinkcentre-setup.sh`
already follow: half-working on the wrong hardware is worse than not running, because the person then
has to work out which half they got. The Linux script additionally refuses on a Raspberry Pi and
points at `pi-setup.sh`, which does a far more thorough job on exactly that hardware.

## Publishing

```sh
bash scripts/setup-bundle.sh          # writes dist-setup/
```

Then upload through the downloads editor — `docs/DOWNLOADS.md` is that runbook. Three things about
this particular page:

- **Publish the `.txt` beside every script.** It is byte-identical, and the point is that what a
  cautious person reads is what runs. The page should say out loud that reading it, or pasting it into
  an AI and asking whether it is malicious, is a reasonable thing to do.
- **`CHECKSUMS.txt` is generated, never typed.** A checksum written into a document is wrong the first
  time a script changes, and the failure mode is somebody checking it, seeing a mismatch, and
  concluding — reasonably — that they have been handed something tampered with.
- **The scam warning goes above the downloads.** `/setup` puts its warning above the software as a
  deliberate safety decision and this page is a harder case, because it is asking for precisely the
  behaviour `/scams` teaches people to refuse. It earns that rather than assuming it.

**Ids are a wire format.** Add ids, never rename one — they are R2 object keys and they appear in
links people keep. Lowercase kebab, and `fileId` normalises them.

## The setup code

The script prints `VS1.<base64url of compact JSON>`, copies it to the clipboard, and writes it to
`setup-code.txt` in the share folder. `/share` has a paste box; pasting turns the folder list into a
checklist with labels filled in.

**It carries no authority and is deliberately not an API call.** The obvious design — the script POSTs
the list to an authenticated endpoint — would mean a downloaded script holding a credential and a new
write route to defend. This is a list of names: it grants nothing and opens nothing, and the worst a
hostile code can do is *suggest* a folder the person then has to go and pick themselves from the real
picker. **That is why phase S adds no server surface at all**, which is in turn why it could ship
without a security review.

**Two implementations, two languages, one gate.** The PowerShell and shell encoders and the TypeScript
decoder must agree byte for byte. `npm run check` asserts the round trip, refuses twenty-one malformed
shapes, and greps the PowerShell script for the exact JSON template and base64url transformation, so
editing one side alone fails the suite. Verified by breaking it deliberately.

**`ConvertTo-Json` is not used and that is not fussiness.** Windows PowerShell 5.1 turns a one-element
array into a bare object, so somebody sharing exactly one folder would produce a code the site refuses
— and it would work for everyone testing with two. Both shell scripts hand-roll their JSON for the
same reason, and to avoid making a non-technical person install `jq` over the telephone.

## What was tested, and what was not

**Verified by running it**, on Linux:

- The Linux script end to end: folder collection, symlinks, the marker file, the code.
- **Cross-language**: the code that script produced was fed to the real `decodeSetupCode`, including a
  label with French accents in it. Round trips through UTF-8 and base64url intact.
- **`--undo` removes links and never their targets.** A file inside a linked folder survived; this is
  the test that matters, because deleting through a symlink is how you delete somebody's photographs.
- **`--undo` refuses a share folder without its marker file**, so pointing it at a real `~/Shared`
  full of somebody's work does nothing. Corrected 2026-09-07 (audit item 47): the scripts also
  *adopt* an existing folder as the share root and write the marker into it, and undo then removes
  every link in a marked folder — including links the person made themselves. Links only, never
  what they point at, so the damage is bounded to re-making a link; but "did not create" was the
  wrong claim.

**Not verified, and honestly listed rather than assumed:**

- **The macOS script has never been run**, and cannot be from here. It follows the Linux one's shape,
  which is an argument and not a test. Its bash-3.2 exposure was reviewed line by line (macOS ships
  bash 3.2): no bash-4 syntax is present, every bare `"${arr[@]}"` is guarded, and the four
  empty-array length guards were converted to `${arr+x}` as free insurance since that one construct
  could not be measured here.
- **The Windows script has never been RUN, but it has been parsed and partly executed.** A PowerShell
  binary was fetched and used to: parse the whole file clean (3,577 tokens); execute
  `ConvertTo-JsonString` and confirm emoji, accents and zero-width characters now survive it and tabs
  are still escaped; and execute `Test-ShareableFolder` against the bypass matrix with the
  environment variables faked, confirming `C:\Users`, the profile, `..` traversal, UNC, device paths
  and 8.3 short names are all refused while an ordinary folder passes. **That is PowerShell 7 on
  .NET 8, not Windows PowerShell 5.1 on .NET Framework**, which is the real target — so the
  StrictMode, registry, scheduled-task, `powercfg` and `FolderBrowserDialog` paths remain untested.
- **The blocklist is hardened and every known bypass is closed and tested** — see the Traps below.
  What remains untested there is the Windows half at runtime, per the note above.
- **Whether Chrome follows a Windows junction or a POSIX symlink out of a picked folder.**
  **Answered from the Chromium source on 2026-08-27 — it does**, because directory entries are exempt
  from the sensitive-path check by construction and Chromium's own unit test says so. But *nobody has
  watched it happen*, and junctions are tested nowhere in Chromium, so this stays in the unverified
  list until the probe is run on real Windows. The scripts offer it as "worth a try first" and the
  checklist underneath does not depend on it. `design/SPEC-SHARING.md` §4 carries the detail and the
  two consequences that matter more than the answer.
- The logon task, the LaunchAgent and the XDG autostart entry.
- The Chrome and Edge managed-policy keys.
- Whether the browser's stored folder permission survives a browser update on a customer's machine.

## Traps

- **Which browser profile.** The folder handles live in one profile, not in the browser. A logon task
  that opens a different profile gets a page that has never heard of this machine — handled as a
  routine "pair this machine" rather than an error, but baffling to somebody who thought they had
  already done it. The Windows script takes `-BrowserProfile`; the other two say so in their manual
  notes. **This is the most bug-prone line in phase S.**
- **The lid is not the idle timer.** All three scripts stop the machine sleeping on idle when asked and
  **deliberately leave the lid alone**, warning instead when they detect a battery. A laptop taught not
  to sleep in a bag gets very hot, and somebody who shuts a lid expects sleep — silently changing that
  would be a genuinely dangerous surprise.
- **Junctions do not need administrator; symbolic links do.** That is why the Windows script uses a
  junction, and it is what lets the whole prepare step run as an ordinary user. A script that demands
  administrator to do its safe half teaches people to give administrator to scripts.
- **The share root goes inside the user profile**, not at `C:\`. The fast path is a real softening of
  the picker gesture — adding a folder later needs no browser step — and that capability belongs to
  whoever can write to that folder.
- **The scripts remove nothing from the website.** `--undo` cleans the machine. Drives are removed on
  `/share`, which is the only place that can.
- **The blocked-folder lists in all three scripts are a security control.** Home, the system root,
  Program Files and the drive roots are refused because a *link* to one of them inside a picked folder
  is a known way past Chrome's blocklist (crbug 40061477). Relaxing one of those entries to be helpful
  re-opens it.
- **A directory listing from the browser may be incomplete and will not say so.** Chrome silently drops
  files whose resolved path is blocked, and has done since M132. Nothing on our side can detect it.
