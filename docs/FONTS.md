# Self-hosted typefaces

`design/SPEC.md` § Assets says **no webfonts**. The client lifted that on 2026-08-14 — verbatim,
*"pls have the fanciest, coolest, futuristic, yet all readable fonts you can. download them if
needed. permission granted for that."* — in the same shape as the earlier no-images override that
produced `public/photos/` and `docs/PHOTOS.md`. This file is that override's ledger.

**The override is on webfonts, not on third parties.** These are downloaded and served from our own
origin. Loading them from `fonts.googleapis.com` would break three separate things, and only the
first is cosmetic:

1. The CSP in `worker/index.ts` is `default-src 'self'` with **no `font-src`**, so `font-src`
   inherits `'self'` and a `gstatic.com` URL is refused in production. It is report-only today, and
   the whole point of report-only is that flipping it to enforcing stays a one-header change.
2. "No cookies, nothing measuring you" is a claim the site makes in its own copy. Every visitor
   pinging Google for a font makes it false.
3. `CLAUDE.md` still forbids third-party **runtime** dependencies. A woff2 in `public/` is an asset,
   like the photographs. A CDN is a dependency.

Licence constraint: **SIL OFL 1.1 or Apache 2.0 only.** All six below are OFL 1.1, confirmed by
their presence under `ofl/` in the `google/fonts` repository.

## The files

`public/fonts/<slug>-latin.woff2`. Every file is the **latin subset** of a **variable** font, with
the weight axis clipped to the range the catalogue actually asks for.

| File | Family | Axis range shipped | Bytes | Licence |
|---|---|---|---|---|
| `space-grotesk-latin.woff2` | Space Grotesk | `wght 300–700` | 22,288 | OFL 1.1 |
| `playfair-display-latin.woff2` | Playfair Display | `wght 400–900` | 38,404 | OFL 1.1 |
| `literata-latin.woff2` | Literata | `wght 400–700` | 38,996 | OFL 1.1 |
| `sora-latin.woff2` | Sora | `wght 400–700` | 25,284 | OFL 1.1 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | `wght 400–700` | 31,432 | OFL 1.1 |
| `oswald-latin.woff2` | Oswald | `wght 400–600` | 21,472 | OFL 1.1 |

**Total 177,876 bytes (173.7 KiB)**, against a client budget of ~200KB ("as long as the site doesn't
lag"). Nothing else was added; there is no CSS, no JS and no network request beyond these six files,
and each is requested only if a typeset using it is the published one.

## How they were fetched, and how to re-fetch

Ask the Google Fonts CSS API for the family with the weight range clipped, with a desktop Chrome
`User-Agent` (the API varies its response by UA), then take the **`latin`** `@font-face` block only —
the one whose `unicode-range` begins `U+0000-00FF` — and download that URL.

```sh
curl -A "<desktop Chrome UA>" \
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap"
```

Two traps, both hit while doing this:

- **The block order is not fixed.** It is not always `latin` last — Oswald returns
  `cyrillic-ext, cyrillic, vietnamese, latin-ext, latin`, Space Grotesk returns
  `vietnamese, latin-ext, latin`. Match on `unicode-range: U+0000-00FF`, never on position. And
  match it with `grep -F`: in a POSIX basic regexp `\+` means *one or more*, so `grep 'U\+0000'`
  silently finds nothing.
- **The requested axis range really does subset the file**, and it is worth doing. Clipping the four
  wide-range families to 400–700 took 37KB off the total (Literata 52,496 → 38,996; JetBrains Mono
  40,404 → 31,432; Sora 33,652 → 25,284; Oswald 28,488 → 21,472). Widening a range in
  `src/styles/fonts.css` without re-downloading is harmless; widening it *and* re-downloading
  re-fattens the file, which is why the shipped range is recorded above.

The `unicode-range` in `src/styles/fonts.css` is the API's `latin` range copied verbatim. It is not
decoration: the site's Unicode furniture (`▸ ✕ ◈ ↻`) falls outside it and is meant to fall through
to the system font per-character.

## Why these six

The brief was "fanciest, coolest, futuristic, yet **all readable**", against the defect described at
`TYPESETS` in `src/data/catalog.ts` — on Windows, three of the five typesets were rendering in
Arial. Readable was treated as the binding half: this is a computer-repair business whose Contact
page is the one that has to work.

- **Space Grotesk** — `grotesk`, display and body. The default typeset, so this is what a stranger
  sees. Retro-technical without being a costume: angled terminals and a single-storey `a` give it a
  face, and it is a straightforward text sans at 15px.
- **Playfair Display** — `editorial`, **display only**. The fanciest thing on the site. Display-only
  is a rule, not an oversight: its hairlines vanish below roughly 24px.
- **Literata** — `editorial` body, and `mixed`'s display at 600. Commissioned for Google Play Books
  and built for long-form screen reading, which is what `editorial` needed under Playfair. Using it
  in the other role in `mixed` means the two serif typesets never show the same face doing the same
  job.
- **Sora** — `mixed` body. Geometric and near-monolinear, so it reads as a different voice from
  Space Grotesk rather than a second opinion on it.
- **JetBrains Mono** — the `--font-mono` of all five typesets, and the whole of `allmono`.
  `--font-mono` is the most-used token in the codebase (every chip, CTA, eyebrow and account form
  label), so this is the face a visitor sees most no matter which typeset is published.
- **Oswald** — `condensed`, display and body. A genuine condensed gothic, replacing a stack that
  reached `Impact` on Windows.

Two candidates were dropped for weight. **Unbounded** (50,904 bytes) was the overtly futuristic
display face and would have taken the total to 228KB; Space Grotesk at 700 carries `grotesk`'s
display instead. **Archivo** was attractive because it ships a real `wdth` axis — `font-stretch`
would have done actual work on `condensed` — but its two-axis latin file is 90,104 bytes, more than
four times Oswald's, for one typeset.

## Fallbacks are not decoration

Every stack in `TYPESETS` continues past the webfont into real system fonts, chosen per platform.
That tail is what renders during `font-display: swap` and permanently if a woff2 ever 404s, so it
has to hold up on its own — which is the original bug, and it is fixed in the fallbacks too, not
just papered over by the downloads. Nothing is preloaded: a preload has to go in `index.html`, and
preloading one face would only help whichever typeset the operator happens to have published.
