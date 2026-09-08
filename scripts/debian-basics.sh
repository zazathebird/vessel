#!/usr/bin/env bash
#
# The basic tools a fresh Debian netinst does not give you.
#
# A minimal Debian install (no desktop task, "standard system utilities" only)
# leaves out most of what a person at a terminal reaches for, and puts the
# admin tools it does have in /usr/sbin, which a normal user's PATH does not
# include — so `usermod` says "command not found" while being installed.
# This script fixes both, once. Run it as your normal user; it uses sudo.
#
# If sudo itself is missing, do this first as root (su -):
#     apt install sudo && /usr/sbin/usermod -aG sudo YOURNAME
# then log out and back in.
#
# Usage:
#   ./debian-basics.sh            # install everything below
#   ./debian-basics.sh --list     # print the package list and exit
set -euo pipefail

PACKAGES=(
    # the shell and editors
    bash-completion vim nano less
    # moving files and archives
    curl wget rsync zip unzip xz-utils bzip2 p7zip-full
    # source and build
    git build-essential pkg-config
    # looking at the machine
    htop btop ncdu tree lsof psmisc procps file pciutils usbutils dmidecode smartmontools
    # network
    iproute2 net-tools dnsutils iputils-ping traceroute nmap tcpdump openssh-client ethtool
    # searching and text
    ripgrep fd-find jq
    # terminal multiplexer, and a way to find things
    tmux screen plocate man-db manpages
    # scripting
    python3 python3-pip python3-venv
    # certificates, keys and release info that apt sources need
    ca-certificates gnupg lsb-release apt-transport-https software-properties-common
)

if [ "${1:-}" = "--list" ]; then printf '%s\n' "${PACKAGES[@]}"; exit 0; fi

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as your normal user, not root; it calls sudo itself."
command -v sudo >/dev/null 2>&1 || die "sudo is not installed. See the note at the top of this file."
sudo -v || die "sudo refused. Is ${USER} in the sudo group? (groups ${USER})"

log "Updating package lists"
sudo apt-get update -q

log "Installing ${#PACKAGES[@]} packages"
# One at a time would be slow; all at once fails whole if one name is unknown on
# this release. Try the lot, and on failure fall back to one at a time so the
# rest still land and the missing ones are named.
if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${PACKAGES[@]}"; then
    info "the combined install failed; retrying one package at a time"
    missing=()
    for p in "${PACKAGES[@]}"; do
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$p" >/dev/null 2>&1 || missing+=("$p")
    done
    [ "${#missing[@]}" -eq 0 ] || info "not available on this release: ${missing[*]}"
fi

log "Putting the admin tools on your PATH"
# Debian keeps usermod, useradd, ip, iptables, etc. in /usr/sbin and /sbin and
# leaves them off a normal user's PATH. Add both for bash and zsh.
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
    [ -f "${rc}" ] || continue
    if ! grep -qs '/usr/sbin:/sbin' "${rc}"; then
        printf '\n# admin tools (debian-basics.sh)\nexport PATH="$PATH:/usr/sbin:/sbin"\n' >> "${rc}"
        info "added /usr/sbin and /sbin to PATH in ${rc}"
    else
        info "${rc} already has /usr/sbin on PATH"
    fi
done

log "Indexing"
sudo updatedb 2>/dev/null && info "plocate index built (use: locate NAME)" || info "plocate index skipped"

cat <<EOF

Done. Open a NEW terminal so PATH is fresh. Notes:
  - fd is installed as 'fdfind' on Debian; alias fd=fdfind if you want the short name.
  - 'locate NAME' finds files; 'rg PATTERN' searches inside them.
  - System-wide upgrade any time: sudo apt update && sudo apt full-upgrade -y
EOF
