/*
 * Where the city is: a grid of big streets just east of the town (+x), with
 * the town's three avenues running straight on into it. Plain numbers only
 * (no imports), so both the town (town-layout.ts) and the city
 * (city-layout.ts) can use them without importing each other.
 *
 * Driving out of the store's driveway and turning right onto the main road
 * (Avenue z = 58) takes you straight into the city: the bank is on your left
 * as you arrive, the jewelry shop across the road from it.
 */

/** City streets running front–back (z), at these x. */
export const CITY_STREETS_X = [560, 680, 800, 920, 1040];
/** City-only avenues running left–right (x), at these z. (The town's avenues at z = -110, 58 and 220 run through too.) */
export const CITY_AVENUES_Z = [-230, -26, 140, 330];
/** How far the city's own streets and avenues run. */
export const CITY_SPAN_X: [number, number] = [CITY_STREETS_X[0], CITY_STREETS_X[CITY_STREETS_X.length - 1]];
export const CITY_SPAN_Z: [number, number] = [CITY_AVENUES_Z[0], CITY_AVENUES_Z[CITY_AVENUES_Z.length - 1]];
/** The city's land: no houses or meadow trees here. */
export const CITY_AREA = { minX: 480, maxX: 1120, minZ: -300, maxZ: 400 };

export const inCity = (x: number, z: number, pad = 0) =>
  x > CITY_AREA.minX - pad && x < CITY_AREA.maxX + pad && z > CITY_AREA.minZ - pad && z < CITY_AREA.maxZ + pad;

/**
 * The bank: on the main road's north side as you come into the city, its
 * front (and the steps up to its doors) facing the road (+z). x is the middle
 * of its front, `front` the z of its front wall; it goes back `d` into -z.
 */
export const BANK_SITE = { x: 620, front: 36, w: 44, d: 34, h: 15 };
/**
 * The jewelry shop: on the far side of the city from the bank (the south-east
 * corner), its front facing the avenue to its north (-z); it goes back `d` into +z.
 */
export const JEWELRY_SITE = { x: 980, front: 244, w: 30, d: 24, h: 10 };

/** Bits of sidewalk kept free of trees: in front of the bank, the dealership and the jewelry shop, so cars can pull in. */
export const CITY_KEEP_CLEAR = [
  { x: 606, z: 48, hw: 36, hd: 4 },
  { x: 610, z: 68, hw: 48, hd: 4 },
  { x: 980, z: 232, hw: 22, hd: 4 },
];
