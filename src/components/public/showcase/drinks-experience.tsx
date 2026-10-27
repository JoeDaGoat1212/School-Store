"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { drinkBrand, productLook } from "@/lib/product-look";
import type { MenuItem } from "@/lib/store-data";
import { cart } from "../cart-store";
import { sizeOf } from "./drink-showcase";
import { fridgeLayout, fridgeRatio, type FridgeFlavor, type PlacedFlavor } from "./fridge-layout";
import type { FridgeTap } from "./fridge-scene";

// The 3D fridge downloads only when the Drinks tab opens.
const FridgeScene = dynamic(() => import("./fridge-scene"), {
  ssr: false,
  loading: () => <span className="block size-full animate-pulse rounded-2xl bg-white/5 ring-1 ring-white/10" />,
});

type Drink = { item: MenuItem; shown: ShownPrice };
type Note = { text: string; key: number };
type Plus = { x: number; y: number; key: number };

/**
 * The Drinks tab: a big lit-up fridge with every drink on its shelves.
 * Tapping a drink adds one to the cart.
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
  const [hovered, setHovered] = useState<PlacedFlavor | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [pluses, setPluses] = useState<Plus[]>([]);
  const counter = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const visible = useOnScreen(sectionRef);
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Brands stay together (in menu order), so a shelf reads like a real fridge.
  const { layout, byId } = useMemo(() => {
    const groups = new Map<string, Drink[]>();
    for (const d of drinks) {
      const brand = drinkBrand(d.item.name);
      groups.set(brand, [...(groups.get(brand) ?? []), d]);
    }
    const flavors: FridgeFlavor[] = [...groups.values()].flat().map(({ item, shown }) => ({
      item: { id: item.id, name: item.name, subtitle: sizeOf(item.description), look: productLook(item) },
      label: formatCents(shown.price),
      soldOut: item.available <= 0,
    }));
    // Phones: 2 flavors a shelf on a narrow fridge. Bigger screens: 4 on a wide one.
    return {
      layout: isMobile ? fridgeLayout(flavors, 2, 2.8) : fridgeLayout(flavors, 4, 5.6),
      byId: new Map(drinks.map((d) => [d.item.id, d])),
    };
  }, [drinks, isMobile]);

  // A message shows for a couple of seconds, then the chip goes back to showing what you point at.
  const say = (text: string) => {
    const key = ++counter.current;
    setNote({ text, key });
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 2200);
  };

  /** Add the tapped drink to the cart (if there's any left and they haven't hit the limit). */
  const add = (id: string, at?: { x: number; y: number }) => {
    const drink = byId.get(id);
    if (!drink) return;
    const { item, shown } = drink;
    if (item.available <= 0) return say(`${item.name} is sold out right now.`);
    const max = Math.min(item.available, maxPerOrder);
    const have = inCart(item.id);
    if (have >= max) return say(`That's the most ${item.name} you can get in one order (${max}).`);
    cart.add({ id: item.id, name: item.name, price_cents: shown.price, emoji: item.emoji, photo_path: item.photo_path, category: item.category });
    say(`Added ${item.name} · ${have + 1} in your cart`);
    if (at && !calm) {
      const plus = { ...at, key: ++counter.current };
      setPluses((p) => [...p, plus]);
      setTimeout(() => setPluses((p) => p.filter((x) => x.key !== plus.key)), 800);
    }
  };

  const tap = ({ flavor, x, y }: FridgeTap) => add(flavor.item.id, { x, y });
  const info = hovered ? byId.get(hovered.item.id) : null;

  return (
    <section
      ref={sectionRef}
      id="drinks-showcase"
      aria-label="Drinks fridge"
      className="dark relative mb-8 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-black pb-6 text-white select-none"
    >
      {/* The dim store behind the fridge (a blurry photo), then cool light spilling out of the fridge */}
      <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: "url(/showcase/fridge/room.webp)" }} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 45%, rgb(19 168 160 / 0.22), transparent 70%), radial-gradient(70% 25% at 50% 100%, rgb(234 247 246 / 0.12), transparent 70%), linear-gradient(to bottom, rgb(0 0 0 / 0.55), transparent 30%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-5 pb-4">
        <h2 className="font-heading text-4xl leading-none font-extrabold sm:text-5xl">Grab a drink</h2>
        <p className="mt-1.5 text-sm text-white/70">Tap a drink to add it to your cart. Tap again for another.</p>
      </div>

      {/* The same drinks as real buttons, for keyboards and screen readers (they appear when tabbed to). */}
      <ul className="sr-only">
        {layout.shelves.flat().map((f) => (
          <li key={f.item.id}>
            <button
              type="button"
              className="focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-black"
              onClick={() => add(f.item.id)}
            >
              {f.soldOut ? `${f.item.name}, sold out` : `Add ${f.item.name}, ${f.label}`}
            </button>
          </li>
        ))}
      </ul>

      {/* The fridge, as big as the screen is wide (it scrolls with the page on phones) */}
      <div className="relative mx-auto w-[min(100%-1rem,64rem)]" style={{ aspectRatio: `1 / ${fridgeRatio(layout)}` }}>
        <FridgeScene layout={layout} active={visible} calm={calm} onTap={tap} onHover={setHovered} />
      </div>

      {/* What you're pointing at, or what just happened. Stays on screen while you scroll the fridge. */}
      <div className="pointer-events-none sticky bottom-5 z-10 mt-4 flex justify-center px-4">
        <p
          aria-live="polite"
          className="w-fit max-w-full rounded-full bg-white/12 px-4 py-2 text-center text-sm font-semibold backdrop-blur-md transition-opacity"
          style={{ opacity: note || info ? 1 : 0 }}
        >
          {note ? (
            <span key={note.key} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              {note.text}
            </span>
          ) : info ? (
            <>
              {info.item.name}
              <span className="ml-2 font-heading text-base text-primary">{info.item.available <= 0 ? "Sold out" : formatCents(info.shown.price)}</span>
            </>
          ) : (
            " "
          )}
        </p>
      </div>

      {/* "+1" floating up from where they tapped */}
      {pluses.map((p) => (
        <span
          key={p.key}
          aria-hidden
          className="plus-one pointer-events-none fixed z-50 font-heading text-3xl font-extrabold text-primary"
          style={{ left: p.x, top: p.y }}
        >
          +1
        </span>
      ))}
    </section>
  );
}

/** Is the element on screen? (The 3D fridge stops drawing when it isn't, to save battery.) */
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}
