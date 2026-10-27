/** The shape of what the database's insights() function returns. */
export type Insights = {
  from: string;
  to: string;
  bucket: "day" | "week" | "month";
  totals: {
    revenue_cents: number;
    spending_cents: number;
    gross_profit_cents: number;
    transactions: number;
    units_sold: number;
    online_orders: number;
    last_sale_date: string | null;
  };
  previous: {
    from: string;
    to: string;
    revenue_cents: number;
    spending_cents: number;
    gross_profit_cents: number;
    units_sold: number;
  };
  series: { start: string; revenue_cents: number; spending_cents: number }[];
  payments: Partial<Record<"cash" | "debit" | "other", number>>;
  channels: { online_units: number; total_units: number };
  suppliers: { name: string; cents: number; trips: number }[];
  products: ProductInsight[];
  unmatched_revenue_cents: number;
};

export type ProductInsight = {
  id: string;
  name: string;
  category: string;
  emoji: string | null;
  archived: boolean;
  price_cents: number;
  unit_cost_cents: number;
  stock: number;
  units: number;
  revenue_cents: number;
  gross_profit_cents: number;
  start_stock: number;
  restocked: number;
  units_paid: number;
};

/** Margin = gross profit ÷ revenue. Null when nothing sold. */
export function margin(p: { revenue_cents: number; gross_profit_cents: number }) {
  return p.revenue_cents > 0 ? p.gross_profit_cents / p.revenue_cents : null;
}

/**
 * Sell-through = units sold ÷ units that were available to sell
 * (stock at the start of the range + what was bought during it).
 */
export function sellThrough(p: ProductInsight) {
  const available = p.start_stock + p.restocked;
  return available > 0 ? Math.min(1, p.units_paid / available) : null;
}
