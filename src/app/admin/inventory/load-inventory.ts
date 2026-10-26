import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  availableStock,
  dailyAverage,
  daysBetween,
  daysOfStockLeft,
  nextExpiration,
  recommendShoppingInterval,
  suggestedOrderQuantity,
  suggestedReorderPoint,
  type Batch,
} from "@/lib/calculations";
import type { Database } from "@/lib/supabase/database.types";

type Snapshot = {
  today: string;
  window_days: number;
  reorder_buffer_days: number;
  shopping_interval_days: number;
  next_shopping_date: string | null;
  products: {
    id: string;
    name: string;
    category: string;
    emoji: string | null;
    photo_path: string | null;
    stock: number;
    reserved: number;
    price_cents: number;
    unit_cost_cents: number;
    reorder_point: number;
    lead_days: number;
    is_perishable: boolean;
    available_online: boolean;
    supplier: string | null;
    units_sold: number;
    batches: Batch[] | null;
  }[];
};

export type StockLevel = "out" | "low" | "ok";
export type ExpiryLevel = "expired" | "soon" | "ok" | null;

export type InventoryRow = Snapshot["products"][number] & {
  available: number;
  avgPerDay: number;
  daysLeft: number;
  level: StockLevel;
  suggestedReorderPoint: number;
  suggestedQuantity: number;
  nextExpiry: string | null;
  expiry: ExpiryLevel;
  /** Average days from purchase to expiration, from past batches. */
  shelfLifeDays: number | null;
};

/** Loads stock + recent sales and runs the inventory math for every product. */
export async function loadInventory(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("inventory_snapshot");
  if (error) throw new Error(error.message);
  const snap = data as unknown as Snapshot;

  const rows: InventoryRow[] = snap.products.map((p) => {
    const available = availableStock(p.stock, p.reserved);
    const avg = dailyAverage(p.units_sold, snap.window_days);
    const batches = p.batches ?? [];
    const nextExpiry = p.is_perishable ? nextExpiration(p.stock, batches) : null;
    const daysToExpiry = nextExpiry ? daysBetween(snap.today, nextExpiry) : null;
    const shelfLives = batches.map((b) => daysBetween(b.received_on, b.expires_on)).filter((d) => d > 0);

    return {
      ...p,
      available,
      avgPerDay: avg,
      daysLeft: daysOfStockLeft(available, avg),
      level: available <= 0 ? "out" : available <= p.reorder_point ? "low" : "ok",
      suggestedReorderPoint: suggestedReorderPoint(avg, p.lead_days, snap.reorder_buffer_days),
      suggestedQuantity: suggestedOrderQuantity(avg, available, snap.shopping_interval_days, snap.reorder_buffer_days),
      nextExpiry,
      expiry: daysToExpiry === null ? null : daysToExpiry < 0 ? "expired" : daysToExpiry <= 3 ? "soon" : "ok",
      shelfLifeDays: shelfLives.length
        ? Math.round(shelfLives.reduce((a, b) => a + b, 0) / shelfLives.length)
        : null,
    };
  });

  const frequency = recommendShoppingInterval(
    rows.map((r) => ({
      name: r.name,
      avg: r.avgPerDay,
      unitCostCents: r.unit_cost_cents,
      shelfLifeDays: r.is_perishable ? r.shelfLifeDays : null,
    })),
  );

  return { ...snap, rows, frequency };
}
