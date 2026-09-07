# The ThinkCentre M93p sharing host

A setup guide for turning the Lenovo ThinkCentre M93p (Tiny/USFF, vPro i5, ex-Windows 7/10) into
the always-on machine for mcclevarty.ca — the phase-2 file-sharing agent, plus optionally
Pi-hole/AdGuard for network-wide ad blocking. This is the x86/Debian sibling of
`docs/pi-sharing-host.md`; read that file's *"The disk is the point"* and *"What has to be done by
hand, and why"* sections too, because the reasoning there (why ext4, why UUID mounts, why the
folder picker can't be automated) applies unchanged here. `scripts/pi-setup.sh` will not run on
this machine — it hard-refuses on anything that isn't a Raspberry Pi.

**There is now a script for this machine: `scripts/thinkcentre-setup.sh`.** It does §3 through §9
below, and a good deal that this guide never covered. Read the sections anyway — the script tells
you *what* it did, and these tell you *why*.

**Scope, stated up front:** the Vessel *website* is not hosted here. It's a Cloudflare Worker + D1
+ R2 deployment; nothing about serving mcclevarty.ca needs this box. What this machine does for the
site is exactly one thing — hold open a signed-in Chromium tab on `/share`, so the file-sharing
agent described in `design/SPEC-ACCOUNTS.md` §8 has something to run on. Everything else in this
guide (Pi-hole, Samba, firewall) is general home-server work you're bundling onto the same box, not
something the website needs.

---

## The Pi/ThinkCentre decision

**Use the ThinkCentre for the sharing host. Don't duplicate it onto the Pi.** The workload
`docs/pi-sharing-host.md` describes as the risky part — a full Chromium session with one page open,
surviving weeks unattended — is exactly where this machine is strictly better hardware: real
SATA/NVMe instead of USB-attached storage, a vPro i5 against a Pi's ARM cores, Gigabit Ethernet, and
no SD-card-wear failure mode. There's no reason to run the same service on the weaker box once the
stronger one is available and already has to be on 24/7 anyway.

**Put Pi-hole (or AdGuard Home) on the ThinkCentre too, as a Docker container** (§9 below), rather
than buying a second always-on device for it. It costs the box nothing it isn't already spending.

**The old Pi gets two jobs, and both are genuinely worth doing rather than duplicating the sharing
host:**

1. **A second Pi-hole, as the router's secondary DNS** — see §9 for the full reasoning and setup.
   This is real redundancy, not a downgrade: the house keeps ad-blocking even while the ThinkCentre
   is rebooting, instead of falling through to an unfiltered public resolver for that window.
2. **An offsite-ish backup target for `/srv/vessel`.** `docs/pi-sharing-host.md` says this plainly
   and it's worth repeating: if the ThinkCentre's drive is the *only* copy of what's shared, a dead
   drive is those files gone — Vessel holds no server-side copy by design. Point the old Pi at a
   weekly `rsync --delete` pull onto its own SD card or a spare USB drive:

```sh
# on the Pi, in a cron job or systemd timer, once a week
rsync -av --delete vessel-host.local:/srv/vessel/ /home/pi/vessel-backup/
```

Both jobs are light enough to share one Pi — Pi-hole is near-idle CPU/RAM, and the rsync pull only
runs during its weekly window.

---

## The script

```sh
./scripts/thinkcentre-setup.sh                 # the whole thing, with sensible defaults
./scripts/thinkcentre-setup.sh --help          # every option
./scripts/thinkcentre-setup.sh --verify        # change nothing; check everything
```

Run it as your ordinary user, **not** with sudo — it refuses, because the systemd user service, the
linger flag and above all the Chromium profile that holds the directory handle all belong to your
account, and in root's home the desktop session would never see them. It calls sudo itself for the
dozen or so steps that need it.

**Re-running it is the point.** Every step looks at the world before it changes it and says
`(already done)` when there is nothing to do, so the state it is most often run in — "the last run
died somewhere and nobody is sure where" — is a state it recovers from.

What it does beyond this guide's original §3–§9:

- **A Chromium managed policy.** This box autologins into a browser that is signed in as you, so
  the browser is narrowed to the one thing it is for: it can reach `https://mcclevarty.ca` — that
  host exactly, that scheme only — and nothing else, cannot save a password, cannot sign in to a
  Google account or sync the profile (which is the profile holding your session and the folder
  handle), and has no DevTools to read them out of. It is written to every managed-policy
  directory a browser on the box would actually read, and the summary names the paths it wrote.
  Delete those files to undo it, or pass `--no-chromium-policy`.
- **A watchdog, every ten minutes.** Every kiosk flag in every guide addresses the browser
  *process* being wrong. None of them addresses the *page* being wrong — and if the site is
  unreachable when Chromium starts (a router still booting, DNS not up, a blip during the Sunday
  restart) it renders an error page and sits on it for ever, with the process up and systemd
  satisfied. The launcher now waits for the site before starting, and the watchdog restarts the tab
  on one transition only: unreachable, then reachable. It cannot loop and it does nothing while the
  site is up. Chromium cannot be asked from outside what it is displaying without opening the
  remote-debugging port, which hands full control of the browser to anything that can reach it —
  so this watches the thing it honestly can see.
- **Chromium gets its own upgrade window.** On Debian, Chromium security updates arrive through the
  same `bookworm-security` origin as everything else, so leaving it to unattended-upgrades means
  the binary under a running browser is replaced at an hour nobody chose. It is excluded from
  unattended-upgrades and upgraded instead by `vessel-chromium-update.timer`, Sundays at 04:00,
  which restarts the kiosk afterwards **only if the version actually moved**. Change the hour in
  `/etc/systemd/system/vessel-chromium-update.timer` to one you would be happy for the sharing tab
  to blink out in. Excluding it *without* replacing the schedule would leave an un-patched browser
  holding a handle to your files, which is why `--no-auto-chromium` prints a warning.
- **The clock.** Sign-in here is password + TOTP, and TOTP is a function of the clock: a box whose
  time has drifted cannot sign in at all, and the error it gives is "wrong code", which sends you
  looking at your phone rather than at the machine.
- **Never idles**, five ways, because the mechanisms do not overlap: the systemd sleep targets are
  masked, logind's `IdleAction` is `ignore`, the X server's screensaver and DPMS are off from
  server start, the screen lockers are purged outright, and — if this box already runs GNOME —
  its idle, lock and sleep keys are set in the system dconf database and locked, since GNOME's
  lock lives inside `gnome-shell` and cannot be purged or reached by any of the other four. A
  locked screen is a stopped share.
- **The firewall**, default-deny inbound with SSH allowed and *rate-limited*. It reads the port
  from `sshd -T` rather than assuming 22, and refuses to enable ufw at all if it cannot work the
  port out — enabling a firewall without an SSH rule on a machine that lives on a shelf is how you
  end up carrying it to a monitor.
- **sshd**: root login off, four auth tries, X11 forwarding off. Passwords stay on unless you pass
  `--ssh-key-only`, and even then it refuses if there is no usable key in your `authorized_keys`.
  Afterwards it asks `sshd -T` whether the settings actually took, because in sshd the *first*
  value wins and a drop-in below an earlier setting is written, reloaded, and quietly ignored.
- **A listener audit.** It prints everything still listening on the network, so the thing the
  script did not think of is at least in front of you.
- **It tells you the truth about itself.** Every line of the CONFIGURED summary reports what
  actually happened rather than what was asked for — so "sshd  NOT CONFIGURED", "Chromium policy
  NOT WRITTEN" and "Desktop  NOT CONFIGURED — unknown display manager" are all things it will say
  about itself. `--verify` exits non-zero when the firewall is off, the browser lockdown is
  missing, the store has vanished or sshd no longer refuses root.

What it still refuses to do, and why:

- **It does not format, partition or mount a disk, and never writes `/etc/fstab`.** §5 below is
  still yours. A wrong fstab line on a machine on a shelf is a machine you walk to with a keyboard.
- **It does not install Samba** or open any port but SSH.
- **It does not add you to the `docker` group.** That group is root-equivalent — a container can
  mount the host filesystem — and this box autologins to a desktop. Use `sudo docker`.
- **It does not pair the machine.** §6 cannot be scripted on any hardware.
- **It does not phone home.** `SPEC-ACCOUNTS.md` §9 is an inventory of everything this project
  stores about a person, and a setup script that reported in would be a spec change.

`--with-pihole` does §9 too, with two differences from every guide you will find: Docker comes from
Debian's own `docker.io` package rather than `curl | sudo sh`, and both published ports are bound to
an address (DNS to the LAN address, the admin UI to localhost) because **Docker writes its own
iptables rules and they are evaluated ahead of ufw's** — a bare `-p 53:53` is reachable from
anywhere that can route to this box, default-deny notwithstanding.

---

## 0. Before you wipe Windows

- **Write down the Windows 10 Pro key off the COA sticker** before erasing the drive. It's a real,
  usable license even once Linux is on the box — cheap insurance in case you ever want Windows back
  on this or another machine.
- **Check Intel AMT/MEBx is disabled or unprovisioned** (Ctrl+P at the Lenovo splash screen, or F1
  into BIOS setup and look for an Intel AMT section). This machine is vPro and was a corporate
  asset; vPro's out-of-band management runs below whatever OS you install, so if a previous owner
  provisioned it and never reset it, it's worth confirming it's inert before this box holds anything
  you care about. "AMT: Disabled" or "Unconfigured" is what you want to see.
- **If the OS will live on a USB SSD** (as the current host's does), plan on one kernel parameter
  after the install: `usbcore.autosuspend=-1` in `GRUB_CMDLINE_LINUX_DEFAULT`, then `update-grub`.
  A USB root that autosuspends is a hung box. The script warns when it sees a USB root and lists
  the step under *still manual*; it never edits the boot line itself.
- **Note the boot mode** (UEFI vs Legacy) and whether Secure Boot is on — Debian installs cleanly
  either way, this is just so you're not surprised by the installer's partitioning defaults.

---

## 1. Install Debian, not Ubuntu

**Debian over Ubuntu here, for one concrete reason rather than general preference: Chromium.**
Ubuntu dropped the apt-installable Chromium years ago — `apt install chromium-browser` on a current
Ubuntu just pulls a transitional package that installs the Snap instead, and Snaps auto-refresh on
their own schedule, which you can delay but not fully disable on Ubuntu LTS without extra
configuration. That fights the one design goal this whole kiosk setup is built around: Chromium
upgrades happen by hand, on a schedule you choose, so a restart never lands mid-transfer (§4). Debian
ships Chromium as a normal apt package with no forced-update daemon behind it, so "manual upgrades"
means what it says. Everything else — hardware support, stability, apt itself — is a wash on
2013-era Haswell hardware that every mainstream distro handles without incident. If you'd rather run
Ubuntu anyway, install Chromium from Flathub instead of the Snap store to keep the same manual-update
control; the rest of this guide applies unchanged either way.

Download the current Debian **stable** netinst image for `amd64` from debian.org, verify its
checksum, and write it to a USB stick (`dd`, Rufus, or balenaEtcher). Boot the M93p and hit the boot
menu (F12 on most Lenovo desktops) to pick the USB drive.

Installer choices that matter for this machine:

- **Hostname**: something you'll type over SSH often — `vessel-host` is the same convention
  `docs/pi-sharing-host.md` uses, and this guide assumes it. This is a *network* name only and has
  nothing to do with `machines.name` inside Vessel — §9 of the accounts spec is explicit that a
  machine's name in the account system is typed by the owner and never taken from a hostname,
  specifically because hostnames tend to leak somebody's real name.
- **Full-disk encryption: skip it.** LUKS halts the boot waiting for a passphrase typed at a
  console, which is exactly the failure mode `nofail` exists to avoid for the data mount later in
  this guide — a box that's supposed to come back unattended after a power cut shouldn't need a
  human standing in front of it to finish booting.
- **Partitioning**: guided is fine for the OS disk. Plain ext4, no LVM needed for a single-purpose
  appliance box. If the Tiny chassis's second bay or an external USB SSD will hold the shared files,
  leave that drive alone here — format and mount it by hand in §4, same as the Pi doc, so you
  control the UUID-based fstab line yourself.
- **Software selection (tasksel)**: deselect the default desktop environment (GNOME) — it's heavier
  than this box needs for a kiosk tab. Keep **SSH server** and **standard system utilities**
  checked. You'll install a lighter desktop by hand next.
- **User account**: create a real user, not root login. This account owns the systemd user service,
  the Chromium profile, and the directory handle — same reasoning as the Pi doc's "don't use `pi`":
  pick a name you're content to see in file paths for years.

---

## 2. First boot and update

```sh
ssh yourname@vessel-host.local   # or its IP if mDNS doesn't resolve on your network
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

---

## 3. A lightweight desktop, Chromium, and autologin

*`scripts/thinkcentre-setup.sh` does all of this, and skips installing a desktop if the box
already has one — replacing an existing GNOME with Xfce is not the script's decision to make.*

```sh
sudo apt install -y xfce4 xfce4-goodies lightdm chromium unclutter
sudo apt purge -y light-locker xfce4-screensaver   # nothing here should ever lock or blank
```

Autologin, via a LightDM drop-in rather than editing the main config file directly:

```sh
sudo mkdir -p /etc/lightdm/lightdm.conf.d
sudo tee /etc/lightdm/lightdm.conf.d/50-autologin.conf >/dev/null <<'EOF'
[Seat:*]
autologin-user=yourname
autologin-user-timeout=0
EOF
```

If Debian's `lightdm` package created an `autologin` group (`getent group autologin` to check), add
your user to it:

```sh
sudo gpasswd -a yourname autologin
```

---

## 4. The kiosk: launcher, config, and a systemd user service

*The script does this, and the launcher it writes is considerably more careful than the one
below: it waits for a display rather than crash-looping into one that is not there yet, and it
clears Chromium's crash flag, without which a power cut brings the browser back showing a "Restore
pages?" bubble instead of the sharing tab — the process up, systemd satisfied, and nobody sharing.*

This mirrors `scripts/pi-setup.sh`'s design exactly — a one-line URL config file the script (or you)
never overwrites once set, a launcher, and a `systemd --user` service with `Restart=always` plus
lingering so it starts at boot with nobody logged in.

```sh
mkdir -p ~/.config/vessel-kiosk ~/.local/bin ~/.config/systemd/user
echo 'https://mcclevarty.ca/share' > ~/.config/vessel-kiosk/url
```

The launcher (`~/.local/bin/vessel-kiosk`):

```sh
cat > ~/.local/bin/vessel-kiosk <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
xset s off -dpms 2>/dev/null || true
url="$(cat "$HOME/.config/vessel-kiosk/url")"
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  "$url"
EOF
chmod +x ~/.local/bin/vessel-kiosk
```

The systemd user unit (`~/.config/systemd/user/vessel-kiosk.service`):

```sh
cat > ~/.config/systemd/user/vessel-kiosk.service <<'EOF'
[Unit]
Description=Vessel sharing kiosk
After=graphical-session.target

[Service]
Environment=DISPLAY=:0
ExecStart=%h/.local/bin/vessel-kiosk
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
EOF
```

Enable lingering (so the user service runs at boot without a login) and start the service:

```sh
sudo loginctl enable-linger yourname
systemctl --user daemon-reload
systemctl --user enable --now vessel-kiosk
```

To point it somewhere else later, edit the one file and restart — never re-run the setup by hand
over it:

```sh
echo 'https://example.invalid/wherever' > ~/.config/vessel-kiosk/url
systemctl --user restart vessel-kiosk
```

**Chromium upgrades stay manual, deliberately** — same reasoning as the Pi doc. An automatic
Chromium upgrade replaces the binary under a running browser and forces a restart nobody chose,
possibly mid-transfer. Do it by hand on a schedule you'll actually keep and confirm the tab comes
back:

```sh
sudo apt update && sudo apt full-upgrade   # will pull a new chromium when Debian ships one
systemctl --user status vessel-kiosk
```

---

## 5. The data store

*The script creates the store directory, gives it to you at mode 0750, lays out the siblings on a
store that is empty, and tells you if it is on NTFS, exFAT or a network filesystem. It does not
format, mount or write fstab — the rest of this section is still yours.*

**For now, on the internal 256GB SSD: skip the separate-partition dance below and just use a
directory.** Everything in this section assumes a drive that can physically be missing at boot —
external, hot-swappable, or a second internal bay — which is why it goes through UUID mounts and
`nofail`. None of that risk exists for a folder on the same drive the OS itself boots from: if that
drive is gone, the machine never got far enough to care about `/srv/vessel` either. So while you're
testing:

```sh
sudo mkdir -p /srv/vessel
sudo chown -R yourname:yourname /srv/vessel
```

and skip straight to "Lay it out as siblings" below. Come back to the UUID-mount version once you
move the store to external/DAS storage, so a full `/srv/vessel` can never fill the root filesystem
and take the OS down with it, and so the drive genuinely can go missing without stalling a boot.

**When you eventually add a NAS, don't mount it at `/srv/vessel` over the network.**
`docs/pi-sharing-host.md`'s whole "disk is the point" argument is about exactly this trap: if the
folder Chromium is enumerating is actually an SMB/NFS mount to a NAS, then every NAS reboot —
firmware updates are routine on Synology/QNAP — turns the shared folder into something that hangs or
lists empty while the ThinkCentre itself looks perfectly fine. That reads as a Vessel bug from the
outside and it isn't one. A **DAS** enclosure (USB/eSATA, directly attached to the ThinkCentre) has
none of this problem — it's just another local drive as far as this whole section is concerned,
format it ext4 and mount it by UUID exactly as written below. If a NAS is genuinely what you want
later, decide in advance whether occasional "sharing is down during a NAS reboot" is acceptable to
you, because it's inherent to that choice, not a bug to fix.

Identical reasoning to `docs/pi-sharing-host.md`'s *"The disk is the point"* — **ext4**, never
NTFS/exFAT (permission model doesn't survive the crossing, and both are case-insensitive while grant
subpaths are matched against a case-sensitive real tree), mounted **by UUID** with `nofail` so a
missing disk degrades to "sharing is broken" instead of stalling the boot at a console.

```sh
lsblk -o NAME,SIZE,TYPE,TRAN,FSTYPE,UUID,MOUNTPOINT
# format the data drive if it isn't already ext4 — confirm the device node first, this is destructive
sudo mkfs.ext4 /dev/sdX1

sudo mkdir -p /srv/vessel
sudo blkid /dev/sdX1     # copy the UUID
```

Add one line to `/etc/fstab`:

```
UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  /srv/vessel  ext4  defaults,noatime,nofail,x-systemd.device-timeout=10  0  2
```

```sh
sudo systemctl daemon-reload
sudo mount -a
findmnt /srv/vessel
sudo chown -R yourname:yourname /srv/vessel
```

Lay it out as siblings, never nested — a shared folder's handle reaches everything under it, so
`installers/` inside `photos/` shares the installers too, silently:

```
/srv/vessel/
    photos/
    invoices/
    installers/
    handover/
```

Keep the labels dull and non-personal — `drives.label` is visible to everyone the folder is shared
with, and it's one of the few fields where you can put personal data into a system that's designed
to hold none of it.

**Getting files onto it**: Samba if you'll drag files over by hand from a desktop (`sudo apt install
samba`, add a `[vessel]` share block to `/etc/samba/smb.conf`, `smbpasswd -a yourname`, restart
`smbd` — this opens TCP 445 on your LAN, fine at home, never forward it to the internet); rsync over
SSH if it'll ever be scripted. Full config is in `docs/pi-sharing-host.md`'s "Getting files onto it"
section, unchanged.

---

## 6. Pair the machine

This step can't be automated on any hardware — `showDirectoryPicker()` requires a real user gesture
and draws its permission prompt outside the page. Plug in a monitor and keyboard once (or use `x11vnc`
tunnelled over SSH the same way the Pi doc describes, if you'd rather not touch the box):

1. Reboot and confirm the kiosk comes up on `https://mcclevarty.ca/share` on its own.
2. Sign in as the operator.
3. Pick the folder under `/srv/vessel`, and give the machine a typed name — never the hostname (§9).
4. When Chromium asks about the permission, choose **"Allow on every visit."** The alternative means
   every reboot, crash, or browser upgrade needs another click from a physical pointer, which turns
   an unattended reboot into a trip to the machine.

---

## 7. Verification

*`./scripts/thinkcentre-setup.sh --verify` runs a version of this and exits non-zero if the host
is not in a state that would survive a reboot. Run it **after** a reboot, having touched nothing.*

Do this **after a reboot**, having touched nothing on the box itself — that's the state it spends
its life in.

```sh
loginctl list-sessions                          # a row on seat0 for your user
loginctl show-session 1 -p Type                  # substitute the real session id — expect x11
loginctl show-user yourname --property=Linger    # Linger=yes
systemctl --user status vessel-kiosk             # active (running)
pgrep -a chromium                                # several processes, --kiosk on the main one

# does it come back when killed?
pkill -f chromium; sleep 10; pgrep -a chromium; systemctl --user status vessel-kiosk

# screen never blanks (X11)
DISPLAY=:0 xset q | grep -A2 "Screen Saver"
DISPLAY=:0 xset q | grep -A2 "DPMS"              # DPMS is Disabled

# the store
findmnt /srv/vessel
touch /srv/vessel/.write-test && rm /srv/vessel/.write-test && echo writable
```

Then check `/machines` from a different signed-in browser and confirm the machine shows as paired
and online.

---

## 8. Hardening the appliance

*The script does this and more — see "The script" above for the firewall, sshd and Chromium
policy it adds.*

```sh
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades   # security updates only, by default — leave it that way
```

```sh
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw enable
```

Don't open anything else unless you set up Samba (§5), and don't forward any of this to the
internet regardless — every port opened here is meant for the LAN only.

---

## 9. Pi-hole or AdGuard Home, as a Docker container on the same box

*`./scripts/thinkcentre-setup.sh --with-pihole` does this, using Debian's `docker.io` rather than
`curl | sudo sh`, and binding the published ports to an address. Read the DNS-slot discussion below
regardless — the secondary is a decision the script cannot make for you.*

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker yourname   # log out and back in for this to take effect

docker run -d --name pihole \
  --restart=unless-stopped \
  -p 53:53/tcp -p 53:53/udp \
  -p 8080:80/tcp \
  -e TZ="Your/Timezone" \
  -v pihole_etc:/etc/pihole \
  -v pihole_dnsmasq:/etc/dnsmasq.d \
  pihole/pihole:latest
```

Give this box a static/reserved LAN address, then point your router's DHCP **primary** DNS setting
at it.

### The secondary DNS slot: run Pi-hole #2 on the old Pi, not a public resolver

Three options exist for the router's secondary DNS field, and they're not equivalent:

1. **A public resolver (Google `8.8.8.8`, Cloudflare `1.1.1.1`).** Works, and if you use one, prefer
   Cloudflare over Google — no strong reason to prefer Google here and Cloudflare logs less. The real
   cost: every time the ThinkCentre is down, DNS quietly falls through to a resolver with **no
   ad-blocking**, for as long as the outage lasts.
2. **Leave it blank.** Don't do this. "Blank" isn't "the router's own sensible default" in any
   guaranteed sense — it's router-firmware-dependent, usually meaning "forward to whatever DNS the
   ISP handed the WAN side," which on some ISPs means NXDOMAIN hijacking or ad injection. That's a
   worse fallback than an explicit public resolver, for no benefit.
3. **A second Pi-hole on the old Pi, as the actual secondary.** This is the one worth doing, since
   you already own the hardware — it's true redundancy with **no ad-blocking gap** during a
   ThinkCentre reboot, instead of a graceful degradation to unfiltered DNS. Install it the same way
   as above (Docker, or Pi-hole's own installer directly on Raspberry Pi OS), point it at the same
   blocklists so the two don't drift too far apart, and set it as the router's secondary. You don't
   need the two instances' blocklists to be byte-identical for this to work — "mostly the same" is
   enough for a home network; tools like Gravity Sync or Nebula Sync exist if you later want them
   kept in lockstep, but that's a nice-to-have, not a requirement to start.

Either way, **do** set an explicit secondary. Two Pi-holes is the recommended setup; a public
resolver as secondary is the acceptable fallback if you'd rather not stand up a second instance.

### Will this break anything your family does?

Pi-hole only intercepts DNS lookups, not the traffic itself, so most of what you listed is
unaffected — but it's worth being specific rather than just saying "should be fine":

- **Games (your brother).** A game resolves a handful of hostnames once at launch/matchmaking, then
  plays over raw IP — DNS blocking adds no latency to gameplay. The occasional real risk is a
  telemetry/analytics domain that's also on a blocklist and happens to be load-bearing for
  login/matchmaking. Stick to Pi-hole's default list (StevenBlack's, well-curated, low false-positive
  rate) rather than piling on aggressive extra lists, and if something breaks, Pi-hole's **Query
  Log** shows exactly what got blocked so you can whitelist that one domain in seconds.
- **IPTV (your parents).** This is the one most likely to actually need attention. Some IPTV
  services — especially informal/reseller ones — route stream manifests or authentication through
  domains that overlap with ad/CDN infrastructure, and an aggressive blocklist can break playback.
  Test IPTV thoroughly right after setup, not weeks later, and go straight to the Query Log if
  something won't play.
- **Torrenting.** Not affected. BitTorrent's "trackers" (coordination servers) and DHT bootstrap
  nodes are a different thing from the ad/privacy "trackers" a blocklist targets — the two rarely
  overlap, and the actual peer-to-peer transfer doesn't touch DNS at all once it's started.
- **VPNs.** A VPN client that pushes its own DNS (most do, specifically to prevent DNS leaks) simply
  bypasses Pi-hole entirely while connected — that device just isn't ad-blocked during that session.
  That's expected behaviour, not a conflict to fix.
- **Tailscale.** Worth knowing about rather than worrying over: Tailscale's admin console has a DNS
  setting where you can push a nameserver to every device on your tailnet, including ones roaming
  outside the house. If you ever want ad-blocking to follow a device off your home network, add the
  ThinkCentre's Tailscale IP there as a global nameserver — but only if the ThinkCentre stays
  connected to that tailnet, and this is entirely optional. Nothing about a normal Tailscale setup
  conflicts with Pi-hole on its own.

The honest summary: turn it on, use the network normally for a few days, and check the Query Log for
anything that looks wrongly blocked rather than trying to pre-empt every case. Pi-hole's admin UI has
a **"Disable for 5 minutes"** button specifically for this — if something seems broken, disable it
briefly, retest, and you'll know in thirty seconds whether Pi-hole is the cause before touching any
configuration.

The admin UI is at `http://vessel-host.local:8080/admin`.

---

## What this guide deliberately doesn't cover

Running the Vessel repo itself on this box — `npm run dev:worker`, wrangler, a local D1 — isn't
needed for anything in this document and isn't part of "the website" this machine's job is to
support. If you want this box to double as a build/deploy machine too, that's a separate, optional
thing worth its own conversation rather than folding into an appliance setup guide.
