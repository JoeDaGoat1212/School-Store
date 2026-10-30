"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ASSETS, fitted, splitTrees, useAsset } from "./assets";
import { boxesOf, clearOccluders, setOccluders } from "./occluders";
import { groundAt } from "./terrain";

/*
 * The downloaded models in the world (assets.ts loads them; until one has
 * loaded, or if it isn't there, nothing here draws and what was there
 * before stays):
 *
 *   - RevueltoBody: the Vanta Revuelto's body (CarModel uses it).
 *   - ElmAvenue: autumn elms down the Crescent Heights avenues, instanced.
 *   - TerminalLandmark: the second terminal at the airport, solid.
 */

// ---- The car ---------------------------------------------------------------------------------------

/** The Revuelto from the downloaded model, sized and turned like the game's own cars (nose toward -z). Null until it's loaded. */
export function RevueltoBody() {
  const scene = useAsset("revuelto");
  const obj = useMemo(() => (scene ? fitted(scene.clone(true), ASSETS.revuelto.fit) : null), [scene]);
  if (!obj) return null;
  return <primitive object={obj} />;
}

/** Has the Revuelto model loaded? (So CarModel can use it instead of the drawn supercar.) */
export const useRevuelto = () => Boolean(useAsset("revuelto"));

// ---- The elms --------------------------------------------------------------------------------------

/** Trees in squares this big share their instanced meshes (so whole squares off-screen are skipped). */
const CELL = 160;
/** Further than this, a square of trees isn't drawn at all. */
const DRAW = 650;

/**
 * Autumn elms at these spots (s = size). The 5 trees in the model are split
 * apart and handed out in turn; each tree's parts (trunk, leaves…) are each
 * one InstancedMesh per square of the map. Returns null (and draws nothing)
 * until the model's loaded, so the caller can keep its own trees till then.
 */
export function ElmAvenue({ spots }: { spots: { x: number; z: number; s: number }[] }) {
  const scene = useAsset("elms");
  const cells = useMemo(() => {
    if (!scene) return null;
    const kinds = splitTrees(scene);
    if (!kinds.length) return null;
    const target = ASSETS.elms.fit.size;
    // Sort the spots into squares.
    const bySquare = new Map<string, { x: number; z: number; s: number; i: number }[]>();
    spots.forEach((p, i) => {
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      bySquare.set(key, [...(bySquare.get(key) ?? []), { ...p, i }]);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const out: { group: THREE.Group; x: number; z: number }[] = [];
    for (const list of bySquare.values()) {
      const group = new THREE.Group();
      let cx = 0;
      let cz = 0;
      kinds.forEach((kind, k) => {
        const mine = list.filter((p) => p.i % kinds.length === k);
        if (!mine.length) return;
        const scale = target / Math.max(0.01, kind.height);
        for (const part of kind.parts) {
          const inst = new THREE.InstancedMesh(part.geometry, part.material, mine.length);
          mine.forEach((p, j) => {
            // Each tree turned its own way, so the avenue doesn't look copied and pasted.
            q.setFromAxisAngle(up, (p.i * 2.399) % (Math.PI * 2));
            const sc = scale * p.s;
            m.compose(new THREE.Vector3(p.x, groundAt(p.x, p.z), p.z), q, new THREE.Vector3(sc, sc, sc)).multiply(part.matrix);
            inst.setMatrixAt(j, m);
          });
          inst.instanceMatrix.needsUpdate = true;
          inst.castShadow = true;
          inst.receiveShadow = true;
          // Frustum culling for the whole square: three.js needs the instances' bounds for that.
          inst.computeBoundingSphere();
          inst.computeBoundingBox();
          inst.frustumCulled = true;
          group.add(inst);
        }
      });
      for (const p of list) {
        cx += p.x / list.length;
        cz += p.z / list.length;
      }
      out.push({ group, x: cx, z: cz });
    }
    return out;
  }, [scene, spots]);

  // Whole squares too far away: not drawn.
  const root = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!cells) return;
    for (const c of cells) {
      const far = (camera.position.x - c.x) ** 2 + (camera.position.z - c.z) ** 2 > DRAW * DRAW;
      c.group.visible = !far;
    }
  });
  useEffect(
    () => () => {
      // (The geometry and materials belong to the loaded model, which stays loaded; only the instance buffers are ours.)
      cells?.forEach((c) => c.group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose()));
    },
    [cells],
  );
  if (!cells) return null;
  return (
    <group ref={root}>
      {cells.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
    </group>
  );
}

/** Have the elms loaded? */
export const useElms = () => Boolean(useAsset("elms"));

// ---- The airport's second terminal -------------------------------------------------------------------

/** Where it stands: west of the walk-in terminal, south of the hangar, on flat open ground. It faces the road (-z). */
export const TERMINAL2 = { x: -1300, z: 8, turn: Math.PI };

export function TerminalLandmark() {
  const scene = useAsset("terminal");
  const obj = useMemo(() => {
    if (!scene) return null;
    const g = new THREE.Group();
    g.add(fitted(scene, ASSETS.terminal.fit));
    g.position.set(TERMINAL2.x, groundAt(TERMINAL2.x, TERMINAL2.z), TERMINAL2.z);
    g.rotation.y = TERMINAL2.turn;
    return g;
  }, [scene]);
  // Solid: you walk into it, and the camera stays out of it.
  useEffect(() => {
    if (!obj) return;
    setOccluders("terminal", boxesOf(obj, 6));
    return () => clearOccluders("terminal");
  }, [obj]);
  if (!obj) return null;
  return <primitive object={obj} />;
}
