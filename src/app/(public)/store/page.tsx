import type { Metadata } from "next";
import { StoreWorld } from "@/components/public/world/store-world";
import { checkoutProps } from "@/app/(public)/cart/checkout-props";
import { shownPrice } from "@/lib/deals";
import { getAccount, getPopularRequests, getRewards } from "@/lib/member";
import { getGamePlayer } from "@/lib/game";
import { loadStorefront } from "@/lib/store-data";
import { pickSeason } from "@/lib/seasons";
import { openSignText } from "@/lib/store-sign";

export const metadata: Metadata = { title: "3D store" };

/**
 * The 3D store. You start outside looking down at it from the sky, tap the
 * doors to walk in, and shop. (The home page has the same things as a list.)
 */
export default async function StorePage(props: PageProps<"/store">) {
  const { season: seasonParam } = await props.searchParams;
  const [{ menu, info, deals }, account, rewardList, requests, gamePlayer] = await Promise.all([
    loadStorefront(),
    getAccount(),
    getRewards(),
    getPopularRequests(),
    getGamePlayer(),
  ]);
  const isMember = Boolean(account?.profile);
  // Each product's price for this shopper (sale prices, member prices…).
  const priced = menu.map((item) => ({ item, shown: shownPrice(item, deals.promotions, isMember) }));

  return (
    <>
      <h1 className="sr-only">{info.store_name}</h1>
      <StoreWorld
        priced={priced}
        deals={deals}
        isMember={isMember}
        account={{
          signedIn: Boolean(account && !account.staff),
          member: account?.profile ? { initial: account.profile.first_name.charAt(0).toUpperCase(), balance: account.balance } : null,
        }}
        maxPerOrder={info.max_items_per_order}
        openSign={openSignText(info)}
        rewards={{ enabled: info.rewards_enabled ?? false, pointsPerDollar: info.points_per_dollar ?? 1 }}
        checkout={checkoutProps({ menu, info, deals, account, rewards: rewardList })}
        // Holiday decorations go up by themselves (October: Halloween).
        season={pickSeason(info.today, seasonParam)}
        requests={requests}
        gamePlayer={gamePlayer}
      />
    </>
  );
}
