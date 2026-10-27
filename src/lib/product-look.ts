/**
 * How a product looks in the 3D showcase: its shape, its color, and what
 * falls around it ("particles").
 *
 * For now this is worked out from the product's name and description
 * ("Strawberry Fanta" → red can with strawberries). If a guess is wrong,
 * add a word to the KEYWORDS list below, or give the product a better
 * description. (A later update will let staff pick these on the Products page.)
 */

export type Shape = "can" | "bottle" | "carton" | "pouch";
export type Particle = "strawberry" | "cherry" | "grape" | "orange" | "lemon" | "lime" | "ice" | "bubble" | "leaf" | "cocoa" | "chili";

/**
 * Which photo backdrop goes behind the drink in the showcase
 * (the files are in public/showcase/bg/). Drinks without one get a plain color.
 */
export type Scene =
  | "strawberry"
  | "cherry"
  | "grape"
  | "orange"
  | "lemon"
  | "lime"
  | "blue"
  | "tea"
  | "cola"
  | "water"
  | "chocolate"
  | "tropical";

export type ProductLook = {
  shape: Shape;
  /** Background and label color. */
  color: string;
  /** A second color for stripes and highlights. */
  accent: string;
  /** The drawn pieces (used when the photos can't load). */
  particle: Particle;
  /** The photo backdrop and falling photo pieces, if there's a matching set. */
  scene?: Scene;
};

// First match wins, so put specific words ("blue raspberry") before general ones ("blue").
const KEYWORDS: [RegExp, Omit<ProductLook, "shape">][] = [
  [/strawberr|pink/i, { color: "#d81f3c", accent: "#ff8fa0", particle: "strawberry", scene: "strawberry" }],
  [/cherry|fruit punch|punch|watermelon|code red|powerade red/i, { color: "#c4122f", accent: "#ff6b7d", particle: "cherry", scene: "cherry" }],
  [/grape|purple/i, { color: "#5a2a91", accent: "#b48be6", particle: "grape", scene: "grape" }],
  [/tropical|mango|pineapple|passion/i, { color: "#f2a11f", accent: "#ffe08a", particle: "orange", scene: "tropical" }],
  [/orange|tangerine|mandarin/i, { color: "#f27a00", accent: "#ffc163", particle: "orange", scene: "orange" }],
  [/lemon|lemonade/i, { color: "#e3c21b", accent: "#fff3a3", particle: "lemon", scene: "lemon" }],
  [/voltage/i, { color: "#1c5fd6", accent: "#8fc0ff", particle: "ice", scene: "blue" }],
  [/lime|sprite|7.?up|mountain dew|green apple/i, { color: "#3f9e3a", accent: "#b9ec7c", particle: "lime", scene: "lime" }],
  [/blue|berry|raspberry|cool blue/i, { color: "#1c5fd6", accent: "#8fc0ff", particle: "ice", scene: "blue" }],
  [/tea|matcha|mint/i, { color: "#4f9a5f", accent: "#c7ecb2", particle: "leaf", scene: "tea" }],
  [/chocolate|cocoa|coffee|mocha|yoo-?hoo|frappuccino/i, { color: "#6b3a22", accent: "#d9a27a", particle: "cocoa", scene: "chocolate" }],
  [/cola|coke|pepsi|root beer|dr\.? ?pepper/i, { color: "#4b1610", accent: "#d14a3a", particle: "bubble", scene: "cola" }],
  [/water|sparkling|seltzer/i, { color: "#2f8fd1", accent: "#bfe6ff", particle: "bubble", scene: "water" }],
  [/hot|fuego|spicy|flamin/i, { color: "#c3281b", accent: "#ff9b4a", particle: "chili" }],
  [/energy|red bull|monster|celsius/i, { color: "#1c5fd6", accent: "#8fc0ff", particle: "ice", scene: "blue" }],
];

// Products with no keyword match still get a pleasant color, picked by name.
const FALLBACKS: Omit<ProductLook, "shape">[] = [
  { color: "#0f8a84", accent: "#8ee3dc", particle: "bubble" },
  { color: "#e8551c", accent: "#ffb27f", particle: "bubble" },
  { color: "#2a4bbf", accent: "#9fb4ff", particle: "ice" },
  { color: "#9b2f6e", accent: "#f2a3cf", particle: "bubble" },
];

function guessShape(text: string): Shape {
  if (/milk|carton|juice box/i.test(text)) return "carton";
  if (/capri|pouch/i.test(text)) return "pouch";
  if (/bottle|water|gatorade|powerade|body ?armor|\b(16\.9|20|24|32) ?oz\b/i.test(text) && !/\bcan\b/i.test(text)) return "bottle";
  return "can";
}

export function productLook(product: { name: string; description?: string | null }): ProductLook {
  const text = `${product.name} ${product.description ?? ""}`;
  const match = KEYWORDS.find(([re]) => re.test(text))?.[1];
  let hash = 0;
  for (const ch of product.name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { shape: guessShape(text), ...(match ?? FALLBACKS[hash % FALLBACKS.length]) };
}

/** Lighten (amount > 0) or darken (amount < 0) a hex color. */
export function shade(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, amount > 0 ? c + (255 - c) * amount : c * (1 + amount))));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** White text on dark colors, near-black on light ones. */
export function readableOn(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#111111" : "#ffffff";
}

// ---- Brands (for the fridge shelves) ------------------------------------------

// Known drink brands, written how they should show on the shelf tag.
const BRANDS: [RegExp, string][] = [
  [/fanta/i, "Fanta"],
  [/coca.?cola|\bcoke\b/i, "Coca-Cola"],
  [/sprite/i, "Sprite"],
  [/pepsi/i, "Pepsi"],
  [/dr\.? ?pepper/i, "Dr Pepper"],
  [/mountain dew|mtn dew/i, "Mountain Dew"],
  [/gatorade/i, "Gatorade"],
  [/powerade/i, "Powerade"],
  [/body ?armor/i, "BodyArmor"],
  [/prime/i, "Prime"],
  [/arizona/i, "AriZona"],
  [/snapple/i, "Snapple"],
  [/lipton/i, "Lipton"],
  [/capri ?sun/i, "Capri Sun"],
  [/minute maid/i, "Minute Maid"],
  [/kool.?aid/i, "Kool-Aid"],
  [/starbucks|frappuccino/i, "Starbucks"],
  [/yoo-?hoo/i, "Yoo-hoo"],
  [/red bull/i, "Red Bull"],
  [/monster/i, "Monster"],
  [/celsius/i, "Celsius"],
  [/water|smartwater|dasani|aquafina|fiji/i, "Water"],
  [/milk/i, "Milk"],
];

// Words that describe a flavor or size, not the brand.
const NOT_BRAND =
  /\b(strawberry|cherry|grape|orange|lemon|lemonade|lime|blue|raspberry|berry|fruit|punch|tropical|mango|peach|pineapple|watermelon|green|apple|mixed|cool|zero|diet|sugar|free|original|classic|flavor(ed)?|\d+(\.\d+)?\s?(fl\.? )?oz|can|bottle|pack)\b/gi;

/**
 * Which shelf a drink goes on: "Strawberry Fanta" → "Fanta".
 * Known brands are matched by name; otherwise flavor words are removed.
 */
export function drinkBrand(name: string) {
  const known = BRANDS.find(([re]) => re.test(name))?.[1];
  if (known) return known;
  const rest = name.replace(NOT_BRAND, " ").replace(/\s+/g, " ").trim();
  return rest || name;
}
