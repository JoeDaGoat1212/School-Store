import { describe, expect, it } from "vitest";
import { eopToLines, looksLikeEop, parseEopRows } from "./end-of-period";

// The 10/29/2026 Spirit Store report, as one spreadsheet row.
const table = [
  ["Date", "Reconcile #", "Deposit Reference", "Cash", "Checks", "Deposit Total", "Credit", "Account", "Other", "Grand Total"],
  ["2026-10-29", "10684", "Spirit Store 10/29 DL", "35.50", "0.00", "35.50", "186.00", "0.00", "0.00", "221.50"],
];

// The same report as text, laid out like the printed page (Credit and Account stacked, amounts after).
const printed = `10/29/26, 1:53 PM
InTouch Pay - End of Period
End of Period Summary
Reconcile #: 10684
Deposit Reference: Spirit Store 10/29 DL
10/29/2026
Deposit
Cash 35.50
Checks 0.00
Deposit Total
35.50
Other Tenders
Credit
Account
186.00
0.00
Other 0.00
Subtotal
186.00
Grand Total
221.50
Receipts 221.50
Over/Short 0.00`
  .split("\n")
  .map((l) => [l]);

describe("End of Period Summary", () => {
  it("is recognized in both layouts", () => {
    expect(looksLikeEop(table)).toBe(true);
    expect(looksLikeEop(printed)).toBe(true);
    expect(looksLikeEop([["Date", "Item", "Qty", "Total"]])).toBe(false);
  });

  it("reads the spreadsheet layout", () => {
    const [r] = parseEopRows(table);
    expect(r).toMatchObject({ date: "2026-10-29", reconcile: "10684", cash: 3550, credit: 18600, account: 0, grandTotal: 22150 });
  });

  it("reads the printed layout and gives the $186 to Credit, not Account", () => {
    const [r] = parseEopRows(printed);
    expect(r).toMatchObject({ date: "2026-10-29", reconcile: "10684", cash: 3550, credit: 18600, account: 0, grandTotal: 22150 });
  });

  it("refuses a report whose parts don't add up to the Grand Total", () => {
    const bad = [table[0], ["2026-10-30", "1", "", "10.00", "0", "10.00", "5.00", "0", "0", "99.00"]];
    expect(() => parseEopRows(bad)).toThrow(/Grand Total/);
  });

  it("makes one line per payment type, with the same fingerprints every time", async () => {
    const a = await eopToLines(parseEopRows(table));
    const b = await eopToLines(parseEopRows(printed));
    expect(a.map((l) => [l.raw_item_name, l.total_cents, l.payment_type])).toEqual([
      ["End of day: Cash", 3550, "cash"],
      ["End of day: Card", 18600, "debit"],
    ]);
    expect(b.map((l) => l.fingerprint)).toEqual(a.map((l) => l.fingerprint));
  });
});
