"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { margin, sellThrough, type ProductInsight } from "./types";

type SortKey = "name" | "units" | "revenue" | "profit" | "margin" | "sellThrough" | "stock";

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: "name", label: "Product" },
  { key: "units", label: "Sold" },
  { key: "revenue", label: "Revenue" },
  { key: "profit", label: "Gross profit", hint: "Revenue − units sold × cost" },
  { key: "margin", label: "Margin" },
  { key: "sellThrough", label: "Sell-through", hint: "Sold ÷ (stock at the start + bought during the range)" },
  { key: "stock", label: "In stock" },
];

const value = (p: ProductInsight, key: SortKey): number | string => {
  switch (key) {
    case "name":
      return p.name.toLowerCase();
    case "units":
      return p.units;
    case "revenue":
      return p.revenue_cents;
    case "profit":
      return p.gross_profit_cents;
    case "margin":
      return margin(p) ?? -1;
    case "sellThrough":
      return sellThrough(p) ?? -1;
    case "stock":
      return p.stock;
  }
};

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** Every product's numbers for the range. Click a column header to sort. */
export function ProductTable({ products }: { products: ProductInsight[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "revenue", desc: true });

  const rows = [...products].sort((a, b) => {
    const [x, y] = [value(a, sort.key), value(b, sort.key)];
    const order = x < y ? -1 : x > y ? 1 : 0;
    return sort.desc ? -order : order;
  });

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c, i) => {
              const active = sort.key === c.key;
              return (
                <TableHead
                  key={c.key}
                  className={cn(i === 0 ? "pl-4" : "text-right", i === COLUMNS.length - 1 && "pr-4")}
                  aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    title={c.hint}
                    onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : c.key !== "name" })}
                    className={cn("inline-flex items-center gap-1 font-medium hover:text-foreground", active && "text-foreground")}
                  >
                    {c.label}
                    {active && (sort.desc ? <ArrowDownIcon className="size-3.5" /> : <ArrowUpIcon className="size-3.5" />)}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const m = margin(p);
            return (
              <TableRow key={p.id}>
                <TableCell className="pl-4">
                  <span className="mr-2" aria-hidden>
                    {p.emoji ?? "🛍️"}
                  </span>
                  <span className="font-medium">{p.name}</span>
                  {p.archived && <span className="ml-2 text-xs text-muted-foreground">(archived)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(p.revenue_cents)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(p.gross_profit_cents)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", m !== null && m < 0.3 && "font-medium text-warning")}>{pct(m)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(sellThrough(p))}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{p.stock}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
