import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BoxesIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  DollarSignIcon,
  FileUpIcon,
  GraduationCapIcon,
  type LucideIcon,
  MessageSquarePlusIcon,
  PiggyBankIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { staffNav } from "@/components/staff/nav-items";
import { Button } from "@/components/ui/button";
import { features } from "@/config/features";
import { requireAdmin } from "@/lib/auth";
import { EOP_PREFIX } from "@/lib/end-of-period";
import { addDays, formatCents, formatDay, storeToday } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import type { Insights } from "./insights/types";
import { WeekChart } from "./week-chart";
import { TeamToday, loadTeamToday } from "./staff/team-today";

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

type Todo = { icon: LucideIcon; text: string; href: string; action: string; tone: "urgent" | "normal" };

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const today = storeToday();
  const from = addDays(today, -20);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

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

  // The last 10 school days (weekends left out).
  const series = ((trend.data as unknown as Insights | null)?.series ?? [])
    .filter((d) => {
      const day = new Date(`${d.start}T12:00:00Z`).getUTCDay();
      return day !== 0 && day !== 6;
    })
    .slice(-10)
    .map((d) => ({ date: d.start, sales: d.revenue_cents, spending: d.spending_cents }));

  const profit = s.week_revenue_cents - s.week_spending_cents;
  const lastProfit = s.last_week_revenue_cents - s.last_week_spending_cents;
  const outOfStock = s.low_stock.filter((p) => p.stock - p.reserved <= 0).length;
  const pendingTeachers = teachers.error ? 0 : (teachers.count ?? 0);
  const newRequests = requests.error ? 0 : (requests.count ?? 0);
  const pendingJobs = jobs.error ? 0 : (jobs.count ?? 0);
  const daysSinceImport = s.last_sale_date ? daysBetween(s.last_sale_date, today) : null;

  // ---- The to-do list: only things that actually need doing ----
  const todos: Todo[] = [];
  if (outOfStock > 0)
    todos.push({ icon: AlertTriangleIcon, text: `${outOfStock} item${plural(outOfStock)} sold out`, href: "/admin/inventory/shopping-list", action: "Shopping list", tone: "urgent" });
  if (s.low_stock.length - outOfStock > 0)
    todos.push({ icon: BoxesIcon, text: `${s.low_stock.length - outOfStock} item${plural(s.low_stock.length - outOfStock)} running low`, href: "/admin/inventory/shopping-list", action: "Shopping list", tone: "normal" });
  if (s.expiring_soon > 0)
    todos.push({ icon: AlertTriangleIcon, text: `${s.expiring_soon} batch${s.expiring_soon === 1 ? "" : "es"} expire in 3 days`, href: "/admin/inventory", action: "Inventory", tone: "urgent" });
  if (daysSinceImport === null || daysSinceImport > 3)
    todos.push({
      icon: FileUpIcon,
      text: daysSinceImport === null ? "No sales imported yet" : `Sales last imported ${daysSinceImport} days ago`,
      href: "/admin/imports",
      action: "Import",
      tone: "normal",
    });
  const needMatch = unmatchedLines.error ? 0 : (unmatchedLines.count ?? 0);
  if (needMatch > 0)
    todos.push({ icon: FileUpIcon, text: `${needMatch} sale line${plural(needMatch)} need a product match`, href: "/admin/imports", action: "Match", tone: "normal" });
  if (pendingTeachers > 0)
    todos.push({ icon: GraduationCapIcon, text: `${pendingTeachers} teacher${plural(pendingTeachers)} waiting for approval`, href: "/admin/teachers", action: "Review", tone: "normal" });
  if (pendingJobs > 0)
    todos.push({ icon: BriefcaseIcon, text: `${pendingJobs} job application${plural(pendingJobs)} to answer`, href: "/admin/jobs", action: "Review", tone: "normal" });
  if (team.pending > 0)
    todos.push({ icon: UsersIcon, text: `${team.pending} new employee${plural(team.pending)} waiting for approval`, href: "/admin/staff/people", action: "Review", tone: "normal" });
  if (newRequests > 0)
    todos.push({ icon: MessageSquarePlusIcon, text: `${newRequests} item request${plural(newRequests)} this week`, href: "/admin/requests", action: "See", tone: "normal" });

  const openOrders = (s.orders_today.received ?? 0) + (s.orders_today.preparing ?? 0) + (s.orders_today.ready ?? 0);
  if (features.orders && openOrders > 0)
    todos.unshift({ icon: ClipboardListIcon, text: `${openOrders} online order${plural(openOrders)} to hand out`, href: "/admin/orders", action: "Open", tone: "urgent" });

  return (
    <>
      {/* ---- Greeting and the two things you do most ---- */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ember-ink">{formatDay(s.today, { weekday: "long", month: "long" })}</p>
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

      {/* ---- This week in four numbers ---- */}
      <section aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={DollarSignIcon} label="Sales this week" value={formatCents(s.week_revenue_cents)} now={s.week_revenue_cents} last={s.last_week_revenue_cents} href="/admin/insights" />
        <StatCard icon={WalletIcon} label="Spent this week" value={formatCents(s.week_spending_cents)} now={s.week_spending_cents} last={s.last_week_spending_cents} upIsBad href="/admin/expenses" />
        <StatCard
          icon={PiggyBankIcon}
          label="Profit this week"
          value={formatCents(profit)}
          now={profit}
          last={lastProfit}
          valueClass={profit < 0 ? "text-destructive" : "text-success"}
          href="/admin/insights"
        />
        <StatCard
          icon={BoxesIcon}
          label="Need restocking"
          value={String(s.low_stock.length)}
          note={outOfStock > 0 ? `${outOfStock} sold out` : s.low_stock.length === 0 ? "Shelves are full" : "None sold out"}
          noteClass={outOfStock > 0 ? "text-destructive" : undefined}
          href="/admin/inventory/shopping-list"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* ---- Sales chart ---- */}
        <section aria-labelledby="chart-title" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="chart-title" className="font-heading text-lg font-bold">
                Last two weeks
              </h2>
              <p className="text-sm text-muted-foreground">
                {s.last_sale_date ? `Sales imported through ${formatDay(s.last_sale_date)}` : "School days only"}
              </p>
            </div>
            <CardLink href="/admin/insights">All insights</CardLink>
          </div>
          <WeekChart days={series} />
        </section>

        {/* ---- To do ---- */}
        <section aria-labelledby="todo-title" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <h2 id="todo-title" className="mb-3 font-heading text-lg font-bold">
            To do
          </h2>
          {todos.length === 0 ? (
            <div className="grid place-items-center gap-2 py-10 text-center">
              <CheckCircle2Icon className="size-10 text-success" />
              <p className="font-semibold">All caught up</p>
              <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {todos.map((t) => (
                <li key={t.text}>
                  <Link
                    href={t.href}
                    className="group flex items-center gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                        t.tone === "urgent" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-ember-ink"
                      }`}
                    >
                      <t.icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{t.text}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-ember-ink">
                      {t.action} <ArrowRightIcon className="size-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Running low ---- */}
      {s.low_stock.length > 0 && (
        <section aria-labelledby="low-title" className="mt-6 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="low-title" className="font-heading text-lg font-bold">
              Running low
            </h2>
            <CardLink href="/admin/inventory/shopping-list">Shopping list</CardLink>
          </div>
          <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {s.low_stock.slice(0, 9).map((p) => {
              const available = p.stock - p.reserved;
              const pct = Math.max(0, Math.min(100, (available / Math.max(1, p.reorder_point)) * 100));
              return (
                <li key={p.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-lg">
                    {p.emoji ?? "📦"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className={`block h-full rounded-full ${available <= 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${available <= 0 ? "text-destructive" : ""}`}>
                    {available <= 0 ? "Out" : `${available} left`}
                  </span>
                </li>
              );
            })}
          </ul>
          {s.low_stock.length > 9 && <p className="mt-3 text-sm text-muted-foreground">and {s.low_stock.length - 9} more on the shopping list</p>}
        </section>
      )}

      {/* ---- Who's working today ---- */}
      {team.ready && <TeamToday team={team} />}

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

/** One number for this week, with how it compares to last week. */
function StatCard({
  icon: Icon,
  label,
  value,
  now,
  last,
  upIsBad = false,
  note,
  noteClass,
  valueClass,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  now?: number;
  last?: number;
  /** For spending: going up is shown in red, not green. */
  upIsBad?: boolean;
  note?: string;
  noteClass?: string;
  valueClass?: string;
  href: string;
}) {
  let compare: React.ReactNode = note ? <span className={noteClass ?? "text-muted-foreground"}>{note}</span> : null;
  if (now !== undefined && last !== undefined) {
    const diff = now - last;
    const up = diff >= 0;
    const good = upIsBad ? !up : up;
    const Arrow = up ? ArrowUpRightIcon : ArrowDownRightIcon;
    compare =
      last === 0 && now === 0 ? (
        <span className="text-muted-foreground">Nothing yet</span>
      ) : (
        <span className={`inline-flex items-center gap-0.5 ${diff === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
          <Arrow className="size-3.5" />
          {formatCents(Math.abs(diff))} vs last week
        </span>
      );
  }

  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-card p-4 shadow-soft hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-ember-ink">
          <Icon className="size-4" />
        </span>
      </div>
      <p className={`mt-2 font-heading text-2xl font-extrabold tabular-nums sm:text-3xl ${valueClass ?? ""}`}>{value}</p>
      <p className="mt-1 text-xs font-medium">{compare}</p>
    </Link>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
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
