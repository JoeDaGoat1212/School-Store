import { formatCents, formatDay } from "@/lib/format";

/**
 * School-day sales (orange) and spending (teal) as side-by-side bars.
 * Plain SVG, so it draws on the server with no extra code in the browser.
 * Hover a bar for the exact numbers; screen readers get a table.
 */
export function WeekChart({ days }: { days: { date: string; sales: number; spending: number }[] }) {
  const hasData = days.some((d) => d.sales > 0 || d.spending > 0);

  if (!hasData) {
    return (
      <div className="grid h-52 place-items-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
        <p>
          No sales yet for these days.
          <br />
          Import your InTouchPay sales to fill this in.
        </p>
      </div>
    );
  }

  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 30, left: 52 };
  const max = niceMax(Math.max(1, ...days.flatMap((d) => [d.sales, d.spending])));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / days.length;
  const barW = Math.min(18, slot * 0.32);
  const y = (v: number) => pad.top + (1 - v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales and spending by school day">
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
          return (
            <g key={d.date}>
              <title>{`${formatDay(d.date, { weekday: "short" })}: sold ${formatCents(d.sales)}, spent ${formatCents(d.spending)}`}</title>
              <rect x={cx - slot / 2} y={pad.top} width={slot} height={innerH} fill="transparent" />
              <rect x={cx - barW - 1.5} y={y(d.sales)} width={barW} height={Math.max(0, y(0) - y(d.sales))} rx="4" fill="var(--chart-1)" />
              <rect x={cx + 1.5} y={y(d.spending)} width={barW} height={Math.max(0, y(0) - y(d.spending))} rx="4" fill="var(--chart-2)" />
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
                {formatDay(d.date, { weekday: "short" }).slice(0, 3)} {Number(d.date.slice(8))}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-[var(--chart-1)]" /> Sales
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-[var(--chart-2)]" /> Spending
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Sales and spending by day</caption>
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
              <td>{formatDay(d.date)}</td>
              <td>{formatCents(d.sales)}</td>
              <td>{formatCents(d.spending)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Rounds the top of the chart up to a tidy dollar amount. */
function niceMax(cents: number) {
  const dollars = cents / 100;
  const step = dollars <= 20 ? 5 : dollars <= 100 ? 20 : dollars <= 500 ? 100 : 250;
  return Math.ceil(dollars / step) * step * 100;
}
