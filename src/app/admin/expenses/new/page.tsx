import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";
import { ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Log shopping trip" };

/**
 * New shopping trip. The Shopping list page can pre-fill it with
 * ?supplier=Costco&items=<productId>:<qty>,<productId>:<qty>
 */
export default async function NewExpensePage(props: PageProps<"/admin/expenses/new">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase.from("products").select("id, name, unit_cost_cents, is_perishable").eq("archived", false).order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);

  const supplierName = typeof params.supplier === "string" ? params.supplier : "";
  const initialSupplierId = suppliers?.find((s) => s.name === supplierName)?.id ?? "";
  const initialLines =
    typeof params.items === "string"
      ? params.items
          .split(",")
          .map((pair) => pair.split(":"))
          .map(([product_id, qty]) => ({ product_id, quantity: Number.parseInt(qty, 10) || 1 }))
      : [];

  return (
    <>
      <Link
        href="/admin/expenses"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" /> Expenses
      </Link>
      <PageHeader
        title="Log shopping trip"
        description={initialLines.length ? `Filled in from the shopping list for ${supplierName}. Change anything that was different at the store.` : undefined}
      />
      <ExpenseForm
        products={products ?? []}
        suppliers={suppliers ?? []}
        today={storeToday()}
        initialSupplierId={initialSupplierId}
        initialLines={initialLines}
      />
    </>
  );
}
