import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { addDays, formatDay, startOfWeek, storeToday } from "@/lib/format";
import { loadClassHours, loadEmployees } from "./data";
import { ScheduleBoard } from "./schedule-board";
import { StaffTabs } from "./staff-tabs";
import { UpdateNeeded } from "./update-needed";

export const metadata: Metadata = { title: "Schedule" };

/**
 * Who works which class hour (1st–7th hour) each school day. The time clock
 * shows the upcoming shifts, and employees see their next one when they punch.
 */
export default async function SchedulePage(props: PageProps<"/admin/staff">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();
  const today = storeToday();
  const requested = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const monday = startOfWeek(requested);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));

  const [{ employees, missing }, hours, schedule, closed] = await Promise.all([
    loadEmployees(supabase),
    loadClassHours(supabase),
    supabase.from("staff_schedule").select("id, staff_id, work_date, window_id").gte("work_date", days[0]).lte("work_date", days[4]),
    supabase.from("closed_dates").select("closed_on, reason").gte("closed_on", days[0]).lte("closed_on", days[4]),
  ]);
  const pending = employees.filter((e) => e.status === "pending").length;
  const active = employees.filter((e) => e.status === "active");
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const entries = (schedule.data ?? [])
    .filter((s) => names.has(s.staff_id))
    .map((s) => ({ id: s.id, staffId: s.staff_id, date: s.work_date, windowId: s.window_id, name: names.get(s.staff_id) ?? "" }));

  const weekLabel = `${formatDay(days[0], { weekday: undefined })} – ${formatDay(days[4], { weekday: undefined })}`;

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Put employees on a class hour. The time clock shows who's coming up, and each person sees their next shift when they clock in or out."
      />
      <StaffTabs pending={pending} />

      {missing ? (
        <UpdateNeeded />
      ) : active.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No employees yet"
          action={
            <Button asChild>
              <Link href="/admin/staff/people">Add employees</Link>
            </Button>
          }
        >
          Add them on the Employees tab, or have them tap <strong>Create account</strong> on the time clock.
        </EmptyState>
      ) : hours.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No class hours set up">
          Add 1st–7th hour in <Link href="/admin/settings#class" className="font-semibold underline underline-offset-4">Settings → Class hours</Link>.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="icon-lg" aria-label="Last week">
              <Link href={`/admin/staff?week=${addDays(monday, -7)}`}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <p className="min-w-44 text-center font-heading text-lg font-bold">{weekLabel}</p>
            <Button asChild variant="outline" size="icon-lg" aria-label="Next week">
              <Link href={`/admin/staff?week=${addDays(monday, 7)}`}>
                <ChevronRightIcon />
              </Link>
            </Button>
            {monday !== startOfWeek(today) && (
              <Button asChild variant="ghost" size="lg">
                <Link href="/admin/staff">This week</Link>
              </Button>
            )}
          </div>
          <ScheduleBoard
            days={days}
            today={today}
            hours={hours}
            entries={entries}
            employees={active.map((e) => ({ id: e.id, name: e.name }))}
            closed={Object.fromEntries((closed.data ?? []).map((c) => [c.closed_on, c.reason ?? "Closed"]))}
            monday={monday}
          />
        </>
      )}
    </>
  );
}
