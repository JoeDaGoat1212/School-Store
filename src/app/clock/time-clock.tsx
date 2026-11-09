"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClockIcon, DeleteIcon, Loader2Icon, LockIcon, type LucideIcon, TimerIcon, UserPlusIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { formatCents, formatClock, formatTime, relativeDay, STORE_TIMEZONE, storeToday } from "@/lib/format";
import { type ClockBoard, formatMinutes, minutesBetween } from "@/lib/staff";
import { loadBoard, punch, signUp, undoPunch } from "./actions";

/*
 * The time clock screen: a big keypad on the left, who's working and the
 * schedule on the right. Built for a tablet on the counter, but a laptop works
 * too: type the PIN on the keyboard, or plug in a USB barcode scanner and scan
 * a student ID (the scanner "types" the number and presses Enter).
 */

type Result = {
  tone: "in" | "out" | "note" | "error";
  title: string;
  name?: string;
  lines: string[];
  undo?: { id: string; token: string };
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function TimeClock({ initialBoard, initialError }: { initialBoard: ClockBoard; initialError?: string }) {
  const [board, setBoard] = useState(initialBoard);
  const [boardError, setBoardError] = useState(initialError);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [shake, setShake] = useState(0);
  const autoSubmit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await loadBoard();
    setBoard(r.board);
    setBoardError(r.error);
  }, []);

  // The clock ticks, and the board refreshes every 20 seconds while the screen is showing.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 10_000);
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
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setResult(null), r.undo ? 7000 : 4500);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (autoSubmit.current) clearTimeout(autoSubmit.current);
      const typed = value.trim();
      setCode("");
      if (!typed || busy) return;
      setBusy(true);
      try {
        const r = await punch(typed);
        if ("error" in r) {
          setShake((n) => n + 1);
          show({ tone: "error", title: r.code === "LOCKED" ? "Locked for now" : r.code === "NOT_FOUND" ? "Not found" : "Didn't save", lines: [r.error] });
        } else if (r.status === "pending") {
          show({ tone: "note", title: "Almost there", name: r.name, lines: ["Your account is waiting for a manager to approve it. Ask them, then try again."] });
        } else {
          const next = r.next ? `Next shift: ${relativeDay(r.next.date)}, ${r.next.label} (${formatClock(r.next.startsAt)})` : null;
          const credit = `Employee discount: ${r.discountPct ?? 0}% off · Store credit: ${formatCents(r.creditCents)}`;
          show({
            tone: r.status,
            title: r.status === "in" ? "Clocked in" : "Clocked out",
            name: r.name,
            lines: [
              r.status === "in"
                ? `Started at ${formatTime(r.in)}. Have a good shift!`
                : `Worked ${formatMinutes(minutesBetween(r.in, r.out))} · ${formatTime(r.in)} to ${formatTime(r.out ?? r.in)}`,
              `This week: ${formatMinutes(r.weekMinutes)}`,
              credit,
              ...(next ? [next] : []),
            ],
            undo: { id: r.id, token: r.undo },
          });
        }
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, show],
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
      if (/^\d{4}$/.test(next)) autoSubmit.current = setTimeout(() => void submit(next), 400);
    },
    [busy, code, submit],
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

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div className="leading-tight">
            <p className="font-heading text-2xl font-bold tracking-wide uppercase">{brand.name}</p>
            <p className="text-sm text-muted-foreground">Employee time clock</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {boardError && <p className="max-w-md text-sm font-semibold text-destructive">{boardError}</p>}
          <Link
            href="/admin/staff"
            className="inline-flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <LockIcon className="size-4" /> Manager
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ---- Keypad ---- */}
        <section aria-label="Clock in or out" className="flex flex-col items-center gap-5 rounded-3xl border bg-card p-6 shadow-soft">
          <div className="text-center">
            <p className="font-heading text-7xl leading-none font-bold tabular-nums sm:text-8xl" suppressHydrationWarning>
              {now.toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit" })}
            </p>
            <p className="mt-2 font-medium text-muted-foreground" suppressHydrationWarning>
              {now.toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>

          <div className="text-center">
            <p className="text-lg font-bold">Enter your PIN</p>
            <p className="text-sm text-muted-foreground">or scan your student ID</p>
          </div>

          <div key={shake} aria-live="polite" className={`flex h-8 items-center gap-3 ${shake ? "animate-[clock-shake_0.35s]" : ""}`}>
            {code.length > 6 ? (
              <span className="font-receipt text-xl tracking-[0.3em]">{"•".repeat(Math.min(code.length, 14))}</span>
            ) : (
              Array.from({ length: Math.max(4, code.length) }, (_, i) => (
                <span key={i} className={`size-5 rounded-full border-[2.5px] ${i < code.length ? "border-foreground bg-foreground" : "border-muted-foreground"}`} />
              ))
            )}
            <span className="sr-only">{code.length} digits typed</span>
          </div>

          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => press(k)}
                aria-label={k === "clear" ? "Clear" : k === "back" ? "Delete one digit" : k}
                className={`grid h-18 touch-manipulation place-items-center rounded-2xl border bg-background text-3xl font-bold tabular-nums transition select-none hover:bg-muted active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 ${
                  k === "clear" ? "text-base font-semibold text-muted-foreground" : ""
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
            className="flex h-16 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-primary font-heading text-3xl font-bold tracking-wide text-primary-foreground uppercase transition hover:bg-primary/85 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2Icon className="size-7 animate-spin" /> : "Enter"}
          </button>

          <p className="max-w-xs text-center text-sm text-muted-foreground">
            The same PIN clocks you in and out. Tap Undo if you hit it by mistake. On your phone? Open <strong>/work</strong> on this site to get the app.
          </p>

          <button
            type="button"
            onClick={() => setSignupOpen(true)}
            className="mt-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 font-semibold hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <UserPlusIcon className="size-5" /> New here? Create account
          </button>
        </section>

        {/* ---- Who's working ---- */}
        <div className="grid content-start gap-6">
          <OnClock board={board} now={now} />
          <Upcoming board={board} />
          <TodayDone board={board} />
        </div>
      </main>

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
      <style>{`@keyframes clock-shake{25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-4px)}}`}</style>
    </div>
  );
}

/* ---------------------------------------------------------------- boards */

function Panel({ title, icon: Icon, aside, children }: { title: string; icon: LucideIcon; aside?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-wide uppercase">
          <Icon className="size-5 text-ember-ink" /> {title}
        </h2>
        {aside && <span className="font-receipt text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function OnClock({ board, now }: { board: ClockBoard; now: Date }) {
  const people = board.onClock;
  return (
    <Panel title="On the clock" icon={TimerIcon} aside={`${people.length} ${people.length === 1 ? "person" : "people"}`}>
      {people.length === 0 ? (
        <p className="text-muted-foreground">Nobody is clocked in right now.</p>
      ) : (
        <ul className="divide-y divide-dashed">
          {people.map((p) => (
            <li key={`${p.name}-${p.in}`} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-success ring-4 ring-success/20" />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <span className="text-sm text-muted-foreground">since {formatTime(p.in)}</span>
              <span className="w-16 text-right font-receipt font-bold tabular-nums">{formatMinutes(minutesBetween(p.in, null, now.getTime()))}</span>
            </li>
          ))}
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
  const shown = [...days.entries()].slice(0, 5);

  return (
    <Panel title="Upcoming shifts" icon={CalendarClockIcon}>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">Nothing on the schedule yet.</p>
      ) : (
        <div className="grid gap-4">
          {shown.map(([date, hours]) => (
            <div key={date}>
              <p className={`mb-1.5 text-sm font-bold tracking-wide uppercase ${date === today ? "text-ember-ink" : "text-muted-foreground"}`}>{relativeDay(date, today)}</p>
              <ul className="grid gap-1.5">
                {[...hours.values()].map((h) => (
                  <li key={h.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-muted/60 px-3 py-2">
                    <span className="w-20 shrink-0 font-semibold">{h.label}</span>
                    <span className="w-16 shrink-0 font-receipt text-sm text-muted-foreground">{formatClock(h.startsAt)}</span>
                    <span className="min-w-0 flex-1">{h.names.join(", ")}</span>
                  </li>
                ))}
              </ul>
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
    <Panel title="Done today" icon={TimerIcon} aside={`${formatMinutes(total)} worked`}>
      <ul className="divide-y divide-dashed">
        {board.today.slice(0, 8).map((s) => (
          <li key={`${s.name}-${s.in}`} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
            <span className="text-muted-foreground">
              {formatTime(s.in)} – {formatTime(s.out)}
            </span>
            <span className="w-16 text-right font-receipt font-bold tabular-nums">{formatMinutes(minutesBetween(s.in, s.out))}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------------------------------------------------------- result */

function ResultCard({ result, onClose, onUndo }: { result: Result; onClose: () => void; onUndo: (u: { id: string; token: string }) => void }) {
  const colors =
    result.tone === "in"
      ? "bg-success text-white"
      : result.tone === "out"
        ? "bg-destructive text-white"
        : result.tone === "error"
          ? "border-2 border-destructive bg-card text-foreground"
          : "border-2 border-success bg-card text-foreground";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        role="status"
        onClick={(e) => e.stopPropagation()}
        className={`grid w-full max-w-lg gap-2 rounded-3xl p-8 text-center shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 ${colors}`}
      >
        <p className="font-heading text-6xl leading-none font-bold tracking-wide uppercase">{result.title}</p>
        {result.name && <p className="text-2xl font-bold">{result.name}</p>}
        {result.lines.map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg" : "text-base opacity-90"}>
            {l}
          </p>
        ))}
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {result.undo && (
            <button type="button" onClick={() => onUndo(result.undo!)} className="rounded-full border-2 border-current px-5 py-2.5 font-bold">
              Undo
            </button>
          )}
          <button type="button" autoFocus onClick={onClose} className="rounded-full border-2 border-current px-5 py-2.5 font-bold">
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
        ? ["A manager needs to approve you before your first clock-in.", "Remember your PIN!"]
        : ["Type your PIN on the keypad to clock in.", "Remember your PIN!"],
    });
  };

  const field = "h-12 w-full rounded-xl border bg-background px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="grid w-full max-w-md gap-4 rounded-3xl border bg-card p-6 shadow-2xl"
        aria-labelledby="signup-title"
      >
        <div>
          <h2 id="signup-title" className="font-heading text-3xl font-bold tracking-wide uppercase">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a 4-digit PIN you&apos;ll remember. You type it every time you clock in and out.
            {approval && " A manager approves new accounts."}
          </p>
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
        <button type="button" onClick={suggest} className="justify-self-start text-sm font-semibold text-muted-foreground underline underline-offset-4">
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
