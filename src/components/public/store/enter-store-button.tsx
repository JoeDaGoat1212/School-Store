"use client";

import type { ReactNode } from "react";

/** The name of the event that opens the 3D store (StoreEntrance listens for it). */
export const OPEN_STORE_EVENT = "nest:open-store";

/** Anything that opens the 3D store when clicked (the shop door and window on the home page). */
export function OpenStoreButton({ className, label, children }: { className?: string; label: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={() => window.dispatchEvent(new Event(OPEN_STORE_EVENT))} className={className}>
      {children}
    </button>
  );
}
