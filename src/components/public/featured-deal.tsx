"use client";

import { useState } from "react";
import Link from "next/link";
import { LockIcon, PlusIcon } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { buyGetLabel, type Promotion, type ShownPrice } from "@/lib/deals";
import { formatCents, formatDay } from "@/lib/format";
import type { MenuItem } from "@/lib/store-data";
import { cart } from "./cart-store";
import { Sparks } from "./product-card";
import { QuantityStepper } from "./quantity-stepper";

/**
 * The "deal of the day": one big orange card above the menu, for the first
 * deal staff marked as featured.
 */
export function FeaturedDeal({
  promo,
  menu,
  isMember,
  maxPerOrder,
  inCart,
  onShowCategory,
}: {
  promo: Promotion;
  menu: { item: MenuItem; shown: ShownPrice }[];
  isMember: boolean;
  maxPerOrder: number;
  inCart: (id: string) => number;
  onShowCategory: (category: string) => void;
}) {
  const [burst, setBurst] = useState(0);
  const product = promo.product_id ? menu.find((m) => m.item.id === promo.product_id) : null;
  if (promo.product_id && !product) return null; // product hidden or archived

  const locked = promo.members_only && !isMember;
  const quantity = product ? inCart(product.item.id) : 0;
  const max = product ? Math.min(product.item.available, maxPerOrder) : 0;
  const salePrice = promo.kind === "sale" ? promo.sale_price_cents! : null;

  const add = () => {
    if (!product) return;
    const { item, shown } = product;
    cart.add({
      id: item.id,
      name: item.name,
      price_cents: shown.price,
      emoji: item.emoji,
      photo_path: item.photo_path,
      category: item.category,
    });
    setBurst((b) => b + 1);
  };

  return (
    <section
      aria-labelledby="deal-title"
      className="mb-8 grid grid-cols-[auto_1fr] items-center gap-4 rounded-3xl bg-primary p-4 text-black sm:gap-6 sm:p-6"
    >
      {product ? (
        <ProductArt
          name={product.item.name}
          photoPath={product.item.photo_path}
          emoji={product.item.emoji}
          category={product.item.category}
          className="size-24 rounded-2xl bg-white sm:size-36"
          emojiClassName="text-5xl sm:text-7xl"
        />
      ) : (
        <span aria-hidden className="grid size-24 place-items-center rounded-2xl bg-black font-heading text-4xl font-extrabold text-primary sm:size-36 sm:text-6xl">
          {promo.buy_qty}+{promo.get_qty}
        </span>
      )}

      <div className="min-w-0">
        <p className="text-sm font-semibold">
          Deal of the day{promo.members_only ? ", members only" : ""}
          <span className="font-normal opacity-70"> until {formatDay(promo.ends_on)}</span>
        </p>
        <h2 id="deal-title" className="mt-0.5 font-heading text-4xl leading-[0.9] font-extrabold sm:text-6xl">
          {promo.title}
        </h2>
        <p className="mt-1 font-medium">
          {promo.kind === "buy_get"
            ? `${buyGetLabel(promo)} on ${product ? product.item.name : `any ${promo.category}`}. Comes off in your cart.`
            : product!.item.name}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {salePrice !== null && product && (
            <p className="font-heading text-4xl leading-none font-extrabold tabular-nums">
              {formatCents(salePrice)}
              <span className="ml-2 text-xl font-bold opacity-60 line-through">
                <span className="sr-only">was </span>
                {formatCents(product.item.price_cents)}
              </span>
            </p>
          )}

          <div className="relative">
            {locked ? (
              <Link
                href="/account?next=/"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-black px-5 font-semibold text-white focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none"
              >
                <LockIcon className="size-4" /> Sign in to get it
              </Link>
            ) : !product ? (
              <button
                type="button"
                onClick={() => {
                  onShowCategory(promo.category!);
                  document.querySelector('nav[aria-label="Categories"]')?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex h-11 items-center rounded-xl bg-black px-5 font-semibold text-white focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none"
              >
                Shop {promo.category}
              </button>
            ) : product.item.available <= 0 ? (
              <span className="inline-flex h-11 items-center rounded-xl bg-black/15 px-5 font-semibold">Sold out</span>
            ) : quantity > 0 ? (
              <QuantityStepper
                name={product.item.name}
                quantity={quantity}
                max={max}
                onChange={(q) => cart.setQuantity(product.item.id, Math.min(q, max))}
                className="w-40 bg-black text-white [&_button:hover]:bg-white/15"
              />
            ) : (
              <button
                type="button"
                onClick={add}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-black px-5 font-semibold text-white transition-transform focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none active:scale-95"
              >
                <PlusIcon className="size-4.5" /> Add<span className="sr-only"> {product.item.name}</span>
              </button>
            )}
            {burst > 0 && <Sparks key={burst} />}
          </div>
        </div>
      </div>
    </section>
  );
}
