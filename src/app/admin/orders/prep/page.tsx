import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ClipboardCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/staff/page-header";
import { formatOrderNumber } from "@/config/brand";
import { requireAdmin } from "@/lib/auth";
import { formatClock, formatDay, storeToday } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/order-status";
import { isIsoDate, loadOrdersForDay, type QueueOrder } from "../load-orders";
import { PrintButton } from "@/components/staff/print-button";

export const metadata: Metadata = { title: "Prep list" };

/** Adds up item quantities across orders: { "Hot Cheetos": 5, ... } sorted by name. */
function totalItems(orders: QueueOrder[]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      totals.set(item.product_name, (totals.get(item.product_name) ?? 0) + item.quantity);
    }
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * What to pack for each pickup window, plus a slip per order.
 * Only open orders (New, Preparing, Ready) are included.
 */
export default async function PrepListPage(props: PageProps<"/admin/orders/prep">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();
  const date = isIsoDate(params.date) ? params.date : storeToday();

  const { orders, windows } = await loadOrdersForDay(supabase, date);
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const groups = windows
    .map((w) => ({ window: w, orders: open.filter((o) => o.pickup_window_id === w.id) }))
    .filter((g) => g.orders.length > 0);
  const dayTotals = totalItems(open);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/orders?date=${date}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> Orders
        </Link>
        {open.length > 0 && <PrintButton />}
      </div>

      <h1 className="font-heading text-3xl font-bold tracking-tight">
        Prep list · {formatDay(date, { weekday: "long", month: "long" })}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {open.length} open order{open.length === 1 ? "" : "s"} · printed {new Date().toLocaleString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" })}
      </p>

      {open.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={ClipboardCheckIcon} title="Nothing to prep">
            There are no open orders for this day.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Whole-day totals: what to pull from the shelf */}
          <section className="mt-8 break-inside-avoid rounded-2xl border bg-card p-5 print:rounded-none print:border-black">
            <h2 className="font-heading text-lg font-bold">Whole day</h2>
            <ItemTotals rows={dayTotals} />
          </section>

          {groups.map(({ window, orders: list }) => (
            <section key={window.id} className="mt-8 break-before-auto">
              <div className="flex items-baseline gap-3 border-b-2 border-foreground pb-2">
                <h2 className="font-heading text-xl font-bold">{window.label}</h2>
                <span className="text-sm text-muted-foreground">
                  {formatClock(window.starts_at)} · {list.length} order{list.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 break-inside-avoid">
                <ItemTotals rows={totalItems(list)} />
              </div>

              {/* One slip per order, to put in each bag */}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                {list.map((o) => (
                  <li key={o.id} className="break-inside-avoid rounded-xl border border-dashed p-3 print:border-black">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-heading text-xl font-extrabold tabular-nums">
                        {formatOrderNumber(o.order_number)}
                      </span>
                      <span className="text-sm font-semibold">
                        {o.first_name} {o.last_name}
                      </span>
                    </div>
                    <ul className="mt-2 grid gap-0.5 text-sm">
                      {o.items.map((i) => (
                        <li key={i.product_name} className="flex gap-2">
                          <span aria-hidden className="inline-block size-3.5 translate-y-0.5 rounded-sm border border-current" />
                          <span className="font-semibold tabular-nums">{i.quantity}×</span> {i.product_name}
                        </li>
                      ))}
                    </ul>
                    {o.staff_notes && <p className="mt-2 text-xs italic">Note: {o.staff_notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ItemTotals({ rows }: { rows: [string, number][] }) {
  return (
    <table className="mt-2 w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Item</th>
          <th>Quantity</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, qty]) => (
          <tr key={name} className="border-b last:border-0">
            <td className="py-1.5">{name}</td>
            <td className="w-16 py-1.5 text-right font-heading text-base font-bold tabular-nums">{qty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
