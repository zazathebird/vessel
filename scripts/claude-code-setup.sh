#!/usr/bin/env bash
#
# Install Claude Code on a Debian/Ubuntu machine, as the user who will run it.
#
# Deliberately NOT part of scripts/thinkcentre-setup.sh: that script builds a
# locked-down kiosk (managed Chromium policy, firewall, no dev tools), and a
# coding agent with shell access on the box holding the operator's session is
# the opposite of that. Run this on the machine you write code on. If that is
# the kiosk box, know that you are choosing convenience over the lockdown.
#
# What it does, in order:
#   1. Refuses to run as root — Claude Code lives in the user's home.
#   2. Installs the prerequisites with apt: curl, git, ca-certificates, ripgrep.
#   3. Downloads Anthropic's official installer to a file (never piped straight
#      into bash), prints its checksum so you can compare it against another
#      download, and runs it. It installs to ~/.local/bin, no root needed.
#   4. Puts ~/.local/bin on PATH for bash and zsh if it is not already.
#   5. Optionally clones the website repo to ~/project/website (--with-repo).
#   6. Verifies `claude --version` answers.
#
# Usage:
#   ./claude-code-setup.sh              # install Claude Code
#   ./claude-code-setup.sh --with-repo  # and clone the website repo
#
# Afterwards: open a new terminal, run `claude`, and sign in when it asks.
set -euo pipefail

REPO_URL="https://github.com/zazathebird/vessel.git"
REPO_DIR="${HOME}/project/website"
INSTALLER_URL="https://claude.ai/install.sh"

WITH_REPO=0
for arg in "$@"; do
    case "${arg}" in
        --with-repo) WITH_REPO=1 ;;
        -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) printf 'Unknown option: %s\n' "${arg}" >&2; exit 1 ;;
    esac
done

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# 1. Not root.
if [ "$(id -u)" -eq 0 ]; then
    die "Run this as your normal user, not root or sudo. Claude Code installs into your own home
       directory and runs as you; as root it lands in /root where your login never sees it."
fi
command -v sudo >/dev/null 2>&1 || die "sudo is not installed. As root: apt install sudo && /usr/sbin/usermod -aG sudo ${USER}, then log out and in."
sudo -v || die "sudo refused. Is ${USER} in the sudo group? (groups ${USER})"

# 2. Prerequisites.
log "Installing prerequisites"
sudo apt-get update -q
sudo apt-get install -y -q curl git ca-certificates ripgrep
info "curl, git, ca-certificates, ripgrep"

# 3. The official installer, downloaded to a file and run from it.
log "Downloading Anthropic's installer"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
curl -fsSL "${INSTALLER_URL}" -o "${tmp}/install.sh" || die "Could not download ${INSTALLER_URL}. Is the network up?"
[ -s "${tmp}/install.sh" ] || die "The installer downloaded empty."
info "saved to ${tmp}/install.sh ($(wc -c < "${tmp}/install.sh") bytes)"
info "sha256: $(sha256sum "${tmp}/install.sh" | cut -d' ' -f1)"
info "(compare against a second download on another machine if you want to be sure of it)"

log "Running the installer"
bash "${tmp}/install.sh"

# 4. PATH.
BIN="${HOME}/.local/bin"
case ":${PATH}:" in
    *":${BIN}:"*) info "${BIN} is already on PATH" ;;
    *)
        for rc in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
            [ -f "${rc}" ] || continue
            if ! grep -qs 'HOME/.local/bin' "${rc}"; then
                printf '\n# Claude Code lives here (claude-code-setup.sh)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "${rc}"
                info "added ${BIN} to PATH in ${rc}"
            fi
        done
        export PATH="${BIN}:${PATH}"
        ;;
esac

# 5. The repo, if asked.
if [ "${WITH_REPO}" -eq 1 ]; then
    log "Cloning the website repo"
    if [ -d "${REPO_DIR}/.git" ]; then
        info "${REPO_DIR} already exists; pulling instead"
        git -C "${REPO_DIR}" pull --ff-only
    else
        mkdir -p "$(dirname "${REPO_DIR}")"
        git clone "${REPO_URL}" "${REPO_DIR}"
    fi
    info "${REPO_DIR} — the setup scripts are in scripts/, the guides in docs/"
    info "The site itself needs Node 20+ (apt install nodejs npm, or nvm) before npm run dev works."
fi

# 6. Verify.
log "Verifying"
if command -v claude >/dev/null 2>&1; then
    info "claude $(claude --version 2>/dev/null || echo '(installed; --version did not answer)')"
else
    die "claude is not on PATH after the install. Open a new terminal and try 'claude --version';
       if that fails, the installer's own output above says where it put the binary."
fi

cat <<EOF

Done. Open a NEW terminal (so PATH is fresh), then:

    claude

It asks you to sign in on first run. On a machine you SSH into, it prints a URL
to open on any device with a browser — copy the code back when asked.
EOF
