import { describe, expect, it } from "vitest";
import {
  availableStock,
  batchesStillOnShelf,
  dailyAverage,
  daysBetween,
  daysOfStockLeft,
  nextExpiration,
  productProfit,
  recommendShoppingInterval,
  suggestedOrderQuantity,
  suggestedReorderPoint,
} from "./calculations";

describe("basic formulas", () => {
  it("averages units per day", () => {
    expect(dailyAverage(56, 28)).toBe(2);
    expect(dailyAverage(10, 0)).toBe(0);
  });

  it("subtracts reserved stock, never going below zero", () => {
    expect(availableStock(10, 3)).toBe(7);
    expect(availableStock(2, 5)).toBe(0);
  });

  it("works out days of stock left", () => {
    expect(daysOfStockLeft(10, 2)).toBe(5);
    expect(daysOfStockLeft(10, 0)).toBe(Infinity);
    expect(daysOfStockLeft(0, 3)).toBe(0);
  });

  it("suggests a reorder point from lead time and buffer", () => {
    expect(suggestedReorderPoint(3, 2, 2)).toBe(12); // 3/day × (2 lead + 2 buffer)
    expect(suggestedReorderPoint(0.5, 2, 1)).toBe(2); // rounds up
  });

  it("suggests how many to buy", () => {
    expect(suggestedOrderQuantity(2, 4, 7, 2)).toBe(14); // need 18, have 4
    expect(suggestedOrderQuantity(2, 30, 7, 2)).toBe(0); // already enough
  });

  it("computes product profit in cents", () => {
    expect(productProfit(150, 55, 10)).toBe(950);
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-26", "2026-10-30")).toBe(4);
    expect(daysBetween("2026-10-30", "2026-10-26")).toBe(-4);
  });
});

describe("perishable batches (oldest sells first)", () => {
  const batches = [
    { quantity: 6, received_on: "2026-10-19", expires_on: "2026-10-25" },
    { quantity: 6, received_on: "2026-10-12", expires_on: "2026-10-18" },
  ];

  it("keeps only the newest batches that fit in stock", () => {
    expect(batchesStillOnShelf(4, batches).map((b) => b.remaining)).toEqual([4]);
    expect(batchesStillOnShelf(9, batches).map((b) => b.remaining)).toEqual([6, 3]);
  });

  it("finds the soonest expiration still on the shelf", () => {
    expect(nextExpiration(4, batches)).toBe("2026-10-25");
    expect(nextExpiration(9, batches)).toBe("2026-10-18");
    expect(nextExpiration(0, batches)).toBeNull();
  });
});

describe("shopping frequency", () => {
  it("defaults to weekly", () => {
    const r = recommendShoppingInterval([{ name: "Chips", avg: 5, unitCostCents: 50, shelfLifeDays: null }]);
    expect(r.days).toBe(7);
    expect(r.budgetCents).toBe(1750); // 5/day × 7 days × $0.50
  });

  it("shops sooner when a selling perishable spoils fast", () => {
    const r = recommendShoppingInterval([
      { name: "Banana", avg: 2, unitCostCents: 20, shelfLifeDays: 5 },
      { name: "Muffin", avg: 0, unitCostCents: 90, shelfLifeDays: 2 }, // not selling: ignored
    ]);
    expect(r.days).toBe(5);
    expect(r.reason).toMatch(/Banana/);
  });
});
