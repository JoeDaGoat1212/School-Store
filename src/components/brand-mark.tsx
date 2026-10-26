import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** The store logo, or the store initials on a school-color tile. */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  if (brand.logo) {
    return <Image src={brand.logo} alt="" width={size} height={size} className={cn("rounded-lg", className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-lg bg-primary font-heading font-extrabold tracking-tight text-primary-foreground",
        className,
      )}
    >
      {brand.initials}
    </span>
  );
}
