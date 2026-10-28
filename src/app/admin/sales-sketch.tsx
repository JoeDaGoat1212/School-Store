import { formatCents, formatDay } from "@/lib/format";

/**
 * Two weeks of school-day sales and spending, drawn like a pencil sketch on
 * ledger paper: wobbly lines (each drawn twice, slightly off, like a real
 * pencil), handwritten labels, and a note pointing at the best day.
 * Hover a day (or read the table) for exact numbers.
 */
export function SalesSketch({ days }: { days: { date: string; sales: number; spending: number }[] }) {
  const W = 640;
  const H = 230;
  const pad = { top: 34, right: 18, bottom: 34, left: 18 };
  const max = Math.max(1, ...days.flatMap((d) => [d.sales, d.spending]));
  const x = (i: number) => pad.left + (i * (W - pad.left - pad.right)) / Math.max(days.length - 1, 1);
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom);
  const best = days.reduce((b, d, i) => (d.sales > (days[b]?.sales ?? -1) ? i : b), 0);
  const hasData = days.some((d) => d.sales > 0 || d.spending > 0);

  const sales = days.map((d, i) => [x(i), y(d.sales)] as const);
  const spending = days.map((d, i) => [x(i), y(d.spending)] as const);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Sales and spending for the last two weeks of school days">
        {/* Hand-ruled baseline */}
        <path d={wobble([[pad.left - 6, H - pad.bottom], [W - pad.right + 6, H - pad.bottom]], 7, 1.2)} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />

        {hasData && (
          <>
            {/* Spending: dashed pencil in ledger green */}
            <path d={wobble(spending, 3, 1.4)} fill="none" stroke="var(--ledger, var(--chart-2))" strokeWidth="2.2" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />
            {/* Sales: price-gun orange marker, gone over twice */}
            <path d={wobble(sales, 1, 1.6)} fill="none" stroke="var(--label, var(--chart-1))" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d={wobble(sales, 2, 1.6)} fill="none" stroke="var(--label, var(--chart-1))" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

            {/* The best day, circled with a note */}
            {days[best].sales > 0 && (
              <g>
                <ellipse cx={x(best)} cy={y(days[best].sales)} rx="13" ry="10" fill="none" stroke="var(--stamp, var(--destructive))" strokeWidth="1.8" transform={`rotate(-12 ${x(best)} ${y(days[best].sales)})`} />
                <text
                  x={Math.min(Math.max(x(best), 90), W - 90)}
                  y={Math.max(y(days[best].sales) - 18, 14)}
                  textAnchor="middle"
                  className="font-hand"
                  fontSize="20"
                  fill="var(--stamp, var(--destructive))"
                >
                  best day: {formatCents(days[best].sales)}
                </text>
              </g>
            )}
          </>
        )}

        {/* Day letters along the bottom, and an invisible hover target per day */}
        {days.map((d, i) => (
          <g key={d.date}>
            <text x={x(i)} y={H - 10} textAnchor="middle" className="font-hand" fontSize="17" fill="currentColor" fillOpacity="0.65">
              {formatDay(d.date, { weekday: "narrow", month: undefined, day: undefined })}
            </text>
            <rect x={x(i) - 18} y={pad.top - 10} width="36" height={H - pad.top - pad.bottom + 10} fill="transparent">
              <title>{`${formatDay(d.date)}: sales ${formatCents(d.sales)}, spending ${formatCents(d.spending)}`}</title>
            </rect>
          </g>
        ))}

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="font-hand" fontSize="24" fill="currentColor" fillOpacity="0.6">
            nothing sold yet: import some sales!
          </text>
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden width="26" height="8">
            <path d="M2 4 Q 13 1 24 4" stroke="var(--label, var(--chart-1))" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          </svg>
          Sales
        </span>
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden width="26" height="8">
            <path d="M2 4 Q 13 6 24 4" stroke="var(--ledger, var(--chart-2))" strokeWidth="2.2" strokeDasharray="7 6" fill="none" strokeLinecap="round" />
          </svg>
          Spending (shopping trips)
        </span>
      </figcaption>

      {/* The same numbers, for screen readers */}
      <table className="sr-only">
        <caption>Sales and spending by school day</caption>
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

/**
 * A smooth line through the points, nudged a little off course like a hand
 * drawing it. `seed` picks the wobble, so it's the same on every load.
 */
function wobble(points: readonly (readonly [number, number])[], seed: number, amount: number) {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  const p = points.map(([px, py]) => [px + rand() * amount * 2, py + rand() * amount * 2] as const);
  if (p.length < 2) return "";
  // Catmull-Rom → Bézier curves, for a smooth hand-drawn look.
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    // Keep the bend between the two points' heights, so the line never dips
    // below zero or bumps above a peak that isn't there.
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (v: number) => Math.min(Math.max(v, lo), hi);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
