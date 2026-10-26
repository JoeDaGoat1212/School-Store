import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatCents } from "@/lib/format";
import { InventoryTable } from "./inventory-table";
import { loadInventory } from "./load-inventory";
import { ReorderPointsButton } from "./reorder-points-button";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { supabase } = await requireAdmin();
  const inv = await loadInventory(supabase);

  const out = inv.rows.filter((r) => r.level === "out").length;
  const low = inv.rows.filter((r) => r.level === "low").length;
  const expiring = inv.rows.filter((r) => r.expiry === "expired" || r.expiry === "soon").length;
  const stockValue = inv.rows.reduce((sum, r) => sum + Math.max(r.stock, 0) * r.unit_cost_cents, 0);

  const reorderChanges = inv.rows
    .filter((r) => r.avgPerDay > 0 && r.suggestedReorderPoint !== r.reorder_point)
    .map((r) => ({ id: r.id, name: r.name, from: r.reorder_point, to: r.suggestedReorderPoint }));

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`Sales averages use the last ${inv.window_days} days of paid sales (online pickups and imported sales).`}
        actions={
          <>
            <ReorderPointsButton changes={reorderChanges} />
            <Button asChild>
              <Link href="/admin/inventory/shopping-list">
                <ShoppingCartIcon /> Shopping list
              </Link>
            </Button>
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Out of stock" value={out} tone={out ? "danger" : undefined} />
        <Stat label="Running low" value={low} tone={low ? "warning" : undefined} />
        <Stat label="Expired or expiring soon" value={expiring} tone={expiring ? "warning" : undefined} />
        <Stat label="Stock value (at cost)" value={formatCents(stockValue)} />
      </dl>

      <InventoryTable rows={inv.rows} today={inv.today} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 font-heading text-3xl font-bold tabular-nums ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
