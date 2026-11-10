"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckIcon, ReceiptIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

export type ShoppingItem = { id: string; name: string; have: number; buy: number; costCents: number; lasts: number | null };
export type ShoppingGroup = { store: string; items: ShoppingItem[]; tripHref: string };

/*
 * Tap an item in the aisle to check it off. What's checked is kept on this
 * phone for the day (so a reload or a locked screen doesn't lose it) and
 * clears itself tomorrow.
 */
const KEY = "shopping-checked";
const EVENT = "shopping-checked-change";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
function write(day: string, ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day, ids: [...ids] }));
  } catch {
    // Private window: checks just won't survive a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ShoppingChecklist({ groups, today, totalCents }: { groups: ShoppingGroup[]; today: string; totalCents: number }) {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  let checked = new Set<string>();
  try {
    const saved = raw ? (JSON.parse(raw) as { day: string; ids: string[] }) : null;
    if (saved?.day === today) checked = new Set(saved.ids);
  } catch {
    // ignore a broken value
  }

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(today, next);
  };

  const all = groups.flatMap((g) => g.items);
  const done = all.filter((i) => checked.has(i.id)).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const inCart = all.filter((i) => checked.has(i.id)).reduce((t, i) => t + i.buy * i.costCents, 0);

  return (
    <div className="mt-8">
      {/* The trip so far, stuck under the top bar while scrolling in the store. */}
      <div className="sticky top-12 z-[5] -mx-4 mb-4 border-b bg-background px-4 pt-2 pb-3 md:mx-0 md:rounded-b-lg md:px-0 print:static print:border-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">In the cart</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="score text-4xl">{done}</span>
              <span className="text-sm text-muted-foreground">of {all.length} items</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{done > 0 ? `${formatCents(inCart)} of` : "Trip budget"}</p>
            <p className="score mt-1 text-4xl">{formatCents(totalCents)}</p>
          </div>
        </div>
        <div className="no-print mt-2.5 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Shopping progress">
            <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          {done > 0 && (
            <button type="button" onClick={() => write(today, new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <RotateCcwIcon className="size-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {groups.map((g) => {
          const subtotal = g.items.reduce((s, r) => s + r.buy * r.costCents, 0);
          const got = g.items.filter((i) => checked.has(i.id)).length;
          const finished = got === g.items.length;
          return (
            <section key={g.store} className="break-inside-avoid overflow-hidden rounded-xl border bg-card print:rounded-none print:border-black">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
                    {g.store}
                    {finished && <CheckIcon aria-label="Done" className="size-4 text-success" strokeWidth={3} />}
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {got} of {g.items.length} in the cart, about {formatCents(subtotal)}
                  </p>
                </div>
                <Button asChild variant={finished ? "default" : "outline"} size="sm" className="no-print ml-auto">
                  <Link href={g.tripHref}>
                    <ReceiptIcon /> Log this trip
                  </Link>
                </Button>
              </header>
              <ul className="divide-y">
                {g.items.map((r) => {
                  const on = checked.has(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none active:bg-accent sm:px-5"
                      >
                        <span
                          aria-hidden
                          className={`grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors ${on ? "border-success bg-success text-white" : "border-input bg-card"}`}
                        >
                          {on && <CheckIcon className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className={`min-w-0 flex-1 ${on ? "text-muted-foreground" : ""}`}>
                          <span className={`text-[0.9375rem] font-medium ${on ? "line-through decoration-1" : ""}`}>{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.have} on the shelf
                            {r.lasts ? `, keeps about ${r.lasts} days` : ""}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className={`score block text-[1.75rem] ${on ? "text-muted-foreground" : ""}`}>{r.buy}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">{formatCents(r.buy * r.costCents)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
