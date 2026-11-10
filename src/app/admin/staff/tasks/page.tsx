import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { addDays, formatDay, startOfWeek, storeToday } from "@/lib/format";
import { tasksForDay } from "@/lib/team";
import { StaffTabs } from "../staff-tabs";
import { TaskEditor } from "./task-editor";

export const metadata: Metadata = { title: "Tasks" };

/**
 * What employees should do each day. A task can be for one day, every week on
 * that weekday, or every day; for whoever's working or one person. Employees
 * see today's list in the app and check things off.
 */
export default async function TasksPage(props: PageProps<"/admin/staff/tasks">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();
  const today = storeToday();
  const day = typeof params.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;
  const monday = startOfWeek(day);
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));

  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const [raw, done, staff] = await Promise.all([
    supabase
      .from("staff_tasks")
      .select("id, title, details, task_date, weekday, staff_id")
      .or(`task_date.eq.${day},weekday.eq.${weekday},and(task_date.is.null,weekday.is.null)`)
      .order("sort")
      .order("created_at"),
    tasksForDay(day, null),
    supabase.from("staff").select("id, name").eq("status", "active").order("name"),
  ]);
  const doneBy = new Map((done.tasks ?? []).map((t) => [t.id, t.doneBy]));
  const tasks = (raw.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    details: t.details ?? "",
    repeat: (t.task_date ? "once" : t.weekday !== null ? "weekly" : "daily") as "once" | "weekly" | "daily",
    staffId: t.staff_id ?? "",
    doneBy: doneBy.get(t.id) ?? [],
  }));

  return (
    <>
      <PageHeader title="Tasks" description="Set what needs doing each day. Employees see today's tasks in the app and check them off as they go." />
      <StaffTabs />

      <nav aria-label="Pick a day" className="mb-6 flex flex-wrap items-center gap-1.5">
        <Link href={`/admin/staff/tasks?day=${addDays(monday, -7)}`} className="h-9 rounded-md px-3 text-sm leading-9 text-muted-foreground hover:bg-accent">
          Last week
        </Link>
        {week.map((d) => (
          <Link
            key={d}
            href={`/admin/staff/tasks?day=${d}`}
            aria-current={d === day ? "page" : undefined}
            className={`grid h-14 w-16 place-items-center content-center rounded-md border text-center ${d === day ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent"}`}
          >
            <span className="text-xs">{d === today ? "Today" : formatDay(d, { month: undefined, day: undefined })}</span>
            <span className="score text-xl">{Number(d.slice(8))}</span>
          </Link>
        ))}
        <Link href={`/admin/staff/tasks?day=${addDays(monday, 7)}`} className="h-9 rounded-md px-3 text-sm leading-9 text-muted-foreground hover:bg-accent">
          Next week
        </Link>
      </nav>

      {raw.error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          Tasks need database update 20. Run <code>supabase/sql-editor/20261110000020_team_tools.sql</code> in Supabase → SQL Editor.
        </p>
      ) : (
        <TaskEditor key={day} day={day} dayLabel={formatDay(day, { weekday: "long" })} tasks={tasks} staff={staff.data ?? []} />
      )}
    </>
  );
}
