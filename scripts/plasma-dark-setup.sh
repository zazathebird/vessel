#!/usr/bin/env bash
#
# Plasma, dark, on X11 — a customisable desktop for the sharing host.
#
# WHY X11 AND NOT WAYLAND, since Plasma is equally customisable on both:
#   1. The kiosk launcher this box runs (scripts/thinkcentre-setup.sh) blanks the
#      screen with `xset` and hides the cursor with `unclutter`. Both are X11-only
#      and fail SILENTLY under Wayland — the symptom is a kiosk whose screen goes
#      black on its own, which is the one thing an always-on host must not do.
#   2. Remoting in to see the kiosk means sharing the SESSION THAT IS ALREADY
#      RUNNING. On X11 that is krfb or x11vnc and it just works; on Wayland it
#      goes through PipeWire portals that need a prompt clicked on the machine —
#      on the machine you are remoting into because you are not standing at it.
# If the launcher is ever rewritten for Wayland, this decision is worth redoing.
#
# What it does:
#   1. Installs Plasma (if absent), SDDM, and the theming/customisation packages.
#   2. Points SDDM at the Plasma X11 session, with autologin for this user.
#      (thinkcentre-setup.sh only knows LightDM, so it skips this step and warns.)
#   3. Writes the dark theme to config FILES, so it works whether or not a Plasma
#      session is running, and applies it live as well when one is.
#   4. Matches GTK apps to the dark Qt theme — otherwise Firefox, GIMP and every
#      other GTK program stays blinding white inside a dark desktop.
#   5. Ubuntu-ish defaults: Yaru icons where available, the Ubuntu accent orange,
#      the Ubuntu font, double-click to open.
#
# Usage:
#   ./plasma-dark-setup.sh                 # install and configure
#   ./plasma-dark-setup.sh --no-install    # configure only, install nothing
#   ./plasma-dark-setup.sh --no-autologin  # leave SDDM's login screen in place
#   ./plasma-dark-setup.sh --accent 61,174,233   # a different accent, R,G,B
#   ./plasma-dark-setup.sh --look deepin   # Deepin-style dock, blur and icons
#   ./plasma-dark-setup.sh --look feren    # Feren-style taskbar + top clock chip
#   ./plasma-dark-setup.sh --look osx      # old-school OS X: menu bar + floating dock
#   ./plasma-dark-setup.sh --look zorin    # Zorin: top bar + rounded floating dock
#   ./plasma-dark-setup.sh --look unity    # Unity: vertical launcher down the LEFT
#   ./plasma-dark-setup.sh --look gnome    # GNOME: one top bar, no dock at all
#   ./plasma-dark-setup.sh --look win7     # the classic taskbar, with text labels
#   ./plasma-dark-setup.sh --save night    # snapshot the CURRENT look as "night"
#   ./plasma-dark-setup.sh --restore night # put that snapshot back
#   ./plasma-dark-setup.sh --list-profiles
#
# THE LOOKS:
#   ubuntu (default) — what this script has always done. Breeze Dark, Yaru icons,
#                      Ubuntu orange, and the panel left exactly as it is.
#   osx              — old-school OS X, dark: a thin full-width MENU BAR along the
#                      top (launcher, global menu, tray, clock) and a separate
#                      FLOATING DOCK centred at the bottom, sized to its contents
#                      rather than the screen. Window buttons move to the LEFT,
#                      which is the cheapest and strongest signal of the lot.
#   zorin            — Zorin OS, dark: structurally the same two-panel idea as osx
#                      and deliberately NOT the same thing. No global menu; the top
#                      bar carries only tray and clock, and the dock is shorter,
#                      rounder and led by a GRID launcher rather than by the running
#                      apps. Buttons on the left, as Zorin ships them.
#   unity            — Ubuntu's Unity: a thick VERTICAL launcher down the left edge
#                      plus a thin global-menu bar along the top. The only look here
#                      with a side panel, so it is the one that actually changes the
#                      shape of the screen rather than the dressing. Ubuntu orange.
#   gnome            — GNOME: ONE panel, along the top, and no dock whatsoever —
#                      launcher left, clock centred, tray right. The restraint is the
#                      look; adding a dock makes it something else.
#   win7             — the classic taskbar: start button, running apps as LABELLED
#                      buttons rather than bare icons, tray and clock right. The
#                      labels are the point — every other look here is icons-only,
#                      so this is the one that uses a different task widget.
#   feren            — the look from Feren OS's screenshots: a thin dark full-width
#                      taskbar (launcher, show-desktop, centred icon tasks, tray) and
#                      a separate floating CLOCK CHIP centred at the top, which is the
#                      detail that makes Feren recognisable. Papirus icons, teal accent.
#   deepin           — the look from Deepin's own screenshots, darker: a full-width
#                      translucent bottom dock with a fullscreen launcher at the far
#                      left, app icons centred, tray and clock right; blur on; the
#                      Bloom icon set; a dark blue-violet gradient wallpaper.
#                      This one REBUILDS THE PANEL, so it backs up the panel config
#                      first and tells you how to put it back.
set -euo pipefail

ACCENT="233,84,32"          # Ubuntu orange (#E95420)
DEEPIN_ACCENT="0,129,255"   # Deepin's own blue (#0081FF)
ACCENT_SET=0                # did the caller name a colour, or is this the default?
LOOK="ubuntu"
FEREN_ACCENT="0,150,136"    # Feren's teal (#009688)
OSX_ACCENT="0,122,255"      # the old system blue (#007AFF)
ZORIN_ACCENT="53,132,228"   # Zorin's selection blue (#3584E4)
GNOME_ACCENT="53,132,228"   # Adwaita blue (#3584E4)
WIN7_ACCENT="0,120,215"     # the classic taskbar blue (#0078D7)
# Accents taken off each distribution's own screenshot rather than from memory.
ELEMENTARY_ACCENT="54,137,230"   # elementary blue  (#3689E6)
POPOS_ACCENT="72,185,199"        # Pop!_OS teal     (#48B9C7)
ENDEAVOUR_ACCENT="127,63,191"    # EndeavourOS purple (#7F3FBF)
KDENEON_ACCENT="61,174,233"      # KDE blue         (#3DAEE9)
MANJARO_ACCENT="53,191,92"       # Manjaro green    (#35BF5C)
NITRUX_ACCENT="43,127,212"       # Nitrux blue      (#2B7FD4)
XEROLINUX_ACCENT="142,68,173"    # XeroLinux purple (#8E44AD)
ARCHCRAFT_ACCENT="110,123,139"   # Archcraft's near-monochrome (#6E7B8B)
EXODIA_ACCENT="164,139,214"      # Exodia lilac     (#A48BD6)
ACTION=""                   # save / restore / list, or empty for a normal run
PROFILE=""
DO_INSTALL=1
DO_AUTOLOGIN=1

while [ "$#" -gt 0 ]; do
    case "$1" in
        --no-install)   DO_INSTALL=0 ;;
        --no-autologin) DO_AUTOLOGIN=0 ;;
        --accent)       [ "$#" -ge 2 ] || { echo "--accent needs R,G,B" >&2; exit 1; }; ACCENT="$2"; ACCENT_SET=1; shift ;;
        --accent=*)     ACCENT="${1#--accent=}"; ACCENT_SET=1 ;;
        --look)         [ "$#" -ge 2 ] || { echo "--look needs a name" >&2; exit 1; }; LOOK="$2"; shift ;;
        --look=*)       LOOK="${1#--look=}" ;;
        --save)         [ "$#" -ge 2 ] || { echo "--save needs a name" >&2; exit 1; }; ACTION="save"; PROFILE="$2"; shift ;;
        --save=*)       ACTION="save"; PROFILE="${1#--save=}" ;;
        --restore)      [ "$#" -ge 2 ] || { echo "--restore needs a name" >&2; exit 1; }; ACTION="restore"; PROFILE="$2"; shift ;;
        --restore=*)    ACTION="restore"; PROFILE="${1#--restore=}" ;;
        --list-profiles) ACTION="list" ;;
        -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)              echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done
printf '%s' "${ACCENT}" | grep -Eq '^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$' || { echo "--accent must be R,G,B (0-255 each)" >&2; exit 1; }

# A closed set, matched before anything consumes it. LOOK reaches a filename and a
# qdbus payload below, so "whatever you typed" must never get that far.
case "${LOOK}" in
    ubuntu|deepin|deepin-exact|feren|osx|zorin|unity|gnome|win7) ;;
    elementary|popos|endeavour|kdeneon|manjaro|nitrux|xerolinux|archcraft|exodia) ;;
    *) echo "--look must be one of: ubuntu deepin deepin-exact feren osx zorin unity gnome win7 elementary popos endeavour kdeneon manjaro nitrux xerolinux archcraft exodia (got: ${LOOK})" >&2; exit 1 ;;
esac

# A profile name reaches a filename, so it is matched against a closed charset
# before anything consumes it — the same rule as --look and --accent above.
if [ -n "${PROFILE}" ]; then
    printf '%s' "${PROFILE}" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' \
        || { echo "a profile name must be letters, digits, dot, dash or underscore" >&2; exit 1; }
fi

# Deepin's accent is blue, not Ubuntu orange — but --accent still wins, so asking
# for the Deepin layout in somebody else's colour is one flag rather than a fork.
if [ "${ACCENT_SET}" -eq 0 ]; then
    case "${LOOK}" in
        deepin) ACCENT="${DEEPIN_ACCENT}" ;;
        feren)  ACCENT="${FEREN_ACCENT}" ;;
        osx)    ACCENT="${OSX_ACCENT}" ;;
        zorin)  ACCENT="${ZORIN_ACCENT}" ;;
        gnome)  ACCENT="${GNOME_ACCENT}" ;;
        win7)   ACCENT="${WIN7_ACCENT}" ;;
        unity)  ACCENT="233,84,32" ;;   # Unity kept Ubuntu orange
        deepin-exact) ACCENT="${DEEPIN_ACCENT}" ;;
        elementary) ACCENT="${ELEMENTARY_ACCENT}" ;;
        popos)      ACCENT="${POPOS_ACCENT}" ;;
        endeavour)  ACCENT="${ENDEAVOUR_ACCENT}" ;;
        kdeneon)    ACCENT="${KDENEON_ACCENT}" ;;
        manjaro)    ACCENT="${MANJARO_ACCENT}" ;;
        nitrux)     ACCENT="${NITRUX_ACCENT}" ;;
        xerolinux)  ACCENT="${XEROLINUX_ACCENT}" ;;
        archcraft)  ACCENT="${ARCHCRAFT_ACCENT}" ;;
        exodia)     ACCENT="${EXODIA_ACCENT}" ;;
    esac
fi

# Light or dark. Everything here is dark except deepin-exact, which is a faithful
# copy of Deepin's own screenshot — and that screenshot is Deepin's LIGHT theme.
#
# These are variables rather than the literals they replaced below because a look
# that changes the scheme has to change the colour scheme, the Plasma theme, the
# look-and-feel package AND the GTK theme together. Changing one and not the rest
# is how you end up with a light desktop wearing black panels, which looks like a
# rendering fault rather than a choice.
case "${LOOK}" in
    deepin-exact|kdeneon) SCHEME="BreezeLight"; LNF="org.kde.breeze.desktop"
                  PLASMA_THEME="default";     GTK_PREF="Breeze"      ; GTK_DARK=0 ;;
    *)            SCHEME="BreezeDark";  LNF="org.kde.breezedark.desktop"
                  PLASMA_THEME="breeze-dark"; GTK_PREF="Breeze-Dark" ; GTK_DARK=1 ;;
esac

# ----------------------------------------------------------------------------
# Profiles: snapshot the live look, and put one back.
# ----------------------------------------------------------------------------
# These are the files that between them ARE a look — colours, fonts, icons, the
# window manager's effects, and the panel layout. A profile is a tarball of just
# these, so restoring one cannot disturb anything else in the account.
PROFILE_DIR="${HOME}/.local/share/plasma-looks"
LOOK_FILES=(.config/kdeglobals
            .config/plasmarc
            .config/kwinrc
            .config/plasmashellrc
            .config/plasma-org.kde.plasma.desktop-appletsrc
            .config/gtk-3.0/settings.ini
            .config/gtk-4.0/settings.ini
            .gtkrc-2.0)

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    WARNING: %s\033[0m\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Profile actions need no root and no packages, so they run and exit before the
# sudo gate below — restoring a look on a machine you cannot sudo on is normal.
case "${ACTION}" in
    list)
        if [ -d "${PROFILE_DIR}" ] && ls "${PROFILE_DIR}"/*.tar.gz >/dev/null 2>&1; then
            printf 'Saved looks in %s:\n' "${PROFILE_DIR}"
            for f in "${PROFILE_DIR}"/*.tar.gz; do
                printf '  %-24s %s\n' "$(basename "${f}" .tar.gz)" "$(date -r "${f}" '+%Y-%m-%d %H:%M')"
            done
        else
            printf 'No saved looks yet. Make one with:  %s --save <name>\n' "$0"
        fi
        exit 0 ;;
    save)
        mkdir -p "${PROFILE_DIR}"
        present=()
        for f in "${LOOK_FILES[@]}"; do [ -f "${HOME}/${f}" ] && present+=("${f}"); done
        [ "${#present[@]}" -gt 0 ] || { echo "Nothing to save — none of the look files exist yet." >&2; exit 1; }
        tar czf "${PROFILE_DIR}/${PROFILE}.tar.gz" -C "${HOME}" "${present[@]}"
        printf 'Saved %d files as "%s" in %s\n' "${#present[@]}" "${PROFILE}" "${PROFILE_DIR}"
        printf 'Put it back with:  %s --restore %s\n' "$0" "${PROFILE}"
        exit 0 ;;
    restore)
        ARCHIVE="${PROFILE_DIR}/${PROFILE}.tar.gz"
        [ -f "${ARCHIVE}" ] || { echo "No saved look called '${PROFILE}'. Try --list-profiles." >&2; exit 1; }
        # Snapshot what is there now first. Restoring is how you find out that the
        # thing you were about to overwrite was the one you wanted.
        #
        # STAMPED, NOT A FIXED NAME. It was always `before-restore.tar.gz`, so the
        # second --restore overwrote the snapshot the first one took — which is
        # the account's ORIGINAL look, the only copy nobody made on purpose —
        # while printing a line saying it was saved. Two restores in a row is
        # the ordinary way to use this: try one, dislike it, try another.
        mkdir -p "${PROFILE_DIR}"
        prev=()
        for f in "${LOOK_FILES[@]}"; do [ -f "${HOME}/${f}" ] && prev+=("${f}"); done
        BACKUP="before-restore-$(date '+%Y%m%d-%H%M%S')"
        if [ "${#prev[@]}" -gt 0 ]; then
            tar czf "${PROFILE_DIR}/${BACKUP}.tar.gz" -C "${HOME}" "${prev[@]}"
        else
            BACKUP=""
        fi

        # AN EXPLICIT MEMBER LIST, because the sentence above LOOK_FILES — "a
        # profile is a tarball of just these, so restoring one cannot disturb
        # anything else in the account" — was a description of how the tarball
        # is WRITTEN and not of how it is read. `tar xzf` with no member list
        # extracts whatever the file happens to contain, and on this machine
        # that includes ~/.config/systemd/user, where the kiosk unit lives: a
        # tarball from anywhere else, or one edited, could replace the service
        # that does the sharing. Only names this script knows are extracted, so
        # an archive can add nothing to the account, and the intersection is
        # taken first because naming a member tar cannot find is an error.
        want=()
        while IFS= read -r member; do
            for f in "${LOOK_FILES[@]}"; do
                if [ "${member}" = "${f}" ]; then want+=("${member}"); break; fi
            done
        done < <(tar tzf "${ARCHIVE}")
        [ "${#want[@]}" -gt 0 ] || die "'${PROFILE}' contains none of the files a look is made of."
        tar xzf "${ARCHIVE}" -C "${HOME}" -- "${want[@]}"
        printf 'Restored "%s" (%d files).\n' "${PROFILE}" "${#want[@]}"
        if [ -n "${BACKUP}" ]; then printf 'The look it replaced is saved as "%s".\n' "${BACKUP}"; fi
        if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "/run/user/$(id -u)/bus" ]; then
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
        fi
        systemctl --user restart plasma-plasmashell.service >/dev/null 2>&1 \
            && printf 'plasmashell restarted.\n' \
            || printf 'Log out and back in to see it.\n'
        for c in qdbus6 qdbus; do command -v "$c" >/dev/null 2>&1 && "$c" org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 && break; done
        exit 0 ;;
esac

[ "$(id -u)" -ne 0 ] || die "Run this as the user whose desktop it is, not root. Every setting below
       lands in that user's ~/.config; as root it themes root's desktop, which nobody sees."
command -v sudo >/dev/null 2>&1 || die "sudo is not installed. As root: apt install sudo && /usr/sbin/usermod -aG sudo ${USER}"
sudo -v || die "sudo refused. Is ${USER} in the sudo group?"
[ -r /etc/os-release ] && grep -qE '^(ID|ID_LIKE)=.*debian' /etc/os-release || die "This is apt/Debian-only."

# ----------------------------------------------------------------------------
# 1. Packages.
# ----------------------------------------------------------------------------
if [ "${DO_INSTALL}" -eq 1 ]; then
    log "Installing Plasma and the parts that make it themeable"
    sudo apt-get update -q

    # Core: the desktop itself, its login manager, and the X11 session package.
    # kde-standard over kde-plasma-desktop — the minimal task leaves out Dolphin's
    # plugins, Ark, Gwenview and Spectacle, which is a desktop you immediately
    # have to fix by hand.
    CORE=(kde-standard sddm plasma-workspace-x11 systemsettings)

    # Theming. kde-config-gtk-style is the load-bearing one: without it Plasma has
    # no way to tell GTK apps what theme to use, and half the desktop stays light.
    THEME=(kde-config-gtk-style breeze-gtk-theme qt5-style-kvantum qt5-style-kvantum-themes
           papirus-icon-theme plasma-workspace-wallpapers
           fonts-noto fonts-noto-color-emoji fonts-jetbrains-mono)

    # The Ubuntu look, from Debian's own packages. Optional by design: these names
    # move between releases, and a missing font must not fail the whole install.
    UBUNTUISH=(yaru-theme-icon yaru-theme-gtk fonts-ubuntu)

    # The Deepin look: Bloom (Deepin's own icon set, and the dark variant is what
    # makes it read as Deepin rather than as generic Plasma), and ImageMagick to
    # draw the wallpaper. Optional like the rest — the icon picker below falls back
    # rather than naming a theme that is not on disk.
    DEEPINISH=(deepin-icon-theme imagemagick)

    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${CORE[@]}" || die "The core desktop install failed. Fix the apt error above and re-run."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${THEME[@]}" || info "some theming packages failed; continuing"
    OPTIONAL=("${UBUNTUISH[@]}")
    [ "${LOOK}" = "deepin" ] && OPTIONAL+=("${DEEPINISH[@]}")
    missing=()
    for p in "${OPTIONAL[@]}"; do
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$p" >/dev/null 2>&1 || missing+=("$p")
    done
    [ "${#missing[@]}" -eq 0 ] || info "not in this release's archive, skipped: ${missing[*]}"
else
    info "skipping package installation (--no-install)"
fi

# Which icon theme actually exists, best first. Never name a theme that is not on
# disk: Plasma falls back silently and you get a half-themed desktop with no error.
ICONS="breeze-dark"
case "${LOOK}" in
    deepin) CANDIDATES=(bloom-dark bloom Papirus-Dark breeze-dark) ;;
    feren)  CANDIDATES=(Papirus-Dark Papirus breeze-dark) ;;
    osx)    CANDIDATES=(Papirus-Dark bloom-dark breeze-dark) ;;
    zorin)  CANDIDATES=(Papirus-Dark bloom-dark breeze-dark) ;;
    unity)  CANDIDATES=(Yaru-dark Yaru Papirus-Dark breeze-dark) ;;
    gnome)  CANDIDATES=(Adwaita Papirus-Dark breeze-dark) ;;
    win7)   CANDIDATES=(Papirus-Dark breeze-dark) ;;
    # The LIGHT Bloom, deliberately: the reference screenshot's dock is pale and
    # its icons are the light set. bloom-dark here would be the one wrong note.
    deepin-exact) CANDIDATES=(bloom bloom-classic Papirus breeze) ;;
    kdeneon)      CANDIDATES=(breeze Papirus bloom) ;;
    elementary|popos|nitrux|xerolinux|endeavour|manjaro|archcraft|exodia)
                  CANDIDATES=(Papirus-Dark bloom-dark breeze-dark) ;;
    *)      CANDIDATES=(Yaru-dark Yaru Papirus-Dark breeze-dark) ;;
esac
for candidate in "${CANDIDATES[@]}"; do
    if [ -d "/usr/share/icons/${candidate}" ]; then ICONS="${candidate}"; break; fi
done
info "icon theme: ${ICONS}"

# ----------------------------------------------------------------------------
# 2. SDDM: the Plasma X11 session, and autologin.
# ----------------------------------------------------------------------------
log "Configuring the login manager"

# The X11 session file is named plasmax11 on Plasma 6 and plasma on Plasma 5.
SESSION=""
for s in plasmax11 plasma; do
    [ -f "/usr/share/xsessions/${s}.desktop" ] && { SESSION="${s}"; break; }
done
if [ -z "${SESSION}" ]; then
    warn "No Plasma X11 session found in /usr/share/xsessions. Install plasma-workspace-x11,
             or the desktop will start under Wayland and the kiosk's screen blanking will fail."
else
    info "X11 session: ${SESSION}"
fi

if command -v sddm >/dev/null 2>&1; then
    sudo mkdir -p /etc/sddm.conf.d
    tmp="$(mktemp)"
    {
        printf '# Written by plasma-dark-setup.sh. Delete this file to undo it.\n'
        printf '[Theme]\nCurrent=breeze\n\n'
        printf '[General]\nDisplayServer=x11\n'
        if [ "${DO_AUTOLOGIN}" -eq 1 ] && [ -n "${SESSION}" ]; then
            printf '\n[Autologin]\nUser=%s\nSession=%s\nRelogin=false\n' "${USER}" "${SESSION}"
        fi
    } > "${tmp}"
    sudo install -o root -g root -m 0644 "${tmp}" /etc/sddm.conf.d/10-vessel.conf
    rm -f "${tmp}"
    info "wrote /etc/sddm.conf.d/10-vessel.conf"
    [ "${DO_AUTOLOGIN}" -eq 1 ] && info "autologin: ${USER} into ${SESSION:-<no X11 session found>}"

    # Make SDDM the display manager if something else currently is. Debian reads
    # this file at boot; the systemd units follow it.
    current="$(cat /etc/X11/default-display-manager 2>/dev/null || true)"
    if [ "${current}" != "/usr/bin/sddm" ]; then
        printf '/usr/bin/sddm\n' | sudo tee /etc/X11/default-display-manager >/dev/null
        for other in lightdm gdm3 lxdm; do
            systemctl list-unit-files "${other}.service" >/dev/null 2>&1 && sudo systemctl disable "${other}" >/dev/null 2>&1 || true
        done
        # VERIFIED, NOT ASSUMED. `|| true` followed by an unconditional "switched
        # to sddm" is how a machine reboots to a text console with no kiosk and
        # no file sharing, with the only record of the change saying it worked.
        # `is-enabled` is asked of systemd rather than of this script.
        sudo systemctl enable sddm >/dev/null 2>&1 || true
        if [ "$(systemctl is-enabled sddm 2>/dev/null || true)" = "enabled" ]; then
            info "display manager switched from ${current:-none} to sddm (takes effect at reboot)"
        else
            warn "sddm was NOT enabled (systemctl is-enabled says '$(systemctl is-enabled sddm 2>&1 | head -1)').
       /etc/X11/default-display-manager now names it, so this machine may reboot to a
       console with no desktop and no sharing. Fix it before rebooting:
           sudo systemctl enable sddm && systemctl is-enabled sddm"
        fi
    else
        info "sddm is already the display manager"
    fi
else
    warn "sddm is not installed, so the login manager was left alone."
fi

# ----------------------------------------------------------------------------
# 3. The dark theme, written to files.
# ----------------------------------------------------------------------------
# Deliberately file-first rather than `lookandfeeltool` alone: this script may be
# run over SSH before anyone has logged in graphically, and a tool that needs a
# live session would do nothing and say it succeeded. The live apply below is the
# bonus, not the mechanism.
log "Applying the dark theme"

KW=""
for c in kwriteconfig6 kwriteconfig5; do command -v "$c" >/dev/null 2>&1 && { KW="$c"; break; }; done
[ -n "${KW}" ] || warn "Neither kwriteconfig6 nor kwriteconfig5 is installed; writing config files directly."

set_key() {  # file group key value
    if [ -n "${KW}" ]; then
        "${KW}" --file "$1" --group "$2" --key "$3" "$4"
    fi
}

mkdir -p "${HOME}/.config"
set_key kdeglobals General ColorScheme "${SCHEME}"
set_key kdeglobals General AccentColor "${ACCENT}"
set_key kdeglobals General LastUsedCustomAccentColor "${ACCENT}"
set_key kdeglobals Icons Theme "${ICONS}"
set_key kdeglobals KDE LookAndFeelPackage "${LNF}"
set_key kdeglobals KDE SingleClick "false"      # Ubuntu opens on double-click
set_key kdeglobals KDE widgetStyle "Breeze"
set_key plasmarc Theme name "${PLASMA_THEME}"
set_key kwinrc org.kde.kdecoration2 theme "Breeze"
set_key kdeglobals General fixed "JetBrains Mono,10,-1,5,50,0,0,0,0,0"

# The font, only if it is actually installed — a named-but-absent font is how a
# desktop ends up rendering in the toolkit's last-resort fallback.
# NO `grep -q` ON THE END OF THIS PIPE. `-q` exits at the first match, `fc-list`
# then takes SIGPIPE, and `set -o pipefail` at the top of this file reports the
# pipeline's status as 141 — so a SUCCESSFUL match reads as "font not
# installed", and the desktop is left on the Plasma default with a line saying
# fonts-ubuntu is missing. It only bites once fc-list's output passes the pipe
# buffer, which is every real machine and no small test one. Letting grep read
# to the end costs a few milliseconds and cannot lie.
if fc-list 2>/dev/null | grep -i 'Ubuntu-R\|Ubuntu Regular' >/dev/null; then
    for key in font menuFont toolBarFont smallestReadableFont; do
        set_key kdeglobals General "${key}" "Ubuntu,10,-1,5,50,0,0,0,0,0"
    done
    set_key kdeglobals WM activeFont "Ubuntu,10,-1,5,63,0,0,0,0,0"
    info "font: Ubuntu"
else
    info "font: left at the Plasma default (fonts-ubuntu not installed)"
fi

# Night colour, the one setting people always go looking for.
set_key kwinrc NightColor Active "true"
set_key kwinrc NightColor Mode "Location"

info "colour scheme: ${SCHEME}, accent ${ACCENT}"

# ----------------------------------------------------------------------------
# 4. GTK apps, so the other half of the desktop is dark too.
# ----------------------------------------------------------------------------
log "Matching GTK applications"
GTK_THEME="${GTK_PREF}"
if [ "${GTK_DARK}" -eq 1 ]; then
    [ -d /usr/share/themes/Yaru-dark ] && GTK_THEME="Yaru-dark"
else
    [ -d /usr/share/themes/Breeze ] && GTK_THEME="Breeze"
fi

for v in 3.0 4.0; do
    mkdir -p "${HOME}/.config/gtk-${v}"
    cat > "${HOME}/.config/gtk-${v}/settings.ini" <<EOF
[Settings]
gtk-theme-name=${GTK_THEME}
gtk-icon-theme-name=${ICONS}
gtk-application-prefer-dark-theme=${GTK_DARK}
gtk-cursor-theme-name=breeze_cursors
EOF
done
cat > "${HOME}/.gtkrc-2.0" <<EOF
gtk-theme-name="${GTK_THEME}"
gtk-icon-theme-name="${ICONS}"
gtk-cursor-theme-name="breeze_cursors"
EOF
# The environment variable is what catches apps that read neither file — notably
# anything launched from a terminal rather than from the menu.
# WRITTEN EVERY RUN, NOT ONCE. This used to append only when the variable was
# absent, so the FIRST look this script ever applied owned $GTK_THEME for good:
# switching from a dark look to `deepin-exact` or `kdeneon` rewrote all three
# settings files and left the environment variable naming the dark theme, so
# every application started from a terminal stayed dark on a light desktop —
# and the line saying "GTK theme: Breeze" was true of the files and false of the
# session. The rewrite is surgical: only this script's own export line changes.
if grep -qs '^export GTK_THEME=' "${HOME}/.profile" 2>/dev/null; then
    tmp="$(mktemp)"
    awk -v theme="${GTK_THEME}" '
        /^export GTK_THEME=/ { print "export GTK_THEME=" theme; next }
        { print }
    ' "${HOME}/.profile" > "${tmp}" && mv "${tmp}" "${HOME}/.profile"
else
    printf '\n# dark GTK apps (plasma-dark-setup.sh)\nexport GTK_THEME=%s\n' "${GTK_THEME}" >> "${HOME}/.profile"
fi
info "GTK theme: ${GTK_THEME} (gtk2, gtk3, gtk4 and \$GTK_THEME)"

# ----------------------------------------------------------------------------
# 5. Apply live, if a session is running.
# ----------------------------------------------------------------------------
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v lookandfeeltool >/dev/null 2>&1; then
    log "Applying to the running session"
    # ${LNF}, NEVER a literal. This line was hardcoded to breezedark while section 3
    # above wrote the look's own package to disk — so a light look was written and
    # then immediately overwritten by the dark one at apply time, and the only
    # symptom was a dark panel on a light desktop that no output mentioned.
    lookandfeeltool -a "${LNF}" >/dev/null 2>&1 && info "applied live: ${LNF}" \
        || info "could not apply live; it lands at the next login"

    # Applying a look-and-feel package REWRITES the colour scheme, the Plasma
    # theme, the icon theme and the accent to whatever that package prefers —
    # it is a whole preset, not a single setting. So everything section 3 chose
    # is re-asserted here, AFTER it, or the look silently reverts to stock Breeze
    # with none of the choices above and no error anywhere.
    set_key kdeglobals General ColorScheme "${SCHEME}"
    set_key kdeglobals General AccentColor "${ACCENT}"
    set_key kdeglobals General LastUsedCustomAccentColor "${ACCENT}"
    set_key kdeglobals Icons Theme "${ICONS}"
    set_key plasmarc Theme name "${PLASMA_THEME}"
    info "re-asserted scheme/accent/icons over the look-and-feel package"
fi

# ----------------------------------------------------------------------------
# 5b. The look: blur, wallpaper and the panel.
# ----------------------------------------------------------------------------
# ORDERING IS LOAD-BEARING: this runs AFTER the lookandfeeltool call above,
# because applying a look-and-feel package RESETS the panel layout. Build the
# panel first and it is quietly gone by the time the script finishes, with
# nothing in the output to say so.
#
# This is also the one place the script drives plasmashell's scripting API
# rather than writing a config file, and that is a deliberate exception to the
# note at the bottom of this script. Dragging a panel to an edge is two minutes
# by hand; rebuilding it as a named look — and Feren needs TWO panels — is not,
# and the API is the supported way. The panel config is backed up first, because
# it is the only copy of what was there.
if [ "${LOOK}" != "ubuntu" ]; then
    log "The ${LOOK} look"

    # -- blur ---------------------------------------------------------------
    case "${LOOK}" in
        deepin) BLUR_STRENGTH=15; TRANS_INACTIVE=82 ;;
        feren)  BLUR_STRENGTH=8;  TRANS_INACTIVE=92 ;;
        osx)    BLUR_STRENGTH=14; TRANS_INACTIVE=85 ;;
        zorin)  BLUR_STRENGTH=12; TRANS_INACTIVE=88 ;;
        unity)  BLUR_STRENGTH=12; TRANS_INACTIVE=86 ;;
        gnome)  BLUR_STRENGTH=10; TRANS_INACTIVE=92 ;;
        win7)   BLUR_STRENGTH=9;  TRANS_INACTIVE=94 ;;
        deepin-exact) BLUR_STRENGTH=15; TRANS_INACTIVE=100 ;;
        elementary)   BLUR_STRENGTH=13; TRANS_INACTIVE=88 ;;
        popos)        BLUR_STRENGTH=11; TRANS_INACTIVE=90 ;;
        endeavour)    BLUR_STRENGTH=13; TRANS_INACTIVE=86 ;;
        kdeneon)      BLUR_STRENGTH=9;  TRANS_INACTIVE=100 ;;
        manjaro)      BLUR_STRENGTH=10; TRANS_INACTIVE=90 ;;
        nitrux)       BLUR_STRENGTH=14; TRANS_INACTIVE=85 ;;
        xerolinux)    BLUR_STRENGTH=15; TRANS_INACTIVE=84 ;;
        archcraft)    BLUR_STRENGTH=8;  TRANS_INACTIVE=90 ;;
        exodia)       BLUR_STRENGTH=8;  TRANS_INACTIVE=88 ;;
        *)      BLUR_STRENGTH=10; TRANS_INACTIVE=90 ;;
    esac

    # Window buttons. Set EXPLICITLY for every look, never only for the looks that
    # move them: these live in kwinrc and SURVIVE a look change, so setting them in
    # the osx branch alone leaves traffic lights on the left after switching back to
    # deepin, and the only clue is a button that is not where it was. The same trap
    # as the panel, one file over.
    case "${LOOK}" in
        elementary) # close left, maximise right — elementary's own split, and the
                    # only look here that does not put them all on one side.
                    set_key kwinrc org.kde.kdecoration2 ButtonsOnLeft "X"
                    set_key kwinrc org.kde.kdecoration2 ButtonsOnRight "A"
                    info "window buttons: close left, maximise right" ;;
        osx|zorin|unity) set_key kwinrc org.kde.kdecoration2 ButtonsOnLeft "XIA"
                   set_key kwinrc org.kde.kdecoration2 ButtonsOnRight ""
                   info "window buttons: left (close, minimise, maximise)" ;;
        *)         set_key kwinrc org.kde.kdecoration2 ButtonsOnLeft "M"
                   set_key kwinrc org.kde.kdecoration2 ButtonsOnRight "HIAX" ;;
    esac
    set_key kwinrc Plugins blurEnabled "true"
    set_key kwinrc Plugins contrastEnabled "true"
    set_key kwinrc Effect-blur BlurStrength "${BLUR_STRENGTH}"
    set_key kwinrc Effect-blur NoiseStrength "4"
    info "blur: on (strength ${BLUR_STRENGTH})"

    # Transparency across the whole interface, not only the panel. KWin's
    # translucency effect is the lever that needs no theme engine and no extra
    # package, so it cannot leave the desktop half-styled if something is missing.
    #
    # ACTIVE WINDOWS ARE DELIBERATELY LEFT OPAQUE. Every value here is a window
    # you are not currently reading; the one you ARE reading stays solid, because
    # translucent body text over a busy wallpaper is a legibility problem rather
    # than a look. Blur above is what keeps the translucent ones readable.
    set_key kwinrc Plugins translucencyEnabled "true"
    set_key kwinrc Effect-translucency Inactive "${TRANS_INACTIVE}"
    set_key kwinrc Effect-translucency MoveResize "80"
    set_key kwinrc Effect-translucency Dialogs "92"
    set_key kwinrc Effect-translucency DropdownMenus "88"
    set_key kwinrc Effect-translucency PopupMenus "88"
    set_key kwinrc Effect-translucency ComboboxPopups "88"
    set_key kwinrc Effect-translucency Decoration "100"
    info "translucency: inactive windows ${TRANS_INACTIVE}%, menus 88%, active windows left solid"

    # -- wallpaper ----------------------------------------------------------
    # THE TRAP, measured 2026-09-12. Debian's desktop-base wallpapers are SVGs
    # carrying BOTH a light and a dark palette, switched inside the file by an
    # @media (prefers-color-scheme: dark) block. Qt's SVG renderer — which is
    # what Plasma uses when handed a wallpaper — DOES NOT IMPLEMENT that query,
    # so it paints the LIGHT variant on a dark desktop and reports no error.
    # rsvg-convert does implement it. So the SVG is rendered to a PNG here and
    # Plasma is handed the PNG. Pointing Plasma at the .svg, or at the wallpaper
    # package directory, gets you the pale version — that is not a theory, it is
    # what shipped on this box on the first run.
    # Order set by LOOKING at all ten of desktop-base's wallpapers rendered at
    # full source size, 2026-09-12, not by reasoning about them. Mean brightness
    # of the render, lower is darker:
    #   homeworld 1%   moonlight 20%   spacefun 23%   emerald 26%   joy 33%
    #   futureprototype 36%   futureprototype-withlogo 37%   lines 40%   softwaves 72%
    # homeworld is near-black navy with a small teal swirl and the wordmark — the
    # dark Debian swirl, and by a wide margin. futureprototype is simply a PALE
    # wallpaper; an earlier version of this script preferred it on the strength of
    # a thumbnail render whose gradients had silently failed, so it looked dark in
    # the contact sheet and shipped pale on the desktop twice.
    # Per-look wallpaper. Each pair is taken off that distribution's OWN
    # screenshot — its two dominant colours, in the direction the original runs.
    #
    # This exists because of what the first contact sheet of all fourteen looks
    # showed: the panel layouts were genuinely different and the desktops still
    # read as one desktop fourteen times, because every one of them wore the same
    # Debian wallpaper. Colour is doing more of the identifying than layout is.
    # A look with no entry here keeps the dark Debian swirl, which is the right
    # default for the ones that are not imitating anybody (ubuntu, gnome, win7).
    GRAD_FROM=""; GRAD_TO=""; GRAD_ANGLE=135
    case "${LOOK}" in
        deepin-exact) GRAD_FROM="#F0468C"; GRAD_TO="#2FB6F0" ;;
        elementary)   GRAD_FROM="#2C4A6E"; GRAD_TO="#8FA9C4"; GRAD_ANGLE=160 ;;
        popos)        GRAD_FROM="#0B1F2E"; GRAD_TO="#16364A"; GRAD_ANGLE=150 ;;
        endeavour)    GRAD_FROM="#1B2A6B"; GRAD_TO="#5B3FA8" ;;
        kdeneon)      GRAD_FROM="#7FC3E8"; GRAD_TO="#2B6FA8"; GRAD_ANGLE=120 ;;
        manjaro)      GRAD_FROM="#2B2B2B"; GRAD_TO="#16A085"; GRAD_ANGLE=115 ;;
        nitrux)       GRAD_FROM="#E8455F"; GRAD_TO="#2FBFA0"; GRAD_ANGLE=145 ;;
        xerolinux)    GRAD_FROM="#6B2D6B"; GRAD_TO="#E8A0C0"; GRAD_ANGLE=165 ;;
        archcraft)    GRAD_FROM="#3A3A3A"; GRAD_TO="#8A8A8A"; GRAD_ANGLE=140 ;;
        exodia)       GRAD_FROM="#1E1B2E"; GRAD_TO="#4A3D6B"; GRAD_ANGLE=150 ;;
        feren)        GRAD_FROM="#0E4A4A"; GRAD_TO="#2FA8A8"; GRAD_ANGLE=155 ;;
    esac

    WALL=""
    SRC=""
    if [ -n "${GRAD_FROM}" ]; then
        IMX=""
        for c in magick convert; do command -v "$c" >/dev/null 2>&1 && { IMX="$c"; break; }; done
        if [ -n "${IMX}" ]; then
            WALL="${HOME}/.local/share/wallpapers/look-${LOOK}.png"
            mkdir -p "$(dirname "${WALL}")"
            if "${IMX}" -size 2560x1440 -define gradient:angle=${GRAD_ANGLE} \
                    gradient:"${GRAD_FROM}"-"${GRAD_TO}" "${WALL}" 2>/dev/null; then
                info "wallpaper: ${GRAD_FROM} to ${GRAD_TO} at ${GRAD_ANGLE} degrees"
            else
                warn "could not draw the gradient; falling back to the Debian swirl"
                WALL=""
            fi
        fi
    fi

    # deepin-exact skips the Debian swirl entirely: its reference is Deepin's own
    # magenta-to-cyan gradient, so a dark navy swirl would be the wrong picture no
    # matter how well it renders. Drawn rather than shipped — the original carries
    # Deepin's wordmark and logo, which have no business on a Debian desktop, so
    # this reproduces the COLOUR RAMP and leaves the branding off.
    [ -n "${WALL}" ] || \
    for c in /usr/share/desktop-base/homeworld-theme/wallpaper/contents/images/3840x2160.svg \
             /usr/share/desktop-base/moonlight-theme/wallpaper/contents/images/3840x2160.svg \
             /usr/share/desktop-base/spacefun-theme/wallpaper/contents/images/3840x2160.svg; do
        [ -f "${c}" ] && { SRC="${c}"; break; }
    done

    if [ -n "${SRC}" ] && command -v rsvg-convert >/dev/null 2>&1; then
        WALL="${HOME}/.local/share/wallpapers/debian-dark.png"
        mkdir -p "$(dirname "${WALL}")"
        if rsvg-convert -w 2560 -h 1440 "${SRC}" -o "${WALL}" 2>/dev/null; then
            info "wallpaper: rendered ${SRC#/usr/share/desktop-base/}"
        else
            warn "rsvg-convert could not render the wallpaper"
            WALL=""
        fi
    fi

    # Assert it actually came out dark rather than trusting the renderer. This is
    # the check that would have caught the light variant the first time round.
    #
    # THE THRESHOLD IS 45 AND IT WAS 35 FIRST, which was wrong by measurement
    # rather than by taste: the stock futureprototype swirl renders at 37% mean
    # brightness and looks properly dark on screen — it is charcoal with a pale
    # swirl, and a bright swirl on a large dark ground still averages upward.
    # At 35 the guard rejected the very wallpaper it was written to deliver and
    # silently fell back to the drawn gradient. 45 still refuses the LIGHT
    # variant of the same file, which is what this exists to catch: that one
    # renders in the 60s.
    # deepin-exact is exempt: it is the one look that is MEANT to be bright, and
    # this guard would reject its own wallpaper and silently swap in a dark one.
    DARK_MAX=45
    if [ -z "${GRAD_FROM}" ] && [ -n "${WALL}" ] && command -v convert >/dev/null 2>&1; then
        MEAN="$(convert "${WALL}" -colorspace Gray -format '%[fx:int(mean*100)]' info: 2>/dev/null || echo 50)"
        if [ "${MEAN:-50}" -gt "${DARK_MAX}" ]; then
            warn "that wallpaper renders at ${MEAN}% brightness, over the ${DARK_MAX}% ceiling. Drawing one instead."
            WALL=""
        else
            info "wallpaper brightness: ${MEAN}% of white"
        fi
    fi

    # Fallback: draw one. Same idea as Deepin's own gradient, several stops down.
    if [ -z "${WALL}" ]; then
        IM=""
        for c in magick convert; do command -v "$c" >/dev/null 2>&1 && { IM="$c"; break; }; done
        if [ -n "${IM}" ]; then
            WALL="${HOME}/.local/share/wallpapers/dark-gradient.png"
            mkdir -p "$(dirname "${WALL}")"
            ta="$(mktemp --suffix=.png)"; tb="$(mktemp --suffix=.png)"
            if "${IM}" -size 2560x1440 -define gradient:angle=160 gradient:'#3b1f70'-'#04070f' "${ta}" 2>/dev/null \
               && "${IM}" -size 2560x1440 radial-gradient:'#124a8c'-'#000000' "${tb}" 2>/dev/null \
               && "${IM}" "${ta}" "${tb}" -compose screen -composite -brightness-contrast -8x6 "${WALL}" 2>/dev/null; then
                info "wallpaper: drew ${WALL}"
            else
                warn "could not draw a wallpaper either; leaving the current one."
                WALL=""
            fi
            rm -f "${ta}" "${tb}"
        else
            warn "no rsvg-convert and no ImageMagick, so the wallpaper was left alone."
        fi
    fi

    # -- the panel(s) -------------------------------------------------------
    # Over SSH there is no session bus in the environment, and qdbus then talks
    # to nothing and STILL EXITS 0 — the failure mode this whole script is
    # written against. Point it at the running session's bus by hand.
    if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "/run/user/$(id -u)/bus" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi

    QD=""
    for c in qdbus6 qdbus qdbus-qt6; do command -v "$c" >/dev/null 2>&1 && { QD="$c"; break; }; done

    if [ -z "${QD}" ]; then
        warn "qdbus is not installed, so the panel was not rebuilt."
    elif ! "${QD}" org.kde.plasmashell >/dev/null 2>&1; then
        warn "plasmashell is not answering on the session bus, so the panel was not rebuilt.
             Everything else above did land. Re-run from inside the desktop session."
    else
        # A colour-scheme or Plasma-theme change is only read by plasmashell AT
        # STARTUP. Section 3 above wrote the new scheme to disk, but the running
        # process is still wearing the old one — so building the panel now gives
        # you the new LAYOUT in the old COLOURS. That is not hypothetical: the
        # first deepin-exact run produced a dark navy dock sitting on a light
        # desktop over a bright wallpaper, and nothing in the output said so.
        #
        # Restart first and WAIT for the bus name to come back before building.
        # Restarting after the panel is built is the other way to get this wrong:
        # the layout is still in the old process and may not have been flushed.
        if systemctl --user restart plasma-plasmashell.service >/dev/null 2>&1; then
            for _ in $(seq 1 30); do
                "${QD}" org.kde.plasmashell >/dev/null 2>&1 && break
                sleep 1
            done
            if "${QD}" org.kde.plasmashell >/dev/null 2>&1; then
                info "plasmashell restarted, so the panel is built in the new theme"
                SHELL_UP=1
            else
                warn "plasmashell did not come back within 30s; the panel was not rebuilt.
             Everything else above did land. Log out and back in to get the panel."
                SHELL_UP=0
            fi
        else
            SHELL_UP=1   # no systemd user unit; carry on against the live process
        fi

        APPLETS="${HOME}/.config/plasma-org.kde.plasma.desktop-appletsrc"
        BACKUP="${APPLETS}.before-${LOOK}"
        if [ -f "${APPLETS}" ] && [ ! -f "${BACKUP}" ]; then
            cp "${APPLETS}" "${BACKUP}"
            info "panel config backed up to ${BACKUP}"
        fi

        # Every look starts from a clean slate, then builds its own panels.
        JS_HEAD='var ps = panels(); for (var i = 0; i < ps.length; i++) { ps[i].remove(); }
function spacer(p) { var s = p.addWidget("org.kde.plasma.panelspacer");
  s.currentConfigGroup = ["Configuration", "General"]; s.writeConfig("expanding", true); return s; }'

        case "${LOOK}" in
        deepin)
            # One full-width translucent dock: launcher hard left, tasks centred
            # by a spacer either side, tray and clock right.
            JS_BODY='var p = new Panel;
p.location = "bottom"; p.height = 56;
try { p.lengthMode = "fill"; } catch (e) {}
try { p.alignment = "center"; } catch (e) {}
try { p.floating = false; } catch (e) {}
try { p.opacity = "translucent"; } catch (e) {}
p.addWidget("org.kde.plasma.kickerdash");
spacer(p);
p.addWidget("org.kde.plasma.icontasks");
spacer(p);
p.addWidget("org.kde.plasma.systemtray");
p.addWidget("org.kde.plasma.digitalclock");
p.addWidget("org.kde.plasma.showdesktop");'
            ;;
        feren)
            # TWO panels, and the second one is the whole point. Feren puts no
            # clock in its taskbar — it floats a clock chip at top centre, and
            # that is the detail that makes a screenshot read as Feren rather
            # than as any other dark Plasma. lengthMode "fit" is what keeps that
            # panel the width of its contents instead of the width of the screen.
            JS_BODY='var b = new Panel;
b.location = "bottom"; b.height = 34;
try { b.lengthMode = "fill"; } catch (e) {}
try { b.alignment = "center"; } catch (e) {}
try { b.floating = false; } catch (e) {}
try { b.opacity = "opaque"; } catch (e) {}
b.addWidget("org.kde.plasma.kickoff");
b.addWidget("org.kde.plasma.showdesktop");
spacer(b);
b.addWidget("org.kde.plasma.icontasks");
spacer(b);
b.addWidget("org.kde.plasma.systemtray");

var t = new Panel;
t.location = "top"; t.height = 28;
try { t.lengthMode = "fit"; } catch (e) {}
try { t.alignment = "center"; } catch (e) {}
try { t.floating = true; } catch (e) {}
try { t.opacity = "translucent"; } catch (e) {}
t.addWidget("org.kde.plasma.digitalclock");'
            ;;
        osx)
            # The global menu applet is what makes a top bar a MENU bar, and it is
            # the one thing here that may not be installed. A widget id plasmashell
            # cannot resolve does not raise an error — it renders a grey placeholder
            # box and the layout looks broken for a reason nothing reports. So it is
            # only named if it is on disk.
            APPMENU=""
            [ -d /usr/share/plasma/plasmoids/org.kde.plasma.appmenu ] \
                && APPMENU='m.addWidget("org.kde.plasma.appmenu");' \
                || info "no global menu applet installed; the top bar gets tray and clock only"
            JS_BODY='var m = new Panel;
m.location = "top"; m.height = 26;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "translucent"; } catch (e) {}
m.addWidget("org.kde.plasma.kickoff");
'"${APPMENU}"'
spacer(m);
m.addWidget("org.kde.plasma.systemtray");
m.addWidget("org.kde.plasma.digitalclock");

var d = new Panel;
d.location = "bottom"; d.height = 60;
try { d.lengthMode = "fit"; } catch (e) {}
try { d.alignment = "center"; } catch (e) {}
try { d.floating = true; } catch (e) {}
try { d.opacity = "translucent"; } catch (e) {}
d.addWidget("org.kde.plasma.icontasks");
d.addWidget("org.kde.plasma.showdesktop");'
            ;;
        zorin)
            # Same two-panel skeleton as osx, and the differences are the whole
            # reason it is a separate look rather than an alias: no global menu,
            # a shorter dock, and the dock is LED BY THE GRID LAUNCHER rather than
            # by the running apps — which is what you actually notice first in
            # Zorin's own screenshot.
            JS_BODY='var m = new Panel;
m.location = "top"; m.height = 28;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "opaque"; } catch (e) {}
spacer(m);
m.addWidget("org.kde.plasma.systemtray");
m.addWidget("org.kde.plasma.digitalclock");

var d = new Panel;
d.location = "bottom"; d.height = 52;
try { d.lengthMode = "fit"; } catch (e) {}
try { d.alignment = "center"; } catch (e) {}
try { d.floating = true; } catch (e) {}
try { d.opacity = "translucent"; } catch (e) {}
d.addWidget("org.kde.plasma.kickerdash");
d.addWidget("org.kde.plasma.icontasks");'
            ;;
        unity)
            # The only look here with a SIDE panel. For a left or right panel
            # Plasma's scripting API still calls the thickness "height" — it is
            # the distance from the edge, not a vertical measurement — so 56 here
            # is the launcher's WIDTH. Reading it as a height and setting it to
            # 1080 gives you a panel that eats the screen.
            APPMENU=""
            [ -d /usr/share/plasma/plasmoids/org.kde.plasma.appmenu ] \
                && APPMENU='m.addWidget("org.kde.plasma.appmenu");'
            JS_BODY='var l = new Panel;
l.location = "left"; l.height = 56;
try { l.lengthMode = "fill"; } catch (e) {}
try { l.floating = false; } catch (e) {}
try { l.opacity = "translucent"; } catch (e) {}
l.addWidget("org.kde.plasma.kickerdash");
l.addWidget("org.kde.plasma.icontasks");
spacer(l);
l.addWidget("org.kde.plasma.showdesktop");

var m = new Panel;
m.location = "top"; m.height = 24;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "opaque"; } catch (e) {}
'"${APPMENU}"'
spacer(m);
m.addWidget("org.kde.plasma.systemtray");
m.addWidget("org.kde.plasma.digitalclock");'
            ;;
        gnome)
            # ONE panel, and the restraint is the whole look. Do not be tempted to
            # add a dock "for usability" — a dock is what makes this stop being
            # GNOME and start being every other look in this file.
            JS_BODY='var m = new Panel;
m.location = "top"; m.height = 32;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "opaque"; } catch (e) {}
m.addWidget("org.kde.plasma.kickerdash");
spacer(m);
m.addWidget("org.kde.plasma.digitalclock");
spacer(m);
m.addWidget("org.kde.plasma.systemtray");'
            ;;
        win7)
            # The one look that uses org.kde.plasma.taskmanager rather than
            # icontasks. That is the entire difference and it is deliberate:
            # every other look here shows running apps as bare icons, and this
            # one shows them as LABELLED buttons, which is what the era actually
            # looked like. Swapping in icontasks makes it indistinguishable.
            JS_BODY='var b = new Panel;
b.location = "bottom"; b.height = 40;
try { b.lengthMode = "fill"; } catch (e) {}
try { b.floating = false; } catch (e) {}
try { b.opacity = "opaque"; } catch (e) {}
b.addWidget("org.kde.plasma.kickoff");
b.addWidget("org.kde.plasma.taskmanager");
spacer(b);
b.addWidget("org.kde.plasma.systemtray");
b.addWidget("org.kde.plasma.digitalclock");
b.addWidget("org.kde.plasma.showdesktop");'
            ;;
        deepin-exact)
            # Built widget-for-widget off the reference screenshot rather than off
            # the idea of it: launcher hard left, two pinned tiles, then the running
            # apps CENTRED, then the tray, a two-line clock, and a notifications
            # button at the far right. 48px is measured from the image against its
            # 800px width, scaled to this screen.
            #
            # What is NOT reproducible: Deepin's dock draws a vertical hairline
            # after the pinned tiles, and Plasma ships no separator widget — a
            # spacer is empty space, not a rule. That line is the one element of
            # the reference this cannot put on screen.
            JS_BODY='var p = new Panel;
p.location = "bottom"; p.height = 48;
try { p.lengthMode = "fill"; } catch (e) {}
try { p.alignment = "center"; } catch (e) {}
try { p.floating = false; } catch (e) {}
try { p.opacity = "translucent"; } catch (e) {}
p.addWidget("org.kde.plasma.kickerdash");
p.addWidget("org.kde.plasma.showdesktop");
spacer(p);
p.addWidget("org.kde.plasma.icontasks");
spacer(p);
p.addWidget("org.kde.plasma.systemtray");
p.addWidget("org.kde.plasma.digitalclock");
p.addWidget("org.kde.plasma.notifications");'
            ;;
        elementary|popos|nitrux|xerolinux|archcraft)
            # One family, five members: a thin bar along the top and a floating
            # dock centred at the bottom. What separates them is what the TOP bar
            # carries and how big the dock is — which is exactly what separates
            # them in their own screenshots, so the differences are kept as data
            # rather than as five near-identical copies of the same JS.
            case "${LOOK}" in
                elementary) TOP_H=26; DOCK_H=64; TOP_CLOCK=centre; TOP_LAUNCH=1; DOCK_LAUNCH=0 ;;
                popos)      TOP_H=28; DOCK_H=56; TOP_CLOCK=centre; TOP_LAUNCH=1; DOCK_LAUNCH=0 ;;
                nitrux)     TOP_H=26; DOCK_H=60; TOP_CLOCK=right;  TOP_LAUNCH=0; DOCK_LAUNCH=1 ;;
                xerolinux)  TOP_H=26; DOCK_H=56; TOP_CLOCK=right;  TOP_LAUNCH=0; DOCK_LAUNCH=0 ;;
                archcraft)  TOP_H=24; DOCK_H=44; TOP_CLOCK=right;  TOP_LAUNCH=1; DOCK_LAUNCH=0 ;;
            esac

            # The global menu is only named when it is on disk — an unresolvable
            # widget id renders as a grey placeholder rather than raising.
            APPMENU=""
            if [ "${LOOK}" = "xerolinux" ] && [ -d /usr/share/plasma/plasmoids/org.kde.plasma.appmenu ]; then
                APPMENU='m.addWidget("org.kde.plasma.appmenu");'
            fi

            JS_TOP='var m = new Panel;
m.location = "top"; m.height = '"${TOP_H}"';
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "translucent"; } catch (e) {}
'
            [ "${TOP_LAUNCH}" -eq 1 ] && JS_TOP="${JS_TOP}"'m.addWidget("org.kde.plasma.kickoff");
'
            JS_TOP="${JS_TOP}${APPMENU}"
            if [ "${TOP_CLOCK}" = "centre" ]; then
                JS_TOP="${JS_TOP}"'spacer(m);
m.addWidget("org.kde.plasma.digitalclock");
spacer(m);
m.addWidget("org.kde.plasma.systemtray");
'
            else
                JS_TOP="${JS_TOP}"'spacer(m);
m.addWidget("org.kde.plasma.systemtray");
m.addWidget("org.kde.plasma.digitalclock");
'
            fi

            JS_DOCK='var d = new Panel;
d.location = "bottom"; d.height = '"${DOCK_H}"';
try { d.lengthMode = "fit"; } catch (e) {}
try { d.alignment = "center"; } catch (e) {}
try { d.floating = true; } catch (e) {}
try { d.opacity = "translucent"; } catch (e) {}
'
            [ "${DOCK_LAUNCH}" -eq 1 ] && JS_DOCK="${JS_DOCK}"'d.addWidget("org.kde.plasma.kickerdash");
'
            JS_DOCK="${JS_DOCK}"'d.addWidget("org.kde.plasma.icontasks");'
            JS_BODY="${JS_TOP}
${JS_DOCK}"
            ;;
        endeavour|kdeneon)
            # A single full-width taskbar, which is what stock Plasma looks like —
            # and both of these ARE stock Plasma in their own screenshots. kdeneon
            # is the light one (see the SCHEME table above); endeavour is the same
            # shape in the dark, with the purple accent.
            JS_BODY='var b = new Panel;
b.location = "bottom"; b.height = 44;
try { b.lengthMode = "fill"; } catch (e) {}
try { b.floating = false; } catch (e) {}
try { b.opacity = "opaque"; } catch (e) {}
b.addWidget("org.kde.plasma.kickoff");
b.addWidget("org.kde.plasma.icontasks");
spacer(b);
b.addWidget("org.kde.plasma.systemtray");
b.addWidget("org.kde.plasma.digitalclock");
b.addWidget("org.kde.plasma.showdesktop");'
            ;;
        manjaro)
            # Two bars, and unusually the TOP one is the menu bar while the bottom
            # one is a full-width taskbar rather than a floating dock. That pairing
            # is what makes Manjaro's desktop read as neither GNOME nor stock KDE.
            APPMENU=""
            [ -d /usr/share/plasma/plasmoids/org.kde.plasma.appmenu ] \
                && APPMENU='m.addWidget("org.kde.plasma.appmenu");'
            JS_BODY='var m = new Panel;
m.location = "top"; m.height = 24;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "opaque"; } catch (e) {}
'"${APPMENU}"'
spacer(m);
m.addWidget("org.kde.plasma.digitalclock");
spacer(m);

var b = new Panel;
b.location = "bottom"; b.height = 44;
try { b.lengthMode = "fill"; } catch (e) {}
try { b.floating = false; } catch (e) {}
try { b.opacity = "opaque"; } catch (e) {}
b.addWidget("org.kde.plasma.kickoff");
b.addWidget("org.kde.plasma.icontasks");
spacer(b);
b.addWidget("org.kde.plasma.systemtray");'
            ;;
        exodia)
            # AN APPROXIMATION, AND IT MUST BE CALLED ONE. Exodia runs bspwm or
            # dwm: windows are tiled by the window manager, there is no dock, and
            # the bar is a status line showing workspaces and system counters.
            # Plasma can reproduce the BAR and nothing else — KWin does not tile,
            # and no theme makes it. The pager stands in for the workspace
            # indicator, which is the one honest part of the imitation.
            JS_BODY='var m = new Panel;
m.location = "top"; m.height = 26;
try { m.lengthMode = "fill"; } catch (e) {}
try { m.floating = false; } catch (e) {}
try { m.opacity = "opaque"; } catch (e) {}
m.addWidget("org.kde.plasma.pager");
spacer(m);
m.addWidget("org.kde.plasma.systemtray");
m.addWidget("org.kde.plasma.digitalclock");'
            ;;
        esac

        JS_TAIL="$(cat <<JSEOF
var wall = "${WALL}";
if (wall.length > 0) {
  var ds = desktops();
  for (var j = 0; j < ds.length; j++) {
    ds[j].wallpaperPlugin = "org.kde.image";
    ds[j].currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    ds[j].writeConfig("Image", "file://" + wall);
    ds[j].writeConfig("FillMode", 2);
  }
}
JSEOF
)"

        if [ "${SHELL_UP}" -eq 1 ] \
           && "${QD}" org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript \
             "${JS_HEAD}
${JS_BODY}
${JS_TAIL}" >/dev/null 2>&1; then
            info "panel rebuilt for the ${LOOK} look"
            # The blur keys above are in the file but KWin has not re-read them.
            # Without this the look only arrives at the next login, which reads
            # as "the script did nothing".
            "${QD}" org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 \
                && info "kwin reloaded (blur is live)" \
                || info "kwin did not reload; blur lands at the next login"
        elif [ "${SHELL_UP}" -eq 1 ]; then
            warn "plasmashell refused the layout script. The panel may be half-built —
             restore it with:  cp ${BACKUP} ${APPLETS} && systemctl --user restart plasma-plasmashell"
        fi
    fi
fi

# ----------------------------------------------------------------------------
# 6. What the kiosk needs to know.
# ----------------------------------------------------------------------------
if systemctl --user list-unit-files 'vessel-kiosk.service' >/dev/null 2>&1 \
   && systemctl --user cat vessel-kiosk.service >/dev/null 2>&1; then
    log "The kiosk service"
    info "vessel-kiosk.service is installed on this account. It starts Chromium at login and"
    info "keeps the machine online for file sharing — that browser tab IS the sharing agent, so"
    info "closing it takes the machine offline. Put it on another virtual desktop rather than"
    info "closing it: Ctrl+F2 (or Ctrl+Alt+Right) gives you an empty workspace to work on."
fi

cat <<EOF

Done. REBOOT to pick up the display manager and the autologin.

After the reboot:
  - Everything is in System Settings. The parts worth knowing:
      Appearance > Global Theme      the whole look in one click
      Appearance > Colours           accent and scheme (this script set ${ACCENT})
      Appearance > Application Style > Configure GNOME/GTK Application Style
      Workspace > Workspace Behaviour > Desktop Effects
  - Panels are edited by right-clicking one > Enter Edit Mode. For an Ubuntu
    layout, drag the bottom panel to the left edge, set it to Icons-only Task
    Manager, and add a top panel with a Global Menu. Two minutes by hand and
    far more reliable than a script driving plasmashell's scripting API.
    --look deepin is the deliberate exception: that layout is not a two-minute
    drag, so it is scripted. To put your old panel back:
        cp ~/.config/plasma-org.kde.plasma.desktop-appletsrc.before-deepin \
           ~/.config/plasma-org.kde.plasma.desktop-appletsrc
        systemctl --user restart plasma-plasmashell
  - Kvantum (installed) is the theme engine for anything Breeze cannot reach:
    run 'kvantummanager' if you want a look Plasma's own themes do not offer.
  - Remoting in: use krfb, which shares the session already running. An RDP
    server would start a SECOND session and you would never see the kiosk.
        sudo apt install krfb
        sudo ufw allow from 192.168.0.0/16 to any port 5900 proto tcp
    LAN only. Never forward 5900.
  - Seeing the screen WITHOUT a viewer, which is what you want over SSH:
        DISPLAY=:0 import -window root /tmp/shot.png     # imagemagick
    The screen may be DPMS-blanked, in which case that grabs black and says
    nothing. Wake it first:  DISPLAY=:0 xset dpms force on
EOF
