import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { addDays, formatDay, startOfWeek, storeToday } from "@/lib/format";
import { dayStart, loadEmployees } from "../data";
import { StaffTabs } from "../staff-tabs";
import { LiveShifts } from "../live-shifts";
import { UpdateNeeded } from "../update-needed";
import { HoursTable } from "./hours-table";

export const metadata: Metadata = { title: "Timecards" };

const RANGES = { week: "This week", lastweek: "Last week", today: "Today", month: "This month", custom: "Pick dates" } as const;
type Range = keyof typeof RANGES;

/** Every shift worked: fix forgotten clock-outs, add missed shifts, download hours for payroll. */
export default async function TimecardsPage(props: PageProps<"/admin/staff/hours">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();
  const today = storeToday();
  const range: Range = typeof params.range === "string" && params.range in RANGES ? (params.range as Range) : "week";
  const who = typeof params.who === "string" ? params.who : "";
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  let from = startOfWeek(today);
  let to = addDays(from, 6);
  if (range === "lastweek") {
    from = addDays(startOfWeek(today), -7);
    to = addDays(from, 6);
  } else if (range === "today") {
    from = today;
    to = today;
  } else if (range === "month") {
    from = `${today.slice(0, 8)}01`;
    to = addDays(`${addDays(from, 32).slice(0, 8)}01`, -1);
  } else if (range === "custom") {
    from = isDate(params.from) ? params.from : today;
    to = isDate(params.to) && params.to >= from ? params.to : from;
  }

  // "*" so this page works before and after database update 16 (which adds where a punch came from).
  let shiftsQuery = supabase
    .from("staff_shifts")
    .select("*")
    .gte("clock_in", dayStart(from))
    .lt("clock_in", dayStart(addDays(to, 1)))
    .order("clock_in", { ascending: false })
    .limit(1000);
  if (who) shiftsQuery = shiftsQuery.eq("staff_id", who);

  const [{ employees, missing }, shifts, open] = await Promise.all([
    loadEmployees(supabase),
    shiftsQuery,
    supabase.from("staff_shifts").select("*").is("clock_out", null).order("clock_in"),
  ]);
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const toRow = (s: {
    id: string;
    staff_id: string | null;
    staff_name: string;
    clock_in: string;
    clock_out: string | null;
    manual: boolean;
    source?: string | null;
    out_source?: string | null;
  }) => ({
    id: s.id,
    staffId: s.staff_id,
    name: (s.staff_id && names.get(s.staff_id)) || s.staff_name,
    clockIn: s.clock_in,
    clockOut: s.clock_out,
    manual: s.manual,
    phone: s.source === "phone" || s.out_source === "phone",
  });
  const pending = employees.filter((e) => e.status === "pending").length;
  const period = from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;

  return (
    <>
      <PageHeader title="Timecards" description="Every shift from the time clock. Fix a forgotten clock-out, add a missed shift, or download the hours." />
      <StaffTabs pending={pending} />

      {missing ? (
        <UpdateNeeded />
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <LiveShifts label="Live: updates when anyone clocks in or out" />
          </div>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4 shadow-soft">
            <label className="grid gap-1 text-sm font-semibold">
              Period
              <select name="range" defaultValue={range} className="h-9 rounded-lg border bg-background px-2 text-sm">
                {Object.entries(RANGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              From <span className="sr-only">(for Pick dates)</span>
              <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border bg-background px-2 text-sm" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              To
              <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border bg-background px-2 text-sm" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Employee
              <select name="who" defaultValue={who} className="h-9 rounded-lg border bg-background px-2 text-sm">
                <option value="">Everyone</option>
                {employees
                  .filter((e) => e.status !== "pending")
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.status === "removed" ? " (removed)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <Button type="submit" size="lg">
              Show
            </Button>
            <p className="w-full text-xs text-muted-foreground">From and To are used when the period is “Pick dates”.</p>
          </form>

          <HoursTable
            key={`${from}-${to}-${who}`}
            period={period}
            fileName={`timecards-${from}${from === to ? "" : `-to-${to}`}.csv`}
            now={new Date().getTime()}
            shifts={(shifts.data ?? []).map(toRow)}
            open={(open.data ?? []).map(toRow)}
            employees={employees.filter((e) => e.status === "active").map((e) => ({ id: e.id, name: e.name }))}
            defaultDate={to < today ? to : today}
          />
        </>
      )}
    </>
  );
}
