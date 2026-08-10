# Handoff: Vessel — personal site + computer repair contact

> **Package 2 of 2 — supersedes `design_handoff_vessel`.** Everything previously marked *pass two* is now built, and responsive behaviour is designed rather than deferred. Changes since package 1: five new layout archetypes (Ledger, Stack, Marginalia, Console, Contact sheet — thirteen total), a three-band responsive system, adapted-layout collapsing on small screens, and touch-target corrections. Sections revised: *The layout archetypes*, *Responsive*, *Design tokens*, *Suggested build order*.

## Overview

A personal website for an independent computer repair operator. It is deliberately over-designed: the site is a configurable visual toy wrapped around one genuinely useful page (Contact). Nine pages, twenty-four colour palettes, thirteen layout archetypes, twelve animated canvas backgrounds, five typography systems, and a randomiser that can reshuffle any subset of those on a schedule you choose.

A hidden operator panel (`siteconfig`) exposes all of it. Visitors never see the panel — they get a single **calm** toggle, which switches the site into a second, quiet aesthetic.

The tone is dry and self-aware. The site openly admits it is unnecessary. That is the joke, and the copy should not be rewritten to sound more professional.

## About the design files

`Site v2 - Vessel.dc.html` in this bundle is a **design reference created in HTML** — a working prototype that demonstrates the intended look, motion, and behaviour. It is not production code to copy directly.

It is unusual in one respect: it genuinely runs, and every feature described below actually works in it. Open it in a browser and use it. Treat it as an executable spec rather than as a source tree.

The task is to **recreate this design in a real codebase** — a fresh project, since none exists yet. Pick the framework you judge best; the notes below assume React + Vite + TypeScript, which maps closely to the prototype's structure, but nothing here depends on that choice.

`support.js` is the prototype's own runtime. **Do not port it.** It exists only to make the single HTML file render. `reference/Site v2 - Kaleidos.dc.html` is an earlier, rejected direction, included for context only — do not build from it.

## Fidelity

**High fidelity.** Colours, typography, spacing, motion timings, and copy are all final. Recreate the UI faithfully. Every hex value, duration, and easing curve in this document is the intended value, not an approximation.

The two exceptions, both deliberate:
- **Photo slots** are marked placeholders. Real images do not exist yet.
- **Operator authentication** is theatre — a convincing UI with no backend. See *Security* below.

---

## Product decisions already made

These were settled with the client. Do not revisit them without asking.

| Decision | Value |
|---|---|
| Default palette on a stranger's first visit | Nebula Drift |
| Default randomiser mode | Time of day |
| Time-of-day behaviour | Does **not** override a first visit — Nebula Drift wins on load, then the palette shifts when the clock hour actually changes, or on any return visit |
| Calm mode | A full second aesthetic, not a reduced version of the first |
| Calm and the layout switcher | Calm keeps whatever layout is selected |
| Randomiser access | Operator only. Visitors get the calm toggle and nothing else |
| Share codes | Operator generates them; anyone can have one applied to them |
| Persistence | Settings survive reload |
| `prefers-reduced-motion` | Respected — lands the visitor in calm automatically |
| Screensaver wake | Click only. Mouse movement does not wake it |
| Now and Changelog | Footer links, not main nav |
| Service area | Deliberately vague. **No city is named anywhere** |
| Email | Assembled in JS, click-to-reveal, never in static markup |

---

## Screens / views

Nine pages. All share one chrome: header, hero, content grid, footer. What changes per page is copy and block content — there is no bespoke per-page layout. The *layout archetype* (see below) is a global setting that restyles every page at once.

### Shared chrome

**Header** — `padding: 20px 40px`, `border-bottom: 1px solid var(--line)`, `backdrop-filter: blur(16px)`, background `color-mix(in oklab, var(--bg) 66%, transparent)`. Three groups on one flex row, `justify-content: space-between`, `gap: 24px`, wrapping.

An "artery" sits across the header's vertical centre: `position: absolute; left/right: 40px; height: 2px`, background `linear-gradient(90deg, transparent, var(--a1), var(--a2), transparent)` at `opacity: .28`. A highlight travels along it — a `22%`-wide white-ish gradient span, `animation: travel 5.5s cubic-bezier(.5,0,.5,1) infinite`. Hidden in calm.

- **Logo** (left) — 32×32 grid, two concentric rings (`1px solid var(--a1)` at `inset: 0`, `1px solid var(--a2)` at `inset: 6px`) each running a `dilate` animation at 4.2s, the second offset by .35s; a 9px `var(--a1)` dot at the centre with `box-shadow: 0 0 16px`. Wordmark `vessel`, mono, 13px, `letter-spacing: .24em`, uppercase.
- **Nav** (centre) — seven pill buttons: Home, About, Work, Gallery, Contact, Guestbook, 404. Mono 11px, `letter-spacing: .16em`, uppercase, `padding: 10px 14px`, `border-radius: 999px`. Active: border and text `var(--a1)`, background `color-mix(in oklab, var(--a1) 16%, transparent)`, `box-shadow: 0 0 22px color-mix(in oklab, var(--a1) 45%, transparent)` (shadow suppressed in calm). Inactive: `1px solid var(--line)`, `var(--muted)` text.
- **Right** — the calm toggle (chip style, label `calm` / `calm ✓`), and the `siteconfig` button **only when unlocked**.

**Footer** — `border-top: 1px solid var(--line)`, `padding: 34px 0 10px`, mono 11px, `letter-spacing: .14em`, uppercase, `var(--faint)`. Three groups:
- Left: `no trackers · no cookies · no idea why you're still here`
- Centre: `Now`, `Changelog`, then a `·` character which is one of the unlock routes
- Right: `last fiddled with · aug 2026 · HH:MM · local` (clock ticks live)

**Hero** — flex row, `gap: 48px`, `padding: 64px 0 50px`. Left is the valve (below), right is the text column: eyebrow, h1, lede, CTA row, then a mono metadata strip reading current palette name, layout name, effect name, and a vitals string (`pulse 47 bpm`, or `resting` in calm, or `pressure lost` on 404).

- Eyebrow: mono 11px, `letter-spacing: .3em`, uppercase, `var(--a1)`, preceded by a 24×1px rule in the same colour.
- h1: `var(--fontDisplay)`, `clamp(42px, 6.2vw, 90px)`, `line-height: .96`, `letter-spacing: -0.035em`, `text-shadow: 0 0 70px color-mix(in oklab, var(--a1) 42%, transparent)` (none in calm).
- Lede: `clamp(15px, 1.25vw, 19px)`, `line-height: 1.65`, `var(--muted)`, `max-width: 56ch`, `text-wrap: pretty`.
- CTAs: `padding: 15px 24px`, `min-height: 46px`, mono 12px, `letter-spacing: .14em`, uppercase. Primary gets `1px solid var(--a1)`, background `color-mix(in oklab, var(--a1) 18%, transparent)`, `box-shadow: 0 0 36px color-mix(in oklab, var(--a1) 34%, transparent)`.

**The valve** — the site's one recurring ornament, a set of concentric rings around a glowing core. `min(38vw, 340px)` square (`min(62vw, 540px)` in Radial, `180px` in Magazine). Composed of: an outermost dashed ring in `var(--line)` rotating once per 60s; three rings at `inset: 6% / 22% / 38%` in `--a1` / `--a2` (dashed) / `--a3`, each running `dilate 4.6s ease-in-out infinite` staggered by 0s / .4s / .8s; and a core at `22%` width, `background: radial-gradient(circle at 34% 30%, var(--a1), transparent 70%)`, `box-shadow: 0 0 70px`. The whole assembly drifts vertically ±12px over 9s. In calm it drops to `opacity: .5` and all animation stops. Hidden entirely in Side-scroll and Terminal layouts.

**Content blocks** — cards, `padding: 22px`, `1px solid var(--line)`, `border-radius: var(--radius)`, background `color-mix(in oklab, var(--surface) 70%, transparent)`, `backdrop-filter: blur(12px)`, `box-shadow: inset 0 1px 0 color-mix(in oklab, var(--fg) 8%, transparent), 0 20px 50px rgba(0,0,0,.28)`. Internal `gap: 13px`, flex column. Each has a kicker row (mono 10px uppercase `var(--a2)` with a 6px glowing dot, and a right-aligned zero-padded index), an h3 at `clamp(19px, 1.6vw, 24px)`, and body text at 15px / 1.62 in `var(--muted)`. Cards stagger in on page change at 50ms intervals.

Optional per-block: a bulleted list (custom `▸` markers in `var(--a1)`), a photo slot, or the email reveal.

**Photo slots** — `min-height: 150px`, `border-radius: calc(var(--radius) - 5px)`, `1px solid var(--line)`, a 135° repeating stripe background alternating `var(--surface)` at 92% and `var(--bg)` at 78% every 9px, an inset glow ring, and a centred mono caption naming the aspect ratio (e.g. `4:5 · photo slot`). Replace these with real images when supplied; keep the aspect ratios noted in each caption.

### The nine pages

Full copy lives in the `PAGES` object in the prototype's logic. **Use it verbatim** — the voice is the point, and it was written deliberately.

| Page | Eyebrow | h1 | Blocks | Notes |
|---|---|---|---|---|
| **home** | `pressure nominal` | Oh. It's you. | 6 | The joke page. CTAs to Contact and Gallery |
| **about** | `who` | Nobody, deliberately. | 4 | No name, no face, no city — that is the content |
| **work** | `selected repairs` | Things that were dead. | 6 | 3 photo slots. No client names anywhere |
| **gallery** | `dumping ground` | Random shit, catalogued. | 6 | 6 media slots, incl. one muted video loop |
| **contact** | `the useful page` | Computer repair. | 6 | **The only page that matters.** See below |
| **guestbook** | `1999 revival` | Sign nothing. | 5 | Static quotes. No form, deliberately — a form is a database is a liability |
| **now** | `currently on the bench` | What's open right now. | 6 | Hand-edited status list |
| **changelog** | `site edits` | Things I changed. | 6 | One-line jokes, newest first |
| **notfound** | `pressure lost · http 404` | Nothing here. Never was. | 3 | Desaturated to 55%, accents drop to muted greys, vitals read `pressure lost` |

**Contact** is the page that must not break. Six blocks: the email reveal, what I fix (8 items), what I don't (4 items), service area, how it works (3 steps), and what to include in a first email. It carries no layout exceptions — calm mode is the readability escape hatch, and that was a deliberate decision.

The email is `patrickmcclevarty@outlook.com`. It must never appear in static markup. Build it at runtime from parts (the prototype joins `["patrickmcclevarty", String.fromCharCode(64), "outlook", ".", "com"]`). Before reveal, the button reads `click to reveal the address`; on click it shows the address, copies it to the clipboard, and toasts `address copied`. Style: mono, `clamp(17px, 1.7vw, 22px)`, `var(--a1)`, `border-bottom: 2px solid var(--a1)`, `word-break: break-all`. Reset to unrevealed on page change.

---

## The thirteen layout archetypes

A global setting. Changing it restyles every page at once — it does not change content. All thirteen are built and working in the prototype.

| Layout | Grid | Distinguishing treatment |
|---|---|---|
| **Cinematic** *(default)* | `repeat(auto-fit, minmax(300px, 1fr))`, gap 20px | The baseline. Large valve, generous hero |
| **Magazine** | CSS `columns: 3`, `column-gap: 26px` | `--radius: 2px`. Uppercase h1 at `clamp(46px, 7.6vw, 104px)`. Cards lose borders/background, become `border-top: 1px solid var(--line)` rules. Hero gets a 3px solid `var(--fg)` bottom rule |
| **Card deck** | Horizontal flex, `scroll-snap-type: x mandatory` | Cards `flex: 0 0 340px`, `min-height: 330px`, snap to centre |
| **Split** | `repeat(2, 1fr)` | Strict two-column |
| **Radial orbit** | Standard grid | Valve grows to `min(62vw, 540px)`; the seven nav items orbit it as absolutely-positioned pills at 160% radius, evenly distributed from -90° |
| **Side-scroll** | Horizontal flex, page scrolls sideways | Hero becomes a fixed 640px panel; valve hidden; cards `flex: 0 0 320px` |
| **Terminal** | Vertical flex inside a windowed shell | `--radius: 2px`, everything mono. A title bar with three traffic-light dots (`--a3`, `--a2`, `--a1`) and `vessel — /pagename`. Stage is a bordered, rounded 1120px window with `0 40px 120px rgba(0,0,0,.5)` |
| **Mosaic** | `repeat(6, 1fr)`, auto rows `minmax(120px, auto)` | Cards take a repeating span pattern: 4×2, 2×1, 2×2, 4×1, 3×2, 3×1 |
| **Ledger** | Vertical flex, `gap: 0`, `border-top: 1px solid var(--line)` | Every block becomes a table row: `grid-template-columns: minmax(180px,.9fr) 2.1fr`, `gap: 26px`, `align-items: start`, `padding: 18px 4px`, separated by `border-bottom` rules. Odd rows get `color-mix(in oklab, var(--surface) 34%, transparent)` for banding. No card borders, radius, blur, or shadow. Valve hidden. h1 drops to `clamp(30px,4vw,52px)`; hero gains a bottom rule |
| **Stack** | Vertical flex, `scroll-snap-type: y mandatory` on the stage | One block per viewport: `min-height: 72vh`, `justify-content: center`, `padding: 56px`, `gap: 20px`, `scroll-snap-align: start`, separated by single top rules with no card chrome. Hero also snaps, at `min-height: 68vh` |
| **Marginalia** | Vertical flex, `gap: 34px`, `max-width: 720px` centred | A narrow reading column with a hairline gutter: blocks carry `padding: 0 0 30px 30px`, `border-left: 1px solid var(--line)`, and `margin-left: -30px` so the rule sits in the margin. Bottom rules only. h1 `clamp(32px,4.4vw,60px)` |
| **Console** | Vertical flex, `gap: 10px`, all mono | Blocks stream in one at a time — `v-rise .34s` staggered at **160ms** intervals rather than the usual 50ms, so arrival reads as output being printed. Each is `padding: 14px 16px`, `border-radius: 3px`, `1px solid var(--line)` with `border-left: 2px solid var(--a1)`, background `color-mix(in oklab, var(--surface) 52%, transparent)`, no blur or shadow. Valve hidden |
| **Contact sheet** | `repeat(4, 1fr)`, `gap: 14px` | Image-first: tight `padding: 12px`, `gap: 9px`, and photo slots grow to `min-height: 190px`. Valve hidden. Text is subordinate to the tiles |

---

## Calm mode

Not a reduced version of the main aesthetic — its own. Same darkness, everything else stripped.

- Canvas fades to `opacity: 0` over 1.1s and stops rendering entirely
- Whole page gets `filter: saturate(.45)`
- `--a2` and `--a3` are remapped to `--muted` and `--faint`, leaving exactly **one** accent
- `--radius` drops to `6px`
- Grain off, cursor glow off, all animations `none`, all glows and shadows removed
- Valve drops to `opacity: .5` and freezes
- The title scramble is skipped — text renders resolved
- Page transitions cut instantly instead of diving

Calm keeps the chosen layout, keeps all copy identical, keeps nav in the same place, and keeps photo slots. It is entered by the header toggle only, and automatically for anyone with `prefers-reduced-motion: reduce`.

---

## The randomiser

Five modes, operator-selectable:

| Mode | Behaviour |
|---|---|
| **Static** | Never changes on its own |
| **Time of day** *(default)* | Palette follows the clock. Does **not** fire on a first visit — Nebula Drift wins on load. Applies on the hour changing, or on any return visit |
| **Per visit** | Rolls once on load |
| **Per page** | Rolls on every nav click |
| **Shuffle only** | Rolls only when the operator presses the button |

Time-of-day mapping: `00–06` Ultraviolet · `06–10` Arctic Signal · `10–15` Deep Reef · `15–19` Vapor Sunset · `19–22` Molten Obsidian · `22–24` Nebula Drift.

**Scope toggles** — five independent switches controlling what a roll may touch: Palette, Layout, Effect, Type, Toggles. Anything switched off keeps its current value.

**Guardrails.** A roll retries up to 60 times until it produces a combination that passes all of these:
- Magazine may not use Matrix rain or Plasma
- Terminal may use *only* Matrix rain, Grid tunnel, or None
- Terminal may not use Condensed type
- Editorial type may not pair with the Datamosh palette
- Side-scroll may not use any heavy effect (rain, plasma, vessels, bokeh)
- Radial may not use Plasma or Matrix rain
- Ledger may not use Plasma or Bokeh, and may not use Condensed type
- Console may use *only* Matrix rain, Grid tunnel, Constellation, or None
- Marginalia may not use Matrix rain, Plasma, or Warp stars
- Contact sheet may not use Matrix rain or Plasma
- Grain may not be on with a low-contrast palette (Peat, Oxide, Terracotta Night, Deco Gold)

**Share codes** — five base-36 fields joined by hyphens, uppercased: palette index, layout index, effect index, type index, and a bitfield (`1` grain, `2` breathing, `4` cursor glow, `8` calm). Example: `A-3-1-0-7`. The operator copies one; pasting one into the panel applies it and forces mode to Static. Reject malformed input with the toast `that isn't a setup code`.

---

## The twelve canvas backgrounds

One full-bleed `<canvas>` at `z-index: 0`, `opacity: .9`, `1600×1000` internal resolution, stretched to fill. Above it sits a vignette (`radial-gradient(130% 95% at 50% 8%, transparent 26%, var(--bg) 92%)`) and, when grain is on, a 3px repeating-conic noise layer at `opacity: .14`, `mix-blend-mode: overlay`.

All effects read from the live palette, so they recolour with it. All pause on `document.hidden`. All accept a `boost` multiplier derived from scroll velocity and screensaver state.

1. **Vessels** *(default)* — a recursively grown branching tree, depth 6, rooted below the bottom edge with two side branches entering from the left and right edges. Each branch pulses on a phase offset; branches near the cursor brighten (falloff over 420px); deep branches emit occasional bright nodes. A radial glow at the base breathes with the pulse.
2. **Flow** — five horizontal sine channels drawn as 10px `var(--line)` strokes, with 160 particles travelling along them at varying speeds, each with a soft halo.
3. **Pressure** — 16 concentric rings expanding from a centre point, opacity falling off with radius and modulated by the heartbeat, over a pulsing core.
4. **Matrix rain** — classic falling glyph columns at 16px, trailing via a `var(--bg) + "18"` overdraw rather than a clear. Character set includes katakana. Leading glyph in `--fg`, a second in `--a1` three cells up.
5. **Warp stars** — 260 particles accelerating radially outward from centre, drawn as streaks scaled by depth.
6. **Constellation** — 90 drifting nodes with lines drawn between any pair closer than 150px, line opacity by proximity.
7. **Aurora** — five stacked wide sine ribbons, `lineWidth: 46`, `opacity: .17`, at slightly different frequencies.
8. **Plasma** — a 26px grid of dots sized and coloured by a three-term sine field.
9. **Grid tunnel** — 26 nested rectangles scaling toward the viewer on a power curve, plus eight radial spokes rotating slowly.
10. **Bokeh** — 46 large soft radial-gradient discs (22–112px) rising slowly with lateral drift.
11. **Orbits** — seven concentric rings with a lit body on each, orbiting at speeds inversely proportional to radius, each with a halo.
12. **None** — canvas cleared.

---

## Motion systems

All five are implemented. All are suppressed in calm.

**1. Palette bleed** — palettes never cut. Every colour-bearing property carries `transition: background-color .9s ease, color .9s ease, border-color .9s ease, box-shadow .9s ease`. The canvas recolours over the same period naturally, since it samples the live palette each frame.

**2. Cursor-lean cards** — on `pointermove`, every visible card gets `perspective(1100px) rotateY(±3.4deg) rotateX(∓3.4deg) translateZ(0–10px)`, scaled by a proximity falloff so distant cards stay flat. Off-screen cards (±200px) are skipped. Transition `.28s cubic-bezier(.2,.8,.2,1)`.

**3. Title assembly from noise** — on every page change the h1 resolves from random glyphs. Implementation matters here: **the resolved title is the default state and the scramble decorates it**, driven by `requestAnimationFrame` against a `performance.now()` wall-clock deadline of 550ms. It snaps to real text the moment the deadline passes or the tab is hidden, and is skipped entirely if the page loads hidden. Do not drive this from a frame counter or `setInterval` — a clamped or throttled clock will strand the headline in garbage permanently. Each run carries a token so a superseded run cannot clear the live one's timer.

**4. Scroll-velocity reactive background** — scroll distance over time feeds a velocity value, clamped to 3, decaying at `×.92` per frame. It multiplies the canvas time step, so fast scrolling visibly accelerates the background.

**5. Valve dive on navigation** — clicking a nav item runs a 620ms `cubic-bezier(.6,0,.3,1)` transform on the whole stage: scale to 2.6 with a 14px blur while fading out, then an instant cut to 0.86 scale and a resolve back to 1. The page swap commits at the 300ms mark, mid-blur. Alternate page loads use mirrored iris animations so consecutive navigations don't feel identical.

---

## Screensaver

Sixty seconds without a **click** (mouse movement does not count) fades the entire UI to `opacity: 0` over 1.6s and sets `pointer-events: none`, leaving only the canvas, which speeds up by `+0.9` boost. A faint `click to return` label sits at the bottom. Any click restores. Disabled entirely in calm.

---

## The operator door

Six routes, all client-side:

1. Five clicks on the logo (toasts a countdown after the second)
2. The Konami code
3. Typing `sudo` anywhere
4. Dragging the page sideways more than 260px
5. Clicking the `·` in the footer
6. `⌘K` / `Ctrl+K`

Any route opens a modal: two expanding shockwave rings, a dialog on `perspective(1200px) rotateX(26deg)` resolving to flat over 520ms, three fake credential rows, and `authenticate` / `leave`. `authenticate` sets unlocked, opens the panel, and makes the `siteconfig` header button appear permanently. `Esc` closes everything.

### Security

**This is theatre.** There is no authentication, no server, and nothing behind the door but a settings panel. It is a joke about hidden admin panels, and the modal's own copy says as much.

If real authentication is ever wanted, it needs a backend and should not reuse any of this UI. If it stays cosmetic, that is fine — but it must never guard anything that matters, and no unlock route should be presented to a user as security.

---

## siteconfig panel

Right-side drawer, `min(92vw, 420px)`, `padding: 26px`, `gap: 24px`, background `color-mix(in oklab, var(--surface) 94%, transparent)`, `backdrop-filter: blur(22px)`, `box-shadow: -40px 0 90px rgba(0,0,0,.55)`, slides in over 340ms. Sections in order:

1. **Behaviour** — five mode chips, a shuffle button (`--a2` treatment), five scope chips
2. **Palette — 24** — a 3-column swatch grid; each tile shows three accent dots on the palette's own background, selected tile gets an `--a1` border and glow. Picking one forces mode to Static
3. **Layout — 8** — chips
4. **Background — 12** — chips
5. **Typography** — chips
6. **Life signs** — Grain, Breathing, Cursor glow, Calm mode
7. **Share a setup** — the current code in a `<code>` block with a copy button, plus a paste field

Chip style, used throughout: mono 11px, `letter-spacing: .1em`, `padding: 9px 12px`, `border-radius: var(--radius)`, uppercase. Active: `1px solid var(--a1)`, background `color-mix(in oklab, var(--a1) 16%, transparent)`, text `--a1`. Inactive: `1px solid var(--line)`, text `--muted`.

**Toasts** — bottom-centre pill, `1px solid var(--a2)`, `border-radius: 999px`, mono 11px, `letter-spacing: .18em`, uppercase, `box-shadow: 0 0 40px`, auto-dismiss at 2.6s.

---

## State

```
page          one of the nine page ids
pal           palette index (0–23)
layout        layout id
fx            effect id
type          typeface set index (0–4)
mode          randomiser mode id
scope         { pal, layout, fx, type, toggles } — booleans
calm          boolean
grain         boolean
breathe       boolean
cursor        boolean
unlocked      boolean — has the operator door ever been opened
panelOpen     boolean
doorOpen      boolean
doorVia       string — which unlock route fired, shown in the modal
saver         boolean
mailShown     boolean — resets on page change
diving        boolean — mid page-transition
h1Text        string — current scramble frame
nav           integer — increments per navigation, alternates the iris animation
toast, clock  transient
```

Persisted to `localStorage` under `vessel.cfg.v2`, debounced at 250ms: page, pal, layout, fx, type, mode, scope, calm, grain, breathe, cursor, unlocked. Never persisted: panel/door/toast/saver/dive state. Guard the read — a corrupt or absent value must fall back to defaults, never throw.

Non-state refs (deliberately outside React state, since they update per-frame): mouse position, scroll velocity, card element list, keystroke buffer, drag origin, scramble run token.

No data fetching. No backend. Everything is local.

---

## Design tokens

Nine roles per palette: `bg`, `surface`, `line`, `fg`, `muted`, `faint`, `a1`, `a2`, `a3`. Exposed as CSS custom properties. All twenty-four sets are in the `PALETTES` array in the prototype — copy them from there rather than retyping. The six defaults:

| Palette | bg | surface | line | fg | muted | faint | a1 | a2 | a3 |
|---|---|---|---|---|---|---|---|---|---|
| **Nebula Drift** | `#0B0A1F` | `#15142E` | `#272549` | `#E8E7FA` | `#9E9BC7` | `#5D5A85` | `#8B7BFF` | `#FF6FD8` | `#FFD36E` |
| Deep Reef | `#04181E` | `#0B2730` | `#164049` | `#DFF6F4` | `#8DB8B8` | `#4E7076` | `#3FE0C8` | `#4C9BFF` | `#B9FF6E` |
| Vapor Sunset | `#170B2B` | `#23113F` | `#3B1F63` | `#F6E9FF` | `#B79BD6` | `#6E5391` | `#FF71CE` | `#01CDFE` | `#FFF56E` |
| Molten Obsidian | `#141010` | `#201919` | `#3A2A24` | `#F5E9E2` | `#B79C8E` | `#755E52` | `#FF7A3D` | `#FFB347` | `#7CC4FF` |
| Ultraviolet | `#0C0718` | `#160E28` | `#2C1A4A` | `#F0E6FF` | `#AE9AD1` | `#6C5990` | `#B36BFF` | `#6BF0FF` | `#FF6BB3` |
| Arctic Signal | `#08131A` | `#0F2028` | `#1B3745` | `#E2F3FB` | `#93B6C6` | `#557285` | `#6FE0FF` | `#B9F2E6` | `#FFE07A` |

The remaining eighteen: Liquid Chrome, Solarpunk, Halftone Pop, Blueprint, Deco Gold, Holographic, Claymation, Datamosh, Toxic Bloom, Ember Ash, Terracotta Night, Phosphor, Oxide, Signal Flare, Peat, Xerox, Anodised, Sodium.

**Radius** — `16px` default, `2px` in Magazine and Terminal, `3px` in Console, `0` for the borderless row layouts (Ledger, Marginalia, and Stack on desk), `6px` in calm.

**Breakpoints** — 560px and 900px. Only two, deliberately.

**Typography** — five sets, each defining body / display / mono. All system stacks; no webfonts, no network requests.

| Set | Body | Display |
|---|---|---|
| Grotesk *(default)* | `ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif` | same |
| Editorial | `Georgia, 'Iowan Old Style', 'Times New Roman', serif` | same |
| Serif + mono | sans body | `Georgia, 'Iowan Old Style', serif` |
| All mono | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | same |
| Condensed | `'Avenir Next Condensed', 'Helvetica Neue', Impact, sans-serif` | same |

Mono is `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` throughout.

**Type scale** — h1 `clamp(42px, 6.2vw, 90px)` / .96 / -0.035em · h3 `clamp(19px, 1.6vw, 24px)` / 1.25 · lede `clamp(15px, 1.25vw, 19px)` / 1.65 · body 15px / 1.62 · UI mono 11px / .16em · kicker mono 10px / .24em.

**Spacing** — 6 · 9 · 13 · 18 · 22 · 26 · 34 · 40 · 48 · 64. Content max-width 1180px, page padding `0 40px 80px`.

**Shadows** — cards `inset 0 1px 0 color-mix(in oklab, var(--fg) 8%, transparent), 0 20px 50px rgba(0,0,0,.28)` · panel `-40px 0 90px rgba(0,0,0,.55)` · terminal window `0 40px 120px rgba(0,0,0,.5)` · glows `0 0 22–90px color-mix(in oklab, var(--a1) 34–60%, transparent)`.

**Easing** — `cubic-bezier(.2,.8,.2,1)` for UI entrances, `cubic-bezier(.6,0,.3,1)` for the dive, `ease-in-out` for breathing, `linear` for the slow spin.

---

## Responsive

Now designed, not deferred. Three bands, measured from `window.innerWidth` and held in state as `band`:

| Band | Width | |
|---|---|---|
| `phone` | < 560px | |
| `tablet` | 560–899px | |
| `desk` | ≥ 900px | The reference design |

**Adapted layouts.** Rather than letting thirteen layouts degrade unpredictably, small screens collapse to the ones that actually read, and the hero's metadata strip appends ` · adapted` so the state is never silently wrong:

- **phone** — Terminal and Console → **Console**; Contact sheet → **Contact sheet** (2 columns); everything else → **Stack**
- **tablet** — Mosaic, Magazine, Ledger, and Radial → **Cinematic**; the rest unchanged
- The operator's stored choice is never overwritten. It re-emerges when the window widens

**Per-band values.**

| | phone | tablet | desk |
|---|---|---|---|
| Page padding | `0 18px 64px` | `0 26px 72px` | `0 40px 80px` |
| Header padding | `14px 18px` | `16px 26px` | `20px 40px` |
| Stage height | `calc(100vh - 132px)` | `calc(100vh - 132px)` | `calc(100vh - 86px)` |
| Default grid | `1fr` | `auto-fit minmax(260px,1fr)` | `auto-fit minmax(300px,1fr)` |
| Grid gap | 14px | 20px | 20px |
| Valve | hidden | `min(34vw,240px)` | `min(38vw,340px)` |
| h1 | `clamp(34px,10vw,52px)` | — | `clamp(42px,6.2vw,90px)` |
| Hero | column, `gap: 26px`, `padding: 30px 0 26px` | column, `gap: 26px` | row, `gap: 48px` |
| Footer | `26px 0 8px`, 10px type, left-aligned | — | `34px 0 10px`, 11px type, spread |
| Contact sheet | 2 col | 3 col | 4 col |
| Card deck / Side-scroll | `flex: 0 0 82vw` | `0 0 320–340px` | `0 0 320–340px` |

**Nav on small screens** becomes a horizontally scrollable single row (`overflow-x: auto`, `order: 3`, full width, scrollbar hidden, momentum scrolling on) rather than wrapping to three ragged lines. Pills gain `min-height: 44px` and `padding: 13px 16px`.

**Touch.** Nav pills and CTAs now meet 44px on both narrow bands. Cursor-lean card tilt is disabled outside `desk` — it depends on a hovering pointer and only causes jitter on touch. The cursor glow and scroll-velocity boost still work.

Still to decide, and a genuine product question rather than a design gap: whether phones should **default** to calm. The prototype does not, on the grounds that the visual toy is the point and calm is one tap away. Reasonable to disagree.

## Accessibility

Known gaps to close during implementation, none of which are design decisions:

- Buttons need accessible names; the footer `·` unlock needs `aria-hidden` or a real label
- Nav needs `aria-current` on the active page
- Focus-visible styles are not defined anywhere — add them
- The panel needs focus trapping, a labelled dialog role, and focus return on close
- Toasts need a live region
- Several palettes (Peat especially, deliberately) fail WCAG AA on body text. Calm mode is the intended remedy, but verify the default palette passes
- `prefers-reduced-motion` is handled at the app level; also honour it in CSS

## Assets

None. No images, icons, webfonts, or third-party libraries — every graphic is drawn with CSS or canvas, and all glyphs (`▸ ✕ ◈ ↻ ·`) are Unicode. The site makes no network requests at all.

Photo slots are placeholders awaiting real images. When they arrive: strip EXIF, lazy-load, keep the aspect ratios given in each caption, and do not add a lightbox library — the design deliberately has none.

## Files

- `Site v2 - Vessel.dc.html` — **the design reference.** Runs standalone in a browser. All copy, palettes, thirteen layout rules, canvas effects, responsive bands, and interaction logic live here. Resize the window past 900px and 560px to see the bands switch
- `support.js` — prototype runtime only. **Do not port**
- `reference/Site v2 - Kaleidos.dc.html` — a rejected earlier direction, for context only

## Suggested build order

1. Scaffold, routing (nine real URLs — the prototype swaps in place, which is a prototype limitation, not a design decision), token layer, page shell
2. All nine pages with final copy and the Cinematic layout — then Stack and Console, which is what phones actually get
3. The remaining ten layouts, plus the band system and adapted-layout collapsing
4. Canvas effects — start with Vessels, Flow, Pressure
5. siteconfig, persistence, randomiser, share codes
6. Calm mode
7. The five motion systems, then screensaver and the unlock routes
8. Accessibility pass (the responsive work is specced above; the a11y gaps below are not)

Contact must work correctly at every stage. It is the only page with a job.
