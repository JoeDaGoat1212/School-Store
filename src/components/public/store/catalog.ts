import { slugOf } from "@/lib/slug";
import { photoModelFor, type PhotoModel } from "../showcase/drink-models";

/*
 * What's in the 3D store, and where it goes.
 *
 * Three "units" (the buttons under the store): the drinks fridge, the snack
 * shelf and the candy rack at the counter. Each unit is split into sections
 * (a fridge door, a shelf bay...) with a sign on top.
 *
 * A product lands in a unit by its category, and in a section by its name.
 * New products just work: if no section matches, they go in the unit's last
 * section, and if there's no 3D model for them yet they show as a labelled box.
 */

export type UnitKey = "drinks" | "snacks" | "candy";

type SectionRule = { key: string; title: string; test?: RegExp; category?: RegExp };

export const UNITS: { key: UnitKey; title: string; sign: string; sections: SectionRule[] }[] = [
  {
    key: "drinks",
    title: "Drinks",
    sign: "Cold drinks",
    sections: [
      { key: "soda", title: "Soda", test: /fanta|coke|cola|pepper|sprite|dew|pepsi|soda|root beer|7.?up|crush|sunkist|jarritos/i },
      { key: "sports", title: "Sports drinks", test: /powerade|gatorade|body ?armor|prime|electrolyte|vitamin/i },
      { key: "more", title: "Energy + more" },
    ],
  },
  {
    key: "snacks",
    title: "Snacks",
    sign: "Snacks",
    sections: [
      { key: "chips", title: "Chips + jerky", test: /chip|cheeto|dorito|takis|frito|lay'?s|pringle|jerky|pretzel|popcorn|cracker|goldfish|cheez/i },
      { key: "hot", title: "Hot food", category: /hot/i },
      { key: "sweets", title: "Sweet treats" },
    ],
  },
  {
    key: "candy",
    title: "Candy",
    sign: "Candy",
    sections: [
      { key: "chocolate", title: "Chocolate", test: /hershey|snickers|twix|kit ?kat|m&m|reese|chocolate|milky way|musketeer|butterfinger|crunch|kinder/i },
      { key: "sour", title: "Sour + chewy" },
    ],
  },
];

/** Which unit a product's category belongs in (null = not in the 3D store, e.g. school supplies). */
export function unitFor(category: string): UnitKey | null {
  if (/drink|beverage/i.test(category)) return "drinks";
  if (/candy|candies|sweets/i.test(category)) return "candy";
  if (/snack|hot food|food/i.test(category)) return "snacks";
  return null;
}

/** Which section of its unit a product goes in. */
export function sectionFor(unit: UnitKey, name: string, category: string) {
  const sections = UNITS.find((u) => u.key === unit)!.sections;
  const match = sections.find((s) => (s.category ? s.category.test(category) : s.test?.test(name)));
  return (match ?? sections[sections.length - 1]).key;
}

export { slugOf } from "@/lib/slug";

// ---- 3D models ------------------------------------------------------------------

/**
 * Bags, bars and wrapped snacks: a cut-out photo pushed out into a puffy shape
 * (files in public/showcase/snacks/). width = scene units (a soda can is 0.68
 * tall), puff = how far the middle bulges out on each side, aspect = height ÷ width
 * of the cut-out.
 */
export const PACKS: Record<string, { aspect: number; width: number; puff: number }> = {
  chips: { aspect: 1.037, width: 0.74, puff: 0.12 },
  "beef-jerky": { aspect: 1.03, width: 0.74, puff: 0.06 },
  cookies: { aspect: 0.645, width: 0.8, puff: 0.06 },
  "cosmic-brownie": { aspect: 0.529, width: 0.76, puff: 0.05 },
  "honey-buns": { aspect: 1.167, width: 0.62, puff: 0.07 },
  "zebra-cake": { aspect: 0.494, width: 0.8, puff: 0.06 },
  airhead: { aspect: 0.237, width: 0.6, puff: 0.025 },
  hershey: { aspect: 0.365, width: 0.78, puff: 0.03 },
  "nerd-gummy-clusters-blue": { aspect: 0.589, width: 0.72, puff: 0.07 },
  skittles: { aspect: 0.456, width: 0.72, puff: 0.05 },
  snickers: { aspect: 0.278, width: 0.76, puff: 0.04 },
  "sour-patch-kids": { aspect: 0.485, width: 0.74, puff: 0.06 },
  "sour-punch-straws-red": { aspect: 0.173, width: 0.86, puff: 0.025 },
  "sour-skittles": { aspect: 0.475, width: 0.72, puff: 0.05 },
  twix: { aspect: 0.399, width: 0.76, puff: 0.035 },
};

/** How tall a traced drink or cup stands (scene units). */
const LATHE_HEIGHT: Record<PhotoModel["kind"], number> = { can: 0.68, bottle: 0.86, cup: 0.5 };
const HEIGHT_OVERRIDE: Record<string, number> = { "white-monster": 0.8, "starbucks-coffee-vanilla": 0.78 };

export type ItemModel =
  | { type: "lathe"; slug: string; kind: PhotoModel["kind"]; clear?: boolean; profile: number[]; width: number; height: number }
  | { type: "pack"; slug: string; width: number; height: number; puff: number }
  | { type: "box"; width: number; height: number; depth: number };

export function modelFor(name: string, unit: UnitKey): ItemModel {
  const slug = slugOf(name);
  const lathe = photoModelFor(name);
  if (lathe) {
    const height = HEIGHT_OVERRIDE[slug] ?? LATHE_HEIGHT[lathe.kind];
    let widest = 0;
    for (let i = 0; i < lathe.profile.length; i += 2) widest = Math.max(widest, lathe.profile[i]);
    return { type: "lathe", slug, kind: lathe.kind, clear: lathe.clear, profile: lathe.profile, height, width: ((widest * 2) / 1.9) * height };
  }
  const pack = PACKS[slug];
  if (pack) return { type: "pack", slug, width: pack.width, height: pack.width * pack.aspect, puff: pack.puff };
  // No model yet: a plain labelled box the right sort of size for its section.
  if (unit === "drinks") return { type: "box", width: 0.36, height: 0.68, depth: 0.36 };
  if (unit === "candy") return { type: "box", width: 0.7, height: 0.3, depth: 0.08 };
  return { type: "box", width: 0.7, height: 0.8, depth: 0.2 };
}
