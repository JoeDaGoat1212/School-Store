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

/** One employee's own app: clock in/out, live shift ring, credit pass, schedule. */
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
          <h1 className="truncate font-heading text-[2.6rem] leading-none font-bold">
            <span className="text-ember">{data.name.split(" ")[0]}</span>
            {data.name.includes(" ") && <span className="text-white"> {data.name.split(" ").slice(1).join(" ")}</span>}
          </h1>
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
          className="glass grid size-10 place-items-center rounded-full text-white/60 hover:text-white"
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
          <CreditPass name={data.name} credit={data.creditCents} now={now} />
          <WeekCard weekMinutes={weekMinutes} rule={rule} />
          {data.schedule[0] && (
            <button type="button" onClick={() => setTab("schedule")} className="glass flex items-center gap-4 rounded-[1.75rem] px-5 py-4 text-left">
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
        <div className="mx-auto grid max-w-xl grid-cols-6 gap-0.5 rounded-[1.4rem] border border-white/10 bg-[#101218]/75 p-1.5 backdrop-blur-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.7rem] font-bold transition-all duration-300 ${tab === t.id ? "tab-on text-white" : "text-white/50 hover:text-white/80"}`}
            >
              <t.icon className={`size-5.5 transition-transform duration-300 ${tab === t.id ? "text-[#0b0b0b]" : ""}`} />
              {t.label}
              {t.id === "restock" && restockInfo.state === "due" && (
                <span aria-label="Restock check to do" className="absolute top-1.5 right-[calc(50%-1rem)] size-2.5 rounded-full bg-[#ff5a1f] ring-2 ring-[#101218]" />
              )}
              {t.id === "messages" && unread > 0 && (
                <span className="ember absolute top-1 right-[calc(50%-1.4rem)] grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-[0.65rem] font-bold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

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
      className={`relative overflow-hidden rounded-[1.75rem] p-5 ${pop ? "punch-pop" : ""} ${on ? "on-clock" : "off-clock"}`}
    >
      {/* status */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${on ? "bg-[var(--nest)]/15 text-[var(--nest)] ring-1 ring-[var(--nest)]/30" : "bg-white/[0.06] text-white/70 ring-1 ring-white/10"}`}
        >
          <span className="relative grid size-2 place-items-center">
            {on && <span aria-hidden className="absolute size-2 rounded-full bg-[var(--nest)] motion-safe:animate-ping" />}
            <span aria-hidden className={`size-2 rounded-full ${on ? "bg-[var(--nest)]" : "bg-white/40"}`} />
          </span>
          {on ? "On the clock" : "Off the clock"}
        </span>
        <span className="text-sm text-white/55" suppressHydrationWarning>
          {new Date(now).toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* the big number: shift timer (with a ring counting to the auto clock-out), or the time */}
      <div className="mt-4 flex items-center justify-between gap-3" suppressHydrationWarning>
        {on ? (
          <>
            <div className="flex items-end gap-2">
              <span suppressHydrationWarning className="font-heading text-[5.75rem] leading-[0.8] font-bold tabular-nums">
                {h}:{m}
              </span>
              <span suppressHydrationWarning className="text-nest mb-1 font-heading text-4xl leading-none font-bold tabular-nums">{sec}</span>
            </div>
            {limitSecs > 0 && <ShiftRing progress={progress} />}
          </>
        ) : (
          <div className="flex items-end gap-2">
            <span suppressHydrationWarning className="font-heading text-[5.75rem] leading-[0.8] font-bold tabular-nums">{hm}</span>
            <span suppressHydrationWarning className="text-ember mb-1 font-heading text-3xl leading-none font-bold">{ampm}</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-white/60">
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

/** A ring that fills toward the automatic clock-out. */
function ShiftRing({ progress }: { progress: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 84 84" className="size-[5.25rem] shrink-0 -rotate-90" role="img" aria-label={`${Math.round(progress * 100)}% of the shift`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="#2fd0c2"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

/** The Firebird Pass: their store credit on a holographic card. The ticking clock means a screenshot won't look live. */
function CreditPass({ name, credit, now }: { name: string; credit: number; now: number }) {
  const d = new Date(now);
  return (
    <section aria-labelledby="pass" className="holo float-in rounded-[1.75rem] p-5">
      {/* big flame watermark */}
      <svg aria-hidden viewBox="0 0 64 64" className="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-48 opacity-[0.12]">
        <path
          fill="#000"
          d="M33 4c3 9-1 14-5 19-3 4-5 8-3 13 1-6 5-9 8-11 0 7 6 9 6 16 0 6-5 11-11 11S16 47 16 40c0-9 6-14 9-20 3-5 5-10 8-16Zm10 20c5 6 8 11 8 18 0 11-9 18-19 18 9-4 13-11 12-19 0-6-3-10-1-17Z"
        />
      </svg>
      <div className="flex items-center justify-between">
        <p id="pass" className="text-xs font-extrabold tracking-[0.25em]">
          FIREBIRD PASS
        </p>
        <span className="rounded-full bg-black px-2.5 py-0.5 text-[0.7rem] font-bold text-[#ff5a1f]">Employee</span>
      </div>
      <p className="mt-4 text-sm font-semibold">Store credit</p>
      <p className="font-heading text-[5.5rem] leading-[0.85] font-bold tabular-nums">{formatCents(credit)}</p>
      <div className="mt-5 flex items-end justify-between gap-3 border-t border-black/20 pt-3">
        <div>
          <p className="text-lg font-bold">{name}</p>
          <p className="text-xs font-medium opacity-75">Show this at the window to use your credit</p>
        </div>
        <p className="shrink-0 rounded-lg bg-black px-2 py-1 font-mono text-sm font-bold whitespace-nowrap text-[#ff5a1f] tabular-nums" suppressHydrationWarning>
          {d.toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>
    </section>
  );
}

function WeekCard({ weekMinutes, rule }: { weekMinutes: number; rule: PortalData["rule"] }) {
  const cap = rule.capCents ?? 1000;
  const earned = weekCredit(weekMinutes, rule);
  const blocks = Math.max(1, Math.ceil(cap / Math.max(1, rule.cents)));
  const maxed = earned >= cap;
  return (
    <section aria-labelledby="week" className="glass grid gap-4 rounded-[1.75rem] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week" className="text-sm font-bold tracking-[0.18em] text-white/60 uppercase">
          This week
        </h2>
        <p className="font-heading text-3xl leading-none font-bold tabular-nums">{formatMinutes(weekMinutes)}</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-nest font-heading text-6xl leading-none font-bold tabular-nums">{formatCents(earned)}</p>
        <p className="pb-1 text-sm text-white/55">earned of {shortMoney(cap)}</p>
      </div>
      {/* One bar per $1: each one fills up as you work that hour. */}
      <ol className="grid grid-cols-10 items-end gap-1.5" aria-label={`Credit this week: ${formatCents(earned)} of ${shortMoney(cap)}`}>
        {Array.from({ length: blocks }, (_, i) => {
          const fill = Math.min(1, Math.max(0, earned / rule.cents - i));
          return (
            <li key={i} className="relative isolate overflow-hidden rounded-xl bg-white/[0.05] ring-1 ring-white/[0.07]" style={{ height: `${2.5 + i * 0.18}rem` }}>
              <span aria-hidden className="bar-fill absolute inset-x-0 bottom-0 -z-10 rounded-xl transition-[height] duration-700" style={{ height: `${fill * 100}%` }} />
            </li>
          );
        })}
      </ol>
      <p className="border-t border-white/[0.08] pt-3 text-sm">
        {maxed ? (
          <strong className="text-nest font-bold">Maxed out for this week. Nice work.</strong>
        ) : (
          <>
            Every hour adds <strong className="font-bold">{shortMoney(rule.cents)}</strong>. {shortMoney(cap - earned)} left to earn this week.
          </>
        )}
      </p>
      <p className="text-xs text-white/45">{creditRuleText(rule)}</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Restock */

const RESTOCK_STEPS = ["Drinks", "Snacks (right half)", "Snacks (left half)", "Spicy chips", "Regular chips", "Ramen"];

function RestockTab({ info, error, opening, onStart }: { info: RestockInfo; error: string | null; opening: boolean; onStart: () => void }) {
  if (info.state === "done") {
    return (
      <section className="on-clock float-in grid justify-items-center gap-3 rounded-[1.75rem] px-5 py-10 text-center">
        <span className="check-pop grid size-16 place-items-center rounded-full bg-[var(--nest)] text-black">
          <CheckIcon className="size-7" strokeWidth={3} />
        </span>
        <h2 className="text-nest font-heading text-5xl leading-none font-bold">Restock done</h2>
        <p className="text-sm text-white/65">
          Photos sent at {formatTime(info.at)}
          {info.period ? `, stamped ${info.period}` : ""}. The manager will check them.
        </p>
      </section>
    );
  }
  if (info.state === "skipped") {
    return (
      <section className="glass grid gap-2 rounded-[1.75rem] p-5">
        <h2 className="text-base font-semibold">Restock check skipped</h2>
        <p className="text-sm text-muted-foreground">You told the manager: &ldquo;{info.note}&rdquo;</p>
      </section>
    );
  }
  const due = info.state === "due";
  return (
    <section aria-labelledby="restock-title" className="glass float-in grid gap-4 rounded-[1.75rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="restock-title" className="font-heading text-5xl leading-none font-bold">
            Restock check
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {due
              ? `Fill each spot, then take a picture of it. The photos go to the manager together${info.period ? `, stamped ${info.period}` : ""}.`
              : "Nothing to check right now. This opens when you're clocked in, and stays open for 45 minutes after you clock out."}
          </p>
        </div>
        {due && <span className="ember shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold">To do</span>}
      </div>
      <ol className="grid gap-1.5">
        {RESTOCK_STEPS.map((a, i) => (
          <li key={a} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-3 text-[0.95rem] font-medium ring-1 ring-white/[0.06]">
            <span className="ember grid size-8 shrink-0 place-items-center rounded-xl font-heading text-lg font-bold tabular-nums">{i + 1}</span>
            <span>{areaPhrase(a).replace(/^./, (c) => c.toUpperCase())}</span>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      {due && (
        <button type="button" onClick={onStart} disabled={opening} className="ember flex h-16 items-center justify-center gap-2.5 rounded-2xl text-lg font-extrabold disabled:opacity-70">
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
      <section aria-labelledby="schedule" className="glass grid gap-4 rounded-[1.75rem] p-5">
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

      <section aria-labelledby="shifts" className="glass grid gap-3 rounded-[1.75rem] p-5">
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
      <section aria-labelledby="credit" className="on-clock float-in rounded-[1.75rem] p-6 text-white">
        <p id="credit" className="text-sm font-medium text-white/65">
          Store credit
        </p>
        <p className="text-nest mt-2 font-heading text-8xl leading-[0.85] font-bold tabular-nums">{formatCents(data.creditCents)}</p>
        <p className="mt-3 text-sm text-white/65">
          Earned {formatCents(data.earnedCents)} so far, {formatMinutes(data.workedMinutes)} worked in all
        </p>
        <p className="mt-4 border-t border-white/15 pt-3 text-sm">Using credit? Tell the person at the window. They take it off here.</p>
      </section>

      <section aria-labelledby="history" className="glass grid gap-3 rounded-[1.75rem] p-5">
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


/** A short buzz on phones that support it. */
function buzz() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // not supported
  }
}
