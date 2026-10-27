"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { type Deals, shownPrice } from "@/lib/deals";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { BundleCard } from "./bundle-card";
import { CartBar } from "./cart-bar";
import { useCart } from "./cart-store";
import { FeaturedDeal } from "./featured-deal";
import { ProductCard } from "./product-card";
import { DrinkShowcase } from "./showcase/drink-showcase";

const ALL = "All";
const DEALS = "Deals";
const BUNDLES = "Bundles";

/** The product grid with category tabs, bundles and the deal of the day. */
export function Menu({
  items,
  maxPerOrder,
  deals,
  isMember,
}: {
  items: MenuItem[];
  maxPerOrder: number;
  deals: Deals;
  isMember: boolean;
}) {
  const cartItems = useCart();
  const [category, setCategory] = useState(ALL);
  const navRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Work out every product's price and deal labels once.
  const priced = items.map((item) => ({ item, shown: shownPrice(item, deals.promotions, isMember) }));
  const onDeal = (p: (typeof priced)[number]) =>
    p.shown.regular !== null || p.shown.buyGets.length > 0 || p.shown.memberPrice !== null;
  const hasDeals = deals.bundles.length > 0 || priced.some(onDeal);

  const categories = [
    ALL,
    ...(hasDeals ? [DEALS] : []),
    ...(deals.bundles.length > 0 ? [BUNDLES] : []),
    ...new Set(items.map((i) => i.category)),
  ];

  const showBundles = category === ALL || category === DEALS || category === BUNDLES;
  // Sold-out items go to the end of each list.
  const visible = priced
    .filter((p) =>
      category === ALL ? true : category === DEALS ? onDeal(p) : category === BUNDLES ? false : p.item.category === category,
    )
    .sort((a, b) => Number(a.item.available <= 0) - Number(b.item.available <= 0));

  const quantityInCart = (id: string) => cartItems.find((c) => c.id === id)?.quantity ?? 0;

  // Slide the black pill under the chosen tab. (We move it by setting its
  // style directly, which is smoother than re-rendering on every resize.)
  useEffect(() => {
    const move = () => {
      const tab = navRef.current?.querySelector<HTMLElement>("[aria-pressed=true]");
      const pill = pillRef.current;
      if (!tab || !pill) return;
      pill.style.width = `${tab.offsetWidth}px`;
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.opacity = "1";
    };
    move();
    window.addEventListener("resize", move);
    // Fonts can load after the first measure and change the tab widths.
    document.fonts?.ready.then(move);
    return () => window.removeEventListener("resize", move);
  }, [category]);

  const featured = deals.promotions.find((p) => p.featured);
  let n = 0; // position in the grid, for the deal-in stagger

  return (
    <>
      {featured && category === ALL && (
        <FeaturedDeal
          promo={featured}
          menu={priced}
          isMember={isMember}
          maxPerOrder={maxPerOrder}
          inCart={quantityInCart}
          onShowCategory={setCategory}
        />
      )}

      {/* Category tabs: scroll sideways on small phones */}
      <nav
        aria-label="Categories"
        // Full width like the hero, with the tabs lined up with the page column.
        className="sticky top-16 z-20 mb-6 ml-[calc(50%-50vw)] w-screen border-b bg-background/90 backdrop-blur-md"
      >
        <div ref={navRef} className="relative mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          <span
            ref={pillRef}
            aria-hidden
            className="absolute top-3 left-0 h-10 rounded-full bg-foreground opacity-0 transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
          />
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={(e) => {
                setCategory(c);
                e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
              }}
              className={cn(
                "relative h-10 shrink-0 rounded-full px-4 text-[0.95rem] font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
                category === c ? "text-background" : "text-muted-foreground hover:text-foreground",
                c === DEALS && category !== c && "text-ember-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </nav>

      {/* Drinks get the 3D showcase above their grid. */}
      {/drink/i.test(category) && visible.length > 0 && (
        <DrinkShowcase drinks={visible} maxPerOrder={maxPerOrder} inCart={quantityInCart} />
      )}

      {/* key={category}: a new grid for each category, so the cards deal in again. */}
      <div key={category} className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
        {showBundles &&
          deals.bundles.map((b) => (
            <div key={b.id} className="deal-in" style={{ "--i": Math.min(n++, 12) } as CSSProperties}>
              <BundleCard bundle={b} inCart={quantityInCart(b.id)} isMember={isMember} maxPerOrder={maxPerOrder} />
            </div>
          ))}
        {visible.map(({ item, shown }) => (
          <div key={item.id} className="deal-in" style={{ "--i": Math.min(n++, 12) } as CSSProperties}>
            <ProductCard item={item} shown={shown} inCart={quantityInCart(item.id)} maxPerOrder={maxPerOrder} />
          </div>
        ))}
      </div>

      <CartBar />
    </>
  );
}
