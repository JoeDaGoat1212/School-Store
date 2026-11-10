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
  ReceiptIcon,
  CameraIcon,
  MessageCircleIcon,
  UserXIcon,
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
  receipt: ReceiptIcon,
  restock: CameraIcon,
  message: MessageCircleIcon,
  absent: UserXIcon,
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
    <section aria-labelledby="todo-title" className="rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <h2 id="todo-title" className="font-heading text-base font-semibold">
          To do {shown.length > 0 && <span className="ml-1 font-normal text-muted-foreground tabular-nums">{shown.length}</span>}
        </h2>
        {hidden.length > 0 && (
          <button type="button" onClick={unhideAll} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <EyeIcon className="size-3.5" /> Show {hidden.length} hidden
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="grid place-items-center gap-1.5 px-5 py-12 text-center">
          <CheckCircle2Icon className="mb-1 size-6 text-success" />
          <p className="font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">{hidden.length > 0 ? "The rest is hidden until tomorrow." : "Nothing needs you right now."}</p>
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map((t) => {
            const Icon = ICONS[t.icon];
            return (
              <li key={t.id} className="group relative flex items-center transition-colors hover:bg-accent/60">
                <Link
                  href={t.href}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 focus-visible:bg-accent focus-visible:outline-none sm:pl-5"
                >
                  <Icon aria-hidden className={`size-4 shrink-0 ${t.tone === "urgent" ? "text-destructive" : "text-muted-foreground"}`} />
                  <span className={`min-w-0 flex-1 text-sm ${t.tone === "urgent" ? "font-semibold" : ""}`}>{t.text}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {t.action} <ArrowRightIcon className="size-3.5" />
                  </span>
                </Link>
                {t.tone !== "urgent" && (
                  <button
                    type="button"
                    onClick={() => snooze(t.id)}
                    title="Hide until tomorrow"
                    aria-label={`Hide "${t.text}" until tomorrow`}
                    className="mr-2 grid size-7 shrink-0 sm:mr-3 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
