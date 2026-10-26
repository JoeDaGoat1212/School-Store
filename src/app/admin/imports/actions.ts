"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

function refreshPages() {
  for (const path of ["/admin/imports", "/admin/inventory", "/admin", "/admin/insights", "/"]) revalidatePath(path);
}

/** Removes an import's sales and corrects stock. The file can be imported again later. */
export async function undoImport(importId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("undo_import", { p_import_id: importId });
  if (error) return { error: error.hint || error.message };
  refreshPages();
  return { ok: true };
}

/** Links every sale with this InTouchPay name to a product, and remembers the name. */
export async function linkItemName(rawName: string, productId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("link_item_name", { p_raw_name: rawName, p_product_id: productId });
  if (error) return { error: error.hint || error.message };
  refreshPages();
  return { ok: true, linked: data as number };
}
