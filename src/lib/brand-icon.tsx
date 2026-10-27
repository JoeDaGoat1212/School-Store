import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

/**
 * The browser-tab and home-screen icon: the store initials on the school
 * color, made from src/config/brand.ts. To use a real logo instead, delete
 * src/app/icon.tsx and src/app/apple-icon.tsx and put icon.png in src/app.
 */
export function brandIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.colors.primary,
          color: brand.colors.primaryText,
          fontSize: size * 0.42,
          fontWeight: 800,
          borderRadius: size * 0.22,
        }}
      >
        {brand.initials}
      </div>
    ),
    { width: size, height: size },
  );
}
