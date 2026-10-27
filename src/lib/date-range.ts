/**
 * Date ranges for the Insights page: "this week", "October", "2026", or a
 * custom from–to. All dates are "YYYY-MM-DD" in Arizona time.
 */

import { addDays, startOfWeek } from "./format";

export type RangeKind = "week" | "month" | "year" | "custom";
export type Bucket = "day" | "week" | "month";

export type DateRange = {
  kind: RangeKind;
  from: string;
  to: string;
  /** Size of each bar in the trend chart. */
  bucket: Bucket;
  label: string;
  /** Anchor dates for the ‹ › buttons (null for custom ranges). */
  prev: string | null;
  next: string | null;
};

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12 here
}

/** Bars by day for short ranges, by week for medium, by month for long. */
export function bucketFor(from: string, to: string): Bucket {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days <= 14 ? "day" : days <= 120 ? "week" : "month";
}

/** Works out the range for a kind and an anchor date inside it. */
export function rangeFor(kind: RangeKind, anchor: string, custom?: { from: string; to: string }): DateRange {
  const [y, m] = anchor.split("-").map(Number);

  if (kind === "week") {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    return {
      kind,
      from,
      to,
      bucket: "day",
      label: `Week of ${fmt(from, { month: "short", day: "numeric" })}`,
      prev: addDays(from, -7),
      next: addDays(from, 7),
    };
  }

  if (kind === "month") {
    const pad = (n: number) => String(n).padStart(2, "0");
    const from = `${y}-${pad(m)}-01`;
    const to = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
    return {
      kind,
      from,
      to,
      bucket: "week",
      label: fmt(from, { month: "long", year: "numeric" }),
      prev: addDays(from, -1),
      next: addDays(to, 1),
    };
  }

  if (kind === "year") {
    return {
      kind,
      from: `${y}-01-01`,
      to: `${y}-12-31`,
      bucket: "month",
      label: String(y),
      prev: `${y - 1}-06-01`,
      next: `${y + 1}-06-01`,
    };
  }

  // custom
  let { from, to } = custom ?? { from: anchor, to: anchor };
  if (from > to) [from, to] = [to, from];
  return {
    kind,
    from,
    to,
    bucket: bucketFor(from, to),
    label: `${fmt(from, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(to, { month: "short", day: "numeric", year: "numeric" })}`,
    prev: null,
    next: null,
  };
}

/** "+12%" style change from the previous period, or null if there's nothing to compare. */
export function percentChange(now: number, before: number) {
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
