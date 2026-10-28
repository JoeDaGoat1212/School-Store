import Link from "next/link";
import {
  AlertTriangleIcon,
  BoxesIcon,
  ClipboardListIcon,
  FileUpIcon,
  ReceiptIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { brand } from "@/config/brand";
import { addDays, formatCents, formatDay, formatTime, storeToday } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import type { Insights } from "./insights/types";
import { SalesSketch } from "./sales-sketch";

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
  const today = storeToday();
  // The last three weeks, day by day, for the sketch (only school days are drawn).
  const from = addDays(today, -20);
  const [summary, trend, teachers, roomService] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("insights", { p_from: from, p_to: today, p_bucket: "day" }),
    supabase.from("teachers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("pickup_date", today).not("delivery_room", "is", null).in("status", ["received", "preparing", "ready"]),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  const s = summary.data as unknown as Summary;
  const series = ((trend.data as unknown as Insights | null)?.series ?? [])
    .filter((d) => {
      const day = new Date(`${d.start}T12:00:00Z`).getUTCDay();
      return day !== 0 && day !== 6;
    })
    .slice(-10)
    .map((d) => ({ date: d.start, sales: d.revenue_cents, spending: d.spending_cents }));

  const openToday = (s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0);
  const profit = s.week_revenue_cents - s.week_spending_cents;

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
          <Button asChild size="lg">
            <Link href="/admin/orders">
              <ClipboardListIcon /> Open order queue
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] lg:items-start">
        {/* ---- The register tape: today, printed out ---- */}
        <RegisterTape s={s} pendingTeachers={teachers.count ?? 0} roomService={roomService.count ?? 0} />

        <div className="grid min-w-0 gap-8">
          {/* ---- Two weeks of sales, sketched ---- */}
          <section aria-labelledby="sketch-title" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 id="sketch-title" className="font-heading text-2xl">
                The last two weeks
              </h2>
              <Link href="/admin/insights" className="text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
                All the numbers in Insights
              </Link>
            </div>
            <div className="mt-3">
              <SalesSketch days={series} />
            </div>

            {/* This week, added up like on a notepad */}
            <dl className="mt-5 grid gap-x-8 gap-y-3 border-t-2 border-dashed pt-4 sm:grid-cols-3">
              <Sum label="Sales this week" value={s.week_revenue_cents} last={s.last_week_revenue_cents} />
              <Sum label="Spent this week" value={s.week_spending_cents} last={s.last_week_spending_cents} />
              <div>
                <dt className="text-sm text-muted-foreground">Left over</dt>
                <dd className={`font-heading text-3xl tabular-nums ${profit < 0 ? "text-destructive" : "text-success"}`}>{formatCents(profit)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
            </p>
          </section>

          {/* ---- Running low: shelf tags ---- */}
          <section aria-labelledby="low-title">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="low-title" className="font-heading text-2xl">
                Running low
              </h2>
              <Link href="/admin/inventory/shopping-list" className="text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
                Shopping list
              </Link>
            </div>
            {s.low_stock.length === 0 ? (
              <p className="mt-2 font-hand text-2xl text-muted-foreground">Shelves are full. Nice.</p>
            ) : (
              <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
                {s.low_stock.slice(0, 8).map((p) => {
                  const available = p.stock - p.reserved;
                  return (
                    <li key={p.id} className="flex h-12 items-center gap-3 border-b border-[var(--rule,var(--border))]">
                      <span aria-hidden className="text-xl">
                        {p.emoji ?? "📦"}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <ShelfTag out={available <= 0}>{available <= 0 ? "Out" : `${available} left`}</ShelfTag>
                    </li>
                  );
                })}
              </ul>
            )}
            {s.low_stock.length > 8 && <p className="mt-2 text-sm text-muted-foreground">and {s.low_stock.length - 8} more</p>}
            {s.expiring_soon > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangleIcon className="size-4 shrink-0" />
                {s.expiring_soon} perishable batch{s.expiring_soon === 1 ? "" : "es"} expire in the next 3 days.
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Quick links, as price tags hanging off the shelf */}
      <nav aria-label="Quick links" className="mt-12 flex flex-wrap gap-4">
        <QuickLink href="/admin/imports" icon={FileUpIcon} title="Import sales" text="InTouchPay export" />
        <QuickLink href="/admin/expenses/new" icon={ReceiptIcon} title="Log a shopping trip" text="Adds stock and spending" />
        <QuickLink href="/admin/inventory/shopping-list" icon={ShoppingCartIcon} title="Shopping list" text="What to buy next" />
        <QuickLink href="/admin/products" icon={BoxesIcon} title="Products" text="Prices, photos, menu" />
      </nav>
    </>
  );
}

/**
 * Today as a register tape: each line is a count you can tap to open those
 * orders. It "prints" once when the page loads.
 */
function RegisterTape({ s, pendingTeachers, roomService }: { s: Summary; pendingTeachers: number; roomService: number }) {
  const lines: { label: string; value: number; href: string }[] = [
    { label: "New", value: s.orders_today.received ?? 0, href: "/admin/orders?status=received" },
    { label: "Preparing", value: s.orders_today.preparing ?? 0, href: "/admin/orders?status=preparing" },
    { label: "Ready", value: s.orders_today.ready ?? 0, href: "/admin/orders?status=ready" },
    { label: "Picked up", value: s.orders_today.picked_up ?? 0, href: "/admin/orders?status=picked_up" },
  ];
  const total = lines.reduce((n, l) => n + l.value, 0);
  const now = new Date().toLocaleTimeString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" });

  return (
    <section aria-labelledby="tape-title" className="relative mx-auto w-full max-w-sm min-w-0 lg:max-w-none">
      <div className="receipt tape-print bg-card px-6 pt-6 pb-9 font-receipt text-[0.95rem] shadow-soft">
        <div className="text-center">
          <p id="tape-title" className="text-lg font-bold">
            {brand.name}
          </p>
          <p className="text-sm opacity-70">
            Today&apos;s orders · {formatDay(s.today)} · {now}
          </p>
        </div>
        <p aria-hidden className="my-3 overflow-hidden whitespace-nowrap opacity-50">
          {"- ".repeat(40)}
        </p>
        <ul className="grid gap-1">
          {lines.map((l) => (
            <TapeLine key={l.label} {...l} />
          ))}
        </ul>
        <p aria-hidden className="my-3 overflow-hidden whitespace-nowrap opacity-50">
          {"= ".repeat(40)}
        </p>
        <p className="flex items-baseline justify-between text-lg font-bold">
          <span>Orders today</span>
          <span className="tabular-nums">{total}</span>
        </p>
        <ul className="mt-3 grid gap-1 text-sm">
          {roomService > 0 && <TapeLine label="Room service to go" value={roomService} href="/admin/orders" />}
          {s.orders_upcoming > 0 && <TapeLine label="Upcoming days" value={s.orders_upcoming} href="/admin/orders" />}
          {(s.orders_today.canceled ?? 0) > 0 && <TapeLine label="Canceled" value={s.orders_today.canceled ?? 0} href="/admin/orders?status=canceled" />}
          {pendingTeachers > 0 && <TapeLine label="Teachers to approve" value={pendingTeachers} href="/admin/teachers" />}
        </ul>
        <p className="mt-5 text-center text-sm opacity-70">*** Thank you, staff! ***</p>
      </div>

      {/* The rubber stamp */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-24 right-3 rotate-[-14deg] rounded-md border-[3px] border-double border-[var(--stamp,var(--destructive))] px-2 py-1 font-heading text-lg leading-none font-bold tracking-wider text-[var(--stamp,var(--destructive))] uppercase opacity-80 mix-blend-multiply dark:mix-blend-screen"
      >
        {(s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0) > 0 ? "Busy" : "All caught up"}
      </span>
    </section>
  );
}

function TapeLine({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li className="min-w-0">
      <Link href={href} className="flex items-baseline gap-2 rounded-sm px-1 -mx-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span>{label}</span>
        <span aria-hidden className="min-w-0 flex-1 overflow-hidden whitespace-nowrap opacity-40">
          {".".repeat(60)}
        </span>
        <span className="font-bold tabular-nums">{value}</span>
      </Link>
    </li>
  );
}

/** A number with last week's in small handwriting next to it. */
function Sum({ label, value, last }: { label: string; value: number; last: number }) {
  const up = value >= last;
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <span className="block font-heading text-3xl tabular-nums">{formatCents(value)}</span>
        <span className="block font-hand text-lg leading-tight text-muted-foreground">
          {up ? "up" : "down"} from {formatCents(last)} last week
        </span>
      </dd>
    </div>
  );
}

/** A price-gun sticker: orange, or stamp red when it's out. */
function ShelfTag({ out, children }: { out: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-[3px] px-2 py-0.5 font-heading text-sm font-bold tabular-nums shadow-[0_1px_0_rgb(0_0_0/0.2)] ${
        out ? "bg-[var(--stamp,var(--destructive))] text-white" : "bg-[var(--label,var(--brand))] text-[#222631]"
      }`}
    >
      {children}
    </span>
  );
}

function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: typeof FileUpIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group relative flex min-w-52 flex-1 items-center gap-3 bg-card py-3 pr-4 pl-9 shadow-soft transition-transform duration-200 [clip-path:polygon(18px_0,100%_0,100%_100%,18px_100%,0_50%)] hover:-rotate-1 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* the tag's string hole */}
      <span aria-hidden className="absolute top-1/2 left-4 size-2.5 -translate-y-1/2 rounded-full bg-background ring-1 ring-border" />
      <Icon className="size-5 shrink-0 text-ember-ink" />
      <span className="min-w-0">
        <span className="block font-heading text-lg leading-tight">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}
