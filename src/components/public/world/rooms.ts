import { toLocal, toWorld, type Site } from "./city-layout";
import { hitsBox, type Box, type Circle } from "./town-layout";
import { AIRPORT, DEALERSHIP, REALTOR, SHOPS, type ShopKey } from "./world-map";

/*
 * The buildings you can walk into that aren't the bank or the jewelry shop:
 * the five places you can work (Restaurant Row), Apex Motors, Keystone
 * Realty and the airport terminal. Each is a box of walls with a doorway in
 * the middle of its front, and whatever's inside to bump into (counters,
 * desks, ovens…). Plain numbers; buildings.tsx draws them, bump.ts stops you
 * walking through them.
 *
 * Every room is laid out in its own frame (like the bank): lx left–right,
 * lz out of the front, so the inside is at lz < 0.
 */

export type RoomKey = ShopKey | "dealer" | "realtor" | "terminal";
/** A box inside a room, in the room's own frame. */
export type LocalBox = { lx0: number; lx1: number; lz0: number; lz1: number };

export type Room = {
  key: RoomKey;
  site: Site;
  halfW: number;
  depth: number;
  height: number;
  wall: number;
  doorHalf: number;
  /** Counters, desks, ovens… */
  solids: LocalBox[];
  /** Round things (turntables, pillars). */
  rounds: { lx: number; lz: number; r: number }[];
};

// ---- The shops on Restaurant Row (all laid out the same way) ---------------------------------

/**
 * A shop's floor plan, from the front door back:
 *   - the dining area, with the order kiosk by the door (customers order there; you take the order),
 *   - the counter across the middle (customers pick up in front of it), with a gap at the right end
 *     for staff,
 *   - the kitchen behind it: the prep table in the middle and the oven / grill / machine on the left.
 */
export function shopPlan(key: ShopKey) {
  const s = SHOPS[key];
  const halfW = s.w / 2;
  const depth = s.d;
  return {
    halfW,
    depth,
    /** The touch-screen kiosk where customers order, against the left wall by the door. */
    kiosk: { lx: -halfW + 1.5, lz: -4.6 },
    /** Where the customer using the kiosk stands, and where the next ones queue. */
    ordering: { lx: -halfW + 3.4, lz: -4.6 },
    queue: [
      { lx: -halfW + 3.4, lz: -2.4 },
      { lx: -halfW + 5.4, lz: -2.2 },
      { lx: -halfW + 7.2, lz: -2.6 },
    ],
    /** Where customers wait for their food: along the front of the counter. */
    waiting: { lx0: -halfW + 3, lx1: halfW - 8, lz: -8.5 },
    /** The order screen on the staff side of the counter (where you take orders), and where you stand to use it. */
    pos: { lx: -halfW + 4.5, lz: -10.4 },
    posStand: { lx: -halfW + 4.5, lz: -12.4 },
    counter: { lx0: -halfW + 1, lx1: halfW - 6.5, lz0: -11, lz1: -9.8, height: 1.5 },
    /** Where the person working stands behind the counter (and the prep table behind them). */
    staff: { lx: 0, lz: -12.6 },
    prep: { lx0: -4, lx1: 4, lz0: -16.8, lz1: -15.2, height: 1.45 },
    /** The oven / grill / ice-cream freezer / espresso machine / flower cooler, on the left. */
    machine: { lx0: -halfW + 1, lx1: -halfW + 6, lz0: -depth + 1, lz1: -depth + 5.4, height: 3 },
    /** Tables in the dining area (middles). */
    tables: (s.w > 28 ? [halfW - 12.6, halfW - 8.2, halfW - 3.8] : [halfW - 8, halfW - 3.6]).map((lx) => ({ lx, lz: -5 })),
  };
}

function shopRoom(key: ShopKey): Room {
  const s = SHOPS[key];
  const P = shopPlan(key);
  const c = P.counter;
  return {
    key,
    site: { x: s.x, z: s.z, turn: s.turn },
    halfW: P.halfW,
    depth: P.depth,
    height: s.h,
    wall: 0.6,
    doorHalf: 2.4,
    solids: [
      { lx0: c.lx0, lx1: c.lx1, lz0: c.lz0, lz1: c.lz1 },
      { lx0: P.prep.lx0, lx1: P.prep.lx1, lz0: P.prep.lz0, lz1: P.prep.lz1 },
      P.machine,
      // The kiosk.
      { lx0: P.kiosk.lx - 0.9, lx1: P.kiosk.lx + 0.6, lz0: P.kiosk.lz - 0.7, lz1: P.kiosk.lz + 0.7 },
    ],
    rounds: P.tables.map((t) => ({ lx: t.lx, lz: t.lz, r: 1.1 })),
  };
}

// ---- Apex Motors, Keystone Realty, the terminal -----------------------------------------------

/** Apex Motors' showroom: three cars on turntables, the sales desk at the back. */
export const DEALER_PLAN = {
  halfW: DEALERSHIP.w / 2,
  depth: DEALERSHIP.d,
  turntables: [
    { lx: -12, lz: -9, r: 4.4 },
    { lx: 12, lz: -9, r: 4.4 },
    { lx: 0, lz: -19, r: 4.4 },
  ],
  desk: { lx0: 9, lx1: 17, lz0: -26, lz1: -24.4 },
  /** The touch-screen catalogue stand (press E there to browse and buy). */
  screen: { lx: -14, lz: -22 },
};

/** Keystone Realty: an office with a wall of listings and the agent's desk. */
export const REALTOR_PLAN = {
  halfW: REALTOR.w / 2,
  depth: REALTOR.d,
  desk: { lx0: -4, lx1: 4, lz0: -15, lz1: -13.4 },
  agent: { lx: 0, lz: -16.4 },
  /** Where you stand to talk to the agent. */
  client: { lx: 0, lz: -11.4 },
};

/** The terminal: check-in desks along the back, rows of seats, the departures board. */
export const TERMINAL_PLAN = {
  halfW: AIRPORT.terminal.w / 2,
  depth: AIRPORT.terminal.d,
  desks: [-48, -32, -16, 16, 32, 48].map((lx) => ({ lx0: lx - 5, lx1: lx + 5, lz0: -36, lz1: -34 })),
  seats: [-40, -20, 20, 40].flatMap((lx) => [-14, -20].map((lz) => ({ lx, lz }))),
  /** The doors out to the planes, at the back. */
  gateHalf: 4,
};

export const ROOMS: Room[] = [
  ...(Object.keys(SHOPS) as ShopKey[]).map(shopRoom),
  {
    key: "dealer",
    site: { x: DEALERSHIP.x, z: DEALERSHIP.z, turn: DEALERSHIP.turn },
    halfW: DEALER_PLAN.halfW,
    depth: DEALER_PLAN.depth,
    height: DEALERSHIP.h,
    wall: 0.6,
    doorHalf: 4.5,
    solids: [DEALER_PLAN.desk, { lx0: DEALER_PLAN.screen.lx - 0.8, lx1: DEALER_PLAN.screen.lx + 0.8, lz0: DEALER_PLAN.screen.lz - 0.4, lz1: DEALER_PLAN.screen.lz + 0.4 }],
    rounds: DEALER_PLAN.turntables.map((t) => ({ ...t, r: 2.9 })),
  },
  {
    key: "realtor",
    site: { x: REALTOR.x, z: REALTOR.z, turn: REALTOR.turn },
    halfW: REALTOR_PLAN.halfW,
    depth: REALTOR_PLAN.depth,
    height: REALTOR.h,
    wall: 0.6,
    doorHalf: 2.4,
    solids: [REALTOR_PLAN.desk],
    rounds: [],
  },
  {
    key: "terminal",
    site: { x: AIRPORT.terminal.x, z: AIRPORT.terminal.z, turn: AIRPORT.terminal.turn },
    halfW: TERMINAL_PLAN.halfW,
    depth: TERMINAL_PLAN.depth,
    height: AIRPORT.terminal.h,
    wall: 0.8,
    doorHalf: 6,
    solids: TERMINAL_PLAN.desks,
    rounds: [],
  },
];

export const roomOf = (key: RoomKey) => ROOMS.find((r) => r.key === key)!;

/** A box in a room's frame, as a world box. */
export function roomBox(site: Site, b: LocalBox): Box {
  const p = toWorld(site, (b.lx0 + b.lx1) / 2, (b.lz0 + b.lz1) / 2);
  return { x: p.x, z: p.z, hw: (b.lx1 - b.lx0) / 2, hd: (b.lz1 - b.lz0) / 2, turn: site.turn };
}

/** A room's four walls, with the doorway in the front (and the terminal's gate doors at the back). */
export function roomWalls(r: Room): LocalBox[] {
  const t = r.wall;
  const back = r.key === "terminal" ? TERMINAL_PLAN.gateHalf : 0;
  const list: LocalBox[] = [
    { lx0: -r.halfW, lx1: -r.doorHalf, lz0: -t, lz1: 0 },
    { lx0: r.doorHalf, lx1: r.halfW, lz0: -t, lz1: 0 },
    { lx0: -r.halfW, lx1: -r.halfW + t, lz0: -r.depth, lz1: 0 },
    { lx0: r.halfW - t, lx1: r.halfW, lz0: -r.depth, lz1: 0 },
  ];
  if (back) list.push({ lx0: -r.halfW, lx1: -back, lz0: -r.depth, lz1: -r.depth + t }, { lx0: back, lx1: r.halfW, lz0: -r.depth, lz1: -r.depth + t });
  else list.push({ lx0: -r.halfW, lx1: r.halfW, lz0: -r.depth, lz1: -r.depth + t });
  return list;
}

/** Is (x, z) inside this room (within its walls)? */
export function inRoom(r: Room, x: number, z: number, pad = 0) {
  const { lx, lz } = toLocal(r.site, x, z);
  return Math.abs(lx) < r.halfW - r.wall + pad && lz < -r.wall + pad && lz > -r.depth + r.wall - pad;
}
/** Which room you're in, if any. */
export function roomAt(x: number, z: number) {
  for (const r of ROOMS) if (inRoom(r, x, z)) return r;
  return null;
}
/** Where a spot in a room's frame is in the world. */
export const roomPoint = (key: RoomKey, lx: number, lz: number) => toWorld(roomOf(key).site, lx, lz);

// ---- Bumping into them ------------------------------------------------------------------------

const CELL = 40;
const grid = new Map<string, { boxes: Box[]; circles: Circle[]; walls: Box[] }>();
function cellAt(i: number, j: number) {
  const key = `${i},${j}`;
  let c = grid.get(key);
  if (!c) grid.set(key, (c = { boxes: [], circles: [], walls: [] }));
  return c;
}
function addTo(x: number, z: number, reach: number, add: (c: { boxes: Box[]; circles: Circle[]; walls: Box[] }) => void) {
  for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
    for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) add(cellAt(i, j));
}
/** Add something solid in a room's frame (houses-layout.ts uses this too). */
export function addSolid(site: Site, b: LocalBox, wall = false) {
  const box = roomBox(site, b);
  addTo(box.x, box.z, Math.hypot(box.hw, box.hd), (c) => (wall ? c.walls : c.boxes).push(box));
  return box;
}
export function addRound(site: Site, lx: number, lz: number, r: number) {
  const p = toWorld(site, lx, lz);
  const circle = { x: p.x, z: p.z, r };
  addTo(p.x, p.z, r, (c) => c.circles.push(circle));
}
/**
 * The airport's old buildings stand aside when the downloaded terminal has
 * loaded (asset-models.tsx sets this): the old terminal's walls and desks
 * and the old control tower stop being solid.
 */
export const airportSwap = { terminal: false };
/** Boxes that belong to the old airport buildings (skipped while airportSwap.terminal is on). */
const oldAirport = new Set<Box>();
/** Mark a solid box as one of the old airport buildings' (airport.tsx: the control tower). */
export const markOldAirport = (b: Box) => oldAirport.add(b);
const skip = (b: Box) => airportSwap.terminal && oldAirport.has(b);

for (const r of ROOMS) {
  for (const w of roomWalls(r)) {
    const b = addSolid(r.site, w, true);
    if (r.key === "terminal") oldAirport.add(b);
  }
  for (const s of r.solids) {
    const b = addSolid(r.site, s);
    if (r.key === "terminal") oldAirport.add(b);
  }
  for (const o of r.rounds) addRound(r.site, o.lx, o.lz, o.r);
}

/** Things that block you for a while (a locked house door, the estate gate's barrier): checked as well, while `on()` says so. */
const switchable: { box: Box; on: () => boolean }[] = [];
export function addSwitchable(box: Box, on: () => boolean) {
  switchable.push({ box, on });
}

/** Does a circle at (x, z) touch a wall, counter or desk in any of these buildings? */
export function roomsBlock(x: number, z: number, r: number) {
  const c = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (c) {
    for (const b of c.walls) if (!skip(b) && hitsBox(x, z, r, b)) return true;
    for (const b of c.boxes) if (!skip(b) && hitsBox(x, z, r, b)) return true;
    for (const o of c.circles) if (Math.hypot(x - o.x, z - o.z) < r + o.r) return true;
  }
  for (const s of switchable) if (Math.abs(s.box.x - x) < 30 && Math.abs(s.box.z - z) < 30 && s.on() && hitsBox(x, z, r, s.box)) return true;
  return false;
}
/** Just the walls (for the camera: it can see over counters). */
export function roomWallsBlock(x: number, z: number, r: number) {
  const c = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (c) for (const b of c.walls) if (!skip(b) && hitsBox(x, z, r, b)) return true;
  return false;
}
