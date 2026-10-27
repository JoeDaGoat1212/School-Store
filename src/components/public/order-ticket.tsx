import { CheckIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { brand, formatOrderNumber } from "@/config/brand";
import { formatCents, formatDay, relativeDay } from "@/lib/format";
import { ORDER_STATUS, type OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export type LookedUpOrder = {
  order_number: number;
  status: OrderStatus;
  pickup_date: string;
  pickup_window: string;
  total_cents: number;
  created_at: string;
  items: { name: string; quantity: number; unit_price_cents: number }[];
};

const STEPS: OrderStatus[] = ["received", "preparing", "ready", "picked_up"];

/**
 * The order shown like a paper ticket stub: big order number on top,
 * a perforated tear line, and the pickup details below.
 */
export function OrderTicket({
  order,
  today,
  pickupLocation,
  fresh = false,
}: {
  order: LookedUpOrder;
  today: string;
  pickupLocation: string;
  /** True right after ordering: the ticket "prints" in. */
  fresh?: boolean;
}) {
  const stepIndex = STEPS.indexOf(order.status);
  const closed = stepIndex === -1; // canceled, no-show, expired

  return (
    <article
      aria-label={`Order ${formatOrderNumber(order.order_number)}`}
      className={cn(
        "relative mx-auto max-w-md overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border",
        fresh && "animate-in duration-700 ease-out fade-in slide-in-from-top-10",
      )}
    >
      {/* Top: the number */}
      <div className="bg-sticker px-6 pt-6 pb-8 text-sticker-foreground">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BrandMark size={24} />
          {brand.name}
        </div>
        <p className="mt-5 text-sm font-medium opacity-75">Order number</p>
        <p className="font-heading text-7xl leading-none font-extrabold tabular-nums sm:text-8xl">
          {formatOrderNumber(order.order_number)}
        </p>
      </div>

      {/* Perforation: two half-circle notches and a dashed line */}
      <div aria-hidden className="relative h-0">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-background ring-1 ring-border" />
        <span className="absolute -top-3 -right-3 size-6 rounded-full bg-background ring-1 ring-border" />
        <span className="absolute inset-x-5 top-0 border-t-2 border-dashed border-border" />
      </div>

      <div className="grid gap-6 px-6 pt-7 pb-6">
        {/* Status */}
        {closed ? (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {ORDER_STATUS[order.status].studentLabel}.{" "}
            <span className="font-normal">
              {order.status === "canceled"
                ? "This order was canceled. Ask at the store window if that's a surprise."
                : "This order wasn't picked up, so the items went back on the shelf."}
            </span>
          </p>
        ) : (
          <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
            {STEPS.map((step, i) => {
              const done = i <= stepIndex;
              return (
                <li key={step} className="grid justify-items-center gap-1.5 text-center" aria-current={i === stepIndex ? "step" : undefined}>
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-xs font-bold",
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      i === stepIndex && "ring-4 ring-primary/20",
                    )}
                  >
                    {done ? <CheckIcon className="size-4" /> : i + 1}
                  </span>
                  <span className={cn("text-xs leading-tight", done ? "font-semibold" : "text-muted-foreground")}>
                    {ORDER_STATUS[step].studentLabel}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Pickup details */}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Pick up</dt>
            <dd className="font-semibold">
              {relativeDay(order.pickup_date, today)}, {order.pickup_window}
            </dd>
            <dd className="text-muted-foreground">{formatDay(order.pickup_date, { weekday: "long" })}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="font-semibold">{pickupLocation}</dd>
          </div>
        </dl>

        {/* Items */}
        <ul className="grid gap-1.5 border-t pt-4 text-sm">
          {order.items.map((item) => (
            <li key={item.name} className="flex justify-between gap-3">
              <span>
                <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
              </span>
              <span className="text-muted-foreground tabular-nums">{formatCents(item.quantity * item.unit_price_cents)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="font-semibold">{order.status === "picked_up" ? "Paid" : "Due at pickup"}</span>
          <span className="font-heading text-4xl leading-none font-extrabold tabular-nums">{formatCents(order.total_cents)}</span>
        </div>
        {order.status !== "picked_up" && !closed && (
          <p className="-mt-3 text-sm text-muted-foreground">Cash or debit. Say your order number at the window.</p>
        )}
      </div>
    </article>
  );
}
