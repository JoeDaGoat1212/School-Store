"use client";

import { useEffect, useRef } from "react";

/**
 * Glowing embers drifting up behind the hero, drawn on a <canvas>.
 *
 * - Turned off completely when the phone/computer has "reduce motion" on.
 * - Pauses when the hero is scrolled out of view or the tab is in the
 *   background, so it doesn't drain batteries.
 */

type Ember = { x: number; y: number; vy: number; r: number; life: number; max: number; phase: number; teal: boolean };

const ORANGES = ["255,90,31", "255,138,61", "255,182,110"];
const TEAL = "19,168,160";

export function Embers({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let embers: Ember[] = [];
    let frame = 0;
    let last = performance.now();
    let visible = true;

    const spawn = (anywhere: boolean): Ember => ({
      x: Math.random() * width,
      // New embers start at the bottom; the first batch is spread out.
      y: anywhere ? Math.random() * height : height + 10,
      vy: 18 + Math.random() * 46, // pixels per second, upward
      r: 0.8 + Math.random() * 2.2,
      life: 0,
      max: 3 + Math.random() * 5, // seconds
      phase: Math.random() * Math.PI * 2,
      teal: Math.random() < 0.12,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // About one ember per 20px of width, capped for slower phones.
      const count = Math.min(70, Math.round(width / 20));
      embers = Array.from({ length: count }, () => spawn(true));
    };

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life += dt;
        e.y -= e.vy * dt;
        e.x += Math.sin(now / 900 + e.phase) * 12 * dt; // gentle side-to-side drift
        if (e.life > e.max || e.y < -10) {
          embers[i] = spawn(false);
          continue;
        }
        // Fade in quickly, fade out slowly, and twinkle a little.
        const t = e.life / e.max;
        const alpha = Math.min(1, t * 6) * (1 - t) * (0.75 + 0.25 * Math.sin(now / 120 + e.phase));
        const rgb = e.teal ? TEAL : ORANGES[i % ORANGES.length];
        ctx.fillStyle = `rgba(${rgb},${alpha * 0.18})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 4, 0, Math.PI * 2); // soft glow
        ctx.fill();
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); // bright core
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    start();

    const onResize = () => resize();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    observer.observe(canvas);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
