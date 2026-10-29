/*
 * The city: skyscrapers on every block, a park with a fountain, zebra
 * crossings, and two places you can walk into, the bank and the jewelry
 * shop. Plain numbers only (no 3D code), worked out once with a seeded
 * random, so the skyline is the same every visit. city.tsx draws the
 * skyscrapers and the park, city-sites.tsx the bank and the jewelry shop.
 *
 * The roads, sidewalks, street lights, people and traffic are part of the
 * town's road network (town-layout.ts), which runs on into the city.
 */

import { BANK_SITE, CITY_AVENUES_Z, CITY_STREETS_X, JEWELRY_SITE, inCity } from "./city-plan";
import { seededRandom } from "./paint";
import { DEALERSHIP, REALTOR, SHOPS } from "./world-map";
import { AVENUES_Z, CURB, INTERSECTIONS, ROAD_HALF, ROADS, hitsBox, type Box, type Circle } from "./town-layout";

/** Every avenue that crosses the city, in order (the city's own and the town's). */
export const CITY_ROWS = [...CITY_AVENUES_Z, ...AVENUES_Z].sort((a, b) => a - b);

/** A block between roads, out to the outer edge of its sidewalks. */
export type Block = { i: number; j: number; x0: number; x1: number; z0: number; z1: number };

export const CITY_BLOCKS: Block[] = CITY_STREETS_X.slice(0, -1).flatMap((x, i) =>
  CITY_ROWS.slice(0, -1).map((z, j) => ({ i, j, x0: x + CURB, x1: CITY_STREETS_X[i + 1] - CURB, z0: z + CURB, z1: CITY_ROWS[j + 1] - CURB })),
);

const isBlock = (b: Block, i: number, z0: number) => b.i === i && CITY_ROWS[b.j] === z0;
/** The bank's block, the jewelry shop's (across the main road from it), the park, and the block with the tallest tower. */
const BANK_BLOCK = (b: Block) => isBlock(b, 0, -26);
const PARK_BLOCK = (b: Block) => isBlock(b, 2, -26);
const GIANT_BLOCK = (b: Block) => isBlock(b, 2, 58);

export const PARK = (() => {
  const b = CITY_BLOCKS.find(PARK_BLOCK)!;
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 };
})();

// ---- Turning the bank's and the jewelry shop's own measurements into world ones ------------

/** A building's own frame: lx left–right, lz out the front (so its rooms are at lz < 0). */
export type Site = { x: number; z: number; turn: number };
export const BANK: Site = { x: BANK_SITE.x, z: BANK_SITE.front, turn: 0 };
export const JEWELRY: Site = { x: JEWELRY_SITE.x, z: JEWELRY_SITE.front, turn: Math.PI };

export function toWorld(s: Site, lx: number, lz: number) {
  const c = Math.cos(s.turn);
  const n = Math.sin(s.turn);
  return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c };
}
export function toLocal(s: Site, x: number, z: number) {
  const dx = x - s.x;
  const dz = z - s.z;
  const c = Math.cos(s.turn);
  const n = Math.sin(s.turn);
  return { lx: dx * c - dz * n, lz: dx * n + dz * c };
}
/** A box given in a building's own frame (left, right, back, front), as a world box. */
function siteBox(s: Site, lx0: number, lx1: number, lz0: number, lz1: number): Box {
  const p = toWorld(s, (lx0 + lx1) / 2, (lz0 + lz1) / 2);
  return { x: p.x, z: p.z, hw: (lx1 - lx0) / 2, hd: (lz1 - lz0) / 2, turn: s.turn };
}

/** The bank, in its own frame (lx: -22…22, lz: 0 at the front wall back to -34). */
export const BANK_PLAN = {
  halfW: BANK_SITE.w / 2,
  depth: BANK_SITE.d,
  height: BANK_SITE.h,
  wall: 1,
  doorHalf: 4,
  doorHeight: 8,
  /** The teller counter: across the hall, with gaps at both ends to walk round. */
  counter: { lx0: -12, lx1: 12, lz0: -15, lz1: -13, height: 1.45 },
  tellers: [-7, 0, 7],
  tellerZ: -16.6,
  /** The wall in front of the vault, with the big round door in the middle. */
  vaultWall: { lz0: -23, lz1: -22 },
  vaultDoor: { radius: 4.6, y: 5.1 },
  pillars: [
    [-16, -7],
    [16, -7],
  ] as [number, number][],
  /** The columns along the front porch. */
  columns: [-16, -11, -6, 6, 11, 16],
  columnZ: 2.6,
  steps: { halfW: 14, depth: 4.6 },
};
/** The jewelry shop, in its own frame (lx: -15…15, lz: 0 at the front wall back to -24). */
export const JEWELRY_PLAN = {
  halfW: JEWELRY_SITE.w / 2,
  depth: JEWELRY_SITE.d,
  height: JEWELRY_SITE.h,
  wall: 0.8,
  doorHalf: 3,
  doorHeight: 5.9,
  /** Glass cases along both side walls (their middles, facing the middle of the shop). */
  cases: [-6, -12, -18].flatMap((lz) => [-11.6, 11.6].map((lx) => ({ lx, lz }))),
  caseSize: { across: 2.2, along: 3.4, base: 2.0, top: 3.5 },
  /** The Big Rock: a giant diamond on a stand in the middle, behind sweeping lasers. */
  rock: { lx: 0, lz: -14 },
  lasers: { lx0: -3.6, lx1: 3.6, lz0: -17.6, lz1: -10.4 },
  counter: { lx0: -6, lx1: 6, lz0: -21, lz1: -19.6, height: 2 },
  keeperZ: -22,
};

/** Is (x, z) inside the bank's walls? Inside its vault? */
export function inBank(x: number, z: number) {
  const { lx, lz } = toLocal(BANK, x, z);
  return Math.abs(lx) < BANK_PLAN.halfW - BANK_PLAN.wall && lz < -BANK_PLAN.wall * 0.5 && lz > -BANK_PLAN.depth + BANK_PLAN.wall;
}
export function inVault(x: number, z: number) {
  const { lx, lz } = toLocal(BANK, x, z);
  return Math.abs(lx) < BANK_PLAN.halfW && lz < BANK_PLAN.vaultWall.lz0 + 0.5 && lz > -BANK_PLAN.depth;
}
export function inJewelry(x: number, z: number) {
  const { lx, lz } = toLocal(JEWELRY, x, z);
  return Math.abs(lx) < JEWELRY_PLAN.halfW - JEWELRY_PLAN.wall && lz < -JEWELRY_PLAN.wall * 0.5 && lz > -JEWELRY_PLAN.depth + JEWELRY_PLAN.wall;
}
/** Is (x, z) between the jewelry shop's lasers? */
export function inLasers(x: number, z: number) {
  const { lx, lz } = toLocal(JEWELRY, x, z);
  const L = JEWELRY_PLAN.lasers;
  return lx > L.lx0 && lx < L.lx1 && lz > L.lz0 && lz < L.lz1;
}

// ---- Things to rob ----------------------------------------------------------------------------

export type SiteKey = "bank" | "jewelry";
export type LootKind = "gold" | "cash" | "case" | "rock";
export type Loot = {
  id: string;
  site: SiteKey;
  kind: LootKind;
  /** World position, and how close you need to be. */
  x: number;
  z: number;
  reach: number;
  /** In the building's own frame (for drawing it inside the building's group). */
  lx: number;
  lz: number;
  value: number;
  label: string;
};

const bankLoot = (id: string, kind: LootKind, lx: number, lz: number, value: number, label: string): Loot => ({ id, site: "bank", kind, lx, lz, ...toWorld(BANK, lx, lz), reach: 4.2, value, label });

export const LOOT: Loot[] = [
  bankLoot("gold-l", "gold", -13, -29.5, 120000, "gold bars"),
  bankLoot("gold-r", "gold", 13, -29.5, 120000, "gold bars"),
  bankLoot("cash-1", "cash", -6, -31, 45000, "stacks of cash"),
  bankLoot("cash-2", "cash", 0, -31, 45000, "stacks of cash"),
  bankLoot("cash-3", "cash", 6, -31, 45000, "stacks of cash"),
  bankLoot("cart-l", "cash", -14.5, -25.6, 28500, "a cash cart"),
  bankLoot("cart-r", "cash", 14.5, -25.6, 28500, "a cash cart"),
  ...JEWELRY_PLAN.cases.map((c, i): Loot => ({
    id: `case-${i}`,
    site: "jewelry",
    kind: "case",
    lx: c.lx,
    lz: c.lz,
    ...toWorld(JEWELRY, c.lx * 0.78, c.lz),
    reach: 3.4,
    value: [18500, 22000, 15750, 26500, 19900, 24250][i],
    label: ["diamond rings", "a ruby necklace", "gold watches", "sapphire earrings", "pearl necklaces", "emerald rings"][i],
  })),
  {
    id: "rock",
    site: "jewelry",
    kind: "rock",
    lx: JEWELRY_PLAN.rock.lx,
    lz: JEWELRY_PLAN.rock.lz,
    ...toWorld(JEWELRY, JEWELRY_PLAN.rock.lx, JEWELRY_PLAN.rock.lz),
    reach: 3.6,
    value: 250000,
    label: "the Big Rock",
  },
];

/** The middle of each building (for how far you've got away). */
export const SITE_CENTER: Record<SiteKey, { x: number; z: number }> = {
  bank: toWorld(BANK, 0, -BANK_PLAN.depth / 2),
  jewelry: toWorld(JEWELRY, 0, -JEWELRY_PLAN.depth / 2),
};

/** Getaway cars: parked beside the bank, ready to go (they join the town's drivable cars). */
export const CITY_PARKED: { color: string; x: number; z: number; turn: number }[] = [
  { color: "#2f3338", x: 583, z: 15, turn: Math.PI },
  { color: "#5aa84a", x: 591, z: 28, turn: Math.PI },
  { color: "#ff8fab", x: 655, z: 22, turn: Math.PI },
];

// ---- Skyscrapers ------------------------------------------------------------------------------

export type Crown = "spire" | "antenna" | "pyramid" | "water" | "dome" | "flat" | "helipad";
/** One box of a tower (towers step in as they go up). */
export type Tier = { x: number; z: number; w: number; d: number; y0: number; y1: number };
export type Tower = {
  tiers: Tier[];
  color: string;
  /** Window pattern: 0 = grid of windows, 1 = glass bands, 2 = tall strips. */
  style: 0 | 1 | 2;
  crown: Crown;
  /** The lobby doors (on the side facing the nearest road). */
  door: { x: number; z: number; turn: number };
};

const TOWER_COLORS = ["#ff8fab", "#7ec8e3", "#ffd166", "#9bdeac", "#c3aed6", "#ff9f68", "#8ecae6", "#f4a261", "#b8c0ff", "#f7aef8", "#6fd3c2", "#ffb4a2", "#a0c4ff", "#fdffb6"];
const CROWNS: Crown[] = ["antenna", "pyramid", "water", "dome", "flat", "helipad", "antenna", "water"];
const CITY_MIDDLE = { x: 840, z: 60 };

function tower(rand: () => number, x0: number, x1: number, z0: number, z1: number, h: number, block: Block, forced?: Partial<Tower>): Tower {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const n = h > 260 ? 4 : h > 150 ? 3 : h > 85 ? 2 : 1;
  const steps = n === 4 ? [0.42, 0.66, 0.86, 1] : n === 3 ? [0.55, 0.8, 1] : n === 2 ? [0.68, 1] : [1];
  const tiers = steps.map((top, k) => {
    const inset = k * (0.1 + rand() * 0.05);
    return { x: cx, z: cz, w: w * (1 - inset * 1.4), d: d * (1 - inset * 1.4), y0: k === 0 ? 0 : h * steps[k - 1], y1: h * top };
  });
  // The lobby faces whichever road is nearest.
  const toEdge = [
    { gap: cz - block.z0, door: { x: cx, z: z0, turn: Math.PI } },
    { gap: block.z1 - cz, door: { x: cx, z: z1, turn: 0 } },
    { gap: cx - block.x0, door: { x: x0, z: cz, turn: -Math.PI / 2 } },
    { gap: block.x1 - cx, door: { x: x1, z: cz, turn: Math.PI / 2 } },
  ].sort((a, b) => a.gap - b.gap)[0];
  return {
    tiers,
    color: TOWER_COLORS[Math.floor(rand() * TOWER_COLORS.length)],
    style: Math.floor(rand() * 3) as 0 | 1 | 2,
    crown: h > 230 ? "spire" : CROWNS[Math.floor(rand() * CROWNS.length)],
    door: toEdge.door,
    ...forced,
  };
}

/** Ground the skyscrapers keep off: the jewelry shop, the shops, the dealership and the realtor (with room round them). */
const RESERVED = (() => {
  const pad = 6;
  const site = (x: number, z: number, turn: number, w: number, d: number) => {
    // The building goes back `d` from its front at z (into -z if it faces +z, into +z if it faces -z).
    const back = Math.cos(turn) > 0 ? z - d : z + d;
    return { x0: x - w / 2 - pad, x1: x + w / 2 + pad, z0: Math.min(z, back) - pad, z1: Math.max(z, back) + pad };
  };
  return [
    site(JEWELRY_SITE.x, JEWELRY_SITE.front, Math.PI, JEWELRY_SITE.w, JEWELRY_SITE.d),
    ...Object.values(SHOPS).map((p) => site(p.x, p.z, p.turn, p.w, p.d)),
    site(DEALERSHIP.x, DEALERSHIP.z, DEALERSHIP.turn, DEALERSHIP.w, DEALERSHIP.d),
    { x0: DEALERSHIP.lot.x0 - pad, x1: DEALERSHIP.lot.x1 + pad, z0: DEALERSHIP.lot.z0 - pad, z1: DEALERSHIP.lot.z1 + pad },
    site(REALTOR.x, REALTOR.z, REALTOR.turn, REALTOR.w, REALTOR.d),
  ];
})();

export const TOWERS: Tower[] = (() => {
  const rand = seededRandom(4242);
  const list: Tower[] = [];
  for (const b of CITY_BLOCKS) {
    if (BANK_BLOCK(b) || PARK_BLOCK(b)) continue;
    // Leave a strip of pavement between the sidewalk and the buildings.
    const bx0 = b.x0 + 4;
    const bx1 = b.x1 - 4;
    const bz0 = b.z0 + 4;
    const bz1 = b.z1 - 4;
    const tall = (x: number, z: number) => {
      const near = Math.max(0, 1 - Math.hypot(x - CITY_MIDDLE.x, z - CITY_MIDDLE.z) / 430);
      return 55 + rand() * 55 + near * near * 210;
    };
    if (GIANT_BLOCK(b)) {
      // The tallest tower in town, filling its whole block.
      list.push(tower(rand, bx0 + 8, bx1 - 8, bz0 + 3, bz1 - 3, 360, b, { color: "#7ec8e3", style: 1, crown: "spire" }));
      continue;
    }
    const w = bx1 - bx0;
    const d = bz1 - bz0;
    const cols = w / 3 >= 26 && rand() < 0.5 ? 3 : 2;
    const rows = d >= 70 ? 2 : 1;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const gap = 5 + rand() * 4;
        const x0 = bx0 + (w * c) / cols + (c ? gap / 2 : 0);
        const x1 = bx0 + (w * (c + 1)) / cols - (c < cols - 1 ? gap / 2 : 0);
        const z0 = bz0 + (d * r) / rows + (r ? gap / 2 : 0);
        const z1 = bz0 + (d * (r + 1)) / rows - (r < rows - 1 ? gap / 2 : 0);
        // A little smaller than its lot, and not always centred.
        const sx = (x1 - x0) * (0.08 + rand() * 0.12);
        const sz = (z1 - z0) * (0.08 + rand() * 0.12);
        const ox = (rand() - 0.5) * sx;
        const oz = (rand() - 0.5) * sz;
        // Not on top of the shops, the dealership, the realtor or the jewelry shop.
        if (RESERVED.some((q) => x1 > q.x0 && x0 < q.x1 && z1 > q.z0 && z0 < q.z1)) continue;
        list.push(tower(rand, x0 + sx / 2 + ox, x1 - sx / 2 + ox, z0 + sz / 2 + oz, z1 - sz / 2 + oz, tall((x0 + x1) / 2, (z0 + z1) / 2), b));
      }
  }
  return list;
})();

/** Every tier of every tower, by window style (each style is drawn in one go). */
export const TIERS_BY_STYLE: { tier: Tier; color: string }[][] = [0, 1, 2].map((style) =>
  TOWERS.filter((t) => t.style === style).flatMap((t) => t.tiers.map((tier) => ({ tier, color: t.color }))),
);
export const ALL_TIERS = TOWERS.flatMap((t) => t.tiers);
/** Where each tower's crown sits (the top of its last tier). */
export const CROWN_SPOTS = TOWERS.map((t) => {
  const top = t.tiers[t.tiers.length - 1];
  return { crown: t.crown, x: top.x, z: top.z, y: top.y1, w: top.w, d: top.d, color: t.color };
});

/** Blocks that get paved (all but the park). */
export const PAVED_BLOCKS = CITY_BLOCKS.filter((b) => !PARK_BLOCK(b));

// ---- The park ---------------------------------------------------------------------------------

export const PARK_TREES: { x: number; z: number; s: number }[] = (() => {
  const rand = seededRandom(808);
  const list: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 400 && list.length < 26; i++) {
    const x = PARK.x0 + 4 + rand() * (PARK.x1 - PARK.x0 - 8);
    const z = PARK.z0 + 4 + rand() * (PARK.z1 - PARK.z0 - 8);
    // Not on the paths or the fountain, not on top of each other.
    if (Math.abs(x - PARK.cx) < 5 || Math.abs(z - PARK.cz) < 5 || Math.hypot(x - PARK.cx, z - PARK.cz) < 16) continue;
    if (list.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
    list.push({ x, z, s: 0.9 + rand() * 0.5 });
  }
  return list;
})();
export const FOUNTAIN = { x: PARK.cx, z: PARK.cz, r: 7.5 };
/** Benches round the fountain, facing it. */
export const BENCHES = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  return { x: FOUNTAIN.x + Math.cos(a) * 12, z: FOUNTAIN.z + Math.sin(a) * 12, turn: Math.atan2(-Math.cos(a), -Math.sin(a)) };
});

// ---- Zebra crossings ----------------------------------------------------------------------------

/** Each white stripe of the zebra crossings, just outside every city crossroads. */
export const ZEBRA: { x: number; z: number; alongX: boolean }[] = (() => {
  const out: { x: number; z: number; alongX: boolean }[] = [];
  const roadGoes = (axis: "x" | "z", at: number, from: number, dir: 1 | -1) =>
    ROADS.some((r) => r.axis === axis && r.at === at && (dir > 0 ? r.to > from + 1 : r.from < from - 1));
  for (const p of INTERSECTIONS) {
    if (!inCity(p.x, p.z)) continue;
    const off = ROAD_HALF + 2.4;
    for (const dir of [1, -1] as const) {
      // Crossing the avenue (stripes lie along x, spread across z).
      if (roadGoes("x", p.z, p.x, dir)) for (let k = -3.5; k <= 3.5; k++) out.push({ x: p.x + dir * off, z: p.z + k * 2, alongX: true });
      if (roadGoes("z", p.x, p.z, dir)) for (let k = -3.5; k <= 3.5; k++) out.push({ x: p.x + k * 2, z: p.z + dir * off, alongX: false });
    }
  }
  return out;
})();

// ---- Things to bump into ------------------------------------------------------------------------

const bankWalls = (() => {
  const P = BANK_PLAN;
  const t = P.wall;
  const boxes: Box[] = [
    siteBox(BANK, -P.halfW, -P.doorHalf, -t, 0),
    siteBox(BANK, P.doorHalf, P.halfW, -t, 0),
    siteBox(BANK, -P.halfW, -P.halfW + t, -P.depth, 0),
    siteBox(BANK, P.halfW - t, P.halfW, -P.depth, 0),
    siteBox(BANK, -P.halfW, P.halfW, -P.depth, -P.depth + t),
    siteBox(BANK, P.counter.lx0, P.counter.lx1, P.counter.lz0, P.counter.lz1),
    siteBox(BANK, -P.halfW, -P.vaultDoor.radius - 0.4, P.vaultWall.lz0, P.vaultWall.lz1),
    siteBox(BANK, P.vaultDoor.radius + 0.4, P.halfW, P.vaultWall.lz0, P.vaultWall.lz1),
    ...P.pillars.map(([lx, lz]) => siteBox(BANK, lx - 1, lx + 1, lz - 1, lz + 1)),
  ];
  const circles: Circle[] = P.columns.map((lx) => ({ ...toWorld(BANK, lx, P.columnZ), r: 0.9 }));
  return { boxes, circles };
})();

/** The bank's vault door, while it's shut. */
export const VAULT_DOOR_BOX = siteBox(BANK, -BANK_PLAN.vaultDoor.radius - 0.4, BANK_PLAN.vaultDoor.radius + 0.4, BANK_PLAN.vaultWall.lz0 - 0.4, BANK_PLAN.vaultWall.lz1);
/** Each pile of loot in the vault, while it's still there. */
export const LOOT_BOXES: Record<string, Box> = Object.fromEntries(
  LOOT.filter((l) => l.site === "bank").map((l) => [l.id, siteBox(BANK, l.lx - 1.7, l.lx + 1.7, l.lz - 1.3, l.lz + 1.3)]),
);

const jewelryWalls = (() => {
  const P = JEWELRY_PLAN;
  const t = P.wall;
  const S = P.caseSize;
  const boxes: Box[] = [
    siteBox(JEWELRY, -P.halfW, -P.doorHalf, -t, 0),
    siteBox(JEWELRY, P.doorHalf, P.halfW, -t, 0),
    siteBox(JEWELRY, -P.halfW, -P.halfW + t, -P.depth, 0),
    siteBox(JEWELRY, P.halfW - t, P.halfW, -P.depth, 0),
    siteBox(JEWELRY, -P.halfW, P.halfW, -P.depth, -P.depth + t),
    siteBox(JEWELRY, P.counter.lx0, P.counter.lx1, P.counter.lz0, P.counter.lz1),
    ...P.cases.map((c) => siteBox(JEWELRY, c.lx - S.across / 2, c.lx + S.across / 2, c.lz - S.along / 2, c.lz + S.along / 2)),
  ];
  const circles: Circle[] = [{ ...toWorld(JEWELRY, P.rock.lx, P.rock.lz), r: 1.5 }];
  return { boxes, circles };
})();

/** Obstacles, in a grid of 40-unit cells, so only nearby ones get checked. */
const CELL = 40;
const grid = new Map<string, { boxes: Box[]; circles: Circle[] }>();
function addTo(x: number, z: number, reach: number, add: (c: { boxes: Box[]; circles: Circle[] }) => void) {
  for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
    for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
      const key = `${i},${j}`;
      if (!grid.has(key)) grid.set(key, { boxes: [], circles: [] });
      add(grid.get(key)!);
    }
}
const addBox = (b: Box) => addTo(b.x, b.z, Math.hypot(b.hw, b.hd), (c) => c.boxes.push(b));
const addCircle = (o: Circle) => addTo(o.x, o.z, o.r, (c) => c.circles.push(o));
for (const t of TOWERS) {
  const base = t.tiers[0];
  addBox({ x: base.x, z: base.z, hw: base.w / 2, hd: base.d / 2, turn: 0 });
}
for (const b of [...bankWalls.boxes, ...jewelryWalls.boxes]) addBox(b);
for (const c of [...bankWalls.circles, ...jewelryWalls.circles]) addCircle(c);
for (const t of PARK_TREES) addCircle({ x: t.x, z: t.z, r: 0.55 * t.s });
addCircle(FOUNTAIN);
for (const b of BENCHES) addBox({ x: b.x, z: b.z, hw: 1.6, hd: 0.6, turn: b.turn });

const EMPTY = { boxes: [] as Box[], circles: [] as Circle[] };
/** The skyscrapers, walls, counters, cases and park things near a spot. */
export function cityObstaclesNear(x: number, z: number) {
  return grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? EMPTY;
}
/** Does a circle at (x, z) touch any of them? */
export function hitsCity(x: number, z: number, r: number) {
  const near = cityObstaclesNear(x, z);
  for (const b of near.boxes) if (hitsBox(x, z, r, b)) return true;
  for (const c of near.circles) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
  return false;
}
