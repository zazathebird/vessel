# The Raspberry Pi sharing host

## What this machine is, and what it is not

Vessel's sharing agent is not a program you install. Per `design/SPEC-ACCOUNTS.md` §8 it is a
browser tab, opened on the machine that holds the files, holding a directory handle from
`showDirectoryPicker()`, a WebSocket to the signalling service, and a WebRTC data channel that
serves file reads directly to whoever you granted access. That design buys the project a great deal
— no installer, no code-signing certificate, no second implementation of grant verification in
another language — and §2 records the two things it costs: **the tab has to stay open**, and
**the sharer has to be on a Chromium browser**. This machine is the answer to the first cost. It is
a cheap computer that is always on, whose entire job is to keep one browser tab open and to hold
the disk that tab is serving from.

It is not a server in any sense worth defending. Nothing on it listens on the network unless you
turn something on yourself, and nothing on it is reachable from the internet. It is a machine with
a folder on it and a tab looking at that folder.

**The last step has somewhere to point now: phase 2 shipped on 2026-08-14.** `/share` is live —
sign in on the Pi's Chromium, open it, pair the machine (it asks for the account password; give
the machine a typed name, never the hostname), pick the folder on the SSD, and leave the tab
open. `/machines` from any other signed-in browser is where the drive is browsed. Pairing
survives reboots via the browser profile; if the profile ever loses its storage, the re-pair
flow on `/share` is routine (SPEC-ACCOUNTS.md §12 O). The rest of this document — storage,
mounting, always-on, getting files onto it — is unchanged and still comes first.

---

## The disk is the point

Read this section before buying anything, because it changes what you are shopping for.

The obvious reading of "always-on sharing host" is that the Pi holds a tab open and the files live
on the desktop machine. On this deployment that reading is wrong. The desktop is switched on
briefly, when files are needed before leaving the house; the Pi is on essentially always. So the
Pi is not a proxy for the desktop — **the Pi is where the shared files live.** A USB SSD hangs off
it, that SSD is the store, and the sharing tab serves from a folder on it.

### The trap this exists to avoid

The tempting shortcut is to mount the desktop's shared folder on the Pi over SMB or NFS, point the
sharing tab at the mount, and feel clever. Do not do this. When the desktop is off, the mount is
dead, and the folder the browser is enumerating either hangs or returns nothing. You have then
reproduced exactly the availability problem the Pi was bought to solve, with a layer of indirection
on top of it — and that indirection is the real damage. Instead of "my desktop is off, so my files
are not available", which is a sentence anybody understands, the failure arrives at a distance as a
folder that lists empty, a transfer that stalls, or an operation that never returns. It looks like
a bug in Vessel. Somebody will spend an evening on it.

Files flow *to* the Pi. The Pi serves them. If the desktop is off while you are copying files to
the Pi, nothing is affected but the copying, which is the direction you want the fragility to point.

### Filesystem: ext4, and not the obvious alternatives

Format the SSD **ext4**. The two formats a Windows desktop would suggest are both wrong here for
specific reasons rather than out of Linux partisanship:

- **NTFS** works on Linux, but the permission model does not survive the crossing. The whole volume
  gets a single uid and gid from the mount options, so file ownership is a fiction, and the
  `ntfs-3g` path costs measurable CPU on a Pi for a workload that is all directory enumeration and
  sequential reads. The kernel's newer `ntfs3` driver is better but still not what you want under a
  process that will read the same tree for months without a fsck.
- **exFAT** has no permissions at all and no journal. A machine that loses power — and an always-on
  machine on a shelf will, eventually — is exactly the machine you do not want on an unjournalled
  filesystem.

The case sensitivity difference is the one that will bite in a way that looks like a Vessel bug.
Both NTFS and exFAT are case-insensitive as mounted, and ext4 is case-sensitive. A grant scoped to
a relative subpath (§9: grants store relative subpaths, never absolute ones) resolves against the
real directory tree, and `Invoices` and `invoices` being the same directory on one machine and two
on another is the kind of difference that produces a scoping check that passes on the developer's
machine and fails on yours. Use ext4 and the question does not arise.

### Mounting it so that it stays mounted

Two things matter, and the second one is the one people learn the hard way.

**Mount by UUID, not by device node.** `/dev/sda1` is assigned in the order the kernel enumerates
USB devices. Plug in a memory stick to copy something over, reboot with it still attached, and your
SSD is now `/dev/sdb1` and your fstab entry points at the memory stick. UUIDs belong to the
filesystem and do not move.

Find the UUID:

```sh
lsblk -o NAME,SIZE,TYPE,TRAN,FSTYPE,UUID,MOUNTPOINT
```

Make a mount point and write the fstab entry:

```sh
sudo mkdir -p /srv/vessel
sudo blkid /dev/sda1          # confirm the UUID for the partition you actually mean
```

Then add one line to `/etc/fstab`, substituting your own UUID:

```
UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  /srv/vessel  ext4  defaults,noatime,nofail,x-systemd.device-timeout=10  0  2
```

The options, each for a reason:

- **`nofail`** is not optional and it is the whole reason this paragraph exists. Without it, a disk
  that is missing, unplugged, or has failed its own self-test turns the boot into a boot that stops
  and waits at a console prompt. On a machine with a monitor that is an annoyance. On a headless
  machine on a shelf it is a machine that no longer answers SSH, for a reason you cannot see, and
  the only route back in is a monitor and a keyboard you probably have to go and find. `nofail`
  makes a missing disk mean "the folder is empty and sharing is broken", which is recoverable over
  SSH at leisure.
- **`x-systemd.device-timeout=10`** bounds how long the boot waits for the device to appear before
  giving up on it. USB enumeration is not instant and the default timeout is ninety seconds, which
  is a long time to stare at nothing.
- **`noatime`** stops the kernel writing an access timestamp every time a file is read. On a
  machine whose job is reading files, that is a write per read avoided, and access times are not
  information anyone here wants.

Apply and confirm without rebooting:

```sh
sudo systemctl daemon-reload   # systemd generates mount units from fstab; it needs telling
sudo mount -a
findmnt /srv/vessel
```

Then give yourself ownership, so the browser — running as your user — can actually read the tree:

```sh
sudo chown -R "$USER:$USER" /srv/vessel
```

### A layout, decided before there is anything in it

§8 says a machine may expose several folders, and each one is its own row in `drives` with its own
label. That is worth designing around now, because reorganising later means moving directories that
grants already point at, and a grant scopes by relative subpath (§9). Moving a folder after a grant
exists breaks the grant in a way that is only recoverable by revoking and reissuing.

So: **one directory per thing you intend to share, all of them siblings, none of them nested inside
another.**

```
/srv/vessel/
    photos/
    invoices/
    installers/
    handover/
```

Sibling rather than nested matters because a handle is issued to a folder and everything under it
is inside that handle's reach. A folder you share is a folder someone can enumerate to the bottom
of. If `installers/` sits inside `photos/`, then sharing `photos/` shares the installers too, and
the person you shared with will not tell you, because from their side nothing looks unusual.

Keep the names dull and non-personal. `drives.label` is typed by the owner and it is visible to
everyone the folder is shared with; §9's inventory is explicit that the project does not store
personal data, and a label is one of the few fields where you can undermine that yourself. "Client
files" is fine. Somebody's name is not.

### Getting files onto it

Two sensible options, and this direction is the safe one — the Pi is the destination, and if the
source machine is off, nothing is broken but the copying.

**Samba, if you want the Pi to appear as a network drive in Windows Explorer.** This is the option
to pick if files will be dragged over by hand, occasionally, from a desktop. It is not installed by
the setup script and that is deliberate: Samba listens on the network, and the script does not open
ports without being asked.

```sh
sudo apt install samba
sudo smbpasswd -a "$USER"      # a Samba password, separate from the Linux one
```

Then add a share to the end of `/etc/samba/smb.conf`:

```
[vessel]
   path = /srv/vessel
   browseable = yes
   read only = no
   valid users = YOUR_USERNAME
   create mask = 0644
   directory mask = 0755
```

```sh
sudo systemctl restart smbd
```

Understand what you have just done: TCP 445 is now open on your LAN, authenticated by a password
you just set. That is acceptable on a home network and it is not acceptable on a network you do not
control, and it should never be exposed to the internet — do not forward a port to it, whatever a
forum post says.

**rsync over SSH, if the copying will ever be scripted or repeated.** No new listening port at all,
because it rides the SSH you already have, and it copies only what changed:

```sh
rsync -av --progress /source/folder/ vessel-host.local:/srv/vessel/photos/
```

The recommendation: **Samba if a human is dragging files, rsync if a machine is.** Most people want
Samba on this box, because the point of the Pi is that you interact with it rarely and by hand.

### Backups, stated plainly

If the Pi's SSD holds the only copy of these files, then a dead SSD is those files gone. That is the
whole statement and there is no version of it that is softer. Vessel holds no server-side copy by
design — §2 is explicit that availability is tied to the owner's machine and that there is no
fallback — so nothing in this project will notice, mitigate, or warn you about a disk that has
stopped working.

SSDs fail less dramatically than SD cards but they do fail, and the ones that fail without warning
tend to be the ones running unattended in a warm plastic case. If the material on this disk exists
elsewhere — if it is a copy of what is on the desktop machine — then the Pi is a cache and you have
nothing to do. If it does not, then this disk needs a backup, and the honest options are a second
USB disk with a weekly `rsync` to it, or a cloud target, and you should pick one before you put
anything on the Pi that only exists on the Pi.

---

## Assumptions this document makes

Stated up front so you can check them against what is on your desk before you spend an evening.

- **A Raspberry Pi 4 or Pi 5, with at least 2GB of RAM.** A Pi Zero 2 W or a Pi 3 is not adequate,
  and the reason is specific rather than snobbery. The workload is a full Chromium session that has
  to survive for weeks, and Chromium with one page open sits well above the Zero 2 W's 512MB before
  anything is shared. The Pi 3 has 1GB, which fits, but leaves the machine swapping continuously to
  whatever the root filesystem is; the visible outcome is not a crash, it is the OOM killer picking
  a process, and the process it picks on this machine is nearly always the browser. A host that
  looks up and is not sharing is the worst failure mode available here, because nothing on the Pi
  looks wrong. The setup script warns and continues on these boards rather than refusing, because
  you may be testing rather than deploying.
- **Raspberry Pi OS (64-bit), Bookworm, Desktop edition — not Lite.** Chromium is a graphical
  application, the File System Access API only exists inside a real browser, and there is no
  headless substitute: `showDirectoryPicker()` needs a user gesture and its permission prompt is
  drawn by the browser outside the page, so somebody has to click it once with a real pointer. A
  framebuffer with no way to answer that prompt gets you a machine that can never be paired. 64-bit
  because Chromium's 32-bit builds carry a per-process address-space ceiling that a long-lived tab
  can reach, and because it is now the default image anyway.
- **Headless after setup.** A monitor for the first boot is convenient but not required — the
  Imager pre-seeds everything — and after setup this machine is reached over SSH, plus VNC for the
  one-off moments that need a pointer.
- **Wired Ethernet if you can.** Wi-Fi works, and the script disables the radio's power saving
  because a radio that sleeps between beacons will drop the idle WebSocket the sharing tab holds
  open. But the failure mode of Wi-Fi on an unattended machine is a host that pings fine and reports
  itself offline to everyone trying to reach it, and a cable removes the whole class of problem.

---

## Hardware checklist

- Raspberry Pi 4 (2GB or more) or Pi 5 (any).
- **The official power supply**, or one equal to it. This is not the place to reuse a phone charger.
  An undervolted Pi does not stop, it throttles and corrupts, and on a machine nobody looks at, both
  symptoms arrive as "sharing broke sometimes". Check for undervoltage after a week with
  `vcgencmd get_throttled`, which should return `throttled=0x0`.
- **A USB SSD for the store.** See "The disk is the point" above. Prefer a powered enclosure or a
  drive known to be modest about current draw — a bus-powered spinning disk on a Pi 4 is a reboot
  loop waiting for a busy moment. On a Pi 5, an NVMe HAT is neater than a USB enclosure and one
  fewer cable to be knocked out.
- **Boot from the SSD too, if you can.** The SD card is fine for a machine that boots occasionally
  and does little; it is a poor choice for one that runs a browser continuously. Chromium writes its
  profile, its cache, and — this is the one that matters — the IndexedDB entry holding your
  persisted directory handle. SD cards wear out from writes and they fail quietly, as corruption,
  which on this machine means a handle that silently stops working. Raspberry Pi Imager writes to a
  USB SSD exactly as it writes to a card, and a Pi 4 or 5 will boot from USB out of the box.
- **A case with some airflow.** A closed plastic box on a shelf in summer is a throttled Pi.
- **PoE, if the network is already there.** A PoE HAT on a Pi 4, or the Pi 5 PoE+ HAT, gets power
  and network down one cable and — the actual benefit — puts the Pi's power on whatever UPS your
  switch is on. A power cut then takes out the Pi and the switch together rather than the Pi alone,
  which is a cleaner failure than a Pi that comes back before its network does.
- **An HDMI dummy plug**, if you will run with no monitor attached. Cheap, and it removes an entire
  category of problem — see "Running with no monitor attached" below.
- Whatever the Pi must never do is sleep or suspend. A machine that sleeps stops sharing, without
  any indication to the person who tried to reach it. Raspberry Pi OS does not suspend by default
  and nothing in this guide enables it; if you have inherited an image that does, that is the first
  thing to undo.

---

## Installing the OS

Use **Raspberry Pi Imager** on your desktop machine. The reason to use it rather than writing an
image by hand is its advanced options: it pre-seeds the configuration into the boot partition, so
the machine comes up correct on first boot with no monitor and no keyboard ever attached.

1. Choose **Raspberry Pi OS (64-bit)** under "Raspberry Pi OS (other)" if it is not the top-level
   default. Confirm it says *Desktop*, not *Lite* — Lite is the one that will waste your evening,
   and the setup script refuses to run on it for that reason.
2. Choose your storage: the SSD if you are booting from it, otherwise the card.
3. Open the advanced options (the gear icon, or the "Edit settings" prompt) and set:
   - **Hostname.** Something you will type often over SSH. `vessel-host` is a reasonable default and
     this document assumes it; the machine is then `vessel-host.local` on the LAN via mDNS. Note
     that this hostname is a *network* name and has nothing to do with `machines.name` in Vessel —
     §9 is explicit that machine names in the account system are typed by the owner and never taken
     from a hostname, precisely because default hostnames tend to contain somebody's actual name.
   - **Enable SSH**, with password authentication for now, or with your public key if you have one
     to paste. Key authentication is better and you can switch to it later.
   - **Username and password.** Do not use `pi`. This is the account the kiosk service, the browser
     profile and the directory handle all belong to, so pick a name you are content to see in file
     paths for years.
   - **Wi-Fi credentials and country**, if there is no cable. The country is not optional and a
     wrong one gets you a radio that will not associate on some channels.
   - **Locale and timezone.** Set the timezone properly. Every timestamp you will ever read while
     debugging this machine — journal entries, `last_seen` values — is easier with a correct clock.
4. Write, wait, and put the medium in the Pi.

## First boot, over SSH

Give it two or three minutes on the first boot; it resizes its filesystem and reboots itself once.

```sh
ssh yourname@vessel-host.local
```

If mDNS does not resolve — some networks strip it — find the address on your router, or:

```sh
ping vessel-host.local
```

Then, before anything else:

```sh
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

Do the full upgrade now rather than later. A fresh image is usually months behind, and doing it
first means the setup script installs Chromium at the current version rather than installing an old
one and immediately replacing it.

After it comes back, get the repository onto the machine — or at least the script:

```sh
sudo apt install -y git
git clone https://github.com/YOUR_ACCOUNT/YOUR_REPO.git ~/project/website
```

If you would rather not clone the whole site onto the sharing host, copying `scripts/pi-setup.sh`
across with `scp` is entirely sufficient; the script does not read anything else from the repo.

## Then run the script

```sh
cd ~/project/website
chmod +x scripts/pi-setup.sh
./scripts/pi-setup.sh
```

It refuses to run as root and calls `sudo` itself where it needs to, so run it as your normal user
and expect a password prompt early. It takes a few minutes, mostly Chromium.

What it does, in order: checks the hardware, the OS release and the storage; installs Chromium and
a short list of supporting packages; sets the boot behaviour to desktop-with-autologin; disables
screen blanking on every mechanism Bookworm might be using; writes a kiosk launcher and a systemd
**user** service that restarts it whenever it dies; enables lingering so that service starts at boot
without anyone logging in; turns on unattended security updates; and disables Wi-Fi power saving if
you are on Wi-Fi. It finishes by printing a summary of everything it configured, everything it
deliberately did not, and the commands to verify each piece.

Re-running it is safe and is meant to be routine. Every step checks before it acts, so a run that
died halfway through an apt install can simply be run again. The one thing it will not overwrite is
`~/.config/vessel-kiosk/url` — if you have set a real URL there, a later run leaves it alone.

To point it somewhere other than the placeholder:

```sh
./scripts/pi-setup.sh https://example.invalid/wherever
# or
VESSEL_KIOSK_URL=https://example.invalid/wherever ./scripts/pi-setup.sh
```

The default is `about:blank`, deliberately. The sharing page does not exist yet and pointing the
kiosk at a URL that 404s makes a working host look broken.

Reboot when it finishes. That reboot is the first real test: autologin, session, lingering, service
and browser all have to come up with nobody helping, and if any link in that chain is wrong this is
when you find out.

---

## What has to be done by hand, and why

**Picking the folder.** This is the one step that cannot be automated at all, and the reason is
structural rather than incidental: `showDirectoryPicker()` requires a user gesture, and the folder
picker and its permission prompt are drawn by the browser, outside the page, where no script can
reach them. When phase 2 ships, you will connect a pointer to this machine once — over VNC, or with
a mouse and monitor plugged in temporarily — open the sharing page, pick the folder under
`/srv/vessel`, and answer the prompt.

**When you answer it, choose "Allow on every visit" if Chromium offers it.** The alternative
("Allow this time") means the handle survives in IndexedDB but the *permission* does not, so every
Chromium restart — every reboot, every crash, every browser upgrade — needs another click from a
pointer. On an unattended machine that converts a two-minute reboot into a trip to the shelf. Note
that §12's open questions include exactly how durable the persisted handle turns out to be in
practice: browser storage eviction, profile clearing and policy changes can all revoke it silently,
and the re-pairing path has not been designed yet. Expect to re-pair occasionally and do not be
alarmed by it.

**VNC, if you want it.** The setup script does not enable VNC and does not open any port, because
nothing on this machine should start listening without you deciding it should. If you want it:

```sh
sudo raspi-config nonint do_vnc 0     # enable
sudo raspi-config nonint do_vnc 1     # disable again afterwards
```

The better habit is to leave VNC off and tunnel it over SSH for the few minutes you need it, so
nothing is exposed to the LAN at all. Enable it, then from your desktop:

```sh
ssh -L 5900:localhost:5900 yourname@vessel-host.local
```

and point the viewer at `localhost:5900`. Disable it again when you are done.

**Running with no monitor attached.** A Pi with nothing in the HDMI socket may bring up a session
with no outputs, and what a browser does with no output to draw on ranges between "works fine" and
"starts and renders nothing", depending on compositor and version. Two fixes:

- **An HDMI dummy plug.** Costs very little, works on every model and every compositor, and needs no
  configuration. This is the recommendation.
- **Forcing a mode in software**, if you would rather not have a dongle. On Pi 4 and Pi 5 with the
  KMS driver — which is the Bookworm default — the old `hdmi_force_hotplug` setting in
  `config.txt` no longer does anything, and the mechanism is a kernel command line option instead.
  Append this to the single line in `/boot/firmware/cmdline.txt` (it is one line; do not add a
  second):

  ```
  video=HDMI-A-1:1920x1080@60D
  ```

  The trailing `D` forces the output enabled with no display connected.

The setup script does not touch either file on purpose. A malformed `cmdline.txt` is a Pi that does
not boot, recoverable only by pulling the medium and editing it on another machine, and that is not
a risk worth taking automatically on a machine whose whole selling point is that you never have to
go and touch it.

**Chromium upgrades.** Unattended upgrades are enabled but restricted to Debian's security origins,
which does not include the Raspberry Pi archive that Chromium comes from. That is deliberate: an
automatic Chromium upgrade replaces the binary under a running browser, and the restart that
follows happens at a time nobody chose, possibly mid-transfer. Do it by hand, on a schedule you
actually keep, and confirm the tab came back afterwards:

```sh
sudo apt update && sudo apt full-upgrade
systemctl --user status vessel-kiosk
```

This trade cuts both ways and it is worth being honest about: a browser you upgrade manually is a
browser that is sometimes out of date, and browsers are where the vulnerabilities are. Monthly is a
defensible rhythm. Never is not.

---

## Verification

This section matters more than the installation section. Installing things is easy to do and easy
to believe you have done; the entire value of this machine is that it keeps working while nobody is
looking at it, and the only way to know it will is to check each link in the chain separately.

Do all of this **after a reboot**, having touched no keyboard on the Pi itself, because that is the
state the machine spends its life in.

### Did a desktop session start on its own?

```sh
loginctl list-sessions
```

You want a row for your user on `seat0`. That is the ground truth for autologin regardless of which
display manager your image uses. Then take the session id from that row and ask what kind it is:

```sh
loginctl show-session 1 -p Type      # substitute your session id
```

`Type=wayland` on a Pi 4 or 5 with a current Bookworm image, `Type=x11` on older hardware or an
older image. Note which you have, because the troubleshooting below branches on it. If no session
is listed at all, autologin did not work and nothing downstream will, so fix that first.

### Is lingering on?

```sh
loginctl show-user "$USER" --property=Linger
```

`Linger=yes`. If it says `no`, the kiosk service will only run while somebody is logged in, which
on a machine like this means it will work in testing and fail in the field.

### Is the service up?

```sh
systemctl --user status vessel-kiosk
```

`Active: active (running)`, with a `Main PID` pointing at the launcher. The last journal lines
shown should include `vessel-kiosk: Display ready (wayland)` or `(x11)`.

If it is `activating (auto-restart)`, the browser is crash-looping. If it is `inactive (dead)` with
no error, the most likely cause is lingering being off or the unit not being enabled.

### Is the browser actually running?

```sh
pgrep -a chromium | head
```

Several processes — a main one plus its renderer and GPU helpers. The main one should show your
kiosk flags on its command line, including `--kiosk` and the URL from
`~/.config/vessel-kiosk/url`.

### Does it come back when it dies?

This is the check that matters most, and it is the one that gets skipped.

```sh
pkill -f chromium
sleep 10
pgrep -a chromium | head
systemctl --user status vessel-kiosk
```

Chromium should be running again within about five seconds of being killed, and the status output
should show a restart. If it does not come back, `Restart=always` is not doing its job and you have
an unattended machine that stops sharing the first time the browser hiccups.

### Does it survive a reboot?

```sh
sudo reboot
# wait, then reconnect
systemctl --user status vessel-kiosk
uptime
```

`uptime` low, service running. This subsumes every check above and it is worth doing twice, some
days apart, because the failure that only appears on the second reboot is usually a file written
into `/tmp` or a permission that only existed in the session you set things up in.

### Is the display staying awake?

Under X11, from an SSH session:

```sh
DISPLAY=:0 xset q | grep -A2 "Screen Saver"
DISPLAY=:0 xset q | grep -A2 "DPMS"
```

`timeout: 0` and `cycle: 0` for the screensaver; `DPMS is Disabled`.

Under Wayland the answer is different and `xset` is not the tool — it will report on XWayland,
which is not what is drawing your output. Check that nothing is running an idle timer:

```sh
pgrep -a swayidle
```

Nothing should come back. On a labwc image the idle timer is swayidle, started from the session
autostart, and the setup script comments that line out of your user copy at
`~/.config/labwc/autostart`. If `pgrep` finds it anyway, look in that file — and if the line is not
there either, your image starts the idle timer some other way and this is the moment to find out
how. If `wlr-randr` is installed, it will show the output's current state:

```sh
wlr-randr
```

On a wayfire image, check the settings landed:

```sh
grep -A3 '^\[idle\]' ~/.config/wayfire.ini
```

`dpms_timeout = -1` and `screensaver_timeout = -1`.

### Is the store mounted, and does it have what you think?

```sh
findmnt /srv/vessel
ls -la /srv/vessel
touch /srv/vessel/.write-test && rm /srv/vessel/.write-test && echo "writable"
```

`findmnt` should show your SSD's device and `ext4`. If the mount is missing after a reboot and
nothing else is wrong, check that the fstab line is by UUID rather than by device node.

### Is the power supply adequate?

```sh
vcgencmd get_throttled
```

`throttled=0x0`. Anything else means undervoltage or thermal throttling has happened since boot,
and the bits are documented in the Raspberry Pi documentation. Check this once a week for the first
month; a Pi that throttles under load is a Pi whose problems will be blamed on the software.

---

## Troubleshooting

### The tab died and sharing stopped

First establish whether the browser is running at all (`pgrep -a chromium`) and then whether the
service thinks it should be (`systemctl --user status vessel-kiosk`). Three distinct situations
hide behind "sharing stopped":

- **The browser is not running and the service is failed.** Read `journalctl --user -u vessel-kiosk
  -n 100 --no-pager`. The launcher logs why it gave up.
- **The browser is running but the page is not the sharing page.** This is the quiet one. Something
  navigated away, or the page crashed and left the tab on an error. Nothing on the machine looks
  wrong. `systemctl --user restart vessel-kiosk` fixes it; if it recurs, that is worth
  investigating rather than papering over with a scheduled restart.
- **The browser is running, the page is up, and it still says offline.** Now suspect the network —
  the WebSocket to the signalling service, or Wi-Fi power saving if you are wireless. §12's first
  open question is exactly this: a grantee hitting a closed or disconnected tab should be told "that
  machine is offline" rather than shown a generic failure, and the wording for that has not been
  designed yet.

### The Pi rebooted and did not come back

Reach it over SSH first. If SSH answers, the boot completed and the problem is in the session, so
work down the verification list from `loginctl list-sessions`.

If SSH does not answer, and the machine has power, the two likely causes are both boot-time. A
filesystem in the fstab that is missing and does not have `nofail` will stop the boot dead and wait
at a console — which is precisely why that option is in the fstab line above, and the first thing
to check if you wrote the line yourself. The other is a corrupted filesystem on a worn SD card,
which is the argument for booting from the SSD.

Attach a monitor. It is the only diagnostic left at this point, and this is when you find out that
having kept an HDMI cable near the machine was worth it.

For a machine that hangs rather than reboots, the hardware watchdog is worth enabling. Add
`dtparam=watchdog=on` to `/boot/firmware/config.txt` and set `RuntimeWatchdogSec=15` in
`/etc/systemd/system.conf`, and a hung kernel reboots itself instead of sitting there. Do this by
hand and knowingly, since it edits `config.txt`.

### The handle lost permission

The symptom is that the sharing page loads but reports that it can no longer read the folder, or it
asks you to pick it again. This is expected behaviour occasionally rather than a fault. Chromium can
evict site storage under pressure, a profile clear removes it outright, and permission can lapse if
it was granted for the session rather than persistently.

The fix is to re-pick the folder with a pointer, and to choose "Allow on every visit" this time. If
it happens repeatedly, check that the profile is not being reset: the launcher deliberately does not
pass `--user-data-dir` or `--incognito`, and if either has been added to it, the handle is being
thrown away on every start by design. §12 records that the re-pairing path needs to be routine and
cheap and has not been designed yet, so for now this is a manual visit.

### Screen blanking came back

Something re-enabled it, and there are only a few candidates. Work out which session type is live
(`loginctl show-session <id> -p Type`) and check that path specifically — the settings for the other
path are inert and will look fine while the screen goes dark anyway, which is exactly how an hour
gets wasted here.

The common causes, in order of likelihood: an OS update replaced `/etc/xdg/labwc/autostart` and your
user copy at `~/.config/labwc/autostart` is now stale in some other respect, or was removed; wayfire
rewrote `~/.config/wayfire.ini`; `xscreensaver` got installed as a dependency of something else. Re-
running `./scripts/pi-setup.sh` reapplies all three paths and is the cheapest first move.

### The browser was updated and restarted

An upgrade to the Chromium package replaces the binary underneath the running process. Sometimes it
keeps running until restarted, sometimes it dies immediately; either way `Restart=always` brings it
back, and the profile — including the directory handle — survives, because the profile is not part
of the package.

What does *not* survive automatically is the tab's connection to whoever was reading from it at the
time. Restart the service explicitly after any upgrade so the restart happens when you are watching:

```sh
sudo apt update && sudo apt full-upgrade
systemctl --user restart vessel-kiosk
systemctl --user status vessel-kiosk
```

If the browser comes back showing a "Restore pages?" bubble instead of the sharing page, the crash-
flag reset in the launcher did not run — most likely `jq` is missing, or the Preferences file was
not there yet on a fresh profile. `journalctl --user -u vessel-kiosk` will say. This is the failure
worth being most alert to, because the machine looks perfectly healthy while it is not sharing
anything.

---

## What changes when phase 2 ships

Nothing on this machine has to be rebuilt. Three things get done, in this order:

1. **Point the kiosk at the sharing page.** Put the real URL in `~/.config/vessel-kiosk/url` and
   `systemctl --user restart vessel-kiosk`. §10 names `/share` as the intended route, and the
   correct URL is whatever the deployed site actually serves at the time — take it from the release
   rather than from this document, which is guessing.
2. **Pair the machine and pick the folders.** Once, with a pointer. Each folder under `/srv/vessel`
   that you intend to expose becomes its own `drives` row with its own label (§8 — a machine may
   expose several), and this is where the layout decided earlier pays for itself. The pairing screen
   asks you to type a name for the machine and deliberately suggests nothing, because §9 forbids
   taking it from the hostname: default hostnames contain people's names and that is personal data
   nobody chose to provide. Nothing you type here is a filesystem path — the server never learns
   where the folder is, only what you called it.
3. **Watch it for a week.** The properties that matter on this machine are all properties over time.
   The tab is still open on day seven, the handle still has permission, the SSD is still mounted,
   `vcgencmd get_throttled` is still `0x0`.

Phase 3 adds granting to other people, and it changes nothing about this host — the same tab serves
the same folders, and the difference is on the other side of the connection. §7 is explicit that
phases 2 and 3 stay separate because phase 2's failure mode is "my own files do not load" and phase
3's is "a stranger read my files", and this machine is where both of those would happen. It is worth
having been boring and correct here before then.
