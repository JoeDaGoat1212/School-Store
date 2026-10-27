"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DateRange, RangeKind } from "@/lib/date-range";
import { cn } from "@/lib/utils";

const KINDS: { kind: RangeKind; label: string }[] = [
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
  { kind: "year", label: "Year" },
  { kind: "custom", label: "Custom" },
];

/** Week / Month / Year / Custom, with ‹ › to step back and forward. Lives in the address bar. */
export function RangePicker({ range, today }: { range: DateRange; today: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const href = (kind: RangeKind, date: string) => `/admin/insights?range=${kind}&date=${date}`;
  const isFuture = range.next !== null && range.next > today;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Range">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={range.kind === kind}
            onClick={() =>
              router.push(
                kind === "custom"
                  ? `/admin/insights?range=custom&from=${range.from}&to=${range.to}`
                  : href(kind, range.kind === "custom" ? range.to : range.to > today ? today : range.from),
              )
            }
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              range.kind === kind ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {range.kind === "custom" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/admin/insights?range=custom&from=${from}&to=${to}`);
          }}
        >
          <Input type="date" aria-label="From" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          <Button type="submit" size="sm" variant="outline" className="h-9">
            Show
          </Button>
        </form>
      ) : (
        <div className="inline-flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild>
            <Link href={href(range.kind, range.prev!)} aria-label="Previous">
              <ChevronLeftIcon />
            </Link>
          </Button>
          <span className="min-w-36 px-1 text-center text-sm font-semibold">{range.label}</span>
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={href(range.kind, range.next!)}
              aria-label="Next"
              aria-disabled={isFuture}
              className={isFuture ? "pointer-events-none opacity-40" : undefined}
            >
              <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
