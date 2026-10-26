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
  items: { product_name: string; quantity: number; unit_price_cents: number }[];
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
        "id, order_number, first_name, last_name, grade, status, total_cents, staff_notes, created_at, pickup_window_id, order_items(product_name, quantity, unit_price_cents)",
      )
      .eq("pickup_date", date)
      .order("order_number"),
    supabase.from("pickup_windows").select("id, label, starts_at, sort_order").order("sort_order").order("starts_at"),
  ]);
  if (orders.error) throw new Error(orders.error.message);
  if (windows.error) throw new Error(windows.error.message);

  return {
    orders: orders.data.map(({ order_items, ...o }) => ({ ...o, items: order_items })) as QueueOrder[],
    windows: windows.data.map((w) => ({ ...w, starts_at: w.starts_at.slice(0, 5) })) as QueueWindow[],
  };
}
