"use client";

import { useEffect, useRef } from "react";
import { drive, MPH_PER_UNIT } from "./drive";

/*
 * The speedometer in the corner while you drive: a dial from 0 to 100 mph,
 * the speed in big numbers, the gear (P / D / R), and a brake light. It reads
 * the car's speed straight from drive.tsx every frame (no React re-renders).
 */

// The needle sweeps from 225° (bottom left) round to -45° (bottom right).
const START = 225;
const SWEEP = 270;
/** The dial goes up to the next 20 mph past the vehicle's top speed (100 for an ordinary car, 280 for the fastest). */
const dialFor = (top: number) => Math.max(100, Math.ceil(top / 20) * 20);
const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: 60 + Math.cos(a) * r, y: 60 - Math.sin(a) * r };
};

export function Speedometer({ max: top = 100 }: { max?: number }) {
  const MAX = dialFor(top);
  const angleFor = (mph: number) => START - (Math.min(mph, MAX) / MAX) * SWEEP;
  const needle = useRef<SVGGElement>(null);
  const digits = useRef<HTMLSpanElement>(null);
  const gear = useRef<HTMLSpanElement>(null);
  const brake = useRef<HTMLSpanElement>(null);
  const arc = useRef<SVGPathElement>(null);

  useEffect(() => {
    let frame = 0;
    let shown = 0;
    const tick = () => {
      const mph = Math.abs(drive.speed) * MPH_PER_UNIT;
      // A touch of smoothing, like a real needle.
      shown += (mph - shown) * 0.25;
      needle.current?.setAttribute("transform", `rotate(${-angleFor(shown) + 90} 60 60)`);
      if (digits.current) digits.current.textContent = String(Math.round(mph));
      if (gear.current) gear.current.textContent = drive.gear;
      if (brake.current) brake.current.style.opacity = drive.braking ? "1" : "0.15";
      if (arc.current) arc.current.style.strokeDashoffset = String(100 - (Math.min(shown, MAX) / MAX) * 100);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const ticks = Array.from({ length: 21 }, (_, i) => (i * MAX) / 20);
  const arcFrom = at(START, 46);
  const arcTo = at(START - SWEEP, 46);

  return (
    <div
      role="img"
      aria-label="Speedometer"
      className="pointer-events-none relative size-36 rounded-full bg-[#14161a]/90 shadow-[0_6px_24px_rgb(0_0_0/0.35),inset_0_0_0_3px_#3a3f46] backdrop-blur sm:size-44"
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full">
        {/* The coloured band that fills up as you speed up */}
        <path d={`M ${arcFrom.x} ${arcFrom.y} A 46 46 0 1 1 ${arcTo.x} ${arcTo.y}`} fill="none" stroke="#2a2e34" strokeWidth="5" strokeLinecap="round" />
        <path
          ref={arc}
          d={`M ${arcFrom.x} ${arcFrom.y} A 46 46 0 1 1 ${arcTo.x} ${arcTo.y}`}
          fill="none"
          stroke="#ffb020"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
        />
        {ticks.map((mph, i) => {
          const big = i % 4 === 0;
          const a = at(angleFor(mph), big ? 38 : 40);
          const b = at(angleFor(mph), 43);
          return <line key={mph} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={mph >= MAX * 0.8 ? "#ff5a4a" : "#e8e8e8"} strokeWidth={big ? 1.8 : 0.9} />;
        })}
        {ticks
          .filter((_, i) => i % 4 === 0)
          .map((mph) => {
            const p = at(angleFor(mph), 30);
            return (
              <text key={mph} x={p.x} y={p.y + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={mph >= MAX * 0.8 ? "#ff7a6a" : "#cfd3d8"} fontFamily="ui-sans-serif, system-ui">
                {mph}
              </text>
            );
          })}
        {/* The needle (drawn pointing up, then turned) */}
        <g ref={needle} transform={`rotate(${-START + 90} 60 60)`}>
          <polygon points="58.8,62 61.2,62 60.4,18 59.6,18" fill="#ff3b2f" />
        </g>
        <circle cx="60" cy="60" r="5" fill="#2b2f35" stroke="#ff3b2f" strokeWidth="1.2" />
      </svg>
      <div className="absolute inset-x-0 top-[56%] flex flex-col items-center leading-none text-white">
        <span ref={digits} className="font-heading text-3xl font-extrabold tabular-nums sm:text-4xl">
          0
        </span>
        <span className="mt-0.5 text-[9px] font-bold tracking-[0.2em] text-white/55">MPH</span>
      </div>
      {/* Bottom: the gear (P park, D drive, R reverse) and the brake light */}
      <div className="absolute inset-x-0 bottom-[5%] flex items-center justify-center gap-2">
        <span ref={brake} title="Brakes" className="grid size-5 place-items-center rounded-full border-2 border-[#ff3b2f] text-[8px] leading-none font-extrabold text-[#ff3b2f] sm:size-6" style={{ opacity: 0.15 }}>
          !
        </span>
        <span ref={gear} title="Gear" className="grid size-5 place-items-center rounded bg-white/10 font-heading text-xs font-extrabold text-[#7ee08a] sm:size-6 sm:text-sm">
          P
        </span>
      </div>
    </div>
  );
}
