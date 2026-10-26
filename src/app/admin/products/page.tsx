import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { ProductsTable, type ProductRow } from "./products-table";
import { SavedToast } from "./saved-toast";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: products, error }, { data: reserved }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, category, emoji, photo_path, price_cents, unit_cost_cents, stock, reorder_point, available_online, archived, tags, suppliers(name), product_aliases(alias)",
      )
      .order("category")
      .order("name"),
    supabase.from("product_reserved").select("product_id, reserved"),
  ]);
  if (error) throw new Error(error.message);

  const reservedById = new Map((reserved ?? []).map((r) => [r.product_id, r.reserved ?? 0]));

  const rows: ProductRow[] = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    emoji: p.emoji,
    photo_path: p.photo_path,
    price_cents: p.price_cents,
    unit_cost_cents: p.unit_cost_cents,
    stock: p.stock,
    reserved: reservedById.get(p.id) ?? 0,
    reorder_point: p.reorder_point,
    available_online: p.available_online,
    archived: p.archived,
    tags: p.tags,
    supplier: p.suppliers?.name ?? null,
    aliasCount: p.product_aliases.length,
  }));

  return (
    <>
      <Suspense>
        <SavedToast />
      </Suspense>
      <PageHeader
        title="Products"
        description="What the store sells. Turn off “Online” to hide an item from the student menu."
        actions={
          <Button asChild>
            <Link href="/admin/products/new">
              <PlusIcon /> Add product
            </Link>
          </Button>
        }
      />
      <ProductsTable rows={rows} />
    </>
  );
}
