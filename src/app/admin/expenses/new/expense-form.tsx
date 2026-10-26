"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { FileIcon, Loader2Icon, PaperclipIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { RECEIPT_BUCKET } from "@/lib/photos";
import { resizeImage } from "@/lib/resize-image";
import { createClient } from "@/lib/supabase/client";
import { createExpense } from "../actions";

export type FormProduct = {
  id: string;
  name: string;
  unit_cost_cents: number;
  is_perishable: boolean;
};

type Line = {
  key: number;
  product_id: string; // "" = not chosen yet, "other" = not a product (napkins…), else a product id
  description: string;
  quantity: string;
  cost: string; // dollars, e.g. "0.55"
  update_cost: boolean;
  expires_on: string;
};

const OTHER = "other";
let nextKey = 1;

export function ExpenseForm({
  products,
  suppliers,
  today,
  initialSupplierId,
  initialLines,
}: {
  products: FormProduct[];
  suppliers: { id: string; name: string }[];
  today: string;
  initialSupplierId: string;
  initialLines: { product_id: string; quantity: number }[];
}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const dollars = (cents: number) => (cents / 100).toFixed(2);

  const blankLine = (): Line => ({
    key: nextKey++,
    product_id: "",
    description: "",
    quantity: "",
    cost: "",
    update_cost: true,
    expires_on: "",
  });

  const [date, setDate] = useState(today);
  const [supplierId, setSupplierId] = useState(initialSupplierId || "none");
  const [newSupplier, setNewSupplier] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<{ path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<Line[]>(() =>
    initialLines.length
      ? initialLines
          .filter((l) => byId.has(l.product_id))
          .map((l) => ({
            ...blankLine(),
            product_id: l.product_id,
            quantity: String(l.quantity),
            cost: dollars(byId.get(l.product_id)!.unit_cost_cents),
          }))
      : [blankLine()],
  );

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineTotal = (l: Line) => (Number.parseInt(l.quantity, 10) || 0) * (parseDollarsToCents(l.cost) ?? 0);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  async function uploadReceipt(file: File) {
    setUploading(true);
    try {
      const isImage = file.type.startsWith("image/") && file.type !== "image/heic";
      const body = isImage ? await resizeImage(file, 1600) : file;
      const ext = isImage ? "webp" : (file.name.split(".").pop() ?? "pdf").toLowerCase();
      const path = `${date.slice(0, 4)}/${date.slice(5, 7)}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient()
        .storage.from(RECEIPT_BUCKET)
        .upload(path, body, { contentType: isImage ? "image/webp" : file.type });
      if (error) throw error;
      setReceipt({ path, name: file.name });
    } catch (e) {
      toast.error(`Receipt upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setMessage(null);
    // Check the lines here first so the message can point at the exact line.
    for (const [i, l] of lines.entries()) {
      const n = i + 1;
      if (!l.product_id) return setMessage(`Line ${n}: choose an item.`);
      if (l.product_id === OTHER && !l.description.trim()) return setMessage(`Line ${n}: describe the item.`);
      if (!(Number.parseInt(l.quantity, 10) >= 1)) return setMessage(`Line ${n}: enter a quantity of 1 or more.`);
      if (parseDollarsToCents(l.cost) === null) return setMessage(`Line ${n}: enter the cost per item, like 0.55.`);
    }

    startSaving(async () => {
      const result = await createExpense({
        purchased_on: date,
        supplier_id: supplierId,
        new_supplier: newSupplier,
        buyer_name: buyer,
        receipt_path: receipt?.path ?? "",
        notes,
        items: lines.map((l) => {
          const product = byId.get(l.product_id);
          return {
            product_id: product?.id ?? null,
            description: product?.name ?? l.description,
            quantity: Number.parseInt(l.quantity, 10),
            unit_cost_cents: parseDollarsToCents(l.cost)!,
            update_cost: Boolean(product) && l.update_cost,
            expires_on: product?.is_perishable && l.expires_on ? l.expires_on : null,
          };
        }),
      });
      // createExpense redirects on success, so we only get here on an error.
      if (result?.message) setMessage(result.message);
    });
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      {/* ---- Trip details ---- */}
      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid content-start gap-2">
          <Label htmlFor="purchased_on">Date</Label>
          <Input id="purchased_on" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="supplier">Store</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger id="supplier" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose a store</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="new_supplier">…or a new store</Label>
          <Input id="new_supplier" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="e.g. Target" className="h-10" />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="buyer">Bought by</Label>
          <Input id="buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Name" className="h-10" />
        </div>
      </section>

      {/* ---- Items ---- */}
      <section className="rounded-2xl border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-heading text-base font-semibold">Items</h2>
          <span className="text-sm text-muted-foreground">Products are added to stock when you save.</span>
        </div>

        <ul className="divide-y">
          {lines.map((l, i) => {
            const product = byId.get(l.product_id);
            const cents = parseDollarsToCents(l.cost);
            const costChanged = product && cents !== null && cents !== product.unit_cost_cents;
            return (
              <li key={l.key} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2fr)_90px_120px_110px_auto] md:items-start">
                <div className="grid gap-2">
                  <Label htmlFor={`product-${l.key}`} className="md:sr-only">
                    Item {i + 1}
                  </Label>
                  <select
                    id={`product-${l.key}`}
                    value={l.product_id}
                    onChange={(e) => {
                      const p = byId.get(e.target.value);
                      update(l.key, { product_id: e.target.value, cost: p ? dollars(p.unit_cost_cents) : l.cost, expires_on: "" });
                    }}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Choose an item…
                    </option>
                    <option value={OTHER}>Other (not sold — napkins, bags…)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {l.product_id === OTHER && (
                    <Input
                      aria-label={`Description for item ${i + 1}`}
                      value={l.description}
                      onChange={(e) => update(l.key, { description: e.target.value })}
                      placeholder="What was it? e.g. Napkins (500 ct)"
                      className="h-10"
                    />
                  )}
                  {product?.is_perishable && (
                    <div className="flex items-center gap-2 text-sm">
                      <Label htmlFor={`exp-${l.key}`} className="shrink-0 font-normal text-muted-foreground">
                        Expires
                      </Label>
                      <Input
                        id={`exp-${l.key}`}
                        type="date"
                        min={date}
                        value={l.expires_on}
                        onChange={(e) => update(l.key, { expires_on: e.target.value })}
                        className="h-9 w-40"
                      />
                    </div>
                  )}
                  {costChanged && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={l.update_cost} onCheckedChange={(c) => update(l.key, { update_cost: c === true })} />
                      Update {product.name}&apos;s cost from {formatCents(product.unit_cost_cents)} to {formatCents(cents)}
                    </label>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`qty-${l.key}`} className="text-xs text-muted-foreground">
                    Quantity
                  </Label>
                  <Input
                    id={`qty-${l.key}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className="h-10 tabular-nums"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`cost-${l.key}`} className="text-xs text-muted-foreground">
                    Cost each
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id={`cost-${l.key}`}
                      inputMode="decimal"
                      value={l.cost}
                      onChange={(e) => update(l.key, { cost: e.target.value })}
                      placeholder="0.00"
                      className="h-10 pl-7 tabular-nums"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <span className="text-xs text-muted-foreground">Line total</span>
                  <span className="flex h-10 items-center font-semibold tabular-nums">{formatCents(lineTotal(l))}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:mt-6"
                  aria-label={`Remove item ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2Icon />
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            <PlusIcon /> Add item
          </Button>
          <p className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="font-heading text-2xl font-bold tabular-nums">{formatCents(total)}</span>
          </p>
        </div>
      </section>

      {/* ---- Receipt + notes ---- */}
      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft md:grid-cols-2">
        <div className="grid content-start gap-2">
          <span className="text-sm font-medium">Receipt</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="sr-only"
            aria-label="Choose a receipt photo or PDF"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadReceipt(file);
              e.target.value = "";
            }}
          />
          {receipt ? (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <FileIcon className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{receipt.name}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove receipt" onClick={() => setReceipt(null)}>
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-10 justify-start" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
              {uploading ? "Uploading…" : "Take a photo or attach a file"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Receipts are private: only the admin can see them.</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>
      </section>

      {message && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <Link href="/admin/expenses">Cancel</Link>
        </Button>
        <Button type="submit" size="lg" disabled={saving || uploading}>
          {saving && <Loader2Icon className="animate-spin" />}
          Save trip · {formatCents(total)}
        </Button>
      </div>
    </form>
  );
}
