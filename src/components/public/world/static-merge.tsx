"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
 * For things that never move (a house's walls, roof, windows…): draws its
 * children once, then merges every mesh that shares a material into one,
 * so a building made of a hundred boxes is drawn in a handful of calls
 * instead of a hundred. Don't put anything that moves or changes inside.
 */
export function Static({ children, shadows = true }: { children: ReactNode; shadows?: boolean }) {
  const src = useRef<THREE.Group>(null);
  const [merged, setMerged] = useState<THREE.Mesh[] | null>(null);

  useLayoutEffect(() => {
    const root = src.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
    const keep: THREE.Object3D[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      // Only position / normal / uv, so everything can merge.
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const e = byMat.get(m.material) ?? { geos: [], cast: false, receive: false };
      e.geos.push(g);
      e.cast ||= m.castShadow;
      e.receive ||= m.receiveShadow;
      byMat.set(m.material, e);
      keep.push(o);
    });
    const out: THREE.Mesh[] = [];
    for (const [material, e] of byMat) {
      const g = mergeGeometries(e.geos, false);
      e.geos.forEach((x) => x.dispose());
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = shadows && e.cast;
      mesh.receiveShadow = e.receive;
      mesh.raycast = () => null;
      out.push(mesh);
    }
    setMerged(out);
    return () => out.forEach((m) => m.geometry.dispose());
    // Built once: the contents never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* dispose={null}: the merged meshes keep using these materials after the originals go. */}
      {!merged && (
        <group ref={src} dispose={null}>
          {children}
        </group>
      )}
      {merged?.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
