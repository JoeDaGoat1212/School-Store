"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircleIcon, BanknoteIcon, GiftIcon, Loader2Icon, ShoppingBagIcon, SparklesIcon } from "lucide-react";
import { cart, cartTotals, splitCart, useCart } from "@/components/public/cart-store";
import { Choice, ChoiceGroup, TextField } from "@/components/public/form-fields";
import { QuantityStepper } from "@/components/public/quantity-stepper";
import { ProductArt } from "@/components/product-art";
import { Button } from "@/components/ui/button";
import { formatCents, formatClock, formatDay, relativeDay } from "@/lib/format";
import type { Reward } from "@/lib/member";
import type { PickupDay } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { GRADES } from "@/lib/validation";
import { placeOrder, quoteCart, type CheckoutState, type Quote } from "../actions";

type LiveItem = { id: string; price_cents: number; available: number };
type LiveBundle = { id: string; price_cents: number; available: number; itemsPer: number; open: boolean };
export type CheckoutMember = { first_name: string; last_name: string; grade: string; balance: number };

export function Checkout({
  menu,
  bundles,
  days,
  today,
  maxItems,
  pickupLocation,
  member,
  signedIn,
  rewards,
  rewardsEnabled,
}: {
  menu: LiveItem[];
  bundles: LiveBundle[];
  days: PickupDay[];
  today: string;
  maxItems: number;
  pickupLocation: string;
  member: CheckoutMember | null;
  /** Signed in but hasn't finished the rewards profile yet. */
  signedIn: boolean;
  rewards: Reward[];
  rewardsEnabled: boolean;
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
  // Members get their name filled in.
  const [firstName, setFirstName] = useState(member?.first_name ?? "");
  const [lastName, setLastName] = useState(member?.last_name ?? "");
  const [grade, setGrade] = useState(member?.grade ?? "");
  const [rewardId, setRewardId] = useState<string | null>(null);
  const selectedDay = days.find((d) => d.date === day);

  // ---- Live price from the database ---------------------------------------------
  // Every time the cart or reward changes, ask the server what it costs with
  // today's deals. (It waits a moment so tapping + five times asks once.)
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const request = useRef(0);
  const cartKey = JSON.stringify(splitCart(items));

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      const result = await quoteCart({ ...JSON.parse(cartKey), rewardId });
      if (id !== request.current) return; // a newer request is on its way
      if (result.quote) {
        setQuote(result.quote);
        setQuoteError(null);
      } else {
        setQuoteError(result.message ?? null);
        // A reward that can't be used anymore: take it off.
        if (rewardId && ["NOT_ENOUGH_POINTS", "REWARD_UNAVAILABLE", "SIGN_IN_NEEDED"].includes(result.code ?? "")) {
          setRewardId(null);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [cartKey, rewardId]);

  // If an item sold out while they were checking out, reload the live stock.
  useEffect(() => {
    if (["SOLD_OUT", "UNAVAILABLE", "BUNDLE_UNAVAILABLE"].includes(state.code ?? "")) router.refresh();
  }, [state, router]);

  // ---- Check the cart against what's available right now ---------------------------
  const liveItems = new Map(menu.map((m) => [m.id, m]));
  const liveBundles = new Map(bundles.map((b) => [b.id, b]));
  const quoted = new Map(quote?.lines.filter((l) => !l.is_reward).map((l) => [l.product_id, l]) ?? []);

  const lines = items.map((item) => {
    const isBundle = item.kind === "bundle";
    const now = isBundle ? liveBundles.get(item.id) : liveItems.get(item.id);
    const available = now?.available ?? 0;
    const problem =
      !now || (isBundle && !(now as LiveBundle).open)
        ? isBundle
          ? "This bundle isn't available now"
          : "No longer on the menu"
        : available <= 0
          ? "Sold out"
          : item.quantity > available
            ? `Only ${available} left`
            : null;
    const q = isBundle ? undefined : quoted.get(item.id);
    return {
      ...item,
      isBundle,
      unit: q?.unit_price_cents ?? item.price_cents,
      regular: q && q.unit_price_cents < q.regular_price_cents ? q.regular_price_cents : null,
      dealTitle: q?.deal_title ?? null,
      itemsEach: isBundle ? ((now as LiveBundle | undefined)?.itemsPer ?? 1) : 1,
      available,
      problem,
    };
  });

  const count = lines.reduce((n, l) => n + l.quantity * l.itemsEach, 0) + (rewardId ? 1 : 0);
  const fallbackTotal = cartTotals(items).totalCents;
  const total = quote?.total_cents ?? fallbackTotal;
  const hasProblems = lines.some((l) => l.problem) || count > maxItems || Boolean(quoteError);
  const reward = rewards.find((r) => r.id === rewardId);
  const usableRewards = member ? rewards.filter((r) => r.available > 0) : [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-muted">
          <ShoppingBagIcon className="size-7 text-muted-foreground" />
        </span>
        <h1 className="font-heading text-4xl font-extrabold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add a snack or two from the menu, then come back here to order.</p>
        <Button asChild size="xl" className="mt-6">
          <Link href="/">Browse the menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-heading text-5xl leading-[0.95] font-extrabold">Your order</h1>

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
              {line.isBundle && line.detail && <p className="truncate text-xs text-muted-foreground">{line.detail}</p>}
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatCents(line.unit)} each
                {line.regular !== null && (
                  <>
                    {" "}
                    <span className="line-through">
                      <span className="sr-only">was </span>
                      {formatCents(line.regular)}
                    </span>
                    {line.dealTitle && <span className="ml-1.5 font-semibold text-ember-ink">{line.dealTitle}</span>}
                  </>
                )}
              </p>
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

        {reward && (
          <li className="flex items-center gap-3 py-3.5">
            <ProductArt
              name={reward.name}
              photoPath={reward.photo_path}
              emoji={reward.emoji}
              category={reward.category}
              className="size-14 shrink-0 rounded-xl"
              emojiClassName="text-3xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">Free {reward.name}</p>
              <p className="text-sm text-teal-ink">Reward, {reward.points_cost} points</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRewardId(null)}>
              Remove
            </Button>
          </li>
        )}

        {/* Totals */}
        <li className="grid gap-1.5 py-4 text-sm">
          {quote && quote.discount_cents > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Before deals</span>
                <span className="tabular-nums">{formatCents(quote.subtotal_cents)}</span>
              </div>
              {quote.discounts.map((d) => (
                <div key={d.label} className="flex justify-between font-medium text-ember-ink">
                  <span>{d.label}</span>
                  <span className="tabular-nums">−{formatCents(d.amount_cents)}</span>
                </div>
              ))}
            </>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-base font-semibold">Total</span>
            <span className={cn("font-heading text-4xl leading-none font-extrabold tabular-nums", !quote && "opacity-60")}>
              {formatCents(total)}
            </span>
          </div>
          {member && quote && quote.points_earned > 0 && (
            <p className="flex items-center justify-end gap-1 font-medium text-teal-ink">
              <SparklesIcon className="size-4" /> You&apos;ll earn {quote.points_earned} points at pickup
            </p>
          )}
        </li>
      </ul>
      {quoteError && (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {quoteError}
        </p>
      )}
      {count > maxItems && (
        <p className="mt-2 text-sm font-medium text-destructive">
          Orders are limited to {maxItems} items (bundles count each item inside).
        </p>
      )}
      <Link href="/" className="mt-3 inline-block text-sm font-semibold text-ember-ink underline-offset-4 hover:underline">
        + Add more items
      </Link>

      {/* ---- Rewards ------------------------------------------------------ */}
      {rewardsEnabled && !member && (
        <Link
          href="/account?next=/cart"
          className="mt-6 flex items-center gap-3 rounded-2xl bg-black p-4 text-white transition-transform focus-visible:ring-3 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.99]"
        >
          <SparklesIcon className="size-6 shrink-0 text-primary" />
          <span className="flex-1">
            <span className="block font-semibold">
              {signedIn ? "Finish your rewards account" : "Sign in to earn points"}
            </span>
            <span className="block text-sm text-white/70">
              {quote && quote.points_if_member > 0
                ? `This order would earn you ${quote.points_if_member} points toward free snacks.`
                : "Earn points on every order and trade them for free snacks."}
            </span>
          </span>
          <span className="font-semibold text-primary">{signedIn ? "Finish" : "Sign in"}</span>
        </Link>
      )}

      {member && usableRewards.length > 0 && (
        <section aria-labelledby="use-reward" className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="use-reward" className="font-heading text-2xl font-extrabold">
              Use a reward
            </h2>
            <p className="text-sm text-muted-foreground">
              You have <strong className="font-semibold text-foreground">{member.balance}</strong> points
            </p>
          </div>
          <div role="radiogroup" aria-labelledby="use-reward" className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {usableRewards.map((r) => {
              const affordable = member.balance >= r.points_cost;
              const on = rewardId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!affordable}
                  onClick={() => setRewardId(on ? null : r.id)}
                  className={cn(
                    "flex w-44 shrink-0 items-center gap-2.5 rounded-xl border-2 bg-card p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
                    on ? "border-teal bg-teal/10" : "hover:border-teal/50",
                    !affordable && "cursor-not-allowed opacity-50 hover:border-border",
                  )}
                >
                  <GiftIcon className={cn("size-5 shrink-0", on ? "text-teal-ink" : "text-muted-foreground")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">Free {r.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {affordable ? `${r.points_cost} points` : `${r.points_cost - member.balance} more points`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Details ------------------------------------------------------ */}
      {days.every((d) => !d.anyOpen) ? (
        <p className="mt-8 rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
          Online ordering is closed right now. Your cart is saved, so you can order once it opens again.
        </p>
      ) : (
        <form action={formAction} className="mt-8 grid gap-7" noValidate>
          <input type="hidden" name="items" value={JSON.stringify(splitCart(items).items)} />
          <input type="hidden" name="bundles" value={JSON.stringify(splitCart(items).bundles)} />
          <input type="hidden" name="reward_id" value={rewardId ?? ""} />

          <fieldset className="grid gap-4">
            <legend className="mb-3 font-heading text-2xl font-extrabold">Who&apos;s picking it up?</legend>
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
            <legend className="mb-3 font-heading text-2xl font-extrabold">When?</legend>

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

          <Button type="submit" size="xl" className="h-14 text-lg" disabled={placing || hasProblems || !quote}>
            {placing ? <Loader2Icon className="animate-spin" /> : null}
            {placing ? "Placing order…" : `Place order for ${formatCents(total)}`}
          </Button>
          {hasProblems && (
            <p className="-mt-4 text-center text-sm text-muted-foreground">Fix the items marked in red to continue.</p>
          )}
        </form>
      )}
    </div>
  );
}
