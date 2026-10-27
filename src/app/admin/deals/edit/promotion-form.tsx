"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/lib/supabase/database.types";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { savePromotion } from "../actions";
import type { ProductOption } from "./page";
import { Field, FormFooter, MoneyInput, SwitchRow } from "./deal-fields";

/** Form for a sale (lower price on one product) or a buy-X-get-Y deal. */
export function PromotionForm({
  id,
  kind,
  initial,
  products,
  categories,
  today,
}: {
  id: string | null;
  kind: "sale" | "buy_get";
  initial: Tables<"promotions"> | null;
  products: ProductOption[];
  categories: string[];
  today: string;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(initial?.title ?? "");
  const [target, setTarget] = useState<"product" | "category">(initial?.category ? "category" : "product");
  const [productId, setProductId] = useState(initial?.product_id ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [salePrice, setSalePrice] = useState(initial?.sale_price_cents != null ? (initial.sale_price_cents / 100).toFixed(2) : "");
  const [buyQty, setBuyQty] = useState(String(initial?.buy_qty ?? 2));
  const [getQty, setGetQty] = useState(String(initial?.get_qty ?? 1));
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? today);
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? today);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [membersOnly, setMembersOnly] = useState(initial?.members_only ?? false);
  const [active, setActive] = useState(initial?.active ?? true);

  const product = products.find((p) => p.id === productId);
  // A sensible name until staff type their own.
  const suggestedTitle =
    kind === "sale"
      ? product
        ? `${product.name} sale`
        : "Sale"
      : `Buy ${buyQty}, get ${getQty} free`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      const result = await savePromotion(id, {
        kind,
        title: title || suggestedTitle,
        target: kind === "sale" ? "product" : target,
        product_id: productId,
        category,
        sale_price: salePrice,
        buy_qty: buyQty,
        get_qty: getQty,
        starts_on: startsOn,
        ends_on: endsOn,
        members_only: membersOnly,
        featured,
        active,
      });
      setErrors(result.errors ?? {});
      if (result.ok) {
        toast.success(result.message);
        router.push("/admin/deals");
      } else if (result.message) {
        toast.error(result.message);
      }
    });
  };

  const productSelect = (
    <Field id="product" label="Product" error={errors.product_id}>
      <Select value={productId} onValueChange={setProductId}>
        <SelectTrigger id="product" className="h-10 w-full" aria-invalid={Boolean(errors.product_id)}>
          <SelectValue placeholder="Choose a product" />
        </SelectTrigger>
        <SelectContent>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.emoji} {p.name} ({formatCents(p.price_cents)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl rounded-2xl border bg-card shadow-soft">
      <div className="grid gap-6 p-5">
        {kind === "sale" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {productSelect}
            <Field
              id="sale_price"
              label="Sale price"
              error={errors.sale_price}
              hint={product ? `Normally ${formatCents(product.price_cents)}` : undefined}
            >
              <MoneyInput id="sale_price" value={salePrice} onChange={setSalePrice} error={errors.sale_price} />
            </Field>
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Which items count?</span>
              <div role="radiogroup" aria-label="Which items count" className="flex w-fit rounded-lg bg-muted p-1">
                {(["product", "category"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={target === t}
                    onClick={() => setTarget(t)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      target === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === "product" ? "One product" : "A whole category"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-[1fr_auto_auto]">
              {target === "product" ? (
                productSelect
              ) : (
                <Field id="category" label="Category" error={errors.category} hint="Students can mix and match.">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" className="h-10 w-full" aria-invalid={Boolean(errors.category)}>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field id="buy_qty" label="Buy" error={errors.buy_qty}>
                <Input id="buy_qty" type="number" min={1} max={20} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="h-10 w-20" />
              </Field>
              <Field id="get_qty" label="Get free" error={errors.get_qty}>
                <Input id="get_qty" type="number" min={1} max={20} value={getQty} onChange={(e) => setGetQty(e.target.value)} className="h-10 w-20" />
              </Field>
            </div>
          </>
        )}

        <Field id="title" label="Name students see" error={errors.title} hint="Short and fun, like “Takis Tuesday”.">
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={suggestedTitle}
            maxLength={60}
            aria-invalid={Boolean(errors.title)}
            className="h-10"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="starts_on" label="First day" error={errors.starts_on}>
            <Input id="starts_on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-10" />
          </Field>
          <Field id="ends_on" label="Last day" error={errors.ends_on} hint="Same as the first day for a one-day deal.">
            <Input id="ends_on" type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-10" />
          </Field>
        </div>

        <div className="grid gap-4 rounded-xl bg-muted/50 p-4">
          <SwitchRow
            id="featured"
            label="Deal of the day"
            hint="Shown big at the top of the menu. If several are on, the oldest one shows."
            checked={featured}
            onChange={setFeatured}
          />
          <SwitchRow
            id="members_only"
            label="Members only"
            hint="Only for students signed in to rewards. Everyone else sees it with a “sign in” prompt."
            checked={membersOnly}
            onChange={setMembersOnly}
          />
          <SwitchRow id="active" label="On" hint="Switch off to pause it without deleting." checked={active} onChange={setActive} />
        </div>
      </div>
      <FormFooter
        saving={saving}
        saveLabel={id ? "Save deal" : "Create deal"}
        deleteTarget={id ? { kind: "promotion", id, name: initial?.title ?? "this deal" } : undefined}
      />
    </form>
  );
}
