import * as THREE from "three";

/*
 * Solid boxes for the loaded 3D models (the airport terminal, and anything
 * else from the asset manifest). Plain TypeScript.
 *
 *   - Walking: bump.ts asks blocksWalk() so you collide with the model
 *     instead of walking through it.
 *   - The third-person camera: camera.tsx asks occluderDistance() how far it
 *     can pull back before a model's in the way, and stops short of it
 *     (camera occlusion: you never see through or clip into a wall).
 *
 * Boxes, not the models' triangles: a ray against a few dozen boxes costs
 * next to nothing each frame, where a ray against a 20 MB building would
 * cost a lot. A model registers one box per big part (each wing of a
 * building), worked out from its meshes when it loads.
 */

const boxes: { id: string; box: THREE.Box3 }[] = [];

/** Add a model's solid boxes (replacing any it added before). */
export function setOccluders(id: string, list: THREE.Box3[]) {
  clearOccluders(id);
  for (const box of list) boxes.push({ id, box });
}
export function clearOccluders(id: string) {
  for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i].id === id) boxes.splice(i, 1);
}
export const occluderCount = () => boxes.length;

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
    const same = out.find((x) => x.containsBox(b) || (x.intersectsBox(b) && overlap(x, b) > 0.7));
    if (same) same.union(b);
    else out.push(b.clone());
  });
  return out;
}
function overlap(a: THREE.Box3, b: THREE.Box3) {
  const i = a.clone().intersect(b);
  if (i.isEmpty()) return 0;
  const v = (x: THREE.Box3) => {
    const s = x.getSize(new THREE.Vector3());
    return Math.max(1e-6, s.x * s.y * s.z);
  };
  return v(i) / Math.min(v(a), v(b));
}

/** Would someone (radius r, standing on the ground at y, about 2 high) at (x, z) be inside a model's box? */
export function blocksWalk(x: number, z: number, r: number, y = 0) {
  for (const { box } of boxes)
    if (x > box.min.x - r && x < box.max.x + r && z > box.min.z - r && z < box.max.z + r && y + 1.8 > box.min.y && y + 0.4 < box.max.y) return true;
  return false;
}

const ray = new THREE.Ray();
const end = new THREE.Vector3();
const hit = new THREE.Vector3();

/**
 * Third person: from your eyes (eye), toward where the camera wants to be
 * (`back` at full zoom, `shoulder` to the right, `lift` up), how far until a
 * model's box is in the way? (Infinity if nothing is.)
 */
export function occluderDistance(eye: THREE.Vector3, back: THREE.Vector3, right: THREE.Vector3, shoulder: number, lift: number, zoom: number) {
  if (!boxes.length) return Infinity;
  end.set(eye.x + back.x * zoom + right.x * shoulder, eye.y + lift, eye.z + back.z * zoom + right.z * shoulder);
  const len = end.distanceTo(eye);
  ray.origin.copy(eye);
  ray.direction.copy(end).sub(eye).normalize();
  let best = Infinity;
  for (const { box } of boxes) {
    // (You're standing inside it, e.g. under a canopy: no use pulling the camera in.)
    if (box.containsPoint(eye)) continue;
    if (ray.intersectBox(box, hit)) {
      const d = hit.distanceTo(eye);
      if (d < len && d < best) best = d;
    }
  }
  // As a distance back along the ground (what camera.tsx works in).
  return best === Infinity ? Infinity : (best / len) * zoom;
}
