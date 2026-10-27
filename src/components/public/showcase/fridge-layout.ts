import type { SceneItem } from "./drink-scene";
import { drinkWidth } from "./drink-models";

/*
 * Where every drink goes in the fridge. Kept apart from the 3D code so the
 * page can size the fridge before the (big) 3D code has downloaded.
 *
 * Sizes are in "scene units": a drink model is 1.9 units tall and is shrunk
 * to SCALE on the shelves.
 *
 * Each shelf holds a few flavors. A flavor is repeated side by side until its
 * share of the shelf is full ("facings", like a real store fridge), and stands
 * 1, 2 or 3 rows deep.
 */

export const SCALE = 0.36;
/** Height of one shelf (a shrunk drink is 0.68 tall, plus room to lift on hover). */
export const ROW = 0.9;
export const DEPTH = 1.25;
export const FRAME = 0.14;
/** Space between two drinks side by side. */
const GAP = 0.03;
/** How far apart the rows front to back are. */
export const ROW_DEPTH = 0.37;

export type FridgeFlavor = { item: SceneItem; label: string; soldOut: boolean };

export type PlacedFlavor = FridgeFlavor & {
  /** Middle of the flavor's group, left/right. */
  x: number;
  /** Width of the group (the price tag fits under it). */
  width: number;
  facings: number;
  rows: number;
  /** Distance between two copies side by side. */
  step: number;
};

export type FridgeLayout = {
  shelves: PlacedFlavor[][];
  /** Inside width and height of the fridge. */
  width: number;
  height: number;
};

/** 1, 2 or 3 rows deep: the same for a drink every time (worked out from its id). */
function rowsFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return 1 + (h % 3);
}

export function fridgeLayout(flavors: FridgeFlavor[], perShelf: number, width: number): FridgeLayout {
  const shelves: PlacedFlavor[][] = [];
  for (let i = 0; i < flavors.length; i += perShelf) {
    const group = flavors.slice(i, i + perShelf);
    const share = width / group.length;
    shelves.push(
      group.map((f, k) => {
        const step = drinkWidth(f.item.name, f.item.look.shape) * SCALE + GAP;
        const facings = Math.max(1, Math.floor((share - 0.04) / step));
        return {
          ...f,
          x: -width / 2 + share * (k + 0.5),
          width: share,
          facings,
          // A sold-out drink is down to its last row on display.
          rows: f.soldOut ? 1 : rowsFor(f.item.id),
          step,
        };
      }),
    );
  }
  return { shelves, width, height: shelves.length * ROW + 0.3 };
}

/** The fridge's height divided by its width (frame included), for sizing the page around it. */
export function fridgeRatio(layout: FridgeLayout) {
  // A little extra height: the camera looks down slightly, which needs room top and bottom.
  return ((layout.height + FRAME * 4) / (layout.width + FRAME * 2)) * 1.07;
}
