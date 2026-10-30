import { BASE, BASE_VALLEY, MOUNTAINS, MOUNTAIN_ROAD, WORLD_BOUNDS } from "./world-map";
import { golfHeight, inGolf } from "./golf-course";

/*
 * How high the ground is, anywhere. Almost everywhere it's flat (y = 0); to
 * the north it rises into the mountains, with a winding road cut into the
 * hillside up to the secret base's hidden valley. Plain math, no 3D code:
 * the heights are worked out once into a grid, and groundAt() reads it.
 * Everyone uses it: you walking (and jumping), cars, the camera.
 */

/** North of this (smaller z), the land starts to rise. */
export const HILLS_START = -330;

// ---- Smooth random noise ----------------------------------------------------------------------

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Several layers of noise: big shapes plus finer detail (0…1). */
function fbm(x: number, z: number) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    sum += amp * noise(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.97;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- The mountain road, as a smooth line of points every few metres ------------------------

/** The road's middle line, every ~4 units: x, z, height. */
export const ROAD_PATH: { x: number; z: number; y: number }[] = (() => {
  const pts = MOUNTAIN_ROAD;
  const out: { x: number; z: number; y: number }[] = [];
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len / 4));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom: a smooth curve through every point.
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: cr(p0[0], p1[0], p2[0], p3[0]), z: cr(p0[1], p1[1], p2[1], p3[1]), y: cr(p0[2], p1[2], p2[2], p3[2]) });
    }
  }
  const last = pts[pts.length - 1];
  out.push({ x: last[0], z: last[1], y: last[2] });
  return out;
})();
/** Half the mountain road's width. */
export const ROAD_HALF_W = 6;

const roadBox = ROAD_PATH.reduce(
  (b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), z0: Math.min(b.z0, p.z), z1: Math.max(b.z1, p.z) }),
  { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
);

/** The nearest point on the mountain road: how far away (flat distance) and the road's height there. */
export function nearestRoad(x: number, z: number) {
  let best = Infinity;
  let y = 0;
  if (x < roadBox.x0 - 40 || x > roadBox.x1 + 40 || z < roadBox.z0 - 40 || z > roadBox.z1 + 40) return { d: Infinity, y: 0 };
  for (let i = 0; i < ROAD_PATH.length - 1; i++) {
    const a = ROAD_PATH[i];
    const b = ROAD_PATH[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      y = a.y + (b.y - a.y) * t;
    }
  }
  return { d: best, y };
}

// ---- The raw shape of the land (before it's sampled into a grid) ---------------------------

/** How high the land is at (x, z), worked out from scratch (slow: use groundAt). */
export function rawHeight(x: number, z: number) {
  if (z > HILLS_START) return 0;
  const rise = smooth(HILLS_START, HILLS_START - 200, z);
  const far = smooth(-520, -1100, z);
  // Ridges: noise folded so its middle becomes sharp crests.
  const r = 1 - Math.abs(2 * fbm(x * 0.0042 + 11, z * 0.0042 - 7) - 1);
  const n = fbm(x * 0.011, z * 0.011);
  let h = rise * (18 + 190 * r ** 1.7 * (0.55 + 0.45 * n) + 140 * far * r) + rise * n * 10;
  // Fade the mountains out at the far west and east ends of the map.
  h *= smooth(MOUNTAINS.minX - 300, MOUNTAINS.minX + 100, x) * smooth(MOUNTAINS.maxX + 300, MOUNTAINS.maxX - 100, x) * 0.9 + 0.1;
  // The secret base's hidden valley: flat, at its own height.
  const dv = Math.hypot(x - BASE_VALLEY.x, z - BASE_VALLEY.z);
  const valley = smooth(BASE_VALLEY.r, BASE_VALLEY.r * 0.65, dv);
  h = h + (BASE_VALLEY.y - h) * valley;
  // The road: cut into the hillside (or built up on a bank) at its own height.
  const road = nearestRoad(x, z);
  if (road.d < 40) {
    const k = smooth(28, ROAD_HALF_W + 3, road.d);
    h = h + (road.y - h) * k;
  }
  // Under the hangar's floor (so the grass doesn't poke through it).
  // (Out past the walls by more than a cell of the land's mesh, so no slope shows inside.)
  if (Math.abs(x - BASE.x) < BASE.halfW + 14 && z < BASE.doorZ - 2 && z > BASE.doorZ - BASE.depth - 14) h = Math.min(h, BASE_VALLEY.y - 1.5);
  return h;
}

// ---- The grid -------------------------------------------------------------------------------

export const GRID = {
  x0: WORLD_BOUNDS.minX - 200,
  z0: WORLD_BOUNDS.minZ - 200,
  x1: WORLD_BOUNDS.maxX + 200,
  z1: HILLS_START + 10,
  cell: 5,
};
const NX = Math.ceil((GRID.x1 - GRID.x0) / GRID.cell) + 1;
const NZ = Math.ceil((GRID.z1 - GRID.z0) / GRID.cell) + 1;
let heights: Float32Array | null = null;

/** The height grid, worked out the first time anyone asks (about a tenth of a second). */
function grid() {
  if (heights) return heights;
  heights = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) heights[j * NX + i] = rawHeight(GRID.x0 + i * GRID.cell, GRID.z0 + j * GRID.cell);
  return heights;
}

/** Inside the secret base's tunnel and hangar the floor is flat (the mountain's above you). */
export function inBase(x: number, z: number) {
  return Math.abs(x - BASE.x) < BASE.halfW && z < BASE.doorZ + 4 && z > BASE.doorZ - BASE.depth;
}

/** How high the ground is at (x, z). Fast: reads the grid. */
export function groundAt(x: number, z: number) {
  // (South of the hills it's flat, except the golf course's rolling land.)
  if (z > HILLS_START) return inGolf(x, z) ? golfHeight(x, z) : 0;
  if (inBase(x, z)) return BASE_VALLEY.y;
  const h = grid();
  const fx = Math.min(NX - 1.001, Math.max(0, (x - GRID.x0) / GRID.cell));
  const fz = Math.min(NZ - 1.001, Math.max(0, (z - GRID.z0) / GRID.cell));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const a = h[j * NX + i];
  const b = h[j * NX + i + 1];
  const c = h[(j + 1) * NX + i];
  const d = h[(j + 1) * NX + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Which way the ground slopes at (x, z): rise per unit along x and along z. */
export function slopeAt(x: number, z: number) {
  const e = 1.5;
  return { sx: (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e), sz: (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e) };
}

// ---- The secret base's mountain ----------------------------------------------------------------

/** How wide and tall the base's entrance is. */
export const BASE_DOOR = { halfW: 15, height: 20 };
/** The door's open amount (0 shut … 1 open), moved by mountains.tsx. */
export const baseDoor = { open: 0 };
/** The hollow mountain's footprint: an oval round its middle (its front is at the door). */
export const BASE_DOME = { x: BASE.x, z: BASE.doorZ - BASE.depth / 2 - 4, rx: BASE.halfW + 50, rz: BASE.depth / 2 + 6 };

/** Is (x, z) inside the hollow mountain's rock (not the tunnel or hangar), or in the doorway while it's shut? */
export function hitsBaseRock(x: number, z: number, r: number) {
  const dx = (x - BASE_DOME.x) / (BASE_DOME.rx + r);
  const dz = (z - BASE_DOME.z) / (BASE_DOME.rz + r);
  if (dx * dx + dz * dz > 1) return false;
  const inside = Math.abs(x - BASE.x) < BASE.halfW - r && z < BASE.doorZ + 6 && z > BASE.doorZ - BASE.depth + r;
  const doorway = Math.abs(x - BASE.x) < BASE_DOOR.halfW - r;
  if (inside && (z < BASE.doorZ - 1.5 || doorway)) {
    // In the doorway while the rock door's shut: blocked.
    if (z > BASE.doorZ - 1.5 && baseDoor.open < 0.8) return true;
    // The things standing in the hangar.
    for (const b of BASE_PROPS) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }
  return true;
}

/**
 * What stands in the hangar (secret-base.tsx draws them), as boxes in the
 * world: the command deck across the back, the lounge's bar and pool table,
 * the stacks of gold and cash round the drop zone, the workshop bench and
 * the crates.
 */
export const BASE_PROPS: { x0: number; x1: number; z0: number; z1: number }[] = (() => {
  const X = BASE.x;
  const Z = BASE.doorZ;
  const D = BASE.depth;
  const b = (x0: number, x1: number, z0: number, z1: number) => ({ x0: X + x0, x1: X + x1, z0: Z + z0, z1: Z + z1 });
  const drop = -D * 0.62;
  return [
    // Command deck (raised, across the back).
    b(-34, 34, -D, -D + 15),
    // Lounge: the bar and the pool table.
    b(30, 44, -58, -55),
    b(30, 36, -40, -36.5),
    // Gold and cash round the drop zone (leaving the middle clear to drive in).
    b(-17, -12, drop - 3, drop + 3),
    b(12, 17, drop - 3, drop + 3),
    b(-7, 7, drop - 16.2, drop - 12.8),
    // The car lift's posts.
    b(-33.9, -32.9, -84.5, -83.5),
    b(-27.1, -26.1, -84.5, -83.5),
    // The workshop bench and the crates.
    b(-45, -42, -30, -14),
    b(-45, -38, -70, -62),
    b(38, 45, -16, -8),
  ];
})();

// ---- Pine trees on the slopes ---------------------------------------------------------------

export const PINES: { x: number; z: number; y: number; s: number }[] = (() => {
  const out: { x: number; z: number; y: number; s: number }[] = [];
  let seed = 9;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000 && out.length < 1700; i++) {
    const x = MOUNTAINS.minX + rand() * (MOUNTAINS.maxX - MOUNTAINS.minX);
    const z = HILLS_START - 30 - rand() * (HILLS_START - 30 - MOUNTAINS.minZ);
    const y = groundAt(x, z);
    // Forests grow on the lower slopes, not on the bare rock and snow up top.
    if (y < 6 || y > 150) continue;
    const { sx, sz } = slopeAt(x, z);
    if (Math.hypot(sx, sz) > 1.1) continue;
    if (nearestRoad(x, z).d < ROAD_HALF_W + 5) continue;
    if (Math.hypot(x - BASE_VALLEY.x, z - BASE_VALLEY.z) < BASE_VALLEY.r * 0.8) continue;
    // Not on (or in) the hollow mountain.
    if (((x - BASE.x) / (BASE.halfW + 56)) ** 2 + ((z - (BASE.doorZ - BASE.depth / 2 - 4)) / (BASE.depth / 2 + 14)) ** 2 < 1) continue;
    // Clumps: skip some spots by noise.
    if (noise(x * 0.02, z * 0.02) < 0.38) continue;
    out.push({ x, z, y, s: 0.8 + rand() * 0.9 });
  }
  return out;
})();

/** Pines near a spot (for bumping into them). */
const pineGrid = new Map<string, { x: number; z: number; r: number }[]>();
for (const p of PINES) {
  const k = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`;
  if (!pineGrid.has(k)) pineGrid.set(k, []);
  pineGrid.get(k)!.push({ x: p.x, z: p.z, r: 0.6 * p.s });
}
export function hitsPine(x: number, z: number, r: number) {
  if (z > HILLS_START) return false;
  const list = pineGrid.get(`${Math.floor(x / 40)},${Math.floor(z / 40)}`);
  if (!list) return false;
  for (const p of list) if (Math.hypot(p.x - x, p.z - z) < r + p.r) return true;
  return false;
}
