import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pill } from "@/components/status-badge";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { BackLink } from "../back-link";
import { loadFormOptions } from "../load-form-data";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit product" };

/** Cents → "1.50" for the price inputs. */
const toDollars = (cents: number) => (cents / 100).toFixed(2);

export default async function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  const { id } = await props.params;
  const { supabase } = await requireAdmin();

  const [{ data: product }, { categories, suppliers }] = await Promise.all([
    supabase.from("products").select("*, product_aliases(alias)").eq("id", id).maybeSingle(),
    loadFormOptions(supabase),
  ]);
  if (!product) notFound();

  return (
    <>
      <BackLink />
      <PageHeader
        title={product.name}
        actions={product.archived ? <Pill tone="neutral">Archived</Pill> : undefined}
      />
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        initial={{
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          category: product.category,
          emoji: product.emoji ?? "",
          photo_path: product.photo_path ?? "",
          price: toDollars(product.price_cents),
          cost: toDollars(product.unit_cost_cents),
          stock: product.stock,
          reorder_point: product.reorder_point,
          lead_days: product.lead_days,
          supplier_id: product.supplier_id ?? "",
          is_perishable: product.is_perishable,
          available_online: product.available_online,
          tags: product.tags,
          aliases: product.product_aliases.map((a) => a.alias.toUpperCase()).join("\n"),
        }}
      />
    </>
  );
}
