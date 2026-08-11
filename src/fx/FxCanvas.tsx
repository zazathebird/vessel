import { useEffect, useRef } from "react";

import { PALETTES } from "../data/palettes";
import type { Config } from "../config/types";

/**
 * The canvas backgrounds. Only "Vessels" (the default) is implemented so far —
 * every other fx id falls back to a cleared canvas rather than crashing. The
 * remaining eleven effects are follow-up work (see design/SPEC.md § "The twelve
 * canvas backgrounds").
 */

interface Branch {
  x: number;
  y: number;
  x2: number;
  y2: number;
  depth: number;
  phase: number;
}

function buildTree(w: number, h: number): Branch[] {
  const branches: Branch[] = [];
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    if (depth > 6 || len < 14) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branches.push({ x, y, x2, y2, depth, phase: Math.random() * 6.28 });
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      grow(x2, y2, ang + (Math.random() - 0.5) * 1.25, len * (0.62 + Math.random() * 0.2), depth + 1);
    }
  };
  grow(w * 0.5, h * 1.05, -Math.PI / 2, h * 0.19, 0);
  grow(-10, h * 0.35, 0.35, w * 0.11, 1);
  grow(w + 10, h * 0.62, Math.PI - 0.4, w * 0.11, 1);
  return branches;
}

export function FxCanvas({ fx, pal, calm }: { fx: Config["fx"]; pal: number; calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tRef = useRef(0);
  const treeRef = useRef<Branch[] | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      if (!canvas.isConnected || document.hidden) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const p = PALETTES[pal] ?? PALETTES[0];
      const mode = calm ? "off" : fx;

      if (mode === "off" || mode !== "vessels") {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      tRef.current += 0.011;
      const t = tRef.current;
      const beat = (Math.sin(t * 1.9) + 1) / 2;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);

      if (!treeRef.current) treeRef.current = buildTree(w, h);
      for (const b of treeRef.current) {
        const near = 1 - Math.min(1, Math.hypot(b.x2 - mx * w, b.y2 - my * h) / 420);
        const wave = (Math.sin(t * 2.2 - b.depth * 0.9 + b.phase) + 1) / 2;
        ctx.strokeStyle = b.depth < 2 ? p.a1 : b.depth < 4 ? p.a2 : p.a3;
        ctx.globalAlpha = 0.1 + wave * 0.2 + near * 0.28;
        ctx.lineWidth = Math.max(1, (7 - b.depth) * (1 + near * 0.5));
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo((b.x + b.x2) / 2 + Math.sin(t + b.phase) * 7, (b.y + b.y2) / 2, b.x2, b.y2);
        ctx.stroke();
        if (b.depth > 3 && wave > 0.82) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = p.fg;
          ctx.beginPath();
          ctx.arc(b.x2, b.y2, 1.8, 0, 6.3);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 0.1 + beat * 0.06;
      const g = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, h * 0.75);
      g.addColorStop(0, p.a1);
      g.addColorStop(1, `${p.bg}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [fx, pal, calm]);

  return <canvas ref={canvasRef} width={1600} height={1000} className="v-canvas" />;
}
