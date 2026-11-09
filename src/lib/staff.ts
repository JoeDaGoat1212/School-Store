/**
 * Student employees: the time clock (/clock), the schedule and store credit.
 * The database side is supabase/migrations/20261106000015_staff_time_clock.sql.
 *
 * Employee perks, counted each week (Monday–Sunday, Arizona time; database
 * update 16):
 *   - every whole hour worked this week adds 10% off everything, up to 50%
 *     at 5 hours (the discount starts over each Monday);
 *   - every whole hour after the first 5 adds $1 of store credit, which stays
 *     until it's spent.
 * The 10%, 5 hours and $1 are settings on Admin → Store credit.
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
      discountPct: number;
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

export type CreditRule = { pct: number; afterHours: number; cents: number };

/** "$1" or "$1.50" */
export function shortMoney(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "10% off for every hour worked (up to 50% at 5 hours), then $1 credit for every hour after 5. Starts over each Monday." */
export function creditRuleText(rule: CreditRule) {
  return `${rule.pct}% off for every hour worked (up to ${rule.pct * rule.afterHours}% at ${rule.afterHours} hours), then ${shortMoney(rule.cents)} store credit for every hour after ${rule.afterHours}. Starts over each Monday.`;
}

/** What working one more hour gets them, given minutes worked this week. */
export function nextReward(weekMinutes: number, rule: CreditRule) {
  const hours = Math.floor(weekMinutes / 60);
  return hours < rule.afterHours ? `+${rule.pct}% off` : `+${shortMoney(rule.cents)} credit`;
}

/** The employee portal (/work), from the staff_portal() database function. */
export type PortalData = {
  id: string;
  name: string;
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
