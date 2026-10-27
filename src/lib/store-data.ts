import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Deals } from "@/lib/deals";
import type { StoreInfo } from "@/lib/ordering";

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  emoji: string | null;
  photo_path: string | null;
  price_cents: number;
  tags: string[];
  available: number;
};

/**
 * The public menu, store info, and today's deals and bundles. Uses only the
 * functions students may call. `cache` = asked once per page load.
 */
export const loadStorefront = cache(async () => {
  const supabase = await createClient();
  const [menu, info, deals] = await Promise.all([
    supabase.rpc("get_menu"),
    supabase.rpc("get_store_info"),
    supabase.rpc("get_deals"),
  ]);

  if (menu.error || info.error) {
    throw new Error(`Couldn't load the store: ${(menu.error ?? info.error)!.message}`);
  }

  return {
    menu: (menu.data ?? []) as MenuItem[],
    info: info.data as unknown as StoreInfo,
    // If the deals update hasn't been run yet, the menu still works without deals.
    deals: ((deals.error ? null : deals.data) ?? { promotions: [], bundles: [] }) as unknown as Deals,
  };
});
