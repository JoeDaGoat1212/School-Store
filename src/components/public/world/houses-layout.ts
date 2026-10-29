import { toWorld, type Site } from "./city-layout";
import { registerHomeDoor } from "./homes";
import { profile } from "./profile";
import { addSolid, addSwitchable, roomBox, type LocalBox } from "./rooms";
import { CURB } from "./town-layout";
import { nameHouse } from "./wallet-names";
import { CROSS_DRIVE, ESTATE_DRIVE, ESTATES, ESTATES_ROAD } from "./world-map";

export { CROSS_DRIVE, ESTATE_DRIVE };

/*
 * The homes for sale (Keystone Realty sells them): six on Willow Lane, the
 * road down to Crescent Heights, from a $150,000 cottage to an $875,000
 * A-frame; and six mansions inside Crescent Heights' gates, from a $1.65M
 * villa to the $20M Crescent Crown. The pricier, the bigger. Plain numbers;
 * home-models.tsx draws them, realty.ts sells them.
 *
 * Each home is laid out in its own frame (like the shops): lx across the
 * front, lz out of the front door, so the inside is at lz < 0. You can walk
 * into the ground floor (once it's yours, or on a tour): the living room
 * at the front, the kitchen at the back left, a bedroom at the back right.
 */

export type HomeStyle = "cottage" | "bungalow" | "craftsman" | "modern" | "colonial" | "aframe" | "villa" | "glass" | "tuscan" | "contemporary" | "chateau" | "crown";
export type Extra = "pool" | "garage" | "tennis" | "helipad" | "hottub" | "fountain" | "gym" | "theater" | "porch" | "deck";

export type Home = {
  id: string;
  name: string;
  price: number;
  style: HomeStyle;
  area: "willow" | "estates";
  site: Site;
  /** Across the front, and front to back. */
  w: number;
  d: number;
  floors: number;
  /** Height of one floor. */
  storey: number;
  beds: number;
  baths: number;
  sqft: number;
  extras: Extra[];
  blurb: string;
  wall: string;
  roof: string;
  trim: string;
};

const WILLOW = ESTATES_ROAD.x;
/** Facing the road from its west side (front faces +x) or east side (front faces -x). */
const west = (z: number, setback: number): Site => ({ x: WILLOW - (CURB + setback), z, turn: Math.PI / 2 });
const east = (z: number, setback: number): Site => ({ x: WILLOW + CURB + setback, z, turn: -Math.PI / 2 });
/* (A home's site is the middle of its front wall; it goes back d from there.) */


export const HOMES: Home[] = [
  // ---- Willow Lane ----
  { id: "sparrow", name: "Sparrow Cottage", price: 150000, style: "cottage", area: "willow", site: west(452, 7), w: 12, d: 10, floors: 1, storey: 3.6, beds: 1, baths: 1, sqft: 640, extras: [], blurb: "A snug little starter cottage with blue shutters.", wall: "#f4e3c1", roof: "#4b5563", trim: "#3d6fe0" },
  { id: "maple", name: "Maple Bungalow", price: 245000, style: "bungalow", area: "willow", site: east(452, 7), w: 14, d: 11, floors: 1, storey: 3.6, beds: 2, baths: 1, sqft: 1050, extras: ["porch"], blurb: "A cheerful bungalow with a wide front porch.", wall: "#cfe3ef", roof: "#2f4858", trim: "#ffffff" },
  { id: "juniper", name: "Juniper Craftsman", price: 389000, style: "craftsman", area: "willow", site: west(494, 7), w: 16, d: 12, floors: 1, storey: 3.8, beds: 3, baths: 2, sqft: 1600, extras: ["porch"], blurb: "Stone columns, a deep porch and a big back yard.", wall: "#7d8f6a", roof: "#5b3a26", trim: "#f2f0ea" },
  { id: "cube", name: "The Cube", price: 525000, style: "modern", area: "willow", site: east(494, 7), w: 16, d: 13, floors: 2, storey: 3.6, beds: 3, baths: 2.5, sqft: 2100, extras: ["deck"], blurb: "Crisp modern lines, floor-to-ceiling glass and a roof deck.", wall: "#f2f2f2", roof: "#2b2f36", trim: "#b07a4a" },
  { id: "birchwood", name: "Birchwood Colonial", price: 690000, style: "colonial", area: "willow", site: west(536, 7), w: 20, d: 13, floors: 2, storey: 3.6, beds: 4, baths: 3, sqft: 2700, extras: ["porch", "garage"], blurb: "A grand red-brick colonial with white columns.", wall: "#a8452f", roof: "#2b2f36", trim: "#ffffff" },
  { id: "alpine", name: "Alpine A-Frame", price: 875000, style: "aframe", area: "willow", site: east(536, 7), w: 16, d: 15, floors: 2, storey: 3.8, beds: 3, baths: 2, sqft: 2850, extras: ["deck", "hottub"], blurb: "A soaring timber A-frame with a hot tub on the deck.", wall: "#8b5a3c", roof: "#1f2a24", trim: "#e8d2a8" },
  // ---- Crescent Heights ----
  { id: "palmcourt", name: "Palm Court Villa", price: 1650000, style: "villa", area: "estates", site: { x: -(CURB + 14), z: 650, turn: Math.PI / 2 }, w: 26, d: 20, floors: 2, storey: 4, beds: 4, baths: 4, sqft: 4200, extras: ["pool", "garage"], blurb: "A sunny Spanish villa with a palm-lined pool.", wall: "#f6ead6", roof: "#c0582f", trim: "#5b3a26" },
  { id: "glasshouse", name: "The Glass House", price: 2900000, style: "glass", area: "estates", site: { x: CURB + 14, z: 650, turn: -Math.PI / 2 }, w: 30, d: 22, floors: 2, storey: 4.2, beds: 5, baths: 5, sqft: 5600, extras: ["pool", "garage"], blurb: "Walls of glass, an infinity pool and a cantilevered deck.", wall: "#e9ecef", roof: "#2b2f36", trim: "#1b1d21" },
  { id: "toscana", name: "Villa Toscana", price: 4750000, style: "tuscan", area: "estates", site: { x: -(CURB + 16), z: 852, turn: Math.PI / 2 }, w: 36, d: 26, floors: 2, storey: 4.4, beds: 6, baths: 6, sqft: 7800, extras: ["pool", "fountain", "garage"], blurb: "An Italian estate with a stone tower, olive trees and a fountain.", wall: "#e8c99a", roof: "#a8452f", trim: "#6b4329" },
  { id: "skyline", name: "Skyline Contemporary", price: 7200000, style: "contemporary", area: "estates", site: { x: 250, z: CROSS_DRIVE.z + CURB + 16, turn: Math.PI }, w: 40, d: 28, floors: 3, storey: 4.2, beds: 7, baths: 8, sqft: 10500, extras: ["pool", "gym", "garage"], blurb: "Three stacked glass floors, a home gym and a rooftop lounge.", wall: "#f4f5f7", roof: "#1b1d21", trim: "#8b5a3c" },
  { id: "chateau", name: "Château Belmont", price: 12500000, style: "chateau", area: "estates", site: { x: -250, z: CROSS_DRIVE.z + CURB + 18, turn: Math.PI }, w: 50, d: 32, floors: 3, storey: 4.6, beds: 9, baths: 10, sqft: 15000, extras: ["tennis", "fountain", "pool"], blurb: "A French château with turrets, a tennis court and formal gardens.", wall: "#e6dfd0", roof: "#3a4150", trim: "#c9a227" },
  { id: "crown", name: "The Crescent Crown", price: 20000000, style: "crown", area: "estates", site: { x: 0, z: ESTATE_DRIVE.to + CURB + 12, turn: Math.PI }, w: 64, d: 40, floors: 3, storey: 5, beds: 12, baths: 14, sqft: 24000, extras: ["pool", "tennis", "helipad", "theater", "gym", "fountain", "garage"], blurb: "The biggest home in the city: a white-marble palace with a helipad, a cinema and two pools.", wall: "#fbfaf6", roof: "#1f3a5f", trim: "#d4a017" },
];

for (const h of HOMES) nameHouse(h.id, `${h.name}, ${h.area === "estates" ? "Crescent Heights" : "Willow Lane"}`);
export const homeOf = (id: string) => HOMES.find((h) => h.id === id);

// ---- Inside ---------------------------------------------------------------------------------------

/** A home's ground floor plan, in its own frame. */
export function homePlan(h: Home) {
  const W = h.w / 2;
  const D = h.d;
  const t = 0.4;
  const doorHalf = h.w > 30 ? 2 : 1.3;
  /** The wall across the middle (living room in front, kitchen and bedroom behind), with a doorway. */
  const midZ = -D * 0.52;
  const midDoor = 1.6;
  return {
    W,
    D,
    t,
    doorHalf,
    midZ,
    midDoor,
    /** The wall between the kitchen (left) and the bedroom (right), with a doorway near the middle wall. */
    splitX: 0,
    splitDoorZ: midZ - 2.2,
    walls: [
      { lx0: -W, lx1: -doorHalf, lz0: -t, lz1: 0 },
      { lx0: doorHalf, lx1: W, lz0: -t, lz1: 0 },
      { lx0: -W, lx1: -W + t, lz0: -D, lz1: 0 },
      { lx0: W - t, lx1: W, lz0: -D, lz1: 0 },
      { lx0: -W, lx1: W, lz0: -D, lz1: -D + t },
      // Inside
      { lx0: -W, lx1: -midDoor, lz0: midZ - t / 2, lz1: midZ + t / 2 },
      { lx0: midDoor, lx1: W, lz0: midZ - t / 2, lz1: midZ + t / 2 },
      { lx0: -t / 2, lx1: t / 2, lz0: -D, lz1: midZ - 3.6 },
    ] as LocalBox[],
    door: { lx0: -doorHalf, lx1: doorHalf, lz0: -t, lz1: 0 } as LocalBox,
    /** Spots for the tour camera and the furniture. */
    living: { lx: 0, lz: midZ / 2 },
    kitchen: { lx: -W / 2, lz: (midZ - D) / 2 },
    bedroom: { lx: W / 2, lz: (midZ - D) / 2 },
  };
}

/** Is (x, z) inside this home's ground floor? */
export function inHome(h: Home, x: number, z: number) {
  const dx = x - h.site.x;
  const dz = z - h.site.z;
  const c = Math.cos(h.site.turn);
  const n = Math.sin(h.site.turn);
  const lx = dx * c - dz * n;
  const lz = dx * n + dz * c;
  return Math.abs(lx) < h.w / 2 && lz < 0 && lz > -h.d;
}
export const homePoint = (h: Home, lx: number, lz: number) => toWorld(h.site, lx, lz);

// ---- Who can get in -------------------------------------------------------------------------------

/** The home being toured right now (its door's open), if any. */
export const access = { touring: null as string | null, gateOpenUntil: 0, now: 0 };
export const ownsHome = (id: string) => profile.houses.includes(id);
export const isResident = () => profile.houses.some((id) => homeOf(id)?.area === "estates");
export const doorOpenFor = (h: Home) => ownsHome(h.id) || access.touring === h.id;

for (const h of HOMES) {
  const P = homePlan(h);
  for (const w of P.walls) addSolid(h.site, w, true);
  // Furniture you bump into: the kitchen island and the bed.
  addSolid(h.site, { lx0: P.kitchen.lx - 1.6, lx1: P.kitchen.lx + 1.6, lz0: P.kitchen.lz - 0.8, lz1: P.kitchen.lz + 0.8 });
  addSolid(h.site, { lx0: P.bedroom.lx - 1.4, lx1: P.bedroom.lx + 1.4, lz0: P.bedroom.lz - 2.2, lz1: P.bedroom.lz + 1 });
  // The front door: locked unless it's yours (or you're on a tour).
  addSwitchable(roomBox(h.site, P.door), () => !doorOpenFor(h));
  // Owners wake up on their doorstep.
  const step = homePoint(h, 0, 3);
  registerHomeDoor(h.id, { x: step.x, z: step.z, yaw: h.site.turn });
}

// ---- Crescent Heights' wall and gate ------------------------------------------------------------

const E = ESTATES;
const ORIGIN: Site = { x: 0, z: 0, turn: 0 };
/** Where the wall runs (it's drawn by home-models.tsx). */
export const ESTATE_WALL = { x0: E.minX, x1: E.maxX, z0: E.gate.z, z1: E.maxZ, gapHalf: CURB, t: 1.2, h: 3.2 };
{
  const W = ESTATE_WALL;
  addSolid(ORIGIN, { lx0: W.x0, lx1: -W.gapHalf - 5, lz0: W.z0 - W.t / 2, lz1: W.z0 + W.t / 2 }, true);
  addSolid(ORIGIN, { lx0: W.gapHalf + 5, lx1: W.x1, lz0: W.z0 - W.t / 2, lz1: W.z0 + W.t / 2 }, true);
  addSolid(ORIGIN, { lx0: W.x0 - W.t / 2, lx1: W.x0 + W.t / 2, lz0: W.z0, lz1: W.z1 }, true);
  addSolid(ORIGIN, { lx0: W.x1 - W.t / 2, lx1: W.x1 + W.t / 2, lz0: W.z0, lz1: W.z1 }, true);
  addSolid(ORIGIN, { lx0: W.x0, lx1: W.x1, lz0: W.z1 - W.t / 2, lz1: W.z1 + W.t / 2 }, true);
  // The gatehouse in the middle of the road (cars go either side of it), and the barriers.
  addSolid(ORIGIN, { lx0: -2.2, lx1: 2.2, lz0: W.z0 - 3, lz1: W.z0 + 3 });
  addSolid(ORIGIN, { lx0: -W.gapHalf - 5, lx1: -W.gapHalf, lz0: W.z0 - W.t / 2, lz1: W.z0 + W.t / 2 }, true);
  addSolid(ORIGIN, { lx0: W.gapHalf, lx1: W.gapHalf + 5, lz0: W.z0 - W.t / 2, lz1: W.z0 + W.t / 2 }, true);
  for (const s of [-1, 1]) addSwitchable(roomBox(ORIGIN, { lx0: s < 0 ? -W.gapHalf : 2.2, lx1: s < 0 ? -2.2 : W.gapHalf, lz0: W.z0 - 0.4, lz1: W.z0 + 0.4 }), () => access.now > access.gateOpenUntil);
}
/** Inside Crescent Heights? */
export const inEstates = (x: number, z: number) => x > E.minX && x < E.maxX && z > E.gate.z && z < E.maxZ;
