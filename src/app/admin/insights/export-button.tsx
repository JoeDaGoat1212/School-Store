"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { margin, sellThrough, type Insights } from "./types";

/** Quotes a value for CSV if it contains a comma, quote or line break. */
function csvCell(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * Downloads the numbers as a CSV file that opens in Excel or Google Sheets:
 * a summary, the trend rows, and one row per product.
 */
export function ExportButton({ data, label }: { data: Insights; label: string }) {
  function download() {
    const t = data.totals;
    const lines: (string | number | null)[][] = [
      ["School Store insights", label],
      ["From", data.from, "To", data.to],
      [],
      ["Revenue", dollars(t.revenue_cents)],
      ["Spending", dollars(t.spending_cents)],
      ["Revenue minus spending", dollars(t.revenue_cents - t.spending_cents)],
      ["Gross profit", dollars(t.gross_profit_cents)],
      ["Cash", dollars(data.payments.cash ?? 0)],
      ["Debit", dollars(data.payments.debit ?? 0)],
      ["Online units", data.channels.online_units],
      ["In-person units", data.channels.total_units - data.channels.online_units],
      [],
      ["Period start", "Revenue", "Spending"],
      ...data.series.map((s) => [s.start, dollars(s.revenue_cents), dollars(s.spending_cents)]),
      [],
      ["Product", "Category", "Units sold", "Revenue", "Gross profit", "Margin %", "Sell-through %", "In stock", "Price", "Cost"],
      ...data.products.map((p) => {
        const m = margin(p);
        const st = sellThrough(p);
        return [
          p.name,
          p.category,
          p.units,
          dollars(p.revenue_cents),
          dollars(p.gross_profit_cents),
          m === null ? null : Math.round(m * 100),
          st === null ? null : Math.round(st * 100),
          p.stock,
          dollars(p.price_cents),
          dollars(p.unit_cost_cents),
        ];
      }),
      [],
      ["Store", "Spent", "Trips"],
      ...data.suppliers.map((s) => [s.name, dollars(s.cents), s.trips]),
    ];

    const csv = lines.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    // Some browsers need the link on the page and a moment before it's cleaned up.
    const a = document.createElement("a");
    a.href = url;
    a.download = `school-store-insights_${data.from}_to_${data.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button variant="outline" onClick={download}>
      <DownloadIcon /> Export CSV
    </Button>
  );
}
