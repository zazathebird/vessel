#!/bin/bash
# Fix the xrdp black screen: give RDP its own user, so it gets its own D-Bus
# and systemd user manager and cannot collide with the always-on kiosk session.
# Does NOT touch: sddm autologin, vessel-kiosk.service, the kiosk Plasma session.
#
# docs/REMOTE-ACCESS.md is the diagnosis. Usage, as root:
#
#   sudo bash scripts/rdp-separate-user.sh                 # the RDP user, nothing else
#   sudo bash scripts/rdp-separate-user.sh --share-home    # ... and open /home/user to it
#   sudo bash scripts/rdp-separate-user.sh --with-sudo     # ... and let it use sudo
#   sudo bash scripts/rdp-separate-user.sh --user NAME     # a name other than the default
#   sudo bash scripts/rdp-separate-user.sh --undo          # reverse exactly what it did
#
# Three things are OPT-IN, and each is a decision rather than a default:
#
#   --with-sudo   xrdp logs in with a PASSWORD, and neither xrdp nor this box has a lockout
#                 on it. A sudo-capable account behind that is root for anybody who can reach
#                 port 3389 and guess or reuse one password. The default user can do ordinary
#                 work in its own desktop; administration goes over SSH, which is key-only.
#   --share-home  /home/user is drwx------ today. Opening it to a group LOOSENS it (to 750)
#                 and rewrites the group and mode of every non-hidden file beneath it. Worth
#                 it if you want the kiosk user's files from the RDP desktop; not otherwise.
#   --undo        Reverses what the record in /var/lib/vessel-rdp-user says this script did,
#                 and nothing else. It never deletes the RDP user's home (it may hold work),
#                 and it never follows a symlink when putting modes back.
set -euo pipefail

NEW_USER="patrick"          # or --user NAME
SHARE_GROUP="shared"
KIOSK_USER="user"
STATE_DIR="/var/lib/vessel-rdp-user"

DO_UNDO=0
DO_SUDO=0
DO_SHARE_HOME=0

die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf '    WARNING: %s\n' "$*" >&2; }

usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; }

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --undo)       DO_UNDO=1 ;;
            --with-sudo)  DO_SUDO=1 ;;
            --share-home) DO_SHARE_HOME=1 ;;
            --user)
                [ "$#" -ge 2 ] || die "--user needs a name"
                NEW_USER="$2"
                shift
                ;;
            -h|--help) usage; exit 0 ;;
            *) die "unknown option: $1 (try --help)" ;;
        esac
        shift
    done
    # A closed charset, because the name reaches adduser, usermod, a path under /home and
    # the state record. Debian's own NAME_REGEX, less the uppercase it does not allow either.
    case "${NEW_USER}" in
        ''|[!a-z_]*|*[!a-z0-9_-]*) die "--user must be a lowercase login name (got: ${NEW_USER})" ;;
    esac
    [ "${#NEW_USER}" -le 32 ] || die "--user is longer than 32 characters"
    [ "${NEW_USER}" != "${KIOSK_USER}" ] || die "the RDP user must not be ${KIOSK_USER} — that is the whole fix"
    if [ "${DO_UNDO}" -eq 1 ] && { [ "${DO_SUDO}" -eq 1 ] || [ "${DO_SHARE_HOME}" -eq 1 ]; }; then
        die "--undo takes no other options; it reverses what the record says, nothing more"
    fi
    return 0
}

# ---------------------------------------------------------------------------------------------
# The record. Every change this script makes is written down BEFORE --undo could need it, and a
# key is only ever written once: the first run's answer is the machine's ORIGINAL state, and a
# second run must not overwrite "I created this user" with "this user already existed".
# ---------------------------------------------------------------------------------------------
state_file() { printf '%s/state' "${STATE_DIR}"; }
manifest_file() { printf '%s/home-modes' "${STATE_DIR}"; }

state_get() {
    local f
    f="$(state_file)"
    [ -f "${f}" ] || return 0
    awk -v k="$1" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { printf "%s", v }' "${f}"
}

state_set_once() {
    local f
    f="$(state_file)"
    if [ -f "${f}" ] && grep -q "^$1=" "${f}"; then
        return 0
    fi
    printf '%s=%s\n' "$1" "$2" >> "${f}"
}

in_group() { id -nG "$1" 2>/dev/null | tr ' ' '\n' | grep -qx -- "$2"; }

# ---------------------------------------------------------------------------------------------
# Opening a home to a group, and putting it back.
#
# THE OLD VERSION PASTED EACH FILENAME INTO AN `sh -c` STRING RUN AS ROOT — xargs -I{} replaced
# {} inside the quoted script text, so a file in /home/user named `x'$(anything)'y` ran
# `anything` as root. Nothing here builds a command out of a filename: every path travels as an
# argument, NUL-delimited, and is never re-parsed by a shell.
#
# Symlinks are skipped at the top level and never followed below it. `chmod -R` FOLLOWS a symlink
# named on its command line, so a link in /home/user pointing at /etc would have handed /etc's
# modes to the group; GNU chgrp/chmod -R do not traverse links met during recursion.
# ---------------------------------------------------------------------------------------------

# Every non-hidden top-level entry of a home, NUL-separated, symlinks excluded. Hidden entries are
# left alone on purpose: ~/.ssh, ~/.config, ~/.local (the kiosk unit lives there), ~/.gnupg and
# ~/.claude are nobody else's business.
shareable_entries() {
    find -P "$1" -mindepth 1 -maxdepth 1 ! -name '.*' ! -type l -print0
}

# Record "mode group path" for everything open_to_group is about to change, so --undo can put it
# back exactly. Written once: a second run must not record the already-opened state as original.
snapshot_modes() {
    local home="$1" out="$2" item
    [ -e "${out}" ] && return 0
    : > "${out}"
    chmod 600 "${out}"
    while IFS= read -r -d '' item; do
        find -P "${item}" \( -type f -o -type d \) -printf '%m %g %p\0' >> "${out}"
    done < <(shareable_entries "${home}")
}

open_to_group() {
    local home="$1" group="$2" item
    while IFS= read -r -d '' item; do
        chgrp -R -- "${group}" "${item}"
        chmod -R g+rwX -- "${item}"
        find -P "${item}" -type d -exec chmod g+s -- {} +
    done < <(shareable_entries "${home}")
}

# The manifest back onto the disk. A path that is now a symlink is SKIPPED, never followed: it
# was a file or a directory when it was recorded, and putting a mode "back" through a link that
# appeared since is how an undo changes something it never touched.
restore_modes() {
    local manifest="$1" rec mode rest grp path
    [ -f "${manifest}" ] || return 0
    while IFS= read -r -d '' rec; do
        mode="${rec%% *}"
        rest="${rec#* }"
        grp="${rest%% *}"
        path="${rest#* }"
        case "${mode}" in ''|*[!0-7]*) continue ;; esac
        [ -L "${path}" ] && continue
        [ -e "${path}" ] || continue
        chgrp -h -- "${grp}" "${path}" 2>/dev/null || warn "could not restore the group of ${path}"
        # Five digits, because GNU chmod keeps a directory's setgid bit through a plain 755 —
        # and clearing the g+s this script set is half the point.
        chmod -- "$(printf '0%04o' "$((8#${mode}))")" "${path}" 2>/dev/null \
            || warn "could not restore the mode of ${path}"
    done < "${manifest}"
}

# ---------------------------------------------------------------------------------------------

undo() {
    local f home kiosk_home_group kiosk_home_mode moved members
    f="$(state_file)"
    [ -f "${f}" ] || die "no record at ${f}, so there is nothing this script knows it did.
       --undo does not guess; it reverses the record and nothing else."
    NEW_USER="$(state_get new_user)"
    [ -n "${NEW_USER}" ] || die "the record names no user; refusing to guess"
    home="/home/${KIOSK_USER}"

    echo "### Undo: /home/${KIOSK_USER}'s modes"
    if [ -f "$(manifest_file)" ]; then
        restore_modes "$(manifest_file)"
        echo "    non-hidden content restored from the record"
    fi
    kiosk_home_group="$(state_get home_group)"
    kiosk_home_mode="$(state_get home_mode)"
    if [ -n "${kiosk_home_group}" ] && [ -n "${kiosk_home_mode}" ]; then
        if [ -L "${home}" ]; then
            warn "${home} is a symlink now; not touching it"
        else
            chgrp -- "${kiosk_home_group}" "${home}"
            chmod -- "$(printf '0%04o' "$((8#${kiosk_home_mode}))")" "${home}"
            echo "    ${home} back to group ${kiosk_home_group}, mode ${kiosk_home_mode}"
        fi
    fi

    echo "### Undo: group memberships"
    if [ "$(state_get kiosk_added_to_group)" = "yes" ] && in_group "${KIOSK_USER}" "${SHARE_GROUP}"; then
        gpasswd -d "${KIOSK_USER}" "${SHARE_GROUP}" >/dev/null && echo "    ${KIOSK_USER} left ${SHARE_GROUP}"
    fi
    if [ "$(state_get new_added_to_group)" = "yes" ] && in_group "${NEW_USER}" "${SHARE_GROUP}"; then
        gpasswd -d "${NEW_USER}" "${SHARE_GROUP}" >/dev/null && echo "    ${NEW_USER} left ${SHARE_GROUP}"
    fi
    if [ "$(state_get sudo_added)" = "yes" ] && in_group "${NEW_USER}" sudo; then
        gpasswd -d "${NEW_USER}" sudo >/dev/null && echo "    ${NEW_USER} left sudo"
    fi
    if [ "$(state_get group_created)" = "yes" ] && getent group "${SHARE_GROUP}" >/dev/null; then
        members="$(getent group "${SHARE_GROUP}" | cut -d: -f4)"
        if [ -n "${members}" ]; then
            warn "group ${SHARE_GROUP} still has members (${members}) this script did not add; left in place"
        else
            groupdel "${SHARE_GROUP}" && echo "    group ${SHARE_GROUP} removed"
        fi
    fi

    echo "### Undo: the RDP user"
    if [ "$(state_get user_created)" = "yes" ] && id "${NEW_USER}" >/dev/null 2>&1; then
        # No --remove-home. That directory may hold work done over RDP, and deleting a tree
        # somebody else could have written links into is exactly what --undo must never do.
        if deluser "${NEW_USER}"; then
            echo "    user ${NEW_USER} removed; /home/${NEW_USER} is LEFT IN PLACE — look before deleting it"
        else
            warn "deluser ${NEW_USER} failed (is an RDP session still open?). Log it out and re-run --undo."
            exit 1
        fi
    fi

    echo "### Undo: ${KIOSK_USER}'s ~/.xsession"
    moved="$(state_get xsession_moved)"
    if [ -n "${moved}" ]; then
        if [ -e "${home}/.xsession" ] || [ -L "${home}/.xsession" ]; then
            warn "${home}/.xsession exists again; leaving ${moved} where it is"
        elif [ -f "${moved}" ] && [ ! -L "${moved}" ]; then
            mv -- "${moved}" "${home}/.xsession"
            echo "    moved back — note it is the file that caused the xrdp black screen"
        fi
    fi

    systemctl restart xrdp xrdp-sesman 2>/dev/null || true
    # Kept, renamed, never deleted: it is the only account of what this machine went through.
    mv -- "${STATE_DIR}" "${STATE_DIR}.undone-$(date +%Y%m%d-%H%M%S)"
    echo
    echo "UNDONE. The record is kept beside ${STATE_DIR} with an .undone suffix."
}

main() {
    parse_args "$@"
    [ "$(id -u)" -eq 0 ] || die "run this as root: sudo bash $0"
    id "${KIOSK_USER}" >/dev/null 2>&1 || die "there is no ${KIOSK_USER} user on this machine"

    if [ "${DO_UNDO}" -eq 1 ]; then
        undo
        return 0
    fi

    install -d -o root -g root -m 700 "${STATE_DIR}"
    local recorded
    recorded="$(state_get new_user)"
    if [ -n "${recorded}" ] && [ "${recorded}" != "${NEW_USER}" ]; then
        die "this machine's record is for ${recorded}, not ${NEW_USER}. Run --undo first, or pass --user ${recorded}."
    fi
    state_set_once new_user "${NEW_USER}"

    echo "### 1. Remove the ~/.xsession that caused the black screen"
    # Written by the earlier script. SDDM autologin launches plasmax11.desktop directly and
    # never reads it, so the kiosk was unaffected -- but xrdp DOES read it, and that is what
    # tried to start a second Plasma as uid 1000 against the kiosk's D-Bus names.
    if [ -e "/home/${KIOSK_USER}/.xsession" ] || [ -L "/home/${KIOSK_USER}/.xsession" ]; then
        local aside
        aside="/home/${KIOSK_USER}/.xsession.disabled-$(date +%F-%H%M%S)"
        mv -- "/home/${KIOSK_USER}/.xsession" "${aside}"
        state_set_once xsession_moved "${aside}"
        echo "    moved aside to ${aside}"
    else
        echo "    none present"
    fi
    echo

    echo "### 2. Create ${NEW_USER}"
    if id "${NEW_USER}" >/dev/null 2>&1; then
        state_set_once user_created no
        echo "    already exists, skipping creation"
    else
        adduser --disabled-password --gecos "" "${NEW_USER}"
        state_set_once user_created yes
    fi
    if [ "${DO_SUDO}" -eq 1 ]; then
        if ! in_group "${NEW_USER}" sudo; then
            usermod -aG sudo "${NEW_USER}"
            state_set_once sudo_added yes
        fi
        warn "${NEW_USER} can use sudo, and xrdp logs in by PASSWORD with no lockout. That makes
             this password root's, for anybody who can reach port 3389. Keep 3389 off anything
             but tailscale0 and the LAN, and make the password long and unique."
    elif in_group "${NEW_USER}" sudo; then
        die "${NEW_USER} is already in the sudo group, and xrdp would put a password-only root
       login on port 3389. Remove it (gpasswd -d ${NEW_USER} sudo), or pass --with-sudo to
       say you mean it."
    else
        echo "    not in sudo (pass --with-sudo to change that; administer over SSH instead)"
    fi
    echo

    echo "### 3. Full Plasma for that user's RDP session"
    # install unlinks the destination before writing, so a symlink planted at this path is
    # replaced rather than written through.
    install -o "${NEW_USER}" -g "${NEW_USER}" -m 700 /dev/stdin "/home/${NEW_USER}/.xsession" <<'XS'
#!/bin/sh
exec /usr/bin/startplasma-x11
XS
    echo "    wrote /home/${NEW_USER}/.xsession"
    echo

    echo "### 4. Reaching ${KIOSK_USER}'s files"
    if [ "${DO_SHARE_HOME}" -eq 1 ]; then
        local home="/home/${KIOSK_USER}"
        [ -L "${home}" ] && die "${home} is a symlink; refusing to change modes through it"
        if ! getent group "${SHARE_GROUP}" >/dev/null; then
            groupadd "${SHARE_GROUP}"
            state_set_once group_created yes
        fi
        if ! in_group "${NEW_USER}" "${SHARE_GROUP}"; then
            usermod -aG "${SHARE_GROUP}" "${NEW_USER}"
            state_set_once new_added_to_group yes
        fi
        if ! in_group "${KIOSK_USER}" "${SHARE_GROUP}"; then
            usermod -aG "${SHARE_GROUP}" "${KIOSK_USER}"
            state_set_once kiosk_added_to_group yes
        fi
        state_set_once home_group "$(stat -c '%G' "${home}")"
        state_set_once home_mode "$(stat -c '%a' "${home}")"
        snapshot_modes "${home}" "$(manifest_file)"
        # This LOOSENS the directory: 700 -> 750. That is the cost of --share-home.
        chgrp -- "${SHARE_GROUP}" "${home}"
        chmod 750 "${home}"
        open_to_group "${home}" "${SHARE_GROUP}"
        echo "    ${home} opened to group ${SHARE_GROUP} (750, non-hidden content only)"
    else
        echo "    skipped: /home/${KIOSK_USER} keeps its mode (pass --share-home to open it)"
    fi
    echo

    echo "### 5. Restart xrdp so nothing stale lingers"
    systemctl restart xrdp xrdp-sesman
    echo

    echo "### 6. Verify"
    echo "--- groups ---"; id "${NEW_USER}"; id "${KIOSK_USER}"
    echo "--- services ---"; systemctl is-active xrdp xrdp-sesman || true
    echo "--- listening ---"; ss -tlnp | grep 3389 || echo "    !! nothing on 3389"
    echo "--- firewall ---"; ufw status verbose | sed 's/^/    /' || true
    echo "--- kiosk still up? ---"
    systemctl is-active sddm || true
    runuser -u "${KIOSK_USER}" -- env XDG_RUNTIME_DIR="/run/user/$(id -u "${KIOSK_USER}")" \
        systemctl --user is-active vessel-kiosk.service 2>&1 || true
    echo
    echo "### 7. Set the password you will type at the RDP login"
    passwd "${NEW_USER}"
    echo
    echo "DONE. RDP to the host Tailscale or LAN address as '${NEW_USER}'."
    echo "Group membership needs a fresh login to take effect -- which an RDP login is."
    echo "Reverse all of it with: sudo bash $0 --undo"
}

# Sourced by the gate for its functions; run for real otherwise.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
