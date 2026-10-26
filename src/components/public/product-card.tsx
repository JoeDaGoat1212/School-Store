"use client";

import { PlusIcon } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { formatCents } from "@/lib/format";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { cart } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";

/** "Only N left" shows when this many or fewer are available. */
const FEW_LEFT = 5;

/** One item on the menu: photo, price sticker, name, and an Add button. */
export function ProductCard({
  item,
  inCart,
  maxPerOrder,
}: {
  item: MenuItem;
  inCart: number;
  maxPerOrder: number;
}) {
  const soldOut = item.available <= 0;
  const max = Math.min(item.available, maxPerOrder);

  return (
    <article className="flex flex-col">
      <div className="relative">
        <ProductArt
          name={item.name}
          photoPath={item.photo_path}
          emoji={item.emoji}
          category={item.category}
          className={cn("aspect-square w-full rounded-2xl", soldOut && "opacity-45 grayscale")}
          emojiClassName="text-6xl sm:text-7xl"
        />

        {soldOut ? (
          <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 -rotate-6 rounded-lg border-2 border-foreground bg-background px-3 py-1 font-heading text-sm font-extrabold tracking-wide text-foreground">
            Sold out
          </span>
        ) : (
          // The price sticker: the one bold, playful element on the menu.
          <span className="absolute top-2.5 right-2.5 rotate-3 rounded-lg bg-sticker px-2.5 py-1 font-heading text-lg leading-none font-extrabold text-sticker-foreground shadow-[0_2px_0_rgb(0_0_0/0.15)]">
            {formatCents(item.price_cents)}
          </span>
        )}

        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1">
          {item.tags.includes("new") && <Tag>New</Tag>}
          {!soldOut && item.available <= FEW_LEFT ? (
            <Tag>Only {item.available} left</Tag>
          ) : (
            item.tags.includes("limited") && !soldOut && <Tag>Limited</Tag>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="font-heading text-base leading-tight font-bold">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}

        <div className="mt-auto pt-3">
          {inCart > 0 ? (
            <QuantityStepper
              name={item.name}
              quantity={inCart}
              max={max}
              onChange={(q) => cart.setQuantity(item.id, Math.min(q, max))}
            />
          ) : (
            <button
              type="button"
              disabled={soldOut}
              onClick={() =>
                cart.add({
                  id: item.id,
                  name: item.name,
                  price_cents: item.price_cents,
                  emoji: item.emoji,
                  photo_path: item.photo_path,
                  category: item.category,
                })
              }
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              {soldOut ? (
                "Sold out"
              ) : (
                <>
                  <PlusIcon className="size-4.5" /> Add<span className="sr-only"> {item.name}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
      {children}
    </span>
  );
}
