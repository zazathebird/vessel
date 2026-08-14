/**
 * The 24 palettes, copied verbatim from PALETTES in the design prototype
 * (design_handoff_vessel_v2/Site v2 - Vessel.dc.html:288).
 *
 * Nine token roles each. Do not "improve" the values — several palettes
 * (Peat especially) are deliberately low-contrast; calm mode is the remedy.
 */

export type PaletteId =
  | "nebula" | "reef" | "vapor" | "obsidian" | "chrome" | "solar"
  | "halftone" | "blueprint" | "deco" | "holo" | "clay" | "datamosh"
  | "toxic" | "ember" | "arctic" | "uv" | "terracotta" | "phosphor"
  | "oxide" | "flare" | "peat" | "xerox" | "anodised" | "sodium";

export interface Palette {
  id: PaletteId;
  name: string;
  bg: string;
  surface: string;
  line: string;
  fg: string;
  muted: string;
  faint: string;
  a1: string;
  a2: string;
  a3: string;
}

export const PALETTES: Palette[] = [
  { id: "nebula", name: "Nebula Drift", bg: "#0B0A1F", surface: "#15142E", line: "#272549", fg: "#E8E7FA", muted: "#9E9BC7", faint: "#5D5A85", a1: "#8B7BFF", a2: "#FF6FD8", a3: "#FFD36E" },
  { id: "reef", name: "Deep Reef", bg: "#04181E", surface: "#0B2730", line: "#164049", fg: "#DFF6F4", muted: "#8DB8B8", faint: "#4E7076", a1: "#3FE0C8", a2: "#4C9BFF", a3: "#B9FF6E" },
  { id: "vapor", name: "Vapor Sunset", bg: "#170B2B", surface: "#23113F", line: "#3B1F63", fg: "#F6E9FF", muted: "#B79BD6", faint: "#6E5391", a1: "#FF71CE", a2: "#01CDFE", a3: "#FFF56E" },
  { id: "obsidian", name: "Molten Obsidian", bg: "#141010", surface: "#201919", line: "#3A2A24", fg: "#F5E9E2", muted: "#B79C8E", faint: "#755E52", a1: "#FF7A3D", a2: "#FFB347", a3: "#7CC4FF" },
  { id: "chrome", name: "Liquid Chrome", bg: "#101318", surface: "#191E26", line: "#2C333F", fg: "#EAF0F8", muted: "#9FB0C4", faint: "#5F6E80", a1: "#9FD8FF", a2: "#C9D6E4", a3: "#6EE7FF" },
  { id: "solar", name: "Solarpunk", bg: "#0B1A12", surface: "#12271B", line: "#1F402C", fg: "#E6F7E9", muted: "#95BFA2", faint: "#587560", a1: "#5BE38B", a2: "#E8C75B", a3: "#59C8FF" },
  { id: "halftone", name: "Halftone Pop", bg: "#15151E", surface: "#1F1F2C", line: "#33334A", fg: "#FFF8EC", muted: "#B3AEC4", faint: "#6D6885", a1: "#FF4D5E", a2: "#FFD23F", a3: "#3FC1FF" },
  { id: "blueprint", name: "Blueprint", bg: "#0A1428", surface: "#0F1E3B", line: "#1D3560", fg: "#DCE9FF", muted: "#8FA9D4", faint: "#54689B", a1: "#5FA8FF", a2: "#9FD0FF", a3: "#FFCF6E" },
  { id: "deco", name: "Deco Gold", bg: "#141109", surface: "#1F1A0F", line: "#3B301A", fg: "#F7EEDA", muted: "#BFAE8B", faint: "#7A6C50", a1: "#D9B45B", a2: "#E8D9A8", a3: "#7FB3A8" },
  { id: "holo", name: "Holographic", bg: "#0E0F1A", surface: "#171A2A", line: "#2A2F49", fg: "#EFF2FF", muted: "#A5ACD1", faint: "#636A93", a1: "#7CE7FF", a2: "#FF9CF0", a3: "#B6FF9C" },
  { id: "clay", name: "Claymation", bg: "#1C1826", surface: "#282235", line: "#3D3550", fg: "#F5EFFA", muted: "#B6A9C9", faint: "#736689", a1: "#FF9E7D", a2: "#8DD6C2", a3: "#F5D06E" },
  { id: "datamosh", name: "Datamosh", bg: "#0D0D14", surface: "#16161F", line: "#2B2B3C", fg: "#EDEDF6", muted: "#A0A0B8", faint: "#5F5F78", a1: "#FF2E88", a2: "#00E5FF", a3: "#D6FF3D" },
  { id: "toxic", name: "Toxic Bloom", bg: "#0F1A0C", surface: "#182814", line: "#274022", fg: "#EDF7E4", muted: "#A6BF95", faint: "#66805A", a1: "#BFFF3D", a2: "#5BE3C4", a3: "#FFE55B" },
  { id: "ember", name: "Ember Ash", bg: "#171215", surface: "#221B20", line: "#3A2C33", fg: "#F6EAEE", muted: "#BCA3AE", faint: "#786370", a1: "#FF6B8A", a2: "#FFA96B", a3: "#9DBBFF" },
  { id: "arctic", name: "Arctic Signal", bg: "#08131A", surface: "#0F2028", line: "#1B3745", fg: "#E2F3FB", muted: "#93B6C6", faint: "#557285", a1: "#6FE0FF", a2: "#B9F2E6", a3: "#FFE07A" },
  { id: "uv", name: "Ultraviolet", bg: "#0C0718", surface: "#160E28", line: "#2C1A4A", fg: "#F0E6FF", muted: "#AE9AD1", faint: "#6C5990", a1: "#B36BFF", a2: "#6BF0FF", a3: "#FF6BB3" },
  { id: "terracotta", name: "Terracotta Night", bg: "#1A1310", surface: "#261C17", line: "#412F26", fg: "#F8EDE4", muted: "#C0A492", faint: "#7C6555", a1: "#E88C5A", a2: "#D6B98C", a3: "#7FA9A0" },
  { id: "phosphor", name: "Phosphor", bg: "#070C08", surface: "#0E160F", line: "#1D2C1F", fg: "#DCF7DF", muted: "#8FB897", faint: "#54725B", a1: "#4BFF7A", a2: "#00E5A0", a3: "#D8FF5B" },
  { id: "oxide", name: "Oxide", bg: "#150F0C", surface: "#221713", line: "#3D251C", fg: "#F2E2D8", muted: "#B79483", faint: "#775a4c", a1: "#C4552E", a2: "#8C6E5C", a3: "#B8342F" },
  { id: "flare", name: "Signal Flare", bg: "#080809", surface: "#111113", line: "#242427", fg: "#F2F2F3", muted: "#9C9CA1", faint: "#5C5C62", a1: "#FF5A00", a2: "#C4C4C8", a3: "#8A8A90" },
  { id: "peat", name: "Peat", bg: "#12140F", surface: "#1B1E16", line: "#2C3125", fg: "#DDE2D3", muted: "#98A089", faint: "#606856", a1: "#7E9160", a2: "#9A8A63", a3: "#6E8478" },
  { id: "xerox", name: "Xerox", bg: "#111112", surface: "#1B1B1D", line: "#2E2E31", fg: "#EDEDEE", muted: "#9B9B9F", faint: "#5E5E63", a1: "#00B8C4", a2: "#B4B4B8", a3: "#7A7A7F" },
  { id: "anodised", name: "Anodised", bg: "#0C0F16", surface: "#151A24", line: "#26303F", fg: "#E4EBF5", muted: "#97A5BA", faint: "#5B687D", a1: "#6E8CFF", a2: "#A98CFF", a3: "#7FD4E8" },
  { id: "sodium", name: "Sodium", bg: "#0A0F1C", surface: "#111829", line: "#1F2A45", fg: "#F2E9D8", muted: "#B0A78F", faint: "#6E6A5C", a1: "#FFA028", a2: "#FFC97A", a3: "#5E8BC4" },
];

/** Nebula Drift — what a stranger sees on a first visit. A settled product decision. */
export const DEFAULT_PALETTE_INDEX = 0;

/** Palettes that fail contrast badly enough that grain on top is unreadable. */
export const LOW_CONTRAST: PaletteId[] = ["peat", "oxide", "terracotta", "deco"];

/** Time-of-day mapping, by hour. Ordered; first match wins. */
export const TIME_OF_DAY: { until: number; palette: PaletteId }[] = [
  { until: 6, palette: "uv" },
  { until: 10, palette: "arctic" },
  { until: 15, palette: "reef" },
  { until: 19, palette: "vapor" },
  { until: 22, palette: "obsidian" },
  { until: 24, palette: "nebula" },
];

export function paletteIndexForHour(hour: number): number {
  const entry = TIME_OF_DAY.find((t) => hour < t.until) ?? TIME_OF_DAY[TIME_OF_DAY.length - 1];
  const idx = PALETTES.findIndex((p) => p.id === entry.palette);
  return idx === -1 ? DEFAULT_PALETTE_INDEX : idx;
}
