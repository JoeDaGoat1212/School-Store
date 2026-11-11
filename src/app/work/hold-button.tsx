"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, TimerIcon } from "lucide-react";

const HOLD_MS = 600;

/**
 * "Hold to clock in": press and hold, a fill sweeps across the button, the
 * phone buzzes, and it fires. Letting go early cancels, so a pocket tap never
 * clocks anyone in or out. Keyboard: hold Enter or Space.
 */
export function HoldButton({ on, busy, onComplete }: { on: boolean; busy: boolean; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    started.current = null;
    if (!fired.current) setProgress(0);
  };

  // `now` comes from requestAnimationFrame; the first frame marks the start.
  const tick = (now: number) => {
    if (started.current === null) return;
    if (started.current < 0) started.current = now;
    const p = Math.min(1, (now - started.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      fired.current = true;
      started.current = null;
      try {
        navigator.vibrate?.([30, 40, 60]);
      } catch {
        // not supported
      }
      onComplete();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (busy || started.current !== null) return;
    fired.current = false;
    started.current = -1;
    try {
      navigator.vibrate?.(10);
    } catch {
      // not supported
    }
    frame.current = requestAnimationFrame(tick);
  };

  // Reset once the punch finishes.
  useEffect(() => {
    if (!busy && fired.current) {
      const t = setTimeout(() => {
        fired.current = false;
        setProgress(0);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [busy]);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const label = busy ? (on ? "Clocking out…" : "Clocking in…") : progress > 0 ? "Keep holding…" : on ? "Hold to clock out" : "Hold to clock in";

  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={on ? "Hold to clock out" : "Hold to clock in"}
      className={`relative isolate h-16 w-full touch-none overflow-hidden rounded-2xl text-lg font-semibold select-none transition-transform active:scale-[0.99] disabled:opacity-80 ${
        on ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-primary text-primary-foreground"
      }`}
    >
      {/* the fill */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 -z-10 ${on ? "bg-white" : "bg-[color-mix(in_oklab,var(--brand)_60%,white)]"}`}
        style={{ width: `${progress * 100}%` }}
      />
      <span className={`flex items-center justify-center gap-2.5 ${on && progress > 0.5 ? "text-black" : ""}`}>
        {busy ? <Loader2Icon className="size-5 animate-spin" /> : <TimerIcon className="size-5" />}
        {label}
      </span>
    </button>
  );
}
