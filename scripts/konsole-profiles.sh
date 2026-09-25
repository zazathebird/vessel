#!/usr/bin/env bash
#
# konsole-profiles.sh — the terminal look for the sharing host.
#
# Writes a Konsole colour scheme and a matching profile for each entry in the table below,
# sets one of them as the default, and turns on translucency at 70%.
#
# It touches nothing outside ~/.local/share/konsole and ~/.config/konsolerc, needs no sudo,
# and is idempotent: run it as often as you like. `--list` prints what it would write and
# `--default NAME` picks which profile new windows open with.
#
# WHY A SCRIPT AND NOT THE SETTINGS DIALOG
# The box autologins and is remoted into from several machines. A profile clicked in by hand
# exists on one machine and in one person's memory; this file is the same everywhere and can
# be re-run after the profile directory is lost, which is a thing that happens to a host whose
# whole pairing lives in a browser profile nobody may delete.
#
# OPACITY IS NOT A PROFILE SETTING, IT IS A SCHEME SETTING.
# Konsole reads Opacity from the [General] block of the .colorscheme file, not from the
# .profile. Setting it on the profile is a silent no-op — the window is simply opaque and
# nothing anywhere says why. It also needs a running compositor: under X11 with KWin
# compositing off, every scheme here renders solid. `--check` reports that.
#
set -euo pipefail

SCHEME_DIR="${HOME}/.local/share/konsole"
KONSOLERC="${HOME}/.config/konsolerc"
OPACITY="0.70"
FONT_FAMILY="Hack"
FONT_SIZE="11"
DEFAULT_PROFILE="Ubuntu"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
good()  { printf '    \033[32m%s\033[0m\n' "$*"; }
warn()  { printf '    \033[33m%s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------------------------
# The schemes.
#
# One record per line, pipe-separated:
#   name | description | background | foreground | 8 normal colours | 8 intense colours
#
# Every colour is a #RRGGBB hex string; the generator converts to the decimal triples Konsole
# wants, because a hex table is the form these palettes are published in and a transcription
# error in a decimal one is invisible.
#
# The order of the sixteen is the ANSI order and is a wire format of sorts — every program that
# emits colour assumes it:
#   0 black  1 red  2 green  3 yellow  4 blue  5 magenta  6 cyan  7 white
# ---------------------------------------------------------------------------------------------
read -r -d '' SCHEMES <<'TABLE' || true
Ubuntu|Ubuntu's own terminal: aubergine ground, Tango palette|#300A24|#EEEEEC|#2E3436|#CC0000|#4E9A06|#C4A000|#3465A4|#75507B|#06989A|#D3D7CF|#555753|#EF2929|#8AE234|#FCE94F|#729FCF|#AD7FA8|#34E2E2|#EEEEEC
Ubuntu on Black|Ubuntu's palette over a pure black ground|#000000|#EEEEEC|#2E3436|#CC0000|#4E9A06|#C4A000|#3465A4|#75507B|#06989A|#D3D7CF|#555753|#EF2929|#8AE234|#FCE94F|#729FCF|#AD7FA8|#34E2E2|#EEEEEC
Green on Black|Black ground, bright green text, legacy Windows console palette|#000000|#00FF00|#000000|#800000|#008000|#808000|#000080|#800080|#008080|#C0C0C0|#808080|#FF0000|#00FF00|#FFFF00|#0000FF|#FF00FF|#00FFFF|#FFFFFF
Campbell|Windows Terminal's default scheme|#0C0C0C|#CCCCCC|#0C0C0C|#C50F1F|#13A10E|#C19C00|#0037DA|#881798|#3A96DD|#CCCCCC|#767676|#E74856|#16C60C|#F9F1A5|#3B78FF|#B4009E|#61D6D6|#F2F2F2
Halo|UNSC hard-light HUD: cyan on gunmetal|#0A0E14|#D6E4F0|#121822|#FF5C5C|#5CE8A8|#FFB000|#35D7E8|#8AB4F8|#7FE9F5|#D6E4F0|#2A3644|#FF8A8A|#8AFFCB|#FFD166|#6FE8FF|#B4CDFA|#A8F2FA|#FFFFFF
Tron|Pure black, electric cyan|#000000|#E8FBFF|#0A0F12|#FF4444|#00E5A0|#7FD8FF|#6FE8FF|#00A3C4|#9FF0FF|#C9E9F2|#2A3A40|#FF7A7A|#4DFFC4|#B3E9FF|#A8F2FF|#35D7E8|#D4F7FF|#FFFFFF
Apollo|Mission control: amber on deep navy|#0B1020|#F2E8D5|#141B33|#E5484D|#6FCF97|#FF9E3D|#4D9DE0|#C08BE8|#56C3C0|#D9CFBB|#2A3350|#FF7A7E|#92E0B0|#FFC078|#7FBEEA|#D6AEF5|#7FDBD8|#FFF6E6
Cyberpunk|Neon plum, magenta and cyan|#120A1A|#F0E6FF|#1D1029|#FF2E97|#4DFFB8|#FFD166|#00F0FF|#C77DFF|#66E8F5|#C9BADC|#3A2450|#FF6BB8|#85FFD1|#FFE29A|#66F6FF|#DDA8FF|#99F2FA|#FFFFFF
Dracula|The purple one|#282A36|#F8F8F2|#21222C|#FF5555|#50FA7B|#F1FA8C|#BD93F9|#FF79C6|#8BE9FD|#F8F8F2|#6272A4|#FF6E6E|#69FF94|#FFFFA5|#D6ACFF|#FF92DF|#A4FFFF|#FFFFFF
Solarized Dark|Ethan Schoonover's dark, low-contrast by design|#002B36|#839496|#073642|#DC322F|#859900|#B58900|#268BD2|#D33682|#2AA198|#EEE8D5|#002B36|#CB4B16|#586E75|#657B83|#839496|#6C71C4|#93A1A1|#FDF6E3
Solarized Light|The same palette, light ground|#FDF6E3|#657B83|#073642|#DC322F|#859900|#B58900|#268BD2|#D33682|#2AA198|#EEE8D5|#002B36|#CB4B16|#586E75|#657B83|#839496|#6C71C4|#93A1A1|#FDF6E3
Nord|Arctic, blue-grey, even|#2E3440|#D8DEE9|#3B4252|#BF616A|#A3BE8C|#EBCB8B|#81A1C1|#B48EAD|#88C0D0|#E5E9F0|#4C566A|#BF616A|#A3BE8C|#EBCB8B|#81A1C1|#B48EAD|#8FBCBB|#ECEFF4
Gruvbox Dark|Warm, retro, high contrast|#282828|#EBDBB2|#282828|#CC241D|#98971A|#D79921|#458588|#B16286|#689D6A|#A89984|#928374|#FB4934|#B8BB26|#FABD2F|#83A598|#D3869B|#8EC07C|#EBDBB2
Tokyo Night|Dark blue, modern|#1A1B26|#C0CAF5|#15161E|#F7768E|#9ECE6A|#E0AF68|#7AA2F7|#BB9AF7|#7DCFFF|#A9B1D6|#414868|#F7768E|#9ECE6A|#E0AF68|#7AA2F7|#BB9AF7|#7DCFFF|#C0CAF5
Catppuccin Mocha|Soft pastel on near-black|#1E1E2E|#CDD6F4|#45475A|#F38BA8|#A6E3A1|#F9E2AF|#89B4FA|#F5C2E7|#94E2D5|#BAC2DE|#585B70|#F38BA8|#A6E3A1|#F9E2AF|#89B4FA|#F5C2E7|#94E2D5|#A6ADC8
One Dark|Atom's dark scheme|#282C34|#ABB2BF|#282C34|#E06C75|#98C379|#E5C07B|#61AFEF|#C678DD|#56B6C2|#ABB2BF|#5C6370|#E06C75|#98C379|#E5C07B|#61AFEF|#C678DD|#56B6C2|#FFFFFF
Monokai|Sublime Text's, high-saturation|#272822|#F8F8F2|#272822|#F92672|#A6E22E|#F4BF75|#66D9EF|#AE81FF|#A1EFE4|#F8F8F2|#75715E|#F92672|#A6E22E|#F4BF75|#66D9EF|#AE81FF|#A1EFE4|#F9F8F5
TABLE

# Hex to the "R,G,B" decimal triple Konsole stores. Refuses anything that is not #RRGGBB
# rather than emitting a plausible-looking wrong colour, because a scheme with one bad line
# still loads and you are left hunting for which of sixteen is off.
rgb() {
    local hex="${1#\#}"
    if ! printf '%s' "${hex}" | grep -qiE '^[0-9a-f]{6}$'; then
        printf 'konsole-profiles.sh: not a #RRGGBB colour: %s\n' "$1" >&2
        exit 1
    fi
    printf '%d,%d,%d' "0x${hex:0:2}" "0x${hex:2:2}" "0x${hex:4:2}"
}

# Konsole identifies a scheme by its FILENAME, not by the Description inside it, and the name
# a profile references is that filename without the extension. So the file name is the key and
# spaces in it are fine.
write_scheme() {
    local name="$1" desc="$2" bg="$3" fg="$4"; shift 4
    local -a c=("$@")
    local file="${SCHEME_DIR}/${name}.colorscheme"
    {
        printf '# Generated by scripts/konsole-profiles.sh. Edits here are lost on the next run.\n'
        printf '[Background]\nColor=%s\n\n' "$(rgb "${bg}")"
        printf '[BackgroundIntense]\nColor=%s\n\n' "$(rgb "${bg}")"
        printf '[BackgroundFaint]\nColor=%s\n\n' "$(rgb "${bg}")"
        printf '[Foreground]\nColor=%s\n\n' "$(rgb "${fg}")"
        printf '[ForegroundIntense]\nColor=%s\nBold=true\n\n' "$(rgb "${fg}")"
        printf '[ForegroundFaint]\nColor=%s\n\n' "$(rgb "${fg}")"
        local i
        for i in 0 1 2 3 4 5 6 7; do
            printf '[Color%d]\nColor=%s\n\n'        "${i}" "$(rgb "${c[${i}]}")"
            printf '[Color%dIntense]\nColor=%s\n\n' "${i}" "$(rgb "${c[$((i+8))]}")"
            printf '[Color%dFaint]\nColor=%s\n\n'   "${i}" "$(rgb "${c[${i}]}")"
        done
        # Opacity lives here and nowhere else. See the note at the top of this file.
        printf '[General]\nBlur=false\nColorRandomization=false\nDescription=%s\nOpacity=%s\nWallpaper=\n' \
            "${desc}" "${OPACITY}"
    } > "${file}"
}

write_profile() {
    local name="$1"
    local file="${SCHEME_DIR}/${name}.profile"
    {
        printf '# Generated by scripts/konsole-profiles.sh. Edits here are lost on the next run.\n'
        printf '[Appearance]\nColorScheme=%s\nFont=%s,%s,-1,5,50,0,0,0,0,0\n\n' \
            "${name}" "${FONT_FAMILY}" "${FONT_SIZE}"
        printf '[General]\nName=%s\nParent=FALLBACK/\nTerminalColumns=110\nTerminalRows=32\n\n' "${name}"
        printf '[Scrolling]\nHistoryMode=2\nScrollFullPage=1\n\n'
        printf '[Terminal Features]\nBellMode=0\nBlinkingCursorEnabled=true\n'
    } > "${file}"
}

# ---------------------------------------------------------------------------------------------

MODE="write"
while [ $# -gt 0 ]; do
    case "$1" in
        --list)    MODE="list" ;;
        --check)   MODE="check" ;;
        --default) DEFAULT_PROFILE="${2:?--default wants a profile name}"; shift ;;
        --opacity) OPACITY="${2:?--opacity wants a number like 0.86}"; shift ;;
        -h|--help)
            printf 'usage: %s [--list] [--check] [--default NAME] [--opacity 0.86]\n' "$0"; exit 0 ;;
        *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
    shift
done

names=()
while IFS='|' read -r name rest; do
    [ -n "${name}" ] && names+=("${name}")
done <<< "${SCHEMES}"

if [ "${MODE}" = "list" ]; then
    bold "==> Profiles this script writes"
    printf '%s\n' "${names[@]}" | sed 's/^/    /'
    exit 0
fi

if [ "${MODE}" = "check" ]; then
    bold "==> Checking"
    # Translucency is a compositor feature. Without one every scheme here is simply opaque and
    # nothing in Konsole says so, which is the whole reason this check exists.
    if command -v qdbus6 >/dev/null 2>&1 && [ "$(qdbus6 org.kde.KWin /Compositor active 2>/dev/null)" = "true" ]; then
        good "compositing active — ${OPACITY} opacity will render"
    else
        warn "compositing is OFF or could not be asked — windows will be opaque whatever the scheme says"
    fi
    for n in "${names[@]}"; do
        [ -f "${SCHEME_DIR}/${n}.colorscheme" ] && [ -f "${SCHEME_DIR}/${n}.profile" ] \
            && good "${n}" || warn "${n} — missing"
    done
    info "default profile: $(sed -n 's/^DefaultProfile=//p' "${KONSOLERC}" 2>/dev/null | head -1)"
    exit 0
fi

bold "==> Writing Konsole schemes and profiles"
mkdir -p "${SCHEME_DIR}"

while IFS='|' read -r name desc bg fg c0 c1 c2 c3 c4 c5 c6 c7 i0 i1 i2 i3 i4 i5 i6 i7; do
    [ -n "${name}" ] || continue
    write_scheme "${name}" "${desc}" "${bg}" "${fg}" \
        "${c0}" "${c1}" "${c2}" "${c3}" "${c4}" "${c5}" "${c6}" "${c7}" \
        "${i0}" "${i1}" "${i2}" "${i3}" "${i4}" "${i5}" "${i6}" "${i7}"
    write_profile "${name}"
    info "${name} — ${desc}"
done <<< "${SCHEMES}"

# The default profile is a filename in konsolerc, and Konsole wants the .profile suffix here
# while the scheme reference inside the profile wants no suffix. Getting that backwards leaves
# Konsole silently falling back to the built-in profile.
mkdir -p "$(dirname "${KONSOLERC}")"
touch "${KONSOLERC}"
if grep -q '^DefaultProfile=' "${KONSOLERC}"; then
    sed -i "s|^DefaultProfile=.*|DefaultProfile=${DEFAULT_PROFILE}.profile|" "${KONSOLERC}"
elif grep -q '^\[Desktop Entry\]' "${KONSOLERC}"; then
    sed -i "0,/^\[Desktop Entry\]/s||[Desktop Entry]\nDefaultProfile=${DEFAULT_PROFILE}.profile|" "${KONSOLERC}"
else
    printf '\n[Desktop Entry]\nDefaultProfile=%s.profile\n' "${DEFAULT_PROFILE}" >> "${KONSOLERC}"
fi

bold "==> Done"
good "${#names[@]} profiles written to ${SCHEME_DIR}"
good "default profile: ${DEFAULT_PROFILE} (change it with --default NAME)"
info "opacity ${OPACITY} on every scheme"
info "Konsole windows already open keep their old profile; open a new one to see it."
info "Switch per-window at any time: Settings > Switch Profile."
