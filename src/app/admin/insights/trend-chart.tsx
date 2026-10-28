"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Insights } from "./types";

/** Short axis labels: $450, $1.5K, $12K. */
const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const SERIES = [
  { key: "revenue", label: "Sales", color: "var(--chart-1)" },
  { key: "spending", label: "Spending", color: "var(--chart-2)" },
] as const;

function bucketLabel(start: string, bucket: Insights["bucket"], long = false) {
  const d = new Date(`${start}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    bucket === "day"
      ? { weekday: "short", day: "numeric" }
      : bucket === "week"
        ? { month: "short", day: "numeric" }
        : { month: long ? "long" : "short", year: long ? "numeric" : undefined };
  const text = d.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  return bucket === "week" && long ? `Week of ${text}` : text;
}

/** Sales vs spending over time, as paired bars, with a table view for exact numbers. */
export function TrendChart({ data }: { data: Insights }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = data.series.map((s) => ({
    label: bucketLabel(s.start, data.bucket),
    longLabel: bucketLabel(s.start, data.bucket, true),
    revenue: s.revenue_cents,
    spending: s.spending_cents,
  }));
  const per = data.bucket === "day" ? "day" : data.bucket === "week" ? "week" : "month";

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="trend-heading">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <h2 id="trend-heading" className="font-heading text-lg font-semibold">
          Sales and spending by {per}
        </h2>
        {/* Legend: always shown for two series. */}
        <ul className="flex gap-4 text-sm text-muted-foreground">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="View">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 font-medium capitalize", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div className="h-72 w-full" role="img" aria-label={`Bar chart of sales and spending by ${per}. Switch to table view for exact numbers.`}>
          <BarChart
            responsive
            style={{ width: "100%", height: "100%" }}
            data={rows}
            barGap={2}
            barCategoryGap="28%"
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(c: number) => compactDollars.format(c / 100)}
              />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={TrendTooltip} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={24} shape={PencilBar} />
              ))}
          </BarChart>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{per[0].toUpperCase() + per.slice(1)}</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Spending</TableHead>
                <TableHead className="pr-4 text-right">Sales − spending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.longLabel}>
                  <TableCell className="pl-4">{r.longLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(r.spending)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatCents(r.revenue - r.spending)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function TrendTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { longLabel: string; revenue: number; spending: number };
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-sm shadow-soft">
      <p className="mb-1 font-semibold">{row.longLabel}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular-nums">{formatCents(row[s.key])}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between gap-4 border-t pt-1">
        <span className="text-muted-foreground">Difference</span>
        <span className="font-semibold tabular-nums">{formatCents(row.revenue - row.spending)}</span>
      </p>
    </div>
  );
}

/**
 * A bar drawn like a pencil sketch: a slightly wobbly outline in the series
 * color, filled with diagonal hatching. (Each bar wobbles the same way every
 * time, based on where it is.)
 */
function PencilBar(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, fill = "currentColor" } = props as { x?: number; y?: number; width?: number; height?: number; fill?: string };
  if (height <= 0.5 || width <= 0) return <g />;
  const j = (n: number) => Math.sin(x * 12.9898 + y * 78.233 + n * 37.719) * 1.3; // a steady little wobble
  const left = x + j(1);
  const right = x + width + j(2);
  const top = y + j(3);
  const bottom = y + height;
  // Hatch lines every 4px, clipped to the bar.
  const lines: string[] = [];
  for (let k = -height; k < width; k += 4) lines.push(`M${x + k} ${bottom} L${x + k + height} ${y}`);
  const id = `hatch-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g>
      <clipPath id={id}>
        <rect x={x} y={y} width={width} height={height} />
      </clipPath>
      <path d={lines.join(" ")} stroke={fill} strokeWidth="1.4" strokeOpacity="0.55" clipPath={`url(#${id})`} />
      <path
        d={`M${left} ${bottom} L${x + j(4)} ${top} Q${x + width / 2} ${top + j(5)} ${right} ${y + j(6)} L${x + width + j(7)} ${bottom}`}
        fill="none"
        stroke={fill}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
