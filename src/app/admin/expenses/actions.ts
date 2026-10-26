"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { RECEIPT_BUCKET } from "@/lib/photos";

const lineSchema = z.object({
  product_id: z.string().nullable(),
  description: z.string().trim().max(80),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10000),
  unit_cost_cents: z.number().int().min(0, "Cost can't be negative"),
  update_cost: z.boolean(),
  expires_on: z.string().nullable(),
});

const expenseSchema = z.object({
  purchased_on: z.iso.date("Choose the date of the trip"),
  supplier_id: z.string(),
  new_supplier: z.string().trim().max(60),
  buyer_name: z.string().trim().min(1, "Enter who did the shopping").max(60),
  receipt_path: z.string(),
  notes: z.string().trim().max(500),
  items: z.array(lineSchema).min(1, "Add at least one item"),
});

export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseState = { message?: string };

/**
 * Saves a shopping trip. The database function save_expense adds the
 * items to stock, records expiration dates for perishables, and updates
 * product costs — all at once, so a half-saved trip can't happen.
 */
export async function createExpense(input: ExpenseInput): Promise<ExpenseState> {
  const { supabase } = await requireAdmin();

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const e = parsed.data;

  const missingName = e.items.find((i) => !i.product_id && !i.description);
  if (missingName) return { message: "Lines that aren't a product need a description (e.g. Napkins)." };

  let supplierId = e.supplier_id && e.supplier_id !== "none" ? e.supplier_id : "";
  if (e.new_supplier) {
    const { data, error } = await supabase
      .from("suppliers")
      .upsert({ name: e.new_supplier }, { onConflict: "name" })
      .select("id")
      .single();
    if (error) return { message: `Couldn't add the store: ${error.message}` };
    supplierId = data.id;
  }

  const { data: id, error } = await supabase.rpc("save_expense", {
    p: { ...e, supplier_id: supplierId },
  });
  if (error) return { message: error.hint || error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin/expenses/${id}?saved=1`);
}

/** Deletes a trip entered by mistake (takes its stock back off) and its receipt. */
export async function deleteExpense(expenseId: string) {
  const { supabase } = await requireAdmin();
  const { data: receiptPath, error } = await supabase.rpc("delete_expense", { p_expense_id: expenseId });
  if (error) return { error: error.hint || error.message };

  if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath]);

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect("/admin/expenses?deleted=1");
}
