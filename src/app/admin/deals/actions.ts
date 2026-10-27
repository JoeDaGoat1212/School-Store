"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/format";

/*
 * Saving and deleting deals (sales, buy-X-get-Y) and bundles.
 * The forms send plain objects (not FormData) because bundles have a list of
 * products that grows and shrinks.
 */

export type DealResult = { ok?: boolean; errors?: Record<string, string>; message?: string };

const isoDate = z.iso.date({ message: "Pick a date" });
const dollars = (label: string) =>
  z.string().trim().transform((value, ctx) => {
    const cents = parseDollarsToCents(value);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: `${label} must be an amount like 1.50` });
      return z.NEVER;
    }
    return cents;
  });

const promotionSchema = z
  .object({
    kind: z.enum(["sale", "buy_get"]),
    title: z.string().trim().min(1, "Give the deal a name students will see").max(60, "Keep it under 60 characters"),
    target: z.enum(["product", "category"]),
    product_id: z.string().trim(),
    category: z.string().trim().max(30),
    sale_price: z.string().trim(),
    buy_qty: z.coerce.number().int().min(1).max(20),
    get_qty: z.coerce.number().int().min(1).max(20),
    starts_on: isoDate,
    ends_on: isoDate,
    members_only: z.boolean(),
    featured: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.ends_on < p.starts_on) ctx.addIssue({ code: "custom", path: ["ends_on"], message: "Ends before it starts" });
    if ((p.kind === "sale" || p.target === "product") && !p.product_id) {
      ctx.addIssue({ code: "custom", path: ["product_id"], message: "Choose a product" });
    }
    if (p.kind === "buy_get" && p.target === "category" && !p.category) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "Choose a category" });
    }
    if (p.kind === "sale" && parseDollarsToCents(p.sale_price) === null) {
      ctx.addIssue({ code: "custom", path: ["sale_price"], message: "Enter the sale price, like 1.00" });
    }
  });

export type PromotionInput = z.input<typeof promotionSchema>;

export async function savePromotion(id: string | null, input: PromotionInput): Promise<DealResult> {
  const { supabase } = await requireAdmin();
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return { errors: issuesToErrors(parsed.error), message: "Some fields need fixing." };
  const p = parsed.data;
  const salePrice = p.kind === "sale" ? parseDollarsToCents(p.sale_price)! : null;

  // A sale has to actually be cheaper than the normal price.
  if (p.kind === "sale") {
    const { data: product } = await supabase.from("products").select("price_cents").eq("id", p.product_id).single();
    if (product && salePrice! >= product.price_cents) {
      return { errors: { sale_price: "The sale price must be lower than the normal price" }, message: "Some fields need fixing." };
    }
  }

  const row = {
    kind: p.kind,
    title: p.title,
    product_id: p.kind === "sale" || p.target === "product" ? p.product_id : null,
    category: p.kind === "buy_get" && p.target === "category" ? p.category : null,
    sale_price_cents: salePrice,
    buy_qty: p.kind === "buy_get" ? p.buy_qty : null,
    get_qty: p.kind === "buy_get" ? p.get_qty : null,
    starts_on: p.starts_on,
    ends_on: p.ends_on,
    members_only: p.members_only,
    featured: p.featured,
    active: p.active,
  };

  const { error } = id
    ? await supabase.from("promotions").update(row).eq("id", id)
    : await supabase.from("promotions").insert(row);
  if (error) return { message: `Couldn't save: ${error.message}` };

  revalidatePath("/admin/deals");
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Deal saved" : "Deal created" };
}

const bundleSchema = z
  .object({
    name: z.string().trim().min(1, "Give the bundle a name").max(60, "Keep it under 60 characters"),
    description: z.string().trim().max(200, "Keep it under 200 characters"),
    emoji: z.string().trim().max(8, "Use just one emoji"),
    price: dollars("Price"),
    starts_on: z.union([isoDate, z.literal("")]),
    ends_on: z.union([isoDate, z.literal("")]),
    members_only: z.boolean(),
    active: z.boolean(),
    items: z
      .array(z.object({ product_id: z.string().min(1, "Choose a product"), quantity: z.coerce.number().int().min(1).max(20) }))
      .min(2, "A bundle needs at least 2 products"),
  })
  .superRefine((b, ctx) => {
    if (b.starts_on && b.ends_on && b.ends_on < b.starts_on) {
      ctx.addIssue({ code: "custom", path: ["ends_on"], message: "Ends before it starts" });
    }
    const ids = b.items.map((i) => i.product_id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Each product can only be listed once. Raise the quantity instead." });
    }
  });

export type BundleInput = z.input<typeof bundleSchema>;

export async function saveBundle(id: string | null, input: BundleInput): Promise<DealResult & { id?: string }> {
  const { supabase } = await requireAdmin();
  const parsed = bundleSchema.safeParse(input);
  if (!parsed.success) return { errors: issuesToErrors(parsed.error), message: "Some fields need fixing." };
  const b = parsed.data;

  const row = {
    name: b.name,
    description: b.description || null,
    emoji: b.emoji || null,
    price_cents: b.price,
    starts_on: b.starts_on || null,
    ends_on: b.ends_on || null,
    members_only: b.members_only,
    active: b.active,
    updated_at: new Date().toISOString(),
  };

  const saved = id
    ? await supabase.from("bundles").update(row).eq("id", id).select("id").single()
    : await supabase.from("bundles").insert(row).select("id").single();
  if (saved.error) return { message: `Couldn't save: ${saved.error.message}` };
  const bundleId = saved.data.id;

  // Replace what's inside.
  const del = await supabase.from("bundle_items").delete().eq("bundle_id", bundleId);
  if (del.error) return { message: `Couldn't save the products: ${del.error.message}` };
  const ins = await supabase
    .from("bundle_items")
    .insert(b.items.map((i) => ({ bundle_id: bundleId, product_id: i.product_id, quantity: i.quantity })));
  if (ins.error) return { message: `Couldn't save the products: ${ins.error.message}` };

  revalidatePath("/admin/deals");
  revalidatePath("/", "layout");
  return { ok: true, id: bundleId, message: id ? "Bundle saved" : "Bundle created" };
}

export async function deleteDeal(kind: "promotion" | "bundle", id: string): Promise<DealResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from(kind === "bundle" ? "bundles" : "promotions").delete().eq("id", id);
  if (error) return { message: `Couldn't delete: ${error.message}` };
  revalidatePath("/admin/deals");
  revalidatePath("/", "layout");
  return { ok: true, message: "Deleted" };
}

function issuesToErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}
