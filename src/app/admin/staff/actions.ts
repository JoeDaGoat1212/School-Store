"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/format";
import { fromLocalInput } from "@/lib/staff";

/*
 * Everything the manager changes for student employees: who works here, the
 * schedule, timecards and store credit. Every action checks the admin login
 * first, and the database only lets the admin touch these tables anyway.
 */

type Result = { ok?: true; error?: string };

function done(): Result {
  revalidatePath("/admin", "layout");
  revalidatePath("/clock");
  return { ok: true };
}

/** Turns database errors into something a person can act on. */
function problem(message: string): Result {
  if (/staff_pin_in_use/.test(message)) return { error: "Someone else already has that PIN." };
  if (/staff_badge_in_use/.test(message)) return { error: "Someone else already has that badge code." };
  if (/staff_shifts_one_open/.test(message)) return { error: "They're already clocked in. Clock them out first." };
  if (/staff_schedule_staff_id_work_date_window_id_key/.test(message)) return { error: "They're already on the schedule then." };
  return { error: message.replace(/^.*?ERROR:\s*/, "") };
}

const cleanName = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 40);

/* ------------------------------------------------------------ employees */

export async function addEmployee(input: { name: string; pin: string; badge: string }): Promise<Result> {
  const { supabase } = await requireAdmin();
  const name = cleanName(input.name);
  const pin = input.pin.trim();
  const badge = input.badge.trim().slice(0, 40) || null;
  if (name.length < 2) return { error: "Enter their name." };
  if (!/^\d{4}$/.test(pin)) return { error: "The PIN must be exactly 4 digits." };
  const { error } = await supabase.from("staff").insert({ name, pin, badge, status: "active" });
  return error ? problem(error.message) : done();
}

export async function updateEmployee(id: string, input: { name: string; pin: string; badge: string }): Promise<Result> {
  const { supabase } = await requireAdmin();
  const name = cleanName(input.name);
  const pin = input.pin.trim();
  if (name.length < 2) return { error: "Enter their name." };
  if (!/^\d{4}$/.test(pin)) return { error: "The PIN must be exactly 4 digits." };
  const { error } = await supabase
    .from("staff")
    .update({ name, pin, badge: input.badge.trim().slice(0, 40) || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? problem(error.message) : done();
}

/** Approve a new sign-up, remove someone, or bring them back. */
export async function setEmployeeStatus(id: string, status: "active" | "removed"): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (status === "removed") {
    // Removing someone who's still clocked in clocks them out now.
    await supabase.from("staff_shifts").update({ clock_out: new Date().toISOString() }).eq("staff_id", id).is("clock_out", null);
  }
  const { error } = await supabase.from("staff").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    return /staff_pin_in_use|staff_badge_in_use/.test(error.message)
      ? { error: "Someone else has their PIN or badge now. Give them a new PIN with Edit, then try again." }
      : problem(error.message);
  }
  return done();
}

/** Turn down a sign-up: it's deleted (they never worked a shift). */
export async function declineSignup(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff").delete().eq("id", id).eq("status", "pending");
  return error ? problem(error.message) : done();
}

/**
 * Erase removed accounts for good. Only accounts that were already removed:
 * active employees are never erased. Their past shifts stay (with their name).
 */
export async function eraseRemoved(id?: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  let q = supabase.from("staff").delete().eq("status", "removed");
  if (id) q = q.eq("id", id);
  const { error } = await q;
  return error ? problem(error.message) : done();
}

export async function setSignupApproval(on: boolean): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("settings").update({ staff_signup_approval: on, updated_at: new Date().toISOString() }).eq("id", 1);
  return error ? problem(error.message) : done();
}

/* ------------------------------------------------------------ schedule */

export async function addToSchedule(staffId: string, workDate: string, windowId: number): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return { error: "Pick a day." };
  const { error } = await supabase.from("staff_schedule").insert({ staff_id: staffId, work_date: workDate, window_id: windowId });
  return error ? problem(error.message) : done();
}

export async function removeFromSchedule(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_schedule").delete().eq("id", id);
  return error ? problem(error.message) : done();
}

/** Copies one week's schedule onto the next week (skips anything already there). */
export async function copyWeek(fromMonday: string, toMonday: string): Promise<Result & { copied?: number }> {
  const { supabase } = await requireAdmin();
  const shift = Math.round((Date.parse(`${toMonday}T12:00:00Z`) - Date.parse(`${fromMonday}T12:00:00Z`)) / 86400000);
  const end = new Date(Date.parse(`${fromMonday}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
  const [{ data, error }, { data: active }] = await Promise.all([
    supabase.from("staff_schedule").select("staff_id, work_date, window_id").gte("work_date", fromMonday).lte("work_date", end),
    supabase.from("staff").select("id").eq("status", "active"),
  ]);
  if (error) return problem(error.message);
  const activeIds = new Set((active ?? []).map((s) => s.id));
  const source = (data ?? []).filter((r) => activeIds.has(r.staff_id));
  if (source.length === 0) return { error: "Last week has nobody on the schedule to copy." };
  const rows = source.map((r) => ({
    staff_id: r.staff_id,
    window_id: r.window_id,
    work_date: new Date(Date.parse(`${r.work_date}T12:00:00Z`) + shift * 86400000).toISOString().slice(0, 10),
  }));
  const { error: e2 } = await supabase.from("staff_schedule").upsert(rows, { onConflict: "staff_id,work_date,window_id", ignoreDuplicates: true });
  if (e2) return problem(e2.message);
  done();
  return { ok: true, copied: rows.length };
}

/* ------------------------------------------------------------ timecards */

export async function clockOutShift(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_shifts").update({ clock_out: new Date().toISOString() }).eq("id", id).is("clock_out", null);
  return error ? problem(error.message) : done();
}

export async function clockOutEveryone(): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_shifts").update({ clock_out: new Date().toISOString() }).is("clock_out", null);
  return error ? problem(error.message) : done();
}

/** Fix a shift's times. `clockIn`/`clockOut` are Arizona times from datetime-local inputs; empty out = still on. */
export async function editShift(id: string, clockIn: string, clockOut: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const start = fromLocalInput(clockIn);
  const end = clockOut ? fromLocalInput(clockOut) : null;
  if (!start || (clockOut && !end)) return { error: "Enter a date and time." };
  if (end && end <= start) return { error: "Clock out has to be after clock in." };
  const { error } = await supabase
    .from("staff_shifts")
    .update({ clock_in: start, clock_out: end, manual: true, undo_token: null, undo_kind: null, undo_until: null })
    .eq("id", id);
  return error ? problem(error.message) : done();
}

export async function deleteShift(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
  return error ? problem(error.message) : done();
}

/** Someone forgot to clock in at all: add the whole shift by hand. */
export async function addShift(staffId: string, clockIn: string, clockOut: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const start = fromLocalInput(clockIn);
  const end = fromLocalInput(clockOut);
  if (!start || !end) return { error: "Enter the date, clock in and clock out." };
  if (end <= start) return { error: "Clock out has to be after clock in." };
  const { data: person } = await supabase.from("staff").select("name").eq("id", staffId).maybeSingle();
  if (!person) return { error: "Pick an employee." };
  const { error } = await supabase
    .from("staff_shifts")
    .insert({ staff_id: staffId, staff_name: person.name, clock_in: start, clock_out: end, manual: true, source: "manual", out_source: "manual" });
  return error ? problem(error.message) : done();
}

/** Ends shifts automatically after this many minutes (0 = never). */
export async function saveShiftLimit(minutes: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const m = Number.parseInt(minutes, 10);
  if (!Number.isInteger(m) || m < 0 || m > 720) return { error: "Enter minutes from 0 (off) to 720." };
  const { error } = await supabase.from("settings").update({ staff_max_shift_minutes: m, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return problem(error.message);
  await supabase.rpc("staff_auto_clock_out");
  return done();
}

/* ------------------------------------------------------------ store credit */

/** Record credit an employee used at the window, or add some by hand. */
export async function changeCredit(staffId: string, kind: "use" | "add", amount: string, note: string): Promise<Result & { balance?: number }> {
  const { supabase } = await requireAdmin();
  const cents = parseDollarsToCents(amount);
  if (cents === null || cents <= 0) return { error: "Enter an amount, like 1.50." };
  const { data, error } = await supabase.rpc("staff_credit_add", {
    p_staff_id: staffId,
    p_amount_cents: kind === "use" ? -cents : cents,
    p_note: note.trim().slice(0, 120) || null,
  });
  if (error) return problem(error.message);
  done();
  return { ok: true, balance: data ?? undefined };
}

export async function deleteCreditEntry(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_credit_entries").delete().eq("id", id);
  return error ? problem(error.message) : done();
}

/** "$1 credit an hour, up to $10 a week." */
export async function saveCreditRule(dollars: string, capDollars: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const cents = parseDollarsToCents(dollars);
  const cap = parseDollarsToCents(capDollars);
  if (cents === null || cents < 0 || cents > 2000) return { error: "Enter a credit amount from $0 to $20." };
  if (cap === null || cap < 0 || cap > 100000) return { error: "Enter a weekly limit from $0 to $1,000." };
  // The old percent-off discount is off for good.
  const { error } = await supabase
    .from("settings")
    .update({ staff_discount_pct_per_hour: 0, staff_credit_cents_per_hour: cents, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return problem(error.message);
  const { error: capError } = await supabase.from("settings").update({ staff_credit_week_cap_cents: cap }).eq("id", 1);
  return capError ? { error: "Run database update 22 first to set a weekly limit." } : done();
}
