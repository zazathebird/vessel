# Building the ThinkCentre host — the actual build, 2026-09-08

`docs/thinkcentre-sharing-host.md` is the guide, written before the machine existed.
**This file is what happened when it was built**, in order, with every wall hit and the
command that got past it. Where the two disagree, this file is newer.

The machine: Lenovo ThinkCentre M93p Tiny, Debian netinst, **the OS on a USB SSD**, username
`user`. Read `docs/thinkcentre-sharing-host.md` for the reasoning; read this for the steps.

---

## The scripts, and the order to run them

All four are in `scripts/`, and also in a Google Drive folder at the root of My Drive
(created 2026-09-08, and **still named "Untitled folderwebsite"** — Drive's rename would not
drive under automation; rename it by hand or ignore it).

| Order | Script | What it is for |
|---|---|---|
| 1 | `debian-basics.sh` | The tools a netinst leaves out, and `/usr/sbin` on your PATH |
| 2 | `plasma-dark-setup.sh` | Plasma, dark, on X11; SDDM with autologin |
| 3 | `claude-code-setup.sh` | Claude Code, `--with-repo` to clone this repo too |
| 4 | `thinkcentre-setup.sh` | The kiosk, firewall, SSH hardening, updates. The host itself |

Open a **new terminal between each**, so `PATH` changes take effect. Run every one as `user`,
never with `sudo` — each calls `sudo` itself where it needs to, and all four put things in
`/home/user` that root would put in `/root`, where the desktop session never looks.

```sh
chmod +x *.sh
./debian-basics.sh
./plasma-dark-setup.sh
./claude-code-setup.sh --with-repo
./thinkcentre-setup.sh https://mcclevarty.ca/share
./thinkcentre-setup.sh --verify      # read-only; run it after a reboot
```

---

## The installer choices that mattered

- **Debian, not Ubuntu**, for Chromium: Debian ships it as a plain apt package with no
  auto-refreshing snap behind it, which is what makes "upgrade on a schedule you choose" mean
  anything. `pi-setup.sh` and `thinkcentre-setup.sh` are both built on that.
- **Tasksel: deselect every desktop.** Keep only *SSH server* and *standard system utilities*.
  The desktop is installed afterwards by `plasma-dark-setup.sh`.
- **No full-disk encryption.** LUKS stops the boot waiting for a passphrase typed at a console,
  which is exactly what an unattended host must never need.
- **GRUB goes on the USB SSD**, the same disk as the OS — not the installer stick. Afterwards,
  put that disk first in the BIOS boot order.
- Guided partitioning, plain ext4, no LVM.

---

## The four walls, and how to get past them

### 1. `sudo` said "user is not in the sudoers file"

Setting a root password during the install makes Debian *skip* adding your user to the `sudo`
group. Nothing is broken; the group is simply empty.

```sh
su -                       # the trailing dash matters, see below
apt update
apt install -y sudo git curl
/usr/sbin/usermod -aG sudo user
exit
```

Then **log out and back in** — group membership is read at login — and check with `groups`
and `sudo -v`.

### 2. `usermod`, `ip`, half the admin tools: "command not found"

They are installed. Debian keeps them in `/usr/sbin` and `/sbin`, and a normal user's `PATH`
does not include either. Two ways past it, and you want both:

- Immediately: call them by full path, `/usr/sbin/usermod`.
- Permanently: `su -` rather than `su` (the dash gives root its own PATH), and run
  `debian-basics.sh`, which appends `/usr/sbin:/sbin` to your PATH in `.bashrc` and `.zshrc`.

### 3. `./script.sh` said "command not found"

A bare name is looked up on `PATH`, which never includes the current directory. It needs the
`./`, and the file needs to be executable:

```sh
chmod +x thinkcentre-setup.sh
./thinkcentre-setup.sh
```

If the error instead names `/bin/bash^M`, the file picked up Windows line endings on the way:
`sed -i 's/\r$//' thinkcentre-setup.sh`.

### 4. The root filesystem is on a USB disk

This is how the host is built and it works, but **USB autosuspend can drop the bus under an
idle disk, and a root that goes away is a hung box.** `thinkcentre-setup.sh`'s preflight detects
it and names the fix without applying it, because this project never edits a boot line:

```sh
sudo nano /etc/default/grub      # add usbcore.autosuspend=-1 to GRUB_CMDLINE_LINUX_DEFAULT
sudo update-grub
sudo reboot
```

Keep that disk on its own port, never on a hub something else gets unplugged from.

---

## Plasma instead of XFCE — what changed, and why X11

The guide and `thinkcentre-setup.sh` assume **XFCE + LightDM**. Running Plasma is fine; two
things move, and `plasma-dark-setup.sh` handles both.

**The display manager.** Plasma brings SDDM, and `thinkcentre-setup.sh` only knows LightDM
(with a gdm3 fallback), so its autologin step warns and skips. `plasma-dark-setup.sh` writes
`/etc/sddm.conf.d/10-vessel.conf`, sets the autologin, and switches
`/etc/X11/default-display-manager` if something else holds it. **That warning from
`thinkcentre-setup.sh` is expected on this box and is not a failure.**

**X11, not Wayland**, and this is a decision rather than a preference — Plasma is equally
themeable on both:

1. The kiosk launcher blanks the screen with `xset` and hides the cursor with `unclutter`.
   Both are X11-only and **fail silently under Wayland**. A kiosk whose screen blanks itself is
   the one behaviour an always-on host cannot have.
2. Remoting in means viewing **the session that is already running**. On X11 that is `krfb` and
   it works; on Wayland it goes through a PipeWire portal whose prompt has to be clicked on the
   machine you are not standing at.

If the launcher is ever rewritten for Wayland, redo this decision then.

---

## The kiosk browser has to stay running

There is no server process on this box. **The Chromium tab *is* the file-sharing agent**: it
holds the directory handle the folder picker granted, keeps the signalling socket open so the
site can report the machine as online, and serves each browse over WebRTC straight from the
page. Close it and the machine goes offline within seconds; the systemd user service will
restart it, which is the point.

To get it out of your way without closing it, put it on another virtual desktop — Ctrl+F2, or
Ctrl+Alt+Right. **Do not** disable the service.

**To see that screen remotely, use `krfb`**, which shares the running session. An RDP server
starts a *second* session and you would never see the kiosk window at all.

```sh
sudo apt install krfb
sudo ufw allow from 192.168.0.0/16 to any port 5900 proto tcp   # LAN only, never forward it
```

---

## The trade this box is making

The Chromium managed policy locks down **the browser**, not the desktop. A full Plasma session
on autologin means anyone at the keyboard has your desktop and, one terminal away, `sudo`.
Keep the account password set and passwordless `sudo` off; `thinkcentre-setup.sh`'s preflight
warns about both. That is the accepted trade for a machine you also want to customise and
remote into — it was an appliance in the original design.

---

## Still to do on this machine

1. Run the four scripts and then `--verify` after a reboot. **Anything `--verify` flags is the
   first thing to fix** — the setup script has never run on real hardware before this build.
2. Add `usbcore.autosuspend=-1` and reboot (above).
3. Pair the machine: sign in on `mcclevarty.ca`, `/share`, pick the folder. **The Chromium
   profile is the pairing** — the handle lives in its IndexedDB, so never launch the kiosk with
   `--user-data-dir` or `--incognito`, and never delete that profile.
4. **Does Raspberry Pi OS auto-upgrade Chromium under a running kiosk?** Open question for the
   *Pi*, not this box; `pi-setup.sh` says it cannot happen and that is unverified.
5. The phase-2 walkthrough by eye — pairing, drive picking, a real two-tab WebRTC browse and
   download — has still never been done. This machine is what it needs.
