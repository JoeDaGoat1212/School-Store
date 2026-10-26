"use client";

import { FlashToast } from "@/components/flash-toast";

const savedMessage = (name: string) => `Saved ${name}`;

/** Shows "Saved …" after the product form redirects back to the list. */
export function SavedToast() {
  return <FlashToast message={savedMessage} />;
}
