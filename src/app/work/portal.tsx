"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClockOffIcon,
  CalendarClockIcon,
  ListChecksIcon,
  MessageCircleIcon,
  HomeIcon,
  Loader2Icon,
  LogOutIcon,
  type LucideIcon,
  SmartphoneIcon,
  TimerIcon,
  WalletIcon,
} from "lucide-react";
import { Avatar } from "@/components/staff/avatar";
import { formatCents, formatClock, formatDay, formatTime, relativeDay, STORE_TIMEZONE, storeToday } from "@/lib/format";
import { autoOutAt, creditRuleText, formatMinutes, minutesBetween, nextReward, type PortalData, shortMoney } from "@/lib/staff";
import { type RestockSession, RestockWalkthrough } from "@/components/staff/restock-walkthrough";
import { restockBegin } from "../clock/restock-actions";
import { loadPortal, phonePunch, phoneUndo, signOut } from "./actions";
import { WorkAbsences, WorkMessages, WorkNotifications, WorkTasks } from "./team";

type Note = { tone: "in" | "out" | "auto" | "error"; text: string; undo?: { id: string; token: string } };
export type Tab = "today" | "tasks" | "messages" | "schedule" | "money";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: HomeIcon },
  { id: "tasks", label: "Tasks", icon: ListChecksIcon },
  { id: "messages", label: "Chat", icon: MessageCircleIcon },
  { id: "schedule", label: "Schedule", icon: CalendarClockIcon },
  { id: "money", label: "Credit", icon: WalletIcon },
];

/** One employee's own app: clock in/out, live shift ring, discount pass, credit, schedule. */
export function Portal({ initial, initialTab = "today", initialChat = null }: { initial: PortalData; initialTab?: Tab; initialChat?: string | null }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [restock, setRestock] = useState<RestockSession | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => new Date().getTime());
  const [now, setNow] = useState(() => new Date().getTime());
  const [note, setNote] = useState<Note | null>(null);
  const [busy, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await loadPortal();
    if (r.data) {
      setData(r.data);
      setLoadedAt(Date.now());
    } else if (!r.error) router.refresh(); // signed out somewhere else (new PIN, removed)
  }, [router]);

  // Tick every second while on the clock (the timer), every 30 s otherwise; reload every 30 s.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), data.open ? 1000 : 30_000);
    return () => clearInterval(tick);
  }, [data.open]);
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const back = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", back);
    };
  }, [refresh]);

  // The shift ended on its own while the app was open: reload to show it.
  const autoOut = data.open ? autoOutAt(data.open.in, data.maxShiftMinutes) : null;
  useEffect(() => {
    if (!autoOut) return;
    const wait = new Date(autoOut).getTime() - Date.now() + 1500;
    const t = setTimeout(() => void refresh(), Math.max(1000, wait));
    return () => clearTimeout(t);
  }, [autoOut, refresh]);

  // This week's minutes keep counting up while they're on the clock.
  const live = data.open ? Math.max(0, Math.floor((now - loadedAt) / 60000)) : 0;
  const weekMinutes = data.weekMinutes + live;
  const rule = data.rule;
  const hours = Math.floor(weekMinutes / 60);
  const discount = Math.min(hours, rule.afterHours) * rule.pct;
  const hoursPast = Math.max(0, hours - rule.afterHours);
  const intoHour = weekMinutes % 60;

  const punch = () =>
    start(async () => {
      const r = await phonePunch();
      if ("error" in r) {
        setNote({ tone: "error", text: r.error });
        if (r.code === "SIGNED_OUT") router.refresh();
        return;
      }
      if (r.status === "pending") return;
      if (r.status === "auto") {
        setNote({
          tone: "auto",
          text: `You were already clocked out automatically at ${formatTime(r.out)} (after ${formatMinutes(minutesBetween(r.in, r.out))}). Tap Clock in to start a new shift.`,
        });
      } else {
        setNote({
          tone: r.status,
          text:
            r.status === "in"
              ? `Clocked in at ${formatTime(r.in)}.${r.autoOutAt ? ` You'll be clocked out automatically at ${formatTime(r.autoOutAt)}.` : ""}`
              : `Clocked out. You worked ${formatMinutes(minutesBetween(r.in, r.out))} (${formatTime(r.in)} – ${formatTime(r.out ?? r.in)}).`,
          undo: { id: r.id, token: r.undo },
        });
        // After every shift: the restock photos.
        if (r.status === "out") {
          const session = await restockBegin(r.id, r.undo);
          if (!("error" in session)) setRestock(session);
        }
      }
      buzz();
      await refresh();
    });

  const undo = (u: { id: string; token: string }) =>
    start(async () => {
      const r = await phoneUndo(u.id, u.token);
      setNote(r.error ? { tone: "error", text: r.error } : null);
      await refresh();
    });

  return (
    <div className="grid gap-5 pb-24">
      <div className="flex items-center gap-3">
        <Avatar name={data.name} size={44} ring={data.open ? "on" : undefined} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {greeting(now)}
          </p>
          <h1 className="truncate font-heading text-2xl font-bold">{data.name}</h1>
        </div>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await signOut();
              router.refresh();
            })
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-muted-foreground"
        >
          <LogOutIcon className="size-4" /> Sign out
        </button>
      </div>
      <div className="-mt-2 flex justify-end empty:hidden">
        <WorkNotifications />
      </div>

      {tab === "today" && (
        <>
          <ClockCard data={data} now={now} autoOut={autoOut} busy={busy} onPunch={punch} note={note} onUndo={undo} />
          <DiscountPass name={data.name} discount={discount} pct={rule.pct} now={now} />
          <WeekCard weekMinutes={weekMinutes} rule={rule} hours={hours} hoursPast={hoursPast} intoHour={intoHour} />
          {data.schedule[0] && (
            <button type="button" onClick={() => setTab("schedule")} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left">
              <CalendarClockIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                <span className="block text-xs text-muted-foreground">Next shift</span>
                <span className="block font-medium">
                  {relativeDay(data.schedule[0].date)}, {data.schedule[0].label}, {formatClock(data.schedule[0].startsAt)}
                </span>
              </span>
            </button>
          )}
        </>
      )}

      {tab === "tasks" && <WorkTasks />}
      {tab === "messages" && <WorkMessages initialChat={initialChat} />}
      {tab === "schedule" && (
        <>
          <ScheduleTab data={data} now={now} />
          <WorkAbsences schedule={data.schedule} />
        </>
      )}
      {tab === "money" && <MoneyTab data={data} />}

      {restock && <RestockWalkthrough session={restock} onClose={() => setRestock(null)} />}

      {/* ---- App tab bar ---- */}
      <nav
        aria-label="App sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-colors ${tab === t.id ? "text-foreground" : "text-muted-foreground"}`}
            >
              {tab === t.id && <span aria-hidden className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />}
              <t.icon className={`size-6 ${tab === t.id ? "text-ember-ink" : ""}`} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <style>{`@keyframes work-stripes{from{background-position:0 0}to{background-position:56px 0}}`}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- Today */

function ClockCard({
  data,
  now,
  autoOut,
  busy,
  onPunch,
  note,
  onUndo,
}: {
  data: PortalData;
  now: number;
  autoOut: string | null;
  busy: boolean;
  onPunch: () => void;
  note: Note | null;
  onUndo: (u: { id: string; token: string }) => void;
}) {
  const on = Boolean(data.open);
  const elapsed = data.open ? Math.max(0, Math.floor((now - new Date(data.open.in).getTime()) / 1000)) : 0;
  const timer = `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const limitSecs = data.maxShiftMinutes * 60;
  const progress = on && limitSecs > 0 ? Math.min(1, elapsed / limitSecs) : on ? 1 : 0;
  const R = 92;
  const C = 2 * Math.PI * R;

  return (
    <section aria-label="Time clock" className="rounded-xl bg-[#17191c] p-6 text-white">
      <div className="grid justify-items-center gap-5">
        <div className="relative grid size-56 place-items-center">
          <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={on ? "var(--success)" : "var(--primary)"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div className="text-center">
            {on ? (
              <>
                <p className="text-sm font-medium text-success">On the clock</p>
                <p className="mt-1 font-heading text-6xl leading-none font-bold tabular-nums" suppressHydrationWarning>
                  {timer}
                </p>
                <p className="mt-1 text-xs text-white/60">since {formatTime(data.open!.in)}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-white/60">Off the clock</p>
                <p className="mt-1 font-heading text-6xl leading-none font-bold tabular-nums" suppressHydrationWarning>
                  {new Date(now).toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit" }).replace(/ [AP]M$/, "")}
                </p>
                <p className="mt-1 text-xs text-white/60" suppressHydrationWarning>
                  {new Date(now).toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "long" })}</p>
              </>
            )}
          </div>
        </div>

        {on && autoOut && (
          <p className="flex items-center gap-1.5 text-sm text-white/70">
            <AlarmClockOffIcon className="size-4" /> Clocks out on its own at {formatTime(autoOut)}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onPunch}
          className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-lg text-lg font-semibold transition active:translate-y-px disabled:opacity-60 ${
            on ? "bg-white text-neutral-950" : "bg-primary text-primary-foreground"
          }`}
        >
          {busy ? <Loader2Icon className="size-5 animate-spin" /> : <TimerIcon className="size-5" />}
          {on ? "Clock out" : "Clock in"}
        </button>

        {note && (
          <div
            role="status"
            className={`flex w-full flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
              note.tone === "error" ? "bg-destructive/20 text-white" : note.tone === "auto" ? "bg-warning/25 text-white" : "bg-white/10"
            }`}
          >
            <span className="flex-1">{note.text}</span>
            {note.undo && (
              <button type="button" onClick={() => onUndo(note.undo!)} className="font-bold underline underline-offset-4">
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** A live "pass" to show at the window. Moving stripes and a ticking clock: a screenshot won't look live. */
function DiscountPass({ name, discount, pct, now }: { name: string; discount: number; pct: number; now: number }) {
  const d = new Date(now);
  return (
    <section aria-labelledby="discount" className="relative isolate overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] motion-safe:animate-[work-stripes_6s_linear_infinite]" style={stripes} />
      <p id="discount" className="text-sm font-medium">
        Employee discount
      </p>
      <p className="mt-2 font-heading text-8xl leading-[0.85] font-bold">{discount}%</p>
      <p className="mt-1 text-lg font-semibold">off everything</p>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-black/15 pt-3">
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-xs font-medium opacity-80">Show this at the window</p>
        </div>
        <p className="text-sm font-semibold tabular-nums" suppressHydrationWarning>
          {d.toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, month: "short", day: "numeric" })},{" "}
          {d.toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>
      {discount === 0 && <p className="mt-2 text-sm font-medium">Work an hour this week to unlock {pct}% off.</p>}
    </section>
  );
}

function WeekCard({
  weekMinutes,
  rule,
  hours,
  hoursPast,
  intoHour,
}: {
  weekMinutes: number;
  rule: PortalData["rule"];
  hours: number;
  hoursPast: number;
  intoHour: number;
}) {
  return (
    <section aria-labelledby="week" className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week" className="text-base font-semibold">
          This week
        </h2>
        <p className="font-heading text-3xl leading-none font-bold tabular-nums">{formatMinutes(weekMinutes)}</p>
      </div>
      <ol className="grid grid-cols-5 gap-2" aria-label={`Discount hours: ${Math.min(hours, rule.afterHours)} of ${rule.afterHours}`}>
        {Array.from({ length: rule.afterHours }, (_, i) => {
          const done = hours > i;
          const current = hours === i;
          return (
            <li key={i} className="grid gap-1.5 text-center">
              <span className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: done ? "100%" : current ? `${(intoHour / 60) * 100}%` : "0%" }}
                />
              </span>
              <span className={`text-xs font-medium tabular-nums ${done ? "text-foreground" : "text-muted-foreground"}`}>{(i + 1) * rule.pct}%</span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-baseline gap-2 border-t pt-3 text-sm">
        <span className="font-heading text-2xl leading-none font-bold tabular-nums">{60 - intoHour}m</span>
        <p>
          more work for <strong className="font-semibold">{nextReward(weekMinutes, rule)}</strong>
          {hours >= rule.afterHours && (
            <span className="block text-muted-foreground">
              {hoursPast} hour{hoursPast === 1 ? "" : "s"} past {rule.afterHours} this week = {shortMoney(hoursPast * rule.cents)} credit
            </span>
          )}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{creditRuleText(rule)}</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Schedule */

function ScheduleTab({ data, now }: { data: PortalData; now: number }) {
  const today = storeToday();
  const byDay = new Map<string, PortalData["schedule"]>();
  for (const s of data.schedule) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  return (
    <>
      <section aria-labelledby="schedule" className="grid gap-4 rounded-xl border bg-card p-5">
        <h2 id="schedule" className="text-base font-semibold">
          My schedule
        </h2>
        {byDay.size === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">You&apos;re not on the schedule yet. Ask your manager.</p>
        ) : (
          <div className="grid gap-4">
            {[...byDay.entries()].map(([date, list]) => (
              <div key={date} className="flex gap-4">
                <div className={`grid w-12 shrink-0 content-center text-center ${date === today ? "text-ember-ink" : ""}`}>
                  <span className="text-xs font-medium">{formatDay(date, { weekday: "short", month: undefined, day: undefined })}</span>
                  <span className="font-heading text-3xl leading-none font-bold">{Number(date.slice(8))}</span>
                </div>
                <ul className="grid flex-1 content-center gap-1.5">
                  {list.map((s) => (
                    <li key={s.label} className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">{formatClock(s.startsAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="shifts" className="grid gap-3 rounded-xl border bg-card p-5">
        <h2 id="shifts" className="text-base font-semibold">
          My shifts
        </h2>
        {data.shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shifts yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.shifts.map((s) => (
              <li key={s.in} className="flex items-center gap-3 py-2.5">
                <span className="w-24 shrink-0 font-medium">{formatDay(storeToday(new Date(s.in)))}</span>
                <span className="flex-1 text-muted-foreground">
                  {formatTime(s.in)} – {s.out ? formatTime(s.out) : "now"}
                  {s.phone && <SmartphoneIcon aria-label="from a phone" className="ml-1.5 inline size-3.5" />}
                </span>
                <span className="font-semibold tabular-nums">{formatMinutes(minutesBetween(s.in, s.out, now))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- Money */

function MoneyTab({ data }: { data: PortalData }) {
  return (
    <>
      <section aria-labelledby="credit" className="rounded-xl bg-[#17191c] p-6 text-white">
        <p id="credit" className="text-sm font-medium text-white/65">
          Store credit
        </p>
        <p className="mt-2 font-heading text-8xl leading-[0.85] font-bold tabular-nums">{formatCents(data.creditCents)}</p>
        <p className="mt-3 text-sm text-white/65">
          Earned {formatCents(data.earnedCents)} so far, {formatMinutes(data.workedMinutes)} worked in all
        </p>
        <p className="mt-4 border-t border-white/15 pt-3 text-sm">Using credit? Tell the person at the window. They take it off here.</p>
      </section>

      <section aria-labelledby="history" className="grid gap-3 rounded-xl border bg-card p-5">
        <h2 id="history" className="text-base font-semibold">
          Credit used and added
        </h2>
        {data.credit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.credit.map((c, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className={`w-16 font-semibold tabular-nums ${c.cents < 0 ? "text-destructive" : "text-success"}`}>
                  {c.cents < 0 ? "−" : "+"}
                  {formatCents(Math.abs(c.cents))}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.note ?? (c.cents < 0 ? "Used" : "Added")}</span>
                <span className="text-xs text-muted-foreground">{formatDay(storeToday(new Date(c.at)))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="px-2 text-xs text-muted-foreground">{creditRuleText(data.rule)}</p>
    </>
  );
}

/* ---------------------------------------------------------------- bits */

function greeting(now: number) {
  const h = Number(new Date(now).toLocaleString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const stripes: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 14px, transparent 14px 28px)",
  backgroundSize: "56px 56px",
};

/** A short buzz on phones that support it. */
function buzz() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // not supported
  }
}
