import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxesIcon,
  ClipboardListIcon,
  FileUpIcon,
  ReceiptIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay, formatTime, storeToday } from "@/lib/format";
import { ORDER_STATUS, type OrderStatus } from "@/lib/order-status";

type LowStockItem = { id: string; name: string; emoji: string | null; stock: number; reorder_point: number; reserved: number };

type Summary = {
  today: string;
  week_start: string;
  orders_today: Partial<Record<OrderStatus, number>>;
  orders_upcoming: number;
  week_revenue_cents: number;
  week_spending_cents: number;
  last_week_revenue_cents: number;
  last_week_spending_cents: number;
  last_import_at: string | null;
  last_sale_date: string | null;
  unmatched_sales_lines: number;
  low_stock: LowStockItem[];
  expiring_soon: number;
};

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("dashboard_summary");
  if (error) throw new Error(error.message);
  const s = data as unknown as Summary;

  const queue: OrderStatus[] = ["received", "preparing", "ready", "picked_up"];
  const openToday = (s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0);

  return (
    <>
      <PageHeader
        title={formatDay(s.today, { weekday: "long", month: "long" })}
        description={
          openToday > 0
            ? `${openToday} online order${openToday === 1 ? "" : "s"} still to hand out today.`
            : "No online orders waiting right now."
        }
        actions={
          <Button asChild>
            <Link href="/admin/orders">
              <ClipboardListIcon /> Open order queue
            </Link>
          </Button>
        }
      />

      {/* Today's orders by status */}
      <section aria-labelledby="today-heading" className="mb-8">
        <h2 id="today-heading" className="sr-only">
          Today&apos;s orders
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {queue.map((status) => (
            <Link
              key={status}
              href={`/admin/orders?status=${status}`}
              className="group rounded-2xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="text-sm text-muted-foreground">{ORDER_STATUS[status].label}</span>
              <span className="mt-1 block font-heading text-4xl font-bold tabular-nums">
                {s.orders_today[status] ?? 0}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {s.orders_upcoming > 0 && <>{s.orders_upcoming} more placed for upcoming days. </>}
          {(s.orders_today.canceled ?? 0) > 0 && <>{s.orders_today.canceled} canceled today.</>}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* This week's money */}
        <section className="rounded-2xl border bg-card p-6 shadow-soft lg:col-span-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-lg font-semibold">This week</h2>
            <span className="text-sm text-muted-foreground">since {formatDay(s.week_start)}</span>
          </div>
          <WeekBars
            revenue={s.week_revenue_cents}
            spending={s.week_spending_cents}
            lastRevenue={s.last_week_revenue_cents}
            lastSpending={s.last_week_spending_cents}
          />
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FileUpIcon className="size-4" />
              {s.last_import_at
                ? `Sales imported through ${formatDay(s.last_sale_date!)} (uploaded ${formatDay(storeToday(new Date(s.last_import_at)))}, ${formatTime(s.last_import_at)})`
                : "No sales imported yet"}
            </span>
            {s.unmatched_sales_lines > 0 && (
              <Link href="/admin/imports" className="font-medium text-warning underline-offset-4 hover:underline">
                {s.unmatched_sales_lines} sale lines need a product match
              </Link>
            )}
          </div>
        </section>

        {/* Low stock */}
        <section className="rounded-2xl border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-lg font-semibold">Running low</h2>
            <Link href="/admin/inventory" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Inventory
            </Link>
          </div>

          {s.low_stock.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Everything is above its reorder point.</p>
          ) : (
            <ul className="mt-4 divide-y">
              {s.low_stock.slice(0, 6).map((p) => {
                const available = p.stock - p.reserved;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span aria-hidden className="text-xl">
                      {p.emoji ?? "📦"}
                    </span>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <Pill tone={available <= 0 ? "danger" : "warning"}>
                      {available <= 0 ? "Out" : `${available} left`}
                    </Pill>
                  </li>
                );
              })}
            </ul>
          )}
          {s.low_stock.length > 6 && (
            <p className="mt-2 text-sm text-muted-foreground">and {s.low_stock.length - 6} more</p>
          )}
          {s.expiring_soon > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangleIcon className="size-4 shrink-0" />
              {s.expiring_soon} perishable batch{s.expiring_soon === 1 ? "" : "es"} expire in the next 3 days.
            </p>
          )}
        </section>
      </div>

      {/* Quick links */}
      <nav aria-label="Quick links" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/admin/imports" icon={FileUpIcon} title="Import sales" text="Upload the InTouchPay export" />
        <QuickLink href="/admin/expenses" icon={ReceiptIcon} title="Log shopping trip" text="Adds stock and spending" />
        <QuickLink href="/admin/inventory" icon={ShoppingCartIcon} title="Shopping list" text="What to buy next trip" />
        <QuickLink href="/admin/products" icon={BoxesIcon} title="Products" text="Prices, photos, menu" />
      </nav>
    </>
  );
}

function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: typeof FileUpIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{text}</span>
      </span>
      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Revenue and spending as two bars, with last week as a faint marker. */
function WeekBars({
  revenue,
  spending,
  lastRevenue,
  lastSpending,
}: {
  revenue: number;
  spending: number;
  lastRevenue: number;
  lastSpending: number;
}) {
  const max = Math.max(revenue, spending, lastRevenue, lastSpending, 1);
  const rows = [
    { label: "Sales", value: revenue, last: lastRevenue, bar: "bg-primary" },
    { label: "Spending", value: spending, last: lastSpending, bar: "bg-chart-2" },
  ];
  const profit = revenue - spending;

  return (
    <div className="mt-5">
      <dl className="grid gap-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-heading text-xl font-semibold tabular-nums">{formatCents(r.value)}</dd>
            </div>
            <div className="relative h-3 rounded-full bg-muted">
              <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${(r.value / max) * 100}%` }} />
              {/* last week's amount */}
              <div
                className="absolute -top-1 h-5 w-0.5 rounded-full bg-foreground/40"
                style={{ left: `calc(${(r.last / max) * 100}% - 1px)` }}
                title={`Last week: ${formatCents(r.last)}`}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Last week: {formatCents(r.last)}</p>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm">
        <span className="text-muted-foreground">Sales minus spending: </span>
        <span className={`font-semibold tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>
          {formatCents(profit)}
        </span>
      </p>
    </div>
  );
}
