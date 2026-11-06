/**
 * InTouchPay "End of Period Summary" → sales lines, with no questions asked.
 *
 * The End of Period Summary is the one-page report printed at the end of a
 * shift (app.intouchpay.com/functions/eop). It only has totals per payment
 * type (cash, checks, credit, account, other), not item by item, so each
 * report becomes up to five lines named "End of day: Cash", "End of day: Card"
 * and so on. They count toward sales, profit and the charts, but they don't
 * move stock (the report doesn't say what was sold) and they never show up as
 * "needs a product match".
 *
 * Accepted:
 *   1. A spreadsheet with one row per report and columns like
 *      Date, Reconcile #, Cash, Checks, Credit, Account, Other, Grand Total.
 *   2. Label/value rows ("Cash, 35.50") or the report's text copied from the
 *      InTouchPay page and pasted in.
 */
import { parseDateCell, parseMoneyCell, sha256Hex, type Cell, type ParsedLine } from "./sales-import";

/** Every End of Period line's item name starts with this. */
export const EOP_PREFIX = "End of day:";

export type EopReport = {
  date: string; // YYYY-MM-DD
  reconcile: string | null;
  reference: string | null;
  cash: number; // all amounts in cents
  checks: number;
  credit: number;
  account: number;
  other: number;
  /** What the report says the total is (null if it wasn't found). */
  grandTotal: number | null;
};

const TENDERS = [
  { key: "cash", name: "Cash", payment: "cash" },
  { key: "checks", name: "Checks", payment: "other" },
  { key: "credit", name: "Card", payment: "debit" },
  { key: "account", name: "Account", payment: "other" },
  { key: "other", name: "Other", payment: "other" },
] as const;

const norm = (c: Cell) => String(c ?? "").trim().toLowerCase();

/** Total of every payment type on a report. */
export const eopTotal = (r: EopReport) => r.cash + r.checks + r.credit + r.account + r.other;

/** Does this file look like an End of Period Summary (either layout)? */
export function looksLikeEop(rows: Cell[][]) {
  const text = rows.slice(0, 40).map((r) => r.map(norm).join(" ")).join("\n");
  return /end of period/.test(text) || (/reconcile/.test(text) && /grand total/.test(text));
}

/**
 * Reads every report in a file. Throws an Error in plain words when the file
 * looks like an End of Period Summary but the numbers can't be read.
 */
export function parseEopRows(rows: Cell[][]): EopReport[] {
  // Layout 1: a header row with one column per number, one row per report.
  const headerIdx = rows.slice(0, 10).findIndex((r) => {
    const cells = r.map(norm);
    return cells.some((c) => c.startsWith("reconcile")) && cells.includes("cash") && cells.some((c) => c.includes("grand total"));
  });
  if (headerIdx >= 0) return parseTable(rows, headerIdx);

  // Layout 2: the report itself, as label/value rows or pasted text.
  return [parseEopText(rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).join("  ")).join("\n"))];
}

function parseTable(rows: Cell[][], headerIdx: number): EopReport[] {
  const headers = rows[headerIdx].map(norm);
  const col = (...names: string[]) => headers.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const c = {
    date: col("date", "sale date", "report date"),
    reconcile: col("reconcile"),
    reference: col("deposit reference", "reference"),
    cash: col("cash"),
    checks: col("checks", "check"),
    credit: col("credit", "card"),
    account: col("account"),
    other: col("other tenders other", "other"),
    grand: headers.findIndex((h) => h.includes("grand total")),
  };
  if (c.date < 0) throw new Error("This End of Period file has no Date column.");

  const money = (r: Cell[], i: number) => (i >= 0 ? (parseMoneyCell(r[i]) ?? 0) : 0);
  const reports: EopReport[] = [];

  rows.slice(headerIdx + 1).forEach((r, i) => {
    if (r.every((x) => norm(x) === "")) return;
    const when = parseDateCell(r[c.date]);
    if (!when) throw new Error(`Row ${headerIdx + i + 2}: can't read the date "${String(r[c.date] ?? "")}".`);
    reports.push(
      check({
        date: when.date,
        reconcile: c.reconcile >= 0 ? String(r[c.reconcile] ?? "").trim() || null : null,
        reference: c.reference >= 0 ? String(r[c.reference] ?? "").trim() || null : null,
        cash: money(r, c.cash),
        checks: money(r, c.checks),
        credit: money(r, c.credit),
        account: money(r, c.account),
        other: money(r, c.other),
        grandTotal: c.grand >= 0 ? parseMoneyCell(r[c.grand]) : null,
      }),
    );
  });
  if (reports.length === 0) throw new Error("This End of Period file has no reports in it.");
  return reports;
}

/** Reads one report from its text (pasted from the InTouchPay page, or label/value rows). */
export function parseEopText(text: string): EopReport {
  const amounts = readLabelledAmounts(text);
  const get = (k: string) => amounts.get(k) ?? null;

  // The report's own date is the four-digit-year one (the print time at the top uses two digits).
  const dates = [...text.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const pick = dates.find((d) => /\d{4}$|^\d{4}-/.test(d)) ?? dates[0];
  const when = pick ? parseDateCell(pick) : null;
  if (!when) throw new Error("Couldn't find the date on this End of Period Summary.");

  const report: EopReport = {
    date: when.date,
    reconcile: text.match(/reconcile\s*#?\s*:?[ \t]*(\d+)/i)?.[1] ?? null,
    reference: text.match(/deposit reference\s*:?[ \t]*([^\n]+?)\s*$/im)?.[1]?.replace(/[,\s]+$/, "") ?? null,
    cash: get("cash") ?? 0,
    checks: get("checks") ?? 0,
    credit: get("credit") ?? 0,
    account: get("account") ?? 0,
    other: get("other") ?? 0,
    grandTotal: get("grand total"),
  };

  // If the parts don't match the report's own subtotals, trust the subtotals.
  const subtotal = get("subtotal");
  const deposit = get("deposit total");
  if (subtotal !== null && report.credit + report.account + report.other !== subtotal) {
    report.credit = subtotal - report.account - report.other;
  }
  if (deposit !== null && report.cash + report.checks !== deposit) report.cash = deposit - report.checks;
  return check(report);
}

const LABELS: [string, RegExp][] = [
  ["deposit total", /^deposit\s+total$/],
  ["grand total", /^grand\s+total$/],
  ["subtotal", /^sub\s*total$/],
  ["cash", /^cash$/],
  ["checks", /^checks?$/],
  ["credit", /^credit(\s+cards?)?$/],
  ["account", /^accounts?$/],
  ["other", /^other$/],
  ["receipts", /^receipts$/],
  ["over/short", /^over\s*\/\s*short$/],
];
const AMOUNT = /^\$?\s*\(?-?\$?[\d,]+\.\d{2}\)?$/;

/**
 * Pairs each label with its amount, reading top to bottom like a person would.
 * Handles "Cash 35.50" on one line, and the printed layout where labels are
 * stacked ("Credit", "Account") with their amounts on the lines after them.
 */
function readLabelledAmounts(text: string) {
  const found = new Map<string, number>();
  const waiting: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim().replace(/:$/, "");
    if (!line) continue;

    // "Label  12.34" (or "Label: $12.34") on one line.
    const m = line.match(/^(.*?)[\s:]+(\$?\s*\(?-?\$?[\d,]+\.\d{2}\)?)$/);
    const label = (m ? m[1] : line).toLowerCase().replace(/:$/, "").trim();
    const key = LABELS.find(([, re]) => re.test(label))?.[0];

    if (key && m) {
      found.set(key, parseMoneyCell(m[2]) ?? 0);
    } else if (key) {
      waiting.push(key); // amount comes on a later line
    } else if (AMOUNT.test(line) && waiting.length > 0) {
      found.set(waiting.shift()!, parseMoneyCell(line) ?? 0);
    }
  }
  return found;
}

/** Makes sure the payment types add up to the grand total. */
function check(r: EopReport): EopReport {
  const total = eopTotal(r);
  if (r.grandTotal !== null && total !== r.grandTotal) {
    throw new Error(
      `The ${r.date} report's payment types add up to $${(total / 100).toFixed(2)}, but its Grand Total says $${(r.grandTotal / 100).toFixed(2)}. Check the numbers in the file.`,
    );
  }
  if (total === 0) throw new Error(`The ${r.date} report has no sales on it.`);
  return r;
}

/** Turns reports into sales lines (one per payment type that has money), fingerprinted so they're never imported twice. */
export async function eopToLines(reports: EopReport[]): Promise<ParsedLine[]> {
  const lines: ParsedLine[] = [];
  reports.forEach((r, i) => {
    for (const t of TENDERS) {
      const cents = r[t.key];
      if (!cents) continue;
      lines.push({
        row: i + 1,
        sale_date: r.date,
        sold_at: null,
        raw_item_name: `${EOP_PREFIX} ${t.name}`,
        quantity: cents < 0 ? -1 : 1,
        unit_price_cents: Math.abs(cents),
        total_cents: cents,
        payment_type: t.payment,
        transaction_ref: r.reconcile ? `EOP ${r.reconcile}` : `EOP ${r.date}`,
        fingerprint: "",
      });
    }
  });
  // Same report + same payment type = same fingerprint, so uploading a report
  // again (even retyped or as a different file) never counts it twice.
  for (const l of lines) l.fingerprint = await sha256Hex(`eop|${l.transaction_ref}|${l.sale_date}|${l.raw_item_name}`);
  return lines;
}
