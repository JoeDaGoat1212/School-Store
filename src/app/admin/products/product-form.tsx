"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ImagePlusIcon, Loader2Icon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { ProductArt } from "@/components/product-art";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { PHOTO_BUCKET } from "@/lib/photos";
import { resizeImage } from "@/lib/resize-image";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { saveProduct, type ProductFormState } from "./actions";

export type ProductFormValues = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  emoji: string;
  photo_path: string;
  price: string; // dollars, e.g. "1.50"
  cost: string;
  stock: number;
  reorder_point: number;
  lead_days: number;
  supplier_id: string;
  is_perishable: boolean;
  available_online: boolean;
  tags: string[];
  aliases: string; // one per line
};

export function ProductForm({
  initial,
  categories,
  suppliers,
}: {
  initial: ProductFormValues;
  categories: string[];
  suppliers: { id: string; name: string }[];
}) {
  const isNew = initial.id === null;
  const [state, formAction, saving] = useActionState<ProductFormState, FormData>(
    saveProduct.bind(null, initial.id),
    {},
  );
  const errors = state.errors ?? {};

  // Live values used for the preview and margin.
  const [name, setName] = useState(initial.name);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [category, setCategory] = useState(initial.category);
  const [price, setPrice] = useState(initial.price);
  const [cost, setCost] = useState(initial.cost);
  const [photoPath, setPhotoPath] = useState(initial.photo_path);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const priceCents = parseDollarsToCents(price);
  const costCents = parseDollarsToCents(cost);
  const margin =
    priceCents && costCents !== null && priceCents > 0 ? Math.round(((priceCents - costCents) / priceCents) * 100) : null;

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const path = `products/${crypto.randomUUID()}.webp`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      setPhotoPath(path);
      toast.success("Photo uploaded. Save to keep it.");
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_300px]" noValidate>
      <input type="hidden" name="photo_path" value={photoPath} />

      <div className="grid gap-6">
        {state.message && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {state.message}
          </p>
        )}

        <Section title="Basics">
          <Field id="name" label="Name" error={errors.name}>
            <Input id="name" aria-invalid={!!errors.name} name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </Field>
          <Field id="description" label="Short description" hint="Shown under the name on the menu." error={errors.description}>
            <Input className="h-10" id="description" name="description" defaultValue={initial.description} maxLength={140} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field id="category" label="Category" hint="Pick one or type a new one." error={errors.category}>
              <Input className="h-10"
                id="category"
                aria-invalid={!!errors.category}
                name="category"
                list="category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field id="emoji" label="Emoji" hint="If no photo." error={errors.emoji}>
              <Input id="emoji" name="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} className="h-10 text-center text-lg" />
            </Field>
          </div>
        </Section>

        <Section title="Price">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="price" label="Price" error={errors.price}>
              <MoneyInput id="price" aria-invalid={!!errors.price} name="price" value={price} onChange={setPrice} />
            </Field>
            <Field id="cost" label="Cost per item" hint="What the store pays." error={errors.cost}>
              <MoneyInput id="cost" aria-invalid={!!errors.cost} name="cost" value={cost} onChange={setCost} />
            </Field>
            <div className="grid content-start gap-2">
              <span className="text-sm font-medium">Profit per item</span>
              <p className="flex h-10 items-baseline gap-2 font-heading text-xl font-semibold tabular-nums">
                {priceCents !== null && costCents !== null ? formatCents(priceCents - costCents) : "—"}
                {margin !== null && (
                  <span className={cn("text-sm font-medium", margin < 30 ? "text-warning" : "text-muted-foreground")}>
                    {margin}% margin
                  </span>
                )}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Stock">
          <div className="grid gap-4 sm:grid-cols-3">
            {isNew ? (
              <Field id="starting_stock" label="Starting stock" hint="How many you have now." error={errors.starting_stock}>
                <Input className="h-10" id="starting_stock" name="starting_stock" type="number" inputMode="numeric" min={0} defaultValue={0} />
              </Field>
            ) : (
              <div className="grid content-start gap-2">
                <span className="text-sm font-medium">In stock</span>
                <p className="flex h-10 items-center font-heading text-xl font-semibold tabular-nums">{initial.stock}</p>
                <p className="text-xs text-muted-foreground">
                  Change counts on the{" "}
                  <Link href="/admin/inventory" className="text-ember-ink underline-offset-4 hover:underline">
                    Inventory
                  </Link>{" "}
                  page.
                </p>
              </div>
            )}
            <Field id="reorder_point" label="Reorder point" hint="Warn me at this many." error={errors.reorder_point}>
              <Input className="h-10" id="reorder_point" name="reorder_point" type="number" inputMode="numeric" min={0} defaultValue={initial.reorder_point} />
            </Field>
            <Field id="lead_days" label="Restock lead time" hint="Days to get more." error={errors.lead_days}>
              <Input className="h-10" id="lead_days" name="lead_days" type="number" inputMode="numeric" min={0} defaultValue={initial.lead_days} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="supplier_id" label="Supplier" error={errors.supplier_id}>
              <Select name="supplier_id" defaultValue={initial.supplier_id || "none"}>
                <SelectTrigger id="supplier_id" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="new_supplier" label="…or add a new supplier" error={errors.new_supplier}>
              <Input className="h-10" id="new_supplier" name="new_supplier" placeholder="e.g. Target" maxLength={60} />
            </Field>
          </div>

          <ToggleRow
            name="is_perishable"
            label="Perishable"
            description="Track expiration dates (fruit, baked goods, milk)."
            defaultChecked={initial.is_perishable}
          />
        </Section>

        <Section title="InTouchPay names">
          <Field
            id="aliases"
            label="Names in the sales export"
            hint="How this item appears in the InTouchPay export, one per line. The import uses these to match sales to this product."
            error={errors.aliases}
          >
            <Textarea
              id="aliases"
              aria-invalid={!!errors.aliases}
              name="aliases"
              defaultValue={initial.aliases}
              rows={3}
              placeholder={"HOT CHEETOS 1OZ\nCHEETOS FLAMIN HOT"}
              className="font-mono text-sm"
            />
          </Field>
        </Section>
      </div>

      {/* Right column: how it looks on the menu */}
      <aside className="grid content-start gap-6">
        <Section title="Photo">
          <ProductArt
            name={name || "New product"}
            photoPath={photoPath || null}
            emoji={emoji || null}
            category={category}
            className="aspect-square w-full rounded-xl"
            emojiClassName="text-7xl"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
              {photoPath ? "Replace photo" : "Upload photo"}
            </Button>
            {photoPath && (
              <Button type="button" variant="outline" size="icon" aria-label="Remove photo" onClick={() => setPhotoPath("")}>
                <TrashIcon />
              </Button>
            )}
          </div>
        </Section>

        <Section title="Menu">
          <ToggleRow
            name="available_online"
            label="Show on online menu"
            description="Students can order it ahead."
            defaultChecked={initial.available_online}
          />
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Labels</legend>
            <TagCheckbox value="new" label="New" defaultChecked={initial.tags.includes("new")} />
            <TagCheckbox value="limited" label="Limited stock" defaultChecked={initial.tags.includes("limited")} />
          </fieldset>
        </Section>

        <div className="sticky bottom-4 flex gap-2 rounded-2xl border bg-card/95 p-3 shadow-soft backdrop-blur">
          <Button type="button" variant="ghost" asChild>
            <Link href="/admin/products">Cancel</Link>
          </Button>
          <Button type="submit" className="flex-1" disabled={saving || uploading}>
            {saving && <Loader2Icon className="animate-spin" />}
            {isNew ? "Add product" : "Save changes"}
          </Button>
        </div>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A label, the input (passed as children), and a hint or error underneath.
 * Give the input the same `id` as the Field's `id` so the label points at it.
 */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error || hint) && (
        <p id={`${id}-help`} className={cn("text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function MoneyInput({
  name,
  value,
  onChange,
  ...rest
}: { name: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        {...rest}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="h-10 pl-7 tabular-nums"
      />
    </div>
  );
}

function ToggleRow({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  const id = `toggle-${name}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} name={name} value="on" defaultChecked={defaultChecked} />
    </div>
  );
}

function TagCheckbox({ value, label, defaultChecked }: { value: string; label: string; defaultChecked: boolean }) {
  const id = `tag-${value}`;
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} name="tags" value={value} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
