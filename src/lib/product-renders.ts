/*
 * The product pictures drawn from the 3D models (public/products/3d/).
 * Made by scripts/render-products.mjs; run it again after adding a model.
 */

import { slugOf } from "@/lib/slug";

const RENDERS = new Set([
  "airhead",
  "beef-jerky",
  "bottled-water",
  "chips",
  "coke",
  "cookies",
  "cosmic-brownie",
  "diet-coke",
  "dr-pepper",
  "fanta-orange",
  "fanta-pineapple",
  "fanta-strawberry",
  "hershey",
  "honey-buns",
  "mountain-dew",
  "mountain-dew-baja-blast",
  "mountain-dew-code-red",
  "mountain-dew-tropical-citrus",
  "mountain-dew-voltage",
  "nerd-gummy-clusters-blue",
  "powerade-blue",
  "powerade-pink",
  "powerade-purple",
  "powerade-red",
  "ramen-cup-beef",
  "ramen-cup-chicken",
  "skittles",
  "snickers",
  "sour-patch-kids",
  "sour-punch-straws-red",
  "sour-skittles",
  "sprite",
  "starbucks-coffee-vanilla",
  "twix",
  "white-monster",
  "yoohoo",
  "zebra-cake",
]);

/** The 3D picture for a product, if it has one (matched by name, like the models are). */
export function productRenderUrl(name: string): string | null {
  const slug = slugOf(name);
  return RENDERS.has(slug) ? `/products/3d/${slug}.webp` : null;
}
