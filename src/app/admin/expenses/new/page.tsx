import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatCents, storeToday } from "@/lib/format";
import { RECEIPT_BUCKET } from "@/lib/photos";
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

  // Started from a receipt photo snapped at the store (Expenses → Receipts to enter).
  const { data: snapped } =
    typeof params.receipt === "string"
      ? await supabase.from("receipt_inbox").select("path, store, total_cents, shopper, note, shopped_on").eq("id", params.receipt).maybeSingle()
      : { data: null };
  const receiptUrl = snapped ? (await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(snapped.path, 60 * 60)).data?.signedUrl : null;

  const supplierName = typeof params.supplier === "string" ? params.supplier : (snapped?.store ?? "");
  const matchedSupplier = suppliers?.find((s) => s.name.toLowerCase() === supplierName.toLowerCase());
  const initialSupplierId = matchedSupplier?.id ?? "";
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
        description={
          snapped
            ? `From the receipt snapped at ${snapped.store ?? "the store"}${snapped.total_cents !== null ? ` (total ${formatCents(snapped.total_cents)})` : ""}. Add each item from the receipt.`
            : initialLines.length
              ? `Filled in from the shopping list for ${supplierName}. Change anything that was different at the store.`
              : undefined
        }
      />
      {receiptUrl && (
        <a href={receiptUrl} target="_blank" rel="noreferrer" className="mb-6 flex items-center gap-4 rounded-2xl border bg-card p-3 shadow-soft hover:border-primary/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed receipt link */}
          {!snapped?.path.endsWith(".pdf") && <img src={receiptUrl} alt="The receipt" className="h-40 w-auto rounded-xl object-contain" />}
          <span className="text-sm font-semibold text-ember-ink">Open the receipt full size to read the items</span>
        </a>
      )}
      <ExpenseForm
        products={products ?? []}
        suppliers={suppliers ?? []}
        today={storeToday()}
        initialSupplierId={initialSupplierId}
        initialLines={initialLines}
        fromReceipt={
          snapped
            ? {
                path: snapped.path,
                date: snapped.shopped_on,
                buyer: snapped.shopper ?? "",
                newSupplier: matchedSupplier || !snapped.store ? "" : snapped.store,
                notes: snapped.note ?? "",
              }
            : undefined
        }
      />
    </>
  );
}
