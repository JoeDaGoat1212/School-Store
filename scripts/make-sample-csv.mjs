// Makes a fake InTouchPay sales export for testing the Sales import page.
//
//   npm run sample-csv              → sample-data/intouchpay-sample.csv (today's sales)
//   npm run sample-csv -- 2026-11-02 → sales for a specific day
//
// The real InTouchPay export may use different column names. That's fine:
// the import page lets you match columns by hand.

import { writeFileSync, mkdirSync } from "node:fs";

// Names exactly as the register prints them (these match the seed aliases),
// plus two the website doesn't know yet, to test the "unmatched" flow.
const ITEMS = [
  ["HOT CHEETOS 1OZ", 1.5, 8],
  ["DORITOS NACHO", 1.5, 6],
  ["TAKIS FUEGO", 1.5, 4],
  ["RICE KRISPIE TREAT", 1.0, 4],
  ["POPTART STRAWBERRY", 1.5, 4],
  ["SOUR PATCH KIDS", 1.5, 5],
  ["CUP NOODLE CHICKEN", 1.5, 4],
  ["UNCRUSTABLES PBJ", 2.0, 3],
  ["WATER 16.9OZ", 1.0, 9],
  ["GATORADE 20OZ", 2.0, 7],
  ["ARIZONA TEA CAN", 1.25, 6],
  ["CHOC MILK", 1.5, 2],
  ["PENCIL 2PK", 0.5, 1],
  ["FRUIT SNACKS", 1.0, 3], // unknown to the site
  ["GUM MINT", 1.0, 2], // unknown to the site
];

// Tiny repeatable random generator so the file is the same each run for a date.
function makeRandom(seedText) {
  let seed = [...seedText].reduce((a, c) => a + c.charCodeAt(0), 0);
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// "Today" in Arizona, as YYYY-MM-DD.
const arizonaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
const day = process.argv[2] ?? arizonaToday;
const [y, m, d] = day.split("-").map(Number);
const usDate = `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
const random = makeRandom(day);

const rows = [["Date", "Time", "Transaction #", "Item Name", "Qty", "Unit Price", "Line Total", "Payment Method"]];
let tx = 50000 + Math.floor(random() * 1000);

for (const [name, price, perDay] of ITEMS) {
  let left = Math.round(perDay * (0.6 + random() * 0.8));
  while (left > 0) {
    const qty = Math.min(left, 1 + Math.floor(random() * 2));
    left -= qty;
    tx += 1;
    const minutes = 7 * 60 + Math.floor(random() * 440); // 7:00 AM – 2:20 PM
    const h = Math.floor(minutes / 60);
    const time = `${((h + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    rows.push([
      usDate,
      time,
      `T${tx}`,
      name,
      String(qty),
      `$${price.toFixed(2)}`,
      `$${(price * qty).toFixed(2)}`,
      random() < 0.6 ? "Cash" : "Debit Card",
    ]);
  }
}

// One refund, which the import should handle (negative quantity).
rows.push([usDate, "1:05 PM", `T${tx + 1}`, "GATORADE 20OZ", "-1", "$2.00", "-$2.00", "Debit Card"]);

const csv = rows.map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
mkdirSync("sample-data", { recursive: true });
writeFileSync("sample-data/intouchpay-sample.csv", csv + "\n");
console.log(`Wrote sample-data/intouchpay-sample.csv (${rows.length - 1} lines for ${usDate})`);
