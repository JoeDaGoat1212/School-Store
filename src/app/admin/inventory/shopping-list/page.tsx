import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ShoppingCartIcon } from "lucide-react";
import { PrintButton } from "@/components/staff/print-button";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay, storeToday } from "@/lib/format";
import { loadInventory, type InventoryRow } from "../load-inventory";
import { type ShoppingGroup, ShoppingChecklist } from "./shopping-checklist";
import { SnapReceipt } from "./snap-receipt";

export const metadata: Metadata = { title: "Shopping list" };

/**
 * What to buy on the next trip, grouped by store.
 * Quantity = enough to last until the following trip (plus the safety
 * buffer), minus what's available now. See src/lib/calculations.ts.
 */
export default async function ShoppingListPage() {
  const { supabase } = await requireAdmin();
  const [inv, { data: suppliers }] = await Promise.all([loadInventory(supabase), supabase.from("suppliers").select("name").order("name")]);

  // Buy anything the math says we need, plus anything out or low even if it isn't selling.
  const toBuy = inv.rows
    .map((r) => ({ ...r, buy: r.suggestedQuantity || (r.level !== "ok" ? Math.max(r.reorder_point - r.available + 1, 1) : 0) }))
    .filter((r) => r.buy > 0);

  const bySupplier = new Map<string, typeof toBuy>();
  for (const r of toBuy) {
    const key = r.supplier ?? "Any store";
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), r]);
  }
  const groups = [...bySupplier.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = toBuy.reduce((sum, r) => sum + r.buy * r.unit_cost_cents, 0);

  const stores = [...new Set([...groups.map(([name]) => name).filter((n) => n !== "Any store"), ...(suppliers ?? []).map((x) => x.name)])];
  const checklist: ShoppingGroup[] = groups.map(([store, items]) => ({
    store,
    tripHref: tripLink(store, items),
    items: items.map((r) => ({
      id: r.id,
      name: r.name,
      have: r.available,
      buy: r.buy,
      costCents: r.unit_cost_cents,
      lasts: r.is_perishable && r.shelfLifeDays ? r.shelfLifeDays : null,
    })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Shopping list"
        description={`Enough to last ${inv.shopping_interval_days} days plus ${inv.reorder_buffer_days} spare days.${inv.next_shopping_date ? ` Next trip ${formatDay(inv.next_shopping_date, { weekday: "long" })}.` : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" className="no-print">
              <Link href="/admin/inventory">
                <ChevronLeftIcon /> Inventory
              </Link>
            </Button>
            {toBuy.length > 0 && <PrintButton />}
          </>
        }
      />

      <SnapReceipt stores={stores} />

      <p className="mt-6 border-l-2 border-[var(--brand)] pl-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          Shop every {inv.frequency.days} days, about {formatCents(inv.frequency.budgetCents)} a trip.
        </span>{" "}
        {inv.frequency.reason} The trip budget is what the store sells in {inv.frequency.days} days, at cost.
        {inv.frequency.days !== inv.shopping_interval_days && ` Settings currently say every ${inv.shopping_interval_days} days.`}
      </p>

      {toBuy.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={ShoppingCartIcon} title="Nothing to buy right now">
            Everything has enough stock to last until the next trip.
          </EmptyState>
        </div>
      ) : (
        <>
          <ShoppingChecklist groups={checklist} today={storeToday()} totalCents={total} />
          <p className="mt-3 text-xs text-muted-foreground">Costs use each product&apos;s last known price.</p>
        </>
      )}
    </div>
  );
}

/** Link to a new shopping trip with this store's items already filled in. */
function tripLink(supplier: string, items: (InventoryRow & { buy: number })[]) {
  const params = new URLSearchParams({
    supplier,
    items: items.map((r) => `${r.id}:${r.buy}`).join(","),
  });
  return `/admin/expenses/new?${params}`;
}
