"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, Loader2Icon, LogOutIcon, SmartphoneIcon, TimerIcon, WalletIcon } from "lucide-react";
import { formatCents, formatClock, formatDay, formatTime, relativeDay, STORE_TIMEZONE, storeToday } from "@/lib/format";
import { creditRuleText, formatMinutes, minutesBetween, nextReward, type PortalData, shortMoney } from "@/lib/staff";
import { loadPortal, phonePunch, phoneUndo, signOut } from "./actions";

type Note = { tone: "in" | "out" | "error"; text: string; undo?: { id: string; token: string } };

/** One employee's own screen: clock in/out, live shift timer, discount, credit, schedule. */
export function Portal({ initial }: { initial: PortalData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
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

  // This week's minutes keep counting up while they're on the clock.
  const live = data.open ? Math.max(0, Math.floor((now - loadedAt) / 60000)) : 0;
  const weekMinutes = data.weekMinutes + live;
  const rule = data.rule;
  const discount = Math.min(Math.floor(weekMinutes / 60), rule.afterHours) * rule.pct;
  const hoursPast = Math.max(0, Math.floor(weekMinutes / 60) - rule.afterHours);
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
      setNote({
        tone: r.status,
        text:
          r.status === "in"
            ? `Clocked in at ${formatTime(r.in)}.`
            : `Clocked out. You worked ${formatMinutes(minutesBetween(r.in, r.out))} (${formatTime(r.in)} – ${formatTime(r.out ?? r.in)}).`,
        undo: { id: r.id, token: r.undo },
      });
      buzz();
      await refresh();
    });

  const undo = (u: { id: string; token: string }) =>
    start(async () => {
      const r = await phoneUndo(u.id, u.token);
      setNote(r.error ? { tone: "error", text: r.error } : null);
      await refresh();
    });

  const elapsed = data.open ? Math.max(0, Math.floor((now - new Date(data.open.in).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const nowDate = new Date(now);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">Hi, {data.name.split(" ")[0]}</h1>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await signOut();
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
        >
          <LogOutIcon className="size-4" /> Sign out
        </button>
      </div>

      {/* ---- Clock in / out ---- */}
      <section aria-label="Time clock" className={`grid gap-4 rounded-3xl border p-5 shadow-soft ${data.open ? "border-success/50 bg-success/5" : "bg-card"}`}>
        <div className="flex items-center gap-3">
          <span aria-hidden className={`size-3 rounded-full ${data.open ? "animate-pulse bg-success" : "bg-muted-foreground/40"}`} />
          <p className="flex-1 font-semibold">{data.open ? `On the clock since ${formatTime(data.open.in)}` : "Off the clock"}</p>
          {data.open && <p className="font-receipt text-2xl font-bold tabular-nums">{clock}</p>}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={punch}
          className={`flex h-20 items-center justify-center gap-3 rounded-2xl font-heading text-3xl font-bold tracking-wide text-white uppercase shadow-sm transition active:scale-[0.98] disabled:opacity-60 ${
            data.open ? "bg-destructive" : "bg-success"
          }`}
        >
          {busy ? <Loader2Icon className="size-7 animate-spin" /> : <TimerIcon className="size-7" />}
          {data.open ? "Clock out" : "Clock in"}
        </button>
        {note && (
          <div
            role="status"
            className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${note.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-background"}`}
          >
            <span className="flex-1">{note.text}</span>
            {note.undo && (
              <button type="button" onClick={() => undo(note.undo!)} className="font-bold underline underline-offset-4">
                Undo
              </button>
            )}
          </div>
        )}
      </section>

      {/* ---- Discount: show this at the window ---- */}
      <section aria-labelledby="discount" className="overflow-hidden rounded-3xl bg-foreground text-background shadow-soft">
        <div className="relative p-5">
          {/* Moving stripes and a ticking clock: a screenshot won't look live. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-15 motion-safe:animate-[work-stripes_6s_linear_infinite]" style={stripes} />
          <p id="discount" className="relative text-xs font-bold tracking-widest uppercase opacity-80">
            Employee discount · show at the window
          </p>
          <p className="relative mt-1 font-heading text-6xl font-extrabold tracking-tight text-primary">{discount > 0 ? `${discount}% off` : "0%"}</p>
          <p className="relative mt-1 text-lg font-semibold">{data.name}</p>
          <p className="relative font-receipt text-sm opacity-80 tabular-nums">
            {nowDate.toLocaleDateString("en-US", { timeZone: STORE_TIMEZONE, weekday: "short", month: "short", day: "numeric" })} ·{" "}
            {nowDate.toLocaleTimeString("en-US", { timeZone: STORE_TIMEZONE, hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </p>
          {discount === 0 && <p className="relative mt-2 text-sm opacity-90">Work an hour this week to get {rule.pct}% off.</p>}
        </div>
      </section>

      {/* ---- This week ---- */}
      <section aria-labelledby="week" className="grid gap-3 rounded-3xl border bg-card p-5 shadow-soft">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week" className="font-heading text-xl font-bold">
            This week
          </h2>
          <p className="font-receipt text-lg font-bold tabular-nums">{formatMinutes(weekMinutes)}</p>
        </div>
        <ol className="grid grid-cols-5 gap-1.5" aria-label={`Discount hours: ${Math.min(Math.floor(weekMinutes / 60), rule.afterHours)} of ${rule.afterHours}`}>
          {Array.from({ length: rule.afterHours }, (_, i) => {
            const done = Math.floor(weekMinutes / 60) > i;
            const current = Math.floor(weekMinutes / 60) === i;
            return (
              <li key={i} className="grid gap-1 text-center">
                <span className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${done ? "bg-primary" : "bg-primary/50"}`}
                    style={{ width: done ? "100%" : current ? `${(intoHour / 60) * 100}%` : "0%" }}
                  />
                </span>
                <span className={`text-xs font-semibold ${done ? "" : "text-muted-foreground"}`}>{(i + 1) * rule.pct}%</span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm">
          {Math.floor(weekMinutes / 60) < rule.afterHours ? (
            <>
              <strong>{60 - intoHour} min</strong> more for {nextReward(weekMinutes, rule)}.
            </>
          ) : (
            <>
              Past {rule.afterHours} hours: <strong>{hoursPast}</strong> hour{hoursPast === 1 ? "" : "s"} toward credit this week ({shortMoney(hoursPast * rule.cents)}).{" "}
              <strong>{60 - intoHour} min</strong> more for {nextReward(weekMinutes, rule)}.
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{creditRuleText(rule)}</p>
      </section>

      {/* ---- Store credit ---- */}
      <section aria-labelledby="credit" className="grid gap-3 rounded-3xl border bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 id="credit" className="flex items-center gap-2 font-heading text-xl font-bold">
            <WalletIcon className="size-5 text-ember-ink" /> Store credit
          </h2>
          <p className="font-heading text-3xl font-extrabold tabular-nums">{formatCents(data.creditCents)}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Earned {formatCents(data.earnedCents)} so far. Credit is added when you clock out; tell the person at the window you&apos;re using it.
        </p>
        {data.credit.length > 0 && (
          <ul className="divide-y text-sm">
            {data.credit.map((c, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className={`w-16 font-bold tabular-nums ${c.cents < 0 ? "text-destructive" : "text-success"}`}>
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

      {/* ---- My schedule ---- */}
      <section aria-labelledby="schedule" className="grid gap-3 rounded-3xl border bg-card p-5 shadow-soft">
        <h2 id="schedule" className="flex items-center gap-2 font-heading text-xl font-bold">
          <CalendarClockIcon className="size-5 text-ember-ink" /> My schedule
        </h2>
        {data.schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;re not on the schedule yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {data.schedule.map((s) => (
              <li key={`${s.date}-${s.label}`} className="flex items-baseline gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-semibold">{relativeDay(s.date)}</span>
                <span className="flex-1">{s.label}</span>
                <span className="font-receipt text-muted-foreground">{formatClock(s.startsAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- My shifts ---- */}
      <section aria-labelledby="shifts" className="grid gap-3 rounded-3xl border bg-card p-5 shadow-soft">
        <h2 id="shifts" className="flex items-center gap-2 font-heading text-xl font-bold">
          <TimerIcon className="size-5 text-ember-ink" /> My shifts
        </h2>
        {data.shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shifts yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.shifts.map((s) => (
              <li key={s.in} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 font-semibold">{formatDay(storeToday(new Date(s.in)))}</span>
                <span className="flex-1 text-muted-foreground">
                  {formatTime(s.in)} – {s.out ? formatTime(s.out) : "now"}
                  {s.phone && <SmartphoneIcon aria-label="from a phone" className="ml-1.5 inline size-3.5" />}
                </span>
                <span className="font-receipt font-bold tabular-nums">{formatMinutes(minutesBetween(s.in, s.out, now))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`@keyframes work-stripes{from{background-position:0 0}to{background-position:56px 0}}`}</style>
    </div>
  );
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
