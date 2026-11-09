import { describe, expect, it } from "vitest";
import { creditRuleText, formatMinutes, fromLocalInput, hoursDecimal, minutesBetween, nextReward, toLocalInput } from "./staff";

describe("employee time helpers", () => {
  it("shows minutes as hours and minutes", () => {
    expect(formatMinutes(40)).toBe("40m");
    expect(formatMinutes(135)).toBe("2h 15m");
    expect(formatMinutes(-5)).toBe("0m");
    expect(hoursDecimal(135)).toBe("2.25");
  });

  it("counts whole minutes between punches", () => {
    expect(minutesBetween("2026-11-06T15:00:00Z", "2026-11-06T15:44:59Z")).toBe(44);
    expect(minutesBetween("2026-11-06T15:00:00Z", null, Date.parse("2026-11-06T16:00:00Z"))).toBe(60);
  });

  it("turns timestamps into Arizona times for the edit boxes and back", () => {
    // 3:05 PM UTC is 8:05 AM in Arizona (always UTC−7, no daylight saving).
    expect(toLocalInput("2026-11-06T15:05:00Z")).toBe("2026-11-06T08:05");
    expect(fromLocalInput("2026-11-06T08:05")).toBe("2026-11-06T15:05:00.000Z");
    expect(toLocalInput(fromLocalInput("2026-07-01T23:59")!)).toBe("2026-07-01T23:59");
    expect(fromLocalInput("not a time")).toBeNull();
  });

  it("describes the weekly discount and credit rule", () => {
    const rule = { pct: 10, afterHours: 5, cents: 100 };
    expect(creditRuleText(rule)).toBe(
      "10% off for every hour worked (up to 50% at 5 hours), then $1 store credit for every hour after 5. Starts over each Monday.",
    );
    expect(nextReward(4 * 60 + 59, rule)).toBe("+10% off");
    expect(nextReward(5 * 60, rule)).toBe("+$1 credit");
    expect(nextReward(0, { pct: 10, afterHours: 5, cents: 150 })).toBe("+10% off");
  });
});
