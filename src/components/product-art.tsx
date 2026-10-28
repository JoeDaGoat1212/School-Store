import { productPhotoUrl } from "@/lib/photos";
import { productRenderUrl } from "@/lib/product-renders";
import { cn } from "@/lib/utils";

// Soft orange and teal tints for products without a photo, picked by
// category so the menu still looks on-brand before real photos are added.
const CATEGORY_TINTS: Record<string, string> = {
  Snacks: "bg-[#ffe7d9] dark:bg-[#33190d]",
  candy: "bg-[#fde8f1] dark:bg-[#33121f]",
  Candy: "bg-[#fde8f1] dark:bg-[#33121f]",
  Drinks: "bg-[#d6f1ef] dark:bg-[#0c2b2a]",
  "Hot food": "bg-[#ffdcc9] dark:bg-[#3a1a0c]",
  Supplies: "bg-[#e6eeed] dark:bg-[#18201f]",
};
const DEFAULT_TINT = "bg-muted";

/**
 * A product's picture. In order of preference:
 *   1. its 3D render (drawn from the same model as the 3D store, on a soft
 *      tinted tile: every drink at the same scale, so sizes compare),
 *   2. the photo uploaded in Admin → Products,
 *   3. its emoji on a colored tile.
 */
export function ProductArt({
  name,
  photoPath,
  emoji,
  category,
  className,
  emojiClassName = "text-5xl",
  prefer3d = true,
}: {
  name: string;
  photoPath: string | null;
  emoji: string | null;
  category: string;
  className?: string;
  emojiClassName?: string;
  /** False shows the uploaded photo even if there's a 3D picture (the admin's photo preview). */
  prefer3d?: boolean;
}) {
  const render = prefer3d ? productRenderUrl(name) : null;
  const url = productPhotoUrl(photoPath);

  if (render) {
    return (
      <div className={cn("grid place-items-center", CATEGORY_TINTS[category] ?? DEFAULT_TINT, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={render} alt={name} loading="lazy" className="size-full object-contain" />
      </div>
    );
  }

  if (url) {
    return (
      // A plain <img> keeps things simple: no image-optimization setup or limits.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} loading="lazy" className={cn("object-cover", className)} />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={cn("grid place-items-center", CATEGORY_TINTS[category] ?? DEFAULT_TINT, className)}
    >
      <span aria-hidden className={cn("drop-shadow-sm select-none", emojiClassName)}>
        {emoji || "🛍️"}
      </span>
    </div>
  );
}
