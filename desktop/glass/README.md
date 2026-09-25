# The glass desktop

A snapshot of the sharing host's KDE Plasma 6 (X11) look as of 2026-09-24: dark, blurred, and
translucent everywhere except the browser. Captured and restored by `scripts/desktop-glass.sh`.

```
./scripts/desktop-glass.sh --apply     # put this look on the current user (backs up first)
./scripts/desktop-glass.sh --capture   # refresh this folder from the live desktop
./scripts/desktop-glass.sh --check     # show the live values that matter
```

The target it was tuned to: a folder icon sitting under a Dolphin window can just be made out.

| Piece | Where it lives | The value |
|---|---|---|
| Qt app glass | `kvantum/KvDebianGlass/` | `reduce_window_opacity=45` (~55% solid) |
| Terminal | `konsole/Halo.colorscheme` | `Opacity=0.70` |
| Panel | `plasma-theme/breeze-dark/` (local override) | background 0.85 → 0.6 |
| Start menu, tray popups | same, `translucent/dialogs` | background 0.85 → 0.45 |
| Qt menus | `kvantum/KvDebianGlass/` | `reduce_menu_opacity=40` |
| Blur | `config/kwinrc` `[Effect-blur]` | `BlurStrength=6` |
| Everything else (QML, GTK) | `config/kwinrulesrc` `[glass-everywhere]` | forced 85% active / 78% inactive |
| Menus (all apps) and dialogs | `config/kwinrc` `[Effect-translucency]` | 72 / 85 |

It also carries the host's user-level behaviour as of the same day: `powerdevilrc` (never dim,
blank or suspend), `kscreenlockerrc` (no autolock) and `kwalletrc` (KWallet off — autologin can
never unlock it). The system half of never-idle — logind `IdleAction=ignore`, the masked sleep
targets, the dconf lock — is `thinkcentre-setup.sh`'s and needs sudo.

Browsers, the `vessel-kiosk` window, media players and remote-desktop viewers are excluded
from the window rule by class regex — the kiosk is the sharing agent, and a see-through video is
just a worse video.

Not included: the Tela-circle-dark icon theme named in `kdeglobals` is not installed on this host
either, so Plasma falls back to Breeze icons — which is the look being saved.

`plasma-vibes.sh` and `plasma-dark-setup.sh` rewrite the same KWin and colour keys; re-run
`--apply` after either. `konsole-profiles.sh` now defaults to 0.70 to match.
