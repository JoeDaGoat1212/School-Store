import { GOLF } from "./world-map";

/*
 * Firebird Ridge Golf Club: the layout, the land and what every spot of
 * ground is (fairway, rough, green, bunker, water…). Plain numbers, no 3D
 * code: golf.tsx draws it, golf-physics.ts rolls the ball over it, and
 * terrain.ts asks it how high the ground is (so walking, carts and cars all
 * follow its hills).
 *
 * Real distances: a unit is a metre (yards = units / 0.9144).
 *
 *   9 holes, par 37: five par 4s and 5s for every par 3 (two par 3s, four
 *   par 4s, three par 5s), about 3,400 yards from the back tees. Rolling
 *   hills, an elevated tee down to an island green (3), lakes and ponds in
 *   play on 3, 4, 5, 7 and 8, sand bunkers on every hole, a concrete cart
 *   path with bridges over the water, houses along the holes, grandstands
 *   round the big greens, clock towers, the clubhouse and the driving range.
 *
 * The land is worked out once into two grids (heights every 2 units, what
 * the ground is every 1.25 units), by drawing each feature into them over
 * its own little patch only, so it's quick.
 */

export const YARD = 0.9144;
export const yards = (units: number) => units / YARD;

// ---- Surfaces -----------------------------------------------------------------------------------

export const SURF = { rough: 0, fairway: 1, tee: 2, fringe: 3, green: 4, bunker: 5, water: 6, path: 7, paved: 8, range: 9 } as const;
export type Surface = (typeof SURF)[keyof typeof SURF];
export const SURF_NAME: Record<Surface, string> = { 0: "Rough", 1: "Fairway", 2: "Tee box", 3: "Fringe", 4: "Green", 5: "Bunker", 6: "Water", 7: "Cart path", 8: "Pavement", 9: "Range" };

// ---- Small maths --------------------------------------------------------------------------------

type P = { x: number; z: number };
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
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
function fbm(x: number, z: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, z * f);
    n += a;
    f *= 2.03;
    a *= 0.5;
  }
  return s / n;
}
/** A seeded random number generator (0…1). */
export function rng(seed: number) {
  let n = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (n = (n * 16807) % 2147483647) / 2147483647;
}

// ---- The holes ------------------------------------------------------------------------------------

type Bunker = { x: number; z: number; rx: number; rz: number; turn: number };
type HoleDef = {
  par: 3 | 4 | 5;
  name: string;
  /** Tee, any bend points, and the middle of the green. */
  line: [number, number][];
  /** The fairway's half-width. */
  hw: number;
  /** Green radii (across, along), and which way it tilts (radians) and how much (rise per unit). */
  green: { rx: number; rz: number; tilt: number; slope: number };
  /** The pin, relative to the green's middle (across, along: + is to the back). */
  pin: [number, number];
  /** Fairway bunkers: how far along the hole (units) and to the right (−left), size. */
  fairwayBunkers: [number, number, number, number][];
  /** Greenside bunkers: angle round the green (0 = straight in front, + clockwise from above when walking toward it), size. */
  greenBunkers: [number, number, number][];
  /** Which side of the hole the cart path runs (1 = right, −1 = left), and how far out. */
  path: [number, number];
  /** Raise the tee onto a hill this high (an elevated tee). */
  teeHill?: number;
};

const HOLE_DEFS: HoleDef[] = [
  {
    par: 4,
    name: "Firebird",
    line: [
      [700, 600],
      [705, 965],
    ],
    hw: 21,
    green: { rx: 15, rz: 17, tilt: 2.4, slope: 0.022 },
    pin: [-4, 5],
    fairwayBunkers: [
      [225, 19, 9, 6],
      [250, -21, 8, 5],
    ],
    greenBunkers: [
      [-50, 6, 4],
      [55, 7, 4],
    ],
    path: [1, 34],
    teeHill: 4,
  },
  {
    par: 5,
    name: "Long Meadow",
    line: [
      [715, 1005],
      [700, 1250],
      [760, 1480],
    ],
    hw: 22,
    green: { rx: 14, rz: 19, tilt: 4.0, slope: 0.025 },
    pin: [3, -6],
    fairwayBunkers: [
      [240, -20, 10, 6],
      [262, 22, 8, 5],
      [395, 14, 9, 5],
    ],
    greenBunkers: [
      [-35, 6, 3.5],
      [30, 6.5, 3.5],
      [170, 5, 3],
    ],
    path: [1, 36],
  },
  {
    par: 3,
    name: "The Island",
    line: [
      [800, 1530],
      [915, 1650],
    ],
    hw: 13,
    green: { rx: 15, rz: 14, tilt: 0.8, slope: 0.018 },
    pin: [-3, 3],
    fairwayBunkers: [],
    greenBunkers: [[150, 4, 2.6]],
    path: [-1, 30],
    teeHill: 15,
  },
  {
    par: 4,
    name: "Heron Lake",
    line: [
      [975, 1680],
      [985, 1305],
    ],
    hw: 20,
    green: { rx: 14, rz: 16, tilt: 5.4, slope: 0.02 },
    pin: [4, 4],
    fairwayBunkers: [
      [230, -19, 9, 5],
      [255, -22, 7, 4],
    ],
    greenBunkers: [
      [-60, 6, 4],
      [40, 5, 3],
    ],
    path: [-1, 34],
  },
  {
    par: 5,
    name: "The Bend",
    line: [
      [1060, 1290],
      [1250, 1420],
      [1385, 1630],
    ],
    hw: 22,
    green: { rx: 16, rz: 17, tilt: 1.6, slope: 0.024 },
    pin: [-5, -4],
    fairwayBunkers: [
      [215, 21, 10, 6],
      [350, -19, 9, 5],
    ],
    greenBunkers: [
      [-45, 6, 4],
      [65, 6, 4],
      [185, 5, 3],
    ],
    path: [-1, 36],
  },
  {
    par: 4,
    name: "Ridgeback",
    line: [
      [1470, 1655],
      [1475, 1305],
    ],
    hw: 20,
    green: { rx: 14, rz: 16, tilt: 0.3, slope: 0.03 },
    pin: [2, -5],
    fairwayBunkers: [
      [210, 20, 8, 5],
      [240, -19, 9, 5],
    ],
    greenBunkers: [
      [-40, 6, 4],
      [45, 6, 4],
    ],
    path: [-1, 32],
  },
  {
    par: 3,
    name: "Lily Pond",
    line: [
      [1480, 1255],
      [1395, 1140],
    ],
    hw: 12,
    green: { rx: 14, rz: 13, tilt: 3.2, slope: 0.02 },
    pin: [4, 2],
    fairwayBunkers: [],
    greenBunkers: [
      [-70, 5, 3],
      [150, 5, 3],
    ],
    path: [1, 30],
  },
  {
    par: 5,
    name: "Old Oaks",
    line: [
      [1350, 1090],
      [1310, 830],
      [1220, 640],
    ],
    hw: 22,
    green: { rx: 15, rz: 18, tilt: 4.6, slope: 0.024 },
    pin: [-3, 6],
    fairwayBunkers: [
      [230, -21, 10, 6],
      [250, 20, 8, 5],
      [405, 19, 8, 5],
    ],
    greenBunkers: [
      [-120, 6, 4],
      [175, 5, 3.5],
    ],
    path: [-1, 34],
  },
  {
    par: 4,
    name: "Home",
    line: [
      [1185, 690],
      [840, 612],
    ],
    hw: 22,
    green: { rx: 17, rz: 18, tilt: 1.2, slope: 0.022 },
    pin: [3, -4],
    fairwayBunkers: [
      [215, 20, 9, 6],
      [232, -22, 9, 6],
    ],
    greenBunkers: [
      [-45, 7, 4],
      [40, 7, 4],
      [180, 6, 3],
    ],
    path: [1, 34],
  },
];

/** The lakes and ponds (ellipses). */
const WATER_DEFS: { x: number; z: number; rx: number; rz: number; turn: number; island?: boolean }[] = [
  // 3: the island green's lake.
  { x: 893, z: 1628, rx: 64, rz: 47, turn: 0.75, island: true },
  // 4: a pond down the right.
  { x: 1036, z: 1455, rx: 20, rz: 58, turn: 0.05 },
  // 5: the creek pond in the bend.
  { x: 1185, z: 1462, rx: 36, rz: 21, turn: 0.6 },
  // 7: the lily pond in front of the green.
  { x: 1428, z: 1186, rx: 27, rz: 17, turn: 0.6 },
  // 8: the lake beside the green.
  { x: 1270, z: 676, rx: 28, rz: 40, turn: -0.25 },
  // The big lake in the middle of the course (with a fountain).
  { x: 1030, z: 975, rx: 95, rz: 62, turn: 0.3 },
];

// ---- The clubhouse and the range -------------------------------------------------------------------

/** The clubhouse (its front faces the car park, north), its terrace, the car park and the practice green. */
export const CLUB = {
  house: { x0: 752, x1: 848, z0: 506, z1: 536, h: 11 },
  terrace: { x0: 748, x1: 852, z0: 536, z1: 548 },
  lot: { x0: 730, x1: 880, z0: 476, z1: 504 },
  practice: { x: 905, z: 540, r: 16 },
  /** The cart barn and where the carts are parked. */
  barn: { x0: 860, x1: 900, z0: 506, z1: 520 },
  carts: Array.from({ length: 8 }, (_, i) => ({ x: 864 + i * 4.6, z: 525, heading: 0 })),
  /** The starter's hut by the 1st tee. */
  starter: { x: 722, z: 592 },
  /** Flat ground round all of this (x0…x1, z0…z1). */
  flat: { x0: 700, x1: 930, z0: 470, z1: 560 },
};

/** The driving range: a covered row of hitting bays along the north, firing south. */
export const RANGE = {
  x0: 515,
  x1: 645,
  teeZ: 576,
  endZ: 872,
  /** The hitting mats (where the ball's teed up), along the tee line. */
  mats: Array.from({ length: 9 }, (_, i) => ({ x: 528 + i * 13, z: 576 })),
  /** Distance boards (yards). */
  markers: [50, 100, 150, 200, 250, 300],
  /** Target greens: yards, and how far across. */
  targets: [
    [75, -22],
    [125, 18],
    [175, -10],
    [225, 20],
    [265, -18],
  ] as [number, number][],
  flat: { x0: 505, x1: 655, z0: 545, z1: 600 },
};

// ---- Working out each hole ------------------------------------------------------------------------

export type Hole = {
  n: number;
  name: string;
  par: 3 | 4 | 5;
  /** The hole's middle line, sampled every 2 units (x, z, and how far along). */
  pts: { x: number; z: number; s: number }[];
  length: number;
  yards: number;
  tee: P;
  /** Which way the tee faces (toward the first bend or the green): a direction (x, z). */
  teeDir: P;
  green: P & { rx: number; rz: number; turn: number; tilt: number; slope: number };
  pin: P;
  hw: number;
  bunkers: Bunker[];
  pathSide: number;
  pathOff: number;
  teeHill: number;
};

function sampleLine(line: [number, number][]) {
  const out: { x: number; z: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, z0] = line[i];
    const [x1, z1] = line[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < n; k++) out.push({ x: x0 + ((x1 - x0) * k) / n, z: z0 + ((z1 - z0) * k) / n, s: s + (len * k) / n });
    s += len;
  }
  const last = line[line.length - 1];
  out.push({ x: last[0], z: last[1], s });
  // Round the bends a little.
  for (let pass = 0; pass < 6; pass++)
    for (let i = 1; i < out.length - 1; i++) {
      out[i].x = out[i].x * 0.5 + (out[i - 1].x + out[i + 1].x) * 0.25;
      out[i].z = out[i].z * 0.5 + (out[i - 1].z + out[i + 1].z) * 0.25;
    }
  return out;
}
/** A point along a hole (s units from the tee), and the direction there. */
export function along(h: Hole, s: number) {
  const pts = h.pts;
  const t = Math.max(0, Math.min(h.length, s));
  let i = Math.min(pts.length - 2, Math.floor((t / h.length) * (pts.length - 1)));
  while (i > 0 && pts[i].s > t) i--;
  while (i < pts.length - 2 && pts[i + 1].s < t) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const k = b.s > a.s ? (t - a.s) / (b.s - a.s) : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * k, z: a.z + dz * k, dx: dx / l, dz: dz / l };
}

export const HOLES: Hole[] = HOLE_DEFS.map((d, i) => {
  const pts = sampleLine(d.line);
  const length = pts[pts.length - 1].s;
  const [tx, tz] = d.line[0];
  const [nx, nz] = d.line[1];
  const tl = Math.hypot(nx - tx, nz - tz);
  const teeDir = { x: (nx - tx) / tl, z: (nz - tz) / tl };
  const [gx, gz] = d.line[d.line.length - 1];
  const [px, pz] = d.line[d.line.length - 2];
  // The green's "along" direction is the way you approach it.
  const al = Math.hypot(gx - px, gz - pz);
  const ax = (gx - px) / al;
  const az = (gz - pz) / al;
  const turn = Math.atan2(ax, az);
  const across = { x: az, z: -ax };
  const hole: Hole = {
    n: i + 1,
    name: d.name,
    par: d.par,
    pts,
    length,
    yards: Math.round(yards(length) / 1) ,
    tee: { x: tx, z: tz },
    teeDir,
    green: { x: gx, z: gz, rx: d.green.rx, rz: d.green.rz, turn, tilt: d.green.tilt, slope: d.green.slope },
    pin: { x: gx + across.x * d.pin[0] + ax * d.pin[1], z: gz + across.z * d.pin[0] + az * d.pin[1] },
    hw: d.hw,
    bunkers: [],
    pathSide: d.path[0],
    pathOff: d.path[1],
    teeHill: d.teeHill ?? 0,
  };
  // Fairway bunkers: along the hole, out to one side.
  for (const [s, off, rx, rz] of d.fairwayBunkers) {
    const p = along(hole, s);
    hole.bunkers.push({ x: p.x + p.dz * off, z: p.z - p.dx * off, rx, rz, turn: Math.atan2(p.dx, p.dz) });
  }
  // Greenside bunkers: round the green, just off its edge.
  for (const [deg, rx, rz] of d.greenBunkers) {
    const a = (deg * Math.PI) / 180;
    // 0° = in front (toward the tee), so start from −along and turn.
    const dirx = -ax * Math.cos(a) + across.x * Math.sin(a);
    const dirz = -az * Math.cos(a) + across.z * Math.sin(a);
    const r = Math.max(d.green.rx, d.green.rz) + Math.max(rx, rz) + 1.2;
    hole.bunkers.push({ x: gx + dirx * r, z: gz + dirz * r, rx, rz, turn: Math.atan2(dirx, dirz) + Math.PI / 2 });
  }
  return hole;
});
for (const h of HOLES) h.yards = Math.round(yards(h.length));
export const PAR = HOLES.reduce((s, h) => s + h.par, 0);

export type Water = { x: number; z: number; rx: number; rz: number; turn: number; level: number; island: boolean };

/** Is (x, z) inside an ellipse? Returns its "radius" there (1 at the edge). */
export function ellipseQ(x: number, z: number, e: { x: number; z: number; rx: number; rz: number; turn: number }) {
  const dx = x - e.x;
  const dz = z - e.z;
  const c = Math.cos(e.turn);
  const s = Math.sin(e.turn);
  const u = (dx * c - dz * s) / e.rx;
  const v = (dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}
const greenQ = (h: Hole, x: number, z: number) => ellipseQ(x, z, { x: h.green.x, z: h.green.z, rx: h.green.rx, rz: h.green.rz, turn: h.green.turn });

// ---- The cart path -----------------------------------------------------------------------------------

/** The cart path: one line of points from the clubhouse round all nine holes and back. */
export const CART_PATH: P[] = (() => {
  const out: P[] = [{ x: 790, z: 548 }, { x: 760, z: 566 }];
  for (const h of HOLES) {
    const side = h.pathSide;
    const n = Math.ceil(h.length / 12);
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * h.length;
      const p = along(h, s);
      // Swing out round the tee and the green.
      const end = Math.min(s, h.length - s);
      const off = h.pathOff + (end < 25 ? (25 - end) * 0.35 : 0);
      out.push({ x: p.x + p.dz * off * side, z: p.z - p.dx * off * side });
    }
  }
  out.push({ x: 860, z: 575 }, { x: 830, z: 552 });
  // Smooth the corners.
  for (let pass = 0; pass < 3; pass++)
    for (let i = 1; i < out.length - 1; i++) out[i] = { x: out[i].x * 0.5 + (out[i - 1].x + out[i + 1].x) * 0.25, z: out[i].z * 0.5 + (out[i - 1].z + out[i + 1].z) * 0.25 };
  return out;
})();
export const PATH_HALF = 1.4;

// ---- Houses, grandstands, clock towers, trees --------------------------------------------------------

export type Lot = { x: number; z: number; turn: number; w: number; d: number; seed: number };
export type Stand = { x: number; z: number; turn: number; w: number; rows: number };
export type Tower = { x: number; z: number; turn: number };

/** How far (x, z) is from any hole's middle line. */
function nearestHole(x: number, z: number) {
  let best = Infinity;
  let hole = -1;
  for (const h of HOLES)
    for (let i = 0; i < h.pts.length; i += 2) {
      const p = h.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) {
        best = d;
        hole = h.n - 1;
      }
    }
  return { d: Math.sqrt(best), hole };
}
const inWater = (x: number, z: number, pad: number) => WATER_DEFS.some((w) => ellipseQ(x, z, { ...w, rx: w.rx + pad, rz: w.rz + pad }) < 1);
const nearPath = (x: number, z: number, d: number) => CART_PATH.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d);
const inBox = (x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
const nearClub = (x: number, z: number, pad: number) => inBox(x, z, CLUB.flat, pad) || inBox(x, z, { x0: RANGE.x0, x1: RANGE.x1, z0: RANGE.flat.z0, z1: RANGE.endZ + 20 }, pad);
const inside = (x: number, z: number, pad: number) => x > GOLF.x0 + pad && x < GOLF.x1 - pad && z > GOLF.z0 + pad && z < GOLF.z1 - pad;

/** Houses along the holes (each faces the nearest hole). */
export const HOUSE_LOTS: Lot[] = (() => {
  const rand = rng(4242);
  const out: Lot[] = [];
  for (const h of HOLES) {
    for (const side of [-1, 1]) {
      for (let s = 60; s < h.length - 30; s += 46) {
        const p = along(h, s + (rand() - 0.5) * 12);
        const off = 92 + rand() * 18;
        const x = p.x + p.dz * off * side;
        const z = p.z - p.dx * off * side;
        if (!inside(x, z, 26) || nearClub(x, z, 40) || inWater(x, z, 14) || nearPath(x, z, 20)) continue;
        if (nearestHole(x, z).d < 74) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 44)) continue;
        // Face the hole (the front looks back at its middle line).
        const turn = Math.atan2(p.x - x, p.z - z);
        out.push({ x, z, turn, w: 24 + rand() * 10, d: 18 + rand() * 6, seed: Math.floor(rand() * 1e6) });
      }
    }
  }
  return out;
})();

/** Grandstands round the big greens, each looking at the green. */
export const STANDS: Stand[] = (() => {
  const out: Stand[] = [];
  const at = (h: Hole, deg: number, r: number, w: number, rows: number) => {
    const g = h.green;
    const ax = Math.sin(g.turn);
    const az = Math.cos(g.turn);
    const a = (deg * Math.PI) / 180;
    const dx = -ax * Math.cos(a) + az * Math.sin(a);
    const dz = -az * Math.cos(a) - ax * Math.sin(a);
    const x = g.x + dx * r;
    const z = g.z + dz * r;
    out.push({ x, z, turn: Math.atan2(g.x - x, g.z - z), w, rows });
  };
  const H = (n: number) => HOLES[n - 1];
  at(H(9), 110, 56, 46, 9);
  at(H(9), -115, 56, 46, 9);
  at(H(9), 180, 60, 38, 8);
  at(H(3), 150, 82, 44, 9);
  at(H(7), 125, 52, 34, 7);
  at(H(1), 120, 50, 30, 6);
  return out;
})();

/** Clock towers (green and gold, four faces). */
export const TOWERS: Tower[] = (() => {
  const t = (h: Hole, deg: number, r: number): Tower => {
    const g = h.green;
    const a = g.turn + (deg * Math.PI) / 180;
    return { x: g.x + Math.sin(a) * r, z: g.z + Math.cos(a) * r, turn: g.turn + Math.PI };
  };
  return [
    t(HOLES[8], 60, 34),
    t(HOLES[2], -40, 40),
    t(HOLES[6], 70, 30),
    { x: 744, z: 586, turn: 0 },
    { x: 674, z: 568, turn: 0 },
  ];
})();

/** Trees lining the holes and filling the land between them. */
export const TREES: { x: number; z: number; s: number; kind: 0 | 1 }[] = (() => {
  const rand = rng(777);
  const out: { x: number; z: number; s: number; kind: 0 | 1 }[] = [];
  const ok = (x: number, z: number) => {
    if (!inside(x, z, 6) || nearClub(x, z, 10) || inWater(x, z, 5) || nearPath(x, z, 5)) return false;
    if (nearestHole(x, z).d < 40) return false;
    if (HOUSE_LOTS.some((l) => Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) * 0.7 + 4)) return false;
    if (STANDS.some((s) => Math.hypot(s.x - x, s.z - z) < s.w * 0.6 + 6)) return false;
    return !out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 49);
  };
  // Along both sides of every hole.
  for (const h of HOLES)
    for (const side of [-1, 1])
      for (let s = 10; s < h.length + 20; s += 11) {
        const p = along(h, s);
        const off = 42 + rand() * 24;
        const x = p.x + p.dz * off * side + (rand() - 0.5) * 6;
        const z = p.z - p.dx * off * side + (rand() - 0.5) * 6;
        if (ok(x, z)) out.push({ x, z, s: 0.95 + rand() * 0.75, kind: rand() < 0.28 ? 1 : 0 });
      }
  // Woods in the open land between.
  for (let i = 0; i < 9000 && out.length < 1100; i++) {
    const x = GOLF.x0 + rand() * (GOLF.x1 - GOLF.x0);
    const z = GOLF.z0 + rand() * (GOLF.z1 - GOLF.z0);
    if (noise(x * 0.012, z * 0.012) < 0.48) continue;
    if (ok(x, z)) out.push({ x, z, s: 0.9 + rand() * 0.9, kind: rand() < 0.35 ? 1 : 0 });
  }
  return out;
})();

// ---- The land: heights and surfaces -----------------------------------------------------------------

const HC = 2;
const SC = 1.25;
const HNX = Math.ceil((GOLF.x1 - GOLF.x0) / HC) + 1;
const HNZ = Math.ceil((GOLF.z1 - GOLF.z0) / HC) + 1;
export const SURF_GRID = { cell: SC, nx: Math.ceil((GOLF.x1 - GOLF.x0) / SC), nz: Math.ceil((GOLF.z1 - GOLF.z0) / SC) };

type Land = { h: Float32Array; s: Uint8Array; stripe: Uint8Array; waters: Water[] };
let land: Land | null = null;

/** The rolling land before anything's cut into it. */
function baseHeight(x: number, z: number) {
  const big = fbm(x * 0.0042 + 7.3, z * 0.0042 - 2.1, 3);
  const mid = fbm(x * 0.013 - 1.7, z * 0.013 + 4.4, 3);
  let h = 5.5 + (big - 0.5) * 20 + (mid - 0.5) * 5;
  // Elevated tees: the land rises into a hill under them.
  for (const hole of HOLES) if (hole.teeHill) h += hole.teeHill * Math.exp(-(((x - hole.tee.x) ** 2 + (z - hole.tee.z) ** 2) / (2 * 30 * 30)));
  // A ridge running behind 6 and 7 (the "ridgeback"), and the amphitheatre bowl round the 9th green rising up to the stands.
  h += 9 * Math.exp(-(((x - 1515) ** 2) / (2 * 45 * 45))) * smooth(1050, 1350, z);
  const g9 = HOLES[8].green;
  const d9 = Math.hypot(x - g9.x, z - g9.z);
  h += smooth(30, 70, d9) * 5 * smooth(110, 70, d9);
  return h;
}
/** Bumps and hollows in the rough (smoothed out on the fairways). */
const lumps = (x: number, z: number) => (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 2.2;

function build(): Land {
  const h = new Float32Array(HNX * HNZ);
  const corridor = new Float32Array(HNX * HNZ).fill(1e9);
  const s = new Uint8Array(SURF_GRID.nx * SURF_GRID.nz);
  const stripe = new Uint8Array(SURF_GRID.nx * SURF_GRID.nz);

  // ---- How far each height sample is from a fairway's middle (for smoothing them) ----
  for (const hole of HOLES) {
    for (let i = 0; i < hole.pts.length - 1; i++) {
      const a = hole.pts[i];
      const b = hole.pts[i + 1];
      const pad = hole.hw + 20;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - GOLF.x0) / HC));
      const i1 = Math.min(HNX - 1, Math.ceil((Math.max(a.x, b.x) + pad - GOLF.x0) / HC));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - pad - GOLF.z0) / HC));
      const j1 = Math.min(HNZ - 1, Math.ceil((Math.max(a.z, b.z) + pad - GOLF.z0) / HC));
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) {
          const x = GOLF.x0 + ii * HC;
          const z = GOLF.z0 + j * HC;
          const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / l2);
          const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) - hole.hw;
          const k = j * HNX + ii;
          if (d < corridor[k]) corridor[k] = d;
        }
    }
  }

  // ---- The base land ----
  for (let j = 0; j < HNZ; j++)
    for (let i = 0; i < HNX; i++) {
      const x = GOLF.x0 + i * HC;
      const z = GOLF.z0 + j * HC;
      const k = j * HNX + i;
      const fair = smooth(14, 0, corridor[k]);
      let y = baseHeight(x, z) + lumps(x, z) * (1 - fair * 0.85);
      // Flat round the clubhouse and the range; down to the town's level at the edges.
      const flat = Math.max(boxFade(x, z, CLUB.flat, 30), boxFade(x, z, RANGE.flat, 30));
      y = y * (1 - flat);
      const edge = Math.min(x - GOLF.x0, GOLF.x1 - x, z - GOLF.z0, GOLF.z1 - z);
      y *= smooth(0, 50, edge);
      h[k] = Math.max(0.02, y);
    }
  // The range: gently down from the tee, with soft mounds for the targets.
  stamp(h, RANGE.x0 - 10, RANGE.x1 + 10, RANGE.teeZ + 10, RANGE.endZ + 25, (x, z, y) => {
    const t = smooth(RANGE.teeZ + 10, RANGE.teeZ + 60, z) * smooth(RANGE.x0 - 10, RANGE.x0 + 10, x) * smooth(RANGE.x1 + 10, RANGE.x1 - 10, x);
    let target = 0.2 + (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 1.2;
    for (const [yd, off] of RANGE.targets) {
      const tz = RANGE.teeZ + yd * YARD;
      const tx = (RANGE.x0 + RANGE.x1) / 2 + off;
      target += 1.2 * Math.exp(-((x - tx) ** 2 + (z - tz) ** 2) / (2 * 9 * 9));
    }
    return y + (target - y) * t;
  });

  // ---- Water: bowls under each lake, at a level just below the shore ----
  const waters: Water[] = WATER_DEFS.map((w) => {
    let lo = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const c = Math.cos(w.turn);
      const sn = Math.sin(w.turn);
      const u = Math.cos(a) * w.rx;
      const v = Math.sin(a) * w.rz;
      const x = w.x + u * c + v * sn;
      const z = w.z - u * sn + v * c;
      lo = Math.min(lo, sampleH(h, x, z));
    }
    return { ...w, level: Math.max(1.4, lo - 0.6), island: Boolean(w.island) };
  });
  for (const w of waters) {
    const r = Math.max(w.rx, w.rz) * 1.5;
    stamp(h, w.x - r, w.x + r, w.z - r, w.z + r, (x, z, y) => {
      const q = ellipseQ(x, z, w);
      if (q > 1.45) return y;
      const bed = Math.max(0.08, w.level - 0.3 - 1.5 * smooth(1, 0.55, q));
      const bank = w.level + 0.45;
      if (q < 1) return bed;
      // The shore: down from the land to just above the water.
      return Math.min(y, bank + (y - bank) * smooth(1, 1.45, q));
    });
  }

  // ---- Tees, greens, bunkers ----
  for (const hole of HOLES) {
    // The tee box: a flat raised platform.
    const t = hole.tee;
    const ty = sampleH(h, t.x, t.z) + 0.7;
    const tturn = Math.atan2(hole.teeDir.x, hole.teeDir.z);
    stamp(h, t.x - 22, t.x + 22, t.z - 22, t.z + 22, (x, z, y) => {
      const { u, v } = local(x, z, t, tturn);
      const d = Math.max(Math.abs(u) - 7, Math.abs(v + 5) - 13, 0);
      return y + (ty - y) * smooth(4, 0, d);
    });
    // The green: raised a little above the land (or above the water for the island), tilted, with gentle rolls.
    const g = hole.green;
    const isle = waters.find((w) => w.island && ellipseQ(g.x, g.z, w) < 1);
    const gy = isle ? isle.level + 1.15 : sampleH(h, g.x, g.z) + 0.6;
    const R = Math.max(g.rx, g.rz) + 10;
    stamp(h, g.x - R, g.x + R, g.z - R, g.z + R, (x, z, y) => {
      const q = greenQ(hole, x, z);
      if (q > 1.8) return y;
      const surf = greenSurface(hole, gy, x, z);
      // Out from the fringe, the green's bank runs down to the land (steeply on the island).
      return y + (surf - y) * smooth(isle ? 1.35 : 1.75, isle ? 1.15 : 1.05, q);
    });
    // Bunkers: hollows with a lip.
    for (const b of hole.bunkers) {
      const r = Math.max(b.rx, b.rz) * 1.6;
      stamp(h, b.x - r, b.x + r, b.z - r, b.z + r, (x, z, y) => {
        const q = ellipseQ(x, z, b) * (1 + 0.12 * (noise(x * 0.4, z * 0.4) - 0.5));
        if (q > 1.4) return y;
        return y - 0.9 * smooth(1.05, 0.5, q) + 0.25 * Math.exp(-(((q - 1.12) / 0.1) ** 2));
      });
    }
  }
  // The practice green.
  {
    const pg = CLUB.practice;
    const py = 0.35;
    stamp(h, pg.x - 24, pg.x + 24, pg.z - 24, pg.z + 24, (x, z, y) => {
      const d = Math.hypot(x - pg.x, z - pg.z) / pg.r;
      return y + (py + (x - pg.x) * 0.012 + Math.sin(z * 0.3) * 0.06 - y) * smooth(1.4, 1, d);
    });
  }
  // Flat pads under the houses and the grandstands.
  for (const l of HOUSE_LOTS) pad(h, l.x, l.z, Math.max(l.w, l.d) * 0.75 + 6);
  for (const st of STANDS) pad(h, st.x, st.z, st.w * 0.6 + 4);
  for (const tw of TOWERS) pad(h, tw.x, tw.z, 7);

  // ---- What the ground is (finer grid) ----
  const S = SURF_GRID;
  const setS = (x0: number, x1: number, z0: number, z1: number, f: (x: number, z: number, k: number) => void) => {
    const i0 = Math.max(0, Math.floor((x0 - GOLF.x0) / SC));
    const i1 = Math.min(S.nx - 1, Math.ceil((x1 - GOLF.x0) / SC));
    const j0 = Math.max(0, Math.floor((z0 - GOLF.z0) / SC));
    const j1 = Math.min(S.nz - 1, Math.ceil((z1 - GOLF.z0) / SC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(GOLF.x0 + (i + 0.5) * SC, GOLF.z0 + (j + 0.5) * SC, j * S.nx + i);
  };
  // Fairways (with wavy edges), and their mowing stripes.
  for (const hole of HOLES) {
    const start = hole.par === 3 ? hole.length - 38 : 42;
    const end = hole.length - Math.max(hole.green.rx, hole.green.rz) * 0.5;
    for (let i = 0; i < hole.pts.length - 1; i++) {
      const a = hole.pts[i];
      const b = hole.pts[i + 1];
      if (b.s < start || a.s > end) continue;
      const pad = hole.hw + 8;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const l = Math.sqrt(l2);
      setS(Math.min(a.x, b.x) - pad, Math.max(a.x, b.x) + pad, Math.min(a.z, b.z) - pad, Math.max(a.z, b.z) + pad, (x, z, k) => {
        const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / l2);
        const sAlong = a.s + t * (b.s - a.s);
        if (sAlong < start || sAlong > end) return;
        const side = ((x - a.x) * dz - (z - a.z) * dx) / l;
        const d = Math.abs(side);
        // Narrower at the start, widest at the landing area, pinching in toward the green.
        const shape = 0.72 + 0.28 * smooth(start, start + 90, sAlong) - 0.22 * smooth(end - 70, end, sAlong);
        const wob = (noise(sAlong * 0.04, hole.n * 7.1 + Math.sign(side) * 3) - 0.5) * 9;
        if (d < hole.hw * shape + wob) {
          s[k] = SURF.fairway;
          stripe[k] = Math.floor((side + 200) / 9) % 2;
        }
      });
    }
  }
  // The range turf.
  setS(RANGE.x0, RANGE.x1, RANGE.teeZ - 8, RANGE.endZ, (x, z, k) => {
    s[k] = SURF.range;
  });
  // Tee boxes.
  for (const hole of HOLES) {
    const t = hole.tee;
    const tturn = Math.atan2(hole.teeDir.x, hole.teeDir.z);
    setS(t.x - 20, t.x + 20, t.z - 20, t.z + 20, (x, z, k) => {
      const { u, v } = local(x, z, t, tturn);
      if (Math.abs(u) < 6 && Math.abs(v + 5) < 12) s[k] = SURF.tee;
    });
  }
  // Greens and their fringes.
  for (const hole of HOLES) {
    const g = hole.green;
    const R = Math.max(g.rx, g.rz) + 4;
    setS(g.x - R, g.x + R, g.z - R, g.z + R, (x, z, k) => {
      const q = greenQ(hole, x, z) * (1 + 0.05 * (noise(x * 0.25, z * 0.25) - 0.5));
      if (q < 1) s[k] = SURF.green;
      else if (q < 1.14 && s[k] !== SURF.tee) s[k] = SURF.fringe;
    });
  }
  setS(CLUB.practice.x - 20, CLUB.practice.x + 20, CLUB.practice.z - 20, CLUB.practice.z + 20, (x, z, k) => {
    const d = Math.hypot(x - CLUB.practice.x, z - CLUB.practice.z);
    if (d < CLUB.practice.r) s[k] = SURF.green;
    else if (d < CLUB.practice.r + 1.8) s[k] = SURF.fringe;
  });
  // Bunkers.
  for (const hole of HOLES)
    for (const b of hole.bunkers) {
      const r = Math.max(b.rx, b.rz) * 1.3;
      setS(b.x - r, b.x + r, b.z - r, b.z + r, (x, z, k) => {
        const q = ellipseQ(x, z, b) * (1 + 0.12 * (noise(x * 0.4, z * 0.4) - 0.5));
        if (q < 1) s[k] = SURF.bunker;
      });
    }
  // Water (not on the island green).
  for (const w of waters) {
    const r = Math.max(w.rx, w.rz) * 1.05;
    setS(w.x - r, w.x + r, w.z - r, w.z + r, (x, z, k) => {
      if (ellipseQ(x, z, w) < 1 && s[k] !== SURF.green && s[k] !== SURF.fringe && sampleH(h, x, z) < w.level) s[k] = SURF.water;
    });
  }
  // The clubhouse grounds and car park.
  setS(CLUB.lot.x0, CLUB.lot.x1, CLUB.lot.z0, CLUB.lot.z1, (x, z, k) => (s[k] = SURF.paved));
  setS(CLUB.terrace.x0, CLUB.terrace.x1, CLUB.house.z0, CLUB.terrace.z1, (x, z, k) => (s[k] = SURF.paved));
  setS(CLUB.barn.x0 - 4, CLUB.barn.x1 + 4, CLUB.barn.z0, CLUB.carts[0].z + 5, (x, z, k) => (s[k] = SURF.paved));
  setS(RANGE.x0, RANGE.x1, RANGE.teeZ - 16, RANGE.teeZ - 4, (x, z, k) => (s[k] = SURF.paved));
  // The cart path (over the water it's a bridge).
  for (let i = 0; i < CART_PATH.length - 1; i++) {
    const a = CART_PATH[i];
    const b = CART_PATH[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const pad = PATH_HALF + 1;
    setS(Math.min(a.x, b.x) - pad, Math.max(a.x, b.x) + pad, Math.min(a.z, b.z) - pad, Math.max(a.z, b.z) + pad, (x, z, k) => {
      const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / l2);
      if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < PATH_HALF && s[k] !== SURF.green && s[k] !== SURF.tee) s[k] = SURF.path;
    });
  }
  // Bridges: where the path runs over water, the ground is the deck.
  for (let j = 0; j < HNZ; j++)
    for (let i = 0; i < HNX; i++) {
      const x = GOLF.x0 + i * HC;
      const z = GOLF.z0 + j * HC;
      const w = waters.find((wt) => ellipseQ(x, z, wt) < 1.05);
      if (!w) continue;
      const si = Math.floor((x - GOLF.x0) / SC);
      const sj = Math.floor((z - GOLF.z0) / SC);
      if (s[sj * S.nx + si] === SURF.path || nearPathLine(x, z, PATH_HALF + 0.6)) h[j * HNX + i] = Math.max(h[j * HNX + i], w.level + 0.55);
    }
  for (let k = 0; k < h.length; k++) h[k] = Math.max(0.02, h[k]);
  return { h, s, stripe, waters };
}

function nearPathLine(x: number, z: number, r: number) {
  for (let i = 0; i < CART_PATH.length - 1; i++) {
    const a = CART_PATH[i];
    const b = CART_PATH[i + 1];
    if (Math.abs(a.x - x) > 30 && Math.abs(b.x - x) > 30) continue;
    if (Math.abs(a.z - z) > 30 && Math.abs(b.z - z) > 30) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
    if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < r) return true;
  }
  return false;
}

/** The green's own surface: a tilted plane through its middle, with gentle rolls. */
function greenSurface(hole: Hole, gy: number, x: number, z: number) {
  const g = hole.green;
  const dx = x - g.x;
  const dz = z - g.z;
  const tilt = (dx * Math.sin(g.tilt) + dz * Math.cos(g.tilt)) * g.slope;
  const roll = 0.16 * Math.sin(dx * 0.19 + hole.n) * Math.cos(dz * 0.16 - hole.n * 0.7) + 0.1 * Math.sin((dx + dz) * 0.09);
  return gy + tilt + roll;
}
function local(x: number, z: number, o: P, turn: number) {
  const dx = x - o.x;
  const dz = z - o.z;
  // v along the facing direction, u across it.
  return { u: dx * Math.cos(turn) - dz * Math.sin(turn), v: dx * Math.sin(turn) + dz * Math.cos(turn) };
}
function boxFade(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }, r: number) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return smooth(r, 0, Math.hypot(dx, dz));
}
/** Change the heights in a box, sample by sample. */
function stamp(h: Float32Array, x0: number, x1: number, z0: number, z1: number, f: (x: number, z: number, y: number) => number) {
  const i0 = Math.max(0, Math.floor((x0 - GOLF.x0) / HC));
  const i1 = Math.min(HNX - 1, Math.ceil((x1 - GOLF.x0) / HC));
  const j0 = Math.max(0, Math.floor((z0 - GOLF.z0) / HC));
  const j1 = Math.min(HNZ - 1, Math.ceil((z1 - GOLF.z0) / HC));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * HNX + i;
      h[k] = f(GOLF.x0 + i * HC, GOLF.z0 + j * HC, h[k]);
    }
}
/** Flatten a round pad at the land's height in its middle. */
function pad(h: Float32Array, x: number, z: number, r: number) {
  const y = sampleH(h, x, z);
  stamp(h, x - r - 10, x + r + 10, z - r - 10, z + r + 10, (px, pz, py) => py + (y - py) * smooth(r + 10, r, Math.hypot(px - x, pz - z)));
}
function sampleH(h: Float32Array, x: number, z: number) {
  const fx = Math.min(HNX - 1.001, Math.max(0, (x - GOLF.x0) / HC));
  const fz = Math.min(HNZ - 1.001, Math.max(0, (z - GOLF.z0) / HC));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const a = h[j * HNX + i];
  const b = h[j * HNX + i + 1];
  const c = h[(j + 1) * HNX + i];
  const d = h[(j + 1) * HNX + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function course() {
  if (!land) land = build();
  return land;
}

// ---- Asking about the land ---------------------------------------------------------------------------

export const inGolf = (x: number, z: number) => x > GOLF.x0 && x < GOLF.x1 && z > GOLF.z0 && z < GOLF.z1;

/** How high the course's ground is at (x, z) (0 outside it). */
export function golfHeight(x: number, z: number) {
  if (!inGolf(x, z)) return 0;
  return sampleH(course().h, x, z);
}
/** Which way the ground slopes (rise per unit along x and along z). */
export function golfSlope(x: number, z: number) {
  const e = 0.5;
  return { sx: (golfHeight(x + e, z) - golfHeight(x - e, z)) / (2 * e), sz: (golfHeight(x, z + e) - golfHeight(x, z - e)) / (2 * e) };
}
/** What the ground is at (x, z). */
export function surfaceAt(x: number, z: number): Surface {
  if (!inGolf(x, z)) return SURF.rough;
  const c = course();
  const i = Math.min(SURF_GRID.nx - 1, Math.max(0, Math.floor((x - GOLF.x0) / SC)));
  const j = Math.min(SURF_GRID.nz - 1, Math.max(0, Math.floor((z - GOLF.z0) / SC)));
  return c.s[j * SURF_GRID.nx + i] as Surface;
}
/** Out of bounds: off the course, in someone's garden, or on the range during a round. */
export function outOfBounds(x: number, z: number) {
  if (!inside(x, z, 12)) return true;
  if (inBox(x, z, { x0: RANGE.x0 - 4, x1: RANGE.x1 + 4, z0: RANGE.flat.z0, z1: RANGE.endZ + 10 })) return true;
  if (inBox(x, z, CLUB.flat, -4) && z < 552) return true;
  return HOUSE_LOTS.some((l) => Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) * 0.62 + 6);
}
/** The lakes (with their water levels). */
export function golfWaters() {
  return course().waters;
}
/** The water at (x, z), if any. */
export function waterAt(x: number, z: number) {
  return course().waters.find((w) => ellipseQ(x, z, w) < 1 && surfaceAt(x, z) === SURF.water) ?? null;
}
/** The grids, for drawing (golf.tsx). */
export function golfGrids() {
  const c = course();
  return { heights: c.h, hnx: HNX, hnz: HNZ, hcell: HC, surface: c.s, stripe: c.stripe, ...SURF_GRID };
}

/** The trees' trunks, in 20-unit squares (for bumping into). */
const treeGrid = new Map<number, { x: number; z: number; r: number }[]>();
for (const t of TREES) {
  const k = Math.floor(t.x / 20) * 1000 + Math.floor(t.z / 20);
  let list = treeGrid.get(k);
  if (!list) treeGrid.set(k, (list = []));
  list.push({ x: t.x, z: t.z, r: 0.45 * t.s });
}

/** Things you bump into on the course: the clubhouse, the barn, the stands, the towers, the houses, tree trunks and the lakes. */
export function golfBlocks(x: number, z: number, r: number) {
  if (!inGolf(x, z)) return false;
  const near = treeGrid.get(Math.floor(x / 20) * 1000 + Math.floor(z / 20));
  if (near) for (const t of near) if (Math.hypot(t.x - x, t.z - z) < t.r + r) return true;
  const H = CLUB.house;
  if (x > H.x0 - r && x < H.x1 + r && z > H.z0 - r && z < H.z1 + r) return true;
  const B = CLUB.barn;
  if (x > B.x0 - r && x < B.x1 + r && z > B.z0 - r && z < B.z1 + r) return true;
  for (const st of STANDS) {
    const { u, v } = local(x, z, st, st.turn);
    if (Math.abs(u) < st.w / 2 + r && v < 3 + r && v > -st.rows * 1.6 - 3 - r) return true;
  }
  for (const t of TOWERS) if (Math.hypot(t.x - x, t.z - z) < 2.2 + r) return true;
  for (const l of HOUSE_LOTS) {
    const { u, v } = local(x, z, l, l.turn);
    if (Math.abs(u) < l.w / 2 + r && v < r && v > -l.d - r) return true;
  }
  // The lakes (the bridges are fine).
  return surfaceAt(x, z) === SURF.water && golfHeight(x, z) < (waterAt(x, z)?.level ?? 0);
}

/** The tee to play each hole from (the middle of the front of the tee box), and how high it is. */
export function teeSpot(h: Hole) {
  return { x: h.tee.x + h.teeDir.x * 3, z: h.tee.z + h.teeDir.z * 3 };
}
