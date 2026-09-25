#!/bin/bash
# Wrapper around scripts/rdp-separate-user.sh that handles the three things
# the script itself does not. Run with sudo, from the vessel repo root.
set -euo pipefail
cd /home/user/Downloads/vessel

echo "### 0. Free port 3389 (freerdp-shadow-cli3 is squatting on it)"
# xrdp.ini has port=3389; shadow has held it since 2026-09-11. It is not a
# systemd unit, so it dies at the next reboot regardless. Nobody is connected.
if pkill -x freerdp-shadow-; then
  echo "    stopped freerdp-shadow-cli3"
  sleep 1
else
  echo "    not running"
fi
echo

# The upstream script ends with an interactive `passwd`, which needs a real
# TTY. Drop that last step; we set the password separately below.
sed '/^echo "### 7\./,$d' scripts/rdp-separate-user.sh > /tmp/rdp-fix-body.sh
bash /tmp/rdp-fix-body.sh
rm -f /tmp/rdp-fix-body.sh

echo "### 7. Enable xrdp so it survives a reboot (script only restarts it)"
systemctl enable --now xrdp xrdp-sesman
systemctl is-enabled xrdp xrdp-sesman
ss -tlnp | grep 3389 || echo "    !! nothing on 3389"
echo
echo "### 8. Now set the RDP password:   sudo passwd patrick"
