"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveCombo } from "../actions";
import type { ProductOption } from "./page";
import { Field, FormFooter, MoneyInput, SwitchRow } from "./deal-fields";

/** What's saved in promotions.combo_slots. */
export type SavedSlot = { label: string; quantity: number; category?: string; product_ids?: string[] };

export type InitialCombo = {
  title: string;
  sale_price_cents: number | null;
  starts_on: string;
  ends_on: string | null;
  members_only: boolean;
  featured: boolean;
  active: boolean;
  combo_slots: SavedSlot[];
};

type Slot = { key: string; label: string; quantity: string; by: "category" | "products"; category: string; product_ids: string[] };

/**
 * A combo: a few "parts" (Chips, Soda, 2 Candy…), each filled by any product
 * from a list or a whole category, for one price. Students pick what goes in
 * each part; the cart spots it and takes the difference off.
 */
export function ComboForm({
  id,
  initial,
  products,
  categories,
}: {
  id: string | null;
  initial: InitialCombo | null;
  products: ProductOption[];
  categories: string[];
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [price, setPrice] = useState(initial?.sale_price_cents != null ? (initial.sale_price_cents / 100).toFixed(2) : "");
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
  const [membersOnly, setMembersOnly] = useState(initial?.members_only ?? false);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [slots, setSlots] = useState<Slot[]>(
    initial?.combo_slots.length
      ? initial.combo_slots.map((s, i) => ({
          key: String(i),
          label: s.label,
          quantity: String(s.quantity),
          by: s.category ? "category" : "products",
          category: s.category ?? "",
          product_ids: s.product_ids ?? [],
        }))
      : [
          { key: "a", label: "", quantity: "1", by: "products", category: "", product_ids: [] },
          { key: "b", label: "", quantity: "1", by: "products", category: "", product_ids: [] },
        ],
  );

  const update = (key: string, patch: Partial<Slot>) => setSlots((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const inSlot = (s: Slot) => products.filter((p) => (s.by === "category" ? p.category === s.category : s.product_ids.includes(p.id)));
  // The most it can be worth: the priciest things in every part.
  const top = slots.reduce((sum, s) => sum + Math.max(0, ...inSlot(s).map((p) => p.price_cents)) * (Number(s.quantity) || 0), 0);
  const priceCents = parseDollarsToCents(price);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      const result = await saveCombo(id, {
        title,
        price,
        starts_on: startsOn,
        ends_on: endsOn,
        members_only: membersOnly,
        featured,
        active,
        slots: slots.map(({ label, quantity, by, category, product_ids }) => ({ label, quantity, by, category, product_ids })),
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

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl rounded-2xl border bg-card shadow-soft">
      <div className="grid gap-6 p-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <Field id="title" label="Combo name" error={errors.title}>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chips + soda" maxLength={60} className="h-10" />
          </Field>
          <Field
            id="price"
            label="Combo price"
            error={errors.price}
            hint={top > 0 && priceCents !== null && top > priceCents ? `Saves up to ${formatCents(top - priceCents)}` : undefined}
          >
            <MoneyInput id="price" value={price} onChange={setPrice} error={errors.price} />
          </Field>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">What goes in it</legend>
          {slots.map((s, i) => (
            <div key={s.key} className="grid gap-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-foreground text-xs font-bold text-background">{i + 1}</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={s.quantity}
                  onChange={(e) => update(s.key, { quantity: e.target.value })}
                  aria-label={`How many in part ${i + 1}`}
                  className="h-10 w-16"
                />
                <Input value={s.label} onChange={(e) => update(s.key, { label: e.target.value })} placeholder="Candy" aria-label={`Name of part ${i + 1}`} maxLength={30} className="h-10 min-w-32 flex-1" />
                <div role="radiogroup" aria-label={`Part ${i + 1} is filled by`} className="flex rounded-lg bg-muted p-0.5 text-sm">
                  {(["category", "products"] as const).map((by) => (
                    <button
                      key={by}
                      type="button"
                      role="radio"
                      aria-checked={s.by === by}
                      onClick={() => update(s.key, { by })}
                      className={cn("h-9 rounded-md px-3 font-medium", s.by === by ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >
                      {by === "category" ? "A whole category" : "Pick products"}
                    </button>
                  ))}
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove part ${i + 1}`} disabled={slots.length <= 1} onClick={() => setSlots((all) => all.filter((x) => x.key !== s.key))}>
                  <XIcon />
                </Button>
              </div>

              {s.by === "category" ? (
                <Select value={s.category} onValueChange={(v) => update(s.key, { category: v })}>
                  <SelectTrigger className="h-10" aria-label={`Category for part ${i + 1}`}>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c} (anything in it, including new products)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {products.map((p) => {
                    const on = s.product_ids.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update(s.key, { product_ids: on ? s.product_ids.filter((x) => x !== p.id) : [...s.product_ids, p.id] })}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          on ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
                        )}
                      >
                        {p.emoji} {p.name} <span className="opacity-60">{formatCents(p.price_cents)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {inSlot(s).length} product{inSlot(s).length === 1 ? "" : "s"} can go in this part.
              </p>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={slots.length >= 6}
            onClick={() => setSlots((all) => [...all, { key: crypto.randomUUID(), label: "", quantity: "1", by: "products", category: "", product_ids: [] }])}
          >
            <PlusIcon /> Add a part
          </Button>
          {errors.slots && <p className="text-xs font-medium text-destructive">{errors.slots}</p>}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="starts_on" label="First day (optional)" error={errors.starts_on} hint="Empty = starts today.">
            <Input id="starts_on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-10" />
          </Field>
          <Field id="ends_on" label="Last day (optional)" error={errors.ends_on} hint="Empty = keeps going.">
            <Input id="ends_on" type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} className="h-10" />
          </Field>
        </div>

        <div className="grid gap-4 rounded-xl bg-muted/50 p-4">
          <SwitchRow id="featured" label="Show it first" hint="Featured combos come first on the deals page." checked={featured} onChange={setFeatured} />
          <SwitchRow id="members_only" label="Members only" hint="Only students signed in to rewards get the combo price." checked={membersOnly} onChange={setMembersOnly} />
          <SwitchRow id="active" label="On" hint="Switch off to hide it without deleting." checked={active} onChange={setActive} />
        </div>
      </div>
      <FormFooter saving={saving} saveLabel={id ? "Save combo" : "Create combo"} deleteTarget={id ? { kind: "promotion", id, name: initial?.title ?? "this combo" } : undefined} />
    </form>
  );
}
