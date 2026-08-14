/**
 * Named presets — a point in the config space with a name on it.
 *
 * Three of them, from the 2026-08-14 HUD proposal. Two are pure configuration
 * (Patch Bay and Standing Wave use nothing that did not already exist) and one,
 * Cold Open, is what the new palette, the `hud` archetype and the two new
 * effects were built for.
 *
 * **A preset is defined structurally and its share code is derived, never
 * typed.** A hardcoded `"N-7-5-3-5-3"` would be correct until the day something
 * is appended to a catalogue and then silently wrong — and the wrongness would
 * be a working code pointing at the wrong palette, which is the failure mode the
 * whole wire-format discipline exists to prevent. `encodeShareCode` reads the
 * same indices the decoder will, so the two cannot disagree.
 *
 * Applying one goes through `decodeShareCode` at the call site, exactly as
 * pasting a code or applying a saved setup does — including pinning the
 * randomiser to Static, which is what a person choosing a specific look means.
 */

import { PALETTES } from "./palettes";
import type { FxId, LayoutId } from "./catalog";
import type { OrnamentId } from "./ornaments";
import { TYPESETS } from "./catalog";
import type { PaletteId } from "./palettes";
import type { Config } from "../config/types";
import { encodeShareCode } from "../config/shareCode";
import { DEFAULT_CONFIG } from "../config/types";

interface PresetSpec {
  id: string;
  name: string;
  /** One line, in the site's voice, for the panel and the command palette. */
  note: string;
  palette: PaletteId;
  layout: LayoutId;
  fx: FxId;
  ornament: OrnamentId;
  type: (typeof TYPESETS)[number]["id"];
  grain: boolean;
  breathe: boolean;
  cursor: boolean;
}

const SPECS: PresetSpec[] = [
  {
    id: "patchbay",
    name: "Patch Bay",
    note: "Sodium light, dense panels at three depths, a network drifting behind them.",
    palette: "sodium",
    layout: "mosaic",
    fx: "constellation",
    ornament: "orrery",
    type: "allmono",
    grain: true,
    breathe: false,
    cursor: true,
  },
  {
    id: "coldopen",
    name: "Cold Open",
    note: "Overlapping panels on three planes, a sweep behind them, one alarm colour.",
    palette: "coldopen",
    layout: "hud",
    fx: "scan",
    ornament: "aperture",
    type: "allmono",
    grain: false,
    breathe: false,
    cursor: true,
  },
  {
    id: "standingwave",
    name: "Standing Wave",
    note: "HUD furniture on a reading layout. A serif headline over data that never resolves.",
    palette: "anodised",
    layout: "cinematic",
    fx: "flow",
    ornament: "lens",
    type: "mixed",
    grain: true,
    breathe: true,
    cursor: true,
  },
];

export interface Preset {
  id: string;
  name: string;
  note: string;
  /** The same string the panel's copy button yields for this look. */
  shareCode: string;
}

function toConfig(spec: PresetSpec): Config {
  const pal = PALETTES.findIndex((palette) => palette.id === spec.palette);
  const type = TYPESETS.findIndex((typeset) => typeset.id === spec.type);
  return {
    ...DEFAULT_CONFIG,
    // A missing id would encode as index -1, which `encodeShareCode` floors to
    // 0 — a code that works and is wrong. Failing loudly here instead keeps that
    // out of a build: these ids are written by hand and the catalogues are not.
    pal: pal === -1 ? raise(`preset ${spec.id}: no palette ${spec.palette}`) : pal,
    type: type === -1 ? raise(`preset ${spec.id}: no typeset ${spec.type}`) : type,
    layout: spec.layout,
    fx: spec.fx,
    ornament: spec.ornament,
    grain: spec.grain,
    breathe: spec.breathe,
    cursor: spec.cursor,
    calm: false,
    mode: "static",
  };
}

function raise(message: string): never {
  throw new Error(message);
}

export const PRESETS: Preset[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  note: spec.note,
  shareCode: encodeShareCode(toConfig(spec)),
}));
