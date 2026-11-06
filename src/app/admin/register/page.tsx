import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { addDays, storeToday } from "@/lib/format";
import { productPhotoUrl } from "@/lib/photos";
import { RegisterScreen, type RegisterProduct } from "./register-screen";

export const metadata: Metadata = { title: "Register" };

/**
 * The counter screen: scan (or tap) each item as it's handed over, and stock
 * goes down by itself. Works with any barcode scanner that types like a
 * keyboard (hands-free ones included).
 */
export default async function RegisterPage() {
  const { supabase } = await requireAdmin();
  const today = storeToday();

  const [products, aliases, recent] = await Promise.all([
    supabase.from("products").select("id, name, emoji, photo_path, price_cents, stock, category").eq("archived", false).order("name"),
    supabase.from("product_aliases").select("alias, product_id").like("alias", "upc:%"),
    // The last 30 days of tallies: today's totals, and which items to put first.
    supabase
      .from("stock_movements")
      .select("product_id, change, effective_date")
      .eq("note", "Register tally")
      .gte("effective_date", addDays(today, -30)),
  ]);
  if (products.error) throw new Error(products.error.message);

  const soldToday = new Map<string, number>();
  const popularity = new Map<string, number>();
  for (const m of recent.data ?? []) {
    popularity.set(m.product_id, (popularity.get(m.product_id) ?? 0) - m.change);
    if (m.effective_date === today) soldToday.set(m.product_id, (soldToday.get(m.product_id) ?? 0) - m.change);
  }

  const list: RegisterProduct[] = products.data
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      photo: productPhotoUrl(p.photo_path),
      price: p.price_cents,
      stock: p.stock,
      category: p.category,
      soldToday: soldToday.get(p.id) ?? 0,
      popularity: popularity.get(p.id) ?? 0,
    }))
    // Best sellers first, so the buttons you need most are at the top.
    .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));

  const barcodes = Object.fromEntries((aliases.data ?? []).map((a) => [a.alias.slice(4), a.product_id]));

  return <RegisterScreen products={list} barcodes={barcodes} today={today} />;
}
