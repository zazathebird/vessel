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
#                 and it never follows a symlink when putting modes back. Files made AFTER
#                 --share-home are in no record: they are handed back to the kiosk user's own
#                 group before the share group is deleted. Anything OUTSIDE /home/user that
#                 somebody gave that group by hand keeps its now-nameless group number.
#                 --share-home and --undo need python3 (they refuse without it).
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

usage() { sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; }

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
# NOTHING HERE ACTS ON A PATH NAME, BECAUSE A NAME CAN CHANGE BETWEEN LOOKING AND ACTING
# (2026-09-24). Everything under /home/user belongs to uid 1000, which can rename, delete and
# replace any of it while this runs as root — so every check made on a name is a check of
# something that may not be there a microsecond later:
#
#   - `chmod -R` FOLLOWS a symlink named on its command line. The old loop found a directory,
#     then ran chmod -R on its name; swap the directory for a link to /etc in between, and /etc
#     became group-writable.
#   - The old --undo tested only the LAST component for a link. Swap an ANCESTOR — Docs/sub for a
#     link to somewhere else — and "put Docs/sub/f.txt back to 600" chmod'd a file outside the
#     home. A harness did exactly that to a file it then found at 777.
#
# So every change goes through fs_tool, which opens each path one component at a time from `/`
# with O_NOFOLLOW, acts on the INODE it opened (through /proc/self/fd, never the name), and on
# --undo also requires that inode to be the very one recorded. A link anywhere on the path, or a
# different file at the same name, is skipped and reported — never followed. Fail closed: without
# python3 nothing is changed at all, because the shell has no way to hold a directory open.
#
# Hidden entries are left alone on purpose: ~/.ssh, ~/.config, ~/.local (the kiosk unit lives
# there), ~/.gnupg and ~/.claude are nobody else's business.
# ---------------------------------------------------------------------------------------------

have_fs_tool() { command -v python3 >/dev/null 2>&1; }

# fs_tool snapshot HOME OUT       record "v2 dev ino mode gid path" (NUL-separated), once
# fs_tool open HOME GROUP         group-own and open every non-hidden dir/file beneath HOME
# fs_tool restore MANIFEST        put back exactly what the record says, inode by inode
# fs_tool sweep HOME SGID FGID MANIFEST
#                                 anything NOT in the record that carries SGID (made after the
#                                 snapshot, inside the setgid directories) goes to FGID, and its
#                                 setgid bit is cleared — so groupdel leaves no orphaned GID here
fs_tool() {
    have_fs_tool || { warn "python3 is not installed, so nothing under the home was changed"; return 3; }
    python3 - "$@" <<'PY'
import grp, os, stat, sys

O_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
O_LEAF = os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC
failures = 0

def warn(msg):
    global failures
    failures += 1
    sys.stderr.write("    WARNING: %s\n" % msg)

def open_dir(path):
    """An absolute directory, opened one component at a time, never through a link."""
    if not path.startswith("/"):
        raise OSError("not an absolute path: %r" % path)
    fd = os.open("/", O_DIR)
    try:
        for part in [p for p in path.split("/") if p]:
            if part in (".", ".."):
                raise OSError("a . or .. component in %r" % path)
            nfd = os.open(part, O_DIR, dir_fd=fd)
            os.close(fd)
            fd = nfd
        return fd
    except BaseException:
        os.close(fd)
        raise

def open_leaf(dfd, name):
    """The thing at NAME inside DFD, itself — a link comes back as the link, never its target."""
    fd = os.open(name, O_LEAF, dir_fd=dfd)
    return fd, os.fstat(fd)

def by_fd(fd):
    # chmod/chown through the fd's magic link reach exactly the inode that was opened.
    return "/proc/self/fd/%d" % fd

def entries(home):
    """(dir fd, name, path) for every non-hidden directory and file beneath HOME, links never
    followed: fwalk descends only when the directory it opened is the one it lstat'ed."""
    hfd = open_dir(home)
    try:
        for name in sorted(os.listdir(hfd)):
            if name.startswith("."):
                continue
            st = os.stat(name, dir_fd=hfd, follow_symlinks=False)
            if stat.S_ISREG(st.st_mode):
                yield hfd, name, home + "/" + name
            elif stat.S_ISDIR(st.st_mode):
                for dirpath, _dirs, files, dfd in os.fwalk(name, dir_fd=hfd, follow_symlinks=False):
                    yield dfd, ".", home + "/" + dirpath
                    for f in files:
                        yield dfd, f, home + "/" + dirpath + "/" + f
    finally:
        os.close(hfd)

def each_inode(home):
    for dfd, name, path in entries(home):
        try:
            fd, st = open_leaf(dfd, name)
        except OSError as e:
            warn("skipped %s (%s)" % (path, e.strerror))
            continue
        try:
            if stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode):
                yield fd, st, path
        finally:
            os.close(fd)

def records(manifest):
    with open(manifest, "rb") as f:
        data = f.read()
    for rec in data.split(b"\0"):
        if not rec:
            continue
        rec = rec.decode("utf-8", "surrogateescape")
        if rec.startswith("v2 "):
            _, dev, ino, mode, gid, path = rec.split(" ", 5)
            yield (int(dev), int(ino)), int(mode, 8), int(gid), path
        else:
            # The first --undo-able version recorded "mode group path" with no inode. Still
            # restored without following anything; only the same-inode test is unavailable.
            mode, group, path = rec.split(" ", 2)
            try:
                gid = int(group) if group.isdigit() else grp.getgrnam(group).gr_gid
            except KeyError:
                gid = -1
            yield None, int(mode, 8), gid, path

cmd, args = sys.argv[1], sys.argv[2:]

if cmd == "snapshot":
    home, out = args
    try:
        ofd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        sys.exit(0)             # written once: the first run's answer is the original state
    with os.fdopen(ofd, "wb") as o:
        for fd, st, path in each_inode(home):
            o.write(("v2 %d %d %o %d %s" % (st.st_dev, st.st_ino, stat.S_IMODE(st.st_mode),
                                             st.st_gid, path)).encode("utf-8", "surrogateescape") + b"\0")

elif cmd == "open":
    home, group = args
    gid = int(group) if group.isdigit() else grp.getgrnam(group).gr_gid
    for fd, st, path in each_inode(home):
        mode = stat.S_IMODE(st.st_mode)
        if stat.S_ISDIR(st.st_mode):
            mode |= 0o070 | stat.S_ISGID
        else:
            mode |= 0o060 | (0o010 if mode & 0o111 else 0)
        try:
            os.chown(by_fd(fd), -1, gid)
            os.chmod(by_fd(fd), mode)
        except OSError as e:
            warn("could not open %s to the group (%s)" % (path, e.strerror))

elif cmd == "restore":
    (manifest,) = args
    for ident, mode, gid, path in records(manifest):
        parent, _, name = path.rpartition("/")
        try:
            dfd = open_dir(parent or "/")
        except OSError:
            warn("%s: a folder above it is gone or is a link now; not touched" % path)
            continue
        try:
            fd, st = open_leaf(dfd, name)
        except OSError:
            os.close(dfd)
            continue            # deleted since: nothing to put back
        try:
            if not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)):
                warn("%s is not the file or folder that was recorded; not touched" % path)
            elif ident is not None and ident != (st.st_dev, st.st_ino):
                warn("%s is a different file from the one recorded; not touched" % path)
            else:
                if gid >= 0:
                    os.chown(by_fd(fd), -1, gid)
                # Setgid included: clearing the g+s this script set is half the point.
                os.chmod(by_fd(fd), mode)
        except OSError as e:
            warn("could not restore %s (%s)" % (path, e.strerror))
        finally:
            os.close(fd)
            os.close(dfd)

elif cmd == "sweep":
    home, sgid, fgid, manifest = args
    sgid, fgid = int(sgid), int(fgid)
    known = set()
    if os.path.isfile(manifest):
        known = {ident for ident, _m, _g, _p in records(manifest) if ident is not None}
    for fd, st, path in each_inode(home):
        if st.st_gid != sgid or (st.st_dev, st.st_ino) in known:
            continue
        try:
            os.chown(by_fd(fd), -1, fgid)
            if stat.S_ISDIR(st.st_mode):
                os.chmod(by_fd(fd), stat.S_IMODE(st.st_mode) & ~stat.S_ISGID)
        except OSError as e:
            warn("could not take %s out of the group (%s)" % (path, e.strerror))

else:
    sys.exit("fs_tool: unknown command %r" % cmd)

sys.exit(1 if failures else 0)
PY
}

snapshot_modes() { fs_tool snapshot "$1" "$2"; }
open_to_group()  { fs_tool open "$1" "$2"; }

# The manifest back onto the disk, inode by inode. A path with a link anywhere on it, or with a
# different file at the recorded name, is SKIPPED and named — putting a mode "back" through
# something that appeared since is how an undo changes what it never touched.
restore_modes() {
    [ -f "$1" ] || return 0
    fs_tool restore "$1"
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
        # Fail closed, and before anything else is reversed: without the tool that cannot follow
        # a link, the record is not replayed at all, and neither is the rest of the undo.
        have_fs_tool || die "python3 is needed to put modes back without following links, and it is
       not installed. Install it (apt install python3) and run --undo again; nothing was changed."
        if restore_modes "$(manifest_file)"; then
            echo "    non-hidden content restored from the record"
        else
            warn "some recorded entries were skipped (named above) — each was a link, or a different
             file, where the record had something else. Look at them by hand."
        fi
    fi

    # Anything made AFTER the snapshot inside the opened (setgid) folders carries the share
    # group and is in no record. Hand it to the kiosk user's own group before the group goes, or
    # groupdel leaves those files with a bare number for a group — and the next group to take
    # that number inherits them. The record is only ever the original state; this is the rest.
    local share_gid kiosk_gid
    share_gid="$(getent group "${SHARE_GROUP}" | cut -d: -f3)"
    kiosk_gid="$(id -g "${KIOSK_USER}")"
    if [ -n "$(state_get home_mode)" ] && [ -n "${share_gid}" ] && [ -n "${kiosk_gid}" ]; then
        have_fs_tool || die "python3 is needed to take new files out of ${SHARE_GROUP} safely; nothing was changed."
        if fs_tool sweep "${home}" "${share_gid}" "${kiosk_gid}" "$(manifest_file)"; then
            echo "    files made since, still in ${SHARE_GROUP}, handed to ${KIOSK_USER}'s own group"
        else
            warn "some files made since could not be taken out of ${SHARE_GROUP} (named above)"
        fi
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
            # -T: if a directory (or a link to one) appears at the destination in between, this
            # fails rather than moving the file INTO it — see step 1 for why that matters as root.
            mv -T -- "${moved}" "${home}/.xsession"
            echo "    moved back — note it is the file that caused the xrdp black screen"
        fi
    fi

    systemctl restart xrdp xrdp-sesman 2>/dev/null || true
    # Kept, renamed, never deleted: it is the only account of what this machine went through.
    mv -T -- "${STATE_DIR}" "${STATE_DIR}.undone-$(date +%Y%m%d-%H%M%S)"
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
        # `mv -T`, and a name nobody can predict. This runs as root inside a directory uid 1000
        # owns, and plain `mv SRC DEST` MOVES SRC INTO DEST when DEST is a directory — or a link
        # to one. The old name was the date to the second, so a directory link planted at it
        # (to /etc/profile.d, say) had root put a user-written shell script where every login
        # shell sources it. With -T a directory there is an error and a link there is replaced,
        # never followed; the random suffix means nobody gets to plant one in the first place.
        local aside
        aside="/home/${KIOSK_USER}/.xsession.disabled-$(date +%F-%H%M%S)-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
        mv -T -- "/home/${KIOSK_USER}/.xsession" "${aside}"
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
        # Before ANY change: the only safe way to walk a tree uid 1000 can rearrange is to hold
        # directories open, and without python3 there is no way to do that here.
        have_fs_tool || die "--share-home needs python3 to change modes without following links,
       and it is not installed. Install it (apt install python3), or leave --share-home off."
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
        # No record, no change: --undo can only reverse what was written down first.
        snapshot_modes "${home}" "$(manifest_file)" \
            || die "could not record ${home}'s modes, so nothing was opened (see above)"
        # This LOOSENS the directory: 700 -> 750. That is the cost of --share-home.
        chgrp -- "${SHARE_GROUP}" "${home}"
        chmod 750 "${home}"
        open_to_group "${home}" "${SHARE_GROUP}" \
            || warn "some entries were skipped (named above) — links, or things that changed mid-walk"
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
