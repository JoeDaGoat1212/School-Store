import { describe, expect, it } from "vitest";
import {
  addFingerprints,
  buildLines,
  findHeaderRow,
  guessMapping,
  mappingProblems,
  matchProduct,
  parseDateCell,
  parseMoneyCell,
  parsePaymentCell,
  parseQuantityCell,
  parseTimeCell,
  type Cell,
} from "./sales-import";

const sample: Cell[][] = [
  ["InTouchPay Sales Report"],
  ["Date", "Time", "Transaction #", "Item Name", "Qty", "Unit Price", "Line Total", "Payment Method"],
  ["10/26/2026", "12:28 PM", "T50868", "HOT CHEETOS 1OZ", "2", "$1.50", "$3.00", "Cash"],
  ["10/26/2026", "8:30 AM", "T50869", "GATORADE 20OZ", "-1", "$2.00", "-$2.00", "Debit Card"],
  ["", "", "", "", "", "", "", ""],
  ["10/26/2026", "9:00 AM", "T50870", "WATER", "abc", "$1.00", "$1.00", "Cash"],
  ["", "", "", "", "", "Total", "$2.00", ""],
];

describe("reading columns", () => {
  it("skips a title row to find the header", () => {
    expect(findHeaderRow(sample)).toBe(1);
  });

  it("guesses every column from the header names", () => {
    const m = guessMapping(sample[1]);
    expect(m).toEqual({ date: 0, time: 1, transaction: 2, item: 3, quantity: 4, unit_price: 5, total: 6, payment: 7 });
    expect(mappingProblems(m)).toEqual([]);
  });

  it("explains what's missing", () => {
    const m = guessMapping(["Day", "Something"]);
    expect(mappingProblems(m)).toContain("Choose the Item name column.");
  });
});

describe("reading values", () => {
  it("reads dates in several formats", () => {
    expect(parseDateCell("10/26/2026")).toEqual({ date: "2026-10-26", time: null });
    expect(parseDateCell("2026-10-26")).toEqual({ date: "2026-10-26", time: null });
    expect(parseDateCell("1/5/26 1:05 PM")).toEqual({ date: "2026-01-05", time: "13:05:00" });
    expect(parseDateCell(new Date(Date.UTC(2026, 9, 26)))).toEqual({ date: "2026-10-26", time: null });
    expect(parseDateCell("13/40/2026")).toBeNull();
    expect(parseDateCell("hello")).toBeNull();
  });

  it("reads times", () => {
    expect(parseTimeCell("12:05 AM")).toBe("00:05:00");
    expect(parseTimeCell("12:05 pm")).toBe("12:05:00");
    expect(parseTimeCell("7:30:15")).toBe("07:30:15");
    expect(parseTimeCell(0.5)).toBe("12:00:00");
  });

  it("reads money, including refunds", () => {
    expect(parseMoneyCell("$1.50")).toBe(150);
    expect(parseMoneyCell("-$2.00")).toBe(-200);
    expect(parseMoneyCell("(2.00)")).toBe(-200);
    expect(parseMoneyCell("1,234.5")).toBe(123450);
    expect(parseMoneyCell(1.25)).toBe(125);
    expect(parseMoneyCell("free")).toBeNull();
  });

  it("reads quantities and payment types", () => {
    expect(parseQuantityCell("2")).toBe(2);
    expect(parseQuantityCell("-1")).toBe(-1);
    expect(parseQuantityCell("1.5")).toBeNull();
    expect(parsePaymentCell("Debit Card")).toBe("debit");
    expect(parsePaymentCell("CASH")).toBe("cash");
    expect(parsePaymentCell("Gift")).toBe("other");
  });
});

describe("building lines", () => {
  it("keeps good rows, reports bad ones, ignores blanks and totals", () => {
    const { lines, errors } = buildLines(sample, 1, guessMapping(sample[1]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      sale_date: "2026-10-26",
      sold_at: "2026-10-26T12:28:00-07:00",
      raw_item_name: "HOT CHEETOS 1OZ",
      quantity: 2,
      unit_price_cents: 150,
      total_cents: 300,
      payment_type: "cash",
      transaction_ref: "T50868",
    });
    expect(lines[1]).toMatchObject({ quantity: -1, unit_price_cents: 200, total_cents: -200, payment_type: "debit" });
    expect(errors).toEqual([{ row: 6, message: 'Can\'t read the quantity "abc"' }]);
  });

  it("works out the price each from the line total", () => {
    const rows: Cell[][] = [["Date", "Item", "Qty", "Total"], ["2026-10-26", "Chips", 3, 4.5]];
    const { lines } = buildLines(rows, 0, guessMapping(rows[0]));
    expect(lines[0]).toMatchObject({ unit_price_cents: 150, total_cents: 450 });
  });
});

describe("duplicate protection", () => {
  it("gives identical lines different fingerprints, but the same ones each time", async () => {
    const rows: Cell[][] = [["Date", "Item", "Qty", "Total"], ["2026-10-26", "Chips", 1, 1.5], ["2026-10-26", "Chips", 1, 1.5]];
    const a = await addFingerprints(buildLines(rows, 0, guessMapping(rows[0])).lines);
    const b = await addFingerprints(buildLines(rows, 0, guessMapping(rows[0])).lines);
    expect(a[0].fingerprint).not.toBe(a[1].fingerprint);
    expect(a.map((l) => l.fingerprint)).toEqual(b.map((l) => l.fingerprint));
  });
});

describe("matching products", () => {
  it("prefers saved names, then exact product names, ignoring case", () => {
    const aliases = new Map([["hot cheetos 1oz", "p1"]]);
    const names = new Map([["water", "p2"]]);
    expect(matchProduct(" HOT CHEETOS 1OZ ", aliases, names)).toBe("p1");
    expect(matchProduct("Water", aliases, names)).toBe("p2");
    expect(matchProduct("Gum", aliases, names)).toBeNull();
  });
});
