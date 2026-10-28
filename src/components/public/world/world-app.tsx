"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProgress } from "@react-three/drei";
import { ListIcon, LockIcon, PlusIcon, ShoppingBagIcon, TagIcon, UserRoundIcon, XIcon } from "lucide-react";
import { FlameMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { buyGetLabel, bundleOpenTo, type Bundle, type Deals, type ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { productLook } from "@/lib/product-look";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { cart, cartTotals, useCart } from "../cart-store";
import { modelFor, sectionFor, unitFor, UNITS, type UnitKey } from "../store/catalog";
import { unitLayout, type StoreItem } from "../store/layout";
import type { BoardCard } from "./fixtures";
import { LoadingScreen } from "./loading-screen";
import { unitAt, type StationKey } from "./world-layout";
import WorldScene from "./world-scene";

/*
 * The 3D store you see when you open the site, and the few buttons floating
 * over it. The 3D part is in world-scene.tsx; this file keeps track of where
 * you are, what's in your cart, and the deals list.
 *
 * How it goes:
 *   1. You start outside, looking down at the store like a drone.
 *   2. Tap the doors: they swing open and the camera flies inside.
 *   3. Floor arrows walk you around (deals board, drinks, snacks, candy).
 *   4. Tap a product to add it to your cart.
 *   5. "Checkout" flies you to the registers, then opens the cart page.
 */

export type Priced = { item: MenuItem; shown: ShownPrice };
export type WorldAccount = { signedIn: boolean; member: { initial: string; balance: number } | null };

type Plus = { x: number; y: number; key: number };

/** Remembers that you're inside the store, so coming back from the cart doesn't make you walk in again. */
const INSIDE_KEY = "nest:inside";
const readInside = () => {
  try {
    return sessionStorage.getItem(INSIDE_KEY) === "1";
  } catch {
    return false;
  }
};
const writeInside = () => {
  try {
    sessionStorage.setItem(INSIDE_KEY, "1");
  } catch {
    // Private browsing can block storage. Not a problem.
  }
};

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function WorldApp({
  priced,
  deals,
  isMember,
  account,
  maxPerOrder,
  openSign,
  rewards,
}: {
  priced: Priced[];
  deals: Deals;
  isMember: boolean;
  account: WorldAccount;
  maxPerOrder: number;
  openSign: { title: string; line: string };
  rewards: { enabled: boolean; pointsPerDollar: number };
}) {
  const router = useRouter();
  const cartItems = useCart();
  const totals = cartTotals(cartItems);
  const [webgl] = useState(hasWebGL);
  const [calm] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [startInside] = useState(readInside);

  const [station, setStation] = useState<StationKey>(startInside ? "center" : "outside");
  const [moving, setMoving] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(startInside);
  const [dealsOpen, setDealsOpen] = useState(false);
  const [hovered, setHovered] = useState<StoreItem | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<UnitKey | null>(null);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const [pluses, setPluses] = useState<Plus[]>([]);
  const [drawn, setDrawn] = useState(false);
  // Checking out: the orange circle that grows from the button to fill the screen.
  const [wipe, setWipe] = useState<{ x: number; y: number; grow: boolean } | null>(null);
  const checkingOut = useRef(false);
  const counter = useRef(0);
  const checkoutButton = useRef<HTMLButtonElement>(null);
  const { progress, active } = useProgress();
  // If a picture is slow to download, don't keep people waiting on the cover forever.
  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    if (!drawn) return;
    const t = setTimeout(() => setWaitedEnough(true), 7000);
    return () => clearTimeout(t);
  }, [drawn]);
  const ready = drawn && (!active || waitedEnough);

  // ---- The products, arranged on their shelves -----------------------------------------------
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
    const layouts = { drinks: unitLayout("drinks", items), snacks: unitLayout("snacks", items), candy: unitLayout("candy", items) };
    return { items, layouts, byId: new Map(priced.map((p) => [p.item.id, p])) };
  }, [priced]);

  // ---- What's pinned on the deals board -------------------------------------------------------
  const onSale = useMemo(() => priced.filter((p) => p.shown.regular !== null), [priced]);
  const buyGets = useMemo(() => deals.promotions.filter((p) => p.kind === "buy_get" && (isMember || !p.members_only)), [deals.promotions, isMember]);
  const cards = useMemo(() => {
    const list: BoardCard[] = [];
    for (const p of onSale.slice(0, 2)) list.push({ kind: "sale", title: p.shown.saleTitle ?? "Sale", big: formatCents(p.shown.price), small: `${p.item.name}, was ${formatCents(p.shown.regular!)}` });
    for (const b of deals.bundles.slice(0, 2)) list.push({ kind: "bundle", title: "Bundle", big: formatCents(b.price_cents), small: b.name });
    for (const p of buyGets.slice(0, 1)) list.push({ kind: "coupon", title: p.title, big: `Buy ${p.buy_qty} get ${p.get_qty}`, small: "Free! Adds up at checkout." });
    if (rewards.enabled) list.push({ kind: "rewards", title: "Rewards", big: `${rewards.pointsPerDollar} pt / $1`, small: "Earn points on every order" });
    if (!isMember) list.push({ kind: "member", title: "Members", big: "Join free", small: "Sign up for member prices" });
    // Fill the board with store notes, so it never looks empty.
    const notes: BoardCard[] = [
      { kind: "coupon", title: "Order ahead", big: "Skip the line", small: "Pick up at the window" },
      { kind: "sale", title: "Pay at pickup", big: "Cash or debit", small: "No card needed online" },
      { kind: "bundle", title: "Every week", big: "New deals", small: "Check the board often" },
    ];
    for (const n of notes) if (list.length < 6) list.push(n);
    return list.slice(0, 6);
  }, [onSale, deals.bundles, buyGets, rewards, isMember]);

  // ---- Moving around ------------------------------------------------------------------------
  // The spot you're at, readable inside callbacks without waiting for a re-render.
  const stationRef = useRef(station);
  const go = useCallback((key: StationKey) => {
    if (stationRef.current === key) return;
    stationRef.current = key;
    setStation(key);
    setMoving(true);
    setHovered(null);
    setHoveredUnit(null);
    document.body.style.cursor = "";
  }, []);

  const openDoors = useCallback(() => {
    setDoorsOpen(true);
    writeInside();
    // Let the doors swing open first, then fly in.
    setTimeout(() => go("entrance"), calm ? 0 : 650);
  }, [go, calm]);

  const startWipe = useCallback(() => {
    const r = checkoutButton.current?.getBoundingClientRect();
    const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight - 40 };
    setWipe({ ...at, grow: false });
    // Next frame: grow (so the browser animates from the small circle).
    requestAnimationFrame(() => requestAnimationFrame(() => setWipe({ ...at, grow: true })));
    setTimeout(() => router.push("/cart"), calm ? 50 : 750);
  }, [router, calm]);

  const onArrive = useCallback(
    (key: StationKey) => {
      setMoving(false);
      if (key === "checkout" && checkingOut.current) startWipe();
    },
    [startWipe],
  );

  const checkout = () => {
    if (totals.count === 0) return say("Your cart is empty. Tap something on the shelves first!");
    if (checkingOut.current) return;
    checkingOut.current = true;
    setDealsOpen(false);
    router.prefetch("/cart");
    if (station === "checkout" && !moving) return startWipe();
    if (!doorsOpen) {
      setDoorsOpen(true);
      writeInside();
      setTimeout(() => go("checkout"), calm ? 0 : 650);
    } else go("checkout");
  };

  // Lock the page behind the store so it can't scroll.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.cursor = "";
    };
  }, []);

  // Escape closes the deals list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDealsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- The cart -----------------------------------------------------------------------------
  function say(text: string) {
    const key = ++counter.current;
    setNote({ text, key });
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 2400);
  }

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

  const addBundle = (b: Bundle) => {
    if (b.available <= 0) return say(`${b.name} is sold out right now.`);
    if (!bundleOpenTo(b, isMember)) return say("That bundle is for rewards members. Sign up free to get it!");
    cart.add({
      kind: "bundle",
      id: b.id,
      name: b.name,
      price_cents: b.price_cents,
      emoji: b.emoji,
      photo_path: b.photo_path,
      category: "Bundles",
      detail: b.items.map((i) => (i.quantity > 1 ? `${i.quantity} ${i.name}` : i.name)).join(" + "),
    });
    say(`Added ${b.name} to your cart`);
  };

  if (!webgl) return <NoWebGL />;

  // ---- What the hint line at the bottom says ------------------------------------------------
  const unit = moving ? null : unitAt(station);
  const hint = moving
    ? null
    : station === "outside"
      ? "Tap the doors to walk in · drag to fly around"
      : unit === "drinks"
        ? "Tap a fridge door to open it, then tap a drink"
        : unit
          ? "Tap anything to add it to your cart · drag to look around"
          : station === "deals"
            ? "Tap the board to see every deal"
            : "Drag to look around · tap a floor arrow to walk";
  const status = note?.text ?? (hoveredUnit && !hovered ? `${UNITS.find((u) => u.key === hoveredUnit)!.title}: tap to walk over` : null);
  const visibleItems = unit ? items.filter((i) => i.unit === unit) : [];

  return (
    <div role="application" aria-label={`${brand.name} 3D store`} className="fixed inset-0 z-[60] overflow-hidden bg-[#a9dcfb] text-black select-none">
      <div className="absolute inset-0">
        <WorldScene
          items={items}
          layouts={layouts}
          station={station}
          moving={moving}
          doorsOpen={doorsOpen}
          calm={calm}
          cards={cards}
          openSign={openSign}
          onDoors={openDoors}
          onGo={go}
          onArrive={onArrive}
          onOpenDeals={() => setDealsOpen(true)}
          onTap={(item, x, y) => add(item.id, { x, y })}
          onHover={setHovered}
          onHoverUnit={setHoveredUnit}
          onReady={() => setDrawn(true)}
        />
      </div>

      {/* Top corners: the logo, and your rewards account */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-white/85 py-1.5 pr-3.5 pl-2 shadow-md backdrop-blur-md sm:pr-4">
          <FlameMark size={26} />
          <span className="font-heading text-base leading-none font-extrabold tracking-wide whitespace-nowrap uppercase sm:text-xl">{brand.name}</span>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/menu"
            aria-label="Shop from a list instead"
            title="List view"
            className="grid size-10 place-items-center rounded-full bg-white/85 shadow-md backdrop-blur-md transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
          >
            <ListIcon className="size-4.5" />
          </Link>
          {account.member ? (
            <Link
              href="/account"
              aria-label={`My rewards, ${account.member.balance} points`}
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/85 pr-3.5 pl-1.5 text-sm font-semibold shadow-md backdrop-blur-md transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
            >
              <span className="grid size-7 place-items-center rounded-full bg-primary font-heading text-sm font-extrabold text-black">{account.member.initial}</span>
              <span className="font-heading text-lg leading-none font-extrabold tabular-nums">{account.member.balance}</span>
              <span className="text-black/60">pts</span>
            </Link>
          ) : (
            <Link
              href="/account"
              className="flex h-10 items-center gap-1.5 rounded-full bg-black px-3.5 text-sm font-semibold whitespace-nowrap text-white shadow-md transition-colors hover:bg-black/80 focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
            >
              <UserRoundIcon className="size-4" />
              {account.signedIn ? "Finish rewards account" : "Sign in / Sign up"}
            </Link>
          )}
        </div>
      </div>

      {/* Bottom: what you're pointing at, a hint, and the Checkout button */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p
          aria-live="polite"
          className="min-h-9 max-w-full rounded-full bg-black/80 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-opacity duration-200"
          style={{ opacity: status || hovered ? 1 : 0 }}
        >
          {note ? (
            <span key={note.key}>{note.text}</span>
          ) : hovered ? (
            <>
              {hovered.name}
              <span className="ml-2 font-heading text-base text-primary">{hovered.soldOut ? "Sold out" : hovered.label}</span>
            </>
          ) : (
            (status ?? " ")
          )}
        </p>
        <button
          ref={checkoutButton}
          type="button"
          onClick={checkout}
          className="pointer-events-auto flex h-13 items-center gap-3 rounded-full bg-primary pr-2 pl-5 font-heading text-xl font-extrabold tracking-wide text-black uppercase shadow-[0_6px_0_#000] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-black/40 focus-visible:outline-none active:translate-y-1 active:shadow-[0_2px_0_#000]"
        >
          <ShoppingBagIcon className="size-5" />
          Checkout
          <span className="rounded-full bg-black px-3 py-1 font-heading text-lg text-white tabular-nums">
            {formatCents(totals.totalCents)}
            {totals.count > 0 && <span className="ml-1.5 text-sm text-white/60">· {totals.count}</span>}
          </span>
        </button>
        <p className="min-h-4 text-center text-xs font-semibold text-black/70 [text-shadow:0_1px_0_rgb(255_255_255/0.7)]">{hint}</p>
      </div>

      {/* The deals button, once you're inside */}
      {station !== "outside" && (
        <button
          type="button"
          onClick={() => setDealsOpen(true)}
          className="absolute top-18 left-3 flex h-10 items-center gap-1.5 rounded-full bg-[#ffd21f] px-4 font-heading text-base font-extrabold tracking-wide uppercase shadow-md transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none sm:top-20 sm:left-4"
        >
          <TagIcon className="size-4" /> Deals
        </button>
      )}

      {dealsOpen && (
        <DealsPanel
          onSale={onSale}
          buyGets={buyGets}
          bundles={deals.bundles}
          isMember={isMember}
          rewards={rewards}
          onAdd={(id) => add(id)}
          onAddBundle={addBundle}
          onClose={() => setDealsOpen(false)}
        />
      )}

      {/* The products in view, as real buttons for keyboards and screen readers (they appear when tabbed to). */}
      <ul className="sr-only">
        {station === "outside" && (
          <li>
            <button type="button" className="focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5" onClick={openDoors}>
              Walk into the store
            </button>
          </li>
        )}
        {visibleItems.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5"
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

      {wipe && (
        <div
          aria-hidden
          className="fixed inset-0 z-[95] grid place-items-center bg-primary transition-[clip-path] duration-700 ease-in"
          style={{ clipPath: `circle(${wipe.grow ? "150%" : "0%"} at ${wipe.x}px ${wipe.y}px)` }}
        >
          <span className={cn("transition-transform delay-200 duration-500", wipe.grow ? "scale-100" : "scale-0")}>
            <FlameMark size={96} />
          </span>
        </div>
      )}

      <LoadingScreen progress={drawn ? progress : Math.min(progress, 90)} done={ready} />
    </div>
  );
}

/** The list of every deal: bundles, sale prices, buy-X-get-Y, and rewards. */
function DealsPanel({
  onSale,
  buyGets,
  bundles,
  isMember,
  rewards,
  onAdd,
  onAddBundle,
  onClose,
}: {
  onSale: Priced[];
  buyGets: Deals["promotions"];
  bundles: Bundle[];
  isMember: boolean;
  rewards: { enabled: boolean; pointsPerDollar: number };
  onAdd: (id: string) => void;
  onAddBundle: (b: Bundle) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const empty = onSale.length === 0 && buyGets.length === 0 && bundles.length === 0;

  return (
    <div role="dialog" aria-modal="true" aria-label="Deals" className="fixed inset-0 z-[85] flex justify-end">
      <button type="button" aria-label="Close deals" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-[#f6f1e7] shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b-4 border-black bg-[#ffd21f] px-5 py-4">
          <h2 className="font-heading text-3xl leading-none font-extrabold tracking-wide uppercase">Deals board</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close deals"
            className="grid size-10 place-items-center rounded-full bg-black text-white transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {bundles.length > 0 && (
            <section>
              <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#0b6b67] uppercase">Bundles</h3>
              <ul className="space-y-2">
                {bundles.map((b) => {
                  const locked = !bundleOpenTo(b, isMember);
                  return (
                    <li key={b.id} className="flex items-center gap-3 rounded-2xl border-2 border-black bg-white p-3">
                      <span aria-hidden className="text-3xl">
                        {b.emoji ?? b.items[0]?.emoji ?? "🛍️"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{b.name}</p>
                        <p className="truncate text-xs text-black/60">{b.items.map((i) => (i.quantity > 1 ? `${i.quantity} ${i.name}` : i.name)).join(" + ")}</p>
                        <p className="mt-0.5 text-sm">
                          <span className="font-heading text-lg font-extrabold">{formatCents(b.price_cents)}</span>
                          {b.regular_cents > b.price_cents && <span className="ml-2 text-black/50 line-through">{formatCents(b.regular_cents)}</span>}
                        </p>
                      </div>
                      <AddButton label={`Add ${b.name}`} locked={locked} soldOut={b.available <= 0} onClick={() => onAddBundle(b)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {onSale.length > 0 && (
            <section>
              <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#d7262b] uppercase">On sale</h3>
              <ul className="space-y-2">
                {onSale.map(({ item, shown }) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-2xl border-2 border-black bg-white p-3">
                    <span aria-hidden className="text-3xl">
                      {item.emoji ?? "🏷️"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.name}</p>
                      {shown.saleTitle && <p className="text-xs text-black/60">{shown.saleTitle}</p>}
                      <p className="mt-0.5 text-sm">
                        <span className="font-heading text-lg font-extrabold text-[#d7262b]">{formatCents(shown.price)}</span>
                        <span className="ml-2 text-black/50 line-through">{formatCents(shown.regular!)}</span>
                      </p>
                    </div>
                    <AddButton label={`Add ${item.name}`} soldOut={item.available <= 0} onClick={() => onAdd(item.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {buyGets.length > 0 && (
            <section>
              <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide uppercase">Coupons</h3>
              <ul className="space-y-2">
                {buyGets.map((p) => (
                  <li key={p.id} className="rounded-2xl border-2 border-dashed border-black bg-white p-3">
                    <p className="font-heading text-xl font-extrabold text-primary uppercase">{buyGetLabel(p)}</p>
                    <p className="text-sm">{p.title}</p>
                    <p className="text-xs text-black/60">Taken off automatically at checkout.</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {empty && <p className="rounded-2xl border-2 border-dashed border-black/30 p-6 text-center text-black/60">No deals this week. Check back soon!</p>}

          <section className="rounded-2xl bg-black p-5 text-white">
            <h3 className="font-heading text-2xl leading-none font-extrabold tracking-wide text-primary uppercase">Rewards</h3>
            <p className="mt-2 text-sm text-white/80">
              {rewards.enabled ? `Earn ${rewards.pointsPerDollar} point${rewards.pointsPerDollar === 1 ? "" : "s"} for every dollar, and spend them on free snacks.` : "Members get special prices and bundles."}
            </p>
            {!isMember && (
              <Link href="/account?mode=signup" className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-4 font-semibold text-black transition-transform hover:-translate-y-0.5">
                Sign up free
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function AddButton({ label, onClick, locked = false, soldOut = false }: { label: string; onClick: () => void; locked?: boolean; soldOut?: boolean }) {
  return (
    <button
      type="button"
      aria-label={soldOut ? `${label} (sold out)` : locked ? `${label} (members only)` : label}
      onClick={onClick}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border-2 border-black transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-black/40 focus-visible:outline-none active:scale-95",
        soldOut ? "bg-black/10 text-black/40" : locked ? "bg-black text-white" : "bg-primary text-black",
      )}
    >
      {locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-5" />}
    </button>
  );
}

/** For the rare browser that can't draw 3D. */
function NoWebGL() {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#f6f1e7] p-6 text-center text-black">
      <div className="max-w-sm">
        <FlameMark size={72} className="mx-auto" />
        <p className="mt-4 font-heading text-4xl font-extrabold tracking-wide uppercase">{brand.name}</p>
        <p className="mt-2 text-black/70">This browser can&apos;t show the 3D store, but you can still shop everything from the list.</p>
        <Link href="/menu" className="mt-5 inline-flex h-12 items-center rounded-full bg-primary px-6 font-heading text-xl font-extrabold uppercase">
          Shop the list
        </Link>
      </div>
    </div>
  );
}
