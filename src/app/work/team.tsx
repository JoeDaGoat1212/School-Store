"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, Loader2Icon, UserXIcon } from "lucide-react";
import { MessagesView, type MessagesActions } from "@/components/staff/messages-view";
import { NotificationsToggle } from "@/components/staff/notifications-toggle";
import { formatClock, relativeDay, storeToday } from "@/lib/format";
import type { PortalData } from "@/lib/staff";
import {
  workAbsences,
  workAbsent,
  workCancelAbsent,
  workDirect,
  workGroup,
  workLeave,
  workPushKey,
  workRemovePush,
  workSavePush,
  workSend,
  workTaskDone,
  workTasks,
  workThread,
  workThreads,
} from "./team-actions";

/* The employee web app's Messages, Tasks and absences (database update 20). */

const messageActions: MessagesActions = {
  list: workThreads,
  open: workThread,
  send: workSend,
  direct: workDirect,
  group: workGroup,
  leave: workLeave,
};

export function WorkMessages({ initialChat }: { initialChat?: string | null }) {
  return <MessagesView actions={messageActions} initialChat={initialChat} />;
}

/* ---------------------------------------------------------------- tasks */

type Task = { id: string; title: string; details: string | null; forEveryone: boolean; repeats: string | null; done: boolean; doneBy: string[] };

export function WorkTasks() {
  const today = storeToday();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await workTasks(today);
    if ("error" in r && r.error) setError(r.error);
    else setTasks(("tasks" in r && r.tasks) || []);
  }, [today]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = async (t: Task) => {
    setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) ?? null);
    try {
      navigator.vibrate?.(20);
    } catch {
      // not supported
    }
    const r = await workTaskDone(t.id, today, !t.done);
    if ("error" in r) {
      setError(r.error ?? null);
      void load();
    }
  };

  const done = tasks?.filter((t) => t.done).length ?? 0;
  const total = tasks?.length ?? 0;
  const allDone = total > 0 && done === total;

  return (
    <section aria-labelledby="tasks-title" className="grid gap-3">
      {/* Scoreboard: how many done today */}
      <div className={`rounded-3xl p-5 ring-1 ${allDone ? "bg-[#0f2a28] ring-[color-mix(in_oklab,var(--nest)_35%,transparent)]" : "bg-card ring-border"}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="tasks-title" className="text-sm font-medium text-muted-foreground">
              Today&apos;s tasks
            </h2>
            <p className="mt-1 font-heading text-6xl leading-none font-bold tabular-nums">
              <span className={allDone ? "text-[var(--nest)]" : ""}>{done}</span>
              <span className="text-muted-foreground">/{total}</span>
            </p>
          </div>
          <p className={`pb-1 text-right text-sm font-semibold ${allDone ? "text-[var(--nest)]" : "text-muted-foreground"}`}>
            {tasks === null ? "" : total === 0 ? "Nothing today" : allDone ? "All done. Nice work." : `${total - done} to go`}
          </p>
        </div>
        {total > 0 && (
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {tasks!.map((t) => (
              <span key={t.id} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${t.done ? "bg-[var(--nest)]" : "bg-white/10"}`} />
            ))}
          </div>
        )}
      </div>

      {error && <p className="px-1 text-sm font-semibold text-destructive">{error}</p>}
      {tasks === null ? (
        <Loader2Icon className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
      ) : total === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-8 text-center text-sm text-muted-foreground ring-1 ring-border">No tasks today. Ask the manager if you&apos;re not sure what to do.</p>
      ) : (
        <ul className="grid gap-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t)}
                aria-pressed={t.done}
                className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left ring-1 transition-colors ${t.done ? "bg-card/60 ring-border/60" : "bg-card ring-border hover:ring-white/20"}`}
              >
                <span
                  aria-hidden
                  key={String(t.done)}
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${t.done ? "check-pop bg-[var(--nest)] text-black" : "ring-2 ring-white/20"}`}
                >
                  {t.done && <CheckIcon className="size-5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[1.0625rem] font-semibold ${t.done ? "text-muted-foreground line-through decoration-2" : ""}`}>{t.title}</span>
                  {t.details && <span className="block text-sm text-muted-foreground">{t.details}</span>}
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${t.forEveryone ? "bg-white/[0.06] text-muted-foreground" : "bg-[var(--brand)]/15 text-ember-ink"}`}>
                      {t.forEveryone ? "Whoever's working" : "Just you"}
                    </span>
                    {t.repeats && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">{t.repeats}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- absences */

type Absence = { id: string; date: string; windowId: number | null; label: string; reason: string | null };

/** Each upcoming shift with "Can't make it", and the absences already sent. */
export function WorkAbsences({ schedule }: { schedule: PortalData["schedule"] }) {
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await workAbsences();
    if ("absences" in r) setAbsences(r.absences);
    else setError(r.error ?? null);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const key = (s: { date: string; label: string }) => `${s.date}|${s.label}`;
  const absentFor = (s: { date: string; label: string }) => absences?.find((a) => a.date === s.date && (a.windowId === null || a.label === s.label));

  const send = async (s: { date: string; label: string }) => {
    setBusy(true);
    const r = await workAbsent(s.date, s.label, reason);
    setBusy(false);
    if ("error" in r) return setError(r.error ?? null);
    setAsking(null);
    setReason("");
    void load();
  };
  const cancel = async (id: string) => {
    setBusy(true);
    await workCancelAbsent(id);
    setBusy(false);
    void load();
  };

  if (schedule.length === 0) return null;
  return (
    <section aria-labelledby="absent-title" className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <header className="border-b px-5 py-3.5">
        <h2 id="absent-title" className="text-base font-semibold">
          Can&apos;t make a shift?
        </h2>
        <p className="text-sm text-muted-foreground">Let the manager know as early as you can.</p>
      </header>
      {error && <p className="px-5 pt-3 text-sm font-semibold text-destructive">{error}</p>}
      <ul className="divide-y">
        {schedule.map((s) => {
          const a = absentFor(s);
          const open = asking === key(s);
          return (
            <li key={key(s)} className="px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${a ? "text-muted-foreground line-through" : ""}`}>
                    {relativeDay(s.date)}, {s.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{a ? `You said you can't make it${a.reason ? `: ${a.reason}` : ""}` : formatClock(s.startsAt)}</span>
                </span>
                {a ? (
                  <button type="button" disabled={busy} onClick={() => cancel(a.id)} className="h-9 rounded-md border px-3 text-sm font-medium">
                    I can make it
                  </button>
                ) : (
                  !open && (
                    <button type="button" onClick={() => setAsking(key(s))} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium">
                      <UserXIcon className="size-4" /> Can&apos;t make it
                    </button>
                  )
                )}
              </div>
              {open && !a && (
                <div className="mt-3 grid gap-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    placeholder="Why? (optional) Like: dentist appointment"
                    className="h-11 rounded-md border bg-background px-3 text-base"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => send(s)} className="h-10 flex-1 rounded-md bg-foreground text-sm font-semibold text-background">
                      {busy ? <Loader2Icon className="mx-auto size-4 animate-spin" /> : "Tell the manager"}
                    </button>
                    <button type="button" onClick={() => setAsking(null)} className="h-10 rounded-md px-4 text-sm text-muted-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- notifications */

export function WorkNotifications() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void workPushKey().then((k) => live && setKey(k));
    return () => {
      live = false;
    };
  }, []);
  return <NotificationsToggle vapidKey={key} save={workSavePush} remove={workRemovePush} compact />;
}
