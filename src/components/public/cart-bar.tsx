"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { formatCents } from "@/lib/format";
import { cartTotals, useCart } from "./cart-store";

/** Big "View cart" button stuck to the bottom of the screen once something is in the cart. */
export function CartBar() {
  const { count, totalCents } = cartTotals(useCart());
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        href="/cart"
        className="pointer-events-auto mx-auto flex h-14 max-w-md items-center gap-3 rounded-2xl bg-primary px-5 text-primary-foreground shadow-lg transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] animate-in slide-in-from-bottom-4 fade-in"
      >
        <ShoppingBagIcon className="size-5" />
        <span className="font-semibold">
          View cart · {count} item{count === 1 ? "" : "s"}
        </span>
        <span className="ml-auto font-heading text-lg font-bold tabular-nums">{formatCents(totalCents)}</span>
      </Link>
    </div>
  );
}
