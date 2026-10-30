/*
 * The big map: where every area of the world is. Plain numbers only (no 3D
 * code and no imports from the other layout files), so anything can use it.
 *
 *                        N (-z)
 *        ┌────────────── MOUNTAINS ─────────────────┐
 *        │   (pine forests, snowy peaks, a winding   │
 *        │    mountain road up to the SECRET BASE)   │
 *        ├──────────┬──────────────┬─────────────┬───┴──────┐
 *        │ AIRPORT  │    TOWN      │    CITY     │   JAIL   │
 *  W(-x) │ runway,  │  the store,  │ bank, shops,│ cells,   │ E(+x)
 *        │ terminal │  houses      │ dealership  │ yard,gym │
 *        ├──────────┴──────┬───────┴──────┬──────┴──────────┘
 *        │ CRESCENT HEIGHTS│              │ FIREBIRD RIDGE  │
 *        │ (gated mansions)│              │ GOLF CLUB       │
 *        └─────────────────┘              └─────────────────┘
 *                        S (+z)
 *
 * World units are about a metre. The main road (z = 58, the store's avenue)
 * runs all the way from the airport in the west, through the town and the
 * city, to the jail in the east.
 */

/** How far you can walk, drive or fly. */
export const WORLD_BOUNDS = { minX: -1500, maxX: 1560, minZ: -1180, maxZ: 1820 };

/** The main road (the store's avenue) and how far it now runs each way. */
export const MAIN_ROAD_Z = 58;

// ---- The airport (west) ---------------------------------------------------------------------

export const AIRPORT = {
  minX: -1460,
  maxX: -560,
  minZ: -300,
  maxZ: 380,
  /** The runway: east–west, its middle line at z (south of the terminal). */
  runway: { x0: -1400, x1: -640, z: 290, halfW: 22 },
  /** A taxiway alongside it. */
  taxiway: { x0: -1380, x1: -660, z: 238, halfW: 9 },
  /** The apron (the big paved area behind the terminal where planes park). */
  apron: { x0: -1060, x1: -660, z0: 128, z1: 228 },
  /** The terminal building, south of the main road: its front (doors) faces the road (-z). x, z = front middle. */
  terminal: { x: -880, z: 78, turn: Math.PI, w: 150, d: 44, h: 18 },
  tower: { x: -1140, z: 150, h: 62 },
  hangar: { x: -1270, z: 175, w: 70, d: 50, h: 22 },
  /** Car park beside the terminal. */
  parking: { x0: -1040, x1: -968, z0: 74, z1: 124 },
  helipads: [
    { x: -700, z: 150 },
    { x: -668, z: 150 },
  ],
};
/** The airport road: the main road's west end, past the terminal. */
export const AIRPORT_ROAD = { z: MAIN_ROAD_Z, from: -1080, to: -430 };

// ---- The jail (east) ------------------------------------------------------------------------

export const JAIL = {
  minX: 1060,
  maxX: 1550,
  minZ: -300,
  maxZ: 50,
  /** The main building (jail-layout.ts has the details): four cell blocks, the mess hall, the gym, library, laundry, guard room and lobby. Its front faces the road (z = MAIN_ROAD_Z). */
  building: { x0: 1080, x1: 1530, z0: -190, z1: 30 },
  /** The fenced outdoor yard behind it. */
  yard: { x0: 1100, x1: 1510, z0: -280, z1: -191 },
};
export const JAIL_ROAD = { z: MAIN_ROAD_Z, from: 1040, to: 1500 };

// ---- Crescent Heights (the gated community, south) -----------------------------------------

export const ESTATES = {
  minX: -460,
  maxX: 460,
  minZ: 560,
  maxZ: 980,
  /** The gatehouse on the road in, with its barrier. */
  gate: { x: 0, z: 572 },
};
/** The road down to the gate from the town's southern avenue (z = 220). */
export const ESTATES_ROAD = { x: 0, from: 220, to: 580 };
/** Crescent Heights' own roads: the drive in from the gate, and the cross drive. */
export const ESTATE_DRIVE = { x: 0, from: 580, to: 900 };
export const CROSS_DRIVE = { z: 770, from: -400, to: 400 };

// ---- Firebird Ridge Golf Club (south-east, beside Crescent Heights) -------------------------

/**
 * The golf club: a 9-hole course, the clubhouse and the driving range
 * (golf-course.ts has the holes). Real distances: a unit is a metre.
 */
export const GOLF = { x0: 500, x1: 1545, z0: 470, z1: 1800 };
/** The road into the club: on from the city's street at x = 800, south to the clubhouse car park. */
export const CLUB_ROAD = { x: 800, from: 330, to: 478 };

// ---- The mountains (north) ------------------------------------------------------------------

export const MOUNTAINS = { minX: -1100, maxX: 1500, minZ: -1180, maxZ: -330 };
/** The hidden valley with the secret base, and the hollow mountain the base is inside. */
export const BASE_VALLEY = { x: 990, z: -820, r: 110, y: 46 };
export const BASE = {
  /** The middle of the hollow mountain. */
  x: 990,
  z: -894,
  /** Its door faces the valley (+z), here: */
  doorZ: -830,
  /** The hangar inside: half-width, depth back from the door, height. */
  halfW: 46,
  depth: 120,
  height: 30,
};
/** The helipad out in the base's valley (with a helicopter you can fly). */
export const BASE_HELIPAD = { x: 1040, z: -788, r: 12 };

/**
 * The mountain road: from the city's north edge (the top of street x = 920)
 * winding up the hillside to the secret base's valley. Each point is x, z and
 * the road's height there.
 */
export const MOUNTAIN_ROAD: [number, number, number][] = [
  [920, -238, 0],
  [920, -300, 0],
  [930, -360, 2],
  [980, -420, 8],
  [1060, -460, 14],
  [1120, -520, 20],
  [1100, -590, 26],
  [1010, -620, 31],
  [920, -650, 35],
  [880, -710, 39],
  [910, -760, 43],
  [960, -790, 46],
  [990, -805, 46],
];

// ---- What's in the city -----------------------------------------------------------------------

/** One shop or office you can walk into: its front middle, which way its front faces, and its size. */
export type Spot = { x: number; z: number; turn: number; w: number; d: number; h: number };

/** Restaurant Row and friends: the places you can work (and eat). turn 0 = front faces +z. */
export const SHOPS = {
  pizza: { x: 708, z: 40, turn: 0, w: 26, d: 22, h: 8, name: "Slice Society" },
  icecream: { x: 740, z: 40, turn: 0, w: 26, d: 22, h: 8, name: "Polar Scoops" },
  coffee: { x: 772, z: 40, turn: 0, w: 26, d: 22, h: 8, name: "Bean There" },
  burger: { x: 716, z: 76, turn: Math.PI, w: 34, d: 24, h: 8, name: "Smash Stack" },
  flowers: { x: 764, z: 76, turn: Math.PI, w: 30, d: 22, h: 8, name: "Petal & Stem" },
} as const;
export type ShopKey = keyof typeof SHOPS;

/** The car dealership (where the jewelry shop used to be, by the bank): a glass showroom and a lot. */
export const DEALERSHIP: Spot & { lot: { x0: number; x1: number; z0: number; z1: number } } = {
  x: 600,
  z: 76,
  turn: Math.PI,
  w: 44,
  d: 30,
  h: 11,
  lot: { x0: 628, x1: 664, z0: 74, z1: 126 },
};
/** The realtor's office. */
export const REALTOR: Spot = { x: 740, z: 154, turn: Math.PI, w: 30, d: 22, h: 10 };
