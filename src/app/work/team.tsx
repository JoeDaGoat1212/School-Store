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

  return (
    <section aria-labelledby="tasks-title" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b px-5 py-3.5">
        <h2 id="tasks-title" className="text-base font-semibold">
          Today&apos;s tasks
        </h2>
        {tasks && tasks.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {done} of {tasks.length} done
          </span>
        )}
      </header>
      {error && <p className="px-5 pt-3 text-sm font-semibold text-destructive">{error}</p>}
      {tasks === null ? (
        <Loader2Icon className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
      ) : tasks.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No tasks today. Ask the manager if you&apos;re not sure what to do.</p>
      ) : (
        <ul className="divide-y">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => toggle(t)} aria-pressed={t.done} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-accent/50">
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-[6px] border-[1.5px] ${t.done ? "border-success bg-success text-white" : "border-input"}`}
                >
                  {t.done && <CheckIcon className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                  {t.details && <span className="block text-sm text-muted-foreground">{t.details}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {t.forEveryone ? "Whoever's working" : "Just you"}
                    {t.repeats ? `, ${t.repeats.charAt(0).toLowerCase()}${t.repeats.slice(1)}` : ""}
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
    <section aria-labelledby="absent-title" className="overflow-hidden rounded-xl border bg-card">
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
