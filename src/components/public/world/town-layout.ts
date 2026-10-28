/*
 * The neighbourhood around the store: a grid of roads with houses along
 * them, sidewalks, street lights, trees and bushes, people out walking and
 * cars driving round the blocks. Plain numbers only (no 3D code), worked
 * out once. Everything is placed with a seeded random, so the town looks the
 * same every visit.
 *
 * The store sits in the middle block, its parking lot opening onto the main
 * road (Avenue z = 58) by a short driveway.
 */

import { seededRandom } from "./paint";

export const ROAD_HALF = 8; // half a road's width (two lanes)
export const LANE = 4; // how far a lane's middle is from the road's middle
export const WALK_W = 4; // sidewalk width
export const CURB = ROAD_HALF + WALK_W; // road middle → outer edge of the sidewalk

/** Roads running left–right (x) at these z, and front–back (z) at these x. */
export const AVENUES_Z = [-110, 58, 220];
export const STREETS_X = [-360, -160, 160, 360];
export const AVENUE_SPAN: [number, number] = [-430, 430];
export const STREET_SPAN: [number, number] = [-290, 410];

/** How far you can walk or drive. */
export const WORLD = { minX: -470, maxX: 470, minZ: -320, maxZ: 440 };

/** The store's block: no houses here (store, lot, trees). */
const STORE_BLOCK = { minX: -78, maxX: 78, minZ: -80, maxZ: 46 };
/** The driveway from the parking lot out to the main road. */
export const DRIVEWAY = { x: 0, halfWidth: 8, fromZ: 34, toZ: AVENUES_Z[1] - ROAD_HALF };

export type Road = { axis: "x" | "z"; at: number; from: number; to: number };

export const ROADS: Road[] = [
  ...AVENUES_Z.map((z) => ({ axis: "x" as const, at: z, from: AVENUE_SPAN[0], to: AVENUE_SPAN[1] })),
  ...STREETS_X.map((x) => ({ axis: "z" as const, at: x, from: STREET_SPAN[0], to: STREET_SPAN[1] })),
];

export const INTERSECTIONS = STREETS_X.flatMap((x) => AVENUES_Z.map((z) => ({ x, z })));

/** A road split into the pieces between crossings (for sidewalks, houses and lamps). */
function pieces(road: Road, gap: number) {
  const crossings = (road.axis === "x" ? STREETS_X : AVENUES_Z).filter((c) => c > road.from && c < road.to).sort((a, b) => a - b);
  const out: [number, number][] = [];
  let start = road.from;
  for (const c of crossings) {
    if (c - gap > start) out.push([start, c - gap]);
    start = c + gap;
  }
  if (road.to > start) out.push([start, road.to]);
  return out;
}

/** Turn "distance along a road, distance to one side" into x, z. */
function onRoad(road: Road, along: number, side: number) {
  return road.axis === "x" ? { x: along, z: road.at + side } : { x: road.at + side, z: along };
}

const inStoreBlock = (x: number, z: number, pad = 0) =>
  x > STORE_BLOCK.minX - pad && x < STORE_BLOCK.maxX + pad && z > STORE_BLOCK.minZ - pad && z < STORE_BLOCK.maxZ + pad;

// ---- Sidewalks -------------------------------------------------------------------------------

/** Each sidewalk strip: its middle line from (x1, z1) to (x2, z2). */
export type Strip = { x1: number; z1: number; x2: number; z2: number };

export const SIDEWALKS: Strip[] = ROADS.flatMap((road) =>
  pieces(road, CURB).flatMap(([a, b]) =>
    [-1, 1].flatMap((side) => {
      const off = side * (ROAD_HALF + WALK_W / 2);
      // Leave a gap where the store's driveway crosses the main road's sidewalk.
      if (road.axis === "x" && road.at === AVENUES_Z[1] && side === -1 && a < DRIVEWAY.halfWidth && b > -DRIVEWAY.halfWidth) {
        return [
          [a, -DRIVEWAY.halfWidth],
          [DRIVEWAY.halfWidth, b],
        ].map(([p, q]) => {
          const s = onRoad(road, p, off);
          const e = onRoad(road, q, off);
          return { x1: s.x, z1: s.z, x2: e.x, z2: e.z };
        });
      }
      const s = onRoad(road, a, off);
      const e = onRoad(road, b, off);
      return [{ x1: s.x, z1: s.z, x2: e.x, z2: e.z }];
    }),
  ),
);

// ---- Houses ------------------------------------------------------------------------------------

export type House = {
  x: number;
  z: number;
  /** Which way the front door faces (0 = +z). */
  turn: number;
  w: number;
  d: number;
  h: number;
  roofH: number;
  wall: string;
  roof: string;
  door: string;
  chimney: boolean;
  /** How far the front of the house is from the sidewalk (for the path to the door). */
  setback: number;
};

const WALLS = ["#f4e3c1", "#cfe3ef", "#f6c9b6", "#dbe8c9", "#f2f0ea", "#e8d1ea", "#fbe7a1", "#c9d9f2", "#e7c7a1"];
const ROOFS = ["#7a3b2e", "#4b5563", "#2f4858", "#8b5a3c", "#5b3a5e", "#3f6b4f"];
const DOORS = ["#c0392b", "#1f6f8b", "#2d6a4f", "#f2c14e", "#5c4033", "#ffffff"];

export const HOUSES: House[] = (() => {
  const rand = seededRandom(1234);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const list: House[] = [];
  const SPACING = 34;
  for (const road of ROADS) {
    for (const [a, b] of pieces(road, CURB + 18)) {
      for (let along = a + 14; along <= b - 14; along += SPACING) {
        for (const side of [-1, 1]) {
          const w = 12 + rand() * 4;
          const d = 11 + rand() * 3;
          const setback = 7 + rand() * 4;
          const off = side * (CURB + setback + d / 2);
          const { x, z } = onRoad(road, along + (rand() - 0.5) * 4, off);
          if (inStoreBlock(x, z, 10)) continue;
          if (x < WORLD.minX + 20 || x > WORLD.maxX - 20 || z < WORLD.minZ + 20 || z > WORLD.maxZ - 20) continue;
          // Not on top of another road, or a house from the road round the corner.
          if (ROADS.some((r) => r !== road && Math.abs((r.axis === "x" ? z : x) - r.at) < CURB + d && (r.axis === "x" ? x : z) > r.from && (r.axis === "x" ? x : z) < r.to)) continue;
          if (list.some((h) => Math.hypot(h.x - x, h.z - z) < 24)) continue;
          // Front faces the road.
          const turn = road.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
          list.push({
            x,
            z,
            turn,
            w,
            d,
            h: 6.5 + rand() * 2.5,
            roofH: 3 + rand() * 1.6,
            wall: pick(WALLS),
            roof: pick(ROOFS),
            door: pick(DOORS),
            chimney: rand() < 0.55,
            setback,
          });
        }
      }
    }
  }
  return list;
})();

// ---- Street lights -----------------------------------------------------------------------------

/** A street light: where it stands and which way its arm reaches (toward the road). */
export const STREET_LIGHTS: { x: number; z: number; turn: number }[] = ROADS.flatMap((road) =>
  pieces(road, CURB + 4).flatMap(([a, b]) => {
    const out: { x: number; z: number; turn: number }[] = [];
    let i = 0;
    for (let along = a + 8; along <= b - 8; along += 46, i++) {
      const side = i % 2 ? 1 : -1;
      const { x, z } = onRoad(road, along, side * (ROAD_HALF + 0.9));
      if (inStoreBlock(x, z, -6) || (Math.abs(x) < DRIVEWAY.halfWidth + 4 && Math.abs(z - AVENUES_Z[1]) < 14)) continue;
      // The arm points back over the road.
      const turn = road.axis === "x" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      out.push({ x, z, turn });
    }
    return out;
  }),
);

// ---- Trees and bushes ---------------------------------------------------------------------------

/** Is this spot on a road or sidewalk? */
function onPavement(x: number, z: number, pad: number) {
  return ROADS.some((r) => {
    const across = r.axis === "x" ? z : x;
    const along = r.axis === "x" ? x : z;
    return Math.abs(across - r.at) < CURB + pad && along > r.from - pad && along < r.to + pad;
  });
}

export const TOWN_TREES: { x: number; z: number; s: number }[] = (() => {
  const rand = seededRandom(77);
  const list: { x: number; z: number; s: number }[] = [];
  // One beside or behind most houses.
  for (const h of HOUSES) {
    if (rand() < 0.25) continue;
    const lx = (rand() < 0.5 ? -1 : 1) * (h.w / 2 + 3 + rand() * 3);
    const lz = -h.d / 2 + rand() * h.d;
    const x = h.x + lx * Math.cos(h.turn) + lz * Math.sin(h.turn);
    const z = h.z - lx * Math.sin(h.turn) + lz * Math.cos(h.turn);
    if (!onPavement(x, z, 3)) list.push({ x, z, s: 0.8 + rand() * 0.6 });
  }
  // Clumps in the open grass.
  for (let i = 0; i < 900 && list.length < 520; i++) {
    const x = WORLD.minX + rand() * (WORLD.maxX - WORLD.minX);
    const z = WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ);
    if (onPavement(x, z, 6) || inStoreBlock(x, z, 8)) continue;
    if (Math.abs(x) < DRIVEWAY.halfWidth + 4 && z > DRIVEWAY.fromZ - 4 && z < DRIVEWAY.toZ + 4) continue;
    if (HOUSES.some((h) => Math.hypot(h.x - x, h.z - z) < Math.max(h.w, h.d) / 2 + 5)) continue;
    list.push({ x, z, s: 0.8 + rand() * 0.9 });
  }
  return list;
})();

/** Bushes along the front of each house. */
export const BUSHES: { x: number; z: number; s: number }[] = HOUSES.flatMap((h, i) => {
  const rand = seededRandom(500 + i);
  const count = 2 + Math.floor(rand() * 3);
  return Array.from({ length: count }, (_, k) => {
    // Along the front, either side of the door.
    const lx = (k % 2 ? 1 : -1) * (1.8 + (k >> 1) * 2.4 + rand());
    const lz = h.d / 2 + 0.9;
    return { x: h.x + lx * Math.cos(h.turn) + lz * Math.sin(h.turn), z: h.z - lx * Math.sin(h.turn) + lz * Math.cos(h.turn), s: 0.7 + rand() * 0.5 };
  });
});

// ---- People and traffic -----------------------------------------------------------------------

/** People walk up and down sidewalk strips. */
export const WALKERS = (() => {
  const rand = seededRandom(99);
  const shirts = ["#e5483b", "#13a8a0", "#ffd21f", "#3d6fe0", "#ff7a2a", "#7b5cd6", "#2d6a4f", "#f2f0ea", "#c0392b"];
  const pants = ["#2b2f36", "#3a4150", "#5b3a26", "#1f3b5c", "#6b6b6b"];
  const skins = ["#f1c7a5", "#e0ac83", "#c98e62", "#8d5a3b", "#5e3a24"];
  const long = SIDEWALKS.filter((s) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 40);
  return Array.from({ length: 36 }, () => {
    const strip = long[Math.floor(rand() * long.length)];
    return {
      strip,
      start: rand(),
      speed: 2.2 + rand() * 1.4,
      shirt: shirts[Math.floor(rand() * shirts.length)],
      pants: pants[Math.floor(rand() * pants.length)],
      skin: skins[Math.floor(rand() * skins.length)],
      height: 0.9 + rand() * 0.2,
    };
  });
})();

/**
 * Traffic: cars drive round the blocks, keeping to the right. Each loop is a
 * block's outline pulled in to the near lane, with rounded corners, as
 * points about 1 unit apart.
 */
export const LOOPS: { x: number; z: number }[][] = (() => {
  const xs = STREETS_X;
  const zs = [AVENUES_Z[0], AVENUES_Z[1], AVENUES_Z[2]];
  const loops: { x: number; z: number }[][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      // The lane on this block's side of each road.
      const x0 = xs[i] + LANE;
      const x1 = xs[i + 1] - LANE;
      const z0 = zs[j] + LANE;
      const z1 = zs[j + 1] - LANE;
      const r = 9; // corner radius
      // Clockwise seen from above (+x right, +z down): along z0 to +x, down x1 to +z, back along z1, up x0.
      const corners = [
        { cx: x1 - r, cz: z0 + r, a0: -Math.PI / 2 },
        { cx: x1 - r, cz: z1 - r, a0: 0 },
        { cx: x0 + r, cz: z1 - r, a0: Math.PI / 2 },
        { cx: x0 + r, cz: z0 + r, a0: Math.PI },
      ];
      const pts: { x: number; z: number }[] = [];
      const line = (ax: number, az: number, bx: number, bz: number) => {
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
        for (let k = 0; k < n; k++) pts.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n });
      };
      const arc = (c: (typeof corners)[number]) => {
        const n = 14;
        for (let k = 0; k < n; k++) {
          const a = c.a0 + (k / n) * (Math.PI / 2);
          pts.push({ x: c.cx + Math.cos(a) * r, z: c.cz + Math.sin(a) * r });
        }
      };
      line(x0 + r, z0, x1 - r, z0);
      arc(corners[0]);
      line(x1, z0 + r, x1, z1 - r);
      arc(corners[1]);
      line(x1 - r, z1, x0 + r, z1);
      arc(corners[2]);
      line(x0, z1 - r, x0, z0 + r);
      arc(corners[3]);
      loops.push(pts);
    }
  }
  return loops;
})();

// ---- Things to bump into ------------------------------------------------------------------------

export type Box = { x: number; z: number; hw: number; hd: number; turn: number };
export type Circle = { x: number; z: number; r: number };

/** Obstacles, in a grid of 40-unit cells, so only nearby ones get checked. */
const CELL = 40;
const grid = new Map<string, { boxes: Box[]; circles: Circle[] }>();
const cellOf = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
function addTo(x: number, z: number, reach: number, add: (c: { boxes: Box[]; circles: Circle[] }) => void) {
  for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
    for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
      const key = `${i},${j}`;
      if (!grid.has(key)) grid.set(key, { boxes: [], circles: [] });
      add(grid.get(key)!);
    }
}
for (const h of HOUSES) {
  const box = { x: h.x, z: h.z, hw: h.w / 2, hd: h.d / 2, turn: h.turn };
  addTo(h.x, h.z, Math.max(h.w, h.d), (c) => c.boxes.push(box));
}
for (const t of TOWN_TREES) addTo(t.x, t.z, 2, (c) => c.circles.push({ x: t.x, z: t.z, r: 0.55 * t.s }));
for (const l of STREET_LIGHTS) addTo(l.x, l.z, 1, (c) => c.circles.push({ x: l.x, z: l.z, r: 0.3 }));

const EMPTY = { boxes: [] as Box[], circles: [] as Circle[] };
/** The houses, trees and street lights near a spot. */
export function townObstaclesNear(x: number, z: number) {
  return grid.get(cellOf(x, z)) ?? EMPTY;
}

/** Is a circle at (x, z) touching a (possibly turned) box? */
export function hitsBox(x: number, z: number, r: number, b: Box) {
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * Math.cos(b.turn) - dz * Math.sin(b.turn);
  const lz = dx * Math.sin(b.turn) + dz * Math.cos(b.turn);
  return Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hd + r;
}
