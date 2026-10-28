"use client";

import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { productRenderUrl } from "@/lib/product-renders";
import { cn } from "@/lib/utils";
import { PICK_CATEGORY_EVENT } from "../menu";

export type Aisle = {
  /** The menu tab it opens ("Drinks", "candy", "Deals"…). */
  category: string;
  title: string;
  blurb: string;
  count: number;
  /** Product names to show (their 3D pictures). */
  picks: string[];
  tone: "teal" | "orange" | "pink" | "gold" | "black";
  /** Go to this page instead of opening a tab below (the Deals card goes to /deals). */
  href?: string;
};

/** Classes that make the last card fill out its row (2 columns on phones, 4 on big screens). */
function lastSpan(n: number) {
  const cells = n + 1; // the first card takes two cells
  const phone = cells % 2 ? "col-span-2" : "";
  const big = ["", "lg:col-span-4", "lg:col-span-3", "lg:col-span-2"][cells % 4];
  return cn(phone, phone && !big && "lg:col-span-1", big);
}

const TONES: Record<Aisle["tone"], string> = {
  teal: "bg-[linear-gradient(150deg,#d6f4f1,#9fe0d9)] text-[#063b38]",
  orange: "bg-[linear-gradient(150deg,#ffe6d6,#ffb98f)] text-[#4a1a04]",
  pink: "bg-[linear-gradient(150deg,#ffe3ef,#ffb3d2)] text-[#4b0d27]",
  gold: "bg-[linear-gradient(150deg,#fff2c9,#ffd56b)] text-[#3d2a00]",
  black: "bg-[linear-gradient(150deg,#26262b,#0b0b0d)] text-white",
};

/**
 * "Shop by aisle": a big card for each part of the store with its products'
 * 3D pictures floating on it. Tapping one jumps down to the shop with that
 * tab open.
 */
export function AisleCards({ aisles }: { aisles: Aisle[] }) {
  const router = useRouter();
  const open = (a: Aisle) => {
    if (a.href) return router.push(a.href);
    const category = a.category;
    window.dispatchEvent(new CustomEvent(PICK_CATEGORY_EVENT, { detail: category }));
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section id="aisles" aria-labelledby="aisles-title" className="scroll-mt-24">
      <h2 id="aisles-title" className="font-heading text-5xl leading-none font-extrabold uppercase sm:text-6xl">
        Shop by aisle
      </h2>
      <p className="mt-2 text-muted-foreground">Pick a part of the store to jump straight to it.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {aisles.map((a, i) => {
          const pics = a.picks.map(productRenderUrl).filter(Boolean).slice(0, 3) as string[];
          return (
            <button
              key={a.category}
              type="button"
              onClick={() => open(a)}
              className={cn(
                "group relative flex min-h-64 flex-col overflow-hidden rounded-3xl p-4 text-left shadow-soft transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-ring/60 focus-visible:outline-none sm:min-h-72 sm:p-5",
                TONES[a.tone],
                // The first card (Drinks) is twice as wide; the last one stretches to fill its row.
                i === 0 && "col-span-2",
                i > 0 && i === aisles.length - 1 && lastSpan(aisles.length),
              )}
            >
              <span className="font-heading text-3xl leading-none font-extrabold uppercase sm:text-4xl">{a.title}</span>
              <span className="mt-1 hidden text-sm opacity-75 sm:block">{a.blurb}</span>
              <span className="mt-1 text-xs font-semibold tracking-wider uppercase opacity-60">
                {a.count} {a.count === 1 ? "item" : "items"}
              </span>
              {/* Floating product pictures */}
              <span aria-hidden className="pointer-events-none absolute inset-x-2 bottom-12 flex h-[46%] items-end justify-center sm:bottom-10 sm:h-[54%]">
                {pics.map((src, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className={cn(
                      // The pictures have room round them: overlap them and draw them a bit bigger.
                      "h-full w-auto max-w-[44%] origin-bottom object-contain drop-shadow-[0_10px_14px_rgb(0_0_0/0.25)] transition-transform duration-500",
                      k === 0 && "float-a z-10 scale-125 group-hover:-rotate-6",
                      k === 1 && "float-b -ml-[14%] scale-110 group-hover:rotate-3",
                      k === 2 && "float-c -ml-[14%] group-hover:rotate-6",
                    )}
                  />
                ))}
                {pics.length === 0 &&
                  (a.tone === "black" ? (
                    // Deals: a sale sticker
                    <span className="float-a mb-2 grid size-24 rotate-[-10deg] place-items-center rounded-full bg-[#ffd21f] text-center font-heading leading-none font-extrabold text-black uppercase shadow-[0_10px_30px_rgb(255_210_31/0.35)] ring-4 ring-black ring-offset-4 ring-offset-[#ffd21f] sm:size-44">
                      <span>
                        <span className="block text-lg sm:text-3xl">Save</span>
                        <span className="block text-4xl sm:text-6xl">big</span>
                      </span>
                    </span>
                  ) : (
                    <span className="text-7xl">🛍️</span>
                  ))}
              </span>
              <span className="mt-auto flex items-center gap-1.5 self-end rounded-full bg-black/85 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors group-hover:bg-black">
                Shop {a.title.toLowerCase()} <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
