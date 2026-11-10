"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckIcon, ReceiptIcon, RotateCcwIcon, StoreIcon } from "lucide-react";
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

export function ShoppingChecklist({ groups, today }: { groups: ShoppingGroup[]; today: string }) {
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

  return (
    <div className="mt-8">
      {/* Overall progress, stuck to the top while scrolling in the store. */}
      <div className="no-print sticky top-16 z-[5] mb-6 rounded-2xl border bg-card/90 p-4 shadow-soft backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold">
            {done === all.length && all.length > 0 ? (
              <span className="text-success">Everything&apos;s in the cart 🎉</span>
            ) : (
              <>
                <span className="font-heading text-lg font-bold tabular-nums">{done}</span>
                <span className="text-muted-foreground"> of {all.length} in the cart</span>
              </>
            )}
          </p>
          {done > 0 && (
            <button type="button" onClick={() => write(today, new Set())} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <RotateCcwIcon className="size-3.5" /> Start over
            </button>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Shopping progress">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-[var(--ledger)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-6">
        {groups.map((g) => {
          const subtotal = g.items.reduce((s, r) => s + r.buy * r.costCents, 0);
          const got = g.items.filter((i) => checked.has(i.id)).length;
          const finished = got === g.items.length;
          return (
            <section key={g.store} className="break-inside-avoid overflow-hidden rounded-2xl border bg-card shadow-soft print:rounded-none print:border-black print:shadow-none">
              <header className={`flex flex-wrap items-center gap-3 border-b px-5 py-4 ${finished ? "bg-success/10" : ""}`}>
                <span className={`grid size-10 place-items-center rounded-xl ${finished ? "bg-success text-white" : "bg-primary/10 text-ember-ink"}`}>
                  {finished ? <CheckIcon className="size-5" /> : <StoreIcon className="size-5" />}
                </span>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-bold">{g.store}</h2>
                  <p className="text-xs text-muted-foreground">
                    {got}/{g.items.length} item{g.items.length === 1 ? "" : "s"} · about {formatCents(subtotal)}
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
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/60 active:bg-muted"
                      >
                        <span
                          aria-hidden
                          className={`grid size-6 shrink-0 place-items-center rounded-lg border-2 transition ${on ? "border-success bg-success text-white" : "border-input"}`}
                        >
                          {on && <CheckIcon className="size-4" strokeWidth={3} />}
                        </span>
                        <span className={`min-w-0 flex-1 ${on ? "text-muted-foreground line-through decoration-2" : ""}`}>
                          <span className="font-medium">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Have {r.have}
                            {r.lasts ? ` · lasts ~${r.lasts} days` : ""}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className={`block font-heading text-2xl leading-none font-extrabold tabular-nums ${on ? "text-muted-foreground" : ""}`}>×{r.buy}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{formatCents(r.buy * r.costCents)}</span>
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
