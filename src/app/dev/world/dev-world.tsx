"use client";

import { StoreWorld } from "@/components/public/world/store-world";
import type { CheckoutProps } from "@/app/(public)/cart/checkout-props";
import type { MenuItem } from "@/lib/store-data";

/** A few made-up products, so the shelves aren't empty. */
const SAMPLE: [string, string, number][] = [
  ["Coca-Cola", "Drinks", 150],
  ["Sprite", "Drinks", 150],
  ["Gatorade", "Drinks", 200],
  ["Water", "Drinks", 100],
  ["Hot Cheetos", "Snacks", 150],
  ["Doritos", "Snacks", 150],
  ["Pretzels", "Snacks", 125],
  ["Snickers", "Candy", 125],
  ["Skittles", "Candy", 125],
  ["Twix", "Candy", 125],
];

const menu: MenuItem[] = SAMPLE.map(([name, category, price], i) => ({
  id: `sample-${i}`,
  name,
  description: null,
  category,
  emoji: null,
  photo_path: null,
  price_cents: price,
  tags: [],
  available: 20,
}));

export function DevWorld() {
  return (
    <StoreWorld
      priced={menu.map((item) => ({ item, shown: { price: item.price_cents, regular: null, saleTitle: null, memberPrice: null, buyGets: [] } }))}
      deals={{ promotions: [], bundles: [], combos: [] }}
      isMember={false}
      account={{ signedIn: false, member: null }}
      maxPerOrder={10}
      openSign={{ title: "Open", line: "Dev world" }}
      rewards={{ enabled: false, pointsPerDollar: 1 }}
      checkout={{} as CheckoutProps}
      season={null}
      requests={[]}
    />
  );
}
