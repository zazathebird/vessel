#!/usr/bin/env bash
#
# desktop-glass.sh — save and restore the sharing host's "glass" desktop.
#
# The look: Kvantum KvDebianGlass, Breeze Dark with a translucent local override, the Halo
# Konsole profile, KWin blur at 6, and the debian-blue wallpaper. It was tuned by hand on
# 2026-09-24 until a folder sitting under a Dolphin window could just be made out — that is the
# target, and every number below is the one that got there.
#
#   ./desktop-glass.sh --apply     copy desktop/glass/ onto this user's config, restart the shell
#   ./desktop-glass.sh --capture   refresh desktop/glass/ from the live config (then commit it)
#   ./desktop-glass.sh --check     print the live values that make or break the translucency
#
# No sudo; it touches only ~/.config and ~/.local/share. --apply backs every file it replaces up
# to ~/.config/desktop-glass-backup-<timestamp>/ first.
#
# THE NUMBERS, AND WHY EACH ONE
#   Kvantum reduce_window_opacity=45   Dolphin & every Qt app ~55% solid. 18 (the theme's own
#                                      default) measured 82% solid and looked opaque.
#   Konsole Halo Opacity=0.70          Lives in the .colorscheme, not the .profile (see
#                                      konsole-profiles.sh for why).
#   Plasma panel 0.85 -> 0.6,          Panel; start menu and tray popups.
#   dialogs 0.85 -> 0.45               A LOCAL copy of breeze-dark
#                                      in ~/.local/share/plasma/desktoptheme/ shadows the system
#                                      one; /usr/share is never touched.
#   KWin BlurStrength=6                At 15 (the max) blur smeared anything under a window into
#                                      one flat colour, so no amount of transparency showed it.
#   KWin rule "glass-everywhere"       Kvantum only reaches QWidget apps. QML/Kirigami (System
#                                      Settings, Discover, Info Center) paint an opaque page over
#                                      their blur region, and GTK apps (GNOME/XFCE utilities,
#                                      Nemo, Thunar) never load Kvantum at all. A forced window
#                                      opacity of 85% active / 78% inactive covers all of them.
#                                      Excluded by class regex: browsers and the kiosk (the
#                                      sharing agent), media and remote-desktop viewers, and the
#                                      Qt apps Kvantum already glasses (which would go double).
#   Kvantum reduce_menu_opacity=40     Qt menus.
#   Menus/dialogs (translucency effect) 72 / 85 — every app's menus, GTK included. Kept above
#                                      ~70 because this one fades the menu text too.
#
# WHAT WILL SILENTLY UNDO IT
#   plasma-vibes.sh (--apply or --restore) and plasma-dark-setup.sh both rewrite kwinrc's blur
#   and translucency keys and the colour scheme. Re-run --apply here after either.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP="${REPO}/desktop/glass"

# snapshot path | live path. Directories are copied whole.
FILES=(
    "kvantum/kvantum.kvconfig|${HOME}/.config/Kvantum/kvantum.kvconfig"
    "kvantum/KvDebianGlass|${HOME}/.config/Kvantum/KvDebianGlass"
    "plasma-theme/breeze-dark|${HOME}/.local/share/plasma/desktoptheme/breeze-dark"
    "konsole/Halo.colorscheme|${HOME}/.local/share/konsole/Halo.colorscheme"
    "konsole/Halo.profile|${HOME}/.local/share/konsole/Halo.profile"
    "konsole/konsolerc|${HOME}/.config/konsolerc"
    "wallpaper/debian-blue.jpg|${HOME}/.local/share/wallpapers/debian-blue.jpg"
    "config/kwinrc|${HOME}/.config/kwinrc"
    "config/kwinrulesrc|${HOME}/.config/kwinrulesrc"
    "config/kdeglobals|${HOME}/.config/kdeglobals"
    "config/plasmarc|${HOME}/.config/plasmarc"
    "config/plasmashellrc|${HOME}/.config/plasmashellrc"
    "config/plasma-org.kde.plasma.desktop-appletsrc|${HOME}/.config/plasma-org.kde.plasma.desktop-appletsrc"
    # Behaviour, not looks: never dim, blank, lock or suspend, and no KWallet (autologin can
    # never unlock it, so it only prompts). The system half — logind, the masked sleep targets,
    # dconf — belongs to thinkcentre-setup.sh and needs sudo; this is only the user half.
    "config/powerdevilrc|${HOME}/.config/powerdevilrc"
    "config/kscreenlockerrc|${HOME}/.config/kscreenlockerrc"
    "config/kwalletrc|${HOME}/.config/kwalletrc"
)

have() { command -v "$1" >/dev/null 2>&1; }
KREAD="$(command -v kreadconfig6 || command -v kreadconfig5 || true)"

copy() {  # copy SRC DST — file or directory, replacing DST
    mkdir -p "$(dirname "$2")"
    if [ -d "$1" ]; then rm -rf "$2"; cp -a "$1" "$2"; else cp -p "$1" "$2"; fi
}

capture() {
    for pair in "${FILES[@]}"; do
        local rel="${pair%%|*}" live="${pair#*|}"
        [ -e "${live}" ] || { echo "    missing, skipped: ${live}"; continue; }
        copy "${live}" "${SNAP}/${rel}"
        echo "    ${live} -> desktop/glass/${rel}"
    done
}

apply() {
    local bak="${HOME}/.config/desktop-glass-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "${bak}"
    for pair in "${FILES[@]}"; do
        local rel="${pair%%|*}" live="${pair#*|}"
        [ -e "${SNAP}/${rel}" ] || continue
        [ -e "${live}" ] && copy "${live}" "${bak}/${rel}"
        copy "${SNAP}/${rel}" "${live}"
        echo "    desktop/glass/${rel} -> ${live}"
    done
    echo "    previous files backed up to ${bak}"
    rm -rf "${HOME}"/.cache/plasma_theme_* "${HOME}"/.cache/plasma-svgelements* 2>/dev/null || true
    if [ -n "${DISPLAY:-}" ] && have qdbus6; then
        qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1 || true
        systemctl --user restart plasma-plasmashell.service 2>/dev/null || true
        echo "    KWin reconfigured, plasmashell restarted. Reopen open apps to pick up Kvantum/Konsole."
    else
        echo "    No display session here: log out and back in to see it."
    fi
}

check() {
    local kv="${HOME}/.config/Kvantum/KvDebianGlass/KvDebianGlass.kvconfig"
    echo "    widgetStyle:             $([ -n "${KREAD}" ] && "${KREAD}" --file kdeglobals --group KDE --key widgetStyle)"
    echo "    kvantum theme:           $(sed -n 's/^theme=//p' "${HOME}/.config/Kvantum/kvantum.kvconfig" 2>/dev/null)"
    echo "    reduce_window_opacity:   $(sed -n 's/^reduce_window_opacity=//p' "${kv}" 2>/dev/null)   (want 45)"
    echo "    Konsole Halo Opacity:    $(sed -n 's/^Opacity=//p' "${HOME}/.local/share/konsole/Halo.colorscheme" 2>/dev/null)   (want 0.70)"
    echo "    KWin BlurStrength:       $([ -n "${KREAD}" ] && "${KREAD}" --file kwinrc --group Effect-blur --key BlurStrength)   (want 6)"
    echo "    glass-everywhere rule:   $(grep -q '^\[glass-everywhere\]' "${HOME}/.config/kwinrulesrc" 2>/dev/null && echo present || echo MISSING)"
    echo "    plasma theme override:   $([ -d "${HOME}/.local/share/plasma/desktoptheme/breeze-dark/translucent" ] && echo present || echo MISSING)"
    if [ -n "${DISPLAY:-}" ] && have qdbus6; then
        echo "    auto-suspend:            $([ -n "${KREAD}" ] && "${KREAD}" --file powerdevilrc --group AC --group SuspendAndShutdown --key AutoSuspendAction)   (want 0 = never)"
    echo "    KWallet enabled:         $([ -n "${KREAD}" ] && "${KREAD}" --file kwalletrc --group Wallet --key Enabled)   (want false)"
    echo "    compositing active:      $(qdbus6 org.kde.KWin /Compositor org.kde.kwin.Compositing.active 2>/dev/null || echo '?')"
    fi
}

case "${1:-}" in
    --apply)   apply ;;
    --capture) capture ;;
    --check)   check ;;
    *) sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
