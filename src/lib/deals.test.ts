import { describe, expect, it } from "vitest";
import { type Promotion, shownPrice } from "./deals";

const promo = (p: Partial<Promotion>): Promotion => ({
  id: "x",
  kind: "sale",
  title: "Sale",
  product_id: "chips",
  category: null,
  sale_price_cents: 100,
  buy_qty: null,
  get_qty: null,
  ends_on: "2026-10-30",
  members_only: false,
  featured: false,
  ...p,
});
const chips = { id: "chips", category: "Snacks", price_cents: 150 };

describe("shownPrice", () => {
  it("uses the sale price and remembers the normal one", () => {
    expect(shownPrice(chips, [promo({})], false)).toMatchObject({ price: 100, regular: 150, saleTitle: "Sale" });
  });

  it("only gives members-only prices to members, and teases everyone else", () => {
    const deals = [promo({ members_only: true, sale_price_cents: 120 })];
    expect(shownPrice(chips, deals, false)).toMatchObject({ price: 150, regular: null, memberPrice: 120 });
    expect(shownPrice(chips, deals, true)).toMatchObject({ price: 120, regular: 150, memberPrice: null });
  });

  it("ignores a 'sale' that isn't cheaper", () => {
    expect(shownPrice(chips, [promo({ sale_price_cents: 200 })], false).price).toBe(150);
  });

  it("finds buy-X-get-Y deals by product or category", () => {
    const deals = [promo({ kind: "buy_get", product_id: null, category: "Snacks", buy_qty: 2, get_qty: 1, sale_price_cents: null })];
    expect(shownPrice(chips, deals, false).buyGets).toHaveLength(1);
    expect(shownPrice({ ...chips, category: "Drinks" }, deals, false).buyGets).toHaveLength(0);
  });
});
