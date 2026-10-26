"use client";

import Link from "next/link";
import { useState } from "react";
import { BoxesIcon, HistoryIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { EmptyState } from "@/components/staff/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { daysBetween } from "@/lib/calculations";
import { formatCents, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdjustDialog } from "./adjust-dialog";
import { HistorySheet } from "./history-sheet";
import type { InventoryRow } from "./load-inventory";

const VIEWS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low & out" },
  { key: "perishable", label: "Perishables" },
] as const;

export function InventoryTable({ rows, today }: { rows: InventoryRow[]; today: string }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);

  const visible = rows
    .filter((r) => (view === "low" ? r.level !== "ok" : view === "perishable" ? r.is_perishable : true))
    .filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    // Most urgent first: out, then low, then by days left.
    .sort((a, b) => rank(a) - rank(b) || a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products"
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Show">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                view === v.key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={BoxesIcon} title={view === "low" ? "Nothing is running low" : "No products match"}>
          {view === "low" ? "Every product is above its reorder point." : "Try a different search."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">
                  <Explain text="Average units paid for per day, over the sales window.">Sold / day</Explain>
                </TableHead>
                <TableHead className="text-right">
                  <Explain text="Available ÷ sold per day.">Days left</Explain>
                </TableHead>
                <TableHead className="text-right">
                  <Explain text="Warn when available stock drops to this.">Reorder at</Explain>
                </TableHead>
                <TableHead className="hidden text-right 2xl:table-cell">Cost / price</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="py-2.5 pl-4">
                    <div className="flex items-center gap-3">
                      <ProductArt
                        name={r.name}
                        photoPath={r.photo_path}
                        emoji={r.emoji}
                        category={r.category}
                        className="size-10 shrink-0 rounded-lg"
                        emojiClassName="text-xl"
                      />
                      <div className="min-w-0">
                        <Link href={`/admin/products/${r.id}`} className="block max-w-44 truncate font-semibold hover:underline">
                          {r.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{r.supplier ?? "No supplier"}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.level === "out" ? (
                      <Pill tone="danger">Out</Pill>
                    ) : r.level === "low" ? (
                      <Pill tone="warning">{r.available}</Pill>
                    ) : (
                      <span className="font-semibold">{r.available}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {r.stock} on shelf{r.reserved > 0 && ` · ${r.reserved} reserved`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.avgPerDay ? r.avgPerDay.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <DaysLeft days={r.daysLeft} leadDays={r.lead_days} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.reorder_point}
                    {r.avgPerDay > 0 && r.suggestedReorderPoint !== r.reorder_point && (
                      <span className="block text-xs text-muted-foreground">suggest {r.suggestedReorderPoint}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums 2xl:table-cell">
                    {formatCents(r.unit_cost_cents)} / {formatCents(r.price_cents)}
                  </TableCell>
                  <TableCell>
                    <Expiry row={r} today={today} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setAdjusting(r)}>
                        <SlidersHorizontalIcon /> Adjust
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Stock history for ${r.name}`} onClick={() => setHistory(r)}>
                        <HistoryIcon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {adjusting && (
        <AdjustDialog product={adjusting} open={adjusting !== null} onOpenChange={(o) => !o && setAdjusting(null)} />
      )}
      <HistorySheet product={history} open={history !== null} onOpenChange={(o) => !o && setHistory(null)} />
    </div>
  );
}

function rank(r: InventoryRow) {
  return r.level === "out" ? 0 : r.level === "low" ? 1 : 2;
}

/** A column header with a tooltip explaining the number. */
function Explain({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function DaysLeft({ days, leadDays }: { days: number; leadDays: number }) {
  if (days === Infinity) return <span className="text-muted-foreground">No recent sales</span>;
  const rounded = days < 10 ? days.toFixed(1) : Math.round(days).toString();
  // Red when it'll run out before a restock could arrive.
  return <span className={cn(days <= leadDays ? "font-semibold text-destructive" : days <= leadDays + 3 ? "text-warning" : "")}>{rounded}</span>;
}

function Expiry({ row, today }: { row: InventoryRow; today: string }) {
  if (!row.is_perishable) return <span className="text-muted-foreground">—</span>;
  if (!row.nextExpiry) return <span className="text-xs text-muted-foreground">No dates logged</span>;
  const days = daysBetween(today, row.nextExpiry);
  if (row.expiry === "expired") return <Pill tone="danger">Expired {formatDay(row.nextExpiry, { weekday: undefined })}</Pill>;
  if (row.expiry === "soon") return <Pill tone="warning">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</Pill>;
  return <span className="text-sm text-muted-foreground">{formatDay(row.nextExpiry)}</span>;
}
