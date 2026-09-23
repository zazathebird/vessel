# Pass 6 — Host Provisioning Scripts Audit

Scope reviewed in full: `scripts/thinkcentre-setup.sh` (2728 lines), `scripts/pi-setup.sh` (1166
lines), `scripts/plasma-dark-setup.sh` (1118 lines), `scripts/claude-code-setup.sh`,
`scripts/debian-basics.sh`, `scripts/linux-drive-report.sh`, `scripts/06-wifi-tools.sh`,
`scripts/launch.bat`. Read `CLAUDE.md` in full first, with particular attention to "The sharing
host — the invariants" and "The setup scripts — the invariants" sections. Skimmed
`docs/HOST-BUILD-LOG.md`, `docs/thinkcentre-sharing-host.md` and (partially, via grep)
`docs/pi-sharing-host.md` for what each script is claimed to do. Confirmed via `grep -li` over
`.audit/pass1-*.md`, `.audit/pass2-*.md`, `.audit/pass3-*.md` that none of the eight files in this
pass's scope were touched by earlier passes (the one hit, in `pass2-fx-setup.md`, is a passing
mention of `launch.bat` in the unrelated *customer-facing setup scripts* context, not this
machine-provisioning `launch.bat`... — actually it is the same `launch.bat`, but the mention is
one sentence confirming the checksum page's assertions, not an audit of the file). All seven shell
scripts pass `bash -n`. None of the scripts in this pass were executed — this is a read-only audit
of provisioning scripts that touch real hardware, root, and (per a note from a peer session) code
that has probably never run against the real ThinkCentre at all, which raises rather than lowers
the value of reading it by inspection.

Both `../debian-desktop/look-switcher.sh` and `capture-look.sh` (a separate, sibling repository,
per the 2026-09-14 split recorded in `CLAUDE.md`/`scripts/check.ts`) are explicitly out of scope
for this pass and were not read, per the coordinator's note. `scripts/plasma-dark-setup.sh` itself
stays in scope (and in this repo) because it pins the X11/SDDM session the kiosk depends on; only
the *switcher* moved out.

This is an unusually well-defended set of scripts — most of the "obvious" bug classes (unquoted
expansion causing word-splitting on spaces, `set -e`/`set -u` discipline, TOCTOU on writes, `A && B
|| C` traps, ufw-before-SSH-rule ordering, first-value-wins in sshd_config, Package-Blacklist
regex semantics, kiosk unit hardening, Docker port binding) are already handled and, in several
places, the code's own comments narrate a *previous* incarnation of the bug and how it was fixed.
Finding genuinely new problems required looking past the well-trodden ground for gaps the scripts'
own stated design principles don't actually reach.

## Verified correct (mechanism-by-mechanism against CLAUDE.md and the docs)

- **Hardware hard-refusal, both directions.** `pi-setup.sh` `preflight()` (line ~128) reads
  `/proc/device-tree/model`, strips the NUL terminator, and dies unless it contains `"Raspberry
  Pi"` — a real device-tree read, not a fake grep. `thinkcentre-setup.sh` `preflight()` (line
  ~494) does the mirror check and dies with a redirect to `pi-setup.sh` if it finds a Pi. Neither
  is a no-op check; both were traced end to end.
- **Never `--no-sandbox`, never `--user-data-dir`/`--incognito`.** Confirmed absent from the
  `exec chromium ...` invocation in all three launchers (`pi-setup.sh` line ~745,
  `thinkcentre-setup.sh` line ~1424) by reading every flag. Both launcher comments explicitly
  document *why not*, and `thinkcentre-setup.sh`'s systemd unit (line ~1475) carries a comment
  addressed to a future hardener naming the exact directives not to add
  (`NoNewPrivileges`/`PrivateUsers`/`ProtectHome`/a `SystemCallFilter`) and why (breaks Chromium's
  own sandbox, "fix" is `--no-sandbox`, strictly worse). No such directive is present in either
  kiosk unit.
- **`sudo docker`, never the `docker` group.** `thinkcentre-setup.sh` `install_pihole()` uses
  `sudo docker run ...` throughout; no `usermod -aG docker` anywhere in the file. The header
  comment and the printed summary both state this explicitly.
- **Every published Docker port names an address.** `install_pihole()` (line ~2352-2356) publishes
  `-p "${LAN_IP}:53:53/tcp"`, `-p "${LAN_IP}:53:53/udp"`, `-p "${admin_bind}:8080:80/tcp"` — never
  a bare `-p 53:53`. The function refuses to run at all (warns and returns) if `LAN_IP` could not
  be determined, rather than falling back to an unqualified publish. A `warn()` after the run
  explicitly explains why (Docker's own iptables rules are evaluated ahead of ufw's).
- **The firewall reads the SSH port from `sshd -T`, and refuses to enable itself if it can't.**
  `sshd_ports()` (line 2015) asks `sudo sshd -T`, unions in `ssh.socket`'s `ListenStream` for
  Debian-13-style socket activation, and — as of a fix the script's own comment narrates — has
  *no* `|| ports="22"` fallback; `configure_firewall()` (line 2079) `die`s if no port was found,
  specifically so ufw is never enabled blind. The `ufw status` check itself compares the *word*
  `active` rather than substring-matching (`"Status: active"` contains `"Status: inactive"`), which
  the comment says used to report a firewall as already on when it was off.
- **sshd hardening is verified against the daemon, not the file.** `harden_ssh()` re-runs `sudo
  sshd -T` after writing the drop-in and reload, and sets `SSHD_STATE` to a value describing
  disagreement if the daemon doesn't actually reflect `PermitRootLogin no` / `PasswordAuthentication
  no` — matching CLAUDE.md's "first value wins" warning and actually acting on it rather than
  trusting the write.
- **Chromium's unattended-upgrades exclusion plus its own timer, wired correctly.**
  `configure_unattended_upgrades()` (line 1791) writes `Unattended-Upgrade::Package-Blacklist {
  "chromium"; }` to `/etc/apt/apt.conf.d/52vessel-unattended-upgrades`; `Package-Blacklist` entries
  are matched by `unattended-upgrades` as Python regexes anchored at the start of the string
  (`re.match`), so the bare pattern `"chromium"` does cover `chromium-common`/`chromium-sandbox`/a
  Debian-derivative's `chromium-browser`, as the comment claims.
  `configure_chromium_update_timer()` writes `vessel-chromium-update.timer` with `OnCalendar=Sun
  *-*-* 04:00:00`, `RandomizedDelaySec=15m`, and **`Persistent=false`** (line 1983) — matching
  CLAUDE.md's claim exactly, with the comment correctly explaining why `Persistent=true` would be
  wrong here (a missed run firing at an arbitrary post-boot moment instead of waiting for next
  Sunday). The updater script only restarts the kiosk when `before != after` (dpkg version
  comparison), and `vessel-chromium-update.service` pins `Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin`
  specifically to defeat a `/usr/local/sbin`-planted `apt-get` — a real, non-obvious hardening
  detail that isn't mentioned in CLAUDE.md but is correct and well-reasoned.
- **The Chromium managed policy matches `DefaultFileSystemReadGuardSetting: 3` /
  `DefaultFileSystemWriteGuardSetting: 2` and the rest of the lockdown list**, in both
  `thinkcentre-setup.sh` (`configure_chromium_policy`, line 1617) and `pi-setup.sh`
  (`configure_chromium_policy`, line 902). Both validate the *scheme* and *host* of the
  (potentially hand-edited) URL file against closed character sets before interpolating them into
  the JSON, both `jq empty` the result before installing it, and both build the reported
  `POLICY_STATE` from what `place_root_file`/the write loop actually returned rather than from the
  attempt — each with an explicit comment narrating the prior bug (a scheme/host extracted by
  unvalidated string surgery could break out of the JSON string) and, in `thinkcentre-setup.sh`'s
  case, the prior bug where `POLICY_STATE` was appended unconditionally regardless of whether the
  write actually succeeded.
- **`place_root_file`/`place_user_file`'s three-way return convention (0 wrote, 1 already current,
  2 not written)** is honoured at every call site as `|| true` or inside an `if`, and both
  functions write to a temp file beside the destination and rename into place rather than
  truncating in place — and both re-read the destination back with `cmp` before declaring success,
  matching the "VERIFY THE EFFECT, DO NOT TRUST THE WRITE" comment at line 401.
- **The eighteen `--look` names in `plasma-dark-setup.sh` are a genuinely closed, internally
  consistent set.** Manually cross-checked the validator's two `case` arms (line 126-127, 18 names)
  against the error message's list (line 128) and the accent-selection `case` (line 141-158): all
  three agree, and `ubuntu` is correctly the one look with no accent entry. This matches what
  `scripts/check.ts`'s `"the desktop looks are one closed set"` gate (added 2026-09-14, reading
  `scripts/check.ts` lines 5854-5902) asserts mechanically.
- **`LOOK_FILES` in `plasma-dark-setup.sh`** (line 184-191, 8 entries) is exactly what
  `scripts/check.ts`'s parity gate (lines 5817-5842) slices out of the file and compares against
  the sibling repo's copy — confirmed the gate reads the same array this file actually declares,
  not a copy of its own.
- **`launch.bat` names PowerShell by its full path** (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`,
  line 49), not a bare `powershell.exe`, matching the 2026-09-07 audit-item-45 fix CLAUDE.md
  records, with the comment explaining why (Explorer double-click makes Downloads the CWD, and
  `cmd.exe` searches CWD before PATH).
- **Absolute-path-first Chromium lookup in the ThinkCentre launcher** (line 1360-1367): checks
  `/usr/bin/chromium` etc. by absolute path before falling back to `command -v`, specifically
  because `/usr/local/bin` (ahead of `/usr/bin` in the default `PATH`) is group-writable by
  `staff` on Debian. This is a real, non-obvious security detail not mentioned by name in
  CLAUDE.md's own list but consistent with its "root that trusts unsanitised input" theme and
  correctly implemented.

## Finding 1 — `--store`'s canonicalisation never resolves a symlinked ANCESTOR when the leaf doesn't exist yet, so `prepare_store()`'s `mkdir -p`/`chown`/`chmod` can land on an arbitrary directory

**File/line**: `scripts/thinkcentre-setup.sh`, `canon_store()` (lines 333-358), consumed by
`parse_args()` (line 296) and then acted on by `prepare_store()` (lines 642-670).

**Mechanism**: `canon_store()` is deliberately modelled on the "canonicalise first, fail closed"
lesson `CLAUDE.md` records at length for the three *customer-facing* setup scripts (`windows-`
`macos-`/`linux-share-setup.sh`), including the same three rules: refuse `..`, collapse a leading
`//`, and prefix-match rather than exact-match a blocklist. But its symlink resolution is
conditional on the *target already existing*:

```sh
canon_store() {
    local raw="$1" out="" part
    ...
    for part in ${raw}; do
        case "${part}" in
            ""|".") continue ;;
            "..")   set +f; return 1 ;;
            *)      out="${out}/${part}" ;;
        esac
    done
    ...
    if [ -d "${out}" ]; then
        out="$(cd -P "${out}" 2>/dev/null && pwd -P)" || return 1
        while [ "${out#//}" != "${out}" ]; do out="${out#/}"; done
    fi

    printf '%s' "${out}"
}
```

The `cd -P`/`pwd -P` symlink resolution — the *only* place in this function that can see through a
symlink — runs **only if `[ -d "${out}" ]`**, i.e. only when the *entire candidate path already
exists as a directory*. When the leaf component doesn't exist yet (the normal case for `--store`,
since the whole point of `prepare_store()` is to create a store that doesn't exist yet), the
function falls straight through to `printf '%s' "${out}"` and returns the **lexically-built, but
symlink-unresolved**, string. The blocklist that follows in `parse_args()` (lines 302-321) then
compares that unresolved string against `/etc`, `/usr`, `/var`, `/root`, etc. by prefix — but a
symlinked *ancestor* directory under, say, `$HOME` is invisible to a purely lexical comparison,
because its *name* (e.g. `/home/user/somelink`) doesn't match any blocked prefix even though its
*target* does.

`prepare_store()` then does, unconditionally:

```sh
if [ -d "${STORE_DIR}" ]; then
    skip "${STORE_DIR} exists"
else
    sudo mkdir -p "${STORE_DIR}"
    ...
fi
...
sudo chown "${USER}:${grp}" "${STORE_DIR}"
sudo chmod "${mode}" "${STORE_DIR}"
```

`mkdir -p`, `chown` and `chmod` all resolve symlinks in every path component except (for `chown`
with no `-h`, moot here since the leaf is a freshly-created real directory) the very last one — so
if any component of `${STORE_DIR}` is a symlink, the kernel transparently follows it while creating
and then chowning/chmoding the target underneath it.

**Concrete impact**: `ln -s /etc "$HOME/link"`, then `./scripts/thinkcentre-setup.sh
https://mcclevarty.ca/share --store "$HOME/link/newdir"`. `canon_store` receives
`/home/user/link/newdir`, which is not `..`, has no double slashes, and — critically — does **not
exist yet** (only `$HOME/link` exists; `newdir` under it does not), so `[ -d "${out}" ]` is false
and the `cd -P`/`pwd -P` resolution never runs. The unresolved string
`/home/user/link/newdir` is compared against the exact-match list (`/`, `/home`, `/root`, `/var`,
`/opt`, `/srv`, `/mnt`, `/media`, `/snap`, `/tmp` — none of which it equals) and the prefix-match
list (`/etc`, `/usr`, `/bin`, ... — none of which it is a prefix of, *as a string*). Both checks
pass. `prepare_store()` then runs `sudo mkdir -p /home/user/link/newdir`, which — because
`/home/user/link` is a symlink to `/etc` — actually creates `/etc/newdir`, then `sudo chown
user:user /home/user/link/newdir` and `sudo chmod 0750 /home/user/link/newdir`, both of which
resolve through the same symlink and land on `/etc/newdir`. The result is a new,
desktop-user-owned, mode-0750 directory inside `/etc`, created and owned by an unprivileged account
on a machine that autologins to that account's desktop — reachable either by an honest mistake (a
symlink left behind by some other tool under `$HOME`, followed unknowingly by tab-completion) or by
anyone who can plant a file under the operator's home directory before the script is (re-)run (a
lower bar than root, and exactly the class of actor the "canonicalise first, fail closed" lesson in
CLAUDE.md was written to defend against for the other three scripts). Note that the *identical*
attack against an *already-existing* leaf directory **is** caught correctly — `[ -d "${out}" ]`
would be true, `cd -P`/`pwd -P` would resolve to `/etc/newdir`, and the prefix-match against `/etc`
would correctly `die`. The gap is specific to the not-yet-created case, which is also the
overwhelmingly common one for a first run of this script.

**Severity**: Medium-High. Root-level file placement into an arbitrary directory (bounded by
whatever the operator's account can traverse and whatever symlink can be planted under `$HOME`
before/during a run), on a script whose entire threat model in this exact area (`--store`) is
explicitly "one bad value here is permanent and ends up in `sudo chown`." Not remotely exploitable
without local write access to something under the running user's `$HOME`, but the same is true of
the analogous, already-fixed bugs this script's own `canon_store` comment is explicitly modelled
on.

**Suggested check** (not implemented, per instructions not to fix): a gate that creates a symlink
under a throwaway `$HOME` pointing at a directory outside an allow-list, calls `--store
<symlink>/newdir` (leaf deliberately absent), and asserts the run refuses rather than proceeding —
mirroring the "gated by execution under a real shell against a throwaway home directory" pattern
`CLAUDE.md` describes for the equivalent Windows-junction and Unix-symlink fixes in the three
customer-facing setup scripts. A fix would need to resolve the *nearest existing ancestor* via
`cd -P`/`pwd -P` even when the full leaf doesn't exist, then re-append the non-existent tail
components lexically before running the blocklist comparison — the same shape `windows-share-setup.ps1`'s
"restarting the walk after each substitution" fix already uses for junctions.

## Finding 2 — `plasma-dark-setup.sh`'s `set_key()` silently no-ops the *entire* theming pass when `kwriteconfig6`/`5` are absent, contradicting its own warning message

**File/line**: `scripts/plasma-dark-setup.sh`, lines 372-380.

**Mechanism**:

```sh
KW=""
for c in kwriteconfig6 kwriteconfig5; do command -v "$c" >/dev/null 2>&1 && { KW="$c"; break; }; done
[ -n "${KW}" ] || warn "Neither kwriteconfig6 nor kwriteconfig5 is installed; writing config files directly."

set_key() {  # file group key value
    if [ -n "${KW}" ]; then
        "${KW}" --file "$1" --group "$2" --key "$3" "$4"
    fi
}
```

The warning explicitly promises a fallback — "writing config files directly" — but `set_key()` has
no such branch: when `${KW}` is empty, the function's body is just `if [ -n "" ]; then ...; fi`,
which does nothing at all and returns success. Every one of the roughly two dozen `set_key` calls
across the rest of the script (colour scheme, accent, icon theme, look-and-feel package, fonts,
`NightColor`, window-button placement, blur, translucency — everything in sections 3 and 5b) then
becomes a silent no-op. The script does not die, does not re-warn per call, and continues to print
`info "colour scheme: ${SCHEME}, accent ${ACCENT}"` and the rest of its success-shaped output,
because those `info` lines describe what the script *attempted*, not what `kwriteconfig` actually
wrote.

**Concrete impact**: reachable whenever `kwriteconfig6`/`kwriteconfig5` are not yet on the machine
— most plausibly on a `--no-install` re-run (a documented, real usage mode: "configure only,
install nothing") performed before the first successful install, or on any machine where the
`CORE` package set installed successfully but happened not to pull in a package providing
`kwriteconfig*` (the script assumes `kde-standard` provides it and never checks). The one warning
line at the top ("writing config files directly") is the only signal anything is wrong, and it
describes behaviour the script does not actually have — an operator reading it away from the
terminal, or scrolling past it in a wall of `apt` output, would see a run that otherwise completes
cleanly and reports the intended colour scheme/accent in its own summary, with a completely
untouched (light, default-Breeze) desktop underneath.

**Severity**: Medium. Cosmetic in outcome (a wrongly-themed desktop, not a security hole), but a
textbook instance of the exact failure class this codebase's own `CLAUDE.md` names as its whole
reason for existing ("does the thing it claims to do actually happen" vs. "looks right and
reports success").

**Suggested check**: a gate that runs the script (or a stubbed slice of it) with `kwriteconfig6`
and `kwriteconfig5` both absent from `PATH` and asserts either (a) the run refuses/dies rather than
continuing, or (b) the warning message is rewritten to say what actually happens ("theming will be
skipped entirely") rather than promising a fallback that isn't implemented.

## Finding 3 — `imagemagick` and `rsvg-convert` are never installed by this script (or any other in the repo), so the wallpaper subsystem — the mechanism the script's own comments say fixes a real shipped bug — silently does nothing on a fresh machine, for every look including the default

**File/line**: `scripts/plasma-dark-setup.sh`, lines 550-679 (the wallpaper section), cross-checked
against the package lists at lines 258-284.

**Mechanism**: Lines 550-569 carry an extensive, dated comment ("THE TRAP, measured 2026-09-12")
explaining that Qt's SVG renderer doesn't implement `prefers-color-scheme`, so Debian's dark
wallpaper SVGs must be pre-rendered to PNG with `rsvg-convert` before Plasma is pointed at them —
framed as the fix for a real, previously-shipped bug ("that is not a theory, it is what shipped on
this box on the first run"). Per-look branded wallpapers (`elementary`, `popos`, `endeavour`,
`kdeneon`, `manjaro`, `nitrux`, `xerolinux`, `archcraft`, `exodia`, `feren`, `deepin-exact` — 11 of
the 17 non-`ubuntu` looks) are drawn with ImageMagick gradients (`magick`/`convert`), and the
universal last-resort fallback (used by *every* look, including the default `ubuntu`, whenever
nothing else worked) is also drawn with ImageMagick (lines 660-679).

Neither `imagemagick` (which provides `magick`/`convert`) nor `librsvg2-bin` (which provides
`rsvg-convert`) is ever passed to `apt-get install` anywhere in this script:

```sh
CORE=(kde-standard sddm plasma-workspace-x11 systemsettings)
THEME=(kde-config-gtk-style breeze-gtk-theme qt5-style-kvantum qt5-style-kvantum-themes
       papirus-icon-theme plasma-workspace-wallpapers
       fonts-noto fonts-noto-color-emoji fonts-jetbrains-mono)
UBUNTUISH=(yaru-theme-icon yaru-theme-gtk fonts-ubuntu)
DEEPINISH=(deepin-icon-theme imagemagick)      # only reachable when LOOK is exactly "deepin"
```

`imagemagick` is present only inside `DEEPINISH`, which is only added to the install list when `[
"${LOOK}" = "deepin" ]` (see Finding 4). `rsvg-convert`/`librsvg2-bin` never appears anywhere in
this file, `thinkcentre-setup.sh`, `pi-setup.sh`, or `debian-basics.sh` (checked with `grep -rn
"rsvg\|librsvg"` across `scripts/`). Neither tool is a typical transitive dependency of
`kde-standard` or the `THEME` packages.

**Concrete impact**: on a genuinely fresh Debian netinst run through `debian-basics.sh` →
`plasma-dark-setup.sh` (the documented order in `docs/HOST-BUILD-LOG.md`), for the **default**
`--look ubuntu` and for any of the other 16 looks except `deepin`: `command -v rsvg-convert` and
`command -v magick`/`convert` both fail. The Debian-swirl-rendering branch (lines 624-633) is
skipped because its own `command -v rsvg-convert` guard fails; the per-look gradient branch
(lines 596-609) is skipped for the same reason with `magick`/`convert`; the final fallback-draw
branch (lines 660-679) also requires `magick`/`convert` and, finding neither, only prints `warn
"no rsvg-convert and no ImageMagick, so the wallpaper was left alone."` The extensive, carefully
tuned per-look wallpaper feature — described in the file's own header as answering "what the first
contact sheet of all fourteen looks showed" (that colour, more than layout, is what makes each
look actually read as itself) — is silently unavailable on every fresh install unless one of these
two packages happens to already be present for unrelated reasons.

**Severity**: Medium. Purely cosmetic (a design goal not met, not a security issue), but concrete
and easily reproducible, and it undermines a feature the script's own comments present as
load-bearing for the whole multi-look design, on the very hardware (a fresh netinst) the setup
scripts exist for.

**Suggested check**: add `imagemagick` (or at least the `magick`/`convert` binary) and
`librsvg2-bin` to `THEME` (unconditionally — every look's fallback path needs at least one of
them) rather than gating them behind `LOOK = deepin`, and a gate that asserts both tools are named
in some unconditional install list in the file.

## Finding 4 — `DEEPINISH`'s optional-package gate checks `LOOK = "deepin"` exactly, silently excluding `deepin-exact` even though it needs the same icon theme and the same drawing tool

**File/line**: `scripts/plasma-dark-setup.sh`, lines 274 and 279.

**Mechanism**:

```sh
DEEPINISH=(deepin-icon-theme imagemagick)
...
OPTIONAL=("${UBUNTUISH[@]}")
[ "${LOOK}" = "deepin" ] && OPTIONAL+=("${DEEPINISH[@]}")
```

`deepin-exact` (line 302: `CANDIDATES=(bloom bloom-classic Papirus breeze)`) also depends on the
`bloom`/`bloom-classic` icon set that only `deepin-icon-theme` provides, and (line 581:
`deepin-exact) GRAD_FROM="#F0468C"; GRAD_TO="#2FB6F0" ;;`) also draws its distinctive
magenta-to-cyan wallpaper gradient with the same ImageMagick tool `DEEPINISH` is meant to install.
The exact-string comparison `[ "${LOOK}" = "deepin" ]` is false for `LOOK=deepin-exact`, so running
`--look deepin-exact` on a fresh machine never installs either package via this path (though see
Finding 3 — `imagemagick` isn't reliably installed for *any* look, `deepin-exact` included).

**Concrete impact**: on `--look deepin-exact`, the icon candidate list silently falls through past
`bloom`/`bloom-classic` (neither installed) to `Papirus` or `breeze` — a visibly different, less
faithful icon set than the one the "built widget-for-widget off the reference screenshot" comment
at lines 898-908 claims to reproduce — with no warning that the intended icon theme was never
requested for installation in the first place (only the generic "not in this release's archive,
skipped" message that fires for packages that *were* requested but weren't found, which is a
different and misleading class of message for a package that was never asked for).

**Severity**: Low. Cosmetic degradation of one specific look, no security or stability impact.

**Suggested check**: `[ "${LOOK}" = "deepin" ] || [ "${LOOK}" = "deepin-exact" ] &&
OPTIONAL+=("${DEEPINISH[@]}")`, or fold `imagemagick` into the unconditional `THEME` list per
Finding 3 (which would incidentally fix this half of the gap too, leaving only the icon theme
still deepin-exact-blind).

## Finding 5 — `--accent`'s validation checks digit *count*, not value *range*, so `999,999,999` passes

**File/line**: `scripts/plasma-dark-setup.sh`, line 121.

**Mechanism**:

```sh
printf '%s' "${ACCENT}" | grep -Eq '^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$' || { echo "--accent must be R,G,B (0-255 each)" >&2; exit 1; }
```

The regex only enforces "1 to 3 digits per field," which admits any three-digit number, including
values above 255. The error message itself claims "0-255 each," which the check does not actually
enforce.

**Concrete impact**: `--accent 999,999,999` is accepted and written verbatim into `kdeglobals`'s
`AccentColor`/`LastUsedCustomAccentColor` keys. This is not a shell-injection risk (the value only
ever reaches `kwriteconfig`'s own argument, never a shell `eval` or SQL-like context), so the
impact is purely a malformed/undefined accent colour with no diagnostic pointing at the actual
cause — the script reports success ("colour scheme: ..., accent 999,999,999") either way.

**Severity**: Low. Cosmetic only.

**Suggested check**: extend the regex (or a follow-up numeric check) to bound each field to
0-255, e.g. matching against `(25[0-5]|2[0-4][0-9]|[01]?[0-9]{1,2})` three times, or an explicit
per-field `[ "$n" -le 255 ]` after splitting on commas.

## Finding 6 — The "font, only if it is actually installed" defensive pattern is applied to the Ubuntu display font but not to the JetBrains Mono monospace font, one line above the comment that explains why it should be

**File/line**: `scripts/plasma-dark-setup.sh`, lines 392 vs. 394-404.

**Mechanism**:

```sh
set_key kdeglobals General fixed "JetBrains Mono,10,-1,5,50,0,0,0,0,0"

# The font, only if it is actually installed — a named-but-absent font is how a
# desktop ends up rendering in the toolkit's last-resort fallback.
if fc-list 2>/dev/null | grep -qi 'Ubuntu-R\|Ubuntu Regular'; then
    for key in font menuFont toolBarFont smallestReadableFont; do
        set_key kdeglobals General "${key}" "Ubuntu,10,-1,5,50,0,0,0,0,0"
    done
    ...
fi
```

The `fixed` (monospace) key is written unconditionally, immediately above a comment that states —
correctly — the exact reason such keys should only be set when the font is confirmed present via
`fc-list`. `fonts-jetbrains-mono` is in the `THEME` array (line 264), whose installation failures
are only logged in aggregate ("some theming packages failed; continuing" at line 277) without
tracking which packages actually landed, so there is no guarantee it succeeded by the time
`set_key kdeglobals General fixed ...` runs.

**Concrete impact**: if `fonts-jetbrains-mono` fails to install (a renamed/dropped package on a
future Debian release, a transient apt failure that doesn't abort the whole `THEME` install per
line 277's `|| info "... continuing"`) while the rest of `THEME` succeeds, the desktop's monospace
font is named as "JetBrains Mono" in `kdeglobals` with the font itself absent, and Qt falls back to
its last-resort default for every monospaced surface — precisely the failure mode the comment two
lines below is written to describe, applied inconsistently within the same function.

**Severity**: Low. Same class and impact as Finding 3/4 — cosmetic, no security implication.

**Suggested check**: wrap the `fixed` key in the same `fc-list | grep -qi 'JetBrains'` pattern used
for Ubuntu, or track per-package install success from the `THEME` loop and gate on that instead of
re-deriving it from `fc-list` twice.

## Finding 7 — `pi-setup.sh`'s fallback to Debian's plain `chromium` package silently defeats the "Chromium is never auto-upgraded" invariant, with no corresponding adjustment to `configure_unattended_upgrades`

**File/line**: `scripts/pi-setup.sh`, `install_packages()` lines 296-310, and
`configure_unattended_upgrades()` lines 853-884.

**Mechanism**: `install_packages()` prefers Raspberry Pi OS's own `chromium-browser` package and
falls back to Debian's `chromium` with only a generic warning:

```sh
if pkg_exists chromium-browser; then
    browser_pkg="chromium-browser"
elif pkg_exists chromium; then
    browser_pkg="chromium"
    warn "Installing Debian's 'chromium' rather than Raspberry Pi OS's 'chromium-browser'.
         That is unexpected on a Pi image and worth understanding before you rely on it."
else
    die "Neither chromium-browser nor chromium is available from apt. Check your sources."
fi
```

`configure_unattended_upgrades()`'s entire justification for leaving Chromium updates
**unblocked** by `unattended-upgrades` (unlike `thinkcentre-setup.sh`, which explicitly
blacklists the package — see Verified Correct above) rests on this comment:

```
1. Debian's default allowed origin is ${distro_codename}-security. The Raspberry Pi archive
   is not in that list, so Pi-specific packages are not auto-upgraded.
```

That premise is true only when `browser_pkg = chromium-browser` (served from
`archive.raspberrypi.com`'s own origin, outside Debian's default `-security` allow-list). When the
fallback branch fires and `browser_pkg = chromium` (Debian's own package, served from the *same*
`bookworm-security` origin as everything else `unattended-upgrades` already patches), the premise
is false — but nothing in `configure_unattended_upgrades()` checks which package was actually
installed, and there is no `browser_pkg`-equivalent blacklist entry written anywhere in this
script the way `thinkcentre-setup.sh`'s `52vessel-unattended-upgrades` does. `browser_pkg` itself
is a local variable inside `install_packages()`, never exported or persisted, so
`configure_unattended_upgrades()` structurally cannot know which branch fired even if it wanted
to.

**Concrete impact**: on any Pi image where `chromium-browser` is unavailable (a
Debian-derivative image on Pi hardware — the exact scenario the warning names as "unexpected" but
explicitly still supports rather than refusing) and Debian's `chromium` is installed instead,
`unattended-upgrades` — enabled unconditionally by this same function a few lines later — **will**
auto-upgrade Chromium, replacing the running binary under the kiosk "at 6am on a day nobody chose,
possibly mid-transfer," which is verbatim the failure `docs/HOST-BUILD-LOG.md` item 4 asks whether
this script prevents ("`pi-setup.sh` says it cannot happen and that is unverified") and
`thinkcentre-setup.sh`'s parallel mechanism is built specifically to prevent. The one existing
warning only says the fallback is "unexpected... worth understanding," never that it silently
reopens the specific auto-upgrade hole `pi-setup.sh`'s own design elsewhere assumes is closed.

**Severity**: Medium. Narrow trigger condition (Debian-derivative-on-Pi-hardware, or a future
Raspberry Pi OS release dropping the `chromium-browser` package name), but a real, silent
contradiction between what the script's design document claims ("Chromium updates on this machine
should be a deliberate act") and what actually happens on its own documented fallback path, with no
warning naming the specific consequence.

**Severity note**: this is the open question `docs/HOST-BUILD-LOG.md` item 4 already flags as
unverified — this finding identifies the concrete code path that makes the answer "no, it is not
guaranteed" rather than merely "unverified."

**Suggested check** (not implemented): have `install_packages()` persist `browser_pkg` (e.g. to a
file under `${CONFIG_DIR}`, mirroring how `KIOSK_URL` is persisted) and have
`configure_unattended_upgrades()` write a `Package-Blacklist` entry for it whenever `browser_pkg =
chromium` (the Debian-origin package), matching `thinkcentre-setup.sh`'s mechanism exactly; a gate
could assert that whichever of `chromium`/`chromium-browser` a run actually selects, that same name
appears in a written blacklist file, or that the script warns specifically about the auto-upgrade
consequence rather than only about the package-name surprise.

## Finding 8 — `sshd_ports()`'s final fallback parses only `/etc/ssh/sshd_config`, ignoring `sshd_config.d/*.conf` drop-ins, contradicting the script's own "ask the daemon, never parse the file" principle

**File/line**: `scripts/thinkcentre-setup.sh`, `sshd_ports()`, lines 2015-2046, specifically line
2036.

**Mechanism**: the function's primary path asks `sudo sshd -T` (line 2020) and unions in
`ssh.socket`'s `ListenStream` for socket-activated sshd (lines 2026-2033) — both of which are
authoritative, "ask the daemon" answers, consistent with the file's own repeatedly-stated
philosophy (this exact rationale is quoted in `CLAUDE.md`: "It reads the port from `sshd -T`...
because in sshd the first value wins"). Only when *both* of those produce nothing does it fall
back to:

```sh
if [ -z "${ports}" ]; then
    ports="$(sudo awk '/^[[:space:]]*Port[[:space:]]+[0-9]+/{print $2}' /etc/ssh/sshd_config 2>/dev/null || true)"
fi
```

This reads only the single file `/etc/ssh/sshd_config` and never the files under
`/etc/ssh/sshd_config.d/*.conf` that the same script's `harden_ssh()` (a few hundred lines later)
itself writes a drop-in into, and that `harden_ssh()` explicitly checks the main file `Include`s
(line 2210) precisely because a value set in a drop-in can be the one that actually wins under
first-value-wins semantics if the `Include` line sits above a conflicting later value, or simply
because the drop-in is the *only* place a custom `Port` was ever set.

**Concrete impact**: reachable only when `sudo sshd -T` fails outright (a config the daemon itself
cannot parse) **and** `ssh.socket` is not active — a narrow, degraded-state combination, but
exactly the state in which trusting a partial, non-drop-in-aware read is riskiest: if the true
port is set via a drop-in (which this script's own `harden_ssh()` uses) and the main file has no
explicit `Port` line at all, this fallback returns nothing (`ports=""`), which the caller correctly
treats as "could not determine" and `die`s rather than defaulting to 22 — so the current *outcome*
of this gap is fail-closed, not fail-open, given the code's `NO || ports="22" FALLBACK` design one
line below. The residual risk is the narrower one: if the main file *does* have some Port-looking
line (even a stale, commented-out-looking one that the naive regex still matches, since the regex
has no comment-awareness) while the real port is set in a drop-in, the fallback could report a
**wrong but non-empty** port, which `configure_firewall()` would then treat as authoritative and
open in ufw instead of the port sshd is actually listening on — the exact "carrying it to a
monitor" failure the surrounding comments are otherwise scrupulous about avoiding.

**Severity**: Low. The trigger condition (both `sshd -T` and `ssh.socket` probes failing) is
narrow, and the regex has no comment-stripping so a `#Port 2222` line would still be read as `Port
2222` in the fallback with no distinction from an active setting — worth noting alongside the main
gap. This is best read as an inconsistency with the file's own stated design principle rather than
a live, easily-triggered vulnerability.

**Suggested check**: extend the fallback to also scan `/etc/ssh/sshd_config.d/*.conf` (respecting
`Include` order) or, more simply, treat a failure of `sudo sshd -T` as itself fatal for
`configure_firewall()` (skip the raw-file fallback entirely) — the same conclusion the "no `||
ports=22`" fix already reached for the *simpler* failure mode.

## Other observations, not rising to findings

- `scripts/linux-drive-report.sh` (read-only diagnostic, no root, no writes): the "Largest
  directories under $HOME" section runs `timeout 60 du -h --max-depth=1 "$HOME" | sort -rh | head
  -15 || printf ' (skipped — took longer than a minute)\n'`. Because the script sets `pipefail`
  (`set -uo pipefail`, no `-e`), the pipeline's exit status is the *rightmost* non-zero exit among
  `du`/`sort`/`head` — and `sort`/`head` will normally still exit 0 even when `du` was killed by
  `timeout` (exit 124) and only produced partial output, so the "skipped" message is effectively
  unreachable in the timeout case; the report just silently shows a truncated listing instead of
  saying so. Not a finding on its own (this script only reports, changes nothing, and the failure
  mode is "prints slightly misleading status text" in a tool whose own header says "paste this
  back and I will work out the share layout from it" — a human is expected to sanity-check the
  output either way), but worth naming since it's the one place in this pass where a stated
  fallback message is not actually reachable, echoing Finding 2's shape at much lower stakes.
- `scripts/pi-setup.sh` and `scripts/thinkcentre-setup.sh` both wait "five minutes" (per their log
  messages) for the kiosk URL to answer before giving up and starting Chromium anyway — 60
  attempts of `curl --max-time 5` (or 10 for the watchdog) followed by `sleep 5`. In the worst
  case (every attempt genuinely times out rather than failing fast) this is closer to ten minutes
  (60 × (5s timeout + 5s sleep)) than the five the log message states. Cosmetic; does not change
  behaviour, only the accuracy of an informational log line.
- `scripts/claude-code-setup.sh` downloads Anthropic's installer to a file and prints its SHA-256
  before running it, which is exactly what its own comment claims ("prints its checksum so you can
  compare it against another download") — correctly implemented, not a finding, but noted because
  it is the one place in this pass's scope that downloads and executes code from the network, and
  it was checked specifically for that reason.
- `scripts/06-wifi-tools.sh` and `scripts/debian-basics.sh` are general-purpose admin tooling
  (Wi-Fi diagnostics, base package installation) with no hardware-detection, kiosk, firewall,
  Docker, or SSH-hardening logic in scope for this pass's brief; read in full, nothing rising to a
  finding. `debian-basics.sh`'s PATH-append and package-install-with-fallback logic is
  straightforward and correctly idempotent (checked with `grep -qs` before appending to
  `.bashrc`/`.zshrc`).

## Summary

Eight findings, none of them in the "obvious" bug classes this pass was specifically asked to hunt
for (unquoted word-splitting, ufw-before-sshd-rule ordering, docker-group shortcuts, unbound Docker
ports, kiosk-unit hardening, `--no-sandbox`) — every one of those was checked and found genuinely,
carefully handled, several with the exact fix narrated in-line as a comment. The two most
significant findings are novel structural gaps rather than reused bug shapes:

- **Finding 1** (Medium-High): `thinkcentre-setup.sh`'s `--store` canonicalisation only resolves
  symlinks when the full target path already exists, so a symlinked ancestor under `$HOME` combined
  with a not-yet-created leaf (the normal first-run case) bypasses the blocklist entirely, and the
  later `mkdir -p`/`chown`/`chmod` follow that symlink for real — the same failure class CLAUDE.md
  documents as already having bitten the *customer-facing* setup scripts three times, reappearing
  in a fourth, previously-unaudited script.
- **Finding 7** (Medium): `pi-setup.sh`'s documented, real fallback to Debian's `chromium` package
  silently reopens the "Chromium auto-upgrades under a running kiosk" hole its own design assumes
  is closed, with no code-level safeguard tracking which package was actually installed — this is
  the concrete mechanism behind the open question `docs/HOST-BUILD-LOG.md` already flags as
  unverified.

Findings 2, 3, 4, 5, 6 and 8 are all lower-severity (cosmetic desktop theming, or a narrow-trigger
inconsistency in an already-defended fallback path) but share one thread worth naming as a pattern:
several of `plasma-dark-setup.sh`'s defensive comments ("the font, only if it is actually
installed," "writing config files directly," the wallpaper brightness/rendering guard) describe a
correct principle that is either not applied consistently within the same file (Finding 6) or not
actually implemented at all for the case it claims to cover (Findings 2 and 3) — the file
*states* the lesson this codebase's `CLAUDE.md` repeats constantly ("does the thing it claims to
do actually happen") without, in these specific spots, actually living up to it.

Given a peer session's note that `thinkcentre-setup.sh` has likely never run against real
hardware, none of these findings — Finding 1 above all — have been validated by execution; they
are derived entirely from reading the shell against its own stated invariants and against how
`mkdir -p`/`chown`/`sshd -T`/`Package-Blacklist`/`apt-cache show` are documented to behave.
