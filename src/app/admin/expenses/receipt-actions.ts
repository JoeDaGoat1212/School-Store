"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/format";
import { RECEIPT_BUCKET } from "@/lib/photos";

/*
 * Receipt photos snapped at the store (Shopping list → Snap receipt). The photo
 * itself is uploaded straight from the phone into the private "receipts"
 * storage; this saves the details and lists it under Expenses → Receipts to
 * enter (database update 19).
 */

type Result = { ok?: true; error?: string };

const missing = (m: string) => /receipt_inbox|does not exist|schema cache/.test(m);

export async function saveReceipt(input: { path: string; store: string; total: string; shopper: string; note: string }): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (!/^inbox\/\d{4}\/\d{2}\/[\w-]+\.(webp|jpg|jpeg|png|heic|pdf)$/.test(input.path)) return { error: "That photo didn't upload. Try again." };
  const total = input.total.trim() ? parseDollarsToCents(input.total) : null;
  if (input.total.trim() && total === null) return { error: "Enter the total like 84.17, or leave it empty." };
  const { error } = await supabase.from("receipt_inbox").insert({
    path: input.path,
    store: input.store.trim().slice(0, 60) || null,
    total_cents: total,
    shopper: input.shopper.trim().slice(0, 60) || null,
    note: input.note.trim().slice(0, 200) || null,
  });
  if (error) {
    // Don't leave a photo nobody can see.
    await supabase.storage.from(RECEIPT_BUCKET).remove([input.path]);
    return { error: missing(error.message) ? "Receipt photos need database update 19. Ask the manager to run it." : error.message };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Deletes a receipt photo that was snapped by mistake (the photo too). */
export async function deleteReceipt(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { data: row } = await supabase.from("receipt_inbox").select("path, expense_id").eq("id", id).maybeSingle();
  if (!row) return { ok: true };
  const { error } = await supabase.from("receipt_inbox").delete().eq("id", id);
  if (error) return { error: error.message };
  // Keep the file if a saved trip uses it.
  if (!row.expense_id) await supabase.storage.from(RECEIPT_BUCKET).remove([row.path]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** "Already entered" for a receipt that doesn't need a trip of its own. */
export async function dismissReceipt(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("receipt_inbox").update({ dismissed: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
