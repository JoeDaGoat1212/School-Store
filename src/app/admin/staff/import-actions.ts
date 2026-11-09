"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/*
 * One-time move from the old separate time clock (the Store-Clock-In site on
 * Vercel) into this website. It signs in to the old site with its manager PIN,
 * reads every employee and shift, and copies them here:
 *   - employees keep their name, PIN, badge and status (removed stays removed,
 *     waiting for approval stays waiting); someone already here with the same
 *     name is matched, not copied twice;
 *   - every shift is copied with its exact times, including anyone still on
 *     the clock;
 *   - running it again skips everything already copied.
 * Store credit and discounts then count those hours automatically.
 */

type OldEmployee = { id: string; name: string; pin: string; badge?: string; active?: boolean; pending?: boolean; createdAt?: number };
type OldShift = { id: string; empId: string; name?: string; in: number; out: number | null; manual?: boolean };

export type ImportSummary = {
  employeesAdded: number;
  employeesMatched: number;
  shiftsAdded: number;
  shiftsSkipped: number;
  openShifts: number;
  problems: string[];
};

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function importOldClock(address: string, pin: string): Promise<{ summary?: ImportSummary; error?: string }> {
  const { supabase } = await requireAdmin();

  // ---- 1. Read everything from the old site ----
  let base: URL;
  try {
    base = new URL(/^https?:\/\//.test(address.trim()) ? address.trim() : `https://${address.trim()}`);
  } catch {
    return { error: "That web address doesn't look right. It's like store-clock-in.vercel.app." };
  }
  if (base.protocol !== "https:" || !base.hostname.endsWith(".vercel.app")) {
    return { error: "Enter the old time clock's vercel.app address, like store-clock-in.vercel.app." };
  }
  let old: { employees?: OldEmployee[]; shifts?: OldShift[]; error?: string };
  try {
    const res = await fetch(new URL("/api/clock", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: "login", pin: pin.trim() }),
      cache: "no-store",
    });
    old = await res.json();
    if (!res.ok) return { error: old.error ? `The old time clock said: ${old.error}` : "The old time clock didn't answer. Check the address." };
  } catch {
    return { error: "Couldn't reach the old time clock. Check the address." };
  }
  const oldEmployees = (old.employees ?? []).filter((e) => e && typeof e.name === "string" && /^\d{4}$/.test(String(e.pin)));
  const oldShifts = (old.shifts ?? []).filter((s) => s && typeof s.in === "number" && s.empId);
  if (oldEmployees.length === 0) return { error: "The old time clock has no employees to bring over." };

  const summary: ImportSummary = { employeesAdded: 0, employeesMatched: 0, shiftsAdded: 0, shiftsSkipped: 0, openShifts: 0, problems: [] };

  // ---- 2. Employees ----
  const { data: existing, error: staffError } = await supabase.from("staff").select("id, name, pin, status");
  if (staffError) return { error: "Run database update 15 (the time clock) first." };
  const byName = new Map((existing ?? []).map((s) => [key(s.name), s]));
  const pinsInUse = new Set((existing ?? []).filter((s) => s.status !== "removed").map((s) => s.pin));
  const idFor = new Map<string, string>(); // old employee id → new staff id

  for (const e of oldEmployees) {
    const name = e.name.trim().replace(/\s+/g, " ").slice(0, 40);
    const match = byName.get(key(name));
    if (match) {
      idFor.set(e.id, match.id);
      summary.employeesMatched += 1;
      continue;
    }
    const status = e.active === false ? "removed" : e.pending ? "pending" : "active";
    const pinToUse = String(e.pin);
    if (status !== "removed" && pinsInUse.has(pinToUse)) {
      // Someone here already has that PIN: bring them over as removed so their hours still count; fix the PIN and restore them.
      summary.problems.push(`${name}'s PIN ${pinToUse} is already used here, so ${name} was added as Removed. Give them a new PIN on Employees, then Restore.`);
    }
    const finalStatus = status !== "removed" && pinsInUse.has(pinToUse) ? "removed" : status;
    const { data: row, error } = await supabase
      .from("staff")
      .insert({
        name,
        pin: pinToUse,
        badge: e.badge?.trim().slice(0, 40) || null,
        status: finalStatus,
        self_signup: false,
        created_at: e.createdAt ? new Date(e.createdAt).toISOString() : undefined,
      })
      .select("id")
      .single();
    if (error || !row) {
      summary.problems.push(`Couldn't add ${name}: ${error?.message ?? "unknown problem"}`);
      continue;
    }
    if (finalStatus !== "removed") pinsInUse.add(pinToUse);
    idFor.set(e.id, row.id);
    byName.set(key(name), { id: row.id, name, pin: String(e.pin), status: finalStatus });
    summary.employeesAdded += 1;
  }

  // ---- 3. Shifts (skip any already here: same person, same clock-in minute) ----
  const staffIds = [...new Set(idFor.values())];
  const { data: have } = staffIds.length
    ? await supabase.from("staff_shifts").select("staff_id, clock_in, clock_out").in("staff_id", staffIds).limit(50000)
    : { data: [] as { staff_id: string | null; clock_in: string; clock_out: string | null }[] };
  const seen = new Set((have ?? []).map((s) => `${s.staff_id}|${Math.floor(new Date(s.clock_in).getTime() / 60000)}`));
  const openHere = new Set((have ?? []).filter((s) => !s.clock_out).map((s) => s.staff_id));

  const rows: { staff_id: string; staff_name: string; clock_in: string; clock_out: string | null; manual: boolean }[] = [];
  for (const s of oldShifts.sort((a, b) => a.in - b.in)) {
    const staffId = idFor.get(s.empId);
    if (!staffId) {
      summary.shiftsSkipped += 1;
      continue;
    }
    const mark = `${staffId}|${Math.floor(s.in / 60000)}`;
    if (seen.has(mark)) {
      summary.shiftsSkipped += 1;
      continue;
    }
    const out = typeof s.out === "number" && s.out > s.in ? new Date(s.out).toISOString() : null;
    if (!out) {
      if (openHere.has(staffId)) {
        summary.shiftsSkipped += 1;
        continue;
      }
      openHere.add(staffId);
      summary.openShifts += 1;
    }
    seen.add(mark);
    const person = [...byName.values()].find((p) => p.id === staffId);
    rows.push({ staff_id: staffId, staff_name: person?.name ?? s.name ?? "Employee", clock_in: new Date(s.in).toISOString(), clock_out: out, manual: Boolean(s.manual) });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("staff_shifts").insert(rows.slice(i, i + 500));
    if (error) {
      summary.problems.push(`Some shifts couldn't be copied: ${error.message}`);
      break;
    }
    summary.shiftsAdded += Math.min(500, rows.length - i);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/clock");
  return { summary };
}
