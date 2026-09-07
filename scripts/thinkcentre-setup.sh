#!/usr/bin/env bash
#
# thinkcentre-setup.sh — prepare a Debian x86-64 machine as the Vessel sharing host.
#
# This is the sibling of scripts/pi-setup.sh, which hard-refuses on anything that is not a
# Raspberry Pi. The guide it implements is docs/thinkcentre-sharing-host.md; the reasoning behind
# the storage decisions lives in docs/pi-sharing-host.md and is not repeated here.
#
# What this machine is for, stated up front so nothing below is mistaken for hosting the website:
# mcclevarty.ca is a Cloudflare Worker with D1 and R2 behind it and needs nothing from this box.
# Per design/SPEC-ACCOUNTS.md §8 the sharing "agent" is not a daemon — it is a Chromium tab holding
# a File System Access directory handle, a WebSocket to the signalling service and a WebRTC data
# channel. That design buys us no installer and no code-signing, and it charges us one thing: the
# tab has to stay open. This script sets up the machine whose entire job is to keep it open.
#
# WHAT IT DOES
#   - Refuses to run on the wrong hardware or the wrong OS, before it changes anything.
#   - Installs a light desktop (only if the box has none), Chromium and the handful of tools the
#     kiosk needs.
#   - Turns off every path by which this machine could go to sleep, blank its display or lock its
#     screen — a locked screen is a stopped share.
#   - Installs the kiosk launcher, a systemd *user* service with Restart=always, and lingering.
#   - Locks Chromium down with a managed policy: this browser can reach the sharing site and
#     nothing else, has no password manager, no sign-in, no sync and no DevTools.
#   - Prepares the data store directory (it does NOT format or mount a disk).
#   - Enables unattended *security* updates, and gives Chromium its own weekly, chosen upgrade
#     window that restarts the tab afterwards rather than leaving it running on replaced binaries.
#   - Closes the machine: ufw default-deny with rate-limited SSH, an sshd drop-in, and a report of
#     everything still listening on the network.
#   - Optionally (--with-pihole) stands up Pi-hole in Docker with its DNS bound to the LAN address
#     and its admin UI bound to localhost.
#
# WHAT IT DELIBERATELY DOES NOT DO
#   - It does not format, partition or mount a disk, and it does not write /etc/fstab. A wrong
#     fstab line on a machine that lives on a shelf is a machine you have to walk to with a
#     keyboard. It looks at storage and tells you what it sees.
#   - It does not install Samba, or open any port beyond SSH. Every listener is a decision.
#   - It does not add your user to the `docker` group. That group is root-equivalent, and on a box
#     with autologin it would turn "somebody sat down at it" into "somebody is root".
#   - It does not send anything anywhere. SPEC-ACCOUNTS.md §9 is an inventory of everything this
#     project stores about a person, and a setup script that phoned home would be a spec change
#     rather than a detail.
#   - It does not disable SSH password authentication unless you ask for it with --ssh-key-only,
#     because locking yourself out of a headless box is a worse outcome than the thing it fixes.
#
# Re-running this is the point. Every step checks the world before it changes it, because the
# state a setup script is most often run in is "the last run died halfway and nobody is sure
# where."
#
# Usage:
#   ./scripts/thinkcentre-setup.sh [KIOSK_URL] [options]
#   ./scripts/thinkcentre-setup.sh --verify        # change nothing, check everything
#
# Options:
#   --verify               Read-only. Runs the verification pass and exits non-zero if the host
#                          is not in a state that would survive a reboot.
#   --store DIR            Data store directory. Default: /srv/vessel
#   --ssh-key-only         Disable SSH password authentication. Refused unless the account running
#                          this has a non-empty authorized_keys, so it cannot lock you out. Once a
#                          host is key-only it stays key-only across re-runs without the flag.
#   --allow-ssh-passwords  Turn SSH password authentication back on, on a host that is key-only.
#                          Deliberately explicit: nothing else re-opens that door.
#   --no-firewall          Skip ufw entirely (you are running a firewall elsewhere).
#   --no-chromium-policy   Skip the managed Chromium policy (you want a general-purpose browser).
#   --no-auto-chromium     Skip the weekly Chromium upgrade timer; upgrade by hand instead.
#   --with-pihole          Also install Docker and run Pi-hole. Off by default: it is home-server
#                          work bundled onto this box, not something the website needs.
#   --pihole-admin-lan     Expose the Pi-hole admin UI on the LAN instead of localhost only.
#   --help                 This text.
#
# Environment:
#   VESSEL_KIOSK_URL       Same as the positional argument.
#
# The default URL is https://mcclevarty.ca/share. The URL is written to a one-line config file and
# an existing one is never overwritten, so pointing the kiosk elsewhere later is one edit and one
# restart rather than a re-run of this script.

set -euo pipefail

# ---------------------------------------------------------------------------------------------
# Constants and defaults.
# ---------------------------------------------------------------------------------------------

readonly SERVICE_NAME="vessel-kiosk"
readonly CONFIG_DIR="${HOME}/.config/${SERVICE_NAME}"
readonly URL_FILE="${CONFIG_DIR}/url"
readonly STORE_FILE="${CONFIG_DIR}/store"
readonly OPTIONS_FILE="${CONFIG_DIR}/options"
readonly LAUNCHER="${HOME}/.local/bin/${SERVICE_NAME}"
readonly WATCHDOG="${HOME}/.local/bin/${SERVICE_NAME}-watchdog"
readonly UNIT_FILE="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
readonly DEFAULT_URL="https://mcclevarty.ca/share"
readonly DEFAULT_STORE="/srv/vessel"
readonly POLICY_NAME="vessel-kiosk.json"
readonly SSHD_DROPIN="/etc/ssh/sshd_config.d/50-vessel.conf"
# NOT /usr/local/sbin. Debian ships /usr/local and everything under it as root:staff mode 2775
# (Policy 9.1.2) — group-writable and not sticky — and this file is executed as root by a weekly
# timer. /usr/lib is root:root, so the script root runs cannot be replaced by anyone who is not
# already root.
readonly UPDATER="/usr/lib/vessel-kiosk/vessel-chromium-update"
readonly UPDATER_OLD="/usr/local/sbin/vessel-chromium-update"
readonly UPDATER_ENV="/etc/default/vessel-kiosk"

KIOSK_URL=""
STORE_DIR="${DEFAULT_STORE}"
STORE_EXPLICIT=0
FIREWALL_EXPLICIT=0
POLICY_EXPLICIT=0
AUTOCHROME_EXPLICIT=0
DO_VERIFY_ONLY=0
DO_SSH_KEY_ONLY=0
DO_ALLOW_SSH_PASSWORDS=0
DO_FIREWALL=1
DO_CHROMIUM_POLICY=1
DO_AUTO_CHROMIUM=1
DO_PIHOLE=0
PIHOLE_ADMIN_LAN=0

# Discovered as the run goes on, and read by later steps and by the summary. Initialised here so
# that a step which is skipped, or a --verify run that never reaches the step that sets one, cannot
# trip `set -u` in the summary three hundred lines later.
DISPLAY_MANAGER=""
LAN_IFACE=""
LAN_IP=""
LAN_NET=""
PIHOLE_PASSWORD=""
PIHOLE_ADMIN_BIND=""
POLICY_WRITTEN=""
STORE_MODE="0750"

# What the summary is allowed to claim. Each starts as "not done" and is set only by the code that
# actually did it, because a CONFIGURED block that asserts a security control the run skipped is
# worse than no summary at all — it is the part an operator reads as the state of the machine, and
# it was contradicting a warning printed a screen later.
POLICY_STATE="not attempted"
SSHD_STATE="not attempted"
AUTOLOGIN_STATE="not attempted"

# Collected as we go and printed at the end, because a wall of apt output scrolls the important
# warnings off the screen and the person running this is usually watching over SSH.
WARNINGS=()
MANUAL=()

# Everything temporary lives in one directory that is removed on exit, whatever the exit is.
# mktemp -d is 0700, which matters: some of these files are written before they are moved into
# place with root ownership.
WORK_DIR=""
# The exit status is captured and re-raised, and that is not decoration. An EXIT trap whose last
# command fails REPLACES the script's exit status with its own — so the plain form of this
# function, ending in a `[ -n ... ] && rm`, turned `--verify`'s deliberate `exit 1` into an exit 0
# and made the one command whose whole job is to report a bad state always report a good one.
cleanup() {
    local status=$?
    if [ -n "${WORK_DIR}" ]; then
        rm -rf "${WORK_DIR}"
    fi
    exit "${status}"
}
trap cleanup EXIT

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
skip() { printf '    (already done) %s\n' "$*"; }
warn() { printf '\033[33m    WARNING: %s\033[0m\n' "$*"; WARNINGS+=("$*"); }
die()  { printf '\n\033[31mERROR: %s\033[0m\n\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# Capture a command's first line of output, and use the fallback ONLY when there is no output.
#
# The obvious spelling, "$(cmd || echo fallback)", is wrong for exactly the commands this script
# asks: systemctl answers the negative cases by printing the answer and exiting non-zero —
# is-enabled prints "disabled" and exits 1, is-active prints "inactive" and exits 3 — so the
# fallback is appended to a perfectly good answer and the caller compares against a two-line
# string. It printed "inactive\ninactive" in the verification report, and it would have made every
# `check` of a negative state fail with garbled text instead of the state.
first_or() {
    local fallback="$1"
    shift
    local out
    out="$("$@" 2>/dev/null | head -n1)" || true
    printf '%s' "${out:-${fallback}}"
}

# ---------------------------------------------------------------------------------------------
# Argument parsing.
#
# The URL is validated rather than trusted. It is not merely written to a config file: its host
# goes into the Chromium policy's allowlist, so a string with a quote in it would be a JSON
# injection into a security control. Refuse, never repair — the same rule the site's own path
# handling follows (src/share/paths.ts).
# ---------------------------------------------------------------------------------------------

usage() {
    # The header block IS the documentation, so there is one copy of it rather than two that
    # drift. Print from the second line to the first line that is not a comment — a fixed line
    # range starts printing code the moment the header grows.
    awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
    exit 0
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --verify|-v)          DO_VERIFY_ONLY=1 ;;
            --ssh-key-only)       DO_SSH_KEY_ONLY=1 ;;
            --no-firewall)        DO_FIREWALL=0; FIREWALL_EXPLICIT=1 ;;
            --no-chromium-policy) DO_CHROMIUM_POLICY=0; POLICY_EXPLICIT=1 ;;
            --no-auto-chromium)   DO_AUTO_CHROMIUM=0; AUTOCHROME_EXPLICIT=1 ;;
            --allow-ssh-passwords) DO_ALLOW_SSH_PASSWORDS=1 ;;
            --with-pihole)        DO_PIHOLE=1 ;;
            --pihole-admin-lan)   PIHOLE_ADMIN_LAN=1 ;;
            --store)
                [ "$#" -ge 2 ] || die "--store needs a directory."
                STORE_DIR="$2"
                STORE_EXPLICIT=1
                shift
                ;;
            --store=*)            STORE_DIR="${1#--store=}"; STORE_EXPLICIT=1 ;;
            --help|-h)            usage ;;
            -*)                   die "Unknown option: $1 (try --help)" ;;
            *)
                [ -z "${KIOSK_URL}" ] || die "More than one URL given: '${KIOSK_URL}' and '$1'."
                KIOSK_URL="$1"
                ;;
        esac
        shift
    done

    KIOSK_URL="${KIOSK_URL:-${VESSEL_KIOSK_URL:-${DEFAULT_URL}}}"

    # A --store given once is remembered, so that a later `--verify` checks the store this host
    # actually uses rather than reporting the default as missing. It goes through the same
    # validation below as one typed on the command line: the file is ordinary and editable, and
    # this path gets chowned.
    if [ "${STORE_EXPLICIT}" -eq 0 ] && [ -r "${STORE_FILE}" ]; then
        STORE_DIR="$(head -n1 "${STORE_FILE}")"
        [ -n "${STORE_DIR}" ] || STORE_DIR="${DEFAULT_STORE}"
    fi

    # Same reasoning for the opt-outs. Without this, `--verify` on a host deliberately set up with
    # --no-firewall would fail a firewall check the operator switched off on purpose — and a check
    # that cries wolf is a check nobody reads. Only 0 and 1 are accepted from the file.
    if [ -r "${OPTIONS_FILE}" ]; then
        local key val
        while IFS='=' read -r key val; do
            case "${val}" in 0|1) ;; *) continue ;; esac
            case "${key}" in
                firewall)    [ "${FIREWALL_EXPLICIT}" -eq 1 ]   || DO_FIREWALL="${val}" ;;
                policy)      [ "${POLICY_EXPLICIT}" -eq 1 ]     || DO_CHROMIUM_POLICY="${val}" ;;
                autochrome)  [ "${AUTOCHROME_EXPLICIT}" -eq 1 ] || DO_AUTO_CHROMIUM="${val}" ;;
            esac
        done < "${OPTIONS_FILE}"
    fi

    case "${KIOSK_URL}" in
        about:blank) ;;
        http://*|https://*)
            # Deliberately strict. Anything outside this set is refused rather than escaped,
            # because the only reason to allow it would be a URL nobody would type on purpose.
            if ! printf '%s' "${KIOSK_URL}" \
                | grep -Eq '^https?://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(/[A-Za-z0-9._~:/?#@!$&*+,;=%()-]*)?$'; then
                die "That URL has characters this script will not put into a config file or a
       Chromium policy: '${KIOSK_URL}'
       Letters, digits, dots, hyphens, an optional port and an ordinary path only."
            fi
            case "${KIOSK_URL}" in
                http://*)
                    warn "The kiosk URL is plain http. The sharing page authenticates and holds a
             session cookie; over http both are readable by anything on the path. Use https
             unless this is a local test."
                    ;;
            esac
            ;;
        *)
            die "The kiosk URL must be http://, https:// or about:blank. Got: '${KIOSK_URL}'"
            ;;
    esac

    case "${STORE_DIR}" in
        /*) ;;
        *)  die "--store must be an absolute path. Got: '${STORE_DIR}'" ;;
    esac
    if printf '%s' "${STORE_DIR}" | grep -q '[[:space:]"'"'"'\\]'; then
        die "--store must not contain spaces, quotes or backslashes: '${STORE_DIR}'"
    fi

    # CANONICALISE FIRST, AND FAIL CLOSED. This list was an exact match on the raw string, and the
    # value ends up in `sudo chown ${USER}:${grp}` — so `/etc/`, `/etc/.`, `//etc`, `/etc/systemd`,
    # `/home/` and `/usr/local` were all accepted, and `--store /etc/` handed /etc to the desktop
    # user at 0750. It is also remembered in a user-writable file that later runs re-read, so one
    # bad value is permanent. These are the three rules the share scripts already record and this
    # one never had: canonicalise before comparing, collapse a leading `//`, and prefix-match
    # rather than exact-match.
    local store_canon bad
    store_canon="$(canon_store "${STORE_DIR}")" \
        || die "Could not work out where '${STORE_DIR}' really is, so it will not be used as the data store."
    STORE_DIR="${store_canon}"

    # Refused outright, but their children are fine — /srv/vessel is the default and lives under
    # one of them.
    for bad in / /home /root /var /opt /srv /mnt /media /snap /tmp; do
        if [ "${STORE_DIR}" = "${bad}" ]; then
            die "Refusing to use '${STORE_DIR}' as the data store. It would chown a system directory.
       Use a folder inside it instead."
        fi
    done

    # Refused along with everything underneath them. /usr is here rather than above because
    # /usr/local is a plausible thing to type and just as wrong. /var and /root joined
    # 2026-09-07 (audit item 49): `--store /var/lib` was accepted and chowned the dpkg
    # database to the autologin desktop user, which is the physical-access-becomes-root
    # path the preflight warns about, remembered permanently in the store file.
    for bad in /etc /usr /bin /sbin /lib /lib32 /lib64 /libx32 /boot /dev /proc /sys /run /var /root; do
        case "${STORE_DIR}/" in
            "${bad}"/*)
                die "Refusing to use '${STORE_DIR}' as the data store. It is inside ${bad}, which this
       script would then chown to your user."
                ;;
        esac
    done
}

# Canonicalise a store path for comparison against the list above.
#
# `cd -P` alone is not enough here: the store usually does not exist yet, so there is nothing to
# resolve against. So the lexical work is done by hand and the kernel gets the last word only when
# the directory is already there — which is the case that matters, since a store that is a symlink
# would otherwise chown whatever it points at.
#
# `..` is REFUSED rather than resolved. A repaired path is a path nobody typed, and this one gets
# chowned.
canon_store() {
    local raw="$1" out="" part
    case "${raw}" in /*) ;; *) return 1 ;; esac

    local IFS=/
    set -f                      # a `*` in the path must not glob while it is being split
    for part in ${raw}; do
        case "${part}" in
            ""|".") continue ;;
            "..")   set +f; return 1 ;;
            *)      out="${out}/${part}" ;;
        esac
    done
    set +f

    [ -n "${out}" ] || out="/"

    if [ -d "${out}" ]; then
        out="$(cd -P "${out}" 2>/dev/null && pwd -P)" || return 1
        # bash's `pwd -P` PRESERVES a leading `//`, which POSIX lets an implementation treat as
        # special — so `//etc` came back as `//etc` and compared unequal to `/etc`.
        while [ "${out#//}" != "${out}" ]; do out="${out#/}"; done
    fi

    printf '%s' "${out}"
}

# Every managed-policy directory a browser on THIS machine would actually read.
#
# This is a list rather than a constant because the policy is a security control and the cost of
# putting it in the wrong place is silent: Chromium reads /etc/chromium/policies/managed, but the
# `chromium-browser` package — which install_packages() will fall back to, and which is what an
# Ubuntu derivative has — reads /etc/chromium-browser/policies/managed, and Chrome reads
# /etc/opt/chrome/policies/managed. Writing one path on a host running another browser leaves the
# machine wide open while every report this script prints says it is locked down.
policy_dirs() {
    local dirs=()
    if have chromium; then dirs+=(/etc/chromium/policies/managed); fi
    if have chromium-browser; then dirs+=(/etc/chromium-browser/policies/managed); fi
    if have google-chrome || have google-chrome-stable; then dirs+=(/etc/opt/chrome/policies/managed); fi
    # No browser on PATH yet (a --verify before anything was installed). Name the Debian default so
    # the caller has something to report rather than nothing.
    if [ "${#dirs[@]}" -eq 0 ]; then dirs+=(/etc/chromium/policies/managed); fi
    printf '%s\n' "${dirs[@]}"
}

# The host, for the Chromium allowlist. Safe to derive by string surgery only because the URL was
# validated above.
url_host() {
    local u="${1#*://}"
    u="${u%%/*}"
    printf '%s' "${u}"
}

# ---------------------------------------------------------------------------------------------
# File placement helpers.
#
# Both compare before writing so a re-run says "already done" instead of churning mtimes, and both
# write to a temp file first so an interrupted run cannot leave a half-written unit or policy in
# place. A truncated sshd drop-in is a machine you cannot log into.
# ---------------------------------------------------------------------------------------------

#
# THREE RETURN VALUES, AND THE CALLER MUST NOT CONFUSE THEM: 0 wrote it, 1 it was already current,
# 2 IT DID NOT GET WRITTEN. Both used to return 0 for the third case as well. Every one of the 23
# call sites is `|| true` or an `if` condition, and either form suspends `set -e` for the whole
# function body — so a failed `cp` fell straight through to `info "wrote ${dest}"` and the summary
# reported a security control that is not on the disk. `harden_ssh` was immune only because it
# re-asks `sshd -T` afterwards; VERIFY THE EFFECT, DO NOT TRUST THE WRITE is that pattern, and it
# is why both of these end by comparing the destination back against the source.
#
place_user_file() {
    local src="$1" dest="$2" mode="$3" tmp
    if ! mkdir -p "$(dirname "${dest}")"; then
        warn "could not create $(dirname "${dest}"), so ${dest} was NOT written"
        return 2
    fi
    if [ -f "${dest}" ] && cmp -s "${src}" "${dest}"; then
        skip "${dest} is already current"
        return 1
    fi
    # Temp file, then rename. This was `cat "${src}" > "${dest}"`, which truncates in place, under
    # the comment above promising it did not — so an interrupted run left a half-written launcher
    # or unit. pi-setup.sh already did it this way; the two agree now.
    if ! tmp="$(mktemp "${dest}.XXXXXX" 2>/dev/null)"; then
        warn "could not create a temporary file beside ${dest}, so it was NOT written"
        return 2
    fi
    if ! cat "${src}" > "${tmp}" || ! chmod "${mode}" "${tmp}" || ! mv -f "${tmp}" "${dest}"; then
        rm -f "${tmp}"
        warn "${dest} was NOT written"
        return 2
    fi
    if ! cmp -s "${src}" "${dest}"; then
        warn "${dest} does not contain what was meant to be written"
        return 2
    fi
    info "wrote ${dest}"
    return 0
}

place_root_file() {
    local src="$1" dest="$2" mode="$3"
    if [ -f "${dest}" ] && sudo cmp -s "${src}" "${dest}"; then
        skip "${dest} is already current"
        return 1
    fi
    # Beside the destination, then renamed, for the same reason: `cp` truncates in place, and a
    # truncated sshd drop-in is a machine you cannot log into. The `.tmp` suffix is what keeps the
    # half-second it exists invisible to sshd and apt, both of which ignore it.
    local tmp="${dest}.vessel-setup.tmp"
    if ! sudo mkdir -p "$(dirname "${dest}")" \
    || ! sudo cp "${src}" "${tmp}" \
    || ! sudo chown root:root "${tmp}" \
    || ! sudo chmod "${mode}" "${tmp}" \
    || ! sudo mv -f "${tmp}" "${dest}"; then
        sudo rm -f "${tmp}" 2>/dev/null || true
        warn "${dest} was NOT written"
        return 2
    fi
    if ! sudo cmp -s "${src}" "${dest}"; then
        warn "${dest} does not contain what was meant to be written"
        return 2
    fi
    info "wrote ${dest}"
    return 0
}

pkg_installed() {
    dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q '^install ok installed$'
}

pkg_exists() {
    apt-cache show "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------------------------
# Preflight. Everything here is a refusal or a warning, and nothing here changes the machine.
# ---------------------------------------------------------------------------------------------

preflight() {
    log "Checking this machine is the machine this script is for"

    if [ "$(id -u)" -eq 0 ]; then
        die "Do not run this as root or with sudo.
       Almost everything here belongs to your user — the systemd *user* service, the linger flag,
       and above all the Chromium profile, whose IndexedDB holds the persisted directory handle.
       Run as root, all of it lands in root's home, where the desktop session will never see it,
       and the symptom is the worst one available: the browser starts, the page loads, and the
       shared folder is simply not there. The script calls sudo itself where it needs to."
    fi

    have sudo || die "sudo is not installed. Install it and add your user to the sudo group first."
    if ! sudo -v; then
        die "This script needs sudo for packages, boot behaviour and the firewall, and sudo refused."
    fi

    have systemctl || die "This machine has no systemd. Everything below is systemd units."

    # A Raspberry Pi has its own script, and this one would half-work on it — which is worse than
    # not running.
    if [ -r /proc/device-tree/model ]; then
        local model
        model="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"
        case "${model}" in
            *"Raspberry Pi"*)
                die "This is a ${model}. Use scripts/pi-setup.sh — it configures raspi-config, the
       Wayland compositor paths and the Pi's own archive, none of which exist here."
                ;;
        esac
    fi

    local arch
    arch="$(uname -m)"
    case "${arch}" in
        x86_64) info "Architecture: x86_64" ;;
        *)      warn "Architecture is ${arch}, not x86_64. Nothing below is deliberately
             x86-specific, but this has only been thought through for a 64-bit PC." ;;
    esac

    [ -r /etc/os-release ] || die "No /etc/os-release — cannot tell what this OS is."
    # Read with sed rather than sourced: /etc/os-release is shell-syntax by convention, and
    # sourcing a file to read two fields runs whatever else is in it.
    local id="" id_like="" codename="" pretty=""
    id="$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')"
    id_like="$(sed -n 's/^ID_LIKE=//p' /etc/os-release | tr -d '"')"
    codename="$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release | tr -d '"')"
    pretty="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"')"
    info "OS: ${pretty:-unknown}"

    case "${id}:${id_like}" in
        debian:*|*:*debian*) ;;
        *) die "This script is apt/Debian-only and this looks like '${id:-unknown}'.
       Everything below — apt, lightdm drop-ins, /etc/chromium/policies, ufw, unattended-upgrades
       — assumes Debian's layout. On another distribution it would half-apply." ;;
    esac

    have apt-get || die "apt-get is missing on what claims to be a Debian system."

    if [ "${id}" = "ubuntu" ]; then
        warn "This is Ubuntu, not Debian. The one thing that actually differs is Chromium:
             'chromium-browser' on Ubuntu is a transitional package that installs the Snap, and
             Snaps refresh on their own schedule — which fights the whole point of the chosen
             upgrade window below. Install Chromium from Flathub instead and point the launcher
             at it, or use Debian. See docs/thinkcentre-sharing-host.md §1."
    fi

    case "${codename}" in
        bookworm|trixie) info "Debian release: ${codename}" ;;
        "")              warn "No VERSION_CODENAME in /etc/os-release. Continuing blind." ;;
        *)               warn "Debian '${codename}' is outside what this script was written
             against (bookworm, trixie). Nothing here is exotic, but check the summary carefully
             rather than trusting a green run." ;;
    esac

    local mem_kb
    mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
    info "RAM: $(( mem_kb / 1024 )) MB"
    if [ "${mem_kb}" -lt 3500000 ]; then
        warn "Under 4GB of RAM. Chromium with one page open plus a desktop session will fit, but
             there is no headroom, and the process the kernel picks when it runs out is the
             browser — the one thing on this machine that matters."
    fi

    local root_src
    root_src="$(findmnt -no SOURCE / 2>/dev/null || true)"
    info "Root filesystem: ${root_src:-unknown}"

    # A root on a USB-attached disk (2026-09-07). It is how the real host is built — the OS lives
    # on a USB SSD — and it works, but the kernel's USB autosuspend can drop the bus under a
    # quiet disk, and a root that goes away is a hung box, not a logged error. The fix is one
    # kernel parameter; this script names it and does not write it, because a mistake in the
    # boot line is a machine that does not boot, and the guide is explicit that nothing here
    # touches the bootloader.
    local root_disk="" root_tran=""
    if [ -n "${root_src}" ] && [ -b "${root_src}" ]; then
        root_disk="$(lsblk -no PKNAME "${root_src}" 2>/dev/null | head -1 || true)"
        [ -n "${root_disk}" ] && root_tran="$(lsblk -dno TRAN "/dev/${root_disk}" 2>/dev/null || true)"
    fi
    if [ "${root_tran}" = "usb" ]; then
        warn "The root filesystem is on a USB-attached disk (${root_src}). That works, but USB
             autosuspend can drop the bus under an idle disk, and a root that vanishes is a hung
             box. Add usbcore.autosuspend=-1 to GRUB_CMDLINE_LINUX_DEFAULT in /etc/default/grub
             and run 'sudo update-grub'. Not done here: this script never edits the boot line."
        MANUAL+=("Root is on a USB disk (${root_src}). Add usbcore.autosuspend=-1 to
             GRUB_CMDLINE_LINUX_DEFAULT in /etc/default/grub, run 'sudo update-grub', reboot, and
             keep that disk on its own port — never a hub something else gets unplugged from.")
    fi

    # An autologin box whose user can sudo without a password turns "somebody sat down at it" into
    # "somebody is root". Worth knowing before autologin is switched on, not after.
    if sudo grep -rqs 'NOPASSWD' /etc/sudoers /etc/sudoers.d 2>/dev/null; then
        warn "Passwordless sudo is configured somewhere in /etc/sudoers or /etc/sudoers.d. This
             box is about to autologin to a desktop, so anyone who can reach the keyboard would
             be one terminal away from root. Remove the NOPASSWD rule unless something on this
             machine genuinely needs it."
    fi

    # Autologin with no password on the account is the same hole by a different door: Ctrl+Alt+F2
    # then a blank password.
    local pwstatus
    pwstatus="$(sudo passwd -S "${USER}" 2>/dev/null | awk '{print $2}' || true)"
    case "${pwstatus}" in
        NP) warn "The account '${USER}' has no password set. With autologin enabled, that is a
             console login for anyone who presses Ctrl+Alt+F2. Set one: passwd" ;;
        L)  warn "The account '${USER}' is locked. Autologin may still work, but sudo will not." ;;
        P)  info "Account password: set" ;;
        *)  info "Account password: could not determine (not fatal)" ;;
    esac
}

# ---------------------------------------------------------------------------------------------
# Storage. This step changes nothing but the store directory itself — it looks, reports, and hands
# the rest to the guide.
#
# The reasoning is docs/pi-sharing-host.md's "The disk is the point", and it is unchanged here:
# ext4 rather than NTFS/exFAT (the permission model does not survive the crossing, and both are
# case-insensitive while grant subpaths are matched against a case-sensitive real tree), mounted
# by UUID with nofail so a missing disk degrades to "sharing is broken" instead of a boot that
# stops at a console nobody is sitting at.
# ---------------------------------------------------------------------------------------------

report_storage() {
    log "Looking at attached storage (reporting only — no disk is formatted or mounted)"

    # One lsblk call per disk rather than one parse of a multi-column table. `lsblk -rn` prints an
    # empty column as nothing at all, so a disk with no transport shifts every field after it left
    # and the report starts confidently describing the wrong thing. Asking for one field at a time
    # cannot do that.
    local dev size tran mounts found_disk=""
    while read -r dev; do
        [ -n "${dev}" ] || continue
        found_disk="yes"
        size="$(lsblk -dno SIZE "/dev/${dev}" 2>/dev/null | tr -d ' ' || true)"
        tran="$(lsblk -dno TRAN "/dev/${dev}" 2>/dev/null | tr -d ' ' || true)"
        # Every mountpoint on the disk, partitions included, joined onto one line.
        mounts="$(lsblk -nro MOUNTPOINT "/dev/${dev}" 2>/dev/null | grep -v '^$' | paste -sd, - || true)"
        if [ -n "${mounts}" ]; then
            info "/dev/${dev} (${size:-?}, ${tran:-unknown transport}) mounted at ${mounts}"
        else
            info "/dev/${dev} (${size:-?}, ${tran:-unknown transport}) is attached but NOT mounted"
        fi
    done < <(lsblk -dno NAME 2>/dev/null || true)

    [ -n "${found_disk}" ] || warn "lsblk reported no disks at all, which should be impossible on a
             machine that booted. Check that lsblk is installed and working before trusting
             anything else in this report."
}

prepare_store() {
    log "Preparing the data store at ${STORE_DIR}"

    if [ -d "${STORE_DIR}" ]; then
        skip "${STORE_DIR} exists"
    else
        sudo mkdir -p "${STORE_DIR}"
        info "created ${STORE_DIR}"
    fi

    # Not 0755. Nothing but the browser running as this user needs to read the shared files, and
    # every other local account has no business enumerating them.
    #
    # 0750 says that only where the primary group is the user's own, which is Debian's default
    # (USERGROUPS=yes) but not universal: on a host where the primary group is shared — `users`,
    # say — 0750 hands read and traverse to every member of it, which is the opposite of what the
    # sentence above claims. So the mode follows the group rather than being assumed.
    local grp mode
    grp="$(id -gn)"
    if [ "${grp}" = "${USER}" ]; then
        mode=0750
    else
        mode=0700
        info "primary group is '${grp}', which is shared, so the store is 0700 rather than 0750"
    fi
    sudo chown "${USER}:${grp}" "${STORE_DIR}"
    sudo chmod "${mode}" "${STORE_DIR}"
    info "owner ${USER}, mode ${mode}"
    STORE_MODE="${mode}"

    # Only lay out the siblings on a store that is empty, so a re-run against a populated store
    # does not scatter empty directories through somebody's files.
    if [ -z "$(ls -A "${STORE_DIR}" 2>/dev/null || true)" ]; then
        local d
        for d in photos invoices installers handover; do
            mkdir -p "${STORE_DIR}/${d}"
        done
        info "laid out siblings: photos/ invoices/ installers/ handover/"
        info "(siblings, never nested — a shared folder's handle reaches everything under it, so"
        info " installers/ inside photos/ would share the installers too, silently)"
    else
        skip "${STORE_DIR} is not empty; left its layout alone"
    fi

    # Remembered so --verify, and any later run without --store, look at this store rather than
    # the default.
    mkdir -p "${CONFIG_DIR}"
    printf '%s\n' "${STORE_DIR}" > "${STORE_FILE}"
    {
        printf '%s\n' "firewall=${DO_FIREWALL}"
        printf '%s\n' "policy=${DO_CHROMIUM_POLICY}"
        printf '%s\n' "autochrome=${DO_AUTO_CHROMIUM}"
    } > "${OPTIONS_FILE}"

    local fstype src
    fstype="$(findmnt -no FSTYPE --target "${STORE_DIR}" 2>/dev/null || true)"
    src="$(findmnt -no SOURCE --target "${STORE_DIR}" 2>/dev/null || true)"
    info "filesystem: ${fstype:-unknown} on ${src:-unknown}"

    case "${fstype}" in
        ext4|xfs|btrfs)
            : # Native, case-sensitive, real permissions. Nothing to say.
            ;;
        ntfs|ntfs3|fuseblk|vfat|exfat)
            warn "The store is on ${fstype}. Two consequences, neither fatal, both worth knowing
             now rather than in three months: permissions are synthesised at mount time rather
             than stored, so the filesystem cannot express 'this subfolder is private' and the
             grant's path scoping is the only thing doing that work; and it is case-insensitive,
             while grants are compared as literal relative subpaths — a grant written for
             'Invoices' against a folder named 'invoices' resolves here and fails on a
             case-sensitive machine, for no visible reason. Move the store to ext4."
            ;;
        nfs|nfs4|cifs|smb3|fuse.sshfs)
            warn "The store is on a network filesystem (${fstype}). docs/pi-sharing-host.md's
             'the disk is the point' is about exactly this: every NAS reboot — firmware updates
             are routine — turns the shared folder into something that hangs or lists empty while
             this box looks perfectly fine, and that reads as a Vessel bug from the outside. A
             directly-attached (DAS) enclosure has none of this problem. If a NAS is genuinely
             what you want, decide in advance that 'sharing is down during a NAS reboot' is
             acceptable, because it is inherent to the choice."
            ;;
        "")
            warn "Could not determine the store's filesystem type."
            ;;
        *)
            warn "The store is on '${fstype}', which this script has no opinion about. Confirm it
             is case-sensitive and stores real permissions."
            ;;
    esac

    # A store on the root filesystem can fill it and take the OS down with it. Only worth saying
    # when it is actually a separate concern — the doc explicitly blesses a directory on the
    # internal SSD while testing.
    local store_src root_src
    store_src="$(findmnt -no SOURCE --target "${STORE_DIR}" 2>/dev/null || true)"
    root_src="$(findmnt -no SOURCE / 2>/dev/null || true)"
    if [ -n "${store_src}" ] && [ "${store_src}" = "${root_src}" ]; then
        info "The store is on the root filesystem. That is fine while you are testing — see §5 of"
        info "docs/thinkcentre-sharing-host.md — but a full store then fills the OS disk. Move it"
        info "to its own drive before it holds anything large."
    fi

    if grep -qs 'nofail' /etc/fstab; then
        info "/etc/fstab has at least one nofail entry — that is the shape the guide asks for."
    else
        MANUAL+=("If the store ever moves to its own drive, mount it from /etc/fstab by UUID and
             with 'nofail'. Both halves matter: /dev/sda1 moves between boots, and an entry
             without nofail turns a missing or failed disk into a boot that stops and waits for a
             console nobody is sitting at. docs/thinkcentre-sharing-host.md §5 walks it.")
    fi

    MANUAL+=("Decide how files get onto the store — Samba for dragging them over by hand, rsync
             over SSH if it will ever be scripted. Neither is installed here, because both listen
             on the network and this script does not open a port it was not asked to. If you add
             Samba, restrict it to the LAN and never forward 445:
                 sudo ufw allow from ${LAN_NET:-192.168.0.0/16} to any port 445 proto tcp")

    MANUAL+=("Keep the store's folder names dull and non-personal. drives.label is visible to
             everyone a folder is shared with, and it is one of the few fields where personal data
             could get into a system designed to hold none.")
}

# ---------------------------------------------------------------------------------------------
# Packages.
# ---------------------------------------------------------------------------------------------

install_packages() {
    log "Installing packages"

    info "Refreshing the package list"
    sudo apt-get update -qq

    # Debian calls it 'chromium'. Raspberry Pi OS keeps the historical 'chromium-browser', and
    # Ubuntu's 'chromium-browser' is a Snap shim — checked rather than assumed, because installing
    # the wrong one is a browser that updates itself on somebody else's schedule.
    local browser_pkg=""
    if pkg_exists chromium; then
        browser_pkg="chromium"
    elif pkg_exists chromium-browser; then
        browser_pkg="chromium-browser"
        warn "Installing 'chromium-browser' rather than Debian's 'chromium'. On Ubuntu that is
             the Snap shim — check what you actually got before relying on this host."
    else
        die "Neither chromium nor chromium-browser is available from apt. Check /etc/apt/sources.list;
       on a Debian netinst the 'main' component is sometimes the only one enabled."
    fi

    local wanted=(
        "${browser_pkg}"
        x11-xserver-utils    # xset, for the X11 blanking work below.
        unclutter            # Hides the idle pointer.
        unattended-upgrades  # Security updates without a human. Configured further down.
        apt-listchanges      # So an upgrade that changes behaviour is at least recorded.
        jq                   # The launcher uses it to clear Chromium's crash flag safely.
        curl                 # The launcher waits on the site with it; the watchdog polls with it.
        ca-certificates      # An https kiosk URL on a fresh netinst needs these present.
    )

    # A desktop only if the box has none. If this machine already runs GNOME, replacing it with
    # Xfce is not this script's decision to make — the kiosk works under either.
    # /etc/X11/default-display-manager is the one that actually runs, and it is entirely normal for
    # a box to have two installed — task-gnome-desktop and then Xfce, or the other way round.
    # Choosing by "which package is installed" writes a LightDM drop-in on a machine running gdm3,
    # which nothing reads: no autologin, no session, no kiosk, and a summary saying otherwise.
    local dm=""
    local d
    if [ -r /etc/X11/default-display-manager ]; then
        d="$(head -n1 /etc/X11/default-display-manager | tr -d '[:space:]')"
        case "${d##*/}" in
            lightdm|gdm3|gdm|sddm|lxdm) dm="${d##*/}"; info "Active display manager: ${dm} (from /etc/X11/default-display-manager)" ;;
        esac
    fi
    if [ -z "${dm}" ]; then
        for d in lightdm gdm3 sddm lxdm; do
            if pkg_installed "${d}"; then dm="${d}"; break; fi
        done
    fi

    if [ -n "${dm}" ]; then
        info "Display manager already installed: ${dm} — leaving the desktop alone"
    else
        info "No display manager found; installing Xfce and LightDM"
        # xfce4 without xfce4-goodies: an appliance holding one fullscreen tab has no use for a
        # dozen panel plugins, and every package installed is a package to keep patched.
        wanted+=(xfce4 lightdm)
        dm="lightdm"
    fi
    DISPLAY_MANAGER="${dm}"

    local missing=() p
    for p in "${wanted[@]}"; do
        if pkg_installed "${p}"; then
            skip "${p}"
        else
            missing+=("${p}")
        fi
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        info "Installing: ${missing[*]}"
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
    else
        info "Nothing to install."
    fi

    # These three each have their own idle timer that ignores everything configured below, and
    # each will lock or blank the screen anyway. A locked screen is a stopped share: the tab is
    # still open, the process is still up, and the compositor may stop compositing it.
    local unwanted=(light-locker xfce4-screensaver xscreensaver)
    local purge=()
    for p in "${unwanted[@]}"; do
        if pkg_installed "${p}"; then purge+=("${p}"); fi
    done
    if [ "${#purge[@]}" -gt 0 ]; then
        info "Removing screen lockers: ${purge[*]}"
        sudo DEBIAN_FRONTEND=noninteractive apt-get purge -y "${purge[@]}"
    else
        skip "no screen locker installed"
    fi
}

# ---------------------------------------------------------------------------------------------
# Autologin.
#
# What this trades away, stated plainly rather than buried: anyone with physical access to this
# box and a keyboard gets a logged-in desktop. On a machine whose whole purpose is holding a
# handle to your files, that is a real consideration, and it is why the Chromium policy below
# exists and why the summary tells you to set a BIOS password. It is accepted because the
# alternative is a host that stops sharing every time the power flickers, and because the folder
# handle is protected by the browser's permission model rather than by a login screen.
# ---------------------------------------------------------------------------------------------

configure_autologin() {
    log "Configuring desktop autologin for ${USER}"

    case "${DISPLAY_MANAGER:-}" in
        lightdm)
            local session=""
            if [ -f /usr/share/xsessions/xfce.desktop ]; then
                session="xfce"
            elif [ -f /usr/share/xsessions/xfce-session.desktop ]; then
                session="xfce-session"
            fi

            local tmp="${WORK_DIR}/lightdm-autologin.conf"
            {
                printf '%s\n' "# Written by scripts/thinkcentre-setup.sh for the Vessel sharing host."
                printf '%s\n' "# The kiosk needs a graphical session to exist and nobody is here to type a password"
                printf '%s\n' "# into a greeter, so autologin is not a convenience — it is the only way the session"
                printf '%s\n' "# ever starts."
                printf '%s\n' "[Seat:*]"
                printf '%s\n' "autologin-user=${USER}"
                printf '%s\n' "autologin-user-timeout=0"
                [ -n "${session}" ] && printf '%s\n' "autologin-session=${session}"
                # -s 0 disables the screensaver timeout and -dpms disables display power
                # management, both on the X server command line so they apply from server start
                # rather than from session start — including at the greeter.
                printf '%s\n' "xserver-command=X -s 0 -dpms"
            } > "${tmp}"
            place_root_file "${tmp}" /etc/lightdm/lightdm.conf.d/50-vessel-autologin.conf 0644 || true
            AUTOLOGIN_STATE="lightdm, autologin as ${USER}"

            # Debian's lightdm creates an 'autologin' group on some installs and PAM refuses the
            # autologin unless the user is in it. Harmless where the group does not exist.
            if getent group autologin >/dev/null 2>&1; then
                if id -nG "${USER}" | tr ' ' '\n' | grep -qx autologin; then
                    skip "${USER} is already in the autologin group"
                else
                    sudo gpasswd -a "${USER}" autologin >/dev/null
                    info "added ${USER} to the autologin group"
                fi
            fi
            ;;
        gdm3)
            local tmp="${WORK_DIR}/gdm-daemon.conf"
            AUTOLOGIN_STATE="gdm3, autologin as ${USER}"
            if [ -f /etc/gdm3/daemon.conf ] && grep -q "AutomaticLogin=${USER}" /etc/gdm3/daemon.conf; then
                skip "gdm3 autologin is already set for ${USER}"
            else
                # gdm3's daemon.conf is a whole file rather than a drop-in directory, so this
                # rewrites the [daemon] section in place and leaves everything else alone.
                sudo cp /etc/gdm3/daemon.conf "${WORK_DIR}/daemon.conf.orig" 2>/dev/null || true
                sudo awk -v user="${USER}" '
                    /^\[daemon\]/ { print; print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user; seen=1; next }
                    /^AutomaticLogin(Enable)?=/ { next }
                    { print }
                    END { if (!seen) { print "[daemon]"; print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user } }
                ' /etc/gdm3/daemon.conf > "${tmp}" 2>/dev/null || true
                if [ -s "${tmp}" ]; then
                    place_root_file "${tmp}" /etc/gdm3/daemon.conf 0644 || true
                else
                    AUTOLOGIN_STATE="NOT CONFIGURED — /etc/gdm3/daemon.conf could not be rewritten"
                    warn "Could not rewrite /etc/gdm3/daemon.conf. Set AutomaticLoginEnable=true and
             AutomaticLogin=${USER} in its [daemon] section by hand, or the kiosk will wait
             forever for a session that never starts."
                fi
            fi
            ;;
        *)
            AUTOLOGIN_STATE="NOT CONFIGURED — unknown display manager '${DISPLAY_MANAGER:-none}'"
            warn "Display manager is '${DISPLAY_MANAGER:-none}', which this script does not know how
             to configure for autologin. Without autologin there is no graphical session, and
             without a session the kiosk never starts — this is the single most important thing on
             the machine. Set it by hand, or install lightdm and re-run."
            MANUAL+=("Configure desktop autologin by hand for ${DISPLAY_MANAGER:-your display manager}.")
            ;;
    esac
}

# ---------------------------------------------------------------------------------------------
# Never sleep, never blank, never lock.
#
# Four independent mechanisms can stop this machine sharing, and they do not overlap at all:
# systemd's sleep targets, logind's idle action, the X server's own screensaver/DPMS timers, and
# whatever the desktop session runs on top of those. Configuring all four costs a few files;
# guessing wrong costs a host that goes quiet at midnight with nobody watching.
# ---------------------------------------------------------------------------------------------

configure_no_sleep() {
    log "Disabling sleep, screen blanking and screen locking"

    # Masking is stronger than disabling: a masked target cannot be pulled in by anything else,
    # including a desktop power manager politely asking for it.
    local masked_all=1 t
    for t in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
        if [ "$(systemctl is-enabled "${t}" 2>/dev/null || true)" = "masked" ]; then
            skip "${t} is already masked"
        else
            masked_all=0
        fi
    done
    if [ "${masked_all}" -eq 0 ]; then
        sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null
        info "masked sleep, suspend, hibernate and hybrid-sleep"
    fi

    # logind's own idle handling, and the lid on the off-chance this is ever a laptop.
    local tmp="${WORK_DIR}/logind-vessel.conf"
    cat > "${tmp}" <<'EOF'
# Written by scripts/thinkcentre-setup.sh for the Vessel sharing host.
# The sharing tab is idle almost all the time by design — it holds a WebSocket and waits. An idle
# action here would put the machine to sleep in exactly the state it is supposed to live in.
[Login]
IdleAction=ignore
IdleActionSec=0
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
    if place_root_file "${tmp}" /etc/systemd/logind.conf.d/10-vessel.conf 0644; then
        # A logind restart is safe here and takes effect without a reboot on modern systemd; where
        # it is not, the reboot at the end of this script covers it.
        sudo systemctl restart systemd-logind >/dev/null 2>&1 || true
    fi

    # Inside the session, re-applied at every login. The X server flags above cover the greeter and
    # the moment before the session starts; a session-level tool can and does re-enable DPMS after
    # login, so both are needed.
    local ds="${WORK_DIR}/vessel-noblank.desktop"
    cat > "${ds}" <<'EOF'
[Desktop Entry]
Type=Application
Name=Vessel — disable screen blanking
Comment=Written by scripts/thinkcentre-setup.sh. Re-applies the no-blank settings inside the session.
Exec=sh -c "xset s off; xset s noblank; xset -dpms"
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
    place_user_file "${ds}" "${HOME}/.config/autostart/vessel-noblank.desktop" 0644 || true

    # Xfce's power manager has its own timers and its own idea of a display. This is the system
    # default channel, which applies to any user without an override of their own — including the
    # kiosk user on a fresh install.
    if [ -d /etc/xdg/xfce4 ] || pkg_installed xfce4-power-manager; then
        local xp="${WORK_DIR}/xfce4-power-manager.xml"
        cat > "${xp}" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!-- Written by scripts/thinkcentre-setup.sh for the Vessel sharing host. -->
<channel name="xfce4-power-manager" version="1.0">
  <property name="xfce4-power-manager" type="empty">
    <property name="blank-on-ac" type="uint" value="0"/>
    <property name="dpms-enabled" type="bool" value="false"/>
    <property name="dpms-on-ac-sleep" type="uint" value="0"/>
    <property name="dpms-on-ac-off" type="uint" value="0"/>
    <property name="inactivity-on-ac" type="uint" value="14"/>
    <property name="lock-screen-suspend-hibernate" type="bool" value="false"/>
    <property name="logind-handle-lid-switch" type="bool" value="false"/>
  </property>
</channel>
EOF
        place_root_file "${xp}" \
            /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-power-manager.xml 0644 || true
        info "(inactivity-on-ac=14 is xfce's magic value for 'never', not fourteen minutes)"

        # xfconf treats the system file as a DEFAULT, not an override: the moment a per-user copy
        # of that channel exists — which it does the first time anyone opens Xfce's power settings
        # — the system file is ignored entirely for that channel, and this step writes a file that
        # changes nothing while reporting success.
        local user_xp="${HOME}/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-power-manager.xml"
        if [ -f "${user_xp}" ]; then
            warn "${user_xp} exists, and a per-user xfconf channel beats the system default that
             was just written — so the power settings above may not apply. Set them in the running
             session instead:
                 xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false
                 xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -n -t uint -s 0
                 xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/inactivity-on-ac -n -t uint -s 14
             (14 is xfce's value for 'never'.) Then confirm with 'DISPLAY=:0 xset q'."
        fi
    fi

    configure_no_sleep_gnome

    MANUAL+=("After the first reboot, confirm nothing blanks the display:
                 DISPLAY=:0 xset q | grep -A2 'Screen Saver'
                 DISPLAY=:0 xset q | grep -A2 DPMS
             Expect timeout 0 and 'DPMS is Disabled'.")
}

# GNOME has its own idle timer and its own screen lock, and neither of them reads anything written
# above: not the LightDM drop-in (gdm3 does not read it), not the xset autostart (a no-op under
# Wayland, which is gdm3's default), and the lock cannot be purged because it lives inside
# gnome-shell. On a box that already had GNOME — a path this script supports, since replacing
# somebody's desktop is not its decision — "never idles" was simply untrue.
#
# dconf's system database is the way to set this without a session: it applies to every user,
# including one that has never logged in, which is exactly the case here.
configure_no_sleep_gnome() {
    have dconf || return 0
    if ! pkg_installed gnome-shell && ! pkg_installed gdm3; then
        return 0
    fi

    info "GNOME path:"

    # The profile decides whether the system database is consulted at all. Only written if absent —
    # replacing an existing profile could drop a database somebody else's configuration depends on.
    if [ -f /etc/dconf/profile/user ]; then
        if grep -q '^system-db:local$' /etc/dconf/profile/user; then
            skip "/etc/dconf/profile/user already reads system-db:local"
        else
            warn "/etc/dconf/profile/user exists but does not read 'system-db:local', so the GNOME
             idle and lock settings written below will be ignored. Add the line 'system-db:local'
             to that file and run 'sudo dconf update'."
        fi
    else
        local prof="${WORK_DIR}/dconf-profile"
        printf 'user-db:user\nsystem-db:local\n' > "${prof}"
        place_root_file "${prof}" /etc/dconf/profile/user 0644 || true
    fi

    local db="${WORK_DIR}/dconf-vessel"
    cat > "${db}" <<'EOF'
# Written by scripts/thinkcentre-setup.sh for the Vessel sharing host.
# A locked screen is a stopped share, and GNOME locks by default after five minutes.
[org/gnome/desktop/session]
idle-delay=uint32 0

[org/gnome/desktop/screensaver]
lock-enabled=false
idle-activation-enabled=false

[org/gnome/settings-daemon/plugins/power]
sleep-inactive-ac-type='nothing'
sleep-inactive-battery-type='nothing'
idle-dim=false
EOF
    place_root_file "${db}" /etc/dconf/db/local.d/00-vessel-no-idle 0644 || true

    # Locked, so a stray click in the Settings app cannot switch the screen lock back on and stop
    # the machine sharing three weeks later.
    local locks="${WORK_DIR}/dconf-locks"
    cat > "${locks}" <<'EOF'
# Written by scripts/thinkcentre-setup.sh — these are not the operator's to change on this box.
/org/gnome/desktop/session/idle-delay
/org/gnome/desktop/screensaver/lock-enabled
/org/gnome/desktop/screensaver/idle-activation-enabled
/org/gnome/settings-daemon/plugins/power/sleep-inactive-ac-type
EOF
    place_root_file "${locks}" /etc/dconf/db/local.d/locks/00-vessel 0644 || true

    sudo dconf update
    info "GNOME idle, lock and sleep settings written to the system dconf database and locked"
}

# ---------------------------------------------------------------------------------------------
# Clock.
#
# This is not housekeeping. The operator signs in on this machine, and sign-in is password + TOTP
# (SPEC-ACCOUNTS.md §3). TOTP is a function of the clock: a box whose time has drifted past the
# window cannot sign in at all, and the error it gets is "wrong code", which sends you looking at
# the phone rather than at the machine.
# ---------------------------------------------------------------------------------------------

configure_time_sync() {
    log "Making sure the clock is disciplined"

    if systemctl is-active --quiet systemd-timesyncd 2>/dev/null \
       || systemctl is-active --quiet chrony 2>/dev/null \
       || systemctl is-active --quiet ntpsec 2>/dev/null; then
        skip "a time sync service is already running"
    else
        if ! pkg_installed systemd-timesyncd && pkg_exists systemd-timesyncd; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y systemd-timesyncd
        fi
        sudo timedatectl set-ntp true 2>/dev/null || true
        sudo systemctl enable --now systemd-timesyncd 2>/dev/null || true
        if systemctl is-active --quiet systemd-timesyncd 2>/dev/null; then
            info "enabled network time synchronisation"
        else
            warn "Could not start a time sync service. This is not cosmetic: sign-in on this
             machine is password + TOTP, TOTP is a function of the clock, and a drifted clock
             fails with 'wrong code' — which sends you looking at your phone rather than at the
             machine. Fix it before pairing: 'sudo apt install systemd-timesyncd' then
             'sudo timedatectl set-ntp true'."
        fi
    fi

    local synced
    synced="$(first_or unknown timedatectl show -p NTPSynchronized --value)"
    info "NTP synchronised: ${synced}"
    case "${synced}" in
        yes) ;;
        no)  warn "The clock is not synchronised yet. Give it a minute; if it stays 'no', sign-in
             on this machine will fail on the TOTP step with a misleading 'wrong code'." ;;
        *)   warn "Could not determine whether the clock is synchronised (timedatectl said
             '${synced}'). Check it by hand before pairing — a drifted clock fails sign-in with
             'wrong code'." ;;
    esac
}

# ---------------------------------------------------------------------------------------------
# The kiosk: a launcher, plus a systemd *user* service that keeps it alive.
#
# Why a user service and not a system one. The browser has to run inside the logged-in graphical
# session, as the user who owns it, with that user's Chromium profile — and the profile is not
# incidental here. The persisted directory handle from showDirectoryPicker() lives in that
# profile's IndexedDB (§8), so the profile *is* the pairing. A system service running as root, or
# as the user but outside the session, either cannot reach the display at all or reaches it with
# the wrong profile, and the symptom of the latter is the quietest failure available: the browser
# starts, the page loads, and the folder is not there.
# ---------------------------------------------------------------------------------------------

write_launcher() {
    log "Writing the kiosk launcher"

    mkdir -p "$(dirname "${LAUNCHER}")" "${CONFIG_DIR}"

    if [ -f "${URL_FILE}" ]; then
        skip "${URL_FILE} exists, keeping $(cat "${URL_FILE}")"
    else
        printf '%s\n' "${KIOSK_URL}" > "${URL_FILE}"
        chmod 0644 "${URL_FILE}"
        info "wrote ${URL_FILE} (${KIOSK_URL})"
    fi

    local tmp="${WORK_DIR}/launcher"
    cat > "${tmp}" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
#
# Vessel sharing-host kiosk launcher. Written by scripts/thinkcentre-setup.sh — change where the
# kiosk points by editing ~/.config/vessel-kiosk/url and restarting the service, not by editing
# this file.
#
# This is a script rather than a bare ExecStart line because two things have to happen before
# Chromium is exec'd, and systemd can do neither: wait for a graphical session to exist, and clear
# Chromium's crash flag.

set -euo pipefail

CONFIG_DIR="${HOME}/.config/vessel-kiosk"
URL_FILE="${CONFIG_DIR}/url"
URL="$(cat "${URL_FILE}" 2>/dev/null || echo about:blank)"

log() { printf 'vessel-kiosk: %s\n' "$*"; }

if [ "${URL}" = "about:blank" ]; then
    log "URL is about:blank. Put the real sharing URL in ${URL_FILE} and restart this service."
fi

# ---- Wait for a display -----------------------------------------------------------------------
# The user manager starts at boot because lingering is enabled, and it starts well before the
# desktop has a compositor. Starting Chromium into a display that is not there yet is a crash loop
# that resolves itself eventually, fills the journal with noise, and trains whoever reads the
# journal to ignore it.
#
# Both display kinds are checked because the session type depends on the desktop: Xfce is X11,
# GNOME defaults to Wayland. Under Wayland, Chromium runs as an X client through XWayland by
# default, so DISPLAY is exported either way.
found=""
for _ in $(seq 1 120); do
    if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
        # An unmatched glob comes back as the literal pattern, so every candidate is tested with
        # -S rather than trusted. The .lock files beside the sockets fail that test on their own.
        for sock in "${XDG_RUNTIME_DIR}"/wayland-[0-9]*; do
            if [ -S "${sock}" ]; then
                WAYLAND_DISPLAY="$(basename "${sock}")"
                export WAYLAND_DISPLAY
                found="wayland"
            fi
        done
    fi
    if [ -z "${found}" ]; then
        for xsock in /tmp/.X11-unix/X[0-9]*; do
            if [ -S "${xsock}" ]; then
                DISPLAY=":${xsock##*/X}"
                export DISPLAY
                found="x11"
                break
            fi
        done
    fi
    [ -n "${found}" ] && break
    sleep 1
done

if [ -z "${found}" ]; then
    log "No Wayland or X11 display appeared within two minutes. Is autologin working?"
    log "Check: loginctl list-sessions"
    exit 1
fi

export DISPLAY="${DISPLAY:-:0}"

# The X cookie. With lingering, this service starts from a user manager that inherited no session
# environment at all, so nothing has set XAUTHORITY. Under LightDM the fallback to ~/.Xauthority
# happens to work; under gdm3 the cookie lives in /run/user/UID/gdm/Xauthority and ~/.Xauthority
# does not exist, so Chromium exits with "Authorization required" and the unit crash-loops every
# five seconds for ever — while systemd reports the unit enabled and everything looks fine.
if [ -z "${XAUTHORITY:-}" ]; then
    for xauth in "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gdm/Xauthority" \
                 "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/Xauthority" \
                 "${HOME}/.Xauthority"; do
        if [ -r "${xauth}" ]; then
            export XAUTHORITY="${xauth}"
            break
        fi
    done
fi

log "Display ready (${found}), DISPLAY=${DISPLAY}, WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset}, XAUTHORITY=${XAUTHORITY:-unset}"

# Belt and braces on the blanking, from inside the session this time.
if command -v xset >/dev/null 2>&1; then
    xset s off 2>/dev/null || true
    xset s noblank 2>/dev/null || true
    xset -dpms 2>/dev/null || true
fi

# ---- Clear Chromium's crash flag --------------------------------------------------------------
# This is the single most important block in the file.
#
# When Chromium does not exit cleanly — a power cut, an OOM kill, a hung compositor — it comes back
# showing a "Restore pages?" bubble. On a desktop that is helpful. On an unattended sharing host it
# is fatal in the quietest way available: the browser is running, the process is up, systemd is
# satisfied, and the tab holding the directory handle is not open. Somebody is told their machine
# is offline and nothing on this box indicates a problem.
#
# The command-line flags below are the documented way to suppress it and have both been renamed at
# least once in Chromium's history, so relying on a flag name surviving an apt upgrade is not
# enough. Rewriting the profile's exit state is the belt: Chromium only offers restore when it
# finds exit_type != "Normal" at startup, so we tell it the last exit was clean before it looks.
# jq rather than sed because Preferences is a single-line JSON document and a regex matching
# "exited_cleanly" also matches it inside unrelated nested objects.
for prefs in "${HOME}/.config/chromium/Default/Preferences" \
             "${HOME}/.config/chromium/Profile "*"/Preferences"; do
    [ -f "${prefs}" ] || continue
    command -v jq >/dev/null 2>&1 || break
    # Beside the file and renamed into place, never truncated in place
    # (2026-09-07, audit item 48): this runs at every service start, and a
    # power cut mid-write left a truncated Preferences that Chromium discards —
    # taking the persistent folder grant with it, which is the trip to the
    # machine the profile-is-the-pairing rule exists to avoid.
    tmp="$(mktemp "${prefs}.XXXXXX")"
    if jq '.profile.exit_type = "Normal" | .profile.exited_cleanly = true' "${prefs}" > "${tmp}" 2>/dev/null \
       && [ -s "${tmp}" ]; then
        chmod --reference="${prefs}" "${tmp}" 2>/dev/null || true
        mv -f "${tmp}" "${prefs}"
        log "Reset the exit state in ${prefs}."
    else
        log "Could not rewrite ${prefs}; relying on the command-line flags alone."
    fi
    rm -f "${tmp}"
done

# ---- Wait for the site ------------------------------------------------------------------------
# Every flag below addresses the browser PROCESS being wrong. None of them addresses the PAGE being
# wrong, and that is the likelier failure on this machine: if the site is unreachable at the moment
# Chromium starts — a router still booting, DNS not up yet, a blip during the Sunday upgrade
# restart — Chromium renders an ERR_ page and sits on it for ever. The process is up, systemd is
# satisfied, and nobody is sharing.
#
# Two answers. This is the first: do not start until the site answers. The second is
# vessel-kiosk-watchdog, which restarts the tab if the site goes away and comes back later.
if [ "${URL}" != "about:blank" ] && command -v curl >/dev/null 2>&1; then
    for attempt in $(seq 1 60); do
        if curl -fsS --max-time 5 -o /dev/null -- "${URL}" 2>/dev/null; then
            log "Site answered after ${attempt} attempt(s)."
            break
        fi
        if [ "${attempt}" -eq 60 ]; then
            log "Site did not answer in five minutes; starting anyway so the screen is not blank."
            log "vessel-kiosk-watchdog will restart this once the site comes back."
        fi
        sleep 5
    done
fi

# ---- Hide the pointer -------------------------------------------------------------------------
# Best-effort and fully detached: if the compositor draws its own cursor this does nothing, and
# failure is not interesting enough to stop the browser starting.
if command -v unclutter >/dev/null 2>&1 && ! pgrep -u "$(id -u)" -x unclutter >/dev/null 2>&1; then
    (unclutter -idle 0 >/dev/null 2>&1 &) || true
fi

# ---- Find the browser -------------------------------------------------------------------------
# Absolute paths first, and `command -v` only as a fallback. /usr/local/bin comes ahead of /usr/bin
# in the default PATH and is group-writable by `staff` on Debian, so a plain `command -v chromium`
# lets anyone in that group choose which binary holds the directory handle.
CHROMIUM=""
for candidate in /usr/bin/chromium /usr/bin/chromium-browser \
                 /usr/bin/google-chrome-stable /usr/bin/google-chrome; do
    if [ -x "${candidate}" ]; then
        CHROMIUM="${candidate}"
        break
    fi
done
if [ -z "${CHROMIUM}" ]; then
    for candidate in chromium chromium-browser google-chrome-stable google-chrome; do
        if command -v "${candidate}" >/dev/null 2>&1; then
            CHROMIUM="$(command -v "${candidate}")"
            log "Falling back to ${CHROMIUM}, which is not in /usr/bin."
            break
        fi
    done
fi
[ -n "${CHROMIUM}" ] || { log "No chromium binary found."; exit 1; }

# ---- Flags ------------------------------------------------------------------------------------
# Each earns its place; none is cargo-culted from a kiosk blog post.
#
#   --kiosk                       Fullscreen, no chrome, no way to navigate away by accident.
#   --no-first-run                Skips the welcome flow, which would otherwise sit in front of the
#                                 sharing page after a profile reset and block it for ever.
#   --no-default-browser-check    Same reasoning: an unanswerable modal on an unattended machine.
#   --noerrdialogs                Suppresses the modal error boxes, for the same reason again.
#   --disable-session-crashed-bubble
#   --hide-crash-restore-bubble   The two names this feature has had. See the exit_type note above;
#                                 these are braces to that belt, not a substitute for it.
#   --disable-infobars            Keeps notification bars from stealing height from the page.
#   --disable-features=…          The translate prompt is another modal nobody is here to dismiss.
#   --password-store=basic        Without this Chromium tries to talk to gnome-keyring and can
#                                 block on an unlock prompt in an autologin session — a browser
#                                 waiting on a dialog nobody will ever see.
#   --disable-background-timer-throttling
#   --disable-backgrounding-occluded-windows
#   --disable-renderer-backgrounding
#                                 These three matter more here than anywhere else. The sharing tab
#                                 holds a WebSocket to the signalling service and answers over a
#                                 data channel; a throttled timer means missed keepalives and a
#                                 connection that looks alive from this end and dead from the
#                                 other. A kiosk window is normally foreground, but a compositor
#                                 that considers the output occluded — which is exactly what a
#                                 headless box with no monitor may report — trips the backgrounding
#                                 path.
#
# NOT here, deliberately:
#   --no-sandbox                  Half the kiosk guides on the internet include it to make an
#                                 error go away. It turns off the renderer sandbox, on the one
#                                 machine in this design that holds a handle to your files. If
#                                 Chromium will not start without it, fix the actual cause.
#   --user-data-dir / --incognito The default profile is the pairing: the persisted directory
#                                 handle lives in its IndexedDB. A fresh profile per launch drops
#                                 the handle on every restart and turns a two-minute reboot into a
#                                 trip to the machine with a mouse. If you ever feel like adding
#                                 --user-data-dir, read this paragraph again first.
#   --disable-web-security        Never. It would disable the same-origin policy on the browser
#                                 that is signed in as the operator.
#
# The `--` before the URL is what makes the three paragraphs above hold. ${URL} is the first line
# of a 0644 file, and without a terminator Chromium reads a line beginning with a dash as a FLAG
# rather than an address — so `--no-sandbox`, `--user-data-dir=/tmp/x` or `--incognito` typed into
# that file is every never-do listed here, reachable by editing one file nobody guards.
exec "${CHROMIUM}" \
    --kiosk \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --hide-crash-restore-bubble \
    --disable-infobars \
    --disable-features=Translate,TranslateUI \
    --password-store=basic \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    -- "${URL}"
LAUNCHER_EOF

    place_user_file "${tmp}" "${LAUNCHER}" 0755 || true
}

write_unit() {
    log "Installing the ${SERVICE_NAME} user service"

    local tmp="${WORK_DIR}/unit"
    cat > "${tmp}" <<'UNIT_EOF'
# Vessel sharing-host kiosk. Written by scripts/thinkcentre-setup.sh.
#
# This is a *user* unit, in ~/.config/systemd/user, and that is a decision rather than a
# convenience — see the long comment in the script. The short version: the browser must run as the
# session's user with the session's Chromium profile, because that profile's IndexedDB holds the
# persisted directory handle. A system unit gets the display wrong, the profile wrong, or both.

[Unit]
Description=Vessel sharing host — Chromium kiosk
# The default start rate limit gives up after five restarts in ten seconds and leaves the unit
# failed. On a machine whose entire job is to keep one tab open, "gave up" is never the right
# answer; the launcher already waits for a display rather than spinning, so a genuine crash loop
# will be slow enough to see in the journal without systemd's help.
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%h/.local/bin/vessel-kiosk
# Restart=always rather than on-failure: Chromium exiting cleanly — because somebody pressed the
# wrong key, or an upgrade replaced the binary under it — must also bring the tab back.
Restart=always
RestartSec=5
# Chromium spawns a tree of zombie-prone helper processes; control-group kill is the only way to
# be sure a restart starts from nothing.
KillMode=control-group
TimeoutStopSec=20

# NOTE FOR WHOEVER HARDENS THIS LATER: do not add NoNewPrivileges=yes, PrivateUsers=yes,
# ProtectHome= or a SystemCallFilter here. Chromium's own sandbox needs user namespaces and, on
# some configurations, a setuid helper; those directives break it, and the usual "fix" people
# reach for next is --no-sandbox, which is strictly worse than an unhardened unit. The security
# boundary that matters on this machine is the browser sandbox, not the systemd one.

[Install]
# default.target rather than graphical-session.target: a desktop session does not reliably tell
# the user systemd instance that a graphical session has begun, which produces a unit that is
# enabled, correct, and never starts. The launcher does its own waiting instead.
WantedBy=default.target
UNIT_EOF

    place_user_file "${tmp}" "${UNIT_FILE}" 0644 || true

    systemctl --user daemon-reload
    if systemctl --user is-enabled "${SERVICE_NAME}.service" >/dev/null 2>&1; then
        skip "${SERVICE_NAME}.service is already enabled"
    else
        systemctl --user enable "${SERVICE_NAME}.service" >/dev/null
        info "enabled ${SERVICE_NAME}.service"
    fi
}

# ---------------------------------------------------------------------------------------------
# The watchdog.
#
# The second half of the answer to "the process is up and the page is an error". Chromium cannot be
# asked from outside what it is displaying — not without opening the remote-debugging port, which
# hands full control of the browser to anything that can reach it and is precisely the kind of hole
# this script exists to avoid. So the watchdog watches the thing it CAN see: whether the site is
# reachable from this machine.
#
# It restarts the kiosk on one transition only — unreachable, then reachable — which is exactly the
# case where the tab is stranded on an error page and would stay there. It does nothing while the
# site is up, and nothing while it is down, so it cannot loop and cannot restart the tab under
# somebody mid-transfer for any other reason.
# ---------------------------------------------------------------------------------------------

write_watchdog() {
    log "Installing the kiosk watchdog"

    local wd="${WORK_DIR}/watchdog"
    cat > "${wd}" <<'WATCHDOG_EOF'
#!/usr/bin/env bash
#
# vessel-kiosk-watchdog. Written by scripts/thinkcentre-setup.sh.
#
# Restarts the kiosk when the site becomes reachable after having been unreachable — and only then.
# See the long comment in the setup script for why this is the shape of the answer.

set -euo pipefail

URL="$(cat "${HOME}/.config/vessel-kiosk/url" 2>/dev/null || echo about:blank)"
STATE_DIR="${HOME}/.local/state/vessel-kiosk"
STATE="${STATE_DIR}/reachable"
mkdir -p "${STATE_DIR}"

[ "${URL}" = "about:blank" ] && exit 0
command -v curl >/dev/null 2>&1 || exit 0

previous="$(cat "${STATE}" 2>/dev/null || echo unknown)"

if curl -fsS --max-time 10 -o /dev/null -- "${URL}" 2>/dev/null; then
    now="yes"
else
    now="no"
fi

printf '%s\n' "${now}" > "${STATE}"

# Only the no -> yes edge. "unknown" is the first ever run and must not restart anything.
if [ "${previous}" = "no" ] && [ "${now}" = "yes" ]; then
    echo "vessel-kiosk-watchdog: the site is reachable again; restarting the tab, which is"
    echo "                       otherwise stranded on whatever error page it loaded."
    systemctl --user restart vessel-kiosk
fi
WATCHDOG_EOF
    place_user_file "${wd}" "${WATCHDOG}" 0755 || true

    local svc="${WORK_DIR}/watchdog.service"
    cat > "${svc}" <<'EOF'
[Unit]
Description=Vessel sharing host — restart the kiosk when the site comes back

[Service]
Type=oneshot
ExecStart=%h/.local/bin/vessel-kiosk-watchdog
EOF
    place_user_file "${svc}" "${HOME}/.config/systemd/user/vessel-kiosk-watchdog.service" 0644 || true

    local tim="${WORK_DIR}/watchdog.timer"
    cat > "${tim}" <<'EOF'
[Unit]
Description=Vessel sharing host — kiosk watchdog, every ten minutes

[Timer]
OnBootSec=10min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
    place_user_file "${tim}" "${HOME}/.config/systemd/user/vessel-kiosk-watchdog.timer" 0644 || true

    systemctl --user daemon-reload
    if systemctl --user is-enabled vessel-kiosk-watchdog.timer >/dev/null 2>&1; then
        skip "vessel-kiosk-watchdog.timer is already enabled"
    else
        systemctl --user enable vessel-kiosk-watchdog.timer >/dev/null
        info "enabled vessel-kiosk-watchdog.timer (every ten minutes)"
    fi
}

enable_linger() {
    log "Enabling lingering for ${USER}"

    # Without lingering, the user systemd instance exists only while the user is logged in and is
    # torn down when the last session ends. With autologin that is *usually* fine, but "usually"
    # is doing a lot of work: a session that fails to start, or a desktop that restarts, leaves
    # the user manager down and the kiosk unit unstarted, with no error anywhere obvious.
    if [ "$(first_or no loginctl show-user "${USER}" --property=Linger --value)" = "yes" ]; then
        skip "lingering is already enabled"
    else
        sudo loginctl enable-linger "${USER}"
        info "lingering enabled — the user manager now starts at boot"
    fi
}

# ---------------------------------------------------------------------------------------------
# The Chromium managed policy.
#
# This is the answer to the autologin trade-off. The machine boots into a signed-in browser that
# anyone at the keyboard can reach, so the browser is narrowed to the one thing it is for: this
# host's Chromium can reach the sharing site and nothing else, cannot save a password, cannot sign
# in to a Google account or sync the profile — which is the profile holding the directory handle
# and the session — and has no DevTools to read them out of.
#
# It is a system-wide policy under /etc/chromium/policies/managed, which the browser reads at
# startup and the user cannot override from inside the browser. Remove the file to undo it.
# ---------------------------------------------------------------------------------------------

configure_chromium_policy() {
    log "Locking Chromium down with a managed policy"

    if [ "${DO_CHROMIUM_POLICY}" -eq 0 ]; then
        info "skipped (--no-chromium-policy)"
        POLICY_STATE="not installed (--no-chromium-policy)"
        MANUAL+=("The Chromium managed policy was skipped. This host autologins into a signed-in
             browser, so nothing stops somebody at the keyboard browsing elsewhere in the profile
             that holds your session. Re-run without --no-chromium-policy unless that is
             deliberate.")
        return
    fi

    local url host scheme
    url="$(cat "${URL_FILE}" 2>/dev/null || printf '%s' "${KIOSK_URL}")"
    host="$(url_host "${url}")"

    if [ -z "${host}" ] || [ "${url}" = "about:blank" ]; then
        warn "The kiosk URL has no host (${url}), so the navigation allowlist was not written.
             Set a real URL and re-run."
        POLICY_STATE="NOT WRITTEN — the kiosk URL has no host"
        return
    fi

    # The URL was validated when it was parsed — but this one was read back from a file the script
    # deliberately never overwrites, so it may have been edited by hand since. Its host is about to
    # be interpolated into a JSON security control, and the failure mode is quiet: a malformed
    # policy file is IGNORED by Chromium, which would leave this host wide open while the summary
    # below said it was locked down. Refuse, never repair.
    #
    # THE SCHEME IS INTERPOLATED TOO, and it used to come off the same untrusted line by string
    # surgery — `scheme="${url%%://*}"` — with no validation at all. A crafted first line in
    # ${URL_FILE} closed the JSON string and reopened the object, so `"URLAllowlist":["*"]` was
    # writable from a 0644 file this script deliberately never overwrites, and the result still
    # passed the `jq empty` gate below while the summary reported the policy as written. Every
    # other key — DeveloperToolsAvailability, DefaultFileSystemWriteGuardSetting — went the same
    # way. It is matched against a closed set now, never extracted.
    case "${url}" in
        https://*) scheme="https" ;;
        http://*)  scheme="http" ;;
        *)
            POLICY_STATE="NOT WRITTEN — the URL in ${URL_FILE} is not http or https"
            warn "The URL in ${URL_FILE} does not begin http:// or https://, so this script will not
             put it into a Chromium policy: '${url}'. The browser lockdown was NOT written. Fix
             that file — one line, the full URL — and run this again."
            return
            ;;
    esac

    if ! printf '%s' "${host}" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$'; then
        # A warn-and-return rather than a die, deliberately: this step runs after packages,
        # autologin, the launcher, the unit and lingering, and BEFORE the firewall and sshd. Dying
        # here would leave a half-configured machine and no summary explaining which half.
        POLICY_STATE="NOT WRITTEN — the host in ${URL_FILE} is not usable in a policy"
        warn "The URL in ${URL_FILE} has a host this script will not put into a Chromium policy:
             '${host}'. The browser lockdown was NOT written. Fix that file — one line, the full
             URL — and run this again."
        return
    fi

    local tmp="${WORK_DIR}/policy.json"
    cat > "${tmp}" <<EOF
{
  "_comment": "Written by scripts/thinkcentre-setup.sh for the Vessel sharing host. Delete this file to undo it.",
  "_comment_allowlist": "The leading dot means this host EXACTLY, not its subdomains, and the scheme is pinned. Chromium's filter format matches subdomains and every scheme unless you say otherwise, so a bare host here would have allowed http://anything.example on the one machine holding the operator's session.",

  "URLBlocklist": ["*"],
  "URLAllowlist": ["${scheme}://.${host}"],

  "IncognitoModeAvailability": 1,
  "BrowserSignin": 0,
  "SyncDisabled": true,
  "PasswordManagerEnabled": false,
  "PasswordLeakDetectionEnabled": false,
  "AutofillAddressEnabled": false,
  "AutofillCreditCardEnabled": false,
  "DeveloperToolsAvailability": 2,
  "BackgroundModeEnabled": false,
  "MetricsReportingEnabled": false,
  "SafeBrowsingExtendedReportingEnabled": false,
  "SearchSuggestEnabled": false,
  "SpellCheckServiceEnabled": false,
  "TranslateEnabled": false,
  "PrintingEnabled": false,
  "ShowHomeButton": false,
  "BookmarkBarEnabled": false,
  "DefaultBrowserSettingEnabled": false,
  "PromptForDownloadLocation": false,
  "ExtensionInstallBlocklist": ["*"],

  "SafeBrowsingProtectionLevel": 1,
  "DefaultPopupsSetting": 2,
  "DefaultNotificationsSetting": 2,
  "DefaultGeolocationSetting": 2,
  "AudioCaptureAllowed": false,
  "VideoCaptureAllowed": false,
  "ScreenCaptureAllowed": false,
  "DefaultSensorsSetting": 2,
  "DefaultSerialGuardSetting": 2,
  "DefaultWebUsbGuardSetting": 2,
  "DefaultWebBluetoothGuardSetting": 2,
  "DefaultFileSystemReadGuardSetting": 3,
  "DefaultFileSystemWriteGuardSetting": 2
}
EOF

    # Validate before installing. A malformed policy file is ignored silently by Chromium, which
    # would leave this host unlocked while the summary claims otherwise.
    if have jq; then
        jq empty "${tmp}" >/dev/null 2>&1 || die "The generated Chromium policy is not valid JSON. This is a bug in this script."
    fi

    # POLICY_STATE IS BUILT FROM THE WRITE, NOT FROM THE LOOP. It used to append the path on every
    # iteration regardless of what place_root_file did, so a policy that never reached the disk was
    # reported by print_summary as installed — a browser with no URLBlocklist, DevTools on and sync
    # on, described in the CONFIGURED block as locked down. That is the one summary line an
    # operator reads as the state of the machine.
    local dir written="" failed="" rc
    while read -r dir; do
        [ -n "${dir}" ] || continue
        rc=0; place_root_file "${tmp}" "${dir}/${POLICY_NAME}" 0644 || rc=$?
        if [ "${rc}" -le 1 ]; then
            written="${written}${written:+, }${dir}/${POLICY_NAME}"
        else
            failed="${failed}${failed:+, }${dir}/${POLICY_NAME}"
        fi
    done < <(policy_dirs)
    POLICY_WRITTEN="${written}"

    if [ -n "${failed}" ]; then
        POLICY_STATE="NOT WRITTEN to ${failed}${written:+ (written to ${written})}"
        warn "The Chromium managed policy could not be placed at ${failed}. This host autologins
             into a signed-in browser and that policy is what stops somebody at the keyboard
             browsing elsewhere in the profile holding your session. Fix the cause and re-run."
        MANUAL+=("The Chromium managed policy was NOT written to ${failed}. Until it is, the browser
             on this machine has no navigation allowlist, DevTools are available and sync is not
             blocked.")
        return
    fi

    if [ -z "${written}" ]; then
        POLICY_STATE="NOT WRITTEN — no managed-policy directory to write to"
        warn "No Chromium managed-policy directory was found, so the browser lockdown was NOT written."
        return
    fi

    POLICY_STATE="${written}"

    info "navigation is limited to ${scheme}://${host} exactly; DevTools, sync, sign-in, extensions and the password"
    info "manager are off; file-system READ prompts are still allowed (3 = ask) because that is"
    info "the folder picker this whole machine exists to answer, and WRITE is blocked (2) because"
    info "§8 shares read-only."

    MANUAL+=("If you later point the kiosk at a different host, re-run this script — the policy's
             allowlist names the old host and the browser will refuse to load the new one.")
}

# ---------------------------------------------------------------------------------------------
# Updates.
#
# Two halves that pull in opposite directions, and the split between them is the whole design:
#
#   - Everything except the browser is upgraded automatically, security-only, unattended.
#   - The browser is upgraded on a schedule you pick, and the kiosk is restarted immediately
#     afterwards so it is running the binary that is actually on disk.
#
# Why the browser is special: on Debian, Chromium security updates come through the same
# bookworm-security origin as everything else, so leaving it to unattended-upgrades means the
# binary under a running browser is replaced at 6am on a day nobody chose, possibly mid-transfer,
# and the tab then runs on files that no longer exist until something restarts it. Blacklisting it
# without replacing the schedule is worse — an un-patched browser holding a handle to your files
# is a genuine hole, not a trade-off. So: blacklist, then own the window.
# ---------------------------------------------------------------------------------------------

configure_unattended_upgrades() {
    log "Configuring unattended security updates"

    local tmp="${WORK_DIR}/20auto-upgrades"
    cat > "${tmp}" <<'EOF'
// Written by scripts/thinkcentre-setup.sh for the Vessel sharing host.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
    place_root_file "${tmp}" /etc/apt/apt.conf.d/20auto-upgrades 0644 || true

    local tmp2="${WORK_DIR}/52vessel"
    cat > "${tmp2}" <<'EOF'
// Written by scripts/thinkcentre-setup.sh for the Vessel sharing host.
//
// The allowed origins are left at Debian's stock list, which is security updates only. Two things
// are overridden here and both are about the same failure: a machine that reboots or replaces a
// running browser without being asked.

// Never reboot on our own. A reboot takes the sharing tab with it, at whatever hour the timer
// happens to fire, and the person on the other end sees a machine that went offline.
Unattended-Upgrade::Automatic-Reboot "false";

// Chromium is excluded here and upgraded by vessel-chromium-update.timer instead, which restarts
// the kiosk afterwards. Without the exclusion, an unattended upgrade replaces the binary under a
// running browser at a time nobody picked. The pattern is a regex, so it covers chromium-common
// and chromium-sandbox too.
Unattended-Upgrade::Package-Blacklist {
    "chromium";
};

Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
    place_root_file "${tmp2}" /etc/apt/apt.conf.d/52vessel-unattended-upgrades 0644 || true

    sudo systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
    info "unattended-upgrades: enabled, security origins only, no automatic reboot"
}

configure_chromium_update_timer() {
    log "Giving Chromium its own upgrade window"

    if [ "${DO_AUTO_CHROMIUM}" -eq 0 ]; then
        info "skipped (--no-auto-chromium)"
        sudo systemctl disable --now vessel-chromium-update.timer >/dev/null 2>&1 || true
        MANUAL+=("Chromium is excluded from unattended upgrades and its timer was skipped, so it
             will never be patched unless you do it. Put this on a schedule you actually keep:
                 sudo apt update && sudo apt install --only-upgrade chromium
                 systemctl --user restart ${SERVICE_NAME}
             An un-patched browser holding a handle to your files is a real exposure, not a
             theoretical one.")
        return
    fi

    # This file is sourced AS ROOT by ${UPDATER} on a weekly timer, so every value is quoted and
    # the account name is checked first. An unquoted assignment in an unquoted heredoc puts
    # whatever ${USER} happens to be straight into a root shell's parse.
    case "${USER}" in
        *[!A-Za-z0-9_-]*|"")
            die "This account's name has characters this script will not write into a file that
       root sources: '${USER}'. Letters, digits, underscore and hyphen only."
            ;;
    esac

    local tmp="${WORK_DIR}/vessel-kiosk.default"
    cat > "${tmp}" <<EOF
# Written by scripts/thinkcentre-setup.sh. Read by ${UPDATER}.
# The kiosk runs as a systemd *user* service, so the updater needs to know whose.
VESSEL_KIOSK_USER="${USER}"
VESSEL_KIOSK_UID="$(id -u)"
VESSEL_KIOSK_SERVICE="${SERVICE_NAME}"
EOF
    place_root_file "${tmp}" "${UPDATER_ENV}" 0644 || true

    local up="${WORK_DIR}/vessel-chromium-update"
    cat > "${up}" <<'UPDATER_EOF'
#!/usr/bin/env bash
#
# Upgrade Chromium, and restart the kiosk if — and only if — the version actually changed.
# Written by scripts/thinkcentre-setup.sh. Run by vessel-chromium-update.timer.
#
# The restart is the point. Chromium is deliberately excluded from unattended-upgrades so the
# binary is never replaced under a running browser at an hour nobody chose; that exclusion is only
# safe if something else patches it, and patching it is only complete if the tab comes back on the
# new binary.

set -euo pipefail

# Written as an if rather than `[ -r f ] && . f`: under `set -e` the second form's failure is
# exempt only because it is the left-hand side of an AND-list, which is a subtlety nobody should
# have to know to read this file.
if [ -r /etc/default/vessel-kiosk ]; then
    # shellcheck disable=SC1091
    . /etc/default/vessel-kiosk
fi

KIOSK_USER="${VESSEL_KIOSK_USER:-}"
KIOSK_UID="${VESSEL_KIOSK_UID:-}"
KIOSK_SERVICE="${VESSEL_KIOSK_SERVICE:-vessel-kiosk}"

export DEBIAN_FRONTEND=noninteractive

pkg=""
for candidate in chromium chromium-browser; do
    if dpkg-query -W -f='${Status}' "${candidate}" 2>/dev/null | grep -q '^install ok installed$'; then
        pkg="${candidate}"
        break
    fi
done

if [ -z "${pkg}" ]; then
    echo "vessel-chromium-update: no chromium package is installed; nothing to do."
    exit 0
fi

before="$(dpkg-query -W -f='${Version}' "${pkg}" 2>/dev/null || true)"

apt-get update -qq
# --only-upgrade so this can never install something that was not already here, and never pulls a
# new package onto the machine as a side effect of a routine timer.
apt-get install -y --only-upgrade "${pkg}"

after="$(dpkg-query -W -f='${Version}' "${pkg}" 2>/dev/null || true)"

if [ "${before}" = "${after}" ]; then
    echo "vessel-chromium-update: ${pkg} unchanged at ${before}; kiosk left alone."
    exit 0
fi

echo "vessel-chromium-update: ${pkg} ${before} -> ${after}; restarting the kiosk."

if [ -z "${KIOSK_USER}" ] || [ -z "${KIOSK_UID}" ]; then
    echo "vessel-chromium-update: no kiosk user configured in /etc/default/vessel-kiosk;" >&2
    echo "                        the browser was upgraded but the tab is still on the old one." >&2
    exit 1
fi

# The kiosk is a user unit, so the restart has to happen inside that user's manager. Lingering
# guarantees the manager exists even with nobody logged in.
runuser -u "${KIOSK_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${KIOSK_UID}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${KIOSK_UID}/bus" \
    systemctl --user restart "${KIOSK_SERVICE}"

echo "vessel-chromium-update: kiosk restarted."
UPDATER_EOF
    place_root_file "${up}" "${UPDATER}" 0755 || true

    # An earlier version of this script installed the updater in /usr/local/sbin. Leaving it there
    # would leave a stale root-executed script in a directory the `staff` group can write to.
    if [ -f "${UPDATER_OLD}" ]; then
        sudo rm -f "${UPDATER_OLD}"
        info "removed the old ${UPDATER_OLD}"
    fi

    local svc="${WORK_DIR}/vessel-chromium-update.service"
    cat > "${svc}" <<EOF
[Unit]
Description=Vessel — upgrade Chromium and restart the kiosk
Documentation=file://${UPDATER}
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${UPDATER}
# Pinned, and this is the load-bearing line in the file. Without it the service inherits systemd's
# default PATH, which begins /usr/local/sbin:/usr/local/bin — both group-writable by `staff` on
# Debian — and the script below calls apt-get, dpkg-query and runuser unqualified. A planted
# /usr/local/sbin/apt-get would then be root at 04:00 on a Sunday.
Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin
NoNewPrivileges=false
EOF
    place_root_file "${svc}" /etc/systemd/system/vessel-chromium-update.service 0644 || true

    local tim="${WORK_DIR}/vessel-chromium-update.timer"
    cat > "${tim}" <<'EOF'
[Unit]
Description=Vessel — weekly Chromium upgrade window

[Timer]
# Sunday, 04:00. Change it to a time you would be happy for the sharing tab to blink out for ten
# seconds, because that is exactly what an upgrade does.
OnCalendar=Sun *-*-* 04:00:00
# A short random spread so a fleet of these does not hit the mirror at the same instant. Kept small
# on purpose: the window should stay a window.
RandomizedDelaySec=15m
# Persistent=false deliberately. Persistent=true would run a missed upgrade at the next boot — that
# is, at an arbitrary time on an arbitrary day, restarting the tab mid-afternoon. The whole point of
# this timer is that the restart happens when you chose, so a missed week waits for the next one.
Persistent=false

[Install]
WantedBy=timers.target
EOF
    place_root_file "${tim}" /etc/systemd/system/vessel-chromium-update.timer 0644 || true

    sudo systemctl daemon-reload
    sudo systemctl enable --now vessel-chromium-update.timer >/dev/null
    info "vessel-chromium-update.timer: Sundays at 04:00, restarts the kiosk only if the version moved"
}

# ---------------------------------------------------------------------------------------------
# Firewall.
#
# Default deny inbound, one exception, and the SSH exception is rate-limited rather than merely
# open. Everything on this box is meant for the LAN, and nothing on it should ever be forwarded
# from the internet.
# ---------------------------------------------------------------------------------------------

detect_lan() {
    LAN_IFACE="$(ip -o -4 route show to default 2>/dev/null | awk '{print $5; exit}' || true)"
    LAN_IP=""
    LAN_NET=""
    if [ -n "${LAN_IFACE}" ]; then
        LAN_IP="$(ip -o -4 addr show dev "${LAN_IFACE}" scope global 2>/dev/null \
                  | awk '{split($4, a, "/"); print a[1]; exit}' || true)"
        LAN_NET="$(ip -o -4 route show dev "${LAN_IFACE}" scope link proto kernel 2>/dev/null \
                   | awk '{print $1; exit}' || true)"
    fi
}

sshd_ports() {
    # Ask sshd what it actually believes rather than parsing the config by hand — a drop-in, a
    # Match block or a package default can all move the port, and the firewall rule has to match
    # the daemon or this locks you out of a machine that lives on a shelf.
    local ports=""
    ports="$(sudo sshd -T 2>/dev/null | awk '/^port /{print $2}' || true)"

    # From Debian 13 openssh is socket-activated by default, and then the listening port comes from
    # ssh.socket's ListenStream — `sshd -T` keeps reporting sshd_config's 22 regardless. Opening 22
    # and enabling the firewall on a box whose real port is elsewhere locks you out of a machine on
    # a shelf, over the connection you are sitting on. Take the union of both.
    if systemctl is-active --quiet ssh.socket 2>/dev/null; then
        local sock_ports
        sock_ports="$(systemctl show ssh.socket -p ListenStream --value 2>/dev/null \
                      | tr ' ' '\n' | sed -n 's/.*:\([0-9]\{1,5\}\)$/\1/p' || true)"
        if [ -n "${sock_ports}" ]; then
            ports="$(printf '%s\n%s\n' "${ports}" "${sock_ports}" | sort -un)"
        fi
    fi

    if [ -z "${ports}" ]; then
        ports="$(sudo awk '/^[[:space:]]*Port[[:space:]]+[0-9]+/{print $2}' /etc/ssh/sshd_config 2>/dev/null || true)"
    fi

    # NO `|| ports="22"` FALLBACK. There used to be one, and it made this function incapable of
    # returning nothing — which made the fail-closed `die` in configure_firewall, the one that says
    # "Enabling it without an SSH rule would lock you out", dead code that could never fire. On a
    # host whose real port is elsewhere and whose probes all missed, the guess opened 22, the
    # policy went to default deny incoming, and the connection the operator was sitting on was the
    # one that dropped. Returning nothing is the honest answer and the caller refuses on it.
    printf '%s\n' "${ports}"
}

configure_firewall() {
    log "Closing the machine down with ufw"

    if [ "${DO_FIREWALL}" -eq 0 ]; then
        info "skipped (--no-firewall)"
        MANUAL+=("The firewall was skipped. Confirm something else is denying inbound traffic to
             this box, and check the 'Listening on the network' section of this summary.")
        return
    fi

    if ! pkg_installed ufw; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ufw
    fi

    # Order matters and it is the only thing in this function that can go badly. The SSH rule goes
    # in BEFORE the policy is applied and before ufw is enabled, because the person running this is
    # almost certainly connected over SSH right now.
    local ssh_open=0 p
    while read -r p; do
        [ -n "${p}" ] || continue
        case "${p}" in
            ''|*[!0-9]*) continue ;;
        esac
        # 'limit' is 'allow' plus a rate limit: six connections from one address in thirty seconds
        # and the rest are dropped. That is the difference between an open SSH port and one that
        # can be brute-forced at speed.
        sudo ufw limit "${p}/tcp" comment 'SSH rate-limited (vessel-setup)' >/dev/null
        info "ufw: SSH allowed and rate-limited on ${p}/tcp"
        ssh_open=1
    done < <(sshd_ports)

    if [ "${ssh_open}" -eq 0 ]; then
        die "Could not work out which port sshd listens on, so the firewall was not enabled.
       Enabling it without an SSH rule would lock you out of this machine. Fix sshd or re-run
       with --no-firewall."
    fi

    sudo ufw default deny incoming >/dev/null
    sudo ufw default allow outgoing >/dev/null
    info "ufw: default deny incoming, allow outgoing"

    # mDNS, so vessel-host.local keeps resolving on the LAN. Restricted to the local subnet rather
    # than opened to the world — the difference is whether a guest network can enumerate this box.
    if pkg_installed avahi-daemon; then
        if [ -n "${LAN_NET:-}" ]; then
            sudo ufw allow from "${LAN_NET}" to any port 5353 proto udp comment 'mDNS LAN only (vessel-setup)' >/dev/null
            info "ufw: mDNS allowed from ${LAN_NET} only"
        else
            warn "avahi-daemon is installed but the LAN subnet could not be determined, so mDNS was
             not opened. vessel-host.local may stop resolving; use the IP address, or open 5353/udp
             by hand once you know the subnet."
        fi
    fi

    # `ufw status` answers "Status: active" or "Status: inactive", and the second CONTAINS the
    # first. A substring test here read a firewall that was off as one that was already on, and
    # then never enabled it — a machine that reported a closed firewall in its own summary and had
    # none. Compare the word, not a substring.
    local ufw_state
    ufw_state="$(first_or unknown sudo ufw status | awk '{print $2}')"
    if [ "${ufw_state}" = "active" ]; then
        skip "ufw is already active"
    else
        sudo ufw --force enable >/dev/null
        info "ufw enabled"
    fi
}

# ---------------------------------------------------------------------------------------------
# sshd.
#
# The one deliberately conservative step in the script. Locking a headless box's SSH down wrongly
# is a box you have to carry to a monitor, so: root login off and the brute-force surface narrowed
# always; password authentication disabled only when asked for AND only when there is a key that
# would still work.
# ---------------------------------------------------------------------------------------------

harden_ssh() {
    log "Hardening sshd"

    if ! pkg_installed openssh-server; then
        info "openssh-server is not installed; nothing to harden."
        SSHD_STATE="not applicable — openssh-server is not installed"
        return
    fi

    local disable_passwords=0
    local already_key_only=0
    if sudo sshd -T 2>/dev/null | grep -qi '^passwordauthentication no$'; then
        already_key_only=1
    fi

    # Three cases, and the distinction between the last two is the whole point.
    #
    # PRESERVING an existing key-only host needs no proof that a key exists: the host is
    # demonstrably being administered without passwords today, so whatever key is doing that works,
    # wherever it lives — a different account, an AuthorizedKeysFile somewhere else. Requiring
    # ~/.ssh/authorized_keys here would fall through to "leave passwords on", regenerate a drop-in
    # without the line, and put the password door back on a machine the operator had closed. That
    # is the regression this guard exists to prevent, so it must not reintroduce it.
    #
    # CREATING key-only is the transition that can lock somebody out of a box on a shelf, and that
    # one is refused unless there is a key here to come back in with.
    if [ "${DO_ALLOW_SSH_PASSWORDS}" -eq 1 ]; then
        info "--allow-ssh-passwords given: password authentication will be left enabled"
    elif [ "${already_key_only}" -eq 1 ]; then
        disable_passwords=1
        if [ "${DO_SSH_KEY_ONLY}" -eq 1 ]; then
            info "this host is already key-only; keeping it that way"
        else
            info "this host is already key-only; keeping password authentication off"
            info "(pass --allow-ssh-passwords if you genuinely want to turn it back on)"
        fi
    elif [ "${DO_SSH_KEY_ONLY}" -eq 1 ]; then
        local keys="${HOME}/.ssh/authorized_keys"
        if [ -s "${keys}" ] && grep -qE '^[[:space:]]*(ssh-|ecdsa-|sk-)' "${keys}"; then
            disable_passwords=1
            info "found a usable key in ${keys}; password authentication will be disabled"
        else
            warn "--ssh-key-only was asked for, but ${keys} has no usable public key in it.
             Password authentication has been LEFT ON: turning it off now would lock you out of a
             machine that has no keyboard attached. Copy a key over (ssh-copy-id) and re-run."
        fi
    fi

    local tmp="${WORK_DIR}/sshd-vessel.conf"
    {
        printf '%s\n' "# Written by scripts/thinkcentre-setup.sh for the Vessel sharing host."
        printf '%s\n' "# Delete this file and 'sudo systemctl reload ssh' to undo it."
        printf '%s\n' ""
        printf '%s\n' "# There is a real user with sudo on this box, and root has no password to log in with"
        printf '%s\n' "# anyway. This closes the single most-attacked account name on the internet."
        printf '%s\n' "PermitRootLogin no"
        printf '%s\n' ""
        printf '%s\n' "# An empty password is never a credential."
        printf '%s\n' "PermitEmptyPasswords no"
        printf '%s\n' ""
        printf '%s\n' "# Fewer tries per connection, and a shorter window to complete one. Together with ufw's"
        printf '%s\n' "# rate limit this makes online guessing pointlessly slow."
        printf '%s\n' "MaxAuthTries 4"
        printf '%s\n' "LoginGraceTime 30"
        printf '%s\n' ""
        printf '%s\n' "# X11 forwarding is off: nothing here needs it, and it is a hole into the session that"
        printf '%s\n' "# holds the operator's browser. Plain TCP forwarding is deliberately LEFT ON, because"
        printf '%s\n' "# the documented way to reach a VNC or the Pi-hole admin UI on this box is an SSH"
        printf '%s\n' "# tunnel rather than an open port."
        printf '%s\n' "X11Forwarding no"
        printf '%s\n' ""
        if [ "${disable_passwords}" -eq 1 ]; then
            printf '%s\n' "# Key-only, asked for with --ssh-key-only and only written because a usable key was"
            printf '%s\n' "# found in the running user's authorized_keys."
            printf '%s\n' "PasswordAuthentication no"
            printf '%s\n' "KbdInteractiveAuthentication no"
        else
            printf '%s\n' "# Password authentication is left on deliberately. Turn it off with --ssh-key-only once"
            printf '%s\n' "# a key is in place — locking yourself out of a headless box is worse than the thing it"
            printf '%s\n' "# fixes."
        fi
    } > "${tmp}"

    # sshd_config.d is included by default on bookworm and trixie, but not on every derivative, and
    # a drop-in nobody reads is a security control that silently does not exist.
    if ! sudo grep -qs '^[[:space:]]*Include[[:space:]]\+/etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config; then
        warn "/etc/ssh/sshd_config does not Include /etc/ssh/sshd_config.d/*.conf, so the drop-in
             would be ignored. sshd was left alone. Add the Include line at the TOP of
             sshd_config (order matters in sshd: first setting wins) and re-run."
        SSHD_STATE="NOT CONFIGURED — sshd_config has no Include line (see warnings)"
        return
    fi

    if place_root_file "${tmp}" "${SSHD_DROPIN}" 0644; then
        # Validate before reloading. An invalid config plus a reload is a daemon that refuses to
        # start on the next boot, on a machine with no keyboard.
        if sudo sshd -t 2>"${WORK_DIR}/sshd-test.err"; then
            if sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null; then
                info "sshd reloaded"
            elif systemctl is-active --quiet ssh.socket 2>/dev/null; then
                # Socket-activated: there is no long-lived daemon to reload, and every new
                # connection spawns a fresh sshd-session that reads the config. Saying "reloaded"
                # here would be the same message a genuinely failed reload prints.
                info "sshd is socket-activated; new connections pick the drop-in up with no reload"
            else
                warn "Neither 'systemctl reload ssh' nor 'reload sshd' succeeded, and ssh.socket is
             not active either. The drop-in is on disk but may not be live until a reboot."
            fi
        else
            sudo rm -f "${SSHD_DROPIN}"
            die "The sshd drop-in did not validate, so it was removed and sshd was left untouched.
       sshd -t said:
$(sed 's/^/       /' "${WORK_DIR}/sshd-test.err")"
        fi
    fi

    # Did it actually take? In sshd_config the FIRST value obtained wins, so a setting that
    # appears above the Include line beats anything in a drop-in — the file is written, the reload
    # succeeds, and the setting quietly does not apply. Ask the daemon what it now believes rather
    # than trusting that writing the file was enough.
    local effective
    effective="$(sudo sshd -T 2>/dev/null || true)"
    if [ -z "${effective}" ]; then
        SSHD_STATE="drop-in written; sshd -T could not be consulted to confirm it took"
    fi
    if [ -n "${effective}" ]; then
        if printf '%s\n' "${effective}" | grep -qi '^permitrootlogin no$'; then
            info "confirmed with sshd -T: root login is refused"
            SSHD_STATE="root login off, MaxAuthTries 4, X11 forwarding off"
            if [ "${disable_passwords}" -eq 1 ]; then
                SSHD_STATE="${SSHD_STATE}, passwords off"
            fi
        else
            SSHD_STATE="WRITTEN BUT NOT IN EFFECT — sshd -T disagrees (see warnings)"
            warn "sshd -T does not report 'permitrootlogin no' even though the drop-in was written.
             Something earlier in /etc/ssh/sshd_config sets it first, and in sshd the first value
             wins. Move the Include line above it."
        fi
        if [ "${disable_passwords}" -eq 1 ]; then
            if printf '%s\n' "${effective}" | grep -qi '^passwordauthentication no$'; then
                info "confirmed with sshd -T: password authentication is off"
            else
                SSHD_STATE="root login off — but PASSWORDS ARE STILL ON despite --ssh-key-only"
                warn "sshd -T still reports password authentication as ON. The drop-in was written
             but something earlier in sshd_config wins. Do NOT assume this host is key-only."
            fi
        fi
    fi

    if [ "${disable_passwords}" -eq 0 ]; then
        MANUAL+=("SSH still accepts passwords. Once you have copied a key over (ssh-copy-id
             ${USER}@\$(hostname)), re-run this script with --ssh-key-only to turn them off.")
    fi
}

# ---------------------------------------------------------------------------------------------
# Pi-hole, opt-in.
#
# Bundled home-server work rather than something the website needs, which is why it is off by
# default. Two things are done differently from every guide you will find, and both are security
# rather than taste:
#
#   1. Docker comes from Debian's own archive (docker.io), not from `curl | sudo sh`. Piping a
#      remote script into a root shell on the machine that holds your files is not a thing to do
#      casually, and Debian's package is patched by the same security updates as everything else.
#   2. Your user is NOT added to the `docker` group. Membership of that group is equivalent to
#      root — a container can mount the host filesystem — and this box autologins to a desktop.
#      Use `sudo docker`.
# ---------------------------------------------------------------------------------------------

install_pihole() {
    [ "${DO_PIHOLE}" -eq 1 ] || return 0

    log "Installing Docker and Pi-hole"

    if ! pkg_installed docker.io; then
        if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io; then
            warn "Could not install docker.io, so Pi-hole was skipped. Everything else on this
             machine is configured — Pi-hole is bundled home-server work, not something the
             website needs."
            return 0
        fi
    else
        skip "docker.io"
    fi
    sudo systemctl enable --now docker >/dev/null 2>&1 || true

    if sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx pihole; then
        skip "a container named 'pihole' already exists — left alone"
        return
    fi

    if [ -z "${LAN_IP:-}" ]; then
        warn "Could not determine this machine's LAN address, so Pi-hole was skipped — it must bind
             DNS to a specific address rather than to everything, because Docker's published ports
             bypass ufw. Give the box a static or reserved address and re-run with --with-pihole."
        return 0
    fi

    # Port 53 has to be free on the LAN address. systemd-resolved's stub listener sits on
    # 127.0.0.53:53 and does not conflict; anything on 0.0.0.0:53 does.
    if sudo ss -lntuH 2>/dev/null | awk '{print $5}' \
         | grep -Eq "^(0\.0\.0\.0|\*|\[::\]|${LAN_IP}):53$"; then
        warn "Something is already listening on port 53 on this address, so Pi-hole was skipped.
             'sudo ss -lntup | grep :53' will say what it is. (systemd-resolved's stub on
             127.0.0.53:53 does NOT match this test and is not the problem.)"
        return 0
    fi

    local admin_bind="127.0.0.1"
    if [ "${PIHOLE_ADMIN_LAN}" -eq 1 ]; then
        admin_bind="${LAN_IP}"
        warn "The Pi-hole admin UI is bound to the LAN address over plain HTTP. Its password will
             cross the network in the clear every time you log in. The default — localhost only,
             reached through an SSH tunnel — costs one extra command and has none of that."
    fi

    local tz
    tz="$(first_or UTC timedatectl show -p Timezone --value)"

    # A password is generated here rather than left to Pi-hole's random one so it can be printed
    # once, in the summary, on a machine you are already sitting at. Both env var names are set:
    # Pi-hole v6 renamed WEBPASSWORD to FTLCONF_webserver_api_password, and the older image ignores
    # the one it does not know.
    local pw
    pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20)"

    if ! sudo docker run -d --name pihole \
        --restart=unless-stopped \
        -p "${LAN_IP}:53:53/tcp" \
        -p "${LAN_IP}:53:53/udp" \
        -p "${admin_bind}:8080:80/tcp" \
        -e TZ="${tz}" \
        -e WEBPASSWORD="${pw}" \
        -e FTLCONF_webserver_api_password="${pw}" \
        -v pihole_etc:/etc/pihole \
        -v pihole_dnsmasq:/etc/dnsmasq.d \
        pihole/pihole:latest >/dev/null
    then
        warn "'docker run' failed, so Pi-hole is not running. Everything else on this machine is
             configured. 'sudo docker logs pihole' and 'sudo journalctl -u docker' will say why."
        return 0
    fi

    PIHOLE_PASSWORD="${pw}"
    PIHOLE_ADMIN_BIND="${admin_bind}"
    info "pihole is up; DNS on ${LAN_IP}:53, admin on ${admin_bind}:8080"

    warn "The admin password above was passed to 'docker run' as an environment variable, so it was
         briefly visible in this machine's process list and is stored in the container's metadata.
         On a single-user appliance that is an acceptable trade for being able to print it once;
         change it from inside the Pi-hole UI if you would rather it were not."

    warn "Docker publishes ports by writing its own iptables rules, which are evaluated BEFORE
         ufw's. That is why both published ports above name an address instead of using the bare
         '-p 53:53' every guide shows: a bare publish would be reachable from anywhere that can
         route to this box, ufw's default-deny notwithstanding. If you add containers later,
         bind every one of their ports to an address."

    MANUAL+=("Point your router's PRIMARY DNS at ${LAN_IP}, and set an explicit SECONDARY —
             docs/thinkcentre-sharing-host.md §9 explains why leaving it blank is the worst of the
             three options. Then test IPTV and the games consoles in the first day or two, not in
             three weeks, and use the Query Log when something does not load.")
}

# ---------------------------------------------------------------------------------------------
# What is still listening. Report only — this is the check that catches the thing the rest of the
# script did not think of.
# ---------------------------------------------------------------------------------------------

audit_network() {
    log "Listening on the network (report only)"

    if ! have ss; then
        warn "iproute2's 'ss' is missing, so the listener audit did not run."
        return
    fi

    local any_public=0 proto addr port prog
    while read -r proto addr port prog; do
        case "${addr}" in
            127.*|::1|"")
                info "${proto} ${addr}:${port} ${prog} (localhost only)"
                ;;
            *)
                any_public=1
                info "${proto} ${addr}:${port} ${prog}  <-- reachable from the network"
                ;;
        esac
    done < <(sudo ss -lntupH 2>/dev/null | awk '
        {
            split($5, a, ":");
            port = a[length(a)];
            addr = substr($5, 1, length($5) - length(port) - 1);
            gsub(/^\[|\]$/, "", addr);
            prog = "";
            for (i = 1; i <= NF; i++) if ($i ~ /users:/) prog = $i;
            gsub(/users:\(\("/, "", prog);
            gsub(/".*/, "", prog);
            print $1, addr, port, prog;
        }' || true)

    if [ "${any_public}" -eq 1 ]; then
        info ""
        info "Anything marked 'reachable from the network' above should be something you chose."
        info "ufw is in front of these (except Docker's published ports, which bypass it), so a"
        info "listener with no ufw rule is closed from outside — but a listener you did not expect"
        info "is worth understanding rather than leaving."
    fi
}

# ---------------------------------------------------------------------------------------------
# Verification. Runs at the end of a setup, and on its own with --verify.
#
# The point of --verify is to run it AFTER a reboot, having touched nothing: that is the state
# this machine spends its life in, and it is the only test of it that means anything.
# ---------------------------------------------------------------------------------------------

VERIFY_FAILED=0
check() {
    local label="$1" expected="$2" actual="$3"
    if [ "${actual}" = "${expected}" ]; then
        printf '    \033[32mok\033[0m    %-34s %s\n' "${label}" "${actual}"
    else
        printf '    \033[31mFAIL\033[0m  %-34s %s (expected %s)\n' "${label}" "${actual}" "${expected}"
        VERIFY_FAILED=1
    fi
}
note() { printf '    --    %-34s %s\n' "$1" "$2"; }

verify() {
    log "Verifying"

    check "linger enabled" "yes" \
        "$(first_or no loginctl show-user "${USER}" --property=Linger --value)"

    check "watchdog timer enabled" "enabled" \
        "$(first_or missing systemctl --user is-enabled vessel-kiosk-watchdog.timer)"

    check "kiosk unit enabled" "enabled" \
        "$(first_or missing systemctl --user is-enabled "${SERVICE_NAME}.service")"

    local active
    active="$(first_or inactive systemctl --user is-active "${SERVICE_NAME}.service")"
    if [ "${active}" = "active" ]; then
        check "kiosk running" "active" "${active}"
    else
        note "kiosk running" "${active} (expected before the first reboot / with no session)"
    fi

    if pgrep -u "$(id -u)" -f 'chromium.*--kiosk' >/dev/null 2>&1; then
        note "chromium" "running in kiosk mode"
    else
        note "chromium" "not running (expected before the first reboot)"
    fi

    check "sleep.target masked" "masked" "$(first_or unknown systemctl is-enabled sleep.target)"
    check "suspend.target masked" "masked" "$(first_or unknown systemctl is-enabled suspend.target)"
    check "hibernate.target masked" "masked" "$(first_or unknown systemctl is-enabled hibernate.target)"

    [ -f "${LAUNCHER}" ] && note "launcher" "${LAUNCHER}" || { note "launcher" "MISSING"; VERIFY_FAILED=1; }
    [ -f "${URL_FILE}" ] && note "kiosk URL" "$(cat "${URL_FILE}")" || { note "kiosk URL" "MISSING"; VERIFY_FAILED=1; }

    # These three are `check`, not `note`, and that is the whole point of --verify: it is meant to
    # be run after a reboot and to EXIT NON-ZERO when this host is not in the state it should live
    # in. As notes they could not fail, so a machine whose firewall had been switched off since
    # setup, or whose browser lockdown had been deleted, verified green.
    if [ "${DO_CHROMIUM_POLICY}" -eq 1 ]; then
        local dir found_policy="no"
        while read -r dir; do
            [ -n "${dir}" ] || continue
            if [ -f "${dir}/${POLICY_NAME}" ]; then
                found_policy="yes"
                note "chromium policy" "${dir}/${POLICY_NAME}"
                if have jq && ! jq empty "${dir}/${POLICY_NAME}" >/dev/null 2>&1; then
                    printf '    \033[31mFAIL\033[0m  %-34s %s\n' "chromium policy" "is not valid JSON"
                    VERIFY_FAILED=1
                fi
            else
                note "chromium policy" "absent from ${dir}"
            fi
        done < <(policy_dirs)
        check "chromium policy present" "yes" "${found_policy}"
    fi

    check "store present" "yes" "$([ -d "${STORE_DIR}" ] && echo yes || echo "no (${STORE_DIR})")"
    if [ -d "${STORE_DIR}" ]; then
        note "store" "${STORE_DIR} ($(first_or '?' findmnt -no FSTYPE --target "${STORE_DIR}"))"
        check "store writable" "yes" "$([ -w "${STORE_DIR}" ] && echo yes || echo no)"
    fi

    if [ "${DO_FIREWALL}" -eq 1 ]; then
        if have ufw; then
            check "firewall active" "active" "$(first_or unknown sudo ufw status | awk '{print $2}')"
        else
            check "firewall active" "active" "ufw-not-installed"
        fi
    elif have ufw; then
        note "firewall" "$(first_or unknown sudo ufw status) (not managed — --no-firewall)"
    fi

    # sshd was hardened, so confirm it is STILL hardened. The drop-in file existing proves nothing:
    # a setting above the Include line beats it and the daemon is the only honest witness.
    if pkg_installed openssh-server; then
        check "sshd refuses root login" "yes" \
            "$(sudo sshd -T 2>/dev/null | grep -qi '^permitrootlogin no$' && echo yes || echo no)"
    fi

    note "clock synchronised" "$(first_or unknown timedatectl show -p NTPSynchronized --value)"

    # unattended-upgrades installs security updates and, deliberately, never reboots — so a new
    # kernel, glibc or OpenSSL sits on disk while the running system keeps the old code. On a box
    # meant to run for months that is the difference between "patched" and "downloaded", and
    # nothing else on this machine would ever mention it.
    if [ -f /var/run/reboot-required ]; then
        note "reboot owed" "yes — security updates are installed but not running yet"
    else
        note "reboot owed" "no"
    fi

    if [ "${DO_AUTO_CHROMIUM}" -eq 1 ]; then
        note "chromium upgrade timer" \
            "$(first_or missing systemctl is-enabled vessel-chromium-update.timer)"
    fi

    local sid
    sid="$(loginctl list-sessions --no-legend 2>/dev/null | awk -v u="${USER}" '$3 == u {print $1; exit}' || true)"
    if [ -n "${sid}" ]; then
        note "graphical session" "$(first_or unknown loginctl show-session "${sid}" -p Type --value)"
    else
        note "graphical session" "none for ${USER} (expected over SSH before a reboot)"
    fi

    if [ "${VERIFY_FAILED}" -eq 1 ]; then
        printf '\n\033[31m    Something above is not in the state this machine needs to be in.\033[0m\n'
    fi
}

# ---------------------------------------------------------------------------------------------

print_summary() {
    local url
    url="$(cat "${URL_FILE}" 2>/dev/null || printf '%s' "${KIOSK_URL}")"

    cat <<EOF


==================================================================================
  Vessel sharing host (Debian x86-64) — setup finished
==================================================================================

CONFIGURED
  Desktop           ${AUTOLOGIN_STATE}
  Kiosk service     ${SERVICE_NAME}.service — a systemd USER service, Restart=always
  Kiosk launcher    ${LAUNCHER}
  Watchdog          every 10 minutes — restarts the tab when the site becomes reachable after
                    having been unreachable, which is the one case a live browser stays stranded
                    on an error page
  Kiosk URL         ${url}
  Lingering         enabled for ${USER}, so the service starts at boot with nobody logged in
  Never idles       sleep/suspend/hibernate masked, logind IdleAction=ignore, X screensaver and
                    DPMS off, screen lockers purged, and — where GNOME is present — its idle, lock
                    and sleep keys set in the system dconf database and locked
  Clock             network time sync on — sign-in here is password + TOTP, and TOTP is a
                    function of the clock
  Data store        ${STORE_DIR} (owner ${USER}, mode ${STORE_MODE})
  Chromium policy   ${POLICY_STATE}
  Updates           security-only unattended upgrades, no automatic reboot; Chromium excluded and
                    $([ "${DO_AUTO_CHROMIUM}" -eq 1 ] && echo "upgraded Sundays at 04:00, kiosk restarted after" || echo "NOT scheduled (--no-auto-chromium)")
  Firewall          $([ "${DO_FIREWALL}" -eq 1 ] && echo "ufw, default deny inbound, SSH rate-limited" || echo "not touched (--no-firewall)")
  sshd              ${SSHD_STATE}
EOF

    if [ "${DO_PIHOLE}" -eq 1 ] && [ -n "${PIHOLE_PASSWORD:-}" ]; then
        cat <<EOF
  Pi-hole           DNS on ${LAN_IP}:53, admin on ${PIHOLE_ADMIN_BIND:-127.0.0.1}:8080

  PI-HOLE ADMIN PASSWORD — write this down now, it is not shown again:

      ${PIHOLE_PASSWORD}

EOF
        if [ "${PIHOLE_ADMIN_BIND:-127.0.0.1}" = "127.0.0.1" ]; then
            cat <<EOF
  The admin UI is bound to localhost. Reach it from your laptop through an SSH tunnel, which
  costs one command and exposes nothing on the LAN:

      ssh -L 8080:127.0.0.1:8080 ${USER}@\$(hostname)
      # then open http://127.0.0.1:8080/admin in your own browser

EOF
        fi
    fi

    cat <<EOF

NOT DONE, AND NOT BY ACCIDENT
  * No disk was formatted, partitioned or mounted, and /etc/fstab was not written. A wrong fstab
    line on a machine that lives on a shelf is a machine you have to walk to with a keyboard.
  * Samba was not installed and no port beyond SSH was opened. Every listener is a decision.
  * Your user was NOT added to the 'docker' group. That group is root-equivalent — a container can
    mount the host filesystem — and this box autologins to a desktop. Use 'sudo docker'.
  * The systemd unit is deliberately not sandboxed (no NoNewPrivileges, no PrivateUsers). Those
    directives break Chromium's own sandbox, and the fix people reach for next is --no-sandbox,
    which is strictly worse. The comment in the unit file says so, for whoever hardens it later.
  * Nothing phones home. SPEC-ACCOUNTS.md §9 is an inventory of everything this project stores
    about a person; a setup script that reported in would be a spec change, not a detail.

ACCEPTED RISKS — decide whether you accept them too
  * Autologin means physical access to this box is access to a signed-in browser. The Chromium
    policy above narrows that to the sharing site alone WHEN IT WAS WRITTEN — check the Chromium
    policy line in CONFIGURED — but the mitigation that matters is physical:
    set a BIOS/UEFI supervisor password and disable USB booting, or the drive can simply be read
    on another machine.
  * The disk is not encrypted, on purpose (§1 of the guide): LUKS halts the boot waiting for a
    passphrase typed at a console, which is exactly the failure mode this whole design avoids.
    The cost is that the Chromium profile — which holds your session and the folder handle — is
    readable by anyone who takes the drive out. If that matters more than unattended reboots do,
    LUKS with dropbear-initramfs is the version worth having, and it is a separate afternoon.
  * Nothing here should ever be port-forwarded from the internet. Not SSH, not Samba, not 53.

STILL MANUAL
EOF
    if [ "${#MANUAL[@]}" -eq 0 ]; then
        printf '  (nothing)\n'
    else
        local m
        for m in "${MANUAL[@]}"; do printf '  * %s\n' "${m}"; done
    fi

    cat <<EOF

  * Reboot, then pair the machine once with a mouse and keyboard attached. That step cannot be
    scripted at all: showDirectoryPicker() requires a real user gesture and the browser draws its
    permission prompt outside the page. Sign in as the operator, pick a folder under ${STORE_DIR},
    give the machine a typed name — never the hostname, §9 is explicit about why — and when
    Chromium asks, choose "Allow on every visit". The alternative needs another click from a
    physical pointer after every reboot, crash and browser upgrade.

VERIFY — after a reboot, having touched nothing, which is the state it lives in
  ./scripts/thinkcentre-setup.sh --verify
EOF

    if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '\nWARNINGS RAISED DURING SETUP\n'
        local w
        for w in "${WARNINGS[@]}"; do printf '  * %s\n' "${w}"; done
    fi

    cat <<EOF

Reboot now to prove the whole chain — autologin, session, lingering, service, browser — comes up
without anybody helping it:

    sudo reboot

EOF
}

# ---------------------------------------------------------------------------------------------

main() {
    WORK_DIR="$(mktemp -d)"

    parse_args "$@"
    detect_lan

    if [ "${DO_VERIFY_ONLY}" -eq 1 ]; then
        # --verify needs sudo for two of its checks (ufw status, the listener audit). Ask once,
        # here, rather than being surprised by a password prompt halfway down a report.
        sudo -v >/dev/null 2>&1 || true
        verify
        audit_network
        exit "${VERIFY_FAILED}"
    fi

    preflight
    report_storage
    install_packages
    prepare_store
    configure_autologin
    configure_no_sleep
    configure_time_sync
    write_launcher
    write_unit
    write_watchdog
    enable_linger
    configure_chromium_policy
    configure_unattended_upgrades
    configure_chromium_update_timer
    configure_firewall
    harden_ssh
    install_pihole
    audit_network
    verify
    print_summary

    # Non-zero when a check failed. Everything a first run legitimately cannot satisfy — the kiosk
    # not being up before a reboot, no graphical session over SSH — is reported with `note`, which
    # cannot fail, so a red line here is a real one.
    exit "${VERIFY_FAILED}"
}

main "$@"
