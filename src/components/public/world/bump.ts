import { hitsCity } from "./city-layout";
import { player } from "./you";
import { LAMPS, TREES } from "./exterior";
import { parkedSpots } from "./fleet";
import { heistBlocks } from "./heist";
import { hitsBaseRock, hitsPine } from "./terrain";
import { jailBlocks } from "./jail-layout";
import { roomsBlock, roomWallsBlock } from "./rooms";
import { hitsBox, townObstaclesNear, type Box } from "./town-layout";
import { WORLD_BOUNDS as WORLD } from "./world-map";
import { doors, STORE, STORE_SCALE, type Blocker } from "./world-layout";

/*
 * Who is where, and what you can bump into. Plain numbers (no 3D code), shared
 * by the walking camera, your car, and the traffic, so none of them go through
 * walls, houses, trees or each other.
 */

/** You, on foot (the camera moves this). It lives in you.ts, so plain-number modules can use it without the scenery. */
export { player };

// (The doors' open/shut state lives in world-layout.ts, so the doors in exterior.tsx can read it.)
export { doors };

/** A car's position and which way it faces (its front is toward -z when heading is 0). */
export type CarSpot = { x: number; z: number; heading: number };

/** Where each parked (drivable) vehicle is now (fleet.ts). They stay wherever you leave them. */
export { parkedSpots };
/** Where each traffic car is now (traffic.tsx keeps this up to date). */
export const trafficSpots: CarSpot[] = [];
/** Where each police car is now (city-police.tsx keeps this up to date; far away while they're not out). */
export const copSpots: CarSpot[] = Array.from({ length: 4 }, () => ({ x: -9999, z: -9999, heading: 0 }));

export const CAR_RADIUS = 1.8;

/** Two circles cover a car: its front half and its back half. */
export function carCircles(c: CarSpot) {
  const fx = -Math.sin(c.heading);
  const fz = -Math.cos(c.heading);
  return [
    { x: c.x + fx * 1.75, z: c.z + fz * 1.75 },
    { x: c.x - fx * 1.75, z: c.z - fz * 1.75 },
  ];
}

// The store's size in world units (it's drawn shrunk; see STORE_SCALE).
const { halfWidth: HW, depth: D, wall: T, doorHalf } = STORE;
const box = (x0: number, x1: number, z0: number, z1: number): Box => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, turn: 0 });

/** The store's walls (with a gap for the doors), as seen by someone on foot. */
const WALLS: Box[] = [
  box(-HW, -doorHalf, -T, 0), // front wall, left of the doors (the windows are in it)
  box(doorHalf, HW, -T, 0), // front wall, right of the doors
  box(-HW, -HW + T, -D, 0), // left wall
  box(HW - T, HW, -D, 0), // right wall
  box(-HW, HW, -D, -D + T), // back wall
];
const DOORWAY = box(-doorHalf, doorHalf, -T, 0);
/** The planters with shrubs under the front windows. */
const [w0, w1] = STORE.windowX;
const PLANTERS: Box[] = [-1, 1].map((s) => ({ x: (s * (w0 + w1)) / 2, z: 1.4 * STORE_SCALE, hw: (w1 - w0) / 2, hd: 0.8 * STORE_SCALE, turn: 0 }));

/** Is the point inside the store's walls? */
export function inStore(x: number, z: number) {
  return Math.abs(x) < HW && z < 0 && z > -D;
}

/** Trees, lamp posts, houses, street lights and the city's buildings: does a circle of radius r at (x, z) touch one? */
function hitsScenery(x: number, z: number, r: number) {
  if (x > 470 && (hitsCity(x, z, r) || heistBlocks(x, z, r))) return true;
  if (hitsPine(x, z, r)) return true;
  if (roomsBlock(x, z, r)) return true;
  if (x > 1200 && jailBlocks(x, z, r)) return true;
  if (z < -700 && hitsBaseRock(x, z, r)) return true;
  for (const [lx, lz] of LAMPS) if (Math.hypot(x - lx, z - lz) < r + 0.35) return true;
  for (const [tx, tz, s] of TREES) if (Math.hypot(x - tx, z - tz) < r + 0.6 * s) return true;
  const near = townObstaclesNear(x, z);
  for (const b of near.boxes) if (hitsBox(x, z, r, b)) return true;
  for (const c of near.circles) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
  return x < WORLD.minX + r || x > WORLD.maxX - r || z < WORLD.minZ + r || z > WORLD.maxZ - r;
}

/** Does a circle at (x, z) touch any car (except `skip`)? */
function hitsCar(x: number, z: number, r: number, skip?: CarSpot) {
  for (const list of [parkedSpots, trafficSpots, copSpots])
    for (const c of list) {
      if (c === skip || Math.abs(c.x - x) > 8 || Math.abs(c.z - z) > 8) continue;
      for (const p of carCircles(c)) if (Math.hypot(x - p.x, z - p.z) < r + CAR_RADIUS) return true;
    }
  return false;
}

/** How close you can get to things when walking. */
export const BODY = 0.9;

/**
 * Would someone on foot standing here bump into something? `inside` is the
 * shelves and counters in the store (from world-layout's blockers()).
 */
export function walkBlocked(x: number, z: number, inside: Blocker[]) {
  const r = BODY;
  for (const b of WALLS) if (hitsBox(x, z, r, b)) return true;
  if (!doors.open && hitsBox(x, z, r, DOORWAY)) return true;
  if (inStore(x, z)) {
    for (const b of inside) if (hitsBox(x, z, r, b)) return true;
    return false;
  }
  for (const b of PLANTERS) if (hitsBox(x, z, r, b)) return true;
  return hitsScenery(x, z, r) || hitsCar(x, z, r);
}

/** Is the camera's view blocked here (a wall or building between it and you)? Cars and trees don't count. */
export function viewBlocked(x: number, z: number, inside: Blocker[]) {
  for (const b of WALLS) if (hitsBox(x, z, 0.25, b)) return true;
  if (inStore(x, z)) {
    for (const b of inside) if (hitsBox(x, z, 0.1, b)) return true;
    return false;
  }
  if (x > 470 && hitsCity(x, z, 0.25)) return true;
  if (roomWallsBlock(x, z, 0.25)) return true;
  for (const b of townObstaclesNear(x, z).boxes) if (hitsBox(x, z, 0.25, b)) return true;
  return false;
}

/** Would car `self`, moved to `c`, hit something there? (The store, scenery, other cars, or people walking.) */
export function carBlocked(c: CarSpot, self: CarSpot, people: { x: number; z: number }[]) {
  for (const p of carCircles(c)) {
    const r = CAR_RADIUS;
    // The store, with its sidewalk and planters out front.
    if (p.x > -HW - r && p.x < HW + r && p.z > -D - r && p.z < 2.6 + r) return true;
    if (hitsScenery(p.x, p.z, r) || hitsCar(p.x, p.z, r, self)) return true;
    for (const w of people) if (Math.abs(w.x - p.x) < 4 && Math.hypot(w.x - p.x, w.z - p.z) < r + 0.6) return true;
  }
  return false;
}
