"use client";

import { useState, type CSSProperties } from "react";
import type { ShownPrice } from "@/lib/deals";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { CartBar } from "../cart-bar";
import { useCart } from "../cart-store";
import { ProductCard } from "../product-card";

const ALL = "All";

/**
 * Everything in the store at teacher prices, with category tabs. Adding to the
 * cart uses the same cart as everyone; the price is checked again at checkout.
 */
export function TeacherShop({ items, maxPerOrder }: { items: { item: MenuItem; price: number }[]; maxPerOrder: number }) {
  const cartItems = useCart();
  const [category, setCategory] = useState(ALL);
  // How much teachers save, to say so up top.
  const offs = items.filter((i) => i.price < i.item.price_cents).map((i) => percentOff(i.item.price_cents, i.price));
  const bestOff = Math.max(0, ...offs);
  const categories = [ALL, ...new Set(items.map((i) => i.item.category))];
  const visible = items
    .filter((i) => category === ALL || i.item.category === category)
    // In stock first, then the biggest markdowns first.
    .sort(
      (a, b) =>
        Number(a.item.available <= 0) - Number(b.item.available <= 0) ||
        percentOff(b.item.price_cents, b.price) - percentOff(a.item.price_cents, a.price),
    );

  return (
    <section id="teacher-shop" aria-labelledby="teacher-shop-title" className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="teacher-shop-title" className="font-heading text-5xl leading-none font-extrabold uppercase">
            Teacher prices
          </h2>
          <p className="mt-1.5 text-muted-foreground">Everything&apos;s marked way down for you. Thanks for all you do.</p>
        </div>
        {bestOff > 0 && (
          <p className="-rotate-2 rounded-xl bg-[#14110f] px-4 py-2 text-center text-[#ffc45c] shadow-soft">
            <span className="block font-heading text-4xl leading-none font-extrabold">Up to {bestOff}% off</span>
            <span className="text-sm text-[#f6efe3]/75">
              {offs.length} item{offs.length === 1 ? "" : "s"} on teacher price
            </span>
          </p>
        )}
      </div>

      <div role="tablist" aria-label="Categories" className="sticky top-16 z-20 -mx-4 mt-5 flex gap-2 overflow-x-auto bg-background/90 px-4 py-3 backdrop-blur [scrollbar-width:none]">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-10 shrink-0 rounded-full border-2 px-4 text-sm font-semibold capitalize transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
              category === c ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map(({ item, price }, i) => {
          const shown: ShownPrice = {
            price,
            regular: price < item.price_cents ? item.price_cents : null,
            // "35% off": the crossed-out price shows above it.
            saleTitle: price < item.price_cents ? `${percentOff(item.price_cents, price)}% off` : null,
            memberPrice: null,
            buyGets: [],
          };
          return (
            <div key={item.id} className="deal-in" style={{ "--i": Math.min(i, 12) } as CSSProperties}>
              <ProductCard item={item} shown={shown} inCart={cartItems.find((c) => c.id === item.id)?.quantity ?? 0} maxPerOrder={maxPerOrder} />
            </div>
          );
        })}
      </div>
      <CartBar />
    </section>
  );
}

/** $2.00 → $1.35 is 33% off (rounded down, so it's never overstated). */
function percentOff(regular: number, price: number) {
  return Math.floor(((regular - price) / regular) * 100);
}
