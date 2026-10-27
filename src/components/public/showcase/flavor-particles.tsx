"use client";

import { memo, type CSSProperties } from "react";
import type { Particle } from "@/lib/product-look";
import { cn } from "@/lib/utils";
import { pieceUrl, type Piece } from "./scene-assets";

/*
 * The things that fall around a drink in the showcase: strawberries, citrus
 * slices, ice, bubbles… Most flavors use cut-out photos (scene-assets.ts);
 * the small hand-made SVGs below are the backup for everything else.
 * They fall with CSS animations, so the 3D scene doesn't have to draw them.
 */

function Shape({ kind }: { kind: Particle }) {
  switch (kind) {
    case "strawberry":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M32 60C18 52 8 38 10 26c1.5-8 9-11 16-9 3 .8 5 .8 6 .8s3 0 6-.8c7-2 14.5 1 16 9 2 12-8 26-22 34Z" fill="#e3263d" />
          <path d="M32 60C18 52 8 38 10 26c.6-3.3 2.3-5.7 4.6-7.2C12 30 20 46 32 54c12-8 20-24 17.4-35.2 2.3 1.5 4 3.9 4.6 7.2 2 12-8 26-22 34Z" fill="#b5122a" opacity=".55" />
          {[[22, 28], [32, 25], [42, 28], [18, 38], [28, 36], [38, 36], [46, 38], [24, 46], [34, 46], [30, 54]].map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.4" ry="2.2" fill="#ffe08a" />
          ))}
          <path d="M32 19c-4-6-12-8-16-6 4 1 7 3 9 6-5-1-10 0-12 3 5-1 10 0 14 2 1-1 3-3 5-5Z M32 19c4-6 12-8 16-6-4 1-7 3-9 6 5-1 10 0 12 3-5-1-10 0-14 2-1-1-3-3-5-5Z" fill="#2f9b3f" />
          <path d="M31 19c0-5 1-10 3-13" stroke="#2f7d35" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "cherry":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M22 40C24 26 30 12 44 6M44 40C42 28 42 16 44 6" stroke="#3d6b2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M44 6c6 1 12 5 14 10-6 1-12-2-14-10Z" fill="#3f9a3c" />
          <circle cx="20" cy="46" r="13" fill="#c0122f" />
          <circle cx="44" cy="48" r="12" fill="#d61f3c" />
          <circle cx="15" cy="41" r="3.5" fill="#fff" opacity=".55" />
          <circle cx="40" cy="43" r="3" fill="#fff" opacity=".55" />
        </svg>
      );
    case "grape":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M32 12c0-4 2-7 5-9" stroke="#5b3b1d" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M34 10c6-4 14-3 18 1-6 3-13 3-18-1Z" fill="#4c9a3f" />
          {[[24, 20], [40, 20], [32, 24], [18, 32], [32, 36], [46, 32], [25, 46], [39, 46], [32, 57]].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="8.5" fill="#6a2fa8" />
              <circle cx={x - 3} cy={y - 3} r="2.2" fill="#fff" opacity=".4" />
            </g>
          ))}
        </svg>
      );
    case "orange":
    case "lemon":
    case "lime": {
      const c = { orange: ["#f07a00", "#ffb347", "#ffd9a0"], lemon: ["#e2bd12", "#ffe14d", "#fff6bf"], lime: ["#3c9a2f", "#8fd14f", "#dcf5b8"] }[kind];
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="29" fill={c[0]} />
          <circle cx="32" cy="32" r="25" fill={c[2]} />
          <circle cx="32" cy="32" r="22" fill={c[1]} />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d="M32 32 L32 12"
              stroke={c[2]}
              strokeWidth="2.6"
              strokeLinecap="round"
              transform={`rotate(${i * 45} 32 32)`}
            />
          ))}
          <circle cx="32" cy="32" r="3" fill={c[2]} />
        </svg>
      );
    }
    case "ice":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="8" y="8" width="48" height="48" rx="10" fill="#e8f7ff" opacity=".75" transform="rotate(8 32 32)" />
          <rect x="14" y="14" width="36" height="36" rx="7" fill="#ffffff" opacity=".55" transform="rotate(8 32 32)" />
          <path d="M18 20c4-3 10-4 14-3" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" transform="rotate(8 32 32)" />
        </svg>
      );
    case "bubble":
      return (
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="#ffffff" opacity=".12" stroke="#ffffff" strokeOpacity=".7" strokeWidth="2.5" />
          <path d="M18 24c3-6 9-9 15-9" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".85" />
        </svg>
      );
    case "leaf":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M8 56C8 28 26 8 58 6c0 30-18 50-50 50Z" fill="#5cbf5a" />
          <path d="M8 56C24 40 38 26 58 6" stroke="#2f8a3a" strokeWidth="3" fill="none" />
          <path d="M22 42l-6-12M30 34l-4-14M38 26l-2-12M26 38l14 2M34 30l14 0" stroke="#2f8a3a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "cocoa":
      return (
        <svg viewBox="0 0 64 64">
          <rect x="8" y="10" width="48" height="44" rx="6" fill="#5a2e17" />
          <rect x="12" y="14" width="18" height="16" rx="3" fill="#7a4224" />
          <rect x="34" y="14" width="18" height="16" rx="3" fill="#7a4224" />
          <rect x="12" y="34" width="18" height="16" rx="3" fill="#7a4224" />
          <rect x="34" y="34" width="18" height="16" rx="3" fill="#7a4224" />
        </svg>
      );
    case "chili":
      return (
        <svg viewBox="0 0 64 64">
          <path d="M14 18c10 2 16 10 20 20 4 9 10 16 20 20-14 4-30-4-38-18-4-7-6-15-2-22Z" fill="#e0261b" />
          <path d="M16 22c6 3 10 9 13 16" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M14 18c-2-6 0-11 5-13 0 4 2 8 6 9-4 3-8 4-11 4Z" fill="#3c8f2f" />
        </svg>
      );
  }
}

/** A fixed, random-looking set of positions (the same every time, so the server and phone agree). */
function seeded(n: number) {
  const out: number[] = [];
  let s = 1234567;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out.push((s % 10000) / 10000);
  }
  return out;
}
const RANDOM = seeded(200);

/**
 * One layer of falling pieces. Use two: "back" (small, soft, behind the drink)
 * and "front" (bigger, a little blurred, in front of it) for depth.
 */
export const FlavorParticles = memo(function FlavorParticles({
  kind,
  pieces,
  layer,
  count,
  className,
}: {
  /** The drawn shape, used when there are no photo pieces. */
  kind: Particle;
  /** Cut-out photos to drop instead (they take turns). */
  pieces?: Piece[];
  layer: "back" | "front";
  count: number;
  className?: string;
}) {
  const front = layer === "front";
  const photos = pieces && pieces.length > 0 ? pieces : null;
  return (
    <div
      aria-hidden
      // Smaller pieces on phones.
      className={cn("pointer-events-none absolute inset-0 overflow-hidden [container-type:size] [--particle-scale:0.65] sm:[--particle-scale:1]", className)}
    >
      {Array.from({ length: count }, (_, i) => {
        const r = (k: number) => RANDOM[(i * 7 + k + (front ? 97 : 0)) % RANDOM.length];
        const photo = photos?.[i % photos.length];
        // Photos have empty space around them, so they're drawn a bit bigger.
        const size = (front ? 54 + r(1) * 46 : 26 + r(1) * 30) * (photo ? 1.5 * (photo.size ?? 1) : 1);
        return (
          <span
            key={i}
            className={cn("flavor-particle absolute block", front && "blur-[1.5px]")}
            style={
              {
                left: `${r(0) * 100}%`,
                width: `calc(var(--particle-scale, 1) * ${size}px)`,
                height: `calc(var(--particle-scale, 1) * ${size}px)`,
                "--y": `${r(5) * 90}%`,
                "--spin": `${(r(2) > 0.5 ? 1 : -1) * (120 + r(3) * 240)}deg`,
                "--sway": `${(r(4) - 0.5) * 60}px`,
                animationDuration: `${(front ? 5 : 8) + r(6) * 6}s`,
                animationDelay: `-${r(7) * 12}s`,
                opacity: front ? 0.95 : 0.8,
              } as CSSProperties
            }
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- tiny decorative cut-outs; next/image adds nothing here
              <img src={pieceUrl(photo.name)} alt="" draggable={false} decoding="async" className="size-full object-contain drop-shadow-lg" />
            ) : (
              <Shape kind={kind} />
            )}
          </span>
        );
      })}
    </div>
  );
});
