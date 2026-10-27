import { ImageResponse } from "next/og";
import { FLAME_PATH, NEST_PATHS } from "@/components/brand-mark";
import { brand } from "@/config/brand";

/**
 * The browser-tab and home-screen icon: the flame-and-nest mark on black,
 * made from the same paths as the logo. To use a real logo instead, delete
 * src/app/icon.tsx and src/app/apple-icon.tsx and put icon.png in src/app.
 */
export function brandIcon(size: number) {
  const inner = size * 0.82;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.colors.ink,
          borderRadius: size * 0.22,
        }}
      >
        <svg viewBox="0 0 32 32" width={inner} height={inner}>
          <path fill={brand.colors.primary} fillRule="evenodd" d={FLAME_PATH} />
          {NEST_PATHS.map((d) => (
            <path key={d} d={d} fill="none" stroke={brand.colors.accent} strokeWidth={2.3} strokeLinecap="round" />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
