/**
 * The store's inventory math, all in one place. Every formula from the
 * project plan lives here, and each one is tested in calculations.test.ts.
 *
 * Words used below:
 *   stock      units on the shelf
 *   reserved   units held by open online orders
 *   available  stock − reserved (what can still be sold)
 *   avg        average units sold per day
 */

/** Daily average sales = units sold in the last N days ÷ N */
export function dailyAverage(unitsSold: number, days: number) {
  return days > 0 ? unitsSold / days : 0;
}

/** Available online stock = stock − reserved by open orders (never below 0). */
export function availableStock(stock: number, reserved: number) {
  return Math.max(0, stock - reserved);
}

/** Days of stock left = stock ÷ daily average. Infinity if it isn't selling. */
export function daysOfStockLeft(available: number, avg: number) {
  if (available <= 0) return 0;
  return avg > 0 ? available / avg : Infinity;
}

/**
 * Reorder point = (daily average × restock lead time) + buffer.
 * The buffer is "safety days": extra days of sales to keep on hand in case
 * of a busy day or a late shopping trip.
 */
export function suggestedReorderPoint(avg: number, leadDays: number, bufferDays: number) {
  return Math.ceil(avg * leadDays + avg * bufferDays);
}

/**
 * Suggested order quantity = enough to last until the next planned shopping
 * trip (plus the safety buffer), minus what's already available.
 */
export function suggestedOrderQuantity(avg: number, available: number, daysUntilNextTrip: number, bufferDays: number) {
  const needed = avg * (daysUntilNextTrip + bufferDays);
  return Math.max(0, Math.ceil(needed - Math.max(available, 0)));
}

/** Profit per product = (price − unit cost) × units sold. In cents. */
export function productProfit(priceCents: number, unitCostCents: number, unitsSold: number) {
  return (priceCents - unitCostCents) * unitsSold;
}

export type Batch = { quantity: number; received_on: string; expires_on: string };

/**
 * Which perishable batches are probably still on the shelf.
 *
 * We don't scan which exact package was sold, so we assume the oldest sells
 * first. Starting from the NEWEST batch, we count back until we've accounted
 * for everything in stock. `batches` must be sorted newest first.
 */
export function batchesStillOnShelf(stock: number, batches: Batch[]) {
  const onShelf: (Batch & { remaining: number })[] = [];
  let left = stock;
  for (const batch of batches) {
    if (left <= 0) break;
    const remaining = Math.min(batch.quantity, left);
    onShelf.push({ ...batch, remaining });
    left -= remaining;
  }
  return onShelf;
}

/** The soonest expiration date among batches still on the shelf, or null. */
export function nextExpiration(stock: number, batches: Batch[]) {
  const dates = batchesStillOnShelf(stock, batches).map((b) => b.expires_on);
  return dates.length ? dates.sort()[0] : null;
}

/** Whole days from `from` to `to` ("YYYY-MM-DD"). Negative if `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export type FrequencyInput = {
  name: string;
  avg: number;
  unitCostCents: number;
  /** Days a perishable lasts after purchase (from past batches), or null. */
  shelfLifeDays: number | null;
};

/**
 * How often to go shopping.
 *
 * Start from a weekly trip. Go more often if a perishable that actually
 * sells would spoil before the next trip. Never more often than every 3
 * days or less often than every 14.
 */
export function recommendShoppingInterval(products: FrequencyInput[]) {
  const DEFAULT_DAYS = 7;
  const perishables = products.filter((p) => p.avg > 0 && p.shelfLifeDays !== null);
  const shortest = perishables.reduce<FrequencyInput | null>(
    (min, p) => (min === null || p.shelfLifeDays! < min.shelfLifeDays! ? p : min),
    null,
  );

  let days = DEFAULT_DAYS;
  let reason = "A weekly trip keeps stock steady without overbuying.";
  if (shortest && shortest.shelfLifeDays! < DEFAULT_DAYS) {
    days = Math.max(3, shortest.shelfLifeDays!);
    reason = `${shortest.name} only lasts about ${shortest.shelfLifeDays} days, so shop before it spoils.`;
  }
  days = Math.min(14, days);

  const budgetCents = Math.round(products.reduce((sum, p) => sum + p.avg * days * p.unitCostCents, 0));
  return { days, reason, budgetCents };
}
