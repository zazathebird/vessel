# Sharing setup — downloads page copy

Customer-facing copy for the downloads page that carries the three setup scripts and `launch.bat`
(`design/SPEC-SHARING.md` §4, *Publishing them*).

Written against the scripts as they actually are, not against the spec's description of them. Every
claim below is audited at the end of this file, with the file and line it was checked against.

**Register:** first person, independent, no self-deprecation. Jokes point outward and are spent in
the intro, the file notes and the FAQ. **The safety block carries no jokes at all** — the
`deadpan-comedy` rule that a page which jokes everywhere cannot be trusted anywhere it is serious,
and the `/setup` precedent that puts the warning above the software as a safety decision.

**Order on the page is load-bearing.** Intro → safety block (the scam warning, then the checking
procedure) → the four files → what happens next → FAQ. The warning goes above the download. Do not
move it down for visual balance.

---

## 1. Page title and intro

**Title:** Set up sharing

**Intro prose (the page's own lede):**

> These scripts get a computer ready to share its own folders with this site. You run one, it asks
> which folders you want, and it prints a code. You paste the code into the sharing page and pick
> each folder in your browser.
>
> That last step is not a formality I could skip if I felt like it. A web page cannot be handed a
> folder by anything except you clicking a button and choosing it — that is how browsers are built,
> and it is the reason none of this needs an installer, an account with somebody else, or a signed
> application.
>
> Your files stay on your own drive. Nothing is uploaded, nothing is copied, and nobody is going to
> email you in eleven months about a plan that has been upgraded for your convenience.

---

## 2. The safety block — sits above the downloads

Two blocks. The first resolves the tension with `/scams`; the second is the checking procedure.
Both are flat. No jokes.

### Block one

**Kicker:** before you download anything
**Title:** I tell people not to run downloaded scripts

> The scams page on this site teaches one rule above every other: if somebody contacted you and
> talked you into installing something, it is a scam. This page hands you a script and asks you to
> run it.
>
> Both of those are right. The thing that separates them is who started it. You came here and
> clicked. Nobody rang you.
>
> If that is not true — if somebody telephoned, emailed or messaged you and pointed you at this
> page — stop here. Hang up. Ring me back on a number you looked up yourself, not one you were
> given. I will never mind, and a scammer cannot survive it.

### Block two

**Kicker:** check it first
**Title:** Read it, or have something read it for you

> You do not have to take my word for any of this, and I would rather you did not.

**List:**

- The full source of every script here is published beside it as a `.txt`. Open it in Notepad,
  TextEdit or any text editor and read it before you run anything. It is commented the whole way
  through, in English, because it was written to be read — and Windows opens a `.txt` in Notepad,
  not in PowerShell.
- That `.txt` is the same file, byte for byte — not a tidied-up version for showing visitors. It
  has the same checksum as the script itself, which is the entire point of it: what you read is
  what runs.
- If you would rather not read a script, paste the whole text into an AI and ask it whether the
  script does anything malicious. That is a good instinct and I would genuinely rather you did it
  than trusted me.
- `CHECKSUMS.txt` on this page lists a SHA-256 for every file. Run the one command for your
  platform and compare what it prints with what is in that list, character for character.
- **Windows** — `Get-FileHash .\windows-share-setup.ps1 -Algorithm SHA256`
- **macOS** — `shasum -a 256 macos-share-setup.sh`
- **Linux** — `sha256sum linux-share-setup.sh`
- If the checksum does not match, do not run the file. Tell me, because that is something I need
  to know.
- I will never ask you for a password. Not for this, not for anything.
- The basic setup needs no special permission on any of the three platforms. Only the optional
  keep-it-running part does: on Windows it skips those steps if you are not an administrator and
  lists what it skipped, on a Mac it asks for your password once and skips if you do not give it,
  and on Linux it asks for nothing at all.

---

## 3. The four files

### Windows — `windows-share-setup.ps1`

**Label:** Windows setup script
**One line:** Prepares a Windows 10 or 11 machine: collects your folders, links them into one
place, and prints your setup code.

**What it changes on your computer**

- Creates a folder called `Shared` inside your user profile — `C:\Users\you\Shared` — and puts a
  hidden marker file in it saying what it is and how to remove it.
- Puts a junction — a kind of link — in there for each folder you picked. The link points at your
  folder. Nothing is copied and nothing is moved, and deleting a link never deletes the folder it
  points at.
- Writes `setup-code.txt` into that `Shared` folder and copies the code to your clipboard.
- Refuses to prepare Windows itself, Program Files, ProgramData, your profile root, or a whole
  drive — the browser will not share those either, so it tells you now rather than in ten minutes.
- Carries 24 folders in one code. Pick more and it takes the first 24 and tells you to run it
  again for the rest.

**Administrator:** not needed for any of the above.

**With `-KeepRunning`, which is optional**

- Adds a scheduled task called `mcclevarty-sharing-tab` that opens the sharing page in Chrome or
  Edge when you log in. It runs as you, at ordinary privilege, and it is a named task so you can
  find it, disable it or delete it yourself. **No administrator needed.**
- Adds this site to Chrome's and Edge's `FileSystemReadAskForUrls` policy in the registry. This
  does not give the site access to any folder. It lets the site *ask*, and you still choose the
  folder in the picker yourself. **Needs administrator**, and is skipped with a note if you are
  not one.
- Sets Windows not to sleep or hibernate while plugged in. Your screen still turns off, and the
  battery settings are left exactly as they were. **Needs administrator.**
- On a laptop it tells you that closing the lid still puts it to sleep, and deliberately does not
  change that, because a laptop that never sleeps in a bag gets very hot.

**`-Undo`** removes the links, the marker, the scheduled task and the policy entry. It leaves the
`Shared` folder itself alone in case you have put something in it, and it does not put the sleep
setting back — that one is yours to change back in Settings.

**`-WhatIf`** walks through the whole thing and writes nothing to disk.

---

### Windows — `launch.bat`

**Label:** Windows launcher (double-click this one)
**One line:** Starts the PowerShell script sitting next to it. Download both into the same folder.

**What it changes on your computer:** nothing. It runs the other file.

- Prints what is about to happen and waits for you to press a key before anything runs.
- Checks that `windows-share-setup.ps1` is in the same folder, and stops with a plain message if
  it is not.
- Runs it with `-ExecutionPolicy Bypass`, which applies to that single run and changes no setting
  on your machine. The next PowerShell window is exactly as locked down as it was before.
- Runs it with `-NoProfile`, so nothing in your own PowerShell startup file — or anything that has
  written itself into it — can change what the script does.

This file exists because double-clicking a `.ps1` opens it in Notepad instead of running it. That
is Microsoft protecting you from files exactly like this one, and I have no argument with it, which
is why the source is published and the checksum is on this page.

**Administrator:** not needed.

---

### macOS — `macos-share-setup.sh`

**Label:** macOS setup script
**One line:** The same job on a Mac running macOS 11 or later. Run it with `bash`.

**What it changes on your computer**

- Creates `~/Shared` with a marker file in it saying what it is and how to remove it.
- Puts a symbolic link in there for each folder you picked. Nothing is copied or moved, and
  deleting a link does not touch the folder.
- Writes `~/Shared/setup-code.txt` and copies the code to your clipboard.
- Uses the Mac's own folder chooser. It refuses your home folder, `/`, `/System`, `/Library`,
  `/Applications`, `/private`, `/usr`, `/bin` and `/sbin`.
- Carries 24 folders in one code, same as the others.
- Sets no browser policy. On a Mac the browser asks you one extra time, which is fine.

**Password:** not needed for any of the above.

**With `--keep-running`, which is optional**

- Writes a login item at `~/Library/LaunchAgents/ca.mcclevarty.sharing-tab.plist` that opens the
  sharing page in Chrome or Edge when you log in, and starts it.
- Stops the Mac sleeping while it is plugged in. **This one asks for your password.** The display
  still sleeps, the battery settings are untouched, and if you do not give the password it skips
  the step and says so.
- On a laptop it tells you that closing the lid still sleeps it, and deliberately leaves that
  alone.

**`--undo`** removes the links, the marker and the login item. It leaves `~/Shared` in place and
does not put the sleep setting back.

**`--dry-run`** says what it would do and changes nothing.

---

### Linux — `linux-share-setup.sh`

**Label:** Linux desktop setup script
**One line:** For a desktop Linux machine you actually sit at. On a Raspberry Pi it refuses and
tells you which guide you want instead.

**What it changes on your computer**

- Creates `~/Shared` with a marker file in it saying what it is and how to remove it.
- Symlinks each folder you picked into it. Nothing copied, nothing moved.
- Writes `~/Shared/setup-code.txt`, and copies the code to your clipboard if `wl-copy`, `xclip` or
  `xsel` is installed.
- Opens a graphical folder chooser if you have `zenity`. If you do not, it asks you to type paths
  one per line — which is also what makes it work over SSH on a machine with no screen attached.
- Refuses your home directory, `/`, `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/proc`, `/sys` and
  `/dev`.
- Carries 24 folders in one code.

**With `--keep-running`, which is optional**

- Writes `~/.config/autostart/mcclevarty-sharing-tab.desktop`, so the sharing page opens in Chrome,
  Chromium or Edge when you log in.
- Turns off automatic suspend on mains power, through GNOME's own power setting. If you are not on
  GNOME it says it could not and tells you where to look in your own desktop's settings.
- On a laptop it tells you the lid still suspends it, and leaves that alone.

**`--undo`** removes the links, the marker and the autostart entry. It leaves `~/Shared` alone and
does not put the suspend setting back.

**`--dry-run`** says what it would do and changes nothing.

It never asks for `sudo`. Not once.

---

## 4. What happens next

**Kicker:** after you run it
**Title:** Five steps, and the browser does the important one

1. **Run the script.** It opens a folder chooser and you pick folders until you are done. Then it
   asks you for a name for this computer. It asks rather than reading the name off the machine
   because computer names tend to have people's names in them, and this one is visible to anybody
   you later share a folder with.
2. **It prints a code** starting `VS1.`, puts it on your clipboard, and saves it to
   `setup-code.txt` in the `Shared` folder it made. If the clipboard did not work, the file is
   still there.
3. **Open the sharing page and sign in.** It needs Chrome or Edge, because the folder-picking part
   only exists in those. Looking at your files afterwards works in any browser.
4. **Paste the code into the box and press "Read the list".** The page turns your folder list into
   a checklist — one row per folder, with the name and where it is on your machine. Click "Choose
   folder" on a row, pick that folder in the picker, and the row changes to "added". Work down the
   list.
5. **Leave that tab open.** It is the thing serving the files. Close it and sharing stops, which is
   not a fault — it is the whole design.

Two things worth knowing while you do it. Folder names are shortened to 40 characters, and if two
of your folders are both called Documents the second one becomes "Documents 2" — you can rename
either of them on the site afterwards.

And the code itself carries a list of folder names and where they are, and nothing else. It is not
a password, it opens nothing, and it never leaves your browser: the page reads it on your machine
and keeps it there. The only thing this site is ever told is the name you gave each folder. Not the
path, not what is inside it, not one byte of any file.

---

## 5. Questions

**Will this let you see everything on my computer?**

No. The site is told the name you gave each folder and nothing else — not where it is, not what is
in it. The files themselves go from your browser to yours without passing through the site at all.
And today the only thing that can open those folders is a browser signed in as you.

**What happens if I close the tab?**

Sharing stops. That is not a fault, it is the mechanism: the tab is the thing serving the files.
Open the page again and your folders are still listed, though the browser may ask you to allow
access again, which is one click each. The optional keep-it-running part exists so the tab reopens
itself when you log in and the machine does not fall asleep underneath it.

**Can I undo it?**

Yes, and undoing is a switch on the same script — `-Undo` on Windows, `--undo` on the other two.
It removes the links it made, the marker file, and the login task or autostart entry if you asked
for one. It leaves the `Shared` folder itself alone in case you have put something in it, and it
does not put the sleep setting back, so change that one yourself if you want it back. Taking the
folders off your account is done on the website, which is the only place that can.

**Why does it need PowerShell?**

Because that is how you tell Windows to do a series of things without clicking through nine screens
to do each one. Windows 10 and 11 both come with it already — the script checks, and stops with a
plain message if you are on something older. What you are downloading is a text file of
instructions, which is exactly why you can open it and read it before you run it — and why pasting
it into an AI and asking what it does is a reasonable thing to do.

**Do I have to leave the computer on?**

Yes, if you want to reach the folders while you are out. That is the trade: nothing is uploaded,
nothing is stored on anybody else's drive, and there is no monthly fee — but a computer that is
asleep is a computer that is not sharing. The keep-it-running option stops it sleeping while it is
plugged in. It deliberately does not stop a laptop sleeping when you close the lid, because a
laptop that never sleeps in a bag gets very hot, and finding that out in a bag is a bad way to find
it out.

**Somebody rang me and that is how I ended up here. What now?**

Stop. Do not run anything. Hang up, and if they have already been on your screen, switch off the
router — the box the internet comes into the house through. Then ring me on a number you found
yourself, not one you were given. I have never once minded being rung about this.

---

## Claim audit

Run as an adversary against the copy above. Every factual assertion is listed, with the file and
line it was checked against, or flagged for the client. Sorted by cost of being wrong: **safety and
money first, then capability, then texture.**

Line references are to the files as read on 2026-08-27.

### A. Flagged — must be resolved before this page is published

**A1. "The full source of every script here is published beside it, as a `.txt`."**
*Category: capability / safety.* **Verified as a mechanism, still an operator action.**
`scripts/setup-bundle.sh:43–49` copies each of the four files twice — once as itself, once with a
`.txt` extension — and its comment at 45–48 states that the readable copy is byte-for-byte and is
deliberately *not* reformatted. So the claim is true of the bundle. It is **not** true of the page
until somebody uploads all eight files. **Do not publish the page until they are on it**, because
the safety block rests on this sentence.

**A2. "That `.txt` has the same checksum as the script itself."**
*Category: safety — and this is the sentence that closes the hole a sceptic would find.* Verified:
the `.txt` is a `cp` of the same file (`setup-bundle.sh:49`) and `CHECKSUMS.txt` says so in its own
header at 63–64. Without it, "read the source" and "check the checksum" are two separate
reassurances that never meet, and a careful reader is entitled to ask whether the published source
is the thing they ran.

**A3. Where the checksums live.**
*Category: safety.* **I was wrong in an earlier draft and have corrected the copy.** There is no
checksum field on a download — `src/data/downloads.ts` has no such column, `DownloadPage.tsx`
renders none, and `migrations/` has none. But hashes should **not** be typed into a prose block to
compensate: `setup-bundle.sh:14–17` argues exactly against that, on the grounds that a checksum in
a document is wrong the first time a script changes and nobody finds out — and the person who
suffers is the one who checks properly, sees a mismatch, and concludes they were given something
tampered with. **Publish `CHECKSUMS.txt` as a file on the page**, generated by
`bash scripts/setup-bundle.sh`, and re-run the bundle whenever any script changes. The copy above
now points at that file by name rather than at "this page". Worth a line in `docs/DOWNLOADS.md`.

**A4. The three checksum commands.**
*Category: safety.* Verified against `scripts/setup-bundle.sh:59–61`, which prints the same three
commands into the `CHECKSUMS.txt` header — so the page and the file agree by construction rather
than by coincidence. They are also correct for their platforms. **Still worth running each one once
against a real published file before the page goes up:** a verification command that fails is worse
than none, because the person who tries it concludes the file is bad.

**A5. The `.txt` will NOT open in the browser — an error I made and corrected.**
*Category: safety, and a genuine conflict between two files in this repository.* My first draft said
the source `.txt` is "published beside it, as a `.txt` your browser will open rather than
download", following `setup-bundle.sh:45–48`, which says the extension exists "so a browser shows it
instead of downloading it". **That is false for anything served through this site.**
`worker/downloads.ts:411` sets `content-type: application/octet-stream` and 435–436 sets
`content-disposition: attachment` **unconditionally**, and the comment at 412–415 says this is
deliberate — precisely so a script or a text file is saved rather than rendered in the tab. The
copy now says to open the downloaded `.txt` in a text editor, which is true and loses nothing.
**Two things for the client:** the comment in `setup-bundle.sh` is misleading and should be
corrected, and if the source really ought to open in a tab it needs a route that does not force
`attachment` — which is a change to the one function that decides how bytes leave, so it is a
decision, not a tweak. **This is the exact failure this audit exists for: a plausible sentence,
sourced from a comment in the repository, that the code contradicts.**

**A6. "It needs Chrome or Edge, because the folder-picking part only exists in those."**
*Category: capability.* Verified against the site's own copy — `SharePage.tsx:87` says sharing
needs a Chromium browser because of the File System Access API, and that browsing works anywhere.
**But the Linux script also accepts Chromium** (`linux-share-setup.sh:203`), which my copy does not
name in step 3. Not wrong, but a Linux reader on Chromium may think they are excluded. **Client to
confirm** whether to name Chromium in the walkthrough.

**A7. "Today the only thing that can open those folders is a browser signed in as you."**
*Category: privacy — the highest-cost claim on the page.* True today: sharing with a second person
is phase 3 and unbuilt (`SPEC-SHARING.md:32`), and `SharePage.tsx:541` says the site "only
introduces this tab to your own signed-in browsers". The word **"today"** is doing real work and
must not be edited out for rhythm — the sentence becomes false the day grants ship. I deliberately
did **not** write "sharing with other people is coming", because `CLAUDE.md` forbids the site
mentioning things a visitor cannot see. **Flag for a standing note: this sentence is revisited when
phase G lands.**

**A8. The scripts print a button label the site does not have.**
*Category: capability — not my copy, but it lands on this page.* `windows-share-setup.ps1:732` and
the macOS/Linux equivalents tell the user they can click **"Share them all at once"** and choose the
`Shared` folder. **No such control exists in `SharePage.tsx`** — I read the whole `SetupChecklist`
component and grepped for the string. `SPEC-SHARING.md:190` also flags whether Chrome traverses a
junction or symlink at all as *"unverified and load-bearing"*. My copy therefore describes the
`Shared` folder as what the script builds and routes every reader through the checklist, and never
promises the one-folder shortcut. **Either the button gets built, or that line comes out of three
scripts.** Client decision.

**A9. ~~There is no `macos` platform value.~~ — RESOLVED 2026-08-27, the value was added.**
*Category: build, not copy.* `DownloadPlatform` was `windows | linux | android | script | any`, so
the Mac file would have had to be filed as `script` or `any` and the platform filter could not have
separated Mac from Linux on the one page where both appear.

**`macos` is now appended** to the type, `PLATFORMS` and `PLATFORM_LABEL` (`src/data/downloads.ts`)
— appended and not inserted, because these are append-only wire formats where a value may be added
but never renamed or re-pointed. `.dmg` and `.pkg` map to it in `PLATFORM_BY_EXT`; **`.sh`
deliberately does not**, and stays under `script`, because a shell script is not a macOS thing and
mapping it there would put a confident wrong label on every Linux upload. `npm run check` stays
green at 44.

**A10. ~~"It has been in every version of Windows since 7."~~ — RESOLVED 2026-08-27, sentence replaced.**
*Category: texture, with a real chance of being wrong.* The audit was right to stop it: PowerShell
1.0 shipped with Server 2008 and was an optional download for XP and Vista, so the claim was
probably true and **nothing in this repository confirmed it** — a specific, texture-adding detail
nobody had checked, which is the exact shape the 2026-08-26 pass found 24 of.

**It is now a claim the repository can settle**, which beats both the original and the audit's own
suggested hedge ("part of Windows for many years"). The copy reads *"Windows 10 and 11 both come
with it already — the script checks, and stops with a plain message if you are on something
older."* Verified against `windows-share-setup.ps1`: `Assert-Windows` refuses anything below Windows
10 and anything below PowerShell 5, each with its own message. Nothing is asserted about Windows 7,
8 or Vista, because the script does not run there and the reader does not need to know.

**A11. Price and the word "free".**
*Category: money.* I have deliberately **not** written that these scripts are free, and the only
money sentence on the page is *"there is no monthly fee"* — which is a statement about this
mechanism, not a price for the download. `CLAUDE.md` is explicit that no fee is named and no
promise is made that the client has not made. `price_cents` / `free` are per-file switches and
`show_prices` is off by default, so **whatever the operator sets in the editor is the truth and my
copy does not contradict it.** If these are to be given away, tick `free`; do not add the word to
the prose, where it would go stale silently.

**A12. Repeated line: "I will never mind, and a scammer cannot survive it."**
*Category: voice, not fact.* Deliberately reused from the `/setup` block
(`src/data/pages.ts:419`). It is the operator's own established sentence and consistency across the
two safety surfaces is a feature. Noting it so nobody later "fixes" the duplication by rewording
one of them.

### B. Verified — checked line by line

**Windows script** (`scripts/windows-share-setup.ps1`)

- Windows 10 or later, PowerShell 5 or later, refuses anything else — lines 96–109.
- Creates the share root at `%USERPROFILE%\Shared` by default — line 595; created at 269–279.
- Hidden marker file, and what it says — lines 283–294; the `-Undo` check that reads it, 529–547.
- Junctions rather than symbolic links, specifically so no administrator is needed — comment at
  259–267, created at 319.
- Deleting a link does not delete the target: `Directory.Delete(path, false)` removes the reparse
  point only — lines 531–538, with the comment naming this as the classic way to delete somebody's
  photographs by accident.
- Refuses Windows, Program Files, Program Files (x86), ProgramData, the profile root and a drive
  root — lines 236–253.
- 24-folder ceiling, first 24 kept, told to run again — lines 649–653. Matches the decoder's
  `MAX_FOLDERS = 24` at `src/share/setupCode.ts:30`, and the macOS (414–419) and Linux (372–377)
  scripts.
- `setup-code.txt` written into the share root, plus clipboard — lines 696–724.
- Login task: named `mcclevarty-sharing-tab` (line 66), registered at 452, `RunLevel Limited` and
  `LogonType Interactive` at 450, **no administrator check anywhere in `Register-LoginTask`** —
  confirmed by grepping `Test-Administrator`, which appears only at 111, 374, 484 and 564.
- Browser policy: `HKLM:\SOFTWARE\Policies\{Google\Chrome, Microsoft\Edge}\FileSystemReadAskForUrls`
  — lines 380–409. Needs administrator, skipped with a note at 374–377. **"Does not grant access to
  any folder, only lets the site ask"** is the script's own comment at 363–372 and is the load-bearing
  reassurance in my copy.
- Sleep: `powercfg /change standby-timeout-ac 0` and `hibernate-timeout-ac 0` — lines 493–494.
  Mains only, screen untouched (495), battery untouched, lid deliberately untouched with the
  hot-bag reasoning spelled out at 497–509. Needs administrator (484).
- `-Undo` removes links, marker, scheduled task and policy entries — 522–580 — and **does not call
  `powercfg`**, which is why my copy says the sleep setting is not put back. Confirmed by reading
  the whole function.
- "The folders on the website are NOT removed by this" — lines 583–584, which is where my FAQ
  answer comes from.
- `-WhatIf` comes from `SupportsShouldProcess` at line 49 and guards every disk write. **One
  nuance:** `Set-Clipboard` at 714 is *not* guarded, so a `-WhatIf` run still touches the clipboard.
  My copy says it "writes nothing to disk", which is precise. Do not loosen it to "changes nothing".

**`launch.bat`** (`scripts/launch.bat`)

- Prints a summary and pauses before running anything — lines 23–33.
- Checks the `.ps1` is beside it and exits 1 if not — lines 35–42.
- `-NoProfile -ExecutionPolicy Bypass -File`, passing arguments through with `%*` — line 44.
- "Applies to this one run and changes no setting on the machine" — the file's own comment, 8–13.
- Double-clicking a `.ps1` opens Notepad, which is why this file exists — comment at 4–6.
- **Deliberately omitted:** the comment at 11–13 puts a code-signing certificate at "a few hundred
  dollars a year". That is a third-party price and it goes stale silently, so it is not in the
  customer copy. The joke survives without the number.

**macOS script** (`scripts/macos-share-setup.sh`)

- Refuses anything that is not Darwin (67–72) and anything below macOS 11 (75–81).
- `~/Shared` default (40), marker file (179–186), symlinks via `ln -s` (203).
- Refuses `$HOME`, `/`, `/System`, `/Library`, `/Applications`, `/private`, `/usr`, `/bin`, `/sbin`
  — lines 157–162.
- Folder chooser is the Mac's own, via `osascript` — 127–130.
- `setup-code.txt` at 461–470; clipboard via `pbcopy` at 473.
- Login item: `~/Library/LaunchAgents/ca.mcclevarty.sharing-tab.plist`, `RunAtLoad`, opening the
  share page in Chrome or Edge — 234–269. **No password needed for this part** (no `sudo` in
  `install_login_item`).
- Sleep: `sudo pmset -c sleep 0` — line 281, announced first at 273, skipped with a note if `sudo`
  is refused (284–285). Display still sleeps (282). Laptop lid left alone (289–294).
- `--undo` removes symlinks, marker and the plist (300–327) and **does not revert `pmset`**.
- **No browser policy step exists on macOS** — confirmed by reading the whole file. My copy says so
  explicitly rather than letting a Mac reader assume the Windows behaviour.
- `sudo` appears at exactly two lines, 280 and 281 — confirmed by grep.

**Linux script** (`scripts/linux-share-setup.sh`)

- Refuses non-Linux (64–68) and hard-refuses on a Raspberry Pi, naming `pi-setup.sh` (73–77).
- `~/Shared` (44), marker (170–177), symlinks (191).
- Refuses `$HOME`, `/`, `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/proc`, `/sys`, `/dev` — 150–154.
- `zenity` chooser when present, typed paths when not, which is what makes it work over SSH —
  116–142.
- Clipboard via `wl-copy`, `xclip` or `xsel`, in that order — 102–107. **Correctly hedged as "if one
  is installed"**; the function returns 1 when none is.
- Autostart at `${XDG_CONFIG_HOME:-$HOME/.config}/autostart/mcclevarty-sharing-tab.desktop`,
  opening Chrome, Chromium, Chromium-browser or Edge — 203, 217, 229–237.
- Idle suspend: GNOME's `sleep-inactive-ac-type` set to `'nothing'` — 245–248, with an honest
  fallback message when GNOME's power settings are absent (250–251). Laptop lid left alone
  (254–257).
- `--undo` removes symlinks, marker and the autostart file (263–287) and **does not revert
  `gsettings`**.
- **"It never asks for sudo. Not once."** — verified by grep: no `sudo` anywhere in the file.

**The site side** (what happens next, and the privacy claims)

- Paste box labelled "Ran the setup script?", placeholder `VS1.`, button "Read the list" —
  `src/components/SharePage.tsx:625–642`.
- Checklist rows show label and path, button reads "Choose folder", becomes "added" —
  `SharePage.tsx:676–697`. **A row is marked done because a drive with that label exists**, not
  because the component said so (comment at 560–563), which is why my copy can say "work down the
  list" without qualification.
- **"It never leaves your browser."** `applyCode` decodes locally and calls
  `shareStore.savePlan(decoded)` — `SharePage.tsx:598` → `src/share/store.ts:100`, which is an
  `indexedDB` put. **No API call carries the plan.** Checked the whole component.
- **"The only thing this site is told is the name you gave each folder."**
  `api.driveAdd(machineId, label)` posts `{ machineId, label }` and nothing else —
  `src/auth/api.ts:252–253`. Corroborated by the site's own copy at `SharePage.tsx:510–511`: *"The
  folder's location stays on this machine — the site never learns it."*
- **"Close it and sharing stops."** Verbatim behaviour stated at `SharePage.tsx:541–542`, which also
  supplies "the site never sees the folder, its path, or a single file byte".
- **"The browser may ask you to allow access again, which is one click each."** Verified: the drive
  rows render an "Allow access" or "Re-attach" button per drive depending on attach state —
  `SharePage.tsx:478–494`. Hedged as "may" deliberately, because which state a drive lands in is not
  something the copy can promise.
- Labels shortened to 40 characters and de-duplicated as "Documents 2" — Windows 633–639, macOS
  395–404, Linux 354–361; `MAX_LABEL = 40` at `src/share/setupCode.ts:31`.
- The machine name is asked rather than read off the computer, because computer names have people's
  names in them — Windows 656–659, macOS 421–424, Linux 379–382. My copy uses the scripts' own
  reasoning.

### C. Claims inside jokes — audited as claims

- *"nobody is going to email you in eleven months about a plan that has been upgraded for your
  convenience"* — a claim about **this** mechanism, and true: no server-side storage is involved in
  phase S and no account or subscription is created by any of these scripts. It names no company.
  It would become a claim about the locker if that copy is ever merged with this page — **the
  locker is operator-enabled storage (`SPEC-SHARING.md:93–97`) and this sentence must not travel
  onto a page that offers it.**
- *"That is Microsoft protecting you from files exactly like this one"* — true, and deliberately
  conceded rather than mocked. Windows opens `.ps1` in Notepad by default and that is a security
  default, which is the launcher's own stated reason for existing (`launch.bat:4–6`).
- *"a laptop that never sleeps in a bag gets very hot"* — the scripts' own reasoning, stated three
  times (Windows 497–509, macOS 289–294, Linux 254–257). Not invented for the page.
- *"finding that out in a bag is a bad way to find it out"* — the only line on the page that is
  purely mine and purely a joke. It makes no claim. Cut it first if the FAQ needs shortening.
- **No joke appears anywhere in section 2.** Checked deliberately: the safety block, the checksum
  list and the "somebody rang me" answer are flat throughout.

### D. What I did not write, and why

- **No "free diagnosis"-shaped promise.** Nothing on this page says what will happen if the setup
  fails, what it will cost to have it done for you, or that the operator will fix it. That form —
  a promise rebuilt without the retired words — is what the 2026-08-26 audit caught three times, so
  I have kept every sentence about outcomes off the page entirely.
- **No claim that the one-folder shortcut works** — see A8.
- **No count of how many people use this, how long it takes, or how reliable it is.** There is no
  source for any of those numbers.
- **No city, no name, no "we", no self-deprecation.** Checked against `CLAUDE.md`'s product
  decisions on a final read-through.
