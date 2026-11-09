"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxesIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  EyeIcon,
  FileUpIcon,
  GraduationCapIcon,
  MessageSquarePlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

const ICONS = {
  alert: AlertTriangleIcon,
  boxes: BoxesIcon,
  briefcase: BriefcaseIcon,
  orders: ClipboardListIcon,
  import: FileUpIcon,
  teacher: GraduationCapIcon,
  request: MessageSquarePlusIcon,
  people: UsersIcon,
};

export type Todo = {
  /** Stays the same day to day, so "hide until tomorrow" sticks. */
  id: string;
  icon: keyof typeof ICONS;
  text: string;
  href: string;
  action: string;
  tone: "urgent" | "normal";
};

/*
 * "Hide until tomorrow" is remembered in this browser only (it's just a
 * reminder list; the real work still shows up on its own page).
 */
const KEY = "dashboard-snoozed";
const EVENT = "dashboard-snoozed-change";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function save(next: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private window or storage turned off: hiding just won't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function TodoList({ todos, today }: { todos: Todo[]; today: string }) {
  const raw = useSyncExternalStore(subscribe, read, () => "{}");
  let snoozed: Record<string, string> = {};
  try {
    snoozed = JSON.parse(raw) as Record<string, string>;
  } catch {
    snoozed = {};
  }
  // Urgent things (sold out, orders waiting) can't be hidden.
  const hidden = todos.filter((t) => t.tone !== "urgent" && snoozed[t.id] === today);
  const shown = todos.filter((t) => !hidden.includes(t));

  const snooze = (id: string) => {
    const keep = Object.fromEntries(Object.entries(snoozed).filter(([, day]) => day === today));
    save({ ...keep, [id]: today });
  };
  const unhideAll = () => save({});

  return (
    <section aria-labelledby="todo-title" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="todo-title" className="font-heading text-lg font-bold">
          To do
        </h2>
        {hidden.length > 0 && (
          <button type="button" onClick={unhideAll} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <EyeIcon className="size-3.5" /> Show {hidden.length} hidden
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="grid place-items-center gap-2 py-10 text-center">
          <CheckCircle2Icon className="size-10 text-success" />
          <p className="font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground">{hidden.length > 0 ? "The rest is hidden until tomorrow." : "Nothing needs you right now."}</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {shown.map((t) => {
            const Icon = ICONS[t.icon];
            return (
              <li key={t.id} className="group relative flex items-center rounded-xl border bg-background/60 transition-colors hover:border-primary/50 hover:bg-primary/5">
                <Link
                  href={t.href}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${t.tone === "urgent" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-ember-ink"}`}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{t.text}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-ember-ink">
                    {t.action} <ArrowRightIcon className="size-3.5" />
                  </span>
                </Link>
                {t.tone !== "urgent" && (
                  <button
                    type="button"
                    onClick={() => snooze(t.id)}
                    title="Hide until tomorrow"
                    aria-label={`Hide "${t.text}" until tomorrow`}
                    className="mr-2 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
