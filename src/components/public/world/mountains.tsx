"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { noRaycast, seededRandom } from "./paint";
import { GRID, HILLS_START, PINES, groundAt, slopeAt } from "./terrain";
import { SpruceTrees } from "./nature";
import { SecretBase } from "./secret-base";
import { MountainRoad } from "./mountain-road";

/*
 * The mountains to the north: the land itself (green slopes, grey rock,
 * snowy tops), pine forests, the winding mountain road (mountain-road.tsx),
 * and the hollow mountain with the secret base inside (secret-base.tsx). The base's entrance
 * looks like plain rock until you drive up: a scanner sweeps you, and the
 * rock face rumbles apart to show the tunnel into the hangar.
 */

export function Mountains() {
  return (
    <group>
      <Land />
      <MountainRoad />
      <Pines />
      <SecretBase />
    </group>
  );
}

// ---- The land -------------------------------------------------------------------------------

const GRASS = new THREE.Color("#6a9a46");
const FOREST = new THREE.Color("#4d6b34");
const DIRT = new THREE.Color("#7d6a4f");
const ROCK = new THREE.Color("#8b857c");
const DARK_ROCK = new THREE.Color("#6b665f");
const SNOW = new THREE.Color("#f3f6f9");

function Land() {
  const geometry = useMemo(() => {
    const cell = 10;
    const x0 = GRID.x0;
    const x1 = GRID.x1;
    const z0 = GRID.z0;
    const z1 = HILLS_START + 8;
    const nx = Math.ceil((x1 - x0) / cell);
    const nz = Math.ceil((z1 - z0) / cell);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new THREE.Color();
    const rand = seededRandom(17);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * cell;
        const z = Math.min(z1, z0 + j * cell);
        const y = groundAt(x, z);
        const k = (j * (nx + 1) + i) * 3;
        pos[k] = x;
        pos[k + 1] = y;
        pos[k + 2] = z;
        const { sx, sz } = slopeAt(x, z);
        const steep = Math.hypot(sx, sz);
        // Colour by height and steepness: meadows, forest floor, bare rock, snow.
        c.copy(GRASS).lerp(FOREST, Math.min(1, Math.max(0, (y - 10) / 40)));
        if (y > 70) c.lerp(DIRT, Math.min(1, (y - 70) / 50));
        c.lerp(steep > 1.2 ? DARK_ROCK : ROCK, Math.min(1, Math.max(0, (steep - 0.55) * 1.6) + Math.max(0, (y - 120) / 60)));
        if (y > 165) c.lerp(SNOW, Math.min(1, (y - 165) / 25) * (steep > 1.4 ? 0.5 : 1));
        const n = (rand() - 0.5) * 0.06;
        col[k] = c.r + n;
        col[k + 1] = c.g + n;
        col[k + 2] = c.b + n;
      }
    const index: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const d = a + nx + 1;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow raycast={noRaycast}>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
    </mesh>
  );
}

// ---- Pine forests ---------------------------------------------------------------------------

/** The mountain spruces (nature.tsx), standing on the slopes. */
const MOUNTAIN_PINES = PINES.map((p) => ({ x: p.x, z: p.z, s: p.s, y: p.y }));

function Pines() {
  return <SpruceTrees list={MOUNTAIN_PINES} shadows={false} />;
}
