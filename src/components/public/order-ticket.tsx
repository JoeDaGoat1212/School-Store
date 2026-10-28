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
  // Added with rewards and deals (older database versions leave these out).
  subtotal_cents?: number;
  discount_cents?: number;
  points_earned?: number;
  points_spent?: number;
  member?: boolean;
  bundles?: { name: string; quantity: number; unit_price_cents: number; items: { name: string; quantity: number }[] }[];
  discounts?: { label: string; amount_cents: number }[];
  /** Room service (teachers): the room it's brought to. */
  delivery_room?: string | null;
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
  const room = order.delivery_room ?? null;
  // Room service reads "On its way" / "Delivered" instead of pickup words.
  const stepLabel = (step: OrderStatus) =>
    room && step === "ready" ? "On its way" : room && step === "picked_up" ? "Delivered" : ORDER_STATUS[step].studentLabel;

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
                    {stepLabel(step)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Pickup details */}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">{room ? "Room service" : "Pick up"}</dt>
            <dd className="font-semibold">
              {relativeDay(order.pickup_date, today)}, {room ? `during ${order.pickup_window.toLowerCase()}` : order.pickup_window}
            </dd>
            <dd className="text-muted-foreground">{formatDay(order.pickup_date, { weekday: "long" })}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="font-semibold">{room ? `Room ${room}` : pickupLocation}</dd>
          </div>
        </dl>

        {/* Items, bundles and discounts */}
        <ul className="grid gap-1.5 border-t pt-4 text-sm">
          {(order.bundles ?? []).map((b) => (
            <li key={b.name} className="flex justify-between gap-3">
              <span>
                <span className="font-semibold tabular-nums">{b.quantity}×</span> {b.name}
                <span className="block text-xs text-muted-foreground">
                  {b.items.map((i) => (i.quantity > b.quantity ? `${i.quantity / b.quantity} ${i.name}` : i.name)).join(" + ")}
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums">{formatCents(b.quantity * b.unit_price_cents)}</span>
            </li>
          ))}
          {order.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex justify-between gap-3">
              <span>
                <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
              </span>
              <span className="text-muted-foreground tabular-nums">{formatCents(item.quantity * item.unit_price_cents)}</span>
            </li>
          ))}
          {(order.discounts ?? []).map((d) => (
            <li key={d.label} className="flex justify-between gap-3 font-medium text-ember-ink">
              <span>{d.label}</span>
              <span className="tabular-nums">−{formatCents(d.amount_cents)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="font-semibold">{order.status === "picked_up" ? "Paid" : room ? "Due on delivery" : "Due at pickup"}</span>
          <span className="font-heading text-4xl leading-none font-extrabold tabular-nums">{formatCents(order.total_cents)}</span>
        </div>
        {order.status !== "picked_up" && !closed && (
          <p className="-mt-3 text-sm text-muted-foreground">
            {room ? "Cash or debit, to the student who brings it." : "Cash or debit. Say your order number at the window."}
          </p>
        )}
        {order.member && (order.points_earned ?? 0) > 0 && !closed && (
          <p className="-mt-2 rounded-xl bg-teal/15 px-3.5 py-2.5 text-sm font-medium">
            {order.status === "picked_up"
              ? `You earned ${order.points_earned} points on this order.`
              : `You'll earn ${order.points_earned} points when you pick this up.`}
          </p>
        )}
      </div>
    </article>
  );
}
