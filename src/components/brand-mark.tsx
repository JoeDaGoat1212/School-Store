import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/*
 * The Firebirds Nest mark: an orange flame sitting in a woven teal nest.
 * It's plain SVG paths, so it stays sharp at any size and needs no image file.
 * The same paths are used for the browser-tab icon (src/lib/brand-icon.tsx).
 */

/** Outer flame with the inner flame cut out (evenodd), 32×32 grid. */
export const FLAME_PATH =
  "M16.8 1.5c.5 3.6 2.6 5.5 4.6 7.6 2 2.1 3.4 4.4 3.4 7.6 0 1.6-.4 3-1.1 4.2H8.4c-.8-1.2-1.2-2.6-1.2-4.1 0-3.2 1.5-5.5 3.5-7.4.2 2.1.9 3.6 2.4 4.4-.5-5.1 1.3-9.2 3.7-12.3Z" +
  "M16.1 11.4c1.7 2.2 4.1 3.7 4.1 7 0 .9-.2 1.7-.5 2.4h-7.4c-.3-.7-.4-1.4-.4-2.2 0-1.7.8-2.9 1.8-3.8.2 1.1.7 1.7 1.5 2.1-.3-2 .1-3.9 1.1-5.5Z";

/** The twigs of the nest, drawn as thick rounded strokes. */
export const NEST_PATHS = [
  "M3.2 19.6c3.6 3 8 4.2 12.8 3.8 5-.4 9.2-2 12.8-4.4",
  "M5 24.2c3.8 2.2 8.6 2.8 13.4 1.8 3.6-.8 6.4-2.6 8.6-5.2",
  "M8.8 28.6c3.6.8 7.4.6 10.8-.6 2.2-.8 4-2 5.4-3.6",
  "M4.6 20.6c2.8 3.6 6.6 6.4 11.6 7.4",
];

/** Just the flame-and-nest drawing, no background. */
export function FlameMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" width={size} height={size} className={cn("shrink-0", className)}>
      <path fill={brand.colors.primary} fillRule="evenodd" d={FLAME_PATH} />
      <g fill="none" stroke={brand.colors.accent} strokeWidth={2.3} strokeLinecap="round">
        {NEST_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** The store logo (if one is set in brand.ts), otherwise the flame mark on a black tile. */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  if (brand.logo) {
    return <Image src={brand.logo} alt="" width={size} height={size} className={cn("rounded-lg", className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn("inline-grid shrink-0 place-items-center rounded-[28%] bg-black", className)}
    >
      <FlameMark size={size * 0.8} />
    </span>
  );
}
