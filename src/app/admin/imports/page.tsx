import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
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
        description="Upload the sales export from InTouchPay. This is how revenue gets into the site, and how in-person sales come out of stock."
      />
      <div className="grid gap-8">
        <ImportWizard products={products.data ?? []} aliases={aliases.data ?? []} />
        <UnmatchedPanel items={unmatched.data ?? []} products={products.data ?? []} />
        <ImportHistory imports={(imports.data ?? []) as ImportRow[]} />
      </div>
    </>
  );
}
