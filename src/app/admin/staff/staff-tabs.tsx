"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClockIcon, ExternalLinkIcon, TimerIcon, UsersIcon, WalletIcon } from "lucide-react";

const TABS = [
  { href: "/admin/staff", label: "Schedule", icon: CalendarClockIcon },
  { href: "/admin/staff/hours", label: "Timecards", icon: TimerIcon },
  { href: "/admin/staff/people", label: "Employees", icon: UsersIcon },
  { href: "/admin/staff/credit", label: "Store credit", icon: WalletIcon },
];

/** The row of tabs across the four employee pages, plus a link to open the time clock. */
export function StaffTabs({ pending = 0 }: { pending?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Employee pages" className="mb-6 flex flex-wrap items-center gap-2 border-b pb-3">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
            {t.href === "/admin/staff/people" && pending > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-black" aria-label={`${pending} waiting for approval`}>
                {pending}
              </span>
            )}
          </Link>
        );
      })}
      <Link
        href="/clock"
        target="_blank"
        className="ml-auto inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ember-ink hover:underline"
      >
        Open the time clock <ExternalLinkIcon className="size-4" />
      </Link>
    </nav>
  );
}
