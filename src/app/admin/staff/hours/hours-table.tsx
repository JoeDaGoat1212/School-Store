"use client";

import { useState, useTransition } from "react";
import { AlarmClockOffIcon, DownloadIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay, formatTime, storeToday } from "@/lib/format";
import { formatMinutes, hoursDecimal, minutesBetween, toLocalInput } from "@/lib/staff";
import { addShift, clockOutEveryone, clockOutShift, deleteShift, editShift, saveShiftLimit } from "../actions";

type Shift = { id: string; staffId: string | null; name: string; clockIn: string; clockOut: string | null; manual: boolean; phone: boolean; auto: boolean };

const LONG_SHIFT = 8 * 60; // longer than this usually means someone forgot to clock out

/** On the clock now, totals, the add-a-shift form and every shift in the period. */
export function HoursTable({
  period,
  fileName,
  now,
  shifts,
  open,
  employees,
  defaultDate,
  shiftLimit,
}: {
  period: string;
  fileName: string;
  now: number;
  shifts: Shift[];
  open: Shift[];
  employees: { id: string; name: string }[];
  defaultDate: string;
  /** Minutes before a shift ends on its own (0 = off; null before database update 17). */
  shiftLimit: number | null;
}) {
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const run = (job: () => Promise<{ ok?: true; error?: string }>, message: string, after?: () => void) =>
    start(async () => {
      const r = await job();
      if (r.error) toast.error(r.error);
      else {
        toast.success(message);
        after?.();
      }
    });

  const mins = (s: Shift) => minutesBetween(s.clockIn, s.clockOut, now);
  const totals = new Map<string, { name: string; minutes: number; count: number; on: boolean }>();
  for (const s of shifts) {
    const key = s.staffId ?? `gone:${s.name}`;
    const t = totals.get(key) ?? { name: s.name, minutes: 0, count: 0, on: false };
    t.minutes += mins(s);
    t.count += 1;
    t.on ||= !s.clockOut;
    totals.set(key, t);
  }
  const people = [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  const all = people.reduce((t, p) => t + p.minutes, 0);

  const download = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Employee", "Date", "Clock in", "Clock out", "Hours", "Minutes", "Edited by staff", "From a phone", "Auto clock-out"].map(q).join(",")];
    for (const s of [...shifts].reverse()) {
      lines.push(
        [s.name, storeToday(new Date(s.clockIn)), formatTime(s.clockIn), s.clockOut ? formatTime(s.clockOut) : "still on", hoursDecimal(mins(s)), mins(s), s.manual ? "yes" : "", s.phone ? "yes" : "", s.auto ? "yes" : ""]
          .map(q)
          .join(","),
      );
    }
    lines.push("", q("Totals"));
    for (const p of [...people].sort((a, b) => a.name.localeCompare(b.name))) lines.push([p.name, "", "", "", hoursDecimal(p.minutes), p.minutes].map(q).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="grid gap-6">
      {/* ---- On the clock now ---- */}
      {open.length > 0 && (
        <section aria-labelledby="on-now" className="rounded-2xl border border-success/40 bg-success/5 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="on-now" className="font-heading text-lg font-bold">
              On the clock now ({open.length})
            </h2>
            {confirm === "all" ? (
              <span className="flex items-center gap-2 text-sm">
                Clock out all {open.length}?
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(clockOutEveryone, "Everyone is clocked out", () => setConfirm(null))}>
                  Yes, clock out
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirm("all")}>
                Clock everyone out
              </Button>
            )}
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                <span className="text-muted-foreground">
                  {formatTime(s.clockIn)} · {formatMinutes(mins(s))}
                </span>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => run(() => clockOutShift(s.id), `${s.name} clocked out`)}>
                  Clock out
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Totals ---- */}
      <section aria-labelledby="totals" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="totals" className="font-heading text-lg font-bold">
            {period}
          </h2>
          <Button variant="outline" size="lg" onClick={download} disabled={shifts.length === 0}>
            <DownloadIcon /> Download for payroll (CSV)
          </Button>
        </div>
        {people.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-muted-foreground">No shifts in this period.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <li className="rounded-2xl border border-primary/50 bg-primary/5 p-4">
              <p className="font-semibold">Everyone</p>
              <p className="font-heading text-2xl font-bold tabular-nums">{hoursDecimal(all)} h</p>
              <p className="text-xs text-muted-foreground">
                {shifts.length} shift{shifts.length === 1 ? "" : "s"}
              </p>
            </li>
            {people.map((p) => (
              <li key={p.name} className="rounded-2xl border bg-card p-4 shadow-soft">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="font-heading text-2xl font-bold tabular-nums">{hoursDecimal(p.minutes)} h</p>
                <p className="text-xs text-muted-foreground">
                  {p.count} shift{p.count === 1 ? "" : "s"}
                  {p.on && " · on now"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Automatic clock-out ---- */}
      {shiftLimit !== null && <ShiftLimit minutes={shiftLimit} busy={busy} run={run} />}

      {/* ---- Add a shift by hand ---- */}
      <AddShift employees={employees} defaultDate={defaultDate} busy={busy} run={run} />

      {/* ---- Every shift ---- */}
      {shifts.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="p-3">Employee</th>
                <th className="p-3">Date</th>
                <th className="p-3">In</th>
                <th className="p-3">Out</th>
                <th className="p-3 text-right">Hours</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) =>
                editing === s.id ? (
                  <EditRow key={s.id} shift={s} busy={busy} onCancel={() => setEditing(null)} run={run} onSaved={() => setEditing(null)} />
                ) : (
                  <tr key={s.id} className="border-b last:border-b-0">
                    <td className="p-3">
                      <span className="font-semibold">{s.name}</span>{" "}
                      {!s.clockOut ? (
                        <Pill tone="good">On now</Pill>
                      ) : mins(s) > LONG_SHIFT ? (
                        <Pill tone="bad">Check: over 8 hours</Pill>
                      ) : s.manual ? (
                        <Pill>Edited</Pill>
                      ) : null}
                      {s.phone && <Pill>Phone</Pill>}
                      {s.auto && <Pill tone="warn">Auto clock-out</Pill>}
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDay(storeToday(new Date(s.clockIn)))}</td>
                    <td className="p-3 font-receipt whitespace-nowrap">{formatTime(s.clockIn)}</td>
                    <td className="p-3 font-receipt whitespace-nowrap">{s.clockOut ? formatTime(s.clockOut) : "—"}</td>
                    <td className="p-3 text-right font-receipt font-bold tabular-nums">{hoursDecimal(mins(s))}</td>
                    <td className="p-3">
                      {confirm === s.id ? (
                        <span className="flex items-center justify-end gap-2 text-xs">
                          Delete this shift?
                          <Button size="xs" variant="destructive" disabled={busy} onClick={() => run(() => deleteShift(s.id), "Shift deleted", () => setConfirm(null))}>
                            Delete
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <span className="flex justify-end gap-1">
                          {!s.clockOut && (
                            <Button size="xs" variant="outline" disabled={busy} onClick={() => run(() => clockOutShift(s.id), `${s.name} clocked out`)}>
                              Clock out
                            </Button>
                          )}
                          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${s.name}'s shift`} onClick={() => setEditing(s.id)}>
                            <PencilIcon />
                          </Button>
                          <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Delete ${s.name}'s shift`} onClick={() => setConfirm(s.id)}>
                            <Trash2Icon />
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Fixing a shift here also fixes the store credit it earned.</p>
    </div>
  );
}

function Pill({ tone, children }: { tone?: "good" | "bad" | "warn"; children: React.ReactNode }) {
  const colors =
    tone === "good"
      ? "bg-success/15 text-success"
      : tone === "bad"
        ? "bg-destructive/10 text-destructive"
        : tone === "warn"
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground";
  return <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${colors}`}>{children}</span>;
}

type Run = (job: () => Promise<{ ok?: true; error?: string }>, message: string, after?: () => void) => void;

function EditRow({ shift, busy, onCancel, onSaved, run }: { shift: Shift; busy: boolean; onCancel: () => void; onSaved: () => void; run: Run }) {
  const [clockIn, setClockIn] = useState(toLocalInput(shift.clockIn));
  const [clockOut, setClockOut] = useState(shift.clockOut ? toLocalInput(shift.clockOut) : "");
  const input = "h-8 rounded-lg border bg-background px-2 text-sm";
  return (
    <tr className="border-b bg-muted/40">
      <td className="p-3 font-semibold">{shift.name}</td>
      <td className="p-3" colSpan={2}>
        <label className="grid gap-1 text-xs font-semibold">
          Clock in
          <input type="datetime-local" className={input} value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
        </label>
      </td>
      <td className="p-3" colSpan={2}>
        <label className="grid gap-1 text-xs font-semibold">
          Clock out <span className="font-normal text-muted-foreground">(empty = still on)</span>
          <input type="datetime-local" className={input} value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
        </label>
      </td>
      <td className="p-3">
        <span className="flex justify-end gap-1">
          <Button size="sm" disabled={busy} onClick={() => run(() => editShift(shift.id, clockIn, clockOut), "Shift fixed", onSaved)}>
            {busy && <Loader2Icon className="animate-spin" />} Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </span>
      </td>
    </tr>
  );
}

function ShiftLimit({ minutes, busy, run }: { minutes: number; busy: boolean; run: Run }) {
  const [value, setValue] = useState(String(minutes));
  return (
    <form
      className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-sm shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveShiftLimit(value), Number(value) > 0 ? `Shifts now end on their own after ${formatMinutes(Number(value))}` : "Automatic clock-out turned off");
      }}
    >
      <AlarmClockOffIcon className="size-5 text-warning" />
      <span className="font-semibold">Automatic clock-out after</span>
      <input
        aria-label="Minutes"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        className="h-9 w-16 rounded-lg border bg-background px-2 text-center font-receipt"
      />
      <span>minutes {Number(value) > 0 && <span className="text-muted-foreground">({formatMinutes(Number(value))})</span>}</span>
      <Button type="submit" size="sm" variant="outline" disabled={busy || value === String(minutes)}>
        Save
      </Button>
      <span className="w-full text-xs text-muted-foreground sm:w-auto">0 turns it off. The shift is ended at exactly that length, so a forgotten clock-out doesn&apos;t add time.</span>
    </form>
  );
}

function AddShift({ employees, defaultDate, busy, run }: { employees: { id: string; name: string }[]; defaultDate: string; busy: boolean; run: Run }) {
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [clockIn, setClockIn] = useState("07:25");
  const [clockOut, setClockOut] = useState("08:15");
  const input = "h-9 rounded-lg border bg-background px-2 text-sm";
  if (employees.length === 0) return null;
  return (
    <details className="rounded-2xl border bg-card p-4 shadow-soft">
      <summary className="cursor-pointer font-semibold">Add a missed shift</summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!staffId) return void toast.error("Pick an employee.");
          run(() => addShift(staffId, `${date}T${clockIn}`, `${date}T${clockOut}`), "Shift added");
        }}
      >
        <label className="grid gap-1 text-sm font-semibold">
          Employee
          <select className={input} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Pick…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Day
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Clock in
          <input type="time" className={input} value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Clock out
          <input type="time" className={input} value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
        </label>
        <Button type="submit" size="lg" disabled={busy}>
          <PlusIcon /> Add shift
        </Button>
      </form>
    </details>
  );
}
