/**
 * Formatting helpers for money and dates.
 *
 * Money: the database stores whole cents (150 = $1.50) to avoid rounding bugs.
 * Dates: the store runs on Arizona time, no matter where the server is.
 */

export const STORE_TIMEZONE = "America/Phoenix";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 150 → "$1.50" */
export function formatCents(cents: number | null | undefined) {
  return dollars.format((cents ?? 0) / 100);
}

/** "1.50" or "$1.50" → 150. Returns null if it isn't a valid amount. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === "-") return null;
  return Math.round(Number.parseFloat(cleaned) * 100);
}

/** Today's date in Arizona as "YYYY-MM-DD". */
export function storeToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIMEZONE }).format(now);
}

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`); // noon UTC avoids off-by-one surprises
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week that contains `isoDate`. */
export function startOfWeek(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return addDays(isoDate, -daysSinceMonday);
}

/** "2026-10-26" → "Mon, Oct 26" */
export function formatDay(isoDate: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/** A timestamp shown as Arizona time, e.g. "10:42 AM". */
export function formatTime(timestamp: string | Date) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: STORE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "14:15" → "2:15 PM" */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "today", "tomorrow", or the day name, for a date relative to today. */
export function relativeDay(isoDate: string, today = storeToday()) {
  if (isoDate === today) return "Today";
  if (isoDate === addDays(today, 1)) return "Tomorrow";
  return formatDay(isoDate, { weekday: "long" });
}
