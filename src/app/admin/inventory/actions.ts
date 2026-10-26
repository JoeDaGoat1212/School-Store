"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";

const adjustSchema = z.object({
  productId: z.uuid(),
  mode: z.enum(["set", "change"]),
  amount: z.coerce.number({ message: "Enter a number" }).int("Use a whole number"),
  reason: z.enum(["manual_adjustment", "spoilage"]),
  note: z.string().trim().min(3, "Say why the count changed (at least a few words)").max(300),
});

export type AdjustState = { errors?: Record<string, string>; message?: string; ok?: boolean };

/**
 * Fixes a product's stock by hand. "set" = "the count is now X";
 * "change" = "add or remove X". Every change needs a reason, and is saved
 * as a new line in the stock history (the old numbers are never erased).
 */
export async function adjustStock(_prev: AdjustState, formData: FormData): Promise<AdjustState> {
  const { supabase, user } = await requireAdmin();
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }
  const a = parsed.data;

  const { data: product, error: readError } = await supabase
    .from("products")
    .select("name, stock")
    .eq("id", a.productId)
    .single();
  if (readError) return { message: readError.message };

  const change = a.mode === "set" ? a.amount - product.stock : a.amount;
  if (a.mode === "set" && a.amount < 0) return { errors: { amount: "A count can't be negative" } };
  if (change === 0) return { errors: { amount: `${product.name} is already at ${product.stock}` } };

  const { error } = await supabase.from("stock_movements").insert({
    product_id: a.productId,
    change,
    reason: a.reason,
    effective_date: storeToday(),
    note: a.note,
    created_by: user.id,
  });
  if (error) return { message: error.message };

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: `${product.name}: ${change > 0 ? "+" : ""}${change} (now ${product.stock + change})` };
}

/** Saves new reorder points (from the "use suggested" button). */
export async function applyReorderPoints(updates: { id: string; reorder_point: number }[]) {
  const { supabase } = await requireAdmin();
  for (const u of updates) {
    const { error } = await supabase
      .from("products")
      .update({ reorder_point: Math.max(0, Math.round(u.reorder_point)) })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true };
}

/** The most recent stock changes for one product, newest first. */
export async function getStockHistory(productId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, change, reason, effective_date, note, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60);
  if (error) return { error: error.message, rows: [] };
  return { rows: data };
}
