"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addTask, deleteTask, updateTask } from "../team-actions";

type Repeat = "once" | "weekly" | "daily";
type Task = { id: string; title: string; details: string; repeat: Repeat; staffId: string; doneBy: string[] };

const EMPTY = { title: "", details: "", repeat: "once" as Repeat, staffId: "" };

export function TaskEditor({ day, dayLabel, tasks, staff }: { day: string; dayLabel: string; tasks: Task[]; staff: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, start] = useTransition();
  const weekday = dayLabel.split(",")[0];
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "Former employee";
  const repeatText = (r: Repeat) => (r === "once" ? `Only ${dayLabel}` : r === "weekly" ? `Every ${weekday}` : "Every day");

  const save = () =>
    start(async () => {
      const input = { ...form, date: day };
      const r = editing && editing !== "new" ? await updateTask(editing, input) : await addTask(input);
      if ("error" in r) return void toast.error(r.error);
      toast.success(editing === "new" ? "Task added" : "Task saved");
      setEditing(null);
      setForm(EMPTY);
    });

  const remove = (t: Task) =>
    start(async () => {
      if (t.repeat !== "once" && !confirm(`Delete "${t.title}"? It repeats (${repeatText(t.repeat).toLowerCase()}), so it goes away on every day.`)) return;
      const r = await deleteTask(t.id);
      if ("error" in r) toast.error(r.error);
    });

  const formUi = (
    <div className="grid gap-3 bg-muted/40 p-4 sm:p-5">
      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        maxLength={120}
        placeholder="Wipe down the counter"
        aria-label="Task"
        autoFocus
        className="h-11 rounded-md border bg-card px-3 text-base font-medium"
      />
      <input
        value={form.details}
        onChange={(e) => setForm({ ...form, details: e.target.value })}
        maxLength={300}
        placeholder="Details (optional)"
        aria-label="Details"
        className="h-10 rounded-md border bg-card px-3 text-sm"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          When
          <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as Repeat })} className="h-10 rounded-md border bg-card px-2 text-sm text-foreground">
            <option value="once">Only {dayLabel}</option>
            <option value="weekly">Every {weekday}</option>
            <option value="daily">Every day</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Who
          <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} className="h-10 rounded-md border bg-card px-2 text-sm text-foreground">
            <option value="">Whoever is working</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy || !form.title.trim()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {editing === "new" ? "Add task" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(null);
            setForm(EMPTY);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="day-title" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <h2 id="day-title" className="font-heading text-base font-semibold">
          {dayLabel} <span className="ml-1 font-normal text-muted-foreground tabular-nums">{tasks.length}</span>
        </h2>
        {editing !== "new" && (
          <Button
            size="sm"
            onClick={() => {
              setForm(EMPTY);
              setEditing("new");
            }}
          >
            <PlusIcon /> Add a task
          </Button>
        )}
      </header>
      {editing === "new" && formUi}
      {tasks.length === 0 && editing !== "new" ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No tasks for this day yet.</p>
      ) : (
        <ul className="divide-y">
          {tasks.map((t) =>
            editing === t.id ? (
              <li key={t.id}>{formUi}</li>
            ) : (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] ${t.doneBy.length ? "border-success bg-success text-white" : "border-input"}`}>
                  {t.doneBy.length > 0 && <CheckIcon className="size-3.5" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  {t.details && <p className="text-sm text-muted-foreground">{t.details}</p>}
                  <p className="text-xs text-muted-foreground">
                    {repeatText(t.repeat)}. {t.staffId ? nameOf(t.staffId) : "Whoever is working"}.
                    {t.doneBy.length > 0 && <span className="font-medium text-success"> Done by {t.doneBy.join(", ")}.</span>}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${t.title}`}
                  onClick={() => {
                    setForm({ title: t.title, details: t.details, repeat: t.repeat, staffId: t.staffId });
                    setEditing(t.id);
                  }}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${t.title}`}
                  disabled={busy}
                  onClick={() => remove(t)}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
