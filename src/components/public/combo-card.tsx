"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, LockIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { comboRecipe, comboSavesUpTo, type Combo } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { productRenderUrl } from "@/lib/product-renders";
import { cn } from "@/lib/utils";
import { cart } from "./cart-store";
import { Sparks } from "./product-card";

/**
 * A combo deal: "Chips + soda, $2.50". The shopper picks what goes in each
 * slot, then "Add combo" puts those items in the cart. The cart (the
 * database, really) spots the combo and takes the difference off.
 */
export function ComboCard({ combo, isMember, className }: { combo: Combo; isMember: boolean; className?: string }) {
  // What's picked for each slot (product ids; the same one can be picked twice).
  const [picks, setPicks] = useState<string[][]>(() => combo.slots.map(() => []));
  const [added, setAdded] = useState(0);
  const locked = combo.members_only && !isMember;
  const saves = comboSavesUpTo(combo);
  const full = combo.slots.every((s, i) => picks[i].length === s.quantity);
  // The 3D pictures of the first thing in each slot, for the header.
  const heroes = combo.slots.flatMap((s) => s.products.slice(0, 1)).map((p) => productRenderUrl(p.name)).filter(Boolean) as string[];

  const pick = (slot: number, id: string) => {
    setAdded(0);
    setPicks((all) =>
      all.map((list, i) => {
        if (i !== slot) return list;
        // Full slot: the newest pick pushes the oldest one out.
        return list.length < combo.slots[i].quantity ? [...list, id] : [...list.slice(1), id];
      }),
    );
  };

  const addCombo = () => {
    for (const [i, slot] of combo.slots.entries()) {
      for (const id of picks[i]) {
        const p = slot.products.find((x) => x.product_id === id)!;
        cart.add({ id: p.product_id, name: p.name, price_cents: p.price_cents, emoji: p.emoji, photo_path: null, category: slot.label });
      }
    }
    setPicks(combo.slots.map(() => []));
    setAdded((n) => n + 1);
  };

  return (
    <article className={cn("deal-in relative flex flex-col overflow-clip rounded-3xl border-2 border-foreground bg-card shadow-soft", className)}>
      {/* Header: diner-menu style price and the combo's pictures */}
      <div className="relative flex items-center gap-4 overflow-clip bg-[#ff5a1f] p-4 text-black sm:p-5">
        <div aria-hidden className="absolute inset-0 opacity-15 [background:repeating-linear-gradient(-45deg,#000_0_2px,transparent_2px_14px)]" />
        <div className="relative shrink-0 -rotate-6 rounded-xl bg-black px-3 pt-1.5 pb-1 text-center text-white shadow-lg">
          <span className="block text-[0.65rem] font-bold tracking-[0.25em] text-[#ffd21f] uppercase">Combo</span>
          <span className="block font-heading text-4xl leading-none font-extrabold tabular-nums">{formatCents(combo.price_cents)}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <h3 className="font-heading text-3xl leading-none font-extrabold uppercase">{combo.title}</h3>
          <p className="mt-1 text-sm font-semibold">
            Any {comboRecipe(combo)}
            {saves > 0 && <span className="ml-2 inline-block rounded-full bg-black px-2 py-0.5 text-xs whitespace-nowrap text-[#ffd21f]">Save up to {formatCents(saves)}</span>}
          </p>
        </div>
        <div aria-hidden className="relative hidden h-20 shrink-0 items-end -space-x-4 sm:flex">
          {heroes.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src + i} src={src} alt="" className={cn("h-full w-auto object-contain drop-shadow-lg", i % 2 ? "rotate-6" : "-rotate-6")} />
          ))}
        </div>
      </div>

      {locked ? (
        <div className="grid flex-1 place-items-center gap-3 p-6 text-center">
          <p className="text-muted-foreground">This combo is for rewards members.</p>
          <Link href="/account?mode=signup" className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-foreground px-5 font-semibold">
            <LockIcon className="size-4" /> Sign up free to get it
          </Link>
        </div>
      ) : (
        <div className="grid flex-1 gap-4 p-4 sm:p-5">
          {combo.slots.map((slot, i) => (
            <fieldset key={slot.label + i} className="min-w-0">
              <legend className="flex w-full items-center justify-between text-sm font-semibold">
                <span>
                  {i + 1}. Pick {slot.quantity > 1 ? `${slot.quantity} ` : "your "}
                  {slot.label.toLowerCase()}
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                    {picks[i].length}/{slot.quantity}
                  </span>
                </span>
                {picks[i].length > 0 && (
                  <button type="button" onClick={() => setPicks((all) => all.map((l, j) => (j === i ? [] : l)))} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <RotateCcwIcon className="size-3" /> Clear
                  </button>
                )}
              </legend>
              <div className="-mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pt-2.5 pb-1.5 [scrollbar-width:thin]">
                {slot.products.map((p) => {
                  const times = picks[i].filter((id) => id === p.product_id).length;
                  const render = productRenderUrl(p.name);
                  const out = p.available <= 0;
                  return (
                    <button
                      key={p.product_id}
                      type="button"
                      disabled={out}
                      aria-pressed={times > 0}
                      onClick={() => pick(i, p.product_id)}
                      className={cn(
                        "relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-xl border-2 p-2 text-center transition-[border-color,transform] focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none active:scale-95",
                        times > 0 ? "border-foreground bg-primary/15" : "border-border hover:border-foreground/40",
                        out && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {times > 0 && (
                        <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
                          {times > 1 ? `×${times}` : <CheckIcon className="size-3.5" />}
                        </span>
                      )}
                      {render ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={render} alt="" loading="lazy" className="h-14 w-full object-contain" />
                      ) : (
                        <span aria-hidden className="grid h-14 place-items-center text-3xl">
                          {p.emoji || "🛍️"}
                        </span>
                      )}
                      <span className="line-clamp-2 text-xs leading-tight font-medium">{p.name}</span>
                      {out && <span className="text-[0.65rem] font-semibold uppercase">Sold out</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="relative mt-auto">
            <button
              type="button"
              disabled={!full}
              onClick={addCombo}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground font-semibold text-background transition-[background-color,color,transform] hover:bg-primary hover:text-black focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground"
            >
              {added > 0 && !picks.some((l) => l.length) ? (
                <>
                  <CheckIcon className="size-5" /> In your cart. The combo price comes off at checkout
                </>
              ) : full ? (
                <>
                  <PlusIcon className="size-5" /> Add combo · {formatCents(combo.price_cents)}
                </>
              ) : (
                "Pick everything to add it"
              )}
            </button>
            {added > 0 && <Sparks key={added} />}
          </div>
        </div>
      )}
    </article>
  );
}
