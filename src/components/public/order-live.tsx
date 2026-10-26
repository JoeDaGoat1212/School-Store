"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cart } from "./cart-store";

/**
 * Small helpers for the order page:
 *  - `clearCart`: empties the cart right after an order is placed.
 *  - `refreshEvery`: re-checks the order status every N seconds while it's
 *    still open, so "Ready for pickup" shows up without reloading.
 */
export function OrderLive({ clearCart, refreshEvery }: { clearCart?: boolean; refreshEvery?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (clearCart) cart.clear();
  }, [clearCart]);

  useEffect(() => {
    if (!refreshEvery) return;
    const timer = setInterval(() => router.refresh(), refreshEvery * 1000);
    return () => clearInterval(timer);
  }, [refreshEvery, router]);

  return null;
}
