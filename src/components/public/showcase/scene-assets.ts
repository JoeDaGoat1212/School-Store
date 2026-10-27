import type { Scene } from "@/lib/product-look";

/*
 * The photo set for each flavor in the drinks showcase. The pictures live in
 * public/showcase/ and were made once with an image generator (see
 * docs/visual-assets-plan.md); nothing here downloads until that flavor shows.
 *
 * - bg/<scene>.webp: the wide backdrop (fruit and splashes on the edges,
 *   empty in the middle for the 3D drink).
 * - edge: the backdrop's own color, so the page around the photo blends in.
 * - pieces: cut-out photos (public/showcase/pieces/) that fall around the drink.
 *   "size" makes a piece bigger or smaller than normal (1 = normal).
 */

export type Piece = { name: string; size?: number };

export const SCENES: Record<Scene, { edge: string; pieces: Piece[] }> = {
  strawberry: { edge: "#ce142c", pieces: [{ name: "strawberry" }, { name: "strawberry-half" }] },
  cherry: { edge: "#c00e24", pieces: [{ name: "cherries", size: 1.2 }, { name: "cherry" }] },
  grape: { edge: "#6534ad", pieces: [{ name: "grapes", size: 1.2 }, { name: "grape", size: 0.55 }] },
  orange: { edge: "#fc8d20", pieces: [{ name: "orange-wheel" }, { name: "orange-wedge" }] },
  lemon: { edge: "#f8d03e", pieces: [{ name: "lemon-wheel" }, { name: "lemon-wedge" }] },
  lime: { edge: "#54a440", pieces: [{ name: "lime-wheel" }, { name: "lime-wedge" }, { name: "droplets", size: 0.5 }] },
  blue: { edge: "#1978ec", pieces: [{ name: "ice-cube" }, { name: "crushed-ice" }, { name: "snowflake", size: 0.8 }] },
  tea: { edge: "#60a266", pieces: [{ name: "mint" }, { name: "ice-cube", size: 0.8 }] },
  cola: { edge: "#4b0d04", pieces: [{ name: "ice-cube" }, { name: "bubble-stream", size: 1.3 }, { name: "droplets", size: 0.5 }] },
  water: { edge: "#57b9f3", pieces: [{ name: "droplets", size: 0.6 }, { name: "ice-cube", size: 0.9 }, { name: "splash-drop" }] },
  chocolate: { edge: "#7f4225", pieces: [{ name: "chocolate" }] },
  tropical: { edge: "#fbad36", pieces: [{ name: "pineapple" }, { name: "mango" }, { name: "passion-fruit" }] },
};

export const backdropUrl = (scene: Scene) => `/showcase/bg/${scene}.webp`;
export const pieceUrl = (name: string) => `/showcase/pieces/${name}.webp`;
