# Start here — handoff to Fable, 2026-08-17

Paste this file's path as your first instruction, or just read it. It is written to be the
*whole* briefing, so you do not need the conversation it came from.

---

## 0. The standing instruction, before anything else

**Load every skill that applies to the task, before you start it — and say in your reply which
ones you loaded.**

This is a direct client instruction, given three times in one session and in these words:
*"always fucking use skills as applicable to whichever task is at hand… if they will help and
improve the quality of the project created."* It is also written into `CLAUDE.md` under
*Use the skills*.

The failure it is correcting is **silence**, not omission: the previous session did load the right
skills and simply never mentioned it, so the client had to ask three separate times whether any
work was being done properly. A skill used without saying so is indistinguishable from a skill
skipped. Name them in the first paragraph of your reply.

The ones that earn their keep on this project:

| Skill | When |
|---|---|
| **`verify-site`** | Anything that must be *seen*. Non-negotiable for layout/band/theme work — it encodes four environment traps that have each cost a session. |
| **`frontend-design`** | Any visual or graphic work. Standing client instruction. |
| **`code-review`** / **`security-review`** | Before any deploy touching `worker/` or `src/auth`. |
| **`dataviz`**, **`artifact-design`**, **`artifact-diagramming`** | Charts, or anything published as an artifact. |

The client has also given standing authorisation for **subagents and workflows** — use them for
breadth without asking. Do not ask permission to be thorough; ask permission before anything
outward-facing (deploying, publishing, sending).

## 1. What you are working on

**mcclevarty.ca** — a personal site for an independent computer-repair operator. React 18 + Vite +
TypeScript on a Cloudflare Worker. Branch `hud-pass`.

**`CLAUDE.md` is the authority and it is long for a reason**: nearly every paragraph is a bug that
already shipped once. Read it before touching anything. In particular:

- Appending to `FX`, `LAYOUTS`, `PALETTES`, `ORNAMENTS` is safe; **inserting or deleting is not** —
  share codes encode array *indices*, so a deletion silently repoints every code in circulation.
  Withdraw things with the `hidden` flag instead. This mechanism is now used for real (see §3).
- `npm run check` is the gate and it is cheap. `npm run check:fast` runs automatically after every
  edit to `src/`, `worker/` or `scripts/`.
- **When you fix a bug that got past the checks, add a check.** That is the discipline of this
  repo and it is not optional.
- Animation cannot be watched in this environment (`rAF` parks, `prefers-reduced-motion` is forced
  on). Do not conclude a thing looks right — either step it in Node, or seek the animation with
  `getAnimations()` and sample it. Say plainly when something could not be observed.

## 2. The client, and how to work with them

- They are **not** looking for hedging or for a survey of options. Decide, build it, show it.
- They **do** want to be told when something was skipped, when a claim is unverified, and when a
  safety rule blocked work. Their global instruction: if a safeguard changes what you deliver, stop
  and say so plainly — never silently soften or work around it.
- They notice duplication, overlap and anything that looks unfinished, and they are usually right.
  The phrase *"looks like it was created by a highschool kid"* was, on inspection, a real geometry
  bug that had been live for three days.
- **One live constraint you will hit:** creating accounts and entering passwords are prohibited for
  the assistant even with explicit standing permission from the client. They have offered it; it
  still does not apply. Say so once, plainly, offer to drive everything up to the keystrokes, and
  do not re-litigate it.

## 3. What this session did — all in the working tree, **not committed**

`npm run check` passes: 10 checks. Nothing below is committed; `git diff` shows all of it.
**The signup-field fix (a) is deployed; (b) and (c) are not.**

### (a) The signup form was 210px wide — *deployed*, version `87fdf385`
`.v-account` sits directly under `.v-stage`, and Side-scroll's stage is a horizontally scrolling
flex row — so the form became a filmstrip cell. Measured 210px on desk against 472px in the other
thirteen layouts; after the reveal button's 68px reserve that is **~8 characters** of a
12-character minimum password, on the one form with no recovery from a typo. Fixed with an explicit
`width` (a `max-width` cannot stop a flex item shrinking), the stage opting out via
`:has(.v-account)`, and larger account inputs. Now 51 characters on desk, 46–47 tablet, 29 phone,
zero horizontal overflow, identical across all five typesets and in calm.

### (b) Radial's dial was never a circle — *not deployed*
Positions were enumerated as percentages of **each pill's own box**, so the radius varied with the
label length: measured radii 54/93/113/54/83/113px. Then `scams` joined `NAV` on 2026-08-14 making
it seven, the seventh pill matched no `:nth-child` rule, took no transform, and sat **dead centre**
on top of the others — *Guestbook* overlapping *Contact* by 95×34px. Rebuilt from `--i`/`--n` set
inline from the data: all seven now at r=207.9px, bearings 51.4° apart, **zero overlaps**, and
adding an eighth page is a `NAV` change and nothing else.

**Also: the header's nav row now stands down on Radial** (`.v-pill-nav`), because the dial is the
navigation there — the client's objection was the same seven links appearing twice in one viewport.
Three things keep that safe and must not be undone: operator tabs are excluded from the hiding;
Radial only exists on the desk band; and `Ornament.tsx` keeps the slot on Radial even at ornament
`"None"`, so navigation cannot be switched off by a setting that says nothing about navigation.

### (c) A sonar scope replaced the circular ornaments — *not deployed*
Client: *"the circles, what looks like HAL from 2001, and the other lame layouts need to go… a
sonar with sweeping radar ping would be better."*

`sonar` is **appended at index 7** and is the new `DEFAULT_ORNAMENT`. Lens, Valve, Aperture and
Orrery are **`hidden`**, not deleted — the `PICKABLE_FX` mechanism, applied to ornaments for the
first time (`PICKABLE_ORNAMENTS`). Old share codes still resolve to them.

CSS only, palette tokens only, so it recolours with the 0.9s bleed. The one non-obvious part:
each contact's flare is `animation-delay`-matched to the moment the beam's leading edge reaches its
bearing, so **the light comes from the sweep**. Verified by pausing and seeking the animations —
all three flare at their own bearing and nowhere else. The arithmetic is written out in
`chrome.css`; **if you retime the beam, every delay is wrong.**

## 4. What is next — the client asked for this and it is not started

> *"load as many development and graphical and whatever other skills you can think of to reimagine
> the layouts and designs of the themes of this site. full audit and redo if needed."*

A **full audit of all fourteen layouts across the three bands**, then redesign where warranted. It
has not begun. Suggested shape:

1. **Measure first, on the bench.** `sitelab.html?all=1&band=<phone|tablet|desk>` renders every
   layout at once; `?_f=1&layout=<id>&path=<route>` is one frame you can size with an iframe.
   `resize_window` silently fails here — the iframe is the only way to reach a band.
2. **Sweep for the defects that are facts, not taste**: element overlap (the Radial bug was found
   this way), horizontal overflow, unreachable navigation, controls under 44px on touch bands,
   text over the canvas with no wash, duplicated affordances.
3. **Then judge the taste questions** with `frontend-design` loaded, one layout at a time, and show
   the client screenshots rather than descriptions.
4. The client's stated dislikes so far: meaningless circles, anything that reads as unfinished,
   anything that duplicates itself, and anything they have to ask "wtf is this" about. A shape is
   allowed to be a circle **if it depicts an instrument** — that is exactly why sonar was accepted
   where the lens was not.

`docs/DECISIONS.md` has the full measurements for everything above; `TODO.md` is the ordered
backlog and is newer than `CLAUDE.md` where they disagree.

## 5. Immediately useful commands

```sh
npm run dev          # Vite, no API — the bench lives here (sitelab.html, fxlab.html)
npm run dev:worker   # full stack with local D1, needed for anything under /api
npm run check        # the gate — run it, and add to it when you fix something it missed
npm run deploy       # never bare `wrangler deploy`; ask the client before deploying
```
