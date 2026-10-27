import { describe, expect, it } from "vitest";
import { bucketFor, percentChange, rangeFor } from "./date-range";

describe("date ranges", () => {
  it("makes a Monday–Sunday week with daily bars", () => {
    const r = rangeFor("week", "2026-10-29");
    expect([r.from, r.to, r.bucket]).toEqual(["2026-10-26", "2026-11-01", "day"]);
    expect([r.prev, r.next]).toEqual(["2026-10-19", "2026-11-02"]);
  });

  it("makes a whole month, including February in a leap year", () => {
    expect(rangeFor("month", "2028-02-10")).toMatchObject({ from: "2028-02-01", to: "2028-02-29", label: "February 2028" });
    expect(rangeFor("month", "2026-12-15").next).toBe("2027-01-01");
  });

  it("makes a year with monthly bars", () => {
    expect(rangeFor("year", "2026-10-26")).toMatchObject({ from: "2026-01-01", to: "2026-12-31", bucket: "month" });
  });

  it("fixes a backwards custom range", () => {
    expect(rangeFor("custom", "2026-10-26", { from: "2026-10-20", to: "2026-10-01" })).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-20",
      bucket: "week",
    });
  });

  it("picks bar sizes by length", () => {
    expect(bucketFor("2026-10-01", "2026-10-14")).toBe("day");
    expect(bucketFor("2026-01-01", "2026-12-31")).toBe("month");
  });

  it("works out percent change", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});
