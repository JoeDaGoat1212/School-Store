"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cartTotals, useCart } from "./cart-store";

/** Bag icon in the header with the number of items in the cart. */
export function CartButton() {
  const { count } = cartTotals(useCart());

  return (
    <Button variant="ghost" size="icon-lg" asChild className="relative">
      <Link href="/cart" aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart, empty"}>
        <ShoppingBagIcon />
        {count > 0 && (
          // key={count}: a new element each time the number changes, so the hop plays again.
          <span
            key={count}
            className="hop absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.7rem] leading-5 font-bold text-primary-foreground ring-2 ring-black"
          >
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}
