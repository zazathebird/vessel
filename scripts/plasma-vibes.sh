#!/usr/bin/env bash
#
# plasma-vibes.sh — a set of looks for the sharing host's desktop.
#
# Each "vibe" is a colour scheme, a set of KWin effects, a generated wallpaper and a matching
# Konsole profile, applied together and applied LIVE. `--list` shows them, `--apply NAME` sets
# one, `--restore` puts the desktop back to plain Breeze Dark.
#
# THE CONSTRAINT THAT SHAPES ALL OF THIS: this machine is a file-sharing host first and a desktop
# second. The Chromium tab on virtual desktop 2 IS the sharing agent. So every vibe is offered at
# three intensities, and the expensive one is not the default.
#
# WHY THE COST IS LOWER THAN IT LOOKS, and it is worth knowing which half is which:
#   - When the kiosk is in front it is FULLSCREEN, and this KWin has `windowsBlockCompositing`
#     set, so a fullscreen window SUSPENDS THE COMPOSITOR — not "skips blur behind it", suspends
#     it, effects and all. In the state this machine spends its life in these settings cost
#     literally nothing, because the compositor they configure is not running.
#   - The cost lands when YOU are on desktop 1 with translucent windows open, which is exactly
#     when there is a person watching and nothing to serve. That is the right way round, but it
#     is a reason to measure rather than assume: `--measure` does.
#
# NOTHING IS DOWNLOADED. Every colour scheme is generated from the palette in the table below and
# every wallpaper is drawn here with ImageMagick, because this host's whole security posture is a
# browser locked to one origin and a firewall — pulling a theme off the KDE store to make it look
# nice would be a strange place to spend that.
#
set -euo pipefail

SCHEME_DIR="${HOME}/.local/share/color-schemes"
WALL_DIR="${HOME}/.local/share/vessel-vibes/wallpapers"
STATE="${HOME}/.local/share/vessel-vibes/current"
INTENSITY="medium"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
good() { printf '    \033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m    WARNING: %s\033[0m\n' "$*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

KWRITE=""
for c in kwriteconfig6 kwriteconfig5; do have "${c}" && { KWRITE="${c}"; break; }; done
[ -n "${KWRITE}" ] || { printf 'kwriteconfig6 not found — this needs a Plasma desktop.\n' >&2; exit 1; }
KREAD=""
for c in kreadconfig6 kreadconfig5; do have "${c}" && { KREAD="${c}"; break; }; done

# ---------------------------------------------------------------------------------------------
# The vibes.
#
#   id | Display Name | one-line description | konsole profile | wallpaper recipe
#      | bg | bgAlt | view | fg | fgDim | accent | accent2 | danger
#
# `accent` is the one that carries the character — it is the window-manager active colour, the
# selection, the focus ring and the Konsole cursor all at once, so it has to hold up against `bg`
# at text sizes. `accent2` is decoration only and is allowed to be dimmer.
# ---------------------------------------------------------------------------------------------
read -r -d '' VIBES <<'TABLE' || true
halo|Halo|UNSC hard-light HUD: cyan on gunmetal, heavy glass|Halo|hud|#0A0E14|#121822|#0D1219|#D6E4F0|#7A8C9E|#35D7E8|#FFB000|#FF5C5C
tron|Tron|Pure black, electric cyan, thin bright lines|Tron|grid|#000000|#0A0F12|#05080A|#E8FBFF|#6E8A93|#6FE8FF|#00A3C4|#FF4444
apollo|Apollo|Retro-futurist mission control: amber on deep navy|Apollo|stars|#0B1020|#141B33|#090D1A|#F2E8D5|#8A8FA3|#FF9E3D|#4D9DE0|#E5484D
cyberpunk|Cyberpunk|Neon plum, magenta and cyan|Cyberpunk|glow|#120A1A|#1D1029|#0D0714|#F0E6FF|#8A7A9E|#FF2E97|#00F0FF|#FF5555
hacker|Hollywood Hacker|Phosphor green on black, minimal glass|Green on Black|scan|#000000|#0A0F0A|#050805|#33FF66|#1F8C3C|#33FF66|#00B33C|#FF3333
frost|Frost|Clean frosted glass, neutral, the cheap one|Nord|soft|#1B1E24|#252932|#16191E|#DCE1E8|#8B93A1|#7AA2F7|#5A7CA8|#E5484D
TABLE

vibe_ids() { printf '%s\n' "${VIBES}" | cut -d'|' -f1; }
vibe_row() { printf '%s\n' "${VIBES}" | awk -F'|' -v id="$1" '$1 == id {print; exit}'; }

# ---------------------------------------------------------------------------------------------
# Colour scheme generation.
#
# A Plasma .colors file names every role separately, which is why a theme cannot be a two-colour
# idea — but it CAN be derived from a small palette, and deriving it is what keeps a vibe honest:
# there is no place to hide a hand-picked colour that only works on one widget.
# ---------------------------------------------------------------------------------------------
rgb() {
    local hex="${1#\#}"
    printf '%d,%d,%d' "0x${hex:0:2}" "0x${hex:2:2}" "0x${hex:4:2}"
}

write_colorscheme() {
    local name="$1" bg="$2" bgalt="$3" view="$4" fg="$5" fgdim="$6" accent="$7" accent2="$8" danger="$9"
    mkdir -p "${SCHEME_DIR}"
    local f="${SCHEME_DIR}/${name}.colors"
    local BG BGA VIEW FG FGD ACC ACC2 DANG
    BG="$(rgb "${bg}")"; BGA="$(rgb "${bgalt}")"; VIEW="$(rgb "${view}")"
    FG="$(rgb "${fg}")"; FGD="$(rgb "${fgdim}")"; ACC="$(rgb "${accent}")"
    ACC2="$(rgb "${accent2}")"; DANG="$(rgb "${danger}")"
    cat > "${f}" <<EOF
[ColorEffects:Disabled]
Color=${BGA}
ColorAmount=0
ColorEffect=0
ContrastAmount=0.65
ContrastEffect=1
IntensityAmount=0.1
IntensityEffect=2

[ColorEffects:Inactive]
ChangeSelectionColor=true
Color=${BGA}
ColorAmount=0.025
ColorEffect=2
ContrastAmount=0.1
ContrastEffect=2
Enable=false
IntensityAmount=0
IntensityEffect=0

[Colors:Button]
BackgroundAlternate=${BGA}
BackgroundNormal=${BGA}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[Colors:Complementary]
BackgroundAlternate=${BGA}
BackgroundNormal=${BG}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[Colors:Header]
BackgroundAlternate=${BGA}
BackgroundNormal=${BG}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[Colors:Selection]
BackgroundAlternate=${ACC}
BackgroundNormal=${ACC}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${BG}
ForegroundInactive=${BG}
ForegroundLink=${BG}
ForegroundNegative=${DANG}
ForegroundNeutral=${BG}
ForegroundNormal=${BG}
ForegroundPositive=${BG}
ForegroundVisited=${BG}

[Colors:Tooltip]
BackgroundAlternate=${BGA}
BackgroundNormal=${BGA}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[Colors:View]
BackgroundAlternate=${BGA}
BackgroundNormal=${VIEW}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[Colors:Window]
BackgroundAlternate=${BGA}
BackgroundNormal=${BG}
DecorationFocus=${ACC}
DecorationHover=${ACC}
ForegroundActive=${ACC}
ForegroundInactive=${FGD}
ForegroundLink=${ACC}
ForegroundNegative=${DANG}
ForegroundNeutral=${ACC2}
ForegroundNormal=${FG}
ForegroundPositive=${ACC2}
ForegroundVisited=${ACC2}

[General]
ColorScheme=${name}
Name=${name}
shadeSortColumn=true

[KDE]
contrast=4

[WM]
activeBackground=${BGA}
activeBlend=${ACC}
activeForeground=${FG}
inactiveBackground=${BG}
inactiveBlend=${BG}
inactiveForeground=${FGD}
EOF
}

# ---------------------------------------------------------------------------------------------
# Wallpapers, drawn here.
#
# Every one is generated at the screen's own resolution, so nothing is scaled and nothing is
# downloaded. They are deliberately dark and low-contrast: a wallpaper on this box is mostly seen
# THROUGH a translucent terminal, and a busy one makes the text underneath it unreadable — which
# is the failure mode of exactly the look being asked for here.
# ---------------------------------------------------------------------------------------------
draw_wallpaper() {
    local recipe="$1" out="$2" bg="$3" accent="$4" accent2="$5" w="$6" h="$7"
    have magick && M=magick || M=convert
    case "${recipe}" in
        hud)   # concentric arcs and a faint grid — a heads-up display with nothing on it
            "$M" -size "${w}x${h}" "radial-gradient:${bg}-#000000" \
                -fill none -stroke "${accent}" -strokewidth 1 \
                \( -size "${w}x${h}" xc:none \
                   -draw "stroke ${accent} stroke-opacity 0.14 fill none circle $((w/2)),$((h/2)) $((w/2+340)),$((h/2))" \
                   -draw "stroke ${accent} stroke-opacity 0.10 fill none circle $((w/2)),$((h/2)) $((w/2+560)),$((h/2))" \
                   -draw "stroke ${accent2} stroke-opacity 0.08 fill none circle $((w/2)),$((h/2)) $((w/2+760)),$((h/2))" \
                \) -composite "${out}" ;;
        grid)  # a Tron floor: perspective is faked with a plain grid, which reads at a glance
            "$M" -size "${w}x${h}" "gradient:#000000-${bg}" \
                \( -size 64x64 xc:none -fill none -stroke "${accent}" -strokewidth 1 \
                   -draw "stroke-opacity 0.18 line 0,63 63,63" \
                   -draw "stroke-opacity 0.18 line 63,0 63,63" \
                   -write mpr:tile +delete \) \
                \( -size "${w}x${h}" tile:mpr:tile \) -composite "${out}" ;;
        stars) # a starfield, sparse: dense noise reads as television static, not as space
            "$M" -size "${w}x${h}" "radial-gradient:${bg}-#04060D" \
                \( -size "${w}x${h}" xc:black +noise Random -channel R -threshold 99.86% \
                   -separate -evaluate multiply 0.85 \) \
                -compose Screen -composite "${out}" ;;
        glow)  # two coloured pools of light, far apart, very dim
            "$M" -size "${w}x${h}" "xc:${bg}" \
                \( -size "$((w/2))x$((h/2))" "radial-gradient:${accent}-none" -evaluate multiply 0.20 \) \
                   -gravity NorthWest -geometry "+$((w/12))+$((h/10))" -compose Screen -composite \
                \( -size "$((w/2))x$((h/2))" "radial-gradient:${accent2}-none" -evaluate multiply 0.16 \) \
                   -gravity SouthEast -geometry "+$((w/12))+$((h/10))" -compose Screen -composite \
                "${out}" ;;
        scan)  # horizontal scanlines over black
            "$M" -size "${w}x${h}" "xc:${bg}" \
                \( -size 4x4 xc:none -fill "${accent}" \
                   -draw "fill-opacity 0.05 rectangle 0,0 3,0" \
                   -write mpr:sl +delete \) \
                \( -size "${w}x${h}" tile:mpr:sl \) -composite "${out}" ;;
        soft|*) # a plain diagonal wash — the one that never fights the windows on top of it.
            # `-background "${bg}"` BEFORE the rotate is the whole fix, and it is not cosmetic:
            # rotating fills the four corners it opens up with the CURRENT background colour,
            # which defaults to WHITE. On a dark desktop that is the brightest thing on the
            # screen, in the corner, permanently. Cropping an oversized canvas was tried first
            # and does not reliably clear it. Named because it shipped: see the peak-brightness
            # guard below, which exists to catch exactly this.
            "$M" -size "${w}x${h}" "gradient:${bg}-#0E1116" \
                -background "${bg}" -rotate 12 \
                -gravity center -extent "${w}x${h}" +repage "${out}" ;;
    esac
}

screen_size() {
    local geom
    geom="$(xrandr 2>/dev/null | awk '/\*/ {print $1; exit}')"
    [ -n "${geom}" ] || geom="1920x1080"
    printf '%s %s' "${geom%x*}" "${geom#*x}"
}

# ---------------------------------------------------------------------------------------------
# KWin effects, per intensity.
#
# `heavy` is blur 15 + background contrast + wobbly windows. `medium` drops wobbly and halves the
# blur. `light` is translucency only — no blur at all, which is the one that costs nothing on
# integrated graphics and still gives the glass FEEL, because the thing people read as "glass" is
# mostly the translucency, not the blur radius.
# ---------------------------------------------------------------------------------------------
apply_effects() {
    local level="$1"
    local blur=1 contrast=false wobbly=false transl=true dim=true noise=0
    case "${level}" in
        heavy)  blur=15; contrast=true;  wobbly=true;  noise=4 ;;
        medium) blur=8;  contrast=true;  wobbly=false; noise=2 ;;
        light)  blur=0;  contrast=false; wobbly=false; noise=0 ;;
        off)    blur=0;  contrast=false; wobbly=false; transl=false; dim=false ;;
    esac

    if [ "${blur}" -gt 0 ]; then
        "${KWRITE}" --file kwinrc --group Plugins --key blurEnabled true
        "${KWRITE}" --file kwinrc --group "Effect-blur" --key BlurStrength "${blur}"
        "${KWRITE}" --file kwinrc --group "Effect-blur" --key NoiseStrength "${noise}"
    else
        "${KWRITE}" --file kwinrc --group Plugins --key blurEnabled false
    fi
    # Background Contrast has NO config keys — no strength, no saturation. It declares no config
    # module and KWin takes those values per-window from the Plasma theme. It is on or it is off,
    # so do not add a dial for it later expecting one to exist.
    "${KWRITE}" --file kwinrc --group Plugins --key contrastEnabled "${contrast}"
    "${KWRITE}" --file kwinrc --group Plugins --key wobblywindowsEnabled "${wobbly}"
    "${KWRITE}" --file kwinrc --group Plugins --key translucencyEnabled "${transl}"
    "${KWRITE}" --file kwinrc --group Plugins --key diminactiveEnabled "${dim}"

    if [ "${transl}" = "true" ]; then
        # Menus and dialogs are where translucency reads as intentional; the main window is left
        # alone because a translucent window full of text is a window you cannot read.
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key Dialogs 92
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key MoveResize 72
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key Inactive 100
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key DropdownMenus 88
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key PopupMenus 88
        "${KWRITE}" --file kwinrc --group "Effect-translucency" --key ComboboxPopups 88
    fi
    if [ "${dim}" = "true" ]; then
        "${KWRITE}" --file kwinrc --group "Effect-diminactive" --key Strength 18
        # NEVER dim a fullscreen window. The kiosk is fullscreen, and dimming it would dim the
        # thing this machine exists to show.
        "${KWRITE}" --file kwinrc --group "Effect-diminactive" --key DimFullScreen false
        "${KWRITE}" --file kwinrc --group "Effect-diminactive" --key DimPanels false
    fi
}

reconfigure_kwin() {
    have qdbus6 && qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------------------------

usage() {
    cat <<EOF
usage: plasma-vibes.sh [--list] [--apply ID] [--intensity heavy|medium|light|off]
                       [--measure] [--restore] [--current]

  --list        show the vibes
  --apply ID    apply one (see --list for ids)
  --intensity   how expensive the effects are (default: ${INTENSITY})
  --measure     measure the compositor's cost at the current settings
  --restore     back to Breeze Dark with default effects
  --current     print what is applied now
EOF
}

MODE=""
TARGET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --list) MODE=list ;;
        --apply) MODE=apply; TARGET="${2:?--apply wants a vibe id}"; shift ;;
        --intensity) INTENSITY="${2:?}"; shift ;;
        --measure) MODE=measure ;;
        --restore) MODE=restore ;;
        --current) MODE=current ;;
        -h|--help) usage; exit 0 ;;
        *) printf 'unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done
[ -n "${MODE}" ] || { usage; exit 0; }

case "${MODE}" in
list)
    bold "==> Vibes"
    printf '%s\n' "${VIBES}" | awk -F'|' '$1 {printf "    %-11s %-18s %s\n", $1, $2, $3}'
    printf '\n    intensities: heavy (blur 15 + contrast + wobbly) | medium (blur 8 + contrast)\n'
    printf '                 light (translucency only, no blur)   | off\n'
    ;;

current)
    if [ -f "${STATE}" ]; then cat "${STATE}"; else echo "no vibe applied (or applied before this script existed)"; fi
    ;;

restore)
    log "Restoring Breeze Dark"
    have plasma-apply-colorscheme && plasma-apply-colorscheme BreezeDark >/dev/null 2>&1 || true
    apply_effects medium
    "${KWRITE}" --file kwinrc --group Plugins --key wobblywindowsEnabled false
    reconfigure_kwin
    rm -f "${STATE}"
    good "back to Breeze Dark"
    ;;

measure)
    # The honest measurement is the compositor's own CPU while something is actually being
    # composited — a still desktop costs nothing whatever the settings say, which is why a
    # "measurement" taken at idle is worthless and this one moves a window.
    log "Measuring the compositor"
    KPID="$(pgrep -x kwin_x11 || pgrep -x kwin_wayland || true)"
    [ -n "${KPID}" ] || { warn "kwin is not running"; exit 1; }
    read_cpu() { awk '{print $14+$15}' "/proc/${KPID}/stat"; }
    HZ="$(getconf CLK_TCK)"
    before="$(read_cpu)"
    if have xdotool && [ -n "${DISPLAY:-}" ]; then
        WID="$(xdotool getactivewindow 2>/dev/null || true)"
        if [ -n "${WID}" ]; then
            for i in $(seq 1 40); do
                xdotool windowmove "${WID}" $((100 + (i % 10) * 40)) $((100 + (i % 7) * 30)) 2>/dev/null || true
            done
        fi
    fi
    sleep 4
    after="$(read_cpu)"
    used=$(( after - before ))
    pct=$(awk -v u="${used}" -v hz="${HZ}" 'BEGIN{printf "%.1f", (u/hz)/4*100}')
    info "kwin CPU over a 4s window with windows moving: ${pct}% of one core"
    info "blur enabled: $([ -n "${KREAD}" ] && "${KREAD}" --file kwinrc --group Plugins --key blurEnabled 2>/dev/null || echo '?')"
    info "blur strength: $([ -n "${KREAD}" ] && "${KREAD}" --file kwinrc --group "Effect-blur" --key BlurStrength 2>/dev/null || echo '?')"
    info "(the kiosk is fullscreen and opaque, so KWin skips this work while it is in front)"
    ;;

apply)
    row="$(vibe_row "${TARGET}")"
    [ -n "${row}" ] || { printf 'no such vibe: %s\n\n' "${TARGET}" >&2; bold "known:" >&2; vibe_ids >&2; exit 2; }
    IFS='|' read -r id name desc kprofile recipe bg bgalt view fg fgdim accent accent2 danger <<< "${row}"

    log "Applying ${name} at intensity ${INTENSITY}"
    info "${desc}"

    write_colorscheme "${name}" "${bg}" "${bgalt}" "${view}" "${fg}" "${fgdim}" "${accent}" "${accent2}" "${danger}"
    if have plasma-apply-colorscheme; then
        plasma-apply-colorscheme "${name}" >/dev/null 2>&1 && good "colour scheme applied" \
            || warn "colour scheme written but not applied live"
    else
        "${KWRITE}" --file kdeglobals --group General --key ColorScheme "${name}"
        info "colour scheme written; it lands at the next login"
    fi

    mkdir -p "${WALL_DIR}"
    if have magick || have convert; then
        read -r SW SH <<< "$(screen_size)"
        wall="${WALL_DIR}/${id}.png"
        draw_wallpaper "${recipe}" "${wall}" "${bg}" "${accent}" "${accent2}" "${SW}" "${SH}" 2>/dev/null \
            && good "wallpaper drawn (${SW}x${SH})" || warn "wallpaper could not be drawn"

        # Look at what was actually drawn. Every one of these wallpapers is deliberately dark —
        # they are seen THROUGH translucent terminals — so a near-white pixel anywhere means a
        # drawing operation opened up canvas and filled it with the default background. That is
        # invisible in the recipe and obvious on the screen, which is the wrong way round.
        if [ -f "${wall}" ]; then
            peak="$("$M" "${wall}" -format "%[fx:maxima]" info: 2>/dev/null || echo 0)"
            if awk -v p="${peak:-0}" 'BEGIN{exit !(p > 0.97)}' 2>/dev/null; then
                warn "the ${recipe} wallpaper has a near-white area in it (peak ${peak}).
     That is almost always a rotate or extent filling empty canvas with the default
     background. The vibe is applied; the wallpaper wants fixing in draw_wallpaper()."
            fi
        fi
        if [ -f "${wall}" ] && have plasma-apply-wallpaperimage; then
            plasma-apply-wallpaperimage "${wall}" >/dev/null 2>&1 && good "wallpaper applied" \
                || info "wallpaper is at ${wall} — set it by hand if it did not apply"
        fi
    else
        warn "ImageMagick absent, so no wallpaper was drawn"
    fi

    apply_effects "${INTENSITY}"
    reconfigure_kwin
    good "kwin effects: ${INTENSITY}"

    if [ -f "${HOME}/.local/share/konsole/${kprofile}.profile" ]; then
        "${KWRITE}" --file konsolerc --group "Desktop Entry" --key DefaultProfile "${kprofile}.profile"
        good "konsole default profile: ${kprofile}"
    else
        info "konsole profile '${kprofile}' not found — run scripts/konsole-profiles.sh first"
    fi

    mkdir -p "$(dirname "${STATE}")"
    printf '%s at %s (applied %s)\n' "${name}" "${INTENSITY}" "$(date -Is)" > "${STATE}"

    printf '\n'
    info "Open a NEW terminal window to see the Konsole profile."
    info "Windows already open keep their old colours until they are reopened."
    ;;
esac
