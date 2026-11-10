import Link from "next/link";
import { FileUpIcon, ReceiptIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { features } from "@/config/features";
import { requireAdmin } from "@/lib/auth";
import { EOP_PREFIX } from "@/lib/end-of-period";
import { addDays, storeToday } from "@/lib/format";
import { minutesBetween } from "@/lib/staff";
import type { OrderStatus } from "@/lib/order-status";
import { AutoRefresh } from "./auto-refresh";
import { type Day, DashboardNumbers, SalesChart, type YearTotals } from "./dashboard-numbers";
import type { Insights } from "./insights/types";
import { LockTablet } from "./lock-tablet";
import { LowStock } from "./low-stock";
import { TeamToday, loadTeamToday } from "./staff/team-today";
import { type Todo, TodoList } from "./todo-list";

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
  // 10 weeks of days: enough for the 8-week chart and "this month vs last month".
  const from = addDays(today, -70);
  const loadedAt = new Date();
  const weekAgo = new Date(loadedAt.getTime() - 7 * 86400000).toISOString();

  // This year so far by month, and last year up to the same date (for "This year").
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const lastYearStart = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const lastYearSameDay = `${Number(today.slice(0, 4)) - 1}${today.slice(4) === "-02-29" ? "-02-28" : today.slice(4)}`;

  const [summary, trend, teachers, requests, jobs, unmatchedLines, team, thisYear, lastYear, shifts, kiosk, receipts] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("insights", { p_from: from, p_to: today, p_bucket: "day" }),
    supabase.from("teachers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("item_requests").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("game_job_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Sale lines with no product, not counting End of Period day totals (those never get one).
    supabase.from("sales_lines").select("id", { count: "exact", head: true }).is("product_id", null).not("raw_item_name", "like", `${EOP_PREFIX}%`),
    loadTeamToday(supabase, today),
    supabase.rpc("insights", { p_from: yearStart, p_to: today, p_bucket: "month" }),
    supabase.rpc("insights", { p_from: lastYearStart, p_to: lastYearSameDay, p_bucket: "month" }),
    // Every timecard since Jan 1 last year, for the hours-worked numbers (empty until the time clock is set up).
    supabase
      .from("staff_shifts")
      .select("clock_in, clock_out")
      .gte("clock_in", new Date(`${lastYearStart}T00:00:00-07:00`).toISOString())
      .limit(20000),
    // Whether a manager code for the store tablet is set (errors until database update 18).
    supabase.from("settings").select("kiosk_pin_hash").eq("id", 1).maybeSingle(),
    // Receipt photos snapped at the store that aren't a shopping trip yet (errors until database update 19).
    supabase.from("receipt_inbox").select("id", { count: "exact", head: true }).is("expense_id", null).eq("dismissed", false),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  const s = summary.data as unknown as Summary;

  // Minutes worked per Arizona day, from the time clock (a shift still going counts up to now).
  const staffByDay = new Map<string, number>();
  for (const sh of shifts.data ?? []) {
    const day = storeToday(new Date(sh.clock_in));
    staffByDay.set(day, (staffByDay.get(day) ?? 0) + minutesBetween(sh.clock_in, sh.clock_out, loadedAt.getTime()));
  }
  const staffBetween = (a: string, b: string) => [...staffByDay].reduce((t, [d, m]) => (d >= a && d <= b ? t + m : t), 0);

  // Every day from `from` to today (days with no sales count as $0).
  const byDay = new Map(((trend.data as unknown as Insights | null)?.series ?? []).map((d) => [d.start.slice(0, 10), d]));
  const days: Day[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const t = byDay.get(d);
    days.push({ date: d, sales: t?.revenue_cents ?? 0, spending: t?.spending_cents ?? 0, staff: staffByDay.get(d) ?? 0 });
  }

  const ty = thisYear.data as unknown as Insights | null;
  const ly = lastYear.data as unknown as Insights | null;
  const year: YearTotals = {
    sales: ty?.totals.revenue_cents ?? 0,
    spending: ty?.totals.spending_cents ?? 0,
    lastSales: ly?.totals.revenue_cents ?? 0,
    lastSpending: ly?.totals.spending_cents ?? 0,
    staffMinutes: staffBetween(yearStart, today),
    lastStaffMinutes: staffBetween(lastYearStart, lastYearSameDay),
    months: (ty?.series ?? []).map((m) => {
      const month = m.start.slice(0, 7);
      return { date: m.start.slice(0, 10), sales: m.revenue_cents, spending: m.spending_cents, staff: staffBetween(`${month}-01`, `${month}-31`) };
    }),
  };

  const outOfStock = s.low_stock.filter((p) => p.stock - p.reserved <= 0).length;
  const pendingTeachers = teachers.error ? 0 : (teachers.count ?? 0);
  const newRequests = requests.error ? 0 : (requests.count ?? 0);
  const pendingJobs = jobs.error ? 0 : (jobs.count ?? 0);
  const daysSinceImport = s.last_sale_date ? daysBetween(s.last_sale_date, today) : null;

  // ---- The to-do list: only things that actually need doing ----
  const todos: Todo[] = [];
  if (outOfStock > 0)
    todos.push({ id: "sold-out", icon: "alert", text: `${outOfStock} item${plural(outOfStock)} sold out`, href: "/admin/inventory/shopping-list", action: "Shopping list", tone: "urgent" });
  if (s.low_stock.length - outOfStock > 0)
    todos.push({ id: "low-stock", icon: "boxes", text: `${s.low_stock.length - outOfStock} item${plural(s.low_stock.length - outOfStock)} running low`, href: "/admin/inventory/shopping-list", action: "Shopping list", tone: "normal" });
  if (s.expiring_soon > 0)
    todos.push({ id: "expiring", icon: "alert", text: `${s.expiring_soon} batch${s.expiring_soon === 1 ? "" : "es"} expire in 3 days`, href: "/admin/inventory", action: "Inventory", tone: "urgent" });
  if (daysSinceImport === null || daysSinceImport > 3)
    todos.push({
      id: "import",
      icon: "import",
      text: daysSinceImport === null ? "No sales imported yet" : `Sales last imported ${daysSinceImport} days ago`,
      href: "/admin/imports",
      action: "Import",
      tone: "normal",
    });
  const needMatch = unmatchedLines.error ? 0 : (unmatchedLines.count ?? 0);
  if (needMatch > 0)
    todos.push({ id: "match", icon: "import", text: `${needMatch} sale line${plural(needMatch)} need a product match`, href: "/admin/imports", action: "Match", tone: "normal" });
  if (pendingTeachers > 0)
    todos.push({ id: "teachers", icon: "teacher", text: `${pendingTeachers} teacher${plural(pendingTeachers)} waiting for approval`, href: "/admin/teachers", action: "Review", tone: "normal" });
  if (pendingJobs > 0)
    todos.push({ id: "jobs", icon: "briefcase", text: `${pendingJobs} job application${plural(pendingJobs)} to answer`, href: "/admin/jobs", action: "Review", tone: "normal" });
  if (team.pending > 0)
    todos.push({ id: "employees", icon: "people", text: `${team.pending} new employee${plural(team.pending)} waiting for approval`, href: "/admin/staff/people", action: "Review", tone: "normal" });
  const receiptsToEnter = receipts.error ? 0 : (receipts.count ?? 0);
  if (receiptsToEnter > 0)
    todos.push({ id: "receipts", icon: "receipt", text: `${receiptsToEnter} receipt photo${plural(receiptsToEnter)} to enter`, href: "/admin/expenses#receipts", action: "Enter", tone: "normal" });
  if (newRequests > 0)
    todos.push({ id: "requests", icon: "request", text: `${newRequests} item request${plural(newRequests)} this week`, href: "/admin/requests", action: "See", tone: "normal" });

  const openOrders = (s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0);
  if (features.orders && openOrders > 0)
    todos.unshift({ id: "orders", icon: "orders", text: `${openOrders} online order${plural(openOrders)} to hand out`, href: "/admin/orders", action: "Open", tone: "urgent" });

  return (
    <>
      {/* ---- Greeting and the two things you do most ---- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-heading text-[1.75rem] leading-tight font-bold sm:text-[2rem]">{greeting()}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.9375rem] text-muted-foreground">
            {todos.length === 0 ? "Nothing needs you right now." : `${todos.length} thing${plural(todos.length)} need${todos.length === 1 ? "s" : ""} a look today.`}
            <AutoRefresh loadedAt={loadedAt.toISOString()} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LockTablet ready={!kiosk.error} hasPin={Boolean(kiosk.data?.kiosk_pin_hash)} />
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/admin/imports">
              <FileUpIcon /> Import sales
            </Link>
          </Button>
          <Button asChild className="h-10 px-4">
            <Link href="/admin/expenses/new">
              <ReceiptIcon /> Log a shopping trip
            </Link>
          </Button>
        </div>
      </div>

      <DashboardNumbers days={days} year={year} today={today} lowStock={s.low_stock.length} outOfStock={outOfStock} lastSaleDate={s.last_sale_date} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <SalesChart days={days} months={year.months} today={today} />
        <TodoList todos={todos} today={today} />
      </div>

      {/* ---- Who's working today ---- */}
      {team.ready && <TeamToday team={team} />}

      {/* ---- Running low ---- */}
      {s.low_stock.length > 0 && (
        <div className="mt-4">
          <LowStock items={s.low_stock} />
        </div>
      )}

    </>
  );
}

function greeting() {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);
}

function plural(n: number) {
  return n === 1 ? "" : "s";
}
