"use client";

import { FLAME_PATH } from "@/components/brand-mark";

/** The name of the event that opens the 3D store (StoreEntrance listens for it). */
export const OPEN_STORE_EVENT = "nest:open-store";

/** The big orange "Enter store" button at the top of the page. */
export function EnterStoreButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_STORE_EVENT))}
      className="group inline-flex h-14 items-center gap-3 rounded-2xl bg-primary px-7 font-heading text-2xl font-extrabold tracking-wide text-black uppercase shadow-[0_0_44px_rgb(255_90_31/0.55)] transition-transform hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-white/60 focus-visible:outline-none active:scale-95 sm:h-16 sm:px-8 sm:text-3xl"
    >
      <svg aria-hidden viewBox="0 0 32 32" className="size-7 fill-black transition-transform group-hover:-rotate-6 sm:size-8">
        <path fillRule="evenodd" d={FLAME_PATH} />
      </svg>
      Enter store
    </button>
  );
}
