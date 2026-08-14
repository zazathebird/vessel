#!/usr/bin/env bash
#
# A read-only look at the machine that will hold the shared files.
#
# Run this on the Linux rig and paste the output back. It writes nothing, mounts
# nothing, installs nothing and needs no root — anything it cannot see without
# privileges it reports as unknown rather than asking for them.
#
# What it is actually for. SPEC-ACCOUNTS.md §8 makes the sharing agent a browser
# tab holding a File System Access directory handle, so the machine that holds
# the files has three requirements that are easy to discover too late: a
# Chromium browser, filesystems whose permissions and case behaviour a browser
# can enumerate sanely, and a habit of staying awake. This checks all three.
#
#   bash scripts/linux-drive-report.sh

set -uo pipefail

rule() { printf '\n%s\n%s\n' "$1" "$(printf '─%.0s' $(seq 1 ${#1}))"; }
have() { command -v "$1" >/dev/null 2>&1; }

printf 'Vessel — drive and host report\n'
printf 'Generated %s on %s\n' "$(date -Is 2>/dev/null || date)" "$(uname -sr)"

rule 'Distribution'
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  printf '%s\n' "${PRETTY_NAME:-unknown}"
else
  printf 'unknown — no /etc/os-release\n'
fi

rule 'Block devices'
# NAME/SIZE/FSTYPE/MOUNTPOINT is the whole picture in one table. LABEL is
# included because a disk carried over from a Windows install is usually the one
# with a human name on it, and that is the disk with the files on it.
if have lsblk; then
  lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT 2>/dev/null
else
  printf 'lsblk not available\n'
fi

rule 'Mounted filesystems, and how full'
# Excludes the pseudo-filesystems, which are noise here.
df -hT -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | sed '1p;1d'

rule 'Filesystem notes that matter for sharing'
# The point of this section: a disk carried over from Windows is almost
# certainly NTFS, and NTFS under Linux behaves in two ways that bite a folder a
# browser is enumerating.
found_ntfs=0
while read -r src target fstype _; do
  case "$fstype" in
    ntfs|ntfs3|fuseblk)
      found_ntfs=1
      printf '  %s  (%s on %s)\n' "$target" "$fstype" "$src"
      ;;
  esac
done < <(findmnt -rn -o SOURCE,TARGET,FSTYPE,OPTIONS 2>/dev/null)

if [ "$found_ntfs" -eq 1 ]; then
  cat <<'NOTE'

  Those are NTFS. Two things follow, neither fatal, both worth knowing now:

  - Permissions are synthesised at mount time, not stored. Every file appears
    owned by whoever mounted it, with one blanket mode. That is usually fine for
    read-only sharing, which is all §8 permits, but it means the filesystem
    cannot express "this subfolder is private" — the grant's path scoping is the
    only thing doing that work.
  - Case-insensitive, while the grants that scope access are compared as
    literal relative subpaths. A grant written for "Invoices" and a folder named
    "invoices" will resolve on this machine and not on a case-sensitive one, so
    a path that works here can fail elsewhere for no visible reason.

  Neither argues for reformatting. They argue for picking share folders whose
  names you would type the same way twice.
NOTE
else
  printf '  No NTFS mounts found — everything is native Linux filesystems.\n'
fi

rule 'Readable without root?'
# A folder the browser cannot read is a folder that cannot be shared, and the
# browser runs as this user with no way to escalate.
while read -r target; do
  case "$target" in
    /proc*|/sys*|/dev*|/run*|/boot*|/snap*) continue ;;
  esac
  if [ -r "$target" ] && [ -x "$target" ]; then
    printf '  yes  %s\n' "$target"
  else
    printf '  NO   %s   ← the sharing tab could not read this\n' "$target"
  fi
done < <(findmnt -rn -o TARGET 2>/dev/null | sort -u)

rule 'Largest directories under $HOME'
# A rough guide to where the files actually are, so the share layout can be
# decided from evidence rather than memory. One level deep and time-bounded,
# because du over a full disk is slow enough that people kill it.
timeout 60 du -h --max-depth=1 "$HOME" 2>/dev/null | sort -rh | head -15 ||
  printf '  (skipped — took longer than a minute)\n'

rule 'Browser'
# §2 records this as a real restriction: the File System Access API exists in
# Chromium browsers and in neither Firefox nor Safari. It lands only on the
# person sharing; whoever receives a file needs nothing special.
browser_found=0
for candidate in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser vivaldi-stable; do
  if have "$candidate"; then
    printf '  %-24s %s\n' "$candidate" "$("$candidate" --version 2>/dev/null | head -1)"
    browser_found=1
  fi
done
[ "$browser_found" -eq 0 ] && printf '  No Chromium-based browser found. One is required to share (§2).\n'

if have firefox; then
  printf '  firefox is installed — fine for browsing the site, cannot share files.\n'
fi

rule 'Does this machine stay awake?'
# The sharpest cost in the whole design (§2): availability is tied to this
# machine, and with a browser agent the tab must be open. A box that suspends on
# idle stops sharing without telling anyone.
if have systemctl; then
  masked=$(systemctl is-enabled sleep.target suspend.target hibernate.target 2>/dev/null | tr '\n' ' ')
  printf '  sleep/suspend/hibernate targets: %s\n' "${masked:-unknown}"
  printf '  (masked = this machine will not suspend itself, which is what sharing wants)\n'
fi
if have gsettings; then
  ac=$(gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-timeout 2>/dev/null)
  [ -n "$ac" ] && printf '  GNOME idle suspend on AC: %s seconds (0 = never)\n' "$ac"
fi
printf '  Uptime: %s\n' "$(uptime -p 2>/dev/null || uptime)"

rule 'Summary'
cat <<'SUMMARY'
  Paste all of the above back and I will work out the share layout from it.

  Nothing here was modified. If anything above says NO under "Readable without
  root", say so explicitly — that is the one finding that changes the plan
  rather than just informing it.
SUMMARY
