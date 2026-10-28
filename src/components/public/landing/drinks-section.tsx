"use client";

import type { ShownPrice } from "@/lib/deals";
import type { MenuItem } from "@/lib/store-data";
import { useCart } from "../cart-store";
import { DrinkShowcase } from "../showcase/drink-showcase";

/**
 * "The cooler": every drink, one at a time, turning in 3D with its flavor
 * falling around it. Scroll (or swipe) to go through them.
 */
export function DrinksSection({ drinks, maxPerOrder }: { drinks: { item: MenuItem; shown: ShownPrice }[]; maxPerOrder: number }) {
  const cartItems = useCart();
  if (drinks.length === 0) return null;
  return (
    <section aria-labelledby="cooler-title" className="mt-16">
      <h2 id="cooler-title" className="font-heading text-5xl leading-none font-extrabold uppercase sm:text-6xl">
        The cooler
      </h2>
      <p className="mt-2 mb-6 text-muted-foreground">Scroll through every drink. Tap + to add one.</p>
      {/* The black header is 64px: the stage sticks right under it. */}
      <DrinkShowcase drinks={drinks} maxPerOrder={maxPerOrder} inCart={(id) => cartItems.find((c) => c.id === id)?.quantity ?? 0} top={64} />
    </section>
  );
}
