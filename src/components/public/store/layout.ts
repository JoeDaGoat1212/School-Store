import { UNITS, type ItemModel, type UnitKey } from "./catalog";

/*
 * Where everything stands in the 3D store. Plain numbers only (no 3D code),
 * so it's quick to test and the page can use it before the 3D has loaded.
 *
 * Sizes are "scene units": a soda can is 0.68 tall.
 *
 * Each unit (fridge, snack shelf, candy rack) has its own coordinates: x goes
 * left to right across its front, y is up from the floor (or the counter top
 * for candy), and z = 0 is its front edge, with the shelves going back into -z.
 * ROOM below then stands each unit somewhere in the room.
 */

export type StoreItem = {
  id: string;
  name: string;
  /** Price as shown on the tag, e.g. "$2.00". */
  label: string;
  soldOut: boolean;
  unit: UnitKey;
  section: string;
  model: ItemModel;
  /** Colour for things without a photo (their box, while photos load). */
  color: string;
};

/** One copy of a product on a shelf. */
export type Placement = { id: string; x: number; y: number; z: number; tilt: number; turn: number };
/** A price tag on a shelf edge, under one product's copies. */
export type Tag = { id: string; x: number; y: number; z: number; width: number };
export type Bay = { key: string; title: string; x: number; width: number };

export type UnitLayout = {
  key: UnitKey;
  title: string;
  sign: string;
  width: number;
  /** Top of the shelves (the sign sits above). */
  height: number;
  depth: number;
  /** Height of the lowest shelf. */
  base: number;
  rowHeight: number;
  /** Shelf heights (bottom first) and, for tiered racks, how far back each one is. */
  shelves: { y: number; z: number }[];
  bays: Bay[];
  placements: Placement[];
  tags: Tag[];
};

type Spec = {
  perShelf: number;
  minShelves: number;
  /** How many copies side by side we aim for. */
  facings: number;
  base: number;
  depth: number;
  frame: number;
  gap: number;
  headroom: number;
  /** How far in from the front edge the first row stands. */
  inset: number;
  rowDepth: number;
  rows: (id: string) => number;
  /** Lean back (radians): bags and bars stand leaning against the row behind. */
  tilt: number;
  /** Tiered racks: each shelf up is this much further back. */
  tierStep: number;
};

/** A number from a product id that's always the same for that product. */
function hashOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Counter top height (the candy rack stands on it). */
export const COUNTER_HEIGHT = 3.1;

const SPECS: Record<UnitKey, Spec> = {
  drinks: { perShelf: 2, minShelves: 5, facings: 3, base: 0.75, depth: 1.3, frame: 0.16, gap: 0.035, headroom: 0.24, inset: 0.24, rowDepth: 0.34, rows: (id) => 1 + (hashOf(id) % 3), tilt: 0, tierStep: 0 },
  snacks: { perShelf: 2, minShelves: 4, facings: 2, base: 0.5, depth: 1.05, frame: 0.12, gap: 0.06, headroom: 0.28, inset: 0.2, rowDepth: 0.26, rows: (id) => 2 + (hashOf(id) % 2), tilt: -0.16, tierStep: 0 },
  candy: { perShelf: 3, minShelves: 3, facings: 1, base: COUNTER_HEIGHT + 0.12, depth: 1.5, frame: 0.1, gap: 0.05, headroom: 0.16, inset: 0.12, rowDepth: 0.12, rows: () => 3, tilt: -0.3, tierStep: 0.42 },
};

/** Width taken by one copy of an item (plus the gap to the next). */
function stepOf(model: ItemModel, gap: number) {
  return model.width + gap;
}

/** How tall an item stands once it leans back. */
function standingHeight(model: ItemModel, tilt: number) {
  return model.height * Math.cos(tilt) + (model.type === "pack" ? model.puff : 0);
}

export function unitLayout(key: UnitKey, items: StoreItem[]): UnitLayout | null {
  const unit = UNITS.find((u) => u.key === key)!;
  const spec = SPECS[key];
  const mine = items.filter((i) => i.unit === key);
  if (mine.length === 0) return null;

  // Sections in their set order, skipping empty ones.
  const sections = unit.sections.map((s) => ({ ...s, items: mine.filter((i) => i.section === s.key) })).filter((s) => s.items.length > 0);
  const shelfCount = Math.max(spec.minShelves, ...sections.map((s) => Math.ceil(s.items.length / spec.perShelf)));
  const rowHeight = Math.max(...mine.map((i) => standingHeight(i.model, spec.tilt))) + spec.headroom;
  const widest = Math.max(...mine.map((i) => stepOf(i.model, spec.gap)));
  // Every bay the same width (like matching fridge doors), wide enough for the target number of copies.
  const bayWidth = spec.perShelf * widest * spec.facings + 0.16;

  const width = sections.length * bayWidth + (sections.length + 1) * spec.frame;
  const shelves = Array.from({ length: shelfCount }, (_, k) => ({ y: spec.base + k * rowHeight, z: -k * spec.tierStep }));
  const height = spec.base + shelfCount * rowHeight;

  const bays: Bay[] = [];
  const placements: Placement[] = [];
  const tags: Tag[] = [];

  sections.forEach((section, b) => {
    const left = -width / 2 + spec.frame + b * (bayWidth + spec.frame);
    bays.push({ key: section.key, title: section.title, x: left + bayWidth / 2, width: bayWidth });
    const share = bayWidth / spec.perShelf;

    shelves.forEach((shelf, row) => {
      // Fill every spot on every shelf, repeating the section's products if there are fewer than spots.
      // Top shelf first, so the first products sit at eye level.
      const top = shelfCount - 1 - row;
      for (let k = 0; k < spec.perShelf; k++) {
        const item = section.items[(top * spec.perShelf + k) % section.items.length];
        const step = stepOf(item.model, spec.gap);
        const facings = Math.max(1, Math.floor((share - 0.04) / step));
        const cx = left + share * (k + 0.5);
        const rows = item.soldOut ? 1 : spec.rows(item.id);
        const start = cx - ((facings - 1) * step) / 2;
        const lift = standingHeight(item.model, spec.tilt) / 2;
        for (let r = 0; r < rows; r++) {
          for (let f = 0; f < facings; f++) {
            const h = hashOf(`${item.id}${row}${r}${f}`);
            placements.push({
              id: item.id,
              x: start + f * step,
              y: shelf.y + lift,
              z: shelf.z - spec.inset - r * spec.rowDepth,
              tilt: spec.tilt,
              // A small random-looking turn so the rows don't look copy-pasted.
              turn: ((h % 9) - 4) * (item.model.type === "lathe" ? 0.06 : 0.015),
            });
          }
        }
        tags.push({ id: item.id, x: cx, y: shelf.y, z: shelf.z, width: share - 0.08 });
      }
    });
  });

  return { key, title: unit.title, sign: unit.sign, width, height, depth: spec.depth + (shelfCount - 1) * spec.tierStep, base: spec.base, rowHeight, shelves, bays, placements, tags };
}

// ---- The room ---------------------------------------------------------------------

/** Room size: x from -ROOM.halfWidth to +halfWidth, z from back (-) to front (+), floor at y = 0. */
export const ROOM = { halfWidth: 10, back: -7.5, front: 9, height: 10.5 };

/**
 * Where each unit stands: the fridge along the left wall, the snack shelf on
 * the back wall, the counter with the candy rack front right, angled toward you.
 * `turn` is the rotation round the vertical axis (0 = facing the front of the room).
 */
export function placeUnits(units: Partial<Record<UnitKey, UnitLayout | null>>) {
  const fridge = units.drinks;
  const shelf = units.snacks;
  return {
    drinks: fridge ? { x: -ROOM.halfWidth + fridge.depth + 0.15, z: ROOM.back + 1.3 + fridge.width / 2, turn: Math.PI / 2 } : null,
    snacks: shelf ? { x: 0.9, z: ROOM.back + shelf.depth + 0.15, turn: 0 } : null,
    candy: units.candy ? { x: 6.1, z: 1.4, turn: -0.75 } : null,
  };
}

export type View = { key: string; center: [number, number, number]; size: [number, number]; turn: number; origin: [number, number, number] };

/** The camera targets for a unit and for each of its bays (center and size in the unit's own coordinates). */
export function unitViews(layout: UnitLayout, place: { x: number; z: number; turn: number }): View[] {
  const origin: [number, number, number] = [place.x, 0, place.z];
  const mid = (layout.base + layout.height) / 2;
  const tierBack = layout.shelves[layout.shelves.length - 1].z / 2;
  return [
    { key: layout.key, center: [0, mid + 0.4, tierBack], size: [layout.width, layout.height - layout.base + 1.6], turn: place.turn, origin },
    ...layout.bays.map((b) => ({
      key: `${layout.key}:${b.key}`,
      center: [b.x, mid, tierBack] as [number, number, number],
      size: [b.width + 0.3, layout.height - layout.base + 0.5] as [number, number],
      turn: place.turn,
      origin,
    })),
  ];
}
