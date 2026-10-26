/**
 * Turning a sales export (CSV or Excel) into clean sales lines.
 *
 * Runs in the browser before anything is saved, so the admin can preview
 * the result. Every function here is plain and tested in sales-import.test.ts.
 *
 * The InTouchPay export's exact columns may change; that's why the admin
 * matches columns by hand (with our best guess filled in).
 */

/** A spreadsheet cell: CSV gives strings, Excel can also give numbers and dates. */
export type Cell = string | number | boolean | Date | null | undefined;

/** Arizona doesn't use daylight saving time, so it's always UTC−7. */
const STORE_UTC_OFFSET = "-07:00";

// ---- Columns -------------------------------------------------------------------

export const FIELDS = [
  { key: "date", label: "Date", required: true, words: ["date", "day", "sold", "created", "timestamp"] },
  { key: "time", label: "Time", required: false, words: ["time"] },
  { key: "item", label: "Item name", required: true, words: ["item", "product", "name", "description", "menu"] },
  { key: "quantity", label: "Quantity", required: true, words: ["qty", "quantity", "count", "units", "#"] },
  { key: "unit_price", label: "Price each", required: false, words: ["unit price", "price", "each", "rate"] },
  { key: "total", label: "Line total", required: false, words: ["line total", "total", "amount", "subtotal", "net", "sales"] },
  { key: "payment", label: "Payment type", required: false, words: ["payment", "tender", "method", "pay", "type"] },
  { key: "transaction", label: "Transaction / receipt #", required: false, words: ["transaction", "receipt", "order", "ticket", "invoice", "id"] },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
/** Field → column number (0-based), or -1 for "not in this file". */
export type Mapping = Record<FieldKey, number>;

const norm = (s: Cell) => String(s ?? "").trim().toLowerCase();

/** The header is the first row (of the first 10) that looks like column names. */
export function findHeaderRow(rows: Cell[][]) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const texts = rows[i].map(norm).filter((t) => t && Number.isNaN(Number(t)));
    const hits = texts.filter((t) => FIELDS.some((f) => f.words.some((w) => t.includes(w))));
    if (texts.length >= 3 && hits.length >= 2) return i;
  }
  return 0;
}

/** Best guess of which column is which, by header names. */
export function guessMapping(headers: Cell[]): Mapping {
  const names = headers.map(norm);
  const used = new Set<number>();
  const mapping = {} as Mapping;

  for (const field of FIELDS) {
    let best = -1;
    let bestScore = 0;
    names.forEach((name, i) => {
      if (used.has(i) || !name) return;
      for (const [rank, word] of field.words.entries()) {
        // Exact name beats "contains"; earlier words in the list beat later ones.
        const score = (name === word ? 100 : name.includes(word) ? 50 : 0) - rank;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
    });
    // "Time" inside "Date/Time" is fine for the date, but don't also use it as time.
    mapping[field.key] = best;
    if (best >= 0) used.add(best);
  }
  return mapping;
}

/** Lists what's missing from a mapping, in words. Empty = ready. */
export function mappingProblems(m: Mapping) {
  const problems: string[] = [];
  for (const f of FIELDS) if (f.required && m[f.key] < 0) problems.push(`Choose the ${f.label} column.`);
  if (m.unit_price < 0 && m.total < 0) problems.push("Choose either the Price each or the Line total column.");
  return problems;
}

// ---- Values -------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** A date cell → "YYYY-MM-DD" (plus a time if the cell had one), or null. */
export function parseDateCell(cell: Cell): { date: string; time: string | null } | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    // Excel dates come in as UTC; read the parts in UTC so the day doesn't shift.
    const time = cell.getUTCHours() || cell.getUTCMinutes() ? `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}:00` : null;
    return { date: `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`, time };
  }
  const text = String(cell ?? "").trim();
  if (!text) return null;

  // Split off a time if the date and time are in the same cell.
  const [, datePart, timePart] = text.match(/^(\S+)(?:[ T]+(.+))?$/) ?? [];
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;

  if ((match = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/))) {
    // US style: month/day/year
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { date: `${y}-${pad(m)}-${pad(d)}`, time: timePart ? parseTimeCell(timePart) : null };
}

/** "1:05 PM", "13:05", "1:05:30 pm" or an Excel time → "HH:MM:SS", or null. */
export function parseTimeCell(cell: Cell): string | null {
  if (cell instanceof Date) return `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}:${pad(cell.getUTCSeconds())}`;
  if (typeof cell === "number" && cell >= 0 && cell < 1) {
    // Excel stores times as a fraction of a day.
    const secs = Math.round(cell * 86400);
    return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }
  const match = String(cell ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!match) return null;
  let h = Number(match[1]);
  const ampm = match[4]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${match[2]}:${match[3] ?? "00"}`;
}

/** "$1.50", "-$2.00", "(2.00)", "1,234.5" or 1.5 → cents, or null. */
export function parseMoneyCell(cell: Cell): number | null {
  if (typeof cell === "number") return Math.round(cell * 100);
  let text = String(cell ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.includes("-")) negative = true;
  text = text.replace(/[$,\s-]/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const cents = Math.round(Number.parseFloat(text) * 100);
  return negative ? -cents : cents;
}

/** Whole-number quantities only; refunds can be negative. */
export function parseQuantityCell(cell: Cell): number | null {
  const n = typeof cell === "number" ? cell : Number(String(cell ?? "").trim().replace(/,/g, ""));
  return Number.isInteger(n) && n !== 0 ? n : null;
}

/** Anything with "cash" is cash; card words are debit; everything else is "other". */
export function parsePaymentCell(cell: Cell): "cash" | "debit" | "other" {
  const t = norm(cell);
  if (t.includes("cash")) return "cash";
  if (/(debit|card|credit|visa|master|amex|discover|tap|chip|swipe|apple|google)/.test(t)) return "debit";
  return "other";
}

// ---- Lines -------------------------------------------------------------------

export type ParsedLine = {
  row: number; // row number in the file, for error messages (1-based, like a spreadsheet)
  sale_date: string;
  sold_at: string | null;
  raw_item_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  payment_type: "cash" | "debit" | "other";
  transaction_ref: string | null;
  /** Identifies this exact sale, so it's never imported twice. Filled in by addFingerprints(). */
  fingerprint: string;
};

export type RowError = { row: number; message: string };

/**
 * Reads every data row using the column mapping.
 * Rows that can't be understood are listed in `errors` (and skipped).
 * Completely empty rows and "Total" summary rows are ignored.
 */
export function buildLines(rows: Cell[][], headerRow: number, m: Mapping) {
  const lines: ParsedLine[] = [];
  const errors: RowError[] = [];
  const get = (r: Cell[], key: FieldKey) => (m[key] >= 0 ? r[m[key]] : undefined);

  rows.slice(headerRow + 1).forEach((r, i) => {
    const row = headerRow + i + 2;
    if (r.every((c) => norm(c) === "")) return;
    const item = String(get(r, "item") ?? "").trim();
    if (!item && /total/i.test(r.map(String).join(" "))) return; // summary row at the bottom

    const when = parseDateCell(get(r, "date"));
    if (!when) return errors.push({ row, message: `Can't read the date "${get(r, "date") ?? ""}"` });
    if (!item) return errors.push({ row, message: "No item name" });

    const quantity = parseQuantityCell(get(r, "quantity"));
    if (quantity === null) return errors.push({ row, message: `Can't read the quantity "${get(r, "quantity") ?? ""}"` });

    const unit = m.unit_price >= 0 ? parseMoneyCell(get(r, "unit_price")) : null;
    const total = m.total >= 0 ? parseMoneyCell(get(r, "total")) : null;
    if (unit === null && total === null) return errors.push({ row, message: "Can't read the price" });

    const time = m.time >= 0 ? parseTimeCell(get(r, "time")) : when.time;
    lines.push({
      row,
      sale_date: when.date,
      sold_at: time ? `${when.date}T${time}${STORE_UTC_OFFSET}` : null,
      raw_item_name: item,
      quantity,
      // Fill in whichever price is missing. Refund prices are kept positive; the quantity carries the minus.
      unit_price_cents: Math.abs(unit ?? Math.round(total! / quantity)),
      total_cents: total ?? unit! * quantity,
      payment_type: parsePaymentCell(get(r, "payment")),
      transaction_ref: m.transaction >= 0 ? String(get(r, "transaction") ?? "").trim() || null : null,
      fingerprint: "",
    });
  });

  return { lines, errors };
}

/**
 * Gives each line a fingerprint: a hash of everything about the sale.
 * Two truly identical lines in one file (same item, time, price…) get
 * "#1", "#2" added so both are kept, but importing an overlapping file
 * later produces the same fingerprints, so nothing is counted twice.
 */
export async function addFingerprints(lines: ParsedLine[]) {
  const seen = new Map<string, number>();
  for (const l of lines) {
    const key = [l.sale_date, l.sold_at, l.transaction_ref, l.raw_item_name.toLowerCase(), l.quantity, l.unit_price_cents, l.total_cents, l.payment_type].join("|");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    l.fingerprint = await sha256Hex(`${key}#${n}`);
  }
  return lines;
}

/** SHA-256 of text (or a file's bytes) as hex. Works in browsers and Node. */
export async function sha256Hex(data: string | ArrayBuffer) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Finds the product for an item name: saved InTouchPay names first, then exact product names. */
export function matchProduct(
  rawName: string,
  aliases: Map<string, string>,
  productNames: Map<string, string>,
): string | null {
  const key = rawName.trim().toLowerCase();
  return aliases.get(key) ?? productNames.get(key) ?? null;
}
