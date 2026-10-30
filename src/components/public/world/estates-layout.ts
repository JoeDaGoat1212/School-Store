import { CROSS_DRIVE, ESTATE_DRIVE, ESTATES } from "./world-map";
import { CURB } from "./town-layout";
import { HOMES } from "./houses-layout";

/*
 * Crescent Heights' grounds, worked out (plain numbers; estates.tsx draws
 * them): the avenue trees and lamps down both drives, Heights Park in the
 * east (a pond with a gazebo, a loop path, a fountain), the formal Parterre
 * Garden in the west (box hedges, roses, a tiered fountain, a pergola), the
 * sculpture lawn, and more art-piece houses (scenery: not for sale) on the
 * free plots. Also what you bump into among them.
 */

export type Lot = { x: number; z: number; turn: number; w: number; d: number; seed: number; front: number; style?: "modern" | "mediterranean" | "classical" };
export type Ellipse = { x: number; z: number; rx: number; rz: number; turn: number };

/** Heights Park (east of the drive, north of the cross drive) and its pond. */
export const PARK = { x0: 105, x1: 305, z0: 598, z1: 738 };
export const POND: Ellipse = { x: 205, z: 662, rx: 56, rz: 30, turn: 0.12 };
export const GAZEBO = { x: 205, z: 712, r: 5.5 };
/** The Parterre Garden (west of the drive). */
export const GARDEN = { x0: -305, x1: -105, z0: 598, z1: 738 };
export const GARDEN_FOUNTAIN = { x: -205, z: 668, r: 6 };

/** The art houses on the free plots (each faces a drive or the view). */
export const ESTATE_LOTS: Lot[] = [
  { x: 365, z: CROSS_DRIVE.z - CURB - 12, turn: 0, w: 36, d: 26, seed: 3101, front: 8, style: "modern" },
  { x: -365, z: CROSS_DRIVE.z - CURB - 12, turn: 0, w: 36, d: 26, seed: 3102, front: 8, style: "classical" },
  { x: CURB + 14, z: 852, turn: -Math.PI / 2, w: 30, d: 24, seed: 3103, front: 8, style: "mediterranean" },
  { x: 160, z: 918, turn: Math.PI, w: 34, d: 24, seed: 3104, front: 14, style: "modern" },
  { x: 345, z: 920, turn: Math.PI, w: 36, d: 24, seed: 3105, front: 14, style: "mediterranean" },
  { x: -160, z: 930, turn: Math.PI, w: 34, d: 24, seed: 3106, front: 14, style: "classical" },
  { x: -360, z: 925, turn: Math.PI, w: 38, d: 26, seed: 3107, front: 14, style: "modern" },
];

/** Avenue trees along both drives (skipping the junction and driveways). */
export const AVENUE_TREES: { x: number; z: number; s: number }[] = (() => {
  const out: { x: number; z: number; s: number }[] = [];
  const homesNear = (x: number, z: number) => HOMES.some((h) => h.area === "estates" && Math.hypot(h.site.x - x, h.site.z - z) < Math.max(h.w, h.d) * 0.55 + 4);
  const lotsNear = (x: number, z: number) => ESTATE_LOTS.some((l) => Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) * 0.55 + 3);
  const off = CURB + 2.5;
  for (let z = ESTATE_DRIVE.from + 14; z < ESTATE_DRIVE.to - 6; z += 15) {
    if (Math.abs(z - CROSS_DRIVE.z) < CURB + 6) continue;
    for (const s of [-1, 1]) {
      const x = s * off;
      if (HOMES.some((h) => h.area === "estates" && Math.abs(h.site.z - z) < 8 && Math.abs(h.site.x - x) < 40)) continue;
      if (ESTATE_LOTS.some((l) => Math.abs(l.z - z) < 8 && Math.abs(l.x - x) < 40)) continue;
      out.push({ x, z, s: 1.05 + ((z * 7) % 5) / 20 });
    }
  }
  for (let x = CROSS_DRIVE.from + 10; x < CROSS_DRIVE.to - 4; x += 15) {
    if (Math.abs(x) < CURB + 6) continue;
    for (const s of [-1, 1]) {
      const z = CROSS_DRIVE.z + s * off;
      if (homesNear(x, z) || lotsNear(x, z)) continue;
      if (HOMES.some((h) => h.area === "estates" && Math.abs(h.site.x - x) < 7 && Math.abs(h.site.z - z) < 40)) continue;
      out.push({ x, z, s: 1.05 + ((x * 3) % 5) / 20 });
    }
  }
  return out;
})();

/** Street lamps between the avenue trees. */
export const AVENUE_LAMPS: { x: number; z: number; turn: number }[] = (() => {
  const out: { x: number; z: number; turn: number }[] = [];
  const off = CURB + 0.8;
  for (let z = ESTATE_DRIVE.from + 21; z < ESTATE_DRIVE.to - 6; z += 30) for (const s of [-1, 1]) if (Math.abs(z - CROSS_DRIVE.z) > CURB + 4) out.push({ x: s * off, z, turn: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  for (let x = CROSS_DRIVE.from + 17; x < CROSS_DRIVE.to; x += 30) for (const s of [-1, 1]) if (Math.abs(x) > CURB + 4) out.push({ x, z: CROSS_DRIVE.z + s * off, turn: s > 0 ? Math.PI : 0 });
  return out;
})();

/** Trees round the park and the garden, and dotted over the lawns. */
export const PARK_TREES: { x: number; z: number; s: number; kind: 0 | 1 }[] = (() => {
  const out: { x: number; z: number; s: number; kind: 0 | 1 }[] = [];
  let n = 4242;
  const rnd = () => (n = (n * 16807) % 2147483647) / 2147483647;
  const free = (x: number, z: number) =>
    !estateBlocks(x, z, 4) &&
    !out.some((t) => Math.hypot(t.x - x, t.z - z) < 9) &&
    !HOMES.some((h) => h.area === "estates" && Math.hypot(h.site.x - x, h.site.z - z) < Math.max(h.w, h.d) * 0.8 + 8) &&
    Math.abs(x) > CURB + 8 &&
    Math.abs(z - CROSS_DRIVE.z) > CURB + 8 &&
    x > ESTATES.minX + 6 &&
    x < ESTATES.maxX - 6 &&
    z > ESTATES.gate.z + 12 &&
    z < ESTATES.maxZ - 6;
  // Round the pond (but leaving the view open from the gazebo).
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    if (Math.abs(a - Math.PI / 2) < 0.5) continue;
    const r = 1.55 + rnd() * 0.25;
    const x = POND.x + Math.cos(a) * POND.rx * r;
    const z = POND.z + Math.sin(a) * POND.rz * r;
    if (free(x, z) && x > PARK.x0 + 3 && x < PARK.x1 - 3 && z > PARK.z0 + 3 && z < PARK.z1 - 3) out.push({ x, z, s: 1 + rnd() * 0.5, kind: rnd() < 0.25 ? 1 : 0 });
  }
  // Clipped yews framing the garden.
  for (let x = GARDEN.x0 + 6; x < GARDEN.x1; x += 16) for (const z of [GARDEN.z0 + 4, GARDEN.z1 - 4]) if (free(x, z)) out.push({ x, z, s: 0.95, kind: 1 });
  // A pair of trees in front of each of the mansions.
  for (const h of HOMES)
    if (h.area === "estates")
      for (const sd of [-1, 1]) {
        const lx = sd * (h.w / 2 + 6);
        const lz = 6;
        out.push({ x: h.site.x + lx * Math.cos(h.site.turn) + lz * Math.sin(h.site.turn), z: h.site.z - lx * Math.sin(h.site.turn) + lz * Math.cos(h.site.turn), s: 1.25, kind: 0 });
      }
  // The rest of the open land.
  for (let i = 0; i < 2600 && out.length < 230; i++) {
    const x = ESTATES.minX + rnd() * (ESTATES.maxX - ESTATES.minX);
    const z = ESTATES.gate.z + rnd() * (ESTATES.maxZ - ESTATES.gate.z);
    if (x > GARDEN.x0 - 4 && x < GARDEN.x1 + 4 && z > GARDEN.z0 - 4 && z < GARDEN.z1 + 4) continue;
    if (free(x, z)) out.push({ x, z, s: 0.9 + rnd() * 0.7, kind: rnd() < 0.3 ? 1 : 0 });
  }
  return out;
})();

export function ellipseQ(x: number, z: number, e: Ellipse) {
  const dx = x - e.x;
  const dz = z - e.z;
  const c = Math.cos(e.turn);
  const s = Math.sin(e.turn);
  const u = (dx * c - dz * s) / e.rx;
  const v = (dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

function local(x: number, z: number, l: { x: number; z: number; turn: number }) {
  const dx = x - l.x;
  const dz = z - l.z;
  return { u: dx * Math.cos(l.turn) - dz * Math.sin(l.turn), v: dx * Math.sin(l.turn) + dz * Math.cos(l.turn) };
}

/** Things you bump into in the grounds: the pond, the fountain, the gazebo's posts and the art houses. */
export function estateBlocks(x: number, z: number, r: number) {
  if (x < ESTATES.minX || x > ESTATES.maxX || z < ESTATES.minZ || z > ESTATES.maxZ) return false;
  if (ellipseQ(x, z, { ...POND, rx: POND.rx + r, rz: POND.rz + r }) < 1) return true;
  if (Math.hypot(x - GARDEN_FOUNTAIN.x, z - GARDEN_FOUNTAIN.z) < GARDEN_FOUNTAIN.r + r) return true;
  for (const l of ESTATE_LOTS) {
    const { u, v } = local(x, z, l);
    if (Math.abs(u) < l.w / 2 + r && v < r && v > -l.d - r) return true;
  }
  return false;
}
