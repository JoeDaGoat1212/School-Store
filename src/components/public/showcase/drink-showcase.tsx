"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { buyGetLabel, type ShownPrice } from "@/lib/deals";
import { formatCents } from "@/lib/format";
import { productLook, readableOn, shade, type ProductLook } from "@/lib/product-look";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { cart } from "../cart-store";
import { Sparks } from "../product-card";
import { QuantityStepper } from "../quantity-stepper";
import { FlavorParticles } from "./flavor-particles";
import { SCENES } from "./scene-assets";
import { SceneBackdrop, usePreloadBackdrops } from "./scene-backdrop";
import type { SceneItem } from "./drink-scene";

// The 3D code (three.js) is big, so it only downloads when this section shows up.
// Until it's ready, a soft glowing outline holds the drink's place.
const DrinkScene = dynamic(() => import("./drink-scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="h-[55%] w-[18%] max-w-28 min-w-20 animate-pulse rounded-[2rem] bg-white/20" />
    </div>
  ),
});

type Entry = { item: MenuItem; shown: ShownPrice; look: ProductLook };

/** The black header (64px) plus the category tabs (65px): the stage sticks just under them. */
export const SHOWCASE_TOP = 129;

/**
 * The drinks showcase: swipe through the drinks one at a time. The middle one
 * turns in 3D, the background changes to its color, and its flavor (strawberries,
 * lemon slices, ice…) falls around it.
 */
export function DrinkShowcase({
  drinks,
  maxPerOrder,
  inCart,
  title = "Drinks",
  startId,
  onBack,
  top = SHOWCASE_TOP,
}: {
  drinks: { item: MenuItem; shown: ShownPrice }[];
  maxPerOrder: number;
  inCart: (id: string) => number;
  /** Shown above the name, e.g. "Fanta 2 / 3". */
  title?: string;
  /** Open on this drink instead of the first. */
  startId?: string;
  /** Shows an "All drinks" button (and Esc) that calls this. */
  onBack?: () => void;
  /** How far down the screen the stage sticks (whatever bars are above it). */
  top?: number;
}) {
  // In-stock drinks first, so the showcase opens on something you can buy.
  const entries: Entry[] = useMemo(
    () =>
      [...drinks]
        .sort((a, b) => Number(a.item.available <= 0) - Number(b.item.available <= 0))
        .map((d) => ({ ...d, look: productLook(d.item) })),
    [drinks],
  );
  const sceneItems: SceneItem[] = useMemo(
    () =>
      entries.map(({ item, look }) => ({
        id: item.id,
        name: item.name,
        subtitle: sizeOf(item.description),
        look,
      })),
    [entries],
  );

  // Which drink is showing. Arrows, swipes, sideways trackpad scrolls and the
  // ← → keys change it; scrolling up or down just moves on down the page.
  const [index, setIndex] = useState(() => Math.max(0, entries.findIndex((e) => e.item.id === startId)));
  const [burst, setBurst] = useState(0);
  const [moved, setMoved] = useState(false); // hide the hint after the first move
  const sectionRef = useRef<HTMLElement>(null);
  const { visible, calm, webgl } = useEnvironment(sectionRef);
  const count = entries.length;

  /** Show drink number `i` (the 3D scene calls this when a drink on the side is tapped). */
  const scrollTo = (i: number) => {
    const next = Math.min(count - 1, Math.max(0, i));
    if (next !== index) setMoved(true);
    setIndex(next);
  };
  const go = (step: number) => scrollTo(index + step);
  const goRef = useRef(go);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    goRef.current = go;
    onBackRef.current = onBack;
  });

  // Arrow keys (← → and ↑ ↓) move between drinks while the showcase is on screen.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && onBackRef.current) {
        onBackRef.current();
        return;
      }
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      // Only ← and →: ↑ and ↓ keep scrolling the page.
      const forward = e.key === "ArrowRight";
      const back = e.key === "ArrowLeft";
      if (!forward && !back) return;
      e.preventDefault();
      goRef.current(forward ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  // The particles of the drink we just left fade out while the new ones fade in.
  const current = entries[index];
  const [previous, setPrevious] = useState<{ key: string; look: ProductLook } | null>(null);
  const lastRef = useRef(current);
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = current;
    if (!last || last.item.id === current?.item.id) return;
    setPrevious({ key: last.item.id, look: last.look });
    const t = setTimeout(() => setPrevious(null), 700);
    return () => clearTimeout(t);
  }, [current]);

  // Swipe (touch or mouse drag) and trackpad sideways scrolling.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const wheelLock = useRef(0);

  // Fetch the photos of the drinks on either side ahead of time.
  usePreloadBackdrops([entries[index - 1]?.look.scene, entries[index + 1]?.look.scene]);

  if (!current) return null;
  const { item, shown, look } = current;
  // With a photo backdrop, the stage takes the photo's own color so the edges blend in.
  const stage = look.scene ? SCENES[look.scene].edge : look.color;
  const ink = readableOn(stage);
  const pieces = (l: ProductLook) => (l.scene ? SCENES[l.scene].pieces : undefined);
  const quantity = inCart(item.id);
  const max = Math.min(item.available, maxPerOrder);
  const soldOut = item.available <= 0;

  const add = () => {
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
      ref={sectionRef}
      id="cooler"
      aria-roledescription="carousel"
      aria-label={title}
      className="relative mb-8 ml-[calc(50%-50vw)] w-screen select-none"
    >
     <div
      onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const start = drag.current;
        drag.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(e.clientY - start.y)) go(dx < 0 ? 1 : -1);
      }}
      onWheel={(e) => {
        // Sideways trackpad swipes also move between drinks (up/down is normal scrolling).
        if (Math.abs(e.deltaX) < 25 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
        const now = Date.now();
        if (now - wheelLock.current < 450) return;
        wheelLock.current = now;
        go(e.deltaX > 0 ? 1 : -1);
      }}
      className="relative overflow-hidden"
      style={
        {
          // About one screen tall (never taller than 760px), and you scroll straight past it.
          height: `clamp(520px, calc(100svh - ${top}px), 760px)`,
          // Phones: sideways swipes change the drink; up and down scroll the page.
          touchAction: "pan-y",
          backgroundColor: stage,
          color: ink,
          transition: "background-color 700ms ease, color 400ms ease",
        } as CSSProperties
      }
     >
      {/* The flavor's photo backdrop. The old one stays underneath while the new one fades in. */}
      {previous?.look.scene && previous.look.scene !== look.scene && <SceneBackdrop key={`s-${previous.key}`} scene={previous.look.scene} />}
      {look.scene ? (
        <SceneBackdrop key={`s-${look.scene}`} scene={look.scene} className="animate-in fade-in duration-700" />
      ) : (
        // No photo for this flavor: light in the middle, darker edges, like a product photo studio.
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(60% 55% at 62% 45%, ${shade(look.color, 0.28)}cc, transparent 70%), radial-gradient(120% 90% at 50% 50%, transparent 55%, ${shade(look.color, -0.45)}aa)`,
            transition: "background 700ms ease",
          }}
        />
      )}

      {/* Falling flavor, behind the drink */}
      {previous && (
        <FlavorParticles
          key={`b-${previous.key}`}
          kind={previous.look.particle}
          pieces={pieces(previous.look)}
          layer="back"
          count={look.scene ? 8 : 14}
          className="animate-out fade-out duration-700 fill-mode-forwards"
        />
      )}
      <FlavorParticles key={`b-${item.id}`} kind={look.particle} pieces={pieces(look)} layer="back" count={look.scene ? 8 : 14} className="animate-in fade-in duration-700" />

      {/* The 3D drinks (or a flat picture if the device can't do 3D) */}
      <div className="absolute inset-x-0 top-0 h-[62%] sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-[62%]">
        {webgl ? (
          <DrinkScene items={sceneItems} index={index} active={visible} calm={calm} onSelect={scrollTo} />
        ) : (
          <div className="grid h-full place-items-center">
            <ProductArt
              key={item.id}
              name={item.name}
              photoPath={item.photo_path}
              emoji={item.emoji}
              category={item.category}
              className="size-56 rounded-3xl bg-white/90 shadow-2xl animate-in zoom-in-90 fade-in duration-500"
              emojiClassName="text-8xl"
            />
          </div>
        )}
      </div>

      {/* Falling flavor, in front of the drink (fewer, bigger, softer) */}
      {previous && (
        <FlavorParticles
          key={`f-${previous.key}`}
          kind={previous.look.particle}
          pieces={pieces(previous.look)}
          layer="front"
          count={look.scene ? 3 : 4}
          className="animate-out fade-out duration-700 fill-mode-forwards"
        />
      )}
      <FlavorParticles key={`f-${item.id}`} kind={look.particle} pieces={pieces(look)} layer="front" count={look.scene ? 3 : 4} className="animate-in fade-in duration-700" />

      {/* Name, price and Add */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-4 pb-6 sm:top-0 sm:flex sm:flex-col sm:justify-center sm:pb-0">
        <div className="pointer-events-auto max-w-sm">
          <p className="text-sm font-semibold opacity-80">
            {title} <span className="tabular-nums">{index + 1} / {count}</span>
          </p>
          <h3 key={item.id} className="mt-1 font-heading text-5xl leading-[0.9] font-extrabold uppercase animate-in fade-in slide-in-from-bottom-3 duration-500 sm:text-7xl">
            {item.name}
          </h3>
          {item.description && <p className="mt-2 line-clamp-2 opacity-80">{item.description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="font-heading text-4xl leading-none font-extrabold tabular-nums">
              {formatCents(shown.price)}
              {shown.regular !== null && (
                <span className="ml-2 text-xl font-bold line-through opacity-60">
                  <span className="sr-only">was </span>
                  {formatCents(shown.regular)}
                </span>
              )}
            </p>
            {shown.saleTitle && <span className="rounded-md bg-black px-2 py-0.5 text-xs font-bold text-white">{shown.saleTitle}</span>}
            {shown.buyGets[0] && <span className="rounded-md bg-black px-2 py-0.5 text-xs font-bold text-white">{buyGetLabel(shown.buyGets[0])}</span>}
          </div>

          <div className="relative mt-4 w-48">
            {soldOut ? (
              <span className="inline-flex h-12 items-center rounded-xl bg-black/20 px-5 font-semibold">Sold out</span>
            ) : quantity > 0 ? (
              <QuantityStepper
                name={item.name}
                quantity={quantity}
                max={max}
                onChange={(q) => cart.setQuantity(item.id, Math.min(q, max))}
                className="h-12 bg-black text-white [&_button:hover]:bg-white/15"
              />
            ) : (
              <button
                type="button"
                onClick={add}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-black font-semibold text-white shadow-lg transition-transform focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none active:scale-95"
              >
                <PlusIcon className="size-4.5" /> Add<span className="sr-only"> {item.name}</span>
              </button>
            )}
            {burst > 0 && <Sparks key={burst} />}
          </div>
        </div>
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute top-4 left-4 z-20 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-lg backdrop-blur-sm transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none active:scale-95"
          style={{ backgroundColor: ink === "#ffffff" ? "rgb(255 255 255 / 0.18)" : "rgb(0 0 0 / 0.12)" }}
        >
          <ChevronLeftIcon className="size-4" /> All drinks
        </button>
      )}

      {/* Arrows on both sides, so it's clear there's more to see */}
      <ArrowButton side="left" disabled={index === 0} onClick={() => go(-1)} ink={ink} />
      <ArrowButton side="right" disabled={index === count - 1} onClick={() => go(1)} ink={ink} />

      {/* Which drink you're on */}
      <div aria-hidden className="absolute right-4 bottom-5 flex gap-1.5 sm:right-1/2 sm:translate-x-1/2">
        {entries.map((e, i) => (
          <span
            key={e.item.id}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{ width: i === index ? 22 : 6, backgroundColor: ink, opacity: i === index ? 0.9 : 0.35 }}
          />
        ))}
      </div>

      {/* A hint until they move for the first time */}
      {!moved && count > 1 && (
        <p
          aria-hidden
          className="absolute bottom-12 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold backdrop-blur-sm sm:flex"
          style={{ backgroundColor: ink === "#ffffff" ? "rgb(255 255 255 / 0.16)" : "rgb(0 0 0 / 0.1)" }}
        >
          Swipe or press <kbd className="rounded border border-current/40 px-1.5 font-sans text-xs">←</kbd>
          <kbd className="rounded border border-current/40 px-1.5 font-sans text-xs">→</kbd> for the next drink
        </p>
      )}

      {/* Tell screen readers which drink is showing now */}
      <p className="sr-only" aria-live="polite">
        {item.name}, {formatCents(shown.price)}, {index + 1} of {count}
      </p>
     </div>
    </section>
  );
}

function ArrowButton({ side, disabled, onClick, ink }: { side: "left" | "right"; disabled: boolean; onClick: () => void; ink: string }) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous drink" : "Next drink"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-[31%] z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full shadow-lg backdrop-blur-sm transition-[opacity,transform] hover:scale-110 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-30 sm:top-1/2 sm:size-16",
        side === "left" ? "left-3 sm:left-6" : "right-3 sm:right-6",
      )}
      style={{ backgroundColor: ink === "#ffffff" ? "rgb(255 255 255 / 0.18)" : "rgb(0 0 0 / 0.12)" }}
    >
      <Icon className="size-6 sm:size-8" />
    </button>
  );
}

/** "16.9 oz bottle" → "16.9 OZ" for the label. */
export function sizeOf(description: string | null) {
  return description?.match(/\d+(\.\d+)?\s?(fl\.? )?oz/i)?.[0] ?? "";
}

/** Can this device draw 3D? Checked once. */
let webglSupport: boolean | null = null;
function hasWebgl() {
  if (webglSupport === null) {
    try {
      const canvas = document.createElement("canvas");
      webglSupport = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const never = () => () => {};

const MOTION = "(prefers-reduced-motion: reduce)";
function onMotionChange(callback: () => void) {
  const mq = window.matchMedia(MOTION);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** Is the showcase on screen? Does the visitor want less motion? Can this device do 3D? */
function useEnvironment(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  const calm = useSyncExternalStore(onMotionChange, () => window.matchMedia(MOTION).matches, () => false);
  const webgl = useSyncExternalStore(never, hasWebgl, () => true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return { visible, calm, webgl };
}
