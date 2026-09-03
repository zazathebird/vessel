#!/usr/bin/env bash
#
# Set this Mac up to share folders with mcclevarty.ca.
#
# WHAT THIS IS
# ------------
# The sharing happens in your browser, not in this script. A web page cannot be
# handed a folder by anything except you clicking "Select" — that is deliberate
# in how browsers work, and it is why this needs no installer and no signed
# application. So this script cannot share anything on its own and does not try.
#
# What it does is everything around that click: collects the folders you choose,
# puts links to them in one place, prints a setup code so the website can show
# them to you as a checklist, and — optionally — keeps the sharing tab open
# across restarts.
#
# READ IT BEFORE YOU RUN IT. If somebody telephoned you and asked you to run
# this, hang up and ring back on a number you found yourself. The download page
# publishes this script's source and its checksum for exactly that reason.
#
# USAGE
#   bash macos-share-setup.sh [options]
#
#   --folders "/a/b:/c/d"   Skip the chooser; colon-separated paths.
#   --share-root PATH       Where the links go. Default: ~/Shared
#   --keep-running          Also add a login item and stop the Mac sleeping.
#   --no-links              Collect the list without making links.
#   --undo                  Remove what this script created.
#   --dry-run               Say what would happen, change nothing.
#
# SPEC-SHARING.md section 4 is the design this implements.

set -euo pipefail

SITE_ORIGIN="https://mcclevarty.ca"
SHARE_PAGE="${SITE_ORIGIN}/share"
AGENT_LABEL="ca.mcclevarty.sharing-tab"
MARKER=".mcclevarty-share-root"
# Where the pre-setup AC sleep value (minutes) is kept so --undo can put it
# back. Deliberately NOT in $SHARE_ROOT — undo empties that.
SLEEP_STATE="$HOME/Library/Application Support/mcclevarty-share.sleep-was"

SHARE_ROOT="${HOME}/Shared"
KEEP_RUNNING=0
NO_LINKS=0
UNDO=0
DRY_RUN=0
FOLDERS_ARG=""
MANUAL=()

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
# EVERY human-facing line goes to stderr, and that is load-bearing rather than
# tidy. `choose_folders` returns the chosen paths on STDOUT and the caller reads
# it with `while read ... < <(choose_folders)`. While these wrote to stdout, the
# function's own instructions and its "Added: ..." confirmations were read back
# in as if they were folder paths — every interactive run told the customer
# their folders did not exist, and on a Linux box with no zenity the prompt
# concatenated onto the typed path and nothing survived at all.
#
# Stdout now carries exactly three things: the path list from `choose_folders`,
# the setup code, and `--help`. Anything else added here uses stderr.
step() { printf '\n==> %s\n' "$1" >&2; }
note() { printf '    %s\n' "$1" >&2; }
good() { printf '    %s\n' "$1" >&2; }
warn() { printf '    %s\n' "$1" >&2; }
fail() { printf '    %s\n' "$1" >&2; }
manual() { MANUAL+=("$1"); }
run() { if [ "$DRY_RUN" -eq 1 ]; then note "would: $*"; else "$@"; fi; }

# ---------------------------------------------------------------------------
# Refuse to run anywhere it does not belong.
#
# pi-setup.sh and thinkcentre-setup.sh each hard-refuse on the other's
# hardware, for the reason that applies here too: half-working on the wrong
# machine is worse than not running, because the person then has to work out
# which half they got.
# ---------------------------------------------------------------------------
assert_macos() {
    if [ "$(uname -s)" != "Darwin" ]; then
        fail "This is the macOS script and this is not a Mac ($(uname -s))."
        fail "There are Windows and Linux versions on the same download page."
        exit 1
    fi

    local major
    major="$(sw_vers -productVersion | cut -d. -f1)"
    if [ "$major" -lt 11 ] 2>/dev/null; then
        fail "This needs macOS 11 or later. Chrome's folder-sharing API is not"
        fail "available on older versions, so the website could not use the"
        fail "folders even if this script prepared them."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# JSON and the setup code.
#
# Written by hand rather than with a JSON tool, because this is a wire format
# the website's decoder refuses when it is malformed, and `jq` is not installed
# on a stock Mac. Twenty lines is cheaper than a dependency the person has to
# be talked through installing over the telephone.
# ---------------------------------------------------------------------------
json_string() {
    # Control characters are STRIPPED, never escaped (2026-09-02). The site's
    # decoder refuses a label or path carrying one either way, so escaping only
    # moved the refusal to the paste box — after the links were already made.
    # Unlike Windows, this filesystem genuinely allows a newline in a folder
    # name, and the stripped form is the only one a person can recognise in the
    # checklist the label exists for.
    LC_ALL=C awk 'BEGIN{
        s = ARGV[1]; out = "\""
        for (i = 1; i <= length(s); i++) {
            c = substr(s, i, 1)
            if (c == "\"") out = out "\\\""
            else if (c == "\\") out = out "\\\\"
            else if (c < " " || c == "\177") continue
            else out = out c
        }
        print out "\""
        exit
    }' "$1"
}

base64url() {
    # -w0 is GNU; BSD base64 on macOS wraps only if asked, so neither flag.
    base64 | tr -d '\n' | tr '+/' '-_' | tr -d '='
}
# ---------------------------------------------------------------------------
# The folder picker.
#
# This function was CALLED and never DEFINED (found 2026-09-03). The call at the
# bottom of the script is `done < <(choose_folders)`, so on a stock Mac every run
# without `--folders` printed `choose_folders: command not found`, selected
# nothing, and exited with "No folders chosen, so there is nothing to do."  The
# interactive path — the normal one, the one the runbook tells people to use —
# has never worked on macOS. Linux has had its copy at `choose_folders` all
# along; only this file was missing it.
#
# `osascript` rather than zenity: `choose folder` is AppleScript's own picker,
# present on every stock Mac, so there is nothing to install. Cancel makes
# osascript exit non-zero with "User canceled", which is the loop's exit — hence
# `set +e` around it, exactly as the Linux copy does around zenity.
#
# STDOUT IS A DATA CHANNEL AND CARRIES ONLY PATHS. Every prompt, every "Added:"
# line and every warning goes to stderr through `note`/`good`/`warn`, because
# the caller reads this function with `while read < <(choose_folders)`. This is
# the 2026-09-02 lesson recorded at the top of this file: while the chrome went
# to stdout it was read back as folder paths, and every interactive run told the
# customer their folders did not exist.
#
# `POSIX path of` returns a trailing slash on a directory. It is stripped, but
# never off `/` itself — emptying that entry is what let the filesystem root
# reach the blocklist as "" and be reported as a missing folder rather than
# refused by name.
#
# NOT TESTED ON A MAC. There is no macOS here; this mirrors the Linux copy's
# structure and uses only documented AppleScript. It replaces a path that was
# certainly broken with one that should work, and it wants a real run before the
# next bundle is published.
# ---------------------------------------------------------------------------
choose_folders() {
    local chosen=()

    if command -v osascript >/dev/null 2>&1; then
        note "A folder chooser will open. Pick a folder, then another, and so on."
        note "Press Cancel when you have chosen them all."
        while true; do
            local picked
            set +e
            picked="$(osascript -e 'POSIX path of (choose folder with prompt "Choose a folder to share (Cancel when finished)")' 2>/dev/null)"
            local rc=$?
            set -e
            # Cancel is a non-zero exit, not an empty string. Test both: a
            # future osascript that returns empty on cancel must also end here.
            [ $rc -ne 0 ] && break
            [ -z "$picked" ] && break
            [ "$picked" = "/" ] || picked="${picked%/}"
            chosen+=("$picked")
            good "Added: $picked"
        done
    else
        note "No graphical folder chooser found."
        note "Type one folder path per line. An empty line finishes."
        while true; do
            printf '  folder: ' >&2
            local line
            read -r line || break
            [ -z "$line" ] && break
            [ "$line" = "/" ] || line="${line%/}"
            if [ ! -d "$line" ]; then warn "Not a folder: $line"; continue; fi
            chosen+=("$line")
            good "Added: $line"
        done
    fi

    printf '%s\n' ${chosen+"${chosen[@]}"}
}

# ---------------------------------------------------------------------------
# THE BLOCKLIST. This is a security control, not a convenience check.
#
# It used to say "Refuse what the browser will refuse", and that framing was
# wrong in the one case it exists for. Chrome refuses these folders as a PICK.
# A symlink to one of them INSIDE a picked folder is read normally — that is
# crbug 40061477, Chrome's stated position is that evading the blocklist is not
# a security bug, and this script actively recommends picking the share root as
# a single folder. So there is nothing downstream. This function is the only
# barrier, and a miss here is not caught by anything.
#
# Three faults it had, each with a working exploit, all fixed below:
#   1. Exact string equality on the RAW path, so `/home/user//`, `/home/./user`,
#      `//home/user` and `/home/user/../user` all walked past it.
#   2. No symlink resolution at all, so a link to a blocked directory passed
#      because `[ -d ]` follows links while the comparison did not.
#   3. `$HOME` was blocked but none of its children, so `~/.ssh`, `~/.gnupg`,
#      `~/.aws`, `~/.config` and `~/Library` were all shareable — precisely the
#      directories Chrome blocks with block-all-children semantics. The script
#      was opening what Chrome deliberately closed.
#
# `canon` uses `cd -P` + `pwd -P`, which is POSIX, present on every stock macOS,
# and resolves symlinks, `.`, `..`, doubled and leading slashes in one step.
# It FAILS CLOSED: a path that cannot be resolved is refused, never compared
# raw. `readlink -f` is deliberately not used — BSD readlink has no `-f`, and a
# silent failure there would reintroduce fault 2 on exactly one platform.
# ---------------------------------------------------------------------------
canon() {
    local p
    p="$( cd -P -- "$1" 2>/dev/null && pwd -P )" || return 1
    # POSIX lets an implementation treat a leading `//` as special, and bash's
    # `pwd -P` PRESERVES it — so `//home/user` canonicalised to `//home/user`
    # and compared unequal to `/home/user`, walking straight past the blocklist.
    # Measured, not theorised. Collapse it; on Linux and macOS they are the
    # same directory.
    while [ "${p#//}" != "$p" ]; do p="${p#/}"; done
    printf '%s' "$p"
}

# Compared case-insensitively on Darwin, whose filesystem is case-insensitive by
# default — `/users/bob` reaches `/Users/bob` and a case-sensitive test does not.
fold_case() {
    if [ "$(uname -s)" = "Darwin" ]; then
        printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
    else
        printf '%s' "$1"
    fi
}

# ARRAYS, NOT SPACE-DELIMITED STRINGS. These were one string each, consumed
# unquoted so that `for bad in $BLOCK_EXACT` would split them — which means a
# home directory containing a space, a tab or a newline shatters every
# $HOME-derived entry into fragments that match nothing. Measured with
# HOME="/Users/bob smith": $HOME, ~/.ssh, ~/.gnupg and ~/.config were ALL
# allowed, which is the whole hole this list was written to close on
# 2026-08-27 — and an account name with a space in it is ordinary on macOS, so
# this is the likelier machine, not the exotic one. The
# `# shellcheck disable=SC2086` that used to sit here is what suppressed the
# warning; it is gone with the strings.
#
# Refused outright, but their children are fine. A home directory is the case:
# you may share `~/Documents`, you may not share `~`.
BLOCK_EXACT=(
    /
    "$HOME"
    /Users /Volumes /System /Library /Applications /private /usr /bin /sbin /etc /var /tmp /opt
    /cores /Network /System/Volumes /System/Volumes/Data
)

# Refused along with everything underneath them.
#
# A blocked directory whose ANCESTOR is shareable is not blocked at all: nothing
# downstream catches the miss, because Chrome blocks these as "do not pick",
# never "do not read". `$HOME/.local/share/keyrings` was the case — refused,
# sitting inside a shareable `$HOME/.local`. Block the ancestor.
BLOCK_PREFIX=(
    /System /private/var /private/etc
    "$HOME/Library"         # keychains, browser profiles, application support
    "$HOME/.ssh" "$HOME/.gnupg" "$HOME/.aws" "$HOME/.config" "$HOME/.mozilla"
    "$HOME/.local"          # holds share/keyrings
    "$HOME/.pki"            # NSS databases
    "$HOME/.docker"         # registry credentials
    "$HOME/.kube"           # cluster credentials
    "$HOME/.password-store" # pass(1)
)

# Both lists, for anything that wants to print or test them.
blocked_exact() { printf '%s\n' "${BLOCK_EXACT[@]}"; }
blocked_prefix() { printf '%s\n' "${BLOCK_PREFIX[@]}"; }

# Prints one line: `OK <path>` with the canonical path it approved, or `NO
# <message>` (which may run to a second line) with the refusal.
#
# THE APPROVED PATH IS RETURNED RATHER THAN DISCARDED, and the caller links that
# one. This used to canonicalise into a local, check it, throw it away, and let
# the caller link the path as typed — so `~/mydocs -> ~/Documents` passed, the
# link recorded `~/mydocs`, and repointing that symlink at `~/.ssh` afterwards
# put id_rsa under the share root. The identity checked and the identity shared
# were simply different, permanently; it was never a race.
check_folder() {
    local path="$1" c f b bad bf

    [ -d "$path" ] || { echo "NO That folder does not exist: $path"; return; }

    if [ ${#path} -gt 400 ]; then
        echo "NO That folder's path is too long to share (${#path} characters, limit 400): $path"
        return
    fi

    # Fail closed. An unresolvable path is refused, never compared raw.
    c="$(canon "$path")" || {
        echo "NO Could not work out where that folder really is, so it will not be shared: $path"
        return
    }
    f="$(fold_case "$c")"

    for bad in "${BLOCK_EXACT[@]}"; do
        [ -n "$bad" ] || continue
        # `${bad%/}` strips a trailing slash, and for the entry `/` that leaves the EMPTY STRING —
        # so the filesystem root compared `"/" = ""` and was never blocked by the one list that
        # names it. Nothing downstream caught it either: no prefix entry matches `/`, and the
        # share-root containment test below builds `"$f"/*`, which for `f=/` is `//*` and needs
        # two leading slashes. Do not let the strip empty an entry.
        b="${bad%/}"; [ -n "$b" ] || b="/"
        if [ "$f" = "$(fold_case "$b")" ]; then
            echo "NO That folder holds far more than you mean to share, so it will not be linked: $c
      Share the folders inside it instead."
            return
        fi
    done

    for bf in "${BLOCK_PREFIX[@]}"; do
        [ -n "$bf" ] || continue
        b="${bf%/}"; [ -n "$b" ] || b="/"
        case "$f/" in
            "$(fold_case "$b")"/*)
                echo "NO That folder is inside somewhere private and will not be shared: $c
      It holds credentials or system files, not documents."
                return
                ;;
        esac
    done

    # A folder that CONTAINS the share root makes the links recursive, and the
    # default share root lives inside the home directory, so this is reachable.
    case "$(fold_case "$SHARE_ROOT")/" in
        "$f"/*)
            echo "NO That folder contains the share folder itself, which would nest without end: $c"
            return
            ;;
    esac

    echo "OK $c"
}

# ---------------------------------------------------------------------------
# The share root and its links
# ---------------------------------------------------------------------------
init_share_root() {
    if [ ! -d "$SHARE_ROOT" ]; then
        run mkdir -p "$SHARE_ROOT"
        good "Created $SHARE_ROOT"
    else
        note "Using the existing folder $SHARE_ROOT"
    fi

    # A marker, so --undo can tell a folder this script made from one that
    # happens to be called Shared and belongs to somebody.
    if [ ! -f "$SHARE_ROOT/$MARKER" ] && [ "$DRY_RUN" -eq 0 ]; then
        cat > "$SHARE_ROOT/$MARKER" <<'MARKEREOF'
This folder was set up by the mcclevarty.ca sharing script.
The entries in it are links to folders elsewhere on this Mac; deleting a link
here does not delete the folder it points at. Run the script with --undo to
remove them and this file.
MARKEREOF
    fi
}

make_link() {
    local target="$1" label="$2"
    local link="$SHARE_ROOT/$label"

    if [ -L "$link" ]; then
        note "Link already there: $label"
        return 0
    fi
    if [ -e "$link" ]; then
        warn "Something that is not a link is already called '$label'; skipping it."
        manual "A file or folder called '$label' was already in $SHARE_ROOT, so no link was made for $target."
        return 0
    fi

    if run ln -s "$target" "$link"; then
        good "Linked $label -> $target"
    else
        warn "Could not link $label"
        manual "Could not create a link for $target. It is still on the checklist, so add it in the browser directly."
    fi
}

# ---------------------------------------------------------------------------
# Keeping it running
# ---------------------------------------------------------------------------
browser_path() {
    for candidate in \
        "/Applications/Google Chrome.app" \
        "$HOME/Applications/Google Chrome.app" \
        "/Applications/Microsoft Edge.app" \
        "$HOME/Applications/Microsoft Edge.app"
    do
        [ -d "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
    done
    return 1
}

install_login_item() {
    local browser
    if ! browser="$(browser_path)"; then
        manual "No Chrome or Edge was found, so no login item was created. Install one and re-run, or open $SHARE_PAGE yourself after each restart."
        warn "No Chrome or Edge found; skipping the login item."
        return
    fi

    local plist="$HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"
    note "Login item: $plist"

    # WHICH PROFILE. The folder handles live in one browser profile, not in the
    # browser. Opening the page in another profile gets a page that has never
    # heard of this Mac — which the site treats as a routine "pair this
    # machine" rather than an error, but the person has to work out why.
    manual "The login item opens whichever browser profile was last used. If you keep more than one, make sure the sharing tab ends up in the one holding your folders."

    if [ "$DRY_RUN" -eq 1 ]; then
        note "would write $plist"
        return
    fi

    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>${browser}</string>
    <string>${SHARE_PAGE}</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLISTEOF

    launchctl unload "$plist" 2>/dev/null || true
    launchctl load "$plist" 2>/dev/null || true
    good "The sharing tab will open when you log in."
}

disable_sleep() {
    # `pmset -c` needs administrator, and this is asked for rather than assumed.
    note "Stopping the Mac sleeping on mains power needs your password."
    if [ "$DRY_RUN" -eq 1 ]; then
        note "would: sudo pmset -c sleep 0"
        return
    fi

    if sudo -v 2>/dev/null; then
        # Record what the AC sleep value was BEFORE the first change, so --undo
        # can restore it (2026-09-02). Only the first run records: a re-run
        # would otherwise overwrite the real value with our own 0.
        if [ ! -f "$SLEEP_STATE" ]; then
            local was
            was="$(pmset -g custom 2>/dev/null | awk '/AC Power/{ac=1} ac && $1=="sleep"{print $2; exit}')"
            case "$was" in
                *[!0-9]*|"") : ;; # unparseable — record nothing, restore nothing
                *) printf '%s\n' "$was" > "$SLEEP_STATE" ;;
            esac
        fi
        sudo pmset -c sleep 0 || manual "Could not change the sleep setting. System Settings > Lock Screen."
        good "This Mac will not sleep while plugged in. The display still sleeps."
    else
        manual "Sleep settings were not changed. If this Mac sleeps, sharing stops until it wakes: System Settings > Lock Screen."
        warn "Skipped the sleep setting (no administrator password given)."
    fi

    # Closing the lid is a different thing from going idle, and this script
    # deliberately does not touch it: a MacBook that never sleeps in a bag gets
    # very hot, and somebody who shuts a lid expects sleep.
    if pmset -g batt 2>/dev/null | grep -q "InternalBattery"; then
        warn "This is a laptop. Closing the lid still sleeps it, and sharing stops"
        warn "while it sleeps — that is left alone on purpose."
    fi
}

# ---------------------------------------------------------------------------
# Undo
# ---------------------------------------------------------------------------
do_undo() {
    step "Removing what this script created"

    if [ -f "$SHARE_ROOT/$MARKER" ]; then
        for entry in "$SHARE_ROOT"/*; do
            [ -L "$entry" ] || continue
            # Remove the link, never what it points at. `rm` on a symlink does
            # the right thing; `rm -r` on one with a trailing slash does not.
            run rm "$entry"
            good "Removed the link $(basename "$entry") (the folder it pointed at is untouched)"
        done
        # The saved code file is this script's litter, same as the links.
        if [ -f "$SHARE_ROOT/setup-code.txt" ]; then
            run rm -f "$SHARE_ROOT/setup-code.txt"
            good "Removed setup-code.txt."
        fi
        run rm -f "$SHARE_ROOT/$MARKER"
        note "Left $SHARE_ROOT itself in place, in case you put something in it."
    else
        warn "$SHARE_ROOT has no marker file, so this script did not create it. Leaving it alone."
    fi

    local plist="$HOME/Library/LaunchAgents/${AGENT_LABEL}.plist"
    if [ -f "$plist" ]; then
        launchctl unload "$plist" 2>/dev/null || true
        run rm -f "$plist"
        good "Removed the login item."
    fi

    # Put the AC sleep setting back the way it was found, if setup changed it.
    if [ -f "$SLEEP_STATE" ]; then
        local was
        was="$(cat "$SLEEP_STATE")"
        case "$was" in
            *[!0-9]*|"")
                warn "The saved sleep value in $SLEEP_STATE is unreadable; not restoring it." ;;
            *)
                if [ "$DRY_RUN" -eq 1 ]; then
                    note "would: sudo pmset -c sleep $was"
                elif sudo -v 2>/dev/null && sudo pmset -c sleep "$was"; then
                    rm -f "$SLEEP_STATE"
                    good "Sleep on mains restored to what it was before setup ($was minutes)."
                else
                    warn "Could not restore the sleep setting (needs your password)."
                    warn "Its old value ($was minutes) stays saved; run --undo again, or set it in System Settings > Lock Screen."
                fi ;;
        esac
    fi

    note ""
    note "The folders on the website are NOT removed by this. Remove them there,"
    note "on $SHARE_PAGE, which is the only place that can."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
    # Under `set -u` a missing option value made `$2` an unbound variable and
    # the script died with a shell error rather than a sentence.
    case "$1" in
        --folders|--share-root)
            [ $# -ge 2 ] || { fail "$1 needs a value."; exit 1; } ;;&
    esac
    case "$1" in
        --folders)     FOLDERS_ARG="$2"; shift 2 ;;
        --share-root)  SHARE_ROOT="$2"; shift 2 ;;
        --keep-running) KEEP_RUNNING=1; shift ;;
        --no-links)    NO_LINKS=1; shift ;;
        --undo)        UNDO=1; shift ;;
        --dry-run)     DRY_RUN=1; shift ;;
        -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
        *)             fail "Unknown option: $1"; exit 1 ;;
    esac
done

assert_macos

printf '\n  Sharing setup for mcclevarty.ca\n' >&2
printf '  ------------------------------\n' >&2

if [ "$UNDO" -eq 1 ]; then
    do_undo
    if [ -n "${MANUAL+x}" ]; then
        step "Things this script could not do"
        for item in "${MANUAL[@]}"; do warn "* $item"; done
    fi
    exit 0
fi

note ""
note "This prepares folders on this Mac. It does not send any file anywhere,"
note "and it cannot: only you can hand a folder to the browser, by choosing it"
note "when the website asks."
note ""
note "Share folder:  $SHARE_ROOT"
if [ "$KEEP_RUNNING" -eq 1 ]; then
    note "Keep running:  yes — login item, no sleep on mains"
else
    note "Keep running:  no (add --keep-running for that)"
fi

step "Choosing folders"

SELECTED=()
if [ -n "$FOLDERS_ARG" ]; then
    OLDIFS="$IFS"; IFS=":"
    for p in $FOLDERS_ARG; do
        [ -n "$p" ] || continue
        # Do not let the trailing-slash strip empty the entry. `/` became "" here
        # and was then reported as "That folder does not exist: ", so the one
        # path the blocklist most needs to refuse by name never reached it.
        [ "$p" = "/" ] || p="${p%/}"
        SELECTED+=("$p")
    done
    IFS="$OLDIFS"
else
    while IFS= read -r line; do
        [ -n "$line" ] && SELECTED+=("$line")
    done < <(choose_folders)
fi

if [ -z "${SELECTED+x}" ]; then
    warn "No folders chosen, so there is nothing to do."
    exit 0
fi

LABELS=()
PATHS=()
for path in "${SELECTED[@]}"; do
    verdict="$(check_folder "$path")"
    case "$verdict" in
        "OK "*) path="${verdict#OK }" ;;
        *)      fail "${verdict#NO }"; continue ;;
    esac

    # Two aliases of one folder canonicalise to the same place now, and two rows
    # for one folder is a row somebody ticks twice on the checklist.
    dup=0
    for seen in ${PATHS+"${PATHS[@]}"}; do
        if [ "$seen" = "$path" ]; then dup=1; break; fi
    done
    if [ "$dup" -eq 1 ]; then note "Already on the list: $path"; continue; fi

    # The label comes off the canonical path too, so it names the folder that is
    # actually shared rather than the alias that was typed.
    label="$(basename "$path")"
    [ -z "$label" ] && label="Folder"
    # Bash substring, not `cut -c`: GNU cut counts BYTES and can sever a UTF-8
    # pair mid-character, while BSD cut counts characters and can exceed the
    # decoder's 40 UTF-16 units on astral characters. This is identical on both
    # platforms and on bash 3.2.
    label="${label:0:40}"

    # De-duplicate labels; two folders called Documents is ordinary.
    base="$label"; n=2
    # `-e` is required, not decoration: a folder called "-Photos" made grep read
    # the label as an option, exit 2, and silently stop de-duplicating — so two
    # folders shared one label, one link was skipped, and the code advertised
    # both. The 2>/dev/null that used to be here hid exactly that.
    while printf '%s\n' ${LABELS+"${LABELS[@]}"} | grep -Fxq -e "$label"; do
        label="$base $n"; n=$((n + 1))
    done

    LABELS+=("$label")
    PATHS+=("$path")
done

if [ -z "${LABELS+x}" ]; then
    fail "None of the folders chosen can be shared. Nothing was changed."
    exit 1
fi

if [ ${#LABELS[@]} -gt 24 ]; then
    warn "That is more than 24 folders, which is as many as one setup code carries."
    warn "Only the first 24 are included; run the script again for the rest."
    LABELS=("${LABELS[@]:0:24}")
    PATHS=("${PATHS[@]:0:24}")
fi

step "Naming this Mac"
note "This is asked rather than taken from the computer, because the name is"
note "visible to anyone you later share a folder with, and computer names tend"
note "to have people's names in them."
MACHINE_NAME=""
if [ -z "$FOLDERS_ARG" ] && [ -t 0 ]; then
    printf '  A name for this Mac (Enter to decide on the website): '
    read -r MACHINE_NAME || MACHINE_NAME=""
    MACHINE_NAME="${MACHINE_NAME:0:40}"
fi

if [ "$NO_LINKS" -eq 0 ]; then
    step "Putting links in one folder"
    init_share_root
    i=0
    while [ $i -lt ${#LABELS[@]} ]; do
        make_link "${PATHS[$i]}" "${LABELS[$i]}"
        i=$((i + 1))
    done
fi

if [ "$KEEP_RUNNING" -eq 1 ]; then
    step "Keeping it running"
    install_login_item
    disable_sleep
fi

step "Your setup code"

JSON='{"n":'"$(json_string "$MACHINE_NAME")"',"f":['
i=0
while [ $i -lt ${#LABELS[@]} ]; do
    [ $i -gt 0 ] && JSON="${JSON},"
    JSON="${JSON}{\"l\":$(json_string "${LABELS[$i]}"),\"p\":$(json_string "${PATHS[$i]}")}"
    i=$((i + 1))
done
JSON="${JSON}]}"

CODE="VS1.$(printf '%s' "$JSON" | base64url)"

CODE_FILE="$SHARE_ROOT/setup-code.txt"
if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$SHARE_ROOT"
    {
        printf 'Paste this into the box on %s\n\n' "$SHARE_PAGE"
        printf '%s\n\n' "$CODE"
        printf 'It lists the folders you chose. It is not a password and it opens\n'
        printf 'nothing: you still have to pick each folder in the browser yourself.\n'
    } > "$CODE_FILE"
fi

printf '\n%s\n\n' "$CODE"
if printf '%s' "$CODE" | pbcopy 2>/dev/null; then
    good "Copied to your clipboard."
fi
note "Also saved to $CODE_FILE"

step "What to do now"
note "1. Open $SHARE_PAGE and sign in."
note "2. Paste the code into the setup box (Command-V)."
note "3. It will list your folders. Click each one and choose it in the picker."
if [ "$NO_LINKS" -eq 0 ]; then
    note ""
    note "   Worth a try first: choose $SHARE_ROOT itself as a single folder. If"
    note "   your browser follows the links this script made, that shares"
    note "   everything in one go. If it does not, nothing is harmed - use the"
    note "   list above instead."
fi
note "4. Leave that tab open. It is what serves the files."
note ""
note "Nothing is shared with anybody else until you say so on the website."

if [ -n "${MANUAL+x}" ]; then
    step "Things this script could not do"
    for item in "${MANUAL[@]}"; do warn "* $item"; done
fi
