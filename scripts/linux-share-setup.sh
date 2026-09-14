#!/usr/bin/env bash
#
# Set this Linux desktop up to share folders with mcclevarty.ca.
#
# WHAT THIS IS
# ------------
# The sharing happens in your browser, not in this script. A web page cannot be
# handed a folder by anything except you choosing it in the picker — that is
# deliberate in how browsers work, and it is why this needs no installer and no
# signed binary. So this script cannot share anything on its own, and does not
# try to.
#
# What it does is everything around that click: collects the folders you choose,
# puts symlinks to them in one place, prints a setup code so the website can
# show them to you as a checklist, and — optionally — reopens the sharing tab
# when you log in.
#
# THIS IS THE DESKTOP SCRIPT. For an always-on appliance that shares without
# anybody sitting at it, use scripts/pi-setup.sh or scripts/thinkcentre-setup.sh
# instead; those build a kiosk host and are a different job.
#
# READ IT BEFORE YOU RUN IT. If somebody telephoned you and asked you to run
# this, hang up and ring back on a number you found yourself.
#
# USAGE
#   bash linux-share-setup.sh [options]
#
#   --folders "/a/b:/c/d"   Skip the chooser; colon-separated paths.
#   --share-root PATH       Where the links go. Default: ~/Shared
#   --keep-running          Also add an autostart entry and stop idle suspend.
#   --no-links              Collect the list without making links.
#   --undo                  Remove what this script created.
#   --dry-run               Say what would happen, change nothing.
#
# SPEC-SHARING.md section 4 is the design this implements.

set -euo pipefail

SITE_ORIGIN="https://mcclevarty.ca"
SHARE_PAGE="${SITE_ORIGIN}/share"
AUTOSTART_NAME="mcclevarty-sharing-tab.desktop"
MARKER=".mcclevarty-share-root"
# Where the pre-setup idle-suspend value is kept so --undo can put it back.
# Deliberately NOT in $SHARE_ROOT: undo empties that, and losing the note and
# the thing it restores in the same breath is the failure this file prevents.
SLEEP_STATE="${XDG_CONFIG_HOME:-$HOME/.config}/mcclevarty-share.sleep-was"

SHARE_ROOT="${HOME}/Shared"
KEEP_RUNNING=0
NO_LINKS=0
UNDO=0
DRY_RUN=0
FOLDERS_ARG=""
MANUAL=()

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
# Refuse to run anywhere it does not belong (the pi/thinkcentre rule).
# ---------------------------------------------------------------------------
assert_linux_desktop() {
    if [ "$(uname -s)" != "Linux" ]; then
        fail "This is the Linux script and this is not Linux ($(uname -s))."
        fail "There are Windows and macOS versions on the same download page."
        exit 1
    fi

    # A Pi gets the appliance script, which does a much more thorough job on
    # exactly this hardware. Running the desktop script there is the
    # half-working outcome both scripts exist to prevent.
    if [ -f /proc/device-tree/model ] && grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
        fail "This is a Raspberry Pi. Use scripts/pi-setup.sh, which sets up a"
        fail "proper always-on sharing host rather than a desktop login item."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# JSON and the setup code — hand-rolled, so there is no `jq` to install.
# ---------------------------------------------------------------------------
json_string() {
    # Control characters are STRIPPED here, and since 2026-09-14 nothing can
    # reach this with one: `text_offense` below refuses the folder — by name,
    # before any link is made — and the machine name is screened the same way.
    # The strip stays as a last ditch so a future caller cannot put a raw
    # control byte into a wire format, NOT as the answer to one. The answer is
    # to refuse, because a stripped PATH is a different path (see the
    # `text_offense` comment) and a stripped label is a label the person's
    # script did not write.
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

# No `-w0` and no fallback. The old form was `base64 -w0 || base64 | tr -d`,
# and the fallback could never work: if `-w0` fails it has already consumed
# stdin, so the second call read an exhausted pipe and produced an empty code
# the script then told the customer to paste. This form is correct on GNU and
# BSD alike.
base64url() { base64 | tr -d '\n'; }

# ---------------------------------------------------------------------------
# WHAT THE SITE WILL REFUSE, ASKED HERE INSTEAD OF AT THE PASTE BOX.
#
# `decodeSetupCode` refuses a code whose label or path carries a character that
# can lie about what it says — every format character, private use, the lone
# surrogates, the default-ignorables and variation selectors, and every space
# that is not U+0020 — and it refuses the WHOLE code, not the row. Until
# 2026-09-14 these scripts checked for C0 and DEL and nothing else, so an
# ordinary folder was enough to produce an unusable code: measured, `Family
# <emoji ZWJ sequence>` (the joiner is a format character) and `Photos<NBSP>2024`
# both made every link, printed a code, and were refused at the paste box with
# the links already on the disk.
#
# The decoder's own comment is the argument for doing it here: refusing a
# presentation selector "would refuse the WHOLE code over one honest folder, on
# the happy path". That is exactly what these two were. So the folder is named
# and refused BEFORE anything is linked, and the customer is told to rename it —
# which is the only fix — rather than finding out on the website.
#
# `text_probe` is one awk program with four modes, and it decodes UTF-8 to code
# points by hand under LC_ALL=C because a byte-counting `length()` cannot answer
# any of these questions:
#
#   offense  the first character the site will refuse, or nothing. Swept
#            against the real regex over all 1,114,112 code points: it refuses
#            NOTHING the decoder accepts (an over-refusal here would be a folder
#            somebody cannot share), and the only thing it misses is `\p{Cn}`,
#            the unassigned and noncharacter code points, which no shell can
#            know about. Those still land at the paste box; everything that
#            comes off a real folder name lands here.
#   len      the length the decoder measures, in UTF-16 units. `${#s}` counts
#            characters, so 40 emoji is 40 to bash and 80 to the site — over the
#            label ceiling, and refused whole.
#   cut      truncate to N UTF-16 units without splitting a character.
#   fold     `foldLabel`'s comparison form, for the duplicate test below.
#
# Two things the fold cannot do in a shell and the decoder does: NFKC, and
# lower-casing outside ASCII. A composed and a decomposed spelling of the same
# name therefore still collide at the paste box rather than here. Everything
# else in that function — the invisibles, the Cyrillic and Greek look-alikes,
# case, `l/I/1/|`, `O/0`, runs of whitespace — is reproduced.
# ---------------------------------------------------------------------------
text_probe() {
    LC_ALL=C awk '
    function ignorable(cp) {
        # Default_Ignorable_Code_Point + Variation_Selector, as ranges. The
        # decoder strips exactly these before its duplicate test.
        return (cp == 173 || cp == 847 || cp == 1564 || cp == 1757 || cp == 1807 || cp == 2274 ||
                (cp >= 1536 && cp <= 1541) || (cp >= 2192 && cp <= 2193) ||
                (cp >= 4447 && cp <= 4448) || (cp >= 6068 && cp <= 6069) ||
                (cp >= 6155 && cp <= 6159) || (cp >= 8203 && cp <= 8207) ||
                (cp >= 8234 && cp <= 8238) || (cp >= 8288 && cp <= 8292) ||
                (cp >= 8294 && cp <= 8303) || cp == 10240 || cp == 12644 ||
                (cp >= 65024 && cp <= 65039) || cp == 65279 || cp == 65440 ||
                (cp >= 65520 && cp <= 65531) || cp == 69821 || cp == 69837 ||
                (cp >= 78896 && cp <= 78911) || (cp >= 113824 && cp <= 113827) ||
                (cp >= 119155 && cp <= 119162) || (cp >= 917504 && cp <= 921599))
    }
    function why(cp) {
        if (cp < 32 || cp == 127 || (cp >= 128 && cp <= 159) || cp == 8232 || cp == 8233)
            return "a line break or control character"
        if (cp == 160 || cp == 5760 || (cp >= 8192 && cp <= 8202) || cp == 8239 ||
            cp == 8287 || cp == 12288)
            return "a space that is not the ordinary space"
        if ((cp >= 55296 && cp <= 57343) || (cp >= 57344 && cp <= 63743) ||
            (cp >= 983040 && cp <= 1048573) || (cp >= 1048576 && cp <= 1114109))
            return "a character no font can be relied on to draw"
        # U+FE0E and U+FE0F are the carve-out the decoder makes and this must
        # make too: they are the emoji presentation selectors, and "Photos
        # <heart><FE0F>" is a folder somebody has, not an attack.
        if (ignorable(cp) && cp != 65038 && cp != 65039)
            return "an invisible character"
        return ""
    }
    BEGIN {
        for (i = 0; i < 256; i++) ord[sprintf("%c", i)] = i
        # CONFUSABLES, mapped straight to lower case because the fold lowers
        # afterwards anyway. Cyrillic, Greek and the small capitals whose glyph
        # IS the Latin letter.
        n = split("1072 a 1077 e 1086 o 1088 p 1089 c 1091 y 1093 x 1110 i 1112 j 1109 s \
                   1211 h 1281 d 1307 q 1309 w 1141 v 1040 a 1042 b 1045 e 1050 k 1052 m \
                   1053 h 1054 o 1056 p 1057 c 1058 t 1061 x 1029 s 1030 i 1032 j 1198 y \
                   1140 v 959 o 953 i 957 v 961 p 965 u 913 a 914 b 917 e 918 z 919 h \
                   921 i 922 k 924 m 925 n 927 o 929 p 932 t 933 y 935 x 305 i 567 j \
                   609 g 593 a 7424 a 628 n 618 i 665 b 7428 c 7429 d 7431 e 668 h \
                   7434 j 7435 k 671 l 7437 m 7439 o 7448 p 640 r 7451 t 7452 u 7456 v \
                   7457 w 655 y 7458 z", t, /[ \t\n]+/)
        for (i = 1; i < n; i += 2) same[t[i] + 0] = t[i + 1]

        mode = ARGV[1]; max = ARGV[2] + 0; s = ARGV[3]
        bytes = length(s); i = 1; u16 = 0; out = ""
        while (i <= bytes) {
            b = ord[substr(s, i, 1)]
            if (b < 128) { cp = b; w = 1 }
            else if (b >= 194 && b <= 223) { cp = b - 192; w = 2 }
            else if (b >= 224 && b <= 239) { cp = b - 224; w = 3 }
            else if (b >= 240 && b <= 244) { cp = b - 240; w = 4 }
            else { if (mode == "offense") print "a byte that is not valid text"; exit }
            for (k = 1; k < w; k++) {
                c = ord[substr(s, i + k, 1)]
                if (i + k > bytes || c < 128 || c > 191) {
                    if (mode == "offense") print "a byte that is not valid text"
                    exit
                }
                cp = cp * 64 + (c - 128)
            }
            wide = (cp > 65535) ? 2 : 1
            if (mode == "cut" && u16 + wide > max) break
            u16 += wide
            if (mode == "offense") {
                r = why(cp)
                if (r != "") { printf "%s (character %d)\n", r, u16; exit }
            } else if (mode == "cut") {
                out = out substr(s, i, w)
            } else if (mode == "fold" && !ignorable(cp)) {
                if (cp in same) out = out same[cp]
                else if (cp < 128) out = out tolower(sprintf("%c", cp))
                # A code point with no Latin twin still has to stay ITSELF, and
                # \001 cannot appear in anything that got past `offense`.
                else out = out sprintf("\001%d\001", cp)
            }
            i += w
        }
        if (mode == "len") print u16
        if (mode == "cut") printf "%s", out
        if (mode == "fold") {
            gsub(/[il|]/, "1", out); gsub(/o/, "0", out)
            gsub(/[ \t\n\r\f\v]+/, " ", out)
            sub(/^ /, "", out); sub(/ $/, "", out)
            print out
        }
    }' "$1" "$2" "$3"
}

text_offense() { text_probe offense 0 "$1"; }
text_len()     { text_probe len 0 "$1"; }
text_cut()     { text_probe cut "$1" "$2"; }
fold_label()   { text_probe fold 0 "$1"; }

copy_to_clipboard() {
    if command -v wl-copy >/dev/null 2>&1; then printf '%s' "$1" | wl-copy && return 0; fi
    if command -v xclip  >/dev/null 2>&1; then printf '%s' "$1" | xclip -selection clipboard && return 0; fi
    if command -v xsel   >/dev/null 2>&1; then printf '%s' "$1" | xsel --clipboard --input && return 0; fi
    return 1
}

# ---------------------------------------------------------------------------
# Choosing folders. A graphical picker where there is one, typed paths where
# there is not — this script has to work over SSH on a headless box too.
# ---------------------------------------------------------------------------
choose_folders() {
    local chosen=()

    if command -v zenity >/dev/null 2>&1; then
        note "A folder chooser will open. Pick a folder, then another, and so on."
        note "Press Cancel when you have chosen them all."
        while true; do
            local picked
            set +e
            picked="$(zenity --file-selection --directory \
                --title="Choose a folder to share (Cancel when finished)" 2>/dev/null)"
            set -e
            [ -z "$picked" ] && break
            [ "$picked" = "/" ] || picked="${picked%/}"
            chosen+=("$picked")
            good "Added: $picked"
        done
    else
        note "No graphical folder chooser found (install zenity for one)."
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
# HOME="/home/bob smith": $HOME, ~/.ssh, ~/.gnupg and ~/.config were ALL
# allowed, which is the whole hole this list was written to close on
# 2026-08-27. Account names with spaces are ordinary on macOS. The
# `# shellcheck disable=SC2086` that used to sit here is what suppressed the
# warning; it is gone with the strings.
#
# Refused outright, but their children are fine. A home directory is the case:
# you may share `~/Documents`, you may not share `~`.
BLOCK_EXACT=(
    /
    "$HOME"
    /home /root /etc /usr /bin /sbin /lib /boot /proc /sys /dev /var /tmp /opt /srv /run
)

# Refused along with everything underneath them.
#
# A blocked directory whose ANCESTOR is shareable is not blocked at all: nothing
# downstream catches the miss, because Chrome blocks these as "do not pick",
# never "do not read". `$HOME/.local/share/keyrings` was the case — the GNOME
# keyring, refused, sitting inside a shareable `$HOME/.local`. Block the
# ancestor.
BLOCK_PREFIX=(
    /etc /proc /sys /dev /boot
    "$HOME/.ssh" "$HOME/.gnupg" "$HOME/.aws" "$HOME/.config" "$HOME/.mozilla"
    "$HOME/.local"          # holds share/keyrings — the GNOME keyring
    "$HOME/.var"            # Flatpak app data: a browser profile here holds session cookies
    "$HOME/.pki"            # NSS databases
    "$HOME/.docker"         # registry credentials
    "$HOME/.kube"           # cluster credentials
    "$HOME/.password-store" # pass(1)
    "$HOME/snap"
    "$HOME/.cache"          # Chrome blocks it whole; browser caches and tokens live here
    "$HOME/.dbus"           # session bus credentials
    "$HOME/.thunderbird"    # mail, saved passwords (logins.json + key4.db)
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
    local path="$1" c f b cb bp bad bf

    [ -d "$path" ] || { echo "NO That folder does not exist: $path"; return; }

    # Fail closed. An unresolvable path is refused, never compared raw.
    c="$(canon "$path")" || {
        echo "NO Could not work out where that folder really is, so it will not be shared: $path"
        return
    }
    f="$(fold_case "$c")"

    # THE LENGTH IS MEASURED ON THE CANONICAL PATH, WHICH IS THE ONE THAT GOES
    # IN THE CODE. It used to be measured on the path as TYPED, before the line
    # above — so a three-character path through a symlink measured 3, passed,
    # and was emitted at its real 532 characters, over the decoder's ceiling of
    # 400, refusing the whole code after every link had been made. Check the
    # identity that is actually shared, the same rule that made this function
    # return `c` rather than discard it.
    if [ ${#c} -gt 400 ]; then
        echo "NO That folder's real path is too long to share (${#c} characters, limit 400): $c"
        return
    fi

    for bad in "${BLOCK_EXACT[@]}"; do
        [ -n "$bad" ] || continue
        # `${bad%/}` strips a trailing slash, and for the entry `/` that leaves the EMPTY STRING —
        # so the filesystem root compared `"/" = ""` and was never blocked by the one list that
        # names it. Nothing downstream caught it either: no prefix entry matches `/`, and the
        # share-root containment test below builds `"$f"/*`, which for `f=/` is `//*` and needs
        # two leading slashes. Do not let the strip empty an entry.
        b="${bad%/}"; [ -n "$b" ] || b="/"
        # AND THE ENTRY IS CANONICALISED TOO, NOT ONLY THE INPUT (2026-09-14).
        # Every $HOME-derived entry is written as the shell found $HOME, and the
        # input arrives from `canon`, with symlinks resolved — so the moment any
        # ancestor of $HOME is a symlink the two spellings differ and every one
        # of those entries matches nothing. Measured with HOME=.../homes/h/user
        # where `homes/h` is a link: both $HOME and $HOME/.ssh were ALLOWED,
        # with a real $HOME both correctly refused. Relocated, NAS-mounted and
        # /export/home layouts are all ordinary. On macOS it is the reason `/tmp`
        # — an entry somebody deliberately put in this list — had never blocked
        # anything: `/tmp` is a link to `private/tmp`, so no canonical input
        # could ever equal it.
        #
        # BOTH SPELLINGS ARE COMPARED, never one. An entry that cannot be
        # resolved — a directory that does not exist, or one this user may not
        # enter — keeps its raw form rather than dropping out of the list, so
        # this can only ever refuse more than it did, never less.
        cb="$(canon "$b" 2>/dev/null)" || cb=""
        if [ "$f" = "$(fold_case "$b")" ] || { [ -n "$cb" ] && [ "$f" = "$(fold_case "$cb")" ]; }; then
            echo "NO That folder holds far more than you mean to share, so it will not be linked: $c
      Share the folders inside it instead."
            return
        fi
    done

    for bf in "${BLOCK_PREFIX[@]}"; do
        [ -n "$bf" ] || continue
        b="${bf%/}"; [ -n "$b" ] || b="/"
        cb="$(canon "$b" 2>/dev/null)" || cb=""
        for bp in "$b" "$cb"; do
            [ -n "$bp" ] || continue
            case "$f/" in
                "$(fold_case "$bp")"/*)
                    echo "NO That folder is inside somewhere private and will not be shared: $c
      It holds credentials or system files, not documents."
                    return
                    ;;
            esac
        done
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

    if [ ! -f "$SHARE_ROOT/$MARKER" ] && [ "$DRY_RUN" -eq 0 ]; then
        cat > "$SHARE_ROOT/$MARKER" <<'MARKEREOF'
This folder was set up by the mcclevarty.ca sharing script.
The entries in it are symlinks to folders elsewhere on this machine; deleting a
link here does not delete the folder it points at. Run the script with --undo to
remove them and this file.
MARKEREOF
    fi
}

make_link() {
    local target="$1" label="$2"
    local link="$SHARE_ROOT/$label"

    if [ -L "$link" ]; then note "Link already there: $label"; return 0; fi
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
browser_command() {
    for candidate in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge; do
        command -v "$candidate" >/dev/null 2>&1 && { printf '%s\n' "$candidate"; return 0; }
    done
    return 1
}

install_autostart() {
    local browser
    if ! browser="$(browser_command)"; then
        manual "No Chrome, Chromium or Edge was found, so no autostart entry was created. Install one and re-run, or open $SHARE_PAGE yourself after each restart."
        warn "No Chromium-family browser found; skipping autostart."
        return
    fi

    local dir="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
    local file="$dir/$AUTOSTART_NAME"

    # WHICH PROFILE. The folder handles live in one browser profile, not in the
    # browser. Opening the page in another gets a page that has never heard of
    # this machine — handled by the site as a routine "pair this machine", but
    # confusing to somebody who thought they had already done it.
    manual "The autostart entry opens whichever browser profile was last used. If you keep more than one, make sure the sharing tab ends up in the one holding your folders."

    if [ "$DRY_RUN" -eq 1 ]; then note "would write $file"; return; fi

    mkdir -p "$dir"
    cat > "$file" <<DESKTOPEOF
[Desktop Entry]
Type=Application
Name=mcclevarty.ca sharing tab
Comment=Opens the page that shares your folders. Closing it stops sharing.
Exec=${browser} --new-window ${SHARE_PAGE}
X-GNOME-Autostart-enabled=true
Terminal=false
DESKTOPEOF
    good "The sharing tab will open when you log in."
}

disable_sleep() {
    # Only the GNOME setting is touched, and only the on-mains one. Masking
    # systemd's sleep targets would be a system-wide change on somebody's
    # desktop to solve a problem in one browser tab.
    if command -v gsettings >/dev/null 2>&1 && \
       gsettings writable org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type >/dev/null 2>&1; then
        # Record what the setting was BEFORE the first change, so --undo can
        # restore it (2026-09-02). Only the first run records: a re-run would
        # otherwise overwrite the real value with our own 'nothing'.
        if [ "$DRY_RUN" -eq 0 ] && [ ! -f "$SLEEP_STATE" ]; then
            mkdir -p "$(dirname "$SLEEP_STATE")"
            gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type > "$SLEEP_STATE" 2>/dev/null || rm -f "$SLEEP_STATE"
        fi
        run gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type "'nothing'"
        good "This machine will not suspend on idle while plugged in."
    else
        manual "Idle suspend was not changed (no GNOME power settings found). If this machine suspends, sharing stops until it wakes — turn off automatic suspend in your desktop's power settings."
        warn "Could not change the idle-suspend setting on this desktop."
    fi

    if [ -d /sys/class/power_supply ] && ls /sys/class/power_supply 2>/dev/null | grep -q "^BAT"; then
        warn "This is a laptop. Closing the lid still suspends it, and sharing stops"
        warn "while it is suspended — that is left alone on purpose."
    fi
}

# ---------------------------------------------------------------------------
# Undo
# ---------------------------------------------------------------------------
do_undo() {
    step "Removing what this script created"

    if [ -f "$SHARE_ROOT/$MARKER" ]; then
        # BOTH GLOBS. `*` does not match a dot-named entry, and the marker file
        # was removed below regardless — so a link called `.plexmediaserver`
        # survived --undo, the marker went with the run, and a second --undo
        # then refused to touch the folder at all ("no marker file, so this
        # script did not create it"). The link, and the sharing it enables, was
        # permanent. `.` and `..` are not symlinks and the marker is not a
        # symlink, so the test below already excludes all three.
        for entry in "$SHARE_ROOT"/* "$SHARE_ROOT"/.*; do
            [ -L "$entry" ] || continue
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

    local file="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/$AUTOSTART_NAME"
    if [ -f "$file" ]; then
        run rm -f "$file"
        good "Removed the autostart entry."
    fi

    # Put idle suspend back the way it was found, if a setup run changed it.
    if [ -f "$SLEEP_STATE" ]; then
        local was
        was="$(cat "$SLEEP_STATE")"
        if command -v gsettings >/dev/null 2>&1 && [ -n "$was" ]; then
            run gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type "$was"
            run rm -f "$SLEEP_STATE"
            good "Idle suspend restored to what it was before setup ($was)."
        else
            warn "Could not restore the idle-suspend setting; its old value is in $SLEEP_STATE."
        fi
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
        --folders)      FOLDERS_ARG="$2"; shift 2 ;;
        --share-root)   SHARE_ROOT="$2"; shift 2 ;;
        --keep-running) KEEP_RUNNING=1; shift ;;
        --no-links)     NO_LINKS=1; shift ;;
        --undo)         UNDO=1; shift ;;
        --dry-run)      DRY_RUN=1; shift ;;
        -h|--help)      sed -n '2,40p' "$0"; exit 0 ;;
        *)              fail "Unknown option: $1"; exit 1 ;;
    esac
done

assert_linux_desktop

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
note "This prepares folders on this machine. It does not send any file anywhere,"
note "and it cannot: only you can hand a folder to the browser."
note ""
note "Share folder:  $SHARE_ROOT"
if [ "$KEEP_RUNNING" -eq 1 ]; then
    note "Keep running:  yes — autostart entry, no idle suspend on mains"
else
    note "Keep running:  no (add --keep-running for that)"
fi

step "Choosing folders"

SELECTED=()
if [ -n "$FOLDERS_ARG" ]; then
    # `set -f` is load-bearing, not tidiness. IFS stops WORD splitting and does
    # nothing about PATHNAME expansion, so the unquoted expansion below globbed:
    # measured, `--folders "$HOME/Notes[1]"` with a sibling `Notes1` present
    # linked and advertised `$HOME/Notes1` — a different folder, with no warning
    # — and `--folders "$HOME/*"` linked every folder in the home directory. A
    # folder path is a name, never a pattern.
    OLDIFS="$IFS"; IFS=":"; set -f
    for p in $FOLDERS_ARG; do
        [ -n "$p" ] || continue
        # Do not let the trailing-slash strip empty the entry. `/` became "" here
        # and was then reported as "That folder does not exist: ", so the one
        # path the blocklist most needs to refuse by name never reached it.
        [ "$p" = "/" ] || p="${p%/}"
        SELECTED+=("$p")
    done
    IFS="$OLDIFS"; set +f
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
FOLDED=()
for path in "${SELECTED[@]}"; do
    verdict="$(check_folder "$path")"
    case "$verdict" in
        "OK "*) path="${verdict#OK }" ;;
        *)      fail "${verdict#NO }"; continue ;;
    esac

    # THE PATH IS REFUSED, NEVER REPAIRED. `json_string` strips control
    # characters, and applying that to a PATH silently rewrote an identity:
    # measured on a folder called "Doc<newline>uments", the links were made to
    # the real folder and the code carried `p: ".../Documents"` — a path that
    # does not exist, or worse one that does and is a different folder
    # entirely. A path is not a label; it is the only thing telling the person
    # which folder the checklist row means.
    offense="$(text_offense "$path")"
    if [ -n "$offense" ]; then
        fail "That folder's path contains $offense, which the website will not accept: $path
      Rename the folder and run this again. Nothing was linked for it."
        manual "No link or checklist row was made for $path — its path contains $offense. Rename the folder and re-run, or add it in the browser directly."
        continue
    fi

    # The site measures a path in UTF-16 units and `check_folder` counts
    # characters, which agree until somebody has an emoji in a folder name.
    # This is the exact test, and it is here rather than in `check_folder`
    # because that function is sliced out and driven on its own by the check
    # suite and may not depend on anything outside itself.
    if [ "$(text_len "$path")" -gt 400 ]; then
        fail "That folder's real path is too long for the website to carry: $path"
        continue
    fi

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
    # Not `${label:0:40}` and not `cut -c`: GNU cut counts BYTES and can sever a
    # UTF-8 character, bash's substring counts CHARACTERS, and the decoder
    # counts UTF-16 units — so forty emoji measured 40 to bash and 80 to the
    # site, over the ceiling, refusing the whole code. `text_cut` counts what
    # the site counts and never splits a character.
    label="$(text_cut 40 "$label")"

    # DE-DUPLICATED THROUGH THE DECODER'S FOLD, NOT BY EXACT MATCH. This was
    # `grep -Fxq`, while `decodeSetupCode` compares labels through `foldLabel` —
    # lower case, visible look-alikes, invisible characters, runs of whitespace.
    # Measured end to end: ~/Documents/photos and ~/Pictures/Photos made both
    # links, wrote the file and printed a code that the real decoder then
    # refused, so the refusal landed at the paste box with the links already on
    # the disk. Disambiguating here rather than refusing is deliberate: the
    # suffix is what the exact-match version already did, the person can rename
    # the drive on the site, and a code that works beats a code that explains
    # itself.
    base="$label"; n=2
    folded="$(fold_label "$label")"
    while printf '%s\n' ${FOLDED+"${FOLDED[@]}"} | grep -Fxq -e "$folded"; do
        # The suffix must not push the label past the site's ceiling, so the
        # base is cut to make room for it rather than the sum being truncated.
        label="$(text_cut $((40 - ${#n} - 1)) "$base") $n"
        n=$((n + 1))
        folded="$(fold_label "$label")"
    done

    LABELS+=("$label")
    FOLDED+=("$folded")
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

step "Naming this machine"
note "This is asked rather than taken from the computer, because the name is"
note "visible to anyone you later share a folder with, and hostnames tend to"
note "have people's names in them."
MACHINE_NAME=""
if [ -z "$FOLDERS_ARG" ] && [ -t 0 ]; then
    # >&2 like every other human-facing line in this file. `[ -t 0 ]` tests
    # STDIN, so `bash linux-share-setup.sh > code.txt` reaches here with a
    # terminal to read from and no terminal to write to: the prompt went into
    # the file, and the script looked like it had hung.
    printf '  A name for this machine (Enter to decide on the website): ' >&2
    read -r MACHINE_NAME || MACHINE_NAME=""
    MACHINE_NAME="$(text_cut 40 "$MACHINE_NAME")"
    # Typed rather than read off the disk, so it is the one field here that can
    # hold anything at all. The site refuses the whole code over it, and an
    # empty name is what the code means by "decide on the website" — so the
    # name is dropped and said so, which costs a suggestion, where keeping it
    # would cost the code.
    name_offense="$(text_offense "$MACHINE_NAME")"
    if [ -n "$name_offense" ]; then
        warn "That name contains $name_offense, which the website will not accept."
        warn "Leaving it blank; you can name this machine on the website instead."
        MACHINE_NAME=""
    fi
fi

# THE CODE IS BUILT BEFORE THE LINKS ARE MADE, because it can be too long.
#
# `decodeSetupCode` refuses a code over 4,096 characters outright, and nothing
# here had ever looked: measured with 24 real folders under a deep tree, this
# script printed an 8,279-character code, which the site refused whole — after
# every link was on the disk. The 24-folder cap above is not the same bound; 24
# long paths are nearly twice the ceiling.
#
# Folders come off the END, one at a time, and each one is named. That is the
# same shape as the 24-folder cap, and it keeps the promise the decoder's own
# refusal is about: what the checklist lists is what was prepared, so a folder
# is either on both or on neither and said out loud.
build_code() {
    local json i
    json='{"n":'"$(json_string "$MACHINE_NAME")"',"f":['
    i=0
    while [ $i -lt ${#LABELS[@]} ]; do
        [ $i -gt 0 ] && json="${json},"
        json="${json}{\"l\":$(json_string "${LABELS[$i]}"),\"p\":$(json_string "${PATHS[$i]}")}"
        i=$((i + 1))
    done
    json="${json}]}"
    printf 'VS1.%s' "$(printf '%s' "$json" | base64url | tr '+/' '-_' | tr -d '=')"
}

CODE="$(build_code)"
while [ ${#CODE} -gt 4096 ] && [ ${#LABELS[@]} -gt 1 ]; do
    drop=$(( ${#LABELS[@]} - 1 ))
    warn "Dropped '${LABELS[$drop]}' (${PATHS[$drop]}) — one setup code carries about"
    warn "4,000 characters and these paths are long ones."
    manual "'${LABELS[$drop]}' (${PATHS[$drop]}) is NOT on the checklist and was not linked: the setup code ran out of room. Run this script again with just that folder, or add it in the browser directly."
    LABELS=("${LABELS[@]:0:$drop}")
    PATHS=("${PATHS[@]:0:$drop}")
    CODE="$(build_code)"
done

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
    install_autostart
    disable_sleep
fi

step "Your setup code"

# $CODE was built above, before the links, so that a code too long for the site
# could cost a folder rather than the whole run. Do not rebuild it here: the
# list it was measured against is the list that was linked.
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
if copy_to_clipboard "$CODE"; then good "Copied to your clipboard."; fi
note "Also saved to $CODE_FILE"

step "What to do now"
note "1. Open $SHARE_PAGE and sign in."
note "2. Paste the code into the setup box (Ctrl-V)."
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
