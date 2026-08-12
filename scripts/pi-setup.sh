#!/usr/bin/env bash
#
# pi-setup.sh — prepare a Raspberry Pi as a dedicated Vessel sharing host.
#
# The Vessel "agent" is not a native binary. Per design/SPEC-ACCOUNTS.md §8 it is a browser tab
# holding a File System Access directory handle, a WebSocket to the signalling service, and a WebRTC
# data channel. That design buys us no installer and no code-signing, and it charges us two things
# (§2): the tab must stay open, and the sharer must use a Chromium browser. This script sets up a
# cheap always-on machine whose entire job is to hold that tab open, which is the honest answer to
# the first cost.
#
# What it deliberately does NOT do:
#   - It does not enable VNC, open a port, or change the firewall. If you want VNC, you turn it on
#     yourself; the command is printed in the summary and in docs/pi-sharing-host.md.
#   - It does not send anything anywhere. SPEC-ACCOUNTS.md §9 is an inventory of everything the
#     project stores about a person, and a setup script that phoned home would be a spec change.
#   - It does not edit /boot/firmware/config.txt or cmdline.txt. A bad line in either is an
#     unbootable Pi that needs the card pulled and read on another machine, and the headless-display
#     workaround that lives there is better done deliberately, by hand, with the guide open.
#
# Re-running this is the point. Every step checks the world before it changes it, because the state
# a setup script is most often run in is "the last run died halfway and nobody is sure where."
#
# Usage:
#   ./scripts/pi-setup.sh [KIOSK_URL]
#   VESSEL_KIOSK_URL=https://example.invalid/somewhere ./scripts/pi-setup.sh
#
# The default URL is about:blank, and that is not laziness. The sharing page is phase 2 (§7); §10
# names /share as the route it will eventually live at, and it does not exist today. Pointing the
# kiosk at a URL that 404s would make the host look broken when it is merely early, so it points at
# nothing until there is something to point it at. The URL lives in a one-line config file, so
# changing it later is one edit and one restart, not a re-run of this script.

set -euo pipefail

readonly SERVICE_NAME="vessel-kiosk"
readonly CONFIG_DIR="${HOME}/.config/vessel-kiosk"
readonly URL_FILE="${CONFIG_DIR}/url"
readonly LAUNCHER="${HOME}/.local/bin/vessel-kiosk"
readonly UNIT_FILE="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
readonly DEFAULT_URL="about:blank"

KIOSK_URL="${1:-${VESSEL_KIOSK_URL:-${DEFAULT_URL}}}"

# Collected as we go and printed at the end, because a wall of apt output scrolls the important
# warnings off the screen and the person running this is usually watching over SSH.
WARNINGS=()
MANUAL=()

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
skip() { printf '    (already done) %s\n' "$*"; }
warn() { printf '\033[33m    WARNING: %s\033[0m\n' "$*"; WARNINGS+=("$*"); }
die()  { printf '\n\033[31mERROR: %s\033[0m\n\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------------------------
# Preflight. Everything here is a refusal or a warning, and nothing here changes the machine.
# ---------------------------------------------------------------------------------------------

preflight() {
    log "Checking this machine is the machine this script is for"

    if [ "$(id -u)" -eq 0 ]; then
        die "Do not run this as root or with sudo.
       Almost everything here belongs to your user — the systemd *user* service, the linger flag,
       the Chromium profile that holds the directory handle. Running as root would put all of it
       in root's home, where the desktop session will never see it. The script calls sudo itself
       for the handful of steps that need it, and you will be prompted."
    fi

    if ! sudo -v; then
        die "This script needs sudo for package installation and boot behaviour, and sudo refused."
    fi

    local model=""
    if [ -r /proc/device-tree/model ]; then
        # The device-tree model string is NUL-terminated, which confuses everything downstream.
        model="$(tr -d '\0' < /proc/device-tree/model)"
    fi

    case "${model}" in
        *"Raspberry Pi"*)
            info "Hardware: ${model}"
            ;;
        *)
            die "This does not look like a Raspberry Pi (model: '${model:-unknown}').
       The script assumes raspi-config, the Raspberry Pi OS package archive and the Pi's desktop
       session layout. On anything else it would half-work, which is worse than not running."
            ;;
    esac

    case "${model}" in
        # "Raspberry Pi 4" also catches the 400, whose model string is "Raspberry Pi 400 Rev 1.0".
        *"Raspberry Pi 5"*|*"Raspberry Pi 4"*|*"Compute Module 4"*|*"Compute Module 5"*)
            : # Supported.
            ;;
        *)
            warn "This is not a Pi 4 or Pi 5. A Pi 3 or Zero 2 W can boot the desktop, but a
             Chromium session that must stay up for weeks is a different workload from one that
             must survive a demo: the Zero 2 W's 512MB is below Chromium's working set with one
             page open, and the Pi 3's VideoCore and 1GB leave the session swapping on an SD card
             until something is killed. It will appear to work and then quietly stop sharing.
             Continuing anyway, because you may know something I do not."
            ;;
    esac

    local codename
    codename="$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release || true)"
    if [ "${codename}" != "bookworm" ]; then
        die "This script targets Raspberry Pi OS Bookworm and found '${codename:-unknown}'.
       The reason it refuses rather than tries: Bookworm is where the desktop moved to Wayland on
       Pi 4 and 5, and every screen-blanking and autostart mechanism below is chosen around that
       split. On Bullseye the X11 paths would apply and the Wayland ones would be noise; on
       Trixie or later the compositor defaults may have moved again and this needs re-checking
       rather than re-running."
    fi
    info "OS: Raspberry Pi OS Bookworm"

    # Lite has no desktop session, and Chromium needs one. Detecting this now saves installing
    # 400MB of browser onto a machine that can never display it.
    if ! command -v labwc >/dev/null 2>&1 \
       && ! command -v wayfire >/dev/null 2>&1 \
       && ! command -v startlxde-pi >/dev/null 2>&1 \
       && ! command -v lightdm >/dev/null 2>&1; then
        die "No desktop session found — this looks like Raspberry Pi OS Lite.
       Chromium is a graphical application and the File System Access API only exists inside it,
       so the sharing host needs the Desktop edition. Re-image with Raspberry Pi OS (64-bit) with
       desktop and run this again. See docs/pi-sharing-host.md for why we do not try to fake a
       desktop with Xvfb: a headless framebuffer would run, but nobody could ever answer the
       folder-picker prompt, and answering it once by hand is a required step."
    fi

    local mem_kb
    mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
    info "RAM: $(( mem_kb / 1024 )) MB"
    if [ "${mem_kb}" -lt 1800000 ]; then
        warn "Less than 2GB of RAM. Chromium plus a desktop session will spend its life in swap."
    fi

    local root_src
    root_src="$(findmnt -no SOURCE / || true)"
    case "${root_src}" in
        /dev/mmcblk*)
            warn "The root filesystem is on the SD card (${root_src}).
             This host reads files continuously and Chromium writes its profile, its cache and
             the IndexedDB entry holding your directory handle to the same card. SD cards fail
             from write wear, and they fail in the way that costs most here: silently, as
             corruption, on a machine nobody is looking at. Boot from a USB SSD instead — the
             guide has the steps. Nothing about this script requires it, and everything about
             running unattended for months does."
            ;;
        "")
            warn "Could not determine the root device, so the SD-card check did not run."
            ;;
        *)
            info "Root filesystem: ${root_src} (not an SD card — good)"
            ;;
    esac

    # Swap sanity. Raspberry Pi OS ships dphys-swapfile at 200MB, which is sized for a machine that
    # occasionally compiles something, not for one holding a browser open indefinitely. We only
    # warn: growing the swapfile means writing hundreds of megabytes, and on a card-booted Pi that
    # is exactly the wear we just complained about. The decision is the operator's.
    local swap_kb
    swap_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
    info "Swap: $(( swap_kb / 1024 )) MB"
    if [ "${swap_kb}" -lt 512000 ]; then
        warn "Swap is under 512MB. On a 2GB Pi, Chromium plus the desktop can reach the point
             where the kernel's OOM killer picks a process, and the process it picks is usually
             the browser — the one thing on this machine that matters. To raise it:
                 sudo dphys-swapfile swapoff
                 sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
                 sudo dphys-swapfile setup && sudo dphys-swapfile swapon
             Do this only on a machine booting from SSD, or accept the card wear knowingly."
    fi
}

# ---------------------------------------------------------------------------------------------
# Storage. This step changes nothing — it looks, reports, and hands the work to the guide.
#
# On this deployment the Pi is not only the machine holding the tab open, it is the machine the
# shared files live on: a USB SSD attached to the Pi is the store, and the sharing tab serves from
# it. That makes storage load-bearing rather than housekeeping, and it is also exactly the reason
# the script refuses to touch it. Getting /etc/fstab wrong on a headless machine is how you end up
# driving to it with a keyboard, and the mount options that matter (nofail above all) are a
# decision the operator should make with the guide open rather than one a script makes quietly.
# ---------------------------------------------------------------------------------------------

report_storage() {
    log "Looking at attached storage (reporting only — nothing here is changed)"

    # Anything on a USB or NVMe transport that is not the root device is a candidate for the store.
    local found_external=""
    local dev size mnt tran
    while IFS=$'\t' read -r dev size tran mnt; do
        case "${tran}" in
            usb|nvme|sata) ;;
            *) continue ;;
        esac
        found_external="yes"
        if [ -n "${mnt}" ]; then
            info "${dev} (${size}, ${tran}) mounted at ${mnt}"
        else
            info "${dev} (${size}, ${tran}) is attached but NOT mounted"
        fi
    done < <(lsblk -rno NAME,SIZE,TRAN,MOUNTPOINT 2>/dev/null | awk '{printf "/dev/%s\t%s\t%s\t%s\n", $1, $2, $3, $4}' || true)

    if [ -z "${found_external}" ]; then
        warn "No USB or NVMe disk is attached. The sharing host is meant to hold the shared files
             on an SSD of its own — see 'The disk is the point' in docs/pi-sharing-host.md. This
             is only a warning because a host with no store is still a host worth setting up; it
             simply has nothing to share yet."
    fi

    if [ -f /etc/fstab ] && grep -q 'UUID=' /etc/fstab && grep -q 'nofail' /etc/fstab; then
        info "/etc/fstab has at least one UUID entry with nofail — that is the shape the guide asks for."
    else
        MANUAL+=("Mount the store from /etc/fstab, by UUID and with 'nofail'. Both halves matter:
             /dev/sda1 moves between boots, and an fstab entry without nofail turns a missing or
             failed disk into a boot that stops and waits for a console nobody is sitting at.
             docs/pi-sharing-host.md walks it.")
    fi

    MANUAL+=("Decide how files get onto the store — Samba, or rsync over SSH. The script does not
             install Samba, because Samba listens on the network and this script does not open
             ports without being asked. The guide compares the two and recommends one.")
}

# ---------------------------------------------------------------------------------------------
# Packages.
# ---------------------------------------------------------------------------------------------

pkg_installed() {
    dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q '^install ok installed$'
}

pkg_exists() {
    apt-cache show "$1" >/dev/null 2>&1
}

install_packages() {
    log "Installing packages"

    # Raspberry Pi OS keeps the historical name `chromium-browser` in its own archive, with the
    # Pi-specific hardware-decode patches; plain Debian calls the package `chromium`. On a Raspberry
    # Pi OS image you want the former, but check rather than assume — a Pi running a Debian-derived
    # image would only have the latter, and installing the wrong one silently gets you a browser
    # without video acceleration.
    local browser_pkg=""
    if pkg_exists chromium-browser; then
        browser_pkg="chromium-browser"
    elif pkg_exists chromium; then
        browser_pkg="chromium"
        warn "Installing Debian's 'chromium' rather than Raspberry Pi OS's 'chromium-browser'.
             That is unexpected on a Pi image and worth understanding before you rely on it."
    else
        die "Neither chromium-browser nor chromium is available from apt. Check your sources."
    fi

    local wanted=(
        "${browser_pkg}"
        x11-xserver-utils   # xset, for the X11 half of the blanking work below.
        unclutter           # Hides the idle pointer. X11 only — see the comment in the launcher.
        unattended-upgrades # Security updates without a human, configured further down.
        jq                  # Used by the launcher to reset Chromium's crash flag safely.
    )

    # wlr-randr is how you interrogate output power state under a wlroots compositor (labwc,
    # wayfire). It is only useful on the Wayland path and it is not on every image, so it is
    # optional rather than required.
    if pkg_exists wlr-randr; then
        wanted+=(wlr-randr)
    else
        info "wlr-randr is not available from apt; the Wayland output check in the guide will not work."
    fi

    local missing=()
    local p
    for p in "${wanted[@]}"; do
        if pkg_installed "${p}"; then
            skip "${p}"
        else
            missing+=("${p}")
        fi
    done

    # apt-get update runs unconditionally: it is idempotent, and skipping it is how you end up
    # installing against a package list from before the last security fix.
    info "Refreshing the package list"
    sudo apt-get update -qq

    if [ "${#missing[@]}" -gt 0 ]; then
        info "Installing: ${missing[*]}"
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
    else
        info "Nothing to install."
    fi

    if pkg_installed xscreensaver; then
        warn "xscreensaver is installed. It has its own idle timer that ignores everything this
             script configures, and it will blank the display anyway. Remove it with
             'sudo apt-get purge xscreensaver' unless you have a reason to keep it."
    fi
}

# ---------------------------------------------------------------------------------------------
# Boot behaviour.
# ---------------------------------------------------------------------------------------------

configure_autologin() {
    log "Setting boot behaviour to desktop with autologin"

    # B4 is raspi-config's code for "desktop, autologin". The kiosk needs a graphical session to
    # exist, and on a headless machine nobody is going to type a password into a login greeter, so
    # autologin is not a convenience here — it is the only way the session ever starts.
    #
    # Understand what this trades away: anyone with physical access to the Pi and a monitor gets a
    # logged-in desktop. On a machine whose whole purpose is holding a handle to your files, that
    # is a real consideration. It is acceptable because the folder handle is protected by the
    # browser's permission model rather than by the login screen, and because the alternative is a
    # host that stops sharing every time the power flickers.
    if command -v raspi-config >/dev/null 2>&1; then
        sudo raspi-config nonint do_boot_behaviour B4
        info "raspi-config: boot behaviour set to B4 (desktop, autologin)."
        info "raspi-config is idempotent here, so re-running this changes nothing."
    else
        warn "raspi-config is missing, so autologin was not configured. Set it by hand, or the
             kiosk will wait forever for a session that never starts."
        MANUAL+=("Configure desktop autologin by hand — raspi-config was not present.")
    fi
}

# ---------------------------------------------------------------------------------------------
# Screen blanking. This is the part with two paths, and it is worth stating exactly why.
#
# Bookworm on Pi 4 and Pi 5 runs a Wayland session by default. Which compositor depends on when
# your image was built: the initial Bookworm release used wayfire, and later images use labwc.
# Pi 3 and earlier stay on X11. A given machine therefore has one of three idle mechanisms, and
# the mechanisms do not overlap at all — `xset -dpms` is meaningless under a Wayland compositor,
# and wayfire's [idle] section is meaningless under X11.
#
# We detect the live session and say which one we found, and then we configure ALL of them anyway.
# Configuring the inactive path costs a file nobody reads; guessing wrong costs a display that
# blanks at midnight on a machine nobody is watching. The failure is also asymmetric in a way that
# is easy to miss: on some hardware a blanked output does not merely dim, it drops the mode, and
# what a Chromium compositor does with a disappearing output is not something to find out with
# someone's files on the other end of it.
#
# One honest uncertainty, recorded rather than papered over: on the labwc session the idle timer
# is run by swayidle out of the session autostart, and the exact contents of that file have
# changed between Raspberry Pi OS images. The code below copies the system autostart to the user's
# own and comments out any swayidle line it finds. If your image starts the idle timer some other
# way, `pgrep swayidle` after a reboot is how you will find out — the guide's verification section
# covers it.
# ---------------------------------------------------------------------------------------------

detect_session_type() {
    # loginctl is the ground truth, but over SSH we are not in the seat session, so ask about the
    # user's seat0 session rather than our own.
    local sid
    sid="$(loginctl list-sessions --no-legend 2>/dev/null | awk -v u="${USER}" '$3 == u {print $1}' | head -n1)"
    if [ -n "${sid}" ]; then
        loginctl show-session "${sid}" -p Type --value 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

configure_blanking_x11() {
    info "X11 path:"

    # Two places, because they cover two different moments. The lightdm drop-in disables blanking
    # and DPMS in the X server itself, from the instant the server starts — including at the
    # greeter, before any session exists. The autostart .desktop re-applies it inside the session,
    # because a session-level tool can and does re-enable DPMS after login.
    local lightdm_dropin="/etc/lightdm/lightdm.conf.d/10-vessel-noblank.conf"
    if [ -d /etc/lightdm ]; then
        if [ -f "${lightdm_dropin}" ]; then
            skip "${lightdm_dropin}"
        else
            sudo mkdir -p /etc/lightdm/lightdm.conf.d
            sudo tee "${lightdm_dropin}" >/dev/null <<'EOF'
# Written by scripts/pi-setup.sh for the Vessel sharing host.
# -s 0 disables the screensaver timeout, -dpms disables display power management. Both are set on
# the X server command line so they apply from server start rather than from session start.
[Seat:*]
xserver-command=X -s 0 -dpms
EOF
            info "wrote ${lightdm_dropin}"
        fi
    else
        info "no /etc/lightdm, so the display-manager half was skipped"
    fi

    local autostart_dir="${HOME}/.config/autostart"
    local desktop_file="${autostart_dir}/vessel-noblank.desktop"
    mkdir -p "${autostart_dir}"
    if [ -f "${desktop_file}" ]; then
        skip "${desktop_file}"
    else
        cat > "${desktop_file}" <<'EOF'
[Desktop Entry]
Type=Application
Name=Vessel — disable screen blanking
Comment=Written by scripts/pi-setup.sh. Re-applies the no-blank settings inside the session.
Exec=sh -c "xset s off; xset s noblank; xset -dpms"
X-GNOME-Autostart-enabled=true
EOF
        info "wrote ${desktop_file}"
    fi
}

configure_blanking_wayfire() {
    info "Wayfire path:"

    local ini="${HOME}/.config/wayfire.ini"
    if [ ! -f "${ini}" ]; then
        info "no ${ini} — wayfire writes it on first login, so this is expected if the session"
        info "has never started, or if this image uses labwc. Re-run this script after the first"
        info "desktop login if wayfire turns out to be your compositor."
        return
    fi

    # Wayfire's idle plugin takes timeouts in milliseconds; -1 disables the timer outright.
    local key val kv
    for kv in "dpms_timeout=-1" "screensaver_timeout=-1"; do
        key="${kv%%=*}"
        val="${kv#*=}"
        if ! grep -q '^\[idle\]' "${ini}"; then
            printf '\n[idle]\n%s = %s\n' "${key}" "${val}" >> "${ini}"
            info "added [idle] section with ${key} = ${val}"
            continue
        fi
        # Look for the key only between [idle] and the next section header.
        if sed -n '/^\[idle\]/,/^\[/p' "${ini}" | grep -q "^${key}[[:space:]]*="; then
            sed -i "/^\[idle\]/,/^\[/{s/^${key}[[:space:]]*=.*/${key} = ${val}/}" "${ini}"
            skip "${key} already present in [idle]; value set to ${val}"
        else
            sed -i "/^\[idle\]/a ${key} = ${val}" "${ini}"
            info "added ${key} = ${val} to [idle]"
        fi
    done
}

configure_blanking_labwc() {
    info "labwc path:"

    local user_autostart="${HOME}/.config/labwc/autostart"
    local system_autostart="/etc/xdg/labwc/autostart"

    # labwc reads the user's autostart if it exists and the system one otherwise — it does not
    # merge them. So the first move is to take a full copy, or we would lose whatever else the
    # session starts (the panel, the wallpaper, the output configuration).
    if [ ! -f "${user_autostart}" ]; then
        if [ -f "${system_autostart}" ]; then
            mkdir -p "$(dirname "${user_autostart}")"
            cp "${system_autostart}" "${user_autostart}"
            info "copied ${system_autostart} to ${user_autostart} (labwc overrides rather than merges)"
        else
            info "neither a user nor a system labwc autostart exists; this image is probably not labwc"
            return
        fi
    else
        skip "${user_autostart} exists"
    fi

    # swayidle is what actually blanks the screen under the Pi's labwc session; labwc itself has no
    # idle timer. Comment the line rather than deleting it, so a future reader can see what was
    # removed and put it back.
    if grep -q '^[^#]*swayidle' "${user_autostart}"; then
        sed -i 's|^\([^#]*swayidle.*\)$|# disabled by Vessel pi-setup.sh — the sharing host must never blank\n# \1|' "${user_autostart}"
        info "commented out the swayidle line in ${user_autostart}"
    else
        skip "no active swayidle line in ${user_autostart}"
    fi
}

configure_blanking() {
    log "Disabling screen blanking, DPMS and the screensaver"

    local session_type
    session_type="$(detect_session_type)"
    info "Detected session type: ${session_type}"
    case "${session_type}" in
        wayland) info "(Wayland — the X11 settings below are written anyway and will be inert.)" ;;
        x11)     info "(X11 — the Wayland settings below are written anyway and will be inert.)" ;;
        *)       info "(Could not detect a session, which is normal over SSH before the first"
                 info " desktop login. Both paths are configured; the guide shows how to confirm"
                 info " which one is live once the desktop is up.)" ;;
    esac

    # raspi-config has its own blanking switch, and where it exists it is the most likely thing to
    # keep working across OS updates, so it goes first and the explicit configuration backs it up.
    # The argument is the confusing part: raspi-config's nonint verbs take 0 for "enable the
    # feature" and 1 for "disable it", so do_blanking 1 turns blanking OFF. That reads backwards
    # every single time.
    if command -v raspi-config >/dev/null 2>&1; then
        sudo raspi-config nonint do_blanking 1
        info "raspi-config: do_blanking 1 (blanking disabled)"
    fi

    configure_blanking_x11
    configure_blanking_wayfire
    configure_blanking_labwc

    MANUAL+=("After the first reboot, confirm the display never blanks — 'pgrep swayidle' should
             find nothing on a labwc image. The guide's verification section has the rest.")
}

# ---------------------------------------------------------------------------------------------
# The kiosk itself: a launcher script, plus a systemd *user* service that keeps it alive.
#
# Why a user service and not a system one. The browser has to run inside the logged-in graphical
# session, as the user who owns it, with that user's Chromium profile — and the profile is not
# incidental here. The persisted directory handle from showDirectoryPicker() lives in that
# profile's IndexedDB (§8), so the profile *is* the pairing. A system service running as root, or
# as the user but outside the session, either cannot reach the display at all or reaches it with
# the wrong environment and the wrong profile, and the symptom of the latter is the worst one
# available: the browser starts, the page loads, and the folder is simply not there any more.
#
# A user service also gets the session lifecycle for free. It stops when the session stops and
# starts when it starts, and `systemctl --user` works over SSH without sudo, which is how this
# machine will actually be administered.
# ---------------------------------------------------------------------------------------------

write_launcher() {
    log "Writing the kiosk launcher"

    mkdir -p "$(dirname "${LAUNCHER}")" "${CONFIG_DIR}"

    # The URL lives in its own file rather than in the unit, so changing where the kiosk points is
    # an edit and a restart rather than a re-run of this script. An existing file is never
    # overwritten: if you set a real URL last month, a re-run must not quietly reset it to the
    # placeholder.
    if [ -f "${URL_FILE}" ]; then
        skip "${URL_FILE} exists, keeping $(cat "${URL_FILE}")"
    else
        printf '%s\n' "${KIOSK_URL}" > "${URL_FILE}"
        info "wrote ${URL_FILE} (${KIOSK_URL})"
    fi

    local tmp
    tmp="$(mktemp)"
    cat > "${tmp}" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
#
# Vessel sharing-host kiosk launcher. Written by scripts/pi-setup.sh — edit the URL in
# ~/.config/vessel-kiosk/url rather than editing this file.
#
# This is a script rather than a bare ExecStart line because two things have to happen before
# Chromium is exec'd, and both of them are things systemd cannot do for us: wait for a graphical
# session to exist, and clear Chromium's crash flag.

set -euo pipefail

CONFIG_DIR="${HOME}/.config/vessel-kiosk"
URL_FILE="${CONFIG_DIR}/url"
URL="$(cat "${URL_FILE}" 2>/dev/null || echo about:blank)"

log() { printf 'vessel-kiosk: %s\n' "$*"; }

if [ "${URL}" = "about:blank" ]; then
    log "URL is about:blank. The Vessel sharing page is phase 2 and does not exist yet; this host"
    log "is being kept warm. Put the real URL in ${URL_FILE} and restart the service when it does."
fi

# ---- Wait for a display -----------------------------------------------------------------------
# The user manager starts at boot because lingering is enabled, and it starts well before the
# desktop session has a compositor. Starting Chromium into a display that is not there yet gets us
# a crash loop that resolves itself eventually but fills the journal with noise and, worse, trains
# whoever reads it to ignore the journal.
#
# Both display kinds are checked because Bookworm's session type depends on the model and the image
# age: Wayland on Pi 4/5, X11 on Pi 3 and earlier. Under Wayland, Chromium runs as an X client
# through XWayland by default, so DISPLAY is exported when we can find one either way.
found=""
for _ in $(seq 1 120); do
    if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
        # An unmatched glob comes back as the literal pattern, so every candidate is tested with
        # -S rather than trusted. The .lock files sitting beside the sockets are not sockets and
        # fail that test on their own.
        for sock in "${XDG_RUNTIME_DIR}"/wayland-[0-9]*; do
            if [ -S "${sock}" ]; then
                WAYLAND_DISPLAY="$(basename "${sock}")"
                export WAYLAND_DISPLAY
                found="wayland"
            fi
        done
    fi
    if [ -z "${found}" ] && [ -S /tmp/.X11-unix/X0 ]; then
        found="x11"
    fi
    if [ -n "${found}" ]; then
        break
    fi
    sleep 1
done

if [ -z "${found}" ]; then
    log "No Wayland or X11 display appeared within two minutes. Is autologin working?"
    log "Check: loginctl list-sessions"
    exit 1
fi

# XWayland's X socket is :0 in every configuration this script supports. If DISPLAY is already set
# by the session environment, that wins.
export DISPLAY="${DISPLAY:-:0}"
log "Display ready (${found}), DISPLAY=${DISPLAY}, WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset}"

# ---- Clear Chromium's crash flag --------------------------------------------------------------
# This is the single most important line in the file, and it is worth being explicit about why.
#
# When Chromium does not exit cleanly — a power cut, an OOM kill, a hung compositor — it comes back
# showing a "Restore pages?" bubble and, depending on version, a session-restore banner. On a
# desktop that is helpful. On an unattended sharing host it is fatal in the quietest way possible:
# the browser is running, the process is up, systemd is satisfied, and the tab holding the
# directory handle is not open. Someone is told their machine is offline and nothing on this box
# indicates a problem.
#
# --disable-session-crashed-bubble and --hide-crash-restore-bubble below are the documented flags,
# and they have both been renamed at least once across Chromium's history, so relying on either
# alone is relying on a flag name surviving an apt upgrade. Rewriting the profile's exit state is
# the belt: Chromium only offers restore when it finds exit_type != "Normal" on startup, so we tell
# it the last exit was clean before it looks. jq is used rather than sed because Preferences is a
# single-line JSON document and a regex that matches "exited_cleanly" also matches it inside
# unrelated nested objects.
PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${PREFS}" ] && command -v jq >/dev/null 2>&1; then
    if tmp="$(mktemp)" && jq '.profile.exit_type = "Normal" | .profile.exited_cleanly = true' "${PREFS}" > "${tmp}" 2>/dev/null; then
        mv "${tmp}" "${PREFS}"
        log "Reset the profile's exit state so no restore bubble appears."
    else
        rm -f "${tmp}"
        log "Could not rewrite ${PREFS}; relying on the command-line flags alone."
    fi
fi

# ---- Hide the pointer -------------------------------------------------------------------------
# unclutter is an X11 client. Under XWayland it hides the pointer over X windows, which is every
# window here, but it is best-effort: if the compositor draws its own cursor this does nothing.
# Failure is not interesting enough to stop the browser starting, so it is fully detached.
if command -v unclutter >/dev/null 2>&1; then
    (unclutter -idle 0 >/dev/null 2>&1 &) || true
fi

# ---- Find the browser -------------------------------------------------------------------------
CHROMIUM=""
for candidate in chromium-browser chromium; do
    if command -v "${candidate}" >/dev/null 2>&1; then
        CHROMIUM="${candidate}"
        break
    fi
done
[ -n "${CHROMIUM}" ] || { log "No chromium binary found."; exit 1; }

# ---- Flags ------------------------------------------------------------------------------------
# Each of these earns its place; none is cargo-culted from a kiosk blog post.
#
#   --kiosk                       Fullscreen, no chrome, no way to navigate away by accident.
#   --no-first-run                Skips the welcome flow, which would otherwise sit in front of the
#                                 sharing page after a profile reset and block it forever.
#   --no-default-browser-check    Same reasoning: an unanswerable modal on an unattended machine.
#   --noerrdialogs                Suppresses the modal error boxes, for the same reason again.
#   --disable-session-crashed-bubble
#   --hide-crash-restore-bubble   The two names this feature has had. See the exit_type note above;
#                                 these are the belt-and-braces to that rewrite, not a substitute.
#   --disable-infobars            Keeps notification bars from stealing height from the page.
#   --disable-features=Translate  The translate prompt is another modal nobody is here to dismiss.
#   --password-store=basic        Without this Chromium tries to talk to gnome-keyring and can
#                                 block on an unlock prompt in an autologin session.
#   --disable-background-timer-throttling
#   --disable-backgrounding-occluded-windows
#   --disable-renderer-backgrounding
#                                 These three matter more here than anywhere else. The sharing tab
#                                 holds a WebSocket to the signalling service and answers over a
#                                 data channel; a throttled timer means missed keepalives and a
#                                 connection that looks alive from this end and dead from the other.
#                                 A kiosk window is normally foreground, but a compositor that
#                                 considers the output occluded — which is exactly what a headless
#                                 Pi with no monitor may report — can trip the backgrounding path.
#
# Note what is NOT here: no --user-data-dir override and no --incognito. The default profile is
# deliberate, because the persisted directory handle lives in its IndexedDB. A fresh profile per
# launch, or an incognito window, would drop the handle on every restart and turn a two-minute
# reboot into a trip to the machine with a mouse. If you ever feel like adding --user-data-dir,
# read this paragraph again first.
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
    "${URL}"
LAUNCHER_EOF

    if [ -f "${LAUNCHER}" ] && cmp -s "${tmp}" "${LAUNCHER}"; then
        rm -f "${tmp}"
        skip "${LAUNCHER} is already current"
    else
        mv "${tmp}" "${LAUNCHER}"
        chmod 755 "${LAUNCHER}"
        info "wrote ${LAUNCHER}"
    fi
}

write_unit() {
    log "Installing the ${SERVICE_NAME} user service"

    mkdir -p "$(dirname "${UNIT_FILE}")"

    local tmp
    tmp="$(mktemp)"
    cat > "${tmp}" <<UNIT_EOF
# Vessel sharing-host kiosk. Written by scripts/pi-setup.sh.
#
# This is a *user* unit, in ~/.config/systemd/user, and that is a decision rather than a
# convenience — see the long comment in pi-setup.sh. The short version: the browser must run as the
# session's user with the session's Chromium profile, because that profile's IndexedDB holds the
# persisted directory handle. A system unit gets the display wrong, the profile wrong, or both.

[Unit]
Description=Vessel sharing host — Chromium kiosk
Documentation=file://%h/project/website/docs/pi-sharing-host.md
# The default start rate limit gives up after five restarts in ten seconds and leaves the unit
# failed. On a machine whose entire job is to keep one tab open, "gave up" is never the right
# answer; the launcher already waits for a display rather than spinning, so a genuine crash loop
# will be slow enough to see in the journal without systemd's help.
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%h/.local/bin/vessel-kiosk
# Restart=always rather than on-failure: Chromium exiting cleanly — because someone pressed the
# wrong key, or an update replaced the binary under it — must also bring the tab back.
Restart=always
RestartSec=5
# Chromium spawns a tree of zombie-prone helper processes; control-group kill is the only way to
# be sure a restart starts from nothing.
KillMode=control-group
TimeoutStopSec=20

[Install]
# default.target rather than graphical-session.target. The Pi's desktop session does not reliably
# tell the user systemd instance that a graphical session has begun, so binding to
# graphical-session.target produces a unit that is enabled, correct, and never starts. The launcher
# does its own waiting instead, which works regardless of whether the session is systemd-aware.
WantedBy=default.target
UNIT_EOF

    if [ -f "${UNIT_FILE}" ] && cmp -s "${tmp}" "${UNIT_FILE}"; then
        rm -f "${tmp}"
        skip "${UNIT_FILE} is already current"
    else
        mv "${tmp}" "${UNIT_FILE}"
        info "wrote ${UNIT_FILE}"
    fi

    systemctl --user daemon-reload
    if systemctl --user is-enabled "${SERVICE_NAME}.service" >/dev/null 2>&1; then
        skip "${SERVICE_NAME}.service is already enabled"
    else
        systemctl --user enable "${SERVICE_NAME}.service"
        info "enabled ${SERVICE_NAME}.service"
    fi
}

enable_linger() {
    log "Enabling lingering for ${USER}"

    # Without lingering, the user systemd instance only exists while the user is logged in, and it
    # is torn down when the last session ends. With autologin that is *usually* fine, but "usually"
    # is doing a lot of work: a session that fails to start, or a desktop that restarts, leaves the
    # user manager down and the kiosk unit unstarted with no error anywhere obvious.
    if [ "$(loginctl show-user "${USER}" --property=Linger --value 2>/dev/null || echo no)" = "yes" ]; then
        skip "lingering is already enabled"
    else
        sudo loginctl enable-linger "${USER}"
        info "lingering enabled — the user manager now starts at boot"
    fi
}

# ---------------------------------------------------------------------------------------------
# Unattended updates.
# ---------------------------------------------------------------------------------------------

configure_unattended_upgrades() {
    log "Configuring unattended security updates"

    local conf="/etc/apt/apt.conf.d/20auto-upgrades"
    if [ -f "${conf}" ] && grep -q 'Unattended-Upgrade "1"' "${conf}"; then
        skip "${conf} already enables unattended upgrades"
    else
        sudo tee "${conf}" >/dev/null <<'EOF'
// Written by scripts/pi-setup.sh for the Vessel sharing host.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
        info "wrote ${conf}"
    fi

    # Deliberately left at Debian's stock origin list, which is security updates only. Two reasons,
    # and the second is the real one:
    #
    #   1. Debian's default allowed origin is ${distro_codename}-security. The Raspberry Pi archive
    #      is not in that list, so Pi-specific packages are not auto-upgraded.
    #   2. Chromium comes from the Raspberry Pi archive, and an automatic Chromium upgrade would
    #      replace the binary under a running browser. The next restart is then a restart nobody
    #      chose, at a time nobody picked, and the tab holding someone's folder goes away in the
    #      middle of a transfer. Chromium updates on this machine should be a deliberate act: run
    #      the upgrade, watch the kiosk come back, confirm the folder is still shared.
    #
    # This trade is a real one and it cuts both ways — an un-upgraded browser accumulates known
    # vulnerabilities. Do the Chromium upgrade by hand on a schedule you actually keep.
    MANUAL+=("Upgrade Chromium by hand on a schedule you keep: 'sudo apt update && sudo apt full-upgrade',
             then confirm the kiosk came back and the folder is still shared. Automatic Chromium
             upgrades are deliberately not enabled — see the comment in scripts/pi-setup.sh.")
}

# ---------------------------------------------------------------------------------------------
# Wi-Fi power saving.
# ---------------------------------------------------------------------------------------------

configure_wifi_powersave() {
    log "Checking Wi-Fi power saving"

    if ! command -v nmcli >/dev/null 2>&1; then
        info "NetworkManager is not present; skipping."
        return
    fi

    # A Wi-Fi radio that powers down between beacons will drop an idle WebSocket, and the signalling
    # connection (§8) is idle almost all the time by design. The symptom is a host that is up,
    # reachable by ping, and reports itself offline to everyone who tries to reach a folder on it.
    #
    # Ethernet avoids this entirely and is worth the cable on a machine that lives on a shelf.
    local con
    con="$(nmcli -t -f NAME,TYPE connection show --active 2>/dev/null | awk -F: '$2 == "802-11-wireless" {print $1; exit}')" || true
    if [ -z "${con}" ]; then
        info "No active Wi-Fi connection — presumably on Ethernet, which is the better choice anyway."
        return
    fi

    local current
    current="$(nmcli -t -f 802-11-wireless.powersave connection show "${con}" 2>/dev/null | cut -d: -f2)" || true
    # 2 is NetworkManager's value for "power saving disabled".
    if [ "${current}" = "2" ]; then
        skip "power saving is already disabled on '${con}'"
    else
        nmcli connection modify "${con}" 802-11-wireless.powersave 2
        info "disabled Wi-Fi power saving on '${con}' (takes effect on the next connect or reboot)"
    fi
}

# ---------------------------------------------------------------------------------------------

print_summary() {
    local url
    url="$(cat "${URL_FILE}" 2>/dev/null || echo "${DEFAULT_URL}")"

    cat <<EOF


==================================================================================
  Vessel sharing host — setup complete
==================================================================================

CONFIGURED
  Packages          chromium, unclutter, x11-xserver-utils, unattended-upgrades, jq
  Boot behaviour    desktop session with autologin (raspi-config B4)
  Screen blanking   disabled on all three paths — raspi-config, X11 (lightdm drop-in plus a
                    session autostart entry), wayfire ([idle] timeouts of -1) and labwc (the
                    swayidle line in the session autostart, commented out)
  Kiosk service     ${SERVICE_NAME}.service, a systemd USER service, Restart=always
  Kiosk launcher    ${LAUNCHER}
  Kiosk URL         ${url}
  Lingering         enabled for ${USER}, so the service starts at boot without a login
  Updates           Debian security updates only, unattended. Chromium is NOT auto-upgraded,
                    on purpose — see the comment in this script.

NOT DONE, AND NOT BY ACCIDENT
  * VNC is NOT enabled and no port was opened. Nothing here listens on the network. If you want
    VNC for the one-time folder-picker step, turn it on yourself, knowing what it exposes:
        sudo raspi-config nonint do_vnc 0
    and turn it off again afterwards with 'do_vnc 1'. The guide explains the SSH-tunnelled
    alternative, which does not expose a port to the LAN at all.
  * Storage was inspected and not changed. The USB SSD, its fstab entry and the way files get onto
    it are all manual, because a wrong fstab line on a headless machine is a machine you have to
    walk to, and because installing Samba would open a port. The guide covers all of it.
  * /boot/firmware/config.txt and cmdline.txt were not touched. If this Pi runs with no monitor
    attached and the desktop fails to start, that is where the fix lives — and a mistake there is
    an unbootable machine, so the guide walks it rather than the script doing it.
  * Nothing phones home. Per SPEC-ACCOUNTS.md §9 this project stores no personal data, and a
    setup script that reported in would be a change to that inventory rather than a detail.

STILL MANUAL
EOF
    if [ "${#MANUAL[@]}" -eq 0 ]; then
        printf '  (nothing)\n'
    else
        local m
        for m in "${MANUAL[@]}"; do printf '  * %s\n' "${m}"; done
    fi

    cat <<EOF

  * Reboot, then open the sharing page once with a mouse and pick the folder. That step cannot be
    scripted: showDirectoryPicker() requires a user gesture and the permission prompt is drawn by
    the browser, outside the page. Choose "Allow on every visit" if offered, or every Chromium
    restart will need another click.

VERIFY (the guide's verification section has the expected output for each)
  loginctl show-user ${USER} --property=Linger
  systemctl --user status ${SERVICE_NAME}
  pgrep -a chromium
  journalctl --user -u ${SERVICE_NAME} -n 50 --no-pager
  loginctl list-sessions
EOF

    if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '\nWARNINGS RAISED DURING SETUP\n'
        local w
        for w in "${WARNINGS[@]}"; do printf '  * %s\n' "${w}"; done
    fi

    cat <<EOF

Reboot now to prove the whole chain — autologin, session, lingering, service, browser — comes up
without anybody helping it. That is the only test of this machine that means anything:

    sudo reboot

EOF
}

main() {
    preflight
    report_storage
    install_packages
    configure_autologin
    configure_blanking
    write_launcher
    write_unit
    enable_linger
    configure_unattended_upgrades
    configure_wifi_powersave
    print_summary
}

main "$@"
