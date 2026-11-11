/**
 * Student employees: the time clock (/clock), the schedule and store credit.
 * The database side is supabase/migrations/20261106000015_staff_time_clock.sql.
 *
 * Employee perks, counted each week (Monday–Sunday, Arizona time):
 *   - every hour worked earns $1 of store credit, counted to the minute, up
 *     to $10 a week (database update 22); credit stays until it's spent;
 *   - every whole hour worked this week adds 10% off everything, up to 50%
 *     at 5 hours (the discount starts over each Monday).
 * The $1, $10, 10% and 5 hours are settings on Admin → Store credit.
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
      /** When they'll be clocked out automatically (clock-ins only; null if the limit is off). */
      autoOutAt?: string | null;
      weekMinutes: number;
      discountPct: number;
      creditCents: number;
      nextCreditMinutes: number;
      next: { date: string; label: string; startsAt: string } | null;
    }
  | { status: "pending"; name: string }
  /** They'd already been clocked out automatically; this punch only tells them. The next one clocks in. */
  | {
      status: "auto";
      name: string;
      in: string;
      out: string;
      weekMinutes: number;
      discountPct: number;
      creditCents: number;
      next: { date: string; label: string; startsAt: string } | null;
    }
  | { error: string; code?: "LOCKED" | "NOT_FOUND" };

export const emptyBoard: ClockBoard = { onClock: [], today: [], upcoming: [], signupApproval: true };

/** "Auto clock-out at 9:20 AM": a shift's start plus the limit, or null when the limit is off. */
export function autoOutAt(clockIn: string, maxMinutes: number) {
  return maxMinutes > 0 ? new Date(new Date(clockIn).getTime() + maxMinutes * 60000).toISOString() : null;
}

/** Two-letter initials for a name: "Maya R" → "MR". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? ""))).toUpperCase();
}

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

/** pct/afterHours: the discount (10% per hour, up to 5 hours). cents/capCents: credit per hour and the most per week. */
export type CreditRule = { pct: number; afterHours: number; cents: number; capCents?: number };

const capOf = (rule: CreditRule) => rule.capCents ?? 1000;

/** Credit earned this week so far: $1 an hour, to the minute, up to the weekly cap. */
export function weekCredit(weekMinutes: number, rule: CreditRule) {
  return Math.min(capOf(rule), Math.floor((Math.max(0, weekMinutes) * rule.cents) / 60));
}

/** "$1" or "$1.50" */
export function shortMoney(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "$1 store credit for every hour worked, up to $10 a week, plus 10% off for every hour (up to 50% at 5 hours). Starts over each Monday." */
export function creditRuleText(rule: CreditRule) {
  return `${shortMoney(rule.cents)} store credit for every hour worked, up to ${shortMoney(capOf(rule))} a week, plus ${rule.pct}% off for every hour (up to ${rule.pct * rule.afterHours}% at ${rule.afterHours} hours). Starts over each Monday.`;
}

/** What working one more hour gets them, given minutes worked this week. */
export function nextReward(weekMinutes: number, rule: CreditRule) {
  const hours = Math.floor(weekMinutes / 60);
  const credit = weekCredit(weekMinutes, rule) < capOf(rule);
  const off = hours < rule.afterHours;
  if (credit && off) return `+${shortMoney(rule.cents)} credit and ${rule.pct}% off`;
  if (credit) return `+${shortMoney(rule.cents)} credit`;
  if (off) return `+${rule.pct}% off`;
  return "nothing more this week (maxed out)";
}

/** The employee portal (/work), from the staff_portal() database function. */
export type PortalData = {
  id: string;
  name: string;
  /** The automatic clock-out limit in minutes (0 = off). Added by the website, not the database. */
  maxShiftMinutes: number;
  open: { id: string; in: string; source: string } | null;
  weekMinutes: number;
  discountPct: number;
  creditCents: number;
  earnedCents: number;
  workedMinutes: number;
  rule: CreditRule;
  schedule: { date: string; label: string; startsAt: string }[];
  shifts: { in: string; out: string | null; phone: boolean }[];
  credit: { cents: number; note: string | null; at: string }[];
};
