"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

/** − 2 + buttons. At 1, the minus button becomes a trash can (removes the item). */
export function QuantityStepper({
  name,
  quantity,
  max,
  onChange,
  className,
}: {
  name: string;
  quantity: number;
  max: number;
  onChange: (quantity: number) => void;
  className?: string;
}) {
  const button =
    "grid size-11 place-items-center rounded-xl transition-colors hover:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40";

  return (
    <div
      role="group"
      aria-label={`Quantity of ${name}`}
      className={cn("flex items-center justify-between rounded-xl bg-muted", className)}
    >
      <button
        type="button"
        className={button}
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `Remove ${name}` : `One less ${name}`}
      >
        {quantity === 1 ? <Trash2Icon className="size-4.5" /> : <MinusIcon className="size-5" />}
      </button>
      <span className="min-w-8 text-center font-heading text-lg font-bold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label={`One more ${name}`}
      >
        <PlusIcon className="size-5" />
      </button>
    </div>
  );
}
