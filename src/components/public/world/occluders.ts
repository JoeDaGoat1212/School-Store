import * as THREE from "three";

/*
 * Solid shapes for the loaded 3D models (the airport terminal, and anything
 * else from the asset manifest). Plain TypeScript.
 *
 *   - Walking (bump.ts walkBlocked) and driving (bump.ts carBlocked) ask
 *     blocksWalk(), so you collide with the model instead of going through.
 *   - The ground under you (camera.tsx) asks modelFloor(): the low parts of
 *     a model you can walk up onto (a forecourt, steps).
 *   - The third-person camera asks occluderDistance() how far it can pull
 *     back before a model's in the way, and stops short of it.
 *
 * Boxes, not triangles: a ray against boxes costs next to nothing each frame,
 * where a ray against a big model's triangles would cost a lot. A model gets
 * its boxes from heightMapOf() (columns worked out from its triangles: walls
 * and towers solid to the top, canopies solid only up where they are, so you
 * can walk underneath), or from boxesOf() (one per big mesh).
 */

type Group = { id: string; bounds: THREE.Box3; boxes: THREE.Box3[]; floor: Floor | null };
type Floor = { x0: number; z0: number; cell: number; nx: number; nz: number; h: Float32Array };
const groups: Group[] = [];

/** Add a model's solid boxes (and the floor you can walk on, if it has one), replacing any it added before. */
export function setOccluders(id: string, boxes: THREE.Box3[], floor: Floor | null = null) {
  clearOccluders(id);
  const bounds = new THREE.Box3();
  for (const b of boxes) bounds.union(b);
  if (floor) bounds.union(new THREE.Box3(new THREE.Vector3(floor.x0, 0, floor.z0), new THREE.Vector3(floor.x0 + floor.nx * floor.cell, 1, floor.z0 + floor.nz * floor.cell)));
  groups.push({ id, bounds, boxes, floor });
}
export function clearOccluders(id: string) {
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i].id === id) groups.splice(i, 1);
}
export const occluderCount = () => groups.reduce((n, g) => n + g.boxes.length, 0);

/**
 * The solid boxes of a loaded model: one per mesh big enough to matter
 * (merged when they overlap a lot), in world space. Small bits (railings,
 * lamps, plants) are left out so you don't snag on them.
 */
export function boxesOf(root: THREE.Object3D, minSize = 4): THREE.Box3[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Box3[] = [];
  const b = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    b.setFromObject(m, false);
    b.getSize(size);
    if (Math.max(size.x, size.z) < minSize || size.y < 1.5) return;
    out.push(b.clone());
  });
  return out;
}

/** Below this, part of a model is something you step up onto (a forecourt, a kerb, steps); above it, a wall. */
const STEP = 3.2;
/** Anything only above this (a canopy, a walkway, a ramp overhead) leaves room to walk underneath. */
const HEADROOM = 4.6;

/**
 * Work out a model's solid columns and floors from its triangles, on a grid
 * of `cell`-sized squares (world space, so place the model first). Each
 * triangle is sampled at points closer than half a square apart; for every
 * square that tells us what's down low (up to HEADROOM) and what's overhead.
 *
 *   - Something between STEP and HEADROOM high down low (a wall's in it):
 *     solid from the ground to the top.
 *   - Only low stuff: a floor at that height (you walk up onto it).
 *   - Something overhead: solid up there only (for the camera), clear below.
 *
 * Neighbouring squares in a row with about the same heights become one box.
 */
export function heightMapOf(root: THREE.Object3D, cell = 4) {
  root.updateWorldMatrix(true, true);
  const all = new THREE.Box3().setFromObject(root);
  const x0 = Math.floor(all.min.x / cell) * cell;
  const z0 = Math.floor(all.min.z / cell) * cell;
  const nx = Math.ceil((all.max.x - x0) / cell) + 1;
  const nz = Math.ceil((all.max.z - z0) / cell) + 1;
  const base = all.min.y;
  const lowMax = new Float32Array(nx * nz).fill(-Infinity);
  const upMin = new Float32Array(nx * nz).fill(Infinity);
  const upMax = new Float32Array(nx * nz).fill(-Infinity);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mark = (x: number, y: number, z: number) => {
    const i = Math.floor((x - x0) / cell);
    const j = Math.floor((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return;
    const k = j * nx + i;
    const h = y - base;
    if (h <= HEADROOM) {
      if (h > lowMax[k]) lowMax[k] = h;
    } else {
      if (h < upMin[k]) upMin[k] = h;
      if (h > upMax[k]) upMax[k] = h;
    }
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const index = m.geometry.index;
    const tris = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.max(1, Math.ceil(edge / (cell * 0.5)));
      for (let p = 0; p <= n; p++)
        for (let q = 0; q <= n - p; q++) {
          const u = p / n;
          const v = q / n;
          mark(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
        }
    }
  });
  // Sort the squares out.
  const SOLID = 1;
  const OVER = 2;
  const kind = new Uint8Array(nx * nz);
  const top = new Float32Array(nx * nz);
  const floor = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) {
    const low = lowMax[k];
    if (low > STEP) {
      kind[k] = SOLID;
      top[k] = Math.max(low, upMax[k]);
    } else {
      if (low > 0.15) floor[k] = low;
      if (upMin[k] < Infinity) kind[k] = OVER;
    }
  }
  // Rows of alike squares → boxes.
  const boxes: THREE.Box3[] = [];
  for (let j = 0; j < nz; j++) {
    let i = 0;
    while (i < nx) {
      const k = j * nx + i;
      if (!kind[k]) {
        i++;
        continue;
      }
      const lo = kind[k] === SOLID ? 0 : upMin[k];
      const hi = kind[k] === SOLID ? top[k] : upMax[k];
      let e = i + 1;
      while (e < nx) {
        const k2 = j * nx + e;
        if (kind[k2] !== kind[k]) break;
        const lo2 = kind[k2] === SOLID ? 0 : upMin[k2];
        const hi2 = kind[k2] === SOLID ? top[k2] : upMax[k2];
        if (Math.abs(lo2 - lo) > 3 || Math.abs(hi2 - hi) > 6) break;
        e++;
      }
      let lo3 = Infinity;
      let hi3 = -Infinity;
      for (let q = i; q < e; q++) {
        const k3 = j * nx + q;
        lo3 = Math.min(lo3, kind[k3] === SOLID ? 0 : upMin[k3]);
        hi3 = Math.max(hi3, kind[k3] === SOLID ? top[k3] : upMax[k3]);
      }
      boxes.push(new THREE.Box3(new THREE.Vector3(x0 + i * cell, base + lo3, z0 + j * cell), new THREE.Vector3(x0 + e * cell, base + hi3, z0 + (j + 1) * cell)));
      i = e;
    }
  }
  return { boxes, floor: { x0, z0, cell, nx, nz, h: floor } as Floor, base };
}

/** Would someone (radius r, standing at height y, about 2 high) at (x, z) be inside a model? */
export function blocksWalk(x: number, z: number, r: number, y = 0) {
  for (const g of groups) {
    const B = g.bounds;
    if (x < B.min.x - r || x > B.max.x + r || z < B.min.z - r || z > B.max.z + r) continue;
    for (const box of g.boxes) if (x > box.min.x - r && x < box.max.x + r && z > box.min.z - r && z < box.max.z + r && y + 1.8 > box.min.y && y + 0.4 < box.max.y) return true;
  }
  return false;
}

/** The height of a model's walkable floor at (x, z) (a forecourt, steps), or -Infinity if there's none. */
export function modelFloor(x: number, z: number) {
  let best = -Infinity;
  for (const g of groups) {
    const f = g.floor;
    if (!f) continue;
    const i = Math.floor((x - f.x0) / f.cell);
    const j = Math.floor((z - f.z0) / f.cell);
    if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue;
    const h = f.h[j * f.nx + i];
    if (h > 0 && g.bounds.min.y + h > best) best = g.bounds.min.y + h;
  }
  return best;
}

const ray = new THREE.Ray();
const end = new THREE.Vector3();
const hit = new THREE.Vector3();

/**
 * Third person: from your eyes (eye), toward where the camera wants to be
 * (`back` at full zoom, `shoulder` to the right, `lift` up), how far until a
 * model is in the way? (Infinity if nothing is.)
 */
export function occluderDistance(eye: THREE.Vector3, back: THREE.Vector3, right: THREE.Vector3, shoulder: number, lift: number, zoom: number) {
  if (!groups.length) return Infinity;
  end.set(eye.x + back.x * zoom + right.x * shoulder, eye.y + lift, eye.z + back.z * zoom + right.z * shoulder);
  const len = end.distanceTo(eye);
  ray.origin.copy(eye);
  ray.direction.copy(end).sub(eye).normalize();
  let best = Infinity;
  for (const g of groups) {
    // (Whole models nowhere near: skipped.)
    if (!ray.intersectsBox(g.bounds) && !g.bounds.containsPoint(eye)) continue;
    for (const box of g.boxes) {
      // (You're standing inside it, e.g. under a canopy: no use pulling the camera in.)
      if (box.containsPoint(eye)) continue;
      if (ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(eye);
        if (d < len && d < best) best = d;
      }
    }
  }
  // As a distance back along the ground (what camera.tsx works in).
  return best === Infinity ? Infinity : (best / len) * zoom;
}
