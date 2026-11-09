import Link from "next/link";
import { FileUpIcon, ReceiptIcon } from "lucide-react";
import { staffNav } from "@/components/staff/nav-items";
import { Button } from "@/components/ui/button";
import { features } from "@/config/features";
import { requireAdmin } from "@/lib/auth";
import { EOP_PREFIX } from "@/lib/end-of-period";
import { addDays, formatDay, storeToday } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { AutoRefresh } from "./auto-refresh";
import { type Day, DashboardNumbers, SalesChart } from "./dashboard-numbers";
import type { Insights } from "./insights/types";
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

  const [summary, trend, teachers, requests, jobs, unmatchedLines, team] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("insights", { p_from: from, p_to: today, p_bucket: "day" }),
    supabase.from("teachers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("item_requests").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("game_job_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Sale lines with no product, not counting End of Period day totals (those never get one).
    supabase.from("sales_lines").select("id", { count: "exact", head: true }).is("product_id", null).not("raw_item_name", "like", `${EOP_PREFIX}%`),
    loadTeamToday(supabase, today),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  const s = summary.data as unknown as Summary;

  // Every day from `from` to today (days with no sales count as $0).
  const byDay = new Map(((trend.data as unknown as Insights | null)?.series ?? []).map((d) => [d.start.slice(0, 10), d]));
  const days: Day[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const t = byDay.get(d);
    days.push({ date: d, sales: t?.revenue_cents ?? 0, spending: t?.spending_cents ?? 0 });
  }

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
  if (newRequests > 0)
    todos.push({ id: "requests", icon: "request", text: `${newRequests} item request${plural(newRequests)} this week`, href: "/admin/requests", action: "See", tone: "normal" });

  const openOrders = (s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0);
  if (features.orders && openOrders > 0)
    todos.unshift({ id: "orders", icon: "orders", text: `${openOrders} online order${plural(openOrders)} to hand out`, href: "/admin/orders", action: "Open", tone: "urgent" });

  return (
    <>
      {/* ---- Greeting and the two things you do most ---- */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-x-3 text-sm font-medium text-ember-ink">
            {formatDay(s.today, { weekday: "long", month: "long" })}
            <AutoRefresh loadedAt={loadedAt.toISOString()} />
          </p>
          <h1 className="mt-1 font-heading text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{greeting()}</h1>
          <p className="mt-1.5 text-muted-foreground">
            {todos.length === 0 ? "Everything's handled. Nice work." : `${todos.length} thing${plural(todos.length)} could use a look today.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/admin/imports">
              <FileUpIcon /> Import sales
            </Link>
          </Button>
          <Button asChild className="h-10 px-4 font-semibold">
            <Link href="/admin/expenses/new">
              <ReceiptIcon /> Log a shopping trip
            </Link>
          </Button>
        </div>
      </div>

      <DashboardNumbers days={days} today={today} lowStock={s.low_stock.length} outOfStock={outOfStock} lastSaleDate={s.last_sale_date} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <SalesChart days={days} today={today} />
        <TodoList todos={todos} today={today} />
      </div>

      {/* ---- Who's working today ---- */}
      {team.ready && <TeamToday team={team} />}

      {/* ---- Running low ---- */}
      {s.low_stock.length > 0 && (
        <div className="mt-6">
          <LowStock items={s.low_stock} />
        </div>
      )}

      {/* ---- Every tool, one tap away ---- */}
      <section aria-labelledby="tools-title" className="mt-10">
        <h2 id="tools-title" className="mb-3 font-heading text-lg font-bold">
          All tools
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {staffNav
            .filter((t) => t.href !== "/admin")
            .map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-ember-ink transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <t.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-sm leading-snug text-muted-foreground">{t.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
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
