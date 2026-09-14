# Placeholder photos

**These are temporary placeholders.** The spec's photo slots are meant to hold the operator's own
photos, which do not exist yet. Everything below was pulled from Wikimedia Commons and chosen for
subject match under one hard constraint: **Public Domain or CC0 only** — no CC-BY / CC-BY-SA,
because the site has nowhere to carry attribution on-page. Attribution below is a courtesy, not an
obligation. Replace freely; nothing in `src/` knows these files by anything but their slug.

Files live in `public/photos/<slug>.jpg`, re-encoded from the ~1280px-wide thumbnails Commons
renders. See *Encoding* below for what is on disk now and how to reproduce it.

| Slug | Source page | Author | License |
|---|---|---|---|
| `drive-teardown` | https://commons.wikimedia.org/wiki/File:Open_hard-drive.jpg | Zzubnik | Public domain |
| `network-cabinet` | https://commons.wikimedia.org/wiki/File:Cable_closet_bh.jpg | (not stated) | Public domain |
| `keyboard-disassembled` | https://commons.wikimedia.org/wiki/File:Some_keycaps_removed.JPG | Niels de Vries | Public domain |
| `thinkpad-exploded` | https://commons.wikimedia.org/wiki/File:Dell_Inspiron_tablet_laptop_teardown.jpg | Gregory Karastergios | CC0 |
| `burnt-capacitor` | https://commons.wikimedia.org/wiki/File:Vp6_blown_capacitor.jpg | Ethanbrodsky | Public domain |
| `drive-shelf` | https://commons.wikimedia.org/wiki/File:Pata_hdds.jpg | X Wad | CC0 |
| `crt-alive` | https://commons.wikimedia.org/wiki/File:ScreenBurn_amber.JPG | Piercetheorganist (en.wikipedia) | Public domain |
| `cable-drawer` | https://commons.wikimedia.org/wiki/File:Kabelsalat.JPG | User:Mattes | Public domain |

Notes on fit:

- `thinkpad-exploded` is a Dell, not a ThinkPad — brand was explicitly not required. It is an
  opened laptop mid-repair with screwdrivers in frame, landscape rather than the hoped-for 4:5.
- `cable-drawer` is a tangle of cables under a desk, not literally a drawer — no PD/CC0 drawer
  photo could be found; the tangle is the point.
- `crt-alive` is powered on (amber phosphor, dark room), which is exactly the brief.
- Aspect-ratio wishes (4:5, 16:9, 3:4) were treated as nice-to-have per the brief; subject and
  license won every trade-off.

## Encoding

**900px wide, quality 72, progressive, sRGB, no metadata** (2026-09-14). They shipped as 1280px
baseline JPEGs at 2.0MB — four times the JS bundle, and the largest asset class on the site. The
whole set is 585KB now, a **71% cut**, and it is worth recording *why the quality bar is low here*:
these render into `.v-tile` under `grayscale(0.85) contrast(1.05)` at `opacity: 0.8`, a tile whose
widest desk column is a few hundred pixels, so 900px is still oversampled at 2× device pixels and
almost every artefact q72 leaves is downsampled or desaturated away before anybody sees it.

Re-encoded with **`sharp` 0.35.2 / libvips 8.18.3** (already present as a transitive dependency of
wrangler, so this added nothing to `package.json`), `lanczos3` resize, `mozjpeg: true`. **Keep it
JPEG**: the *Assets* rule and this ledger both assume one format, and a second one is a second
thing to keep in sync.

**The "EXIF stripped" line on the gallery is checked, not assumed.** `sharp` drops every metadata
block by default — do not add `.withMetadata()`, which puts them back. Verified after encoding by
walking the JPEG marker segments directly: **no APPn and no COM segment survives in any of the
eight**, not even the JFIF APP0 the Commons thumbnails carried. `exiftool` reports nothing outside
its own computed `[Composite]` group. Re-check this way after any re-encode; `identify` will not
tell you.

One gotcha for whoever measures next: **`identify` reports `q=92` for these, and that is not the
quality they were written at.** ImageMagick infers quality from the quantisation tables, and
mozjpeg uses its own; the encoder setting is 72.

| Slug | Before | After | Now on disk |
|---|---|---|---|
| `burnt-capacitor` | 375,956 | 110,301 | 900×675 |
| `cable-drawer` | 202,163 | 60,075 | 900×411 |
| `crt-alive` | 131,053 | 17,423 | 900×675 |
| `drive-shelf` | 299,521 | 89,120 | 900×676 |
| `drive-teardown` | 157,219 | 39,261 | 900×785 |
| `keyboard-disassembled` | 274,326 | 79,671 | 900×600 |
| `network-cabinet` | 368,971 | 126,424 | 900×668 |
| `thinkpad-exploded` | 236,041 | 62,573 | 900×531 |
| **Total** | **2,045,250** | **584,848** | −1,460,402 (−71.4%) |

All eight were checked against a 900px/q95 reference before being believed, at 1:1 and with the
tile's own filter applied — not on the numbers alone. Worst DSSIM is `keyboard-disassembled` at
0.064 and nothing in the set is visibly degraded under the filter, so **no file was held back at a
higher quality**. `crt-alive` falls hardest (87%) because it is a dark room around one lit screen,
which is mostly flat black; its burnt-in phosphor text is a deliberate low-contrast detail and it
survives — check that specifically if the settings ever move again.

**Nothing in `src/` knows the dimensions.** `.v-tile-img` is `object-fit: cover` inside a sized,
absolutely-positioned tile, so there is no CLS risk in changing them and no layout to re-check.
