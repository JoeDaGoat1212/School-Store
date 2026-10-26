import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, ExternalLinkIcon } from "lucide-react";
import { FlashToast } from "@/components/flash-toast";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay } from "@/lib/format";
import { RECEIPT_BUCKET } from "@/lib/photos";
import { DeleteExpenseButton } from "./delete-button";

export const metadata: Metadata = { title: "Shopping trip" };

export default async function ExpensePage(props: PageProps<"/admin/expenses/[id]">) {
  const { id } = await props.params;
  const { supabase } = await requireAdmin();

  const { data: e } = await supabase
    .from("expenses")
    .select("*, suppliers(name), expense_items(id, description, quantity, unit_cost_cents, line_total_cents, product_id)")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  // Receipts are private. A signed link works for 1 hour, for this page only.
  let receiptUrl: string | null = null;
  if (e.receipt_path) {
    const { data } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(e.receipt_path, 60 * 60);
    receiptUrl = data?.signedUrl ?? null;
  }
  const isPdf = e.receipt_path?.endsWith(".pdf");

  return (
    <>
      <Suspense>
        <FlashToast param="saved" text="Trip saved. Items were added to stock." />
      </Suspense>
      <Link
        href={`/admin/expenses?month=${e.purchased_on.slice(0, 7)}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" /> Expenses
      </Link>
      <PageHeader
        title={`${e.suppliers?.name ?? "Shopping trip"} · ${formatDay(e.purchased_on)}`}
        description={`Bought by ${e.buyer_name}`}
        actions={<DeleteExpenseButton expenseId={e.id} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Each</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.expense_items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-4">
                    {i.description}
                    {!i.product_id && <span className="ml-2 text-xs text-muted-foreground">(not stocked)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{formatCents(i.unit_cost_cents)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatCents(i.line_total_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="pl-4 font-semibold">
                  Total
                </TableCell>
                <TableCell className="pr-4 text-right font-heading text-lg font-bold tabular-nums">
                  {formatCents(e.total_cents)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-2xl border bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-heading text-base font-semibold">Receipt</h2>
            {receiptUrl ? (
              <>
                {isPdf ? (
                  <p className="text-sm text-muted-foreground">PDF receipt</p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptUrl} alt="Receipt" className="max-h-96 w-full rounded-lg border object-contain" />
                )}
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <a href={receiptUrl} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon /> Open full size
                  </a>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No receipt attached.</p>
            )}
          </section>
          {e.notes && (
            <section className="rounded-2xl border bg-card p-4 shadow-soft">
              <h2 className="mb-1 font-heading text-base font-semibold">Notes</h2>
              <p className="text-sm whitespace-pre-line">{e.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
