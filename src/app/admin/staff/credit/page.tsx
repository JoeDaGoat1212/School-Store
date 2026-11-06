import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { creditRuleText } from "@/lib/staff";
import { loadBalances, loadCreditRate, loadEmployees } from "../data";
import { StaffTabs } from "../staff-tabs";
import { UpdateNeeded } from "../update-needed";
import { CreditBoard } from "./credit-board";

export const metadata: Metadata = { title: "Store credit" };

/**
 * Employees earn store credit for the time they work. Record what they spend
 * at the window here; the balance can't go below $0.
 */
export default async function StoreCreditPage() {
  const { supabase } = await requireAdmin();
  const [{ employees, missing }, balances, rate, entries] = await Promise.all([
    loadEmployees(supabase),
    loadBalances(supabase),
    loadCreditRate(supabase),
    supabase.from("staff_credit_entries").select("id, staff_id, amount_cents, note, created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  const names = new Map(employees.map((e) => [e.id, e.name]));

  return (
    <>
      <PageHeader
        title="Store credit"
        description={`Every employee earns ${creditRuleText(rate.cents, rate.minutes)}. Their hours from all shifts add up, so short shifts still count.`}
      />
      <StaffTabs pending={employees.filter((e) => e.status === "pending").length} />
      {missing ? (
        <UpdateNeeded />
      ) : (
        <CreditBoard
          rate={{ cents: rate.cents, minutes: rate.minutes }}
          people={employees
            .filter((e) => e.status !== "pending")
            .map((e) => {
              const b = balances.get(e.id);
              return {
                id: e.id,
                name: e.name,
                removed: e.status === "removed",
                workedMinutes: b?.worked_minutes ?? 0,
                earnedCents: b?.earned_cents ?? 0,
                adjustCents: b?.adjust_cents ?? 0,
                balanceCents: b?.balance_cents ?? 0,
                nextMinutes: b?.next_credit_minutes ?? rate.minutes,
              };
            })}
          history={(entries.data ?? []).map((h) => ({
            id: h.id,
            name: names.get(h.staff_id) ?? "Employee",
            cents: h.amount_cents,
            note: h.note,
            at: h.created_at,
          }))}
        />
      )}
    </>
  );
}
