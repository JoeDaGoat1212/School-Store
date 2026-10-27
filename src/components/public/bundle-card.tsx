"use client";

import { useState } from "react";
import Link from "next/link";
import { LockIcon, PlusIcon } from "lucide-react";
import { productPhotoUrl } from "@/lib/photos";
import type { Bundle } from "@/lib/deals";
import { formatCents, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cart } from "./cart-store";
import { Sparks, Tag } from "./product-card";
import { QuantityStepper } from "./quantity-stepper";

/**
 * A bundle on the menu. Without its own photo, it shows the emojis of what's
 * inside, overlapping, on a teal-to-orange tile.
 */
export function BundleCard({
  bundle,
  inCart,
  isMember,
  maxPerOrder,
}: {
  bundle: Bundle;
  inCart: number;
  isMember: boolean;
  maxPerOrder: number;
}) {
  const [burst, setBurst] = useState(0);
  const itemsPerBundle = bundle.items.reduce((n, i) => n + i.quantity, 0);
  const max = Math.min(bundle.available, Math.floor(maxPerOrder / Math.max(itemsPerBundle, 1)));
  const soldOut = bundle.available <= 0;
  const locked = bundle.members_only && !isMember;
  const saves = bundle.regular_cents - bundle.price_cents;
  const detail = bundle.items.map((i) => (i.quantity > 1 ? `${i.quantity} ${i.name}` : i.name)).join(" + ");
  const photo = productPhotoUrl(bundle.photo_path);

  const add = () => {
    cart.add({
      kind: "bundle",
      id: bundle.id,
      name: bundle.name,
      price_cents: bundle.price_cents,
      emoji: bundle.emoji,
      photo_path: bundle.photo_path,
      category: "Bundles",
      detail,
    });
    setBurst((b) => b + 1);
  };

  return (
    <article className="group flex h-full flex-col">
      <div className="relative overflow-hidden rounded-2xl">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={bundle.name} loading="lazy" className={cn("aspect-square w-full object-cover", soldOut && "opacity-40 grayscale")} />
        ) : (
          <div
            role="img"
            aria-label={bundle.name}
            className={cn(
              "grid aspect-square w-full place-items-center bg-[linear-gradient(135deg,#d6f1ef_0%,#ffe7d9_100%)] dark:bg-[linear-gradient(135deg,#0c2b2a_0%,#33190d_100%)]",
              soldOut && "opacity-40 grayscale",
            )}
          >
            <span aria-hidden className="flex -space-x-3 text-5xl drop-shadow-sm select-none sm:text-6xl">
              {bundle.emoji
                ? bundle.emoji
                : bundle.items.slice(0, 3).map((i, n) => (
                    <span key={i.product_id} className={cn("inline-block", n % 2 ? "translate-y-2 rotate-6" : "-rotate-6")}>
                      {i.emoji || "🛍️"}
                    </span>
                  ))}
            </span>
          </div>
        )}

        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl ring-primary transition-[box-shadow] duration-300 ring-inset",
            inCart > 0 ? "ring-4" : "ring-0",
          )}
        />

        <span className="absolute top-2.5 left-2.5 -rotate-3 rounded-md bg-black px-2 pt-1 pb-0.5 leading-none">
          <span className="block font-heading text-2xl font-extrabold text-primary tabular-nums">{formatCents(bundle.price_cents)}</span>
          {saves > 0 && (
            <span className="block pb-0.5 text-xs font-semibold text-white/60 tabular-nums line-through">
              <span className="sr-only">was </span>
              {formatCents(bundle.regular_cents)}
            </span>
          )}
        </span>

        <div className="absolute right-2.5 bottom-2.5 left-2.5 flex flex-wrap gap-1">
          <Tag className="bg-teal text-black">Bundle</Tag>
          {saves > 0 && !soldOut && <Tag className="bg-primary text-black">Save {formatCents(saves)}</Tag>}
          {bundle.members_only && <Tag className="bg-black text-white">Members</Tag>}
        </div>
        {soldOut && (
          <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 -rotate-6 rounded-md bg-black px-3 py-1 font-heading text-xl font-extrabold tracking-wide text-white uppercase">
            Sold out
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="text-[0.95rem] leading-snug font-semibold">{bundle.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{bundle.description || detail}</p>
        {bundle.ends_on && <p className="mt-1 text-xs text-muted-foreground">Until {formatDay(bundle.ends_on)}</p>}

        <div className="mt-auto pt-3">
          {locked ? (
            <Link
              href="/account?next=/"
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-foreground font-semibold transition-colors hover:bg-foreground hover:text-background focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <LockIcon className="size-4" /> Sign in to get it
            </Link>
          ) : inCart > 0 ? (
            <QuantityStepper
              name={bundle.name}
              quantity={inCart}
              max={max}
              onChange={(q) => cart.setQuantity(bundle.id, Math.min(q, max))}
            />
          ) : (
            <button
              type="button"
              disabled={soldOut || max <= 0}
              onClick={add}
              className="relative flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-foreground font-semibold text-background transition-[background-color,color,transform] duration-150 hover:bg-primary hover:text-black focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
            >
              {soldOut ? (
                "Sold out"
              ) : (
                <>
                  <PlusIcon className="size-4.5" /> Add<span className="sr-only"> {bundle.name}</span>
                </>
              )}
            </button>
          )}
          {burst > 0 && <Sparks key={burst} />}
        </div>
      </div>
    </article>
  );
}
