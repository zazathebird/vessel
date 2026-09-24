# Building the ThinkCentre host — the actual build, 2026-09-08

`docs/thinkcentre-sharing-host.md` is the guide, written before the machine existed.
**This file is what happened when it was built**, in order, with every wall hit and the
command that got past it. Walls 5 and 6 were found on 2026-09-08 after the four scripts had
all run and the machine looked finished; **wall 7 was found later the same day, after walls 5
and 6 had been fixed and the machine looked finished again.** Where the two disagree, this file is newer.

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

## The seven walls, and how to get past them

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

### 5. The desktop came up on Wayland, and nothing said so

The single most important thing this build got wrong, and it is invisible: **`plasma-dark-setup.sh`
installed the desktop but its SDDM half did not take.** `/etc/sddm.conf.d/` was absent,
`/etc/X11/default-display-manager` still read `/usr/sbin/lightdm`, and `thinkcentre-setup.sh`'s own
autologin drop-in said `autologin-session=xfce`. So the box autologged into XFCE, somebody started
Plasma by hand, and Plasma started under **Wayland** — where `xset` and `unclutter` are silent
no-ops and the kiosk's screen blanks itself, which is the one thing an always-on host must not do.

Everything looked right while it was wrong. The kiosk was running, `unclutter` was in the process
tree, and `--verify` said nothing, because none of that is what those tools report on. **Check it
with three commands, not by looking at the screen:**

```sh
echo "${XDG_SESSION_TYPE}"                  # want: x11
cat /etc/X11/default-display-manager        # want: /usr/bin/sddm
cat /etc/sddm.conf.d/10-vessel.conf         # want: DisplayServer=x11, Session=plasmax11
```

Re-running `./plasma-dark-setup.sh --no-install` writes all three. It takes effect at the reboot,
not before.

### 6. `--verify` cried wolf about the firewall and sshd

The first `--verify` on real hardware reported two FAILs: `firewall active` (blank) and
`sshd refuses root login` (`no`). **Both were false.** ufw was active and the sshd drop-in was in
force; the two checks are the only ones that shell out to `sudo`, they were run without a cached
credential, and an empty answer is not the expected answer. A check that says *the firewall is off*
when it means *I could not look* is worse than no check — and it was the first thing this machine
was ever told about itself.

Fixed the same day: `--verify` asks for sudo once, up front, and prints `????` with the reason when
it cannot have it. That still fails the run, because an unverified firewall is not a verified one —
it just no longer borrows the word FAIL from the checks that genuinely failed.

### 7. Nothing had ever told this machine's screen not to blank — or not to LOCK

Walls 5 and 6 are both about the X11 pin, and the reason given for that pin, here and in
`CLAUDE.md`, is that the kiosk launcher blanks the screen with `xset` and hides the cursor with
`unclutter`, both of which fail silently under Wayland. That is true. **It is also not the whole
mechanism, and on a Plasma desktop it is not even the deciding one.**

The launcher runs `xset s off`, `xset s noblank` and `xset -dpms` once, at service start. Measured
on this box afterwards, `xset q` said:

```
Screen Saver:  timeout: 0
DPMS:          Standby: 0  Suspend: 0  Off: 0
               DPMS is Enabled          <- the launcher asked for Disabled
```

PowerDevil starts after the kiosk, runs its **own** idle timer, and turns the display off by
calling DPMS directly rather than by setting the X server's timeouts. Setting
`TurnOffDisplayIdleTimeoutSec` to 900, then -1, then 0 moved **nothing** in `xset q`. So on this
machine `xset q` cannot answer *"will this screen blank"*, and the launcher cannot stop it.

Worse, `~/.config/powerdevilrc` and `~/.config/kscreenlockerrc` were both **absent**, so both
daemons ran on KDE's defaults — which are written for a laptop: dim, blank, then **lock**. The
lock is the half that matters here. `krfb` shares the session that is already running, so a
locked host is one where the thing you remote in to see is a password prompt, on the machine you
are not standing at.

Fixed in `plasma-dark-setup.sh` §7, applied live as well as written to disk:

```sh
kwriteconfig6 --file kscreenlockerrc --group Daemon --key Autolock false
kwriteconfig6 --file powerdevilrc --group AC --group Display            --key TurnOffDisplayWhenIdle --type bool false
kwriteconfig6 --file powerdevilrc --group AC --group Display            --key DimDisplayWhenIdle     --type bool false
kwriteconfig6 --file powerdevilrc --group AC --group SuspendAndShutdown --key AutoSuspendAction      0
qdbus6 org.kde.Solid.PowerManagement /org/kde/Solid/PowerManagement \
       org.kde.Solid.PowerManagement.reparseConfiguration
```

**It disables the ACTIONS with booleans, not the timeouts with a sentinel**, because a timeout
whose "never" value you have guessed wrong is a screen that blanks *immediately*.

**Corrected 2026-09-24: the first version of this fix wrote the keys into the wrong group.** It
wrote a flat `[AC]` group, in both lower- and upper-camel spellings. Plasma 6 reads each profile
from **nested** groups — `[AC][Display]` and `[AC][SuspendAndShutdown]` — per PowerDevil's own
schema (`PowerDevilProfileSettings.kcfg` in `plasma/powerdevil`, whose migration fixtures show the
file in exactly that shape), and the key is the schema's upper-camel entry name; the lower-camel
form is the generated C++ accessor and was never read from the file. So PowerDevil almost
certainly ran on its defaults the whole time — dim, then display off — and nothing on the box
asked. `plasma-dark-setup.sh` now writes the nested groups, deletes the stale flat keys and reads
them back; `thinkcentre-setup.sh --verify` reads all four (display off, dim, auto-suspend, screen
locker) through `kreadconfig6` and **FAILS** if any would let the screen blank. Verified here only
against real KConfig in a throwaway config directory (the gate does the same); **not yet on the
box.** To confirm there, as `user` in the desktop session:

```sh
./scripts/plasma-dark-setup.sh --no-install          # re-applies §7 with the nested groups
kreadconfig6 --file powerdevilrc --group AC --group Display --key TurnOffDisplayWhenIdle   # false
kreadconfig6 --file powerdevilrc --group AC --group Display --key DimDisplayWhenIdle       # false
kreadconfig6 --file powerdevilrc --group AC --group SuspendAndShutdown --key AutoSuspendAction  # 0
./scripts/thinkcentre-setup.sh --verify              # the four idle lines must say ok
```

Then **the 20-minute idle test**, which is the only one that proves it: touch nothing — no
keyboard, no mouse, no RDP/VNC session attached — for at least 20 minutes, then look at the
screen. It must still be lit, undimmed and unlocked, with the kiosk on it. Log out and back in
(or reboot) and repeat once, since `reparseConfiguration` is the live path and login is the other.

**The lesson is the shape of it.** The X11 pin was chosen *because* `xset` works there. That
reasoning stopped one layer short of the thing that actually owns the display on this desktop,
and every report the machine printed about itself said the screen was fine.

---

## The kiosk keeps to its own workspace

The Chromium tab **is** the sharing agent, so the way to get it out of the way can never be to close
it — and a fullscreen kiosk on the only workspace makes closing it the obvious move. So there are
two virtual desktops and a KWin rule that forces the kiosk onto the second one: you land on an empty
desktop, it keeps sharing. `plasma-dark-setup.sh` §6 writes both.

The rule matches `WM_CLASS` **`vessel-kiosk`**, which the launcher sets with `--class`. **That name
is a contract between two scripts** — change it in `thinkcentre-setup.sh` and the rule in
`plasma-dark-setup.sh` silently stops matching, with no error anywhere and the kiosk back on top of
you. Matching a bare `chromium` was the alternative and is worse: it would drag every Chromium
window you open by hand onto the second desktop too.

`WM_CLASS` is an X11 property, and the note above was written expecting the rule to be dead until
the X11 reboot. **It is not**: Chromium 152 sets its Wayland `app_id` from `--class` as well, so
KWin reports `resourceClass = vessel-kiosk` under either. Keep the X11 pin for the reasons at the
top of this file — the blanking and the remote viewing — but do not expect this rule to be the
thing that breaks under Wayland, because it is not.

**The rule also forces `minimize=false`, and that is the half that matters.** Minimising is what
somebody does to get a fullscreen window out of the way, and on this machine that window is the
sharing agent. Taking the option away and giving it a workspace of its own is one answer, not two.

**A second desktop is created two different ways and using the wrong one is a silent no-op.**
Written first as `kwriteconfig6 --file kwinrc --group Desktops --key Number 2` plus a generated
UUID, which is correct with no session running and does nothing at all with KWin up: `reconfigure`
does not re-read the desktop count, and the next time KWin saved it wrote **its own** UUID over the
one just written. So the rule pointed at a desktop that did not exist and the kiosk stayed put. The
rule looked wrong; it was fine, and there was nowhere for it to send anything. With a session
running the desktop comes from
`qdbus6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.createDesktop 1 Sharing`,
and **the UUID is read back afterwards rather than assumed**, because in that case KWin chooses it.
`plasma-dark-setup.sh` §6 does both and picks between them.

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

**To see that screen remotely you need a server that shares the running session**, not one
that starts its own. `krfb` does this over VNC; `freerdp-shadow-cli3` does it over RDP, which
is easier from a Windows laptop. **xrdp does not** — it builds a *second* session, and you
would never see the kiosk window at all.

```sh
sudo apt install krfb
sudo ufw allow from 192.168.0.0/16 to any port 5900 proto tcp   # LAN only, never forward it
```

Wanting a desktop of your own on this box is the other half of the problem, and xrdp is the
right tool for *that* — but not as `user`, whose Plasma session the kiosk already occupies.
**See `docs/REMOTE-ACCESS.md`**, which has the black-screen diagnosis, the current state of
the host (as of 2026-09-11 there is no working RDP server after a reboot), and why GNOME/GDM
must not be used here.

---

## The trade this box is making

The Chromium managed policy locks down **the browser**, not the desktop. A full Plasma session
on autologin means anyone at the keyboard has your desktop and, one terminal away, `sudo`.
Keep the account password set and passwordless `sudo` off; `thinkcentre-setup.sh`'s preflight
warns about both. That is the accepted trade for a machine you also want to customise and
remote into — it was an appliance in the original design.

---

## Still to do on this machine

1. ~~Re-run `./plasma-dark-setup.sh --no-install`~~ — **done.** `/etc/sddm.conf.d/10-vessel.conf`
   is in place, the display manager is SDDM, and the running session is `Type=x11`.
2. ~~Add `usbcore.autosuspend=-1` and reboot~~ — **done**, and booted into: it is in
   `/proc/cmdline`.
3. **Run `--verify` once with a cached sudo credential** (`sudo -v` first). Everything else
   reports `ok`; the two checks that need root — `firewall active` and `sshd refuses root
   login` — still report `????`, and `sshd -T` has never actually been consulted on this box.
4. **Pair the machine**: sign in on `mcclevarty.ca`, `/share`, pick the folder. Not done — the
   kiosk's IndexedDB holds an empty `vessel-share` database, i.e. the page has loaded and nobody
   has ever paired. **The Chromium profile is the pairing**, so never launch the kiosk with
   `--user-data-dir` or `--incognito`, and never delete that profile.
5. **Does Raspberry Pi OS auto-upgrade Chromium under a running kiosk?** Open question for the
   *Pi*, not this box; `pi-setup.sh` says it cannot happen and that is unverified.
6. The phase-2 walkthrough by eye — pairing, drive picking, a real two-tab WebRTC browse and
   download — has still never been done. This machine is what it needs.
7. **Install Node 20+** (`sudo apt install nodejs npm`, then `npm ci`). There is no `node`, no
   `npm` and no `node_modules` on this box, so **`npm run check` — the gate — cannot run here**,
   and the `PostToolUse` hook in `.claude/settings.json` fails against a missing binary on every
   edit. `claude-code-setup.sh` deliberately only prints a note about this; the client asked for
   the toolchain on 2026-09-08.

---

## The desktop's look is scripted, not clicked

Two scripts own it, and both are idempotent, need no sudo, and download nothing.

**`scripts/konsole-profiles.sh`** writes seventeen Konsole colour schemes and profiles — Ubuntu,
Ubuntu on Black, Green on Black (the legacy Windows console palette), Campbell, Halo, Tron,
Apollo, Cyberpunk, Dracula, Solarized Dark and Light, Nord, Gruvbox, Tokyo Night, Catppuccin
Mocha, One Dark, Monokai — all at **86% opacity**. `--default NAME` picks which one new windows
open with; `--check` reports whether a compositor is running, because **without one every scheme
renders opaque and nothing in Konsole says why**.

**Opacity is a scheme setting, not a profile setting.** Konsole reads `Opacity` from the
`[General]` block of the `.colorscheme` file. Putting it on the `.profile` is a silent no-op.

**`scripts/plasma-vibes.sh`** applies a whole look at once — colour scheme, KWin effects,
a generated wallpaper and the matching Konsole profile: `halo`, `tron`, `apollo`, `cyberpunk`,
`hacker`, `frost`. `--intensity heavy|medium|light|off` sets what the effects cost, and
`--restore` puts Breeze Dark back.

Three things about it are load-bearing:

- **A fullscreen window suspends the compositor on this box** (`windowsBlockCompositing` is set),
  so while the kiosk is in front these effects cost *nothing* — not "less", nothing, because the
  compositor they configure is not running. The cost lands only on desktop 1, with a person
  watching and nothing being served. That is the right way round, and `--measure` checks it
  rather than assuming it.
- **Background Contrast has no config keys at all.** It declares no config module; KWin takes
  contrast, intensity and saturation per-window from the Plasma theme. It is on or off. Do not
  add a strength dial expecting one to exist.
- **`Effect-translucency` has no `Decoration` key.** The real ones are `MoveResize`, `Dialogs`,
  `Inactive`, `Menus`, `DropdownMenus`, `PopupMenus`, `ComboboxPopups`, `TornOffMenus`.

**The wallpapers are drawn here with ImageMagick and checked after they are drawn.** Every one is
deliberately dark, because it is seen *through* translucent terminals. `-rotate` fills the corners
it opens up with the current background colour, which defaults to **white** — so the `soft` recipe
shipped a pure-white wedge on a dark desktop, peak brightness 1.0. The fix is `-background` before
the rotate; the gate is a peak-brightness check on the file that was actually written, which warns
above 0.97. Verified by running the pre-fix recipe through it: it reports 1.0 and warns.
