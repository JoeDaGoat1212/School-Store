import { productPhotoUrl } from "@/lib/photos";
import { cn } from "@/lib/utils";

// Soft background tints for products without a photo, picked by category so
// the menu still looks colorful before real photos are added.
const CATEGORY_TINTS: Record<string, string> = {
  Snacks: "bg-[#fff1d6] dark:bg-[#3a2f17]",
  Drinks: "bg-[#dff1ff] dark:bg-[#15303f]",
  "Hot food": "bg-[#ffe3dc] dark:bg-[#3d211b]",
  Supplies: "bg-[#e8e6ff] dark:bg-[#26233f]",
};
const DEFAULT_TINT = "bg-muted";

/** A product's photo, or its emoji on a colored tile if there's no photo yet. */
export function ProductArt({
  name,
  photoPath,
  emoji,
  category,
  className,
  emojiClassName = "text-5xl",
}: {
  name: string;
  photoPath: string | null;
  emoji: string | null;
  category: string;
  className?: string;
  emojiClassName?: string;
}) {
  const url = productPhotoUrl(photoPath);

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
