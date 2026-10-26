"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { AlertCircleIcon, BanknoteIcon, Loader2Icon, ShoppingBagIcon } from "lucide-react";
import { cart, cartTotals, useCart } from "@/components/public/cart-store";
import { QuantityStepper } from "@/components/public/quantity-stepper";
import { ProductArt } from "@/components/product-art";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, formatClock, formatDay, relativeDay } from "@/lib/format";
import type { PickupDay } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { GRADES } from "@/lib/validation";
import { placeOrder, type CheckoutState } from "../actions";

type LiveItem = { id: string; price_cents: number; available: number };

export function Checkout({
  menu,
  days,
  today,
  maxItems,
  pickupLocation,
}: {
  menu: LiveItem[];
  days: PickupDay[];
  today: string;
  maxItems: number;
  pickupLocation: string;
}) {
  const router = useRouter();
  const items = useCart();
  const [state, formAction, placing] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const errors = state.errors ?? {};

  // Default to the first day that still has an open pickup time.
  const firstOpenDay = days.find((d) => d.anyOpen);
  const [day, setDay] = useState(firstOpenDay?.date ?? "");
  const [windowId, setWindowId] = useState<number | null>(null);
  // Kept in state (not just in the inputs) because React clears a form after
  // each submit — this way an error doesn't wipe what the student typed.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const selectedDay = days.find((d) => d.date === day);

  // If an item sold out while they were checking out, reload the live stock.
  useEffect(() => {
    if (state.code === "SOLD_OUT" || state.code === "UNAVAILABLE") router.refresh();
  }, [state, router]);

  // Check the cart against what's actually available right now.
  const live = new Map(menu.map((m) => [m.id, m]));
  const lines = items.map((item) => {
    const now = live.get(item.id);
    const available = now?.available ?? 0;
    const problem = !now
      ? "No longer on the menu"
      : available <= 0
        ? "Sold out"
        : item.quantity > available
          ? `Only ${available} left`
          : null;
    return { ...item, price_cents: now?.price_cents ?? item.price_cents, available, problem };
  });
  const { count } = cartTotals(items);
  const total = lines.reduce((sum, l) => sum + l.price_cents * l.quantity, 0);
  const hasProblems = lines.some((l) => l.problem) || count > maxItems;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-muted">
          <ShoppingBagIcon className="size-7 text-muted-foreground" />
        </span>
        <h1 className="font-heading text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add a snack or two from the menu, then come back here to order.</p>
        <Button asChild size="xl" className="mt-6">
          <Link href="/">Browse the menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Your order</h1>

      {/* ---- Items ------------------------------------------------------- */}
      <ul className="mt-5 divide-y rounded-2xl border bg-card px-4 shadow-soft">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3 py-3.5">
            <ProductArt
              name={line.name}
              photoPath={line.photo_path}
              emoji={line.emoji}
              category={line.category}
              className="size-14 shrink-0 rounded-xl"
              emojiClassName="text-3xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{line.name}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{formatCents(line.price_cents)} each</p>
              {line.problem && (
                <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-destructive">
                  <AlertCircleIcon className="size-3.5" /> {line.problem}
                  {line.available > 0 && line.quantity > line.available && (
                    <button
                      type="button"
                      className="ml-1 underline underline-offset-2"
                      onClick={() => cart.setQuantity(line.id, line.available)}
                    >
                      Change to {line.available}
                    </button>
                  )}
                  {line.available <= 0 && (
                    <button type="button" className="ml-1 underline underline-offset-2" onClick={() => cart.setQuantity(line.id, 0)}>
                      Remove
                    </button>
                  )}
                </p>
              )}
            </div>
            <QuantityStepper
              name={line.name}
              quantity={line.quantity}
              max={Math.min(Math.max(line.available, 1), maxItems)}
              onChange={(q) => cart.setQuantity(line.id, q)}
              className="w-32"
            />
          </li>
        ))}
        <li className="flex items-baseline justify-between py-4">
          <span className="font-semibold">Total</span>
          <span className="font-heading text-2xl font-bold tabular-nums">{formatCents(total)}</span>
        </li>
      </ul>
      {count > maxItems && (
        <p className="mt-2 text-sm font-medium text-destructive">Orders are limited to {maxItems} items.</p>
      )}
      <Link href="/" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
        + Add more items
      </Link>

      {/* ---- Details ------------------------------------------------------ */}
      {days.every((d) => !d.anyOpen) ? (
        <p className="mt-8 rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
          Online ordering is closed right now. Your cart is saved, so you can order once it opens again.
        </p>
      ) : (
        <form action={formAction} className="mt-8 grid gap-7" noValidate>
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(items.map((i) => ({ product_id: i.id, quantity: i.quantity })))}
          />

          <fieldset className="grid gap-4">
            <legend className="mb-3 font-heading text-lg font-bold">Who&apos;s picking it up?</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                id="first_name"
                label="First name"
                autoComplete="given-name"
                value={firstName}
                onChange={setFirstName}
                error={errors.first_name}
              />
              <TextField
                id="last_name"
                label="Last name"
                autoComplete="family-name"
                value={lastName}
                onChange={setLastName}
                error={errors.last_name}
              />
            </div>
            <ChoiceGroup label="Grade" error={errors.grade}>
              {GRADES.map((g) => (
                <Choice key={g} name="grade" value={g} checked={grade === g} onChange={() => setGrade(g)}>
                  {g}
                </Choice>
              ))}
            </ChoiceGroup>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 font-heading text-lg font-bold">When?</legend>

            <ChoiceGroup label="Pickup day" error={errors.pickup_date}>
              {days.map((d) => (
                <Choice
                  key={d.date}
                  name="pickup_date"
                  value={d.date}
                  checked={day === d.date}
                  disabled={!d.anyOpen}
                  onChange={() => {
                    setDay(d.date);
                    setWindowId(null);
                  }}
                  className="flex-1"
                >
                  <span className="block">{relativeDay(d.date, today)}</span>
                  <span className="block text-xs font-normal opacity-80">
                    {d.anyOpen ? formatDay(d.date) : "Closed for orders"}
                  </span>
                </Choice>
              ))}
            </ChoiceGroup>

            {selectedDay && (
              <ChoiceGroup label="Pickup time" error={errors.pickup_window_id} grid>
                {selectedDay.windows.map(({ window, open }) => (
                  <Choice
                    key={window.id}
                    name="pickup_window_id"
                    value={String(window.id)}
                    checked={windowId === window.id}
                    disabled={!open}
                    onChange={() => setWindowId(window.id)}
                  >
                    <span className="block">{window.label}</span>
                    <span className="block text-xs font-normal opacity-80">
                      {open ? formatClock(window.starts_at) : "Too late today"}
                    </span>
                  </Choice>
                ))}
              </ChoiceGroup>
            )}
          </fieldset>

          <div className="flex gap-3 rounded-2xl bg-sticker/25 p-4 ring-1 ring-sticker/60 ring-inset">
            <BanknoteIcon className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm">
              <strong className="font-semibold">Pay at pickup, cash or debit.</strong> No payment is taken online. Bring{" "}
              {formatCents(total)} to {pickupLocation.charAt(0).toLowerCase() + pickupLocation.slice(1)}.
            </p>
          </div>

          {state.message && (
            <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
          )}

          <Button type="submit" size="xl" className="h-14 text-lg" disabled={placing || hasProblems}>
            {placing ? <Loader2Icon className="animate-spin" /> : null}
            {placing ? "Placing order…" : `Place order · ${formatCents(total)}`}
          </Button>
          {hasProblems && (
            <p className="-mt-4 text-center text-sm text-muted-foreground">Fix the items marked in red to continue.</p>
          )}
        </form>
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  error,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  error?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={40}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-12 text-base"
      />
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labeled row of big tappable radio buttons. */
function ChoiceGroup({
  label,
  error,
  grid,
  children,
}: {
  label: string;
  error?: string;
  grid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className={cn(grid ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "flex flex-wrap gap-2")}>{children}</div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** One radio button styled as a big chip. Works with the keyboard like a normal radio. */
function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  name: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("relative", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          "flex min-h-12 flex-col justify-center rounded-xl border-2 bg-card px-4 py-2 text-sm font-semibold transition-colors",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
          "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          "peer-disabled:border-dashed peer-disabled:bg-transparent peer-disabled:text-muted-foreground",
          !disabled && "hover:border-primary/50",
        )}
      >
        {children}
      </span>
    </label>
  );
}
