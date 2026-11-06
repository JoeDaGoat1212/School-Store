import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { requireAdmin } from "@/lib/auth";
import { formatClock, formatTime } from "@/lib/format";
import { formatMinutes, minutesBetween } from "@/lib/staff";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type TeamToday = {
  /** False until database update 15 has been run. */
  ready: boolean;
  pending: number;
  onClock: { name: string; in: string }[];
  scheduled: { label: string; startsAt: string; names: string[] }[];
  now: number;
};

/** For the dashboard: who's on the clock and who's on today's schedule. */
export async function loadTeamToday(supabase: Supabase, today: string): Promise<TeamToday> {
  const now = new Date().getTime();
  const [staff, open, schedule, hours] = await Promise.all([
    supabase.from("staff").select("id, name, status"),
    supabase.from("staff_shifts").select("staff_id, staff_name, clock_in").is("clock_out", null).order("clock_in"),
    supabase.from("staff_schedule").select("staff_id, window_id").eq("work_date", today),
    supabase.from("pickup_windows").select("id, label, starts_at").eq("kind", "class"),
  ]);
  if (staff.error) return { ready: false, pending: 0, onClock: [], scheduled: [], now };

  const people = new Map((staff.data ?? []).map((s) => [s.id, s]));
  const byHour = new Map<number, { label: string; startsAt: string; names: string[] }>();
  for (const h of hours.data ?? []) byHour.set(h.id, { label: h.label, startsAt: String(h.starts_at).slice(0, 5), names: [] });
  for (const s of schedule.data ?? []) {
    const person = people.get(s.staff_id);
    if (person?.status === "active") byHour.get(s.window_id)?.names.push(person.name);
  }

  return {
    ready: true,
    now,
    pending: (staff.data ?? []).filter((s) => s.status === "pending").length,
    onClock: (open.data ?? []).map((o) => ({ name: (o.staff_id && people.get(o.staff_id)?.name) || o.staff_name, in: o.clock_in })),
    scheduled: [...byHour.values()]
      .filter((h) => h.names.length > 0)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((h) => ({ ...h, names: h.names.sort((a, b) => a.localeCompare(b)) })),
  };
}

/** The "Team today" card on the dashboard. */
export function TeamToday({ team }: { team: TeamToday }) {
  return (
    <section aria-labelledby="team-title" className="mt-6 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="team-title" className="font-heading text-lg font-bold">
          Team today
        </h2>
        <Link href="/admin/staff" className="flex items-center gap-1 text-sm font-semibold text-ember-ink hover:underline">
          Schedule <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">On the clock now</p>
          {team.onClock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody right now.</p>
          ) : (
            <ul className="grid gap-1.5">
              {team.onClock.map((p) => (
                <li key={`${p.name}-${p.in}`} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="size-2 rounded-full bg-success" />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-muted-foreground">
                    since {formatTime(p.in)} · {formatMinutes(minutesBetween(p.in, null, team.now))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Scheduled today</p>
          {team.scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is scheduled today.{" "}
              <Link href="/admin/staff" className="font-semibold text-ember-ink underline-offset-4 hover:underline">
                Make a schedule
              </Link>
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {team.scheduled.map((h) => (
                <li key={h.label} className="flex items-baseline gap-3 text-sm">
                  <span className="w-20 shrink-0 font-semibold">{h.label}</span>
                  <span className="w-16 shrink-0 font-receipt text-xs text-muted-foreground">{formatClock(h.startsAt)}</span>
                  <span className="min-w-0 flex-1">{h.names.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
