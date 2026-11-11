"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClockOffIcon,
  CalendarClockIcon,
  CameraIcon,
  CheckIcon,
  Loader2Icon,
  ListChecksIcon,
  MessageCircleIcon,
  HomeIcon,
  LogOutIcon,
  type LucideIcon,
  SmartphoneIcon,
  WalletIcon,
} from "lucide-react";
import { Avatar } from "@/components/staff/avatar";
import { formatCents, formatClock, formatDay, formatTime, relativeDay, STORE_TIMEZONE, storeToday } from "@/lib/format";
import { autoOutAt, creditRuleText, formatMinutes, minutesBetween, type PortalData, shortMoney, weekCredit } from "@/lib/staff";
import { areaPhrase, type RestockSession, RestockWalkthrough } from "@/components/staff/restock-walkthrough";
import { loadPortal, phonePunch, phoneUndo, signOut } from "./actions";
import { HoldButton } from "./hold-button";
import { WorkAbsences, WorkMessages, WorkNotifications, WorkTasks } from "./team";
import { workRestockOpen, workRestockState, workUnread } from "./team-actions";

const weekdayShort = (date: string) => formatDay(date, { weekday: "short", month: undefined, day: undefined });

type Note = { tone: "in" | "out" | "auto" | "error"; text: string; undo?: { id: string; token: string } };
export type Tab = "today" | "tasks" | "restock" | "messages" | "schedule" | "money";
type RestockInfo = Awaited<ReturnType<typeof workRestockState>>;

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: HomeIcon },
  { id: "tasks", label: "Tasks", icon: ListChecksIcon },
  { id: "restock", label: "Restock", icon: CameraIcon },
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
  const [pop, setPop] = useState(0);
  const [unread, setUnread] = useState(0);
  const [restockInfo, setRestockInfo] = useState<RestockInfo>({ state: "none" });
  const [restockError, setRestockError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Is a restock check on their list? (Shows a dot on the Restock tab and a to-do in Tasks.)
  const checkRestock = useCallback(() => void workRestockState().then(setRestockInfo, () => undefined), []);
  useEffect(() => {
    const first = setTimeout(checkRestock, 0);
    const t = setInterval(checkRestock, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [checkRestock]);

  const openRestock = async () => {
    setRestockError(null);
    setOpening(true);
    const r = await workRestockOpen();
    setOpening(false);
    if ("error" in r && r.error) setRestockError(r.error);
    else if ("checkId" in r) setRestock(r);
  };

  // The Chat tab's unread count (not while reading chats: they mark themselves read).
  useEffect(() => {
    if (tab === "messages") return;
    const check = () => void workUnread().then((n) => setUnread(n), () => undefined);
    const first = setTimeout(check, 0);
    const t = setInterval(check, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [tab]);
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
        // After a shift, the restock check waits on the Restock tab.
        checkRestock();
      }
      buzz();
      setPop((n) => n + 1);
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
        <Avatar name={data.name} size={48} ring={data.open ? "on" : undefined} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {greeting(now)}
          </p>
          <h1 className="truncate font-heading text-4xl leading-none font-bold">{data.name}</h1>
        </div>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await signOut();
              router.refresh();
            })
          }
          aria-label="Sign out"
          className="grid size-10 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
      <div className="-mt-2 flex justify-end empty:hidden">
        <WorkNotifications />
      </div>

      {tab === "today" && (
        <>
          <ClockCard data={data} now={now} autoOut={autoOut} busy={busy} onPunch={punch} note={note} onUndo={undo} pop={pop} />
          <DiscountPass name={data.name} discount={discount} pct={rule.pct} now={now} />
          <WeekCard weekMinutes={weekMinutes} rule={rule} hours={hours} />
          {data.schedule[0] && (
            <button type="button" onClick={() => setTab("schedule")} className="flex items-center gap-4 rounded-3xl bg-card px-5 py-4 text-left ring-1 ring-border">
              <span className="grid w-12 shrink-0 text-center">
                <span className="text-xs font-semibold text-ember-ink">{weekdayShort(data.schedule[0].date)}</span>
                <span className="font-heading text-3xl leading-none font-bold">{Number(data.schedule[0].date.slice(8))}</span>
              </span>
              <span className="flex-1">
                <span className="block text-xs text-muted-foreground">Next shift</span>
                <span className="block text-lg font-semibold">
                  {relativeDay(data.schedule[0].date)}, {data.schedule[0].label}
                </span>
                <span className="block text-sm text-muted-foreground">{formatClock(data.schedule[0].startsAt)}</span>
              </span>
            </button>
          )}
        </>
      )}

      {tab === "tasks" && (
        <WorkTasks
          restock={restockInfo.state}
          onRestock={() => {
            setTab("restock");
            if (restockInfo.state === "due") void openRestock();
          }}
        />
      )}
      {tab === "restock" && <RestockTab info={restockInfo} error={restockError} opening={opening} onStart={() => void openRestock()} />}
      {tab === "messages" && <WorkMessages initialChat={initialChat} />}
      {tab === "schedule" && (
        <>
          <ScheduleTab data={data} now={now} />
          <WorkAbsences schedule={data.schedule} />
        </>
      )}
      {tab === "money" && <MoneyTab data={data} />}

      {restock && (
        <RestockWalkthrough
          session={restock}
          onClose={() => {
            setRestock(null);
            checkRestock();
          }}
        />
      )}

      {/* ---- App tab bar ---- */}
      <nav aria-label="App sections" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-xl grid-cols-6 rounded-2xl bg-[#1d2127]/95 p-1 ring-1 ring-white/10 backdrop-blur-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[0.7rem] font-semibold transition-colors ${tab === t.id ? "bg-white/[0.07] text-foreground" : "text-muted-foreground"}`}
            >
              <t.icon className={`size-5.5 ${tab === t.id ? "text-[var(--brand)]" : ""}`} />
              {t.label}
              {t.id === "restock" && restockInfo.state === "due" && (
                <span aria-label="Restock check to do" className="absolute top-1.5 right-[calc(50%-1rem)] size-2.5 rounded-full bg-[var(--brand)] ring-2 ring-[#1d2127]" />
              )}
              {t.id === "messages" && unread > 0 && (
                <span className="absolute top-1 right-[calc(50%-1.4rem)] grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[var(--brand)] px-1 text-[0.65rem] font-bold text-black">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
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
  pop,
}: {
  data: PortalData;
  now: number;
  autoOut: string | null;
  busy: boolean;
  onPunch: () => void;
  note: Note | null;
  onUndo: (u: { id: string; token: string }) => void;
  /** Changes on each successful punch: replays the pulse. */
  pop: number;
}) {
  const on = Boolean(data.open);
  const elapsed = data.open ? Math.max(0, Math.floor((now - new Date(data.open.in).getTime()) / 1000)) : 0;
  const h = Math.floor(elapsed / 3600);
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const sec = String(elapsed % 60).padStart(2, "0");
  const limitSecs = data.maxShiftMinutes * 60;
  const progress = on && limitSecs > 0 ? Math.min(1, elapsed / limitSecs) : 0;
  const clock = new Date(now).toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit" });
  const [hm, ampm] = clock.split(" ");

  return (
    <section
      key={pop}
      aria-label="Time clock"
      className={`relative overflow-hidden rounded-3xl p-5 ${pop ? "punch-pop" : ""} ${on ? "bg-[#0f2a28]" : "bg-card"} ring-1 ${on ? "ring-[color-mix(in_oklab,var(--nest)_35%,transparent)]" : "ring-border"}`}
    >
      {/* status */}
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-[var(--nest)]/15 text-[var(--nest)]" : "bg-white/5 text-muted-foreground"}`}>
          <span aria-hidden className={`size-2 rounded-full ${on ? "bg-[var(--nest)] motion-safe:animate-pulse" : "bg-muted-foreground/50"}`} />
          {on ? "On the clock" : "Off the clock"}
        </span>
        <span className="text-sm text-muted-foreground" suppressHydrationWarning>
          {new Date(now).toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* the big number: shift timer, or the time */}
      <div className="mt-4 flex items-end gap-2" suppressHydrationWarning>
        {on ? (
          <>
            <span className="font-heading text-[5.5rem] leading-[0.8] font-bold tabular-nums">
              {h}:{m}
            </span>
            <span className="mb-1 font-heading text-4xl leading-none font-bold text-[var(--nest)] tabular-nums">{sec}</span>
          </>
        ) : (
          <>
            <span className="font-heading text-[5.5rem] leading-[0.8] font-bold tabular-nums">{hm}</span>
            <span className="mb-1 font-heading text-3xl leading-none font-bold text-muted-foreground">{ampm}</span>
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {on && data.open ? (
          <>
            Since {formatTime(data.open.in)}
            {autoOut && (
              <span className="inline-flex items-center gap-1">
                {" · "}
                <AlarmClockOffIcon className="size-3.5" /> ends on its own at {formatTime(autoOut)}
              </span>
            )}
          </>
        ) : (
          "Hold the button when you get to the store."
        )}
      </p>

      {/* how much of the shift is left before it ends on its own */}
      {on && limitSecs > 0 && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Shift progress" aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-[var(--nest)] transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="mt-5">
        <HoldButton on={on} busy={busy} onComplete={onPunch} />
      </div>

      {note && (
        <div
          role="status"
          className={`mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${
            note.tone === "error" ? "bg-destructive/15 text-white" : note.tone === "auto" ? "bg-warning/20 text-white" : "bg-white/[0.06]"
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
    </section>
  );
}

/** A live "pass" to show at the window. Moving stripes and a ticking clock: a screenshot won't look live. */
function DiscountPass({ name, discount, pct, now }: { name: string; discount: number; pct: number; now: number }) {
  const d = new Date(now);
  return (
    <section aria-labelledby="discount" className="relative isolate overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground">
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

function WeekCard({ weekMinutes, rule, hours }: { weekMinutes: number; rule: PortalData["rule"]; hours: number }) {
  const cap = rule.capCents ?? 1000;
  const earned = weekCredit(weekMinutes, rule);
  const blocks = Math.max(1, Math.ceil(cap / Math.max(1, rule.cents)));
  const maxed = earned >= cap;
  const discount = Math.min(hours, rule.afterHours) * rule.pct;
  return (
    <section aria-labelledby="week" className="grid gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week" className="text-base font-semibold">
          This week
        </h2>
        <p className="font-heading text-4xl leading-none font-bold tabular-nums">{formatMinutes(weekMinutes)}</p>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-5xl leading-none font-bold text-[var(--nest)] tabular-nums">{formatCents(earned)}</p>
        <p className="text-sm text-muted-foreground">credit earned of {shortMoney(cap)}</p>
      </div>
      {/* One block per $1: each one fills up as you work that hour. */}
      <ol className="grid grid-cols-10 gap-1.5" aria-label={`Credit this week: ${formatCents(earned)} of ${shortMoney(cap)}`}>
        {Array.from({ length: blocks }, (_, i) => {
          const fill = Math.min(1, Math.max(0, earned / rule.cents - i));
          return (
            <li key={i} className="relative isolate h-10 overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/[0.06]">
              <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 bg-[var(--nest)] transition-[height] duration-700" style={{ height: `${fill * 100}%` }} />
            </li>
          );
        })}
      </ol>
      <div className="flex items-baseline justify-between gap-2 border-t pt-3 text-sm">
        <p>{maxed ? <strong className="font-semibold">Maxed out for this week. Nice work.</strong> : <>Every hour adds <strong className="font-semibold">{shortMoney(rule.cents)}</strong></>}</p>
        <p className="text-muted-foreground">{discount > 0 ? `${discount}% off now` : `${rule.pct}% off per hour`}</p>
      </div>
      <p className="text-xs text-muted-foreground">{creditRuleText(rule)}</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Restock */

const RESTOCK_STEPS = ["Drinks", "Snacks (right half)", "Snacks (left half)", "Spicy chips", "Regular chips", "Ramen"];

function RestockTab({ info, error, opening, onStart }: { info: RestockInfo; error: string | null; opening: boolean; onStart: () => void }) {
  if (info.state === "done") {
    return (
      <section className="grid justify-items-center gap-3 rounded-3xl bg-[#0f2a28] px-5 py-10 text-center ring-1 ring-[color-mix(in_oklab,var(--nest)_35%,transparent)]">
        <span className="check-pop grid size-14 place-items-center rounded-full bg-[var(--nest)] text-black">
          <CheckIcon className="size-7" strokeWidth={3} />
        </span>
        <h2 className="font-heading text-4xl leading-none font-bold">Restock done</h2>
        <p className="text-sm text-white/65">
          Photos sent at {formatTime(info.at)}
          {info.period ? `, stamped ${info.period}` : ""}. The manager will check them.
        </p>
      </section>
    );
  }
  if (info.state === "skipped") {
    return (
      <section className="grid gap-2 rounded-3xl bg-card p-5 ring-1 ring-border">
        <h2 className="text-base font-semibold">Restock check skipped</h2>
        <p className="text-sm text-muted-foreground">You told the manager: &ldquo;{info.note}&rdquo;</p>
      </section>
    );
  }
  const due = info.state === "due";
  return (
    <section aria-labelledby="restock-title" className="grid gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="restock-title" className="font-heading text-4xl leading-none font-bold">
            Restock check
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {due
              ? `Fill each spot, then take a picture of it. The photos go to the manager together${info.period ? `, stamped ${info.period}` : ""}.`
              : "Nothing to check right now. This opens when you're clocked in, and stays open for 45 minutes after you clock out."}
          </p>
        </div>
        {due && <span className="shrink-0 rounded-full bg-[var(--brand)] px-2.5 py-1 text-xs font-bold text-black">To do</span>}
      </div>
      <ol className="grid gap-1.5">
        {RESTOCK_STEPS.map((a, i) => (
          <li key={a} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.07] font-heading text-base font-bold tabular-nums">{i + 1}</span>
            <span>{areaPhrase(a).replace(/^./, (c) => c.toUpperCase())}</span>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      {due && (
        <button type="button" onClick={onStart} disabled={opening} className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-70">
          {opening ? <Loader2Icon className="size-5 animate-spin" /> : <CameraIcon className="size-5" />} Start the restock check
        </button>
      )}
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
      <section aria-labelledby="schedule" className="grid gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
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

      <section aria-labelledby="shifts" className="grid gap-3 rounded-3xl bg-card p-5 ring-1 ring-border">
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
      <section aria-labelledby="credit" className="rounded-3xl bg-[#0f2a28] p-6 text-white ring-1 ring-[color-mix(in_oklab,var(--nest)_35%,transparent)]">
        <p id="credit" className="text-sm font-medium text-white/65">
          Store credit
        </p>
        <p className="mt-2 font-heading text-8xl leading-[0.85] font-bold text-[var(--nest)] tabular-nums">{formatCents(data.creditCents)}</p>
        <p className="mt-3 text-sm text-white/65">
          Earned {formatCents(data.earnedCents)} so far, {formatMinutes(data.workedMinutes)} worked in all
        </p>
        <p className="mt-4 border-t border-white/15 pt-3 text-sm">Using credit? Tell the person at the window. They take it off here.</p>
      </section>

      <section aria-labelledby="history" className="grid gap-3 rounded-3xl bg-card p-5 ring-1 ring-border">
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
