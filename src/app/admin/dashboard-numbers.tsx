"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, BoxesIcon, DollarSignIcon, type LucideIcon, PiggyBankIcon, WalletIcon } from "lucide-react";
import { addDays, formatCents, formatDay } from "@/lib/format";

/*
 * The top of the dashboard: sales, spending and profit for today, this week or
 * this month (tap to switch), and (SalesChart) a chart you can hover or tap
 * for exact numbers. Everything is worked out from the daily totals the page already
 * loaded, so switching is instant.
 */

/** One day (or month): sales and spending in cents, and minutes employees worked (from the time clock). */
export type Day = { date: string; sales: number; spending: number; staff?: number };

/** This year so far, by month, plus last year up to the same date. */
export type YearTotals = {
  sales: number;
  spending: number;
  lastSales: number;
  lastSpending: number;
  /** Minutes employees worked this year so far / last year to the same date. */
  staffMinutes: number;
  lastStaffMinutes: number;
  months: Day[]; // date = first of the month
};

const PERIODS = {
  today: { label: "Today", vs: "vs same day last week" },
  week: { label: "This week", vs: "vs this point last week" },
  month: { label: "This month", vs: "vs this point last month" },
  year: { label: "This year", vs: "vs this point last year" },
} as const;
type Period = keyof typeof PERIODS;

const RANGES = [
  { days: 10, label: "2 weeks" },
  { days: 20, label: "4 weeks" },
  { days: 40, label: "8 weeks" },
  { days: 0, label: "This year" }, // by month
] as const;

export function DashboardNumbers({
  days,
  year,
  today,
  lowStock,
  outOfStock,
  lastSaleDate,
}: {
  /** Daily totals, oldest first, ending today. */
  days: Day[];
  year: YearTotals;
  today: string;
  lowStock: number;
  outOfStock: number;
  lastSaleDate: string | null;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const byDate = new Map(days.map((d) => [d.date, d]));

  const sum = (from: string, to: string) => {
    let sales = 0;
    let spending = 0;
    let staff = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const day = byDate.get(d);
      sales += day?.sales ?? 0;
      spending += day?.spending ?? 0;
      staff += day?.staff ?? 0;
    }
    return { sales, spending, profit: sales - spending, staff };
  };

  const [from, to, prevFrom, prevTo] = period === "year" ? ([`${today.slice(0, 4)}-01-01`, today, "", ""] as const) : periodDates(period, today);
  const now =
    period === "year" ? { sales: year.sales, spending: year.spending, profit: year.sales - year.spending, staff: year.staffMinutes } : sum(from, to);
  const before =
    period === "year"
      ? { sales: year.lastSales, spending: year.lastSpending, profit: year.lastSales - year.lastSpending, staff: year.lastStaffMinutes }
      : sum(prevFrom, prevTo);
  const vs = PERIODS[period].vs;

  return (
    <>
      <section aria-labelledby="numbers-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="numbers-title" className="sr-only">
            Sales, spending and profit
          </h2>
          <Segmented
            label="Show numbers for"
            options={Object.entries(PERIODS).map(([k, v]) => ({ value: k as Period, label: v.label }))}
            value={period}
            onChange={setPeriod}
          />
          <p className="text-xs text-muted-foreground">
            {from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`}
            {lastSaleDate && lastSaleDate < to && ` · sales imported through ${formatDay(lastSaleDate)}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard icon={DollarSignIcon} label="Sales" value={now.sales} last={before.sales} vs={vs} href="/admin/insights" />
          <StatCard icon={WalletIcon} label="Spent" value={now.spending} last={before.spending} vs={vs} upIsBad href="/admin/expenses" />
          <StatCard icon={PiggyBankIcon} label="Profit" value={now.profit} last={before.profit} vs={vs} tone href="/admin/insights" />
          <Link
            href="/admin/inventory/shopping-list"
            className="group rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:p-5"
          >
            <CardTop icon={BoxesIcon} label="Need restocking" />
            <p className="mt-2 font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">{lowStock}</p>
            <p className={`mt-1 text-xs font-medium ${outOfStock > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {outOfStock > 0 ? `${outOfStock} sold out` : lowStock === 0 ? "Shelves are full" : "None sold out"}
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}

/** [from, to, previousFrom, previousTo] for a period, "so far" up to today. */
function periodDates(period: Exclude<Period, "year">, today: string): [string, string, string, string] {
  if (period === "today") return [today, today, addDays(today, -7), addDays(today, -7)];
  if (period === "week") {
    const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const monday = addDays(today, -dow);
    return [monday, today, addDays(monday, -7), addDays(today, -7)];
  }
  const first = `${today.slice(0, 8)}01`;
  const prevFirst = `${addDays(first, -1).slice(0, 8)}01`;
  const prevLast = addDays(first, -1);
  const sameDay = `${prevFirst.slice(0, 8)}${today.slice(8)}`;
  return [first, today, prevFirst, sameDay <= prevLast ? sameDay : prevLast];
}

function CardTop({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-ember-ink">
        <Icon className="size-4" />
      </span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  last,
  vs,
  upIsBad = false,
  tone = false,
  format = formatCents,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  last: number;
  vs: string;
  /** For spending: going up is shown in red, not green. */
  upIsBad?: boolean;
  /** Profit: the number itself is green, or red below $0. */
  tone?: boolean;
  /** How to show the number (money unless told otherwise). */
  format?: (n: number) => string;
  href: string;
}) {
  const diff = value - last;
  const up = diff >= 0;
  const good = upIsBad ? !up : up;
  const Arrow = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:p-5"
    >
      <CardTop icon={icon} label={label} />
      <p className={`mt-2 font-heading text-2xl font-extrabold tabular-nums sm:text-3xl ${tone ? (value < 0 ? "text-destructive" : "text-success") : ""}`}>
        {format(value)}
      </p>
      <p className="mt-1 text-xs font-medium">
        {value === 0 && last === 0 ? (
          <span className="text-muted-foreground">Nothing yet</span>
        ) : (
          <span className={`inline-flex items-center gap-0.5 ${diff === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
            <Arrow className="size-3.5" />
            {format(Math.abs(diff))} {vs}
          </span>
        )}
      </p>
    </Link>
  );
}

/** A row of pill buttons where one is picked. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border bg-card p-1 shadow-soft">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
            value === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ chart */

/**
 * School-day sales (orange) and spending (teal). Hover, tap, or use the arrow
 * keys to read any day; the legend buttons hide or show each kind of bar.
 */
export function SalesChart({ days: all, months, today }: { days: Day[]; months: Day[]; today: string }) {
  const [range, setRange] = useState<number>(10);
  const byMonth = range === 0;
  const [showSales, setShowSales] = useState(true);
  const [showSpending, setShowSpending] = useState(true);
  const schoolDays = all.filter((d) => {
    const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    return dow !== 0 && dow !== 6;
  });
  const days = byMonth ? months : schoolDays.slice(-range);
  const [picked, setPicked] = useState<string | null>(null);
  const active = days.find((d) => d.date === picked) ?? days[days.length - 1];
  const hasData = days.some((d) => d.sales > 0 || d.spending > 0);

  const totals = days.reduce((t, d) => ({ sales: t.sales + d.sales, spending: t.spending + d.spending }), { sales: 0, spending: 0 });

  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 30, left: 52 };
  const shown = days.flatMap((d) => [showSales ? d.sales : 0, showSpending ? d.spending : 0]);
  const max = niceMax(Math.max(1, ...shown));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, days.length);
  const both = showSales && showSpending;
  const barW = Math.min(18, slot * (both ? 0.32 : 0.55));
  const y = (v: number) => pad.top + (1 - v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelEvery = byMonth ? 1 : days.length > 20 ? 5 : days.length > 10 ? 2 : 1;

  const move = (step: number) => {
    const i = days.findIndex((d) => d.date === active?.date);
    const next = days[Math.min(days.length - 1, Math.max(0, i + step))];
    if (next) setPicked(next.date);
  };

  return (
    <section aria-labelledby="chart-title" className="min-w-0 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="chart-title" className="font-heading text-lg font-bold">
            {byMonth ? `Sales by month, ${today.slice(0, 4)}` : "Sales by school day"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {byMonth ? "This year" : `Last ${RANGES.find((r) => r.days === range)?.label}`}: sold {formatCents(totals.sales)}, spent {formatCents(totals.spending)}
          </p>
        </div>
        <Segmented label="How far back" options={RANGES.map((r) => ({ value: String(r.days), label: r.label }))} value={String(range)} onChange={(v) => setRange(Number(v))} />
      </div>

      {!hasData ? (
        <div className="grid h-52 place-items-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
          <p>
            No sales yet for these days.
            <br />
            <Link href="/admin/imports" className="font-semibold text-ember-ink underline-offset-4 hover:underline">
              Import your InTouchPay sales
            </Link>{" "}
            to fill this in.
          </p>
        </div>
      ) : (
        <>
          {/* The day you're pointing at */}
          {active && (
            <div aria-live="polite" className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-xl bg-muted/60 px-4 py-2.5 text-sm">
              <span className="font-semibold">
                {byMonth ? monthName(active.date, "long") : formatDay(active.date, { weekday: "long" })}
                {!byMonth && active.date === today && " (today)"}
                {byMonth && active.date.slice(0, 7) === today.slice(0, 7) && " (so far)"}
              </span>
              <span>
                Sold <strong className="tabular-nums">{formatCents(active.sales)}</strong>
              </span>
              <span>
                Spent <strong className="tabular-nums">{formatCents(active.spending)}</strong>
              </span>
              <span>
                Profit{" "}
                <strong className={`tabular-nums ${active.sales - active.spending < 0 ? "text-destructive" : "text-success"}`}>
                  {formatCents(active.sales - active.spending)}
                </strong>
              </span>
                </span>
              )}
            </div>
          )}

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-pan-y rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            role="img"
            aria-label={`Sales and spending by ${byMonth ? "month" : "school day"}. Use the left and right arrow keys to read each one.`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              }
            }}
            onMouseLeave={() => setPicked(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "3 4"} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
                  {formatCents(t).replace(/\.00$/, "")}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const cx = pad.left + slot * i + slot / 2;
              const isActive = d.date === active?.date;
              const dim = active && !isActive ? 0.55 : 1;
              const salesX = both ? cx - barW - 1.5 : cx - barW / 2;
              const spendX = both ? cx + 1.5 : cx - barW / 2;
              return (
                <g key={d.date} onMouseEnter={() => setPicked(d.date)} onClick={() => setPicked(d.date)} className="cursor-pointer">
                  <rect x={cx - slot / 2} y={pad.top} width={slot} height={innerH} fill={isActive ? "var(--muted)" : "transparent"} rx="6" />
                  {showSales && (
                    <rect x={salesX} y={y(d.sales)} width={barW} height={Math.max(0, y(0) - y(d.sales))} rx="4" fill="var(--chart-1)" opacity={dim} />
                  )}
                  {showSpending && (
                    <rect x={spendX} y={y(d.spending)} width={barW} height={Math.max(0, y(0) - y(d.spending))} rx="4" fill="var(--chart-2)" opacity={dim} />
                  )}
                  {(i % labelEvery === 0 || isActive) && (
                    <text
                      x={cx}
                      y={H - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={isActive ? 700 : 400}
                      fill={isActive ? "var(--foreground)" : "var(--muted-foreground)"}
                    >
                      {byMonth
                        ? monthName(d.date, "short")
                        : labelEvery > 1
                          ? Number(d.date.slice(8))
                          : `${formatDay(d.date, { weekday: "short" }).slice(0, 3)} ${Number(d.date.slice(8))}`}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <LegendToggle color="var(--chart-1)" label="Sales" on={showSales} onChange={() => (showSales && !showSpending ? null : setShowSales(!showSales))} />
            <LegendToggle color="var(--chart-2)" label="Spending" on={showSpending} onChange={() => (showSpending && !showSales ? null : setShowSpending(!showSpending))} />
            <Link href="/admin/insights" className="ml-auto inline-flex items-center gap-1 font-semibold text-ember-ink underline-offset-4 hover:underline">
              All insights <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>

          <table className="sr-only">
            <caption>Sales and spending by {byMonth ? "month" : "day"}</caption>
            <thead>
              <tr>
                <th>Day</th>
                <th>Sales</th>
                <th>Spending</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{byMonth ? monthName(d.date, "long") : formatDay(d.date)}</td>
                  <td>{formatCents(d.sales)}</td>
                  <td>{formatCents(d.spending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function LegendToggle({ color, label, on, onChange }: { color: string; label: string; on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onChange}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-semibold transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
        on ? "bg-card" : "bg-transparent text-muted-foreground line-through opacity-70"
      }`}
    >
      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: color }} /> {label}
    </button>
  );
}

/** "2026-03-01" → "Mar" or "March" */
function monthName(isoDate: string, width: "short" | "long") {
  return new Date(`${isoDate.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", { month: width, timeZone: "UTC" });
}

/** Rounds the top of the chart up to a tidy dollar amount. */
function niceMax(cents: number) {
  const dollars = cents / 100;
  const step = dollars <= 20 ? 5 : dollars <= 100 ? 20 : dollars <= 500 ? 100 : 250;
  return Math.ceil(dollars / step) * step * 100;
}
