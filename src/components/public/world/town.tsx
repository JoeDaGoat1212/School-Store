"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Humanoid, newPose, type Look } from "./humanoid";
import { canvasTexture, noRaycast, seededRandom } from "./paint";
import { asphaltMaterial, pavingMaterial } from "./surfaces";
import {
  BUSHES,
  CURB,
  DRIVEWAY,
  HOUSES,
  hasGarage,
  houseStyle,
  INTERSECTIONS,
  ROAD_HALF,
  ROADS,
  SIDEWALKS,
  STREET_LIGHTS,
  TOWN_TREES,
  WALKERS,
  WALK_W,
} from "./town-layout";

/*
 * Draws the neighbourhood from town-layout.ts. There are hundreds of houses,
 * trees and lights, so each kind of part is one "instanced" mesh: the
 * graphics card draws all 195 house walls in one go, all roofs in another,
 * and so on. Nothing here can be tapped (that keeps tapping fast).
 */

const dummy = new THREE.Object3D();
const tmp = new THREE.Vector3();

export type Place = (i: number, o: THREE.Object3D) => string | void;

/**
 * Many copies of one shape in a single draw: `place` puts copy i (and can
 * return its colour). Can't be tapped.
 */
export function Instances({
  count,
  place,
  geometry,
  castShadow = false,
  receiveShadow = false,
  children,
}: {
  count: number;
  place: Place;
  geometry?: THREE.BufferGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      const c = place(i, dummy);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (c) m.setColorAt(i, color.set(c));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [count, place]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} castShadow={castShadow} receiveShadow={receiveShadow} raycast={noRaycast}>
      {children}
    </instancedMesh>
  );
}

/** A point on a house, given as left/right, up, and out the front. */
function onHouse(h: (typeof HOUSES)[number], lx: number, y: number, lz: number, o: THREE.Object3D) {
  o.position.set(h.x + lx * Math.cos(h.turn) + lz * Math.sin(h.turn), y, h.z - lx * Math.sin(h.turn) + lz * Math.cos(h.turn));
  o.rotation.y = h.turn;
}

export function Town() {
  return (
    <group>
      <Roads />
      <Sidewalks />
      <Houses />
      <Trees />
      <Bushes />
      <StreetLights />
      <Walkers />
    </group>
  );
}

// ---- Roads -----------------------------------------------------------------------------------

/** Asphalt with a dashed yellow middle line and white edge lines (repeats every 8 units along). */
function useRoadTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4b5057";
    g.fillRect(0, 0, 128, 64);
    const rand = seededRandom(5);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)";
      g.fillRect(rand() * 128, rand() * 64, 2, 2);
    }
    g.fillStyle = "#f2f0ea"; // edge lines
    g.fillRect(4, 0, 3, 64);
    g.fillRect(121, 0, 3, 64);
    g.fillStyle = "#ffcf33"; // the dashed middle line
    g.fillRect(62, 0, 4, 34);
    // (Repeats: the strips' texture coordinates go past 1.)
    return canvasTexture(c, [1, 1]);
  }, []);
}

/** A flat strip `width` across and `length` long, with the texture repeating every `every` units. */
function stripGeometry(width: number, length: number, every: number) {
  const g = new THREE.PlaneGeometry(width, length);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / every));
  g.rotateX(-Math.PI / 2);
  return g;
}

function Roads() {
  const tex = useRoadTexture();
  const roads = useMemo(
    () =>
      ROADS.map((r) => {
        const length = r.to - r.from;
        const geometry = stripGeometry(ROAD_HALF * 2, length, 8);
        if (r.axis === "x") geometry.rotateY(Math.PI / 2);
        const mid = (r.from + r.to) / 2;
        return { geometry, position: (r.axis === "x" ? [mid, 0.02, r.at] : [r.at, 0.025, mid]) as [number, number, number] };
      }),
    [],
  );
  const patch = useMemo(() => stripGeometry(ROAD_HALF * 2, ROAD_HALF * 2, 1000), []);
  const drive = useMemo(() => stripGeometry(DRIVEWAY.halfWidth * 2, DRIVEWAY.toZ - DRIVEWAY.fromZ + 1, 1000), []);
  useEffect(() => () => [...roads.map((r) => r.geometry), patch, drive].forEach((g) => g.dispose()), [roads, patch, drive]);
  const lined = asphaltMaterial(tex);
  const plain = <primitive object={asphaltMaterial()} attach="material" />;
  return (
    <group>
      {roads.map((r, i) => (
        <mesh key={i} geometry={r.geometry} material={lined} position={r.position} receiveShadow raycast={noRaycast} />
      ))}
      {/* Plain squares where roads cross (no lines through the middle) */}
      {INTERSECTIONS.map((p) => (
        <mesh key={`${p.x},${p.z}`} geometry={patch} position={[p.x, 0.03, p.z]} receiveShadow raycast={noRaycast}>
          {plain}
        </mesh>
      ))}
      {/* The driveway from the parking lot to the main road */}
      <mesh geometry={drive} position={[DRIVEWAY.x, 0.015, (DRIVEWAY.fromZ + DRIVEWAY.toZ) / 2]} receiveShadow raycast={noRaycast}>
        {plain}
      </mesh>
    </group>
  );
}

// Where each copy goes. (Plain functions outside the components, so they stay the same between renders.)
const placeSidewalk: Place = (i, o) => {
  const s = SIDEWALKS[i];
  o.position.set((s.x1 + s.x2) / 2, 0.12, (s.z1 + s.z2) / 2);
  const along = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  // Long in x, or long in z.
  o.scale.set(s.z1 === s.z2 ? along : WALK_W, 0.24, s.z1 === s.z2 ? WALK_W : along);
};

function Sidewalks() {
  return (
    <Instances count={SIDEWALKS.length} place={placeSidewalk} receiveShadow>
      <boxGeometry />
      <primitive object={pavingMaterial()} attach="material" />
    </Instances>
  );
}

// ---- Houses ------------------------------------------------------------------------------------

/** A gable roof, 1 wide, 1 tall and 1 deep: the ridge runs left–right. */
function roofGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2); // the triangles now face left and right; the slopes face front and back
  return g;
}

/*
 * Every house has its own look: 0 a classic gable, 1 a two-storey family
 * house, 2 a modern flat-roofed box with wood cladding and big windows, 3 a
 * hip-roofed bungalow, 4 a farmhouse with a front porch. Some have a garage
 * on the side, the classics have shutters.
 */
const styleOf = houseStyle;
const HOUSE_IDS = HOUSES.map((_, i) => i);
const wallH = (i: number) => HOUSES[i].h * (styleOf(i) === 1 ? 1.75 : styleOf(i) === 2 ? 1.3 : 1);
const GABLED = HOUSE_IDS.filter((i) => [0, 1, 4].includes(styleOf(i)));
const FLAT = HOUSE_IDS.filter((i) => styleOf(i) === 2);
const HIPPED = HOUSE_IDS.filter((i) => styleOf(i) === 3);
const PORCHED = HOUSE_IDS.filter((i) => styleOf(i) === 4);
const SHUTTERED = HOUSE_IDS.filter((i) => styleOf(i) === 0);
const GARAGED = HOUSE_IDS.filter(hasGarage);
const WITH_CHIMNEY = HOUSE_IDS.filter((i) => HOUSES[i].chimney && styleOf(i) !== 2);
const WOOD = ["#a87a45", "#8b5a3c", "#c49a6c"];

const placeWall: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, 0, wallH(i) / 2, 0, o);
  o.scale.set(h.w, wallH(i), h.d);
  return styleOf(i) === 2 ? ["#f2f2f2", "#e9ecef", "#2b2f36"][i % 3] : h.wall;
};
const placeRoof: Place = (k, o) => {
  const i = GABLED[k];
  const h = HOUSES[i];
  onHouse(h, 0, wallH(i) - 0.02, 0, o);
  o.scale.set(h.w + 1.2, h.roofH * (styleOf(i) === 4 ? 1.25 : 1), h.d + 1.2); // a little overhang all round
  return h.roof;
};
const placeHip: Place = (k, o) => {
  const i = HIPPED[k];
  const h = HOUSES[i];
  onHouse(h, 0, wallH(i) + h.roofH * 0.4, 0, o);
  o.scale.set(h.w + 1.4, h.roofH * 0.8, h.d + 1.4);
  return h.roof;
};
const placeFlat: Place = (k, o) => {
  const i = FLAT[k];
  const h = HOUSES[i];
  onHouse(h, 0, wallH(i) + 0.25, 0, o);
  o.scale.set(h.w + 1.6, 0.5, h.d + 1.6);
  return "#2b2f36";
};
// Modern houses: a wall of wood cladding, and one huge window.
const placeCladding: Place = (k, o) => {
  const i = FLAT[k];
  const h = HOUSES[i];
  onHouse(h, -h.w / 4, wallH(i) / 2, h.d / 2 + 0.04, o);
  o.scale.set(h.w / 2, wallH(i), 0.1);
  return WOOD[i % WOOD.length];
};
const placeBigGlass: Place = (k, o) => {
  const i = FLAT[k];
  const h = HOUSES[i];
  onHouse(h, h.w / 4 + 0.3, wallH(i) * 0.52, h.d / 2 + 0.08, o);
  o.scale.set(h.w / 2 - 1.6, wallH(i) * 0.75, 0.1);
};
const placeDoor: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, styleOf(i) === 2 ? -h.w / 4 : 0, 1.7, h.d / 2 + 0.1, o);
  o.scale.set(1.7, 3.4, 0.2);
  return styleOf(i) === 2 ? "#1b1d21" : h.door;
};
// Two front windows each (four on two-storey houses): white frames, then glass.
const FRONT_WINDOWS = HOUSE_IDS.filter((i) => styleOf(i) !== 2).flatMap((i) => [
  { i, side: -1, y: 0.56 },
  { i, side: 1, y: 0.56 },
  ...(styleOf(i) === 1 ? [{ i, side: -1, y: 1.3 }, { i, side: 1, y: 1.3 }, { i, side: 0, y: 1.3 }] : []),
]);
const placeFrame: Place = (k, o) => {
  const { i, side, y } = FRONT_WINDOWS[k];
  const h = HOUSES[i];
  onHouse(h, side * (h.w / 4 + 0.6), h.h * y, h.d / 2 + 0.05, o);
  o.scale.set(2.7, 2.5, 0.16);
};
const placeGlass: Place = (k, o) => {
  const { i, side, y } = FRONT_WINDOWS[k];
  const h = HOUSES[i];
  onHouse(h, side * (h.w / 4 + 0.6), h.h * y, h.d / 2 + 0.12, o);
  o.scale.set(2.2, 2.0, 0.1);
};
const placeShutter: Place = (k, o) => {
  const i = SHUTTERED[k >> 2];
  const h = HOUSES[i];
  const side = k & 1 ? 1 : -1;
  const lr = k & 2 ? 1 : -1;
  onHouse(h, side * (h.w / 4 + 0.6) + lr * 1.75, h.h * 0.56, h.d / 2 + 0.08, o);
  o.scale.set(0.7, 2.5, 0.1);
  return h.door;
};
// Side windows, so houses don't look blank from the road round the corner.
const placeSideGlass: Place = (k, o) => {
  const i = k >> 1;
  const h = HOUSES[i];
  const s = k & 1 ? 1 : -1;
  onHouse(h, s * (h.w / 2 + 0.06), h.h * 0.56, 0, o);
  o.rotation.y += Math.PI / 2;
  o.scale.set(2.4, 2, 0.1);
};
const placeChimney: Place = (k, o) => {
  const i = WITH_CHIMNEY[k];
  const h = HOUSES[i];
  onHouse(h, h.w / 4, wallH(i) + h.roofH * 0.55, -h.d / 5, o);
  o.scale.set(1.2, h.roofH * 0.9 + 1.2, 1.2);
};
// Farmhouse porches: a deck, a roof, two posts.
const placePorch: Place = (k, o) => {
  const i = PORCHED[k];
  const h = HOUSES[i];
  onHouse(h, 0, 0.25, h.d / 2 + 1.6, o);
  o.scale.set(h.w - 1, 0.5, 3.2);
  return WOOD[i % WOOD.length];
};
const placePorchRoof: Place = (k, o) => {
  const i = PORCHED[k];
  const h = HOUSES[i];
  onHouse(h, 0, 3.9, h.d / 2 + 1.7, o);
  o.rotation.x = 0.22;
  o.scale.set(h.w - 0.6, 0.25, 3.6);
  return h.roof;
};
const placePost: Place = (k, o) => {
  const i = PORCHED[k >> 1];
  const h = HOUSES[i];
  onHouse(h, (k & 1 ? 1 : -1) * (h.w / 2 - 1.2), 2, h.d / 2 + 3, o);
  o.scale.set(0.3, 3.6, 0.3);
};
// Garages on the side, with a roller door and a driveway.
const placeGarage: Place = (k, o) => {
  const i = GARAGED[k];
  const h = HOUSES[i];
  onHouse(h, h.w / 2 + 3.4, 2, h.d / 2 - 3.6, o);
  o.scale.set(6.6, 4, 7);
  return h.wall;
};
const placeGarageDoor: Place = (k, o) => {
  const i = GARAGED[k];
  const h = HOUSES[i];
  onHouse(h, h.w / 2 + 3.4, 1.6, h.d / 2 - 0.05, o);
  o.scale.set(5.2, 3.2, 0.12);
};
// A path from the front door to the sidewalk.
const placePath: Place = (i, o) => {
  const h = HOUSES[i];
  onHouse(h, styleOf(i) === 2 ? -h.w / 4 : 0, 0.04, h.d / 2 + h.setback / 2, o);
  o.scale.set(2, 0.08, h.setback);
};

function Houses() {
  const n = HOUSES.length;
  const roof = useMemo(() => roofGeometry(), []);
  const hip = useMemo(() => new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), []);
  useEffect(
    () => () => {
      roof.dispose();
      hip.dispose();
    },
    [roof, hip],
  );
  return (
    <group>
      <Instances count={n} place={placeWall} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.85} />
      </Instances>
      <Instances count={GABLED.length} place={placeRoof} geometry={roof} castShadow>
        <meshStandardMaterial roughness={0.8} />
      </Instances>
      <Instances count={HIPPED.length} place={placeHip} geometry={hip} castShadow>
        <meshStandardMaterial roughness={0.8} flatShading />
      </Instances>
      <Instances count={FLAT.length} place={placeFlat} castShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.6} />
      </Instances>
      <Instances count={FLAT.length} place={placeCladding}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.7} />
      </Instances>
      <Instances count={FLAT.length} place={placeBigGlass}>
        <boxGeometry />
        <meshStandardMaterial color="#6f9cb8" roughness={0.06} metalness={0.7} />
      </Instances>
      <Instances count={n} place={placeDoor}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.6} />
      </Instances>
      <Instances count={FRONT_WINDOWS.length} place={placeFrame}>
        <boxGeometry />
        <meshStandardMaterial color="#ffffff" roughness={0.7} />
      </Instances>
      <Instances count={FRONT_WINDOWS.length} place={placeGlass}>
        <boxGeometry />
        <meshStandardMaterial color="#7fa9c4" roughness={0.08} metalness={0.6} />
      </Instances>
      <Instances count={n * 2} place={placeSideGlass}>
        <boxGeometry />
        <meshStandardMaterial color="#7fa9c4" roughness={0.08} metalness={0.6} />
      </Instances>
      <Instances count={SHUTTERED.length * 4} place={placeShutter}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.7} />
      </Instances>
      <Instances count={WITH_CHIMNEY.length} place={placeChimney} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#9a4a3a" roughness={0.9} />
      </Instances>
      <Instances count={PORCHED.length} place={placePorch} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.8} />
      </Instances>
      <Instances count={PORCHED.length} place={placePorchRoof} castShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.8} />
      </Instances>
      <Instances count={PORCHED.length * 2} place={placePost}>
        <boxGeometry />
        <meshStandardMaterial color="#f2f0ea" roughness={0.7} />
      </Instances>
      <Instances count={GARAGED.length} place={placeGarage} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.85} />
      </Instances>
      <Instances count={GARAGED.length} place={placeGarageDoor}>
        <boxGeometry />
        <meshStandardMaterial color="#e9ecef" roughness={0.5} metalness={0.3} />
      </Instances>
      <Instances count={n} place={placePath} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#cfc8bb" roughness={0.9} />
      </Instances>
    </group>
  );
}

// ---- Nature -----------------------------------------------------------------------------------

const GREENS = ["#3f7d32", "#4a8a3a", "#35702c", "#5a9443", "#466f2e"];
/** A lumpy ball of leaves (an icosahedron pushed in and out a little). */
function leafGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 3.7 + seed * 2);
    v.multiplyScalar(1 + n * 0.16);
    p.setXYZ(i, v.x, v.y * 0.9, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const CONIFER = (i: number) => i % 4 === 3;
const BROAD = TOWN_TREES.map((_, i) => i).filter((i) => !CONIFER(i));
const PINES = TOWN_TREES.map((_, i) => i).filter(CONIFER);
/** Each broadleaf tree's crown is four clumps, set a little differently on every tree. */
const CLUMPS = [
  [0, 4.3, 0, 2.3],
  [1.2, 5.4, 0.5, 1.7],
  [-1.1, 5.2, -0.4, 1.6],
  [0.2, 6.4, -0.2, 1.4],
];
const placeTrunk: Place = (k, o) => {
  const t = TOWN_TREES[k];
  o.position.set(t.x, 1.6 * t.s, t.z);
  o.scale.set(t.s, t.s * (CONIFER(k) ? 0.7 : 1), t.s);
};
const clump =
  (c: number): Place =>
  (k, o) => {
    const i = BROAD[k];
    const t = TOWN_TREES[i];
    const [cx, cy, cz, r] = CLUMPS[c];
    const a = i * 1.7;
    o.position.set(t.x + (cx * Math.cos(a) - cz * Math.sin(a)) * t.s, cy * t.s, t.z + (cx * Math.sin(a) + cz * Math.cos(a)) * t.s);
    o.rotation.set(0, a, 0);
    o.scale.setScalar(r * t.s);
    return GREENS[(i + c) % GREENS.length];
  };
const CLUMP_PLACERS = CLUMPS.map((_, c) => clump(c));
const pineTier =
  (tier: number): Place =>
  (k, o) => {
    const t = TOWN_TREES[PINES[k]];
    o.position.set(t.x, (2.6 + tier * 1.9) * t.s, t.z);
    o.scale.set((2.6 - tier * 0.6) * t.s, 3 * t.s, (2.6 - tier * 0.6) * t.s);
    return ["#2f5e2a", "#386a2f", "#2a5526"][(k + tier) % 3];
  };
const PINE_PLACERS = [0, 1, 2].map(pineTier);

function Trees() {
  const n = TOWN_TREES.length;
  const leaves = useMemo(() => [leafGeometry(1), leafGeometry(2.3), leafGeometry(3.7), leafGeometry(5.1)], []);
  useEffect(() => () => leaves.forEach((g) => g.dispose()), [leaves]);
  return (
    <group>
      <Instances count={n} place={placeTrunk} castShadow>
        <cylinderGeometry args={[0.28, 0.48, 3.2, 8]} />
        <meshStandardMaterial color="#5e4330" roughness={0.95} />
      </Instances>
      {CLUMP_PLACERS.map((place, c) => (
        <Instances key={c} count={BROAD.length} place={place} geometry={leaves[c]} castShadow>
          <meshStandardMaterial roughness={0.9} flatShading />
        </Instances>
      ))}
      {PINE_PLACERS.map((place, tier) => (
        <Instances key={`p${tier}`} count={PINES.length} place={place} castShadow>
          <coneGeometry args={[1, 1, 9]} />
          <meshStandardMaterial roughness={0.9} flatShading />
        </Instances>
      ))}
    </group>
  );
}

const placeBush: Place = (i, o) => {
  const b = BUSHES[i];
  o.position.set(b.x, 0.7 * b.s, b.z);
  o.scale.set(1.2 * b.s, 0.95 * b.s, 1.1 * b.s);
  return ["#3f7d32", "#4a8a3a", "#35702c", "#5a9443"][i % 4];
};

function Bushes() {
  return (
    <Instances count={BUSHES.length} place={placeBush}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.78} />
    </Instances>
  );
}

/** A part of street light i: `up` high and `out` toward the road. */
const lightPart =
  (up: number, out: number): Place =>
  (i, o) => {
    const l = STREET_LIGHTS[i];
    o.position.set(l.x + Math.sin(l.turn) * out, up, l.z + Math.cos(l.turn) * out);
    o.rotation.y = l.turn;
  };
const placePole = lightPart(4.6, 0);
const placeArm = lightPart(9.1, 1.2);
const placeLamp = lightPart(8.9, 2.3);

function StreetLights() {
  const n = STREET_LIGHTS.length;
  return (
    <group>
      <Instances count={n} place={placePole} castShadow>
        <cylinderGeometry args={[0.13, 0.2, 9.2, 8]} />
        <meshStandardMaterial color="#3b4046" roughness={0.6} />
      </Instances>
      <Instances count={n} place={placeArm}>
        <boxGeometry args={[0.16, 0.16, 2.6]} />
        <meshStandardMaterial color="#3b4046" roughness={0.6} />
      </Instances>
      <Instances count={n} place={placeLamp}>
        <boxGeometry args={[0.5, 0.22, 0.9]} />
        <meshBasicMaterial color="#fff3cf" toneMapped={false} />
      </Instances>
    </group>
  );
}

// ---- People out walking ----------------------------------------------------------------------

/** Where a walker is (and which way they face) at time t: up and down their strip of sidewalk. */
function walkerAt(w: (typeof WALKERS)[number], t: number) {
  const s = w.strip;
  const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  // Walk to the end, turn round, walk back.
  const d = (w.start * len * 2 + t * w.speed) % (len * 2);
  const back = d > len;
  const k = (back ? len * 2 - d : d) / len;
  const dirX = (s.x2 - s.x1) / len;
  const dirZ = (s.z2 - s.z1) / len;
  // Keep to one side of the sidewalk, depending on which way they're going.
  const side = (back ? -1 : 1) * 0.8;
  return {
    x: s.x1 + (s.x2 - s.x1) * k - dirZ * side,
    z: s.z1 + (s.z2 - s.z1) * k + dirX * side,
    heading: Math.atan2(back ? -dirX : dirX, back ? -dirZ : dirZ),
  };
}

/** Where everyone is walking right now (for cars to stop for them). */
export const walkerSpots: { x: number; z: number }[] = WALKERS.map(() => ({ x: 0, z: 0 }));

/** How many of the nearest people are drawn in full detail (the rest are simpler, further off). */
const NEAR_PEOPLE = 18;
const HAIR_STYLES = ["short", "long", "buzz", "bun", "short", "bald"] as const;
const walkerLook = (i: number): Look => {
  const w = WALKERS[i];
  return { skin: w.skin, hair: i % 3 ? "#2a1a12" : i % 5 ? "#6b4423" : "#c9a56b", hairStyle: HAIR_STYLES[i % HAIR_STYLES.length], shirt: w.shirt, pants: w.pants, shoes: i % 2 ? "#f2f2f2" : "#1b1d21" };
};

/** One of the people near you, in full detail (face, hair, walking properly). */
function NearWalker({ idx }: { idx: number }) {
  const g = useRef<THREE.Group>(null);
  const look = useMemo(() => walkerLook(idx), [idx]);
  const pose = useMemo(() => ({ ...newPose(), gait: 1 }), []);
  const w = WALKERS[idx];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const p = walkerAt(w, t);
    if (!g.current) return;
    g.current.position.set(p.x, 0, p.z);
    g.current.rotation.y = p.heading;
    pose.phase = t * w.speed * 1.25 + idx;
  });
  return (
    <group ref={g} scale={w.height / 0.83}>
      <Humanoid look={look} pose={pose} />
    </group>
  );
}

function Walkers() {
  const n = WALKERS.length;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const hair = useRef<THREE.InstancedMesh>(null);
  const [near, setNear] = useState<number[]>([]);
  const nearSet = useRef(new Set<number>());
  const lastPick = useRef(-1);
  // Rounded limbs that swing from the top (the hinge is at the top of each shape).
  const legGeo = useMemo(() => new THREE.CapsuleGeometry(0.15, 1.2, 4, 8).translate(0, -0.75, 0), []);
  const armGeo = useMemo(() => new THREE.CapsuleGeometry(0.1, 0.95, 4, 8).translate(0, -0.58, 0), []);
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.3, 0.62, 6, 12).scale(1, 1, 0.7), []);
  useEffect(
    () => () => {
      legGeo.dispose();
      armGeo.dispose();
      bodyGeo.dispose();
    },
    [legGeo, armGeo, bodyGeo],
  );

  // Colours once.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    WALKERS.forEach((w, i) => {
      bodies.current?.setColorAt(i, c.set(w.shirt));
      heads.current?.setColorAt(i, c.set(w.skin));
      hair.current?.setColorAt(i, c.set(walkerLook(i).hair));
      for (const k of [0, 1]) {
        legs.current?.setColorAt(i * 2 + k, c.set(w.pants));
        arms.current?.setColorAt(i * 2 + k, c.set(w.shirt));
      }
    });
    for (const m of [bodies, heads, legs, arms, hair]) if (m.current?.instanceColor) m.current.instanceColor.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!bodies.current || !heads.current || !legs.current || !arms.current || !hair.current) return;
    const cam = state.camera.position;
    // Every half second: who's close enough to see properly?
    if (t - lastPick.current > 0.5) {
      lastPick.current = t;
      const order = WALKERS.map((w, i) => {
        const p = walkerAt(w, t);
        return { i, d: (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 };
      })
        .filter((o) => o.d < 90 * 90)
        .sort((a, b) => a.d - b.d)
        .slice(0, NEAR_PEOPLE)
        .map((o) => o.i)
        .sort((a, b) => a - b);
      if (order.join() !== [...nearSet.current].join()) {
        nearSet.current = new Set(order);
        setNear(order);
      }
    }
    WALKERS.forEach((w, i) => {
      const p = walkerAt(w, t);
      walkerSpots[i].x = p.x;
      walkerSpots[i].z = p.z;
      // Drawn in full detail instead: tuck the simple one away.
      const s = nearSet.current.has(i) ? 0.0001 : w.height / 0.83;
      const swing = Math.sin(t * w.speed * 2.6 + i) * 0.5;
      const bob = Math.abs(Math.cos(t * w.speed * 2.6 + i)) * 0.05;
      const put = (m: THREE.InstancedMesh, idx: number, lx: number, y: number, lz: number, rx = 0) => {
        tmp.set(lx * s, 0, lz * s).applyAxisAngle(THREE.Object3D.DEFAULT_UP, p.heading);
        dummy.position.set(p.x + tmp.x, y * s, p.z + tmp.z);
        dummy.rotation.set(rx, p.heading, 0, "YXZ");
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        m.setMatrixAt(idx, dummy.matrix);
      };
      put(bodies.current!, i, 0, 2.2 + bob, 0);
      put(heads.current!, i, 0, 3.08 + bob, 0);
      put(hair.current!, i, 0, 3.16 + bob, -0.03);
      put(legs.current!, i * 2, -0.16, 1.62 + bob, 0, swing);
      put(legs.current!, i * 2 + 1, 0.16, 1.62 + bob, 0, -swing);
      put(arms.current!, i * 2, -0.42, 2.72 + bob, 0, -swing * 0.8);
      put(arms.current!, i * 2 + 1, 0.42, 2.72 + bob, 0, swing * 0.8);
    });
    for (const m of [bodies, heads, legs, arms, hair]) m.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeo, undefined, n]} castShadow raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, n]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.26, 14, 10]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[undefined, undefined, n]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.275, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[legGeo, undefined, n * 2]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[armGeo, undefined, n * 2]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      {near.map((i) => (
        <NearWalker key={i} idx={i} />
      ))}
    </group>
  );
}

/** How far the sidewalk's outer edge is from a road's middle (for anyone who needs it). */
export const SIDEWALK_EDGE = CURB;
