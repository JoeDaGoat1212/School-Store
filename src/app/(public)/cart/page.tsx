import type { Metadata } from "next";
import { bundleOpenTo } from "@/lib/deals";
import { getAccount, getRewards } from "@/lib/member";
import { pickupDays } from "@/lib/ordering";
import { loadStorefront } from "@/lib/store-data";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Your cart" };

/**
 * Cart + checkout on one page (fewer taps on a phone). The server loads the
 * live menu so the cart can warn about anything that sold out meanwhile.
 */
export default async function CartPage() {
  const [{ menu, info, deals }, account, rewards] = await Promise.all([loadStorefront(), getAccount(), getRewards()]);
  const isMember = Boolean(account?.profile) && !account?.staff;

  return (
    <Checkout
      menu={menu.map((m) => ({ id: m.id, price_cents: m.price_cents, available: m.available }))}
      bundles={deals.bundles.map((b) => ({
        id: b.id,
        price_cents: b.price_cents,
        available: b.available,
        itemsPer: b.items.reduce((n, i) => n + i.quantity, 0),
        open: bundleOpenTo(b, isMember),
      }))}
      days={pickupDays(info)}
      today={info.today}
      maxItems={info.max_items_per_order}
      pickupLocation={info.pickup_location}
      member={
        isMember && account?.profile
          ? { ...account.profile, balance: account.balance }
          : null
      }
      signedIn={Boolean(account) && !account?.staff}
      rewards={isMember ? rewards : []}
      rewardsEnabled={info.rewards_enabled ?? false}
    />
  );
}
