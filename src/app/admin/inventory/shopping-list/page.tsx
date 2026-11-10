import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ChevronLeftIcon, ShoppingCartIcon } from "lucide-react";
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
        description={`Enough to last ${inv.shopping_interval_days} days plus ${inv.reorder_buffer_days} safety days${inv.next_shopping_date ? ` · next trip ${formatDay(inv.next_shopping_date, { weekday: "long" })}` : ""}.`}
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

      {/* The numbers for this trip at a glance. */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "To buy", value: String(toBuy.length), sub: `item${toBuy.length === 1 ? "" : "s"}` },
          { label: "Stores", value: String(groups.length), sub: groups.length === 1 ? "stop" : "stops" },
          { label: "Budget", value: formatCents(total), sub: "estimated" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border bg-card p-4 shadow-soft">
            <p className="text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase">{t.label}</p>
            <p className="mt-1 font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">{t.value}</p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <SnapReceipt stores={stores} />

      {/* How often to shop */}
      <section className="mt-6 flex gap-4 rounded-2xl border bg-card p-5 shadow-soft print:border-black">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-ember-ink">
          <CalendarClockIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Shop every {inv.frequency.days} days
            <span className="ml-2 text-base font-normal text-muted-foreground">about {formatCents(inv.frequency.budgetCents)} per trip</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {inv.frequency.reason} The trip budget is what the store sells in {inv.frequency.days} days, at cost.
            {inv.frequency.days !== inv.shopping_interval_days && ` (Settings currently say every ${inv.shopping_interval_days} days.)`}
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
          <ShoppingChecklist groups={checklist} today={storeToday()} />
          <div className="mt-8 flex items-baseline justify-between rounded-2xl bg-neutral-950 p-5 text-white print:border print:border-black print:bg-transparent print:text-black">
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
