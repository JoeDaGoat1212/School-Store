"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { saveBundle } from "../actions";
import type { ProductOption } from "./page";
import { Field, FormFooter, MoneyInput, SwitchRow } from "./deal-fields";

type InitialBundle = {
  name: string;
  description: string | null;
  emoji: string | null;
  price_cents: number;
  starts_on: string | null;
  ends_on: string | null;
  members_only: boolean;
  active: boolean;
  bundle_items: { product_id: string; quantity: number }[];
};

type Row = { key: string; product_id: string; quantity: string };

/** Form for a bundle: a list of products and one price for all of them. */
export function BundleForm({
  id,
  initial,
  products,
}: {
  id: string | null;
  initial: InitialBundle | null;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [price, setPrice] = useState(initial ? (initial.price_cents / 100).toFixed(2) : "");
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
  const [membersOnly, setMembersOnly] = useState(initial?.members_only ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [rows, setRows] = useState<Row[]>(
    initial?.bundle_items.length
      ? initial.bundle_items.map((i) => ({ key: i.product_id, product_id: i.product_id, quantity: String(i.quantity) }))
      : [
          { key: "a", product_id: "", quantity: "1" },
          { key: "b", product_id: "", quantity: "1" },
        ],
  );

  const byId = new Map(products.map((p) => [p.id, p]));
  const regular = rows.reduce((n, r) => n + (byId.get(r.product_id)?.price_cents ?? 0) * (Number(r.quantity) || 0), 0);
  const priceCents = parseDollarsToCents(price);
  const savings = priceCents !== null ? regular - priceCents : null;

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      const result = await saveBundle(id, {
        name,
        description,
        emoji,
        price,
        starts_on: startsOn,
        ends_on: endsOn,
        members_only: membersOnly,
        active,
        items: rows.filter((r) => r.product_id).map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
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
    <form onSubmit={submit} noValidate className="max-w-2xl rounded-2xl border bg-card shadow-soft">
      <div className="grid gap-6 p-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_7rem]">
          <Field id="name" label="Bundle name" error={errors.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chips + drink" maxLength={60} className="h-10" />
          </Field>
          <Field id="emoji" label="Emoji (optional)" error={errors.emoji} hint="Else we show what's inside.">
            <Input id="emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="h-10 text-center text-lg" />
          </Field>
        </div>

        {/* What's inside */}
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">What&apos;s inside</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2">
              <Select value={r.product_id} onValueChange={(v) => update(r.key, { product_id: v })}>
                <SelectTrigger className="h-10 flex-1" aria-label={`Product ${i + 1}`}>
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
              <Input
                type="number"
                min={1}
                max={20}
                value={r.quantity}
                onChange={(e) => update(r.key, { quantity: e.target.value })}
                aria-label={`How many of product ${i + 1}`}
                className="h-10 w-20"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove product ${i + 1}`}
                disabled={rows.length <= 2}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), product_id: "", quantity: "1" }])}
          >
            <PlusIcon /> Add a product
          </Button>
          {errors.items && <p className="text-xs font-medium text-destructive">{errors.items}</p>}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="price"
            label="Bundle price"
            error={errors.price}
            hint={
              regular > 0
                ? savings !== null && savings > 0
                  ? `Bought separately: ${formatCents(regular)}. Students save ${formatCents(savings)}.`
                  : `Bought separately: ${formatCents(regular)}.`
                : undefined
            }
          >
            <MoneyInput id="price" value={price} onChange={setPrice} error={errors.price} />
          </Field>
          <Field id="description" label="Description (optional)" error={errors.description}>
            <Textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="Any chips with any drink"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="starts_on" label="First day (optional)" error={errors.starts_on}>
            <Input id="starts_on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-10" />
          </Field>
          <Field id="ends_on" label="Last day (optional)" error={errors.ends_on} hint="Leave both empty to always offer it.">
            <Input id="ends_on" type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} className="h-10" />
          </Field>
        </div>

        <div className="grid gap-4 rounded-xl bg-muted/50 p-4">
          <SwitchRow
            id="members_only"
            label="Members only"
            hint="Only students signed in to rewards can add it."
            checked={membersOnly}
            onChange={setMembersOnly}
          />
          <SwitchRow id="active" label="On" hint="Switch off to hide it without deleting." checked={active} onChange={setActive} />
        </div>
      </div>
      <FormFooter
        saving={saving}
        saveLabel={id ? "Save bundle" : "Create bundle"}
        deleteTarget={id ? { kind: "bundle", id, name: initial?.name ?? "this bundle" } : undefined}
      />
    </form>
  );
}
