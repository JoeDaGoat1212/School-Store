import type { Database } from "@/lib/supabase/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** How each status is named and colored, for staff and students. */
export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; studentLabel: string; tone: "info" | "warning" | "success" | "neutral" | "danger" }
> = {
  received: { label: "New", studentLabel: "Received", tone: "info" },
  preparing: { label: "Preparing", studentLabel: "Preparing", tone: "warning" },
  ready: { label: "Ready", studentLabel: "Ready for pickup", tone: "success" },
  picked_up: { label: "Picked up", studentLabel: "Picked up", tone: "neutral" },
  canceled: { label: "Canceled", studentLabel: "Canceled", tone: "danger" },
  no_show: { label: "No-show", studentLabel: "Not picked up", tone: "danger" },
  expired: { label: "Expired", studentLabel: "Not picked up", tone: "danger" },
};

/** Statuses that still hold (reserve) stock. */
export const OPEN_STATUSES: OrderStatus[] = ["received", "preparing", "ready"];

/** The order staff move through, used by the "next step" button. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: "preparing",
  preparing: "ready",
  ready: "picked_up",
};
