/**
 * The eight new costumes, in the idiom of `src/fx/fighters.ts`.
 *
 * Paste these entries into `FIGHTERS` and add their ids to `FighterStyle` and
 * `BLADE_COLORS` (see BRIEF.md for the ids to delete first). They call the
 * file's own `ink()` and `solid()` helpers and nothing else, so the carve in
 * CARVE.md reaches them without any edit here.
 *
 * Geometry is verbatim from the roster sheet the client signed off
 * (`reference/Roster.dc.html`). `headroom` is the measured reach rounded up —
 * see MEASUREMENTS.md; the two the sheet under-declared are corrected here.
 * The `- c.vx * n` trail terms are the only additions: the sheet is static, so
 * nothing in it trailed with travel.
 */
import type { Costume, FighterKind, FighterStyle } from "./fighters";

export const NEW_COSTUMES: Partial<Record<FighterStyle, FighterKind>> = {
  prophet: {
    label: "The Prophet", side: "good",
    prop: { shoulder: 1.04, weight: 1.08, hunch: -0.6, head: 1, build: 0.3 },
    stance: { settle: -2, spread: 7, heel: 0 }, headroom: 29,
    head: (ctx, c) => {
      const r = c.hr;
      // hair off the back of the skull first, so the beard overlaps it
      ctx.beginPath();
      ctx.moveTo(-r + 3, c.hy - r + 1);
      ctx.quadraticCurveTo(-r - 8, c.hy + 4, -r - 5, c.hy + 17);
      ctx.quadraticCurveTo(-r + 1, c.hy + 7, -r + 4, c.hy - 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.2);
      // beard: closes the head into one mass and runs to the chest
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 3, c.hy + 15, -2, c.hy + 25);
      ctx.quadraticCurveTo(5, c.hy + 20, r - 1, c.hy + 1);
      ctx.quadraticCurveTo(0, c.hy + 9, -r + 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
      const bob = Math.sin(c.t * 0.04 + c.phase) * 1.5;
      ctx.strokeStyle = c.blade;
      ctx.globalAlpha = 0.95 * c.dim;
      ctx.lineWidth = c.lw(2.4);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 15 + bob, 13.5, 4.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.28 * c.dim;
      ctx.lineWidth = c.lw(1.6);
      ctx.beginPath();
      ctx.ellipse(0, c.hy - 17.5 + bob, 18, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.028 + c.phase) * 1.3 - c.vx * 1.4;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 3, c.hipY - 9);
      ctx.quadraticCurveTo(-15, c.hipY + 14, -14 + sway, c.feetY - 1);
      ctx.quadraticCurveTo(sway, c.feetY + 4, 13 + sway * 0.6, c.feetY - 2);
      ctx.quadraticCurveTo(14, c.hipY + 14, c.hipX + 3, c.hipY - 9);
      ctx.closePath();
      solid(ctx, c, 0.34, 2.8, 0.85);
    },
    overlay: (ctx, c) => {
      ink(ctx, c, 2.6, 0.8);
      ctx.moveTo(-c.shX + 1, c.shY + 4);
      ctx.quadraticCurveTo(0, c.shY + 11, c.shX - 1, c.shY + 4);
      ctx.stroke();
    },
  },

  luchador: {
    label: "The Luchador", side: "good",
    prop: { shoulder: 1.26, weight: 1.24, hunch: 0, head: 1.06, build: 0.95 },
    stance: { settle: 3, spread: 13, heel: 0 }, headroom: 26,
    head: (ctx, c) => {
      const r = c.hr + 1;
      ctx.beginPath();
      ctx.moveTo(-r, c.hy + 5);
      ctx.quadraticCurveTo(-r - 1, c.hy - r - 2, 0, c.hy - r - 2);
      ctx.quadraticCurveTo(r + 1, c.hy - r - 2, r, c.hy + 5);
      ctx.quadraticCurveTo(0, c.hy + 11, -r, c.hy + 5);
      ctx.closePath();
      solid(ctx, c, 0.94, 2.6);
      // a blunt crest fore-and-aft, half a head clear of the dome
      ctx.beginPath();
      ctx.moveTo(-r + 4, c.hy - r);
      ctx.quadraticCurveTo(-3, c.hy - r - 13, 6, c.hy - r - 9);
      ctx.quadraticCurveTo(r + 2, c.hy - r - 5, r - 4, c.hy - r + 1);
      ctx.quadraticCurveTo(0, c.hy - r - 5, -r + 4, c.hy - r);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.2);
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-9.5, c.hipY - 3);
      ctx.lineTo(9.5, c.hipY - 3);
      ctx.lineTo(10, c.hipY + 3);
      ctx.lineTo(-10, c.hipY + 3);
      ctx.closePath();
      solid(ctx, c, 0.5, 2.4, 0.9);
    },
    back: (ctx, c) => {
      const trail = Math.sin(c.t * 0.035 + c.phase) * 1.6 - c.vx * 1.8;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY - 3);
      ctx.quadraticCurveTo(-16 + trail, c.shY + 14, -13 + trail, c.hipY + 8);
      ctx.quadraticCurveTo(-2, c.hipY + 12, 8 + trail * 0.5, c.hipY + 3);
      ctx.quadraticCurveTo(-2, c.shY + 8, -c.shX - 1, c.shY - 3);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },

  astronaut: {
    label: "The Astronaut", side: "good",
    prop: { shoulder: 1.22, weight: 1.3, hunch: 0, head: 1.3, build: 0.85 },
    stance: { settle: 4, spread: 11, heel: 0 }, headroom: 20,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(1, c.hy - 1, r + 2, r + 2.5, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // visor band: a wide chord across the front of the dome
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - 3);
      ctx.quadraticCurveTo(1, c.hy - 9, r + 2, c.hy - 4);
      ctx.quadraticCurveTo(r + 1, c.hy + 4, 1, c.hy + 5);
      ctx.quadraticCurveTo(-r + 1, c.hy + 3, -r + 1, c.hy - 3);
      ctx.closePath();
      solid(ctx, c, 0.4, 2.4, 0.95);
      // collar ring
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy + r + 1);
      ctx.lineTo(r + 1, c.hy + r + 1);
      ctx.lineTo(r + 1.5, c.hy + r + 5);
      ctx.lineTo(-r + 0.5, c.hy + r + 5);
      ctx.closePath();
      solid(ctx, c, 0.6, 2.4, 0.95);
      ink(ctx, c, 2, 0.85);
      ctx.moveTo(-r + 1, c.hy - r + 1);
      ctx.lineTo(-r - 3, c.hy - r - 6);
      ctx.stroke();
    },
    back: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 2, c.shY - 4);
      ctx.lineTo(-c.shX + 8, c.shY - 5);
      ctx.lineTo(-c.shX + 7, c.hipY - 1);
      ctx.lineTo(-c.shX - 4, c.hipY + 1);
      ctx.closePath();
      solid(ctx, c, 0.66, 2.8, 0.95);
      ink(ctx, c, 2.2, 0.8);
      ctx.moveTo(-c.shX - 1, c.shY + 6);
      ctx.quadraticCurveTo(-c.shX - 9, c.shY + 14, -c.shX - 2, c.hipY + 2);
      ctx.stroke();
    },
  },

  gunslinger: {
    label: "The Gunslinger", side: "good",
    prop: { shoulder: 1.06, weight: 1, hunch: 0.6, head: 0.98, build: 0.2 },
    stance: { settle: 2, spread: 13, heel: 0 }, headroom: 21,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 2, r + 9, 3.2, -0.08, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.4);
      // crown with a dent in the top
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy - r + 1);
      ctx.lineTo(-r + 3, c.hy - r - 9);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r - 3, c.hy - r - 9);
      ctx.lineTo(r - 2, c.hy - r + 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // kerchief knot under the jaw
      ctx.beginPath();
      ctx.moveTo(-r + 2, c.hy + 4);
      ctx.quadraticCurveTo(0, c.hy + 13, r - 1, c.hy + 4);
      ctx.quadraticCurveTo(0, c.hy + 8, -r + 2, c.hy + 4);
      ctx.closePath();
      solid(ctx, c, 0.5, 2.2, 0.9);
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.034 + c.phase) * 1.7 - c.vx * 2.2;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 3);
      ctx.quadraticCurveTo(-16 + sway, c.hipY + 8, -19 + sway, c.feetY - 13);
      ctx.lineTo(-6 + sway, c.feetY - 11);
      ctx.lineTo(-2 + sway, c.hipY + 6);
      ctx.lineTo(4, c.hipY + 6);
      ctx.lineTo(8 + sway * 0.5, c.feetY - 11);
      ctx.lineTo(19 + sway * 0.5, c.feetY - 14);
      ctx.quadraticCurveTo(15, c.hipY + 8, c.shX + 1, c.shY + 3);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },

  pharaoh: {
    label: "The Pharaoh", side: "evil",
    prop: { shoulder: 1.08, weight: 1.08, hunch: 0, head: 1, build: 0.4 },
    stance: { settle: -1, spread: 9, heel: 0 }, headroom: 18,
    head: (ctx, c) => {
      const r = c.hr;
      // nemes: narrow at the crown, flaring out past the shoulders
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r - 2);
      ctx.quadraticCurveTo(0, c.hy - r - 5, r - 1, c.hy - r - 2);
      ctx.lineTo(r + 4, c.hy + 10);
      ctx.lineTo(r - 1, c.hy + 11);
      ctx.lineTo(r - 3, c.hy + 1);
      ctx.lineTo(-r + 3, c.hy + 1);
      ctx.lineTo(-r + 1, c.hy + 11);
      ctx.lineTo(-r - 4, c.hy + 10);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.6);
      // false beard: a straight bar off the chin
      ctx.beginPath();
      ctx.moveTo(-3, c.hy + 5);
      ctx.lineTo(4, c.hy + 5);
      ctx.lineTo(3, c.hy + 20);
      ctx.lineTo(-2, c.hy + 20);
      ctx.closePath();
      solid(ctx, c, 0.88, 2.4);
      // uraeus hooking forward off the brow
      ink(ctx, c, 2.4, 0.9);
      ctx.moveTo(0, c.hy - r - 1);
      ctx.quadraticCurveTo(6, c.hy - r - 6, 10, c.hy - r - 2);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 3, c.shY + 3);
      ctx.quadraticCurveTo(0, c.shY + 12, c.shX + 3, c.shY + 3);
      ctx.quadraticCurveTo(0, c.shY + 6, -c.shX - 3, c.shY + 3);
      ctx.closePath();
      solid(ctx, c, 0.8, 2.4, 0.9);
    },
  },

  viking: {
    label: "The Viking", side: "good",
    prop: { shoulder: 1.3, weight: 1.3, hunch: 0.4, head: 1.02, build: 0.9 },
    stance: { settle: 4, spread: 14, heel: 0 }, headroom: 17,
    head: (ctx, c) => {
      const r = c.hr;
      // beard first: a wide wedge to the chest
      ctx.beginPath();
      ctx.moveTo(-r - 1, c.hy + 1);
      ctx.quadraticCurveTo(-r - 4, c.hy + 13, -1, c.hy + 21);
      ctx.quadraticCurveTo(r + 3, c.hy + 12, r + 1, c.hy + 1);
      ctx.quadraticCurveTo(0, c.hy + 8, -r - 1, c.hy + 1);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.6);
      // helm: rounded cap with a flared rim and a nasal bar
      ctx.beginPath();
      ctx.moveTo(-r - 3, c.hy + 1);
      ctx.quadraticCurveTo(-r - 3, c.hy - r - 5, 0, c.hy - r - 5);
      ctx.quadraticCurveTo(r + 3, c.hy - r - 5, r + 3, c.hy + 1);
      ctx.lineTo(r + 5, c.hy + 3);
      ctx.lineTo(-r - 5, c.hy + 3);
      ctx.closePath();
      solid(ctx, c, 0.94, 2.8);
      ink(ctx, c, 2.2, 0.9);
      ctx.moveTo(1, c.hy + 2);
      ctx.lineTo(1, c.hy + 8);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      // round shield on the off hand
      ctx.beginPath();
      ctx.ellipse(c.offHand.x - 2, c.offHand.y + 3, 12, 12.5, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.6, 2.8, 0.95);
      ctx.beginPath();
      ctx.ellipse(c.offHand.x - 2, c.offHand.y + 3, 3.4, 3.6, 0, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.2, 0.9);
    },
  },

  anubis: {
    label: "The Anubis", side: "evil",
    prop: { shoulder: 1.1, weight: 1.06, hunch: 0, head: 0.94, build: 0.5 },
    stance: { settle: 1, spread: 11, heel: 0 }, headroom: 30,
    head: (ctx, c) => {
      const r = c.hr;
      // two tall tapered ears, standing straight up and well apart
      for (const s of [-1, 1]) {
        const a = s < 0 ? 1 : 0.78;
        ctx.beginPath();
        ctx.moveTo(s * (r - 4), c.hy - r + 3);
        ctx.quadraticCurveTo(s * (r + 1), c.hy - r - 12, s * (r - 2), c.hy - r - 19);
        ctx.quadraticCurveTo(s * (r - 6), c.hy - r - 8, s * (r - 7), c.hy - r + 2);
        ctx.closePath();
        solid(ctx, c, 0.88 * a, 2.4, a);
      }
      // muzzle: a long wedge forward, clear of the shoulders
      ctx.beginPath();
      ctx.moveTo(0, c.hy - 3);
      ctx.quadraticCurveTo(r + 10, c.hy - 2, r + 15, c.hy + 6);
      ctx.quadraticCurveTo(r + 4, c.hy + 9, 0, c.hy + 7);
      ctx.closePath();
      solid(ctx, c, 0.9, 2.4);
    },
    overlay: (ctx, c) => {
      ctx.beginPath();
      ctx.moveTo(-c.shX - 4, c.shY + 2);
      ctx.quadraticCurveTo(0, c.shY + 13, c.shX + 4, c.shY + 2);
      ctx.quadraticCurveTo(0, c.shY + 5, -c.shX - 4, c.shY + 2);
      ctx.closePath();
      solid(ctx, c, 0.78, 2.4, 0.9);
    },
    back: (ctx, c) => {
      const sway = Math.sin(c.t * 0.032 + c.phase) * 1.5 - c.vx * 2;
      ctx.beginPath();
      ctx.moveTo(-c.hipX - 2, c.hipY - 6);
      ctx.quadraticCurveTo(-12, c.hipY + 10, -11 + sway, c.feetY - 18);
      ctx.quadraticCurveTo(0, c.feetY - 13, 10 + sway * 0.6, c.feetY - 19);
      ctx.quadraticCurveTo(11, c.hipY + 9, c.hipX + 2, c.hipY - 6);
      ctx.closePath();
      solid(ctx, c, 0.28, 2.6, 0.88);
    },
  },

  ringmaster: {
    label: "The Ringmaster", side: "evil",
    prop: { shoulder: 1.14, weight: 1.04, hunch: 0, head: 0.96, build: 0.35 },
    stance: { settle: -2, spread: 11, heel: 4 }, headroom: 30,
    head: (ctx, c) => {
      const r = c.hr;
      ctx.beginPath();
      ctx.ellipse(-1, c.hy - r + 1, r + 6, 3, -0.06, 0, Math.PI * 2);
      ctx.closePath();
      solid(ctx, c, 0.86, 2.4);
      // tall stovepipe crown, taller than it is wide
      ctx.beginPath();
      ctx.moveTo(-r + 1, c.hy - r);
      ctx.lineTo(-r, c.hy - r - 19);
      ctx.lineTo(r - 1, c.hy - r - 19);
      ctx.lineTo(r - 2, c.hy - r);
      ctx.closePath();
      solid(ctx, c, 0.92, 2.8);
      // moustache, so the head shape is not a bare oval under the hat
      ink(ctx, c, 2.4, 0.85);
      ctx.moveTo(-4, c.hy + 4);
      ctx.quadraticCurveTo(0, c.hy + 7, 5, c.hy + 3);
      ctx.stroke();
    },
    overlay: (ctx, c) => {
      // high collar standing off the neck
      for (const s of [-1, 1]) {
        ink(ctx, c, 2.4, 0.85);
        ctx.moveTo(s * 3, c.shY - 1);
        ctx.lineTo(s * 9, c.shY - 9);
        ctx.stroke();
      }
    },
    back: (ctx, c) => {
      const flick = Math.sin(c.t * 0.038 + c.phase) * 1.8 - c.vx * 2.2;
      ctx.beginPath();
      ctx.moveTo(-c.shX - 1, c.shY + 2);
      ctx.quadraticCurveTo(-15 + flick, c.hipY + 6, -18 + flick, c.feetY - 20);
      ctx.lineTo(-7 + flick, c.feetY - 19);
      ctx.lineTo(-2, c.hipY + 4);
      ctx.lineTo(4, c.hipY + 4);
      ctx.lineTo(9 + flick * 0.5, c.feetY - 19);
      ctx.lineTo(18 + flick * 0.5, c.feetY - 22);
      ctx.quadraticCurveTo(15, c.hipY + 6, c.shX + 1, c.shY + 2);
      ctx.closePath();
      solid(ctx, c, 0.3, 2.6, 0.9);
    },
  },
};
