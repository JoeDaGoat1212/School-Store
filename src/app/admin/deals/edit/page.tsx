import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";
import { BundleForm } from "./bundle-form";
import { PromotionForm } from "./promotion-form";

export const metadata: Metadata = { title: "Edit deal" };

export type ProductOption = { id: string; name: string; price_cents: number; category: string; emoji: string | null };

/** One page for every kind: ?kind=sale | buy_get | bundle, and &id= to edit. */
export default async function EditDealPage(props: PageProps<"/admin/deals/edit">) {
  const { kind: rawKind, id: rawId } = await props.searchParams;
  const kind = rawKind === "buy_get" || rawKind === "bundle" ? rawKind : "sale";
  const id = typeof rawId === "string" ? rawId : null;
  const { supabase } = await requireAdmin();

  const { data: productRows } = await supabase
    .from("products")
    .select("id, name, price_cents, category, emoji")
    .eq("archived", false)
    .order("category")
    .order("name");
  const products: ProductOption[] = productRows ?? [];
  const categories = [...new Set(products.map((p) => p.category))];
  const today = storeToday();

  const back = (
    <Link href="/admin/deals" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> All deals
    </Link>
  );

  if (kind === "bundle") {
    let initial = null;
    if (id) {
      const { data } = await supabase
        .from("bundles")
        .select("id, name, description, emoji, price_cents, starts_on, ends_on, members_only, active, bundle_items(product_id, quantity)")
        .eq("id", id)
        .maybeSingle();
      if (!data) notFound();
      initial = data;
    }
    return (
      <>
        {back}
        <PageHeader
          title={id ? `Edit ${initial?.name}` : "New bundle"}
          description="A few products sold together for one price. Each product's stock goes down when a bundle is picked up."
        />
        <BundleForm id={id} initial={initial} products={products} />
      </>
    );
  }

  let initial = null;
  if (id) {
    const { data } = await supabase.from("promotions").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    initial = data;
  }
  const isSale = (initial?.kind ?? kind) === "sale";

  return (
    <>
      {back}
      <PageHeader
        title={id ? `Edit ${initial?.title}` : isSale ? "New sale" : "New buy X, get Y deal"}
        description={
          isSale
            ? "A lower price on one product for a few days. Students see the old price crossed out."
            : "Buy some, get some free. The cheapest items in the deal are the free ones, and it comes off automatically in the cart."
        }
      />
      <PromotionForm
        id={id}
        kind={isSale ? "sale" : "buy_get"}
        initial={initial}
        products={products}
        categories={categories}
        today={today}
      />
    </>
  );
}
