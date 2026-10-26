import type { Metadata } from "next";
import { pickupDays } from "@/lib/ordering";
import { loadStorefront } from "@/lib/store-data";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Your cart" };

/**
 * Cart + checkout on one page (fewer taps on a phone). The server loads the
 * live menu so the cart can warn about anything that sold out meanwhile.
 */
export default async function CartPage() {
  const { menu, info } = await loadStorefront();

  return (
    <Checkout
      menu={menu.map((m) => ({ id: m.id, price_cents: m.price_cents, available: m.available }))}
      days={pickupDays(info)}
      today={info.today}
      maxItems={info.max_items_per_order}
      pickupLocation={info.pickup_location}
    />
  );
}
