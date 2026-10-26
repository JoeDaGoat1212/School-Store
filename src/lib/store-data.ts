import "server-only";

import { createClient } from "@/lib/supabase/server";
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

/** The public menu and store info. Uses only the functions students may call. */
export async function loadStorefront() {
  const supabase = await createClient();
  const [menu, info] = await Promise.all([supabase.rpc("get_menu"), supabase.rpc("get_store_info")]);

  if (menu.error || info.error) {
    throw new Error(`Couldn't load the store: ${(menu.error ?? info.error)!.message}`);
  }

  return {
    menu: (menu.data ?? []) as MenuItem[],
    info: info.data as unknown as StoreInfo,
  };
}
