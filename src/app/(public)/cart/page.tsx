import type { Metadata } from "next";
import { getAccount, getRewards } from "@/lib/member";
import { loadStorefront } from "@/lib/store-data";
import { Checkout } from "./checkout";
import { checkoutProps } from "./checkout-props";

export const metadata: Metadata = { title: "Your cart" };

/**
 * Cart + checkout on one page (fewer taps on a phone). The server loads the
 * live menu so the cart can warn about anything that sold out meanwhile.
 */
export default async function CartPage() {
  const [{ menu, info, deals }, account, rewards] = await Promise.all([loadStorefront(), getAccount(), getRewards()]);
  return <Checkout {...checkoutProps({ menu, info, deals, account, rewards })} />;
}
