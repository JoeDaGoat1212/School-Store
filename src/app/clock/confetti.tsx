"use client";

import { useEffect, useRef } from "react";

/**
 * A burst of brand-colored confetti from the middle of the screen, about two
 * seconds long. Change `burst` to fire it again. Skipped for people who've
 * asked their device for less motion.
 */
export function Confetti({ burst, colors }: { burst: number; colors: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!burst || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (el.width = window.innerWidth * dpr);
    const h = (el.height = window.innerHeight * dpr);

    const pieces = Array.from({ length: 160 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (6 + Math.random() * 14) * dpr;
      return {
        x: w / 2,
        y: h * 0.42,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 8 * dpr,
        size: (5 + Math.random() * 7) * dpr,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.3,
      };
    });

    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - frame / 120);
      for (const p of pieces) {
        p.vy += 0.45 * dpr; // gravity
        p.vx *= 0.985; // air
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.vspin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (frame < 120) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [burst, colors]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[60] size-full" />;
}
