/**
 * Student employees: the time clock (/clock), the schedule and store credit.
 * The database side is supabase/migrations/20261106000015_staff_time_clock.sql.
 *
 * Store credit: employees earn `creditCents` for every `creditMinutes` they
 * work ($1 per 45 minutes to start; change it on Admin → Store credit). It's
 * worked out from ALL their finished shifts added together, so a 30-minute
 * shift and a 15-minute shift make $1 between them.
 */

import { STORE_TIMEZONE } from "@/lib/format";

export type StaffStatus = "pending" | "active" | "removed";

/** What the time clock screen shows (from the staff_board() database function). */
export type ClockBoard = {
  onClock: { name: string; in: string }[];
  today: { name: string; in: string; out: string }[];
  upcoming: { date: string; label: string; startsAt: string; name: string }[];
  signupApproval: boolean;
};

/** What a punch hands back (from staff_punch()). */
export type PunchResult =
  | {
      status: "in" | "out";
      name: string;
      in: string;
      out: string | null;
      id: string;
      undo: string;
      weekMinutes: number;
      creditCents: number;
      nextCreditMinutes: number;
      next: { date: string; label: string; startsAt: string } | null;
    }
  | { status: "pending"; name: string }
  | { error: string; code?: "LOCKED" | "NOT_FOUND" };

export const emptyBoard: ClockBoard = { onClock: [], today: [], upcoming: [], signupApproval: true };

/** 135 → "2h 15m", 40 → "40m" */
export function formatMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** 135 → "2.25" (hours with two decimals, for payroll sheets) */
export function hoursDecimal(minutes: number) {
  return (Math.max(0, minutes) / 60).toFixed(2);
}

/** Minutes between two timestamps (the end defaults to now, for open shifts). */
export function minutesBetween(start: string, end?: string | null, now = Date.now()) {
  return Math.max(0, Math.floor(((end ? new Date(end).getTime() : now) - new Date(start).getTime()) / 60000));
}

/** "2026-11-06T15:05:00Z" → "2026-11-06T08:05", Arizona time, for <input type="datetime-local">. */
export function toLocalInput(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * "2026-11-06T08:05" (Arizona time, from a datetime-local input) → an exact
 * timestamp. Arizona doesn't use daylight saving, so it's always UTC−7.
 */
export function fromLocalInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00-07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "$1 for every 45 minutes worked" */
export function creditRuleText(cents: number, minutes: number) {
  const money = cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  return `${money} for every ${minutes} minutes worked`;
}
