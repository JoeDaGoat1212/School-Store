"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CandyIcon, CookieIcon, CupSodaIcon, ShoppingBagIcon, XIcon } from "lucide-react";
import { FlameMark } from "@/components/brand-mark";
import type { ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { productLook } from "@/lib/product-look";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { cart, cartTotals, useCart } from "../cart-store";
import { UNITS, modelFor, sectionFor, unitFor, type UnitKey } from "./catalog";
import { OPEN_STORE_EVENT } from "./enter-store-button";
import { unitLayout, type StoreItem } from "./layout";

// The 3D store (three.js and friends) downloads only when someone enters.
const StoreScene = dynamic(() => import("./store-scene"), { ssr: false, loading: () => null });

type Priced = { item: MenuItem; shown: ShownPrice };
type Plus = { x: number; y: number; key: number };

const ICONS: Record<UnitKey, typeof CupSodaIcon> = { drinks: CupSodaIcon, snacks: CookieIcon, candy: CandyIcon };

/**
 * The full-screen 3D store, opened by the "Enter store" button at the top of the page.
 * In the store: buttons for Drinks, Snacks and Candy fly the camera there,
 * chips pick a section (a fridge door, a shelf bay), and tapping a product adds
 * one to the cart.
 */
export function StoreEntrance({ priced, maxPerOrder }: { priced: Priced[]; maxPerOrder: number }) {
  const [open, setOpen] = useState(false);

  const { items, layouts, byId } = useMemo(() => {
    const items: StoreItem[] = [];
    for (const { item, shown } of priced) {
      const unit = unitFor(item.category);
      if (!unit) continue;
      items.push({
        id: item.id,
        name: item.name,
        label: formatCents(shown.price),
        soldOut: item.available <= 0,
        unit,
        section: sectionFor(unit, item.name, item.category),
        model: modelFor(item.name, unit),
        color: productLook(item).color,
      });
    }
    return { items, layouts: buildLayouts(items), byId: new Map(priced.map((p) => [p.item.id, p])) };
  }, [priced]);
  // Stable, so the store doesn't think it was closed and reopened on every render.
  const close = useCallback(() => setOpen(false), []);


  // The "Enter store" button at the top of the page sends this event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_STORE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STORE_EVENT, onOpen);
  }, []);

  if (!open || items.length === 0) return null;
  return (
    <>
      <StoreOverlay items={items} layouts={layouts} byId={byId} maxPerOrder={maxPerOrder} onClose={close} />
    </>
  );
}

function StoreOverlay({
  items,
  layouts,
  byId,
  maxPerOrder,
  onClose,
}: {
  items: StoreItem[];
  layouts: ReturnType<typeof buildLayouts>;
  byId: Map<string, Priced>;
  maxPerOrder: number;
  onClose: () => void;
}) {
  const cartItems = useCart();
  const totals = cartTotals(cartItems);
  const [view, setView] = useState("store");
  const [hovered, setHovered] = useState<StoreItem | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<UnitKey | null>(null);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const [pluses, setPluses] = useState<Plus[]>([]);
  const counter = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [fancy] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && (navigator.hardwareConcurrency ?? 4) >= 4);

  const unit = view === "store" ? null : (view.split(":")[0] as UnitKey);

  /** Go to a unit (or, if it's the one you're at, back out to the whole store). */
  const goUnit = useCallback(
    (key: UnitKey) => {
      if (!layouts[key]) return;
      setView((v) => (v === key ? "store" : key));
      setHovered(null);
      setHoveredUnit(null);
    },
    [layouts],
  );

  // Leaving: Escape steps back out (section → store → close), and the browser's Back button closes the store.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  useEffect(() => {
    history.pushState({ store: true }, "");
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewRef.current === "store") history.back();
      else setView("store");
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.cursor = "";
    };
  }, [onClose]);

  const say = (text: string) => {
    const key = ++counter.current;
    setNote({ text, key });
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 2200);
  };

  /** Add one of a product (if any are left and they haven't hit the limit). */
  const add = (id: string, at?: { x: number; y: number }) => {
    const p = byId.get(id);
    if (!p) return;
    const { item, shown } = p;
    if (item.available <= 0) return say(`${item.name} is sold out right now.`);
    const max = Math.min(item.available, maxPerOrder);
    const have = cartItems.find((c) => c.id === id)?.quantity ?? 0;
    if (have >= max) return say(`That's the most ${item.name} you can get in one order (${max}).`);
    cart.add({ id: item.id, name: item.name, price_cents: shown.price, emoji: item.emoji, photo_path: item.photo_path, category: item.category });
    say(`Added ${item.name} · ${have + 1} in your cart`);
    if (at && !calm) {
      const plus = { ...at, key: ++counter.current };
      setPluses((list) => [...list, plus]);
      setTimeout(() => setPluses((list) => list.filter((x) => x.key !== plus.key)), 800);
    }
  };

  const status = note?.text ?? (hovered ? null : hoveredUnit ? `${UNITS.find((u) => u.key === hoveredUnit)!.title}: tap to go there` : null);
  const visibleItems = items.filter((i) => i.unit === unit);

  return (
    <div role="dialog" aria-modal="true" aria-label="3D store" className="dark fixed inset-0 z-[70] bg-[#07080a] text-white select-none">
      <div className="absolute inset-0">
        <StoreScene
          items={items}
          layouts={layouts}
          view={view}
          active
          calm={calm}
          fancy={fancy}
          onPickUnit={goUnit}
          onTap={(item, x, y) => add(item.id, { x, y })}
          onHover={setHovered}
          onHoverUnit={setHoveredUnit}
        />
      </div>

      {/* Top bar: where you are, your cart, and the way out */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <FlameMark size={30} />
          <p className="truncate font-heading text-lg font-extrabold tracking-wide uppercase sm:text-xl">
            Firebirds Nest
            {unit && <span className="hidden text-white/60 sm:inline"> · {UNITS.find((u) => u.key === unit)!.title}</span>}
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <Link
            href="/cart"
            className="flex h-10 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <ShoppingBagIcon className="size-4" />
            {totals.count > 0 ? (
              <>
                {totals.count} · {formatCents(totals.totalCents)}
              </>
            ) : (
              "Cart"
            )}
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={() => history.back()}
            aria-label="Leave the store"
            className="grid size-10 place-items-center rounded-full bg-white/12 backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>

      {/* Bottom: what you're pointing at, and the three buttons */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p
          aria-live="polite"
          className="min-h-9 max-w-full rounded-full bg-white/12 px-4 py-2 text-center text-sm font-semibold backdrop-blur-md transition-opacity"
          style={{ opacity: status || hovered ? 1 : 0 }}
        >
          {note ? (
            <span key={note.key} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              {note.text}
            </span>
          ) : hovered ? (
            <>
              {hovered.name}
              <span className="ml-2 font-heading text-base text-primary">{hovered.soldOut ? "Sold out" : hovered.label}</span>
            </>
          ) : (
            status ?? " "
          )}
        </p>

        <nav aria-label="Store sections" className="pointer-events-auto flex items-center justify-center gap-1.5 sm:gap-3">
          {UNITS.filter((u) => layouts[u.key]).map((u) => {
            const Icon = ICONS[u.key];
            const on = unit === u.key;
            return (
              <button
                key={u.key}
                type="button"
                aria-pressed={on}
                onClick={() => goUnit(u.key)}
                className={cn(
                  "flex h-11 items-center gap-1.5 rounded-2xl px-3.5 font-heading text-base font-extrabold tracking-wide uppercase transition-[transform,background-color] focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none active:scale-95 sm:h-14 sm:gap-2 sm:px-6 sm:text-xl",
                  on ? "bg-primary text-black shadow-[0_0_30px_rgb(255_90_31/0.5)]" : "bg-white/12 backdrop-blur-md hover:bg-white/22",
                )}
              >
                <Icon className="size-4 sm:size-5" />
                {u.title}
              </button>
            );
          })}
        </nav>
        <p className="text-xs text-white/60">{unit ? "Tap anything to add it to your cart" : "Pick a section, or tap one in the store"}</p>
      </div>

      {/* The products in view, as real buttons for keyboards and screen readers (they appear when tabbed to). */}
      <ul className="sr-only">
        {visibleItems.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="focus:not-sr-only focus:absolute focus:top-16 focus:left-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-black"
              onClick={() => add(i.id)}
            >
              {i.soldOut ? `${i.name}, sold out` : `Add ${i.name}, ${i.label}`}
            </button>
          </li>
        ))}
      </ul>

      {pluses.map((p) => (
        <span key={p.key} aria-hidden className="plus-one pointer-events-none fixed z-[80] font-heading text-3xl font-extrabold text-primary" style={{ left: p.x, top: p.y }}>
          +1
        </span>
      ))}
    </div>
  );
}

function buildLayouts(items: StoreItem[]) {
  return { drinks: unitLayout("drinks", items), snacks: unitLayout("snacks", items), candy: unitLayout("candy", items) };
}
