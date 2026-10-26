import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PaperclipIcon, PlusIcon, ReceiptIcon } from "lucide-react";
import { FlashToast } from "@/components/flash-toast";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay, storeToday } from "@/lib/format";

export const metadata: Metadata = { title: "Expenses" };

/** "2026-10" → { first: "2026-10-01", next: "2026-11-01", label: "October 2026" } */
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  return {
    first: `${month}-01`,
    nextFirst: `${next}-01`,
    prev,
    next,
    label: new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export default async function ExpensesPage(props: PageProps<"/admin/expenses">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();

  const thisMonth = storeToday().slice(0, 7);
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : thisMonth;
  const range = monthRange(month);

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, purchased_on, buyer_name, total_cents, receipt_path, notes, suppliers(name), expense_items(count)")
    .gte("purchased_on", range.first)
    .lt("purchased_on", range.nextFirst)
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const total = expenses.reduce((s, e) => s + e.total_cents, 0);

  return (
    <>
      <Suspense>
        <FlashToast param="deleted" text="Shopping trip deleted and its stock taken back off" />
      </Suspense>
      <PageHeader
        title="Expenses"
        description="Shopping trips. Saving a trip adds its items to stock."
        actions={
          <Button asChild>
            <Link href="/admin/expenses/new">
              <PlusIcon /> Log shopping trip
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/admin/expenses?month=${range.prev}`} aria-label="Previous month">
              <ChevronLeftIcon />
            </Link>
          </Button>
          <span className="min-w-36 text-center text-sm font-semibold">{range.label}</span>
          <Button variant="ghost" size="icon" asChild disabled={month >= thisMonth}>
            <Link
              href={`/admin/expenses?month=${range.next}`}
              aria-label="Next month"
              aria-disabled={month >= thisMonth}
              className={month >= thisMonth ? "pointer-events-none opacity-40" : undefined}
            >
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
        <p className="ml-auto text-sm">
          <span className="text-muted-foreground">Spent this month: </span>
          <span className="font-heading text-lg font-bold tabular-nums">{formatCents(total)}</span>
        </p>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={`No shopping trips in ${range.label}`}
          action={
            <Button asChild>
              <Link href="/admin/expenses/new">Log a shopping trip</Link>
            </Button>
          }
        >
          Log each trip with its receipt so profit and stock stay accurate.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Bought by</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4">
                  <span className="sr-only">Receipt</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id} className="relative">
                  <TableCell className="pl-4 font-medium">
                    {/* The link covers the whole row so any part of it can be clicked. */}
                    <Link href={`/admin/expenses/${e.id}`} className="after:absolute after:inset-0 hover:underline">
                      {formatDay(e.purchased_on)}
                    </Link>
                  </TableCell>
                  <TableCell>{e.suppliers?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.buyer_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.expense_items[0]?.count ?? 0}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCents(e.total_cents)}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {e.receipt_path ? (
                      <PaperclipIcon className="size-4" aria-label="Has receipt" />
                    ) : (
                      <span className="text-xs">No receipt</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
