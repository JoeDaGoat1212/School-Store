import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { startOfWeek, storeToday } from "@/lib/format";
import { minutesBetween } from "@/lib/staff";
import { dayStart, loadBalances, loadCreditRate, loadEmployees } from "../data";
import { StaffTabs } from "../staff-tabs";
import { UpdateNeeded } from "../update-needed";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = { title: "Employees" };

/** Who works at the store: approve sign-ups, add people, change PINs, remove and erase. */
export default async function EmployeesPage() {
  const { supabase } = await requireAdmin();
  const now = new Date().getTime();
  const [{ employees, missing }, balances, rate, week, open] = await Promise.all([
    loadEmployees(supabase),
    loadBalances(supabase),
    loadCreditRate(supabase),
    supabase.from("staff_shifts").select("staff_id, clock_in, clock_out").gte("clock_in", dayStart(startOfWeek(storeToday()))),
    supabase.from("staff_shifts").select("staff_id").is("clock_out", null),
  ]);

  const weekMinutes = new Map<string, number>();
  for (const s of week.data ?? []) {
    if (!s.staff_id) continue;
    weekMinutes.set(s.staff_id, (weekMinutes.get(s.staff_id) ?? 0) + minutesBetween(s.clock_in, s.clock_out, now));
  }
  const onClock = new Set((open.data ?? []).map((s) => s.staff_id));

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who can use the time clock. New people can tap Create account on the time clock, or you can add them here."
      />
      <StaffTabs pending={employees.filter((e) => e.status === "pending").length} />
      {missing ? (
        <UpdateNeeded />
      ) : (
        <EmployeeList
          signupApproval={rate.signupApproval}
          employees={employees.map((e) => ({
            ...e,
            weekMinutes: weekMinutes.get(e.id) ?? 0,
            creditCents: balances.get(e.id)?.balance_cents ?? 0,
            discountPct: balances.get(e.id)?.discount_pct ?? 0,
            onClock: onClock.has(e.id),
          }))}
        />
      )}
    </>
  );
}
