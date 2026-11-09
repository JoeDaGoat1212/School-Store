"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Segmented } from "./dashboard-numbers";

type Item = { id: string; name: string; emoji: string | null; stock: number; reorder_point: number; reserved: number };

/** Items at or below their reorder point. Filter to just the sold-out ones, or open the whole list. */
export function LowStock({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<"all" | "out" | "low">("all");
  const [expanded, setExpanded] = useState(false);
  const left = (p: Item) => p.stock - p.reserved;
  const out = items.filter((p) => left(p) <= 0).length;
  const list = items
    .filter((p) => (filter === "out" ? left(p) <= 0 : filter === "low" ? left(p) > 0 : true))
    .sort((a, b) => left(a) / Math.max(1, a.reorder_point) - left(b) / Math.max(1, b.reorder_point));
  const shown = expanded ? list : list.slice(0, 9);

  return (
    <section aria-labelledby="low-title" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="low-title" className="font-heading text-lg font-bold">
          Running low
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {out > 0 && out < items.length && (
            <Segmented
              label="Which items"
              options={[
                { value: "all", label: `All ${items.length}` },
                { value: "out", label: `Sold out ${out}` },
                { value: "low", label: `Low ${items.length - out}` },
              ]}
              value={filter}
              onChange={(v) => {
                setFilter(v as "all" | "out" | "low");
                setExpanded(false);
              }}
            />
          )}
          <Link href="/admin/inventory/shopping-list" className="inline-flex items-center gap-1 text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
            Shopping list <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
      <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => {
          const available = left(p);
          const pct = Math.max(0, Math.min(100, (available / Math.max(1, p.reorder_point)) * 100));
          return (
            <li key={p.id} className="border-b last:border-b-0">
              <Link
                href="/admin/inventory/shopping-list"
                className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                title={`${available <= 0 ? "Sold out" : `${available} left`} · reorder at ${p.reorder_point}${p.reserved > 0 ? ` · ${p.reserved} held for orders` : ""}`}
              >
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-lg">
                  {p.emoji ?? "📦"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className={`block h-full rounded-full ${available <= 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${available <= 0 ? "text-destructive" : ""}`}>{available <= 0 ? "Out" : `${available} left`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.length > 9 && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-3 text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
          {expanded ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}
