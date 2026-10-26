"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BellRingIcon, ClipboardListIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/staff/page-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatOrderNumber, parseOrderNumber } from "@/config/brand";
import { formatClock, formatDay, formatTime, relativeDay } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { QueueOrder, QueueWindow } from "./load-orders";
import { OrderCard } from "./order-card";

/** How often the list reloads by itself. */
const REFRESH_SECONDS = 15;

/** The status filter chips, in order. */
const FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "open", label: "To do", statuses: ["received", "preparing", "ready"] },
  { key: "received", label: "New", statuses: ["received"] },
  { key: "preparing", label: "Preparing", statuses: ["preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "picked_up", label: "Picked up", statuses: ["picked_up"] },
  { key: "closed", label: "Canceled / no-show", statuses: ["canceled", "no_show", "expired"] },
  { key: "all", label: "All", statuses: ["received", "preparing", "ready", "picked_up", "canceled", "no_show", "expired"] },
];

export function OrderQueue({
  orders,
  windows,
  date,
  today,
  nextDay,
  initialStatus,
}: {
  orders: QueueOrder[];
  windows: QueueWindow[];
  date: string;
  today: string;
  nextDay: string | null;
  initialStatus?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialStatus) ? initialStatus! : "open");
  const [windowId, setWindowId] = useState("all");
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  // ---- Auto-refresh, and a heads-up when a new order arrives ----------------
  const seen = useRef(new Set(orders.map((o) => o.id)));
  useEffect(() => {
    const fresh = orders.filter((o) => !seen.current.has(o.id));
    fresh.forEach((o) => {
      seen.current.add(o.id);
      toast(`New order ${formatOrderNumber(o.order_number)}`, {
        description: `${o.first_name} ${o.last_name} · ${windows.find((w) => w.id === o.pickup_window_id)?.label ?? ""}`,
        icon: <BellRingIcon className="size-4" />,
      });
    });
  }, [orders, windows]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Don't refresh while a dialog is open or the tab is hidden.
      if (document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      router.refresh();
      setUpdatedAt(new Date());
    }, REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [router]);

  // ---- Filtering ----------------------------------------------------------------
  const active = FILTERS.find((f) => f.key === filter)!;
  const searchNumber = parseOrderNumber(query);
  const q = query.trim().toLowerCase();

  const matchesSearchAndWindow = (o: QueueOrder) =>
    (windowId === "all" || String(o.pickup_window_id) === windowId) &&
    (!q ||
      o.order_number === searchNumber ||
      `${o.first_name} ${o.last_name}`.toLowerCase().includes(q));

  const visible = orders.filter((o) => active.statuses.includes(o.status) && matchesSearchAndWindow(o));
  const countFor = (f: (typeof FILTERS)[number]) =>
    orders.filter((o) => f.statuses.includes(o.status) && matchesSearchAndWindow(o)).length;

  // Group by pickup window, in bell-schedule order.
  const groups = windows
    .map((w) => ({ window: w, orders: visible.filter((o) => o.pickup_window_id === w.id) }))
    .filter((g) => g.orders.length > 0);

  const goToDay = (d: string) => router.push(d === today ? "/admin/orders" : `/admin/orders?date=${d}`);

  return (
    <div className="grid gap-5">
      {/* Day + window + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Pickup day">
          {[today, ...(nextDay ? [nextDay] : [])].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={date === d}
              onClick={() => goToDay(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                date === d ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {relativeDay(d, today)}
            </button>
          ))}
        </div>
        <Input
          type="date"
          aria-label="Choose another day"
          value={date}
          onChange={(e) => e.target.value && goToDay(e.target.value)}
          className="h-9 w-40"
        />

        <Select value={windowId} onValueChange={setWindowId}>
          <SelectTrigger className="h-9 w-44" aria-label="Pickup time">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pickup times</SelectItem>
            {windows.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-full sm:ml-auto sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Order # or name"
            aria-label="Search by order number or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Status">
        {FILTERS.map((f) => {
          const n = countFor(f);
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-xs font-semibold tabular-nums",
                  filter === f.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCwIcon className="size-3.5" />
          Updates every {REFRESH_SECONDS}s · last {formatTime(updatedAt)}
        </span>
      </div>

      {/* Orders */}
      {groups.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={orders.length === 0 ? "No orders for this day yet" : "Nothing here"}>
          {orders.length === 0
            ? `Orders for ${formatDay(date)} will show up here as students place them.`
            : q
              ? "No orders match your search."
              : "No orders with this status. Try another filter."}
        </EmptyState>
      ) : (
        groups.map(({ window, orders: list }) => (
          <section key={window.id} aria-labelledby={`window-${window.id}`}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 id={`window-${window.id}`} className="font-heading text-lg font-bold">
                {window.label}
              </h2>
              <span className="text-sm text-muted-foreground">
                {formatClock(window.starts_at)} · {list.length} order{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
