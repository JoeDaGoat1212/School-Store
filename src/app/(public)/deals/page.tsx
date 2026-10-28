import type { Metadata } from "next";
import { DealsPage } from "@/components/public/deals/deals-page";
import { shownPrice } from "@/lib/deals";
import { getAccount, getRewards } from "@/lib/member";
import { loadStorefront } from "@/lib/store-data";

export const metadata: Metadata = { title: "Deals & bundles" };

/** Every deal this week: bundles, sales, coupons, member prices and rewards. */
export default async function Deals() {
  const [{ menu, info, deals }, account, rewards] = await Promise.all([loadStorefront(), getAccount(), getRewards()]);
  const isMember = Boolean(account?.profile) && !account?.staff;
  return (
    <DealsPage
      priced={menu.map((item) => ({ item, shown: shownPrice(item, deals.promotions, isMember) }))}
      promotions={deals.promotions}
      bundles={deals.bundles}
      combos={deals.combos ?? []}
      rewards={rewards}
      isMember={isMember}
      signedIn={Boolean(account) && !account?.staff}
      maxPerOrder={info.max_items_per_order}
      today={info.today}
      pointsPerDollar={info.points_per_dollar ?? 1}
      rewardsEnabled={info.rewards_enabled ?? false}
    />
  );
}
