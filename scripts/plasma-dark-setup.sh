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
set -euo pipefail

ACCENT="233,84,32"          # Ubuntu orange (#E95420)
DO_INSTALL=1
DO_AUTOLOGIN=1

while [ "$#" -gt 0 ]; do
    case "$1" in
        --no-install)   DO_INSTALL=0 ;;
        --no-autologin) DO_AUTOLOGIN=0 ;;
        --accent)       [ "$#" -ge 2 ] || { echo "--accent needs R,G,B" >&2; exit 1; }; ACCENT="$2"; shift ;;
        --accent=*)     ACCENT="${1#--accent=}" ;;
        -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)              echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done
printf '%s' "${ACCENT}" | grep -Eq '^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$' || { echo "--accent must be R,G,B (0-255 each)" >&2; exit 1; }

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    WARNING: %s\033[0m\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

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

    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${CORE[@]}" || die "The core desktop install failed. Fix the apt error above and re-run."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${THEME[@]}" || info "some theming packages failed; continuing"
    missing=()
    for p in "${UBUNTUISH[@]}"; do
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$p" >/dev/null 2>&1 || missing+=("$p")
    done
    [ "${#missing[@]}" -eq 0 ] || info "not in this release's archive, skipped: ${missing[*]}"
else
    info "skipping package installation (--no-install)"
fi

# Which icon theme actually exists, best first. Never name a theme that is not on
# disk: Plasma falls back silently and you get a half-themed desktop with no error.
ICONS="breeze-dark"
for candidate in Yaru-dark Yaru Papirus-Dark breeze-dark; do
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
        sudo systemctl enable sddm >/dev/null 2>&1 || true
        info "display manager switched from ${current:-none} to sddm (takes effect at reboot)"
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
set_key kdeglobals General ColorScheme "BreezeDark"
set_key kdeglobals General AccentColor "${ACCENT}"
set_key kdeglobals General LastUsedCustomAccentColor "${ACCENT}"
set_key kdeglobals Icons Theme "${ICONS}"
set_key kdeglobals KDE LookAndFeelPackage "org.kde.breezedark.desktop"
set_key kdeglobals KDE SingleClick "false"      # Ubuntu opens on double-click
set_key kdeglobals KDE widgetStyle "Breeze"
set_key plasmarc Theme name "breeze-dark"
set_key kwinrc org.kde.kdecoration2 theme "Breeze"
set_key kdeglobals General fixed "JetBrains Mono,10,-1,5,50,0,0,0,0,0"

# The font, only if it is actually installed — a named-but-absent font is how a
# desktop ends up rendering in the toolkit's last-resort fallback.
if fc-list 2>/dev/null | grep -qi 'Ubuntu-R\|Ubuntu Regular'; then
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

info "colour scheme: Breeze Dark, accent ${ACCENT}"

# ----------------------------------------------------------------------------
# 4. GTK apps, so the other half of the desktop is dark too.
# ----------------------------------------------------------------------------
log "Matching GTK applications"
GTK_THEME="Breeze-Dark"
[ -d /usr/share/themes/Yaru-dark ] && GTK_THEME="Yaru-dark"

for v in 3.0 4.0; do
    mkdir -p "${HOME}/.config/gtk-${v}"
    cat > "${HOME}/.config/gtk-${v}/settings.ini" <<EOF
[Settings]
gtk-theme-name=${GTK_THEME}
gtk-icon-theme-name=${ICONS}
gtk-application-prefer-dark-theme=1
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
if ! grep -qs 'GTK_THEME' "${HOME}/.profile" 2>/dev/null; then
    printf '\n# dark GTK apps (plasma-dark-setup.sh)\nexport GTK_THEME=%s\n' "${GTK_THEME}" >> "${HOME}/.profile"
fi
info "GTK theme: ${GTK_THEME} (gtk2, gtk3, gtk4 and \$GTK_THEME)"

# ----------------------------------------------------------------------------
# 5. Apply live, if a session is running.
# ----------------------------------------------------------------------------
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v lookandfeeltool >/dev/null 2>&1; then
    log "Applying to the running session"
    lookandfeeltool -a org.kde.breezedark.desktop >/dev/null 2>&1 && info "applied live" \
        || info "could not apply live; it lands at the next login"
fi

# ----------------------------------------------------------------------------
# 6. The kiosk gets a workspace of its own.
# ----------------------------------------------------------------------------
# The Chromium tab IS the sharing agent, so the way to get it out of your way can
# never be to close it. A fullscreen kiosk on the only workspace makes closing it
# the obvious move, which is why there are two workspaces and a rule that forces
# the kiosk onto the second one. You land on an empty desktop; it keeps sharing.
#
# The rule matches WM_CLASS "vessel-kiosk", which the launcher written by
# thinkcentre-setup.sh sets with --class. That name is a CONTRACT between the two
# scripts: change it there and this rule silently stops matching. Matching a bare
# "chromium" was the alternative and is worse — it would drag every Chromium window
# you open by hand onto the second desktop as well.
#
# X11 only, and that is the same decision as everything else in this file: --class
# sets an X11 property. Under Wayland Chromium reports its app_id from the .desktop
# file, the rule does not match, and the kiosk is back on top of you.
log "Giving the kiosk its own workspace"

KWRITE=""
for c in kwriteconfig6 kwriteconfig5; do
    command -v "${c}" >/dev/null 2>&1 && { KWRITE="${c}"; break; }
done
KREAD=""
for c in kreadconfig6 kreadconfig5; do
    command -v "${c}" >/dev/null 2>&1 && { KREAD="${c}"; break; }
done

if [ -z "${KWRITE}" ] || [ -z "${KREAD}" ]; then
    warn "kwriteconfig/kreadconfig not found, so the kiosk was left on the first workspace.
             Put it on another one by hand with Ctrl+F2 rather than closing it."
else
    # A second virtual desktop, if there is only one. There are two ways to get one and
    # using the wrong one is a silent no-op, which is how this was got wrong first time
    # (measured on the real host, 2026-09-08).
    #
    # With no session running, kwinrc IS the state, and writing Id_2/Number is right.
    # With KWin RUNNING, KWin owns that state: writing the file changed nothing a person
    # could see, `reconfigure` does not re-read the desktop count, and the moment KWin
    # next saved it wrote its own UUID over the one just written — so the rule below
    # pointed at a desktop that did not exist and the kiosk stayed where it was. The
    # window rule looked wrong. It was not; there was nowhere for it to send anything.
    #
    # So: ask KWin when KWin is there, and write the file when it is not. Either way the
    # UUID the rule uses is READ BACK afterwards rather than assumed, because in the live
    # case it is KWin that chooses it.
    QDBUS=""
    for q in qdbus6 qdbus qdbus-qt6; do
        command -v "${q}" >/dev/null 2>&1 && { QDBUS="${q}"; break; }
    done
    VDM="org.kde.KWin.VirtualDesktopManager"

    if [ -n "${QDBUS}" ] && ${QDBUS} org.kde.KWin /VirtualDesktopManager "${VDM}.count" >/dev/null 2>&1; then
        live="$(${QDBUS} org.kde.KWin /VirtualDesktopManager "${VDM}.count" 2>/dev/null || echo 1)"
        case "${live}" in ''|*[!0-9]*) live=1 ;; esac
        if [ "${live}" -lt 2 ]; then
            ${QDBUS} org.kde.KWin /VirtualDesktopManager "${VDM}.createDesktop" 1 "Sharing" >/dev/null 2>&1 || true
            sleep 1
            info "created a second virtual desktop in the running session"
        else
            info "${live} virtual desktops already"
        fi
    else
        desktops="$(${KREAD} --file kwinrc --group Desktops --key Number 2>/dev/null || true)"
        case "${desktops}" in ''|*[!0-9]*) desktops=1 ;; esac
        if [ "${desktops}" -lt 2 ]; then
            # /proc is the UUID source rather than uuidgen, which lives in uuid-runtime and
            # is not installed by default on a netinst.
            newid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || true)"
            if [ -z "${newid}" ]; then
                warn "could not generate a UUID for a second desktop; leaving the desktops alone."
            else
                ${KWRITE} --file kwinrc --group Desktops --key Id_2 "${newid}"
                ${KWRITE} --file kwinrc --group Desktops --key Name_2 "Sharing"
                ${KWRITE} --file kwinrc --group Desktops --key Number 2
                ${KWRITE} --file kwinrc --group Desktops --key Rows 1
                info "added a second virtual desktop (it appears at the next login)"
            fi
        else
            info "${desktops} virtual desktops already"
        fi
    fi

    KIOSK_DESKTOP="$(${KREAD} --file kwinrc --group Desktops --key Id_2 2>/dev/null || true)"

    if [ -z "${KIOSK_DESKTOP}" ]; then
        warn "no second virtual desktop, so no kiosk rule was written."
    else
        # Appended to whatever rules already exist, never written over them: kwinrulesrc
        # is a file the operator edits from System Settings, and clobbering it would throw
        # away work that this script has no way to know about.
        existing="$(${KREAD} --file kwinrulesrc --group General --key rules 2>/dev/null || true)"
        case ",${existing}," in
            *,vessel-kiosk,*) info "the kiosk window rule is already in kwinrulesrc" ;;
            *)
                if [ -n "${existing}" ]; then
                    ${KWRITE} --file kwinrulesrc --group General --key rules "${existing},vessel-kiosk"
                else
                    ${KWRITE} --file kwinrulesrc --group General --key rules "vessel-kiosk"
                fi
                # count is what KWin reads to decide how many rules to load; a rule listed
                # but not counted is a rule that does nothing.
                count="$(${KREAD} --file kwinrulesrc --group General --key count 2>/dev/null || true)"
                case "${count}" in ''|*[!0-9]*) count=0 ;; esac
                ${KWRITE} --file kwinrulesrc --group General --key count "$((count + 1))"
                info "added the kiosk window rule"
                ;;
        esac

        # Written every run, whether the rule is new or not, so that re-running this script
        # repairs a rule somebody half-edited in System Settings.
        #   wmclasscomplete=false  match the class alone, not "instance class"
        #   wmclassmatch=1         exact, not substring: nothing else may be caught by this
        #   desktopsrule=2         Force — the window may not be dragged back onto desktop 1
        #   minimize=false + rule 2
        #                          Force — the kiosk cannot be minimised AT ALL. This is the
        #                          half that matters: minimising is what somebody does to get
        #                          a fullscreen window out of the way, and on this machine that
        #                          window is the sharing agent. Taking the option away and
        #                          giving it a workspace of its own is one answer, not two.
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key Description \
            "Vessel sharing kiosk — keep it on the second workspace"
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key wmclass "vessel-kiosk"
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key wmclasscomplete --type bool false
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key wmclassmatch 1
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key desktops "${KIOSK_DESKTOP}"
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key desktopsrule 2
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key minimize --type bool false
        ${KWRITE} --file kwinrulesrc --group vessel-kiosk --key minimizerule 2
        info "the kiosk is forced onto virtual desktop 2 (${KIOSK_DESKTOP}) and cannot be minimised"

        # Live, if KWin is up. Harmless when it is not — the files above are the mechanism.
        for q in qdbus6 qdbus qdbus-qt6; do
            command -v "${q}" >/dev/null 2>&1 || continue
            "${q}" org.kde.KWin /KWin reconfigure >/dev/null 2>&1 && info "KWin reloaded"
            break
        done
    fi
fi

# ----------------------------------------------------------------------------
# 7. The screen must never blank, dim or lock.
# ----------------------------------------------------------------------------
# THE KIOSK LAUNCHER'S `xset` CALLS ARE NOT THE MECHANISM THAT MATTERS HERE, and
# believing they were is how this box shipped with the question unanswered.
#
# thinkcentre-setup.sh's launcher runs `xset s off`, `xset s noblank` and
# `xset -dpms` once, at service start. That is the right thing to do on a bare X
# session, which is what the original XFCE design assumed. On a PLASMA desktop it
# is not sufficient and it is not even the last word: PowerDevil starts after the
# kiosk, runs its OWN idle timer, and turns the display off by calling DPMS
# directly rather than by setting the X server's DPMS timeouts. Measured on this
# machine: after the launcher had run, `xset q` reported "DPMS is Enabled" with
# every timeout at 0, and setting `TurnOffDisplayIdleTimeoutSec` to 900, -1 and 0
# in turn moved nothing in `xset q` at all. So `xset q` cannot answer "will this
# screen blank" on a Plasma box, and the launcher cannot prevent it. PowerDevil
# and KScreenLocker have to be told, in their own files.
#
# Left alone, both run on KDE's defaults, which are written for a laptop: dim,
# then turn the display off, then lock. On a host that autologins and is remoted
# into, a LOCK is worse than a blank — krfb shares the running session, so the
# thing you connect to see is a password prompt, on the machine you are not
# standing at. Nothing on this box managed either of these until now.
#
# WHY BOTH SPELLINGS OF EACH KEY. KConfig keys are case-sensitive, and PowerDevil's
# generated accessors are lower-camel (`turnOffDisplayWhenIdle`, confirmed in
# libpowerdevilcore) while KDE's own settings module has historically written the
# upper-camel form into this file. A key in the wrong case is not an error: it is
# silently ignored, and the symptom is a kiosk that blanks itself weeks later. The
# boolean is safe to write twice — either spelling read yields false — which is the
# reason this disables the ACTION with a boolean rather than by putting a sentinel
# in the timeout. A timeout whose "never" value you have guessed wrong is a screen
# that blanks IMMEDIATELY, and that is not a guess worth taking.
log "Stopping the screen blanking, dimming and locking"

# The screen locker. Autolock=false is the one that matters; LockOnResume covers
# the case where something else suspends the box despite the masked sleep targets.
if [ -n "${KWRITE}" ]; then
    "${KWRITE}" --file kscreenlockerrc --group Daemon --key Autolock false
    "${KWRITE}" --file kscreenlockerrc --group Daemon --key LockOnResume false

    # PowerDevil, AC profile. This box has no battery; the AC profile is the only
    # one it ever loads, and writing the others would be pretending otherwise.
    for key in turnOffDisplayWhenIdle TurnOffDisplayWhenIdle \
               dimDisplayWhenIdle DimDisplayWhenIdle; do
        "${KWRITE}" --file powerdevilrc --group AC --key "${key}" false
    done
    # 0 is "do nothing" for an ACTION enum, which is a different kind of value from
    # a timeout and is unambiguous.
    for key in autoSuspendAction AutoSuspendAction; do
        "${KWRITE}" --file powerdevilrc --group AC --key "${key}" 0
    done

    info "screen locker: autolock off"
    info "powerdevil: display never dims, never turns off, never auto-suspends"

    # Apply to the running session. Both daemons re-read on request, so this does
    # not wait for a reboot — which matters, because the window between now and the
    # next reboot is exactly when somebody is watching to see whether it worked.
    if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v qdbus6 >/dev/null 2>&1; then
        qdbus6 org.kde.Solid.PowerManagement /org/kde/Solid/PowerManagement \
            org.kde.Solid.PowerManagement.reparseConfiguration >/dev/null 2>&1 \
            && info "powerdevil reloaded live" \
            || info "powerdevil will pick it up at the next login"
        qdbus6 org.kde.screensaver /ScreenSaver org.kde.screensaver.configure \
            >/dev/null 2>&1 || true
    fi
else
    warn "kwriteconfig not found, so the screen locker and PowerDevil were left on KDE's
     defaults — which dim, blank and then LOCK this machine. Fix that before leaving it."
fi

# ----------------------------------------------------------------------------
# 8. What the kiosk needs to know.
# ----------------------------------------------------------------------------
if systemctl --user list-unit-files 'vessel-kiosk.service' >/dev/null 2>&1 \
   && systemctl --user cat vessel-kiosk.service >/dev/null 2>&1; then
    log "The kiosk service"
    info "vessel-kiosk.service is installed on this account. It starts Chromium at login and"
    info "keeps the machine online for file sharing — that browser tab IS the sharing agent, so"
    info "closing it takes the machine offline. Put it on another virtual desktop rather than"
    info "closing it. Section 6 above forces it onto virtual desktop 2, so desktop 1 is yours;"
    info "Ctrl+F1 and Ctrl+F2 (or Ctrl+Alt+Left/Right) move between them."
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
  - Kvantum (installed) is the theme engine for anything Breeze cannot reach:
    run 'kvantummanager' if you want a look Plasma's own themes do not offer.
  - Remoting in: use krfb, which shares the session already running. An RDP
    server would start a SECOND session and you would never see the kiosk.
        sudo apt install krfb
        sudo ufw allow from 192.168.0.0/16 to any port 5900 proto tcp
    LAN only. Never forward 5900.
EOF
