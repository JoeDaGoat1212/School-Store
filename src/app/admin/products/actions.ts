"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/photos";
import { fieldErrors, productSchema } from "@/lib/validation";

export type ProductFormState = { errors?: Record<string, string>; message?: string };

/**
 * Creates a product (no id) or updates one (with id). Called by the product form.
 *
 * Steps: check the form → add a new supplier if one was typed → save the
 * product → record starting stock (new products only) → replace its
 * InTouchPay names → go back to the product list.
 */
export async function saveProduct(
  productId: string | null,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { supabase, user } = await requireAdmin();

  const parsed = productSchema.safeParse({
    ...Object.fromEntries(formData),
    tags: formData.getAll("tags"),
  });
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: "Some fields need fixing." };
  }
  const p = parsed.data;

  // 0. Check the InTouchPay names first: each one can belong to only one
  //    product. Checking before saving anything means a clash changes nothing.
  if (p.aliases.length > 0) {
    let clash = supabase.from("product_aliases").select("alias, products(name)").in("alias", p.aliases);
    if (productId) clash = clash.neq("product_id", productId);
    const { data: taken } = await clash;
    if (taken && taken.length > 0) {
      const list = taken.map((t) => `${t.alias.toUpperCase()} (${t.products?.name ?? "another product"})`).join(", ");
      return {
        errors: { aliases: `Already used by another product: ${list}` },
        message: "Some fields need fixing.",
      };
    }
  }

  // 1. Supplier: use the chosen one, or create the one typed in.
  let supplierId: string | null = p.supplier_id && p.supplier_id !== "none" ? p.supplier_id : null;
  if (p.new_supplier) {
    const { data, error } = await supabase
      .from("suppliers")
      .upsert({ name: p.new_supplier }, { onConflict: "name" })
      .select("id")
      .single();
    if (error) return { message: `Couldn't add the supplier: ${error.message}` };
    supplierId = data.id;
  }

  const row = {
    name: p.name,
    description: p.description || null,
    category: p.category,
    emoji: p.emoji || null,
    price_cents: p.price,
    unit_cost_cents: p.cost,
    reorder_point: p.reorder_point,
    lead_days: p.lead_days,
    supplier_id: supplierId,
    is_perishable: p.is_perishable,
    available_online: p.available_online,
    tags: p.tags,
    photo_path: p.photo_path || null,
  };

  // 2. Save the product.
  let id = productId;
  let oldPhoto: string | null = null;

  if (id) {
    const { data: before } = await supabase.from("products").select("photo_path").eq("id", id).single();
    oldPhoto = before?.photo_path ?? null;

    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) return { message: `Couldn't save: ${error.message}` };
  } else {
    const { data, error } = await supabase.from("products").insert(row).select("id").single();
    if (error) return { message: `Couldn't create the product: ${error.message}` };
    id = data.id;

    // 3. Starting stock goes through the stock history like every other change.
    if (p.starting_stock && p.starting_stock > 0) {
      await supabase.from("stock_movements").insert({
        product_id: id,
        change: p.starting_stock,
        reason: "initial",
        effective_date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date()),
        note: "Starting count",
        created_by: user.id,
      });
    }
  }

  // 4. InTouchPay names: replace the whole list.
  await supabase.from("product_aliases").delete().eq("product_id", id);
  if (p.aliases.length > 0) {
    const { error } = await supabase.from("product_aliases").insert(p.aliases.map((alias) => ({ product_id: id, alias })));
    if (error) {
      return {
        errors: { aliases: `Couldn't save the InTouchPay names: ${error.message}` },
        message: "The product was saved, but its InTouchPay names weren't.",
      };
    }
  }

  // 5. If the photo was replaced or removed, delete the old file.
  if (oldPhoto && oldPhoto !== row.photo_path) {
    await supabase.storage.from(PHOTO_BUCKET).remove([oldPhoto]);
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect(`/admin/products?saved=${encodeURIComponent(p.name)}`);
}

/** Hides a product from the menu and lists (or brings it back). History is kept. */
export async function setArchived(productId: string, archived: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("products").update({ archived }).eq("id", productId);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: true };
}

/** Quick on/off for "show on the online menu", straight from the product list. */
export async function setAvailableOnline(productId: string, available: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("products").update({ available_online: available }).eq("id", productId);
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: true };
}
