import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { BackLink } from "../back-link";
import { loadFormOptions } from "../load-form-data";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const { supabase } = await requireAdmin();
  const { categories, suppliers } = await loadFormOptions(supabase);

  return (
    <>
      <BackLink />
      <PageHeader title="Add product" />
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        initial={{
          id: null,
          name: "",
          description: "",
          category: "Snacks",
          emoji: "",
          photo_path: "",
          price: "",
          cost: "",
          stock: 0,
          reorder_point: 10,
          lead_days: 2,
          supplier_id: "",
          is_perishable: false,
          available_online: true,
          tags: ["new"],
          aliases: "",
        }}
      />
    </>
  );
}
