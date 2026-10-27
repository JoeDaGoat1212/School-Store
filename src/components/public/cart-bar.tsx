"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { formatCents } from "@/lib/format";
import { cartTotals, useCart } from "./cart-store";

/** Big "View cart" bar stuck to the bottom of the screen once something is in the cart. */
export function CartBar() {
  const { count, totalCents } = cartTotals(useCart());
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        href="/cart"
        className="pointer-events-auto mx-auto flex h-15 max-w-md items-center gap-3 rounded-2xl bg-black px-5 text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.5)] ring-1 ring-white/25 transition-transform animate-in fade-in slide-in-from-bottom-6 duration-300 focus-visible:ring-3 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]"
      >
        <span className="relative">
          <ShoppingBagIcon className="size-5" />
          <span
            key={count}
            className="hop absolute -top-2 -right-2.5 grid min-w-4.5 place-items-center rounded-full bg-teal px-1 text-[0.65rem] leading-4.5 font-bold text-black"
          >
            {count}
          </span>
        </span>
        <span className="ml-1 font-semibold">View cart</span>
        <span className="ml-auto font-heading text-2xl leading-none font-extrabold text-primary tabular-nums">
          {formatCents(totalCents)}
        </span>
      </Link>
    </div>
  );
}
