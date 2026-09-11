#!/bin/bash
# Fix the xrdp black screen: give RDP its own user, so it gets its own D-Bus
# and systemd user manager and cannot collide with the always-on kiosk session.
# Does NOT touch: sddm autologin, vessel-kiosk.service, the kiosk Plasma session.
set -euo pipefail

NEW_USER="patrick"          # <-- change if you want a different name
SHARE_GROUP="shared"
KIOSK_USER="user"

echo "### 1. Remove the ~/.xsession that caused the black screen"
# Written by the earlier script. SDDM autologin launches plasmax11.desktop directly and
# never reads it, so the kiosk was unaffected -- but xrdp DOES read it, and that is what
# tried to start a second Plasma as uid 1000 against the kiosk's D-Bus names.
if [ -f "/home/$KIOSK_USER/.xsession" ]; then
  mv "/home/$KIOSK_USER/.xsession" "/home/$KIOSK_USER/.xsession.disabled-$(date +%F)"
  echo "    moved aside /home/$KIOSK_USER/.xsession"
else
  echo "    none present"
fi
echo

echo "### 2. Create $NEW_USER (sudo-capable)"
if id "$NEW_USER" >/dev/null 2>&1; then
  echo "    already exists, skipping creation"
else
  adduser --disabled-password --gecos "" "$NEW_USER"
fi
usermod -aG sudo "$NEW_USER"
echo

echo "### 3. Full Plasma for that user's RDP session"
install -o "$NEW_USER" -g "$NEW_USER" -m 700 /dev/stdin "/home/$NEW_USER/.xsession" <<'XS'
#!/bin/sh
exec /usr/bin/startplasma-x11
XS
echo "    wrote /home/$NEW_USER/.xsession"
echo

echo "### 4. Shared group for reaching $KIOSK_USER's files"
groupadd -f "$SHARE_GROUP"
usermod -aG "$SHARE_GROUP" "$NEW_USER"
usermod -aG "$SHARE_GROUP" "$KIOSK_USER"
# Top level: traverse + read for the group, nothing for anyone else.
chgrp "$SHARE_GROUP" "/home/$KIOSK_USER"
chmod 750 "/home/$KIOSK_USER"
# Content: only NON-hidden files/dirs. This deliberately leaves ~/.ssh, ~/.config,
# ~/.local (the kiosk unit lives there), ~/.gnupg and ~/.claude untouched.
find "/home/$KIOSK_USER" -mindepth 1 -maxdepth 1 ! -name '.*' -print0 |
  xargs -0 -r -I{} sh -c '
    chgrp -R "'"$SHARE_GROUP"'" "{}"
    chmod -R g+rwX "{}"
    find "{}" -type d -exec chmod g+s {} +
  '
echo "    /home/$KIOSK_USER opened to group $SHARE_GROUP (non-hidden content only)"
echo

echo "### 5. Restart xrdp so nothing stale lingers"
systemctl restart xrdp xrdp-sesman
echo

echo "### 6. Verify"
echo "--- groups ---"; id "$NEW_USER"; id "$KIOSK_USER"
echo "--- services ---"; systemctl is-active xrdp xrdp-sesman
echo "--- listening ---"; ss -tlnp | grep 3389 || echo "    !! nothing on 3389"
echo "--- firewall ---"; ufw status verbose | sed 's/^/    /'
echo "--- kiosk still up? ---"
systemctl is-active sddm
runuser -u "$KIOSK_USER" -- env XDG_RUNTIME_DIR=/run/user/1000 systemctl --user is-active vessel-kiosk.service 2>&1 || true
echo
echo "### 7. Set the password you will type at the RDP login"
passwd "$NEW_USER"
echo
echo "DONE. RDP to the host Tailscale or LAN address as '$NEW_USER'."
echo "Group membership needs a fresh login to take effect -- which an RDP login is."
