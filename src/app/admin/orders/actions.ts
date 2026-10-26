"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { OrderStatus } from "@/lib/order-status";

/**
 * Moves an order to a new status. The database function set_order_status
 * also handles stock: "picked up" takes the items out of stock (they've been
 * paid for), and moving away from "picked up" puts them back.
 */
export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("set_order_status", { p_order_id: orderId, p_status: status });
  if (error) return { error: error.hint || error.message };

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true };
}

/** Saves the private staff note on an order (students never see it). */
export async function saveStaffNote(orderId: string, note: string) {
  const { supabase } = await requireAdmin();
  const trimmed = note.trim().slice(0, 500);
  const { error } = await supabase
    .from("orders")
    .update({ staff_notes: trimmed || null })
    .eq("id", orderId);
  if (error) return { error: error.message };

  revalidatePath("/admin/orders");
  return { ok: true };
}
