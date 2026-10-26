import type { Metadata } from "next";
import Link from "next/link";
import { PrinterIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatDay, relativeDay, storeToday } from "@/lib/format";
import { isIsoDate, loadOrdersForDay } from "./load-orders";
import { OrderQueue } from "./order-queue";

export const metadata: Metadata = { title: "Orders" };

/**
 * The order queue. Shows one pickup day at a time (today by default).
 * Filters, search and the status buttons live in <OrderQueue>.
 */
export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();

  const today = storeToday();
  const date = isIsoDate(params.date) ? params.date : today;
  const status = typeof params.status === "string" ? params.status : undefined;

  const [{ orders, windows }, { data: nextDay }] = await Promise.all([
    loadOrdersForDay(supabase, date),
    supabase.rpc("next_open_day", { d: today }),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${relativeDay(date, today)} · ${formatDay(date, { weekday: "long", month: "long" })}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/admin/orders/prep?date=${date}`}>
              <PrinterIcon /> Prep list
            </Link>
          </Button>
        }
      />
      <OrderQueue
        // A new key when the day changes resets the filters.
        key={date}
        orders={orders}
        windows={windows}
        date={date}
        today={today}
        nextDay={nextDay ?? null}
        initialStatus={status}
      />
    </>
  );
}
