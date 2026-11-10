"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClockOffIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleAlertIcon,
  DeleteIcon,
  Loader2Icon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  SmartphoneIcon,
  SparklesIcon,
  TimerIcon,
  UserPlusIcon,
} from "lucide-react";
import { Avatar } from "@/components/staff/avatar";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { formatCents, formatClock, formatTime, relativeDay, STORE_TIMEZONE, storeToday } from "@/lib/format";
import { autoOutAt, type ClockBoard, formatMinutes, minutesBetween } from "@/lib/staff";
import { type ClockStats, loadBoard, punch, signUp, undoPunch, unlockTablet } from "./actions";
import { Confetti } from "./confetti";

const CONFETTI = [brand.colors.primary, brand.colors.accent, "#FFD23F", "#FFFFFF"];

/*
 * The time clock screen. Left: the clock and a big keypad (dark, like a
 * register). Right: who's working, who's up next, and who's done today.
 * Built for a tablet on the counter; a laptop works too (type the PIN, or
 * scan a student ID with a USB barcode scanner, which types it and presses Enter).
 */

type Result = {
  tone: "in" | "out" | "auto" | "note" | "error";
  title: string;
  name?: string;
  lines: string[];
  stats?: { label: string; value: string }[];
  undo?: { id: string; token: string };
};

const noSubscribe = () => () => {};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function TimeClock({
  initialBoard,
  maxShiftMinutes,
  initialStats,
  locked,
  initialError,
}: {
  initialBoard: ClockBoard;
  maxShiftMinutes: number;
  initialStats: ClockStats;
  /** This is the store tablet, locked on the time clock (Manager asks for the manager code). */
  locked: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [manager, setManager] = useState(false);
  const [board, setBoard] = useState(initialBoard);
  const [limit, setLimit] = useState(maxShiftMinutes);
  const [stats, setStats] = useState(initialStats);
  const [burst, setBurst] = useState(0);
  const [boardError, setBoardError] = useState(initialError);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // The ticking clock is drawn only in the browser, so the server's second and the tablet's never clash.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [shake, setShake] = useState(0);
  const autoSubmit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await loadBoard();
    setBoard(r.board);
    setLimit(r.maxShiftMinutes);
    setStats(r.stats);
    setBoardError(r.error);
  }, []);

  // The clock ticks; the board refreshes every 20 seconds while the screen is showing.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1_000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh]);

  // Keep the screen awake on a tablet (where the browser allows it).
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<unknown> } };
    const ask = () => {
      if (document.visibilityState === "visible") nav.wakeLock?.request("screen").catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => document.removeEventListener("visibilitychange", ask);
  }, []);

  const show = useCallback((r: Result) => {
    setResult(r);
    beep(r.tone);
    if (r.tone === "in") setBurst((n) => n + 1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setResult(null), r.undo ? 7000 : r.tone === "auto" ? 8000 : 5000);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (autoSubmit.current) clearTimeout(autoSubmit.current);
      const typed = value.trim();
      setCode("");
      if (!typed || busy) return;
      setBusy(true);
      try {
        if (manager) {
          // The manager code on the locked tablet: right code → the dashboard.
          const u = await unlockTablet(typed);
          if (u.ok) {
            show({ tone: "note", title: "Unlocked", lines: ["Opening the dashboard…"] });
            router.push("/admin");
          } else {
            setShake((n) => n + 1);
            show({ tone: "error", title: "Still locked", lines: [u.error ?? "That isn't the manager code."] });
          }
          setManager(false);
          return;
        }
        const r = await punch(typed);
        if ("error" in r) {
          setShake((n) => n + 1);
          show({ tone: "error", title: r.code === "LOCKED" ? "Locked for now" : r.code === "NOT_FOUND" ? "Not found" : "Didn't save", lines: [r.error] });
        } else if (r.status === "pending") {
          show({ tone: "note", title: "Almost there", name: r.name, lines: ["Your account is waiting for a manager to approve it. Ask them, then try again."] });
        } else {
          const stats = [
            { label: "This week", value: formatMinutes(r.weekMinutes) },
            { label: "Discount", value: `${r.discountPct ?? 0}% off` },
            { label: "Store credit", value: formatCents(r.creditCents) },
          ];
          const next = r.next ? `Next shift: ${relativeDay(r.next.date)}, ${r.next.label} (${formatClock(r.next.startsAt)})` : null;
          if (r.status === "auto") {
            show({
              tone: "auto",
              title: "Already clocked out",
              name: r.name,
              lines: [
                `You were clocked out automatically at ${formatTime(r.out)}, after ${formatMinutes(minutesBetween(r.in, r.out))}.`,
                "Starting a new shift? Type your PIN again.",
              ],
              stats,
            });
          } else {
            show({
              tone: r.status,
              title: r.status === "in" ? "Clocked in" : "Clocked out",
              name: r.name,
              lines: [
                r.status === "in"
                  ? `Started at ${formatTime(r.in)}.${r.autoOutAt ? ` You'll be clocked out automatically at ${formatTime(r.autoOutAt)}.` : ""}`
                  : `Worked ${formatMinutes(minutesBetween(r.in, r.out))} · ${formatTime(r.in)} to ${formatTime(r.out ?? r.in)}`,
                ...(next ? [next] : []),
              ],
              stats,
              undo: { id: r.id, token: r.undo },
            });
          }
        }
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, manager, refresh, router, show],
  );

  const press = useCallback(
    (key: string) => {
      if (busy) return;
      if (autoSubmit.current) clearTimeout(autoSubmit.current);
      if (key === "clear") return setCode("");
      if (key === "back") return setCode((c) => c.slice(0, -1));
      if (key === "enter") return void submit(code);
      const next = (code + key).slice(0, 40);
      setCode(next);
      // PINs are 4 digits: go on our own after a short pause. (A badge scanner
      // types faster than that and keeps going, then presses Enter.)
      if (!manager && /^\d{4}$/.test(next)) autoSubmit.current = setTimeout(() => void submit(next), 400);
    },
    [busy, code, manager, submit],
  );

  // Typing on a keyboard, or a USB barcode scanner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (signupOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (result) {
        setResult(null);
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          return;
        }
        // Typing a digit closes the card and starts the next person's PIN.
        if (!/^[0-9]$/.test(e.key)) return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        press("enter");
      } else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
      else if (/^[0-9A-Za-z-]$/.test(e.key)) press(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, result, signupOpen]);

  const doUndo = async (u: { id: string; token: string }) => {
    const r = await undoPunch(u.id, u.token);
    if (r.error) show({ tone: "error", title: "Couldn't undo", lines: [r.error] });
    else show({ tone: "note", title: "Undone", lines: ["That punch was taken back."] });
    void refresh();
  };

  const time = now.toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit", second: "2-digit" });
  const [hms, ampm] = time.split(/\s/);
  const [hh, mm, ss] = mounted ? hms.split(":") : ["--", "--", "--"];

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ================= Keypad side ================= */}
      <section aria-label="Clock in or out" className="relative flex flex-col bg-[#17191c] px-5 pt-5 pb-8 text-white sm:px-8">

        <header className="flex items-center gap-3">
          <BrandMark size={40} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-base font-semibold">{brand.name}</p>
            <p className="text-sm text-white/55">Time clock</p>
          </div>
          {locked ? (
            <button
              type="button"
              onClick={() => {
                setManager(!manager);
                setCode("");
              }}
              aria-pressed={manager}
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none ${
                manager ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-white/85 hover:bg-white/10"
              }`}
            >
              <LockIcon className="size-4" /> {manager ? "Cancel" : "Manager"}
            </button>
          ) : (
            <Link
              href="/login?next=/admin"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
            >
              <LockIcon className="size-4" /> Manager
            </Link>
          )}
        </header>

        <dl className="mx-auto mt-6 grid w-full max-w-sm grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-3 text-center">
          {[
            { label: "On the clock", value: String(board.onClock.length) },
            { label: "Scheduled today", value: String(stats.scheduledToday) },
            { label: "Team this week", value: formatMinutes(stats.weekMinutes) },
          ].map((s) => (
            <div key={s.label}>
              <dd className="font-heading text-3xl leading-none font-bold tabular-nums">{s.value}</dd>
              <dt className="mt-1 text-xs text-white/55">{s.label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-1 flex-col items-center gap-5 lg:gap-4">
          <div className="text-center">
            <p className="flex items-start justify-center font-heading leading-none font-bold tabular-nums" suppressHydrationWarning>
              <span className="text-9xl text-white lg:text-8xl 2xl:text-[10rem]">
                {hh}
                <span className="text-white/80 motion-safe:animate-[clock-blink_1s_steps(1)_infinite]">:</span>
                {mm}
              </span>
              <span className="mt-2 ml-3 grid gap-1 text-left">
                <span className="w-10 text-4xl text-primary">{ss}</span>
                <span className="text-2xl text-white/55">{mounted ? ampm : ""}</span>
              </span>
            </p>
            <p className="mt-3 text-base text-white/60" suppressHydrationWarning>
              {mounted ? now.toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "long", month: "long", day: "numeric" }) : "\u00a0"}
            </p>
          </div>

          <div className="grid justify-items-center gap-3">
            <p className={`text-lg font-semibold ${manager ? "text-primary" : ""}`}>{manager ? "Manager code" : "Enter your PIN"}</p>
            {manager && <p className="-mt-2 text-sm text-white/60">Type your code, then Enter, to open the dashboard.</p>}
            <div key={shake} aria-live="polite" className={`flex h-8 items-center gap-4 ${shake ? "animate-[clock-shake_0.35s]" : ""}`}>
              {code.length > 6 ? (
                <span className="font-receipt text-xl tracking-[0.3em]">{"•".repeat(Math.min(code.length, 14))}</span>
              ) : (
                Array.from({ length: Math.max(4, code.length) }, (_, i) => (
                  <span
                    key={i}
                    className={`size-4 rounded-full transition-all duration-150 ${
                      i < code.length ? "bg-primary" : "border-2 border-white/25"
                    }`}
                  />
                ))
              )}
              <span className="sr-only">{code.length} digits typed</span>
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => press(k)}
                aria-label={k === "clear" ? "Clear" : k === "back" ? "Delete one digit" : k}
                className={`grid h-16 touch-manipulation place-items-center rounded-lg bg-white/[0.07] text-3xl font-medium tabular-nums transition-colors select-none hover:bg-white/[0.11] active:bg-white/20 focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none disabled:opacity-50 lg:h-14 2xl:h-[4.5rem] ${
                  k === "clear" ? "text-base text-white/70" : ""
                }`}
              >
                {k === "clear" ? "Clear" : k === "back" ? <DeleteIcon className="size-7" /> : k}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || code.length === 0}
            onClick={() => press("enter")}
            className="flex h-16 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-primary text-xl font-semibold text-primary-foreground transition hover:brightness-105 active:translate-y-px focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none disabled:bg-white/[0.07] disabled:text-white/35"
          >
            {busy ? <Loader2Icon className="size-7 animate-spin" /> : "Enter"}
          </button>

          <p className="max-w-xs text-center text-sm text-white/55">
            The same PIN clocks you in and out.
            {limit > 0 && ` Shifts end on their own after ${formatMinutes(limit)}.`}
          </p>

          <div className="mt-auto grid w-full max-w-sm gap-2">
            <button
              type="button"
              onClick={() => setSignupOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-3 font-medium text-white/85 transition hover:bg-white/[0.06] focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
            >
              <UserPlusIcon className="size-5" /> New here? Create account
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-white/50">
              <SmartphoneIcon className="size-3.5" /> Clock in from your phone: open <strong className="text-white/70">/work</strong> on the store site
            </p>
          </div>
        </div>
      </section>

      {/* ================= Who's working ================= */}
      <div className="grid content-start gap-4 bg-[#f1f2ee] p-5 sm:p-8 dark:bg-background">
        {boardError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" /> {boardError}
          </p>
        )}
        <OnClock board={board} now={now} limit={limit} />
        <Upcoming board={board} />
        <TodayDone board={board} />
      </div>

      {result && <ResultCard result={result} onClose={() => setResult(null)} onUndo={doUndo} />}
      {signupOpen && (
        <SignUp
          approval={board.signupApproval}
          onClose={() => setSignupOpen(false)}
          onDone={(r) => {
            setSignupOpen(false);
            show(r);
            void refresh();
          }}
        />
      )}
      <Confetti burst={burst} colors={CONFETTI} />
      <style>{`
        @keyframes clock-shake{25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-4px)}}
        @keyframes clock-blink{50%{opacity:.25}}
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- boards */

function Panel({ title, icon: Icon, aside, children }: { title: string; icon: LucideIcon; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {aside}
      </div>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

function OnClock({ board, now, limit }: { board: ClockBoard; now: Date; limit: number }) {
  const people = board.onClock;
  return (
    <Panel
      title="On the clock"
      icon={TimerIcon}
      aside={
        <span className={`text-sm font-medium tabular-nums ${people.length ? "text-success" : "text-muted-foreground"}`}>
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      }
    >
      {people.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nobody is clocked in right now.</p>
      ) : (
        <ul className="-my-1 divide-y">
          {people.map((p) => {
            const mins = minutesBetween(p.in, null, now.getTime());
            const out = autoOutAt(p.in, limit);
            const pct = limit > 0 ? Math.min(100, (mins / limit) * 100) : 0;
            return (
              <li key={`${p.name}-${p.in}`} className="flex items-center gap-3 py-3">
                <Avatar name={p.name} size={40} ring="on" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="font-semibold tabular-nums">{formatMinutes(mins)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0">in {formatTime(p.in)}</span>
                    {out && (
                      <>
                        <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className={`block h-full rounded-full ${pct > 85 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.max(4, pct)}%` }} />
                        </span>
                        <span className="shrink-0">out {formatTime(out)}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The schedule from now on, grouped by day and class hour. */
function Upcoming({ board }: { board: ClockBoard }) {
  const today = storeToday();
  type Hour = { label: string; startsAt: string; names: string[] };
  const days = new Map<string, Map<string, Hour>>();
  for (const u of board.upcoming) {
    const day = days.get(u.date) ?? new Map<string, Hour>();
    const key = `${u.startsAt}|${u.label}`;
    const hour = day.get(key) ?? { label: u.label, startsAt: u.startsAt, names: [] };
    hour.names.push(u.name);
    day.set(key, hour);
    days.set(u.date, day);
  }
  const shown = [...days.entries()].slice(0, 4);
  const onNow = new Set(board.onClock.map((p) => p.name));

  return (
    <Panel title="Up next" icon={CalendarClockIcon}>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing on the schedule yet.</p>
      ) : (
        <div className="grid gap-4 py-1">
          {shown.map(([date, hours]) => (
            <div key={date}>
              <p className="mb-1 text-sm font-semibold">{relativeDay(date, today)}</p>
              <ol className="divide-y">
                {[...hours.values()].map((h) => (
                  <li key={h.label}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                      <span className="w-20 shrink-0">
                        <span className="block text-sm font-medium">{h.label}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{formatClock(h.startsAt)}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {h.names.map((n) => (
                          <span key={n} className="inline-flex items-center gap-1.5 py-0.5 pr-2 text-sm">
                            <Avatar name={n} size={22} />
                            {n}
                            {date === today && onNow.has(n) && <CheckIcon className="size-3.5 text-success" aria-label="clocked in" />}
                          </span>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TodayDone({ board }: { board: ClockBoard }) {
  if (board.today.length === 0) return null;
  const total = board.today.reduce((t, s) => t + minutesBetween(s.in, s.out), 0);
  return (
    <Panel title="Done today" icon={CheckIcon} aside={<span className="text-sm text-muted-foreground tabular-nums">{formatMinutes(total)} worked</span>}>
      <ul className="-my-1 divide-y">
        {board.today.slice(0, 8).map((s) => (
          <li key={`${s.name}-${s.in}`} className="flex items-center gap-3 py-2 text-sm">
            <Avatar name={s.name} size={28} />
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="text-muted-foreground">
              {formatTime(s.in)} – {formatTime(s.out)}
            </span>
            <span className="w-16 text-right font-semibold tabular-nums">{formatMinutes(minutesBetween(s.in, s.out))}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------------------------------------------------------- result */

const TONES: Record<Result["tone"], { card: string; icon: LucideIcon; badge: string }> = {
  in: { card: "bg-success text-white", icon: LogInIcon, badge: "bg-white/20" },
  out: { card: "bg-[#17191c] text-white", icon: LogOutIcon, badge: "bg-primary text-primary-foreground" },
  auto: { card: "bg-card text-foreground border-2 border-warning", icon: AlarmClockOffIcon, badge: "bg-warning/15 text-warning" },
  note: { card: "bg-card text-foreground border-2 border-success", icon: SparklesIcon, badge: "bg-success/15 text-success" },
  error: { card: "bg-card text-foreground border-2 border-destructive", icon: CircleAlertIcon, badge: "bg-destructive/10 text-destructive" },
};

function ResultCard({ result, onClose, onUndo }: { result: Result; onClose: () => void; onUndo: (u: { id: string; token: string }) => void }) {
  const t = TONES[result.tone];
  const Icon = t.icon;
  const light = result.tone === "in" || result.tone === "out";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div
        role="status"
        onClick={(e) => e.stopPropagation()}
        className={`grid w-full max-w-lg justify-items-center gap-3 rounded-xl p-8 text-center shadow-2xl ${t.card}`}
      >
        <span className={`grid size-12 place-items-center rounded-full ${t.badge}`}>
          <Icon className="size-6" />
        </span>
        <p className="font-heading text-6xl leading-none font-bold sm:text-7xl">{result.title}</p>
        {result.name && <p className="text-2xl font-semibold">{result.name}</p>}
        {result.lines.map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg" : "text-base opacity-85"}>
            {l}
          </p>
        ))}
        {result.stats && (
          <dl className={`mt-3 grid w-full grid-cols-3 divide-x border-y py-3 ${light ? "divide-white/20 border-white/20" : ""}`}>
            {result.stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse px-2">
                <dt className="mt-1 text-xs opacity-75">{s.label}</dt>
                <dd className="font-heading text-3xl leading-none font-bold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {result.undo && (
            <button type="button" onClick={() => onUndo(result.undo!)} className="h-12 rounded-lg border border-current px-6 font-semibold opacity-90 hover:opacity-100">
              Undo
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className={`h-12 rounded-lg px-8 font-semibold ${light ? "bg-white text-neutral-950" : "bg-foreground text-background"}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sign-up */

function SignUp({ approval, onClose, onDone }: { approval: boolean; onClose: () => void; onDone: (r: Result) => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [badge, setBadge] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggest = () => {
    let p = "";
    do p = String(1000 + Math.floor(Math.random() * 9000));
    while (/(\d)\1\1/.test(p) || "0123456789".includes(p) || "9876543210".includes(p));
    setPin(p);
    setPin2(p);
    setShowPin(true);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter your name.");
    if (!/^\d{4}$/.test(pin)) return setError("Your PIN must be exactly 4 numbers.");
    if (pin !== pin2) return setError("The two PINs don't match. Type them again.");
    setSaving(true);
    const r = await signUp({ name, pin, badge });
    setSaving(false);
    if (r.error || !r.ok) return setError(r.error ?? "Couldn't save. Try again.");
    onDone({
      tone: "note",
      title: r.pending ? "Account made" : "You're all set",
      name: r.name,
      lines: r.pending
        ? ["A manager needs to approve you before your first clock-in.", "Remember your PIN! You'll also use it to sign in to the app at /work."]
        : ["Type your PIN on the keypad to clock in.", "Remember your PIN! You'll also use it to sign in to the app at /work."],
    });
  };

  const field = "h-12 w-full rounded-xl border bg-background px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="grid w-full max-w-md gap-4 rounded-xl border bg-card p-6 shadow-2xl sm:p-8"
        aria-labelledby="signup-title"
      >
        <div className="flex items-start gap-3">
          <div>
            <h2 id="signup-title" className="text-2xl font-semibold">
              Create your account
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a 4-digit PIN you&apos;ll remember. You type it every time you clock in and out.
              {approval && " A manager approves new accounts."}
            </p>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Your name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="First name and last initial" autoComplete="off" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            PIN
            <input
              className={`${field} text-center font-receipt tracking-[0.4em]`}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Type it again
            <input
              className={`${field} text-center font-receipt tracking-[0.4em]`}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={4}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
            />
          </label>
        </div>
        <button type="button" onClick={suggest} className="justify-self-start text-sm font-semibold text-ember-ink underline underline-offset-4">
          Pick a PIN for me
        </button>
        <label className="grid gap-1.5 text-sm font-semibold">
          Student ID # <span className="font-normal text-muted-foreground">(optional, so you can scan your ID card)</span>
          <input className={field} value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={40} autoComplete="off" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border px-5 font-semibold hover:bg-muted">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
            {saving && <Loader2Icon className="size-4 animate-spin" />} Create account
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- sound */

let audio: AudioContext | null = null;

/** A short beep: two notes up for in, down for out, one low note for a problem. */
function beep(tone: Result["tone"]) {
  try {
    const W = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    const notes = tone === "in" ? [660, 880] : tone === "out" ? [880, 600] : tone === "error" ? [220] : [740];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.12;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.17);
    });
  } catch {
    // No sound on this device: that's fine.
  }
}
