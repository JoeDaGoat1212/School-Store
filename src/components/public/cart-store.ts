"use client";

/**
 * The shopping cart, saved in the browser (localStorage) so it survives a
 * page refresh. Nothing about the cart is sent to the server until checkout.
 *
 * Use it in a component:
 *   const items = useCart();
 *   cart.add(product);  cart.setQuantity(id, 3);  cart.clear();
 */

import { useSyncExternalStore } from "react";

export type CartItem = {
  /** "bundle" for bundles; products leave it out. */
  kind?: "product" | "bundle";
  id: string;
  name: string;
  price_cents: number;
  emoji: string | null;
  photo_path: string | null;
  category: string;
  quantity: number;
  /** For bundles: what's inside, e.g. "Doritos + Gatorade". */
  detail?: string;
};

const STORAGE_KEY = "school-store-cart-v1";
const EMPTY: CartItem[] = [];

let items: CartItem[] | null = null; // null = not loaded from storage yet
const listeners = new Set<() => void>();

function load(): CartItem[] {
  if (items === null) {
    try {
      items = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      items = []; // storage blocked or broken data: start empty
    }
  }
  return items!;
}

function update(next: CartItem[]) {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can block storage; the cart still works until refresh.
  }
  listeners.forEach((listener) => listener());
}

export const cart = {
  add(product: Omit<CartItem, "quantity">, quantity = 1) {
    const current = load();
    const existing = current.find((i) => i.id === product.id);
    update(
      existing
        ? current.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i))
        : [...current, { ...product, quantity }],
    );
  },
  /** Setting the quantity to 0 removes the item. */
  setQuantity(id: string, quantity: number) {
    const current = load();
    update(quantity <= 0 ? current.filter((i) => i.id !== id) : current.map((i) => (i.id === id ? { ...i, quantity } : i)));
  },
  clear() {
    update([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cart items. Re-renders the component whenever the cart changes. */
export function useCart() {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

/** Products and bundles are sent to the server separately. */
export function splitCart(list: CartItem[]) {
  return {
    items: list.filter((i) => i.kind !== "bundle").map((i) => ({ product_id: i.id, quantity: i.quantity })),
    bundles: list.filter((i) => i.kind === "bundle").map((i) => ({ bundle_id: i.id, quantity: i.quantity })),
  };
}

export function cartTotals(list: CartItem[]) {
  return {
    count: list.reduce((n, i) => n + i.quantity, 0),
    totalCents: list.reduce((n, i) => n + i.quantity * i.price_cents, 0),
  };
}
