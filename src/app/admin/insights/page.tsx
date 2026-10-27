import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, BarChart3Icon, InfoIcon, MinusIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { percentChange, rangeFor, type RangeKind } from "@/lib/date-range";
import { formatCents, formatDay, storeToday } from "@/lib/format";
import { isIsoDate } from "../orders/load-orders";
import { ExportButton } from "./export-button";
import { ProductTable } from "./product-table";
import { RangePicker } from "./range-picker";
import { TrendChart } from "./trend-chart";
import { margin, type Insights, type ProductInsight } from "./types";

export const metadata: Metadata = { title: "Insights" };

const KINDS: RangeKind[] = ["week", "month", "year", "custom"];

export default async function InsightsPage(props: PageProps<"/admin/insights">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();

  // Read the range from the address bar (default: this month).
  const today = storeToday();
  const kind = KINDS.includes(params.range as RangeKind) ? (params.range as RangeKind) : "month";
  const anchor = isIsoDate(params.date) ? params.date : today;
  const range = rangeFor(kind, anchor, {
    from: isIsoDate(params.from) ? params.from : today,
    to: isIsoDate(params.to) ? params.to : today,
  });

  const { data, error } = await supabase.rpc("insights", { p_from: range.from, p_to: range.to, p_bucket: range.bucket });
  if (error) throw new Error(error.hint || error.message);
  const ins = data as unknown as Insights;
  const t = ins.totals;
  const p = ins.previous;

  const sold = ins.products.filter((x) => x.units > 0).sort((a, b) => b.units - a.units);
  const active = ins.products.filter((x) => !x.archived).sort((a, b) => a.units - b.units || a.name.localeCompare(b.name));
  const nothingYet = t.revenue_cents === 0 && t.spending_cents === 0;
  const prevLabel = kind === "week" ? "last week" : kind === "month" ? "last month" : kind === "year" ? "last year" : "the period before";

  return (
    <>
      <PageHeader
        title="Insights"
        description="How the store is doing. Sales come from InTouchPay imports; spending comes from logged shopping trips."
        actions={<ExportButton data={ins} label={range.label} />}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <RangePicker range={range} today={today} />
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <InfoIcon className="size-4" />
          {t.last_sale_date ? (
            <>
              Sales imported through {formatDay(t.last_sale_date)}.{" "}
              <Link href="/admin/imports" className="font-medium text-ember-ink underline-offset-4 hover:underline">
                Import newer sales
              </Link>
            </>
          ) : (
            "No sales imported yet."
          )}
        </p>
      </div>

      {nothingYet ? (
        <EmptyState
          icon={BarChart3Icon}
          title={`No sales or spending in ${range.label}`}
          action={
            <Button asChild>
              <Link href="/admin/imports">Import sales</Link>
            </Button>
          }
        >
          Pick another range, or import the InTouchPay export to see numbers here.
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {/* ---- Headline numbers ---- */}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Sales" value={formatCents(t.revenue_cents)} change={percentChange(t.revenue_cents, p.revenue_cents)} vs={prevLabel} />
            <Kpi label="Spending" value={formatCents(t.spending_cents)} change={percentChange(t.spending_cents, p.spending_cents)} vs={prevLabel} />
            <Kpi
              label="Sales − spending"
              value={formatCents(t.revenue_cents - t.spending_cents)}
              change={percentChange(t.revenue_cents - t.spending_cents, p.revenue_cents - p.spending_cents)}
              vs={prevLabel}
              note="Cash in minus cash out"
            />
            <Kpi
              label="Gross margin"
              value={t.revenue_cents ? `${Math.round((t.gross_profit_cents / t.revenue_cents) * 100)}%` : "—"}
              note={`${formatCents(t.gross_profit_cents)} profit on items sold`}
            />
          </dl>

          <TrendChart data={ins} />

          {/* ---- Breakdowns ---- */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Breakdown
              title="How people paid"
              rows={[
                { label: "Cash", value: ins.payments.cash ?? 0 },
                { label: "Debit / card", value: ins.payments.debit ?? 0 },
                ...(ins.payments.other ? [{ label: "Other", value: ins.payments.other }] : []),
              ]}
              format={formatCents}
            />
            <Breakdown
              title="Online vs. in person"
              note={`Items paid for. ${t.online_orders} online order${t.online_orders === 1 ? "" : "s"} picked up.`}
              rows={[
                { label: "Online orders", value: ins.channels.online_units },
                { label: "At the window", value: Math.max(0, ins.channels.total_units - ins.channels.online_units) },
              ]}
              format={(n) => `${n.toLocaleString()} items`}
            />
            <Breakdown
              title="Spending by store"
              rows={ins.suppliers.map((s) => ({ label: s.name, value: s.cents, sub: `${s.trips} trip${s.trips === 1 ? "" : "s"}` }))}
              format={formatCents}
              empty="No shopping trips in this range."
            />
          </div>

          {/* ---- Best and slowest ---- */}
          <div className="grid gap-6 md:grid-cols-2">
            <SellerList title="Best sellers" products={sold.slice(0, 5)} empty="Nothing sold in this range." />
            <SellerList title="Slowest sellers" products={active.slice(0, 5)} empty="No active products." />
          </div>

          <section aria-labelledby="products-heading">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="products-heading" className="font-heading text-lg font-semibold">
                Every product
              </h2>
              {ins.unmatched_revenue_cents > 0 && (
                <Link href="/admin/imports" className="text-sm text-warning underline-offset-4 hover:underline">
                  {formatCents(ins.unmatched_revenue_cents)} of sales aren&apos;t linked to a product
                </Link>
              )}
            </div>
            <ProductTable products={ins.products} />
            <p className="mt-2 text-xs text-muted-foreground">
              Profit uses each product&apos;s current cost. Margins under 30% are highlighted.
            </p>
          </section>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, change, vs, note }: { label: string; value: string; change?: number | null; vs?: string; note?: string }) {
  const Icon = change == null ? null : change > 0 ? ArrowUpRightIcon : change < 0 ? ArrowDownRightIcon : MinusIcon;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-3xl font-bold tabular-nums">{value}</dd>
      {/* Change is plain text with an arrow (no red/green): whether "up" is good depends on the number. */}
      <dd className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {change != null ? `${change > 0 ? "+" : ""}${change}% vs ${vs}` : note ?? `No data for ${vs ?? "before"}`}
      </dd>
    </div>
  );
}

/** A small list where each row has a bar showing its share of the total. */
function Breakdown({
  title,
  note,
  rows,
  format,
  empty,
}: {
  title: string;
  note?: string;
  rows: { label: string; value: number; sub?: string }[];
  format: (n: number) => string;
  empty?: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty ?? "Nothing in this range."}</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((r) => {
            const share = r.value / total;
            return (
              <li key={r.label} title={`${r.label}: ${format(r.value)} (${Math.round(share * 100)}%)`}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    {r.label}
                    {r.sub && <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                  <span className="tabular-nums">
                    {format(r.value)} <span className="text-muted-foreground">· {Math.round(share * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SellerList({ title, products, empty }: { title: string; products: ProductInsight[]; empty: string }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {products.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-3 divide-y">
          {products.map((p, i) => {
            const m = margin(p);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                <span aria-hidden>{p.emoji ?? "🛍️"}</span>
                <span className="flex-1 truncate font-medium">{p.name}</span>
                <span className="tabular-nums">{p.units} sold</span>
                <span className="w-20 text-right text-muted-foreground tabular-nums">
                  {m === null ? "—" : `${Math.round(m * 100)}% margin`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
