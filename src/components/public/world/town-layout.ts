/*
 * The neighbourhood around the store: a grid of roads with houses along
 * them, sidewalks, street lights, trees and bushes, people out walking and
 * cars driving round the blocks. Plain numbers only (no 3D code), worked
 * out once. Everything is placed with a seeded random, so the town looks the
 * same every visit.
 *
 * The store sits in the middle block, its parking lot opening onto the main
 * road (Avenue z = 58) by a short driveway.
 *
 * East of the town (+x) is the city (city-plan.ts, city-layout.ts): the
 * town's avenues run on into it, and its own grid of streets is part of the
 * same road network here, so sidewalks, street lights, people and traffic
 * all carry on into the city.
 */

import { CITY_AVENUES_Z, CITY_KEEP_CLEAR, CITY_SPAN_X, CITY_SPAN_Z, CITY_STREETS_X, inCity } from "./city-plan";
import { seededRandom } from "./paint";
import { AIRPORT_ROAD, CLUB_ROAD, CROSS_DRIVE, ESTATE_DRIVE, ESTATES_ROAD, JAIL_ROAD, WORLD_BOUNDS } from "./world-map";

export const ROAD_HALF = 8; // half a road's width (two lanes)
export const LANE = 4; // how far a lane's middle is from the road's middle
export const WALK_W = 4; // sidewalk width
export const CURB = ROAD_HALF + WALK_W; // road middle → outer edge of the sidewalk

/** Roads running left–right (x) at these z, and front–back (z) at these x. */
export const AVENUES_Z = [-110, 58, 220];
export const STREETS_X = [-360, -160, 160, 360];
/** The avenues start at the town's west edge and run on through the city. */
export const AVENUE_SPAN: [number, number] = [-430, CITY_SPAN_X[1]];
export const STREET_SPAN: [number, number] = [-290, 410];

/** The town's own land (houses and meadow trees stay in here). */
const TOWN = { minX: -470, maxX: 470, minZ: -320, maxZ: 440 };
/** How far you can walk or drive: the whole map (world-map.ts). */
export const WORLD = WORLD_BOUNDS;

/** The store's block: no houses here (store, lot, trees). */
const STORE_BLOCK = { minX: -78, maxX: 78, minZ: -80, maxZ: 46 };
/** The driveway from the parking lot out to the main road. */
export const DRIVEWAY = { x: 0, halfWidth: 8, fromZ: 34, toZ: AVENUES_Z[1] - ROAD_HALF };

export type Road = { axis: "x" | "z"; at: number; from: number; to: number };

export const ROADS: Road[] = [
  ...AVENUES_Z.map((z) => ({ axis: "x" as const, at: z, from: AVENUE_SPAN[0], to: AVENUE_SPAN[1] })),
  ...STREETS_X.map((x) => ({ axis: "z" as const, at: x, from: STREET_SPAN[0], to: STREET_SPAN[1] })),
  // The city's own grid.
  ...CITY_AVENUES_Z.map((z) => ({ axis: "x" as const, at: z, from: CITY_SPAN_X[0], to: CITY_SPAN_X[1] })),
  ...CITY_STREETS_X.map((x) => ({ axis: "z" as const, at: x, from: CITY_SPAN_Z[0], to: CITY_SPAN_Z[1] })),
  // The main road carries on west to the airport and east to the jail, and a road runs south to Crescent Heights.
  { axis: "x", at: AIRPORT_ROAD.z, from: AIRPORT_ROAD.from, to: AIRPORT_ROAD.to },
  { axis: "x", at: JAIL_ROAD.z, from: JAIL_ROAD.from, to: JAIL_ROAD.to },
  { axis: "z", at: ESTATES_ROAD.x, from: ESTATES_ROAD.from, to: ESTATE_DRIVE.to },
  { axis: "x", at: CROSS_DRIVE.z, from: CROSS_DRIVE.from, to: CROSS_DRIVE.to },
  // The road to the golf club.
  { axis: "z", at: CLUB_ROAD.x, from: CLUB_ROAD.from, to: CLUB_ROAD.to },
];

/** Where the roads running the other way cross this one (including at its very ends). */
function crossingsOf(road: Road) {
  return ROADS.filter((r) => r.axis !== road.axis && r.at >= road.from && r.at <= road.to && road.at >= r.from && road.at <= r.to)
    .map((r) => r.at)
    .filter((at, i, all) => all.indexOf(at) === i)
    .sort((a, b) => a - b);
}

export const INTERSECTIONS = ROADS.filter((r) => r.axis === "z").flatMap((street) => crossingsOf(street).map((z) => ({ x: street.at, z })));

/** A road split into the pieces between crossings (for sidewalks, houses and lamps). */
export function pieces(road: Road, gap: number) {
  const out: [number, number][] = [];
  let start = road.from;
  for (const c of crossingsOf(road)) {
    if (c - gap > start) out.push([start, c - gap]);
    start = Math.max(start, c + gap);
  }
  if (road.to > start) out.push([start, road.to]);
  return out;
}

/** Turn "distance along a road, distance to one side" into x, z. */
export function onRoad(road: Road, along: number, side: number) {
  return road.axis === "x" ? { x: along, z: road.at + side } : { x: road.at + side, z: along };
}

export const inStoreBlock = (x: number, z: number, pad = 0) =>
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

// Real house paint, roofing and door colours (not toy pastels). Same number of each as before, so every house keeps its place.
const WALLS = ["#e6dccb", "#b9c3c7", "#d3c2a8", "#a9b39b", "#ecebe6", "#c8bfae", "#d9c9a3", "#8d9aa3", "#c4a98a"];
const ROOFS = ["#4a3f3a", "#3d4045", "#4b5056", "#5a463a", "#2f3236", "#5f5a52"];
const DOORS = ["#7a2a22", "#2a3f4d", "#2f4a3a", "#b08a3e", "#4a3426", "#e9e6df"];

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
          if (inStoreBlock(x, z, 10) || inCity(x, z, 20)) continue;
          if (x < TOWN.minX + 20 || x > TOWN.maxX - 20 || z < TOWN.minZ + 20 || z > TOWN.maxZ - 20) continue;
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

/** Each house's style (town.tsx): 0 classic gable, 1 two-storey, 2 modern flat roof, 3 hip-roofed bungalow, 4 farmhouse with a porch. */
export const houseStyle = (i: number) => (i * 7 + (i >> 2)) % 5;
/** Some houses have a garage on the side. */
export const hasGarage = (i: number) => i % 4 === 1 && houseStyle(i) !== 3;

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
export function onPavement(x: number, z: number, pad: number) {
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
    const x = TOWN.minX + rand() * (TOWN.maxX - TOWN.minX);
    const z = TOWN.minZ + rand() * (TOWN.maxZ - TOWN.minZ);
    if (onPavement(x, z, 6) || inStoreBlock(x, z, 8) || inCity(x, z, 6)) continue;
    if (Math.abs(x) < DRIVEWAY.halfWidth + 4 && z > DRIVEWAY.fromZ - 4 && z < DRIVEWAY.toZ + 4) continue;
    if (HOUSES.some((h) => Math.hypot(h.x - x, h.z - z) < Math.max(h.w, h.d) / 2 + 5)) continue;
    list.push({ x, z, s: 0.8 + rand() * 0.9 });
  }
  // Little round trees along the city's sidewalks, at the outer edge.
  for (const s of SIDEWALKS) {
    const mx = (s.x1 + s.x2) / 2;
    const mz = (s.z1 + s.z2) / 2;
    if (!inCity(mx, mz)) continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const dx = (s.x2 - s.x1) / len;
    const dz = (s.z2 - s.z1) / len;
    // Which way is "away from the road"? (Sidewalks run beside their road, so look at the nearest one.)
    const road = ROADS.find((r) => Math.abs((r.axis === "x" ? mz : mx) - r.at) < CURB && (r.axis === "x" ? dx !== 0 : dz !== 0));
    const out = road ? Math.sign((road.axis === "x" ? mz : mx) - road.at) : 1;
    for (let d = 10; d < len - 8; d += 26) {
      const x = s.x1 + dx * d + (dz !== 0 ? out * 1.35 : 0);
      const z = s.z1 + dz * d + (dx !== 0 ? out * 1.35 : 0);
      if (CITY_KEEP_CLEAR.some((c) => Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd)) continue;
      list.push({ x, z, s: 0.62 + rand() * 0.18 });
    }
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
/** How many people walk the city's sidewalks (it's busy there). */
export const CITY_WALKERS = 130;

export const WALKERS = (() => {
  const rand = seededRandom(99);
  const shirts = ["#e5483b", "#13a8a0", "#ffd21f", "#3d6fe0", "#ff7a2a", "#7b5cd6", "#2d6a4f", "#f2f0ea", "#c0392b", "#ff8fab", "#1d4f91", "#90be6d"];
  const pants = ["#2b2f36", "#3a4150", "#5b3a26", "#1f3b5c", "#6b6b6b"];
  const skins = ["#f1c7a5", "#e0ac83", "#c98e62", "#8d5a3b", "#5e3a24"];
  const long = SIDEWALKS.filter((s) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 40);
  const town = long.filter((s) => !inCity((s.x1 + s.x2) / 2, (s.z1 + s.z2) / 2));
  const city = long.filter((s) => inCity((s.x1 + s.x2) / 2, (s.z1 + s.z2) / 2));
  return Array.from({ length: 36 + CITY_WALKERS }, (_, i) => {
    const list = i < 36 ? town : city;
    const strip = list[Math.floor(rand() * list.length)];
    return {
      strip,
      start: rand(),
      speed: 2.2 + rand() * 1.4,
      shirt: shirts[Math.floor(rand() * shirts.length)],
      pants: pants[Math.floor(rand() * pants.length)],
      skin: skins[Math.floor(rand() * skins.length)],
      // About as tall as you (3.1 to 3.5 units: a real-size person next to the cars).
      height: 0.78 + rand() * 0.1,
    };
  });
})();

/**
 * Traffic: cars drive round the blocks, keeping to the right. Each loop is a
 * block's outline pulled in to the near lane, with rounded corners, as
 * points about 1 unit apart.
 */
export const LOOPS: { x: number; z: number }[][] = (() => {
  const loops: { x: number; z: number }[][] = [];
  blockLoops(STREETS_X, AVENUES_Z, loops);
  // And round every block of the city.
  blockLoops(CITY_STREETS_X, [...CITY_AVENUES_Z, ...AVENUES_Z].sort((a, b) => a - b), loops);
  return loops;
})();
/** How many of LOOPS go round the town's blocks (the rest are the city's). */
export const TOWN_LOOPS = (STREETS_X.length - 1) * (AVENUES_Z.length - 1);

function blockLoops(xs: number[], zs: number[], loops: { x: number; z: number }[][]) {
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
}

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
for (const [i, h] of HOUSES.entries()) {
  const box = { x: h.x, z: h.z, hw: h.w / 2, hd: h.d / 2, turn: h.turn };
  addTo(h.x, h.z, Math.max(h.w, h.d), (c) => c.boxes.push(box));
  if (hasGarage(i)) {
    // The garage on its right-hand side (town.tsx draws it).
    const lx = h.w / 2 + 3.4;
    const lz = h.d / 2 - 3.6;
    const g = { x: h.x + lx * Math.cos(h.turn) + lz * Math.sin(h.turn), z: h.z - lx * Math.sin(h.turn) + lz * Math.cos(h.turn), hw: 3.3, hd: 3.5, turn: h.turn };
    addTo(g.x, g.z, 6, (c) => c.boxes.push(g));
  }
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
