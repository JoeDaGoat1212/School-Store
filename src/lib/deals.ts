/**
 * Deals and bundles, as the menu shows them.
 *
 * The database (_price_cart) has the final say on prices. This file only
 * decides what the menu SHOWS: sale price tags, "buy 2 get 1" labels and
 * member-price teasers. Keep the two in step if you change the rules.
 */

export type Promotion = {
  id: string;
  kind: "sale" | "buy_get";
  title: string;
  product_id: string | null;
  category: string | null;
  sale_price_cents: number | null;
  buy_qty: number | null;
  get_qty: number | null;
  ends_on: string;
  members_only: boolean;
  featured: boolean;
};

export type Bundle = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  photo_path: string | null;
  price_cents: number;
  regular_cents: number;
  members_only: boolean;
  ends_on: string | null;
  available: number;
  items: { product_id: string; name: string; emoji: string | null; quantity: number }[];
};

export type Deals = { promotions: Promotion[]; bundles: Bundle[] };

export type ShownPrice = {
  /** What this shopper pays per item right now. */
  price: number;
  /** The normal price, if a sale makes it lower. */
  regular: number | null;
  /** Name of the sale that's applied (e.g. "Takis Tuesday"). */
  saleTitle: string | null;
  /** A cheaper members-only price this shopper could get by signing in. */
  memberPrice: number | null;
  /** "Buy 2, get 1 free" style deals that cover this product. */
  buyGets: Promotion[];
};

/** The price and deal labels for one product, for a member or not. */
export function shownPrice(
  product: { id: string; category: string; price_cents: number },
  promotions: Promotion[],
  isMember: boolean,
): ShownPrice {
  const sales = promotions.filter(
    (p) => p.kind === "sale" && p.product_id === product.id && (p.sale_price_cents ?? Infinity) < product.price_cents,
  );
  const usable = sales.filter((p) => isMember || !p.members_only);
  const best = usable.reduce<Promotion | null>(
    (a, p) => (!a || p.sale_price_cents! < a.sale_price_cents! ? p : a),
    null,
  );
  const price = best ? best.sale_price_cents! : product.price_cents;

  // A members-only price that's better than what a guest pays: tempt them to sign in.
  const memberOnly = isMember
    ? null
    : sales.filter((p) => p.members_only).reduce<number | null>((m, p) => Math.min(m ?? Infinity, p.sale_price_cents!), null);

  return {
    price,
    regular: best ? product.price_cents : null,
    saleTitle: best?.title ?? null,
    memberPrice: memberOnly !== null && memberOnly < price ? memberOnly : null,
    buyGets: promotions.filter(
      (p) =>
        p.kind === "buy_get" &&
        (p.product_id === product.id || p.category === product.category) &&
        (isMember || !p.members_only),
    ),
  };
}

/** "Buy 2, get 1 free" */
export function buyGetLabel(p: Promotion) {
  return `Buy ${p.buy_qty}, get ${p.get_qty} free`;
}

/** Can this shopper buy this bundle? */
export function bundleOpenTo(bundle: Bundle, isMember: boolean) {
  return isMember || !bundle.members_only;
}
