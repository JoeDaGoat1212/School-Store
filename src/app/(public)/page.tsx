import { Suspense } from "react";
import { FlashToast } from "@/components/flash-toast";
import { InfoTicker } from "@/components/public/info-ticker";
import { AisleCards, type Aisle } from "@/components/public/landing/aisle-cards";
import { DrinksSection } from "@/components/public/landing/drinks-section";
import { HowItWorks } from "@/components/public/landing/how-it-works";
import { RequestSection } from "@/components/public/landing/request-section";
import { StoreCta } from "@/components/public/landing/store-cta";
import { StoreHero } from "@/components/public/landing/store-hero";
import { Menu } from "@/components/public/menu";
import { shownPrice } from "@/lib/deals";
import { getAccount, getPopularRequests } from "@/lib/member";
import { productRenderUrl } from "@/lib/product-renders";
import { pickSeason } from "@/lib/seasons";
import { loadStorefront, type MenuItem } from "@/lib/store-data";

/**
 * The home page:
 *   1. the hero: the 3D store's drone view (blurred) and "Enter 3D world",
 *   2. the info strip (hours, pickup spot),
 *   3. "Shop by aisle" cards that jump to the right tab of the shop,
 *   4. how ordering works,
 *   5. the cooler (every drink turning in 3D, one at a time),
 *   6. the shop itself: every product, with category tabs,
 *   7. "Can't find it? Ask for it.": the item request form,
 *   8. one more way into the 3D store, and rewards.
 */
export default async function HomePage(props: PageProps<"/">) {
  const { season: seasonParam } = await props.searchParams;
  const [{ menu, info, deals }, account, requests] = await Promise.all([loadStorefront(), getAccount(), getPopularRequests()]);
  const isMember = Boolean(account?.profile);
  const season = pickSeason(info.today, seasonParam);
  const priced = menu.map((item) => ({ item, shown: shownPrice(item, deals.promotions, isMember) }));
  const hasDeals = (deals.combos ?? []).length > 0 || deals.bundles.length > 0 || priced.some((p) => p.shown.regular !== null || p.shown.buyGets.length > 0);

  // The aisle cards: how many products each has, and a few to show (ones with 3D pictures, in stock first).
  const inCategory = (test: RegExp) => menu.filter((m) => test.test(m.category));
  const picks = (items: MenuItem[]) =>
    [...items]
      .filter((m) => productRenderUrl(m.name))
      .sort((a, b) => Number(a.available <= 0) - Number(b.available <= 0))
      .map((m) => m.name)
      .filter((n, i, all) => all.indexOf(n) === i)
      .slice(0, 3);
  const aisle = (category: string, title: string, blurb: string, test: RegExp, tone: Aisle["tone"]): Aisle | null => {
    const items = inCategory(test);
    const actual = items[0]?.category ?? category;
    return items.length ? { category: actual, title, blurb, count: items.length, picks: picks(items), tone } : null;
  };
  const aisles = [
    aisle("Drinks", "Drinks", "Sodas, sports drinks, energy and more, ice cold", /^drinks?$/i, "teal"),
    aisle("Snacks", "Snacks", "Chips, jerky, cookies and sweet treats", /^snacks?$/i, "orange"),
    aisle("Candy", "Candy", "Chocolate, sour and chewy", /^candy$/i, "pink"),
    aisle("Hot food", "Hot food", "Ramen, muffins and more", /hot food/i, "gold"),
    hasDeals
      ? ({ category: "Deals", title: "Deals", blurb: "Sales, bundles and coupons this week", count: (deals.combos ?? []).length + deals.bundles.length + priced.filter((p) => p.shown.regular !== null || p.shown.buyGets.length > 0).length, picks: [], tone: "black", href: "/deals" } satisfies Aisle)
      : null,
  ].filter((a): a is Aisle => a !== null);

  const drinks = priced.filter((p) => /^drinks?$/i.test(p.item.category) && p.item.available > 0);

  return (
    <>
      <Suspense>
        <FlashToast param="account" text="Your rewards account was deleted." />
      </Suspense>
      <StoreHero season={season} />
      <InfoTicker info={info} />

      {menu.length === 0 && deals.bundles.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed px-6 py-14 text-center">
          <p className="font-heading text-2xl font-bold">The shelves are empty right now</p>
          <p className="mt-1 text-muted-foreground">Check back soon, or stop by the store window.</p>
        </div>
      ) : (
        <>
          <AisleCards aisles={aisles} />
          <div className="mt-16">
            <HowItWorks info={info} />
          </div>
          <DrinksSection drinks={drinks} maxPerOrder={info.max_items_per_order} />
          <div id="shop" className="mt-16 scroll-mt-16">
            <Menu items={menu} maxPerOrder={info.max_items_per_order} deals={deals} isMember={isMember} />
          </div>
        </>
      )}
      <RequestSection popular={requests} />
      <StoreCta season={season} showRewards={Boolean(info.rewards_enabled) && !isMember} />
    </>
  );
}
