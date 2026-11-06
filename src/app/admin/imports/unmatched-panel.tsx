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
    <details className="group rounded-2xl border bg-card shadow-soft">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-semibold">
            Optional: {items.length === 1 ? "1 item name" : `${items.length} item names`} not linked to a product
          </span>
          <span className="block text-sm text-muted-foreground">
            Sales already count. Link them only if you want stock and per-item profit to track them too.
          </span>
        </span>
        <span className="text-sm font-semibold text-ember-ink group-open:hidden">Show</span>
        <span className="hidden text-sm font-semibold text-ember-ink group-open:inline">Hide</span>
      </summary>
      <ul className="divide-y border-t">
        {items.map((item) => (
          <UnmatchedRow key={item.raw_item_name} item={item} products={products} />
        ))}
      </ul>
    </details>
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
