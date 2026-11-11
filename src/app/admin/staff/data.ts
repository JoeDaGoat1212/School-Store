import "server-only";

import type { requireAdmin } from "@/lib/auth";
import type { StaffStatus } from "@/lib/staff";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type Employee = {
  id: string;
  name: string;
  pin: string;
  badge: string | null;
  status: StaffStatus;
  self_signup: boolean;
  created_at: string;
};

export type ClassHour = { id: number; label: string; starts_at: string };

export type Balance = {
  staff_id: string;
  worked_minutes: number;
  week_minutes: number;
  discount_pct: number;
  earned_cents: number;
  adjust_cents: number;
  balance_cents: number;
  next_credit_minutes: number;
};

/** Every employee, A–Z. `missing` = database update 15 hasn't been run yet. */
export async function loadEmployees(supabase: Supabase) {
  const { data, error } = await supabase.from("staff").select("id, name, pin, badge, status, self_signup, created_at").order("name");
  return { employees: (data ?? []) as Employee[], missing: Boolean(error) };
}

/** 1st–7th hour: the class hours from Settings (used for room service too). */
export async function loadClassHours(supabase: Supabase) {
  const { data } = await supabase
    .from("pickup_windows")
    .select("id, label, starts_at, sort_order, kind")
    .eq("kind", "class")
    .order("starts_at")
    .order("sort_order");
  return (data ?? []).map((w) => ({ id: w.id, label: w.label, starts_at: String(w.starts_at).slice(0, 5) })) as ClassHour[];
}

/** Store credit per employee, by id. */
export async function loadBalances(supabase: Supabase) {
  const { data } = await supabase.rpc("staff_credit_balances");
  return new Map(((data ?? []) as Balance[]).map((b) => [b.staff_id, b]));
}

/** The weekly discount/credit rule and the sign-up setting, from Settings. */
export async function loadCreditRate(supabase: Supabase) {
  // The weekly credit cap is from database update 22 ($10 until it's run).
  const { data: cap } = await supabase.from("settings").select("staff_credit_week_cap_cents").eq("id", 1).maybeSingle();
  const { data } = await supabase
    .from("settings")
    .select("staff_discount_pct_per_hour, staff_credit_after_hours, staff_credit_cents_per_hour, staff_signup_approval")
    .eq("id", 1)
    .maybeSingle();
  return {
    rule: {
      pct: data?.staff_discount_pct_per_hour ?? 10,
      afterHours: data?.staff_credit_after_hours ?? 5,
      cents: data?.staff_credit_cents_per_hour ?? 100,
      capCents: cap?.staff_credit_week_cap_cents ?? 1000,
    },
    signupApproval: data?.staff_signup_approval ?? true,
  };
}

/** "2026-11-06" in Arizona → the exact moment that day starts. */
export function dayStart(isoDate: string) {
  return new Date(`${isoDate}T00:00:00-07:00`).toISOString();
}
