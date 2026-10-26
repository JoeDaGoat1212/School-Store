import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ChevronLeftIcon, ReceiptIcon, ShoppingCartIcon } from "lucide-react";
import { PrintButton } from "@/components/staff/print-button";
import { EmptyState } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay } from "@/lib/format";
import { loadInventory, type InventoryRow } from "../load-inventory";

export const metadata: Metadata = { title: "Shopping list" };

/**
 * What to buy on the next trip, grouped by store.
 * Quantity = enough to last until the following trip (plus the safety
 * buffer), minus what's available now. See src/lib/calculations.ts.
 */
export default async function ShoppingListPage() {
  const { supabase } = await requireAdmin();
  const inv = await loadInventory(supabase);

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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> Inventory
        </Link>
        {toBuy.length > 0 && <PrintButton />}
      </div>

      <h1 className="font-heading text-3xl font-bold tracking-tight">Shopping list</h1>
      <p className="mt-1 text-muted-foreground">
        Enough to last {inv.shopping_interval_days} days plus {inv.reorder_buffer_days} safety days
        {inv.next_shopping_date && <> · next trip planned {formatDay(inv.next_shopping_date, { weekday: "long" })}</>}
      </p>

      {/* How often to shop */}
      <section className="mt-6 flex gap-4 rounded-2xl border bg-card p-5 shadow-soft print:border-black">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <CalendarClockIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Shop every {inv.frequency.days} days
            <span className="ml-2 text-base font-normal text-muted-foreground">
              about {formatCents(inv.frequency.budgetCents)} per trip
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {inv.frequency.reason} The trip budget is what the store sells in {inv.frequency.days} days, at cost.
            {inv.frequency.days !== inv.shopping_interval_days &&
              ` (Settings currently say every ${inv.shopping_interval_days} days.)`}
          </p>
        </div>
      </section>

      {toBuy.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={ShoppingCartIcon} title="Nothing to buy right now">
            Everything has enough stock to last until the next trip.
          </EmptyState>
        </div>
      ) : (
        <>
          {groups.map(([supplier, items]) => {
            const subtotal = items.reduce((s, r) => s + r.buy * r.unit_cost_cents, 0);
            return (
              <section key={supplier} className="mt-8 break-inside-avoid">
                <div className="flex flex-wrap items-baseline gap-3 border-b-2 border-foreground pb-2">
                  <h2 className="font-heading text-xl font-bold">{supplier}</h2>
                  <span className="text-sm text-muted-foreground">
                    {items.length} item{items.length === 1 ? "" : "s"} · about {formatCents(subtotal)}
                  </span>
                  <Button asChild variant="outline" size="sm" className="no-print ml-auto">
                    <Link href={tripLink(supplier, items)}>
                      <ReceiptIcon /> Log this trip
                    </Link>
                  </Button>
                </div>
                <table className="mt-2 w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-8 py-2 font-medium">
                        <span className="sr-only">Got it</span>
                      </th>
                      <th className="py-2 font-medium">Item</th>
                      <th className="w-20 py-2 text-right font-medium">Have</th>
                      <th className="w-20 py-2 text-right font-medium">Buy</th>
                      <th className="w-28 py-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="w-7 py-2">
                          <span aria-hidden className="inline-block size-4 rounded border-2 border-current align-middle" />
                        </td>
                        <td className="py-2">
                          <span className="font-medium">{r.name}</span>
                          {r.is_perishable && r.shelfLifeDays && (
                            <span className="ml-2 text-xs text-muted-foreground">lasts ~{r.shelfLifeDays} days</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-muted-foreground tabular-nums">{r.available}</td>
                        <td className="py-2 text-right font-heading text-base font-bold tabular-nums">{r.buy}</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(r.buy * r.unit_cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

          <div className="mt-8 flex items-baseline justify-between rounded-2xl bg-muted p-5 print:border print:border-black">
            <span className="font-semibold">Estimated budget</span>
            <span className="font-heading text-3xl font-bold tabular-nums">{formatCents(total)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Based on each product&apos;s last known cost.</p>
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
