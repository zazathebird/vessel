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
creates one (`patrick`), gives it sudo and a Plasma `~/.xsession`, and puts both accounts in
a `shared` group so `/home/user`'s **non-hidden** files are reachable — dotfiles are excluded
deliberately, since `~/.local` holds the kiosk unit and `~/.ssh` holds keys.

Everything else already works and was verified on 2026-09-08: TLS, PAM auth, printer
redirection from the Windows laptop, and the ufw restriction of 3389 to `tailscale0` plus
`<LAN-CIDR>`. Only the session choice was ever wrong.

## State as of 2026-09-11 — nothing here survives a reboot

- **xrdp is installed but `inactive` and `disabled`.** Disabled some time after 2026-09-08.
- **`freerdp-shadow-cli3` holds 3389**, started 12:07 that day:

      /usr/bin/freerdp-shadow-cli3 /port:3389 \
        /sam-file:/home/user/.config/freerdp/shadow.sam /sec:nla

  It is a child of `systemd --user`, **not** a unit — no enabled freerdp/shadow unit exists.
- So after the next reboot **there is no RDP server at all.** Get in over SSH.

## Resuming

For a desktop of your own, reboot-proof:

```sh
sudo bash scripts/rdp-separate-user.sh        # ends with an interactive passwd
sudo systemctl enable --now xrdp xrdp-sesman  # the script only restarts; xrdp is disabled now
```

For the live kiosk screen to come back on its own, `freerdp-shadow-cli3` needs a user unit
plus `loginctl enable-linger user`. Not written yet.

Two known rough edges in `scripts/rdp-separate-user.sh`, both harmless if you know about them:
it only restarts xrdp rather than enabling it (hence the second command above), and its
`chmod 750 /home/user` *loosens* that directory — it is `drwx------` today — despite a comment
implying otherwise.

## Do not retry: GNOME + GDM

`gnome-remote-desktop`'s Remote Login would give headless RDP that survives reboot, and it is
a trap here. It requires GDM, and **GDM does not read `/etc/sddm.conf.d/10-vessel.conf`**, so
the kiosk would not autologin after a reboot and the host would go offline. Its per-user
Desktop Sharing mode is a second trap: it stores credentials in the gnome-keyring login
keyring, which under autologin never unlocks — the same failure that got KWallet disabled.

`scripts/attic-rdp-*.DO-NOT-RUN` are the two superseded scripts, kept only as a record.
The xrdp one was run once on 2026-09-08; its `~/.xsession` line is the black-screen bug, and
`/home/user/.xsession` is still present and still needs removing.
