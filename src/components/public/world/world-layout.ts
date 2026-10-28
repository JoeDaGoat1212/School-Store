import type { UnitKey } from "../store/catalog";
import type { UnitLayout } from "../store/layout";

/*
 * The floor plan of the 3D store world. Plain numbers only (no 3D code).
 *
 * Scene units: a soda can is 0.68 tall. The building's front wall is at z = 0
 * and the parking lot is in front of it (+z); inside, the store goes back into
 * -z. x runs left to right as you face the store. The floor is y = 0.
 */

export const BUILDING = {
  halfWidth: 28,
  depth: 40,
  height: 13,
  wall: 0.6,
  /** The double doors: half their combined width, and their height. */
  doorHalf: 3.8,
  doorHeight: 7.6,
  /** The big front windows, left and right of the doors (x from–to, y from–to). */
  windowX: [6, 22] as [number, number],
  windowY: [1.6, 8.4] as [number, number],
};
/** Inside faces of the walls. */
export const INSIDE = {
  front: -BUILDING.wall,
  back: -BUILDING.depth + BUILDING.wall,
  left: -BUILDING.halfWidth + BUILDING.wall,
  right: BUILDING.halfWidth - BUILDING.wall,
};

/** How high your eyes are when you walk around inside. */
export const EYE = 5.4;

export type Place = { x: number; z: number; turn: number };

/** Where the fridge, the snack shelf and the candy stand go (their front centre, and which way they face). */
export function placeUnits(units: Record<UnitKey, UnitLayout | null>): Record<UnitKey, Place | null> {
  return {
    drinks: units.drinks ? { x: -12, z: INSIDE.back + units.drinks.depth + 0.1, turn: 0 } : null,
    snacks: units.snacks ? { x: 5, z: INSIDE.back + units.snacks.depth + 0.1, turn: 0 } : null,
    // In the back right corner, turned a little toward the middle of the store.
    candy: units.candy ? { x: 19, z: -35, turn: -0.5 } : null,
  };
}

/** The deals board: on a stand to the left as you walk in, turned to face the doors. */
export const BULLETIN = (() => {
  const x = -14;
  const z = -18;
  // Face the middle of the doors.
  const turn = Math.atan2(0 - x, INSIDE.front - z);
  return { x, z, turn, width: 6.4, height: 4, bottom: 1.9 };
})();

/**
 * The request table: front left, just inside the doors, angled toward the
 * middle of the store. Someone sits behind it with a computer; students walk
 * up and ask the store to sell something.
 */
export const REQUEST_DESK = (() => {
  const x = -21;
  const z = -7.5;
  // Face a point in the middle of the store.
  const turn = Math.atan2(0 - x, -18 - z);
  return { x, z, turn };
})();

/** The three checkout lanes on the right: where each register is, and how long the belt runs back from it. */
export const LANES = [10, 15, 20].map((x, i) => ({ number: i + 1, x, front: -11, length: 6.5 }));
/** Height of the checkout counters. */
export const COUNTER = 3.1;

// ---- Where you can stand ------------------------------------------------------------------

export type StationKey = "outside" | "entrance" | "deals" | "requests" | "center" | "drinks" | "snacks" | "candy" | "checkout" | "walk";

export type Station = {
  key: StationKey;
  /** Shown on its floor arrow. */
  label: string;
  /** Where you stand … */
  x: number;
  z: number;
  /** … where its floor arrow is drawn (if not right where you stand) … */
  marker?: { x: number; z: number };
  /** … and what you look at when you get there. */
  look: [number, number, number];
  /** The floor arrows you can see from here (where you can walk next). */
  next: StationKey[];
};

const along = (x: number, z: number, turn: number, d: number) => ({ x: x + Math.sin(turn) * d, z: z + Math.cos(turn) * d });

/** Every spot you can walk to, with the arrows that lead on from it. */
export function stations(places: Record<UnitKey, Place | null>, units: Record<UnitKey, UnitLayout | null>): Record<StationKey, Station> {
  const front = (key: UnitKey, d: number, fallback: { x: number; z: number }) => {
    const p = places[key];
    return p ? along(p.x, p.z, p.turn, d) : fallback;
  };
  const middle = (key: UnitKey, fallback: [number, number, number]): [number, number, number] => {
    const p = places[key];
    const u = units[key];
    return p && u ? [p.x, (u.base + u.height) / 2 + 0.6, p.z - 0.4] : fallback;
  };
  const deals = along(BULLETIN.x, BULLETIN.z, BULLETIN.turn, 11.5);
  const dealsArrow = along(BULLETIN.x, BULLETIN.z, BULLETIN.turn, 3.4);
  const drinks = front("drinks", 8, { x: -12, z: -28 });
  const snacks = front("snacks", 8, { x: 5, z: -28 });
  const candy = front("candy", 7, { x: 15, z: -29 });
  const desk = along(REQUEST_DESK.x, REQUEST_DESK.z, REQUEST_DESK.turn, 8.8);
  const deskArrow = along(REQUEST_DESK.x, REQUEST_DESK.z, REQUEST_DESK.turn, 3.6);
  const lane = LANES[0];

  return {
    outside: { key: "outside", label: "Outside", x: 0, z: 30, look: [0, 5, -10], next: [] },
    entrance: { key: "entrance", label: "Entrance", x: 0, z: -1, look: [-2, 2.6, -24], next: ["deals", "center", "requests"] },
    deals: { key: "deals", label: "Deals & rewards", x: deals.x, z: deals.z, marker: dealsArrow, look: [BULLETIN.x, BULLETIN.bottom + 3.2, BULLETIN.z], next: ["center", "drinks", "requests"] },
    // In front of the request table, looking at the person behind it.
    requests: { key: "requests", label: "Request items", x: desk.x, z: desk.z, marker: deskArrow, look: [REQUEST_DESK.x, 4.4, REQUEST_DESK.z], next: ["center", "deals", "drinks"] },
    center: { key: "center", label: "Shop the store", x: 0, z: -13, look: [0, 3.4, -39], next: ["drinks", "snacks", "candy", "deals", "requests", "checkout"] },
    drinks: { key: "drinks", label: "Drinks", x: drinks.x, z: drinks.z, look: middle("drinks", [-12, 4.5, -38]), next: ["snacks", "candy", "center"] },
    snacks: { key: "snacks", label: "Snacks", x: snacks.x, z: snacks.z, look: middle("snacks", [5, 3.5, -38]), next: ["drinks", "candy", "center"] },
    candy: { key: "candy", label: "Candy", x: candy.x, z: candy.z, look: middle("candy", [19, 4.4, -35]), next: ["snacks", "drinks", "center"] },
    // Standing on the customer's side of lane 1, looking along the belt to the register.
    checkout: { key: "checkout", label: "Checkout", x: lane.x - 5.4, z: lane.front - 2.0, look: [lane.x + 0.6, COUNTER + 0.7, lane.front - 1.6], next: ["center", "candy", "deals"] },
    // Walking around with the arrow keys / WASD: not at any spot in particular.
    walk: { key: "walk", label: "Walking", x: 0, z: -13, look: [0, 3.4, -39], next: [] },
  };
}

/** Which unit's products you can tap from a spot (only when you're standing at that unit). */
export function unitAt(station: StationKey): UnitKey | null {
  return station === "drinks" || station === "snacks" || station === "candy" ? station : null;
}

// ---- Walking with the keyboard ----------------------------------------------------------------

/** A box you can't walk through: centre, half-width, half-depth, and which way it's turned. */
export type Blocker = { x: number; z: number; hw: number; hd: number; turn: number };

/** Everything on the shop floor you'd bump into, for walking with the arrow keys. */
export function blockers(places: Record<UnitKey, Place | null>, units: Record<UnitKey, UnitLayout | null>): Blocker[] {
  const list: Blocker[] = [];
  for (const key of ["drinks", "snacks", "candy"] as UnitKey[]) {
    const p = places[key];
    const u = units[key];
    // A unit's place is its front edge; it goes back from there.
    if (p && u) list.push({ x: p.x - Math.sin(p.turn) * (u.depth / 2), z: p.z - Math.cos(p.turn) * (u.depth / 2), hw: u.width / 2, hd: u.depth / 2, turn: p.turn });
  }
  for (const lane of LANES) list.push({ x: lane.x + 0.6, z: lane.front - lane.length / 2, hw: 1.6, hd: lane.length / 2 + 0.4, turn: 0 });
  list.push({ x: BULLETIN.x, z: BULLETIN.z, hw: BULLETIN.width / 2 + 0.3, hd: 0.6, turn: BULLETIN.turn });
  list.push({ x: REQUEST_DESK.x - Math.sin(REQUEST_DESK.turn) * 0.8, z: REQUEST_DESK.z - Math.cos(REQUEST_DESK.turn) * 0.8, hw: 2.6, hd: 2.2, turn: REQUEST_DESK.turn });
  return list;
}

/** The nearest spot to stand within `radius` of a point (or null), for walking up to things with the keys. */
export function nearestStation(spots: Record<StationKey, Station>, x: number, z: number, radius = 3.2): StationKey | null {
  let best: StationKey | null = null;
  let bestD = radius;
  for (const s of Object.values(spots)) {
    if (s.key === "outside" || s.key === "walk" || s.key === "entrance") continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = s.key;
    }
  }
  return best;
}
