"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";

/** Every tally line in the stock history has this note, so tallies can be found and totaled. */
const TALLY_NOTE = "Register tally";

/** Barcodes are saved as product names starting with this, e.g. "upc:028400090858". */
const BARCODE_PREFIX = "upc:";

const batchSchema = z.object({
  /** A random id for this batch, so a retry after a dropped connection never counts twice. */
  batchId: z.uuid(),
  // qty is negative for an undo of something already saved.
  items: z.array(z.object({ productId: z.uuid(), qty: z.number().int().min(-500).max(500) })).min(1).max(200),
});

/**
 * Saves sold items from the register screen: takes them out of stock.
 * Money isn't touched (that comes from the End of Period Summary); this is only how many of each sold.
 */
export async function recordTally(input: z.infer<typeof batchSchema>) {
  const { supabase, user } = await requireAdmin();
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { error: "That tally couldn't be read." };
  const { batchId, items } = parsed.data;

  // Already saved (the first try went through but the answer got lost)? Then we're done.
  const { count } = await supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("source_id", batchId);
  if ((count ?? 0) > 0) return { ok: true };

  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.qty);

  const lines = [...totals].filter(([, qty]) => qty !== 0);
  if (lines.length === 0) return { ok: true };

  const day = storeToday();
  const { error } = await supabase.from("stock_movements").insert(
    lines.map(([product_id, qty]) => ({
      product_id,
      change: -qty,
      reason: "manual_adjustment" as const,
      effective_date: day,
      note: TALLY_NOTE,
      source_id: batchId,
      created_by: user.id,
    })),
  );
  if (error) return { error: error.message };

  for (const path of ["/admin/register", "/admin/inventory", "/admin/inventory/shopping-list", "/admin"]) revalidatePath(path);
  return { ok: true };
}

/** Remembers which product a barcode belongs to. */
export async function saveBarcode(code: string, productId: string) {
  const { supabase } = await requireAdmin();
  const digits = code.trim().replace(/\s+/g, "");
  if (!/^[0-9A-Za-z-]{4,32}$/.test(digits) || !z.uuid().safeParse(productId).success) return { error: "That barcode couldn't be saved." };
  const { error } = await supabase
    .from("product_aliases")
    .upsert({ alias: `${BARCODE_PREFIX}${digits.toLowerCase()}`, product_id: productId }, { onConflict: "alias" });
  if (error) return { error: error.message };
  revalidatePath("/admin/register");
  return { ok: true };
}
