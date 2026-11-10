"use client";

import { useTransition } from "react";
import { HistoryIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/staff/avatar";
import { Button } from "@/components/ui/button";
import { addDays, formatClock, formatDay } from "@/lib/format";
import { addToSchedule, copyWeek, removeFromSchedule } from "./actions";

type Entry = { id: string; staffId: string; date: string; windowId: number; name: string; /** They said they can't make it (the reason, or "") */ absent?: string | null };

/**
 * The week as a grid: class hours down the side, school days across the top.
 * Each square lists who's working; pick a name from "Add…" to put someone on.
 */
export function ScheduleBoard({
  days,
  today,
  hours,
  entries,
  employees,
  closed,
  monday,
}: {
  days: string[];
  today: string;
  hours: { id: number; label: string; starts_at: string }[];
  entries: Entry[];
  employees: { id: string; name: string }[];
  closed: Record<string, string>;
  monday: string;
}) {
  const [busy, start] = useTransition();

  const run = (job: () => Promise<{ ok?: true; error?: string }>, message?: string) =>
    start(async () => {
      const r = await job();
      if (r.error) toast.error(r.error);
      else if (message) toast.success(message);
    });

  const cell = (date: string, windowId: number) => entries.filter((e) => e.date === date && e.windowId === windowId).sort((a, b) => a.name.localeCompare(b.name));

  // How many class hours each person has this week.
  const perPerson = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    const p = perPerson.get(e.staffId) ?? { name: e.name, count: 0 };
    p.count += 1;
    perPerson.set(e.staffId, p);
  }

  return (
    <div className="grid gap-6">
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-28 border-b p-3 text-left text-xs font-medium text-muted-foreground">Hour</th>
              {days.map((d) => (
                <th key={d} className={`border-b border-l p-3 text-left ${d === today ? "bg-primary/10" : ""}`}>
                  <span className="block font-heading text-base font-bold">{formatDay(d, { weekday: "long", month: undefined, day: undefined })}</span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDay(d, { weekday: undefined })}
                    {d === today && " · today"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h.id}>
                <th scope="row" className="border-b p-3 text-left align-top">
                  <span className="block font-semibold">{h.label}</span>
                  <span className="font-receipt text-xs text-muted-foreground">{formatClock(h.starts_at)}</span>
                </th>
                {days.map((d) => {
                  const people = cell(d, h.id);
                  const free = employees.filter((e) => !people.some((p) => p.staffId === e.id));
                  const isClosed = closed[d];
                  return (
                    <td key={d} className={`border-b border-l p-2 align-top ${d === today ? "bg-primary/5" : ""} ${isClosed ? "bg-muted/60" : ""}`}>
                      {isClosed && h.id === hours[0].id && <p className="mb-1 text-xs font-semibold text-muted-foreground">Closed: {isClosed}</p>}
                      <ul className="mb-1.5 grid gap-1">
                        {people.map((p) => (
                          <li
                            key={p.id}
                            title={p.absent != null ? `Can't make it${p.absent ? `: ${p.absent}` : ""}` : undefined}
                            className={`flex items-center justify-between gap-1.5 rounded-full border py-0.5 pr-0.5 pl-0.5 font-medium shadow-xs ${p.absent != null ? "border-destructive/40 bg-destructive/5" : "bg-background"}`}
                          >
                            <Avatar name={p.name} size={24} />
                            <span className={`min-w-0 flex-1 truncate ${p.absent != null ? "text-muted-foreground line-through" : ""}`}>{p.name}</span>
                            {p.absent != null && <span className="shrink-0 text-[0.7rem] font-semibold text-destructive">Out</span>}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => run(() => removeFromSchedule(p.id))}
                              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                              aria-label={`Take ${p.name} off ${h.label}, ${formatDay(d)}`}
                            >
                              <XIcon className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {free.length > 0 && (
                        <select
                          aria-label={`Add someone to ${h.label}, ${formatDay(d)}`}
                          disabled={busy}
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id) run(() => addToSchedule(id, d, h.id));
                          }}
                          className="h-8 w-full rounded-lg border border-dashed bg-transparent px-2 text-xs text-muted-foreground hover:border-solid hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <option value="">＋ Add…</option>
                          {free.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <section aria-labelledby="week-people" className="min-w-0 flex-1">
          <h2 id="week-people" className="mb-2 font-heading text-lg font-bold">
            This week
          </h2>
          {perPerson.size === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is on the schedule this week yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {[...perPerson.values()]
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                .map((p) => (
                  <li key={p.name} className="rounded-full border bg-card px-3 py-1 text-sm">
                    <span className="font-semibold">{p.name}</span> · {p.count} hour{p.count === 1 ? "" : "s"}
                  </li>
                ))}
            </ul>
          )}
        </section>
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await copyWeek(addDays(monday, -7), monday);
              if (r.error) toast.error(r.error);
              else toast.success(`Copied last week (${r.copied} shift${r.copied === 1 ? "" : "s"})`);
            })
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <HistoryIcon />} Copy last week into this week
        </Button>
      </div>
    </div>
  );
}
