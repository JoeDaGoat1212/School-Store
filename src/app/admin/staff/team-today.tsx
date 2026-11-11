import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { requireAdmin } from "@/lib/auth";
import { formatCents, formatClock, formatTime } from "@/lib/format";
import { formatMinutes, minutesBetween } from "@/lib/staff";
import { Avatar } from "@/components/staff/avatar";
import { ClockOutButton } from "./clock-out-button";
import { LiveShifts } from "./live-shifts";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type TeamToday = {
  /** False until database update 15 has been run. */
  ready: boolean;
  pending: number;
  onClock: { id: string; name: string; in: string }[];
  scheduled: { label: string; startsAt: string; names: string[] }[];
  /** Names of people clocked in right now, to mark them on the schedule. */
  onNames: string[];
  now: number;
  /** Numbers that tie the time clock to the rest of the dashboard. */
  totals: { todayMinutes: number; weekMinutes: number; creditCents: number; discounted: number };
};

/** For the dashboard: who's on the clock and who's on today's schedule. */
export async function loadTeamToday(supabase: Supabase, today: string): Promise<TeamToday> {
  const now = new Date().getTime();
  const [staff, open, schedule, hours, todayShifts, balances] = await Promise.all([
    supabase.from("staff").select("id, name, status"),
    supabase.from("staff_shifts").select("id, staff_id, staff_name, clock_in").is("clock_out", null).order("clock_in"),
    supabase.from("staff_schedule").select("staff_id, window_id").eq("work_date", today),
    supabase.from("pickup_windows").select("id, label, starts_at").eq("kind", "class"),
    supabase.from("staff_shifts").select("clock_in, clock_out").gte("clock_in", new Date(`${today}T00:00:00-07:00`).toISOString()),
    supabase.rpc("staff_credit_balances"),
  ]);
  const empty = { todayMinutes: 0, weekMinutes: 0, creditCents: 0, discounted: 0 };
  if (staff.error) return { ready: false, pending: 0, onClock: [], scheduled: [], onNames: [], now, totals: empty };
  const b = (balances.data ?? []) as { week_minutes?: number; balance_cents: number; discount_pct?: number }[];
  const totals = {
    todayMinutes: (todayShifts.data ?? []).reduce((t, sh) => t + minutesBetween(sh.clock_in, sh.clock_out, now), 0),
    weekMinutes: b.reduce((t, x) => t + (x.week_minutes ?? 0), 0),
    creditCents: b.reduce((t, x) => t + Math.max(0, x.balance_cents), 0),
    discounted: (open.data ?? []).length, // shown as "On the clock"
  };

  const people = new Map((staff.data ?? []).map((s) => [s.id, s]));
  const byHour = new Map<number, { label: string; startsAt: string; names: string[] }>();
  for (const h of hours.data ?? []) byHour.set(h.id, { label: h.label, startsAt: String(h.starts_at).slice(0, 5), names: [] });
  for (const s of schedule.data ?? []) {
    const person = people.get(s.staff_id);
    if (person?.status === "active") byHour.get(s.window_id)?.names.push(person.name);
  }

  const onClock = (open.data ?? []).map((o) => ({ id: o.id, name: (o.staff_id && people.get(o.staff_id)?.name) || o.staff_name, in: o.clock_in }));
  return {
    ready: true,
    totals,
    onNames: onClock.map((o) => o.name),
    now,
    pending: (staff.data ?? []).filter((s) => s.status === "pending").length,
    onClock,
    scheduled: [...byHour.values()]
      .filter((h) => h.names.length > 0)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((h) => ({ ...h, names: h.names.sort((a, b) => a.localeCompare(b)) })),
  };
}

/** The "Team today" card on the dashboard. */
export function TeamToday({ team }: { team: TeamToday }) {
  return (
    <section aria-labelledby="team-title" className="mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <h2 id="team-title" className="flex items-center gap-3 font-heading text-base font-semibold">
          Team today <LiveShifts />
        </h2>
        <Link href="/admin/staff" className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          Schedule <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        {[
          { label: "Worked today", value: formatMinutes(team.totals.todayMinutes), href: "/admin/staff/hours?range=today" },
          { label: "Team this week", value: formatMinutes(team.totals.weekMinutes), href: "/admin/staff/hours" },
          { label: "Unspent credit", value: formatCents(team.totals.creditCents), href: "/admin/staff/credit" },
          { label: "On the clock", value: `${team.totals.discounted} ${team.totals.discounted === 1 ? "person" : "people"}`, href: "/admin/staff" },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="border-l px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none sm:px-5 [&:nth-child(odd)]:border-l-0 sm:[&:nth-child(odd)]:border-l sm:first:border-l-0 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0"
          >
            <span className="block text-xs text-muted-foreground">{t.label}</span>
            <span className="score mt-1.5 block text-3xl">{t.value}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">On the clock now</p>
          {team.onClock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody right now.</p>
          ) : (
            <ul className="grid gap-1.5">
              {team.onClock.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={p.name} size={30} ring="on" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="text-muted-foreground">
                    since {formatTime(p.in)} · {formatMinutes(minutesBetween(p.in, null, team.now))}
                  </span>
                  <ClockOutButton shiftId={p.id} name={p.name} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Scheduled today. Green means clocked in.</p>
          {team.scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is scheduled today.{" "}
              <Link href="/admin/staff" className="font-medium text-foreground underline underline-offset-4">
                Make a schedule
              </Link>
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {team.scheduled.map((h) => (
                <li key={h.label} className="flex items-baseline gap-3 text-sm">
                  <span className="w-20 shrink-0 font-semibold">{h.label}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{formatClock(h.startsAt)}</span>
                  <span className="min-w-0 flex-1">
                    {h.names.map((n, i) => (
                      <span key={n}>
                        {i > 0 && ", "}
                        <span className={team.onNames.includes(n) ? "font-semibold text-success" : undefined} title={team.onNames.includes(n) ? "On the clock now" : undefined}>
                          {n}
                        </span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
