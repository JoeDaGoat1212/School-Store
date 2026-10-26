"use client";

import { useState } from "react";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { CartBar } from "./cart-bar";
import { useCart } from "./cart-store";
import { ProductCard } from "./product-card";

/** The product grid with category filter chips. */
export function Menu({ items, maxPerOrder }: { items: MenuItem[]; maxPerOrder: number }) {
  const cartItems = useCart();
  const [category, setCategory] = useState("All");

  const categories = ["All", ...new Set(items.map((i) => i.category))];
  // Sold-out items go to the end of each list.
  const visible = items
    .filter((i) => category === "All" || i.category === category)
    .sort((a, b) => Number(a.available <= 0) - Number(b.available <= 0));

  const quantityInCart = (id: string) => cartItems.find((c) => c.id === id)?.quantity ?? 0;

  return (
    <>
      {/* Category chips: scroll sideways on small phones */}
      <nav
        aria-label="Categories"
        className="sticky top-16 z-20 -mx-4 mb-5 flex gap-2 overflow-x-auto bg-background/90 px-4 py-3 backdrop-blur [scrollbar-width:none]"
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              category === c ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-secondary",
            )}
          >
            {c}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item) => (
          <ProductCard key={item.id} item={item} inCart={quantityInCart(item.id)} maxPerOrder={maxPerOrder} />
        ))}
      </div>

      <CartBar />
    </>
  );
}
