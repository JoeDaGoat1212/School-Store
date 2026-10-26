"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { adjustStock, type AdjustState } from "./actions";

const REASONS = [
  { value: "manual_adjustment", label: "Recount", hint: "The shelf count didn't match" },
  { value: "spoilage", label: "Spoiled / damaged", hint: "Expired, broken or thrown away" },
] as const;

/** "Fix a count" form. Needs a reason and a note every time. */
export function AdjustDialog({
  product,
  open,
  onOpenChange,
}: {
  product: { id: string; name: string; stock: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounting the form each time the dialog opens clears old errors. */}
        {open && <AdjustForm product={product} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ product, onDone }: { product: { id: string; name: string; stock: number }; onDone: () => void }) {
  const [state, formAction, saving] = useActionState<AdjustState, FormData>(adjustStock, {});
  const [mode, setMode] = useState<"set" | "change">("set");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("manual_adjustment");
  const [amount, setAmount] = useState("");
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      onDone();
    }
  }, [state, onDone]);

  const n = Number.parseInt(amount, 10);
  const preview = Number.isNaN(n) ? null : mode === "set" ? n : product.stock + n;

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="reason" value={reason} />

      <DialogHeader>
        <DialogTitle>Adjust {product.name}</DialogTitle>
        <DialogDescription>Currently {product.stock} in stock. The change is saved in the stock history.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Reason</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                "rounded-lg border-2 p-2.5 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                reason === r.value ? "border-primary bg-primary/5" : "hover:border-primary/40",
              )}
            >
              <span className="block font-semibold">{r.label}</span>
              <span className="block text-xs text-muted-foreground">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="inline-flex w-fit rounded-lg bg-muted p-1" role="group" aria-label="How to enter it">
          {(
            [
              ["set", "Count is now"],
              ["change", "Add or remove"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Label htmlFor="amount" className="sr-only">
          {mode === "set" ? "New count" : "Change (use − to remove)"}
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={mode === "set" ? "New count, e.g. 18" : "e.g. -3 or 5"}
          aria-invalid={Boolean(errors.amount)}
          className="h-11 text-lg tabular-nums"
          autoFocus
        />
        <p className={cn("text-xs", errors.amount ? "font-medium text-destructive" : "text-muted-foreground")}>
          {errors.amount ??
            (preview === null
              ? mode === "change"
                ? "Use a minus sign to remove."
                : " "
              : `${product.stock} → ${preview} (${preview - product.stock >= 0 ? "+" : ""}${preview - product.stock})`)}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">Note (required)</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={300}
          placeholder={reason === "spoilage" ? "e.g. 3 bananas went brown" : "e.g. Friday count, 2 bags were behind the box"}
          aria-invalid={Boolean(errors.note)}
        />
        {errors.note && <p className="text-xs font-medium text-destructive">{errors.note}</p>}
      </div>

      {state.message && !state.ok && <p className="text-sm font-medium text-destructive">{state.message}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2Icon className="animate-spin" />}
          Save adjustment
        </Button>
      </DialogFooter>
    </form>
  );
}
