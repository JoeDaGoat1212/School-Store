import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/order-status";
import type { Database } from "@/lib/supabase/database.types";

export type QueueOrder = {
  id: string;
  order_number: number;
  first_name: string;
  last_name: string;
  grade: string;
  status: OrderStatus;
  total_cents: number;
  staff_notes: string | null;
  created_at: string;
  pickup_window_id: number;
  items: { product_name: string; quantity: number; unit_price_cents: number; order_bundle_id: string | null }[];
  /** Signed in to a rewards account when ordering. */
  member: boolean;
  discount_cents: number;
  points_spent: number;
  bundles: { id: string; bundle_name: string; quantity: number }[];
  discounts: { label: string; amount_cents: number; kind: string }[];
  /** A teacher's order. */
  teacher: boolean;
  /** Room service: bring it to this room. */
  delivery_room: string | null;
};

export type QueueWindow = { id: number; label: string; starts_at: string; sort_order: number };

/** "YYYY-MM-DD" check for dates that come from the address bar. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Every order for one pickup day, plus the pickup windows (including turned-off ones). */
export async function loadOrdersForDay(supabase: SupabaseClient<Database>, date: string) {
  const [orders, windows] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, first_name, last_name, grade, status, total_cents, staff_notes, created_at, pickup_window_id, customer_id, teacher_id, delivery_room, discount_cents, points_spent, order_items(product_name, quantity, unit_price_cents, order_bundle_id), order_bundles(id, bundle_name, quantity), order_discounts(label, amount_cents, kind)",
      )
      .eq("pickup_date", date)
      .order("order_number"),
    supabase.from("pickup_windows").select("id, label, starts_at, sort_order, kind").order("starts_at").order("sort_order"),
  ]);
  if (orders.error) throw new Error(orders.error.message);
  if (windows.error) throw new Error(windows.error.message);

  return {
    orders: orders.data.map(({ order_items, order_bundles, order_discounts, customer_id, teacher_id, ...o }) => ({
      ...o,
      teacher: teacher_id !== null,
      items: order_items,
      member: customer_id !== null,
      bundles: order_bundles,
      discounts: order_discounts,
    })) as QueueOrder[],
    // Class hours are room service runs: say so, so they stand out in the queue.
    windows: windows.data.map(({ kind, ...w }) => ({
      ...w,
      label: kind === "class" ? `${w.label} · room service` : w.label,
      starts_at: w.starts_at.slice(0, 5),
    })) as QueueWindow[],
  };
}
