import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { EOP_PREFIX } from "@/lib/end-of-period";
import { ImportHistory, type ImportRow } from "./import-history";
import { ImportWizard } from "./import-wizard";
import { UnmatchedPanel } from "./unmatched-panel";

export const metadata: Metadata = { title: "Sales import" };

/**
 * Bringing in sales from InTouchPay. This is where revenue comes from: the
 * site never counts online orders as revenue on its own (they're rung up in
 * InTouchPay at pickup and show up in the export).
 */
export default async function ImportsPage() {
  const { supabase } = await requireAdmin();

  const [products, aliases, imports, unmatched] = await Promise.all([
    supabase.from("products").select("id, name").order("name"),
    supabase.from("product_aliases").select("alias, product_id"),
    supabase
      .from("sales_imports")
      .select("id, file_name, created_at, date_from, date_to, imported_count, duplicate_count, revenue_cents, undone_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("unmatched_item_names"),
  ]);

  return (
    <>
      <PageHeader
        title="Sales import"
        description="Upload a file from InTouchPay. The item-by-item export also updates stock; an End of Period Summary imports by itself with no questions."
      />
      <div className="grid gap-8">
        <ImportWizard products={products.data ?? []} aliases={aliases.data ?? []} />
        <UnmatchedPanel
          // End of Period lines are day totals, not items, so they never need a product.
          items={(unmatched.data ?? []).filter((u: { raw_item_name: string }) => !u.raw_item_name.startsWith(EOP_PREFIX))}
          products={products.data ?? []} />
        <ImportHistory imports={(imports.data ?? []) as ImportRow[]} />
      </div>
    </>
  );
}
