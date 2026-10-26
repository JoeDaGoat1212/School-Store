import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Categories and suppliers for the product form's pickers. */
export async function loadFormOptions(supabase: SupabaseClient<Database>) {
  const [{ data: cats }, { data: suppliers }] = await Promise.all([
    supabase.from("products").select("category"),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);
  const defaults = ["Snacks", "Drinks", "Hot food", "Supplies"];
  const categories = [...new Set([...defaults, ...(cats ?? []).map((c) => c.category)])].sort();
  return { categories, suppliers: suppliers ?? [] };
}
