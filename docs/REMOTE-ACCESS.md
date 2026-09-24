# Remoting into the ThinkCentre host

The operator's own host, not a customer machine. Tailscale is allowed here and nowhere else
— see item 7 in `TODO.md` and the 2026-09-08 entry in `docs/DECISIONS.md`.

Reach it at **`<TAILSCALE-IP>`** (Tailscale) or **`<LAN-IP>`** (LAN). SSH on 22 is enabled
and is the fallback whenever the graphical path is broken, which as of 2026-09-11 it is.

## Two different things, and the difference is the whole story

`docs/HOST-BUILD-LOG.md` warned that an RDP server "starts a *second* session and you would
never see the kiosk window at all". That is true of **xrdp**, and it is why the first attempt
failed. It is not true of every RDP server, and the distinction decides which tool you want:

- **A second desktop** (xrdp) — your own session, the kiosk screen untouched and still
  serving. What you want for ordinary work on the box. Survives reboot once enabled.
- **The live kiosk screen** (`freerdp-shadow-cli3`, or `krfb` over VNC) — attaches to the
  running `:0`, so you see the Chromium tab itself. What you want when the kiosk misbehaves.
  Anything you type goes to the real screen.

They coexist on separate ports. Neither is a replacement for the other.

## Why xrdp as `user` gives a black screen

RDP logins run `/etc/X11/Xsession`, which execs `~/.xsession`. Setting that to
`exec startplasma-x11` for `user` (uid 1000) produces a black screen, confirmed in
`~/.xsession-errors` on 2026-09-08:

    Xsession: X session started for user at Tue 08 Sep 2026 05:32:57 PM EDT
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
    DISPLAY=:10.0
    ... kdeinit5_shutdown QList() exited with code 255

The X display is new; the D-Bus session bus is not. sddm autologin means the kiosk's Plasma
is *always* running as uid 1000, and it already owns `org.kde.plasmashell` and the kwin names
on that bus. The second Plasma cannot claim them and paints nothing.

**The bus and the systemd user manager are per-user, not per-session.** So this is not a
display problem and no amount of X fiddling fixes it. `dbus-run-session` is not a way out
either: Plasma 6 boots its session through systemd, whose user manager is still shared.

The fix is a **separate uid**, which gets its own `/run/user/<uid>/bus`. `scripts/rdp-separate-user.sh`
creates one (`patrick` by default, `--user NAME` otherwise) with a Plasma `~/.xsession` and
**no sudo**. Two things are opt-in since the 2026-09-24 review, because each is a decision:

- `--with-sudo` — xrdp logs in by **password**, with no lockout, so a sudo-capable RDP user makes
  that password root's for anyone who can reach 3389. Administer over SSH (key-only) instead. The
  script refuses outright if the named user is *already* in `sudo` and the flag is absent.
- `--share-home` — puts both accounts in a `shared` group and opens `/home/user`'s **non-hidden**
  files to it. This **loosens** `/home/user` from `drwx------` to 750. Dotfiles stay excluded:
  `~/.local` holds the kiosk unit and `~/.ssh` holds keys. Symlinks are skipped, never followed.

`--undo` reverses exactly what the record in `/var/lib/vessel-rdp-user/` says the script did —
modes and groups put back from a manifest (never through a symlink), memberships and the group
removed only if it added them, the user removed only if it created it. It **never deletes the
RDP user's home**; that is left for a person to look at first.

The earlier version pasted each `/home/user` filename into an `sh -c` string run as root, so a
file named with a quote and a `$(…)` executed as root. That is gone, and `npm run check` drives
the loop against exactly those names.

Everything else already works and was verified on 2026-09-08: TLS, PAM auth, printer
redirection from the Windows laptop, and the ufw restriction of 3389 to `tailscale0` plus
`<LAN-CIDR>`. Only the session choice was ever wrong.

## State as of 2026-09-11 — NOT RE-CHECKED SINCE; nothing here survives a reboot

**Unchecked since 2026-09-11.** Everything in this section is what was seen that day. The box
has very likely rebooted since, so re-check before trusting any of it:
`systemctl is-active xrdp xrdp-sesman; systemctl is-enabled xrdp; ss -tlnp | grep 3389;
pgrep -a freerdp-shadow; ls -la ~/.xsession*`.

- **xrdp is installed but `inactive` and `disabled`.** Disabled some time after 2026-09-08.
- **`freerdp-shadow-cli3` holds 3389**, started 12:07 that day:

      /usr/bin/freerdp-shadow-cli3 /port:3389 \
        /sam-file:/home/user/.config/freerdp/shadow.sam /sec:nla

  It is a child of `systemd --user`, **not** a unit — no enabled freerdp/shadow unit exists.
- So after the next reboot **there is no RDP server at all.** Get in over SSH.

## Resuming

For a desktop of your own, reboot-proof:

```sh
sudo bash scripts/rdp-separate-user.sh        # ends with an interactive passwd; add --share-home
                                              # and/or --with-sudo only if you want them (above)
sudo systemctl enable --now xrdp xrdp-sesman  # the script only restarts; xrdp was disabled on 09-11
```

For the live kiosk screen to come back on its own, `freerdp-shadow-cli3` needs a user unit
plus `loginctl enable-linger user`. Not written yet.

One known rough edge in `scripts/rdp-separate-user.sh`: it only restarts xrdp rather than
enabling it (hence the second command above). The `chmod 750 /home/user` it used to do
unconditionally now happens only with `--share-home`, which says that it loosens the directory.
**It has never been run on the box in this form** — see the checklist in `TODO.md`.

## Do not retry: GNOME + GDM

`gnome-remote-desktop`'s Remote Login would give headless RDP that survives reboot, and it is
a trap here. It requires GDM, and **GDM does not read `/etc/sddm.conf.d/10-vessel.conf`**, so
the kiosk would not autologin after a reboot and the host would go offline. Its per-user
Desktop Sharing mode is a second trap: it stores credentials in the gnome-keyring login
keyring, which under autologin never unlocks — the same failure that got KWallet disabled.

`scripts/attic-rdp-*.DO-NOT-RUN` are the two superseded scripts, kept only as a record.
The xrdp one was run once on 2026-09-08; its `~/.xsession` line is the black-screen bug, and
`/home/user/.xsession` was still present on 2026-09-11 and still needed removing (unchecked
since; the fix script moves it aside and records where).
