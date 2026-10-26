"use client";

import { useState, useTransition } from "react";
import { Link2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents, formatDay } from "@/lib/format";
import { linkItemName } from "./actions";

type Unmatched = { raw_item_name: string; lines: number; units: number; revenue_cents: number; last_sold: string };

/** Imported item names that aren't linked to a product yet, with a quick "link" control for each. */
export function UnmatchedPanel({ items, products }: { items: Unmatched[]; products: { id: string; name: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warning/40 bg-card shadow-soft" aria-labelledby="unmatched-heading">
      <div className="border-b px-5 py-4">
        <h2 id="unmatched-heading" className="font-heading text-lg font-semibold">
          {items.length === 1 ? "1 item name needs" : `${items.length} item names need`} a product
        </h2>
        <p className="text-sm text-muted-foreground">
          These sales count toward revenue, but not toward any product&apos;s stock or profit until they&apos;re linked.
          Linking also fixes past stock and is remembered for future imports.
        </p>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <UnmatchedRow key={item.raw_item_name} item={item} products={products} />
        ))}
      </ul>
    </section>
  );
}

function UnmatchedRow({ item, products }: { item: Unmatched; products: { id: string; name: string }[] }) {
  const [productId, setProductId] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-48 flex-1">
        <p className="font-mono text-sm font-semibold">{item.raw_item_name}</p>
        <p className="text-xs text-muted-foreground">
          {item.units} sold · {formatCents(item.revenue_cents)} · last sold {formatDay(item.last_sold)}
        </p>
      </div>
      <Select value={productId} onValueChange={setProductId}>
        <SelectTrigger className="h-9 w-56" aria-label={`Product for ${item.raw_item_name}`}>
          <SelectValue placeholder="Choose a product" />
        </SelectTrigger>
        <SelectContent>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={!productId || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await linkItemName(item.raw_item_name, productId);
            if (result.error) toast.error(result.error);
            else toast.success(`Linked ${result.linked} sale line${result.linked === 1 ? "" : "s"}`);
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />}
        Link
      </Button>
    </li>
  );
}
