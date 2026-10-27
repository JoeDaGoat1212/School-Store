"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { brand } from "@/config/brand";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getStockHistory } from "./actions";

/** Plain-English names for each kind of stock change. */
const REASON_LABEL: Record<string, string> = {
  initial: "Starting count",
  restock: "Shopping trip",
  online_pickup: "Online order picked up",
  online_pickup_undo: "Pickup undone",
  sale_import: "In-person sales (import)",
  manual_adjustment: "Adjustment",
  spoilage: "Spoiled / damaged",
};

type Row = Awaited<ReturnType<typeof getStockHistory>>["rows"][number];

/** Side panel listing a product's recent stock changes. */
export function HistorySheet({
  product,
  open,
  onOpenChange,
}: {
  product: { id: string; name: string; stock: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const productId = product?.id;

  useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    getStockHistory(productId).then((result) => {
      if (!cancelled) setRows(result.rows);
    });
    return () => {
      cancelled = true;
      setRows(null);
    };
  }, [open, productId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product?.name} history</SheetTitle>
          <SheetDescription>Every change to the count, newest first. Now: {product?.stock} in stock.</SheetDescription>
        </SheetHeader>

        {rows === null ? (
          <div className="grid place-items-center py-16">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No stock changes yet.</p>
        ) : (
          <ol className="divide-y px-4 pb-6">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                <span
                  className={cn(
                    "w-12 shrink-0 text-right font-heading text-base font-bold tabular-nums",
                    r.change > 0 ? "text-success" : "text-foreground",
                  )}
                >
                  {r.change > 0 ? "+" : ""}
                  {r.change}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{REASON_LABEL[r.reason] ?? r.reason}</span>
                  {r.note && <span className="block text-muted-foreground">{withOrderPrefix(r.note)}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDay(r.effective_date)}</span>
              </li>
            ))}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The database writes notes like "Online order SS-0042 picked up" (SS was the
 * original prefix). Show them with the current prefix from brand.ts instead.
 */
function withOrderPrefix(note: string) {
  return note.replace(/\bSS-(\d{4,})/g, `${brand.orderPrefix}-$1`);
}
