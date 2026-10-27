"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { drinkBrand, productLook } from "@/lib/product-look";
import type { MenuItem } from "@/lib/store-data";
import type { SceneItem } from "./drink-scene";
import { DrinkShowcase, SHOWCASE_TOP, sizeOf } from "./drink-showcase";
import type { FridgeBrand, FridgePick } from "./fridge-scene";

// The 3D fridge downloads only when the Drinks tab opens.
const FridgeScene = dynamic(() => import("./fridge-scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="h-[70%] w-[min(70%,36rem)] animate-pulse rounded-2xl bg-white/5 ring-1 ring-white/10" />
    </div>
  ),
});

type Drink = { item: MenuItem; shown: ShownPrice };

/**
 * The Drinks tab: first a lit-up fridge with every drink, one shelf per
 * brand. Picking a drink washes the screen in its color and opens the flavor
 * slider for that brand. "All drinks" goes back to the fridge.
 */
export function DrinksExperience({
  drinks,
  maxPerOrder,
  inCart,
}: {
  drinks: Drink[];
  maxPerOrder: number;
  inCart: (id: string) => number;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<{ brand: string; itemId: string } | null>(null);
  const [wipe, setWipe] = useState<{ x: number; y: number; color: string; fading: boolean } | null>(null);
  const [hovered, setHovered] = useState<SceneItem | null>(null);
  const fridgeRef = useRef<HTMLElement>(null);

  // Group the drinks into brands (shelves), keeping the menu's order.
  const { brands, byBrand, byId } = useMemo(() => {
    const groups = new Map<string, Drink[]>();
    for (const d of drinks) {
      const brand = drinkBrand(d.item.name);
      groups.set(brand, [...(groups.get(brand) ?? []), d]);
    }
    const shelves: FridgeBrand[] = [...groups].map(([name, list]) => ({
      name,
      items: list.map(({ item }) => ({ id: item.id, name: item.name, subtitle: sizeOf(item.description), look: productLook(item) })),
    }));
    return { brands: shelves, byBrand: groups, byId: new Map(drinks.map((d) => [d.item.id, d])) };
  }, [drinks]);

  const columns = isMobile || brands.length <= 3 ? 1 : 2;
  const rows = Math.ceil(brands.length / columns);
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** A drink was picked: its color spreads from where they tapped, then the flavors open. */
  const pick = (p: FridgePick) => {
    setHovered(null);
    if (calm) {
      setOpen({ brand: p.brand, itemId: p.itemId });
      return;
    }
    setWipe({ x: p.x, y: p.y, color: p.color, fading: false });
    setTimeout(() => {
      setOpen({ brand: p.brand, itemId: p.itemId });
      setWipe((w) => (w ? { ...w, fading: true } : w));
      setTimeout(() => setWipe(null), 450);
    }, 560);
  };

  const back = () => {
    setOpen(null);
    requestAnimationFrame(() => {
      const el = fridgeRef.current;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - SHOWCASE_TOP, behavior: "auto" });
    });
  };

  const hoveredDrink = hovered ? byId.get(hovered.id) : null;

  return (
    <>
      {open ? (
        <DrinkShowcase
          key={open.brand}
          title={open.brand}
          drinks={byBrand.get(open.brand) ?? []}
          startId={open.itemId}
          maxPerOrder={maxPerOrder}
          inCart={inCart}
          onBack={back}
        />
      ) : (
        <section
          ref={fridgeRef}
          id="drinks-showcase"
          aria-label="Drinks fridge"
          className="dark relative mb-8 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-black text-white select-none"
          style={{ height: isMobile ? `max(calc(100svh - ${SHOWCASE_TOP}px), ${rows * 138 + 160}px)` : `calc(100svh - ${SHOWCASE_TOP}px)` }}
        >
          {/* Cool light spilling out of the fridge onto the floor */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(55% 60% at 50% 45%, rgb(19 168 160 / 0.22), transparent 70%), radial-gradient(70% 25% at 50% 100%, rgb(234 247 246 / 0.12), transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-5xl px-4 pt-5">
            <h2 className="font-heading text-4xl leading-none font-extrabold sm:text-5xl">Pick a drink</h2>
            <p className="mt-1.5 text-sm text-white/70">Tap a drink, or a brand&apos;s tag, to see its flavors.</p>
          </div>

          {/* The same brands as real buttons, for keyboards and screen readers (they appear when tabbed to). */}
          <ul className="sr-only">
            {brands.map((b) => (
              <li key={b.name}>
                <button
                  type="button"
                  className="focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-black"
                  onClick={() => pick({ brand: b.name, itemId: b.items[0].id, x: window.innerWidth / 2, y: window.innerHeight / 2, color: b.items[0].look.color })}
                >
                  {b.name}, {b.items.length} {b.items.length === 1 ? "drink" : "flavors"}
                </button>
              </li>
            ))}
          </ul>

          <div className="absolute inset-x-0 top-24 bottom-14 sm:top-28">
            <FridgeScene brands={brands} columns={columns} active={!open} calm={calm} onPick={pick} onHover={setHovered} />
          </div>

          {/* What you're pointing at */}
          <p
            aria-hidden
            className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm transition-opacity"
            style={{ opacity: hoveredDrink ? 1 : 0 }}
          >
            {hoveredDrink ? (
              <>
                {hoveredDrink.item.name}
                <span className="ml-2 font-heading text-base text-primary">{formatCents(hoveredDrink.shown.price)}</span>
              </>
            ) : (
              " "
            )}
          </p>
        </section>
      )}

      {/* The color wash between the fridge and the flavors */}
      {wipe && (
        <div
          aria-hidden
          className="drink-wipe pointer-events-none fixed inset-0 z-40 transition-opacity duration-400"
          style={{ backgroundColor: wipe.color, "--x": `${wipe.x}px`, "--y": `${wipe.y}px`, opacity: wipe.fading ? 0 : 1 } as CSSProperties}
        />
      )}
    </>
  );
}
