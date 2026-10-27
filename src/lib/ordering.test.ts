import { describe, expect, it } from "vitest";
import { orderingStatus, pickupDays, type StoreInfo } from "./ordering";
import { parseOrderNumber, formatOrderNumber } from "@/config/brand";
import { parseDollarsToCents, formatCents, startOfWeek, addDays } from "./format";

const info = (overrides: Partial<StoreInfo> = {}): StoreInfo => ({
  store_name: "Test",
  store_hours: "",
  pickup_location: "",
  banner_text: null,
  today: "2026-10-26",
  now_time: "09:00",
  order_cutoff_time: "14:00",
  order_lead_minutes: 20,
  max_items_per_order: 10,
  today_is_open: true,
  next_open_day: "2026-10-27",
  pickup_windows: [
    { id: 1, label: "Before school", starts_at: "07:15" },
    { id: 2, label: "After 3rd hour", starts_at: "10:05" },
    { id: 3, label: "After 7th hour", starts_at: "14:15" },
  ],
  ...overrides,
});

describe("pickupDays", () => {
  it("closes windows that start within the lead time", () => {
    const [today] = pickupDays(info({ now_time: "09:50" }));
    expect(today.windows.map((w) => w.open)).toEqual([false, false, true]); // 10:05 − 20 min = 9:45
  });

  it("closes all of today after the cutoff, but tomorrow stays open", () => {
    const [today, tomorrow] = pickupDays(info({ now_time: "14:00" }));
    expect(today.anyOpen).toBe(false);
    expect(tomorrow.anyOpen).toBe(true);
  });

  it("only offers the next school day when today is closed", () => {
    const days = pickupDays(info({ today_is_open: false }));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-10-27");
  });

  it("reports the latest window still open today", () => {
    expect(orderingStatus(info())).toEqual({ open: true, todayOpen: true, lastWindow: "After 7th hour" });
  });
});

describe("order numbers", () => {
  it("formats and parses", () => {
    expect(formatOrderNumber(42)).toBe("FN-0042");
    expect(parseOrderNumber("fn-0042")).toBe(42);
    expect(parseOrderNumber("SS-0042")).toBe(42); // tickets from before the rename
    expect(parseOrderNumber(" #42 ")).toBe(42);
    expect(parseOrderNumber("abc")).toBeNull();
  });
});

describe("money and dates", () => {
  it("converts dollars to cents without rounding errors", () => {
    expect(parseDollarsToCents("1.10")).toBe(110);
    expect(parseDollarsToCents("$2")).toBe(200);
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(formatCents(150)).toBe("$1.50");
  });

  it("finds Monday of the week", () => {
    expect(startOfWeek("2026-10-29")).toBe("2026-10-26");
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
