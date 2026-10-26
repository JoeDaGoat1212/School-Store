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
          <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-sticker px-1 text-[0.7rem] leading-5 font-bold text-sticker-foreground ring-2 ring-background">
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}
