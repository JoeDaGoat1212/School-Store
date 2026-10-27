"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { LockIcon, PlusIcon } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { buyGetLabel, type ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { cart } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";

/** "Only N left" shows when this many or fewer are available. */
const FEW_LEFT = 5;

/** One item on the menu: photo, price tag, name, and an Add button. */
export function ProductCard({
  item,
  inCart,
  maxPerOrder,
  shown,
}: {
  item: MenuItem;
  inCart: number;
  maxPerOrder: number;
  /** Price after any sale, plus deal labels (from src/lib/deals.ts). */
  shown: ShownPrice;
}) {
  const soldOut = item.available <= 0;
  const max = Math.min(item.available, maxPerOrder);
  // Each tap on Add makes a new burst of sparks (the number is the burst's key).
  const [burst, setBurst] = useState(0);

  const add = () => {
    cart.add({
      id: item.id,
      name: item.name,
      price_cents: shown.price,
      emoji: item.emoji,
      photo_path: item.photo_path,
      category: item.category,
    });
    setBurst((b) => b + 1);
  };

  return (
    <article className="group flex h-full flex-col">
      <div className="relative overflow-hidden rounded-2xl">
        <ProductArt
          name={item.name}
          photoPath={item.photo_path}
          emoji={item.emoji}
          category={item.category}
          className={cn(
            "aspect-square w-full transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]",
            soldOut && "opacity-40 grayscale",
          )}
          emojiClassName="text-6xl sm:text-7xl"
        />

        {/* Orange outline once it's in the cart */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl ring-primary transition-[box-shadow] duration-300 ring-inset",
            inCart > 0 ? "ring-4" : "ring-0",
          )}
        />

        {soldOut ? (
          <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 -rotate-6 rounded-md bg-black px-3 py-1 font-heading text-xl font-extrabold tracking-wide text-white uppercase">
            Sold out
          </span>
        ) : (
          // The price tag: black with orange numbers, like a price-gun sticker.
          // On sale, the old price is crossed out underneath.
          <span className="absolute top-2.5 left-2.5 -rotate-3 rounded-md bg-black px-2 pt-1 pb-0.5 leading-none">
            <span className="block font-heading text-2xl font-extrabold text-primary tabular-nums">{formatCents(shown.price)}</span>
            {shown.regular !== null && (
              <span className="block pb-0.5 text-xs font-semibold text-white/60 tabular-nums line-through">
                <span className="sr-only">was </span>
                {formatCents(shown.regular)}
              </span>
            )}
          </span>
        )}

        <div className="absolute right-2.5 bottom-2.5 left-2.5 flex flex-wrap gap-1">
          {shown.saleTitle && !soldOut && <Tag className="bg-primary text-black">{shown.saleTitle}</Tag>}
          {shown.buyGets[0] && !soldOut && <Tag className="bg-black text-white">{buyGetLabel(shown.buyGets[0])}</Tag>}
          {item.tags.includes("new") && <Tag className="bg-teal text-black">New</Tag>}
          {!soldOut && item.available <= FEW_LEFT ? (
            <Tag className="bg-primary text-black">Only {item.available} left</Tag>
          ) : (
            item.tags.includes("limited") && !soldOut && <Tag className="bg-white text-black">Limited</Tag>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="text-[0.95rem] leading-snug font-semibold">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        {shown.memberPrice !== null && !soldOut && (
          <Link
            href="/account?next=/"
            className="mt-1.5 inline-flex w-fit items-center gap-1 text-sm font-semibold text-teal-ink underline-offset-4 hover:underline"
          >
            <LockIcon className="size-3.5" />
            Members pay {formatCents(shown.memberPrice)}
          </Link>
        )}

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
              onClick={add}
              className="relative flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-foreground font-semibold text-background transition-[background-color,color,transform] duration-150 hover:bg-primary hover:text-black focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
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
          {burst > 0 && <Sparks key={burst} />}
        </div>
      </div>
    </article>
  );
}

/** A ring of little orange and teal sparks that fly out and fade (CSS in globals.css). */
export function Sparks() {
  return (
    <span aria-hidden className="pointer-events-none relative -mt-6 block h-0">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="spark"
          style={
            {
              "--a": `${i * 36 + (i % 2) * 12}deg`,
              "--d": `${34 + (i % 3) * 14}px`,
              // Teal, black and orange, so they show up against the orange stepper too.
              background: ["var(--brand-accent)", "var(--foreground)", "var(--brand)"][i % 3],
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", className)}>{children}</span>;
}
